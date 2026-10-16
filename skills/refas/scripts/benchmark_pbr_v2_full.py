#!/usr/bin/env python3
"""R14-06D: SHA-bound same-host/same-process full-source material-preview benchmark.

Never replaces source triangles, never ships source GLB bytes and never
certifies PBR/visual resemblance. Output is atomic and refuses stale targets.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import statistics
import tempfile
import time

import numpy as np
from PIL import Image

from render_glb import load_canonical_frame, load_primitives, local_to_world, parse_glb
from render_pbr_v2_material import PASSES, PROFILE, render_material_preview
from render_pbr_v2_visibility import PROFILE as VISIBILITY_PROFILE, numba_config

SCHEMA = "refas.pbr-v2-full-source-benchmark/v1"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def cpu_model():
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        for line in cpuinfo.read_text().splitlines():
            if line.startswith("model name"):
                return line.partition(":")[2].strip()
    return platform.processor() or "unknown"


def memory_kib():
    location = Path("/proc/self/status")
    if not location.is_file():
        return {"VmRSS": None, "VmHWM": None}
    fields = {}
    for line in location.read_text().splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        cells = value.split()
        if cells:
            fields[key] = cells[0]
    return {key: int(fields[key]) if key in fields else None
            for key in ("VmRSS", "VmHWM")}


def digest_visibility(visibility):
    return {key: sha(np.ascontiguousarray(visibility[key]).tobytes())
            for key in ("depth", "winnerSourceTriangle", "sourceWeights")}


def digest_png(images):
    outputs = {}
    for mode in PASSES:
        raw = np.ascontiguousarray(images[mode]).tobytes()
        stream = io.BytesIO()
        Image.fromarray(images[mode], mode="RGB").save(stream, format="PNG")
        png = stream.getvalue()
        outputs[mode] = {"pixelSha256": sha(raw), "pngSha256": sha(png),
                         "_pngBytes": png}
    return outputs


def measure(primitives, model, position, target, up, fov, size,
            tile_size, threads, cap):
    before = time.perf_counter()
    images, visibility, stats = render_material_preview(
        primitives, model, position, target, up, fov, size, PASSES,
        tile_size=tile_size, threads=threads, max_working_mib=cap)
    wall_ms = (time.perf_counter()-before)*1000
    # Intentionally exclude PNG encoding and hashing from the wall timer.
    png = digest_png(images)
    visibility_hashes = digest_visibility(visibility)
    vis = stats["visibility"]
    if (vis["inputTriangles"] != sum(len(p.indices) for p in primitives)
            or stats["coveredPixels"] != stats["shadedPixels"]
            or stats["coveredPixels"] != vis["coveredPixels"]):
        raise AssertionError("PBR_V2_BENCH_INVALID: source/coverage mismatch")
    return ({
        "wallMs": round(wall_ms, 3),
        "stageMs": stats["stageMs"], "visibilityStagesMs": vis["stagesMs"],
        "coveredPixels": stats["coveredPixels"],
        "shadedPixels": stats["shadedPixels"],
        "textureSampledPixels": stats["textureSampledPixels"],
        "geometry": {key: vis[key] for key in (
            "inputTriangles", "preparedRasterTriangles",
            "nearClippedSourceTriangles", "fullyBehindNearTriangles",
            "binEntries", "candidatePixelTests")},
        "passes": {mode: {key:value for key,value in row.items()
                          if key != "_pngBytes"} for mode,row in png.items()},
        "visibilityDigests": visibility_hashes,
        "memoryAfter": memory_kib(),
        "claimScope": "material-preview-only",
        "certificationEligible": False
    }, png)


def publish(directory, report, images):
    directory = Path(directory)
    if directory.exists():
        raise ValueError("PBR_V2_INVALID_OUTPUT: benchmark output exists")
    directory.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".refas-pbr-v2-bench-",
                                     dir=directory.parent) as temp:
        stage = Path(temp)
        (stage/"report.json").write_text(
            json.dumps(report, indent=2, sort_keys=True, allow_nan=False)+"\n")
        for resolution, passes in images.items():
            for name, row in passes.items():
                (stage/f"{resolution}-{name}.png").write_bytes(row["_pngBytes"])
        os.rename(stage, directory)


def run(glb, frame, out, sizes, threads, tile, repeats, alternatives,
        expected_sha, max_working_mb):
    if out.exists():
        raise ValueError("PBR_V2_INVALID_OUTPUT: benchmark output exists")
    source = glb.read_bytes()
    source_sha = sha(source)
    if expected_sha is not None and expected_sha != source_sha:
        raise ValueError("PBR_V2_INVALID_ASSET: expected original GLB SHA mismatch")
    frame_bytes = frame.read_bytes()
    start = time.perf_counter()
    model, binary = parse_glb(glb)
    _, primitives = load_primitives(
        glb, parsed=(model,binary),
        max_texture_pixels=2_097_152,
        max_total_texture_pixels=4_194_304,
        max_image_encoded_bytes=16*1024*1024,
        max_total_image_encoded_bytes=32*1024*1024)
    if sha(glb.read_bytes()) != source_sha:
        raise ValueError("PBR_V2_INVALID_ASSET: changed during source decode")
    source_ms = (time.perf_counter()-start)*1000
    canonical, basis, origin, frame_digest = load_canonical_frame(frame)
    if sha(frame.read_bytes()) != sha(frame_bytes):
        raise ValueError("PBR_V2_INVALID_CAMERA: changed during frame decode")
    hero = canonical.get("hero")
    if not hero:
        raise ValueError("PBR_V2_INVALID_CAMERA: Hero required")
    position = local_to_world(hero["position"],basis,origin)
    target = local_to_world(hero["target"],basis,origin)
    up = local_to_world(hero.get("up",[0,1,0]),basis)
    fov = float(hero.get("fovY",31))
    count = sum(len(p.indices) for p in primitives)
    report = {
        "schema": SCHEMA, "status": "COMPLETE",
        "claimScope": "material-preview-only", "certificationEligible": False,
        "cameraAuthority": "UNREGISTERED-DIAGNOSTIC",
        "asset": {"glbSha256": source_sha, "glbBytes": len(source),
                  "frameFileSha256": sha(frame_bytes),
                  "frameDigest": frame_digest,
                  "sourceTriangles": count, "primitiveCount": len(primitives),
                  "totalVertexCount": sum(len(p.positions) for p in primitives)},
        "backend": {"renderer": PROFILE, "visibility": VISIBILITY_PROFILE},
        "environment": {
            "python": platform.python_version(), "numpy": np.__version__,
            "numba": __import__("numba").__version__,
            "cpu": cpu_model(), "logicalCpu": os.cpu_count(),
            "numbaMaxThreads": numba_config.NUMBA_NUM_THREADS,
            "os": platform.platform(), "sourceDecodeMs": round(source_ms,3),
            "memoryAfterSource": memory_kib()},
        "profile": {"sizes": sizes, "threads": threads, "tileSize": tile,
                    "warmRepeatCount": repeats, "maxWorkingMiB": max_working_mb,
                    "timerExcludes": "GLB decode, PNG encoding, SHA hashing, report publication",
                    "memorySemantics": "VmHWM cumulative process high-water; not per-asset peak"},
        "views": []
    }
    recorded_images = {}
    for size in sizes:
        first, images = measure(primitives,model,position,target,up,fov,size,
                                tile,threads,max_working_mb)
        golden = {key:first[key] for key in ("passes","visibilityDigests")}
        warm = []
        for _ in range(repeats):
            sample, _ = measure(primitives,model,position,target,up,fov,size,
                                tile,threads,max_working_mb)
            if any(sample[key] != golden[key] for key in golden):
                raise AssertionError("PBR_V2_BENCH_PARITY_FAILED: repeat mismatch")
            warm.append(sample)
        other = []
        for candidate_threads, candidate_tile in alternatives:
            if candidate_threads == threads and candidate_tile == tile:
                continue
            sample, _ = measure(primitives,model,position,target,up,fov,size,
                                candidate_tile,candidate_threads,max_working_mb)
            if any(sample[key] != golden[key] for key in golden):
                raise AssertionError("PBR_V2_BENCH_PARITY_FAILED: tile/thread mismatch")
            other.append({"threads":candidate_threads,"tile":candidate_tile,
                          "sample":sample})
        report["views"].append({
            "resolution": [size,size], "coldFirst":first, "warm":warm,
            "warmMedianMs": round(statistics.median(s["wallMs"] for s in warm),3),
            "tileThreadAlternates": other,
            "parity": "EXACT_PIXEL_AND_VISIBILITY_SHA",
            "originalGeometryConsumed":count})
        recorded_images[str(size)] = images
    if sha(glb.read_bytes()) != source_sha or sha(frame.read_bytes()) != sha(frame_bytes):
        raise ValueError("PBR_V2_INVALID_ASSET: source or frame mutated during benchmark")
    report["environment"]["memoryAfterAll"] = memory_kib()
    publish(out,report,recorded_images)
    return report


def main():
    parser = argparse.ArgumentParser(description="Source-hashed independent PBR v2 benchmark")
    parser.add_argument("--glb",required=True,type=Path)
    parser.add_argument("--frame",required=True,type=Path)
    parser.add_argument("--out",required=True,type=Path)
    parser.add_argument("--sizes",default="160,384")
    parser.add_argument("--threads",type=int,default=4)
    parser.add_argument("--tile",type=int,default=32)
    parser.add_argument("--repeats",type=int,default=3)
    parser.add_argument("--alt",default="1:16,4:64")
    parser.add_argument("--expected-glb-sha")
    parser.add_argument("--max-working-mb",type=int,default=1024)
    args = parser.parse_args()
    sizes = [int(x) for x in args.sizes.split(",")]
    if not sizes or len(set(sizes)) != len(sizes) or any(x<32 or x>1024 for x in sizes):
        parser.error("unsupported or duplicate resolutions")
    if not 1 <= args.repeats <= 20 or args.tile not in (16,32,64):
        parser.error("repeat/tile invalid")
    alternatives = ([] if not args.alt else
                    [tuple(map(int, pair.split(":"))) for pair in args.alt.split(",")])
    if any(n<1 or n>8 or tile not in (16,32,64) for n,tile in alternatives):
        parser.error("unsupported alternate configuration")
    report = run(args.glb,args.frame,args.out,sizes,args.threads,args.tile,
                 args.repeats,alternatives,args.expected_glb_sha,args.max_working_mb)
    print(json.dumps({
        "status":report["status"],"sourceTriangles":report["asset"]["sourceTriangles"],
        "views":[{"size":r["resolution"][0],"warmMedianMs":r["warmMedianMs"],
                  "coveredPixels":r["coldFirst"]["coveredPixels"]}
                 for r in report["views"]],"report":str(args.out/"report.json")}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""R14-05D: warm-JIT same-process CPU scaling on one actual GitHub runner.

Diagnostic-only. The fixed generated GLB is real positive-area geometry, not
a source resemblance claim. Full matrix is measured on one chosen density
after warm-up, with all passes and winner/depth bit-parity across configurations.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time

import numpy as np
from benchmark_render_cpu import create_fixture, sha256, bounded
from benchmark_render_cpu_dense import cpu_hardware_model, numba_version
from render_cpu_opt import require_supported
from render_cpu_tiled import render_hero_tiled, njit, numba_config
from render_cpu_visibility import _shade_passes, PROFILE as VISIBILITY_PROFILE
from render_glb import (camera_basis, load_canonical_frame, load_primitives,
                        local_to_world, parse_glb)

PASSES = ("normal", "object-id", "albedo")
SCHEMA = "refas.cpu-warm-same-host-benchmark/v1"


def _digest(array):
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def _rss():
    """Linux-only process snapshot and cumulative high-water, both in KiB."""
    if sys.platform != "linux":
        return {"currentKiB": None, "highWaterKiB": None}
    try:
        rows = Path("/proc/self/status").read_text(encoding="ascii").splitlines()
        values = {}
        for row in rows:
            for prefix, key in (("VmRSS:", "currentKiB"),
                                ("VmHWM:", "highWaterKiB")):
                if row.startswith(prefix):
                    values[key] = int(row.split()[1])
        return {"currentKiB": values.get("currentKiB"),
                "highWaterKiB": values.get("highWaterKiB")}
    except (OSError, ValueError, IndexError):
        return {"currentKiB": None, "highWaterKiB": None}


def _measure(primitives, position, target, up, fov, size, tile, threads, memory):
    started = time.perf_counter()
    (normal, depth, winner, stats), visibility = render_hero_tiled(
        primitives, position, target, up, fov, size, "normal",
        tile_size=tile, threads=threads, max_working_mib=memory,
        return_visibility=True)
    raster_end = time.perf_counter()
    passes = _shade_passes(winner, visibility["normalColorByRaster"],
                            visibility["primitiveIdBySourceTriangle"],
                            primitives, PASSES)
    end = time.perf_counter()
    assert np.array_equal(normal, passes["normal"]), "normal pass mismatch"
    return {
        "renderCallMs": round((raster_end-started)*1000, 3),
        "shadeMs": round((end-raster_end)*1000, 3),
        "totalPassMs": round((end-started)*1000, 3),
        "stagesMs": stats["stagesMs"],
        "counts": {k: stats[k] for k in (
            "inputTriangles", "preparedTriangles", "coveredPixels",
            "binEntries", "tileWidePixelTests", "candidatePixelTests",
            "nearClippedTriangles", "frustumRejected")},
        "digests": {**{key: _digest(value) for key, value in passes.items()},
                    "depth-f64": _digest(depth), "winner-i64": _digest(winner)},
        "rss": _rss(),
    }


def _config_samples(primitives, camera, args, tile, threads, repetitions, reference):
    position, target, up, fov = camera
    outputs = []
    for _ in range(repetitions):
        record = _measure(primitives, position, target, up, fov,
                          args.size, tile, threads, args.max_working_mb)
        if reference is not None and record["digests"] != reference:
            raise ValueError("WARM_CPU_PARITY_FAILED: image/depth/winner SHA differs"
                             f" for tile={tile} threads={threads}")
        if reference is None:
            reference = record["digests"]
        outputs.append(record)
    return {
        "tileSize": tile, "threads": threads, "samples": outputs,
        "medianTotalPassMs": statistics.median(x["totalPassMs"] for x in outputs),
        "medianRenderCallMs": statistics.median(x["renderCallMs"] for x in outputs),
        "maxObservedCumulativeHighWaterKiB": max(
            (x["rss"]["highWaterKiB"] or 0) for x in outputs),
    }, reference


def _tokens(raw):
    result = tuple(int(x.strip()) for x in raw.split(","))
    if not result or len(result) != len(set(result)):
        raise ValueError("WARM_CPU_INVALID: duplicate or empty sequence")
    return result


def main():
    p = argparse.ArgumentParser(description="R14-05D non-certifying same-host warm scaling")
    p.add_argument("--triangles", default="100000,500000,1000000")
    p.add_argument("--matrix-count", type=int, default=500000)
    p.add_argument("--case", choices=("strands", "organic", "hard-surface"), default="strands")
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--size", type=int, default=160)
    p.add_argument("--baseline-threads", type=int, default=4)
    p.add_argument("--baseline-tile", type=int, default=32)
    p.add_argument("--thread-matrix", default="1,2,4,8")
    p.add_argument("--tile-matrix", default="16,32,64")
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--max-working-mb", type=int, default=1024)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    if njit is None:
        raise RuntimeError("WARM_CPU_UNAVAILABLE: optional Numba required")
    tiers = _tokens(args.triangles)
    threads = _tokens(args.thread_matrix)
    tiles = _tokens(args.tile_matrix)
    for count in tiers:
        bounded(count, "--triangles", 2, 1000000)
    for value in threads+(args.baseline_threads,):
        if value not in (1,2,4,8):
            raise ValueError("WARM_CPU_UNSUPPORTED: thread count")
        if value > numba_config.NUMBA_NUM_THREADS:
            raise ValueError("WARM_CPU_UNSUPPORTED: thread count exceeds Numba host maximum")
    for value in tiles+(args.baseline_tile,):
        if value not in (16,32,64):
            raise ValueError("WARM_CPU_UNSUPPORTED: tile size")
    if args.matrix_count not in tiers:
        raise ValueError("WARM_CPU_INVALID: matrix-count must match a measured tier")
    bounded(args.repeats, "--repeats", 1, 8)
    bounded(args.size, "--size", 32, 1024)
    bounded(args.max_working_mb, "--max-working-mb", 256, 2048)
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError("WARM_CPU_INVALID_OUTPUT: refuses overwrite")
    out.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": SCHEMA,
        "claimScope": "measurement-only",
        "certificationEligible": False,
        "backend": VISIBILITY_PROFILE,
        "status": "INCOMPLETE",
        "environment": {"platform": platform.platform(), "cpuModel": cpu_hardware_model(),
                        "logicalCpus": os.cpu_count(), "numbaMaxThreads": numba_config.NUMBA_NUM_THREADS,
                        "python": platform.python_version(), "numpy": np.__version__,
                        "numba": numba_version()},
        "parameters": {"triangles": tiers, "matrixCount": args.matrix_count,
                       "size": args.size, "case": args.case, "seed": args.seed,
                       "threads": args.baseline_threads, "tile": args.baseline_tile,
                       "threadMatrix": threads, "tileMatrix": tiles,
                       "repeats": args.repeats,
                       "maxWorkingMiB": args.max_working_mb},
        "jitWarmup": None,
        "tiers": [],
        "limitations": [
            "One same-host process and warm Numba kernels; no cold JIT in measured samples.",
            "Generated GLB is positive-area synthetic geometry, not Monster Bed.",
            "Only registered synthetic Hero; not real eight-view, PBR or certification.",
            "VmHWM is process-cumulative and NOT a per-tier peak RSS measurement.",
            "Logical CPU capacity may be less than requested threads; 8 can oversubscribe."],
    }
    try:
        with tempfile.TemporaryDirectory(prefix="refas-warm-cpu-") as temp:
            folder = Path(temp)
            # Force the JIT signatures once before starting any reported samples.
            # A small real geometry exercises setup, bins and prange tiles.
            warmglb, warmframe = folder/"warm.glb", folder/"warm.frame.json"
            create_fixture(warmglb, warmframe, args.case, 120, args.seed)
            model, binary = parse_glb(warmglb)
            require_supported(model)
            _, primitives = load_primitives(warmglb, parsed=(model, binary))
            frame, basis, origin, _ = load_canonical_frame(warmframe)
            hero = frame["hero"]
            camera = (local_to_world(hero["position"], basis, origin),
                      local_to_world(hero["target"], basis, origin),
                      local_to_world(hero.get("up", [0,1,0]), basis),
                      float(hero.get("fovY", 31)))
            t0 = time.perf_counter()
            warm = _measure(primitives, *camera, args.size,
                            args.baseline_tile, args.baseline_threads,
                            args.max_working_mb)
            report["jitWarmup"] = {"wallMs": round((time.perf_counter()-t0)*1000, 3),
                                   "inputTriangles": 120, "stagesMs": warm["stagesMs"]}
            del primitives, model, binary
            gc.collect()
            for count in tiers:
                glb, frame_path = folder/f"asset-{count}.glb",folder/f"frame-{count}.json"
                info = create_fixture(glb, frame_path, args.case, count, args.seed)
                input_sha = sha256(glb)
                frame_sha = sha256(frame_path)
                began = time.perf_counter()
                model, binary = parse_glb(glb)
                require_supported(model)
                _, primitives = load_primitives(glb, parsed=(model, binary))
                frame, basis, origin, _ = load_canonical_frame(frame_path)
                hero = frame["hero"]
                camera = (local_to_world(hero["position"], basis, origin),
                          local_to_world(hero["target"], basis, origin),
                          local_to_world(hero.get("up", [0,1,0]), basis),
                          float(hero.get("fovY", 31)))
                load_ms = round((time.perf_counter()-began)*1000, 3)
                actual = sum(len(p.indices) for p in primitives)
                if actual != count:
                    raise ValueError("WARM_CPU_INVALID_ASSET: decoded face count mismatch")
                base, reference = _config_samples(
                    primitives, camera, args,
                    args.baseline_tile, args.baseline_threads, args.repeats, None)
                rows = []
                if count == args.matrix_count:
                    for tile in tiles:
                        for n in threads:
                            if (tile,n) == (args.baseline_tile,args.baseline_threads):
                                continue
                            record, _ = _config_samples(
                                primitives, camera, args, tile, n, args.repeats, reference)
                            rows.append(record)
                report["tiers"].append({
                    "sourceTriangles": count,
                    "assetGlbSha256": input_sha, "frameSha256": frame_sha,
                    "geometry": info, "decodedLoadMs": load_ms,
                    "baseline": base, "matrix": rows,
                    "referenceDigests": reference,
                    "rssAfterTier": _rss(),
                    "parity": "EXACT"
                })
                out.write_text(json.dumps(report, indent=2, allow_nan=False)+"\n", encoding="utf8")
                print(json.dumps({"triangles":count,
                    "medianWarmMs":base["medianTotalPassMs"],
                    "configurations":1+len(rows),"parity":"EXACT",
                    "processHighWaterKiB":_rss()["highWaterKiB"]}),flush=True)
                del primitives, model, binary
                gc.collect()
        report["status"] = "COMPLETE"
    except (Exception, KeyboardInterrupt) as err:
        report["error"] = {"type":type(err).__name__,"message":str(err)[:512]}
        report["status"] = "FAILED"
        raise
    finally:
        out.write_text(json.dumps(report,indent=2,allow_nan=False)+"\n",encoding="utf8")


if __name__ == "__main__":
    main()

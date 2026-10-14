#!/usr/bin/env python3
"""Measured, non-certifying CPU render baseline with real, nondegenerate geometry.

R14-00 measures the *existing* portable backend without changing its raster rules.
Generated geometry is diagnostic workload only, never source resemblance evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import statistics
import struct
import subprocess
import sys
import tempfile
import threading
import time

import numpy as np

from render_glb import (
    camera_basis, estimate_decoded_geometry_bytes, frame_bounds,
    load_canonical_frame, load_primitives, local_to_world, normalize,
    parse_glb, render, resource_policy, world_bounds,
)

SHARED_ID = "refas.cpu-render-benchmark/v1"
BASELINE_ID = "RefAs Portable Rasterizer/1.0.0"
VIEW_SPECS = [
    ("hero", [0.0, 0.0, 1.0], [0, 1, 0], "beauty"),
    ("oblique", [0.72, 0.20, 1.0], [0, 1, 0], "beauty"),
    ("side", [1.0, 0.05, 0.15], [0, 1, 0], "beauty"),
    ("top", [0.18, 1.0, 0.35], [0, 0, 1], "beauty"),
    ("grazing", [-1.0, 0.05, 0.18], [0, 1, 0], "beauty"),
    ("normal", [0.0, 0.0, 1.0], [0, 1, 0], "normal"),
    ("object-id", [0.0, 0.0, 1.0], [0, 1, 0], "object-id"),
    ("albedo", [0.0, 0.0, 1.0], [0, 1, 0], "albedo"),
]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def millis(start):
    return round((time.perf_counter() - start) * 1000, 3)


def grid_geometry(count, organic):
    quads = math.ceil(count / 2)
    cols = math.ceil(math.sqrt(quads))
    rows = math.ceil(quads / cols)
    xx, yy = np.meshgrid(np.linspace(-1, 1, cols + 1),
                         np.linspace(-1, 1, rows + 1))
    if organic:
        zz = 0.10 * np.sin(xx * 9) * np.cos(yy * 13)
        nx = -0.9 * np.cos(xx * 9) * np.cos(yy * 13)
        ny = 1.3 * np.sin(xx * 9) * np.sin(yy * 13)
        ns = np.stack((nx, ny, np.ones_like(xx)), axis=-1)
        ns /= np.linalg.norm(ns, axis=-1, keepdims=True)
    else:
        # Structured plates: true positive projected triangle area, varied depth.
        zz = 0.045 * (np.floor((xx + 1) * 5) % 2)
        ns = np.zeros((*xx.shape, 3), dtype=np.float64)
        ns[..., 2] = 1
    vertices = np.stack((xx, yy, zz), axis=-1).reshape(-1, 3).astype("<f4")
    normals = ns.reshape(-1, 3).astype("<f4")
    a = (np.arange(rows)[:, None] * (cols + 1) + np.arange(cols)[None, :]).reshape(-1)
    b = a + cols + 1
    triangles = np.stack((
        np.stack((a, a + 1, b)),
        np.stack((a + 1, b + 1, b)),
    ), axis=1).reshape(-1, 3).astype("<u4")
    return vertices, normals, triangles[:count]


def strand_geometry(count, seed):
    # A ribbon is composed of 6 genuine (positive-area) quads.
    segments = 6
    strand_count = math.ceil(count / (2 * segments))
    rng = np.random.default_rng(seed)
    across = math.ceil(math.sqrt(strand_count))
    ids = np.arange(strand_count, dtype=np.int64)
    cols = ids % across
    rows = ids // across
    origin_x = -0.9 + 1.8 * (cols + 0.5) / across + rng.uniform(-0.007, 0.007, strand_count)
    origin_y = -0.9 + 1.8 * (rows + 0.5) / math.ceil(strand_count / across)
    origin_z = rng.uniform(-0.07, 0.07, strand_count)
    t = np.linspace(0, 1, segments + 1, dtype=np.float64)
    # Vary lengths, tilt and depth to model overlapping fur-like microtriangles.
    height = rng.uniform(0.025, 0.10, strand_count)
    incline = rng.uniform(-0.055, 0.055, strand_count)
    width = rng.uniform(0.001, 0.004, strand_count)
    x_center = origin_x[:, None] + incline[:, None] * t
    y_center = origin_y[:, None] + height[:, None] * t
    z_center = origin_z[:, None] + np.sin(t * math.pi)[None, :] * 0.014
    positions = np.empty((strand_count, segments + 1, 2, 3), dtype="<f4")
    positions[..., 0] = x_center[:, :, None] + (np.array([-0.5, 0.5]) * width[:, None])[:, None, :] if False else 0
    # Explicit shape broadcasting keeps this path efficient for 1M triangles.
    positions[:, :, 0, 0] = x_center - width[:, None] * 0.5
    positions[:, :, 1, 0] = x_center + width[:, None] * 0.5
    positions[:, :, :, 1] = y_center[:, :, None]
    positions[:, :, :, 2] = z_center[:, :, None]
    vertices = positions.reshape(-1, 3)
    normals = np.zeros_like(vertices)
    normals[:, 2] = 1
    base = ids[:, None] * ((segments + 1) * 2) + np.arange(segments)[None, :] * 2
    a, b, c, d = base, base + 1, base + 2, base + 3
    triangles = np.stack((
        np.stack((a, b, c), axis=-1),
        np.stack((b, d, c), axis=-1),
    ), axis=2).reshape(-1, 3).astype("<u4")
    return vertices, normals, triangles[:count]


def create_fixture(glb_path, frame_path, kind, count, seed):
    if kind == "strands":
        positions, normals, faces = strand_geometry(count, seed)
    elif kind in ("hard-surface", "organic"):
        positions, normals, faces = grid_geometry(count, kind == "organic")
    else:
        raise ValueError("unknown diagnostic workload kind")
    if len(faces) != count:
        raise ValueError("fixture triangle count mismatch")
    # Spot-check geometrically nondegenerate triangles; do not use padding zeros.
    sample = np.linspace(0, count - 1, min(count, 8192), dtype=np.int64)
    a, b, c = [positions[faces[sample, i]].astype(np.float64) for i in range(3)]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    if not np.isfinite(area).all() or not np.all(area > 1e-12):
        raise ValueError("fixture includes zero-area triangles")
    chunks = []
    views = []
    offset = 0
    for data in (positions.astype("<f4", copy=False).tobytes(),
                 normals.astype("<f4", copy=False).tobytes(),
                 faces.astype("<u4", copy=False).reshape(-1).tobytes()):
        chunks.append(data)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        offset += len(data)
    binary = b"".join(chunks)
    accessors = [
        {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3"},
        {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5125, "count": count * 3, "type": "SCALAR"},
    ]
    model = {
        "asset": {"version": "2.0", "generator": "RefAs R14-00 synthetic CPU workload"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "synthetic-mesh"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1},
                                    "indices": 2, "material": 0, "mode": 4}]}],
        "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0.5, 0.6, 0.75, 1],
                                               "metallicFactor": 0, "roughnessFactor": 0.7}}],
        "bufferViews": views, "accessors": accessors,
        "buffers": [{"byteLength": len(binary)}],
    }
    encoded = json.dumps(model, separators=(",", ":")).encode("utf8")
    encoded += b" " * ((-len(encoded)) % 4)
    binary += b"\x00" * ((-len(binary)) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    with open(glb_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(encoded), 0x4E4F534A))
        f.write(encoded)
        f.write(struct.pack("<II", len(binary), 0x004E4942))
        f.write(binary)
    frame = {
        "schema": "refas.canonical-object-frame/v1", "id": "cpu-benchmark",
        "scopeId": "whole", "origin": [0, 0, 0],
        "axes": {"right": [1, 0, 0], "up": [0, 1, 0], "forward": [0, 0, 1]},
        "scopeParts": [], "hero": {
            "position": [0.25, 0.3, 5.0], "target": [0, 0, 0],
            "up": [0, 1, 0], "fovY": 31, "registrationDigest": "b" * 64,
        },
    }
    Path(frame_path).write_text(json.dumps(frame, separators=(",", ":")) + "\n", encoding="utf8")
    return {"kind": kind, "seed": seed, "triangles": count,
            "vertices": len(positions), "sampledMinArea": float(area.min()),
            "sampledCount": len(sample), "estimatedDegenerateTriangles": 0}


def worker(args):
    from render_glb import RenderTimeoutError
    glb = Path(args.glb)
    out = Path(args.image_dir)
    out.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    model, binary = parse_glb(glb)
    parse_ms = millis(started)
    start = time.perf_counter()
    estimated = estimate_decoded_geometry_bytes(model)
    policy = resource_policy(args.size, args.size, max_working_mb=args.max_working_mb,
                             requested_tile_size=args.tile_size,
                             source_glb_bytes=glb.stat().st_size,
                             decoded_geometry_bytes=estimated)
    budget_ms = millis(start)
    start = time.perf_counter()
    model, primitives = load_primitives(glb, parsed=(model, binary))
    decode_ms = millis(start)
    actual = sum(len(primitive.indices) for primitive in primitives)
    start = time.perf_counter()
    frame, basis, origin, frame_digest = load_canonical_frame(Path(args.frame))
    bounds = frame_bounds(primitives, frame, basis, origin)
    center, radius = bounds["centerWorld"], bounds["radius"]
    camera_ms = millis(start)
    deadline = time.monotonic() + args.timeout_seconds
    rendered = []
    for name, direction, view_up, mode in (VIEW_SPECS[:1] if args.views == "hero" else VIEW_SPECS):
        hero = frame.get("hero") if name == "hero" else None
        if hero:
            position = local_to_world(hero["position"], basis, origin)
            target = local_to_world(hero["target"], basis, origin)
            up = local_to_world(hero["up"], basis)
            fov = hero["fovY"]
        else:
            position = center + normalize(local_to_world(direction, basis)) * radius * 3.1
            target, up, fov = center, local_to_world(view_up, basis), 31
        start = time.perf_counter()
        rec = render(primitives, position, target, out / (name + ".png"),
                     width=args.size, height=args.size, fov=fov, mode=mode,
                     up_hint=up, tile_size=policy["tileSize"], deadline=deadline)
        rendered.append({"view": name, "mode": mode, "renderMsIncludingEncode": millis(start),
                         "renderedTriangles": rec["renderedTriangles"],
                         "coveredPixels": rec["coveredPixels"], "pngSha256": rec["sha256"]})
    return {
        "status": "COMPLETE", "claimScope": "measurement-only",
        "stageMs": {"parseGlb": parse_ms, "resourcePreflight": budget_ms,
                    "decodeWorldGeometry": decode_ms, "frameSetup": camera_ms,
                    "renderAndEncode": round(sum(v["renderMsIncludingEncode"] for v in rendered), 3),
                    "triangleSetupBinningRasterShadingSeparatelyMeasured": False},
        "actualTriangles": actual, "viewResults": rendered,
        "frameDigest": frame_digest, "resourceEstimate": policy,
        "workerWallMs": millis(started),
    }


def classify(text, killed):
    if killed:
        return "BLOCKED_TIMEOUT"
    if "RenderTimeoutError" in text or "wall-clock timeout" in text:
        return "BLOCKED_TIMEOUT"
    if "MemoryError" in text or "working-memory budget" in text or "requires at least" in text:
        return "BLOCKED_RESOURCE"
    if "ValueError" in text or "invalid" in text or "GLB" in text or "accessor" in text:
        return "FAILED_ASSET"
    return "FAILED_BACKEND"


def measured_child(command, timeout):
    beg = time.perf_counter()
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    rss_peak_kib = None
    stop = threading.Event()
    def sampler():
        nonlocal rss_peak_kib
        if sys.platform != "linux":
            return
        while not stop.is_set():
            try:
                data = Path(f"/proc/{proc.pid}/status").read_text()
                vals = [int(v) for v in __import__("re").findall(r"^Vm(?:RSS|HWM):\s+(\d+)\s+kB", data, __import__("re").M)]
                if vals:
                    rss_peak_kib = max(rss_peak_kib or 0, *vals)
            except (OSError, ValueError):
                pass
            stop.wait(0.02)
    t = threading.Thread(target=sampler, daemon=True)
    t.start()
    killed = False
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        killed = True
        proc.kill()
        stdout, stderr = proc.communicate()
    finally:
        stop.set()
        t.join(timeout=1)
    wall_ms = millis(beg)
    result = None
    if proc.returncode == 0 and not killed:
        try:
            result = json.loads(stdout)
        except json.JSONDecodeError:
            stderr = (stderr + "\nmissing JSON worker report")[-3000:]
    status = "COMPLETE" if result and result.get("status") == "COMPLETE" else classify(stderr, killed)
    return {"status": status, "wallMs": wall_ms, "peakRssKiB": rss_peak_kib,
            "rssMethod": "linux-proc-vmhwm" if rss_peak_kib is not None else "unavailable",
            "exitCode": proc.returncode, "stderrExcerpt": stderr[-1300:] if status != "COMPLETE" else "",
            "output": result}


def bounded(value, name, low, high):
    if not low <= value <= high:
        raise ValueError(f"{name} must be in [{low}, {high}]")


def main():
    parser = argparse.ArgumentParser(description="R14-00 measured portable CPU rendering baseline")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--glb")
    parser.add_argument("--frame")
    parser.add_argument("--case", choices=["hard-surface", "organic", "strands"], default="hard-surface")
    parser.add_argument("--triangles", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--views", choices=["hero", "eight"], default="hero")
    parser.add_argument("--size", type=int, default=96)
    parser.add_argument("--tile-size", type=int, default=96)
    parser.add_argument("--timeout-seconds", type=float, default=60)
    parser.add_argument("--max-working-mb", type=float, default=512)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--warmups", type=int, default=0)
    parser.add_argument("--out", help="Write measurement-only JSON report")
    parser.add_argument("--image-dir", help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true", help="Build/inspect geometry only, do not render")
    parser.add_argument("--save-fixture", help="Retain generated GLB and canonical frame in this directory")
    args = parser.parse_args()
    bounded(args.triangles, "--triangles", 2, 1000000)
    bounded(args.size, "--size", 16, 1024)
    bounded(args.tile_size, "--tile-size", 1, 256)
    bounded(args.timeout_seconds, "--timeout-seconds", 0.001, 3600)
    bounded(args.max_working_mb, "--max-working-mb", 1, 8192)
    bounded(args.repeats, "--repeats", 1, 20)
    bounded(args.warmups, "--warmups", 0, 5)
    if bool(args.glb) != bool(args.frame):
        parser.error("--glb and --frame must be supplied together")
    if args.worker:
        if not args.glb or not args.image_dir:
            parser.error("internal worker requires --glb --frame --image-dir")
        print(json.dumps(worker(args), allow_nan=False))
        return
    temp = Path(tempfile.mkdtemp(prefix="refas-r14-00-"))
    try:
        if args.glb:
            glb, frame = Path(args.glb).resolve(), Path(args.frame).resolve()
            generated = None
        else:
            generated_dir = Path(args.save_fixture).resolve() if args.save_fixture else temp
            generated_dir.mkdir(parents=True, exist_ok=True)
            glb, frame = generated_dir / "benchmark.glb", generated_dir / "frame.json"
            generated = create_fixture(glb, frame, args.case, args.triangles, args.seed)
        input_sha = sha256(glb)
        frame_sha = sha256(frame)
        results = []
        for i in range(args.warmups + args.repeats if not args.dry_run else 0):
            images = temp / f"images-{i}"
            call = [
                sys.executable, str(Path(__file__).resolve()), "--worker",
                "--glb", str(glb), "--frame", str(frame), "--image-dir", str(images),
                "--views", args.views, "--size", str(args.size),
                "--tile-size", str(args.tile_size), "--timeout-seconds", str(args.timeout_seconds),
                "--max-working-mb", str(args.max_working_mb),
            ]
            run = measured_child(call, args.timeout_seconds + 10)
            if i >= args.warmups:
                results.append(run)
        completed = [r["wallMs"] for r in results if r["status"] == "COMPLETE"]
        report = {
            "schema": SHARED_ID, "claimScope": "measurement-only",
            "backend": BASELINE_ID, "benchmarkKind": "nondegenerate-geometry-baseline",
            "generated": generated, "asset": {"sha256": input_sha, "bytes": glb.stat().st_size},
            "frame": {"sha256": frame_sha},
            "configuration": {
                "views": args.views, "size": args.size, "tileSize": args.tile_size,
                "timeoutSeconds": args.timeout_seconds, "maxWorkingMiB": args.max_working_mb,
                "repeats": args.repeats, "warmups": args.warmups, "dryRun": args.dry_run,
            },
            "environment": {"python": platform.python_version(), "numpy": np.__version__,
                            "platform": platform.platform(), "machine": platform.machine(),
                            "logicalCpus": os.cpu_count()},
            "measurements": results,
            "summary": {
                "runsCompleted": len(completed), "medianWallMs": statistics.median(completed) if completed else None,
                "minWallMs": min(completed) if completed else None,
                "maxWallMs": max(completed) if completed else None,
                "everyRunCompleted": len(completed) == len(results) and bool(results),
            },
            "caveat": "No source-resemblance, game-readiness or rendering speedup claim. Renderer raster/setup/shade substage times are not individually available from the unmodified legacy kernel.",
        }
        if args.out:
            dest = Path(args.out).resolve()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf8")
        print(json.dumps(report, indent=2, allow_nan=False))
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()

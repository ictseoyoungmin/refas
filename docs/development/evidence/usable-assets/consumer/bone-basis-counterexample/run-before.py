#!/usr/bin/env python3
"""Compare an exported GLB's Godot playback with recorded Blender world matrices."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

HERE = Path(__file__).resolve().parent
AXIS = [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]]
AXIS_INVERSE = [[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]


def multiply(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def convert(matrix):
    if len(matrix) == 16:
        matrix = [matrix[i:i + 4] for i in range(0, 16, 4)]
    if len(matrix) != 4 or any(len(row) != 4 for row in matrix):
        raise ValueError("Expected a 4 by 4 Blender world matrix")
    return multiply(multiply(AXIS, matrix), AXIS_INVERSE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", type=Path, required=True)
    parser.add_argument("--inspection", type=Path, required=True)
    parser.add_argument("--clip", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--tolerance", type=float, default=2e-5)
    parser.add_argument("--required-skinned-meshes", type=int)
    parser.add_argument("--expected-triangles", type=int)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    raw = args.inspection.read_bytes()
    source = json.loads(raw)["consumer_samples"]
    if source["matrix_order"] != "row-major, Blender Z-up world space":
        raise ValueError("Declare row-major Blender Z-up matrices before converting coordinates")
    samples = []
    for sample in source["samples"]:
        probes = [{"node": name, "expected": convert(matrix)} for name, matrix in sample.get("nodes", {}).items()]
        probes += [{"node": item["node"], "bone": item["bone"], "expected": convert(item["matrix"])}
                   for item in sample.get("bones", [])]
        samples.append({"time": sample["seconds"], "probes": probes})
    configuration = {"asset": str(args.asset.resolve()), "clip": args.clip, "samples": samples,
                     "output": str(out / "result.json"), "tolerance": args.tolerance,
                     "bakeFps": source["fps"] / source.get("fps_base", 1),
                     "inspectionSha256": hashlib.sha256(raw).hexdigest(),
                     "coordinateConversion": "Godot/glTF = (Blender X, Blender Z, -Blender Y); C*M*C^-1"}
    if args.required_skinned_meshes is not None:
        configuration["requiredSkinnedMeshes"] = args.required_skinned_meshes
    if args.expected_triangles is not None:
        configuration["expectedTriangles"] = args.expected_triangles
    config = out / "configuration.json"
    config.write_text(json.dumps(configuration, indent=2, allow_nan=False) + "\n")
    command = [shutil.which(args.godot) or args.godot, "--headless", "--path", str(HERE),
               "--script", str(HERE / "verify_godot.gd"), "--", str(config)]
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    timer = time.monotonic()
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    (out / "stdout.txt").write_text(result.stdout)
    (out / "stderr.txt").write_text(result.stderr)
    (out / "command.json").write_text(json.dumps({"argv": command, "startedUtc": started,
        "endedUtc": dt.datetime.now(dt.timezone.utc).isoformat(), "elapsedSeconds": time.monotonic() - timer,
        "returncode": result.returncode}, indent=2) + "\n")
    print(json.dumps({"returncode": result.returncode, "out": str(out)}))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())

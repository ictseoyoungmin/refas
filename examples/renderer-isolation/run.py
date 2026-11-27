#!/usr/bin/env python3
"""Compare unchanged legacy CPU PBR and Cycles paths on one known-material GLB.

This repository-only experiment is not a production skill dependency or an art score.
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
import struct
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageFilter


MATERIALS = [
    ("dielectric-polymer", [0.08, 0.20, 0.42, 1], 0, 0.24),
    ("painted-metal", [0.54, 0.08, 0.055, 1], 0.72, 0.32),
    ("bare-metal", [0.62, 0.66, 0.72, 1], 1, 0.12),
    ("rough-rubber", [0.035, 0.04, 0.045, 1], 0, 0.92),
]
LIGHTS = [([-0.55, 0.75, 0.65], 2.8, [1, 0.96, 0.9]),
          ([0.72, 0.18, 0.54], 1.3, [0.7, 0.82, 1]),
          ([-0.15, -0.62, 0.77], 0.5, [1, 0.76, 0.58])]
BACKGROUND = (15, 18, 23)
NORMAL_TOLERANCE_DEGREES = 0.1


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def make_fixture(path):
    """A deliberately narrow fixture writer: four spheres sharing one indexed mesh."""
    segments, rings = 32, 16
    normals = np.array([[math.sin(y * math.pi / rings) * math.cos(x * 2 * math.pi / segments),
                         math.cos(y * math.pi / rings),
                         math.sin(y * math.pi / rings) * math.sin(x * 2 * math.pi / segments)]
                        for y in range(rings + 1) for x in range(segments + 1)], dtype="<f4")
    positions = (normals * 0.45).astype("<f4")
    indices = []
    for y in range(rings):
        for x in range(segments):
            a, b = y * (segments + 1) + x, (y + 1) * (segments + 1) + x
            if y > 0:
                indices.extend([a, a + 1, b])
            if y < rings - 1:
                indices.extend([a + 1, b + 1, b])
    indices = np.array(indices, dtype="<u4")
    triangles = positions[indices.reshape(-1, 3)]
    assert np.all(np.sum(np.cross(triangles[:, 1] - triangles[:, 0],
                                 triangles[:, 2] - triangles[:, 0]) * triangles.mean(axis=1), axis=1) > 0)
    buffers, views, offset = [], [], 0
    for data, target in ((positions.tobytes(), 34962), (normals.tobytes(), 34962),
                         (indices.tobytes(), 34963)):
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        buffers.append(data)
        offset += len(data)
    materials = [{"name": n, "doubleSided": False, "pbrMetallicRoughness": {
        "baseColorFactor": c, "metallicFactor": m, "roughnessFactor": r}} for n, c, m, r in MATERIALS]
    model = {"asset": {"version": "2.0", "generator": "RefAs repository renderer-isolation fixture"},
        "scene": 0, "scenes": [{"nodes": list(range(4))}],
        "nodes": [{"name": n, "mesh": i, "translation": [-1.65 + i * 1.1, 0.55, 0]}
                  for i, (n, _, _, _) in enumerate(MATERIALS)],
        "meshes": [{"name": n, "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1},
                    "indices": 2, "material": i, "mode": 4}]} for i, (n, _, _, _) in enumerate(MATERIALS)],
        "materials": materials, "buffers": [{"byteLength": offset}], "bufferViews": views,
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
                       "min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()},
                      {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
                      {"bufferView": 2, "componentType": 5125, "count": len(indices), "type": "SCALAR"}]}
    encoded = json.dumps(model, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary = b"".join(buffers)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
        + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        + struct.pack("<II", len(binary), 0x004E4942) + binary)
    return model


def triangles_by_position(positions, indices, normals):
    result = {}
    for triangle, corner_normals in zip(indices, normals):
        points = positions[triangle]
        order = sorted(range(3), key=lambda i: tuple(np.round(points[i], 5)))
        key = tuple(np.round(points[order], 5).ravel())
        if key in result:
            raise ValueError("Fixture contains duplicate or degenerate triangle coordinates")
        result[key] = (points[order], corner_normals[order])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-root", required=True, type=Path)
    parser.add_argument("--blender", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--size", type=int, choices=(160, 384, 512), default=384)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    legacy = args.legacy_root.resolve() / "scripts"
    worker = legacy / "render_external_blender_worker.py"
    helper = Path(__file__).with_name("blender_observe.py").resolve()
    executable = shutil.which(args.blender)
    if not executable or not 2 <= args.samples <= 128 or not 30 <= args.timeout <= 900:
        raise ValueError("Check the Blender executable, samples and timeout")
    source_files = [legacy / "render_glb.py", legacy / "render_pbr.py", worker, helper, Path(__file__).resolve()]
    before_hashes = {str(p): sha(p) for p in source_files}
    out = args.out.resolve()
    if out.exists():
        raise ValueError("Choose a new output directory; prior results are retained: " + str(out))
    out.mkdir(parents=True)
    sys.path.insert(0, str(legacy))
    import render_glb
    import render_pbr
    source = out / "known-materials.glb"
    model = make_fixture(source)
    source_sha = sha(source)
    camera = {"position": [0, 0.55, 8], "target": [0, 0.55, 0], "up": [0, 1, 0], "fovY": 31}
    write(out / "camera.json", {"camera": camera, "aspect": 1, "resolution": [args.size] * 2,
        "authority": "synthetic-unregistered-diagnostic", "gltfToBlender": "(x,y,z) -> (x,-z,y)"})
    write(out / "materials.json", model["materials"])
    _, primitives = render_glb.load_primitives(source)
    commands = [{"label": "driver", "argv": [sys.executable, *sys.argv]}]
    cpu_times = {}
    for mode in ("albedo", "beauty"):
        start = time.perf_counter()
        render_pbr.render(primitives, camera["position"], camera["target"], out / ("cpu-" + mode + ".png"),
            size=args.size, mode=mode, up_hint=camera["up"], fov=camera["fovY"],
            deadline=time.monotonic() + args.timeout, lights=LIGHTS, exposure=0, background=BACKGROUND)
        cpu_times[mode] = round(time.perf_counter() - start, 6)
        commands.append({"label": "cpu-" + mode, "function": "render_pbr.render", "glbSha256": source_sha,
            "camera": camera, "mode": mode, "size": args.size, "lights": LIGHTS,
            "exposure": 0, "background": BACKGROUND, "elapsedSeconds": cpu_times[mode]})
    common = {"glb": str(source), "sourceGlbSha256": source_sha, "sourceUsesColor0": False,
        "expectedTriangles": sum(len(p.indices) for p in primitives), "camera": camera,
        "resolution": args.size, "threads": 2, "samples": args.samples}
    matched = {**common, "png": str(out / "cycles-beauty.png"), "result": str(out / "cycles-worker.json"),
        "lights": [{"direction": [-x for x in direction], "intensity": intensity, "rgb": rgb}
                   for direction, intensity, rgb in LIGHTS]}
    as_shipped = {**common, "png": str(out / "cycles-as-shipped-direction.png"),
        "result": str(out / "cycles-as-shipped-worker.json"),
        "lights": [{"direction": direction, "intensity": intensity, "rgb": rgb}
                   for direction, intensity, rgb in LIGHTS]}
    config = {"worker": str(worker), "matched": matched, "asShippedDirection": as_shipped,
        "observed": str(out / "blender-observed.json"), "albedo": str(out / "cycles-albedo.png"),
        "albedoProfile": str(out / "cycles-albedo-profile.json")}
    write(out / "blender-config.json", config)
    command = [executable, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
               "--python", str(helper), "--", "--config", str(out / "blender-config.json")]
    start = time.perf_counter()
    process = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    commands.append({"label": "cycles-and-observation", "argv": command, "returncode": process.returncode,
                     "elapsedSeconds": round(time.perf_counter() - start, 6)})
    write(out / "commands.json", commands)
    (out / "blender.stdout").write_text(process.stdout, encoding="utf-8")
    (out / "blender.stderr").write_text(process.stderr, encoding="utf-8")
    if process.returncode:
        raise RuntimeError((process.stderr + process.stdout)[-3000:])
    observed = json.loads((out / "blender-observed.json").read_text())
    actual = {x["name"]: x for x in observed["objects"]}
    right, up, forward = render_glb.camera_basis(camera["position"], camera["target"], camera["up"])
    geometry_checks = []
    for primitive in primitives:
        obj = actual[primitive.name]
        source_triangles = triangles_by_position(primitive.positions, primitive.indices, primitive.normals[primitive.indices])
        observed_positions = np.array(obj["positions"])
        observed_triangles = triangles_by_position(observed_positions, np.array(obj["triangles"]), np.array(obj["cornerNormals"]))
        same_triangles = source_triangles.keys() == observed_triangles.keys()
        pos_error = max((float(np.max(np.abs(v[0] - observed_triangles[k][0])))
                         for k, v in source_triangles.items()), default=0) if same_triangles else None
        normal_error = max((float(np.max(np.abs(v[1] - observed_triangles[k][1])))
                            for k, v in source_triangles.items()), default=0) if same_triangles else None
        normal_angle = None
        if same_triangles:
            a = np.concatenate([v[1] for v in source_triangles.values()])
            b = np.concatenate([observed_triangles[k][1] for k in source_triangles])
            a /= np.linalg.norm(a, axis=1, keepdims=True)
            b /= np.linalg.norm(b, axis=1, keepdims=True)
            normal_angle = float(np.degrees(np.arccos(np.clip(np.sum(a * b, axis=1), -1, 1))).max())
        projected = {tuple(np.round(p, 5)): uv for p, uv in zip(observed_positions, obj["projectedNdc"])}
        relative = primitive.positions - camera["position"]
        z = relative @ forward
        ndc = np.column_stack(((relative @ right) / (z * math.tan(math.radians(camera["fovY"]) / 2)) * 0.5 + 0.5,
                               (relative @ up) / (z * math.tan(math.radians(camera["fovY"]) / 2)) * 0.5 + 0.5))
        ndc_error = max(float(np.max(np.abs(expected - projected[tuple(np.round(point, 5))])))
                        for point, expected in zip(primitive.positions, ndc))
        material = obj["materials"][0]
        material_match = (len(obj["materials"]) == 1 and material["name"] == primitive.name
            and np.allclose(material["baseColorFactor"][:3], primitive.color, atol=1e-6, rtol=0)
            and abs(material["metallicFactor"] - primitive.metallic) < 1e-6
            and abs(material["roughnessFactor"] - primitive.roughness) < 1e-6)
        geometry_checks.append({"object": primitive.name, "triangles": len(primitive.indices),
            "sameTriangleCoordinateKeys": same_triangles, "maxPositionError": pos_error,
            "maxCornerNormalError": normal_error, "maxCornerNormalAngleDegrees": normal_angle,
            "maxProjectionNdcError": ndc_error,
            "usedMaterialFactorsMatch": bool(material_match)})
    actual_camera = observed["camera"]
    camera_checks = {"perspective": actual_camera["type"] == "PERSP",
        "position": bool(np.allclose(actual_camera["position"], camera["position"], atol=1e-6, rtol=0)),
        "basis": all(np.allclose(actual_camera[k], v, atol=1e-6, rtol=0) for k, v in
                     (("right", right), ("up", up), ("forward", forward))),
        "fovY": abs(actual_camera["fovY"] - camera["fovY"]) < 1e-4,
        "resolution": actual_camera["resolution"] == [args.size] * 2,
        "pixelAspect": actual_camera["pixelAspect"] == [1, 1]}
    light_checks = [float(np.dot(np.array(actual_light["propagationGltf"]),
                    -np.array(direction) / np.linalg.norm(direction)))
                    for actual_light, (direction, _, _) in zip(observed["profile"]["lights"], LIGHTS)]
    cpu_albedo = np.asarray(Image.open(out / "cpu-albedo.png").convert("RGB"))
    cycles_albedo = np.asarray(Image.open(out / "cycles-albedo.png").convert("RGBA"))
    mask_a, mask_b = np.any(cpu_albedo != BACKGROUND, axis=2), cycles_albedo[:, :, 3] >= 128
    def dilated(mask):
        return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    unexpected = int(np.count_nonzero((mask_a & ~dilated(mask_b)) | (mask_b & ~dilated(mask_a))))
    coverage = {"cpuPixels": int(mask_a.sum()), "cyclesPixels": int(mask_b.sum()),
        "iou": float((mask_a & mask_b).sum() / (mask_a | mask_b).sum()),
        "pixelsBeyondTwoPixelSamplingBand": unexpected,
        "convention": "CPU integer samples on size-1 projection; Cycles pixel centers with its recorded antialias filter; Cycles alpha threshold 0.5."}
    center_samples = []
    for i, (name, color, _, _) in enumerate(MATERIALS):
        point = np.array([-1.65 + i * 1.1, 0.55, 0]) - camera["position"]
        u = np.dot(point, right) / (np.dot(point, forward) * math.tan(math.radians(31) / 2)) * 0.5 + 0.5
        x, y = int(round(u * (args.size - 1))), int(round((args.size - 1) / 2))
        samples = {}
        for label in ("cpu-albedo", "cycles-albedo", "cpu-beauty", "cycles-beauty", "cycles-as-shipped-direction"):
            pixels = np.asarray(Image.open(out / (label + ".png")).convert("RGB"))
            samples[label] = np.round(np.median(pixels[y-3:y+4, x-3:x+4], axis=(0, 1)), 3).tolist()
        center_samples.append({"material": name, "sourceLinearBaseColor": color[:3], "centerPixel": [x, y], "medianRgb": samples})
    hashes_unchanged = all(sha(p) == h for p, h in before_hashes.items())
    checks = {"sourceBytesUnchanged": sha(source) == source_sha,
        "rendererAndHarnessBytesUnchanged": hashes_unchanged,
        "sourceAndImportedObjectSet": set(actual) == {p.name for p in primitives},
        "allTriangleCoordinates": all(g["sameTriangleCoordinateKeys"] and
            g["maxPositionError"] < 1e-6 for g in geometry_checks),
        "smoothNormalDirectionsWithinDeclaredTolerance": all(g["maxCornerNormalAngleDegrees"] is not None and
            g["maxCornerNormalAngleDegrees"] < NORMAL_TOLERANCE_DEGREES for g in geometry_checks),
        "allUsedMaterialFactors": all(g["usedMaterialFactorsMatch"] for g in geometry_checks),
        "actualCamera": all(camera_checks.values()),
        "independentProjection": max(g["maxProjectionNdcError"] for g in geometry_checks) < 1e-6,
        "lightDirectionConvention": len(light_checks) == 3 and min(light_checks) > 1 - 1e-6,
        "coverageWithinSamplingBand": unexpected == 0 and min(coverage["cpuPixels"], coverage["cyclesPixels"]) > 0,
        "actualImages": all(len(np.unique(np.asarray(Image.open(out / (label + ".png")).convert("RGB")).reshape(-1, 3), axis=0)) > 2
                            for label in ("cpu-albedo", "cycles-albedo", "cpu-beauty", "cycles-beauty", "cycles-as-shipped-direction"))}
    result = {"schema": "refas.renderer-isolation-experiment/v1", "ok": all(checks.values()),
        "scope": "same-GLB-camera-known-material rendering-stack comparison", "checks": checks,
        "source": {"path": source.name, "sha256": source_sha, "bytes": source.stat().st_size,
                   "meshObjects": 4, "triangles": sum(len(p.indices) for p in primitives)},
        "geometry": geometry_checks, "requestedCamera": camera, "actualCamera": actual_camera,
        "tolerances": {"trianglePositionAbsolute": 1e-6, "projectionNdcAbsolute": 1e-6,
            "normalAngleDegrees": NORMAL_TOLERANCE_DEGREES, "fovYDegrees": 1e-4,
            "coverageSamplingBandPixels": 2,
            "normalNote": "Blender custom-normal API round-tripping has finite directional precision; imported normals are compared angularly and their observed component/angle deltas are retained."},
        "cameraChecks": camera_checks, "lightDirectionCosines": light_checks,
        "coverage": coverage, "centerSamples": center_samples,
        "profiles": {"cpu": {"algorithm": "legacy NumPy Cook-Torrance", "lightsSurfaceToLight": LIGHTS,
            "ambient": "base*(.025+.055*(1-roughness))*(1-metallic) + F0*(.10+.16*(1-roughness))",
            "toneMap": "Reinhard", "outputTransfer": "gamma 2.2 for this no-COLOR_0 fixture",
            "background": BACKGROUND, "exposure": 0, "antialiasing": "none"},
            "cycles": observed["profile"], "albedoOverride": json.loads((out / "cycles-albedo-profile.json").read_text())},
        "timings": {"cpuSeconds": cpu_times, "blenderProcessSeconds": commands[-1]["elapsedSeconds"]},
        "toolchain": {"python": platform.python_version(), "numpy": np.__version__,
            "blender": json.loads((out / "cycles-worker.json").read_text())["blenderVersion"]},
        "inputScriptSha256": before_hashes,
        "outputs": [{"path": p.name, "sha256": sha(p), "bytes": p.stat().st_size} for p in sorted(out.glob("*.png"))],
        "limits": ["Same geometry, camera and source material factors are verified; full shader/ambient/tone equivalence is not claimed.",
                   "Imported smooth normals are preserved within the declared angular tolerance, not bit-for-bit; inspect the measured deltas.",
                   "CPU ambient approximation and Reinhard/gamma output differ from Cycles world illumination and Standard output.",
                   "The retained as-shipped-direction image changes only SUN propagation sign, not source geometry, material factors or camera.",
                   "Coverage/color measurements are diagnostics, not an art-quality or source-likeness score.",
                   "One small opaque factor-only fixture does not cover textures, alpha, deformation or general renderer superiority.",
                   "Timings describe these actual runs only; they do not establish an authoring-cost or performance benchmark."],
        "visualAcceptance": "requires-human-inspection", "certificationEligible": False}
    write(out / "result.json", result)
    print(json.dumps({"ok": result["ok"], "checks": checks, "coverage": coverage,
                      "result": str(out / "result.json")}, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

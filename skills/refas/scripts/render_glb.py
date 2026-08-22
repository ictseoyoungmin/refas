#!/usr/bin/env python3
"""Offline GLB 2.0 multiview rasterizer for deterministic RefAs visual QA."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import struct
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


COMPONENT_DTYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
TYPE_DIMS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
MIB = 1024 * 1024
PERSISTENT_BYTES_PER_PIXEL = 11  # RGB framebuffer + float64 depth buffer.
SCRATCH_BYTES_PER_PIXEL = 128  # Conservative bound for tile-local raster arrays.


class RenderTimeoutError(TimeoutError):
    pass


def resource_policy(width, height, *, max_working_mb=512.0, requested_tile_size=256, source_glb_bytes=0, decoded_geometry_bytes=0):
    if width < 1 or height < 1:
        raise ValueError("render dimensions must be positive")
    if max_working_mb <= 0:
        raise ValueError("max working memory must be positive")
    if requested_tile_size < 1:
        raise ValueError("tile size must be positive")
    budget_bytes = int(max_working_mb * MIB)
    persistent_bytes = width * height * PERSISTENT_BYTES_PER_PIXEL + source_glb_bytes + decoded_geometry_bytes
    available_scratch = budget_bytes - persistent_bytes
    if available_scratch < SCRATCH_BYTES_PER_PIXEL:
        required_mb = (persistent_bytes + SCRATCH_BYTES_PER_PIXEL) / MIB
        raise MemoryError(f"render requires at least {required_mb:.2f} MiB for the framebuffer; budget is {max_working_mb:.2f} MiB")
    budget_tile = max(1, int(math.sqrt(available_scratch / SCRATCH_BYTES_PER_PIXEL)))
    tile_size = min(requested_tile_size, budget_tile, width, height)
    estimated_peak_bytes = persistent_bytes + tile_size * tile_size * SCRATCH_BYTES_PER_PIXEL
    return {
        "budgetMiB": round(max_working_mb, 3),
        "sourceGlbMiB": round(source_glb_bytes / MIB, 3),
        "decodedGeometryMiB": round(decoded_geometry_bytes / MIB, 3),
        "persistentMiB": round(persistent_bytes / MIB, 3),
        "estimatedPeakMiB": round(estimated_peak_bytes / MIB, 3),
        "tileSize": tile_size,
        "scratchBytesPerPixel": SCRATCH_BYTES_PER_PIXEL,
    }


def check_deadline(deadline):
    if deadline is not None and time.monotonic() >= deadline:
        raise RenderTimeoutError("render exceeded the configured wall-clock timeout")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(size: int):
    for candidate in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def normalize(vector):
    vector = np.asarray(vector, dtype=np.float64)
    length = np.linalg.norm(vector)
    return vector / length if length > 1e-12 else np.array([0.0, 0.0, 1.0])


def parse_glb(path: Path):
    data = path.read_bytes()
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (0x46546C67, 2):
        raise ValueError("embedded GLB 2.0 required")
    offset, model, binary = 12, None, None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + length]
        if kind == 0x4E4F534A:
            model = json.loads(chunk.rstrip(b"\x00 \t\r\n").decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        offset += length
    if model is None or binary is None:
        raise ValueError("GLB JSON and BIN chunks required")
    return model, binary


def accessor(model, binary, index):
    item = model["accessors"][index]
    view = model["bufferViews"][item["bufferView"]]
    dtype = np.dtype(COMPONENT_DTYPES[item["componentType"]]).newbyteorder("<")
    dims = TYPE_DIMS[item["type"]]
    offset = int(view.get("byteOffset", 0)) + int(item.get("byteOffset", 0))
    count = int(item["count"])
    stride = int(view.get("byteStride", dtype.itemsize * dims))
    if stride == dtype.itemsize * dims:
        values = np.frombuffer(binary, dtype=dtype, count=count * dims, offset=offset).reshape(count, dims)
    else:
        values = np.ndarray((count, dims), dtype=dtype, buffer=binary, offset=offset, strides=(stride, dtype.itemsize)).copy()
    return values[:, 0] if dims == 1 else values


def quaternion_matrix(quaternion):
    x, y, z, w = quaternion
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz, wx, wy, wz = x * y, x * z, y * z, w * x, w * y, w * z
    return np.array([[1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0], [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0], [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0], [0, 0, 0, 1]], dtype=np.float64)


def node_matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float64).reshape((4, 4), order="F")
    translation = node.get("translation", [0, 0, 0])
    rotation = node.get("rotation", [0, 0, 0, 1])
    scale = node.get("scale", [1, 1, 1])
    matrix = quaternion_matrix(rotation)
    matrix[:3, :3] = matrix[:3, :3] @ np.diag(scale)
    matrix[:3, 3] = translation
    return matrix


@dataclass
class Primitive:
    positions: np.ndarray
    normals: np.ndarray
    indices: np.ndarray
    color: np.ndarray
    metallic: float
    roughness: float
    object_id: int
    name: str


def load_primitives(path: Path, parsed=None):
    model, binary = parsed if parsed is not None else parse_glb(path)
    materials = []
    for material in model.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        materials.append((np.array(pbr.get("baseColorFactor", [0.7, 0.7, 0.7, 1])[:3], dtype=np.float64), float(pbr.get("metallicFactor", 0)), float(pbr.get("roughnessFactor", 0.5))))
    if not materials:
        materials = [(np.array([0.7, 0.7, 0.7]), 0.0, 0.5)]
    primitives = []
    roots = model.get("scenes", [{}])[model.get("scene", 0)].get("nodes", [])

    def visit(node_index, parent):
        node = model["nodes"][node_index]
        world = parent @ node_matrix(node)
        if "mesh" in node:
            mesh = model["meshes"][node["mesh"]]
            for primitive in mesh.get("primitives", []):
                positions = accessor(model, binary, primitive["attributes"]["POSITION"]).astype(np.float64)
                normals = accessor(model, binary, primitive["attributes"]["NORMAL"]).astype(np.float64) if "NORMAL" in primitive["attributes"] else np.zeros_like(positions)
                indices = accessor(model, binary, primitive["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in primitive else np.arange(len(positions), dtype=np.int64).reshape(-1, 3)
                homogeneous = np.concatenate([positions, np.ones((len(positions), 1))], axis=1)
                positions = (world @ homogeneous.T).T[:, :3]
                normal_matrix = np.linalg.inv(world[:3, :3]).T
                normals = (normal_matrix @ normals.T).T
                norms = np.linalg.norm(normals, axis=1, keepdims=True)
                normals = normals / np.where(norms > 1e-12, norms, 1)
                color, metallic, roughness = materials[primitive.get("material", 0)]
                primitives.append(Primitive(positions, normals, indices, color, metallic, roughness, len(primitives), node.get("name", mesh.get("name", f"part-{len(primitives)}"))))
        for child in node.get("children", []):
            visit(child, world)

    identity = np.eye(4, dtype=np.float64)
    for root in roots:
        visit(root, identity)
    if not primitives:
        raise ValueError("GLB has no triangle primitives")
    return model, primitives


def estimate_decoded_geometry_bytes(model):
    total = 0
    for mesh in model.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            position = model.get("accessors", [])[attributes.get("POSITION", -1)] if "POSITION" in attributes else None
            normal = model.get("accessors", [])[attributes.get("NORMAL", -1)] if "NORMAL" in attributes else None
            indices = model.get("accessors", [])[primitive.get("indices", -1)] if "indices" in primitive else None
            # Conservative peak: stored world geometry plus temporary homogeneous,
            # camera-space, and transform arrays used one primitive at a time.
            if position:
                total += int(position.get("count", 0)) * 104
            if normal:
                total += int(normal.get("count", 0)) * 24
            if indices:
                total += int(indices.get("count", 0)) * 8
    return total


def object_color(index: int):
    value = ((index + 1) * 2654435761) & 0xFFFFFFFF
    return np.array([(value & 255) / 255, ((value >> 8) & 255) / 255, ((value >> 16) & 255) / 255])


def camera_basis(position, target):
    forward = normalize(np.asarray(target) - np.asarray(position))
    up_hint = np.array([0.0, 1.0, 0.0])
    if abs(float(np.dot(forward, up_hint))) > 0.97:
        up_hint = np.array([0.0, 0.0, 1.0])
    right = normalize(np.cross(forward, up_hint))
    up = normalize(np.cross(right, forward))
    return right, up, forward


def shade(base, normal, view, metallic, roughness):
    normal = normalize(normal)
    if np.dot(normal, view) < 0:
        normal = -normal
    lights = [(normalize([-0.45, 0.72, 0.62]), 1.18), (normalize([0.75, 0.25, 0.54]), 0.58), (normalize([-0.2, -0.5, 0.84]), 0.28)]
    diffuse = 0.24
    specular = 0.0
    for direction, intensity in lights:
        ndotl = max(0.0, float(np.dot(normal, direction)))
        diffuse += ndotl * intensity
        half_vector = normalize(direction + view)
        power = 8 + (1.0 - roughness) * 92
        specular += max(0.0, float(np.dot(normal, half_vector))) ** power * intensity
    color = base * diffuse * (1.0 - metallic * 0.24) + specular * ((0.04 * (1 - metallic)) + base * metallic) * 0.72
    return np.clip(color / (1.0 + color * 0.42), 0, 1)


def render(primitives, position, target, output: Path, *, width=640, height=640, fov=31, mode="beauty", tile_size=256, deadline=None):
    started = time.perf_counter()
    right, up, forward = camera_basis(position, target)
    position = np.asarray(position, dtype=np.float64)
    scale_y = math.tan(math.radians(fov) / 2)
    scale_x = scale_y * width / height
    background = np.array([12, 15, 19], dtype=np.uint8)
    image = np.broadcast_to(background, (height, width, 3)).copy()
    depth_buffer = np.full((height, width), np.inf, dtype=np.float64)
    rendered_triangles = 0
    for primitive in primitives:
        check_deadline(deadline)
        relative = primitive.positions - position
        camera = np.column_stack((relative @ right, relative @ up, relative @ forward))
        for triangle in primitive.indices:
            check_deadline(deadline)
            vertices = camera[triangle]
            if np.any(vertices[:, 2] <= 0.01):
                continue
            x_ndc = vertices[:, 0] / (vertices[:, 2] * scale_x)
            y_ndc = vertices[:, 1] / (vertices[:, 2] * scale_y)
            screen = np.column_stack(((x_ndc * 0.5 + 0.5) * (width - 1), (0.5 - y_ndc * 0.5) * (height - 1)))
            min_x = max(0, int(math.floor(screen[:, 0].min())))
            max_x = min(width - 1, int(math.ceil(screen[:, 0].max())))
            min_y = max(0, int(math.floor(screen[:, 1].min())))
            max_y = min(height - 1, int(math.ceil(screen[:, 1].max())))
            if min_x > max_x or min_y > max_y:
                continue
            a, b, c = screen
            denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(denominator) < 1e-10:
                continue
            world_vertices = primitive.positions[triangle]
            face_normal = normalize(np.cross(world_vertices[1] - world_vertices[0], world_vertices[2] - world_vertices[0]))
            view = normalize(position - world_vertices.mean(axis=0))
            if mode == "normal":
                color = np.clip(face_normal * 0.5 + 0.5, 0, 1)
            elif mode == "object-id":
                color = object_color(primitive.object_id)
            elif mode == "albedo":
                color = primitive.color
            else:
                color = shade(primitive.color, face_normal, view, primitive.metallic, primitive.roughness)
            encoded_color = np.round(np.power(np.clip(color, 0, 1), 1 / 2.2) * 255).astype(np.uint8)
            triangle_visible = False
            for tile_y in range(min_y, max_y + 1, tile_size):
                for tile_x in range(min_x, max_x + 1, tile_size):
                    check_deadline(deadline)
                    tile_max_y = min(max_y, tile_y + tile_size - 1)
                    tile_max_x = min(max_x, tile_x + tile_size - 1)
                    yy, xx = np.mgrid[tile_y:tile_max_y + 1, tile_x:tile_max_x + 1]
                    w0 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / denominator
                    w1 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / denominator
                    w2 = 1.0 - w0 - w1
                    inside = (w0 >= -1e-7) & (w1 >= -1e-7) & (w2 >= -1e-7)
                    if not np.any(inside):
                        continue
                    inverse_depth = w0 / vertices[0, 2] + w1 / vertices[1, 2] + w2 / vertices[2, 2]
                    depth = np.where(inverse_depth > 1e-12, 1.0 / inverse_depth, np.inf)
                    region_depth = depth_buffer[tile_y:tile_max_y + 1, tile_x:tile_max_x + 1]
                    visible = inside & (depth < region_depth)
                    if not np.any(visible):
                        continue
                    region = image[tile_y:tile_max_y + 1, tile_x:tile_max_x + 1]
                    region[visible] = encoded_color
                    region_depth[visible] = depth[visible]
                    triangle_visible = True
            if triangle_visible:
                rendered_triangles += 1
    Image.fromarray(image, mode="RGB").save(output, format="PNG")
    return {"path": output.name, "sha256": sha256(output), "mode": mode, "camera": {"position": list(map(float, position)), "target": list(map(float, target)), "fovY": fov}, "renderedTriangles": rendered_triangles, "durationMs": round((time.perf_counter() - started) * 1000, 2)}


def make_board(reference: Path | None, frames, output: Path):
    cell_w, cell_h, header = 500, 450, 44
    items = []
    if reference:
        items.append(("RAW REFERENCE", Image.open(reference).convert("RGB")))
    for frame in frames:
        items.append((frame["label"], Image.open(frame["absolutePath"]).convert("RGB")))
    columns = 3
    rows = math.ceil(len(items) / columns)
    board = Image.new("RGB", (cell_w * columns, (cell_h + header) * rows), (13, 16, 20))
    draw = ImageDraw.Draw(board)
    label_font = font(19)
    for index, (label, image) in enumerate(items):
        column, row = index % columns, index // columns
        x, y = column * cell_w, row * (cell_h + header)
        fitted = ImageOps.contain(image, (cell_w - 24, cell_h - 24), Image.Resampling.LANCZOS)
        board.paste(fitted, (x + (cell_w - fitted.width) // 2, y + header + (cell_h - fitted.height) // 2))
        draw.text((x + 14, y + 11), label, fill=(236, 241, 247), font=label_font)
    board.save(output, format="PNG")


def main():
    parser = argparse.ArgumentParser(description="RefAs offline GLB multiview renderer")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--reference")
    parser.add_argument("--size", type=int, default=640)
    parser.add_argument("--timeout-seconds", type=float, default=300.0)
    parser.add_argument("--max-working-mb", type=float, default=512.0)
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--max-triangles", type=int)
    args = parser.parse_args()
    glb_path, output = Path(args.glb).resolve(), Path(args.out).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.timeout_seconds <= 0:
        raise ValueError("timeout seconds must be positive")
    source_glb_bytes = glb_path.stat().st_size
    budget_bytes = int(args.max_working_mb * MIB)
    if source_glb_bytes * 2 >= budget_bytes:
        raise MemoryError(f"source GLB parsing may peak above the {args.max_working_mb:.2f} MiB working-memory budget; file size is {source_glb_bytes / MIB:.2f} MiB")
    model, binary = parse_glb(glb_path)
    decoded_geometry_bytes = estimate_decoded_geometry_bytes(model)
    policy = resource_policy(args.size, args.size, max_working_mb=args.max_working_mb, requested_tile_size=args.tile_size, source_glb_bytes=source_glb_bytes, decoded_geometry_bytes=decoded_geometry_bytes)
    model, primitives = load_primitives(glb_path, parsed=(model, binary))
    triangle_count = int(sum(len(primitive.indices) for primitive in primitives))
    if args.max_triangles is not None and triangle_count > args.max_triangles:
        raise ValueError(f"triangle count {triangle_count} exceeds explicit limit {args.max_triangles}")
    deadline = time.monotonic() + args.timeout_seconds
    points = np.concatenate([primitive.positions for primitive in primitives], axis=0)
    minimum, maximum = points.min(axis=0), points.max(axis=0)
    center = (minimum + maximum) / 2
    radius = max(float(np.linalg.norm(maximum - minimum) / 2), 0.25)
    distance = radius * 3.1
    view_specs = [
        ("hero", [0.0, 0.0, 1.0], "beauty", "HERO"),
        ("oblique", [0.72, 0.20, 1.0], "beauty", "OBLIQUE"),
        ("side", [1.0, 0.05, 0.15], "beauty", "SIDE"),
        ("top", [0.18, 1.0, 0.35], "beauty", "TOP"),
        ("grazing", [-1.0, 0.05, 0.18], "beauty", "GRAZING"),
        ("normal", [0.0, 0.0, 1.0], "normal", "NORMAL"),
        ("object-id", [0.0, 0.0, 1.0], "object-id", "OBJECT ID"),
        ("albedo", [0.0, 0.0, 1.0], "albedo", "ALBEDO"),
    ]
    staging = Path(tempfile.mkdtemp(prefix=".refas-render-", dir=output.parent))
    try:
        frames = []
        for name, direction, mode, label in view_specs:
            check_deadline(deadline)
            position = center + normalize(direction) * distance
            frame_path = staging / f"{name}.png"
            record = render(primitives, position, center, frame_path, width=args.size, height=args.size, mode=mode, tile_size=policy["tileSize"], deadline=deadline)
            frames.append({**record, "label": label, "absolutePath": str(frame_path)})
        board_path = staging / "multiview-review-board.png"
        reference = Path(args.reference).resolve() if args.reference else None
        check_deadline(deadline)
        make_board(reference, frames, board_path)
        check_deadline(deadline)
        report = {
            "schema": "refas.multiview-render-report/v1",
            "claimScope": "render-integrity-only",
            "statusMeaning": "All requested views rasterized from actual GLB geometry; visual similarity is not assessed.",
            "asset": {"path": str(glb_path), "sha256": sha256(glb_path), "generator": model.get("asset", {}).get("generator")},
            "runtime": {"kind": "offline-numpy-rasterizer", "networkRequests": 0, "deterministicInputs": True},
            "materialSupport": {
                "supported": ["base-color-factor", "metallic-factor", "roughness-factor"],
                "unsupported": ["clearcoat", "image-based-lighting", "normal-maps", "textures"],
            },
            "geometry": {"parts": len(primitives), "triangles": triangle_count, "bounds": {"min": minimum.tolist(), "max": maximum.tolist()}},
            "resourcePolicy": {**policy, "timeoutSeconds": args.timeout_seconds, "maxTriangles": args.max_triangles},
            "frames": [{key: value for key, value in frame.items() if key != "absolutePath"} for frame in frames],
            "board": {"path": board_path.name, "sha256": sha256(board_path)},
            "status": "PASS" if all(frame["renderedTriangles"] > 0 for frame in frames) else "FAIL",
        }
        report_path = staging / "render-report.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        output.mkdir(parents=True, exist_ok=True)
        for staged in staging.iterdir():
            os.replace(staged, output / staged.name)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    report_path = output / "render-report.json"
    board_path = output / "multiview-review-board.png"
    print(json.dumps({"status": report["status"], "claimScope": report["claimScope"], "report": str(report_path), "board": str(board_path), "triangles": report["geometry"]["triangles"]}, indent=2))
    if report["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

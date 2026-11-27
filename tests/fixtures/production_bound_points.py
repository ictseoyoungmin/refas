"""Small exact GLB: one moving joint, attached static points and name collisions."""
from __future__ import annotations

import json
from pathlib import Path
import struct


def write_fixture(directory: Path, *, duplicate_names=False):
    directory.mkdir()
    chunks, views, accessors = [], [], []

    def add(values, fmt, kind, count, component=5126, bounds=None):
        offset = sum(map(len, chunks))
        blob = struct.pack("<" + fmt, *values)
        chunks.append(blob + b"\0" * (-len(blob) % 4))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blob)})
        accessor = {"bufferView": len(views) - 1, "componentType": component,
                    "count": count, "type": kind}
        if bounds:
            accessor.update(min=bounds[0], max=bounds[1])
        accessors.append(accessor)
        return len(accessors) - 1

    positions = add([0, 0, 0, .1, 0, 0, 0, .1, 0], "9f", "VEC3", 3,
                    bounds=([0, 0, 0], [.1, .1, 0]))
    normals = add([0, 0, 1] * 3, "9f", "VEC3", 3)
    indices = add([0, 1, 2], "3H", "SCALAR", 3, 5123)
    times = add([0, .5, 1], "3f", "SCALAR", 3, bounds=([0], [1]))
    translations = add([0, 0, 0, .02, 0, 0, 0, 0, 0], "9f", "VEC3", 3)
    joints = add([0, 0, 0, 0] * 3, "12H", "VEC4", 3, 5123)
    weights = add([1, 0, 0, 0] * 3, "12f", "VEC4", 3)
    bind = add([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], "16f", "MAT4", 1)
    static_name = "Static.Probe:Sample"
    collision_name = static_name if duplicate_names else "Static_Probe_Sample"
    attributes = {"POSITION": positions, "NORMAL": normals}
    binary = b"".join(chunks)
    document = {
        "asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "Root", "children": [1, 3, 4, 5]},
            {"name": "ProbeBone", "children": [2]},
            {"name": static_name, "mesh": 0, "translation": [.25, 0, 0]},
            {"name": "SkinnedFixture", "mesh": 1, "skin": 0},
            {"name": collision_name, "mesh": 0, "translation": [-.25, 0, 0]},
            {"mesh": 0, "translation": [0, 0, .25]}],
        "meshes": [
            {"primitives": [{"attributes": attributes, "indices": indices}]},
            {"primitives": [{"attributes": {**attributes, "JOINTS_0": joints, "WEIGHTS_0": weights},
                             "indices": indices}]}],
        "skins": [{"inverseBindMatrices": bind, "skeleton": 1, "joints": [1]}],
        "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors,
        "animations": [{"name": "BoneAttachedPoint",
            "samplers": [{"input": times, "output": translations, "interpolation": "LINEAR"}],
            "channels": [{"sampler": 0, "target": {"node": 1, "path": "translation"}}]}]}
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    (directory / "asset.glb").write_bytes(
        struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
        + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
        + struct.pack("<II", len(binary), 0x004E4942) + binary)

    # Independent native-coordinate expectations: the known glTF XY triangle
    # is Blender XZ, and the sole joint translates exactly 20 mm along X.
    rows = []
    for seconds, motion in ((0, 0), (.5, .02), (1, 0)):
        nodes, vertices = {}, []
        selectors = [(static_name, .25, motion), ("SkinnedFixture", 0, motion)]
        if not duplicate_names:
            selectors.append((collision_name, -.25, 0))
        for name, offset, movement in selectors:
            if name != "SkinnedFixture":
                nodes[name] = [[1, 0, 0, offset + movement], [0, 1, 0, 0],
                               [0, 0, 1, 0], [0, 0, 0, 1]]
            for index, point in enumerate(((0, 0, 0), (.1, 0, 0), (0, 0, .1))):
                rest = [point[0] + offset, point[1], point[2]]
                vertices.append({"node": name, "label": str(index), "rest_world": rest,
                                 "world": [rest[0] + movement, rest[1], rest[2]]})
        rows.append({"seconds": seconds, "nodes": nodes, "skin_vertices": vertices})
    (directory / "inspection.json").write_text(json.dumps({"consumer_samples": {
        "fps": 30, "fps_base": 1, "matrix_order": "row-major, Blender Z-up world space", "samples": rows}}))

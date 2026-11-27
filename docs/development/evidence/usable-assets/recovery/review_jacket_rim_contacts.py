"""Independently classify nominated cloth triangle contacts in float64.

This bounded review loads only the collar, reads nominated pairs from a frozen
audit, and does not mutate or save the authored Blender file.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def edge_hits(one, two):
    """Intersect finite edges with the other triangle, in double precision."""
    a, b, c = two
    ab, ac = b - a, c - a
    normal = np.cross(ab, ac)
    normal /= np.linalg.norm(normal)
    rows = []
    for edge in range(3):
        start, end = one[edge], one[(edge + 1) % 3]
        direction = end - start
        p = np.cross(direction, ac)
        determinant = float(np.dot(ab, p))
        scale = np.linalg.norm(direction) * np.linalg.norm(ab) * np.linalg.norm(ac)
        if abs(determinant) <= scale * 1e-12:
            continue
        inverse = 1.0 / determinant
        s = start - a
        u = float(np.dot(s, p) * inverse)
        q = np.cross(s, ab)
        v = float(np.dot(direction, q) * inverse)
        t = float(np.dot(ac, q) * inverse)
        barycentric = [1.0 - u - v, u, v]
        if -1e-10 <= t <= 1.0 + 1e-10 and min(barycentric) >= -1e-10:
            distances = [float(np.dot(point - a, normal)) for point in (start, end)]
            rows.append({
                "edge": edge,
                "edgeParameter": t,
                "triangleBarycentric": barycentric,
                "pointM": (start + t * direction).tolist(),
                "edgeEndpointSignedPlaneDistanceM": distances,
                "strictEdgeAndFaceInterior": (
                    1e-8 < t < 1.0 - 1e-8 and min(barycentric) > 1e-8
                ),
            })
    return rows


p = argparse.ArgumentParser()
p.add_argument("--input", type=Path, required=True)
p.add_argument("--audit", type=Path, required=True)
p.add_argument("--out", type=Path, required=True)
args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(args.input), link=False) as (source, target):
    target.objects = [name for name in source.objects if name == "Collar | standing back and neck facing"]
assert len(target.objects) == 1
obj = target.objects[0]
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()
evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
mesh.calc_loop_triangles()
vertices = np.asarray([obj.matrix_world @ vertex.co for vertex in mesh.vertices], dtype=np.float64)
faces = np.asarray([triangle.vertices[:] for triangle in mesh.loop_triangles], dtype=np.int64)
audit = np.load(args.audit)
assert np.array_equal(vertices, audit["vertices"]), "Frozen audit vertices do not match native file"
count = len(vertices) // 2


def kind(face):
    return "outer" if max(face) < count else "inner" if min(face) >= count else "rim"


rows = []
for first, second in audit["full_shell_crossings"]:
    ids_a, ids_b = faces[first], faces[second]
    tri_a, tri_b = vertices[ids_a], vertices[ids_b]
    hits_a, hits_b = edge_hits(tri_a, tri_b), edge_hits(tri_b, tri_a)
    hits = hits_a + hits_b
    points = np.asarray([hit["pointM"] for hit in hits])
    span = max((np.linalg.norm(x - y) for x in points for y in points), default=0.0)
    normal_a, normal_b = (np.cross(tri[1] - tri[0], tri[2] - tri[0]) for tri in (tri_a, tri_b))
    normal_a /= np.linalg.norm(normal_a)
    normal_b /= np.linalg.norm(normal_b)
    strict = any(hit["strictEdgeAndFaceInterior"] for hit in hits)
    rows.append({
        "triangles": [int(first), int(second)],
        "kinds": [kind(ids_a), kind(ids_b)],
        "vertexIds": [ids_a.tolist(), ids_b.tolist()],
        "sharedVertexIndices": sorted(set(ids_a.tolist()) & set(ids_b.tolist())),
        "minimumVertexDistanceM": float(np.linalg.norm(tri_a[:, None] - tri_b[None, :], axis=2).min()),
        "normalDot": float(np.dot(normal_a, normal_b)),
        "firstVerticesToSecondPlaneM": ((tri_a - tri_b[0]) @ normal_b).tolist(),
        "secondVerticesToFirstPlaneM": ((tri_b - tri_a[0]) @ normal_a).tolist(),
        "firstEdgesAgainstSecondTriangle": hits_a,
        "secondEdgesAgainstFirstTriangle": hits_b,
        "intersectionSpanM": float(span),
        "classification": "proper nonadjacent triangle crossing" if strict and span > 1e-7 else "boundary or submicron contact requiring judgment",
    })

report = {
    "input": str(args.input),
    "inputSha256": digest(args.input),
    "audit": str(args.audit),
    "auditSha256": digest(args.audit),
    "nativeVerticesExactlyMatchAudit": True,
    "method": "Independent float64 Moller-Trumbore finite-edge/triangle calculation; 1e-10 inclusive barycentric tolerance; strict interiors >1e-8; robust span criterion >0.1 micrometre. Native float32 vertex quantization remains part of the actual asset.",
    "scope": "Ten nominated collar pairs only; not a new whole-shell or acceptance audit",
    "pairs": rows,
    "properCrossings": sum(row["classification"].startswith("proper") for row in rows),
    "otherContacts": sum(not row["classification"].startswith("proper") for row in rows),
}
evaluated.to_mesh_clear()
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"pairs": len(rows), "properCrossings": report["properCrossings"], "otherContacts": report["otherContacts"], "minSpanM": min(row["intersectionSpanM"] for row in rows), "maxSpanM": max(row["intersectionSpanM"] for row in rows)}), flush=True)

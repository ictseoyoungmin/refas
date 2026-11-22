"""Small, read-only observations for an evaluated Blender mesh and an attachment.

Call from ordinary ``bpy`` authoring scripts and write the returned JSON under
``REFAS_OUTPUT_DIR`` when the observation should travel with a production revision.
``meters_per_unit`` is required: never infer metric scale from an asset's name.
An open boundary, disconnected ornament or negative closed shell is an observation,
not a defect verdict. Intentional openings and cavity surfaces need interpretation.
These functions do not decide resemblance, deformation quality or game readiness.
"""
from __future__ import annotations

from collections import defaultdict
import math


def _finite(value, name, *, positive=False, nonnegative=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(name + " must be a finite number")
    value = float(value)
    if not math.isfinite(value) or (positive and value <= 0) or (nonnegative and value < 0):
        raise ValueError(name + " is outside its supported range")
    return value


def _details(rows, limit):
    return {"count": len(rows), "items": rows[:limit], "truncated": len(rows) > limit}


def _graph(depsgraph):
    if depsgraph is None:
        import bpy
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
    return depsgraph


def _surface(obj, depsgraph, meters_per_unit):
    """Copy evaluated world coordinates, without changing the source datablock."""
    if getattr(obj, "type", None) != "MESH":
        raise TypeError("mesh audit requires a Blender MESH object")
    if getattr(obj, "instance_type", "NONE") != "NONE":
        raise ValueError("realize object instances before auditing a mesh")
    for instance in depsgraph.object_instances:
        parent = instance.parent
        if instance.is_instance and parent is not None and parent.original == obj.original:
            raise ValueError("realize evaluated instances before auditing " + obj.name)
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        matrix = evaluated.matrix_world.copy()
        determinant = float(matrix.to_3x3().determinant())
        if not math.isfinite(determinant):
            raise ValueError("mesh transform is non-finite")
        vertices = [tuple(float(x) * meters_per_unit for x in matrix @ v.co)
                    for v in mesh.vertices]
        if any(not math.isfinite(x) for p in vertices for x in p):
            raise ValueError("mesh has non-finite world coordinates")
        mesh.calc_loop_triangles()
        return {"vertices": vertices,
                "edges": [tuple(e.vertices) for e in mesh.edges],
                "faces": [tuple(p.vertices) for p in mesh.polygons],
                "triangles": [(tuple(t.vertices), t.polygon_index) for t in mesh.loop_triangles],
                "determinant": determinant}
    finally:
        evaluated.to_mesh_clear()


def _bounds(points):
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    diagonal = math.sqrt(sum((high[i] - low[i]) ** 2 for i in range(3)))
    return low, high, diagonal


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _minus(a, b):
    return tuple(a[i] - b[i] for i in range(3))


def audit_mesh(obj, *, depsgraph=None, meters_per_unit, length_tolerance_m=None,
               relative_tolerance=1e-7, max_details=24):
    """Observe index connectivity, winding and component volumes at this frame.

    Distances and volumes are measured in world metres. The default length
    tolerance is evaluated world-bounds diagonal * relative_tolerance, with a
    1e-12 m floor; triangle area tolerance is its square. Details are bounded,
    counts are complete. ``nonManifoldEdges`` means edges with >2 incident faces;
    boundary edges and wire edges have their own counts.

    A reflected object reverses raw world winding. Component orientation uses
    world signed volume multiplied by the determinant sign, so a negative object
    scale alone is not reported as an inward-authored shell. Both volumes and the
    determinant are retained. Volume orientation is indeterminate for open,
    inconsistently wound, degenerate or singularly transformed components.
    Nested cavity shells may intentionally have negative orientation.
    """
    meters_per_unit = _finite(meters_per_unit, "meters_per_unit", positive=True)
    relative_tolerance = _finite(relative_tolerance, "relative_tolerance", positive=True)
    if isinstance(max_details, bool) or not isinstance(max_details, int) or not 1 <= max_details <= 1000:
        raise ValueError("max_details must be an integer from 1 to 1000")
    if length_tolerance_m is not None:
        length_tolerance_m = _finite(length_tolerance_m, "length_tolerance_m", positive=True)
    depsgraph = _graph(depsgraph)
    data = _surface(obj, depsgraph, meters_per_unit)
    points, edges, faces, triangles = (data[k] for k in ("vertices", "edges", "faces", "triangles"))
    low, high, diagonal = _bounds(points) if points else (None, None, 0.0)
    tolerance = length_tolerance_m if length_tolerance_m is not None else max(1e-12, diagonal * relative_tolerance)
    area_tolerance = tolerance ** 2
    parent = list(range(len(points)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a, b):
        a, b = root(a), root(b)
        if a != b:
            parent[max(a, b)] = min(a, b)

    vertex_degree = [0] * len(points)
    incidence = defaultdict(list)
    for a, b in edges:
        union(a, b)
        vertex_degree[a] += 1
        vertex_degree[b] += 1
    for face_index, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            union(a, b)
            incidence[tuple(sorted((a, b)))].append((face_index, 1 if a < b else -1))
    component_vertices = defaultdict(list)
    for index in range(len(points)):
        component_vertices[root(index)].append(index)
    ordered_roots = sorted(component_vertices)
    component_ids = {value: index for index, value in enumerate(ordered_roots)}
    components = []
    for value in ordered_roots:
        indices = component_vertices[value]
        c_low, c_high, c_diagonal = _bounds([points[i] for i in indices])
        components.append({"index": component_ids[value], "firstVertex": indices[0],
                           "vertices": len(indices), "edges": 0, "faces": 0, "triangles": 0,
                           "boundaryEdges": 0, "wireEdges": 0, "nonManifoldEdges": 0,
                           "inconsistentWindingEdges": 0, "degenerateTriangles": 0,
                           "boundsM": {"min": c_low, "max": c_high},
                           "originM": [(c_low[i] + c_high[i]) / 2 for i in range(3)],
                           "volumeToleranceM3": max(tolerance ** 3, c_diagonal ** 3 * 1e-12),
                           "worldSignedVolumeM3": 0.0})
    boundary, wire, nonmanifold, inconsistent = [], [], [], []
    boundary_adjacency = defaultdict(list)
    for edge_index, (a, b) in enumerate(edges):
        component = components[component_ids[root(a)]]
        component["edges"] += 1
        uses = incidence[tuple(sorted((a, b)))]
        row = {"edge": edge_index, "vertices": [a, b], "pointsM": [points[a], points[b]],
               "incidentFaces": [u[0] for u in uses]}
        if len(uses) == 0:
            wire.append(row)
            component["wireEdges"] += 1
        elif len(uses) == 1:
            boundary.append(row)
            component["boundaryEdges"] += 1
            boundary_adjacency[a].append(b)
            boundary_adjacency[b].append(a)
        elif len(uses) > 2:
            nonmanifold.append(row)
            component["nonManifoldEdges"] += 1
        elif uses[0][1] == uses[1][1]:
            inconsistent.append(row)
            component["inconsistentWindingEdges"] += 1
    for face in faces:
        if face:
            components[component_ids[root(face[0])]]["faces"] += 1
    degenerate = []
    for triangle_index, (indices, polygon_index) in enumerate(triangles):
        component = components[component_ids[root(indices[0])]]
        component["triangles"] += 1
        a, b, c = [points[i] for i in indices]
        cross = _cross(_minus(b, a), _minus(c, a))
        area = math.sqrt(sum(x * x for x in cross)) / 2
        if area <= area_tolerance:
            degenerate.append({"triangle": triangle_index, "polygon": polygon_index,
                               "vertices": list(indices), "areaM2": area, "pointsM": [a, b, c]})
            component["degenerateTriangles"] += 1
        origin = component["originM"]
        a, b, c = (_minus(p, origin) for p in (a, b, c))
        component["worldSignedVolumeM3"] += sum(x * y for x, y in zip(a, _cross(b, c))) / 6
    parity = 1 if data["determinant"] > 0 else -1 if data["determinant"] < 0 else 0
    for component in components:
        component.pop("originM")
        component["closedSurface"] = bool(component["faces"] and not any(component[k] for k in
            ("boundaryEdges", "wireEdges", "nonManifoldEdges")))
        reliable = component["closedSurface"] and not component["inconsistentWindingEdges"] \
            and not component["degenerateTriangles"] and parity != 0
        volume = component["worldSignedVolumeM3"] * parity
        component["orientationAdjustedVolumeM3"] = volume if parity else None
        component["orientation"] = ("positive" if volume > component["volumeToleranceM3"] else
                                     "negative" if volume < -component["volumeToleranceM3"] else "near-zero") \
            if reliable else "indeterminate"
    boundary_groups = []
    unseen = set(boundary_adjacency)
    while unseen:
        start = min(unseen)
        visited, pending = set(), [start]
        while pending:
            vertex = pending.pop()
            if vertex in visited:
                continue
            visited.add(vertex)
            pending.extend(boundary_adjacency[vertex])
        unseen.difference_update(visited)
        indices = sorted(visited)
        boundary_groups.append({"vertices": len(indices),
                                "edges": sum(len(boundary_adjacency[i]) for i in indices) // 2,
                                "closedLoop": all(len(boundary_adjacency[i]) == 2 for i in indices),
                                "vertexSamples": indices[:max_details],
                                "pointsM": [points[i] for i in indices[:max_details]],
                                "samplesTruncated": len(indices) > max_details})
    loose_vertices = [{"vertex": i, "pointM": points[i]} for i, degree in enumerate(vertex_degree) if degree == 0]
    negative = [c for c in components if c["orientation"] == "negative"]
    return {"schema": "refas.mesh-observations/v1", "object": obj.name,
            "scope": "current evaluated mesh; index connectivity; no self-intersection or semantic readiness verdict",
            "metersPerUnit": meters_per_unit, "lengthToleranceM": tolerance,
            "areaToleranceM2": area_tolerance, "matrixDeterminant": data["determinant"],
            "reflectedTransform": parity < 0, "singularTransform": parity == 0,
            "boundsM": {"min": low, "max": high},
            "statistics": {"vertices": len(points), "edges": len(edges), "polygons": len(faces),
                           "triangles": len(triangles), "components": len(components),
                           "boundaryEdges": len(boundary), "boundaryGroups": len(boundary_groups),
                           "closedBoundaryLoops": sum(g["closedLoop"] for g in boundary_groups),
                           "wireEdges": len(wire), "looseVertices": len(loose_vertices),
                           "nonManifoldEdges": len(nonmanifold), "inconsistentWindingEdges": len(inconsistent),
                           "degenerateTriangles": len(degenerate), "negativeClosedComponents": len(negative),
                           "nearZeroClosedComponents": sum(c["orientation"] == "near-zero" for c in components)},
            "boundaryEdges": _details(boundary, max_details), "boundaryGroups": _details(boundary_groups, max_details),
            "wireEdges": _details(wire, max_details), "looseVertices": _details(loose_vertices, max_details),
            "nonManifoldEdges": _details(nonmanifold, max_details),
            "inconsistentWindingEdges": _details(inconsistent, max_details),
            "degenerateTriangles": _details(degenerate, max_details),
            "components": _details(components, max_details), "negativeClosedComponents": _details(negative, max_details),
            "limitations": ["Boundary and disconnected-component observations require intended-opening and attachment context.",
                            "Negative component orientation may be intentional for a cavity; no automatic repair is applied.",
                            "No self-intersection, body penetration, animation-range, visual-likeness or game-readiness decision is made."]}


def anchor_gap(anchor_obj, target_obj, *, max_gap_m, meters_per_unit,
               anchor_local=(0, 0, 0), depsgraph=None):
    """Measure one explicitly chosen local anchor against a target mesh surface.

    This unsigned nearest-triangle distance is not a penetration, contact-area,
    linkage or parenting proof. Repeat at required frames/anchors and interpret
    the declared tolerance for the actual attachment. No scene-wide pair scan.
    """
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    meters_per_unit = _finite(meters_per_unit, "meters_per_unit", positive=True)
    max_gap_m = _finite(max_gap_m, "max_gap_m", nonnegative=True)
    if not isinstance(anchor_local, (tuple, list)) or len(anchor_local) != 3:
        raise ValueError("anchor_local must contain three finite local coordinates")
    local = Vector([_finite(x, "anchor_local") for x in anchor_local])
    if not hasattr(anchor_obj, "evaluated_get"):
        raise TypeError("anchor_obj must be a Blender object")
    depsgraph = _graph(depsgraph)
    anchor = anchor_obj.evaluated_get(depsgraph).matrix_world @ local
    anchor = Vector([_finite(float(x) * meters_per_unit, "anchor world coordinate") for x in anchor])
    data = _surface(target_obj, depsgraph, meters_per_unit)
    if not data["triangles"]:
        raise ValueError("attachment target has no evaluated surface triangles")
    _, _, diagonal = _bounds(data["vertices"])
    area_tolerance = max(diagonal * 1e-7, 1e-12) ** 2
    usable = []
    for triangle_index, (indices, _) in enumerate(data["triangles"]):
        a, b, c = [data["vertices"][i] for i in indices]
        cross = _cross(_minus(b, a), _minus(c, a))
        if math.sqrt(sum(x * x for x in cross)) / 2 > area_tolerance:
            usable.append((triangle_index, indices))
    if not usable:
        raise ValueError("attachment target contains only degenerate surface triangles")
    triangles = [indices for _, indices in usable]
    tree = BVHTree.FromPolygons(data["vertices"], triangles, all_triangles=True)
    location, normal, index, distance = tree.find_nearest(anchor)
    if location is None or distance is None or not math.isfinite(distance):
        raise ValueError("attachment target has no usable nearest surface")
    return {"schema": "refas.anchor-gap/v1", "anchorObject": anchor_obj.name,
            "targetObject": target_obj.name, "anchorLocal": list(anchor_local),
            "anchorWorldM": list(anchor), "nearestSurfaceM": list(location),
            "targetTriangle": usable[index][0], "distanceM": float(distance),
            "maximumGapM": max_gap_m, "withinDeclaredGap": distance <= max_gap_m,
            "areaToleranceM2": area_tolerance,
            "excludedDegenerateTriangles": len(data["triangles"]) - len(usable),
            "metersPerUnit": meters_per_unit,
            "scope": "one explicit anchor to evaluated surface; unsigned distance; no attachment or collision verdict"}

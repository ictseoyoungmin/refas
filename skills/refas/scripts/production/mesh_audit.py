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


def _dot(a, b):
    return math.fsum(x * y for x, y in zip(a, b))


def _matrix(obj, depsgraph):
    rows = [tuple(float(x) for x in row) for row in obj.evaluated_get(depsgraph).matrix_world]
    if any(not math.isfinite(x) for row in rows for x in row):
        raise ValueError("object transform is non-finite")
    return rows


def _world(point, origin):
    return [math.fsum((point[i], origin[i])) for i in range(3)]


def _surface(obj, depsgraph, meters_per_unit):
    """Copy evaluated geometry into a nearby metric frame using Python doubles.

    Do not use ``matrix @ co``: mathutils first rounds the translated result to
    float32, losing small geometry long before later float conversion/rebasing.
    World coordinates below are reporting values, never calculation inputs.
    """
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
        matrix = _matrix(obj, depsgraph)
        determinant = _dot(matrix[0][:3], _cross(matrix[1][:3], matrix[2][:3]))
        local = [tuple(float(x) for x in v.co) for v in mesh.vertices]
        if any(not math.isfinite(x) for p in local for x in p):
            raise ValueError("mesh has non-finite local coordinates")
        low, high, _ = _bounds(local) if local else ([0]*3, [0]*3, 0)
        center = [math.fsum((low[i]/2, high[i]/2)) for i in range(3)]
        origin = [math.fsum((matrix[i][3], _dot(matrix[i][:3], center))) * meters_per_unit
                  for i in range(3)]
        vertices, error_bound = [], 0.0
        for point in local:
            offset = _minus(point, center)
            vertices.append(tuple(_dot(row[:3], offset) * meters_per_unit for row in matrix[:3]))
            error_bound = max(error_bound, *(math.fsum(abs(row[i] * offset[i]) for i in range(3))
                                            * meters_per_unit * 2**-48 for row in matrix[:3]))
        if any(not math.isfinite(x) for p in vertices for x in p) \
                or any(not math.isfinite(x) for x in origin) or not math.isfinite(determinant):
            raise ValueError("mesh has non-finite world coordinates")
        mesh.calc_loop_triangles()
        return {"vertices": vertices,
                "edges": [tuple(e.vertices) for e in mesh.edges],
                "faces": [tuple(p.vertices) for p in mesh.polygons],
                "triangles": [(tuple(t.vertices), t.polygon_index) for t in mesh.loop_triangles],
                "determinant": determinant, "originM": origin,
                "matrix": matrix, "localOrigin": center,
                "calculationErrorBoundM": error_bound}
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


def _disjoint(size):
    parent = list(range(size))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a, b):
        a, b = root(a), root(b)
        if a != b:
            parent[max(a, b)] = min(a, b)

    return root, union


def audit_mesh(obj, *, depsgraph=None, meters_per_unit, length_tolerance_m=None,
               relative_tolerance=1e-7, max_details=24):
    """Observe index connectivity, face-connected surfaces and winding.

    Distances and volumes are measured in world metres. The default length
    tolerance is evaluated world-bounds diagonal * relative_tolerance, with a
    1e-12 m floor; triangle area tolerance is its square. Details are bounded,
    counts are complete. ``components`` uses vertex/edge index connectivity;
    ``surfaceComponents`` connects faces through shared edges, excluding wire
    edges. Closed-surface orientation counts use the latter so a shared vertex
    or wire cannot cancel an inward shell. Disconnected face fans at a vertex
    are explicit nonmanifold-vertex observations. ``nonManifoldEdges`` counts
    edges with >2 incident faces; boundary and wire edges have separate counts.

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
    if tolerance < data["calculationErrorBoundM"]:
        raise ValueError("requested length tolerance is below the supported calculation precision")
    area_tolerance = tolerance ** 2
    root, union = _disjoint(len(points))
    face_root, face_union = _disjoint(len(faces))
    vertex_degree = [0] * len(points)
    vertex_faces = defaultdict(set)
    incidence = defaultdict(list)
    for a, b in edges:
        union(a, b)
        vertex_degree[a] += 1
        vertex_degree[b] += 1
    for face_index, face in enumerate(faces):
        for vertex in face:
            vertex_faces[vertex].add(face_index)
        for a, b in zip(face, face[1:] + face[:1]):
            union(a, b)
            incidence[tuple(sorted((a, b)))].append((face_index, 1 if a < b else -1))
    component_vertices = defaultdict(list)
    for index in range(len(points)):
        component_vertices[root(index)].append(index)
    ordered_roots = sorted(component_vertices)
    component_ids = {value: index for index, value in enumerate(ordered_roots)}

    def new_component(index, indices, connectivity):
        c_low, c_high, c_diagonal = _bounds([points[i] for i in indices])
        return {"index": index, "connectivity": connectivity, "firstVertex": indices[0],
                "vertices": len(indices), "edges": 0, "faces": 0, "triangles": 0,
                "boundaryEdges": 0, "wireEdges": 0, "nonManifoldEdges": 0,
                "nonManifoldVertices": 0, "sharedSingularVertices": 0,
                "inconsistentWindingEdges": 0, "degenerateTriangles": 0,
                "boundsM": {"min": _world(c_low, data["originM"]), "max": _world(c_high, data["originM"])},
                "originM": [(c_low[i] + c_high[i]) / 2 for i in range(3)],
                "volumeToleranceM3": max(tolerance ** 3, c_diagonal ** 3 * 1e-12),
                "worldSignedVolumeM3": 0.0}

    components = []
    for value in ordered_roots:
        indices = component_vertices[value]
        components.append(new_component(component_ids[value], indices, "vertex-and-edge-index"))
    for uses in incidence.values():
        for face_index, _ in uses[1:]:
            face_union(uses[0][0], face_index)
    surface_faces = defaultdict(list)
    for face_index in range(len(faces)):
        surface_faces[face_root(face_index)].append(face_index)
    surface_ids = {value: index for index, value in enumerate(sorted(surface_faces))}
    surface_components = []
    for value in sorted(surface_faces):
        face_indices = surface_faces[value]
        indices = sorted({v for f in face_indices for v in faces[f]})
        component = new_component(surface_ids[value], indices, "faces-through-shared-edges")
        component["faces"] = len(face_indices)
        surface_components.append(component)
    boundary, wire, nonmanifold, inconsistent = [], [], [], []
    boundary_adjacency = defaultdict(list)
    vertex_edges = defaultdict(list)
    for edge_index, (a, b) in enumerate(edges):
        component = components[component_ids[root(a)]]
        uses = incidence[tuple(sorted((a, b)))]
        vertex_edges[a].append(uses)
        vertex_edges[b].append(uses)
        records = [component] + [surface_components[i] for i in sorted({surface_ids[face_root(f)] for f, _ in uses})]
        for record in records:
            record["edges"] += 1
        row = {"edge": edge_index, "vertices": [a, b],
               "pointsM": [_world(points[a], data["originM"]), _world(points[b], data["originM"])],
               "incidentFaces": [u[0] for u in uses]}
        if len(uses) == 0:
            wire.append(row)
            for record in records:
                record["wireEdges"] += 1
        elif len(uses) == 1:
            boundary.append(row)
            for record in records:
                record["boundaryEdges"] += 1
            boundary_adjacency[a].append(b)
            boundary_adjacency[b].append(a)
        elif len(uses) > 2:
            nonmanifold.append(row)
            for record in records:
                record["nonManifoldEdges"] += 1
        elif uses[0][1] == uses[1][1]:
            inconsistent.append(row)
            for record in records:
                record["inconsistentWindingEdges"] += 1
    singular_vertices = []
    for vertex in sorted(vertex_faces):
        adjacent = {face: set() for face in vertex_faces[vertex]}
        for uses in vertex_edges[vertex]:
            for face, _ in uses[1:]:
                adjacent[uses[0][0]].add(face)
                adjacent[face].add(uses[0][0])
        unseen, fans = set(adjacent), []
        while unseen:
            pending, visited = [min(unseen)], set()
            while pending:
                face = pending.pop()
                if face not in visited:
                    visited.add(face)
                    pending.extend(adjacent[face])
            unseen.difference_update(visited)
            fans.append(sorted(visited))
        boundary_degree = sum(len(uses) == 1 for uses in vertex_edges[vertex])
        wire_degree = sum(len(uses) == 0 for uses in vertex_edges[vertex])
        overfull = any(len(uses) > 2 for uses in vertex_edges[vertex])
        if len(fans) > 1 or overfull or wire_degree or boundary_degree not in (0, 2):
            singular_vertices.append({"vertex": vertex, "pointM": _world(points[vertex], data["originM"]),
                                      "faceFans": len(fans), "fanFaceSamples": [f[:max_details] for f in fans[:max_details]],
                                      "fanSamplesTruncated": len(fans) > max_details or any(len(f) > max_details for f in fans),
                                      "boundaryDegree": boundary_degree, "wireDegree": wire_degree,
                                      "overfullEdge": overfull})
            components[component_ids[root(vertex)]]["nonManifoldVertices"] += 1
            ids = {surface_ids[face_root(f)] for f in adjacent}
            for index in ids:
                component = surface_components[index]
                component["sharedSingularVertices"] += 1
                fan_count = sum(any(surface_ids[face_root(f)] == index for f in fan) for fan in fans)
                own_edges = [uses for uses in vertex_edges[vertex]
                             if uses and surface_ids[face_root(uses[0][0])] == index]
                own_boundary = sum(len(uses) == 1 for uses in own_edges)
                if fan_count > 1 or any(len(uses) > 2 for uses in own_edges) or own_boundary not in (0, 2):
                    component["nonManifoldVertices"] += 1
    for face in faces:
        if face:
            components[component_ids[root(face[0])]]["faces"] += 1
    degenerate = []
    for triangle_index, (indices, polygon_index) in enumerate(triangles):
        records = [components[component_ids[root(indices[0])]], surface_components[surface_ids[face_root(polygon_index)]]]
        for component in records:
            component["triangles"] += 1
        a, b, c = [points[i] for i in indices]
        cross = _cross(_minus(b, a), _minus(c, a))
        area = math.sqrt(sum(x * x for x in cross)) / 2
        if area <= area_tolerance:
            degenerate.append({"triangle": triangle_index, "polygon": polygon_index,
                               "vertices": list(indices), "areaM2": area,
                               "pointsM": [_world(p, data["originM"]) for p in (a, b, c)]})
            for component in records:
                component["degenerateTriangles"] += 1
        for component in records:
            origin = component["originM"]
            ca, cb, cc = (_minus(p, origin) for p in (a, b, c))
            component["worldSignedVolumeM3"] += _dot(ca, _cross(cb, cc)) / 6
    parity = 1 if data["determinant"] > 0 else -1 if data["determinant"] < 0 else 0
    for component in components + surface_components:
        component.pop("originM")
        component["closedSurface"] = bool(component["faces"] and not any(component[k] for k in
            ("boundaryEdges", "wireEdges", "nonManifoldEdges", "nonManifoldVertices")))
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
                                "pointsM": [_world(points[i], data["originM"]) for i in indices[:max_details]],
                                "samplesTruncated": len(indices) > max_details})
    loose_vertices = [{"vertex": i, "pointM": _world(points[i], data["originM"])}
                      for i, degree in enumerate(vertex_degree) if degree == 0]
    negative = [c for c in surface_components if c["orientation"] == "negative"]
    return {"schema": "refas.mesh-observations/v1", "object": obj.name,
            "scope": "current evaluated mesh; index and face-edge connectivity; no self-intersection or semantic readiness verdict",
            "metersPerUnit": meters_per_unit, "lengthToleranceM": tolerance,
            "areaToleranceM2": area_tolerance, "matrixDeterminant": data["determinant"],
            "reflectedTransform": parity < 0, "singularTransform": parity == 0,
            "boundsM": {"min": _world(low, data["originM"]) if low is not None else None,
                        "max": _world(high, data["originM"]) if high is not None else None},
            "calculationFrameOriginM": data["originM"], "boundsDiagonalM": diagonal,
            "calculationErrorBoundM": data["calculationErrorBoundM"],
            "calculation": "Python float64 affine offsets before world translation; world coordinates are reporting values",
            "statistics": {"vertices": len(points), "edges": len(edges), "polygons": len(faces),
                           "triangles": len(triangles), "components": len(components),
                           "surfaceComponents": len(surface_components), "nonManifoldVertices": len(singular_vertices),
                           "boundaryEdges": len(boundary), "boundaryGroups": len(boundary_groups),
                           "closedBoundaryLoops": sum(g["closedLoop"] for g in boundary_groups),
                           "wireEdges": len(wire), "looseVertices": len(loose_vertices),
                           "nonManifoldEdges": len(nonmanifold), "inconsistentWindingEdges": len(inconsistent),
                           "degenerateTriangles": len(degenerate), "negativeClosedComponents": len(negative),
                           "nearZeroClosedComponents": sum(c["orientation"] == "near-zero" for c in surface_components)},
            "boundaryEdges": _details(boundary, max_details), "boundaryGroups": _details(boundary_groups, max_details),
            "wireEdges": _details(wire, max_details), "looseVertices": _details(loose_vertices, max_details),
            "nonManifoldEdges": _details(nonmanifold, max_details),
            "nonManifoldVertices": _details(singular_vertices, max_details),
            "inconsistentWindingEdges": _details(inconsistent, max_details),
            "degenerateTriangles": _details(degenerate, max_details),
            "components": _details(components, max_details), "surfaceComponents": _details(surface_components, max_details),
            "negativeClosedComponents": _details(negative, max_details),
            "limitations": ["Boundary and disconnected-component observations require intended-opening and attachment context.",
                            "Negative component orientation may be intentional for a cavity; no automatic repair is applied.",
                            "No self-intersection, body penetration, animation-range, visual-likeness or game-readiness decision is made."]}


def _closest_triangle(point, a, b, c, normal):
    """Double-precision closest point, using the plane interior and three edges."""
    candidates = []
    for start, end in ((a, b), (b, c), (c, a)):
        edge = _minus(end, start)
        denominator = _dot(edge, edge)
        fraction = max(0.0, min(1.0, _dot(_minus(point, start), edge) / denominator)) if denominator else 0.0
        candidates.append(tuple(start[i] + fraction * edge[i] for i in range(3)))
    offset = _dot(_minus(point, a), normal) / _dot(normal, normal)
    projection = tuple(point[i] - offset * normal[i] for i in range(3))
    if all(_dot(_cross(_minus(end, start), _minus(projection, start)), normal) >= 0
           for start, end in ((a, b), (b, c), (c, a))):
        candidates.append(projection)
    return min(candidates, key=lambda q: _dot(_minus(q, point), _minus(q, point)))


def anchor_gap(anchor_obj, target_obj, *, max_gap_m, meters_per_unit,
               anchor_local=(0, 0, 0), depsgraph=None):
    """Measure one fixed object-local anchor against an evaluated mesh surface.

    This unsigned nearest-triangle distance is not a penetration, contact-area,
    linkage or parenting proof. Repeat at required frames/anchors and interpret
    the declared tolerance for the actual attachment. ``anchor_local`` follows
    the evaluated object transform, NOT mesh skinning, shape keys or modifiers.
    Use a transform-driven anchor tied to the real attachment; evaluating a point
    on a deformed surface is a different operation. There is no scene-wide scan.

    All calculations use Python doubles in the target's nearby frame, avoiding
    float32 absolute-world/BVH rounding. A conservative arithmetic error interval
    straddling the requested maximum returns ``withinDeclaredGap=None`` and
    ``gapStatus='indeterminate'``, never a false passing threshold. Stored mesh
    and evaluated transform precision cannot recover already-lost source data.
    """
    meters_per_unit = _finite(meters_per_unit, "meters_per_unit", positive=True)
    max_gap_m = _finite(max_gap_m, "max_gap_m", nonnegative=True)
    if not isinstance(anchor_local, (tuple, list)) or len(anchor_local) != 3:
        raise ValueError("anchor_local must contain three finite local coordinates")
    local = tuple(_finite(x, "anchor_local") for x in anchor_local)
    if not hasattr(anchor_obj, "evaluated_get"):
        raise TypeError("anchor_obj must be a Blender object")
    depsgraph = _graph(depsgraph)
    anchor_matrix = _matrix(anchor_obj, depsgraph)
    data = _surface(target_obj, depsgraph, meters_per_unit)
    if not data["triangles"]:
        raise ValueError("attachment target has no evaluated surface triangles")
    _, _, diagonal = _bounds(data["vertices"])
    area_tolerance = max(diagonal * 1e-7, 1e-12) ** 2
    anchor, error_bound = [], data["calculationErrorBoundM"]
    for i in range(3):
        # Subtract translations BEFORE adding the small local offsets.
        terms = [anchor_matrix[i][3] - data["matrix"][i][3]]
        terms += [anchor_matrix[i][j] * local[j] for j in range(3)]
        terms += [-data["matrix"][i][j] * data["localOrigin"][j] for j in range(3)]
        anchor.append(_finite(math.fsum(terms) * meters_per_unit, "rebased anchor coordinate"))
        error_bound += math.fsum(abs(x) for x in terms) * meters_per_unit * 2**-48
    nearest, nearest_index, best_squared = None, None, math.inf
    usable_count = 0
    for triangle_index, (indices, _) in enumerate(data["triangles"]):
        a, b, c = [data["vertices"][i] for i in indices]
        cross = _cross(_minus(b, a), _minus(c, a))
        if math.sqrt(sum(x * x for x in cross)) / 2 > area_tolerance:
            usable_count += 1
            lower_squared = math.fsum(max(min(a[i], b[i], c[i]) - anchor[i], 0,
                                          anchor[i] - max(a[i], b[i], c[i])) ** 2 for i in range(3))
            # Conservative arithmetic margin affects pruning only, not acceptance.
            if lower_squared > best_squared + (2 * math.sqrt(best_squared) + error_bound) * error_bound:
                continue
            candidate = _closest_triangle(anchor, a, b, c, cross)
            delta = _minus(candidate, anchor)
            squared = _dot(delta, delta)
            if squared < best_squared:
                nearest, nearest_index, best_squared = candidate, triangle_index, squared
    if not usable_count:
        raise ValueError("attachment target contains only degenerate surface triangles")
    distance = math.sqrt(best_squared)
    if nearest is None or not math.isfinite(distance):
        raise ValueError("attachment target has no usable nearest surface")
    error_bound += max(diagonal, distance, max(abs(x) for x in anchor)) * 2**-46
    low, high = max(0.0, distance - error_bound), distance + error_bound
    within = True if high <= max_gap_m else False if low > max_gap_m else None
    return {"schema": "refas.anchor-gap/v1", "anchorObject": anchor_obj.name,
            "targetObject": target_obj.name, "anchorLocal": list(anchor_local),
            "anchorBinding": "fixed-object-local; transform only; no mesh deformation",
            "anchorWorldM": _world(anchor, data["originM"]),
            "nearestSurfaceM": _world(nearest, data["originM"]),
            "calculationFrameOriginM": data["originM"], "calculationErrorBoundM": error_bound,
            "distanceIntervalM": [low, high],
            "targetTriangle": nearest_index, "distanceM": distance,
            "maximumGapM": max_gap_m, "withinDeclaredGap": within,
            "gapStatus": "indeterminate" if within is None else "within-declared-gap" if within else "exceeds-declared-gap",
            "areaToleranceM2": area_tolerance,
            "excludedDegenerateTriangles": len(data["triangles"]) - usable_count,
            "metersPerUnit": meters_per_unit,
            "scope": "one explicit anchor to evaluated surface; unsigned distance; no attachment or collision verdict"}

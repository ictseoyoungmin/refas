"""Create or revise one named blind prismatic recess in a static solid host.

The retained Exact Boolean/cutter is editable native construction geometry.
Depth is measured from the host with this feature alone disabled. Floor and
wall bounds concern the documented samples, not global minimum thickness.
"""
from __future__ import annotations

import math

from surface_mount import _frame, _mesh_object, _number, _surface


def _pair(value, label):
    try:
        values = tuple(value)
    except TypeError as exc:
        raise ValueError(label + " must have two finite coordinates") from exc
    if len(values) != 2:
        raise ValueError(label + " must have two finite coordinates")
    return tuple(_number(v, label) for v in values)


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _outline(values):
    try:
        points = [_pair(v, "outline point") for v in values]
    except TypeError as exc:
        raise ValueError("outline must contain a convex 2D polygon") from exc
    if len(points) < 3 or len(points) > 256:
        raise ValueError("outline requires 3 to 256 distinct convex vertices")
    size = max(max(p[i] for p in points) - min(p[i] for p in points) for i in range(2))
    if not math.isfinite(size) or size == 0:
        raise ValueError("outline must have finite area")
    epsilon = size * size * 1e-10
    area = sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(points, points[1:] + points[:1]))
    if not math.isfinite(area) or abs(area) <= epsilon:
        raise ValueError("outline must have finite nonzero area")
    if area < 0:
        points.reverse()
    edges = list(zip(points, points[1:] + points[:1]))
    # All other vertices must be strictly on the inner side of every edge.
    # This rejects crossed/star orderings as well as concavity and duplicates.
    for i, (a, b) in enumerate(edges):
        if any(_cross(a, b, p) <= epsilon for j, p in enumerate(points)
               if j not in (i, (i + 1) % len(points))):
            raise ValueError("outline must be simple and strictly convex, without repeated or collinear vertices")
        if _cross(a, b, (0, 0)) <= epsilon:
            raise ValueError("outline must enclose the selected frame origin")
    return points, edges, epsilon


def _closed(host):
    import bpy
    import bmesh
    evaluated = host.evaluated_get(bpy.context.evaluated_depsgraph_get())
    if not evaluated.is_evaluated:
        raise ValueError("host must be enabled in the current view layer")
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        if (not bm.faces or any(not edge.is_manifold or not edge.is_contiguous for edge in bm.edges)
                or any(not vertex.is_manifold for vertex in bm.verts)):
            raise ValueError("recess host must be a consistently wound closed solid mesh")
    finally:
        bm.free()
        evaluated.to_mesh_clear()


def _exit_surface(host, normal):
    """First back-facing crossing, without stepping across a thin solid/void.

    Selection/numeric bounds remain owned by surface_mount. This directional
    triangle subset is needed because advancing a BVH ray past its entry hit
    by any fixed epsilon can silently skip an arbitrarily thin first shell.
    """
    import bpy
    from mathutils.bvhtree import BVHTree
    evaluated = host.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        linear = evaluated.matrix_world.to_3x3()
        vertices = [linear @ vertex.co for vertex in mesh.vertices]
        reflected = linear.determinant() < 0
        triangles = [tuple(reversed(t.vertices)) if reflected else tuple(t.vertices)
                     for t in mesh.loop_triangles]
        triangles = [t for t in triangles if
                     (vertices[t[1]] - vertices[t[0]]).cross(vertices[t[2]] - vertices[t[0]]).dot(normal) < 0]
        if not triangles:
            raise ValueError("host has no opposite-facing exit for the selected recess")
        return BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    finally:
        evaluated.to_mesh_clear()


def _feature(host, name):
    import bpy
    _mesh_object(host, "host")
    if (host.parent is not None or host.constraints or host.animation_data is not None
            or host.data.animation_data is not None or not host.is_editable
            or host.data.shape_keys is not None or host.rigid_body is not None):
        raise ValueError("recess host must be static and unparented, without constraints or shape keys")
    allowed = {'BOOLEAN', 'BEVEL', 'SOLIDIFY', 'SUBSURF', 'TRIANGULATE', 'WEIGHTED_NORMAL'}
    if any(m.type not in allowed or m.show_viewport != m.show_render for m in host.modifiers):
        raise ValueError("host has an unsupported or viewport/render-mismatched modifier")
    if not isinstance(name, str) or not name.strip() or len(name.encode('utf-8')) > 63:
        raise ValueError("feature name must contain 1 to 63 UTF-8 bytes")
    modifier = host.modifiers.get(name)
    if modifier is None:
        if any(o.get('refas_recess_host') == host.name and o.get('refas_recess_feature') == name
               for o in bpy.data.objects):
            raise ValueError("an orphaned cutter already records this feature; restore its modifier first")
        return None, None
    cutter = getattr(modifier, 'object', None)
    if (modifier != host.modifiers[-1] or modifier.type != 'BOOLEAN'
            or modifier.operation != 'DIFFERENCE' or modifier.solver != 'EXACT'
            or modifier.operand_type != 'OBJECT' or not modifier.show_viewport
            or cutter is None or cutter.type != 'MESH'
            or cutter.get('refas_recess_version') != 1
            or cutter.get('refas_recess_host') != host.name
            or cutter.get('refas_recess_feature') != name
            or cutter.get('refas_role') != 'construction' or not cutter.hide_render):
        raise ValueError("existing feature must be this host's enabled, last managed Exact Difference Boolean")
    _mesh_object(cutter, "cutter")
    if (cutter.parent is not None or cutter.constraints or cutter.modifiers or cutter.animation_data is not None
            or cutter.data.animation_data is not None or cutter.rigid_body is not None or not cutter.is_editable
            or cutter.data.shape_keys is not None or cutter.data.users != 1):
        raise ValueError("managed cutter must be unmodified and unshared before revision")
    # Object.users excludes Boolean references. Check actual ID consumers,
    # including a second Boolean on the same host, rather than counting links.
    pending, visited = [cutter], set()
    while pending:
        source = pending.pop()
        if source in visited:
            continue
        visited.add(source)
        for user in bpy.data.user_map(subset={source})[source]:
            if isinstance(user, bpy.types.Collection):
                pending.append(user)
            elif user != bpy.context.scene and not (source == cutter and user == host):
                raise ValueError("managed cutter or its collection has another consumer")
    if any(m != modifier and m.type == 'BOOLEAN' and m.object == cutter for m in host.modifiers):
        raise ValueError("managed cutter has another consumer; duplicate the feature before revision")
    if (cutter.delta_location.length != 0 or any(cutter.delta_rotation_euler)
            or tuple(cutter.delta_rotation_quaternion) != (1., 0., 0., 0.)
            or tuple(cutter.delta_scale) != (1., 1., 1.)):
        raise ValueError("apply cutter delta transforms before revision")
    if not cutter.evaluated_get(bpy.context.evaluated_depsgraph_get()).is_evaluated:
        raise ValueError("managed cutter must remain enabled in the current view layer")
    return modifier, cutter


def cut_recess(host, name, *, ray_origin, ray_direction, tangent, outline,
               depth, min_floor, min_wall, max_distance, floor_samples=()):
    """Create/revise an actual blind recess; retain the same cutter and Boolean.

    All distances use world Blender units. ``outline`` is a simple, strictly
    convex 2D polygon enclosing (0,0), in the selected tangent/bitangent frame.
    ``depth`` is absolute from the base hit, with only this feature disabled.
    The managed Boolean must remain last; other modifiers are never reordered.

    Base floor columns sample the origin, vertex centroid, vertices and edge
    midpoints, plus 90%-radius interior copies and optional ``floor_samples``.
    Additional samples must lie strictly inside the outline. Each column must
    have enough solid in its FIRST entry-to-exit interval. Side wall thickness
    is sampled at each edge midpoint at quarter, half and three-quarter depth.
    Actual Boolean floors are checked at the interior samples and side walls
    at those three depths. These finite samples do not certify global wall
    thickness, intersections, arbitrary curved grooves or cloth pocket design.

    Invalid or infeasible input leaves the prior mesh, cutter and modifier
    intact. Static local modifiers and prior Booleans are supported; parented,
    constrained, animated or shape-key hosts/cutters are not. Host changes
    invalidate old surface bindings. Re-run with the same name to revise.
    """
    import bpy
    from mathutils import Matrix, Vector
    bpy.context.view_layer.update()
    modifier, cutter = _feature(host, name)
    points, edges, area_epsilon = _outline(outline)
    depth, min_floor, min_wall, distance = (_number(v, label) for v, label in
        ((depth, 'depth'), (min_floor, 'min_floor'), (min_wall, 'min_wall'), (max_distance, 'max_distance')))
    if min(depth, min_floor, min_wall, distance) <= 0:
        raise ValueError("depth, min_floor, min_wall and max_distance must be positive")
    centroid = tuple(math.fsum(p[i] for p in points) / len(points) for i in range(2))
    mids = [tuple((a[i] + b[i]) / 2 for i in range(2)) for a, b in edges]
    inner = [(0., 0.), centroid] + [tuple(.9 * p[i] + .1 * centroid[i] for i in range(2))
                                   for p in points + mids]
    try:
        supplied_samples = [_pair(point, "floor sample") for point in floor_samples]
    except TypeError as exc:
        raise ValueError("floor_samples must contain 2D interior points") from exc
    for point in supplied_samples:
        if any(_cross(a, b, point) <= area_epsilon for a, b in edges):
            raise ValueError("additional floor samples must lie strictly inside outline")
        inner.append(point)
    inner = list(dict.fromkeys(inner))
    columns = list(dict.fromkeys(inner + points + mids))
    flags = (modifier.show_viewport, modifier.show_render) if modifier else None
    try:
        if modifier:
            modifier.show_viewport = modifier.show_render = False
        bpy.context.view_layer.update()
        _closed(host)
        base = _surface(host)
        frame = _frame(base, ray_origin, ray_direction, tangent, distance)
        exit_tree = _exit_surface(host, Vector(frame['normal']))
    finally:
        if modifier:
            modifier.show_viewport, modifier.show_render = flags
        bpy.context.view_layer.update()
    tree, offset, _, precision = base
    precision = max(precision, frame['tolerance'],
                    max(2 * distance, depth, *(abs(v) for p in points for v in p)) * 2 ** -20)
    tolerance = 8 * precision
    if min(depth, min_floor, min_wall) <= 4 * tolerance:
        raise ValueError("feature dimensions are below numerical precision; use a shorter ray or recenter the host")
    anchor = Vector(frame['position']) - offset
    u, v, normal = (Vector(frame[key]) for key in ('tangent', 'bitangent', 'normal'))

    def position(point, height=0):
        return anchor + u * point[0] + v * point[1] + normal * height

    def cast(bvh, origin, direction, length):
        hit, outward, _, _ = bvh.ray_cast(origin, direction, length)
        if hit is None or outward is None:
            raise ValueError("sample has no contiguous solid support within max_distance")
        if not all(math.isfinite(x) for vector in (hit, outward) for x in vector):
            raise ValueError("surface sample exceeds Blender's numeric range")
        return hit, outward

    entry_heights, floors = [], []
    for point in columns:
        entry, outward = cast(tree, position(point, distance), -normal, 2 * distance)
        if outward.dot(normal) < .5:
            raise ValueError("recess outline does not enter a compatible front surface")
        top = (entry - position(point)).dot(normal)
        if point == (0., 0.) and abs(top) > tolerance:
            raise ValueError("recess projection selected a different surface layer")
        exit_point, exit_normal = cast(exit_tree, position(point, distance), -normal, 2 * distance)
        if exit_normal.dot(normal) > -.5:
            raise ValueError("first solid interval has no compatible exit surface")
        bottom = (exit_point - position(point)).dot(normal)
        remaining = -depth - bottom
        if top - bottom <= tolerance or top + depth <= tolerance or remaining < min_floor + tolerance:
            raise ValueError("requested depth would breach the first solid floor interval")
        entry_heights.append(top)
        floors.append(remaining)
    walls = []
    wall_probes = []
    for (a, b), midpoint in zip(edges, mids):
        outward = (u * (b[1] - a[1]) - v * (b[0] - a[0])).normalized()
        for fraction in (.25, .5, .75):
            boundary = position(midpoint, -depth * fraction)
            wall_exit, wall_normal = cast(tree, boundary, outward, 2 * distance)
            remaining = (wall_exit - boundary).dot(outward)
            if wall_normal.dot(outward) < .5 or remaining < min_wall + tolerance:
                raise ValueError("requested outline would breach a sampled side wall")
            walls.append(remaining)
            wall_probes.append((midpoint, fraction, outward))
    cap = max(entry_heights) + max(depth * .1, 4 * tolerance)
    count = len(points)
    vertices = [(x, y, z) for z in (-depth, cap) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    candidate_mesh = bpy.data.meshes.new(name + ' CutterMesh')
    old_mesh = cutter.data if cutter else None
    old_matrix = cutter.matrix_world.copy() if cutter else None
    created_modifier = created_cutter = changed_cutter = False
    try:
        candidate_mesh.from_pydata(vertices, [], faces)
        candidate_mesh.update()
        matrix = Matrix((u, v, normal)).transposed().to_4x4()
        matrix.translation = anchor + offset
        # Validate actual float realization before changing a scene object.
        for vertex, (x, y, z) in zip(candidate_mesh.vertices, vertices):
            realized = matrix @ vertex.co - offset
            error = (realized - position((x, y), z)).length
            if not all(math.isfinite(x) for x in realized) or not math.isfinite(error) or error > precision:
                raise ValueError("cutter coordinates lose precision; recenter the host or outline")
        if cutter is None:
            cutter = bpy.data.objects.new(name + ' Cutter', candidate_mesh)
            created_cutter = True
            bpy.context.collection.objects.link(cutter)
            cutter['refas_role'] = 'construction'
            cutter['refas_recess_version'] = 1
            cutter['refas_recess_host'] = host.name
            cutter['refas_recess_feature'] = name
            cutter.hide_render = True
            cutter.display_type = 'WIRE'
            modifier = host.modifiers.new(name, 'BOOLEAN')
            created_modifier = True
            modifier.operation = 'DIFFERENCE'
            modifier.solver = 'EXACT'
            modifier.operand_type = 'OBJECT'
            modifier.object = cutter
        else:
            changed_cutter = True
            cutter.data = candidate_mesh
        cutter.matrix_world = matrix
        bpy.context.view_layer.update()
        _closed(host)
        result_tree, result_offset, _, result_precision = _surface(host)
        if result_precision > precision:
            raise ValueError("Boolean output exceeds the prepared numeric precision")
        measured_depths = []
        for point in inner:
            top = position(point, cap + tolerance) + offset - result_offset
            hit, outward = cast(result_tree, top, -normal, 2 * distance)
            expected = position(point, -depth) + offset - result_offset
            if (hit - expected).length > tolerance or outward.dot(normal) < .99:
                raise ValueError("Boolean did not produce the requested sampled cavity floor")
            measured_depths.append((anchor + offset - result_offset - hit).dot(normal))
        for midpoint, fraction, outward in wall_probes:
            origin = position(centroid, -depth * fraction) + offset - result_offset
            expected = position(midpoint, -depth * fraction) + offset - result_offset
            direction = (expected - origin).normalized()
            hit, hit_normal = cast(result_tree, origin, direction, (expected - origin).length + tolerance)
            if (hit - expected).length > tolerance or hit_normal.dot(outward) > -.99:
                raise ValueError("Boolean did not produce the requested sampled cavity wall")
    except Exception:
        if created_modifier:
            host.modifiers.remove(modifier)
        if created_cutter:
            bpy.data.objects.remove(cutter, do_unlink=True)
        elif changed_cutter:
            cutter.data = old_mesh
            cutter.matrix_world = old_matrix
        if candidate_mesh.users == 0:
            bpy.data.meshes.remove(candidate_mesh)
        bpy.context.view_layer.update()
        raise
    if old_mesh is not None and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    return {"host": host.name, "feature": name, "cutter": cutter.name,
            "modifier": modifier.name, "updated": old_mesh is not None, "frame": frame,
            "depthRange": [min(measured_depths), max(measured_depths)],
            "minSampledFloor": min(floors), "minSampledWall": min(walls),
            "floorSamples": len(inner), "wallSamples": len(wall_probes), "tolerance": tolerance,
            "scope": "blind prismatic recess; explicit and deterministic samples; no global minimum-wall or collision certificate"}

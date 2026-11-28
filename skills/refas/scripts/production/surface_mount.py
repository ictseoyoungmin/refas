"""Mount a rigid detail on an explicitly selected evaluated Blender surface.

World-space rays and distances use Blender world length units. The part's local
XY contact plane is mapped to the host; local +Z points away from it and local
+X follows the supplied tangent. Contact samples are supplied in part-local
coordinates, including any needed interior samples. This is sampled support
placement, not full-part collision detection or a deforming attachment system.
"""
from __future__ import annotations

import math
from numbers import Real


MOUNT_PROPERTY = "refas_surface_mount"


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, Real) or not math.isfinite(value):
        raise ValueError(label + " must be finite")
    return float(value)


def _vector(value, label):
    from mathutils import Vector
    try:
        values = tuple(value)
    except TypeError as exc:
        raise ValueError(label + " must contain three finite coordinates") from exc
    if len(values) != 3:
        raise ValueError(label + " must contain three finite coordinates")
    result = Vector(tuple(_number(x, label) for x in values))
    if not all(math.isfinite(x) for x in result):
        raise ValueError(label + " exceeds Blender's numeric range")
    return result


def _unit(value, label):
    vector = _vector(value, label)
    length = vector.length
    if not math.isfinite(length) or length == 0:
        raise ValueError(label + " must have a nonzero finite length")
    return vector / length


def _mesh_object(obj, label):
    import bpy
    if (obj is None or obj.type != 'MESH' or obj.mode != 'OBJECT'
            or obj.name not in bpy.context.scene.objects):
        raise ValueError(label + " must be an object-mode mesh in the current scene")
    if not all(math.isfinite(x) for row in obj.matrix_world for x in row):
        raise ValueError(label + " transform must be finite")


def _surface(host):
    """Copy evaluated world triangles relative to a nearby origin for the BVH."""
    import bpy
    from mathutils.bvhtree import BVHTree
    _mesh_object(host, "host")
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = host.evaluated_get(depsgraph)
    if not evaluated.is_evaluated:
        raise ValueError("enable the host in the current view layer before selecting its evaluated surface")
    matrix = evaluated.matrix_world.copy()
    if not all(math.isfinite(x) for row in matrix for x in row):
        raise ValueError("evaluated host transform must be finite")
    linear = matrix.to_3x3()
    determinant = linear.determinant()
    if not math.isfinite(determinant) or determinant == 0:
        raise ValueError("host transform is singular")
    origin = matrix.translation.copy()
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        vertices = [linear @ v.co for v in mesh.vertices]
        if not vertices or any(not math.isfinite(x) for p in vertices for x in p):
            raise ValueError("host has no finite evaluated surface")
        # A mirrored transform changes winding; reverse it to keep the authored
        # outward direction (inverse-transpose normal), rather than camera side.
        triangles = [tuple(reversed(t.vertices)) if determinant < 0 else tuple(t.vertices)
                     for t in mesh.loop_triangles]
        polygons = [t.polygon_index for t in mesh.loop_triangles]
        if not triangles:
            raise ValueError("host has no evaluated triangles")
        tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
        span = max((max(p[i] for p in vertices) - min(p[i] for p in vertices))
                   for i in range(3))
        magnitude = max(abs(x) for p in vertices for x in p)
        precision = max(1e-8, span * 1e-6,
                        (max(abs(x) for x in origin) + magnitude) * 2 ** -22)
        return tree, origin, polygons, precision
    finally:
        evaluated.to_mesh_clear()


def _frame(surface, ray_origin, ray_direction, tangent, max_distance):
    tree, offset, polygons, precision = surface
    origin = _vector(ray_origin, "ray_origin")
    direction = _unit(ray_direction, "ray_direction")
    tangent = _unit(tangent, "tangent")
    distance = _number(max_distance, "max_distance")
    if distance <= 0:
        raise ValueError("max_distance must be positive")
    precision = max(precision, max(distance, *(abs(x) for x in origin - offset)) * 2 ** -21)
    point, normal, triangle, hit_distance = tree.ray_cast(origin - offset, direction, distance)
    if point is None:
        raise ValueError("selection ray does not hit the host within max_distance")
    if normal.dot(direction) >= -1e-5:
        raise ValueError("selection ray must approach the authored front side of the host")
    precision /= -normal.dot(direction)
    axis = tangent - normal * tangent.dot(normal)
    if axis.length < 1e-5:
        raise ValueError("tangent must have a component along the selected surface")
    axis.normalize()
    bitangent = normal.cross(axis).normalized()
    normal = axis.cross(bitangent).normalized()
    return {"position": list(point + offset), "normal": list(normal),
            "tangent": list(axis), "bitangent": list(bitangent),
            "triangleIndex": triangle, "polygonIndex": polygons[triangle],
            "rayDistance": hit_distance, "tolerance": precision}


def surface_frame(host, *, ray_origin, ray_direction, tangent, max_distance):
    """Select the first bounded ray hit, requiring its authored front side.

    Return a transient frame from the current evaluated host. Recompute after
    host edits, frame changes or deformation. No scene data is changed.
    """
    return _frame(_surface(host), ray_origin, ray_direction, tangent, max_distance)


def _part_scale(part):
    _mesh_object(part, "part")
    if (part.parent is not None or part.constraints or part.animation_data is not None
            or part.data.shape_keys is not None or part.rigid_body is not None):
        raise ValueError("part must be static, unparented and free of constraints, shape keys and rigid-body motion")
    local_modifiers = {'BEVEL', 'SUBSURF', 'SOLIDIFY', 'TRIANGULATE', 'WEIGHTED_NORMAL'}
    if any(m.show_viewport and m.type not in local_modifiers for m in part.modifiers):
        raise ValueError("part has an unsupported position-dependent modifier")
    if (part.delta_location.length != 0 or any(part.delta_rotation_euler)
            or tuple(part.delta_rotation_quaternion) != (1.0, 0.0, 0.0, 0.0)
            or tuple(part.delta_scale) != (1.0, 1.0, 1.0)):
        raise ValueError("apply part delta transforms before mounting")
    linear = part.matrix_world.to_3x3()
    lengths = [linear.col[i].length for i in range(3)]
    if min(lengths) <= 0 or not all(math.isfinite(x) for x in lengths) or linear.determinant() <= 0:
        raise ValueError("part scale must be nonsingular and orientation-preserving")
    axes = [linear.col[i] / lengths[i] for i in range(3)]
    if any(abs(axes[i].dot(axes[j])) > 1e-5 for i in range(3) for j in range(i)):
        raise ValueError("part shear is unsupported; apply it before mounting")
    return lengths


def place_on_surface(part, host, *, ray_origin, ray_direction, tangent,
                     contact_points, clearance, max_distance, max_gap):
    """Rigidly place a static mesh using its explicit local XY contact samples.

    Supply at least three noncollinear coplanar points (constant local Z).
    Their centroid maps to the selected surface point; +X follows tangent and
    +Z the authored host normal. Positive nonuniform part scale is preserved.
    Add edge/interior samples wherever the support surface can vary: the
    centroid is also sampled, but finite samples cannot certify an entire area.

    The part is lifted along the selected normal so sampled support gaps lie
    between clearance and max_gap, including a conservative numerical margin.
    Footprint rays are bounded to max_distance on each side of the anchor plane
    and must meet a similarly oriented first surface. max_gap is an absolute
    maximum distance, including clearance. All distances use world units.

    Invalid/no-hit/infeasible inputs raise ValueError before changing the part.
    The caller selects a meaningful contact plane and a host independent of the
    part; geometry away from the samples, global collisions and motion are not
    solved. Re-run after host edits. Nothing creates a report or saved revision.
    """
    import bpy
    from mathutils import Matrix, Vector
    if part is host:
        raise ValueError("part and host must be different objects")
    bpy.context.view_layer.update()
    scales = _part_scale(part)
    clearance = _number(clearance, "clearance")
    maximum_gap = _number(max_gap, "max_gap")
    distance = _number(max_distance, "max_distance")
    if clearance < 0 or maximum_gap < clearance or distance <= 0:
        raise ValueError("require 0 <= clearance <= max_gap and positive max_distance")
    try:
        points = [_vector(p, "contact point") for p in contact_points]
    except TypeError as exc:
        raise ValueError("contact_points must contain local XY contact samples") from exc
    if len(points) < 3:
        raise ValueError("at least three contact points are required")
    center = _vector(tuple(math.fsum(p[i] for p in points) / len(points) for i in range(3)),
                     "contact centroid")
    spread = max((p - center).length for p in points)
    if not math.isfinite(spread) or spread == 0 or any(abs(p.z - center.z) > spread * 1e-6 for p in points):
        raise ValueError("contact points must lie in one part-local XY plane")
    a = max(points, key=lambda p: (p - center).length) - center
    if max(a.cross(p - center).length for p in points) <= spread * spread * 1e-6:
        raise ValueError("contact points must not be collinear")
    surface = _surface(host)
    frame = _frame(surface, ray_origin, ray_direction, tangent, distance)
    tree, offset, _, precision = surface
    precision = max(precision, frame['tolerance'], distance * 2 ** -20)
    if maximum_gap - clearance <= 4 * precision:
        raise ValueError("max_gap band is below ray precision; shorten max_distance or recenter the host")
    anchor = Vector(frame['position']) - offset
    normal = Vector(frame['normal'])
    rotation = Matrix((frame['tangent'], frame['bitangent'], frame['normal'])).transposed()
    linear = rotation @ Matrix.Diagonal(Vector(scales))
    # The centre prevents the whole sample set from moving to a disconnected
    # support layer while still claiming contact with the selected anchor.
    local_offsets = [linear @ (p - center) for p in [*points, center]]
    heights = []
    for local_offset in local_offsets:
        origin = anchor + local_offset + normal * distance
        hit, hit_normal, _, _ = tree.ray_cast(origin, -normal, 2 * distance)
        if hit is None or hit_normal.dot(normal) < .5:
            raise ValueError("contact footprint has no compatible front-facing support")
        heights.append((hit - anchor - local_offset).dot(normal))
    if abs(heights[-1]) > precision * 4:
        raise ValueError("footprint projection selected a different surface layer")
    lift = max(heights) + clearance + 2 * precision
    gaps = [lift - h for h in heights]
    if max(gaps) + precision > maximum_gap:
        raise ValueError("rigid contact footprint cannot meet max_gap at the requested clearance")
    candidate = linear.to_4x4()
    candidate.translation = anchor + offset + normal * lift - linear @ center
    if not all(math.isfinite(x) for row in candidate for x in row):
        raise ValueError("mount transform exceeds Blender's numeric range")

    def measured_gaps(matrix):
        measured = []
        for point, local_offset in zip([*points, center], local_offsets):
            # Use the realized float matrix and local coordinates. The ideal
            # lift can disappear when a distant local origin is cancelled by
            # translation, even if all matrix entries are finite.
            actual = matrix @ point - offset
            expected = anchor + local_offset + normal * lift
            if (actual - expected).length > precision:
                raise ValueError("contact transform loses precision; recenter the part's local geometry")
            hit, hit_normal, _, _ = tree.ray_cast(
                actual + normal * (distance - lift), -normal, 2 * distance)
            if hit is None or hit_normal.dot(normal) < .5:
                raise ValueError("realized contact footprint has no compatible support")
            measured.append((actual - hit).dot(normal))
        if min(measured) - precision < clearance or max(measured) + precision > maximum_gap:
            raise ValueError("realized contact gaps exceed bounds; recenter local geometry or widen the feasible gap")
        return measured

    gaps = measured_gaps(candidate)
    previous = part.matrix_world.copy()
    try:
        part.matrix_world = candidate
        bpy.context.view_layer.update()
        if max(abs(a - b) for row_a, row_b in zip(part.matrix_world, candidate)
               for a, b in zip(row_a, row_b)) > precision:
            raise ValueError("Blender could not preserve the rigid mount transform")
        gaps = measured_gaps(part.matrix_world)
    except Exception:
        part.matrix_world = previous
        bpy.context.view_layer.update()
        raise
    return {"object": part.name, "host": host.name, "frame": frame,
            "sampleCount": len(gaps), "minGap": min(gaps), "maxGap": max(gaps),
            "tolerance": precision, "clearance": clearance,
            "scope": "static rigid placement; explicit contact samples plus centroid; no whole-part collision or animation guarantee"}


def _topology(host):
    """Fingerprint the polygon identities used by native Surface Deform."""
    from array import array
    import bpy
    import hashlib
    import struct
    import sys
    evaluated = host.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        sizes = array('I', [0]) * len(mesh.polygons)
        indices = array('I', [0]) * len(mesh.loops)
        mesh.polygons.foreach_get('loop_total', sizes)
        mesh.loops.foreach_get('vertex_index', indices)
        if sys.byteorder != 'little':
            sizes.byteswap()
            indices.byteswap()
        result = hashlib.sha256(struct.pack('<QQQ', len(mesh.vertices), len(sizes), len(indices)))
        result.update(sizes.tobytes())
        result.update(indices.tobytes())
        return result.hexdigest()
    finally:
        evaluated.to_mesh_clear()


def _independent_host(host, part, carrier=None):
    """Reject an attachment dependency cycle before invoking the native bind."""
    import bpy
    pending, seen = [host], set()
    while pending:
        obj = pending.pop()
        if obj is part or obj is carrier:
            raise ValueError('mount host must not depend on the attached part or its carrier')
        if obj in seen:
            continue
        seen.add(obj)
        if obj.parent:
            pending.append(obj.parent)
        owners = [*obj.modifiers, *obj.constraints]
        if obj.pose:
            owners.extend(constraint for bone in obj.pose.bones for constraint in bone.constraints)
        for datablock in (obj, obj.data, getattr(obj.data, 'shape_keys', None)):
            animation = getattr(datablock, 'animation_data', None)
            if animation:
                for curve in animation.drivers:
                    pending.extend(target.id for variable in curve.driver.variables for target in variable.targets
                                   if isinstance(target.id, bpy.types.Object))
        for owner in owners:
            if owner.type == 'NODES':
                raise ValueError('surface mounting does not inspect node-tree dependencies')
            for prop in owner.bl_rna.properties:
                if prop.type == 'POINTER' and prop.identifier != 'rna_type':
                    value = getattr(owner, prop.identifier)
                    if isinstance(value, bpy.types.Object):
                        pending.append(value)
                    elif isinstance(value, bpy.types.Collection):
                        pending.extend(value.all_objects)


def check_surface_mount(part):
    """Check a saved native mount after an ordinary host edit, without rebinding.

    Native Surface Deform and vertex parenting provide the live relationship.
    This bounded check rejects changed target topology or an infeasible rigid
    contact footprint. It does not update a scene or certify whole-part contact.
    """
    import bpy
    import json
    from mathutils import Vector
    _mesh_object(part, 'part')
    carrier = part.parent
    if (carrier is None or carrier.type != 'MESH'
            or carrier.name not in bpy.context.scene.objects
            or part.parent_type != 'VERTEX_3' or tuple(part.parent_vertices) != (0, 1, 2)
            or carrier.get('refas_role') != 'construction' or not carrier.hide_render
            or not carrier.visible_get() or len(carrier.data.vertices) != 3
            or len(carrier.data.polygons) != 1 or tuple(carrier.data.polygons[0].vertices) != (0, 1, 2)
            or len(carrier.modifiers) != 1 or carrier.constraints
            or carrier.data.shape_keys or carrier.animation_data or carrier.data.animation_data
            or part.constraints or part.animation_data or part.data.animation_data
            or part.data.shape_keys or part.rigid_body
            or set(carrier.children) != {part}):
        raise ValueError('part requires its ordinary three-vertex construction mount and unchanged rigid relationship')
    if any(modifier.show_viewport and modifier.type not in
           {'BEVEL', 'SUBSURF', 'SOLIDIFY', 'TRIANGULATE', 'WEIGHTED_NORMAL'} for modifier in part.modifiers):
        raise ValueError('mounted part has an unsupported position-dependent modifier')
    modifier = carrier.modifiers[0]
    if (modifier.type != 'SURFACE_DEFORM' or not modifier.is_bound or modifier.target is None
            or not modifier.show_viewport or not modifier.show_render or modifier.strength != 1
            or modifier.vertex_group or modifier.use_sparse_bind):
        raise ValueError('mount requires one enabled, fully bound Surface Deform modifier')
    host = modifier.target
    if carrier.parent is not host or carrier.parent_type != 'OBJECT':
        raise ValueError('mount carrier must retain its object parent to the supporting host')
    _mesh_object(host, 'host')
    if host.hide_render or not host.visible_get() or host.get('refas_role', 'asset') != 'asset':
        raise ValueError('mount host must remain an enabled visible asset surface')
    _independent_host(host, part, carrier)
    try:
        metadata = json.loads(carrier[MOUNT_PROPERTY])
        if metadata['version'] != 1:
            raise ValueError('unknown surface mount version')
        points = [_vector(point, 'contact point') for point in metadata['contactPoints']]
        clearance = _number(metadata['clearance'], 'clearance')
        maximum_gap = _number(metadata['maxGap'], 'max_gap')
        distance = _number(metadata['maxDistance'], 'max_distance')
        topology = metadata['hostTopology']
        saved_scales = tuple(_number(value, 'part scale') for value in metadata['partScale'])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError('surface mount metadata is missing or invalid') from exc
    if len(points) < 3 or clearance < 0 or maximum_gap < clearance or distance <= 0:
        raise ValueError('surface mount contact bounds are invalid')
    bpy.context.view_layer.update()
    if _topology(host) != topology:
        raise ValueError('surface mount host topology changed; deliberately unbind and mount again')
    surface = _surface(host)
    tree, offset, _, precision = surface
    precision = max(precision, distance * 2 ** -20)
    evaluated_carrier = carrier.evaluated_get(bpy.context.evaluated_depsgraph_get())
    carrier_mesh = evaluated_carrier.to_mesh()
    try:
        controls = [evaluated_carrier.matrix_world @ vertex.co for vertex in carrier_mesh.vertices]
        ab, ac = controls[1] - controls[0], controls[2] - controls[0]
        if (any(not math.isfinite(value) for point in controls for value in point)
                or min(ab.length, ac.length) <= 8 * precision
                or ab.cross(ac).length <= ab.length * ac.length * 1e-6):
            raise ValueError('native surface mount frame became degenerate; revise its supporting surface')
    finally:
        evaluated_carrier.to_mesh_clear()
    matrix = part.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world.copy()
    linear = matrix.to_3x3()
    scales = [linear.col[i].length for i in range(3)]
    if (len(saved_scales) != 3 or not all(math.isfinite(value) and value > 0 for value in saved_scales)
            or not all(math.isfinite(value) for row in matrix for value in row)
            or linear.determinant() <= 0 or min(scales) <= 0
            or any(abs(a - b) > b * 1e-5 for a, b in zip(scales, saved_scales))
            or any(abs(linear.col[i].dot(linear.col[j])) > scales[i] * scales[j] * 1e-5
                   for i in range(3) for j in range(i))):
        raise ValueError('mounted part lost its rigid scale or acquired shear; apply intended host scale before binding')
    normal = linear.col[2].normalized()
    center = sum(points, Vector()) / len(points)
    gaps = []
    for point in [*points, center]:
        actual = matrix @ point - offset
        hit, hit_normal, _, _ = tree.ray_cast(actual + normal * distance, -normal, 2 * distance)
        if hit is None or hit_normal.dot(normal) < .5:
            raise ValueError('mounted contact footprint lost its front-facing support')
        gap = (actual - hit).dot(normal)
        if not math.isfinite(gap) or gap < clearance - precision or gap > maximum_gap + precision:
            raise ValueError('mounted contact footprint exceeds its saved gap bounds; revise the host or mount')
        gaps.append(gap)
    return {'object': part.name, 'host': host.name, 'carrier': carrier.name,
            'sampleCount': len(gaps), 'minGap': min(gaps), 'maxGap': max(gaps),
            'clearance': clearance, 'tolerance': precision,
            'scope': 'native same-topology rigid attachment; sampled support only; no automatic topology rebind or animation baking'}


def bind_on_surface(part, host, *, ray_origin, ray_direction, tangent,
                    contact_points, clearance, max_distance, max_gap):
    """Mount a detail and retain an ordinary Blender deformation relationship.

    Uses the same local XY contact plane and sampled bounds as place_on_surface.
    A three-vertex construction mesh follows the evaluated host through native
    Surface Deform; native vertex parenting moves the detail rigidly. The saved
    blend needs no Python handler. Same-topology cage, modifier and transform
    edits follow automatically; check_surface_mount checks the resulting fit.
    Native target topology changes need a deliberate new mount. Motion export
    needs deliberate baking; this helper does not create an animation bake.

    On failure the part's original transform, scene objects and caller context
    remain. The explicit construction carrier is omitted from static delivery.
    """
    import bpy
    import json
    from mathutils import Matrix, Vector
    bpy.context.view_layer.update()
    _part_scale(part)
    _mesh_object(host, 'host')
    if host.hide_render or not host.visible_get() or host.get('refas_role', 'asset') != 'asset':
        raise ValueError('mount host must be an enabled visible asset surface')
    _independent_host(host, part)
    points = tuple(tuple(point) for point in contact_points)
    previous_channels = {key: getattr(part, key).copy() if hasattr(getattr(part, key), 'copy')
                         else tuple(getattr(part, key))
                         for key in ('location', 'rotation_euler', 'rotation_quaternion', 'rotation_axis_angle', 'scale')}
    previous_parent = (part.parent_type, tuple(part.parent_vertices), part.matrix_parent_inverse.copy())
    carrier = data = None
    try:
        placement = place_on_surface(part, host, ray_origin=ray_origin,
            ray_direction=ray_direction, tangent=tangent, contact_points=points,
            clearance=clearance, max_distance=max_distance, max_gap=max_gap)
        initial = part.matrix_world.copy()
        frame = placement['frame']
        rotation = Matrix((frame['tangent'], frame['bitangent'], frame['normal'])).transposed()
        anchor, normal = Vector(frame['position']), Vector(frame['normal'])
        local_points = [Vector(point) for point in points]
        center = sum(local_points, Vector()) / len(local_points)
        a = max(local_points, key=lambda point: (point - center).length)
        b = max(local_points, key=lambda point: (point - a).length)
        c = max(local_points, key=lambda point: (b - a).cross(point - a).length)
        offsets = [initial.to_3x3() @ (point - center) * .25 for point in (a, b, c)]
        tree, offset, _, precision = _surface(host)
        if min((offsets[i] - offsets[j]).length for i in range(3) for j in range(i)) <= 8 * precision:
            raise ValueError('contact footprint is too small for a stable native mount frame')
        controls = []
        for local_offset in offsets:
            expected = anchor + local_offset
            hit, hit_normal, _, _ = tree.ray_cast(expected - offset + normal * max_distance,
                                                 -normal, 2 * max_distance)
            if hit is None or hit_normal.dot(normal) < .5:
                raise ValueError('mount frame has no compatible front-facing support')
            controls.append(rotation.transposed() @ (hit + offset - anchor))
        data = bpy.data.meshes.new(part.name + ' surface mount')
        data.from_pydata(controls, [], [(0, 1, 2)])
        data.update()
        carrier = bpy.data.objects.new(part.name + ' surface mount', data)
        bpy.context.scene.collection.objects.link(carrier)
        carrier.matrix_world = rotation.to_4x4()
        carrier.matrix_world.translation = anchor
        carrier.parent = host
        carrier.matrix_parent_inverse = host.matrix_world.inverted()
        carrier['refas_role'] = 'construction'
        carrier.hide_render = True
        carrier.display_type = 'WIRE'
        modifier = carrier.modifiers.new('Follow supporting surface', 'SURFACE_DEFORM')
        modifier.target = host
        bpy.context.view_layer.update()
        with bpy.context.temp_override(object=carrier, active_object=carrier,
                                       selected_objects=[carrier], selected_editable_objects=[carrier]):
            try:
                result = bpy.ops.object.surfacedeform_bind(modifier=modifier.name)
            except RuntimeError as exc:
                raise ValueError('native Surface Deform could not bind the mount to this host: ' + str(exc)) from exc
        if 'FINISHED' not in result or not modifier.is_bound:
            raise ValueError('native Surface Deform could not bind the mount to this host')
        carrier[MOUNT_PROPERTY] = json.dumps({'version': 1, 'hostTopology': _topology(host),
            'contactPoints': points, 'clearance': clearance,
            'maxGap': max_gap, 'maxDistance': max_distance,
            'partScale': [initial.to_3x3().col[i].length for i in range(3)]}, separators=(',', ':'))
        part.parent = carrier
        part.parent_type = 'VERTEX_3'
        part.parent_vertices = (0, 1, 2)
        part.matrix_parent_inverse = Matrix.Identity(4)
        part.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        part.matrix_parent_inverse = part.matrix_world.inverted()
        part.matrix_basis = initial
        bpy.context.view_layer.update()
        if max(abs(a - b) for old, new in zip(initial, part.matrix_world)
               for a, b in zip(old, new)) > placement['tolerance']:
            raise ValueError('native mount could not retain the fitted part transform')
        return {**placement, **check_surface_mount(part)}
    except Exception:
        if carrier is not None and part.parent is carrier:
            part.parent = None
        part.parent_type, part.parent_vertices, part.matrix_parent_inverse = previous_parent
        for key, value in previous_channels.items():
            setattr(part, key, value)
        if carrier is not None:
            bpy.data.objects.remove(carrier, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
        bpy.context.view_layer.update()
        raise

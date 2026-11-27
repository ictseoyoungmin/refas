"""Validate one native Project Shrinkwrap on complete, explicitly masked surfaces.

The source cage and its data stay editable. Measurements cover the projection
prefix, before optional Solidify/Bevel, at vertices and four triangle interiors.
They do not certify final shell margins, continuous contact or global collision.
Distances are world units; the selected source axis must have unit world scale.
"""
from __future__ import annotations

import math
from numbers import Real
import struct


_VALUES = {'FLOAT': 'value', 'INT': 'value', 'INT8': 'value', 'INT32_2D': 'value', 'BOOLEAN': 'value',
           'FLOAT_VECTOR': 'vector', 'FLOAT2': 'vector', 'FLOAT_COLOR': 'color', 'BYTE_COLOR': 'color'}
_FIELDS = ('target', 'auxiliary_target', 'vertex_group', 'wrap_method', 'wrap_mode', 'cull_face',
           'offset', 'project_limit', 'use_project_x', 'use_project_y', 'use_project_z',
           'use_negative_direction', 'use_positive_direction', 'use_invert_cull',
           'invert_vertex_group', 'subsurf_levels')
_INTERIORS = ((1/3, 1/3, 1/3), (.6, .2, .2), (.2, .6, .2), (.2, .2, .6))


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(label + ' must be finite')
    try:
        value = float(value)
    except OverflowError as exc:
        raise ValueError(label + ' exceeds numeric range') from exc
    if not math.isfinite(value):
        raise ValueError(label + ' must be finite')
    return value


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _dot(a, b):
    return math.fsum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _linear(matrix, point):
    return tuple(_dot(row[:3], point) for row in matrix[:3])


def _static(obj, label):
    import bpy
    if (not isinstance(obj, bpy.types.Object) or obj.type != 'MESH' or bpy.context.mode != 'OBJECT'
            or obj.mode != 'OBJECT' or obj.name not in bpy.context.scene.objects
            or not obj.visible_get() or obj.hide_render or not obj.is_editable or not obj.data.is_editable
            or obj.parent is not None or obj.constraints or obj.animation_data is not None
            or obj.data.animation_data is not None or obj.data.shape_keys is not None
            or obj.rigid_body is not None or obj.rigid_body_constraint is not None
            or obj.get('refas_role', 'asset') != 'asset' or 'refas_sweep_version' in obj):
        raise ValueError(label + ' must be a visible ordinary static unparented mesh in object mode')
    matrix = tuple(tuple(row) for row in obj.matrix_world)
    if any(not math.isfinite(x) for row in matrix for x in row):
        raise ValueError(label + ' transform must be finite')
    columns = [tuple(matrix[j][i] for j in range(3)) for i in range(3)]
    scales = [math.sqrt(_dot(c, c)) for c in columns]
    if (min(scales) <= 0 or _dot(columns[0], _cross(columns[1], columns[2])) <= 0
            or any(abs(_dot(columns[i], columns[j])) > 1e-6*scales[i]*scales[j]
                   for i in range(3) for j in range(i))):
        raise ValueError(label + ' requires positive scale and no shear')
    return matrix, scales


def _target(obj):
    matrix, scales = _static(obj, 'target')
    if any(abs(s-1) > 1e-6 for s in scales):
        raise ValueError('target requires a rigid transform')
    allowed = {'SOLIDIFY', 'BEVEL', 'SUBSURF', 'TRIANGULATE', 'WEIGHTED_NORMAL'}
    if any(m.type not in allowed or m.show_viewport != m.show_render
           or (m.type == 'SUBSURF' and m.levels != m.render_levels) for m in obj.modifiers):
        raise ValueError('target has an unsupported, dependent or viewport/render-mismatched modifier')
    return matrix


def _mask(obj, name):
    group = obj.vertex_groups.get(name)
    if group is None:
        raise ValueError('group must name an existing binary vertex mask')
    selected = set()
    for vertex in obj.data.vertices:
        weight = next((g.weight for g in vertex.groups if g.group == group.index), 0.)
        if weight not in (0., 1.):
            raise ValueError('projection masks must have only zero or one weights')
        if weight == 1:
            selected.add(vertex.index)
    covered = set()
    for face in obj.data.polygons:
        chosen = selected.intersection(face.vertices)
        if chosen and len(chosen) != len(face.vertices):
            raise ValueError('mask must cover complete face-connected components; a face has mixed membership')
        covered.update(chosen)
    if not selected or covered != selected or any((e.vertices[0] in selected) != (e.vertices[1] in selected)
                                                 for e in obj.data.edges):
        raise ValueError('mask must cover nonempty complete surface components, without loose selected vertices')
    return selected


def _project_settings(modifier, scales):
    axes = [getattr(modifier, 'use_project_' + axis) for axis in 'xyz']
    if (modifier.wrap_method != 'PROJECT' or modifier.wrap_mode != 'ON_SURFACE'
            or modifier.cull_face != 'BACK' or modifier.use_invert_cull or modifier.invert_vertex_group
            or modifier.auxiliary_target is not None or modifier.subsurf_levels != 0
            or sum(axes) != 1 or modifier.use_negative_direction == modifier.use_positive_direction
            or not modifier.show_viewport or not modifier.show_render or modifier.use_pin_to_last
            or not math.isfinite(modifier.project_limit) or modifier.project_limit <= 0
            or not math.isfinite(modifier.offset) or modifier.offset < 0):
        raise ValueError('existing Project prefix has incompatible native settings')
    axis = axes.index(True)
    if abs(scales[axis]-1) > 1e-6:
        raise ValueError('each Project axis must have unit world scale')
    return axis, -1 if modifier.use_negative_direction else 1


def _evaluate(obj, disabled=()):
    import bpy
    flags = [(m, m.show_viewport, m.show_render) for m in disabled]
    try:
        for m, _, _ in flags:
            m.show_viewport = m.show_render = False
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        if not evaluated.is_evaluated:
            raise ValueError('enable the object in the current view layer')
        data = evaluated.to_mesh()
        try:
            data.calc_loop_triangles()
            points = [tuple(v.co) for v in data.vertices]
            if any(not math.isfinite(x) for p in points for x in p):
                raise ValueError('evaluated mesh coordinates must remain finite')
            return (points, [tuple(p.vertices) for p in data.polygons],
                    [tuple(t.vertices) for t in data.loop_triangles])
        finally:
            evaluated.to_mesh_clear()
    finally:
        for m, viewport, render in flags:
            m.show_viewport, m.show_render = viewport, render
        bpy.context.view_layer.update()


def _source_state(obj):
    data = obj.data
    if any(a.data_type not in _VALUES for a in data.attributes):
        raise ValueError('source has an unsupported attribute type')
    attributes = []
    for a in data.attributes:
        prop = _VALUES[a.data_type]
        array = a.data_type in {'INT32_2D', 'FLOAT_VECTOR', 'FLOAT2', 'FLOAT_COLOR', 'BYTE_COLOR'}
        values = tuple(tuple(getattr(v, prop)) if array else getattr(v, prop) for v in a.data)
        attributes.append((a.name, a.domain, a.data_type, values))
    return (data.as_pointer(), tuple(tuple(row) for row in obj.matrix_world),
            tuple((tuple(v.co), tuple((g.group, g.weight) for g in v.groups), v.select, v.hide)
                  for v in data.vertices),
            tuple((tuple(e.vertices), e.use_seam, e.select, e.hide) for e in data.edges),
            tuple((tuple(p.vertices), p.material_index, p.use_smooth, p.select, p.hide) for p in data.polygons),
            tuple(attributes), tuple((g.name, g.lock_weight) for g in obj.vertex_groups),
            obj.vertex_groups.active_index, tuple((s.link, s.material) for s in obj.material_slots),
            obj.active_material_index, data.uv_layers.active_index,
            tuple((u.name, u.active_render, u.active_clone) for u in data.uv_layers),
            data.color_attributes.active_color_index, data.color_attributes.render_color_index)


def _surface(target, matrix, translation, anchor):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    points, _, triangles = _evaluate(target)
    delta = tuple(math.fsum((matrix[i][3], -translation[i], -anchor[i])) for i in range(3))
    vertices = [tuple(math.fsum((x, delta[i])) for i, x in enumerate(_linear(matrix, p))) for p in points]
    if not triangles or any(not math.isfinite(x) or abs(x) > 3.4028234663852886e38 for p in vertices for x in p):
        raise ValueError('target needs a finite evaluated surface')
    if any(_dot(n := _cross(_sub(vertices[b], vertices[a]), _sub(vertices[c], vertices[a])), n) == 0
           for a, b, c in triangles):
        raise ValueError('target contains a degenerate evaluated triangle')
    return BVHTree.FromPolygons([Vector(p) for p in vertices], triangles, all_triangles=True), points, vertices


def _precision(values):
    magnitude = max((abs(x) for x in values), default=0.)
    return 8*max(2**-149, 2.**(math.frexp(magnitude)[1]-24)) if magnitude else 8*2**-149


def _world_precision(matrix, points):
    values = [math.fsum((matrix[i][3], *(matrix[i][j]*p[j] for j in range(3))))
              for p in points for i in range(3)]
    if any(not math.isfinite(x) or abs(x) > 3.4028234663852886e38 for x in values):
        raise ValueError('world coordinates exceed native finite range')
    return _precision(values)


def _hit(tree, point, ray, limit, tolerance, precision, label):
    from mathutils import Vector
    if any(not math.isfinite(x) or abs(x) > 3.4028234663852886e38 for x in point):
        raise ValueError(label + ': ray origin exceeds native precision/range')
    hit, normal, _, distance = tree.ray_cast(Vector(point), Vector(ray), limit)
    if hit is None:
        raise ValueError(label + ': first geometric hit is missing within max_distance')
    if any(not math.isfinite(x) for x in (*hit, *normal, distance)) or distance < 0:
        raise ValueError(label + ': first geometric hit is numerically unresolved')
    facing = -_dot(normal, ray)
    if facing <= 1e-6:
        raise ValueError(label + ': first geometric hit is back-facing or grazing')
    error = precision/facing
    if error >= tolerance or distance+error > limit:
        raise ValueError(label + ': ray precision cannot resolve tolerance or the bounded first hit')
    return tuple(hit), float(distance), error


def project_region(mesh, target, *, name, group, axis, direction, offset,
                   max_distance, max_displacement, tolerance):
    """Create/edit one bounded native Project modifier without changing the cage.

    Use an existing binary group covering complete disconnected surface regions.
    Other Project masks must be disjoint; only a Solidify then Bevel suffix is
    supported on the source. Existing names must already identify the same
    target/group/axis/direction. Positive orthogonal source scale is supported
    only with a unit projection axis; the target transform must be rigid.

    max_displacement measures input-to-this-modifier movement, even on re-edit.
    offset is nonnegative; all bounds/tolerance are finite and strictly positive.
    Failures restore the old modifier and evaluated result, or remove the new
    modifier. Later native field/target edits require fresh validation.
    """
    import bpy
    if (not isinstance(name, str) or not name.strip() or '\x00' in name
            or not isinstance(group, str) or not group or axis not in ('X', 'Y', 'Z')
            or isinstance(direction, bool) or direction not in (-1, 1) or mesh == target):
        raise ValueError('supply distinct meshes, an explicit name/group, one axis and direction -1 or +1')
    offset, max_distance, max_displacement, tolerance = (
        _number(v, k) for v, k in ((offset, 'offset'), (max_distance, 'max_distance'),
                                  (max_displacement, 'max_displacement'), (tolerance, 'tolerance')))
    if offset < 0 or min(max_distance, max_displacement, tolerance) <= 0:
        raise ValueError('offset must be nonnegative and all bounds/tolerance strictly positive')
    bpy.context.view_layer.update()
    matrix, scales = _static(mesh, 'source')
    target_matrix = _target(target)
    index = 'XYZ'.index(axis)
    if abs(scales[index]-1) > 1e-6:
        raise ValueError('selected source axis must have unit world scale')
    try:
        local_offset, local_limit = (struct.unpack('f', struct.pack('f', v/scales[index]))[0]
                                     for v in (offset, max_distance))
    except OverflowError as exc:
        raise ValueError('native float properties cannot represent offset/max_distance') from exc
    if not math.isfinite(local_offset+local_limit) or local_limit <= 0:
        raise ValueError('native Project limit must remain finite and nonzero; zero means unlimited')
    selected = _mask(mesh, group)
    existing = mesh.modifiers.get(name)
    prefix, suffix, used = [], [], set()
    for modifier in mesh.modifiers:
        if modifier.type == 'SHRINKWRAP' and not suffix:
            old_axis, old_direction = _project_settings(modifier, scales)
            if modifier.target == mesh:
                raise ValueError('a Project target cannot depend on the source')
            _target(modifier.target)
            mask = _mask(mesh, modifier.vertex_group)
            if used & mask or (modifier != existing and selected & mask):
                raise ValueError('Project prefix masks must select disjoint actual vertices')
            used.update(mask)
            if modifier == existing and (modifier.target != target or modifier.vertex_group != group
                                        or old_axis != index or old_direction != direction):
                raise ValueError('modifier name collides with a different intended projection')
            prefix.append(modifier)
        elif (modifier.type in ('SOLIDIFY', 'BEVEL') and modifier.show_viewport == modifier.show_render
              and [m.type for m in suffix] + [modifier.type] in (['SOLIDIFY'], ['BEVEL'], ['SOLIDIFY', 'BEVEL'])):
            suffix.append(modifier)
        else:
            raise ValueError('source needs a compatible Project prefix followed only by optional Solidify then Bevel')
    if existing is not None and existing not in prefix:
        raise ValueError('modifier name collides with another operation')
    position = prefix.index(existing) if existing is not None else len(prefix)
    source_state = _source_state(mesh)
    original_modifiers = list(mesh.modifiers)
    active_modifier = mesh.modifiers.active
    flags = [(m, m.show_viewport, m.show_render) for m in original_modifiers]
    previous = _evaluate(mesh, suffix)
    input_state = _evaluate(mesh, prefix[position:]+suffix)
    restored_state = _evaluate(mesh)
    if (len(input_state[0]) != len(mesh.data.vertices) or input_state[1] != previous[1]
            or input_state[1] != [tuple(p.vertices) for p in mesh.data.polygons]):
        raise ValueError('projection prefix must preserve source vertex/face correspondence')
    anchor = input_state[0][min(selected)]
    world = lambda points: [_linear(matrix, _sub(p, anchor)) for p in points]
    inputs = world(input_state[0])
    ray = tuple(direction*matrix[i][index]/scales[index] for i in range(3))
    tree, target_points, target_relative = _surface(target, target_matrix, tuple(row[3] for row in matrix[:3]),
                                                    _linear(matrix, anchor))
    precision = _precision(x for points in (input_state[0], target_points, target_relative, inputs)
                           for p in points for x in p)
    precision = max(precision, _precision((max_distance, offset)))
    # Relative double metrics avoid cancellation, but Blender's absolute world
    # coordinates must also resolve the requested fit. Do not accept a tiny
    # ideal clearance that disappears when the object is far from the origin.
    world_precision = max(_world_precision(matrix, input_state[0]), _world_precision(target_matrix, target_points))
    precision = max(precision, world_precision)
    bound = min(max_distance, local_limit*scales[index])
    hits = {i: _hit(tree, inputs[i], ray, bound, tolerance, precision, 'vertex '+str(i)) for i in sorted(selected)}
    old_settings = {key: getattr(existing, key) for key in _FIELDS} if existing is not None else None
    modifier, committed = existing, False
    try:
        if modifier is None:
            modifier = mesh.modifiers.new(name, 'SHRINKWRAP')
            if modifier.name != name:
                raise ValueError('modifier name cannot be retained exactly')
            mesh.modifiers.move(len(mesh.modifiers)-1, position)
        modifier.target, modifier.vertex_group = target, group
        modifier.wrap_method, modifier.wrap_mode, modifier.cull_face = 'PROJECT', 'ON_SURFACE', 'BACK'
        modifier.auxiliary_target = None
        modifier.subsurf_levels = 0
        modifier.use_invert_cull = modifier.invert_vertex_group = False
        for i, letter in enumerate('xyz'):
            setattr(modifier, 'use_project_'+letter, i == index)
        modifier.use_negative_direction, modifier.use_positive_direction = direction == -1, direction == 1
        modifier.offset, modifier.project_limit = local_offset, local_limit
        actual_limit = modifier.project_limit*scales[index]
        if (actual_limit <= 0 or not math.isfinite(actual_limit)
                or abs(modifier.offset*scales[index]-offset) > tolerance
                or any(distance+error > min(max_distance, actual_limit) for _, distance, error in hits.values())):
            raise ValueError('realized native float properties cannot honor the requested bounds')
        output_state = _evaluate(mesh, suffix)
        if len(output_state[0]) != len(inputs) or output_state[1] != input_state[1]:
            raise ValueError('native Project changed source topology')
        if any(output_state[0][i] != previous[0][i] for i in range(len(inputs)) if i not in selected):
            raise ValueError('native Project changed vertices outside its mask')
        outputs = world(output_state[0])
        world_precision = max(world_precision, _world_precision(matrix, output_state[0]))
        output_precision = max(precision, world_precision, _precision(x for p in output_state[0] for x in p))
        if output_precision > precision:
            hits = {i: (hit, distance, error*output_precision/precision) for i, (hit, distance, error) in hits.items()}
            precision = output_precision
        displacements = [math.dist(inputs[i], outputs[i]) for i in selected]
        if max(displacements)+2*world_precision > max_displacement:
            raise ValueError('actual input-to-modifier movement exceeds max_displacement')
        gaps, errors, transverse = [], [], []

        def observe(point, hit, uncertainty, label):
            expected = tuple(hit[i]-offset*ray[i] for i in range(3))
            delta = _sub(point, expected)
            along = _dot(delta, ray)
            error = math.sqrt(_dot(delta, delta))
            drift = math.sqrt(_dot(t := tuple(delta[i]-along*ray[i] for i in range(3)), t))
            if error+uncertainty > tolerance:
                raise ValueError(label + ': actual projection residual exceeds tolerance (including transverse drift)')
            gaps.append(_dot(_sub(hit, point), ray))
            errors.append(error)
            transverse.append(drift)

        for i, (hit, _, uncertainty) in hits.items():
            observe(outputs[i], hit, uncertainty, 'vertex '+str(i))
        triangle_count, spacing = 0, 0.
        for ti, triangle in enumerate(output_state[2]):
            if not all(i in selected for i in triangle):
                continue
            a, b, c = (outputs[i] for i in triangle)
            cross = _cross(_sub(b, a), _sub(c, a))
            lengths = [math.dist(a, b), math.dist(b, c), math.dist(c, a)]
            if (min(lengths) <= precision or math.sqrt(_dot(cross, cross)) <= max(lengths)**2*1e-8
                    or abs(_dot(cross, ray)) <= math.sqrt(_dot(cross, cross))*1e-6):
                raise ValueError('projection produced a degenerate or grazing triangle '+str(ti))
            triangle_count += 1
            spacing = max(spacing, *lengths)
            for weights in _INTERIORS:
                before = tuple(math.fsum(inputs[v][j]*w for v, w in zip(triangle, weights)) for j in range(3))
                after = tuple(math.fsum(outputs[v][j]*w for v, w in zip(triangle, weights)) for j in range(3))
                hit, _, uncertainty = _hit(tree, before, ray, min(max_distance, actual_limit), tolerance, precision,
                                          'triangle '+str(ti)+' interior')
                observe(after, hit, uncertainty, 'triangle '+str(ti)+' interior (refine the cage if coarse)')
        expected_modifiers = (original_modifiers if existing is not None else
                              original_modifiers[:position]+[modifier]+original_modifiers[position:])
        if (not triangle_count or _source_state(mesh) != source_state or list(mesh.modifiers) != expected_modifiers
                or any((m.show_viewport, m.show_render) != (v, r) for m, v, r in flags)):
            raise ValueError('source cage/data changed or selected region has no evaluated triangles')
        committed = True
        return {'object': mesh.name, 'modifier': modifier.name, 'created': existing is None,
                'selectedVertices': len(selected), 'triangles': triangle_count,
                'sampleCount': len(gaps), 'interiorSamplesPerTriangle': len(_INTERIORS),
                'maxTriangleEdge': spacing, 'clearanceRange': [min(gaps), max(gaps)],
                'maxResidual': max(errors), 'maxTransverseResidual': max(transverse),
                'maxDisplacement': max(displacements),
                'maxEditMovement': max(math.dist(_linear(matrix, _sub(output_state[0][i], previous[0][i])), (0, 0, 0))
                                       for i in selected),
                'outsideMaskChange': 0., 'realizedOffset': modifier.offset*scales[index],
                'realizedMaxDistance': actual_limit, 'rayPrecision': precision, 'worldPrecision': world_precision,
                'scope': 'projection prefix before thickness/bevel; finite vertex/triangle samples, no global collision or shell guarantee'}
    finally:
        if not committed and modifier is not None:
            if existing is None:
                mesh.modifiers.remove(modifier)
            else:
                for key, value in old_settings.items():
                    setattr(modifier, key, value)
        for m, viewport, render in flags:
            m.show_viewport, m.show_render = viewport, render
        mesh.modifiers.active = active_modifier
        bpy.context.view_layer.update()
        if not committed and (list(mesh.modifiers) != original_modifiers or _source_state(mesh) != source_state
                              or _evaluate(mesh) != restored_state):
            raise RuntimeError('projection rollback could not restore the original source/evaluated state')

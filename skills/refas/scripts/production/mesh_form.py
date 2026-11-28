"""Cut and combine an authored form with editable native Boolean operands.

The target cage is never replaced. Prepared operands become explicit, render-
hidden construction meshes; production delivery evaluates the target and omits
them. The operations change evaluated topology, so they do not promise unchanged
UVs on new faces, deformation topology, global wall thickness or source likeness.
"""
from __future__ import annotations

import math

from surface_mount import _mesh_object, _number, _vector


_OWNER = 'refas_form_target'
_FEATURE = 'refas_form_feature'
_PATH = 'refas_form_path'
_FINISH = {'BEVEL', 'WEIGHTED_NORMAL', 'TRIANGULATE'}


def _object(obj, label):
    import bpy
    _mesh_object(obj, label)
    if not obj.is_editable or obj.name not in bpy.context.view_layer.objects:
        raise ValueError(label + ' must be editable and enabled in the current view layer')
    determinant = obj.matrix_world.to_3x3().determinant()
    if not math.isfinite(determinant) or determinant == 0:
        raise ValueError(label + ' needs an invertible finite world transform')
    if any(m.show_viewport != m.show_render for m in obj.modifiers):
        raise ValueError(label + ' needs matching viewport/render modifier visibility')
    if not obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).is_evaluated:
        raise ValueError(label + ' must remain enabled for evaluation')


def _name(value):
    if not isinstance(value, str) or not value.strip() or len(value.encode('utf-8')) > 63:
        raise ValueError('feature name must contain 1 to 63 UTF-8 bytes')


def _move(target, modifier, index):
    import bpy
    if list(target.modifiers).index(modifier) != index:
        with bpy.context.temp_override(object=target, active_object=target,
                                      selected_objects=[target], selected_editable_objects=[target]):
            if bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=index) != {'FINISHED'}:
                raise ValueError('native Boolean modifier could not be placed at the requested position')
        if list(target.modifiers).index(modifier) != index:
            raise ValueError('native modifier pinning prevents the requested feature position')


def _solid(obj):
    """Observe finite, consistently wound closed components at the current stage."""
    import bpy
    import bmesh
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        if (not bm.faces or any(not e.is_manifold or not e.is_contiguous for e in bm.edges)
                or any(not v.is_manifold for v in bm.verts)
                or any(not math.isfinite(x) for v in bm.verts for x in v.co)):
            raise ValueError(obj.name + ' must evaluate to finite, closed, consistently wound solids')
        pending = set(bm.verts)
        components = []
        while pending:
            stack = [pending.pop()]
            vertices = set(stack)
            while stack:
                for edge in stack.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in pending:
                            pending.remove(vertex)
                            vertices.add(vertex)
                            stack.append(vertex)
            components.append(vertices)
        # Translation is removed before signed volume accumulation. The native
        # mesh keeps its original coordinates and data layers throughout.
        mesh.calc_loop_triangles()
        component_of = {v.index: i for i, group in enumerate(components) for v in group}
        origins = [tuple(next(iter(group)).co) for group in components]
        terms = [[] for _ in components]
        for triangle in mesh.loop_triangles:
            index = component_of[triangle.vertices[0]]
            origin = origins[index]
            a, b, c = (tuple(float(mesh.vertices[i].co[k]) - origin[k] for k in range(3))
                       for i in triangle.vertices)
            terms[index].append((a[0] * (b[1]*c[2] - b[2]*c[1])
                                 + a[1] * (b[2]*c[0] - b[0]*c[2])
                                 + a[2] * (b[0]*c[1] - b[1]*c[0])) / 6)
        volumes = [math.fsum(part) for part in terms]
        if any(not math.isfinite(v) or v <= 0 for v in volumes):
            raise ValueError(obj.name + ' needs outward-facing components with nonzero solid volume')
        volume = math.fsum(volumes) * abs(evaluated.matrix_world.to_3x3().determinant())
        if not math.isfinite(volume) or volume <= 0:
            raise ValueError(obj.name + ' has no finite world-space solid volume')
        return {'volume': volume, 'components': len(components),
                'vertices': len(mesh.vertices), 'faces': len(mesh.polygons)}
    finally:
        bm.free()
        evaluated.to_mesh_clear()


def _prefix(target, count):
    import bpy
    suffix = list(target.modifiers)[count:]
    flags = [(m, m.show_viewport, m.show_render) for m in suffix]
    try:
        for modifier, _, _ in flags:
            modifier.show_viewport = modifier.show_render = False
        bpy.context.view_layer.update()
        return _solid(target)
    finally:
        for modifier, viewport, render in flags:
            modifier.show_viewport, modifier.show_render = viewport, render
        bpy.context.view_layer.update()


def _exclusive_operand(target, operand, modifier):
    import bpy
    if operand.children:
        raise ValueError('construction operands cannot have child objects; copy the prepared solid first')
    # Collection references are followed too: a collection Boolean is a real
    # consumer even when it does not name the operand directly.
    pending, seen = [operand], set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        seen.add(source)
        for user in bpy.data.user_map(subset={source})[source]:
            if isinstance(user, bpy.types.Collection):
                pending.append(user)
            elif user != bpy.context.scene and not (source == operand and user == target):
                raise ValueError('operand or its collection has another consumer; copy the operand first')
    if any(m != modifier and m.type == 'BOOLEAN' and
           (m.object == operand or (m.collection and operand.name in m.collection.all_objects))
           for m in target.modifiers):
        raise ValueError('operand already belongs to another Boolean feature')
    # A cutter may share the target's transform hierarchy, but its geometry
    # cannot in turn depend on the geometry being cut.
    pending, seen = [operand], set()
    while pending:
        source = pending.pop()
        if source in seen:
            continue
        seen.add(source)
        for owner in list(source.modifiers) + list(source.constraints):
            for prop in owner.bl_rna.properties:
                dependency = getattr(owner, prop.identifier, None) if prop.type == 'POINTER' else None
                if dependency == target:
                    raise ValueError('operand cannot depend on the target through a modifier or constraint')
                if isinstance(dependency, bpy.types.Object):
                    pending.append(dependency)
                elif isinstance(dependency, bpy.types.Collection):
                    pending.extend(dependency.all_objects)


def boolean_form(target, name, *, operand, operation='DIFFERENCE', before=None):
    """Keep an Exact Boolean using an explicitly prepared, single solid mesh.

    ``operand`` becomes this feature's render-hidden construction mesh. Its
    cage, transform, parent, modifiers and materials are preserved. The target
    cage, UV layers, materials, parent and unrelated modifier order are retained.
    Native Boolean material mode is INDEX: new faces use the target's slots by
    operand face index; this does not transfer or unwrap operand UVs/materials.

    ``before`` names an existing modifier; otherwise insert before the trailing
    Bevel/Weighted Normal/Triangulate finish. Re-editing keeps the current slot
    unless ``before`` is supplied. The same name requires the same owned operand.
    There is no modifier application or background handler. Existing parent
    relationships remain authoritative for motion; observations are current-frame.

    Closed-solid/volume observations reject empty, unchanged or disconnected
    union results. They are not a self-intersection or minimum-thickness proof.
    Failures restore this call's role/visibility, modifier settings and order.
    """
    import bpy
    bpy.context.view_layer.update()
    _name(name)
    _object(target, 'target')
    _object(operand, 'operand')
    if target == operand or operation not in {'DIFFERENCE', 'UNION', 'INTERSECT'}:
        raise ValueError('provide a distinct operand and DIFFERENCE, UNION or INTERSECT')
    modifier = target.modifiers.get(name)
    if modifier is not None and (modifier.type != 'BOOLEAN' or modifier.object != operand
            or operand.get(_OWNER) != target or operand.get(_FEATURE) != name
            or modifier.solver != 'EXACT' or modifier.operand_type != 'OBJECT'):
        raise ValueError('existing feature is not this target and operand\'s managed Exact Boolean')
    if modifier is None and (_OWNER in operand or _FEATURE in operand):
        raise ValueError('operand already records a feature; restore its modifier or copy it without ownership')
    if modifier is None and any(obj != operand and obj.get(_OWNER) == target
                                and obj.get(_FEATURE) == name for obj in bpy.data.objects):
        raise ValueError('an orphaned operand records this feature; restore or remove that native feature first')
    _exclusive_operand(target, operand, modifier)
    others = [m for m in target.modifiers if m != modifier]
    if before is not None:
        named = next((m for m in others if m.name == before), None)
        if named is None:
            raise ValueError('before must name an existing, different target modifier')
        index = others.index(named)
    elif modifier is not None:
        index = list(target.modifiers).index(modifier)
    else:
        index = len(others)
        while index and others[index - 1].type in _FINISH:
            index -= 1
    operand_stats = _solid(operand)
    if operand_stats['components'] != 1:
        raise ValueError('operand must be one connected solid; use separate features for separate solids')
    order = list(target.modifiers)
    active = next((m for m in order if m.is_active), None)
    fields = ('operation', 'solver', 'operand_type', 'object', 'material_mode',
              'show_viewport', 'show_render')
    old_fields = {key: getattr(modifier, key) for key in fields} if modifier else None
    keys = ('refas_role', _OWNER, _FEATURE)
    properties = {key: operand[key] for key in keys if key in operand}
    presentation = (operand.hide_render, operand.display_type)
    created = modifier is None
    try:
        if created:
            modifier = target.modifiers.new(name, 'BOOLEAN')
        _move(target, modifier, index)
        modifier.show_viewport = modifier.show_render = False
        base = _prefix(target, index)
        modifier.operation, modifier.solver, modifier.operand_type = operation, 'EXACT', 'OBJECT'
        modifier.material_mode = 'INDEX'
        modifier.object = operand
        modifier.show_viewport = modifier.show_render = True
        result = _prefix(target, index + 1)
        epsilon = max(base['volume'], operand_stats['volume'], result['volume']) * 2e-10
        if operation in {'DIFFERENCE', 'INTERSECT'} and result['volume'] >= base['volume'] - epsilon:
            raise ValueError('Boolean does not remove a measurable solid region at the selected stack position')
        if operation == 'UNION' and (result['volume'] <= base['volume'] + epsilon
                or result['volume'] >= base['volume'] + operand_stats['volume'] - epsilon
                or result['components'] > base['components']):
            raise ValueError('union needs a real overlap and added volume; disconnected or unchanged results are rejected')
        operand['refas_role'], operand[_OWNER], operand[_FEATURE] = 'construction', target, name
        operand.hide_render, operand.display_type = True, 'WIRE'
        bpy.context.view_layer.update()
    except Exception:
        if created:
            if modifier is not None:
                target.modifiers.remove(modifier)
        else:
            for key, value in old_fields.items():
                setattr(modifier, key, value)
        for i, previous in enumerate(order):
            _move(target, previous, i)
        for key in keys:
            if key in properties:
                operand[key] = properties[key]
            elif key in operand:
                del operand[key]
        operand.hide_render, operand.display_type = presentation
        bpy.context.view_layer.update()
        raise
    finally:
        if active is not None:
            active.is_active = True
    return {'target': target.name, 'feature': name, 'operand': operand.name,
            'operation': operation, 'modifierIndex': index, 'updated': not created,
            'before': base, 'after': result,
            'scope': 'current-frame native solid Boolean; original cage retained, evaluated topology changed'}


def engrave_path(target, name, *, points, radius, cyclic=False, resolution=4, before=None):
    """Cut a round channel along an explicit world-space polyline.

    Native Curve bevel and caps create the solid cutter; no custom sweep or CSG
    solver is used. ``radius`` is a world length and ``resolution`` is Blender's
    bevel resolution (0..8). The supplied path determines depth; there is no
    implicit surface projection. Open endpoints have flat caps. Avoid tight
    turns/self-crossings relative to the chosen radius and inspect the result.

    The retained operand is an ordinary editable mesh parented to the target,
    with no leftover curve object. Repeating the name replaces only its mesh,
    preserving its object/Boolean identity. Hand-edited cutter vertices are
    intentionally replaced by the new explicit path. Failed revisions restore
    the previous cutter data and Boolean, and remove temporary native IDs.
    """
    import bpy
    import bmesh
    from mathutils import Matrix
    bpy.context.view_layer.update()
    _name(name)
    _object(target, 'target')
    try:
        coordinates = [_vector(p, 'path point') for p in points]
        radius = _number(radius, 'radius')
    except (TypeError, OverflowError) as exc:
        raise ValueError('points and radius must be finite world coordinates') from exc
    if (not isinstance(cyclic, bool) or not isinstance(resolution, int) or isinstance(resolution, bool)
            or not 0 <= resolution <= 8 or radius <= 0
            or len(coordinates) < (3 if cyclic else 2) or len(coordinates) > 4096):
        raise ValueError('provide 2..4096 points (3 for cyclic), positive radius and integer resolution 0..8')
    edges = list(zip(coordinates, coordinates[1:] + (coordinates[:1] if cyclic else [])))
    precision = max(1e-8, max(abs(v) for p in coordinates for v in p) * 2**-22)
    if radius <= precision * 8 or any((a - b).length <= precision * 8 for a, b in edges):
        raise ValueError('path radius or adjacent points are below native precision; recenter or enlarge the feature')
    previous = target.modifiers.get(name)
    cutter = previous.object if previous and previous.type == 'BOOLEAN' else None
    if previous is not None and (cutter is None or not cutter.get(_PATH)
            or cutter.get(_OWNER) != target or cutter.get(_FEATURE) != name
            or cutter.parent != target or cutter.modifiers or cutter.data.users != 1
            or cutter.data.shape_keys is not None):
        raise ValueError('existing path requires its unshared, unmodified target-parented cutter')
    old_mesh = cutter.data if cutter else None
    curve = curve_object = candidate_mesh = None
    created = cutter is None
    try:
        curve = bpy.data.curves.new(name + ' Path', 'CURVE')
        curve.dimensions, curve.fill_mode = '3D', 'FULL'
        curve.bevel_depth, curve.bevel_resolution, curve.use_fill_caps = radius, resolution, True
        spline = curve.splines.new('POLY')
        spline.points.add(len(coordinates) - 1)
        origin = coordinates[0]
        for point, position in zip(spline.points, coordinates):
            point.co = (*(position - origin), 1.)
        spline.use_cyclic_u = cyclic
        curve_object = bpy.data.objects.new(name + ' Path', curve)
        bpy.context.scene.collection.objects.link(curve_object)
        curve_object.matrix_world = Matrix.Translation(origin)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        candidate_mesh = bpy.data.meshes.new_from_object(curve_object.evaluated_get(depsgraph),
                                                        preserve_all_data_layers=True, depsgraph=depsgraph)
        # Native curve caps duplicate their perimeter vertices. Weld only exact
        # duplicates, without a spatial tolerance that could merge nearby walls.
        bm = bmesh.new()
        try:
            bm.from_mesh(candidate_mesh)
            known, duplicates = {}, {}
            for vertex in bm.verts:
                key = tuple(vertex.co)
                if key in known:
                    duplicates[vertex] = known[key]
                else:
                    known[key] = vertex
            if duplicates:
                bmesh.ops.weld_verts(bm, targetmap=duplicates)
            bm.to_mesh(candidate_mesh)
        finally:
            bm.free()
        if created:
            cutter = bpy.data.objects.new(name + ' Cutter', candidate_mesh)
            bpy.context.scene.collection.objects.link(cutter)
            cutter.parent = target
            cutter.matrix_parent_inverse = target.matrix_world.inverted()
            cutter.matrix_world = curve_object.matrix_world
        else:
            candidate_mesh.transform(cutter.matrix_world.inverted() @ curve_object.matrix_world)
            cutter.data = candidate_mesh
        bpy.data.objects.remove(curve_object, do_unlink=True)
        curve_object = None
        bpy.data.curves.remove(curve)
        curve = None
        cutter[_PATH] = True
        result = boolean_form(target, name, operand=cutter, operation='DIFFERENCE', before=before)
    except Exception:
        if created and cutter is not None:
            bpy.data.objects.remove(cutter, do_unlink=True)
        elif old_mesh is not None:
            cutter.data = old_mesh
        if candidate_mesh is not None and candidate_mesh.users == 0:
            bpy.data.meshes.remove(candidate_mesh)
        bpy.context.view_layer.update()
        raise
    finally:
        if curve_object is not None:
            bpy.data.objects.remove(curve_object, do_unlink=True)
        if curve is not None:
            bpy.data.curves.remove(curve)
    if old_mesh is not None and old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    result['path'] = {'points': len(coordinates), 'radius': radius, 'cyclic': cyclic,
                      'resolution': resolution, 'representation': 'native capped curve converted to editable cutter mesh'}
    return result

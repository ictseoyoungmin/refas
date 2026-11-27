"""Join two explicit open cage boundaries using Blender's native bridge.

This is one topology edit of an ordinary static mesh, not a live loft. Native
SURFACE interpolation uses adjacent source faces in mesh-local coordinates.
Limits and returned lengths use world units. Existing cage elements/layers and
the object are preserved; a successful edit replaces its unshared mesh data.
"""
from __future__ import annotations

from collections import deque
import math
from numbers import Integral, Real


_VALUES = {'FLOAT': 'value', 'INT': 'value', 'INT8': 'value', 'INT32_2D': 'value', 'BOOLEAN': 'value',
           'FLOAT_VECTOR': 'vector', 'FLOAT2': 'vector',
           'FLOAT_COLOR': 'color', 'BYTE_COLOR': 'color'}


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


def _static(obj):
    import bpy
    if (not isinstance(obj, bpy.types.Object) or obj.type != 'MESH'
            or bpy.context.mode != 'OBJECT' or obj.mode != 'OBJECT'
            or obj.name not in bpy.context.scene.objects or not obj.visible_get()
            or not obj.is_editable or not obj.data.is_editable or obj.data.users != 1
            or obj.parent is not None or obj.constraints or obj.animation_data is not None
            or obj.data.animation_data is not None or obj.data.shape_keys is not None
            or obj.rigid_body is not None or obj.data.has_custom_normals):
        raise ValueError('bridge requires a visible static unparented unshared mesh in object mode')
    if 'refas_sweep_version' in obj or obj.get('refas_role', 'asset') != 'asset':
        raise ValueError('bridge requires an ordinary cage; explicitly copy/bake managed or construction geometry first')
    allowed = {'BEVEL', 'SOLIDIFY', 'SUBSURF', 'TRIANGULATE', 'WEIGHTED_NORMAL'}
    if any(m.type not in allowed or m.show_viewport != m.show_render
           or (m.type == 'SUBSURF' and m.show_viewport and m.levels != m.render_levels)
           for m in obj.modifiers):
        raise ValueError('bridge has an unsupported or viewport/render-mismatched modifier')
    determinant = obj.matrix_world.to_3x3().determinant()
    if (any(not math.isfinite(x) for row in obj.matrix_world for x in row)
            or not math.isfinite(determinant) or determinant <= 0):
        raise ValueError('bridge transform must be finite, nonsingular and orientation-preserving')
    if not obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).is_evaluated:
        raise ValueError('enable the cage in the current view layer')
    if any(a.data_type not in _VALUES for a in obj.data.attributes):
        raise ValueError('mesh has an unsupported attribute type')


def _chain(values, count):
    try:
        values = tuple(values)
    except TypeError as exc:
        raise ValueError('boundary must contain ordered existing vertex indices') from exc
    if (len(values) < 2 or any(isinstance(i, bool) or not isinstance(i, Integral)
                              or not 0 <= i < count for i in values)
            or len(set(values)) != len(values)):
        raise ValueError('boundary must be an open chain of distinct existing vertices')
    return tuple(int(i) for i in values)


def _edge(a, b):
    return tuple(sorted((a, b)))


def _face_edges(face):
    return list(zip(face, face[1:] + face[:1]))


def _boundaries(mesh, a, b):
    selected = {_edge(x, y) for chain in (a, b) for x, y in zip(chain, chain[1:])}
    edges = {_edge(*e.vertices): e for e in mesh.edges}
    uses = {key: [] for key in selected}
    for face in mesh.polygons:
        for x, y in _face_edges(tuple(face.vertices)):
            if _edge(x, y) in uses:
                uses[_edge(x, y)].append((x, y))
    if (len(a) != len(b) or set(a) & set(b) or any(key not in edges or len(uses[key]) != 1 for key in selected)
            or any(mesh.vertices[i].hide for i in a + b)
            or any(edges[key].hide for key in selected)):
        raise ValueError('bridge needs disjoint equal open boundary chains, each edge with one adjacent face')
    if (any(not math.isfinite(x) for i in a + b for x in mesh.vertices[i].co)
            or any(math.dist(mesh.vertices[x].co, mesh.vertices[y].co) == 0 for x, y in selected)):
        raise ValueError('boundary coordinates and edge lengths must be finite and nondegenerate')
    return selected, uses


def _value(item, prop):
    value = getattr(item, prop)
    return tuple(value) if hasattr(value, '__iter__') else value


def _record(mesh):
    return {
        'vertices': [(tuple(v.co), tuple((g.group, g.weight) for g in v.groups), v.select, v.hide)
                     for v in mesh.vertices],
        'edges': [(tuple(e.vertices), e.use_seam, e.select, e.hide) for e in mesh.edges],
        'faces': [(tuple(p.vertices), p.material_index, p.use_smooth, p.select, p.hide) for p in mesh.polygons],
        'loops': [(l.vertex_index, l.edge_index) for l in mesh.loops],
        'attributes': {a.name: (a.data_type, a.domain, [_value(v, _VALUES[a.data_type]) for v in a.data])
                       for a in mesh.attributes},
        'materials': list(mesh.materials),
    }


def _preserved(mesh, before):
    after = _record(mesh)
    for domain in ('vertices', 'edges', 'faces', 'loops'):
        if after[domain][:len(before[domain])] != before[domain]:
            raise ValueError('native bridge changed existing cage ' + domain)
    if after['materials'] != before['materials']:
        raise ValueError('native bridge changed material slots')
    for name, (kind, domain, values) in before['attributes'].items():
        observed = after['attributes'].get(name)
        # Edit-mode roundtrips omit Blender's all-smooth (all-false) built-in
        # sharp_face storage. Its face semantics were checked above; retain the
        # explicitly existing layer too. Missing custom layers still fail.
        if observed is None and name == 'sharp_face' and kind == 'BOOLEAN' and domain == 'FACE' and not any(values):
            attribute = mesh.attributes.new(name=name, type=kind, domain=domain)
            observed = (kind, domain, [item.value for item in attribute.data])
        if observed is None or observed[:2] != (kind, domain) or observed[2][:len(values)] != values:
            raise ValueError('native bridge changed existing attribute ' + name)


def _patch(mesh, before, a, b, cuts, original_uses):
    n, old_v, old_e, old_f = len(a), len(before['vertices']), len(before['edges']), len(before['faces'])
    if (len(mesh.vertices) != old_v + cuts*n or len(mesh.polygons) != old_f + (cuts+1)*(n-1)
            or len(mesh.edges) != old_e + cuts*(n-1) + (cuts+1)*n):
        raise ValueError('native bridge did not produce the requested single quad strip')
    faces = [tuple(p.vertices) for p in mesh.polygons[old_f:]]
    neighbors, uses = {}, {key: list(value) for key, value in original_uses.items()}
    for face in faces:
        if len(face) != 4:
            raise ValueError('native bridge produced a non-quad patch')
        for x, y in _face_edges(face):
            neighbors.setdefault(x, set()).add(y)
            neighbors.setdefault(y, set()).add(x)
            uses.setdefault(_edge(x, y), []).append((x, y))
    if any(len(directions) > 2 or (len(directions) == 2 and directions[0] != tuple(reversed(directions[1])))
           for directions in uses.values()):
        raise ValueError('bridge winding does not continue the existing boundary faces')
    distances, queue = {i: 0 for i in a}, deque(a)
    while queue:
        vertex = queue.popleft()
        for other in neighbors.get(vertex, ()):
            if other not in distances:
                distances[other] = distances[vertex] + 1
                queue.append(other)
    rows = [a]
    for level in range(cuts+1):
        row = []
        for vertex in rows[-1]:
            following = [i for i in neighbors[vertex] if distances[i] == level+1]
            if len(following) != 1:
                raise ValueError('native bridge has ambiguous section correspondence')
            row.append(following[0])
        if len(set(row)) != n:
            raise ValueError('native bridge merged section correspondence')
        rows.append(tuple(row))
    expected = {frozenset((row[i], row[i+1], next_row[i+1], next_row[i]))
                for row, next_row in zip(rows, rows[1:]) for i in range(n-1)}
    if (rows[-1] != b or {frozenset(face) for face in faces} != expected
            or {i for row in rows[1:-1] for i in row} != set(range(old_v, len(mesh.vertices)))):
        raise ValueError('native auto-pairing differs from explicit A[i] to B[i] correspondence')
    return rows, faces


def _normal(a, b, c):
    u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
    cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
    length = math.hypot(*cross)
    if not math.isfinite(length) or length == 0:
        raise ValueError('bridge has a degenerate face')
    return tuple(x/length for x in cross)


def _geometry(mesh, matrix, rows, faces, max_bulge):
    indices = {i for row in rows for i in row}
    origin = tuple(mesh.vertices[rows[0][0]].co)
    # World-length metrics use transformed local deltas in double precision.
    # Adding object translation in mathutils float32 can erase a small bulge
    # while a much larger patch span still passes an absolute-position check.
    points = {i: tuple(math.fsum(matrix[k][j]*(mesh.vertices[i].co[j]-origin[j]) for j in range(3))
                      for k in range(3)) for i in indices}
    stored_world = {i: tuple(matrix @ mesh.vertices[i].co) for i in indices}
    ideal = {i: tuple(math.fsum(matrix[k][j]*mesh.vertices[i].co[j] for j in range(3)) + matrix[k][3]
                      for k in range(3)) for i in indices}
    if any(not math.isfinite(x) for group in (points, stored_world) for p in group.values() for x in p):
        raise ValueError('bridge exceeds Blender numeric range')
    span = max(max(p[k] for p in ideal.values())-min(p[k] for p in ideal.values()) for k in range(3))
    tolerance = span * 2**-20
    lengths = [math.dist(points[x], points[y]) for face in faces for x, y in _face_edges(face)]
    if (not math.isfinite(tolerance) or tolerance <= 0 or min(lengths) <= 32*tolerance
            or max(math.dist(stored_world[i], ideal[i]) for i in indices) > tolerance):
        raise ValueError('bridge loses numeric precision; recenter or reduce feature scale disparity')
    for face in faces:
        a, b, c, d = (points[i] for i in face)
        pairs = ((_normal(a,b,c), _normal(a,c,d)), (_normal(a,b,d), _normal(b,c,d)))
        if any(sum(x*y for x, y in zip(u,v)) <= 0 for u, v in pairs):
            raise ValueError('bridge has a folded or concave surface quad')
    bulge, spans = 0., []
    for column, (ai, bi) in enumerate(zip(rows[0], rows[-1])):
        a, b = points[ai], points[bi]
        axis = tuple(y-x for x, y in zip(a,b))
        squared = sum(x*x for x in axis)
        if squared == 0 or not math.isfinite(squared):
            raise ValueError('corresponding boundary points need positive finite separation')
        spans.append(math.sqrt(squared))
        for row in rows[1:-1]:
            p = points[row[column]]
            fraction = max(0., min(1., sum((p[k]-a[k])*axis[k] for k in range(3))/squared))
            bulge = max(bulge, math.dist(p, tuple(a[k]+fraction*axis[k] for k in range(3))))
    if max_bulge is not None and bulge > max_bulge:
        raise ValueError('native bridge exceeds max_bulge in world units')
    return min(spans), max(spans), bulge


def _postcheck(obj, mesh):
    if obj.data is not mesh or mesh.users != 1:
        raise ValueError('bridge did not commit an unshared mesh to the original object')


def bridge_boundaries(obj, boundary_a, boundary_b, *, cuts, interpolation='SURFACE',
                      smoothness=1.0, max_bulge=None, material_index=None):
    """Join equal disjoint open chains with explicit A[i] -> B[i] correspondence.

    ``cuts`` is the number of interior rows (0..1000). SURFACE uses the source
    cage's adjacent faces in local coordinates; LINEAR retains a straight join.
    No arbitrary tangent, G1/G2, global intersection or evaluated-thickness
    guarantee is made. Existing boundary positions define transition width.
    Optional max_bulge bounds world distance to each corresponding A/B segment.

    Original vertices, edges, faces, supported layers and modifiers stay intact.
    Connecting topology can change normals and the evaluated Solidify/Subsurf
    neighborhood even when old cage coordinates are identical; inspect that
    result separately. This contract preserves the cage, not evaluated margins.
    The object survives but its mesh datablock may replace; new faces/rows remain
    ordinary editable native geometry. Managed sweep outputs, construction roles,
    sharing, shape keys, animation and custom normals are refused. Invalid input
    or a failed staged result leaves the original mesh and caller context intact.
    """
    import bpy
    import bmesh
    bpy.context.view_layer.update()
    _static(obj)
    if isinstance(cuts, bool) or not isinstance(cuts, Integral) or not 0 <= cuts <= 1000:
        raise ValueError('cuts must be an integer from 0 to 1000')
    if interpolation not in {'LINEAR', 'SURFACE'}:
        raise ValueError('interpolation must be LINEAR or SURFACE')
    smoothness = _number(smoothness, 'smoothness')
    if not 0 <= smoothness <= 1000:
        raise ValueError('smoothness must be from 0 to 1000')
    if max_bulge is not None:
        max_bulge = _number(max_bulge, 'max_bulge')
        if max_bulge < 0:
            raise ValueError('max_bulge must be nonnegative')
    original = obj.data
    if material_index is not None and (isinstance(material_index, bool) or not isinstance(material_index, Integral)
                                      or not 0 <= material_index < len(original.materials)):
        raise ValueError('material_index must name an existing material slot')
    a, b = (_chain(values, len(original.vertices)) for values in (boundary_a, boundary_b))
    selected_edges, original_uses = _boundaries(original, a, b)
    before = _record(original)
    active, selected = bpy.context.view_layer.objects.active, list(bpy.context.selected_objects)
    selection_mode = tuple(bpy.context.tool_settings.mesh_select_mode)
    temporary, candidate, committed = None, None, False
    try:
        candidate = original.copy()
        temporary = obj.copy()
        temporary.data = candidate
        bpy.context.scene.collection.objects.link(temporary)
        for item in selected:
            item.select_set(False)
        temporary.select_set(True)
        bpy.context.view_layer.objects.active = temporary
        bpy.context.tool_settings.mesh_select_mode = (False, True, False)
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(candidate)
        bm.verts.ensure_lookup_table()
        for face in bm.faces:
            face.select_set(False)
        for edge in bm.edges:
            edge.select_set(False)
        for vertex in bm.verts:
            vertex.select_set(False)
        for edge in bm.edges:
            if _edge(*(vertex.index for vertex in edge.verts)) in selected_edges:
                edge.select_set(True)
        bmesh.update_edit_mesh(candidate)
        result = bpy.ops.mesh.bridge_edge_loops(type='SINGLE', use_merge=False, twist_offset=0,
                                               number_cuts=int(cuts), interpolation=interpolation,
                                               smoothness=smoothness, profile_shape_factor=0.)
        bpy.ops.object.mode_set(mode='OBJECT')
        if result != {'FINISHED'}:
            raise ValueError('native bridge did not finish')
        # Selection flushing belongs to the temporary operator context, not to
        # the user's retained cage. Restore those old element flags explicitly.
        for domain, elements in (('vertices', candidate.vertices), ('edges', candidate.edges), ('faces', candidate.polygons)):
            for element, state in zip(elements, before[domain]):
                element.select, element.hide = state[-2:]
        _preserved(candidate, before)
        rows, faces = _patch(candidate, before, a, b, cuts, original_uses)
        minimum, maximum, bulge = _geometry(candidate, obj.matrix_world, rows, faces, max_bulge)
        new_faces = list(range(len(before['faces']), len(candidate.polygons)))
        if material_index is not None:
            for index in new_faces:
                candidate.polygons[index].material_index = int(material_index)
        bpy.data.objects.remove(temporary, do_unlink=True)
        temporary = None
        obj.data = candidate
        bpy.context.view_layer.update()
        _postcheck(obj, candidate)
        committed = True
        return {'object': obj.name, 'newVertices': list(range(len(before['vertices']), len(candidate.vertices))),
                'newFaces': new_faces, 'rows': [list(row) for row in rows],
                'spanRange': [minimum, maximum], 'maxBulge': bulge,
                'scope': 'one native open-boundary cage join; local interpolation, world lengths; no global collision or G1 guarantee'}
    finally:
        if temporary is not None:
            if temporary.mode == 'EDIT':
                bpy.ops.object.mode_set(mode='OBJECT')
            bpy.data.objects.remove(temporary, do_unlink=True)
        if not committed and candidate is not None:
            obj.data = original
        if candidate is not None and candidate.users == 0:
            bpy.data.meshes.remove(candidate)
        if committed and original.users == 0:
            bpy.data.meshes.remove(original)
        for item in bpy.context.selected_objects:
            item.select_set(False)
        for item in selected:
            item.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.context.tool_settings.mesh_select_mode = selection_mode
        bpy.context.view_layer.update()

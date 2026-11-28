"""Spatial brushes on an ordinary native cage; no sculpt-mode or rebuild state.

Brushes use the undeformed basis cage in world space, not an inverse mapping
from a posed/modifier-evaluated surface. Parent transforms and modifiers remain
untouched. The author chooses the shape; these operations do not interpret a
reference, preserve volume or certify intersections, thickness or resemblance.
"""
from collections import Counter
import itertools
import math
from numbers import Integral, Real
import struct


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(label + ' must be a finite number')
    try:
        value = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError(label + ' exceeds the numeric range') from exc
    if not math.isfinite(value):
        raise ValueError(label + ' must be finite')
    return value


def _point(value, label):
    try:
        values = tuple(value)
    except TypeError as exc:
        raise ValueError(label + ' needs three finite coordinates') from exc
    if len(values) != 3:
        raise ValueError(label + ' needs three finite coordinates')
    return tuple(_number(x, label) for x in values)


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _dot(a, b):
    return math.fsum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _linear(matrix, point):
    return tuple(_dot(row[:3], point) for row in matrix[:3])


def _unit(value, label):
    value = _point(value, label)
    length = math.hypot(*value)
    if not math.isfinite(length) or length == 0:
        raise ValueError(label + ' needs a nonzero finite direction')
    return tuple(x/length for x in value)


def _inverse(matrix):
    a, b, c = (row[:3] for row in matrix[:3])
    columns = (_cross(b, c), _cross(c, a), _cross(a, b))
    determinant = _dot(a, columns[0])
    if not math.isfinite(determinant) or determinant == 0:
        raise ValueError('object world transform must be invertible')
    result = tuple(tuple(column[i]/determinant for column in columns) for i in range(3))
    if any(not math.isfinite(v) for row in result for v in row):
        raise ValueError('object inverse exceeds the numeric range')
    return result


def _mask(obj, mask, count):
    if mask is None:
        return [1.] * count
    if isinstance(mask, str):
        group = obj.vertex_groups.get(mask)
        if group is None:
            raise ValueError('mask must name an existing vertex group')
        result = [next((g.weight for g in v.groups if g.group == group.index), 0.)
                  for v in obj.data.vertices]
        if any(not math.isfinite(v) or not 0 <= v <= 1 for v in result):
            raise ValueError('mask weights must be finite and between zero and one')
        return result
    try:
        indices = tuple(mask)
    except TypeError as exc:
        raise ValueError('mask needs a vertex group name or vertex indices') from exc
    if any(isinstance(i, bool) or not isinstance(i, Integral) or not 0 <= i < count for i in indices):
        raise ValueError('mask indices must name existing cage vertices')
    selected = set(indices)
    return [float(i in selected) for i in range(count)]


def _normals(points, polygons):
    normals = [[0., 0., 0.] for _ in points]
    for face in polygons:
        origin = points[face[0]]
        triangles = [_cross(_sub(points[a], origin), _sub(points[b], origin))
                     for a, b in zip(face[1:], face[2:])]
        normal = tuple(math.fsum(n[k] for n in triangles) for k in range(3))
        for i in face:
            for k in range(3):
                normals[i][k] += normal[k]
    return normals


def _refresh(obj):
    import bpy
    obj.data.update()
    bpy.context.view_layer.update()


def sculpt_brush(obj, *, operation, center, radius, delta=None, direction=None,
                 strength=None, mask=None, symmetry=(), symmetry_origin=(0, 0, 0),
                 pin_boundary=False, iterations=1, tolerance=1e-5):
    """Apply one bounded spatial brush; compose calls in an ordinary bpy script.

    ``center``, ``radius``, ``delta`` and directions use world coordinates of the
    undeformed basis cage. GRAB requires a displacement ``delta``. DRAW requires
    ``direction`` and signed world-distance ``strength``; INFLATE uses the cage's
    area-weighted winding normals and signed world-distance ``strength``.
    FLATTEN uses the plane through ``center`` with normal ``direction`` and a
    strength in [0,1]. SMOOTH uses neighbor averaging, strength in [0,1] and
    ``iterations`` (1..100); it can shrink volume. Other operations run once.

    The spherical smoothstep falloff is one at the center and zero at radius.
    ``mask`` is vertex indices or a named group with soft weights in [0,1].
    Unselected/outside vertices stay exact. ``pin_boundary`` additionally fixes
    open/nonmanifold edge vertices; this is useful when smoothing open panels.
    Symmetry mirrors the brush about world X/Y/Z planes through symmetry_origin;
    masks are not expanded. Overlapping mirrored displacements use a weighted
    mean bounded by the strongest falloff, so they do not multiply strength. Conflicting mirrored
    directions can cancel. Smoothing weights are fixed at the starting cage.

    Parent transforms, modifiers, object/data identity, UVs, materials, groups,
    topology and caller context are retained. Existing shape keys receive the
    same intended local displacement in EVERY key. Realized displacement and
    each relative-key offset are checked within ``tolerance`` world units.
    This edits the basis, not the active mix.
    Mesh data must have one user, be editable and in object mode. No edit-mode
    switch, evaluated-to-cage inversion or animation bake is performed.

    All proposals and float32 key coordinates are checked before mutation.
    Failure restores every original coordinate. No collision/shape approval is
    inferred; inspect the resulting native surface before keeping the edit.
    The report separates requested and realized displacement. A sub-precision
    edit within tolerance can return ``no-effect`` rather than claiming a change;
    changedVertices counts vertices changed in the cage or any shape key.
    """
    import bpy
    if (not isinstance(obj, bpy.types.Object) or obj.type != 'MESH'
            or obj.name not in bpy.context.scene.objects or obj.mode != 'OBJECT'
            or bpy.context.mode != 'OBJECT' or not obj.is_editable or not obj.data.is_editable):
        raise ValueError('brush needs an editable scene mesh in object mode')
    if obj.data.users != 1:
        raise ValueError('brush needs single-user mesh data; make the intended object single-user first')
    if not isinstance(operation, str) or operation not in {'GRAB', 'DRAW', 'INFLATE', 'SMOOTH', 'FLATTEN'}:
        raise ValueError('operation must be GRAB, DRAW, INFLATE, SMOOTH or FLATTEN')
    center, origin = _point(center, 'center'), _point(symmetry_origin, 'symmetry_origin')
    radius, tolerance = _number(radius, 'radius'), _number(tolerance, 'tolerance')
    if radius <= 0 or tolerance <= 0:
        raise ValueError('radius and tolerance must be positive')
    if type(pin_boundary) is not bool:
        raise ValueError('pin_boundary must be boolean')
    if isinstance(iterations, bool) or not isinstance(iterations, Integral) or not 1 <= iterations <= 100:
        raise ValueError('iterations must be an integer from one to 100')
    if operation != 'SMOOTH' and iterations != 1:
        raise ValueError('iterations only applies to SMOOTH')
    if operation == 'GRAB':
        delta = _point(delta, 'delta')
        if strength is not None or direction is not None:
            raise ValueError('GRAB uses delta, not strength or direction')
    else:
        strength = _number(strength, 'strength')
        if delta is not None:
            raise ValueError('delta only applies to GRAB')
        if operation in {'SMOOTH', 'FLATTEN'} and not 0 <= strength <= 1:
            raise ValueError('SMOOTH and FLATTEN strength must be between zero and one')
        if operation in {'DRAW', 'FLATTEN'}:
            direction = _unit(direction, 'direction')
        elif direction is not None:
            raise ValueError('direction only applies to DRAW or FLATTEN')
    try:
        axes = tuple(symmetry)
    except TypeError as exc:
        raise ValueError('symmetry needs distinct world axes X, Y or Z') from exc
    if any(axis not in ('X', 'Y', 'Z') for axis in axes) or len(set(axes)) != len(axes):
        raise ValueError('symmetry needs distinct world axes X, Y or Z')
    signs = list(itertools.product(*[(-1, 1) if axis in axes else (1,) for axis in 'XYZ']))
    brushes = [(tuple(math.fsum((o, s*(c-o))) for c, o, s in zip(center, origin, sign)), sign)
               for sign in signs]
    if any(not math.isfinite(v) for brush, _ in brushes for v in brush):
        raise ValueError('mirrored brush coordinates exceed the numeric range')

    bpy.context.view_layer.update()
    matrix = tuple(tuple(row) for row in obj.matrix_world)
    if any(not math.isfinite(v) for row in matrix for v in row):
        raise ValueError('object world transform must be finite')
    inverse = _inverse(matrix)
    mesh = obj.data
    original = [tuple(v.co) for v in mesh.vertices]
    keys = [(key, [tuple(v.co) for v in key.data]) for key in mesh.shape_keys.key_blocks] if mesh.shape_keys else []
    if keys and any(len(values) != len(original) for _, values in keys):
        raise ValueError('shape keys must match the basis topology')
    basis = keys[0][1] if keys else original
    if any(not all(math.isfinite(x) for x in p) for values in [original, *(v for _, v in keys)] for p in values):
        raise ValueError('cage and all shape-key coordinates must be finite')
    points = [tuple(math.fsum((x, matrix[k][3])) for k, x in enumerate(_linear(matrix, p))) for p in basis]
    if any(not math.isfinite(x) or math.ulp(x) > tolerance for p in points for x in p):
        raise ValueError('world coordinates exceed the requested numeric tolerance')
    weights = _mask(obj, mask, len(points))
    polygons = [tuple(p.vertices) for p in mesh.polygons]
    if pin_boundary:
        uses = Counter(tuple(sorted((face[j-1], face[j]))) for face in polygons for j in range(len(face)))
        for edge in mesh.edges:
            if uses[tuple(sorted(edge.vertices))] != 2:
                for i in edge.vertices:
                    weights[i] = 0.
    influences = [[max(0., 1-3*t*t+2*t*t*t) if t < 1 else 0.
                   for brush, _ in brushes for t in [math.dist(p, brush)/radius]] for p in points]
    weights = [w*math.fsum(v*v for v in influence)/math.fsum(influence) if any(influence) else 0.
               for w, influence in zip(weights, influences)]
    active = [i for i, w in enumerate(weights) if w > 0]
    moves = [(0., 0., 0.) for _ in points]
    if operation == 'SMOOTH':
        neighbors = [[] for _ in points]
        for edge in mesh.edges:
            a, b = edge.vertices
            neighbors[a].append(b)
            neighbors[b].append(a)
        current = list(points)
        for _ in range(iterations):
            following = list(current)
            for i in active:
                if neighbors[i]:
                    following[i] = tuple(math.fsum((current[i][k], strength*weights[i]*
                        math.fsum(current[j][k]-current[i][k] for j in neighbors[i])/len(neighbors[i]))) for k in range(3))
            current = following
        moves = [_sub(p, before) for p, before in zip(current, points)]
    else:
        normals = _normals(points, polygons) if operation == 'INFLATE' else None
        # A reflected object reverses world triangle winding. Retain the
        # authored outward orientation, as an inverse-transpose normal does.
        orientation = (-1. if _dot(matrix[0][:3], _cross(matrix[1][:3], matrix[2][:3])) < 0 else 1.)
        for i in active:
            if normals is not None:
                if strength:
                    moves[i] = tuple(orientation*strength*weights[i]*v
                                     for v in _unit(normals[i], 'affected cage normal'))
                continue
            contributions = []
            for (brush, sign), influence in zip(brushes, influences[i]):
                if influence == 0:
                    continue
                vector = delta if operation == 'GRAB' else direction
                vector = tuple(v*s for v, s in zip(vector, sign))
                amount = (1. if operation == 'GRAB' else strength if operation == 'DRAW'
                          else -strength*_dot(_sub(points[i], brush), vector))
                contributions.append(tuple(influence*influence*amount*v for v in vector))
            total = math.fsum(v*v for v in influences[i])
            moves[i] = tuple(weights[i]*math.fsum(v[k] for v in contributions)/total for k in range(3))

    changed = [i for i in active if any(moves[i])]
    local_moves = {i: _linear(inverse, moves[i]) for i in changed}
    proposals, maximum_error = [], 0.
    # Quantize every coordinate that will be stored, including each shape key.
    for target, values in [(mesh.vertices, original), *((key.data, values) for key, values in keys)]:
        candidate = {}
        for i in changed:
            requested = tuple(math.fsum((v, d)) for v, d in zip(values[i], local_moves[i]))
            try:
                stored = struct.unpack('<3f', struct.pack('<3f', *requested))
            except (OverflowError, struct.error) as exc:
                raise ValueError('brush exceeds native coordinate range') from exc
            realized = _linear(matrix, _sub(stored, values[i]))
            error = math.dist(realized, moves[i])
            if not all(math.isfinite(v) for v in stored) or not math.isfinite(error) or error > tolerance:
                raise ValueError('brush exceeds native coordinate precision at the requested tolerance')
            maximum_error = max(maximum_error, error)
            candidate[i] = stored
        proposals.append((target, values, candidate))
    maximum_morph_error = 0.
    key_proposals = {key.as_pointer(): proposal for (key, _), proposal in zip(keys, proposals[1:])}
    for key, _ in keys:
        _, values, candidate = key_proposals[key.as_pointer()]
        relative = key.relative_key if mesh.shape_keys.use_relative else mesh.shape_keys.reference_key
        _, old_relative, new_relative = key_proposals[relative.as_pointer()]
        for i in changed:
            error = math.hypot(*_linear(matrix, _sub(_sub(candidate[i], new_relative[i]),
                                                     _sub(values[i], old_relative[i]))))
            if not math.isfinite(error) or error > tolerance:
                raise ValueError('brush cannot preserve shape-key offsets at the requested tolerance')
            maximum_morph_error = max(maximum_morph_error, error)
    native_changes = {i for _, values, candidate in proposals for i, point in candidate.items()
                      if point != values[i]}
    actual_maximum = max((math.hypot(*_linear(matrix, _sub(point, values[i])))
                         for _, values, candidate in proposals for i, point in candidate.items()), default=0.)
    try:
        for target, values, candidate in proposals:
            for i, point in candidate.items():
                if point != values[i]:
                    target[i].co = point
        if native_changes:
            _refresh(obj)
        if tuple(tuple(row) for row in obj.matrix_world) != matrix:
            raise ValueError('brush changed its world frame through a scene dependency')
        for target, _, candidate in proposals:
            if any(tuple(target[i].co) != point for i, point in candidate.items()):
                raise ValueError('native update changed the proposed cage or shape-key coordinates')
    except BaseException:
        for target, values, candidate in proposals:
            for i in candidate:
                target[i].co = values[i]
        try:
            _refresh(obj)
        except Exception:
            pass
        raise
    return {'object': obj.name, 'operation': operation, 'affectedVertices': len(active),
            'changedVertices': len(native_changes), 'shapeKeys': len(keys),
            'maxDisplacement': actual_maximum,
            'maxRequestedDisplacement': max((math.hypot(*moves[i]) for i in changed), default=0.),
            'maxStorageError': maximum_error, 'maxMorphOffsetError': maximum_morph_error,
            'status': 'changed' if native_changes else 'no-effect',
            'scope': 'world-space basis-cage brush; modifiers and morph offsets retained; no evaluated-surface, volume or collision guarantee'}

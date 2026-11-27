"""Joint small displacement edits with exact cage handles and a frozen exterior.

The positive symmetric graph Laplacian acts on displacements, not positions.
This is not rotation-preserving deformation or automatic constraint repair.
Distance observations cover named cage pairs, paired Solidify-prefix vertices and
declared first-hit obstacle rays only; they do not certify global wall thickness,
continuous contact, finished Bevel margins, self-intersection or swept collision.
Units are world units.
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
import math
from numbers import Integral, Real


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


def _point(value, label):
    try:
        result = tuple(_number(x, label) for x in value)
    except TypeError as exc:
        raise ValueError(label + ' needs three finite coordinates') from exc
    if len(result) != 3:
        raise ValueError(label + ' needs three finite coordinates')
    return result


def _index(value, count, label):
    if isinstance(value, bool) or not isinstance(value, Integral) or not 0 <= value < count:
        raise ValueError(label + ' must name an existing vertex')
    return int(value)


def _indices(values, count, label):
    try:
        result = tuple(_index(i, count, label) for i in values)
    except TypeError as exc:
        raise ValueError(label + ' needs explicit vertex indices') from exc
    if not result or len(set(result)) != len(result):
        raise ValueError(label + ' must be nonempty without duplicate vertices')
    return result


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _dot(a, b):
    return math.fsum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _linear(matrix, point):
    return tuple(_dot(row[:3], point) for row in matrix[:3])


def _world(matrix, points):
    return [tuple(math.fsum((matrix[i][3], *(matrix[i][j]*p[j] for j in range(3))))
                  for i in range(3)) for p in points]


def _precision(points):
    magnitude = max((abs(x) for p in points for x in p), default=0.)
    if not math.isfinite(magnitude) or magnitude > 3.4028234663852886e38:
        raise ValueError('coordinates exceed native finite range')
    return 8*max(2**-149, 2.**(math.frexp(magnitude)[1]-24)) if magnitude else 8*2**-149


def _storage_precision(matrix, points):
    """Propagate per-axis native local-coordinate resolution into world units."""
    points = tuple(points)
    errors = [_precision(((max((abs(p[j]) for p in points), default=0.), 0., 0.),)) for j in range(3)]
    return math.hypot(*(math.fsum(abs(matrix[i][j])*errors[j] for j in range(3)) for i in range(3)))


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
    return matrix


def _shell_modifier(obj):
    types = [m.type for m in obj.modifiers]
    if types != [kind for kind in ('SOLIDIFY', 'BEVEL', 'WEIGHTED_NORMAL') if kind in types]:
        raise ValueError('source supports optional Solidify, Bevel and Weighted Normal in that order without duplicates')
    if any(m.show_viewport != m.show_render for m in obj.modifiers):
        raise ValueError('source modifiers must have matching viewport/render visibility')
    if not types or types[0] != 'SOLIDIFY':
        return None
    m = obj.modifiers[0]
    if (not m.show_viewport or not m.show_render
            or m.solidify_mode != 'EXTRUDE' or not m.use_rim or m.use_rim_only or m.vertex_group
            or m.thickness_clamp != 0 or not math.isfinite(m.thickness) or m.thickness <= 0
            or not math.isfinite(m.offset) or not -1 <= m.offset <= 1):
        raise ValueError('source Solidify must be enabled plain EXTRUDE with rims')
    return m


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
                raise ValueError('evaluated coordinates must remain finite')
            return points, [tuple(p.vertices) for p in data.polygons], [tuple(t.vertices) for t in data.loop_triangles]
        finally:
            evaluated.to_mesh_clear()
    finally:
        for m, viewport, render in flags:
            m.show_viewport, m.show_render = viewport, render
        if flags:
            bpy.context.view_layer.update()


def _cycle(face):
    face = tuple(face)
    return min(seq[i:]+seq[:i] for seq in (face, face[::-1]) for i in range(len(seq)))


def _shell_points(obj, matrix):
    """Verify both face sets and every rim at the supported Solidify prefix."""
    points, faces, _ = _evaluate(obj, list(obj.modifiers)[1:])
    n = len(obj.data.vertices)
    original = [tuple(p.vertices) for p in obj.data.polygons]
    uses = Counter(tuple(sorted((f[i-1], f[i]))) for f in original for i in range(len(f)))
    expected = Counter(_cycle(f) for f in original)
    outer = Counter(_cycle(f) for f in faces if all(i < n for i in f))
    inner = Counter(_cycle(tuple(i-n for i in f)) for f in faces if all(i >= n for i in f))
    rims = Counter(_cycle(f) for f in faces if any(i < n for i in f) and any(i >= n for i in f))
    expected_rims = Counter(_cycle((a, b, b+n, a+n)) for (a, b), count in uses.items() if count == 1)
    if len(points) != 2*n or outer != expected or inner != expected or rims != expected_rims:
        raise ValueError('Solidify output does not have the supported source-to-shell face correspondence')
    return _world(matrix, points)


def _solve(points, edges, pins):
    """Minimize ||L d||² with exact pins; L is the full symmetric graph operator."""
    n = len(points)
    neighbors = [[] for _ in points]
    lengths = [math.dist(points[a], points[b]) for a, b in edges]
    if not lengths or any(not math.isfinite(v) or v <= 0 for v in lengths):
        raise ValueError('source edges need finite positive lengths')
    scale = math.fsum(lengths)/len(lengths)
    for (a, b), length in zip(edges, lengths):
        w = scale/length
        if not math.isfinite(w):
            raise ValueError('edge weights exceed numeric range')
        neighbors[a].append((b, w))
        neighbors[b].append((a, w))
    free = [i for i in range(n) if i not in pins]
    unseen = set(free)
    while unseen:
        pending = [unseen.pop()]
        anchored = False
        while pending:
            for j, _ in neighbors[pending.pop()]:
                if j in pins:
                    anchored = True
                elif j in unseen:
                    unseen.remove(j)
                    pending.append(j)
        if not anchored:
            raise ValueError('each free connected component requires a Dirichlet anchor')
    degree = [math.fsum(w for _, w in ns) for ns in neighbors]
    rows = set(free) | {j for i in free for j, _ in neighbors[i]}
    diagonal = [degree[i]**2 + math.fsum(w*w for _, w in neighbors[i]) for i in free]
    if any(not math.isfinite(v) or v <= 0 for v in diagonal):
        raise ValueError('invalid displacement operator diagonal')

    def apply(values):
        first = {i: degree[i]*values.get(i, 0.) - math.fsum(w*values.get(j, 0.) for j, w in neighbors[i])
                 for i in rows}
        return [degree[i]*first[i] - math.fsum(w*first[j] for j, w in neighbors[i]) for i in free]

    result = [list(pins.get(i, (0., 0., 0.))) for i in range(n)]
    iterations, residuals = [], []
    for axis in range(3):
        rhs = [-v for v in apply({i: p[axis] for i, p in pins.items() if p[axis]})]
        norm = max(map(abs, rhs), default=0.)
        if not math.isfinite(norm):
            raise ValueError('displacement right-hand side exceeds numeric range')
        x, r = [0.]*len(free), rhs[:]
        z = [a/b for a, b in zip(r, diagonal)]
        p, rz, steps = z[:], _dot(r, z), 0
        if norm:
            for steps in range(1, 5001):
                ap = apply(dict(zip(free, p)))
                denominator = _dot(p, ap)
                if not math.isfinite(denominator) or denominator <= 0 or not math.isfinite(rz):
                    raise ValueError('displacement solve lost positive definiteness or finite precision')
                alpha = rz/denominator
                x = [a+alpha*b for a, b in zip(x, p)]
                r = [a-alpha*b for a, b in zip(r, ap)]
                if max(map(abs, r), default=0.) <= norm*1e-10:
                    break
                z = [a/b for a, b in zip(r, diagonal)]
                next_rz = _dot(r, z)
                p = [a+(next_rz/rz)*b for a, b in zip(z, p)]
                rz = next_rz
            else:
                raise ValueError('displacement solve did not converge within 5000 iterations')
        actual = apply(dict(zip(free, x)))
        residual = max((abs(a-b) for a, b in zip(actual, rhs)), default=0.)
        if any(not math.isfinite(v) for v in x+actual) or residual > norm*1e-8:
            raise ValueError('displacement solve failed its true residual check')
        for i, value in zip(free, x):
            result[i][axis] = value
        iterations.append(steps)
        residuals.append(residual)
    return result, iterations, residuals


def _bound(spec, keys):
    if not isinstance(spec, Mapping) or set(spec) != {'name', 'min', 'max'} | set(keys):
        raise ValueError('constraint needs name, min, max and ' + ', '.join(keys))
    name = spec['name']
    if not isinstance(name, str) or not name.strip():
        raise ValueError('constraint name must be nonempty')
    low, high = (_number(spec[key], name+' '+key) for key in ('min', 'max'))
    if low < 0 or high < low:
        raise ValueError(name + ': bounds require 0 <= min <= max')
    return name, low, high


def _obstacle(spec, source, count, origin, tolerance):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    name, low, high = _bound(spec, ('object', 'vertices', 'direction'))
    obj = spec['object']
    matrix = _static(obj, 'obstacle '+name)
    if obj == source or obj.data == source.data:
        raise ValueError(name + ': obstacle must be independent of the source')
    allowed = {'SOLIDIFY', 'BEVEL', 'SUBSURF', 'TRIANGULATE', 'WEIGHTED_NORMAL'}
    if any(m.type not in allowed or m.show_viewport != m.show_render
           or (m.type == 'SUBSURF' and m.levels != m.render_levels) for m in obj.modifiers):
        raise ValueError(name + ': obstacle has an unsupported or dependent modifier')
    indices = _indices(spec['vertices'], count, name)
    ray = _point(spec['direction'], name+' direction')
    length = math.hypot(*ray)
    if length == 0 or not math.isfinite(length) or high <= 0:
        raise ValueError(name + ': direction and maximum ray distance must be positive')
    ray = tuple(x/length for x in ray)
    points, _, triangles = _evaluate(obj)
    points = _world(matrix, points)
    if _precision(points) > tolerance or _precision(((high, 0., 0.),)) > tolerance:
        raise ValueError(name + ': tolerance is below native obstacle/ray precision')
    points = [_sub(p, origin) for p in points]
    if not triangles or any(_dot(v := _cross(_sub(points[b], points[a]), _sub(points[c], points[a])), v) == 0
                            for a, b, c in triangles):
        raise ValueError(name + ': obstacle needs finite nondegenerate evaluated triangles')
    precision = max(_precision(points), _precision(((high, 0., 0.),)), high*_precision((ray,)))
    tree = BVHTree.FromPolygons([Vector(p) for p in points], triangles, all_triangles=True)
    return name, low, high, indices, ray, tree, precision


def _observe(name, kind, actual, low, high, tolerance, **details):
    if not math.isfinite(actual) or actual < low-tolerance or actual > high+tolerance:
        raise ValueError(f'{name}: candidate {kind} {actual!r} outside [{low}, {high}] (tolerance {tolerance})')
    return {'name': name, 'kind': kind, 'actual': actual, 'min': low, 'max': high, **details}


def _postcheck(mesh, matrix, original, original_local, selected, targets, proposal, triangles,
               maximum, tolerance, distances, shell_pairs, obstacles):
    from mathutils import Vector
    stored = [tuple(v.co) for v in mesh.data.vertices]
    if any(stored[i] != original_local[i] for i in range(len(stored)) if i not in selected):
        raise ValueError('candidate changed a frozen cage vertex')
    points = _world(matrix, stored)
    if _precision(points) > tolerance:
        raise ValueError('candidate exceeds native precision for this tolerance')
    realization = max(math.dist(points[i], proposal[i]) for i in selected)
    if not math.isfinite(realization) or realization > tolerance:
        raise ValueError(f'candidate stored displacement field error {realization!r} exceeds tolerance {tolerance}')
    errors = [math.dist(points[i], target) for i, target in targets.items()]
    moves = [math.dist(a, b) for a, b in zip(original, points)]
    if max(errors) > tolerance or max(moves) > maximum+tolerance:
        raise ValueError(f'candidate misses hard targets or movement bound: error={max(errors)}, movement={max(moves)}')
    for a, b, c in triangles:
        before = _cross(_sub(original[b], original[a]), _sub(original[c], original[a]))
        after = _cross(_sub(points[b], points[a]), _sub(points[c], points[a]))
        if _dot(before, after) <= 0:
            raise ValueError('candidate degenerates or turns a cage triangle by at least 90 degrees')
    observations = []
    for name, low, high, (a, b) in distances:
        observations.append(_observe(name, 'cage pair distance', math.dist(points[a], points[b]),
                                     low, high, tolerance, vertices=[a, b]))
    if shell_pairs:
        shell = _shell_points(mesh, matrix)
        if _precision(shell) > tolerance:
            raise ValueError('candidate shell exceeds native precision for this tolerance')
        for name, low, high, i in shell_pairs:
            observations.append(_observe(name, 'Solidify pair distance', math.dist(shell[i], shell[i+len(stored)]),
                                         low, high, tolerance, vertex=i))
    origin = tuple(row[3] for row in matrix[:3])
    for name, low, high, indices, ray, tree, precision in obstacles:
        for i in indices:
            point = _sub(points[i], origin)
            hit, normal, _, gap = tree.ray_cast(Vector(point), Vector(ray), high+tolerance)
            if hit is None:
                raise ValueError(f'{name}: candidate ray at vertex {i} missed within maximum {high}')
            if any(not math.isfinite(x) for x in (*hit, *normal, gap)) or gap < 0:
                raise ValueError(f'{name}: candidate first ray hit at vertex {i} is numerically unresolved')
            facing = -_dot(normal, ray)
            if facing <= 1e-6:
                raise ValueError(f'{name}: candidate first ray hit at vertex {i} is back-facing or tangent')
            uncertainty = max(precision, _precision((point,)))/facing
            if uncertainty >= tolerance:
                raise ValueError(f'{name}: native ray precision cannot resolve tolerance at vertex {i}')
            observations.append(_observe(name, 'first-hit ray gap', gap, low, high, tolerance-uncertainty,
                                         vertex=i, uncertainty=uncertainty))
    return {'maxHandleError': max(errors), 'maxRealizationError': realization,
            'maxDisplacement': max(moves), 'outsideCageChange': 0.,
            'observations': observations}


def edit_region(mesh, *, region, handles, max_displacement, distances=(), shell_pairs=(),
                obstacles=(), tolerance=1e-5):
    """Edit an explicit ROI jointly, or raise ValueError and restore all coordinates.

    ``region`` is vertex indices or an existing binary group. ``handles`` maps
    region indices to absolute world targets. Bounds use ``{name,min,max}`` plus:
    ``distances``: ``vertices=(a,b)``; ``shell_pairs``: source ``vertex=i``;
    ``obstacles``: ``object``, sample ``vertices``, world ``direction``.
    Optional plain Solidify, Bevel and Weighted Normal are retained in that
    order, each at most once, with matching viewport/render visibility.
    Solidify must remain enabled. Shell pairs use its verified prefix before
    Bevel/Weighted Normal; final finish margins require separate inspection.
    A failed constraint rejects this proposal, not all possible feasible edits.
    Frozen exterior refers to the cage, not neighboring evaluated shell normals.
    ``trueResiduals`` describe the ideal linear solve; ``maxRealizationError``
    separately bounds every stored region point against that solved proposal.
    """
    import bpy
    from mathutils import Vector
    bpy.context.view_layer.update()
    matrix = _static(mesh, 'source')
    if mesh.data.users != 1:
        raise ValueError('source mesh data must have one user')
    solidify = _shell_modifier(mesh)
    tolerance, maximum = _number(tolerance, 'tolerance'), _number(max_displacement, 'max_displacement')
    if tolerance <= 0 or maximum < 0:
        raise ValueError('tolerance must be positive and max_displacement nonnegative')
    local = [tuple(v.co) for v in mesh.data.vertices]
    if any(not math.isfinite(x) for p in local for x in p):
        raise ValueError('source coordinates must be finite')
    points, n = _world(matrix, local), len(local)
    if _precision(points) > tolerance or _precision(((maximum, 0., 0.),)) > tolerance:
        raise ValueError('tolerance is below native world/displacement precision')
    if isinstance(region, str):
        group = mesh.vertex_groups.get(region)
        if group is None:
            raise ValueError('region must name an existing binary vertex group')
        weights = [next((g.weight for g in v.groups if g.group == group.index), 0.) for v in mesh.data.vertices]
        if any(w not in (0., 1.) for w in weights):
            raise ValueError('region group must contain only zero or one weights')
        region = [i for i, w in enumerate(weights) if w == 1.]
    selected = set(_indices(region, n, 'region'))
    if _storage_precision(matrix, (local[i] for i in selected)) > tolerance:
        raise ValueError('tolerance is below native local-coordinate precision in world space')
    if not isinstance(handles, Mapping) or not handles:
        raise ValueError('handles must map vertices to absolute world targets')
    targets = {_index(i, n, 'handle'): _point(p, 'handle target') for i, p in handles.items()}
    if not set(targets) <= selected:
        raise ValueError('all handles must be inside the explicit region')
    if _precision(targets.values()) > tolerance:
        raise ValueError('handle targets exceed native precision for this tolerance')
    mesh.data.calc_loop_triangles()
    triangles = [tuple(t.vertices) for t in mesh.data.loop_triangles]
    edges = [tuple(e.vertices) for e in mesh.data.edges]
    uses = Counter(tuple(sorted((p.vertices[i-1], p.vertices[i]))) for p in mesh.data.polygons
                   for i in range(len(p.vertices)))
    if (set(i for t in triangles for i in t) != set(range(n)) or not triangles
            or set(uses) != set(tuple(sorted(e)) for e in edges) or max(uses.values(), default=0) > 2
            or any(_dot(v := _cross(_sub(points[b], points[a]), _sub(points[c], points[a])), v) == 0
                   for a, b, c in triangles)):
        raise ValueError('source needs nondegenerate surface faces without loose or nonmanifold edges')
    pairs, shells, rays, names = [], [], [], set()
    for spec in distances:
        name, low, high = _bound(spec, ('vertices',))
        indices = _indices(spec['vertices'], n, name)
        if len(indices) != 2:
            raise ValueError(name + ': distance needs exactly two vertices')
        pairs.append((name, low, high, indices))
    for spec in shell_pairs:
        name, low, high = _bound(spec, ('vertex',))
        shells.append((name, low, high, _index(spec['vertex'], n, name)))
    if shells:
        if solidify is None:
            raise ValueError('shell pairs require the supported Solidify modifier')
        _shell_points(mesh, matrix)
    origin = tuple(row[3] for row in matrix[:3])
    for spec in obstacles:
        rays.append(_obstacle(spec, mesh, n, origin, tolerance))
    for name, *_ in pairs+shells+rays:
        if name in names:
            raise ValueError('constraint names must be unique')
        names.add(name)
    pins = {i: (0., 0., 0.) for i in range(n) if i not in selected}
    pins.update({i: _sub(p, points[i]) for i, p in targets.items()})
    delta, iterations, residuals = _solve(points, edges, pins)
    proposal = {i: tuple(math.fsum((p, d)) for p, d in zip(points[i], delta[i])) for i in selected}
    inverse = mesh.matrix_world.to_3x3().inverted()
    candidate = {i: tuple(a+b for a, b in zip(local[i], inverse@Vector(delta[i]))) for i in selected}
    if any(not math.isfinite(x) or abs(x) > 3.4028234663852886e38 for p in candidate.values() for x in p):
        raise ValueError('candidate local coordinates exceed native range')
    if _storage_precision(matrix, candidate.values()) > tolerance:
        raise ValueError('candidate exceeds native local-coordinate precision in world space')
    committed = False
    try:
        for i, p in candidate.items():
            if p != local[i]:
                mesh.data.vertices[i].co = p
        mesh.data.update()
        report = _postcheck(mesh, matrix, points, local, selected, targets, proposal, triangles, maximum, tolerance,
                            pairs, shells, rays)
        bpy.context.view_layer.update()
        committed = True
        return {'object': mesh.name, 'regionVertices': len(selected), 'handleCount': len(targets),
                'iterations': iterations, 'trueResiduals': residuals, **report,
                'scope': 'frozen source cage; Solidify pairs before finishes; finite named pair/ray samples only; no final finish, global thickness or collision guarantee'}
    finally:
        if not committed:
            for i in selected:
                mesh.data.vertices[i].co = local[i]
            mesh.data.update()
            bpy.context.view_layer.update()

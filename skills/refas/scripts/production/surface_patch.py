"""Construct ordinary meshes from explicit boundaries or corresponding sections.

Sample named profiles once and reuse their names in adjoining four-sided patches.
The patches share actual boundary vertex IDs; unrelated coincident coordinates
are never welded. Interior points use a Coons blend of all four boundaries.
The author chooses the reference-derived boundaries, profile handles and density.
This does not infer a shape, guarantee tangent continuity or test self-intersection.

Through-section construction samples the same profile spans at each authored
station and interpolates corresponding points. Named feature junctions remain
mesh columns, including when adjacent spans have different sample counts.

No managed controls, handlers or rebuild dependency remain in the result. Continue
with ordinary mesh edits and native modifiers. Coordinates undergo Blender's
normal float32 mesh storage; source boundary samples are otherwise unmodified.
"""
from collections.abc import Mapping
import math
from numbers import Integral, Real
import struct


def _point(value):
    try:
        value = tuple(value)
    except TypeError as exc:
        raise ValueError('a point needs three finite coordinates') from exc
    if len(value) != 3 or any(isinstance(x, bool) or not isinstance(x, Real) for x in value):
        raise ValueError('a point needs three finite coordinates')
    try:
        value = tuple(float(x) for x in value)
    except (OverflowError, ValueError) as exc:
        raise ValueError('point exceeds the supported numeric range') from exc
    if not all(math.isfinite(x) for x in value):
        raise ValueError('a point needs three finite coordinates')
    return value


def _label(value, prefix=''):
    if (not isinstance(value, str) or not value.strip()
            or any(ord(c) < 32 for c in value)
            or len((prefix + value).encode('utf-8')) > 63):
        raise ValueError('names must be nonempty, without control characters, and fit 63 UTF-8 bytes')
    return value


def _blend(a, b, t):
    return tuple(math.fsum(((1-t)*x, t*y)) for x, y in zip(a, b))


def sample_profile(segments, *, divisions):
    """Return immutable samples of an explicitly piecewise LINEAR/BEZIER profile.

    Each segment is ``('LINEAR', (start, end))`` or
    ``('BEZIER', (start, handle1, handle2, end))``. ``divisions`` supplies one
    positive integer interval count per segment. Consecutive segment endpoints
    must match exactly; reuse the same authored point rather than snapping gaps.
    Every segment endpoint appears exactly once at a join. No smoothing or
    automatic resampling changes straight sections or the authored breakpoints.
    """
    try:
        segments, divisions = tuple(segments), tuple(divisions)
    except TypeError as exc:
        raise ValueError('segments and divisions must be sequences') from exc
    if not segments or len(segments) != len(divisions):
        raise ValueError('one division count is required for every segment')
    result = []
    for segment, count in zip(segments, divisions):
        if isinstance(count, bool) or not isinstance(count, Integral) or count < 1:
            raise ValueError('profile divisions must be positive integers')
        try:
            kind, controls = segment
            controls = tuple(_point(point) for point in controls)
        except (TypeError, ValueError) as exc:
            raise ValueError('each segment needs its kind and control points') from exc
        if kind not in ('LINEAR', 'BEZIER') or len(controls) != (2 if kind == 'LINEAR' else 4):
            raise ValueError('LINEAR requires two points; BEZIER requires four')
        if result and result[-1] != controls[0]:
            raise ValueError('consecutive profile endpoints must match exactly')
        if not result:
            result.append(controls[0])
        for i in range(1, int(count)):
            row, t = controls, i / count
            while len(row) > 1:
                row = tuple(_blend(a, b, t) for a, b in zip(row, row[1:]))
            result.append(row[0])
        result.append(controls[-1])
    if any(a == b for a, b in zip(result, result[1:])):
        raise ValueError('profile samples must not have zero-length consecutive spans')
    return tuple(result)


def _quad_geometry(points, face):
    # Check the two fixed-diagonal triangles locally, including native float32
    # collapse. This is not a global intersection or curved-surface quality test.
    a, b, c, d = (points[i] for i in face)
    normals = []
    for p, q, r in ((a, b, c), (a, c, d)):
        x, y = tuple(v-u for u, v in zip(p, q)), tuple(v-u for u, v in zip(p, r))
        lx, ly = math.hypot(*x), math.hypot(*y)
        if lx == 0 or ly == 0:
            raise ValueError('surface contains a collapsed quad')
        x, y = tuple(v/lx for v in x), tuple(v/ly for v in y)
        n = (x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0])
        if math.hypot(*n) <= 1e-12:
            raise ValueError('surface contains a degenerate quad triangle')
        normals.append(n)
    if math.fsum(a*b for a, b in zip(*normals)) <= 0:
        raise ValueError('surface contains a locally folded quad; revise profiles or sampling')


def _surface(boundaries, patches):
    if not isinstance(boundaries, Mapping) or not isinstance(patches, Mapping) or not patches:
        raise ValueError('boundaries and nonempty patches must be named mappings')
    profiles = {}
    for name, values in boundaries.items():
        _label(name, 'boundary:')
        try:
            points = tuple(_point(point) for point in values)
        except TypeError as exc:
            raise ValueError(f'boundary {name!r} must contain sampled points') from exc
        if len(points) < 2 or any(a == b for a, b in zip(points, points[1:])):
            raise ValueError(f'boundary {name!r} needs at least two points and no zero-length spans')
        profiles[name] = points

    uses, used = {}, set()
    for name, values in patches.items():
        _label(name, 'patch:')
        try:
            values = tuple(values)
        except TypeError as exc:
            raise ValueError(f'patch {name!r} needs bottom, right, top and left boundaries') from exc
        if len(values) != 4:
            raise ValueError(f'patch {name!r} needs bottom, right, top and left boundaries')
        sides = []
        for value in values:
            try:
                key, reverse = value
            except (TypeError, ValueError) as exc:
                raise ValueError(f'patch {name!r}: a boundary use is (name, reverse_boolean)') from exc
            if not isinstance(key, str) or key not in profiles or type(reverse) is not bool:
                raise ValueError(f'patch {name!r}: boundary {key!r} needs an existing name and boolean direction')
            ids = tuple((key, i) for i in range(len(profiles[key])))
            sides.append(ids[::-1] if reverse else ids)
            used.add(key)
        if len({side[0][0] for side in sides}) != 4:
            raise ValueError(f'patch {name!r} must use four distinct named boundaries')
        bottom, right, top, left = sides
        if len(bottom) != len(top) or len(left) != len(right):
            counts = {side[0][0]: len(side) for side in sides}
            raise ValueError(f'patch {name!r}: opposite boundaries need equal sample counts; got {counts}')
        uses[name] = sides

    # Union only the corners explicitly connected by a patch. Equal spatial
    # coordinates elsewhere remain separate, including separate moving parts.
    parents = {(name, i): (name, i) for name, points in profiles.items() if name in used
               for i in range(len(points))}

    def root(key):
        while parents[key] != key:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key

    def position(key):
        return profiles[key[0]][key[1]]

    for name, (bottom, right, top, left) in uses.items():
        for a, b in ((bottom[0], left[0]), (bottom[-1], right[0]),
                     (top[0], left[-1]), (top[-1], right[-1])):
            if position(a) != position(b):
                raise ValueError(f'patch {name!r}: corner {a} and {b} coordinates must match exactly')
            parents[root(b)] = root(a)

    vertices, indices, boundary_groups = [], {}, {}
    for name, points in profiles.items():
        if name not in used:
            continue
        group = []
        for i, point in enumerate(points):
            key = root((name, i))
            if key not in indices:
                indices[key] = len(vertices)
                vertices.append(point)
            group.append(indices[key])
        boundary_groups[name] = group

    faces, patch_groups, patch_ids = [], {}, []
    for patch_index, (name, sides) in enumerate(uses.items()):
        bottom, right, top, left = sides
        B, R, T, L = (tuple(position(key) for key in side) for side in sides)
        bl, br, tl, tr = B[0], B[-1], T[0], T[-1]
        rows = []
        for j in range(len(left)):
            v, row = j/(len(left)-1), []
            for i in range(len(bottom)):
                key = (bottom[i] if j == 0 else top[i] if j == len(left)-1
                       else left[j] if i == 0 else right[j] if i == len(bottom)-1 else None)
                if key is not None:
                    row.append(indices[root(key)])
                    continue
                u = i/(len(bottom)-1)
                # Work relative to BL to avoid cancelling a large world origin.
                point = tuple(math.fsum((bl[k],
                    (1-v)*(B[i][k]-bl[k]), v*(T[i][k]-bl[k]),
                    (1-u)*(L[j][k]-bl[k]), u*(R[j][k]-bl[k]),
                    -u*(1-v)*(br[k]-bl[k]), -(1-u)*v*(tl[k]-bl[k]),
                    -u*v*(tr[k]-bl[k]))) for k in range(3))
                row.append(len(vertices))
                vertices.append(_point(point))
            rows.append(row)
        patch_groups[name] = sorted({i for row in rows for i in row})
        for a, b in zip(rows, rows[1:]):
            for i in range(len(bottom)-1):
                faces.append((a[i], a[i+1], b[i+1], b[i]))
                patch_ids.append(patch_index)

    try:
        stored = [struct.unpack('<3f', struct.pack('<3f', *p)) for p in vertices]
    except (OverflowError, struct.error) as exc:
        raise ValueError('surface coordinates exceed Blender mesh precision') from exc
    if any(not all(math.isfinite(x) for x in point) for point in stored):
        raise ValueError('surface coordinates exceed Blender mesh precision')
    edges, seen_faces = {}, set()
    patch_names = tuple(uses)
    for face_index, (face, patch_index) in enumerate(zip(faces, patch_ids)):
        context = f'patch {patch_names[patch_index]!r}, face {face_index}'
        if len(set(face)) != 4 or frozenset(face) in seen_faces:
            raise ValueError(f'{context}: collapsed or duplicate face')
        seen_faces.add(frozenset(face))
        try:
            _quad_geometry(stored, face)
        except ValueError as exc:
            raise ValueError(f'{context}: {exc}') from exc
        for a, b in zip(face, face[1:]+face[:1]):
            key = tuple(sorted((a, b)))
            prior = edges.setdefault(key, [])
            if len(prior) == 2 or prior == [(a, b)]:
                raise ValueError(f'{context}: shared edge {key} needs at most two oppositely wound faces')
            prior.append((a, b))
    return vertices, faces, boundary_groups, patch_groups, patch_ids


def _create_mesh(name, vertices, faces, groups, patch_ids=None):
    import bpy
    mesh = obj = None
    try:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        for key, group in groups.items():
            obj.vertex_groups.new(name=key).add(group, 1.0, 'REPLACE')
        if patch_ids is not None:
            attribute = mesh.attributes.new('refas_patch', 'INT', 'FACE')
            attribute.data.foreach_set('value', patch_ids)
        bpy.context.scene.collection.objects.link(obj)
        return obj
    except Exception:
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
        if mesh is not None:
            bpy.data.meshes.remove(mesh)
        raise


def build_surface(name, *, boundaries, patches):
    """Create and link one ordinary quad Mesh from named four-boundary patches.

    ``boundaries`` maps names to sampled 3D points. ``patches`` maps names to
    ``(bottom, right, top, left)`` uses; every use is ``(boundary_name, reverse)``.
    Bottom/top run left-to-right, while left/right run bottom-to-top, NOT in
    perimeter order. Opposite sides need equal counts and all four corners must
    match exactly. Reusing a boundary name shares its vertex IDs. Only explicit
    patch-corner connections merge endpoints; unused boundaries are not emitted.

    Groups ``boundary:<name>`` and ``patch:<name>`` retain ordinary edit selections.
    Face INT attribute ``refas_patch`` stores patch insertion-order indices.
    Geometry and quad ordering are deterministic for the supplied mapping order;
    Blender's later triangulation and modifier evaluation remain native behavior.

    Only the new mesh/object are created, linked to the current scene collection.
    Active object, selection, mode and existing data are untouched. Failed creation
    removes its new datablocks. Subsequent ordinary mesh edits need no helper or
    rebuild, and independent objects do not gain automatic deformation binding.
    This is an initial surface constructor, not a global geometry-quality test.
    """
    _label(name)
    try:
        vertices, faces, boundary_groups, patch_groups, patch_ids = _surface(boundaries, patches)
    except (OverflowError, ZeroDivisionError) as exc:
        raise ValueError('surface interpolation exceeds the supported numeric range') from exc
    groups = {prefix+key: group
              for prefix, source in (('boundary:', boundary_groups), ('patch:', patch_groups))
              for key, group in source.items()}
    return _create_mesh(name, vertices, faces, groups, patch_ids)


def _section_rows(sections, parameters, profile_divisions, section_divisions,
                  feature_names, interpolation):
    try:
        sections, parameters = tuple(sections), tuple(parameters)
        profile_divisions, section_divisions = tuple(profile_divisions), tuple(section_divisions)
        feature_names = tuple(feature_names)
    except TypeError as exc:
        raise ValueError('sections, parameters, divisions and feature names must be sequences') from exc
    if len(sections) < 2 or len(parameters) != len(sections):
        raise ValueError('at least two sections and one parameter per section are required')
    if interpolation not in ('LINEAR', 'CUBIC'):
        raise ValueError('section interpolation must be LINEAR or CUBIC')
    if any(isinstance(t, bool) or not isinstance(t, Real) for t in parameters):
        raise ValueError('section parameters must be finite and strictly increasing')
    try:
        parameters = tuple(float(t) for t in parameters)
    except (OverflowError, ValueError) as exc:
        raise ValueError('section parameters exceed the supported numeric range') from exc
    if (not all(math.isfinite(t) for t in parameters)
            or any(a >= b or not math.isfinite(b-a) for a, b in zip(parameters, parameters[1:]))):
        raise ValueError('section parameters must be finite and strictly increasing')
    if (len(section_divisions) != len(sections)-1
            or any(isinstance(n, bool) or not isinstance(n, Integral) or n < 1
                   for n in section_divisions)):
        raise ValueError('one positive section division count is required per section interval')
    profiles = tuple(sample_profile(section, divisions=profile_divisions) for section in sections)
    if not feature_names:
        feature_names = tuple(str(i) for i in range(len(profile_divisions)+1))
    if len(feature_names) != len(profile_divisions)+1:
        raise ValueError('feature names must name every profile junction, including both ends')
    for feature in feature_names:
        _label(feature, 'feature:')
    if len(set(feature_names)) != len(feature_names):
        raise ValueError('feature names must be unique')

    slopes = []
    if interpolation == 'CUBIC':
        for i in range(len(profiles)):
            lo, hi = max(0, i-1), min(len(profiles)-1, i+1)
            dt = parameters[hi]-parameters[lo]
            if not math.isfinite(dt):
                raise ValueError('section parameter span exceeds the supported numeric range')
            slopes.append(tuple(_point(tuple((q-p)/dt for p, q in zip(a, b)))
                                for a, b in zip(profiles[lo], profiles[hi])))

    rows, authored_rows = [profiles[0]], [0]
    for i, count in enumerate(section_divisions):
        a, b = profiles[i], profiles[i+1]
        dt = parameters[i+1]-parameters[i]
        for j in range(1, int(count)):
            u = j/count
            if interpolation == 'LINEAR':
                row = tuple(_point(_blend(p, q, u)) for p, q in zip(a, b))
            else:
                # Relative coordinates retain translation invariance without
                # cancelling large origins in the absolute Hermite basis.
                h = u*u*(3-2*u)
                h0, h1 = u*(u-1)*(u-1), u*u*(u-1)
                row = tuple(_point(tuple(math.fsum((p[k], h*(q[k]-p[k]),
                                  h0*dt*m0[k], h1*dt*m1[k])) for k in range(3)))
                            for p, q, m0, m1 in zip(a, b, slopes[i], slopes[i+1]))
            rows.append(row)
        rows.append(b)
        authored_rows.append(len(rows)-1)
    junctions = [0]
    for count in profile_divisions:
        junctions.append(junctions[-1]+int(count))
    return rows, authored_rows, dict(zip(feature_names, junctions))


def build_sections(name, *, sections, parameters, profile_divisions,
                   section_divisions, feature_names=(), interpolation='CUBIC'):
    """Create one ordinary quad Mesh through corresponding open profiles.

    ``sections`` is a sequence of the LINEAR/BEZIER segment sequences accepted
    by ``sample_profile``. Every section needs the same segment count and order;
    each segment junction must mean the same feature. ``profile_divisions``
    supplies shared per-segment interval counts, preserving junction columns
    even when counts differ between segments. There is no arc-length resampling.

    ``parameters`` supplies one finite strictly increasing station per section,
    independent of world axes. ``section_divisions`` gives one interval count
    between each adjacent section pair. Every authored section is retained.
    LINEAR joins corresponding samples directly. CUBIC is through-knot Hermite:
    endpoint derivatives use the adjacent secant; each internal derivative is
    (P[i+1]-P[i-1])/(t[i+1]-t[i-1]). One shared derivative gives longitudinal C1
    interpolation, not a monotone fit, exact surface continuity or a sparse cage.
    CUBIC may overshoot; divisions=1 retains only authored section rows.

    Groups ``section:0``, ``section:1``, ... select authored rows. Groups
    ``feature:<name>`` select full junction columns; optional ``feature_names``
    has segment-count + 1 unique names, otherwise names are 0, 1, ... . Cross-
    profile creases come from authored segment directions/handles. No smoothing,
    crease weights, Subdivision, caps, closed-seam welding or controls are added.

    Native float32 storage, local quad validation, caller-context preservation
    and failed-creation cleanup match ``build_surface``. This initial constructor
    does not replace an existing mesh or preserve layers across a rerun. The
    result needs no helper or rebuild to reopen, edit or add native modifiers.
    Reference interpretation, global intersections and tangent compatibility
    between arbitrary transverse spans remain the author's responsibility.
    """
    _label(name)
    try:
        rows, authored_rows, junctions = _section_rows(
            sections, parameters, profile_divisions, section_divisions,
            feature_names, interpolation)
        # Each pair of sampled rows is a patch with no interior row. This reuses
        # exact boundary sharing, deterministic indices and native-precision
        # validation; no second mesh writer or topology checker is needed.
        boundaries = {f'row:{i}': row for i, row in enumerate(rows)}
        patches = {}
        for i, (a, b) in enumerate(zip(rows, rows[1:])):
            boundaries[f'left:{i}'] = (a[0], b[0])
            boundaries[f'right:{i}'] = (a[-1], b[-1])
            patches[str(i)] = ((f'row:{i}', False), (f'right:{i}', False),
                               (f'row:{i+1}', False), (f'left:{i}', False))
        vertices, faces, boundary_groups, _, _ = _surface(boundaries, patches)
        groups = {f'section:{i}': boundary_groups[f'row:{row}']
                  for i, row in enumerate(authored_rows)}
        groups.update({f'feature:{key}': [boundary_groups[f'row:{i}'][column]
                                        for i in range(len(rows))]
                       for key, column in junctions.items()})
    except (OverflowError, ZeroDivisionError) as exc:
        raise ValueError('section interpolation exceeds the supported numeric range') from exc
    return _create_mesh(name, vertices, faces, groups)

"""Editable native controls for section_sweep's sampled open-guide sweep.

Guide and profile mesh vertices are authoritative. There is no live handler:
call rebuild_sweep after editing controls. Serialized display frames are
required coordinate bookkeeping, not cached source geometry. Generic native
object protection does not cover arbitrary custom properties.
"""
from __future__ import annotations

import math

from section_sweep import _dot, _point, _triangle_normal, sweep_sections


def _coordinates(mesh):
    return [tuple(vertex.co) for vertex in mesh.vertices]


def _write(mesh, coordinates):
    mesh.vertices.foreach_set('co', [x for point in coordinates for x in point])
    mesh.update()


def _flat(matrix):
    return [float(x) for row in matrix for x in row]


def _matrix(values):
    from mathutils import Matrix
    try:
        values = tuple(values)
        if len(values) != 16 or any(not math.isfinite(x) for x in values):
            raise ValueError("saved section frame must have 16 finite values")
        matrix = Matrix([values[i:i + 4] for i in range(0, 16, 4)])
    except (TypeError, OverflowError) as exc:
        raise ValueError("invalid saved section frame") from exc
    axes = [matrix.to_3x3().col[i] for i in range(3)]
    if (tuple(matrix[3]) != (0., 0., 0., 1.) or matrix.to_3x3().determinant() < .9999
            or any(abs(axis.length - 1) > 1e-5 for axis in axes)
            or any(abs(axes[i].dot(axes[j])) > 1e-5 for i in range(3) for j in range(i))):
        raise ValueError("saved section frame must be a rigid right-handed transform")
    return matrix


def _frame(center, axes):
    from mathutils import Matrix
    matrix = Matrix(axes).transposed().to_4x4()
    matrix.translation = center
    return matrix


def _static(obj, parent, *, output=False):
    import bpy
    from mathutils import Matrix
    if (not isinstance(obj, bpy.types.Object) or obj.type != 'MESH' or obj.mode != 'OBJECT'
            or obj.name not in bpy.context.scene.objects or not obj.is_editable
            or obj.parent != parent or obj.constraints or obj.animation_data is not None
            or obj.data.animation_data is not None or obj.data.shape_keys is not None
            or obj.rigid_body is not None or obj.data.users != 1 or not obj.data.is_editable):
        raise ValueError("sweep objects must be enabled static unshared meshes with their original parents")
    if obj.matrix_parent_inverse != Matrix.Identity(4):
        raise ValueError("sweep controls require identity parent inverses")
    if (obj.delta_location.length != 0 or any(obj.delta_rotation_euler)
            or tuple(obj.delta_rotation_quaternion) != (1., 0., 0., 0.)
            or tuple(obj.delta_scale) != (1., 1., 1.)):
        raise ValueError("apply delta transforms before rebuilding a sweep")
    matrix = obj.matrix_basis
    axes = [matrix.to_3x3().col[i] for i in range(3)]
    if (any(not math.isfinite(x) for x in _flat(matrix)) or matrix.to_3x3().determinant() <= 0
            or any(axis.length == 0 for axis in axes)
            or any(abs(axes[i].normalized().dot(axes[j].normalized())) > 1e-5
                   for i in range(3) for j in range(i))):
        raise ValueError("sweep transforms must be finite, nonsingular and free of reflection or shear")
    allowed = {'BEVEL', 'SOLIDIFY', 'SUBSURF', 'TRIANGULATE', 'WEIGHTED_NORMAL'} if output else set()
    if any(m.type not in allowed or m.show_viewport != m.show_render for m in obj.modifiers):
        raise ValueError("sweep object has an unsupported modifier")
    if not obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).is_evaluated:
        raise ValueError("sweep objects must remain enabled in the current view layer")
    if not output and (obj.get('refas_role') != 'construction' or not obj.hide_render):
        raise ValueError("sweep controls must retain their construction role and hide_render")
    if output and (obj.get('refas_role', 'asset') != 'asset' or obj.data.has_custom_normals):
        raise ValueError("sweep output must be an asset without custom split normals")


def _wire(obj, count, closed=False):
    expected = {tuple(sorted((i, (i + 1) % count))) for i in range(count if closed else count - 1)}
    actual = [tuple(sorted(edge.vertices)) for edge in obj.data.edges]
    if (len(obj.data.vertices) != count or obj.data.polygons
            or len(actual) != len(expected) or set(actual) != expected):
        raise ValueError("control topology changed; keep ordered guide/section vertices and edges")


def _controls(output):
    import bpy
    _static(output, None, output=True)
    if output.get('refas_sweep_version') != 1:
        raise ValueError("output is not a managed native sweep")
    n, m = output.get('refas_sweep_stations'), output.get('refas_sweep_size')
    closed, caps = output.get('refas_sweep_closed'), output.get('refas_sweep_caps')
    if (type(n) is not int or type(m) is not int or n < 2 or m < 2
            or type(closed) is not bool or type(caps) is not bool):
        raise ValueError("invalid saved sweep counts or flags")
    guide, axis = output.get('refas_sweep_guide'), output.get('refas_sweep_axis')
    group = output.get('refas_sweep_profiles')
    if group is None or set(group.keys()) != {str(i) for i in range(n)}:
        raise ValueError("saved ordered profile controls are missing")
    profiles = [group[str(i)] for i in range(n)]
    members = [guide, axis, *profiles]
    if len(set(members)) != len(members) or output in members:
        raise ValueError("sweep controls must be distinct owned objects")
    for obj, parent, kind in [(guide, output, 'guide'), (axis, guide, 'axis'),
                              *((profile, output, 'profile') for profile in profiles)]:
        _static(obj, parent)
        if obj.get('refas_sweep_owner') != output or obj.get('refas_sweep_kind') != kind:
            raise ValueError("sweep control ownership changed")
    _wire(guide, n)
    _wire(axis, 2)
    for index, profile in enumerate(profiles):
        if profile.get('refas_sweep_index') != index:
            raise ValueError("profile order changed; seam correspondence is explicit")
        _wire(profile, m, closed)
    # Mutating a managed profile must not alter another consumer. Object.users
    # does not count modifier targets, so inspect actual ID references instead.
    allowed = {output, *members, bpy.context.scene}
    pending, visited = list(members), set()
    while pending:
        source = pending.pop()
        if source in visited:
            continue
        visited.add(source)
        for user in bpy.data.user_map(subset={source})[source]:
            if isinstance(user, bpy.types.Collection):
                pending.append(user)
            elif user not in allowed:
                raise ValueError("sweep control or its collection has another consumer")
    return guide, axis, profiles, closed, caps


def _realized(vertices, faces, world):
    """Check stored float coordinates and both possible quad triangulations."""
    from mathutils import Vector
    stored = [tuple(Vector(point)) for point in vertices]
    world_ideal = [tuple(math.fsum(world[i][j] * point[j] for j in range(3)) + world[i][3]
                         for i in range(3)) for point in vertices]
    world_stored = [tuple(world @ Vector(point)) for point in stored]
    for intended, actual in ((vertices, stored), (world_ideal, world_stored)):
        if any(not math.isfinite(x) for point in actual for x in point):
            raise ValueError("sweep coordinates exceed Blender's numeric range")
        span = max(max(p[i] for p in intended) - min(p[i] for p in intended) for i in range(3))
        tolerance = span * 2 ** -20
        lengths = [math.dist(intended[a], intended[b]) for face in faces
                   for a, b in zip(face, face[1:] + face[:1])]
        if (not math.isfinite(tolerance) or tolerance <= 0 or min(lengths) <= 32 * tolerance
                or max(math.dist(a, b) for a, b in zip(intended, actual)) > tolerance):
            raise ValueError("sweep loses precision; recenter coordinates or reduce feature scale disparity")
        for face in faces:
            a, b, c = (actual[i] for i in face[:3])
            first = _triangle_normal(a, b, c)
            if len(face) == 4:
                d = actual[face[3]]
                if (_dot(first, _triangle_normal(a, c, d)) <= 0
                        or _dot(_triangle_normal(a, b, d), _triangle_normal(b, c, d)) <= 0):
                    raise ValueError("realized sweep has a folded surface quad")
    return stored


def _candidate(output, guide, axis, profiles, closed, caps):
    from mathutils import Matrix, Vector
    centers = [tuple(guide.matrix_basis @ vertex.co) for vertex in guide.data.vertices]
    initial = guide.matrix_basis.to_3x3() @ axis.matrix_basis.to_3x3() @ (axis.data.vertices[1].co - axis.data.vertices[0].co)
    sections, coordinates = [], []
    for profile in profiles:
        saved = _matrix(profile.get('refas_sweep_frame', ()))
        # An unchanged display transform is EXACT identity. Repeatedly baking
        # inverse(frame) @ frame would accumulate float noise in real controls.
        edit = Matrix.Identity(4) if profile.matrix_basis == saved else saved.inverted() @ profile.matrix_basis
        if (abs(edit[0][2]) > 1e-5 or abs(edit[1][2]) > 1e-5
                or abs(edit[2][0]) > 1e-5 or abs(edit[2][1]) > 1e-5 or edit[2][2] <= 0):
            raise ValueError("profile object edits must stay in its local XY plane")
        points = []
        for vertex in profile.data.vertices:
            if vertex.co.z != 0:
                raise ValueError("profile vertices must stay in their local XY plane")
            point = edit @ vertex.co
            if any(not math.isfinite(x) for x in point):
                raise ValueError("profile edit exceeds Blender's numeric range")
            # Use length-valued magnitudes only: a fixed world epsilon (or
            # unit matrix entries) would discard substantial small-scale edits.
            magnitude = max(*(abs(x) for x in point), *(abs(x) for x in saved.translation),
                            *(abs(x) for x in profile.matrix_basis.translation))
            if abs(point.z) > magnitude * 2 ** -20:
                raise ValueError("profile object edit leaves its local XY plane")
            points.append((point.x, point.y, 0.))
        coordinates.append(points)
        sections.append([point[:2] for point in points])
    sweep = sweep_sections(centers, sections, tuple(initial), closed_profile=closed, cap_ends=caps)
    vertices = _realized(sweep.vertices, sweep.faces, output.matrix_world)
    matrices = [_frame(center, frame) for center, frame in zip(centers, sweep.frames)]
    return vertices, sweep.faces, coordinates, matrices


def _postcheck(output, vertices, profiles, coordinates):
    if _coordinates(output.data) != vertices:
        raise ValueError("Blender did not preserve the prepared output coordinates")
    for profile, points in zip(profiles, coordinates):
        if _coordinates(profile.data) != points:
            raise ValueError("Blender did not preserve the prepared profile coordinates")
        _matrix(_flat(profile.matrix_basis))


def _report(output, guide, axis, profiles):
    return {'output': output.name, 'guide': guide.name, 'axis': axis.name,
            'profiles': [profile.name for profile in profiles],
            'vertices': len(output.data.vertices), 'faces': len(output.data.polygons),
            'scope': 'fixed-topology sampled open-guide sweep in output-local units; explicit rebuild; no global collision proof'}


def create_sweep(name, centers, profiles, initial_u, *, closed_profile, cap_ends=False, twist=None):
    """Create a native output and editable wire guide, start axis and profiles.

    Match sweep_sections' ordered samples and section correspondence. Initial
    absolute radians of twist are baked into real profile vertices. Controls
    use output-local units; moving/scaling the output moves the whole assembly.
    Guide-only transforms affect its path, independently of profile dimensions.
    """
    import bpy
    from mathutils import Vector
    if not isinstance(name, str) or not name.strip() or len(name.encode('utf-8')) > 63 or name in bpy.data.objects:
        raise ValueError("choose a new nonempty sweep name of at most 63 UTF-8 bytes")
    try:
        centers = tuple(_point(p, 3) for p in centers)
        profiles = tuple(tuple(_point(p, 2) for p in ring) for ring in profiles)
        initial_u = _point(initial_u, 3)
        twist = tuple(twist) if twist is not None else (0.,) * len(centers)
    except TypeError as exc:
        raise ValueError("sweep inputs must contain finite ordered samples") from exc
    sweep_sections(centers, profiles, initial_u, closed_profile=closed_profile, cap_ends=cap_ends, twist=twist)
    objects, meshes = [], []

    def make(label, vertices, edges=(), parent=None, kind=None):
        mesh = bpy.data.meshes.new(label + ' Mesh')
        meshes.append(mesh)
        mesh.from_pydata(vertices, edges, [])
        mesh.update()
        obj = bpy.data.objects.new(label, mesh)
        objects.append(obj)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        if kind:
            obj['refas_role'], obj.hide_render, obj.display_type = 'construction', True, 'WIRE'
            obj['refas_sweep_owner'], obj['refas_sweep_kind'] = objects[0], kind
        return obj

    try:
        output = make(name, [])
        guide = make(name + ' Guide', centers, [(i, i + 1) for i in range(len(centers) - 1)], output, 'guide')
        axis = make(name + ' StartAxis', [(0, 0, 0), tuple(Vector(initial_u).normalized())], [(0, 1)], guide, 'axis')
        axis.location = centers[0]
        controls = []
        m = len(profiles[0])
        edges = [(i, (i + 1) % m) for i in range(m if closed_profile else m - 1)]
        for index, (ring, angle) in enumerate(zip(profiles, twist)):
            c, s = math.cos(angle), math.sin(angle)
            points = [(x*c - y*s, x*s + y*c, 0.) for x, y in ring]
            profile = make(name + ' Section ' + str(index), points, edges, output, 'profile')
            profile['refas_sweep_index'] = index
            controls.append(profile)
        output['refas_sweep_version'] = 1
        output['refas_sweep_guide'], output['refas_sweep_axis'] = guide, axis
        output['refas_sweep_profiles'] = {str(i): profile for i, profile in enumerate(controls)}
        output['refas_sweep_stations'], output['refas_sweep_size'] = len(centers), m
        output['refas_sweep_closed'], output['refas_sweep_caps'] = closed_profile, cap_ends
        bpy.context.view_layer.update()
        centers = _coordinates(guide.data)
        base = sweep_sections(centers, [[p[:2] for p in _coordinates(o.data)] for o in controls],
                              tuple(axis.data.vertices[1].co), closed_profile=closed_profile, cap_ends=cap_ends)
        for profile, center, frame in zip(controls, centers, base.frames):
            profile.matrix_basis = _frame(center, frame)
            profile['refas_sweep_frame'] = _flat(profile.matrix_basis)
        bpy.context.view_layer.update()
        _controls(output)
        vertices, faces, coordinates, matrices = _candidate(output, guide, axis, controls, closed_profile, cap_ends)
        output.data.from_pydata(vertices, [], faces)
        output.data.update()
        _postcheck(output, vertices, controls, coordinates)
        return _report(output, guide, axis, controls)
    except Exception:
        for obj in reversed(objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in meshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.context.view_layer.update()
        raise


def rebuild_sweep(output):
    """Rebuild only an owned sweep, preserving fixed topology and mesh layers.

    Edit guide/profile vertices or planar profile object rotation/scale/offset.
    Planar transforms are baked once into profile vertices, then the controls
    follow the rebuilt guide frames. Topology, flags and seam order are fixed;
    create a new sweep for different connectivity. Output material assignments,
    UV/color/weight data and object identity remain intact. Shape keys, custom
    normals, animation, shared meshes and out-of-plane controls are rejected.

    Failure restores the call-entry output/controls, including already edited
    controls; it does not undo the caller's earlier edits. No file is written.
    """
    import bpy
    bpy.context.view_layer.update()
    guide, axis, profiles, closed, caps = _controls(output)
    vertices, faces, coordinates, matrices = _candidate(output, guide, axis, profiles, closed, caps)
    edges = {tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1])}
    if (len(output.data.vertices) != len(vertices)
            or [tuple(face.vertices) for face in output.data.polygons] != list(faces)
            or len(output.data.edges) != len(edges)
            or {tuple(sorted(edge.vertices)) for edge in output.data.edges} != edges):
        raise ValueError("output connectivity changed; rebuild only the original generated topology")
    old_vertices = _coordinates(output.data)
    old_controls = [(_coordinates(o.data), o.matrix_basis.copy(), list(o['refas_sweep_frame'])) for o in profiles]
    try:
        _write(output.data, vertices)
        for profile, points, matrix in zip(profiles, coordinates, matrices):
            _write(profile.data, points)
            profile.matrix_basis = matrix
        bpy.context.view_layer.update()
        _postcheck(output, vertices, profiles, coordinates)
        for profile in profiles:
            profile['refas_sweep_frame'] = _flat(profile.matrix_basis)
    except Exception:
        _write(output.data, old_vertices)
        for profile, (points, matrix, saved) in zip(profiles, old_controls):
            _write(profile.data, points)
            profile.matrix_basis = matrix
            profile['refas_sweep_frame'] = saved
        bpy.context.view_layer.update()
        raise
    return _report(output, guide, axis, profiles)

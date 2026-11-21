"""Rebuild the prototype's sewn shell with matched, rounded 40-edge armholes.

Run inside Blender through produce.py. Existing cuff, belt and ornament objects
are retained. The major shell's vertex indices intentionally change; named
groups expose the rebuilt body, sleeve and seam regions for subsequent edits.
"""
import bpy
import bmesh
import collections
import hashlib
import json
import math
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def fingerprint(ob):
    d = {"matrix": [list(r) for r in ob.matrix_world],
         "materials": [m.name if m else None for m in ob.data.materials]}
    if ob.type == 'MESH':
        d.update(vertices=[list(v.co) for v in ob.data.vertices],
                 faces=[list(p.vertices) for p in ob.data.polygons],
                 material_indices=[p.material_index for p in ob.data.polygons])
    d['modifiers'] = [(m.name, m.type, getattr(m, 'levels', None),
                       getattr(m, 'thickness', None), getattr(m, 'width', None))
                      for m in ob.modifiers]
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()


before = {o.name: fingerprint(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
body = bpy.data.objects['Body | continuous open front and shoulder yoke']
cloth = bpy.data.materials['Main | charcoal woven wool']
lining = bpy.data.materials['Interior | black satin lining']
seammat = bpy.data.materials['Seams | tonal thread']

# The opening is a fitted chest edge underneath the turned facing, rather than
# the old large triangular chest cutout. Closed-ellipse inference remains .68 m
# at the hem and approximately .90 m at the chest.
profiles = [(0, .132, .084, .063), (.008, .133, .085, .063),
            (.04, .135, .087, .065), (.10, .140, .093, .070),
            (.16, .151, .101, .078), (.215, .166, .109, .086),
            (.255, .176, .111, .090), (.295, .183, .107, .088),
            (.335, .186, .099, .077), (.375, .188, .089, .063),
            (.405, .190, .077, .049)]
N = 80
verts, faces = [], []


def vid(k, j):
    return k * (N + 1) + j


def angle(j, a):
    sector = min(j // 20, 3)
    t = (j - sector * 20) / 20
    ends = [a, math.pi / 2, math.pi, 3 * math.pi / 2, 2 * math.pi - a]
    return ends[sector] * (1 - t) + ends[sector + 1] * t


for k, (z, rx, ry, opening) in enumerate(profiles):
    for j in range(N + 1):
        th = angle(j, math.asin(opening / rx))
        zz = z
        if k == 10:
            zz += .015 * abs(math.cos(th)) ** 2
        verts.append(Vector((rx * math.sin(th), -ry * math.cos(th), zz)))
for k in range(10):
    for j in range(N):
        if k >= 6 and (12 <= j < 28 or 52 <= j < 68):
            continue
        faces.append((vid(k, j), vid(k, j + 1), vid(k + 1, j + 1), vid(k + 1, j)))

# Several shoulder rows distribute the neck-to-sleeve turn over a broad patch.
for t in [.30, .65, 1.0]:
    k = len(verts) // (N + 1)
    for j in range(N + 1):
        th = angle(j, .48)
        neck = Vector((.067 * math.sin(th), -.063 * math.cos(th), .420))
        shoulder = verts[vid(10, j)]
        p = shoulder.lerp(neck, t)
        p.z += .004 * math.sin(math.pi * t)
        verts.append(p)
    for j in range(N):
        faces.append((vid(k - 1, j), vid(k - 1, j + 1), vid(k, j + 1), vid(k, j)))

body_count = len(verts)
groups = {'Body panels | rebuilt fitted shell': list(range(body_count))}
seam_edges = []
axis0 = Vector((.258, -.018, -.966)).normalized()


def radius(s):
    prof = [(0, .060), (.035, .066), (.12, .061), (.24, .052),
            (.32, .048), (.43, .045), (.52, .0415), (.58, .041)]
    for (a, ra), (b, rb) in zip(prof, prof[1:]):
        if a <= s <= b:
            return ra + (rb - ra) * (s - a) / (b - a)
    return .041


def sleeve_point(side, s, a):
    ax = Vector((side * axis0.x, axis0.y, axis0.z))
    u = Vector((side * .966, 0, .258)).normalized()
    v = ax.cross(u).normalized()
    c = Vector((side * .19, 0, .39)) + ax * s
    c.y -= .007 * math.sin(math.pi * s / .58) ** 2
    r = radius(s) + .0015 * math.exp(-((s - .28) / .09) ** 2) * math.sin(a * 3 + s * 85)
    return c + u * (r * math.cos(a)) + v * (r * .96 * math.sin(a))


for side, center in [(1, 20), (-1, 60)]:
    pre = 'L' if side == 1 else 'R'
    # 40 equally spaced boundary samples, without the previous 42/40 zipper.
    loop = ([vid(10, j) for j in range(center, center - 9, -1)] +
            [vid(k, center - 8) for k in range(9, 5, -1)] +
            [vid(6, j) for j in range(center - 7, center + 9)] +
            [vid(k, center + 8) for k in range(7, 11)] +
            [vid(10, j) for j in range(center + 7, center, -1)])
    assert len(loop) == 40
    for j, idx in enumerate(loop):
        a = 2 * math.pi * j / 40
        verts[idx] = Vector((side * (.170 + .022 * max(math.cos(a), 0)),
                             -side * .064 * math.sin(a), .326 + .080 * math.cos(a)))
    seam_edges.extend(tuple(sorted((a, b))) for a, b in zip(loop, loop[1:] + loop[:1]))
    ids = []
    previous = loop
    ax = Vector((side * axis0.x, axis0.y, axis0.z))
    for t in [.16, .34, .54, .76, 1.0]:
        ring = []
        for j, root_index in enumerate(loop):
            a = 2 * math.pi * j / 40
            p = verts[root_index]
            q = sleeve_point(side, .20, a)
            top = max(math.cos(a), 0)
            bottom = max(-math.cos(a), 0)
            c1 = p + Vector((side * (.025 + .021 * top - .025 * bottom),
                              -side * .009 * math.sin(a), -.030 + .027 * top))
            c2 = q - ax * .055
            pos = (1-t)**3*p + 3*(1-t)**2*t*c1 + 3*(1-t)*t*t*c2 + t**3*q
            ring.append(len(verts)); ids.append(len(verts)); verts.append(pos)
        for j in range(40):
            faces.append((previous[j], previous[(j + 1) % 40], ring[(j + 1) % 40], ring[j]))
        previous = ring
    for s in [.26, .31, .36, .42, .48, .52, .55, .575, .58]:
        ring = []
        for j in range(40):
            ring.append(len(verts)); ids.append(len(verts))
            verts.append(sleeve_point(side, s, 2 * math.pi * j / 40))
        for j in range(40):
            faces.append((previous[j], previous[(j + 1) % 40], ring[(j + 1) % 40], ring[j]))
        previous = ring
    groups[pre + ' Sleeve | rebuilt editable region'] = ids
    groups[pre + ' Armhole | shared 40-edge seam'] = loop

# Remove the grid's unused vertices inside the armhole cutouts.
used = sorted(set(i for f in faces for i in f))
remap = {old: new for new, old in enumerate(used)}
me = bpy.data.meshes.new('Fitted shell with matched rounded sleeve caps')
me.from_pydata([verts[i] for i in used], [], [tuple(remap[i] for i in f) for f in faces])
me.update()
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
body.data = me
me.materials.append(cloth); me.materials.append(lining)
for p in me.polygons:
    p.use_smooth = True
for g in list(body.vertex_groups):
    body.vertex_groups.remove(g)
for name, ids in groups.items():
    body.vertex_groups.new(name=name).add([remap[i] for i in ids if i in remap], 1.0, 'REPLACE')
for m in body.modifiers:
    if m.type == 'SUBSURF':
        m.levels = m.render_levels = 2
body['construction'] = 'One continuous sewn shell; matched 40-edge elliptical armholes; cubic sleeve caps; three shoulder rows.'
body['selection_semantics'] = 'Major-shell vertex indices rebuilt. Use the named Body, Sleeve and Armhole groups.'

# Exact swatch conversion, with a matte diffuse cloth response. Lighting and
# exposure are left to the unchanged review specification.
def srgb(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

color = tuple(srgb(x / 255) * .20 for x in (26, 26, 31))
p = cloth.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (*color, 1)
p.inputs['Roughness'].default_value = .85
p.inputs['Specular IOR Level'].default_value = .018
p.inputs['Sheen Weight'].default_value = 0
cloth.diffuse_color = (*color, 1)

# Fit the existing shoulder tabs and their trim to the actual evaluated surface.
bpy.context.view_layer.update()
ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); em = ev.to_mesh()
bvh = BVHTree.FromPolygons([body.matrix_world @ v.co for v in em.vertices],
                          [list(p.vertices) for p in em.polygons])
fitted = []
for pre in ['L', 'R']:
    for suffix, offset in [('tab', .002), ('pale edge', .003)]:
        ob = bpy.data.objects[pre + ' Shoulder | ' + suffix]
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            hit, normal, face, dist = bvh.ray_cast(Vector((w.x, w.y, 1)), Vector((0, 0, -1)), 2)
            assert hit is not None
            w.z = hit.z + offset
            v.co = ob.matrix_world.inverted() @ w
        ob.data.update(); fitted.append(ob.name)
    ob = bpy.data.objects[pre + ' Shoulder | button']
    hit, _, _, _ = bvh.ray_cast(Vector((ob.location.x, ob.location.y, 1)), Vector((0, 0, -1)), 2)
    ob.location.z = hit.z + .005
    fitted.append(ob.name)
ev.to_mesh_clear()

# Rebuild round thread tubes from projected centerlines. Projecting every old
# tube vertex had flattened its cross-section, producing broken bright marks.
def seam_path(name, points):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    cu = bpy.data.curves.new(name + ' fitted thread', 'CURVE')
    cu.dimensions = '3D'; cu.bevel_depth = .00028; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(points)-1)
    for point, co in zip(sp.points, points):
        point.co = (*co, 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(seammat)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.convert(target='MESH')
    for p in ob.data.polygons:
        p.use_smooth = True


seams = ['Back | centre tailoring seam', 'L body | princess seam', 'R body | princess seam',
         'L Sleeve | back seam', 'R Sleeve | back seam']
for side, name in [(0, seams[0]), (1, seams[1]), (-1, seams[2])]:
    points = []
    for i in range(85):
        z = .012 + i/84 * (.392 if side == 0 else .355)
        rx = next(a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0])
                  for a, b in zip(profiles, profiles[1:]) if a[0] <= z <= b[0])
        hit, normal, _, _ = bvh.ray_cast(Vector((side*rx*.69, .5, z)), Vector((0, -1, 0)), 1)
        if hit is not None:
            points.append(hit + normal*.00020)
    seam_path(name, points)
for side, name in [(1, seams[3]), (-1, seams[4])]:
    points = []
    for i in range(100):
        s = .012 + i/99*.568
        p = sleeve_point(side, s, math.pi/2)
        hit, normal, _, _ = bvh.ray_cast(Vector((p.x, -side*.5, p.z)), Vector((0, side, 0)), 1)
        if hit is not None:
            points.append(hit + normal*.00020)
    seam_path(name, points)
thread = seammat.node_tree.nodes.get('Principled BSDF')
thread.inputs['Base Color'].default_value = (.0010, .00105, .00135, 1)
thread.inputs['Roughness'].default_value = .90
thread.inputs['Specular IOR Level'].default_value = .015
seammat.diffuse_color = (.0010, .00105, .00135, 1)

ec = collections.Counter(tuple(sorted((a, b))) for p in me.polygons
                         for a, b in zip(list(p.vertices), list(p.vertices)[1:] + list(p.vertices)[:1]))
seams_shared = all(ec[tuple(sorted((remap[a], remap[b])))] == 2 for a, b in seam_edges)
assert seams_shared
after = {o.name: fingerprint(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
allowed = {body.name, *fitted, *seams}
changed = sorted(n for n in before if before[n] != after[n])
assert all(n in allowed for n in changed), changed
assert all(before[n] == after[n] for n in before if '_Cuff_' in n or n.startswith(('L Ornament', 'L Chain')))
result = {'construction': body['construction'], 'changed_objects': changed,
          'protected_changed': [n for n in changed if n not in allowed],
          'cuffs_unchanged': True, 'ornament_geometry_unchanged': True,
          'shared_armhole_edges': len(seam_edges), 'all_armhole_edges_two_faces': seams_shared,
          'base_vertices': len(me.vertices), 'base_faces': len(me.polygons),
          'material_change': {'name': cloth.name, 'linear_srgb_1A1A1F_times_0_20': color,
                              'roughness': .85, 'specular_ior_level': .018, 'sheen_weight': 0,
                              'tonal_thread': 'Reduced brightness and projected new round centerline tubes'},
          'selection_semantics': body['selection_semantics']}
with open(os.path.join(REFAS_OUTPUT_DIR, 'surface-checks.json'), 'w') as f:
    json.dump(result, f, indent=2)
print('SURFACE_CHECKS', json.dumps(result))

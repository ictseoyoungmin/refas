"""Replace planar collar/facings with a turned collar and curved rolled lapels.

The stitched neckline overlap is intentional. No trim is used to close a seam.
Existing ornaments, cuff assemblies and their individual materials are retained.
"""
import bpy
import bmesh
import hashlib
import json
import math
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def fingerprint(ob):
    d = {'matrix': [list(r) for r in ob.matrix_world],
         'materials': [m.name if m else None for m in ob.data.materials],
         'vertices': [list(v.co) for v in ob.data.vertices],
         'faces': [list(p.vertices) for p in ob.data.polygons],
         'material_indices': [p.material_index for p in ob.data.polygons],
         'modifiers': [(m.name, m.type, getattr(m, 'levels', None),
                        getattr(m, 'thickness', None), getattr(m, 'width', None)) for m in ob.modifiers]}
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()


before = {o.name: fingerprint(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
cloth = bpy.data.materials['Main | charcoal woven wool']
lining = bpy.data.materials['Interior | black satin lining']
trim = bpy.data.materials['Piping | pale silver grey']
bpy.context.view_layer.update()
body = bpy.data.objects['Body | continuous open front and shoulder yoke']
ev_body = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
em_body = ev_body.to_mesh()
body_bvh = BVHTree.FromPolygons([body.matrix_world @ v.co for v in em_body.vertices],
                               [list(p.vertices) for p in em_body.polygons])
ev_body.to_mesh_clear()


def remove(name):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)


def mesh(name, vertices, faces, thickness=.0022, subd=2):
    remove(name)
    me = bpy.data.meshes.new(name + ' surface')
    me.from_pydata(vertices, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    me.materials.append(cloth); me.materials.append(lining)
    for p in me.polygons:
        p.use_smooth = True
    m = ob.modifiers.new('Soft fabric fold surface', 'SUBSURF')
    m.levels = m.render_levels = subd
    m = ob.modifiers.new('Turned cloth thickness', 'SOLIDIFY')
    m.thickness = thickness; m.offset = -1; m.material_offset = m.material_offset_rim = 1
    return ob


def path(name, points, radius=.00105):
    remove(name)
    cu = bpy.data.curves.new(name + ' curve', 'CURVE')
    cu.dimensions = '3D'; cu.resolution_u = 1
    cu.bevel_depth = radius; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p, v in zip(sp.points, points):
        p.co = (*v, 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(trim)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.convert(target='MESH')
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# A single cross-section runs up the stand, over a 5 mm rounded fold and down
# the outward collar leaf. Its front ends extend into the two collar points.
a0 = .90
angles = [a0, a0+.005] + [a0 + (2 * math.pi - 2*a0) * j / 96 for j in range(1, 96)] + [2*math.pi-a0-.005, 2*math.pi-a0]
vertices, faces, edge = [], [], []
for a in angles:
    end_distance = min(a - a0, 2 * math.pi - a0 - a)
    w = math.exp(-end_distance / .30)
    side = 1 if a < math.pi else -1
    base = Vector((.067*math.sin(a), -.063*math.cos(a), .418))
    leaf_radius = .086 - .007*max(-math.cos(a), 0)
    outer = Vector((leaf_radius*math.sin(a) + side*.070*w,
                    -leaf_radius*math.cos(a) - .044*w, .422 - .066*w))
    crest = Vector((.070*math.sin(a), -.066*math.cos(a), .451 - .019*w))
    points = [base, base + Vector((0, 0, .003)),
              Vector((.066*math.sin(a), -.062*math.cos(a), .439 - .012*w)),
              Vector((.0668*math.sin(a), -.063*math.cos(a), .447 - .017*w)),
              crest,
              Vector((.074*math.sin(a), -.070*math.cos(a), .450 - .019*w)),
              crest.lerp(outer, .30), crest.lerp(outer, .65),
              crest.lerp(outer, .96), outer]
    # The lowered front roll must clear the upper chest. Straight interpolation
    # alone crossed behind the body and hid the collar cut. Seat the leaf on the
    # real evaluated cloth, with front clearance and shoulder/back top clearance.
    for j in range(6, 10):
        p = points[j]
        if math.cos(a) > .30:
            hit, _, _, _ = body_bvh.ray_cast(Vector((p.x, -.5, p.z)), Vector((0, 1, 0)), 1)
            if hit is not None:
                p.y = min(p.y, hit.y - .0035)
        else:
            hit, _, _, _ = body_bvh.ray_cast(Vector((p.x, p.y, .7)), Vector((0, 0, -1)), 1)
            if hit is not None:
                p.z = max(p.z, hit.z + .0035)
    vertices.extend(points)
    edge.append(points[-1] + Vector((0, -.0005 if math.cos(a) > .30 else 0, .0005)))
rowsize = 10
for k in range(len(angles) - 1):
    for j in range(rowsize - 1):
        a = k*rowsize+j
        faces.append((a, a+1, a+rowsize+1, a+rowsize))
collar = mesh('Collar | standing back and neck facing', vertices, faces)
collar['construction'] = 'Continuous back/side stand, rounded roll and outward turned leaf; front roll ends lower/outward toward lapels; 2 mm stitched neckline overlap.'
path('Collar | pale upper edge', edge)
for pre in ['L', 'R']:
    remove(pre + ' Collar | pointed folded front')
    remove(pre + ' Collar | piped point')
for pre, row in [('L', 0), ('R', len(angles)-1)]:
    # Outline the actual front cut of the turned leaf, so its triangular point
    # and the separate lapel notch remain legible from the front.
    points = [Vector(vertices[row*rowsize+j]) + Vector((0, -.0005, .0005)) for j in range(4, 10)]
    path(pre + ' Collar | piped point', points)

# Two curved facing strips turn out from the front opening. A real widthwise
# roll controls their depth; the outline alone does not define the fold.
outline = [(.064, -.091, .016), (.075, -.096, .065),
           (.089, -.102, .120), (.110, -.110, .200),
           (.135, -.113, .275), (.149, -.112, .309),
           (.151, -.112, .313), (.111, -.119, .332),
           (.085, -.091, .381)]
profiles = [(0, .132, .084, .063), (.04, .135, .087, .065),
            (.10, .140, .093, .070), (.16, .151, .101, .078),
            (.215, .166, .109, .086), (.255, .176, .111, .090),
            (.295, .183, .107, .088), (.335, .186, .099, .077),
            (.375, .188, .089, .063), (.405, .190, .077, .049)]


def hinge(z):
    for a, b in zip(profiles, profiles[1:]):
        if a[0] <= z <= b[0]:
            t = (z-a[0])/(b[0]-a[0])
            rx, ry, opening = [a[i]*(1-t)+b[i]*t for i in (1, 2, 3)]
            return Vector((opening + .002, -ry*math.sqrt(1-(opening/rx)**2) - .001, z))
    raise ValueError(z)


outer_samples = []
for a, b in zip(outline, outline[1:]):
    a, b = Vector(a), Vector(b)
    steps = max(2, round((b-a).length / .010))
    for j in range(steps):
        outer_samples.append(a.lerp(b, j/steps))
outer_samples.append(Vector(outline[-1]))
ts = [0, .06, .18, .35, .57, .80, .95, 1]
for side in [1, -1]:
    pre = 'L' if side == 1 else 'R'
    vertices, faces, piped = [], [], []
    for outer in outer_samples:
        inside = hinge(outer.z)
        for t in ts:
            p = inside.lerp(outer, t)
            p.y -= .007*math.sin(math.pi*t)
            p.x *= side
            vertices.append(p)
        piped.append(Vector((side*outer.x, outer.y-.0005, outer.z)))
    for k in range(len(outer_samples)-1):
        for j in range(len(ts)-1):
            a = k*len(ts)+j
            faces.append((a, a+1, a+len(ts)+1, a+len(ts)))
    ob = mesh(pre + ' Lapel | folded lower notched facing', vertices, faces, .0024)
    ob['construction'] = 'Curved facing strip attached along the fitted front edge with a 7 mm softened outward roll.'
    path(pre + ' Lapel | fine piping', piped)
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); em = ev.to_mesh()
    bvh = BVHTree.FromPolygons([v.co for v in em.vertices], [list(p.vertices) for p in em.polygons])
    snap = bpy.data.objects[pre + ' lapel | silver snap']
    snap.location.x = side*.112; snap.location.z = .301
    hit, normal, face, dist = bvh.ray_cast(Vector((snap.location.x, -.5, snap.location.z)), Vector((0, 1, 0)), 1)
    if hit is not None:
        snap.location.y = hit.y - .002
    ev.to_mesh_clear()

# Under this fixed bright rig the exact palette swatch still rendered steel
# grey. Tune main cloth and lining response without altering review exposure
# or the separate metal, piping and strap materials.
def srgb(v):
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4

color = tuple(srgb(v/255)*.20 for v in (26, 26, 31))
p = cloth.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (*color, 1)
p.inputs['Roughness'].default_value = .85
p.inputs['Specular IOR Level'].default_value = .018
p.inputs['Sheen Weight'].default_value = 0
cloth.diffuse_color = (*color, 1)
cloth['reference_srgb'] = '#1A1A1F'
cloth['fixed_review_appearance_multiplier'] = .20
inner = lining.node_tree.nodes.get('Principled BSDF')
inner.inputs['Base Color'].default_value = (.0015, .0016, .0022, 1)
inner.inputs['Roughness'].default_value = .65
inner.inputs['Specular IOR Level'].default_value = .08
lining.diffuse_color = (.0015, .0016, .0022, 1)

after = {o.name: fingerprint(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
allowed = {n for n in before if 'Collar |' in n or 'Lapel |' in n or 'lapel | silver snap' in n}
changed = sorted(n for n in before if n not in after or before[n] != after[n])
assert all(n in allowed for n in changed), changed
assert all(before[n] == after[n] for n in before if '_Cuff_' in n or n.startswith(('L Ornament', 'L Chain')))
result = {'changed_objects': changed,
          'removed_objects': sorted(set(before)-set(after)),
          'protected_changed': [], 'cuff_geometry_unchanged': True,
          'ornament_geometry_unchanged': True,
          'collar': collar['construction'],
          'lapels': 'Curved facing strips; real softened roll; retained notched outline.',
          'main_material_appearance_multiplier': .20,
          'lining_change': 'Reduced satin glare so the empty interior reads as dark lining under the fixed rig.',
          'material_limit': 'Palette hue retained; base reflectance tuned darker for the unchanged fixed bright review rig.'}
with open(os.path.join(REFAS_OUTPUT_DIR, 'collar-checks.json'), 'w') as f:
    json.dump(result, f, indent=2)
print('COLLAR_CHECKS', json.dumps(result))

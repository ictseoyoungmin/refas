"""Refine the existing jacket collar and lapels without touching its sewn shell.

The border of the turned collar is one shaped edge. Its front corner and lower
cut are not separate intersecting piping strokes. Depth is inferred from the
sheet's oblique views; this is an editable static garment prototype.
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def fingerprint(ob):
    state = {'matrix': [list(r) for r in ob.matrix_world],
             'parent': ob.parent.name if ob.parent else None,
             'materials': [m.name if m else None for m in ob.data.materials],
             'vertices': [list(v.co) for v in ob.data.vertices],
             'faces': [list(p.vertices) for p in ob.data.polygons],
             'material_indices': [p.material_index for p in ob.data.polygons],
             'modifiers': [(m.name, m.type, getattr(m, 'levels', None),
                            getattr(m, 'thickness', None), getattr(m, 'width', None))
                           for m in ob.modifiers]}
    return hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()


before = {o.name: fingerprint(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
cloth = bpy.data.materials['Main | charcoal woven wool']
lining = bpy.data.materials['Interior | black satin lining']
trim = bpy.data.materials['Piping | pale silver grey']
body = bpy.data.objects['Body | continuous open front and shoulder yoke']
bpy.context.view_layer.update()
dep = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dep)
em = ev.to_mesh()
body_bvh = BVHTree.FromPolygons([body.matrix_world @ v.co for v in em.vertices],
                               [list(p.vertices) for p in em.polygons])
ev.to_mesh_clear()


def remove(name):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)


def surface(name, vertices, faces, thickness=.0022):
    remove(name)
    me = bpy.data.meshes.new(name + ' folded cloth cage')
    me.from_pydata(vertices, [], faces)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(cloth); me.materials.append(lining)
    for p in me.polygons:
        p.use_smooth = True
    sub = ob.modifiers.new('Soft cloth turn', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    sol = ob.modifiers.new('Actual cloth thickness', 'SOLIDIFY')
    sol.thickness = thickness; sol.offset = -1
    sol.material_offset = sol.material_offset_rim = 1
    return ob


def piping(name, points):
    remove(name)
    cu = bpy.data.curves.new(name + ' path', 'CURVE')
    cu.dimensions = '3D'; cu.bevel_depth = .00105; cu.bevel_resolution = 3
    cu.resolution_u = 1
    sp = cu.splines.new('POLY'); sp.points.add(len(points)-1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob); cu.materials.append(trim)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def interpolate(rows, u):
    for a, b in zip(rows, rows[1:]):
        if a[0] <= u <= b[0]:
            t = (u-a[0])/(b[0]-a[0])
            return Vector(a[1:]).lerp(Vector(b[1:]), t)
    return Vector(rows[-1][1:])


# In front projection the free edge has a broad collar corner and a short
# lower cut toward the lapel notch. The stand turns smoothly in depth before
# that leaf; a radial scaling of one flat polygon cannot produce this shape.
edge_profile = [(0, .073, -.117, .359),
                (.13, .127, -.104, .364),
                (.28, .081, -.052, .432),
                (.49, .085, .002, .427),
                (.74, .065, .064, .423),
                (1, 0, .085, .418)]
us = sorted(set([0, .002, .125, .13, .135, .998, 1] + [i/64 for i in range(1,64)]))
all_rows = [(1, u) for u in us] + [(-1, u) for u in reversed(us[:-1])]
vertices, faces, border = [], [], []
widths = [.06, .20, .40, .65, .85, .97, 1]
section_size = 5 + len(widths)
for side, u in all_rows:
    a = .48 + (math.pi-.48)*u
    base = Vector((.067*math.sin(a), -.063*math.cos(a), .418))
    crest = Vector((.069*math.sin(a), -.066*math.cos(a), .441 + .010*math.sin(math.pi*u/2)))
    outer = interpolate(edge_profile, u)
    # Give the short back leaf enough clearance over the unchanged shoulders.
    if u > .26:
        hit, _, _, _ = body_bvh.ray_cast(Vector((outer.x, outer.y, .7)), Vector((0,0,-1)), 1)
        if hit is not None:
            outer.z = max(outer.z, hit.z+.0025)
    radial = Vector((math.sin(a), -math.cos(a), 0))
    row = [base, base+Vector((0,0,.002)), base.lerp(crest,.60),
           crest-radial*.002-Vector((0,0,.002)), crest]
    for t in widths:
        q = crest.lerp(outer, t)
        # Rounded outward turn; its height and radial depth are independent.
        q += radial*(.0055*math.sin(math.pi*t))
        q.z += .004*math.sin(math.pi*t)
        row.append(q)
    for q in row:
        q.x *= side
        vertices.append(q)
    b = row[-1].copy()
    b.y -= .0007 if u < .30 else 0
    b.z += .00065
    border.append(b)
for k in range(len(all_rows)-1):
    for j in range(section_size-1):
        i=k*section_size+j
        faces.append((i,i+1,i+section_size+1,i+section_size))
collar = surface('Collar | standing back and neck facing', vertices, faces)
collar['construction'] = 'Continuous neck stand, rounded outward turn and broad free leaf with one notched border.'
piping('Collar | pale upper edge', border)
for pre in ('L','R'):
    remove(pre+' Collar | pointed folded front')
    remove(pre+' Collar | piped point')

# The upper edge terminates at the notch. The old extra upward facing strip
# made a second competing zigzag against the turned collar edge.
outline = [(0, .064, -.092, .016),
           (.15, .076, -.105, .090),
           (.45, .101, -.119, .202),
           (.72, .130, -.123, .292),
           (.84, .143, -.119, .320),
           (1, .075, -.119, .347)]
samples = sorted(set([0,.002,.837,.84,.843,.998,1]+[i/90 for i in range(1,90)]))
body_profiles = [(0,.132,.084,.063),(.04,.135,.087,.065),(.10,.140,.093,.070),
                 (.16,.151,.101,.078),(.215,.166,.109,.086),(.255,.176,.111,.090),
                 (.295,.183,.107,.088),(.335,.186,.099,.077),(.375,.188,.089,.063)]


def hinge(z):
    for a,b in zip(body_profiles,body_profiles[1:]):
        if a[0] <= z <= b[0]:
            t=(z-a[0])/(b[0]-a[0])
            rx,ry,x=[a[i]*(1-t)+b[i]*t for i in (1,2,3)]
            return Vector((x+.001,-ry*math.sqrt(1-(x/rx)**2)-.001,z))
    raise ValueError(z)


widths = [0,.035,.12,.27,.48,.72,.91,.98,1]
for side in (1,-1):
    pre='L' if side==1 else 'R'
    verts,faces,edge=[],[],[]
    for s in samples:
        outer=interpolate(outline,s)
        inside=hinge(outer.z)
        for t in widths:
            p=inside.lerp(outer,t)
            p.y-=.009*math.sin(math.pi*t)
            p.x*=side
            verts.append(p)
        edge.append(Vector((side*outer.x,outer.y-.0007,outer.z)))
    for k in range(len(samples)-1):
        for j in range(len(widths)-1):
            i=k*len(widths)+j
            faces.append((i,i+1,i+len(widths)+1,i+len(widths)))
    lapel=surface(pre+' Lapel | folded lower notched facing',verts,faces,.0024)
    lapel['construction']='Widthwise 9 mm outward roll attached to the unchanged open chest edge; one upper notch.'
    piping(pre+' Lapel | fine piping',edge)
    bpy.context.view_layer.update()
    ev=lapel.evaluated_get(bpy.context.evaluated_depsgraph_get());em=ev.to_mesh()
    bvh=BVHTree.FromPolygons([v.co for v in em.vertices],[list(p.vertices) for p in em.polygons])
    snap=bpy.data.objects[pre+' lapel | silver snap']
    snap.location.x=side*.112;snap.location.z=.298
    hit,_,_,_=bvh.ray_cast(Vector((snap.location.x,-.5,snap.location.z)),Vector((0,1,0)),1)
    assert hit is not None
    snap.location.y=hit.y-.002
    ev.to_mesh_clear()

bpy.context.view_layer.update()
after={o.name:fingerprint(o) for o in bpy.context.scene.objects if o.type=='MESH'}
allowed={n for n in before if 'Collar |' in n or 'Lapel |' in n or 'lapel | silver snap' in n}
changed=sorted(n for n in before if n not in after or before[n]!=after[n])
protected_changed=[n for n in changed if n not in allowed]
assert not protected_changed,protected_changed
assert before[body.name]==after[body.name]
result={'changed_objects':changed,'removed_objects':sorted(set(before)-set(after)),
        'added_objects':sorted(set(after)-set(before)),
        'protected_count':sum(n not in allowed for n in before),
        'protected_changed':protected_changed,'body_cage_and_modifiers_unchanged':True,
        'cuffs_and_ornament_unchanged':all(before[n]==after[n] for n in before if '_Cuff_' in n or n.startswith(('L Ornament','L Chain'))),
        'material_changes':[],'collar_stand_top_m':.451,'lapel_roll_depth_m':.009,
        'cloth_thickness_m':{'collar':.0022,'lapels':.0024},
        'body_back_center_anchor_m':.420,'sleeve_nominal_m':.58,
        'sleeve_limit':'Unchanged baseline cage meridian 0.607397 m; not a new garment pattern measurement.',
        'interpretation':'Depth and fold curvature inferred from source oblique views; no registered source cameras.',
        'before':before,'after':after}
(Path(REFAS_OUTPUT_DIR)/'fold-checks.json').write_text(json.dumps(result,indent=2))
print('FOLD_CHECKS',json.dumps({k:v for k,v in result.items() if k not in ('before','after')}))

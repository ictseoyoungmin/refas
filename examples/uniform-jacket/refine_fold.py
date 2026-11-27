"""Refine the existing jacket collar and lapels without touching its sewn shell.

The collar and lapels share actual gorge seam vertices. The collar free edge
tapers into one common notch anchor without a separate floating front tab. Depth is inferred from the
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


# The collar and both lapels are one sewn facing mesh. Each gorge is a
# shared 11-edge boundary, not two independently subdivided strips whose
# endpoints happen to be nearby. The outer edge still has the source notch.
gorge = Vector((.083, -.104, .354))
widths = [0, .02, .06, .12, .22, .36, .50, .66, .81, .93, .98, 1]
body_profiles = [(0,.132,.084,.063),(.04,.135,.087,.065),(.10,.140,.093,.070),
                 (.16,.151,.101,.078),(.215,.166,.109,.086),(.255,.176,.111,.090),
                 (.295,.183,.107,.088),(.335,.186,.099,.077),(.375,.188,.089,.063)]


def hinge(z):
    for a,b in zip(body_profiles,body_profiles[1:]):
        if a[0] <= z <= b[0]:
            t=(z-a[0])/(b[0]-a[0])
            rx,ry,x=[a[i]*(1-t)+b[i]*t for i in (1,2,3)]
            point=Vector((x+.001,-ry*math.sqrt(1-(x/rx)**2)-.001,z))
            nearest,normal,_,distance=body_bvh.find_nearest(point)
            if nearest is not None and distance < .025:
                point=nearest+normal*.0012
            return point
    raise ValueError(z)


outline = [(0, .064, -.092, .016),
           (.15, .076, -.103, .090),
           (.45, .101, -.115, .202),
           (.72, .130, -.118, .292),
           (.84, .140, -.114, .319),
           (1, *gorge)]
samples = sorted(set([0,.002,.837,.84,.843,.985,.995,1]+[i/80 for i in range(1,80)]))


def lapel_row(s):
    outer=interpolate(outline,s)
    inside=hinge(outer.z)
    # The roll reduces as it reaches the narrow gorge attachment. It is a
    # continuous folded surface, not a full-depth tab detached at its top.
    roll=.008*(1-.65*max(0,(s-.75)/.25))
    return [inside.lerp(outer,t)+Vector((0,-roll*math.sin(math.pi*t),0)) for t in widths]


gorge_row=lapel_row(1)
# The anterior free point projects sideways from the narrow common gorge;
# the upper part returns toward the neck, producing a tapered leaf.
edge_profile = [(0, *gorge),
                (.13, .126, -.103, .367),
                (.30, .080, -.045, .430),
                (.50, .084, .005, .428),
                (.75, .063, .065, .423),
                (1, 0, .085, .418)]
us=sorted(set([0,.008,.02,.125,.13,.135,.985,1]+[i/56 for i in range(1,56)]))
all_rows=[(1,u) for u in us]+[(-1,u) for u in reversed(us[:-1])]
vertices,faces,border=[],[],[]
section_size=len(widths)


def smooth(t):
    t=max(0,min(1,t))
    return t*t*(3-2*t)


for side,u in all_rows:
    angle=.48+(math.pi-.48)*u
    base=Vector((.067*math.sin(angle),-.063*math.cos(angle),.418))
    crest=Vector((.069*math.sin(angle),-.066*math.cos(angle),.441+.010*math.sin(math.pi*u/2)))
    outer=interpolate(edge_profile,u)
    radial=Vector((math.sin(angle),-math.cos(angle),0))
    if u>.24:
        hit,_,_,_=body_bvh.ray_cast(Vector((outer.x,outer.y,.7)),Vector((0,0,-1)),1)
        if hit is not None:
            outer.z=max(outer.z,hit.z+.0025)
    standard=[base,base+Vector((0,0,.002)),base.lerp(crest,.60),
              crest-radial*.002-Vector((0,0,.002)),crest]
    for t in widths[5:]:
        q=(t-widths[4])/(1-widths[4])
        point=crest.lerp(outer,q)
        point+=radial*(.0055*math.sin(math.pi*q))
        point.z+=.004*math.sin(math.pi*q)
        standard.append(point)
    turn=smooth(u/.24)
    row=[a.lerp(b,turn) for a,b in zip(gorge_row,standard)]
    edge_delta=outer-row[-1]
    row=[p+edge_delta*t for p,t in zip(row,widths)]
    # Seat the attachment edge on the actual existing cloth. The free leaf
    # remains unconstrained; this does not add a patch to hide the old gap.
    if u>0:
        nearest,normal,_,distance=body_bvh.find_nearest(row[0])
        if nearest is not None and distance < .035:
            delta=nearest+normal*.0012-row[0]
            row=[p+delta*(1-t)**2 for p,t in zip(row,widths)]
    else:
        row=[p.copy() for p in gorge_row]
    for point in row:
        point.x*=side
        vertices.append(point)
    free=row[-1].copy();free.y-=.0007 if u<.30 else 0;free.z+=.00065
    border.append(free)
for k in range(len(all_rows)-1):
    for j in range(section_size-1):
        i=k*section_size+j
        faces.append((i,i+1,i+section_size+1,i+section_size))
collar_ids=list(range(len(vertices)))
groups={'Collar stand and turned leaves':collar_ids}
seams=[]
for side in (1,-1):
    pre='L' if side==1 else 'R'
    start=0 if side==1 else (len(all_rows)-1)*section_size
    previous=list(range(start,start+section_size))
    groups[pre+' Gorge | shared cloth seam']=previous[:]
    seams.extend(tuple(sorted((a,b))) for a,b in zip(previous,previous[1:]))
    facing_ids=previous[:]
    edge=[Vector((side*gorge.x,gorge.y-.0007,gorge.z+.00065))]
    for s in reversed(samples[:-1]):
        ring=[]
        row=lapel_row(s)
        for p in row:
            p.x*=side;ring.append(len(vertices));facing_ids.append(len(vertices));vertices.append(p)
        for j in range(section_size-1):
            f=(previous[j],ring[j],ring[j+1],previous[j+1])
            faces.append(f if side==1 else tuple(reversed(f)))
        edge.append(row[-1]+Vector((0,-.0007,0)))
        previous=ring
    groups[pre+' Lapel | rolled facing']=facing_ids
    piping(pre+' Lapel | fine piping',edge)
    remove(pre+' Lapel | folded lower notched facing')
    remove(pre+' Collar | pointed folded front')
    remove(pre+' Collar | piped point')

collar=surface('Collar | standing back and neck facing',vertices,faces,.0022)
collar['construction']='One continuous collar/lapel facing with two shared gorge seams, tapered front leaves and a coherent outward roll.'
collar['selection_semantics']='Use named collar, left/right lapel and shared-gorge vertex groups; no separate lapel surface objects.'
for name,indices in groups.items():
    collar.vertex_groups.new(name=name).add(indices,1.0,'REPLACE')
piping('Collar | pale upper edge',border)
bpy.context.view_layer.update()
ev=collar.evaluated_get(bpy.context.evaluated_depsgraph_get());em=ev.to_mesh()
bvh=BVHTree.FromPolygons([v.co for v in em.vertices],[list(p.vertices) for p in em.polygons])
for side in (1,-1):
    pre='L' if side==1 else 'R'
    snap=bpy.data.objects[pre+' lapel | silver snap']
    snap.location.x=side*.111;snap.location.z=.297
    hit,_,_,_=bvh.ray_cast(Vector((snap.location.x,-.5,snap.location.z)),Vector((0,1,0)),1)
    assert hit is not None
    snap.location.y=hit.y-.002
ev.to_mesh_clear()

edge_counts={}
for polygon in collar.data.polygons:
    ids=list(polygon.vertices)
    for a,b in zip(ids,ids[1:]+ids[:1]):
        key=tuple(sorted((a,b)));edge_counts[key]=edge_counts.get(key,0)+1
assert all(edge_counts[e]==2 for e in seams)

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
        'material_changes':[],'collar_stand_top_m':.451,'lapel_roll_depth_m':.008,
        'shared_gorge_edges':len(seams),'all_gorge_edges_two_faces':True,
        'common_gorge_anchor_m':list(gorge),'selection_semantics':collar['selection_semantics'],
        'cloth_thickness_m':{'continuous_collar_and_lapels':.0022},
        'body_back_center_anchor_m':.420,'sleeve_nominal_m':.58,
        'sleeve_limit':'Unchanged baseline cage meridian 0.607397 m; not a new garment pattern measurement.',
        'interpretation':'Depth and fold curvature inferred from source oblique views; no registered source cameras.',
        'before':before,'after':after}
(Path(REFAS_OUTPUT_DIR)/'fold-checks.json').write_text(json.dumps(result,indent=2))
print('FOLD_CHECKS',json.dumps({k:v for k,v in result.items() if k not in ('before','after')}))

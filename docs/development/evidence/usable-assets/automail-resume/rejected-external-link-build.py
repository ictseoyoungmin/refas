"""Recover a functional AURIX continuation from the retained source-identity asset.

Run inside RefAs production with the selected original native as --input-blend.
This is a new reconstruction of interrupted work, not the lost candidate.
"""
import bpy
import bmesh
import json
import math
from collections import defaultdict
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mesh_audit import audit_mesh

out = Path(REFAS_OUTPUT_DIR)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 121
scene.render.fps = 30
scene.render.fps_base = 1
CLIP = 'AURIX_ReachGrip_Return'
BUDGET = {'exportTriangles': 110000, 'materialPrimitives': 180,
          'sampledSurfaceErrorM': .0006,
          'scope': 'single game/animation arm, near-mid distance; no FPS claim'}
scene.frame_set(1)
for obj in scene.objects:
    obj.animation_data_clear()
for name in ('ELBOW_PIVOT', 'WRIST_PIVOT'):
    bpy.data.objects[name].rotation_mode = 'XYZ'
    bpy.data.objects[name].rotation_euler = (0, 0, 0)
for obj in scene.objects:
    if obj.type == 'EMPTY' and '_J' in obj.name:
        obj.rotation_mode = 'XYZ'
        obj.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

def capture(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    verts = [ev.matrix_world @ v.co for v in me.vertices]
    faces = [tuple(t.vertices) for t in me.loop_triangles]
    ev.to_mesh_clear()
    return verts, faces

def replace_world(obj, vertices, faces):
    materials = list(obj.data.materials)
    me = bpy.data.meshes.new(obj.name + '_functional_topology')
    inv = obj.matrix_world.inverted()
    me.from_pydata([inv @ Vector(v) for v in vertices], [], faces)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me); bm.free()
    obj.data = me
    obj.modifiers.clear()
    for mat in materials:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True

# The retained core crossed the four dorsal shells at the outer metacarpal.
# Rebuild the actual load-bed section with a recessed dorsal face. The existing
# four armor plates and their gaps remain; no detached cover fragment is added.
body = bpy.data.objects['Palm_graphite_body']
rows = [(.169,.020,.009),(.1625,.025,.0105),(.156,.029,.012),
        (.1475,.033,.013),(.139,.037,.014),(.1295,.039,.014),
        (.120,.040,.014),(.114,.0375,.012),(.108,.035,.010)]
cross = [(-1,0),(-.96,-.48),(-.83,-.88),(-.60,-1),
         (0,-1),(.60,-1),(.83,-.88),(.96,-.48),(1,0),
         (.96,.43),(.83,.78),(.60,.96),(0,1),(-.60,.96),(-.83,.78),(-.96,.43)]
verts = [(x*rx, y*(back if y>0 else .004), z)
         for z,rx,back in rows for x,y in cross]
n = len(cross)
faces = [tuple(reversed(range(n))), tuple(range((len(rows)-1)*n,len(rows)*n))]
faces += [(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)
          for j in range(len(rows)-1) for k in range(n)]
replace_world(body, verts, faces)
body['retopology_scope'] = '9 connected longitudinal section rings, 16 points each; dorsal chassis recessed beneath original armor'

# Two inherited wrist rings used duplicate 0/2pi endpoints and artificial caps.
# Rebuild their periodic annulus rather than welding unrelated fine hardware.
for side in (-1,1):
    obj=bpy.data.objects['Wrist_side_ring_'+str(side)]
    center=Vector((side*.020,0,.193)); n=64
    vertices=[]
    for x,r in [(-.002,.006),(-.002,.010),(.002,.010),(.002,.006)]:
        for k in range(n):
            theta=math.tau*k/n
            vertices.append(center+Vector((x,math.cos(theta)*r,math.sin(theta)*r)))
    faces=[(j*n+k,j*n+(k+1)%n,((j+1)%4)*n+(k+1)%n,((j+1)%4)*n+k)
           for j in range(4) for k in range(n)]
    replace_world(obj,vertices,faces)
    bevel=obj.modifiers.new('Closed-annulus edge radius','BEVEL');bevel.width=.0004;bevel.segments=3
for side in (-1,1):
    obj=bpy.data.objects['Upper_exposed_hydraulic_'+str(side)]
    bm=bmesh.new();bm.from_mesh(obj.data)
    boundary=[edge for edge in bm.edges if edge.is_boundary]
    bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free()

# A telescoping guide bridges the elbow instead of pretending a segment-local
# decorative piston drives the joint. Both anchors are physical parent-local
# attachment points with lateral mounting bosses; all moving transforms bake.
steel = bpy.data.materials['Piston chrome']
graphite = bpy.data.materials['Graphite structural composite']
gold = bpy.data.materials['Anodized champagne gold']
root = bpy.data.objects['AURIX_ROOT']
upper = bpy.data.objects['SHOULDER_PIVOT']
fore = bpy.data.objects['ELBOW_PIVOT']
links = []

def cylinder(name, radius, depth, mat, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj['aurix_asset'] = True
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def span(obj, a, b, radius=None):
    delta = b-a
    z = delta.normalized()
    ref = Vector((1,0,0)) if abs(z.x)<.95 else Vector((0,1,0))
    x = (ref-z*z.dot(ref)).normalized(); y=z.cross(x)
    rotation = Matrix((x,y,z)).transposed().to_4x4()
    world = Matrix.Translation((a+b)/2) @ rotation
    # Every generated cylinder has unit depth, so Z is the measured length.
    world = world @ Matrix.Diagonal((1,1,delta.length,1))
    obj.matrix_world = world

for side in (-1,1):
    a = Vector((side*.048,-.034,.476))
    b = Vector((side*.048,-.034,.372))
    anchor_a = upper.matrix_world.inverted() @ a
    anchor_b = fore.matrix_world.inverted() @ b
    housing = cylinder('Elbow_link_housing_'+str(side), .0033, 1, graphite, root)
    rod = cylinder('Elbow_link_rod_'+str(side), .0019, 1, steel, root)
    gland = cylinder('Elbow_link_gland_'+str(side), .0038, 1, gold, root)
    for label,parent,outer,inner in [('upper',upper,a,Vector((side*.026,-.015,.476))),
                                   ('forearm',fore,b,Vector((side*.032,-.015,.372)))]:
        mount = cylinder('Elbow_link_mount_'+label+'_'+str(side), .0037, 1, steel, parent)
        span(mount,inner,outer)
        bpy.context.view_layer.update()
    links.append({'side':side, 'a':anchor_a,'b':anchor_b,
                  'housing':housing,'rod':rod,'gland':gland})

poses=[]; extensions=[]
animated=[bpy.data.objects['ELBOW_PIVOT'],bpy.data.objects['WRIST_PIVOT']]
animated += [o for o in scene.objects if o.type=='EMPTY' and '_J' in o.name]
animated += [r[k] for r in links for k in ('housing','rod','gland')]
for frame in range(1,122):
    scene.frame_set(frame)
    t=(frame-1)/120
    reach=math.sin(math.pi*t)**2
    fore.rotation_euler.x=math.radians(90)*reach
    bpy.data.objects['WRIST_PIVOT'].rotation_euler.x=math.radians(12)*math.sin(math.tau*t)
    for digit in ('INDEX','MIDDLE','RING','LITTLE','THUMB'):
        degrees=(45,55,30) if digit!='THUMB' else (18,35,20)
        for j,deg in enumerate(degrees):
            bpy.data.objects[digit+'_J'+str(j)].rotation_euler.x=math.radians(deg)*reach
    bpy.context.view_layer.update()
    for r in links:
        a=upper.matrix_world@r['a']; b=fore.matrix_world@r['b']
        delta=b-a; axis=delta.normalized(); length=delta.length
        housing_length=.072
        rod_length=.063
        # Constant-length rigid rod slides inside a constant-length housing.
        span(r['housing'],a,a+axis*housing_length)
        span(r['rod'],b-axis*rod_length,b)
        span(r['gland'],a+axis*(housing_length-.002),a+axis*(housing_length+.002))
        bpy.context.view_layer.update()
        r['housing']['anchor_neutral_upper']=list(r['a'])
        r['rod']['anchor_neutral_forearm']=list(r['b'])
        extensions.append({'frame':frame,'side':r['side'],'anchorDistanceM':length,
                           'rodExposedLengthM':length-housing_length,
                           'rodHousingOverlapM':housing_length+rod_length-length})
        assert length>housing_length+.003, 'Linkage compressed past its mechanical range'
        assert housing_length+rod_length-length>.010, 'Linkage lost rod overlap'
    for obj in animated:
        if obj.type=='EMPTY':
            obj.keyframe_insert('rotation_euler',frame=frame)
        else:
            obj.rotation_mode='QUATERNION'
            obj.keyframe_insert('location',frame=frame)
            obj.keyframe_insert('rotation_quaternion',frame=frame)
            obj.keyframe_insert('scale',frame=frame)
    poses.append({'frame':frame,'elbowDeg':90*reach,'wristDeg':12*math.sin(math.tau*t),
                  'fingerDeg':[d*reach for d in (45,55,30)]})
for obj in animated:
    action=obj.animation_data.action
    action.name='Baked_'+obj.name
    for curve in action.fcurves:
        for key in curve.keyframe_points: key.interpolation='LINEAR'
    track=obj.animation_data.nla_tracks.new(); track.name=CLIP
    track.strips.new(CLIP,1,action)
    obj.animation_data.action=None
scene.frame_set(1); bpy.context.view_layer.update()

high={o.name:capture(o) for o in scene.objects if o.type=='MESH'}
high_triangles=sum(len(f) for v,f in high.values())
bpy.ops.wm.save_as_mainfile(filepath=str(out/'detailed-functional.blend'),copy=True)
changes=[]; deviations=[]; part_audits={}
for obj in list(scene.objects):
    if obj.type!='MESH': continue
    before_tris=len(high[obj.name][1])
    for mod in obj.modifiers:
        if mod.type=='BEVEL': mod.segments=1
    # Preserve the authored outer armor grid. Small round hardware uses a
    # measured collapse reduction; this operation is not called retopology.
    armor=any(x in obj.name for x in ('armor','plate','blade','crown','carrier','pad','Crown_A','Palm_graphite_body','Service_cover'))
    if not armor and before_tris>200 and not obj.name.startswith('Elbow_link_'):
        mod=obj.modifiers.new('Delivery round-hardware reduction','DECIMATE')
        mod.ratio=.48
        mod.use_collapse_triangulate=True
    bpy.context.view_layer.update()
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(me); bm.free(); me.update()
    obj.data=me; obj.modifiers.clear()
    part_audits[obj.name]=audit_mesh(obj,meters_per_unit=1,max_details=1)['statistics']
    low=capture(obj); high_v,high_f=high[obj.name]
    tree_h=BVHTree.FromPolygons(high_v,high_f,all_triangles=True)
    tree_l=BVHTree.FromPolygons(low[0],low[1],all_triangles=True)
    errors=[]
    for vertices,faces,target in [(high_v,high_f,tree_l),(low[0],low[1],tree_h)]:
        points=vertices[::max(1,len(vertices)//128)]
        points += [sum((vertices[i] for i in face),Vector())/3 for face in faces[::max(1,len(faces)//128)]]
        errors.extend(target.find_nearest(p)[3] for p in points)
    deviations.append({'object':obj.name,'samples':len(errors),'maxM':max(errors,default=0),
                       'meanM':sum(errors)/len(errors) if errors else 0})
    changes.append({'object':obj.name,'detailedTriangles':before_tris,'optimizedTriangles':len(low[1]),
                    'sourceParent':obj.parent.name if obj.parent else None})

# Consolidate only shared rigid parent/material assignments. Keep moving
# actuator meshes and the rebuilt palm core separate for independent probes.
groups=defaultdict(list)
for obj in list(scene.objects):
    if obj.type!='MESH' or obj.animation_data or obj.name=='Palm_graphite_body':continue
    key=(obj.parent.name if obj.parent else None,tuple(m.name if m else None for m in obj.data.materials))
    groups[key].append(obj)
mapping={}
for (parent,materials),objects in groups.items():
    if len(objects)<2:
        mapping[objects[0].name]=[objects[0].name];continue
    for obj in scene.objects: obj.select_set(False)
    for obj in objects: obj.select_set(True)
    names=sorted(o.name for o in objects)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    joined=bpy.context.object
    joined.name='Delivery_'+parent+'_'+materials[0].split(' • ')[0].replace(' ','_')
    joined['source_parts_json']=json.dumps(names)
    mapping[joined.name]=names
scene.frame_set(1);bpy.context.view_layer.update()
triangles=sum(len(capture(o)[1]) for o in scene.objects if o.type=='MESH')
primitives=sum(len(o.data.materials) for o in scene.objects if o.type=='MESH')
report={'schema':'refas.automail-functional-continuation/v1','budgetBeforeSelection':BUDGET,
        'clip':CLIP,'frames':[1,121],'fps':30,'detailedTriangles':high_triangles,
        'optimizedTriangles':triangles,'materialPrimitives':primitives,
        'parts':changes,'sourceToDelivery':mapping,'surfaceDeviation':deviations,'optimizedPartTopology':part_audits,
        'surfaceSampling':'Both directions, vertices and triangle centroids, about 256 samples each direction per source part; not exhaustive Hausdorff bound.',
        'poses':poses,'linkageExtensions':extensions,
        'retopology':'Palm chassis rebuilt as connected section rings; two wrist annuli rebuilt with periodic shared boundaries; upper hose endpoints explicitly capped. Outer armor retained. Hardware decimation and bevel reduction are separately named.',
        'uv':'Original detailed source retained; evaluated layers carried through optimization. Untextured primitive meshes have no authored production UV atlas.',
        'historicalBoundary':'Rebuilt from saved source-identity candidate05; not a restoration or reproduction of the unavailable 78998-triangle candidate.'}
(out/'construction.json').write_text(json.dumps(report,indent=2)+'\n')
assert triangles<=BUDGET['exportTriangles'],(triangles,BUDGET)
assert primitives<=BUDGET['materialPrimitives'],(primitives,BUDGET)
assert max(r['maxM'] for r in deviations)<BUDGET['sampledSurfaceErrorM'],sorted(deviations,key=lambda r:r['maxM'])[-5:]

"""Recover a functional AURIX continuation from the retained source-identity asset.

Run inside RefAs production with the selected original native as --input-blend.
This is a new reconstruction of interrupted work, not the lost candidate.
"""
import bpy
import bmesh
import gzip
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt
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

# Align the wrist rotation with its original actual X-axis gimbal at Z=193 mm.
# Preserve every direct child's neutral world matrix (and therefore descendants).
wrist=bpy.data.objects['WRIST_PIVOT']
child_world={o:o.matrix_world.copy() for o in wrist.children}
wrist.location.z+=.009
bpy.context.view_layer.update()
for obj,matrix in child_world.items(): obj.matrix_world=matrix
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
thumb_clearance={.139:.034,.1295:.0345,.120:.038}
verts = [(x*(thumb_clearance.get(z,rx) if x<0 and y<=.43 else rx), y*(back if y>0 else .004), z)
         for z,rx,back in rows for x,y in cross]
n = len(cross)
faces = [tuple(reversed(range(n))), tuple(range((len(rows)-1)*n,len(rows)*n))]
faces += [(j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k)
          for j in range(len(rows)-1) for k in range(n)]
replace_world(body, verts, faces)
body['retopology_scope'] = '9 connected longitudinal section rings, 16 points each; dorsal chassis recessed beneath original armor'
body['thumb_clearance_scope'] = 'Local left/dorsal core relief at Z120..139mm; original thumb knuckle and support at Z147mm retained'

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

# The original short hex recesses used chamfers close to half their depth.
# On consolidation their vanishing side bands rounded to identical float32
# coordinates. Keep each full hex recess and cap only that risky bevel width.
socket_repairs=[]
for obj in scene.objects:
    if obj.type!='MESH' or not obj.name.endswith('_hex_socket'): continue
    extents=[max(v.co[i] for v in obj.data.vertices)-min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    limit=min(value for value in extents if value>0)*.2
    for mod in obj.modifiers:
        if mod.type=='BEVEL' and mod.width>limit:
            socket_repairs.append({'object':obj.name,'beforeWidthM':mod.width,'afterWidthM':limit,
                                   'rawLocalExtentsM':extents})
            mod.width=limit

# The inherited Lambda has overlapping front/back cap triangles. Re-tessellate
# the UNION of those actual visible cap triangles, retain their outline and
# extrusion depth, then connect the shared rim. This is not a normal flip.
letter=bpy.data.objects['Crown_A_mark']
z_low=min(v.co.z for v in letter.data.vertices);z_high=max(v.co.z for v in letter.data.vertices)
cap=[p for p in letter.data.polygons if all(abs(letter.data.vertices[i].co.z-z_high)<1e-9 for i in p.vertices)]
source_ids=sorted({i for polygon in cap for i in polygon.vertices})
index={value:i for i,value in enumerate(source_ids)}
xy=[Vector(letter.data.vertices[i].co[:2]) for i in source_ids]
cap_faces=[]
for polygon in cap:
    face=[index[i] for i in polygon.vertices]
    a,b,c=[xy[i] for i in face[:3]]
    if (b-a).cross(c-a)<0:face.reverse()
    cap_faces.append(face)
coords,edges,cdt_faces,_,_,face_sources=delaunay_2d_cdt(xy,[],cap_faces,1,1e-10,True)
# CDT also fills regions enclosed only by constraint edges. Keep only faces
# actually covered by at least one original triangle, preserving the Lambda gap.
new_cap=[face for face,source in zip(cdt_faces,face_sources) if source]
used=sorted({i for f in new_cap for i in f});remap={old:i for i,old in enumerate(used)}
coords=[coords[i] for i in used];new_cap=[[remap[i] for i in face] for face in new_cap]
edge_counts=Counter(tuple(sorted((a,b))) for face in new_cap for a,b in zip(face,face[1:]+face[:1]))
boundary=[(a,b) for face in new_cap for a,b in zip(face,face[1:]+face[:1]) if edge_counts[tuple(sorted((a,b)))]==1]
count=len(coords)
world=[letter.matrix_world@Vector((p.x,p.y,z)) for z in (z_low,z_high) for p in coords]
new_faces=[tuple(reversed(face)) for face in new_cap]+[tuple(i+count for i in face) for face in new_cap]
new_faces += [(a,b,b+count,a+count) for a,b in boundary]
letter_repair={'object':letter.name,'originalCapTriangles':len(cap_faces),'unionCapTriangles':len(new_cap),
               'boundaryEdgesPerCap':len(boundary),'extrusionDepthM':z_high-z_low,
               'excludedUncoveredConstraintRegions':sum(not source for source in face_sources),
               'overlapRegionsMerged':sum(len(source)>1 for source in face_sources),
               'method':'Constrained Delaunay triangulation of original cap triangle union; shared closed rim; original material retained.'}
replace_world(letter,world,new_faces)
for polygon in letter.data.polygons:polygon.use_smooth=False

# Keep the source's rotary elbow. An external telescopic scaffold was built
# and rejected on visual review; its exact script and candidates are retained.
# Original segment-local hydraulic pieces remain part of their original segment.
fore = bpy.data.objects['ELBOW_PIVOT']
poses=[]
animated=[fore,bpy.data.objects['WRIST_PIVOT']]
animated += [o for o in scene.objects if o.type=='EMPTY' and '_J' in o.name]
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
    for obj in animated:
        obj.keyframe_insert('rotation_euler',frame=frame)
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
mechanism=[]
for obj in scene.objects:
    if obj.type!='MESH' or not any(token in obj.name.lower() for token in
        ('hydraulic','rod','hose','pipe','cable','cylinder','gland','tendon','cartridge','actuator','rail','return','axle')): continue
    vertices,faces=high[obj.name]
    caps=[obj.matrix_world@p.center for p in obj.data.polygons if len(p.vertices)>4]
    mechanism.append({'object':obj.name,'parent':obj.parent.name if obj.parent else None,
        'boundsM':{'min':[min(v[i] for v in vertices) for i in range(3)],
                   'max':[max(v[i] for v in vertices) for i in range(3)]},
        'rawPolygonCapCentersM':[list(v) for v in caps],
        'classification':('rotary-bearing axle at declared joint' if 'axle' in obj.name else 'segment-local mechanism; does not bridge a moving joint'),
        'endpointScope':'Raw ngon cap-center observations when present; bounds and actual whole/detail views classify the curved guides. No inferred two-anchor connection is certified from parenting alone.'})
bpy.ops.wm.save_as_mainfile(filepath=str(out/'detailed-functional.blend'),copy=True)
changes=[]; deviations=[]; part_audits={}; part_triangles={}
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
    part_triangles[obj.name]={'worldVerticesM':[list(v) for v in low[0]],'triangles':low[1],
                              'sourceParent':obj.parent.name if obj.parent else None}
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
mapping={'Palm_graphite_body':['Palm_graphite_body']}
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
compound_audits={o.name:audit_mesh(o,meters_per_unit=1,max_details=1)['statistics']
                 for o in scene.objects if o.type=='MESH'}
unexpected_topology={name:st for name,st in compound_audits.items() if
                     any(st[key] for key in ('nonManifoldEdges','nonManifoldVertices',
                                            'inconsistentWindingEdges','degenerateTriangles','negativeClosedComponents')) or
                     (st['boundaryEdges'] and not ('AURIX_carbon_markings' in name and st['boundaryEdges']==796))}
with gzip.open(out/'optimized-part-triangles.json.gz','wt',encoding='utf8') as stream:
    json.dump({'schema':'refas.named-part-triangle-lineage/v1','space':'world metres at native frame1 before consolidation',
               'parts':part_triangles,'sourceToDelivery':mapping},stream,separators=(',',':'))
report={'schema':'refas.automail-functional-continuation/v1','budgetBeforeSelection':BUDGET,
        'clip':CLIP,'frames':[1,121],'fps':30,'detailedTriangles':high_triangles,
        'optimizedTriangles':triangles,'materialPrimitives':primitives,
        'parts':changes,'sourceToDelivery':mapping,'surfaceDeviation':deviations,'optimizedPartTopology':part_audits,
        'postConsolidationTopology':compound_audits,'postConsolidationUnexpectedTopology':unexpected_topology,
        'hexRecessBevelRepairs':socket_repairs,
        'letterCapRepair':letter_repair,
        'thumbCoreRelief':{'leftSectionHalfWidthsM':thumb_clearance,'scope':'Left/dorsal side only, cross-section y<=0.43; original bearing/knuckle and pivot retained.',
                           'reason':'Measured moving ivory thumb armor crossed core 7..15mm distal to pivot, beyond7.82mm bearing radius; candidate05 negative retained.'},
        'surfaceSampling':'Both directions, vertices and triangle centroids, about 256 samples each direction per source part; not exhaustive Hausdorff bound.',
        'poses':poses,'linkageExtensions':[],
        'originalMechanismInventory':mechanism,
        'wristPivotCorrectionM':.009,
        'mechanismDecision':'Source rotary elbow retained; external invented linear links rejected. Original segment-local hydraulic/cable/rail geometry is preserved and classified independently.',
        'retopology':'Palm chassis rebuilt as connected section rings; two wrist annuli rebuilt with periodic shared boundaries; upper hose endpoints explicitly capped. Outer armor retained. Hardware decimation and bevel reduction are separately named.',
        'uv':'Original detailed source retained; evaluated layers carried through optimization. Untextured primitive meshes have no authored production UV atlas.',
        'historicalBoundary':'Rebuilt from saved source-identity candidate05; not a restoration or reproduction of the unavailable 78998-triangle candidate.'}
(out/'construction.json').write_text(json.dumps(report,indent=2)+'\n')
assert triangles<=BUDGET['exportTriangles'],(triangles,BUDGET)
assert primitives<=BUDGET['materialPrimitives'],(primitives,BUDGET)
assert max(r['maxM'] for r in deviations)<BUDGET['sampledSurfaceErrorM'],sorted(deviations,key=lambda r:r['maxM'])[-5:]
assert not unexpected_topology,unexpected_topology

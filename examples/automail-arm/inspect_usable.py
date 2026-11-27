"""Independent saved-native and actual GLB inspection for recovered AURIX.

Use Blender --background native.blend --python inspect_usable.py -- --glb ... --out ...
No input bytes are modified. GLB normal/UV splits are mapped to native geometry,
so genuine reversed triangles are distinguished from display vertex splits.
"""
import argparse
import gzip
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

repo=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(repo/'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

p=argparse.ArgumentParser();p.add_argument('--glb',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
p.add_argument('--lineage',type=Path,help='Captured actual optimized source triangles before consolidation')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=False)
scene=bpy.context.scene
native_path=Path(bpy.data.filepath)
scene.frame_set(1);bpy.context.view_layer.update()

def geometry(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
    vertices=[ev.matrix_world@v.co for v in me.vertices]
    faces=[tuple(t.vertices) for t in me.loop_triangles]
    ev.to_mesh_clear();return vertices,faces

def tree(obj):
    verts,faces=geometry(obj)
    return BVHTree.FromPolygons(verts,faces,all_triangles=True)

native={o.name:geometry(o) for o in scene.objects if o.type=='MESH'}
lineage_pass=True
if a.lineage:
    with gzip.open(a.lineage,'rt',encoding='utf8') as stream: lineage=json.load(stream)
    part_rows=[];assembly_rows=[]
    for target,source_names in lineage['sourceToDelivery'].items():
        vertices,faces=native[target]
        unique={};ids=[];points=[]
        for vertex in vertices:
            key=tuple(round(float(value),9) for value in vertex)
            if key not in unique:unique[key]=len(points);points.append(vertex)
            ids.append(unique[key])
        kd=KDTree(len(points))
        for i,v in enumerate(points):kd.insert(v,i)
        kd.balance()
        def rotation(face):return min(face,face[1:]+face[:1],face[2:]+face[:2])
        expected=Counter(rotation(tuple(ids[index] for index in face)) for face in faces)
        assembled=Counter()
        for name in source_names:
            part=lineage['parts'][name];mapping=[];errors=[]
            for v in part['worldVerticesM']:
                _,index,error=kd.find(Vector(v));mapping.append(index);errors.append(error)
            assembled.update(rotation(tuple(mapping[i] for i in face)) for face in part['triangles'])
            part_rows.append({'sourcePart':name,'deliveryObject':target,'triangles':len(part['triangles']),
                              'maxVertexErrorM':max(errors,default=0)})
        assembly_rows.append({'deliveryObject':target,'sourceParts':len(source_names),
                              'missingOrReversedTriangles':sum((expected-assembled).values()),
                              'extraOrReversedTriangles':sum((assembled-expected).values()),
                              'passed':expected==assembled})
    lineage_pass=all(r['passed'] for r in assembly_rows) and max(r['maxVertexErrorM'] for r in part_rows)<1e-6
    lineage_pass &= set(native)==set(lineage['sourceToDelivery'])
    lineage_pass &= sorted(r['sourcePart'] for r in part_rows)==sorted(lineage['parts'])
    (a.out/'source-part-correspondence.json').write_text(json.dumps({'passed':lineage_pass,
        'capturedLineageSha256':hashlib.sha256(a.lineage.read_bytes()).hexdigest(),
        'sourceParts':part_rows,'deliveryObjects':assembly_rows,
        'scope':'Actual pre-consolidation optimized triangles mapped to all saved-native triangles with cyclic winding. Original high-to-low surface distances are separate construction measurements.'},indent=2)+'\n')
stats={}; exceptions={}
for obj in scene.objects:
    if obj.type!='MESH':continue
    result=audit_mesh(obj,meters_per_unit=1,max_details=3)
    stats[obj.name]=result['statistics']
    if 'AURIX_carbon_markings' in obj.name:
        exceptions[obj.name]='Only the796inherited open boundaryedges of AURIX text are permitted as decorative contour seams. Lambda caps are repaired; no winding, degenerate or nonmanifold exceptions.'
audit={'objects':stats,'intentionalOpenSurfaces':exceptions}
(a.out/'native-topology.json').write_text(json.dumps(audit,indent=2)+'\n')

probe_names=[o.name for o in scene.objects if o.type in ('EMPTY','MESH')]
samples=[];collisions=[];linkage=[]
ivory={parent:next((o for o in scene.objects if o.type=='MESH' and o.parent and o.parent.name==parent
                  and any('Ivory' in m.name for m in o.data.materials if m)),None)
       for parent in ['SHOULDER_PIVOT','ELBOW_PIVOT','WRIST_PIVOT']+[d+'_J'+str(j) for d in ['INDEX','MIDDLE','RING','LITTLE','THUMB'] for j in range(3)]}
pairs=[]
for first,second in [('SHOULDER_PIVOT','ELBOW_PIVOT'),('ELBOW_PIVOT','WRIST_PIVOT')]:
    if ivory[first] and ivory[second]:pairs.append((ivory[first].name,ivory[second].name))
if ivory['WRIST_PIVOT']:pairs.append(('Palm_graphite_body',ivory['WRIST_PIVOT'].name))
for digit in ['INDEX','MIDDLE','RING','LITTLE','THUMB']:
    chain=['WRIST_PIVOT']+[digit+'_J'+str(j) for j in range(3)]
    pairs += [(ivory[x].name,ivory[y].name) for x,y in zip(chain,chain[1:]) if ivory[x] and ivory[y]]
# Grip validation also checks nonadjacent finger armor against the hand core,
# dorsal armor and other digits. Intentional coaxial bearing contact is separate.
digits=['INDEX','MIDDLE','RING','LITTLE','THUMB']
for i,digit in enumerate(digits):
    for joint in range(3):
        part=ivory[digit+'_J'+str(joint)]
        if part:
            pairs.append(('Palm_graphite_body',part.name))
            if ivory['WRIST_PIVOT']:pairs.append((ivory['WRIST_PIVOT'].name,part.name))
            for other in digits[i+1:]:
                for other_joint in range(3):
                    target=ivory[other+'_J'+str(other_joint)]
                    if target:pairs.append((part.name,target.name))
pairs=list(dict.fromkeys(pairs))
for name in probe_names:
    if name.startswith(('Elbow_link_housing_','Elbow_link_rod_','Elbow_link_gland_')):
        pairs += [(name,ivory[parent].name) for parent in ('SHOULDER_PIVOT','ELBOW_PIVOT') if ivory[parent]]
for frame in range(1,122):
    scene.frame_set(frame);bpy.context.view_layer.update()
    samples.append({'seconds':frame/30,'nodes':{n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in probe_names}})
    for side in (-1,1):
        h=bpy.data.objects.get('Elbow_link_housing_'+str(side));r=bpy.data.objects.get('Elbow_link_rod_'+str(side))
        if h is None or r is None: continue  # Retained rejected-link candidates only.
        upper=bpy.data.objects['SHOULDER_PIVOT'];fore=bpy.data.objects['ELBOW_PIVOT']
        anchor_a=upper.matrix_world@Vector(h['anchor_neutral_upper']);anchor_b=fore.matrix_world@Vector(r['anchor_neutral_forearm'])
        h_start=h.matrix_world@Vector((0,0,-.5));h_end=h.matrix_world@Vector((0,0,.5))
        r_start=r.matrix_world@Vector((0,0,-.5));r_end=r.matrix_world@Vector((0,0,.5))
        linkage.append({'frame':frame,'side':side,'upperAnchorErrorM':(anchor_a-h_start).length,
                        'forearmAnchorErrorM':(anchor_b-r_end).length,
                        'housingLengthM':(h_end-h_start).length,'rodLengthM':(r_end-r_start).length,
                        'overlapM':(h_end-r_start).length,
                        'axisCrossError':(h_end-h_start).normalized().cross((r_end-r_start).normalized()).length})
    # Every exported key, all declared armor transitions and external linkage.
    if True:
        ts={n:tree(bpy.data.objects[n]) for n in {name for pair in pairs for name in pair}}
        for x,y in pairs:
            hits=ts[x].overlap(ts[y])
            if hits:collisions.append({'frame':frame,'objects':[x,y],'trianglePairs':len(hits)})
(a.out/'native-inspection.json').write_text(json.dumps({'clip':'AURIX_ReachGrip_Return',
    'nativeSha256':hashlib.sha256(native_path.read_bytes()).hexdigest(),
    'consumer_samples':{'fps':30,'fps_base':1,'matrix_order':'row-major, Blender Z-up world space','samples':samples},
    'linkage':linkage,'collisionPairs':pairs,'sampledCollisionFrames':121,'surfaceIntersections':collisions,
    'limits':'Named arm armor transitions, hand-core/armor against all digit armor, and all cross-digit armor pairs; bearing, fastener, other intra-segment contact and exhaustive all-object collision are outside this surface-pair test.'},indent=2)+'\n')

def cyclic(face):
    return min(face,face[1:]+face[:1],face[2:]+face[:2])

# Reimport the actual delivered bytes in an empty scene. Match each geometric
# triangle and its cyclic winding to the independent native triangulation.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.glb.resolve()),disable_bone_shape=True)
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
imported={o.name:o for o in bpy.context.scene.objects if o.type=='MESH'}
correspondence=[]
for name,(vertices,faces) in native.items():
    ob=imported.get(name)
    if not ob:
        correspondence.append({'object':name,'missing':True});continue
    unique={};ids=[];points=[]
    for v in vertices:
        key=tuple(round(float(x),9) for x in v)
        if key not in unique:unique[key]=len(points);points.append(v)
        ids.append(unique[key])
    kd=KDTree(len(points))
    for i,v in enumerate(points):kd.insert(v,i)
    kd.balance()
    iv,faces_i=geometry(ob);mapped=[];distances=[]
    for v in iv:
        _,idx,dist=kd.find(v);mapped.append(idx);distances.append(dist)
    expected=Counter(cyclic(tuple(ids[i] for i in face)) for face in faces)
    actual=Counter(cyclic(tuple(mapped[i] for i in face)) for face in faces_i)
    correspondence.append({'object':name,'nativeTriangles':len(faces),'importedTriangles':len(faces_i),
        'nativeVertices':len(vertices),'importedVerticesIncludingNormalUvSplits':len(iv),
        'maxMappedVertexErrorM':max(distances,default=0),
        'missingOrReversedTriangles':sum((expected-actual).values()),
        'extraOrReversedTriangles':sum((actual-expected).values()),
        'passed':max(distances,default=0)<1e-6 and expected==actual})
passed=all(x.get('passed',False) for x in correspondence) and set(native)==set(imported)
(a.out/'export-correspondence.json').write_text(json.dumps({'assetSha256':hashlib.sha256(a.glb.read_bytes()).hexdigest(),
    'passed':passed,'nativeMeshes':len(native),'importedMeshes':len(imported),'triangles':sum(len(f) for v,f in native.values()),
    'correspondence':correspondence,'scope':'All imported mesh triangles mapped to independent native positions and oriented indices; normal/UV display splits do not count as cracks.'},indent=2)+'\n')
print(json.dumps({'exportCorrespondence':passed,'sourcePartCorrespondence':lineage_pass,'surfaceIntersections':len(collisions),'nativeMeshes':len(native),
                  'maxLinkAnchorErrorM':max((max(r['upperAnchorErrorM'],r['forearmAnchorErrorM']) for r in linkage),default=None)}))
unexpected_topology={name:st for name,st in stats.items() if
                    any(st[key] for key in ('nonManifoldEdges','nonManifoldVertices','inconsistentWindingEdges',
                                           'degenerateTriangles','negativeClosedComponents')) or
                    (st['boundaryEdges'] and not(name in exceptions and st['boundaryEdges']==796))}
if not passed or not lineage_pass or collisions or unexpected_topology:
    print(json.dumps({'failedTopology':unexpected_topology}))
    raise SystemExit(2)

"""Observe closed cloth sheets on actual evaluated animation frames."""
import bpy,os,json,datetime,sys,collections,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from geometry_wearable import triangle_contact
CONTACT_SHA=hashlib.sha256(Path(__file__).with_name('geometry_wearable.py').read_bytes()).hexdigest()
OUT=Path(os.environ['JACKET_WEARABLE_OUT']);OUT.mkdir(parents=True,exist_ok=True)
frames=[int(x) for x in os.environ.get('WEARABLE_SHELL_FRAMES',','.join(map(str,range(1,98)))).split(',')]
names=['Body | continuous open front and shoulder yoke','Collar | standing back and neck facing'];s=bpy.context.scene
START=datetime.datetime.now(datetime.timezone.utc).isoformat();records=[];cache={}
for name in names:
 o=bpy.data.objects[name];side=o.data.attributes.get('wearable_shell_side');pair=o.data.attributes.get('wearable_shell_pair')
 assert side and pair,(name,'explicit shell pairing required')
 members={}
 for i in range(len(o.data.vertices)):members.setdefault(pair.data[i].value,{})[side.data[i].value]=i
 assert all(set(p)=={0,1} for p in members.values()),name
 mapping={p[0]:p[1] for p in members.values()};sides=[x.value for x in side.data]
 cache[name]={'mapping':mapping,'sides':sides}
for frame in frames:
 s.frame_set(frame);bpy.context.view_layer.update();posed={};row={'frame':frame,'cloth':[]}
 for name in names:
  o=bpy.data.objects[name];ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
  vertices=[ev.matrix_world@v.co for v in me.vertices];faces=[tuple(t.vertices) for t in me.loop_triangles];ev.to_mesh_clear()
  sets=[frozenset(f) for f in faces];tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True,epsilon=1e-7)
  mapping=cache[name]['mapping'];sides=cache[name]['sides'];types=[];thickness=[];thickness_faces=[];bad_thickness=[];degenerate=[]
  for i,f in enumerate(faces):
   kind='outer' if all(sides[j]==0 for j in f) else 'inner' if all(sides[j]==1 for j in f) else 'rim';types.append(kind)
   a,b,c=[vertices[j] for j in f];normal=(b-a).cross(c-a)
   if normal.length_squared<1e-24:degenerate.append(i);continue
   if kind=='outer':
    normal.normalize();offset=sum((vertices[mapping[j]]-vertices[j] for j in f),Vector())/3;value=-normal.dot(offset);thickness.append(value);thickness_faces.append(i)
    if value<=0:bad_thickness.append(i)
  candidates=[(a,b) for a,b in tree.overlap(tree) if a<b and not sets[a]&sets[b]]
  intersections=[(a,b) for a,b in candidates if triangle_contact([vertices[j] for j in faces[a]],[vertices[j] for j in faces[b]])]
  type_counts=collections.Counter('/'.join(sorted([types[a],types[b]])) for a,b in intersections)
  minimum_face=thickness_faces[min(range(len(thickness)),key=thickness.__getitem__)]
  row['cloth'].append({'object':name,'vertices':len(vertices),'triangles':len(faces),'nonadjacentBvhCandidatePairs':len(candidates),'confirmedNonadjacentShellTrianglePairs':len(intersections),'intersectionTypes':dict(type_counts),
   'examples':[{'faces':[a,b],'centroidM':list(sum((vertices[j] for j in faces[a]),Vector())/3)} for a,b in intersections[:20]],
   'nonpositiveThicknessOuterFaces':len(bad_thickness),'nonpositiveThicknessFaceExamples':bad_thickness[:20],'minimumProjectedSheetThicknessM':min(thickness),'minimumThicknessOuterFaceIndex':minimum_face,'minimumThicknessOuterTriangleVertices':list(faces[minimum_face]),'minimumThicknessInnerPartnerVertices':[mapping[j] for j in faces[minimum_face]],'degenerateTriangleCount':len(degenerate)})
  posed[name]=(tree,vertices,faces)
 a,va,fa=posed[names[0]];b,vb,fb=posed[names[1]];pairs=a.overlap(b)
 contacts=[(i,j) for i,j in pairs if triangle_contact([va[k] for k in fa[i]],[vb[k] for k in fb[j]])]
 row['bodyCollarContacts']={'bvhCandidates':len(pairs),'confirmedTrianglePairs':len(contacts),'examples':[{'bodyFace':i,'collarFace':j,'centroidM':list(sum((va[k] for k in fa[i]),Vector())/3)} for i,j in contacts[:30]],'classification':'Unclassified observed cloth-to-cloth contact; source sewn attachment and unintended interpenetration require separate review.'}
 records.append(row)
 report={'startedUtc':START,'latestObservationUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tokens':None,'cost':None,'requestedFrames':frames,'observations':records,
  'contactPredicate':{'method':'Float64 local-coordinate triangle SAT including in-plane axes; boundary touch counts as contact.','sha256':CONTACT_SHA,'bvhCandidatePaddingM':1e-7,'physicalPenetrationAllowanceM':0},
  'scope':'Evaluated float64 triangle SAT contacts after padded BVH broad phase. Directly adjacent triangles sharing vertices are excluded from self-contact. Explicit outer/inner pair attributes are used for projected sheet thickness; this is not a universal continuous-time or cloth-simulation claim.'}
 (OUT/'shell-motion.json').write_text(json.dumps(report,indent=2)+'\n')
 print('SHELL_FRAME',frame,[(x['object'],x['confirmedNonadjacentShellTrianglePairs'],x['nonpositiveThicknessOuterFaces']) for x in row['cloth']],len(contacts),flush=True)
print('SHELL_MOTION_COMPLETE')

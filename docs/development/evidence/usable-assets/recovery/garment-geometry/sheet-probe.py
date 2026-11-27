import bpy, json, collections
from pathlib import Path
from mathutils.bvhtree import BVHTree
ROOT=Path('/workspace/scratch/61afcdd4e3c6/work/garment/candidate-08')
NAMES=['Body | continuous open front and shoulder yoke','Collar | standing back and neck facing']
def capture(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.scene.frame_set(1);bpy.context.view_layer.update();result={}
 for name in NAMES:
  o=bpy.data.objects[name];ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
  points=[(o.matrix_world@v.co).copy() for v in me.vertices];tris=[tuple(t.vertices) for t in me.loop_triangles];mats=[me.polygons[t.polygon_index].material_index for t in me.loop_triangles]
  memberships=[set() for v in points]
  for t,m in zip(tris,mats):
   for i in t:memberships[i].add(m)
  bm=BVHTree.FromPolygons(points,tris,all_triangles=True)
  info={'vertices':len(points),'triangles':len(tris),'baseVertices':len(o.data.vertices),'materials':[m.name if m else None for m in o.data.materials], 'trianglesByMaterial':dict(collections.Counter(mats)),'vertexMaterialMemberships':dict(collections.Counter(','.join(map(str,sorted(m))) for m in memberships)), 'modifiers':[(m.type,m.name) for m in o.modifiers]}
  result[name]={'points':points,'tris':tris,'mats':mats,'memberships':memberships,'bvh':bm,'info':info}
  ev.to_mesh_clear()
 return result
high=capture(ROOT/'fitted-detailed.blend');low=capture(ROOT/'wearable-precheck.blend');report={}
for name in NAMES:
 h=high[name];l=low[name];r={'high':h['info'],'low':l['info']}
 for label,a,b in [('highToLow',h,l),('lowToHigh',l,h)]:
  rows=[]
  for i,p in enumerate(a['points']):
   q,n,t,d=b['bvh'].find_nearest(p)
   rows.append((d,i,p,q,t))
  rows.sort(key=lambda r:-r[0]);r[label]={'maximumM':rows[0][0],'over1_5mm':sum(x[0]>.0015 for x in rows),'worst':[{'errorM':d,'vertex':i,'position':list(p),'sourceMaterialMemberships':sorted(a['memberships'][i]),'nearest':list(q),'nearestTriangle':t,'nearestTriangleMaterial':b['mats'][t]} for d,i,p,q,t in rows[:20]]}
 report[name]=r
OUT=ROOT.parent/'root-sheet-probe-08.json';OUT.write_text(json.dumps(report,indent=2)+'\n')
print('ROOT_SHEET_PROBE',json.dumps({n:{k:v for k,v in r.items() if k in ['high','low']}|{'maxHighLow':r['highToLow']['maximumM'],'maxLowHigh':r['lowToHigh']['maximumM'],'worstHighLow':r['highToLow']['worst'][:3]} for n,r in report.items()}))

"""Read-only-input experiment: lock missed source features, redo reduction."""
import bpy,bmesh,json,time
from pathlib import Path
from mathutils.bvhtree import BVHTree
ROOT=Path('/workspace/scratch/61afcdd4e3c6/work/garment')
SOURCE=ROOT/'candidate-08/fitted-detailed.blend'
OUT=ROOT/'root-protected-reduction-08';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.scene.frame_set(1)
names=['Body | continuous open front and shoulder yoke','Collar | standing back and neck facing']
report={'source':str(SOURCE),'acceptance':'experiment, not a selected asset','objects':{}}
finals=[]
def evaluate(o):
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();return bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
def tree(me):
 me.calc_loop_triangles();return BVHTree.FromPolygons([v.co for v in me.vertices],[list(t.vertices) for t in me.loop_triangles],all_triangles=True)
for name in names:
 src=bpy.data.objects[name];base=src.data.copy();count=len(base.vertices);high=evaluate(src);hb=tree(high)
 assert len(high.vertices)==2*count
 assert max((high.vertices[i].co-base.vertices[i].co).length for i in range(count))<1e-7
 bm=bmesh.new();bm.from_mesh(base);bm.verts.ensure_lookup_table();bm.verts.index_update()
 neighbors={v.index:{w.index for e in v.link_edges for w in e.verts if w!=v} for v in bm.verts}
 locked={v.index for e in bm.edges if e.is_boundary for v in e.verts}
 locked|={j for i in list(locked) for j in neighbors[i]}
 if name==names[0]:
  locked|={v.index for v in bm.verts if abs(v.co.x)>.15 and min(abs(abs(v.co.x)-x) for x in [.17,.23,.28,.328,.38,.421,.47,.50])<.0025}
 bm.free()
 obj=bpy.data.objects.new('Root experiment '+name,base);bpy.context.collection.objects.link(obj)
 obj.matrix_world=src.matrix_world.copy();group=obj.vertex_groups.new(name='Original features to preserve')
 iterations=[]
 for it in range(9):
  t=time.monotonic();group.add(list(range(count)),1,'REPLACE');group.add(sorted(locked),0,'REPLACE')
  obj.modifiers.clear();dec=obj.modifiers.new('Feature protected reduction','DECIMATE');dec.ratio=.15 if name==names[0] else .04;dec.vertex_group=group.name;dec.vertex_group_factor=1
  solid=obj.modifiers.new('Consistent final lining','SOLIDIFY');solid.thickness=.0018;solid.offset=-1;solid.material_offset=1;solid.material_offset_rim=1
  low=evaluate(obj);lb=tree(low)
  high_errors=[lb.find_nearest(v.co)[3] for v in high.vertices]
  low_errors=[hb.find_nearest(v.co)[3] for v in low.vertices]
  bad={i%count for i,d in enumerate(high_errors) if d>.00125}
  row={'iteration':it,'protectedOuterVertices':len(locked),'triangles':len(low.loop_triangles),'highToLowMaxM':max(high_errors),'lowToHighMaxM':max(low_errors),'highVerticesOver1_5mm':sum(x>.0015 for x in high_errors),'sourceVerticesToProtect':len(bad),'seconds':time.monotonic()-t}
  iterations.append(row);print('PROTECTED_REDUCTION',name,json.dumps(row),flush=True)
  report['objects'][name]={'iterations':iterations};(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  if max(high_errors)<=.0015 and max(low_errors)<=.0015:
   final=bpy.data.objects.new('Optimized '+name,low);final.matrix_world=src.matrix_world.copy();finals.append(final);break
  if it==8:bpy.data.meshes.remove(low);break
  more=bad|{j for i in bad for j in neighbors[i]}
  added=more-locked
  if not added:
   bpy.data.meshes.remove(low);break
  locked|=more;bpy.data.meshes.remove(low)
 bpy.data.objects.remove(obj,do_unlink=True)
if len(finals)==2:
 bpy.data.libraries.write(str(OUT/'optimized-cloth.blend'),set(finals))
report['bothWithin1_5mm']=len(finals)==2
report['totalClothTriangles']=sum(len(o.data.loop_triangles) for o in finals)
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('ROOT_PROTECTED_COMPLETE',json.dumps({'bothWithin1_5mm':len(finals)==2,'totalClothTriangles':report['totalClothTriangles']}),flush=True)

"""Experiment: simplify exterior, transfer source lining, preserve missed features."""
import bpy,bmesh,json,time,collections
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path('/workspace/scratch/61afcdd4e3c6/work/garment');OUT=ROOT/'root-transferred-lining-spaced-08';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'candidate-08/fitted-detailed.blend'));bpy.context.scene.frame_set(1)
names=['Body | continuous open front and shoulder yoke','Collar | standing back and neck facing'];report={'status':'experiment, not selected','objects':{}};finals=[]
def ev(o):
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();return bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
def bv(me):
 me.calc_loop_triangles();return BVHTree.FromPolygons([v.co for v in me.vertices],[list(t.vertices) for t in me.loop_triangles],all_triangles=True)
for name in names:
 src=bpy.data.objects[name];base=src.data.copy();N=len(base.vertices);high=ev(src);hb=bv(high);ob=bv(base);triangles=[tuple(t.vertices) for t in base.loop_triangles]
 assert len(high.vertices)==2*N and max((high.vertices[i].co-base.vertices[i].co).length for i in range(N))<1e-7
 coords=np.asarray([list(v.co) for v in base.vertices],dtype=np.float64);offsets=np.asarray([list(high.vertices[i+N].co-high.vertices[i].co) for i in range(N)],dtype=np.float64)
 bm=bmesh.new();bm.from_mesh(base);bm.verts.ensure_lookup_table();bm.verts.index_update();neighbors={v.index:{w.index for e in v.link_edges for w in e.verts if w!=v} for v in bm.verts}
 boundary_neighbors={v.index:[e.other_vert(v).index for e in v.link_edges if e.is_boundary] for v in bm.verts if any(e.is_boundary for e in v.link_edges)}
 locked=set();remaining=set(boundary_neighbors)
 while remaining:
  start_id=min(remaining);current=start_id;previous=None;distance=1e6
  while current in remaining:
   remaining.remove(current)
   if distance>=.004:locked.add(current);distance=0
   ns=boundary_neighbors[current]
   if len(ns)!=2:locked.add(current)
   elif (bm.verts[ns[0]].co-bm.verts[current].co).angle(bm.verts[ns[1]].co-bm.verts[current].co,0)<2.65:locked.add(current)
   candidates=[j for j in ns if j!=previous and j in remaining]
   if not candidates:break
   nxt=candidates[0];distance+=(bm.verts[nxt].co-bm.verts[current].co).length;previous,current=current,nxt
 if name==names[0]:locked|={v.index for v in bm.verts if abs(v.co.x)>.15 and min(abs(abs(v.co.x)-x) for x in [.17,.23,.28,.328,.38,.421,.47,.50])<.0025}
 bm.free();obj=bpy.data.objects.new('Experiment '+name,base);bpy.context.collection.objects.link(obj);group=obj.vertex_groups.new(name='Protected source features');iterations=[]
 for it in range(16):
  start=time.monotonic();group.add(list(range(N)),1,'REPLACE');group.add(sorted(locked),0,'REPLACE');obj.modifiers.clear()
  dec=obj.modifiers.new('Protected exterior reduction','DECIMATE');dec.ratio=.18 if name==names[0] else .06;dec.vertex_group=group.name;dec.vertex_group_factor=1
  surface=ev(obj);surface.calc_loop_triangles();outer=[];inner=[];faces=[tuple(p.vertices) for p in surface.polygons]
  for v in surface.vertices:
   hit,normal,t,d=ob.find_nearest(v.co);ids=triangles[t];a,b,c=coords[list(ids)];uv=np.linalg.lstsq(np.stack((b-a,c-a),axis=1),np.asarray(hit,dtype=np.float64)-a,rcond=1e-10)[0]
   weights=np.clip([1-uv.sum(),uv[0],uv[1]],0,1);weights/=weights.sum();delta=weights@offsets[list(ids)]
   outer.append(tuple(hit));inner.append(tuple(np.asarray(hit)+delta))
  L=len(outer);edges=collections.defaultdict(list)
  for face in faces:
   for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))].append((a,b))
  inside=[tuple(i+L for i in reversed(f)) for f in faces];rims=[(b,a,a+L,b+L) for pairs in edges.values() if len(pairs)==1 for a,b in pairs]
  low=bpy.data.meshes.new('Transferred lining '+name);low.from_pydata(outer+inner,[],faces+inside+rims);low.update()
  for m in src.data.materials:low.materials.append(m)
  for i,p in enumerate(low.polygons):p.material_index=0 if i<len(faces) else 1;p.use_smooth=True
  lb=bv(low);he=[lb.find_nearest(v.co)[3] for v in high.vertices];le=[hb.find_nearest(v.co)[3] for v in low.vertices]
  bad=sorted([(d,i%N) for i,d in enumerate(he) if d>.00125],reverse=True);seeds={}
  for d,i in bad:
   key=tuple(np.floor(coords[i]/.004).astype(int))
   if key not in seeds:seeds[key]=i
  row={'iteration':it,'protectedOuterVertices':len(locked),'triangles':len(low.loop_triangles),'highToLowMaxM':max(he),'lowToHighMaxM':max(le),'highVerticesOver1_5mm':sum(x>.0015 for x in he),'featureSeeds':len(seeds),'seconds':time.monotonic()-start};iterations.append(row)
  report['objects'][name]={'iterations':iterations};(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print('TRANSFERRED_LINING',name,json.dumps(row),flush=True)
  bpy.data.meshes.remove(surface)
  if max(he)<=.0015 and max(le)<=.0015:
   final=bpy.data.objects.new('Optimized '+name,low);final.matrix_world=src.matrix_world.copy();finals.append(final);break
  more=set(seeds.values());added=more-locked
  bpy.data.meshes.remove(low)
  if not added:break
  locked|=more
 bpy.data.objects.remove(obj,do_unlink=True)
report['bothWithin1_5mm']=len(finals)==2;report['totalClothTriangles']=sum(len(o.data.loop_triangles) for o in finals)
if len(finals)==2:bpy.data.libraries.write(str(OUT/'optimized-cloth.blend'),set(finals))
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print('TRANSFERRED_COMPLETE',json.dumps({'bothWithin1_5mm':len(finals)==2,'totalClothTriangles':report['totalClothTriangles']}),flush=True)

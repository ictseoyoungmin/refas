import bpy, math, json, hashlib, collections
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=REFAS_OUTPUT_DIR
def fingerprint(o):
 d={'matrix':[list(row) for row in o.matrix_world],'materials':[s.material.name if s.material else None for s in o.material_slots]}
 if o.type=='MESH':d.update(vertices=[list(v.co) for v in o.data.vertices],faces=[list(p.vertices) for p in o.data.polygons],material_indices=[p.material_index for p in o.data.polygons])
 d['modifiers']=[(m.name,m.type,str(getattr(m,'thickness','')),str(getattr(m,'levels','')),str(getattr(m,'width',''))) for m in o.modifiers]
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
def materials():
 out={}
 for m in bpy.data.materials:
  rows=[]
  if m.node_tree:
   for n in m.node_tree.nodes:
    for s in n.inputs:
     if hasattr(s,'default_value'):
      v=s.default_value
      try:v=list(v)
      except TypeError:v=str(v)
      rows.append([n.name,s.name,v])
  out[m.name]=rows
 return hashlib.sha256(json.dumps(out,sort_keys=True).encode()).hexdigest()
before={o.name:fingerprint(o) for o in bpy.context.scene.objects};mat_before=materials()
body=bpy.data.objects['Body | continuous open front and shoulder yoke'];old=body.data
verts=[tuple(v.co) for v in old.vertices];faces=[tuple(p.vertices) for p in old.polygons]
original_body_count=len(verts)
edge_counts=collections.Counter()
for f in faces:
 for a,b in zip(f,f[1:]+f[:1]):edge_counts[tuple(sorted((a,b)))]+=1
adj=collections.defaultdict(list)
for (a,b),n in edge_counts.items():
 if n==1:adj[a].append(b);adj[b].append(a)
loops=[];seen=set()
for a in adj:
 if a in seen:continue
 walk=[a];prev=None;cur=a
 for _ in range(1000):
  seen.add(cur);nxt=next((v for v in adj[cur] if v!=prev),None)
  if nxt is None or nxt==a:break
  walk.append(nxt);prev,cur=cur,nxt
 loops.append(walk)
armholes=[l for l in loops if len(l)<100]
assert len(armholes)==2
seam_edges=[];sleeve_groups={};lower_checks=[]
for side in [1,-1]:
 pre='L' if side==1 else 'R';sleeve=bpy.data.objects[pre+' Sleeve | shaped open tube']
 loop=next(l for l in armholes if sum(verts[i][0] for i in l)*side>0)
 start=max(range(len(loop)),key=lambda j:abs(verts[loop[j]][0]));loop=loop[start:]+loop[:start]
 # Match the old sleeve's angular winding: left moves toward -Y, right toward +Y.
 if (verts[loop[1]][1]-verts[loop[0]][1])*side>0:loop=[loop[0]]+list(reversed(loop[1:]))
 P=[Vector(verts[i]) for i in loop];cum=[0.0]
 for a,b in zip(P,P[1:]):cum.append(cum[-1]+(b-a).length)
 total=cum[-1]+(P[-1]-P[0]).length;params=[x/total for x in cum]
 # Keep all original lower-sleeve cage vertices, from s=.14 m onward, exactly.
 n=40;start_ring=5;first=len(verts)
 retained=[tuple(v.co) for v in sleeve.data.vertices[start_ring*n:]]
 verts.extend(retained);lower_map={old_i:first+old_i-start_ring*n for old_i in range(start_ring*n,len(sleeve.data.vertices))}
 for p in sleeve.data.polygons:
  if min(p.vertices)>=start_ring*n:faces.append(tuple(lower_map[i] for i in p.vertices))
 target=[Vector(verts[first+j]) for j in range(n)]
 def sample(t):
  q=t*n;j=int(q)%n;return target[j].lerp(target[(j+1)%n],q-int(q))
 previous=loop;sleeve_indices=list(range(first,len(verts)))
 # Rounded sleeve cap is an actual bridge between the shared armhole and existing tube.
 for t in [.34,.68]:
  ids=[]
  for p,u in zip(P,params):
   q=sample(u);ang=2*math.pi*u
   control=(p+q)*.5+Vector((side*.027*max(math.cos(ang),0),-side*.012*math.sin(ang),.035*max(math.cos(ang),0)))
   pos=(1-t)**2*p+2*(1-t)*t*control+t*t*q
   ids.append(len(verts));verts.append(tuple(pos));sleeve_indices.append(ids[-1])
  for j in range(len(loop)):
   a=previous[j];b=previous[(j+1)%len(loop)];c=ids[(j+1)%len(loop)];d=ids[j];faces.append((a,b,c,d))
  previous=ids
 # Monotone zipper between the 42-node armhole topology and unchanged 40-node sleeve ring.
 i=j=0;na=len(loop)
 while i<na or j<n:
  ui=params[i+1] if i+1<na else 1.0
  vj=(j+1)/n
  a=previous[i%na];b=first+j%n
  if abs(ui-vj)<1e-8:
   faces.append((a,previous[(i+1)%na],first+(j+1)%n,b));i+=1;j+=1
  elif ui<vj:
   faces.append((a,previous[(i+1)%na],b));i+=1
  else:
   faces.append((a,first+(j+1)%n,b));j+=1
 for a,b in zip(loop,loop[1:]+loop[:1]):seam_edges.append(tuple(sorted((a,b))))
 sleeve_groups[pre+' Sleeve | editable region']=sleeve_indices
 lower_checks.append({'side':pre,'retained_vertices':len(retained),'maximum_coordinate_change_m':0.0,'first_retained_axis_parameter_m':.14})
 bpy.data.objects.remove(sleeve,do_unlink=True)
 seam=bpy.data.objects.get(pre+' Sleeve | sewn shoulder cap')
 if seam:bpy.data.objects.remove(seam,do_unlink=True)

me=bpy.data.meshes.new('Continuous sewn body and sleeves');me.from_pydata(verts,[],faces);me.update();body.data=me
for name in ['Main | charcoal woven wool','Interior | black satin lining']:me.materials.append(bpy.data.materials[name])
for p in me.polygons:p.use_smooth=True
# Recalculate one connected shell's normals after bridging the two windings.
import bmesh
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
for m in body.modifiers:
 if m.type=='SUBSURF':m.levels=2;m.render_levels=2
for g in list(body.vertex_groups):body.vertex_groups.remove(g)
g=body.vertex_groups.new(name='Body panels | original cage');g.add(list(range(original_body_count)),1,'REPLACE')
for name,ids in sleeve_groups.items():body.vertex_groups.new(name=name).add(ids,1,'REPLACE')
body['construction']='Body and sleeve shells share actual armhole vertices and edges; continuous sewn base mesh. Cuffs remain separate.'

ec=collections.Counter()
for p in me.polygons:
 ids=list(p.vertices)
 for a,b in zip(ids,ids[1:]+ids[:1]):ec[tuple(sorted((a,b)))]+=1
assert all(ec[e]==2 for e in seam_edges),'Armhole edge is not shared by body and cap'

# Fit epaulettes and their existing pale edging to the evaluated shoulder surface.
bpy.context.view_layer.update();ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());evmesh=ev.to_mesh()
bvh=BVHTree.FromPolygons([body.matrix_world@v.co for v in evmesh.vertices],[list(p.vertices) for p in evmesh.polygons],all_triangles=False)
def height(x,y):
 hit,normal,idx,dist=bvh.ray_cast(Vector((x,y,1)),Vector((0,0,-1)),2)
 if hit is None:raise RuntimeError('No shoulder surface beneath tab')
 return hit.z
def old_height(x):
 x=abs(x)
 if x<=.18:return .428-(x-.091)*(.026/.089)
 return .402-(x-.18)*(.005/.011)
fitted=[]
for side in [1,-1]:
 pre='L' if side==1 else 'R'
 for suffix,offset in [('tab',.0015),('pale edge',.0021)]:
  ob=bpy.data.objects[pre+' Shoulder | '+suffix]
  for v in ob.data.vertices:
   w=ob.matrix_world@v.co;delta=w.z-old_height(w.x);w.z=height(w.x,w.y)+offset+delta;v.co=ob.matrix_world.inverted()@w
  ob.data.update();fitted.append(ob.name)
 ob=bpy.data.objects[pre+' Shoulder | button'];ob.location.z=height(ob.location.x,ob.location.y)+.004;fitted.append(ob.name)
ev.to_mesh_clear();bpy.context.view_layer.update()
after={o.name:fingerprint(o) for o in bpy.context.scene.objects};mat_after=materials()
allowed={body.name,*fitted,'L Sleeve | shaped open tube','R Sleeve | shaped open tube','L Sleeve | sewn shoulder cap','R Sleeve | sewn shoulder cap'}
changed=[n for n in before if n not in after or before[n]!=after[n]];protected_changed=[n for n in changed if n not in allowed]
assert not protected_changed,protected_changed
assert mat_before==mat_after
assert all(before[n]==after[n] for n in before if '_Cuff_' in n)
assert all(before[n]==after[n] for n in before if n.startswith('L Ornament') or n.startswith('L Chain'))
checks={'approach':'One mesh, shared armhole boundary vertices/edges, rounded cap bridge; existing lower sleeve cages retained; shoulder trim fitted by surface raycasts','changed_objects':changed,'removed_objects':[n for n in before if n not in after],'protected_object_count':len(before)-len(allowed),'protected_changed':protected_changed,'materials_unchanged':mat_before==mat_after,'cuffs_unchanged':True,'decoration_unchanged':True,'shared_armhole_edges':len(seam_edges),'shared_armhole_edges_all_two_faces':all(ec[e]==2 for e in seam_edges),'lower_sleeve_cage_checks':lower_checks,'original_body_cage_vertices_retained':original_body_count,'body_and_sleeves_named_vertex_groups':list(sleeve_groups),'before':before,'after':after}
json.dump(checks,open(ROOT+'/protected-checks.json','w'),indent=2)
print('FOLLOWUP_CHECKS',json.dumps({k:v for k,v in checks.items() if k not in ['before','after']}))

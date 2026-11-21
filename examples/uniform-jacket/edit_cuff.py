import bpy, json, hashlib, math, os
from mathutils import Vector
ROOT=REFAS_OUTPUT_DIR
axis=Vector((.258,-.018,-.966)).normalized()
def serial(v):
 try:return [round(float(x),9) for x in v]
 except TypeError:return str(v)
def obj_state(o):
 d={'name':o.name,'matrix':[[round(float(x),9) for x in row] for row in o.matrix_world],'materials':[s.material.name if s.material else None for s in o.material_slots]}
 if o.type=='MESH':
  d['vertices']=[serial(v.co) for v in o.data.vertices];d['faces']=[list(p.vertices) for p in o.data.polygons];d['material_indices']=[p.material_index for p in o.data.polygons]
 d['modifiers']=[(m.name,m.type,str(getattr(m,'thickness','')),str(getattr(m,'levels','')),str(getattr(m,'width',''))) for m in o.modifiers]
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
def mat_state():
 d={}
 for m in bpy.data.materials:
  s={'diffuse':serial(m.diffuse_color),'nodes':[],'links':[]}
  if m.node_tree:
   for n in sorted(m.node_tree.nodes,key=lambda n:n.name):
    vals=[]
    for p in n.inputs:
     if hasattr(p,'default_value'):
      val=p.default_value
      if isinstance(val,(int,float,str,bool)): vals.append((p.name,val))
      else: vals.append((p.name,serial(val)))
    s['nodes'].append((n.name,n.type,vals))
   s['links']=sorted((l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links)
  d[m.name]=s
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
before={o.name:obj_state(o) for o in bpy.context.scene.objects};mats_before=mat_state()
band=bpy.data.objects['L_Cuff_Band']
projection=[(band.matrix_world@v.co).dot(axis) for v in band.data.vertices]
lo,hi=min(projection),max(projection);height_before=hi-lo
for v in band.data.vertices:
 p=band.matrix_world@v.co;q=p.dot(axis);p+=axis*((q-hi)/height_before*.01);v.co=band.matrix_world.inverted()@p
band.data.update();band['height_m']=.07
for o in bpy.context.scene.objects:
 if not o.name.startswith('L_Cuff_') or o==band:continue
 role=o.get('edit_role','')
 if role=='proximal':o.location-=axis*.01
 elif role=='hardware':o.location-=axis*.005
bpy.context.view_layer.update()
after={o.name:obj_state(o) for o in bpy.context.scene.objects};mats_after=mat_state()
changed=sorted(n for n in before if before[n]!=after[n]);protected_changed=[n for n in changed if not n.startswith('L_Cuff_')]
newprojection=[(band.matrix_world@v.co).dot(axis) for v in band.data.vertices];height_after=max(newprojection)-min(newprojection)
assert not protected_changed,protected_changed
assert mats_before==mats_after,'Material data unexpectedly changed'
assert abs((height_after-height_before)-.01)<1e-6,(height_before,height_after)
assert before['R_Cuff_Band']==after['R_Cuff_Band']
assert before['L_Cuff_Piping_Distal']==after['L_Cuff_Piping_Distal']
result={'local_edit':'Wearer-left cuff band increased by 0.01 m along sleeve axis, keeping distal rim fixed','axis':serial(axis),'nominal_before_m':.06,'nominal_after_m':.07,'native_band_axial_extent_before_m':height_before,'native_band_axial_extent_after_m':height_after,'native_band_delta_m':height_after-height_before,'changed_objects':changed,'protected_object_count':sum(not n.startswith('L_Cuff_') for n in before),'protected_changed':protected_changed,'material_hash_before':mats_before,'material_hash_after':mats_after,'materials_unchanged':mats_before==mats_after,'opposite_cuff_unchanged':before['R_Cuff_Band']==after['R_Cuff_Band'],'distal_piping_unchanged':before['L_Cuff_Piping_Distal']==after['L_Cuff_Piping_Distal'],'before':before,'after':after}
with open(ROOT+'/cuff-edit-checks.json','w') as f:json.dump(result,f,indent=2)
print('CUFF_EDIT_CHECKS',json.dumps({k:v for k,v in result.items() if k not in ['before','after']}))

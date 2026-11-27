import bpy, json, sys, struct
from pathlib import Path
sys.path.insert(0,'/workspace/scratch/5765cde18054/refas/skills/refas/scripts/production')
from blender_worker import export_scene
out=Path('/tmp/refas_review_weighted_skin');out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=31
bpy.ops.object.armature_add()
rig=bpy.context.object;rig.name='ReviewRig'
bpy.ops.object.mode_set(mode='EDIT')
root=rig.data.edit_bones[0];root.name='Base'
tip=rig.data.edit_bones.new('Tip');tip.head=(0,0,1);tip.tail=(0,0,2);tip.parent=root;tip.use_connect=True
bpy.ops.object.mode_set(mode='OBJECT')
rig.location=(.4,-.2,.6);rig.rotation_euler=(.1,.2,.3);rig.scale=(1.1,1.1,1.1)
bpy.ops.mesh.primitive_cube_add(size=.2,location=(.2,0,1))
obj=bpy.context.object;obj.name='WeightedPanel';obj.parent=rig
obj.rotation_euler=(.1,-.2,.15);obj.scale=(.8,1.2,1)
obj.shape_key_add(name='Basis');fit=obj.shape_key_add(name='Fit');fit.data[0].co.z+=.06;fit.data[2].co.y+=.03
for name,weight in [('Base',.35),('Tip',.65)]:
    obj.vertex_groups.new(name=name).add(list(range(8)),weight,'REPLACE')
mod=obj.modifiers.new('Skin','ARMATURE');mod.object=rig
for name in ('Base','Tip'):rig.pose.bones[name].rotation_mode='XYZ'
for frame, factor in ((1,0),(16,1),(31,0)):
    rig.pose.bones['Base'].rotation_euler=(0,0,.15*factor)
    rig.pose.bones['Tip'].rotation_euler=(.7*factor,0,0)
    for bone in rig.pose.bones:bone.keyframe_insert('rotation_euler',frame=frame)
    fit.value=.8*factor;fit.keyframe_insert('value',frame=frame)
clip='ReviewBlend'
for owner in (rig,obj.data.shape_keys):
    action=owner.animation_data.action
    for curve in action.fcurves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'
    track=owner.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,1,action);owner.animation_data.action=None
rows=[];rest={}
for frame in (1,8,16,24,31):
    scene.frame_set(frame);bpy.context.view_layer.update();ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    world={i:list(ev.matrix_world@me.vertices[i].co) for i in (0,2,6)};ev.to_mesh_clear()
    if not rest:rest=world
    rows.append({'seconds':frame/30,'bones':[{'node':'Skeleton3D','bone':name,'matrix':[list(row) for row in rig.matrix_world@rig.pose.bones[name].matrix]} for name in ('Base','Tip')],
      'skin_vertices':[{'node':obj.name,'label':'corner-'+str(i),'rest_world':rest[i],'world':world[i]} for i in (0,2,6)]})
(out/'inspection.json').write_text(json.dumps({'consumer_samples':{'fps':30,'fps_base':1,'matrix_order':'row-major, Blender Z-up world space','samples':rows}},indent=2))
export_scene(out)
raw=bytearray((out/'asset.glb').read_bytes());jsonlen=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jsonlen]);binbase=20+jsonlen+8
weights=sorted({p['attributes']['WEIGHTS_0'] for m in doc['meshes'] for p in m['primitives']})
changes=[]
for index in weights:
    accessor=doc['accessors'][index];assert accessor['componentType']==5126 and accessor['type']=='VEC4',accessor
    view=doc['bufferViews'][accessor['bufferView']];start=binbase+view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',16)
    old=struct.unpack_from('<4f',raw,start)
    for i in range(accessor['count']):struct.pack_into('<4f',raw,start+i*stride,1.,0.,0.,0.)
    changes.append({'accessor':index,'count':accessor['count'],'before':old,'after':[1,0,0,0]})
(out/'wrong-weights.glb').write_bytes(raw)
(out/'mutation.json').write_text(json.dumps(changes,indent=2))
print('REVIEW_FIXTURE '+str(out))

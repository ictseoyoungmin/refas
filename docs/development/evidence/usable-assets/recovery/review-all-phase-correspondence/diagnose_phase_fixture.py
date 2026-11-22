import bpy,json
from pathlib import Path
root=Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/phase-fixture')
rows=[]
for kind,path in [('native',root/'native.blend'),('baseline',root/'asset.glb'),('mutated',root/'intermediate-morph-corruption.glb')]:
 if kind=='native':bpy.ops.wm.open_mainfile(filepath=str(path))
 else:
  bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30
  bpy.ops.import_scene.gltf(filepath=str(path),disable_bone_shape=True)
 obj=bpy.data.objects['Phase fixture 000'];keys=obj.data.shape_keys
 one={'kind':kind,'object':obj.name,'keys':[(k.name,k.slider_min,k.slider_max) for k in keys.key_blocks],
      'actions':[a.name for a in bpy.data.actions],
      'nla':[(t.name,t.mute,[(s.name,s.action.name,s.frame_start,s.frame_end,s.influence) for s in t.strips]) for t in keys.animation_data.nla_tracks],
      'action':keys.animation_data.action.name if keys.animation_data.action else None,'samples':[]}
 for frame in [1,24,25,26,49,73,97]:
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
  one['samples'].append({'frame':frame,'values':[k.value for k in keys.key_blocks],
        'zMinMax':[min(v.co.z for v in me.vertices),max(v.co.z for v in me.vertices)]})
  ev.to_mesh_clear()
 rows.append(one)
(root/'initial-mutation-diagnosis.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows))

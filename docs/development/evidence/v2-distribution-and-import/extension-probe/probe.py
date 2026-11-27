import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
result=bpy.ops.import_scene.gltf(filepath='/workspace/scratch/c52cb753f160/v2-next-audit/extension-probe/unknown-required.glb')
print("PROBE_IMPORT_RESULT", result)
print("PROBE_MESHES", sum(obj.type=="MESH" for obj in bpy.context.scene.objects))

import bpy,sys,json
sys.dont_write_bytecode=True
sys.path.insert(0,'/workspace/scratch/c52cb753f160/refas/skills/refas/scripts/production')
import blender_worker as worker
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
o=bpy.context.object;o.name='InstanceCarrier'
ng=bpy.data.node_groups.new('UnrealizedInstances','GeometryNodeTree')
ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
ni=ng.nodes.new('NodeGroupInput');no=ng.nodes.new('NodeGroupOutput')
cube=ng.nodes.new('GeometryNodeMeshCube')
inst=ng.nodes.new('GeometryNodeInstanceOnPoints');join=ng.nodes.new('GeometryNodeJoinGeometry')
ng.links.new(ni.outputs['Geometry'],inst.inputs['Points'])
ng.links.new(cube.outputs['Mesh'],inst.inputs['Instance'])
ng.links.new(ni.outputs['Geometry'],join.inputs['Geometry'])
ng.links.new(inst.outputs['Instances'],join.inputs['Geometry'])
ng.links.new(join.outputs['Geometry'],no.inputs['Geometry'])
m=o.modifiers.new('Unrealized GN Instances','NODES');m.node_group=ng
bpy.context.view_layer.update()
worker.require_visible_meshes();worker.require_supported_objects()
s=worker.inventory();dg=bpy.context.evaluated_depsgraph_get()
print('REPRO_GN '+json.dumps({'guardAccepted':True,'sceneObjectCount':len(bpy.context.scene.objects),'objectInstanceType':o.instance_type,'inventoryMeshVertices':s['statistics']['vertices'],'inventoryTriangles':s['statistics']['triangles'],'depsgraphInstances':sum(i.is_instance for i in dg.object_instances)}))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add();o=bpy.context.object
m=o.modifiers.new('RenderOnlyBevel','BEVEL');m.width=.3;m.segments=3;m.show_viewport=False;m.show_render=True
bpy.context.view_layer.update();worker.require_visible_meshes();worker.require_supported_objects();s=worker.inventory()
print('REPRO_MODIFIER '+json.dumps({'guardAccepted':True,'viewportEnabled':m.show_viewport,'renderEnabled':m.show_render,'inventoryTriangles':s['statistics']['triangles']}))

import bpy, sys, json
sys.dont_write_bytecode = True
sys.path.insert(0, '/workspace/scratch/c52cb753f160/refas/skills/refas/scripts/production')
import blender_worker as worker

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
obj.name = 'DifferentSubdivisionLevels'
modifier = obj.modifiers.new('ViewportOneRenderTwo', 'SUBSURF')
modifier.levels = 1
modifier.render_levels = 2
bpy.context.view_layer.update()
worker.require_visible_meshes()
worker.require_supported_objects()
viewport = worker.inventory()
record = {
    'guardAccepted': True,
    'viewportEnabled': modifier.show_viewport,
    'renderEnabled': modifier.show_render,
    'levels': modifier.levels,
    'renderLevels': modifier.render_levels,
    'inventoryTriangles': viewport['statistics']['triangles'],
    'inventoryBounds': viewport['bounds'],
}
# Evaluate the same subdivision amount as the render setting, in memory only.
# This is a geometry probe, not an actual render or an exported file test.
modifier.levels = modifier.render_levels
bpy.context.view_layer.update()
render_level_geometry = worker.inventory()
record['trianglesAtRenderSubdivisionLevel'] = render_level_geometry['statistics']['triangles']
record['boundsAtRenderSubdivisionLevel'] = render_level_geometry['bounds']
record['probeScope'] = 'In-memory geometry only; no images, native saves or GLB export'
print('REPRO_SUBDIVISION ' + json.dumps(record))

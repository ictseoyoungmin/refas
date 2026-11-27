"""Controlled local Blender observation of Collapse vertex-group semantics."""
import json
import sys
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree

bpy.ops.wm.read_factory_settings(use_empty=True)
results = []
for label, upper, lower, factor in [
    ('ungrouped', None, None, 1),
    ('upper_zero_lower_one', 0.0, 1.0, 1),
    ('upper_one_lower_zero', 1.0, 0.0, 1),
    ('upper_quarter_lower_one', .25, 1.0, 1000),
]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=.1)
    obj = bpy.context.object
    original = [(v.co.copy(), v.co.z > 0) for v in obj.data.vertices]
    mod = obj.modifiers.new('Controlled collapse', 'DECIMATE')
    mod.ratio = .1
    mod.vertex_group_factor = factor
    if upper is not None:
        group = obj.vertex_groups.new(name='Collapse eligibility')
        for v in obj.data.vertices:
            group.add([v.index], upper if v.co.z > 0 else lower, 'REPLACE')
        mod.vertex_group = group.name
    bpy.context.view_layer.update()
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    kd = KDTree(len(mesh.vertices))
    for v in mesh.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    results.append({'case': label, 'weightsUpperLower': [upper, lower],
                    'factor': factor, 'targetRatio': .1,
                    'originalVertices': len(original), 'remainingVertices': len(mesh.vertices),
                    'originalUpperVertices': sum(up for _, up in original),
                    'exactUpperVerticesPreserved': sum(up and kd.find(co)[2] < 1e-8 for co, up in original),
                    'originalLowerVertices': sum(not up for _, up in original),
                    'exactLowerVerticesPreserved': sum(not up and kd.find(co)[2] < 1e-8 for co, up in original)})
    ev.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
output = Path(sys.argv[sys.argv.index('--') + 1])
output.write_text(json.dumps({'blenderVersion': bpy.app.version_string, 'cases': results}, indent=2) + '\n')
print(json.dumps(results))

"""Two independently animated rigs that Godot names Skeleton3D under parents."""
import json
from pathlib import Path
import sys

import bpy

worker_root, output_root = sys.argv[sys.argv.index('--') + 1:]
sys.path.insert(0, worker_root)
from blender_worker import export_scene

out = Path(output_root)
out.mkdir(parents=True, exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 31
clip = 'DualRigMotion'
parts = []
for root_name, x, angle in [('CharacterRoot', -.4, .45), ('HardwareRoot', .4, -.65)]:
    parent = bpy.data.objects.new(root_name, None)
    scene.collection.objects.link(parent)
    parent.location.x = x
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = root_name + 'Rig'
    rig.parent = parent
    bone = rig.pose.bones[0]
    bone.rotation_mode = 'XYZ'
    for frame, factor in [(1, 0), (16, 1), (31, 0)]:
        bone.rotation_euler.x = angle * factor
        bone.keyframe_insert('rotation_euler', frame=frame)
    action = rig.animation_data.action
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 1, action)
    rig.animation_data.action = None
    bpy.ops.mesh.primitive_cube_add(size=.2, location=(0, 0, .6))
    mesh = bpy.context.object
    mesh.name = root_name + 'Panel'
    mesh.parent = rig
    mesh.vertex_groups.new(name=bone.name).add(list(range(8)), 1.0, 'REPLACE')
    modifier = mesh.modifiers.new('Skin', 'ARMATURE')
    modifier.object = rig
    parts.append((root_name, rig, bone, mesh))

samples = []
rest = {}
for frame in (1, 8, 16, 24, 31):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    row = {'seconds': frame/30, 'bones': [], 'skin_vertices': []}
    for root_name, rig, bone, mesh in parts:
        row['bones'].append({'node': 'Skeleton3D', 'fixture_root': root_name,
                             'bone': bone.name,
                             'matrix': [list(r) for r in rig.matrix_world @ bone.matrix]})
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        data = evaluated.to_mesh()
        for index in (0, 6):
            world = list(evaluated.matrix_world @ data.vertices[index].co)
            key = (root_name, index)
            rest.setdefault(key, world)
            row['skin_vertices'].append({'node': mesh.name, 'label': 'corner-' + str(index),
                                         'rest_world': rest[key], 'world': world})
        evaluated.to_mesh_clear()
    samples.append(row)
(out/'inspection.json').write_text(json.dumps({'consumer_samples': {
    'fps': 30, 'fps_base': 1, 'matrix_order': 'row-major, Blender Z-up world space',
    'samples': samples}}, indent=2) + '\n')
export_scene(out)

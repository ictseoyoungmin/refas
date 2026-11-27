"""Small actual GLB fixture for the all-phase correspondence observer.

One morphing box, 99 static boxes, split display normals/UVs and two named
materials exercise the checker contract without using any garment candidate.
"""
import json
from pathlib import Path
import sys
import bpy

ROOT = Path('/workspace/scratch/61afcdd4e3c6')
OUT = ROOT/'work/garment/export-review/phase-fixture'
OUT.mkdir(exist_ok=False)
sys.path.insert(0, str(ROOT/'refas/skills/refas/scripts/production'))
from blender_worker import export_scene

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.render.fps_base = 1
scene.frame_start, scene.frame_end = 1, 97
clip = 'Correspondence_Phase_Fixture'
materials = []
for name, color in [('Fixture blue', (.1, .3, .7, 1)), ('Fixture silver', (.6, .6, .6, 1))]:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = color
    materials.append(mat)
vertices = [(-.01,-.01,-.01),(.01,-.01,-.01),(.01,.01,-.01),(-.01,.01,-.01),
            (-.01,-.01,.01),(.01,-.01,.01),(.01,.01,.01),(-.01,.01,.01)]
faces = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
         (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
base = bpy.data.meshes.new('Fixture static mesh')
base.from_pydata(vertices, [], faces)
for mat in materials:
    base.materials.append(mat)
uv = base.uv_layers.new(name='Fixture UV seams')
for i, poly in enumerate(base.polygons):
    poly.material_index = (i//2) % 2
    poly.use_smooth = False
    for index, coord in zip(poly.loop_indices, [(0,0),(1,0),(0,1)]):
        uv.data[index].uv = coord
names = []
for i in range(100):
    mesh = base.copy() if i == 0 else base
    if i == 0:
        mesh.name = 'Fixture morph mesh'
    obj = bpy.data.objects.new('Phase fixture %03d' % i, mesh)
    scene.collection.objects.link(obj)
    obj.location = ((i%10)*.04, (i//10)*.04, .1)
    names.append(obj.name)
    if i == 0:
        obj.shape_key_add(name='Basis')
        key = obj.shape_key_add(name='Intermediate pulse')
        key.data[6].co.z += .004
        for frame in range(1,98):
            phase = min(frame-1, 97-frame)
            key.value = phase/24 if phase <= 24 else (48-phase)/24
            key.keyframe_insert('value', frame=frame)
        data = obj.data.shape_keys.animation_data
        for curve in data.action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = 'LINEAR'
        track = data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 1, data.action)
        data.action = None
scene.frame_set(1)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'native.blend'))
(OUT/'scope.json').write_text(json.dumps({'coatMeshes':100,'coatTriangles':1200,
    'fps':30,'clip':clip,'meshes':[{'name':name,'triangles':12} for name in names],
    'scope':'Checker fixture only. One real intermediate morph, two materials, display vertex splits, no garment acceptance.'},indent=2)+'\n')
export_scene(OUT)
print('PHASE_FIXTURE_EXPORTED', str(OUT))

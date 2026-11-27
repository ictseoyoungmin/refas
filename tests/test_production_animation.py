"""Actual Blender regressions for bounded animation records and skinned GLB import."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "skills/refas/scripts/production/blender_worker.py"
ENTRY = ROOT / "skills/refas/scripts/produce.py"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")

DENSE = '''import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 121
for i in range(21):
    bpy.ops.mesh.primitive_cube_add(size=0.02, location=(i * .03, 0, 0))
    obj = bpy.context.object
    obj.name = "MovingPart%02d" % i
    for frame in range(1, 122):
        obj.location.y = .1 * math.sin((frame - 1) * math.pi / 60)
        obj.rotation_euler.x = .4 * math.sin((frame - 1) * math.pi / 60)
        obj.scale.z = 1 + .1 * math.sin((frame - 1) * math.pi / 60)
        for path in ("location", "rotation_euler", "scale"):
            obj.keyframe_insert(path, frame=frame)
    action = obj.animation_data.action
    track = obj.animation_data.nla_tracks.new()
    track.name = "DenseMotion"
    track.strips.new("DenseMotion", 1, action)
    obj.animation_data.action = None
scene.frame_set(37)
'''

SKIN = '''import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 61
bpy.ops.object.armature_add()
rig = bpy.context.object
rig.name = "Wearer"
bpy.ops.mesh.primitive_cube_add(size=.2, location=(.3, 0, .5))
obj = bpy.context.object
# A real asset may use this name. Never discard meshes by importer-helper name.
obj.name = "Icosphere"
obj.shape_key_add(name="Basis")
obj.shape_key_add(name="Fit")
group = obj.vertex_groups.new(name="Bone")
group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
modifier = obj.modifiers.new("WearerSkin", 'ARMATURE')
modifier.object = rig
obj.parent = rig
bone = rig.pose.bones["Bone"]
bone.rotation_mode = 'XYZ'
for frame, angle in [(1, 0), (31, .8), (61, 0)]:
    bone.rotation_euler.y = angle
    bone.keyframe_insert('rotation_euler', frame=frame)
for curve in rig.animation_data.action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation = 'LINEAR'
scene.frame_set(19, subframe=.5)
'''

PROBE = r'''
import bpy, importlib.util, json, sys
from pathlib import Path
worker_path, result_path = sys.argv[sys.argv.index('--') + 1:]
spec = importlib.util.spec_from_file_location('worker', worker_path)
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
for frame in range(1, 122):
    obj.location.x = frame / 100
    obj.keyframe_insert('location', frame=frame)
action = obj.animation_data.action
curve = action.fcurves[0]
def record(): return w.digest(w.action_record(action))
base = record()
curve.keyframe_points[60].co.y += .01
interior = record()
curve.keyframe_points[60].handle_left_type = 'FREE'
curve.keyframe_points[60].handle_left.y += .02
handle = record()
curve.keyframe_points[60].easing = 'EASE_OUT'
curve.keyframe_points[60].amplitude += .3
easing = record()
noise = curve.modifiers.new('NOISE')
modified = record()
noise.strength += .4
modifier_edit = record()
curve.modifiers.remove(noise)
curve.convert_to_samples(1, 121)
sampled = record()
curve.sampled_points[60].co.y += .04
sample_edit = record()
track = obj.animation_data.nla_tracks.new()
strip = track.strips.new('Motion', 1, action)
obj.animation_data.action = None
bpy.context.view_layer.update()
before_strip = w.object_record(obj, bpy.context.evaluated_depsgraph_get())['fingerprint']
strip.repeat = 2
after_strip = w.object_record(obj, bpy.context.evaluated_depsgraph_get())['fingerprint']
before_rate = w.inventory()['fingerprint']
bpy.context.scene.render.fps = 30
after_rate = w.inventory()['fingerprint']
obj.shape_key_add(name='Basis')
fit = obj.shape_key_add(name='Fit')
for frame in range(1, 122):
    fit.value = (frame % 10) / 10
    fit.keyframe_insert('value', frame=frame)
bpy.context.scene.frame_set(1)
before_morph = w.object_record(obj, bpy.context.evaluated_depsgraph_get())['fingerprint']
obj.data.shape_keys.animation_data.action.fcurves[0].keyframe_points[60].co.y += .05
after_morph = w.object_record(obj, bpy.context.evaluated_depsgraph_get())['fingerprint']
result = {'interiorKeyObserved': base != interior, 'handleObserved': interior != handle,
          'easingObserved': handle != easing, 'modifierObserved': easing != modified,
          'modifierEditObserved': modified != modifier_edit,
          'sampleObserved': sampled != sample_edit, 'stripRepeatObserved': before_strip != after_strip,
          'frameRateObserved': before_rate != after_rate, 'interiorMorphKeyObserved': before_morph != after_morph,
          'sampleRecord': w.action_record(action)}
# Real render callback: the diagnostic scene must observe the inventoried
# subframe and frame rate, not the new scene's integer frame/default 24 fps.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=.2)
obj = bpy.context.object
for frame in (1, 20):
    obj.location.x = frame / 10
    obj.keyframe_insert('location', frame=frame)
for fcurve in obj.animation_data.action.fcurves:
    for key in fcurve.keyframe_points:
        key.interpolation = 'LINEAR'
scene = bpy.context.scene
scene.render.fps = 30
scene.render.fps_base = 1.001
scene.frame_set(10, subframe=.5)
source = w.inventory()
expected = {'frame': scene.frame_current, 'subframe': scene.frame_subframe,
            'fps': scene.render.fps, 'fpsBase': scene.render.fps_base, 'x': obj.location.x}
observed = []
def on_render(scene):
    observed.append({'frame': scene.frame_current, 'subframe': scene.frame_subframe,
                     'fps': scene.render.fps, 'fpsBase': scene.render.fps_base,
                     'x': scene.objects[obj.name].location.x})
bpy.app.handlers.render_pre.append(on_render)
renders = Path(result_path).parent / 'render-time'
renders.mkdir()
w.render_views(renders, ['front'], {'engine': 'CYCLES', 'samples': 1, 'size': 64}, source)
bpy.app.handlers.render_pre.remove(on_render)
result['diagnosticTimeObserved'] = observed == [expected]
result['diagnosticTime'] = {'expected': expected, 'observed': observed}
Path(result_path).write_text(json.dumps(result, indent=2) + '\n')
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for actual animation regressions")
class ProductionAnimationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-animation-")
        cls.root = Path(cls.temp.name)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def call(self, command):
        result = subprocess.run(list(map(str, command)), capture_output=True, text=True,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout[-5000:] + result.stderr[-5000:])
        return result.stdout

    def produce(self, name, code):
        script = self.root / (name + ".py")
        script.write_text(code)
        project = self.root / name
        self.call([sys.executable, "-B", ENTRY, "init", "--root", project, "--name", name])
        result = json.loads(self.call([sys.executable, "-B", ENTRY, "run", "--outputs", "delivery", "--root", project,
                    "--script", script, "--intent", name, "--views", "", "--blender", BLENDER,
                    "--timeout", "110", "--expected-revision", "none", "--expected-sequence", "0"]))
        verification = json.loads(self.call([sys.executable, "-B", ENTRY, "verify", "--root", project]))
        self.assertTrue(verification["ok"])
        scene_path = Path(result["outputs"]["scene"])
        revision = json.loads((scene_path.parent.parent / "revision.json").read_text())
        return result, json.loads(scene_path.read_text()), revision["verification"]

    def test_dense_animated_public_cli_revision_is_bounded_and_recoverable(self):
        result, scene, verification = self.produce("dense", DENSE)
        self.assertLess(Path(result["outputs"]["scene"]).stat().st_size, 512 * 1024)
        self.assertEqual(scene["statistics"]["meshes"], 21)
        self.assertEqual(scene["timing"], {"fps": 30, "fpsBase": 1.0, "subframe": 0.0})
        total = sum(c["keyframeCount"] for o in scene["objects"]
                    for t in o["animation"]["tracks"] for s in t["strips"]
                    for c in s["action"]["curves"])
        self.assertEqual(total, 21 * 9 * 121)
        self.assertEqual(verification["glb"]["encoded"]["animations"], 1)
        self.assertTrue(verification["native"]["fingerprintMatches"])

    def test_real_mesh_named_icosphere_survives_skinned_import_without_display_helpers(self):
        result, scene, verification = self.produce("skin", SKIN)
        check = verification["glb"]
        self.assertEqual(scene["statistics"]["meshes"], 1)
        self.assertEqual(check["reimportedStatistics"]["meshes"], 1)
        self.assertEqual(check["reimportedStatistics"]["triangles"], 12)
        self.assertEqual(check["encoded"]["skins"], 1)
        self.assertTrue(check["checks"]["skinPresent"])
        self.assertTrue(check["checks"]["morphsPresent"])
        self.assertTrue(check["checks"]["boundsMatchNative"])
        self.assertEqual(scene["timing"]["subframe"], .5)

    def test_documented_parenting_preserves_world_pose_with_fresh_nested_pivot(self):
        guide = (ROOT / "skills/refas/references/production-assemblies.md").read_text()
        section = guide.split("### Keep the neutral world pose when parenting\n", 1)[1]
        recipe = section.split("```python\n", 1)[1].split("\n```", 1)[0]
        script = self.root / "documented_parenting.py"
        script.write_text('''import bpy, math
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
data = bpy.data.meshes.new('PanelCage')
data.from_pydata([(0,0,0),(.4,0,0),(.4,0,.2),(0,0,.2)], [], [(0,1,2,3)])
part = bpy.data.objects.new('MovingPanel', data)
scene.collection.objects.link(part)
part.location, part.rotation_euler = (1.4,-.2,.8), (.12,-.2,.3)
bpy.context.view_layer.update()
expected = part.matrix_world.copy()
cage = tuple(tuple(v.co) for v in data.vertices)
mesh_id = data.as_pointer()
root = bpy.data.objects.new('Assembly', None)
scene.collection.objects.link(root)
root.location, root.rotation_euler = (.4,.1,.2), (.1,0,.3)
pivot = bpy.data.objects.new('HingePivot', None)
scene.collection.objects.link(pivot)
pivot.parent = root
pivot.location, pivot.rotation_euler = (.7,-.2,.3), (0,.2,-.1)
# Reproduce a stale inverse read before evaluating the newly authored hierarchy.
stale = part.copy()
scene.collection.objects.link(stale)
stale.matrix_parent_inverse = pivot.matrix_world.inverted()
stale.parent = pivot
''' + recipe + '''
def matrix_error(a, b):
    return max(abs(a[r][c]-b[r][c]) for r in range(4) for c in range(4))
assert matrix_error(stale.matrix_world, expected) > .01, 'fixture must expose the stale inverse'
assert matrix_error(part.matrix_world, expected) < 1e-6
assert part.parent == pivot
rest_pivot = pivot.matrix_world.copy()
for degrees in (17.5, 35, 0):
    pivot.rotation_euler.x = math.radians(degrees)
    bpy.context.view_layer.update()
    wanted = pivot.matrix_world @ rest_pivot.inverted() @ expected
    assert matrix_error(part.matrix_world, wanted) < 1e-6
    if degrees:
        assert (part.matrix_world.translation-expected.translation).length > .01
    assert part.data.as_pointer() == mesh_id
    assert tuple(tuple(v.co) for v in part.data.vertices) == cage
assert matrix_error(part.matrix_world, expected) < 1e-6
''')
        self.call([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                   "--python", script])

    def test_full_key_sample_modifier_and_playback_changes_are_observed(self):
        script = self.root / "probe.py"
        script.write_text(PROBE)
        output = self.root / "probe.json"
        self.call([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                   "--python", script, "--", WORKER, output])
        result = json.loads(output.read_text())
        for name, value in result.items():
            if name.endswith("Observed"):
                self.assertTrue(value, name)
        self.assertGreater(result["sampleRecord"]["curves"][0]["sampleCount"], 100)
        self.assertEqual(result["sampleRecord"]["curves"][0]["keyframeCount"], 0)


if __name__ == "__main__":
    unittest.main()

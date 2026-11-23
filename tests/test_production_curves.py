"""Opt-in native curve authoring and installed public-CLI regressions."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / "skills/refas"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")

CREATE = '''
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
for name, kind, height, color in [
        ('EditableBezier', 'BEZIER', 1, (.9, .17, .04)),
        ('ProtectedPoly', 'POLY', 0, (.04, .3, .6)),
        ('ProtectedNurbs', 'NURBS', 2, (.12, .5, .15))]:
    curve = bpy.data.curves.new(name + 'Controls', 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 4
    curve.render_resolution_u = 0
    curve.bevel_depth = .08
    curve.bevel_resolution = 1
    curve.use_fill_caps = True
    spline = curve.splines.new(kind)
    coords = [(-1.3, 0, height), (0, .2, height + .2), (1.3, 0, height)]
    points = spline.bezier_points if kind == 'BEZIER' else spline.points
    points.add(2)
    for i, (point, co) in enumerate(zip(points, coords)):
        point.co = co if kind == 'BEZIER' else (*co, 1)
        point.radius = .8 + i * .1
        point.tilt = i * .15
        if kind == 'BEZIER':
            point.handle_left_type = point.handle_right_type = 'FREE'
            point.handle_left = (co[0] - .4, co[1], co[2])
            point.handle_right = (co[0] + .4, co[1], co[2])
    if kind == 'NURBS':
        spline.order_u = 3
        spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    mat = bpy.data.materials.new(name + 'Material')
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    curve.materials.append(mat)
obj = bpy.data.objects['EditableBezier']
obj.shape_key_add(name='Basis')
bend = obj.shape_key_add(name='Bend')
bend.data[1].co.z += .6
bend.data[1].handle_left.z += .6
bend.data[1].handle_right.z += .6
obj.shape_key_add(name='InactiveShape')
for frame, value in [(1, 0), (5, 1)]:
    bend.value = value
    bend.keyframe_insert('value', frame=frame)
    obj.data.bevel_depth = .08 + value * .05
    obj.data.keyframe_insert('bevel_depth', frame=frame)
for action in bpy.data.actions:
    for fcurve in action.fcurves:
        for key in fcurve.keyframe_points:
            key.interpolation = 'LINEAR'
bpy.context.scene.frame_set(1)
'''

RAW_PROBE = '''
import bpy, json, sys
from pathlib import Path
source, picture, output = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
depsgraph = bpy.context.evaluated_depsgraph_get()
objects, world = {}, []
for obj in bpy.context.scene.objects:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        world.extend([list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
        objects[obj.name] = {'type': obj.type, 'splineType': obj.data.splines[0].type,
                             'vertices': len(mesh.vertices), 'triangles': len(mesh.loop_triangles)}
    finally:
        evaluated.to_mesh_clear()
image = bpy.data.images.load(picture, check_existing=False)
alpha = list(image.pixels)[3::4]
result = {'objects': objects, 'minimum': [min(p[i] for p in world) for i in range(3)],
          'maximum': [max(p[i] for p in world) for i in range(3)],
          'opaquePixels': sum(a > .5 for a in alpha), 'pixels': len(alpha)}
Path(output).write_text(json.dumps(result))
'''


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native curve regressions")
class ProductionCurveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-curves-")
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / "copied-refas"
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        cls.temporary = cls.root / "temporary"
        cls.temporary.mkdir()
        cls.source = cls.root / "source.blend"
        build = cls.root / "source.py"
        build.write_text(CREATE + "\nbpy.ops.wm.save_as_mainfile(filepath=" + repr(str(cls.source)) + ")\n")
        cls.invoke([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                    "--python", build])
        cls.source_sha = sha(cls.source)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def invoke(cls, args, success=True):
        result = subprocess.run(list(map(str, args)), cwd=cls.root, capture_output=True, text=True,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": "",
                                     "TMPDIR": str(cls.temporary)}, timeout=120)
        if (result.returncode == 0) != success:
            logs = sorted(cls.root.rglob("blender.log"), key=lambda path: path.stat().st_mtime)
            tail = logs[-1].read_text()[-4000:] if logs else ""
            raise AssertionError(result.stdout[-5000:] + result.stderr[-5000:] + tail)
        return result

    def cli(self, command, *args, success=True):
        result = self.invoke([sys.executable, "-B", self.skill / "scripts/produce.py", command, *args],
                             success=success)
        return json.loads(result.stdout) if success else result

    def blender_probe(self, name, code, *args):
        script = self.root / (name + ".py")
        script.write_text(code)
        self.invoke([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                     "--python", script, "--", *args])

    def test_copied_skill_native_edit_delivery_failure_conversion_and_exact_restore(self):
        project = self.root / "project"
        review = self.root / "review.json"
        review.write_text(json.dumps({
            "schema": "refas.production.review/v2",
            "views": [{"name": "curves", "position": [3, -5, 3], "target": [0, 0, 1], "orthoScale": 4.4}],
            "lighting": {"center": [0, 0, 1], "radius": 2},
            "background": [.3, .35, .4], "transparent": True}))
        self.cli("init", "--root", project, "--name", "native-curves")

        def run(name, code, profile="native", protection=(), render=False, success=True):
            script = self.root / (name + ".py")
            script.write_text(code)
            args = ["--root", project, "--script", script, "--intent", name,
                    "--outputs", profile, "--blender", BLENDER, "--size", 128, "--samples", 1]
            if render:
                args += ["--review-spec", review]
            else:
                args += ["--views", ""]
            for name in protection:
                args += ["--protect-object", name]
            return self.cli("run", *args, success=success)

        initial = run("create", CREATE, render=True)
        scene = json.loads(Path(initial["outputs"]["scene"]).read_text())
        self.assertEqual(scene["statistics"]["meshes"], 0)
        self.assertEqual(scene["statistics"]["curves"], 3)
        self.assertGreater(scene["statistics"]["triangles"], 0)
        self.assertNotIn("glb", initial["outputs"])
        self.assertEqual(len(initial["observations"]), 1)
        image = Path(initial["outputs"]["blend"]).parent / initial["observations"][0]["path"]
        raw_file = self.root / "raw-source.json"
        self.blender_probe("raw-probe", RAW_PROBE, initial["outputs"]["blend"], image, raw_file)
        raw = json.loads(raw_file.read_text())
        self.assertEqual({row["type"] for row in raw["objects"].values()}, {"CURVE"})
        self.assertEqual({row["splineType"] for row in raw["objects"].values()}, {"BEZIER", "POLY", "NURBS"})
        for field in ("vertices", "triangles"):
            self.assertEqual(scene["statistics"][field], sum(row[field] for row in raw["objects"].values()))
        for key, raw_key in (("min", "minimum"), ("max", "maximum")):
            for observed, expected in zip(scene["bounds"][key], raw[raw_key]):
                self.assertAlmostEqual(observed, expected, delta=2e-5)
        self.assertGreater(raw["opaquePixels"], 100)
        self.assertLess(raw["opaquePixels"], raw["pixels"] * .5)

        first_sha = sha(initial["outputs"]["blend"])
        edited = run("edit-radius", "import bpy\np=bpy.data.objects['EditableBezier'].data.shape_keys.key_blocks['Basis'].data[1]\np.radius += .3\n",
                     protection=("ProtectedPoly", "ProtectedNurbs"), render=True)
        edited_image = Path(edited["outputs"]["blend"]).parent / edited["observations"][0]["path"]
        self.assertEqual(initial["observations"][0]["camera"], edited["observations"][0]["camera"])
        self.assertEqual(initial["observations"][0]["lighting"], edited["observations"][0]["lighting"])
        self.assertNotEqual(sha(image), sha(edited_image))
        changed = json.loads(Path(edited["outputs"]["scene"]).read_text())
        before = {row["name"]: row for row in scene["objects"]}
        after = {row["name"]: row for row in changed["objects"]}
        self.assertNotEqual(before["EditableBezier"]["fingerprint"], after["EditableBezier"]["fingerprint"])
        for name in ("ProtectedPoly", "ProtectedNurbs"):
            self.assertEqual(before[name]["fingerprint"], after[name]["fingerprint"])
        revision = json.loads((Path(edited["outputs"]["blend"]).parent.parent / "revision.json").read_text())
        self.assertTrue(revision["verification"]["native"]["fingerprintMatches"])
        self.assertEqual(revision["verification"]["protectedObjects"]["status"], "passed")

        run("protected-radius", "import bpy\nbpy.data.objects['ProtectedPoly'].data.splines[0].points[1].radius += .5\n",
            protection=("ProtectedPoly",), success=False)
        self.cli("deliver", "--root", project, "--views", "", "--blender", BLENDER, success=False)
        state = self.cli("status", "--root", project)
        self.assertEqual((state["head"], state["sequence"]), (edited["head"], edited["sequence"]))
        messages = []
        for failed in state["incompleteRuns"]:
            folder = project / ".refas2/runs" / failed["id"] / "artifacts"
            messages.append(json.loads((folder / "result.json").read_text())["error"]["message"])
            self.assertFalse((folder / "scene.blend").exists())
            self.assertFalse((folder / "asset.glb").exists())
        self.assertTrue(any("Protected objects changed" in message for message in messages))
        self.assertTrue(any("Delivery" in message and "CURVE" in message for message in messages))

        # This fixture deliberately selects a static final pose before converting.
        converted = run("convert-final-pose", """import bpy
bpy.context.scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type == 'CURVE':
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
bpy.ops.object.convert(target='MESH')
""", profile="delivery")
        self.assertTrue(Path(converted["outputs"]["glb"]).is_file())
        delivered_scene = json.loads(Path(converted["outputs"]["scene"]).read_text())
        self.assertEqual({obj["type"] for obj in delivered_scene["objects"]}, {"MESH"})
        self.assertEqual(delivered_scene["statistics"]["triangles"], changed["statistics"]["triangles"])
        restored = self.cli("restore", "--root", project, "--revision", initial["head"],
                            "--expected-revision", converted["head"],
                            "--expected-sequence", converted["sequence"])
        self.assertEqual(sha(restored["outputs"]["blend"]), first_sha)
        self.assertEqual(sha(initial["outputs"]["blend"]), first_sha)
        for key, original in initial["outputs"].items():
            self.assertEqual(sha(restored["outputs"][key]), sha(original))
        for key, original in initial["inputs"].items():
            self.assertEqual(sha(restored["inputs"][key]), sha(original))
        self.assertTrue(self.cli("verify", "--root", project)["ok"])

    def test_standalone_curve_query_observes_actual_animation_without_persistent_files(self):
        before = {str(path.relative_to(self.root)) for path in self.root.rglob("*")}
        result = self.cli("inspect", "--input-blend", self.source.name, "--object", "EditableBezier",
                          "--frame", 1, "--frame", 5, "--topology", "--blender", BLENDER)
        self.assertFalse(result["persisted"])
        self.assertIsNone(result["revision"])
        self.assertEqual(result["nativeSha256"], self.source_sha)
        a, b = [sample["objects"][0] for sample in result["samples"]]
        self.assertEqual(a["type"], "CURVE")
        self.assertEqual(a["curve"]["splines"], 1)
        self.assertEqual(a["curve"]["controlPoints"], 3)
        self.assertEqual(a["curve"]["splineTypes"], ["BEZIER"])
        for row in (a, b):
            self.assertGreater(row["mesh"]["triangles"], 0)
            self.assertEqual(row["topology"]["statistics"]["triangles"], row["mesh"]["triangles"])
            self.assertTrue(all(len(detail["items"]) <= 8 for detail in row["topology"]["details"].values()))
        self.assertGreater(b["bounds"]["max"][2] - a["bounds"]["max"][2], .3)
        self.assertEqual(next(key["value"] for key in a["shapeKeys"] if key["name"] == "Bend"), 0)
        self.assertEqual(next(key["value"] for key in b["shapeKeys"] if key["name"] == "Bend"), 1)
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual({str(path.relative_to(self.root)) for path in self.root.rglob("*")}, before)
        self.assertEqual(list(self.temporary.iterdir()), [])

    def test_protection_observes_dormant_controls_keys_material_and_noncurrent_animation(self):
        result = self.root / "protection.json"
        cases = {
            "unused-end-handle": "obj.data.splines[0].bezier_points[0].handle_left.x -= .3",
            "control-radius": "obj.data.splines[0].bezier_points[0].radius += .2",
            "control-tilt": "obj.data.splines[0].bezier_points[0].tilt += .2",
            "key-handle": "key.data[0].handle_left.y += .4",
            "key-radius": "key.data[0].radius += .3",
            "key-tilt": "key.data[0].tilt += .3",
            "key-mode": "obj.data.shape_keys.use_relative = False",
            "material": "obj.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .13",
            "noncurrent-data-animation": "obj.data.animation_data.action.fcurves[0].keyframe_points[-1].co.y += .1",
        }
        self.blender_probe("protection", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, cases, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='curve_worker_test')
results = {}
for name, code in json.loads(cases).items():
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
    expected = api['protected_snapshot'](['EditableBezier'], (1, 0))
    obj = bpy.data.objects['EditableBezier']
    key = obj.data.shape_keys.key_blocks['InactiveShape']
    exec(code)
    try:
        api['require_protected'](expected, (1, 0))
    except ValueError as error:
        results[name] = str(error)
    else:
        results[name] = 'NOT REJECTED'
Path(output).write_text(json.dumps(results))
''', self.skill / "scripts/production/blender_worker.py", self.source, json.dumps(cases), result)
        for name, message in json.loads(result.read_text()).items():
            self.assertIn("Protected objects changed", message, name)
        self.assertEqual(sha(self.source), self.source_sha)

    def test_native_curve_scope_rejects_hidden_and_mismatched_evaluation(self):
        result = self.root / "scope.json"
        cases = {
            "hidden-render": "bpy.data.objects['EditableBezier'].hide_render = True",
            "hidden-viewport": "bpy.data.objects['EditableBezier'].hide_set(True)",
            "resolution": "bpy.data.objects['EditableBezier'].data.render_resolution_u = 9",
            "modifier-visibility": "m=bpy.data.objects['EditableBezier'].modifiers.new('Mismatch', 'ARRAY'); m.show_render=False",
            "offscene-profile-resolution": """curve = bpy.data.curves.new('OffsceneProfileControls', 'CURVE')
curve.dimensions = '2D'
curve.resolution_u = 4
curve.render_resolution_u = 9
spline = curve.splines.new('BEZIER')
spline.bezier_points.add(3)
spline.use_cyclic_u = True
for point, co in zip(spline.bezier_points, [(.1, 0, 0), (0, .1, 0), (-.1, 0, 0), (0, -.1, 0)]):
    point.co = co
    point.handle_left_type = point.handle_right_type = 'AUTO'
profile = bpy.data.objects.new('OffsceneProfile', curve)
bpy.data.objects['EditableBezier'].data.bevel_mode = 'OBJECT'
bpy.data.objects['EditableBezier'].data.bevel_object = profile""",
            "unrealized-nodes": """group = bpy.data.node_groups.new('Unrealized', 'GeometryNodeTree')
group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
cube = group.nodes.new('GeometryNodeMeshCube')
instance = group.nodes.new('GeometryNodeGeometryToInstance')
output = group.nodes.new('NodeGroupOutput')
group.links.new(cube.outputs['Mesh'], instance.inputs['Geometry'])
group.links.new(instance.outputs['Instances'], output.inputs['Geometry'])
bpy.data.objects['EditableBezier'].modifiers.new('Unrealized', 'NODES').node_group = group""",
        }
        self.blender_probe("scope", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, cases, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='curve_worker_test')
results = {}
for name, code in json.loads(cases).items():
    script = Path(output).with_name(name + '.py')
    script.write_text('import bpy\\n' + code + '\\n')
    folder = Path(output).with_name(name)
    try:
        api['execute']({'operation': 'edit', 'baseBlend': source, 'script': str(script),
                        'outputDir': str(folder), 'outputProfile': 'native', 'views': []})
    except ValueError as error:
        results[name] = str(error)
    else:
        results[name] = 'NOT REJECTED'
    assert not (folder / 'scene.blend').exists(), name
Path(output).write_text(json.dumps(results))
''', self.skill / "scripts/production/blender_worker.py", self.source, json.dumps(cases), result)
        for name, message in json.loads(result.read_text()).items():
            self.assertNotEqual(message, "NOT REJECTED", name)
            expected = "OffsceneProfile" if name == "offscene-profile-resolution" else "EditableBezier"
            self.assertIn(expected, message, name)
        self.assertEqual(sha(self.source), self.source_sha)


if __name__ == "__main__":
    unittest.main()

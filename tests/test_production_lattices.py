"""Opt-in native lattice editing through the copied public skill."""
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
import bpy, bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1)
panel = bpy.context.object
panel.name = 'Panel'
panel.scale = (2, .65, .45)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bm = bmesh.new()
bm.from_mesh(panel.data)
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=3, use_grid_fill=True)
bm.to_mesh(panel.data)
bm.free()
mat = bpy.data.materials.new('PanelMaterial')
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.12, .3, .65, 1)
panel.data.materials.append(mat)
bpy.ops.mesh.primitive_cube_add(size=.35, location=(2.2, 0, 0))
bpy.context.object.name = 'Neighbor'
bpy.context.object.data.materials.append(mat)
lattice = bpy.data.lattices.new('CageControls')
lattice.points_u = lattice.points_v = lattice.points_w = 3
lattice.interpolation_type_u = 'KEY_LINEAR'
lattice.interpolation_type_v = 'KEY_CARDINAL'
lattice.interpolation_type_w = 'KEY_BSPLINE'
cage = bpy.data.objects.new('Cage', lattice)
bpy.context.collection.objects.link(cage)
cage.scale = (1.4, .8, .8)
cage.hide_render = True
weights = cage.vertex_groups.new(name='ControlWeights')
weights.add(list(range(27)), .75, 'REPLACE')
lattice.points[13].weight_softbody = .6
cage.shape_key_add(name='Basis')
bend = cage.shape_key_add(name='Bend')
for index, point in enumerate(lattice.points):
    if abs(point.co.x) < 1e-6:
        bend.data[index].co.z += .25
cage.shape_key_add(name='InactiveShape')
for frame, value in [(1, .25), (9, 1)]:
    bend.value = value
    bend.keyframe_insert('value', frame=frame)
    lattice.use_outside = False
    lattice.keyframe_insert('use_outside', frame=frame)
for action in bpy.data.actions:
    for fcurve in action.fcurves:
        for key in fcurve.keyframe_points:
            key.interpolation = 'LINEAR'
modifier = panel.modifiers.new('EditableCage', 'LATTICE')
modifier.object = cage
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
'''

RAW_PROBE = '''
import bpy, json, sys
from pathlib import Path
source, edited, converted, picture, output = sys.argv[sys.argv.index('--') + 1:]
def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rows, world = {}, []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            mesh.calc_loop_triangles()
            world.extend([list(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
            rows[obj.name] = {'base': [list(v.co) for v in obj.data.vertices],
                'faces': [list(face.vertices) for face in obj.data.polygons],
                'evaluated': [list(v.co) for v in mesh.vertices], 'triangles': len(mesh.loop_triangles),
                'uv': [[list(loop.uv) for loop in layer.data] for layer in obj.data.uv_layers],
                'materials': [slot.material.name for slot in obj.material_slots],
                'parent': obj.parent.name if obj.parent else None,
                'matrix': [list(row) for row in obj.matrix_world]}
        finally:
            evaluated.to_mesh_clear()
    cage = bpy.data.objects.get('Cage')
    controls = None if cage is None else {
        'grid': [cage.data.points_u, cage.data.points_v, cage.data.points_w],
        'interpolation': [cage.data.interpolation_type_u, cage.data.interpolation_type_v,
                          cage.data.interpolation_type_w],
        'rest': [list(p.co) for p in cage.data.points],
        'weights': [[[g.group, g.weight] for g in p.groups] for p in cage.data.points],
        'softbody': [p.weight_softbody for p in cage.data.points],
        'keys': {k.name: [list(p.co) for p in k.data] for k in cage.data.shape_keys.key_blocks},
        'dataAction': [[list(p.co) for p in f.keyframe_points] for f in cage.data.animation_data.action.fcurves],
        'keyAction': [[list(p.co) for p in f.keyframe_points] for f in cage.data.shape_keys.animation_data.action.fcurves],
        'modifierTarget': bpy.data.objects['Panel'].modifiers['EditableCage'].object.name,
        'hideRender': cage.hide_render}
    return {'objects': rows, 'cage': controls,
            'minimum': [min(p[i] for p in world) for i in range(3)],
            'maximum': [max(p[i] for p in world) for i in range(3)]}
result = {'source': snapshot(source), 'edited': snapshot(edited), 'converted': snapshot(converted)}
image = bpy.data.images.load(picture, check_existing=False)
alpha = list(image.pixels)[3::4]
result['opaquePixels'] = sum(a > .5 for a in alpha)
result['pixels'] = len(alpha)
Path(output).write_text(json.dumps(result))
'''


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native lattice regressions")
class ProductionLatticeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-lattices-")
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

    def test_installed_native_cage_edit_explicit_delivery_and_exact_restore(self):
        project = self.root / "project"
        self.cli("init", "--root", project, "--name", "lattice-panel")
        review = self.root / "review.json"
        review.write_text(json.dumps({
            "schema": "refas.production.review/v2",
            "views": [{"name": "panel", "position": [3, -6, 3], "target": [.7, 0, 0], "orthoScale": 4.4}],
            "lighting": {"center": [.7, 0, 0], "radius": 2},
            "background": [.3, .35, .4], "transparent": True}))

        def run(name, code, source=None, profile="native", protected=(), render=False, success=True):
            script = self.root / (name + ".py")
            script.write_text(code)
            args = ["--root", project, "--script", script, "--intent", name,
                    "--outputs", profile, "--blender", BLENDER, "--size", 128, "--samples", 2]
            args += ["--review-spec", review] if render else ["--views", ""]
            if source:
                args += ["--input-blend", source]
            for name in protected:
                args += ["--protect-object", name]
            return self.cli("run", *args, success=success)

        initial = run("open-native-cage", "# Retain the supplied editable scene.\n", self.source, render=True)
        original = json.loads(Path(initial["outputs"]["scene"]).read_text())
        self.assertEqual((original["statistics"]["objects"], original["statistics"]["meshes"],
                          original["statistics"]["lattices"]), (3, 2, 1))
        self.assertEqual(original["statistics"]["shapeKeyObjects"], 1)
        controls = next(obj for obj in original["objects"] if obj["name"] == "Cage")
        self.assertEqual(controls["lattice"]["controlPointCount"], 27)
        self.assertNotIn("evaluatedMesh", controls)
        self.assertEqual(controls["vertexGroups"], ["ControlWeights"])
        self.assertTrue(controls["lattice"]["animation"])
        self.assertTrue(controls["shapeKeyAnimation"])
        self.assertEqual(sha(initial["inputs"]["base.blend"]), self.source_sha)
        self.assertNotIn("glb", initial["outputs"])
        initial_dir = Path(initial["outputs"]["blend"]).parent.parent
        initial_bytes = {str(p.relative_to(initial_dir)): p.read_bytes()
                         for folder in ("inputs", "artifacts") for p in (initial_dir / folder).rglob("*") if p.is_file()}

        edit = """import bpy
cage = bpy.data.objects['Cage']
key = cage.data.shape_keys.key_blocks['Bend']
for i, point in enumerate(cage.data.points):
    if abs(point.co.x) < 1e-6:
        key.data[i].co.z += .5
bpy.context.view_layer.update()
"""
        revised = run("raise-cage-center", edit, protected=("Neighbor",), render=True)
        changed = json.loads(Path(revised["outputs"]["scene"]).read_text())
        before = {obj["name"]: obj for obj in original["objects"]}
        after = {obj["name"]: obj for obj in changed["objects"]}
        self.assertEqual(before["Panel"]["mesh"], after["Panel"]["mesh"])
        self.assertNotEqual(before["Panel"]["evaluatedMesh"], after["Panel"]["evaluatedMesh"])
        self.assertEqual(before["Neighbor"], after["Neighbor"])
        self.assertNotEqual(before["Cage"]["fingerprint"], after["Cage"]["fingerprint"])
        self.assertEqual(initial["observations"][0]["camera"], revised["observations"][0]["camera"])
        self.assertEqual(initial["observations"][0]["lighting"], revised["observations"][0]["lighting"])
        self.assertNotEqual(sha(initial["observations"][0]["path"]), sha(revised["observations"][0]["path"]))
        run("reject-protected-cage", edit, protected=("Cage",), success=False)
        self.cli("deliver", "--root", project, "--views", "", "--blender", BLENDER, success=False)
        state = self.cli("status", "--root", project)
        self.assertEqual((state["head"], state["sequence"]), (revised["head"], revised["sequence"]))
        messages = []
        for failed in state["incompleteRuns"]:
            folder = project / ".refas2/runs" / failed["id"] / "artifacts"
            messages.append(json.loads((folder / "result.json").read_text())["error"]["message"])
            self.assertFalse((folder / "scene.blend").exists())
            self.assertFalse((folder / "asset.glb").exists())
        self.assertTrue(any("Protected objects changed" in message for message in messages))
        self.assertTrue(any("LATTICE" in message and "Delivery" in message for message in messages))

        converted = run("apply-current-cage-pose", """import bpy
panel = bpy.data.objects['Panel']
bpy.ops.object.select_all(action='DESELECT')
panel.select_set(True)
bpy.context.view_layer.objects.active = panel
bpy.ops.object.modifier_apply(modifier='EditableCage')
bpy.data.objects.remove(bpy.data.objects['Cage'], do_unlink=True)
""", profile="delivery")
        delivered = json.loads(Path(converted["outputs"]["scene"]).read_text())
        self.assertEqual({obj["type"] for obj in delivered["objects"]}, {"MESH"})
        self.assertEqual(delivered["statistics"]["triangles"], changed["statistics"]["triangles"])
        self.assertTrue(Path(converted["outputs"]["glb"]).is_file())
        probe = self.root / "readback.json"
        self.blender_probe("readback", RAW_PROBE, self.source, revised["outputs"]["blend"],
                           converted["outputs"]["blend"], revised["observations"][0]["path"], probe)
        raw = json.loads(probe.read_text())
        a, b, c = raw["source"], raw["edited"], raw["converted"]
        self.assertEqual(a["cage"]["grid"], [3, 3, 3])
        self.assertEqual(a["cage"]["interpolation"], ["KEY_LINEAR", "KEY_CARDINAL", "KEY_BSPLINE"])
        self.assertEqual(a["cage"]["modifierTarget"], "Cage")
        self.assertTrue(a["cage"]["hideRender"])
        self.assertEqual(a["cage"]["weights"][13], [[0, .75]])
        self.assertAlmostEqual(a["cage"]["softbody"][13], .6)
        for field in ("rest", "weights", "softbody", "dataAction", "keyAction"):
            self.assertEqual(a["cage"][field], b["cage"][field], field)
        self.assertEqual(a["cage"]["keys"]["InactiveShape"], b["cage"]["keys"]["InactiveShape"])
        self.assertNotEqual(a["cage"]["keys"]["Bend"], b["cage"]["keys"]["Bend"])
        self.assertEqual(a["objects"]["Neighbor"], b["objects"]["Neighbor"])
        for field in ("base", "faces", "uv", "materials", "parent", "matrix"):
            self.assertEqual(a["objects"]["Panel"][field], b["objects"]["Panel"][field], field)
        self.assertEqual(b["objects"]["Panel"]["evaluated"], c["objects"]["Panel"]["evaluated"])
        self.assertIsNone(c["cage"])
        for scene, observed in ((original, a), (changed, b)):
            self.assertEqual(scene["statistics"]["vertices"], sum(len(row["evaluated"]) for row in observed["objects"].values()))
            self.assertEqual(scene["statistics"]["triangles"], sum(row["triangles"] for row in observed["objects"].values()))
            for field, key in (("min", "minimum"), ("max", "maximum")):
                for actual, expected in zip(scene["bounds"][field], observed[key]):
                    self.assertAlmostEqual(actual, expected, delta=2e-5)
        self.assertGreater(raw["opaquePixels"], 100)
        self.assertLess(raw["opaquePixels"], raw["pixels"] * .5)
        restored = self.cli("restore", "--root", project, "--revision", initial["head"],
                            "--expected-revision", converted["head"], "--expected-sequence", converted["sequence"])
        restored_dir = Path(restored["outputs"]["blend"]).parent.parent
        self.assertEqual({str(p.relative_to(restored_dir)): p.read_bytes()
                          for folder in ("inputs", "artifacts") for p in (restored_dir / folder).rglob("*") if p.is_file()},
                         initial_bytes)
        self.assertTrue(self.cli("verify", "--root", project)["ok"])
        self.assertEqual(sha(self.source), self.source_sha)

    def test_standalone_query_observes_cage_and_deformed_mesh_without_persistence(self):
        before = {str(p.relative_to(self.root)): sha(p) for p in self.root.rglob("*") if p.is_file()}
        result = self.cli("inspect", "--input-blend", self.source.name, "--object", "Cage", "--object", "Panel",
                          "--frame", 1, "--frame", 9, "--topology", "--blender", BLENDER)
        self.assertFalse(result["persisted"])
        self.assertIsNone(result["revision"])
        self.assertEqual(result["nativeSha256"], self.source_sha)
        samples = [{obj["name"]: obj for obj in sample["objects"]} for sample in result["samples"]]
        for sample in samples:
            cage = sample["Cage"]
            self.assertEqual(cage["type"], "LATTICE")
            self.assertEqual(cage["lattice"], {"pointsU": 3, "pointsV": 3, "pointsW": 3, "controlPointCount": 27,
                "interpolationU": "KEY_LINEAR", "interpolationV": "KEY_CARDINAL", "interpolationW": "KEY_BSPLINE",
                "useOutside": False})
            for field in ("mesh", "bounds", "topology"):
                self.assertNotIn(field, cage)
            self.assertFalse(sample["Panel"]["topology"]["detailsIncluded"])
            self.assertTrue(all(not detail["items"] for detail in sample["Panel"]["topology"]["details"].values()))
        self.assertEqual([next(key["value"] for key in sample["Cage"]["shapeKeys"] if key["name"] == "Bend")
                          for sample in samples], [.25, 1])
        self.assertGreater(samples[1]["Panel"]["bounds"]["max"][2] - samples[0]["Panel"]["bounds"]["max"][2], .03)
        self.assertEqual({str(p.relative_to(self.root)): sha(p) for p in self.root.rglob("*") if p.is_file()}, before)
        self.assertEqual(list(self.temporary.iterdir()), [])

    def test_protection_covers_controls_weights_inactive_keys_and_noncurrent_animation(self):
        result = self.root / "protection.json"
        cases = {
            "direct-control": ["obj.shape_key_clear()", "obj.data.points[13].co_deform.x += .2"],
            "grid": ["obj.shape_key_clear()", "obj.data.points_u = 4"],
            "interpolation": ["", "obj.data.interpolation_type_u = 'KEY_BSPLINE'"],
            "group-weight": ["", "obj.vertex_groups['ControlWeights'].add([13], .15, 'REPLACE')"],
            "softbody-weight": ["", "obj.data.points[13].weight_softbody = .19"],
            "inactive-key": ["", "obj.data.shape_keys.key_blocks['InactiveShape'].data[13].co.z += .2"],
            "key-mode": ["", "obj.data.shape_keys.use_relative = False"],
            "show-only-key": ["", "obj.show_only_shape_key = not obj.show_only_shape_key"],
            "active-key": ["", "obj.active_shape_key_index = (obj.active_shape_key_index + 1) % len(obj.data.shape_keys.key_blocks)"],
            "noncurrent-key-animation": ["", "obj.data.shape_keys.animation_data.action.fcurves[0].keyframe_points[-1].co.y = .7"],
            "noncurrent-data-animation": ["", "obj.data.animation_data.action.fcurves[0].keyframe_points[-1].co.y = 1"],
        }
        self.blender_probe("protection", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, cases, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='lattice_worker_test')
results = {}
for name, (setup, edit) in json.loads(cases).items():
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
    obj = bpy.data.objects['Cage']
    exec(setup)
    expected = api['protected_snapshot'](['Cage'], (1, 0))
    exec(edit)
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

    def test_native_run_rejects_offscene_excluded_or_disabled_cage(self):
        result = self.root / "scope.json"
        cases = {
            "offscene": "for collection in list(cage.users_collection): collection.objects.unlink(cage)",
            "viewport-disabled": "cage.hide_viewport = True",
            "hidden-view-layer": "cage.hide_set(True)",
            "excluded-collection": """collection = bpy.data.collections.new('ExcludedCage')
bpy.context.scene.collection.children.link(collection)
for old in list(cage.users_collection): old.objects.unlink(cage)
collection.objects.link(cage)
bpy.context.view_layer.layer_collection.children[collection.name].exclude = True""",
            "offscene-parent-chain": """other = bpy.data.scenes.new('OtherScene')
for collection in list(cage.users_collection): collection.objects.unlink(cage)
other.collection.objects.link(cage)
bridge = bpy.data.objects.new('OffsceneParent', None)
other.collection.objects.link(bridge)
bridge.parent = cage
bridge.parent_type = 'VERTEX'
bridge.parent_vertices = (0, 0, 0)
panel = bpy.data.objects['Panel']
panel.modifiers.clear()
panel.parent = bridge""",
        }
        self.blender_probe("scope", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, cases, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='lattice_worker_test')
results = {}
for name, code in json.loads(cases).items():
    script = Path(output).with_name(name + '.py')
    script.write_text("import bpy\\ncage=bpy.data.objects['Cage']\\n" + code + '\\n')
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
            self.assertIn("Cage", message, name)
        self.assertEqual(sha(self.source), self.source_sha)


if __name__ == "__main__":
    unittest.main()

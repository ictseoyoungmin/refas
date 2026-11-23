"""Actual native construction meshes through a separately copied public skill."""
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

CREATE_BOOLEAN = '''
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=2)
housing = bpy.context.object
housing.name = 'Housing'
housing.scale = (1.5, .55, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
material = bpy.data.materials.new('ShellBlue')
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.05, .25, .5, 1)
housing.data.materials.append(material)
bpy.ops.mesh.primitive_cube_add(size=2, location=(-.55, 0, 0))
cutter = bpy.context.object
cutter.name = 'ApertureTool'
cutter.scale = (.35, 4, .25)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
cutter['refas_role'] = 'construction'
cutter.hide_render = True
cutter.hide_set(True)
modifier = housing.modifiers.new('EditableOpening', 'BOOLEAN')
modifier.operation = 'DIFFERENCE'
modifier.solver = 'EXACT'
modifier.object = cutter
bpy.ops.mesh.primitive_cube_add(size=.35, location=(2.2, 0, 0))
neighbor = bpy.context.object
neighbor.name = 'Neighbor'
neighbor.data.materials.append(material)
bpy.context.view_layer.update()
'''

CREATE_SHRINKWRAP = '''
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new('FitSourceMesh')
mesh.from_pydata([(-20, -20, .2), (20, -20, .2), (20, 20, .2), (-20, 20, .2)], [], [(0, 1, 2, 3)])
guide = bpy.data.objects.new('FitSource', mesh)
bpy.context.collection.objects.link(guide)
guide['refas_role'] = 'construction'
guide.hide_render = True
guide.hide_set(True)
mesh = bpy.data.meshes.new('RetopoPanelMesh')
mesh.from_pydata([(x, y, 1) for y in (-.7, 0, .7) for x in (-.7, 0, .7)], [],
                 [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 7, 6), (4, 5, 8, 7)])
panel = bpy.data.objects.new('RetopoPanel', mesh)
bpy.context.collection.objects.link(panel)
modifier = panel.modifiers.new('FitToSource', 'SHRINKWRAP')
modifier.target = guide
modifier.wrap_method = 'PROJECT'
modifier.use_project_z = True
modifier.use_positive_direction = False
modifier.use_negative_direction = True
modifier.offset = .04
bpy.ops.mesh.primitive_cube_add(size=.25, location=(1.3, 0, .2))
bpy.context.object.name = 'Neighbor'
bpy.context.view_layer.update()
'''

BOOLEAN_PROBE = '''
import bpy, json, sys
from mathutils import Vector
from pathlib import Path
before, after, delivered, glb, picture, output = sys.argv[sys.argv.index('--') + 1:]

def geometry(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    try:
        mesh.calc_loop_triangles()
        vertices = [evaluated.matrix_world @ point.co for point in mesh.vertices]
        triangles = [tuple(vertices[i] for i in triangle.vertices) for triangle in mesh.loop_triangles]
        signed_volume = sum(a.dot(b.cross(c)) for a, b, c in triangles) / 6
        rounded = []
        for triangle in triangles:
            points = tuple(tuple(round(coordinate, 6) for coordinate in point) for point in triangle)
            rounded.append(min(points, points[1:] + points[:1], points[2:] + points[:2]))
        return {'vertices': [list(point) for point in vertices],
                'triangles': sorted(rounded), 'volume': abs(signed_volume)}
    finally:
        evaluated.to_mesh_clear()

def ray_hit(obj, x):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    inverse = evaluated.matrix_world.inverted()
    origin = inverse @ Vector((x, -3, 0))
    direction = inverse.to_3x3() @ Vector((0, 1, 0))
    return bool(evaluated.ray_cast(origin, direction.normalized())[0])

def snapshot(path, center):
    if path.endswith('.glb'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    bpy.context.view_layer.update()
    housing = bpy.data.objects['Housing']
    helper = bpy.data.objects.get('ApertureTool')
    objects = {name: geometry(bpy.data.objects[name]) for name in ('Housing', 'Neighbor')}
    points = [point for row in objects.values() for point in row['vertices']]
    return {'objects': objects, 'names': sorted(obj.name for obj in bpy.context.scene.objects),
            'openingRayHit': ray_hit(housing, center), 'solidRayHit': ray_hit(housing, 1.2),
            'helper': None if helper is None else {
                'role': helper.get('refas_role'), 'hideRender': helper.hide_render,
                'hideSet': helper.hide_get(), 'vertices': [list(point.co) for point in helper.data.vertices],
                'matrix': [list(row) for row in helper.matrix_world]},
            'modifierTarget': housing.modifiers['EditableOpening'].object.name if housing.modifiers else None,
            'minimum': [min(point[i] for point in points) for i in range(3)],
            'maximum': [max(point[i] for point in points) for i in range(3)]}

result = {label: snapshot(path, center) for label, path, center in
          [('before', before, -.55), ('after', after, .3), ('native', delivered, .3), ('glb', glb, .3)]}
image = bpy.data.images.load(picture, check_existing=False)
alpha = list(image.pixels)[3::4]
result['opaquePixels'] = sum(value > .5 for value in alpha)
result['pixels'] = len(alpha)
result['openingPixelAlpha'] = alpha[(image.size[1] // 2) * image.size[0] + image.size[0] // 2]
Path(output).write_text(json.dumps(result))
'''


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for construction-mesh regressions")
class ProductionConstructionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-construction-")
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / "copied-refas"
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        cls.temporary = cls.root / "temporary"
        cls.temporary.mkdir()
        cls.source = cls.root / "source.blend"
        cls.shrink_source = cls.root / "shrink.blend"
        cls.blender_probe("create-sources", CREATE_BOOLEAN +
            "\nbpy.ops.wm.save_as_mainfile(filepath=" + repr(str(cls.source)) + ")\n" +
            CREATE_SHRINKWRAP +
            "\nbpy.ops.wm.save_as_mainfile(filepath=" + repr(str(cls.shrink_source)) + ")\n")
        cls.source_sha = sha(cls.source)
        cls.shrink_sha = sha(cls.shrink_source)

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

    @classmethod
    def blender_probe(cls, name, code, *args):
        script = cls.root / (name + ".py")
        script.write_text(code)
        cls.invoke([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                    "--python", script, "--", *args])

    def cli(self, command, *args, success=True):
        result = self.invoke([sys.executable, "-B", self.skill / "scripts/produce.py", command, *args],
                             success=success)
        return json.loads(result.stdout) if success else result

    def run_script(self, project, name, code, source=None, protected=(), review=None, success=True):
        script = self.root / (name + ".py")
        script.write_text(code)
        args = ["--root", project, "--script", script, "--intent", name,
                "--outputs", "native", "--blender", BLENDER, "--size", 128, "--samples", 2]
        args += ["--review-spec", review] if review else ["--views", ""]
        if source:
            args += ["--input-blend", source]
        for name in protected:
            args += ["--protect-object", name]
        return self.cli("run", *args, success=success)

    def test_installed_boolean_edit_delivery_and_exact_restore(self):
        project = self.root / "boolean-project"
        self.cli("init", "--root", project, "--name", "editable-opening")
        review = self.root / "opening-review.json"
        review.write_text(json.dumps({
            "schema": "refas.production.review/v2",
            "views": [{"name": "front", "position": [.3, -7, 0], "target": [.3, 0, 0], "orthoScale": 4.2}],
            "lighting": {"center": [.3, 0, 0], "radius": 2},
            "background": [.3, .35, .4], "transparent": True}))
        initial = self.run_script(project, "retain-opening", "# Keep the supplied editable Boolean.\n",
                                  source=self.source, review=review)
        original = json.loads(Path(initial["outputs"]["scene"]).read_text())
        self.assertEqual((original["statistics"]["objects"], original["statistics"]["meshes"],
                          original["statistics"]["constructionMeshes"]), (3, 2, 1))
        before = {obj["name"]: obj for obj in original["objects"]}
        self.assertEqual(before["ApertureTool"]["role"], "construction")
        self.assertEqual(before["Housing"]["role"], "asset")
        self.assertNotIn("glb", initial["outputs"])
        initial_dir = Path(initial["outputs"]["blend"]).parent.parent
        initial_bytes = {str(path.relative_to(initial_dir)): path.read_bytes()
                         for folder in ("inputs", "artifacts")
                         for path in (initial_dir / folder).rglob("*") if path.is_file()}

        revised = self.run_script(project, "widen-and-move-opening", """import bpy
cutter = bpy.data.objects['ApertureTool']
cutter.location.x = .3
for vertex in cutter.data.vertices:
    vertex.co.x *= 10 / 7
bpy.context.view_layer.update()
""", protected=("Neighbor",), review=review)
        changed = json.loads(Path(revised["outputs"]["scene"]).read_text())
        after = {obj["name"]: obj for obj in changed["objects"]}
        self.assertEqual(before["Housing"]["mesh"], after["Housing"]["mesh"])
        self.assertNotEqual(before["Housing"]["evaluatedMesh"], after["Housing"]["evaluatedMesh"])
        self.assertEqual(before["Neighbor"], after["Neighbor"])
        self.assertNotEqual(before["ApertureTool"]["fingerprint"], after["ApertureTool"]["fingerprint"])
        self.assertEqual(initial["observations"][0]["camera"], revised["observations"][0]["camera"])
        self.assertEqual(initial["observations"][0]["lighting"], revised["observations"][0]["lighting"])
        self.assertNotEqual(sha(initial["observations"][0]["path"]), sha(revised["observations"][0]["path"]))

        self.run_script(project, "reject-protected-cutter", "import bpy\nbpy.data.objects['ApertureTool'].location.x += .1\n",
                        protected=("ApertureTool",), success=False)
        state = self.cli("status", "--root", project)
        self.assertEqual((state["head"], state["sequence"]), (revised["head"], revised["sequence"]))
        failed = project / ".refas2/runs" / state["incompleteRuns"][-1]["id"] / "artifacts"
        self.assertIn("Protected objects changed", json.loads((failed / "result.json").read_text())["error"]["message"])
        self.assertFalse((failed / "scene.blend").exists())

        delivered = self.cli("deliver", "--root", project, "--views", "", "--blender", BLENDER)
        self.assertTrue(Path(delivered["outputs"]["glb"]).is_file())
        native = json.loads(Path(delivered["outputs"]["scene"]).read_text())
        self.assertEqual(native["statistics"]["constructionMeshes"], 1)
        probe = self.root / "opening-readback.json"
        self.blender_probe("opening-readback", BOOLEAN_PROBE, initial["outputs"]["blend"],
                           revised["outputs"]["blend"], delivered["outputs"]["blend"],
                           delivered["outputs"]["glb"], revised["observations"][0]["path"], probe)
        raw = json.loads(probe.read_text())
        for label, expected_volume in (("before", 6.215), ("after", 6.05), ("native", 6.05), ("glb", 6.05)):
            self.assertAlmostEqual(raw[label]["objects"]["Housing"]["volume"], expected_volume, delta=2e-5)
            self.assertFalse(raw[label]["openingRayHit"], label)
            self.assertTrue(raw[label]["solidRayHit"], label)
        for label in ("before", "after", "native"):
            self.assertEqual(raw[label]["helper"]["role"], "construction")
            self.assertTrue(raw[label]["helper"]["hideRender"])
            self.assertTrue(raw[label]["helper"]["hideSet"])
            self.assertEqual(raw[label]["modifierTarget"], "ApertureTool")
        self.assertEqual(raw["after"]["helper"], raw["native"]["helper"])
        self.assertIsNone(raw["glb"]["helper"])
        self.assertEqual(raw["glb"]["names"], ["Housing", "Neighbor"])
        for name in ("Housing", "Neighbor"):
            self.assertEqual(raw["after"]["objects"][name]["triangles"], raw["native"]["objects"][name]["triangles"])
            self.assertEqual(raw["after"]["objects"][name]["triangles"], raw["glb"]["objects"][name]["triangles"])
        for inventory, label in ((original, "before"), (changed, "after")):
            objects = raw[label]["objects"]
            self.assertEqual(inventory["statistics"]["vertices"], sum(len(row["vertices"]) for row in objects.values()))
            self.assertEqual(inventory["statistics"]["triangles"], sum(len(row["triangles"]) for row in objects.values()))
            for field, measured in (("min", "minimum"), ("max", "maximum")):
                for actual, expected in zip(inventory["bounds"][field], raw[label][measured]):
                    self.assertAlmostEqual(actual, expected, delta=2e-5)
        self.assertGreater(raw["opaquePixels"], 100)
        self.assertLess(raw["opaquePixels"], raw["pixels"] * .6)
        self.assertLess(raw["openingPixelAlpha"], .01)

        restored = self.cli("restore", "--root", project, "--revision", initial["head"],
                            "--expected-revision", delivered["head"], "--expected-sequence", delivered["sequence"])
        restored_dir = Path(restored["outputs"]["blend"]).parent.parent
        self.assertEqual({str(path.relative_to(restored_dir)): path.read_bytes()
                          for folder in ("inputs", "artifacts")
                          for path in (restored_dir / folder).rglob("*") if path.is_file()}, initial_bytes)
        self.assertTrue(self.cli("verify", "--root", project)["ok"])
        self.assertEqual(sha(self.source), self.source_sha)

    def test_shrinkwrap_retains_target_and_delivers_evaluated_surface_only(self):
        project = self.root / "shrink-project"
        self.cli("init", "--root", project, "--name", "retopo-fit")
        initial = self.run_script(project, "retain-fitting-source", "# Retain the native fitting target.\n",
                                  source=self.shrink_source)
        revised = self.run_script(project, "raise-fitting-source", "import bpy\nbpy.data.objects['FitSource'].location.z += .3\n",
                                  protected=("Neighbor",))
        delivered = self.cli("deliver", "--root", project, "--views", "", "--blender", BLENDER)
        output = self.root / "shrink-readback.json"
        self.blender_probe("shrink-readback", '''
import bpy, json, sys
from pathlib import Path
before, after, native, glb, output = sys.argv[sys.argv.index('--') + 1:]
result = {}
for label, path in [('before', before), ('after', after), ('native', native), ('glb', glb)]:
    if path.endswith('.glb'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    bpy.context.view_layer.update()
    panel = bpy.data.objects['RetopoPanel']
    evaluated = panel.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        points = [list(evaluated.matrix_world @ point.co) for point in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    result[label] = {'points': sorted(points), 'base': [list(point.co) for point in panel.data.vertices],
                     'target': panel.modifiers['FitToSource'].target.name if panel.modifiers else None,
                     'names': sorted(obj.name for obj in bpy.context.scene.objects)}
Path(output).write_text(json.dumps(result))
''', initial["outputs"]["blend"], revised["outputs"]["blend"], delivered["outputs"]["blend"],
                           delivered["outputs"]["glb"], output)
        raw = json.loads(output.read_text())
        for label, expected_z in (("before", .24), ("after", .54), ("native", .54), ("glb", .54)):
            for point in raw[label]["points"]:
                self.assertAlmostEqual(point[2], expected_z, delta=2e-6, msg=label)
        for label in ("before", "after", "native"):
            self.assertEqual(raw[label]["target"], "FitSource")
            self.assertEqual(raw[label]["base"], raw["before"]["base"])
        self.assertEqual(raw["glb"]["names"], ["Neighbor", "RetopoPanel"])
        inventory = json.loads(Path(revised["outputs"]["scene"]).read_text())
        self.assertEqual(inventory["statistics"]["meshes"], 2)
        self.assertEqual(inventory["statistics"]["constructionMeshes"], 1)
        self.assertLess(max(inventory["bounds"]["dimensions"]), 3)
        self.assertEqual(sha(self.shrink_source), self.shrink_sha)

    def test_explicit_helper_query_is_complete_and_read_only(self):
        before = {str(path.relative_to(self.root)): sha(path) for path in self.root.rglob("*") if path.is_file()}
        result = self.cli("inspect", "--input-blend", self.source, "--object", "ApertureTool",
                          "--object", "Housing", "--topology", "--blender", BLENDER)
        self.assertFalse(result["persisted"])
        self.assertIsNone(result["revision"])
        self.assertEqual(result["nativeSha256"], self.source_sha)
        objects = {row["name"]: row for row in result["samples"][0]["objects"]}
        self.assertEqual(objects["ApertureTool"]["role"], "construction")
        self.assertEqual(objects["Housing"]["role"], "asset")
        self.assertEqual(objects["ApertureTool"]["mesh"]["triangles"], 12)
        self.assertEqual(objects["ApertureTool"]["mesh"]["vertices"], 8)
        self.assertAlmostEqual(objects["ApertureTool"]["bounds"]["dimensions"][1], 8)
        self.assertFalse(objects["ApertureTool"]["topology"]["detailsIncluded"])
        self.assertEqual({str(path.relative_to(self.root)): sha(path) for path in self.root.rglob("*") if path.is_file()}, before)
        self.assertEqual(list(self.temporary.iterdir()), [])

    def test_protection_covers_role_and_same_geometry_target_replacement(self):
        output = self.root / "construction-protection.json"
        self.blender_probe("construction-protection", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, shrink, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='construction_worker_test')
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
collection = bpy.data.collections.new('ApertureTools')
bpy.context.scene.collection.children.link(collection)
collection.objects.link(bpy.data.objects['ApertureTool'])
modifier = bpy.data.objects['Housing'].modifiers['EditableOpening']
modifier.operand_type = 'COLLECTION'
modifier.collection = collection
collection_source = str(Path(output).with_name('collection-source.blend'))
bpy.ops.wm.save_as_mainfile(filepath=collection_source)
cases = {
    'helper-role': (source, ['ApertureTool'], "obj=bpy.data.objects['ApertureTool']; del obj['refas_role']; obj.hide_render=False; obj.hide_set(False)"),
    'helper-geometry': (source, ['ApertureTool'], "bpy.data.objects['ApertureTool'].data.vertices[0].co.z += .1"),
    'boolean-target': (source, ['Housing'], "obj=bpy.data.objects['ApertureTool']; replacement=obj.copy(); replacement.name='OtherCutter'; bpy.context.collection.objects.link(replacement); bpy.data.objects['Housing'].modifiers['EditableOpening'].object=replacement"),
    'shrinkwrap-target': (shrink, ['RetopoPanel'], "obj=bpy.data.objects['FitSource']; replacement=obj.copy(); replacement.name='OtherFitSource'; bpy.context.collection.objects.link(replacement); bpy.data.objects['RetopoPanel'].modifiers['FitToSource'].target=replacement"),
    'collection-target': (collection_source, ['Housing'], "replacement=bpy.data.collections.new('OtherTools'); bpy.context.scene.collection.children.link(replacement); replacement.objects.link(bpy.data.objects['ApertureTool']); bpy.data.objects['Housing'].modifiers['EditableOpening'].collection=replacement"),
    'collection-membership': (collection_source, ['Housing'], "obj=bpy.data.objects['ApertureTool']; replacement=obj.copy(); replacement.name='OtherCutter'; collection=bpy.data.collections['ApertureTools']; collection.objects.unlink(obj); collection.objects.link(replacement)"),
}
results = {}
for name, (path, protected, code) in cases.items():
    script = Path(output).with_name(name + '.py')
    script.write_text('import bpy\\n' + code + '\\n')
    folder = Path(output).with_name(name)
    try:
        api['execute']({'operation': 'edit', 'baseBlend': path, 'script': str(script),
                        'outputDir': str(folder), 'outputProfile': 'native', 'views': [],
                        'protectedObjects': protected})
    except ValueError as error:
        results[name] = str(error)
    else:
        results[name] = 'NOT REJECTED'
    assert not (folder / 'scene.blend').exists(), name
Path(output).write_text(json.dumps(results))
''', self.skill / "scripts/production/blender_worker.py", self.source, self.shrink_source, output)
        for name, message in json.loads(output.read_text()).items():
            self.assertIn("Protected objects changed", message, name)
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual(sha(self.shrink_source), self.shrink_sha)

    def test_invalid_roles_visibility_dependencies_and_helper_ancestors_are_rejected(self):
        cases = {
            "unmarked-hidden": "del helper['refas_role']",
            "unknown-role": "helper['refas_role']='guide'",
            "non-string-role": "helper['refas_role']=True",
            "visible-construction": "helper.hide_render=False",
            "viewport-disabled": "helper.hide_viewport=True",
            "offscene-target": "for collection in list(helper.users_collection): collection.objects.unlink(helper)",
            "excluded-target": """collection=bpy.data.collections.new('ExcludedTools')
bpy.context.scene.collection.children.link(collection)
for old in list(helper.users_collection): old.objects.unlink(helper)
collection.objects.link(helper)
bpy.context.view_layer.layer_collection.children[collection.name].exclude=True""",
            "non-mesh-role": """obj=bpy.data.objects.new('InvalidControl', None)
bpy.context.collection.objects.link(obj)
obj['refas_role']='construction'
obj.hide_render=True""",
            "asset-parented-to-helper": "bpy.data.objects['Neighbor'].parent=helper",
            "helper-ancestor": """bridge=bpy.data.objects.new('Bridge', None)
bpy.context.collection.objects.link(bridge)
bridge.parent=helper
bpy.data.objects['Neighbor'].parent=bridge""",
        }
        output = self.root / "construction-scope.json"
        self.blender_probe("construction-scope", '''
import bpy, json, runpy, sys
from pathlib import Path
worker, source, cases, output = sys.argv[sys.argv.index('--') + 1:]
api = runpy.run_path(worker, run_name='construction_worker_test')
results = {}
for name, code in json.loads(cases).items():
    script=Path(output).with_name(name + '.py')
    script.write_text("import bpy\\nhelper=bpy.data.objects['ApertureTool']\\n" + code + '\\n')
    folder=Path(output).with_name(name)
    try:
        api['execute']({'operation': 'edit', 'baseBlend': source, 'script': str(script),
                        'outputDir': str(folder), 'outputProfile': 'native', 'views': []})
    except ValueError as error:
        results[name]=str(error)
    else:
        results[name]='NOT REJECTED'
    assert not (folder / 'scene.blend').exists(), name
    assert not (folder / 'asset.glb').exists(), name
Path(output).write_text(json.dumps(results))
''', self.skill / "scripts/production/blender_worker.py", self.source, json.dumps(cases), output)
        for name, message in json.loads(output.read_text()).items():
            self.assertNotEqual(message, "NOT REJECTED", name)
            self.assertTrue(any(word in message.lower() for word in ("construction", "refas_role", "hidden", "aperturetool")),
                            (name, message))
        self.assertEqual(sha(self.source), self.source_sha)


if __name__ == "__main__":
    unittest.main()

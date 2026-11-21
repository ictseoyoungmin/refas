"""Opt-in real Blender checks for the production worker's artifact boundaries.

REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
    discover -s tests -p test_production_blender.py
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "skills/refas/scripts/production/blender_worker.py"
EXAMPLES = ROOT / "examples/production-workflow"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender installed for real integration checks")
class ProductionBlenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-production-test-")
        cls.root = Path(cls.temp.name)
        cls.create = cls.run_job("create", script=str(EXAMPLES / "create_headset.py"),
                                 views=["hero", "side"])
        cls.source = cls.root / "create/scene.blend"
        cls.source_sha = sha(cls.source)
        cls.revised = cls.run_job("revise", script=str(EXAMPLES / "revise_headset.py"),
                                  baseBlend=str(cls.source), views=["hero", "side"])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def run_job(cls, name, expect_success=True, **kwargs):
        job = {"operation": "edit", "outputDir": str(cls.root / name), "views": [],
               "render": {"engine": "CYCLES", "samples": 2, "size": 96}, **kwargs}
        job_path = cls.root / (name + ".json")
        job_path.write_text(json.dumps(job), encoding="utf-8")
        result = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                 "--python-exit-code", "1", "--python", str(WORKER), "--", "--job", str(job_path)],
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                capture_output=True, text=True, timeout=90)
        (cls.root / (name + ".log")).write_text(result.stdout + result.stderr)
        if expect_success and result.returncode:
            raise AssertionError(result.stdout[-4000:] + result.stderr[-4000:])
        if not expect_success:
            return result
        return json.loads((cls.root / name / "result.json").read_text())

    def test_native_and_glb_reopen_with_actual_png_observations(self):
        for name, result in (("create", self.create), ("revise", self.revised)):
            self.assertTrue(result["ok"])
            self.assertTrue(result["verification"]["native"]["fingerprintMatches"])
            self.assertEqual((self.root / name / "scene.blend").read_bytes()[:7], b"BLENDER")
            self.assertTrue(all(result["verification"]["glb"]["checks"].values()))
            encoded = result["verification"]["glb"]["encoded"]
            self.assertEqual(encoded["cameras"], 0)
            self.assertEqual(encoded["lights"], 0)
            self.assertEqual(len(result["observations"]), 2)
            for observation in result["observations"]:
                png = (self.root / name / observation["path"]).read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", png[16:24]), (96, 96))
                self.assertEqual(observation["registration"], "unregistered")
            scene = json.loads((self.root / name / "scene.json").read_text())
            self.assertEqual(scene["statistics"]["meshes"], 30)
            self.assertEqual(scene["statistics"]["objects"], 30)
            self.assertTrue(all(row["type"] == "MESH" for row in scene["objects"]))

    def test_local_revision_preserves_other_parts_and_native_source_bytes(self):
        before = json.loads((self.root / "create/scene.json").read_text())
        after = json.loads((self.root / "revise/scene.json").read_text())
        a = {row["name"]: row["fingerprint"] for row in before["objects"]}
        b = {row["name"]: row["fingerprint"] for row in after["objects"]}
        self.assertEqual(a.keys(), b.keys())
        self.assertEqual([name for name in a if a[name] != b[name]], ["HeadbandComfortPad"])
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual(before["bounds"], after["bounds"])
        for a_view, b_view in zip(self.create["observations"], self.revised["observations"]):
            self.assertEqual(a_view["camera"], b_view["camera"])

    def test_inspection_does_not_resave_or_mutate_inputs(self):
        glb = self.root / "create/asset.glb"
        original_glb = sha(glb)
        result = self.run_job("inspect", operation="inspect", baseBlend=str(self.source), assetGlb=str(glb))
        self.assertTrue(result["ok"])
        self.assertEqual(result["outputs"], {"scene": "scene.json"})
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual(sha(glb), original_glb)

    def test_static_modifiers_export_evaluated_geometry_without_losing_morphs(self):
        script = self.root / "mixed-modifiers.py"
        script.write_text('''import bpy
bpy.ops.mesh.primitive_cube_add(location=(-2, 0, 0))
body = bpy.context.object
body.name = "BeveledBody"
modifier = body.modifiers.new("EditableBevel", "BEVEL")
modifier.width = 0.15
modifier.segments = 3
bpy.ops.mesh.primitive_cube_add(location=(2, 0, 0))
morph = bpy.context.object
morph.name = "MorphPanel"
morph.shape_key_add(name="Basis")
raised = morph.shape_key_add(name="Raised")
for vertex in raised.data:
    if vertex.co.z > 0:
        vertex.co.z += 0.3
''', encoding="utf-8")
        result = self.run_job("mixed-modifiers", script=str(script))
        scene = json.loads((self.root / "mixed-modifiers/scene.json").read_text())
        objects = {row["name"]: row for row in scene["objects"]}
        body = objects["BeveledBody"]
        self.assertEqual([m["type"] for m in body["modifiers"]], ["BEVEL"])
        self.assertGreater(body["evaluatedMesh"]["triangles"], body["mesh"]["triangles"])
        self.assertEqual([k["name"] for k in objects["MorphPanel"]["shapeKeys"]], ["Basis", "Raised"])
        encoded = result["verification"]["glb"]["encoded"]
        self.assertEqual(encoded["triangles"], scene["statistics"]["triangles"])
        self.assertEqual(encoded["morphMeshes"], 1)
        self.assertTrue(all(result["verification"]["glb"]["checks"].values()))

    def test_dirty_packed_texture_pixels_survive_native_save_and_glb_export(self):
        script = self.root / "packed-texture.py"
        script.write_text('''import bpy
bpy.ops.mesh.primitive_cube_add()
material = bpy.data.materials.new("PaintedSurface")
material.use_nodes = True
image = bpy.data.images.new("Paint", width=4, height=4)
image.pixels[:] = [0.8, 0.2, 0.1, 1.0] * 16
texture = material.node_tree.nodes.new("ShaderNodeTexImage")
texture.image = image
material.node_tree.links.new(texture.outputs["Color"], material.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
bpy.context.object.data.materials.append(material)
''', encoding="utf-8")
        self.run_job("packed-before", script=str(script))
        original = self.root / "packed-before/scene.blend"
        original_sha = sha(original)
        edit = self.root / "paint-edit.py"
        edit.write_text('''import bpy
image = bpy.data.images["Paint"]
image.pixels[:] = [0.1, 0.2, 0.8, 1.0] * 16
image.update()
''', encoding="utf-8")
        self.run_job("packed-after", script=str(edit), baseBlend=str(original))
        samples = self.root / "packed-pixels.json"
        paths = [("before", str(original), False),
                 ("native", str(self.root / "packed-after/scene.blend"), False),
                 ("glb", str(self.root / "packed-after/asset.glb"), True)]
        probe = self.root / "read-packed-pixels.py"
        probe.write_text('''import bpy, json
result = {}
for label, filename, is_glb in ''' + repr(paths) + ''':
    if is_glb:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=filename)
    else:
        bpy.ops.wm.open_mainfile(filepath=filename, load_ui=False, use_scripts=False)
    images = [image for image in bpy.data.images if image.users and image.packed_file and len(image.pixels)]
    assert len(images) == 1, [(image.name, image.users) for image in bpy.data.images]
    result[label] = list(images[0].pixels[:4])
with open(''' + repr(str(samples)) + ''', "w") as stream:
    json.dump(result, stream)
''', encoding="utf-8")
        inspection = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                     "--python-exit-code", "1", "--python", str(probe)],
                                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                    capture_output=True, text=True, timeout=90)
        self.assertEqual(inspection.returncode, 0, inspection.stdout[-2000:] + inspection.stderr[-2000:])
        values = json.loads(samples.read_text())
        self.assertGreater(values["before"][0], values["before"][2])
        for label in ("native", "glb"):
            for actual, expected in zip(values[label], [0.1, 0.2, 0.8, 1.0]):
                self.assertAlmostEqual(actual, expected, delta=1 / 255 + 1e-6)
        self.assertEqual(sha(original), original_sha)

    def test_unknown_view_and_stale_output_are_rejected(self):
        bad_view = self.run_job("bad-view", expect_success=False,
                                script=str(EXAMPLES / "create_headset.py"), views=["guessed-view"])
        self.assertNotEqual(bad_view.returncode, 0)
        self.assertFalse((self.root / "bad-view/scene.blend").exists())
        stale = self.run_job("create", expect_success=False, script=str(EXAMPLES / "create_headset.py"))
        self.assertNotEqual(stale.returncode, 0)
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertTrue(json.loads((self.root / "create/result.json").read_text())["ok"])
        old = self.root / "old-evidence"
        old.mkdir()
        (old / "notes.txt").write_text("prior attempt")
        rejected = self.run_job("old-evidence", expect_success=False, script=str(EXAMPLES / "create_headset.py"))
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(sorted(path.name for path in old.iterdir()), ["notes.txt"])

    def test_hidden_object_and_collection_helpers_are_not_exported_as_success(self):
        for kind in ("object", "collection"):
            with self.subTest(kind=kind):
                script = self.root / ("hidden-" + kind + ".py")
                code = '''import bpy
bpy.ops.mesh.primitive_cube_add(location=(20, 0, 0))
helper = bpy.context.object
helper.name = "HiddenAuthoringHelper"
'''
                if kind == "object":
                    code += "helper.hide_render = True\n"
                else:
                    code += '''collection = bpy.data.collections.new("HiddenHelpers")
bpy.context.scene.collection.children.link(collection)
for previous in list(helper.users_collection):
    previous.objects.unlink(helper)
collection.objects.link(helper)
collection.hide_render = True
'''
                script.write_text(code, encoding="utf-8")
                result = self.run_job("hidden-" + kind, expect_success=False,
                                      script=str(script), baseBlend=str(self.source), views=["hero"])
                self.assertNotEqual(result.returncode, 0)
                report = json.loads((self.root / ("hidden-" + kind) / "result.json").read_text())
                self.assertFalse(report["ok"])
                self.assertIn("Hidden or excluded meshes", report["error"]["message"])
                self.assertFalse((self.root / ("hidden-" + kind) / "scene.blend").exists())
                self.assertEqual(sha(self.source), self.source_sha)

    def test_script_failure_retains_previous_native_and_is_not_success(self):
        script = self.root / "failing.py"
        script.write_text("import bpy\nbpy.data.objects['HeadbandOuter'].location.x += 1\nraise RuntimeError('intentional failure')\n")
        failed = self.run_job("failed", expect_success=False, script=str(script), baseBlend=str(self.source))
        self.assertNotEqual(failed.returncode, 0)
        self.assertFalse(json.loads((self.root / "failed/result.json").read_text())["ok"])
        self.assertFalse((self.root / "failed/scene.blend").exists())
        self.assertEqual(sha(self.source), self.source_sha)


if __name__ == "__main__":
    unittest.main()

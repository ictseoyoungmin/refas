"""Opt-in Blender coverage for native iteration, protection and read-only queries."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "skills/refas/scripts/production/blender_worker.py"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native regressions")
class ProductionNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-native-test-")
        cls.root = Path(cls.temp.name)
        cls.create = cls.script("create", '''
import bpy
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
obj.name = 'Protected'
material = bpy.data.materials.new('ProtectedMaterial')
material.use_nodes = True
obj.data.materials.append(material)
bpy.ops.mesh.primitive_cube_add(location=(3, 0, 0))
obj = bpy.context.object
obj.name = 'Editable'
obj.keyframe_insert(data_path='location', frame=1)
obj.location.z = 1
obj.keyframe_insert(data_path='location', frame=5)
bpy.context.scene.frame_set(1)
''')
        cls.initial = cls.job("initial", operation="edit", script=str(cls.create), outputProfile="native")
        cls.source = cls.root / "initial/scene.blend"
        cls.source_sha = sha(cls.source)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def script(cls, name, text):
        path = cls.root / (name + ".py")
        path.write_text(text, encoding="utf-8")
        return path

    @classmethod
    def job(cls, name, expect_success=True, **options):
        job = {"outputDir": str(cls.root / name), "views": [],
               "render": {"size": 64, "samples": 1}, **options}
        path = cls.root / (name + ".json")
        path.write_text(json.dumps(job), encoding="utf-8")
        completed = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                    "--python-exit-code", "1", "--python", str(WORKER), "--", "--job", str(path)],
                                   capture_output=True, text=True, timeout=60,
                                   env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        if not expect_success:
            if completed.returncode == 0:
                raise AssertionError("Worker unexpectedly accepted " + name)
            return completed.stdout + completed.stderr
        if completed.returncode:
            raise AssertionError(completed.stdout[-5000:] + completed.stderr[-5000:])
        return json.loads((cls.root / name / "result.json").read_text())

    def test_native_profile_skips_delivery_and_preserves_protected_object(self):
        script = self.script("native-edit", '''
import bpy, sys
def forbidden_export(*args, **kwargs):
    raise RuntimeError('native iteration attempted an export')
sys.modules['__main__'].export_scene = forbidden_export
bpy.data.objects['Editable'].data.vertices[0].co.x -= 0.1
bpy.context.scene.frame_set(5)
''')
        result = self.job("native-edit", operation="edit", baseBlend=str(self.source),
                          script=str(script), outputProfile="native", protectedObjects=["Protected"])
        self.assertEqual(result["outputs"], {"blend": "scene.blend", "scene": "scene.json"})
        self.assertEqual(result["verification"]["glb"]["status"], "not-requested")
        self.assertEqual(result["verification"]["protectedObjects"]["objects"], ["Protected"])
        self.assertEqual(result["verification"]["protectedObjects"]["status"], "passed")
        self.assertEqual(sorted(p.name for p in (self.root / "native-edit").iterdir()),
                         ["result.json", "scene.blend", "scene.json"])
        self.assertEqual(sha(self.source), self.source_sha)

    def test_missing_profile_retains_delivery_behavior(self):
        script = self.script("delivery-edit", "import bpy\nbpy.data.objects['Editable'].data.vertices[0].co.x -= 0.1\n")
        result = self.job("delivery-edit", operation="edit", baseBlend=str(self.source), script=str(script))
        self.assertEqual(result["outputProfile"], "delivery")
        self.assertEqual(result["outputs"]["glb"], "asset.glb")
        self.assertEqual(result["verification"]["glb"]["status"], "passed")

    def test_protection_rejects_geometry_and_shared_material_changes(self):
        edits = {
            "geometry": "bpy.data.objects['Protected'].data.vertices[0].co.x -= 0.1",
            "material": "bpy.data.materials['ProtectedMaterial'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.125",
            "removal": "bpy.data.objects.remove(bpy.data.objects['Protected'], do_unlink=True)",
        }
        for label, edit in edits.items():
            with self.subTest(label=label):
                script = self.script("protected-" + label, "import bpy\n" + edit + "\n")
                output = self.job("protected-" + label, expect_success=False, operation="edit",
                                  baseBlend=str(self.source), script=str(script), outputProfile="native",
                                  protectedObjects=["Protected"])
                self.assertIn("Protected", output)
                self.assertFalse((self.root / ("protected-" + label) / "scene.blend").exists())
        self.assertEqual(sha(self.source), self.source_sha)

    def test_unknown_protected_name_is_rejected_before_script(self):
        marker = self.root / "should-not-exist"
        script = self.script("missing-protected", "from pathlib import Path\nPath(" + repr(str(marker)) + ").write_text('ran')\n")
        output = self.job("missing-protected", expect_success=False, operation="edit", baseBlend=str(self.source),
                          script=str(script), protectedObjects=["Typo"])
        self.assertIn("protectedObjects names missing", output)
        self.assertFalse(marker.exists())

    def test_query_is_selected_compact_and_read_only_at_actual_frames(self):
        result = self.job("query", operation="query", baseBlend=str(self.source),
                          queryObjects=["Editable"], queryFrames=[1, 5], queryTopology=True)
        query = json.loads((self.root / "query/query.json").read_text())
        self.assertEqual(result["outputs"], {"query": "query.json"})
        self.assertEqual(query["schema"], "refas.production.query/v2")
        self.assertEqual(query["blendSha256"], self.source_sha)
        self.assertEqual([sample["frame"] for sample in query["samples"]], [1, 5])
        a, b = [sample["objects"][0] for sample in query["samples"]]
        self.assertEqual(a["name"], "Editable")
        self.assertEqual(b["matrixWorld"][2][3] - a["matrixWorld"][2][3], 1)
        self.assertEqual(a["topology"]["statistics"]["triangles"], 12)
        self.assertEqual(a["topology"]["statistics"]["boundaryEdges"], 0)
        self.assertTrue(all(len(detail["items"]) <= 8 for detail in a["topology"]["details"].values()))
        self.assertEqual(sorted(p.name for p in (self.root / "query").iterdir()), ["query.json", "result.json"])
        self.assertEqual(sha(self.source), self.source_sha)

    def test_query_default_and_invalid_exact_selection(self):
        self.job("query-all", operation="query", baseBlend=str(self.source))
        query = json.loads((self.root / "query-all/query.json").read_text())
        self.assertEqual(query["objectNames"], ["Editable", "Protected"])
        self.assertEqual(len(query["samples"]), 1)
        self.assertNotIn("topology", query["samples"][0]["objects"][0])
        output = self.job("query-missing", expect_success=False, operation="query", baseBlend=str(self.source),
                          queryObjects=["Edit"])
        self.assertIn("queryObjects names missing", output)
        self.assertEqual(sha(self.source), self.source_sha)

    def test_export_preflight_has_no_model_outputs(self):
        result = self.job("preflight", operation="preflight")
        report = json.loads((self.root / "preflight/preflight.json").read_text())
        self.assertEqual(report["schema"], "refas.production.preflight/v2")
        self.assertEqual(report["positiveSkinWeightGuard"], "supported-and-restored")
        self.assertEqual(result["outputs"], {"preflight": "preflight.json"})
        self.assertEqual(sorted(p.name for p in (self.root / "preflight").iterdir()), ["preflight.json", "result.json"])


if __name__ == "__main__":
    unittest.main()

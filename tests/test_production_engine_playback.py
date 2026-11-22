"""Opt-in real Blender -> GLB -> Godot playback, including failing controls."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_production_animation import SKIN

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples/engine-playback"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")
GODOT = os.environ.get("GODOT_EXE") or shutil.which("godot")


class ProductionEnginePlaybackArgumentTests(unittest.TestCase):
    def test_tolerances_reject_nonfinite_and_nonpositive_values_before_writing(self):
        with tempfile.TemporaryDirectory(prefix="refas-godot-arguments-") as directory:
            output = Path(directory) / "unexpected-output"
            for flag in ("--tolerance", "--vertex-tolerance"):
                for value in ("nan", "inf", "-inf", "0", "-0.00001"):
                    with self.subTest(flag=flag, value=value):
                        result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"),
                            "--asset", "absent.glb", "--inspection", "absent.json", "--clip", "Unused",
                            "--out", str(output), flag + "=" + value],
                            capture_output=True, text=True, timeout=15)
                        self.assertEqual(result.returncode, 2, result.stderr)
                        self.assertIn("must be a finite positive number", result.stderr)
                        self.assertFalse(output.exists())


@unittest.skipUnless(os.environ.get("REFAS_GODOT_TESTS") == "1" and BLENDER and GODOT,
                     "Set REFAS_GODOT_TESTS=1 with Blender and Godot for consumer regressions")
class ProductionEnginePlaybackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-godot-")
        cls.root = Path(cls.temp.name)
        script = cls.root / "fixture.py"
        script.write_text("import bpy, sys, json\nfrom pathlib import Path\n"
            + "sys.path.insert(0, " + repr(str(ROOT / "skills/refas/scripts/production")) + ")\n"
            + "from blender_worker import export_scene\nSKIN_CODE = " + repr(SKIN) + "\n" + SKIN
            + "\nout = Path(" + repr(str(cls.root)) + ")\n"
            + '''
action = rig.animation_data.action
clip = action.name
def write_case(label):
    directory = out / label
    directory.mkdir()
    rows = []
    rest_world = None
    for frame in (1, 19.5, 31, 61):
        scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        world = list(evaluated.matrix_world @ mesh.vertices[0].co)
        evaluated.to_mesh_clear()
        if rest_world is None:
            rest_world = world
        rows.append({'seconds': frame / 30, 'bones': [{'node': 'Skeleton3D', 'bone': 'Bone',
            'matrix': [list(row) for row in rig.matrix_world @ bone.matrix]}],
            'skin_vertices': [{'node': 'Icosphere', 'label': 'weighted-corner',
                              'rest_world': rest_world, 'world': world}]})
    (directory / 'inspection.json').write_text(json.dumps({'clip': clip, 'consumer_samples': {
        'fps': 30, 'fps_base': 1, 'matrix_order': 'row-major, Blender Z-up world space', 'samples': rows}}))
    export_scene(directory)
write_case('moving')
for curve in action.fcurves:
    for key in curve.keyframe_points:
        key.co.y = 0
    curve.update()
write_case('stationary')
exec(SKIN_CODE)
corrective = obj.data.shape_keys.key_blocks['Fit']
corrective.data[0].co.z += .06
for frame, value in ((1, 0), (31, 1), (61, 0)):
    corrective.value = value
    corrective.keyframe_insert('value', frame=frame)
clip = 'CombinedCorrection'
for owner in (rig, obj.data.shape_keys):
    for curve in owner.animation_data.action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'
    track = owner.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 1, owner.animation_data.action)
    owner.animation_data.action = None
write_case('morph')
''')
        result = subprocess.run([BLENDER, "-b", "--factory-startup", "--threads", "2",
                "--python-exit-code", "1", "--python", str(script)], capture_output=True, text=True, timeout=90)
        if result.returncode:
            raise AssertionError(result.stdout[-5000:] + result.stderr[-5000:])
        cls.clip = json.loads((cls.root / "moving/inspection.json").read_text())["clip"]
        result = subprocess.run([BLENDER, "-b", "--factory-startup", "--threads", "2",
                "--python-exit-code", "1", "--python", str(ROOT / "tests/fixtures/production_weighted_skin.py"),
                "--", str(ROOT / "skills/refas/scripts/production"), str(cls.root / "weighted")],
                capture_output=True, text=True, timeout=90)
        if result.returncode:
            raise AssertionError(result.stdout[-5000:] + result.stderr[-5000:])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_case(self, label, fixture="moving", inspection=None, clip=None, asset_name="asset.glb",
                 vertex_tolerance=None):
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--asset",
                str(self.root / fixture / asset_name), "--inspection",
                str(inspection or self.root / fixture / "inspection.json"), "--clip", clip or self.clip,
                "--out", str(self.root / label), "--godot", str(GODOT),
                "--required-skinned-meshes", "1", "--expected-triangles", "12"]
        if vertex_tolerance is not None:
            command += ["--vertex-tolerance", str(vertex_tolerance)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=90)
        path = self.root / label / "result.json"
        self.assertTrue(path.exists(), result.stdout[-3000:] + result.stderr[-3000:])
        return result, json.loads(path.read_text())

    def test_actual_skin_and_bone_motion_match_native(self):
        result, report = self.run_case("positive")
        self.assertEqual(result.returncode, 0, report)
        self.assertTrue(report["ok"])
        self.assertEqual(report["geometry"]["skinnedMeshes"], 1)
        self.assertGreater(report["maximumObservedMatrixChange"], .1)
        self.assertEqual(sum(len(row["vertexProbes"]) for row in report["samples"]), 4)
        self.assertEqual(report["tolerances"], {"matrix": 2e-5, "skinVertexM": 2e-5,
                                               "restVertexMatchM": 1e-5})

    def test_wrong_native_expectation_is_rejected(self):
        source = json.loads((self.root / "moving/inspection.json").read_text())
        source["consumer_samples"]["samples"][1]["bones"][0]["matrix"][0][3] += .01
        inspection = self.root / "wrong-native.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("bad-native", inspection=inspection, vertex_tolerance=5e-5)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(not c["ok"] and c["name"].startswith("nativeMatrix:") for c in report["checks"]))
        self.assertEqual(report["tolerances"]["matrix"], 2e-5)

    def test_explicit_vertex_budget_preserves_measured_error_and_rest_association(self):
        source = json.loads((self.root / "moving/inspection.json").read_text())
        source["consumer_samples"]["samples"][1]["skin_vertices"][0]["world"][0] += 3e-5
        inspection = self.root / "declared-budget.json"
        inspection.write_text(json.dumps(source))
        strict, strict_report = self.run_case("strict-budget", inspection=inspection)
        self.assertNotEqual(strict.returncode, 0)
        self.assertTrue(any(not c["ok"] and c["name"].startswith("nativeSkinVertex:")
                            for c in strict_report["checks"]))
        result, report = self.run_case("explicit-budget", inspection=inspection, vertex_tolerance=5e-5)
        self.assertEqual(result.returncode, 0, report)
        self.assertEqual(report["tolerances"], {"matrix": 2e-5, "skinVertexM": 5e-5,
                                               "restVertexMatchM": 1e-5})
        configuration = json.loads((self.root / "explicit-budget/configuration.json").read_text())
        self.assertEqual(configuration["vertexTolerance"], 5e-5)
        self.assertEqual(configuration["tolerance"], 2e-5)
        probes = [probe for row in report["samples"] for probe in row["vertexProbes"]]
        self.assertGreater(max(probe["distanceM"] for probe in probes), 2e-5)
        self.assertLess(max(probe["restMatchDistanceM"] for probe in probes), 1e-5)

    def test_wrong_native_skin_deformation_is_rejected(self):
        source = json.loads((self.root / "moving/inspection.json").read_text())
        source["consumer_samples"]["samples"][1]["skin_vertices"][0]["world"][0] += .01
        inspection = self.root / "wrong-skin.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("bad-skin", inspection=inspection)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(not c["ok"] and c["name"].startswith("nativeSkinVertex:") for c in report["checks"]))

    def test_synchronized_corrective_morph_and_skin_match_native(self):
        result, report = self.run_case("morph-positive", fixture="morph", clip="CombinedCorrection")
        self.assertEqual(result.returncode, 0, report)
        self.assertTrue(report["ok"])
        samples = [probe for row in report["samples"] for probe in row["vertexProbes"]]
        self.assertEqual(len(samples), 4)
        self.assertGreater(max(probe["blendShapeWeights"]["Fit"] for probe in samples), .9)

    def test_transformed_multi_bone_skin_retains_raw_quantized_deformation(self):
        result, report = self.run_case("weighted-positive", fixture="weighted", clip="ReviewBlend")
        self.assertEqual(result.returncode, 0, report)
        probes = [probe for row in report["samples"] for probe in row["vertexProbes"]]
        self.assertEqual(len(probes), 15)
        # Preserve the observable UNORM16 deformation discrepancy. Dividing
        # actual skin results by the weight sum would conceal it.
        self.assertGreater(max(probe["distanceM"] for probe in probes), 0.000005)
        self.assertLess(max(probe["restMatchDistanceM"] for probe in probes), 0.000001)

    def test_corrupted_delivered_weights_are_rejected(self):
        result, report = self.run_case("bad-delivered-weights", fixture="weighted", clip="ReviewBlend",
                                       asset_name="wrong-weights.glb", vertex_tolerance=5e-5)
        self.assertNotEqual(result.returncode, 0)
        failures = [c for c in report["checks"] if not c["ok"] and c["name"].startswith("nativeSkinVertex:")]
        self.assertTrue(failures)
        self.assertTrue(all(c["details"] > 5e-5 for c in failures))
        self.assertEqual(report["tolerances"]["skinVertexM"], 5e-5)

    def test_stationary_named_clip_is_not_useful_motion(self):
        result, report = self.run_case("bad-static", fixture="stationary")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(not c["ok"] and c["name"] == "actualMovement" for c in report["checks"]))

    def test_missing_clip_is_rejected(self):
        result, report = self.run_case("bad-clip", clip="NotTheDeliveredAction")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(not c["ok"] and c["name"] == "namedAnimation" for c in report["checks"]))


if __name__ == "__main__":
    unittest.main()

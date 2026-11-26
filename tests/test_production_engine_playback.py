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
from fixtures.production_bound_points import write_fixture

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples/engine-playback"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")
GODOT = os.environ.get("GODOT_EXE") or shutil.which("godot")


class ProductionEnginePlaybackArgumentTests(unittest.TestCase):
    def test_limits_reject_nonfinite_and_nonpositive_values_before_writing(self):
        with tempfile.TemporaryDirectory(prefix="refas-godot-arguments-") as directory:
            output = Path(directory) / "unexpected-output"
            for flag in ("--tolerance", "--vertex-tolerance", "--timeout"):
                for value in ("nan", "inf", "-inf", "0", "-0.00001"):
                    with self.subTest(flag=flag, value=value):
                        result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"),
                            "--asset", "absent.glb", "--inspection", "absent.json", "--clip", "Unused",
                            "--out", str(output), flag + "=" + value],
                            capture_output=True, text=True, timeout=15)
                        self.assertEqual(result.returncode, 2, result.stderr)
                        self.assertIn("must be a finite positive number", result.stderr)
                        self.assertFalse(output.exists())

    def test_timeout_preserves_partial_output_and_records_deadline(self):
        with tempfile.TemporaryDirectory(prefix="refas-godot-timeout-") as directory:
            root = Path(directory)
            inspection = root / "inspection.json"
            inspection.write_text(json.dumps({"consumer_samples": {"fps": 30,
                "matrix_order": "row-major, Blender Z-up world space", "samples": []}}))
            consumer = root / "slow-consumer"
            consumer.write_text("#!" + sys.executable + "\nimport sys, time\n"
                "print('partial stdout', flush=True)\n"
                "print('partial stderr', file=sys.stderr, flush=True)\ntime.sleep(5)\n")
            consumer.chmod(0o755)
            output = root / "result"
            result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"),
                "--asset", "unused.glb", "--inspection", str(inspection), "--clip", "Unused",
                "--out", str(output), "--godot", str(consumer), "--timeout", "0.25"],
                capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 124, result.stderr)
            self.assertIn("partial stdout", (output / "stdout.txt").read_text())
            self.assertIn("partial stderr", (output / "stderr.txt").read_text())
            command = json.loads((output / "command.json").read_text())
            self.assertEqual(command["timeoutSeconds"], .25)
            self.assertTrue(command["timedOut"])
            self.assertEqual(command["returncode"], 124)
            self.assertGreaterEqual(command["elapsedSeconds"], .25)
            self.assertGreater(command["deadlineUtc"], command["startedUtc"])
            self.assertLessEqual(command["deadlineUtc"], command["endedUtc"])


@unittest.skipUnless(os.environ.get("REFAS_GODOT_TESTS") == "1" and GODOT,
                     "Set REFAS_GODOT_TESTS=1 with Godot for static-point regressions")
class ProductionEngineStaticPointTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="refas-godot-points-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        write_fixture(self.root / "fixture")

    def run_case(self, label, *, fixture="fixture", inspection=None):
        output = self.root / label
        result = subprocess.run([sys.executable, "-B", str(EXAMPLE / "run.py"),
            "--asset", str(self.root / fixture / "asset.glb"),
            "--inspection", str(inspection or self.root / fixture / "inspection.json"),
            "--clip", "BoneAttachedPoint", "--out", str(output), "--godot", str(GODOT),
            "--expected-triangles", "4", "--required-skinned-meshes", "1"],
            capture_output=True, text=True, timeout=30)
        path = output / "result.json"
        self.assertTrue(path.exists(), result.stdout + result.stderr)
        return result, json.loads(path.read_text())

    def test_attached_static_and_skinned_points_survive_import_name_collisions(self):
        result, report = self.run_case("positive")
        self.assertEqual(result.returncode, 0, report)
        self.assertTrue(report["ok"])
        self.assertEqual(report["geometry"]["meshes"], 4)  # Includes an unrequested unnamed node.
        self.assertEqual(report["geometry"]["skinnedMeshes"], 1)
        resolved = {row["originalName"]: row for row in report["sourceNodeResolution"]}
        punctuated = resolved["Static.Probe:Sample"]
        collision = resolved["Static_Probe_Sample"]
        self.assertNotEqual(punctuated["originalName"], punctuated["importerAssignedName"])
        self.assertEqual(punctuated["importerAssignedName"], collision["originalName"])
        self.assertNotEqual(punctuated["importerAssignedName"], collision["importerAssignedName"])
        self.assertNotEqual(punctuated["actualPath"], collision["actualPath"])
        self.assertEqual(report["tolerances"], {"matrix": 2e-5, "skinVertexM": 2e-5,
                                               "restVertexMatchM": 1e-5})
        self.assertEqual([len(row["vertexProbes"]) for row in report["samples"]], [9, 9, 9])
        for sample, x in zip(report["samples"], (.25, .27, .25)):
            corner = next(p for p in sample["vertexProbes"] if p["name"] == "Static.Probe:Sample:0")
            self.assertAlmostEqual(corner["actual"][0], x, delta=2e-5)
        command = json.loads((self.root / "positive/command.json").read_text())
        self.assertEqual(command["timeoutSeconds"], 120)
        self.assertFalse(command["timedOut"])

    def test_wrong_static_point_is_rejected_after_attachment_moves(self):
        source = json.loads((self.root / "fixture/inspection.json").read_text())
        source["consumer_samples"]["samples"][1]["skin_vertices"][0]["world"][0] += .001
        inspection = self.root / "wrong-static.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("negative", inspection=inspection)
        self.assertNotEqual(result.returncode, 0)
        failures = [c for c in report["checks"] if not c["ok"]]
        self.assertEqual([c["name"] for c in failures], ["nativeSkinVertex:Static.Probe:Sample:0"])
        self.assertAlmostEqual(failures[0]["details"], .001, delta=2e-5)

    def test_duplicate_source_names_require_an_explicit_live_path(self):
        write_fixture(self.root / "duplicates", duplicate_names=True)
        result, report = self.run_case("ambiguous", fixture="duplicates")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sum(not c["ok"] and c["name"] == "probeNode:Static.Probe:Sample"
                             for c in report["checks"]), 3)
        self.assertTrue(all(not row["probes"] for row in report["samples"]))
        matches = [row for row in report["sourceNodeResolution"] if row["originalName"] == "Static.Probe:Sample"]
        self.assertEqual(len(matches), 2)
        path = "./" + next(row["actualPath"] for row in matches if row["gltfNodeIndex"] == 2)
        source = json.loads((self.root / "duplicates/inspection.json").read_text())
        for sample in source["consumer_samples"]["samples"]:
            sample["nodes"][path] = sample["nodes"].pop("Static.Probe:Sample")
            for probe in sample["skin_vertices"]:
                if probe["node"] == "Static.Probe:Sample":
                    probe["node"] = path
        inspection = self.root / "qualified.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("qualified", fixture="duplicates", inspection=inspection)
        self.assertEqual(result.returncode, 0, report)


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
        result = subprocess.run([BLENDER, "-b", "--factory-startup", "--threads", "2",
                "--python-exit-code", "1", "--python", str(ROOT / "tests/fixtures/production_two_skeletons.py"),
                "--", str(ROOT / "skills/refas/scripts/production"), str(cls.root / "two-rigs")],
                capture_output=True, text=True, timeout=90)
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
                 vertex_tolerance=None, expected_triangles=12, required_skinned_meshes=1):
        command = [sys.executable, "-B", str(EXAMPLE / "run.py"), "--asset",
                str(self.root / fixture / asset_name), "--inspection",
                str(inspection or self.root / fixture / "inspection.json"), "--clip", clip or self.clip,
                "--out", str(self.root / label), "--godot", str(GODOT),
                "--required-skinned-meshes", str(required_skinned_meshes),
                "--expected-triangles", str(expected_triangles)]
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

    def test_two_skeletons_require_explicit_paths_and_verify_both_rigs(self):
        ambiguous, report = self.run_case("two-rigs-ambiguous", fixture="two-rigs", clip="DualRigMotion",
                                           expected_triangles=24, required_skinned_meshes=2)
        self.assertNotEqual(ambiguous.returncode, 0)
        skeletons = report["geometry"]["skeletons"]
        self.assertEqual([s["name"] for s in skeletons], ["Skeleton3D", "Skeleton3D"])
        self.assertEqual(len({s["path"] for s in skeletons}), 2)
        self.assertTrue(all(not row["probes"] for row in report["samples"]))
        self.assertEqual(sum(not c["ok"] and c["name"].startswith("probeNode:")
                             for c in report["checks"]), 10)
        paths = {root: next(s["path"] for s in skeletons if s["path"].startswith("./" + root + "/"))
                 for root in ("CharacterRoot", "HardwareRoot")}
        source = json.loads((self.root / "two-rigs/inspection.json").read_text())
        for sample in source["consumer_samples"]["samples"]:
            for bone in sample["bones"]:
                bone["node"] = paths[bone["fixture_root"]]
        inspection = self.root / "two-rigs-qualified.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("two-rigs-qualified", fixture="two-rigs", clip="DualRigMotion",
            inspection=inspection, expected_triangles=24, required_skinned_meshes=2)
        self.assertEqual(result.returncode, 0, report)
        self.assertEqual(sum(len(row["probes"]) for row in report["samples"]), 10)
        self.assertEqual(sum(len(row["vertexProbes"]) for row in report["samples"]), 20)
        self.assertTrue(all(row["maxMatrixError"] <= 2e-5 for row in report["samples"]))

    def test_association_cache_uses_current_sample_for_a_new_label(self):
        source = json.loads((self.root / "moving/inspection.json").read_text())
        samples = source["consumer_samples"]["samples"]
        late_rest = samples[1]["skin_vertices"][0]["world"]
        for sample in samples[1:]:
            sample["skin_vertices"].append({**sample["skin_vertices"][0],
                "label": "introduced-during-motion", "rest_world": late_rest})
        inspection = self.root / "later-association.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("later-association", inspection=inspection)
        self.assertEqual(result.returncode, 0, report)
        self.assertEqual([len(row["vertexProbes"]) for row in report["samples"]], [1, 2, 2, 2])

    def test_cached_association_does_not_hide_or_retry_a_failed_rest_match(self):
        source = json.loads((self.root / "moving/inspection.json").read_text())
        samples = source["consumer_samples"]["samples"]
        for index, sample in enumerate(samples):
            probe = {**sample["skin_vertices"][0], "label": "missing-rest"}
            # Subsequent samples provide a real current point, but an invalid
            # initial association must not be silently retried after motion.
            probe["rest_world"] = [10, 10, 10] if index == 0 else probe["world"]
            sample["skin_vertices"].append(probe)
        inspection = self.root / "missing-rest.json"
        inspection.write_text(json.dumps(source))
        result, report = self.run_case("missing-rest", inspection=inspection)
        self.assertNotEqual(result.returncode, 0)
        failures = [c for c in report["checks"] if c["name"].endswith(":missing-rest")]
        self.assertEqual(len(failures), len(samples))
        self.assertTrue(all(c["name"].startswith("restVertexMatch:") and not c["ok"] for c in failures))
        self.assertEqual(sum(len(row["vertexProbes"]) for row in report["samples"]), len(samples))

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

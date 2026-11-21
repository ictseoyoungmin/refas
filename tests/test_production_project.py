"""Production storage/transaction tests; fake worker output is not visual proof."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).resolve().parents[1] / "skills" / "refas" / "scripts"
sys.path.insert(0, str(SCRIPTS))
from production import project


def fake_worker(command, cwd, log_file, timeout):
    job = project.read_json(command[-1])
    out = Path(job["outputDir"])
    script = Path(job["script"]).read_bytes()
    (out / "scene.blend").write_bytes(b"BLENDER-v300" + script)
    payload = json.dumps({"asset": {"version": "2.0"}, "extras": {"testScript": script.hex()}}).encode()
    payload += b" " * (-len(payload) % 4)
    glb = b"glTF" + (2).to_bytes(4, "little") + (20 + len(payload)).to_bytes(4, "little")
    glb += len(payload).to_bytes(4, "little") + b"JSON" + payload
    (out / "asset.glb").write_bytes(glb)
    project.atomic_json(out / "scene.json", {"fixture": True})
    observations = []
    for view in job["views"]:
        (out / (view + ".png")).write_bytes(b"\x89PNG\r\n\x1a\n" + view.encode())
        observations.append({"view": view, "path": view + ".png", "registration": "unregistered"})
    project.atomic_json(out / "result.json", {
        "schema": "refas.production.result/v2", "ok": True, "blenderVersion": "test-double",
        "outputs": {"blend": "scene.blend", "glb": "asset.glb", "scene": "scene.json"},
        "observations": observations, "verification": {"fixture": True}, "warnings": []})
    Path(log_file).write_text("test worker completed", encoding="utf-8")
    return 0.001


class ProductionProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.root = self.folder / "asset"
        self.script = self.folder / "model.py"
        self.script.write_text("# create a native model\n", encoding="utf-8")
        self.reference = self.folder / "reference.png"
        self.reference.write_bytes(b"test-reference-file")
        project.initialize(self.root, "headset", [self.reference])

    def run_edit(self, **kwargs):
        return project.run_edit(self.root, self.script, "create shape", executor=fake_worker, **kwargs)

    def test_reference_capture_is_independent_and_tamper_is_detected(self):
        self.reference.write_bytes(b"changed outside source")
        self.assertTrue(project.verify_project(self.root)["ok"])
        state = project.load_project(self.root)
        captured = self.root / project.STATE_DIR / state["sources"][0]["path"]
        captured.write_bytes(b"corrupted captured source")
        with self.assertRaisesRegex(project.ProductionError, "artifact changed"):
            project.verify_project(self.root)

    def test_existing_project_is_not_overwritten(self):
        state = project.load_project(self.root)
        with self.assertRaisesRegex(project.ProductionError, "already exists"):
            project.initialize(self.root, "replacement")
        self.assertEqual(project.load_project(self.root), state)

    def test_edit_and_restore_keep_exact_native_and_render_bytes(self):
        first = self.run_edit()
        self.assertTrue(Path(first["observations"][0]["path"]).is_file())
        self.assertTrue(Path(first["inputs"]["edit.py"]).is_file())
        first_bytes = Path(first["outputs"]["blend"]).read_bytes()
        self.script.write_text("# revise earcup only\n", encoding="utf-8")
        second = self.run_edit(expected_revision=first["head"])
        self.assertNotEqual(Path(second["outputs"]["blend"]).read_bytes(), first_bytes)
        restored = project.restore(self.root, first["head"], expected_revision=second["head"])
        self.assertEqual(Path(restored["outputs"]["blend"]).read_bytes(), first_bytes)
        self.assertEqual(project.load_revision(self.root)["restoredFrom"], first["head"])
        self.assertEqual(restored["sequence"], 3)
        self.assertEqual(len(restored["revisions"]), 3)
        self.assertEqual(project.verify_project(self.root)["referenceResemblance"], "not-evaluated")

    def test_failure_retains_current_asset_and_failure_record(self):
        first = self.run_edit()
        def fail(*args):
            raise project.ProductionError("intentional DCC failure")
        with self.assertRaisesRegex(project.ProductionError, "DCC failure"):
            project.run_edit(self.root, self.script, "failed edit", executor=fail)
        latest = project.status(self.root)
        self.assertEqual(latest["head"], first["head"])
        self.assertEqual(latest["incompleteRuns"][0]["status"], "failed")

    def test_concurrent_edit_does_not_overwrite_newer_revision(self):
        first = self.run_edit()
        newer = {}
        def overlap(*args):
            newer.update(self.run_edit())
            return fake_worker(*args)
        with self.assertRaisesRegex(project.ProductionError, "project changed"):
            project.run_edit(self.root, self.script, "stale candidate", executor=overlap)
        self.assertNotEqual(newer["head"], first["head"])
        self.assertEqual(project.load_project(self.root)["head"], newer["head"])

    def test_stale_explicit_base_is_rejected_before_execution(self):
        self.run_edit()
        with self.assertRaisesRegex(project.ProductionError, "expected revision"):
            self.run_edit(expected_revision="none")

    def test_worker_cannot_modify_captured_input_silently(self):
        def mutate(command, cwd, log_file, timeout):
            elapsed = fake_worker(command, cwd, log_file, timeout)
            Path(project.read_json(command[-1])["script"]).write_text("changed")
            return elapsed
        with self.assertRaisesRegex(project.ProductionError, "artifact changed"):
            project.run_edit(self.root, self.script, "bad worker", executor=mutate)
        self.assertIsNone(project.load_project(self.root)["head"])

    def test_wrong_output_type_is_rejected_at_submission(self):
        def wrong(command, cwd, log_file, timeout):
            elapsed = fake_worker(command, cwd, log_file, timeout)
            out = Path(project.read_json(command[-1])["outputDir"])
            (out / "scene.blend").write_text("not a Blender file")
            return elapsed
        with self.assertRaisesRegex(project.ProductionError, "Blender project"):
            project.run_edit(self.root, self.script, "bad output", executor=wrong)
        self.assertIsNone(project.load_project(self.root)["head"])

    def test_missing_requested_view_does_not_publish(self):
        def missing(command, cwd, log_file, timeout):
            elapsed = fake_worker(command, cwd, log_file, timeout)
            out = Path(project.read_json(command[-1])["outputDir"])
            result = project.read_json(out / "result.json")
            result["observations"].pop()
            project.atomic_json(out / "result.json", result)
            return elapsed
        with self.assertRaisesRegex(project.ProductionError, "requested views"):
            project.run_edit(self.root, self.script, "missing observation", executor=missing)
        self.assertIsNone(project.load_project(self.root)["head"])

    def test_manifest_paths_and_symlinks_cannot_escape(self):
        for invalid in ("../external", "/external", "nested/../../outside", "nested\\outside"):
            with self.subTest(path=invalid), self.assertRaises(project.ProductionError):
                project.relative_file(self.folder, invalid)
        (self.folder / "link").symlink_to(self.folder, target_is_directory=True)
        with self.assertRaisesRegex(project.ProductionError, "symlink"):
            project.relative_file(self.folder, "link/model.py")

    def test_historic_revision_manifest_tamper_cannot_be_restored(self):
        first = self.run_edit()
        self.run_edit()
        manifest = self.root / project.STATE_DIR / "revisions" / first["head"] / "revision.json"
        value = project.read_json(manifest)
        value["intent"] = "tampered"
        project.atomic_json(manifest, value)
        with self.assertRaisesRegex(project.ProductionError, "manifest changed"):
            project.restore(self.root, first["head"])

    def test_uncommitted_revision_is_not_a_restore_target(self):
        with self.assertRaisesRegex(project.ProductionError, "committed project history"):
            project.restore(self.root, "f" * 32)

    def test_failed_pointer_publish_preserves_old_head(self):
        first = self.run_edit()
        real_atomic = project.atomic_json
        pointer = self.root / project.STATE_DIR / "project.json"
        def broken(path, value):
            if Path(path) == pointer:
                raise OSError("simulated publication failure")
            return real_atomic(path, value)
        with mock.patch.object(project, "atomic_json", side_effect=broken):
            with self.assertRaisesRegex(OSError, "publication failure"):
                self.run_edit()
        self.assertEqual(project.status(self.root)["head"], first["head"])
        self.assertEqual(len(project.status(self.root)["revisions"]), 1)

    def test_intact_history_can_recover_a_corrupted_current_payload(self):
        first = self.run_edit()
        expected = Path(first["outputs"]["blend"]).read_bytes()
        second = self.run_edit()
        Path(second["outputs"]["blend"]).write_bytes(b"damaged current scene")
        with self.assertRaisesRegex(project.ProductionError, "artifact changed"):
            project.verify_project(self.root)
        recovered = project.restore(self.root, first["head"], expected_revision=second["head"])
        self.assertEqual(Path(recovered["outputs"]["blend"]).read_bytes(), expected)
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_run_directory_symlink_is_rejected_before_external_writes(self):
        runs = self.root / project.STATE_DIR / "runs"
        runs.rmdir()
        external = self.folder / "external"
        external.mkdir()
        runs.symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(project.ProductionError, "symlink"):
            self.run_edit()
        self.assertEqual(list(external.iterdir()), [])
        with self.assertRaisesRegex(project.ProductionError, "symlink"):
            project.status(self.root)

    def test_post_commit_log_failure_still_reports_published_revision(self):
        real_atomic = project.atomic_json
        def broken(path, value):
            if Path(path).name == "run.json" and value.get("status") == "committed":
                raise OSError("persistent run log write failure")
            return real_atomic(path, value)
        with mock.patch.object(project, "atomic_json", side_effect=broken):
            result = self.run_edit()
        self.assertTrue(result["ok"])
        self.assertEqual(result["publishedRevision"], project.load_project(self.root)["head"])
        self.assertIn("revision published", result["warning"])
        self.assertEqual(project.status(self.root)["incompleteRuns"], [])

    def test_explicit_manual_blend_input_is_captured(self):
        first = self.run_edit()
        manual = self.folder / "manual.blend"
        manual.write_bytes(b"BLENDER-manually-edited")
        current = self.run_edit(input_blend=manual)
        revision = project.load_revision(self.root)
        self.assertEqual(revision["parent"], first["head"])
        captured = next(x for x in revision["inputs"] if x["path"] == "base.blend")
        self.assertEqual(captured["sha256"], project.digest(manual))
        self.assertEqual(current["sequence"], 2)

    def test_copied_skill_cli_works_without_repository(self):
        copied = self.folder / "copied-skill" / "scripts"
        copied.mkdir(parents=True)
        shutil.copy2(SCRIPTS / "produce.py", copied / "produce.py")
        shutil.copytree(SCRIPTS / "production", copied / "production", ignore=shutil.ignore_patterns("__pycache__"))
        other = self.folder / "new-project"
        result = subprocess.run([sys.executable, "-B", str(copied / "produce.py"), "init", "--root", str(other),
                                 "--name", "isolated"], cwd=self.folder, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["name"], "isolated")


if __name__ == "__main__":
    unittest.main()

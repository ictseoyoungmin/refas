"""Production storage/transaction tests; fake worker output is not visual proof."""
import json
import os
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
from production.review import validate_review


def fake_worker(command, cwd, log_file, timeout):
    job = project.read_json(command[-1])
    out = Path(job["outputDir"])
    profile = job.get("outputProfile", "delivery")
    script = Path(job["script"]).read_bytes()
    (out / "scene.blend").write_bytes(b"BLENDER-v300" + script)
    outputs = {"blend": "scene.blend", "scene": "scene.json"}
    if profile == "delivery":
        payload = json.dumps({"asset": {"version": "2.0"}, "extras": {"testScript": script.hex()}}).encode()
        payload += b" " * (-len(payload) % 4)
        glb = b"glTF" + (2).to_bytes(4, "little") + (20 + len(payload)).to_bytes(4, "little")
        glb += len(payload).to_bytes(4, "little") + b"JSON" + payload
        (out / "asset.glb").write_bytes(glb)
        outputs["glb"] = "asset.glb"
    project.atomic_json(out / "scene.json", {"fixture": True})
    observations = []
    for view in job["views"]:
        (out / (view + ".png")).write_bytes(b"\x89PNG\r\n\x1a\n" + view.encode())
        observations.append({"view": view, "path": view + ".png", "registration": "unregistered"})
    project.atomic_json(out / "result.json", {
        "schema": "refas.production.result/v2", "ok": True, "blenderVersion": "test-double",
        "outputProfile": profile, "outputs": outputs,
        "observations": observations, "verification": {"fixture": True,
            "native": {"status": "passed", "fingerprintMatches": True},
            "glb": {"status": "passed" if profile == "delivery" else "not-requested"},
            "protectedObjects": {"status": "passed" if job.get("protectedObjects") else "not-requested",
                                 "objects": sorted(job.get("protectedObjects", [])),
                                 "scope": "recorded-object-state-and-materials"}}, "warnings": []})
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

    def review_file(self):
        spec = {"schema": "refas.production.review/v2",
                "lighting": {"center": [0, 0, 0], "radius": 1},
                "views": [{"name": "front-detail", "position": [0, -3, 0], "target": [0, 0, 0],
                           "orthoScale": 2, "reference": {"sourceSha256": project.digest(self.reference),
                                                         "regionPixels": [0, 0, 100, 100]}}]}
        path = self.folder / "review.json"
        project.atomic_json(path, spec)
        return path, spec

    def replace_references(self, references=None, **kwargs):
        kwargs.setdefault("expected_sequence", project.load_project(self.root)["sequence"])
        return project.replace_references(self.root, references, **kwargs)

    def second_reference(self):
        path = self.folder / "reference-b.png"
        path.write_bytes(b"different-reference-content")
        return path

    def test_legacy_project_freshness_is_derived_without_rewriting_history(self):
        # The existing v2 layout has sources/001-name and no freshness fields.
        first = self.run_edit()
        meta = self.root / project.STATE_DIR
        recorded = {path: path.read_bytes() for path in [meta / "project.json",
                    meta / "revisions" / first["head"] / "revision.json"]}
        self.assertNotIn("evidenceFreshness", project.load_project(self.root))
        self.assertEqual(project.load_revision(self.root)["sources"][0]["path"], "sources/001-reference.png")
        for result in (project.status(self.root), project.verify_project(self.root)):
            self.assertTrue(result["ok"])
            self.assertEqual(result["evidenceFreshness"]["status"], "current")
            self.assertEqual(result["evidenceFreshness"]["scope"], "active-reference-content-set")
            self.assertEqual(result["evidenceFreshness"]["visualAcceptance"], "not-evaluated")
        for path, original in recorded.items():
            self.assertEqual(path.read_bytes(), original)

    def test_reference_replacement_marks_intact_evidence_stale_and_clear_is_explicit(self):
        first = self.run_edit()
        old = project.load_project(self.root)
        old_bundle = project.inventory(self.root / project.STATE_DIR / "revisions" / first["head"])
        replacement = self.second_reference()
        changed = self.replace_references([replacement], expected_revision=first["head"])
        self.assertTrue(changed["referencesChanged"])
        self.assertEqual(changed["head"], first["head"])
        self.assertEqual(changed["sequence"], first["sequence"] + 1)
        self.assertEqual(project.inventory(self.root / project.STATE_DIR / "revisions" / first["head"]), old_bundle)
        copied = self.root / project.STATE_DIR / changed["sources"][0]["path"]
        self.assertEqual(copied.read_bytes(), replacement.read_bytes())
        replacement.unlink()
        self.assertEqual(changed["evidenceFreshness"]["status"], "stale")
        verified = project.verify_project(self.root)
        self.assertTrue(verified["ok"])
        self.assertEqual(verified["scope"], "recorded-file-integrity")
        self.assertEqual(verified["evidenceFreshness"]["status"], "stale")
        self.assertEqual(verified["referenceResemblance"], "not-evaluated")
        for source in old["sources"]:
            project.check_inventory(self.root / project.STATE_DIR, [source], exact=False)
        before = (self.root / project.STATE_DIR / "project.json").read_bytes()
        for references in (None, []):
            with self.subTest(references=references), self.assertRaisesRegex(project.ProductionError, "reference|clear"):
                self.replace_references(references)
        self.assertEqual((self.root / project.STATE_DIR / "project.json").read_bytes(), before)
        cleared = self.replace_references(clear=True)
        self.assertEqual(cleared["sources"], [])
        self.assertEqual(cleared["evidenceFreshness"]["status"], "stale")
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_reference_content_set_ignores_duplicate_paths_names_and_order(self):
        second = self.second_reference()
        self.replace_references([self.reference, second])
        first = self.run_edit()
        alias = self.folder / "same-content-other-name.png"
        shutil.copy2(self.reference, alias)
        meta = self.root / project.STATE_DIR
        before = (meta / "project.json").read_bytes()
        original_sources = project.inventory(meta / "sources")
        for references in ([second, alias, alias], [self.reference, second], [alias, second, self.reference]):
            result = self.replace_references(references)
            self.assertFalse(result["referencesChanged"])
            self.assertEqual(result["sequence"], first["sequence"])
            self.assertEqual(result["evidenceFreshness"]["status"], "current")
            self.assertEqual((meta / "project.json").read_bytes(), before)
            self.assertEqual(project.inventory(meta / "sources"), original_sources)

    def test_restore_preserves_active_references_and_exact_historical_inputs_and_artifacts(self):
        review, _ = self.review_file()
        first = self.run_edit(review_spec=review)
        meta = self.root / project.STATE_DIR
        original = project.load_revision(self.root)
        changed = self.replace_references([self.second_reference()])
        second = self.run_edit(views=["top"])
        restored = project.restore(self.root, first["head"], second["head"], second["sequence"])
        restored_revision = project.load_revision(self.root)
        self.assertEqual(restored["sources"], changed["sources"])
        self.assertEqual(restored_revision["sources"], original["sources"])
        self.assertEqual(restored["evidenceFreshness"]["status"], "stale")
        for folder in ("inputs", "artifacts"):
            self.assertEqual(project.inventory(meta / "revisions" / restored["head"] / folder),
                             project.inventory(meta / "revisions" / first["head"] / folder))
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_historical_reference_tamper_is_rejected_before_restore_publication(self):
        first = self.run_edit()
        historical_source = first["sources"][0]
        self.replace_references([self.second_reference()])
        self.run_edit()
        meta = self.root / project.STATE_DIR
        (meta / historical_source["path"]).write_bytes(b"tampered historical source")
        self.assertTrue(project.verify_project(self.root)["ok"])
        before = (meta / "project.json").read_bytes()
        with self.assertRaisesRegex(project.ProductionError, "artifact changed"):
            project.restore(self.root, first["head"])
        self.assertEqual((meta / "project.json").read_bytes(), before)

    def test_reference_copy_and_publication_failure_roll_back_state_and_copies(self):
        first = self.run_edit()
        meta = self.root / project.STATE_DIR
        before = (meta / "project.json").read_bytes()
        original_sources = project.inventory(meta / "sources")
        replacement = self.second_reference()
        real_atomic = project.atomic_json
        def broken_pointer(path, value):
            if Path(path) == meta / "project.json":
                raise OSError("reference publication failure")
            return real_atomic(path, value)
        def broken_copy(source, target, *args, **kwargs):
            Path(target).write_bytes(b"partial copy")
            raise OSError("reference copy failure")
        for operation, failure in (("copy2", broken_copy), ("atomic_json", broken_pointer)):
            target = project.shutil if operation == "copy2" else project
            with self.subTest(operation=operation), mock.patch.object(target, operation, side_effect=failure):
                with self.assertRaisesRegex(OSError, "reference .* failure"):
                    self.replace_references([replacement])
            self.assertEqual((meta / "project.json").read_bytes(), before)
            self.assertEqual(project.inventory(meta / "sources"), original_sources)
            self.assertEqual(project.status(self.root)["head"], first["head"])

    def test_reference_response_validation_failure_precedes_publication(self):
        first = self.run_edit()
        self.run_edit()
        meta = self.root / project.STATE_DIR
        before = (meta / "project.json").read_bytes()
        original_sources = project.inventory(meta / "sources")
        historic = meta / "revisions" / first["head"] / "revision.json"
        historic.write_text("damaged historical manifest", encoding="utf-8")
        # The current bundle remains intact, but status also needs history metadata.
        self.assertTrue(project.verify_project(self.root)["ok"])
        with self.assertRaisesRegex(project.ProductionError, "manifest changed"):
            self.replace_references([self.second_reference()])
        self.assertEqual((meta / "project.json").read_bytes(), before)
        self.assertEqual(project.inventory(meta / "sources"), original_sources)

    def test_expected_sequence_is_validated_before_work(self):
        first = self.run_edit()
        replacement = self.second_reference()
        self.replace_references([replacement])
        before = (self.root / project.STATE_DIR / "project.json").read_bytes()
        # HEAD is unchanged, so the sequence lease catches a newer reference intent.
        with mock.patch.object(project.shutil, "copy2") as copy, mock.patch.object(project, "_execute") as worker:
            for sequence in (None, True, -1, "2", first["sequence"]):
                with self.subTest(sequence=sequence), self.assertRaisesRegex(project.ProductionError, "expected sequence"):
                    project.replace_references(self.root, [self.reference], expected_sequence=sequence)
            with self.assertRaisesRegex(project.ProductionError, "expected sequence"):
                self.run_edit(expected_revision=first["head"], expected_sequence=first["sequence"])
            with self.assertRaisesRegex(project.ProductionError, "expected sequence"):
                project.restore(self.root, first["head"], first["head"], first["sequence"])
            copy.assert_not_called()
            worker.assert_not_called()
        self.assertEqual((self.root / project.STATE_DIR / "project.json").read_bytes(), before)

    def test_reference_update_during_run_invalidates_lease_even_when_content_returns(self):
        first = self.run_edit()
        replacement = self.second_reference()
        for back_to_original in (False, True):
            with self.subTest(back_to_original=back_to_original):
                self.replace_references([self.reference])
                base = project.load_project(self.root)
                def update_during_work(*args):
                    elapsed = fake_worker(*args)
                    self.replace_references([replacement])
                    if back_to_original:
                        self.replace_references([self.reference])
                    return elapsed
                with self.assertRaisesRegex(project.ProductionError, "project changed"):
                    project.run_edit(self.root, self.script, "candidate with old references",
                                     executor=update_during_work, expected_sequence=base["sequence"])
                latest = project.status(self.root)
                self.assertEqual(latest["head"], first["head"])
                self.assertGreater(latest["sequence"], base["sequence"])
                self.assertEqual(len(latest["revisions"]), 1)
                self.assertEqual(latest["evidenceFreshness"]["status"], "current" if back_to_original else "stale")
                for run in latest["incompleteRuns"]:
                    self.assertEqual(run["status"], "failed")
                    self.assertTrue((self.root / project.STATE_DIR / "runs" / run["id"] / "artifacts" / "scene.blend").is_file())

    def test_status_and_verify_pin_revision_and_freshness_to_one_state_snapshot(self):
        second = self.second_reference()
        for reader_name in ("status", "verify_project"):
            for existing_head in (False, True):
                with self.subTest(reader=reader_name, existing_head=existing_head):
                    root = self.folder / (reader_name + str(existing_head))
                    project.initialize(root, "snapshot", [self.reference])
                    if existing_head:
                        project.run_edit(root, self.script, "first", executor=fake_worker)
                    before = project.status(root)
                    real_load = project.load_project
                    advanced = {}
                    once = False
                    def publish_after_read(candidate_root):
                        nonlocal once
                        captured = real_load(candidate_root)
                        if not once:
                            once = True
                            project.replace_references(root, [second], expected_sequence=captured["sequence"])
                            advanced.update(project.run_edit(root, self.script, "new source and view",
                                                             views=["top"], executor=fake_worker))
                        return captured
                    with mock.patch.object(project, "load_project", side_effect=publish_after_read):
                        observed = getattr(project, reader_name)(root)
                    self.assertEqual(observed["head"], before["head"])
                    self.assertEqual(observed["evidenceFreshness"], before["evidenceFreshness"])
                    if reader_name == "status":
                        for key in ("outputs", "observations", "inputs", "revisions", "sources", "sequence"):
                            self.assertEqual(observed[key], before[key])
                        for item in observed["observations"]:
                            self.assertTrue(Path(item["path"]).is_file())
                    else:
                        self.assertEqual(observed["artifactCount"], 6 if existing_head else 0)
                    self.assertEqual(project.status(root)["head"], advanced["head"])

    def test_edit_uses_native_input_from_its_declared_snapshot(self):
        first = self.run_edit()
        real_load = project.load_project
        once = False
        advanced = {}
        captured_base = []
        def renamed_output(*args):
            elapsed = fake_worker(*args)
            out = Path(project.read_json(args[0][-1])["outputDir"])
            (out / "scene.blend").rename(out / "newer.blend")
            result = project.read_json(out / "result.json")
            result["outputs"]["blend"] = "newer.blend"
            project.atomic_json(out / "result.json", result)
            return elapsed
        def publish_after_read(candidate_root):
            nonlocal once
            captured = real_load(candidate_root)
            if not once:
                once = True
                self.script.write_text("# new native content\n", encoding="utf-8")
                advanced.update(project.run_edit(self.root, self.script, "new native file",
                                                  views=["top"], executor=renamed_output))
            return captured
        def record_base(command, cwd, log_file, timeout):
            captured_base.append(Path(project.read_json(command[-1])["baseBlend"]).read_bytes())
            return fake_worker(command, cwd, log_file, timeout)
        with mock.patch.object(project, "load_project", side_effect=publish_after_read):
            with self.assertRaisesRegex(project.ProductionError, "project changed"):
                project.run_edit(self.root, self.script, "stale declared base", executor=record_base)
        self.assertEqual(captured_base, [Path(first["outputs"]["blend"]).read_bytes()])
        self.assertEqual(project.status(self.root)["head"], advanced["head"])

    def test_review_spec_is_captured_and_restored_with_revision(self):
        path, spec = self.review_file()
        first = self.run_edit(review_spec=path)
        captured = Path(first["inputs"]["review.json"])
        self.assertEqual(project.read_json(captured), spec)
        self.assertEqual([x["view"] for x in first["observations"]], ["front-detail"])
        path.write_text("changed after successful capture")
        self.run_edit()
        restored = project.restore(self.root, first["head"])
        self.assertEqual(project.read_json(restored["inputs"]["review.json"]), spec)

    def test_review_cannot_claim_an_uncaptured_reference(self):
        path, spec = self.review_file()
        spec["views"][0]["reference"]["sourceSha256"] = "0" * 64
        project.atomic_json(path, spec)
        with self.assertRaisesRegex(project.ProductionError, "outside this project"):
            self.run_edit(review_spec=path)
        self.assertEqual(list((self.root / project.STATE_DIR / "runs").iterdir()), [])

    def test_worker_cannot_mutate_captured_review(self):
        path, spec = self.review_file()
        def mutate(command, cwd, log_file, timeout):
            elapsed = fake_worker(command, cwd, log_file, timeout)
            Path(project.read_json(command[-1])["reviewSpec"]).write_text("changed")
            return elapsed
        with self.assertRaisesRegex(project.ProductionError, "artifact changed"):
            project.run_edit(self.root, self.script, "edit", executor=mutate, review_spec=path)
        self.assertIsNone(project.load_project(self.root)["head"])

    def test_review_rejects_unsafe_names_and_invalid_camera(self):
        _, spec = self.review_file()
        for name in ("../external", "front/side", "front.png", ""):
            candidate = json.loads(json.dumps(spec))
            candidate["views"][0]["name"] = name
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_review(candidate)
        spec["views"][0]["position"] = spec["views"][0]["target"]
        with self.assertRaisesRegex(ValueError, "must differ"):
            validate_review(spec)

    def test_review_rejects_nonfinite_light_and_claim_fields(self):
        _, spec = self.review_file()
        spec["lighting"]["radius"] = float("nan")
        with self.assertRaisesRegex(ValueError, "finite"):
            validate_review(spec)
        spec["lighting"]["radius"] = 1
        spec["views"][0]["registration"] = "certified"
        with self.assertRaisesRegex(ValueError, "fields"):
            validate_review(spec)

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

    def test_failed_subprocess_runs_keep_distinct_crash_files_and_parent_environment(self):
        self.run_edit()
        before = project.load_project(self.root)
        meta = self.root / project.STATE_DIR
        revisions = project.inventory(meta / "revisions")
        program = """
import json, os, sys, tempfile
from pathlib import Path
temporary = Path(tempfile.gettempdir())
(temporary / 'scene.crash.txt').write_text(json.dumps({
    'run': Path.cwd().name,
    'temporary': {key: os.environ[key] for key in ('TMPDIR', 'TMP', 'TEMP')},
}))
sys.exit(23)
"""
        def crash(command, cwd, log_file, timeout):
            return project._execute([sys.executable, "-c", program], cwd, log_file, timeout)

        inherited = {}
        for key in ("TMPDIR", "TMP", "TEMP"):
            folder = self.folder / ("parent-" + key)
            folder.mkdir()
            (folder / "scene.crash.txt").write_text("parent evidence")
            inherited[key] = str(folder)
        captured = {}
        with mock.patch.dict(os.environ, inherited):
            environment = dict(os.environ)
            for _ in range(2):
                previous_runs = set((meta / "runs").iterdir())
                with self.assertRaisesRegex(project.ProductionError, "Blender failed with exit 23"):
                    project.run_edit(self.root, self.script, "preserve native crash evidence",
                                     executor=crash, output_profile="native", views=[])
                added = set((meta / "runs").iterdir()) - previous_runs
                self.assertEqual(len(added), 1)
                run = added.pop()
                files = list(run.rglob("scene.crash.txt"))
                self.assertEqual(len(files), 1)
                dump = files[0]
                self.assertFalse(dump.is_relative_to(run / "artifacts"))
                self.assertFalse(dump.is_relative_to(run / "inputs"))
                recorded = json.loads(dump.read_text())
                self.assertEqual(recorded["run"], run.name)
                self.assertEqual(set(recorded["temporary"].values()), {str(dump.parent)})
                self.assertEqual(project.read_json(run / "run.json")["status"], "failed")
                captured[dump] = dump.read_bytes()
                self.assertEqual(dict(os.environ), environment)
                self.assertEqual(project.load_project(self.root), before)
            for folder in inherited.values():
                self.assertEqual((Path(folder) / "scene.crash.txt").read_text(), "parent evidence")
        self.assertEqual(len(set(captured.values())), 2)
        for path, contents in captured.items():
            self.assertEqual(path.read_bytes(), contents)
        self.assertEqual(project.inventory(meta / "revisions"), revisions)

    def test_timed_out_subprocess_is_reaped_and_keeps_its_diagnostics(self):
        self.run_edit()
        before = project.load_project(self.root)
        meta = self.root / project.STATE_DIR
        previous_runs = set((meta / "runs").iterdir())
        program = """
import tempfile, time
from pathlib import Path
(Path(tempfile.gettempdir()) / 'scene.crash.txt').write_text('started before timeout')
print('worker reached native operation', flush=True)
time.sleep(20)
"""
        def timeout_worker(command, cwd, log_file, timeout):
            return project._execute([sys.executable, "-c", program], cwd, log_file, timeout)
        popen = subprocess.Popen
        launched = []
        def launch(*args, **kwargs):
            process = popen(*args, **kwargs)
            launched.append(process)
            return process
        with mock.patch.object(project.subprocess, "Popen", side_effect=launch):
            with self.assertRaisesRegex(project.ProductionError, "exceeded its timeout"):
                project.run_edit(self.root, self.script, "timeout evidence", executor=timeout_worker,
                                 output_profile="native", views=[], timeout=1)
        self.assertEqual(len(launched), 1)
        self.assertIsNotNone(launched[0].poll())
        self.assertNotEqual(launched[0].returncode, 0)
        added = set((meta / "runs").iterdir()) - previous_runs
        self.assertEqual(len(added), 1)
        run = added.pop()
        self.assertEqual(project.read_json(run / "run.json")["status"], "failed")
        self.assertEqual([p.read_text() for p in run.rglob("scene.crash.txt")], ["started before timeout"])
        self.assertIn("worker reached native operation", (run / "blender.log").read_text())
        self.assertEqual(project.load_project(self.root), before)

    def test_successful_temporary_files_follow_diagnostic_retention(self):
        def worker(command, cwd, log_file, timeout):
            temporary = Path(log_file).parent / "blender-tmp"
            temporary.mkdir()
            (temporary / "worker-cache").write_text("temporary data")
            return fake_worker(command, cwd, log_file, timeout)
        for keep in (False, True):
            result = project.run_edit(self.root, self.script, "temporary cleanup", executor=worker,
                                      output_profile="native", views=[], keep_diagnostics=keep)
            run = self.root / project.STATE_DIR / "runs" / result["runId"]
            self.assertEqual((run / "blender-tmp/worker-cache").exists(), keep)
            self.assertEqual((run / "blender.log").exists(), keep)
            revision = self.root / project.STATE_DIR / "revisions" / result["head"]
            self.assertFalse(any(revision.rglob("worker-cache")))

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
        cli = [sys.executable, "-B", str(copied / "produce.py")]
        def invoke(*arguments):
            return subprocess.run(cli + list(arguments), cwd=self.folder, capture_output=True, text=True)
        invalid = [[], ["--reference", str(self.reference)], ["--expected-sequence", "0"],
                   ["--expected-sequence", "0", "--reference", str(self.reference), "--clear"]]
        for flags in invalid:
            result = invoke("references", "--root", str(other), *flags)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertEqual(project.load_project(other)["sequence"], 0)
        result = invoke("references", "--root", str(other), "--reference", str(self.reference),
                        "--reference", str(self.reference), "--expected-sequence", "0", "--expected-revision", "none")
        self.assertEqual(result.returncode, 0, result.stderr)
        adopted = json.loads(result.stdout)
        self.assertTrue(adopted["referencesChanged"])
        self.assertEqual(adopted["sequence"], 1)
        self.assertEqual(len(adopted["sources"]), 1)
        self.assertEqual(adopted["evidenceFreshness"]["status"], "no-revision")
        result = invoke("references", "--root", str(other), "--clear", "--expected-sequence", "0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("expected sequence", json.loads(result.stderr)["error"])
        result = invoke("references", "--root", str(other), "--clear", "--expected-sequence", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["sources"], [])
        self.assertEqual(json.loads(result.stdout)["sequence"], 2)
        result = invoke("verify", "--root", str(other))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["evidenceFreshness"]["status"], "no-revision")


if __name__ == "__main__":
    unittest.main()

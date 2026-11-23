"""Host resource/transaction contracts; synthetic worker results are not asset approval."""
import contextlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from test_production_project import fake_worker
from production import project
import produce


class ProductionResourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="refas-resource-test-")
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.root = self.folder / "project"
        self.meta = self.root / project.STATE_DIR
        self.script = self.folder / "edit.py"
        self.script.write_text("# synthetic native edit\n")
        project.initialize(self.root, "resource fixture")

    def edit(self, **options):
        return project.run_edit(self.root, self.script, "edit fixture",
                                **{"executor": fake_worker, "output_profile": "native", "views": [], **options})

    def duplicate_staging(self, result):
        run = self.meta / "runs" / result["runId"]
        revision = self.meta / "revisions" / result["head"]
        for name in ("inputs", "artifacts"):
            shutil.copytree(revision / name, run / name)
        return run

    def observation_worker(self, command, cwd, log_file, timeout):
        job = project.read_json(command[-1])
        out = Path(job["outputDir"])
        key = "preflight" if job["operation"] == "preflight" else "query"
        observed = {"schema": "refas.production." + key + "/v2", "scope": "synthetic contract fixture"}
        if key == "query":
            observed.update(blendSha256=project.digest(job["baseBlend"]),
                            objectNames=job.get("queryObjects", ["fixture-object"]), samples=[])
        else:
            observed["status"] = "passed"
        project.atomic_json(out / (key + ".json"), observed)
        project.atomic_json(out / "result.json", {"schema": "refas.production.result/v2", "ok": True,
                            "outputs": {key: key + ".json"}})
        Path(log_file).write_text("synthetic read-only worker\n")
        return 0.001

    def test_cli_defaults_to_native_but_python_api_retains_delivery_compatibility(self):
        arguments = produce.parser().parse_args(["run", "--root", "unused", "--script", "unused.py", "--intent", "edit"])
        self.assertEqual(arguments.outputs, "native")
        self.assertEqual(arguments.protect_object, [])
        self.assertFalse(arguments.keep_diagnostics)
        result = project.run_edit(self.root, self.script, "old API", executor=fake_worker, views=[])
        self.assertEqual(result["outputProfile"], "delivery")
        self.assertIn("glb", result["outputs"])

    def test_success_transfers_payload_once_and_diagnostics_are_opt_in(self):
        native = self.edit()
        run = self.meta / "runs" / native["runId"]
        self.assertEqual(sorted(path.name for path in run.iterdir()), ["run.json"])
        self.assertEqual(native["outputProfile"], "native")
        self.assertEqual(set(native["outputs"]), {"blend", "scene"})
        self.assertTrue(all(Path(path).is_file() for path in native["inputs"].values()))
        revision = project.load_revision(self.root)
        self.assertEqual(revision["execution"]["outputProfile"], "native")
        self.assertEqual(revision["execution"]["views"], [])
        retained = self.edit(keep_diagnostics=True)
        retained_run = self.meta / "runs" / retained["runId"]
        self.assertEqual(sorted(path.name for path in retained_run.iterdir()), ["blender.log", "job.json", "run.json"])
        self.assertFalse((retained_run / "inputs").exists())
        self.assertFalse((retained_run / "artifacts").exists())
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_failed_attempt_retains_evidence_and_is_never_compacted(self):
        accepted = self.edit()
        def fail(command, *args):
            fake_worker(command, *args)
            raise project.ProductionError("intentional failed native attempt")
        with self.assertRaisesRegex(project.ProductionError, "intentional failed"):
            self.edit(executor=fail)
        state = project.status(self.root)
        self.assertEqual(state["head"], accepted["head"])
        failed = self.meta / "runs" / state["incompleteRuns"][0]["id"]
        before = project.inventory(failed)
        self.assertTrue((failed / "artifacts/scene.blend").is_file())
        self.assertTrue((failed / "blender.log").is_file())
        result = project.compact(self.root, apply=True, expected_sequence=state["sequence"])
        self.assertEqual(result["reclaimedBytes"], 0)
        self.assertEqual(project.inventory(failed), before)

    def test_partial_publication_exposes_preserved_candidate_without_changing_head(self):
        accepted = self.edit()
        self.script.write_text("# interrupted candidate with distinct source\n")
        rename = project.os.rename
        def fail_second_transfer(source, target):
            if Path(source).name == "inputs":
                raise OSError("intentional second payload transfer failure")
            return rename(source, target)
        with mock.patch.object(project.os, "rename", side_effect=fail_second_transfer):
            with self.assertRaisesRegex(OSError, "second payload transfer"):
                self.edit()
        state = project.status(self.root)
        self.assertEqual(state["head"], accepted["head"])
        failure = state["incompleteRuns"][0]
        self.assertEqual(failure["status"], "failed")
        self.assertNotIn(failure["candidateRevision"], project.load_project(self.root)["revisionDigests"])
        candidate = Path(failure["preservedCandidatePath"])
        self.assertEqual(candidate.name, failure["candidateRevision"])
        self.assertEqual((candidate / "artifacts/scene.blend").read_bytes(), b"BLENDER-v300" + self.script.read_bytes())
        run = self.meta / "runs" / failure["id"]
        self.assertEqual((run / "inputs/edit.py").read_bytes(), self.script.read_bytes())
        before = project.inventory(self.meta)
        project.compact(self.root, apply=True)
        self.assertEqual(project.inventory(self.meta), before)

    def test_compact_preview_and_apply_remove_only_verified_duplicate_payloads(self):
        first = self.edit()
        duplicate = self.duplicate_staging(first)
        self.script.write_text("# later native edit\n")
        self.edit()
        before = project.inventory(self.meta)
        history = project.inventory(self.meta / "revisions")
        preview = project.compact(self.root)
        self.assertFalse(preview["applied"])
        self.assertEqual(project.inventory(self.meta), before)
        self.assertEqual([item["runId"] for item in preview["candidates"]], [first["runId"]])
        self.assertGreater(preview["reclaimableBytes"], 0)
        applied = project.compact(self.root, apply=True, expected_sequence=preview["sequence"])
        self.assertEqual(applied["candidates"], preview["candidates"])
        self.assertEqual(applied["reclaimedBytes"], preview["reclaimableBytes"])
        self.assertFalse((duplicate / "artifacts").exists())
        self.assertFalse((duplicate / "inputs").exists())
        self.assertTrue((duplicate / "run.json").exists())
        self.assertEqual(project.inventory(self.meta / "revisions"), history)
        self.assertEqual(project.compact(self.root)["candidates"], [])
        restored = project.restore(self.root, first["head"])
        self.assertEqual(Path(restored["outputs"]["blend"]).read_bytes(), Path(first["outputs"]["blend"]).read_bytes())

    def test_compact_preserves_changed_unrecorded_failed_and_orphan_files(self):
        first = self.edit()
        changed = self.duplicate_staging(first)
        (changed / "artifacts/scene.blend").write_bytes(b"BLENDER-altered-stage")
        second = self.edit()
        extra = self.duplicate_staging(second)
        (extra / "inputs/unique.txt").write_text("not held in any checkpoint")
        unknown = self.meta / "runs" / ("f" * 32)
        unknown.mkdir()
        (unknown / "rejected.blend").write_bytes(b"BLENDER-rejected-unique")
        orphan = self.meta / "revisions" / ("e" * 32)
        orphan.mkdir()
        (orphan / "unpublished.blend").write_bytes(b"BLENDER-unpublished-unique")
        before = project.inventory(self.meta)
        result = project.compact(self.root, apply=True)
        self.assertEqual(result["candidates"], [])
        self.assertEqual(len(result["skipped"]), 2)
        self.assertEqual(project.inventory(self.meta), before)

    def test_compact_does_not_use_damaged_historical_revision_as_a_backup(self):
        first = self.edit()
        self.duplicate_staging(first)
        self.edit()
        Path(first["outputs"]["blend"]).write_bytes(b"BLENDER-damaged-history")
        before = project.inventory(self.meta)
        result = project.compact(self.root, apply=True)
        self.assertEqual(result["candidates"], [])
        self.assertEqual(result["skipped"][0]["runId"], first["runId"])
        self.assertEqual(project.inventory(self.meta), before)

    def test_compact_rejects_stale_sequence_and_rechecks_bytes_inside_lock(self):
        first = self.edit()
        duplicate = self.duplicate_staging(first)
        with self.assertRaisesRegex(project.ProductionError, "expected sequence"):
            project.compact(self.root, apply=True, expected_sequence=0)
        lock = project.project_lock
        @contextlib.contextmanager
        def changed_after_preview(meta):
            with lock(meta):
                (duplicate / "artifacts/scene.blend").write_bytes(b"BLENDER-changed-after-preview")
                yield
        with mock.patch.object(project, "project_lock", changed_after_preview):
            with self.assertRaisesRegex(project.ProductionError, "changed or missing"):
                project.compact(self.root, apply=True, expected_sequence=first["sequence"])
        self.assertTrue((duplicate / "inputs").is_dir())
        self.assertEqual((duplicate / "artifacts/scene.blend").read_bytes(), b"BLENDER-changed-after-preview")
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_storage_reports_logical_file_bytes_without_creating_artifacts(self):
        self.edit()
        before = project.inventory(self.meta)
        stats = project.storage_stats(self.root)
        self.assertEqual(stats["total"], {"files": len(before), "bytes": sum(item["bytes"] for item in before)})
        self.assertEqual(stats["committedRevisions"], 1)
        self.assertEqual(project.inventory(self.meta), before)

    def test_native_restore_retains_exact_profile_artifacts_and_inputs(self):
        first = self.edit()
        revision = project.load_revision(self.root)
        self.edit(output_profile="delivery")
        restored = project.restore(self.root, first["head"])
        current = project.load_revision(self.root)
        self.assertEqual(restored["outputProfile"], "native")
        self.assertNotIn("glb", restored["outputs"])
        self.assertEqual(current["artifacts"], revision["artifacts"])
        self.assertEqual(current["inputs"], revision["inputs"])
        self.assertEqual(current["execution"], revision["execution"])

    def test_requested_profile_and_protection_attestation_are_required(self):
        accepted = self.edit()
        for label in ("wrong-profile", "missing-protection", "missing-name", "missing-scope", "wrong-scope"):
            def damaged(command, *args):
                elapsed = fake_worker(command, *args)
                output = Path(project.read_json(command[-1])["outputDir"]) / "result.json"
                result = project.read_json(output)
                protection = result["verification"]["protectedObjects"]
                if label == "wrong-profile":
                    result["outputProfile"] = "delivery"
                elif label == "missing-protection":
                    del result["verification"]["protectedObjects"]
                elif label == "missing-name":
                    protection["objects"] = []
                elif label == "missing-scope":
                    del protection["scope"]
                else:
                    protection["scope"] = "names-only"
                project.atomic_json(output, result)
                return elapsed
            with self.subTest(label=label), self.assertRaises(project.ProductionError):
                self.edit(executor=damaged, protected_objects=["Retained"])
            self.assertEqual(project.status(self.root)["head"], accepted["head"])

    def test_delivery_is_pinned_to_selected_native_and_records_delivery_profile(self):
        first = self.edit()
        native_bytes = Path(first["outputs"]["blend"]).read_bytes()
        jobs = []
        def worker(command, *args):
            job = project.read_json(command[-1])
            jobs.append(job)
            self.assertEqual(Path(job["baseBlend"]).read_bytes(), native_bytes)
            return fake_worker(command, *args)
        delivered = project.deliver(self.root, executor=worker, views=[],
                                    expected_revision=first["head"], expected_sequence=first["sequence"])
        self.assertEqual(jobs[0]["outputProfile"], "delivery")
        self.assertEqual(delivered["outputProfile"], "delivery")
        self.assertIn("glb", delivered["outputs"])
        self.assertEqual(project.load_revision(self.root)["parent"], first["head"])
        self.assertTrue(Path(delivered["inputs"]["edit.py"]).is_file())
        self.assertFalse(Path(jobs[0]["script"]).exists())

    def test_delivery_refuses_a_concurrent_change_before_starting_work(self):
        first = self.edit()
        run_edit = project.run_edit
        def concurrent(*args, **kwargs):
            run_edit(self.root, self.script, "concurrent edit", executor=fake_worker, output_profile="native", views=[])
            return run_edit(*args, **kwargs)
        with mock.patch.object(project, "run_edit", side_effect=concurrent):
            with self.assertRaisesRegex(project.ProductionError, "expected revision"):
                project.deliver(self.root, executor=fake_worker, views=[])
        state = project.status(self.root)
        self.assertNotEqual(state["head"], first["head"])
        self.assertEqual(len(state["revisions"]), 2)
        self.assertEqual(state["outputProfile"], "native")

    def test_query_and_preflight_leave_no_persistent_outputs(self):
        first = self.edit()
        before = project.inventory(self.meta)
        directories = []
        def observe(command, cwd, *args):
            directories.append(Path(cwd))
            job = project.read_json(command[-1])
            if job["operation"] == "query":
                self.assertNotIn("queryObjects", job)
                self.assertNotIn("queryFrames", job)
            return self.observation_worker(command, cwd, *args)
        query = project.inspect_native(self.root, executor=observe)
        preflight = project.export_preflight(executor=observe)
        self.assertEqual(query["revision"], first["head"])
        self.assertEqual(query["nativeSha256"], project.digest(first["outputs"]["blend"]))
        self.assertFalse(query["persisted"])
        self.assertEqual(preflight["status"], "passed")
        self.assertTrue(all(not directory.exists() for directory in directories))
        self.assertEqual(project.inventory(self.meta), before)

    def test_query_rejects_unbound_output_and_retains_no_failure_bundle(self):
        self.edit()
        before = project.inventory(self.meta)
        directories = []
        def unbound(command, cwd, *args):
            directories.append(Path(cwd))
            elapsed = self.observation_worker(command, cwd, *args)
            path = Path(project.read_json(command[-1])["outputDir"]) / "query.json"
            result = project.read_json(path)
            result["blendSha256"] = "0" * 64
            project.atomic_json(path, result)
            return elapsed
        with self.assertRaises(project.ProductionError):
            project.inspect_native(self.root, executor=unbound)
        self.assertTrue(all(not directory.exists() for directory in directories))
        self.assertEqual(project.inventory(self.meta), before)


if __name__ == "__main__":
    unittest.main()

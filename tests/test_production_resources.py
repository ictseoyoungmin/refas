"""Host resource/transaction contracts; synthetic worker results are not asset approval."""
import contextlib
import io
from inspect import signature
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from test_production_project import fake_worker
from test_production_import import glb_bytes
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

    def test_run_cli_selects_one_explicit_native_or_glb_source(self):
        command = ["run", "--root", "project", "--script", "edit.py", "--intent", "edit asset"]
        for flags, native, glb in [([], None, None), (["--input-blend", "source.blend"], "source.blend", None),
                                   (["--input-glb", "source.glb"], None, "source.glb")]:
            with self.subTest(flags=flags), mock.patch.object(produce.sys, "argv", ["produce.py", *command, *flags]), \
                    mock.patch.object(produce, "run_edit", return_value={}) as edit, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(produce.main(), 0)
            edit.assert_called_once()
            bound = signature(project.run_edit).bind(*edit.call_args.args, **edit.call_args.kwargs)
            bound.apply_defaults()
            self.assertEqual(bound.arguments["input_blend"], native)
            self.assertEqual(bound.arguments["input_glb"], glb)
            self.assertEqual(bound.arguments["output_profile"], "native")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as rejected:
            produce.parser().parse_args([*command, "--input-blend", "source.blend", "--input-glb", "source.glb"])
        self.assertEqual(rejected.exception.code, 2)

    def test_glb_input_is_frozen_then_continued_and_restored_as_native(self):
        accepted = self.edit()
        accepted_bundle = project.inventory(self.meta / "revisions" / accepted["head"])
        source = self.folder / "editable input.glb"
        original = glb_bytes({"asset": {"version": "2.0"}, "extras": {"source": "external asset"}})
        source.write_bytes(original)
        observed = []
        def worker(command, *args):
            job = project.read_json(command[-1])
            observed.append((job, Path(job.get("baseGlb") or job["baseBlend"]).read_bytes()))
            return fake_worker(command, *args)
        self.script.write_text("# modify imported asset\n")
        imported = self.edit(input_glb=source, executor=worker, protected_objects=["RetainedImportedPart"],
                             expected_revision=accepted["head"], expected_sequence=accepted["sequence"])
        imported_revision = project.load_revision(self.root)
        job, captured = observed[0]
        self.assertIsNone(job.get("baseBlend"))
        self.assertNotEqual(Path(job["baseGlb"]), source)
        self.assertEqual(captured, original)
        self.assertEqual(job["protectedObjects"], ["RetainedImportedPart"])
        self.assertEqual(Path(imported["inputs"]["base.glb"]).read_bytes(), original)
        self.assertNotIn("base.blend", imported["inputs"])
        self.assertNotIn("glb", imported["outputs"])
        self.assertEqual(imported_revision["parent"], accepted["head"])
        self.assertEqual(imported_revision["kind"], "edit")
        self.assertNotIn("migration", imported_revision)
        imported_native = Path(imported["outputs"]["blend"]).read_bytes()
        self.script.write_text("# continue editing the imported native\n")
        self.edit(executor=worker)
        self.assertIsNone(observed[1][0].get("baseGlb"))
        self.assertEqual(observed[1][1], imported_native)
        restored = project.restore(self.root, imported["head"])
        restored_revision = project.load_revision(self.root)
        self.assertEqual(restored_revision["inputs"], imported_revision["inputs"])
        self.assertEqual(restored_revision["artifacts"], imported_revision["artifacts"])
        self.assertEqual(Path(restored["inputs"]["base.glb"]).read_bytes(), original)
        self.assertEqual(source.read_bytes(), original)
        self.assertEqual(project.inventory(self.meta / "revisions" / accepted["head"]), accepted_bundle)
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_run_preserves_old_positional_arguments_and_rejects_mixed_input_sources(self):
        source = self.folder / "input.glb"
        source.write_bytes(glb_bytes())
        native = self.folder / "manual.blend"
        native.write_bytes(b"BLENDER-manual-fixture")
        before = project.inventory(self.meta)
        refused = mock.Mock(side_effect=AssertionError("ambiguous source reached worker"))
        for options in ({"input_blend": native, "input_glb": source},
                        {"input_glb": source, "_import_bundle": (self.folder, [])}):
            with self.subTest(options=options), self.assertRaises(project.ProductionError):
                self.edit(executor=refused, **options)
        refused.assert_not_called()
        self.assertEqual(project.inventory(self.meta), before)
        jobs = []
        def worker(command, *args):
            jobs.append(project.read_json(command[-1]))
            return fake_worker(command, *args)
        # Every pre-existing positional argument, including protection and diagnostics, stays in place.
        result = project.run_edit(self.root, self.script, "old positional API", "blender", native, [],
                                  64, 1, 180, "none", worker, None, 0, None, "native", ["Kept"], False)
        self.assertEqual(result["outputProfile"], "native")
        self.assertEqual(Path(result["inputs"]["base.blend"]).read_bytes(), native.read_bytes())
        self.assertIsNone(jobs[0].get("baseGlb"))
        self.assertEqual(jobs[0]["protectedObjects"], ["Kept"])

    def test_invalid_glb_inputs_fail_before_execution_and_preserve_the_current_revision(self):
        accepted = self.edit()
        accepted_bundle = project.inventory(self.meta / "revisions" / accepted["head"])
        malformed = self.folder / "malformed.glb"
        malformed.write_bytes(b"not a GLB container")
        external = self.folder / "external-resource.glb"
        external.write_bytes(glb_bytes({"asset": {"version": "2.0"}, "images": [{"uri": "outside.png"}]}))
        worker = mock.Mock(side_effect=AssertionError("invalid GLB reached worker"))
        for source in (self.folder / "missing.glb", self.folder, malformed, external):
            with self.subTest(source=source), self.assertRaises(project.ProductionError):
                self.edit(input_glb=source, executor=worker)
            self.assertEqual(project.status(self.root)["head"], accepted["head"])
            self.assertEqual(project.status(self.root)["sequence"], accepted["sequence"])
        worker.assert_not_called()
        self.assertEqual(project.inventory(self.meta / "revisions" / accepted["head"]), accepted_bundle)

    def test_glb_capture_race_tampering_and_worker_failure_never_publish(self):
        accepted = self.edit()
        accepted_bundle = project.inventory(self.meta / "revisions" / accepted["head"])
        source = self.folder / "input.glb"
        original = glb_bytes()
        source.write_bytes(original)
        copy = project.shutil.copy2
        def changed_during_capture(origin, target, *args, **kwargs):
            result = copy(origin, target, *args, **kwargs)
            if Path(origin) == source:
                source.write_bytes(glb_bytes({"asset": {"version": "2.0"}, "extras": {"changed": True}}))
            return result
        refused = mock.Mock(side_effect=AssertionError("changing input reached worker"))
        with mock.patch.object(project.shutil, "copy2", side_effect=changed_during_capture), \
                self.assertRaises(project.ProductionError):
            self.edit(input_glb=source, executor=refused)
        refused.assert_not_called()
        self.assertEqual(project.status(self.root)["head"], accepted["head"])
        for failure in ("captured-input-tamper", "worker-failure"):
            source.write_bytes(original)
            captured_paths = []
            def fail(command, *args):
                captured = Path(project.read_json(command[-1])["baseGlb"])
                captured_paths.append(captured)
                elapsed = fake_worker(command, *args)
                if failure == "captured-input-tamper":
                    captured.write_bytes(b"altered frozen input")
                    return elapsed
                raise project.ProductionError("intentional GLB worker failure")
            with self.subTest(failure=failure), self.assertRaises(project.ProductionError):
                self.edit(input_glb=source, executor=fail)
            self.assertEqual(project.status(self.root)["head"], accepted["head"])
            self.assertEqual(project.status(self.root)["sequence"], accepted["sequence"])
            self.assertEqual(captured_paths[0].read_bytes(),
                             b"altered frozen input" if failure == "captured-input-tamper" else original)
            self.assertEqual(project.read_json(captured_paths[0].parents[1] / "run.json")["status"], "failed")
            self.assertEqual(source.read_bytes(), original)
        self.assertEqual(project.inventory(self.meta / "revisions" / accepted["head"]), accepted_bundle)
        self.assertTrue(project.verify_project(self.root)["ok"])

    def test_external_glb_changes_after_capture_do_not_replace_frozen_inputs(self):
        source = self.folder / "input.glb"
        original = glb_bytes()
        source.write_bytes(original)
        def changed_after_capture(command, *args):
            source.write_bytes(b"externally changed after capture")
            return fake_worker(command, *args)
        result = self.edit(input_glb=source, executor=changed_after_capture)
        self.assertEqual(Path(result["inputs"]["base.glb"]).read_bytes(), original)
        self.assertEqual(source.read_bytes(), b"externally changed after capture")
        self.assertTrue(project.verify_project(self.root)["ok"])

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

    def test_inspection_cli_uses_summaries_unless_details_are_requested(self):
        cases = [((), False, False), (("--topology",), True, False),
                 (("--topology-details",), False, True),
                 (("--topology", "--topology-details"), True, True)]
        for flags, topology, details in cases:
            with self.subTest(flags=flags), mock.patch.object(produce.sys, "argv", [
                    "produce.py", "inspect", "--input-blend", "candidate.blend", *flags]), \
                    mock.patch.object(produce, "inspect_native", return_value={}) as inspect, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(produce.main(), 0)
            inspect.assert_called_once()
            self.assertIs(inspect.call_args.kwargs["topology"], topology)
            self.assertIs(inspect.call_args.kwargs["topology_details"], details)

    def test_inspection_api_preserves_positional_calls_and_routes_detail_choice(self):
        first = self.edit()
        before = project.inventory(self.meta)
        jobs = []
        directories = []
        def observe(command, cwd, *args):
            jobs.append(project.read_json(command[-1]))
            directories.append(Path(cwd))
            return self.observation_worker(command, cwd, *args)

        # The existing positional signature, including the executor, stays valid.
        legacy = project.inspect_native(self.root, ["Selected"], [1, 5], True, "blender", 180,
                                        first["head"], first["sequence"], observe)
        self.assertEqual(legacy["revision"], first["head"])
        self.assertIs(jobs[-1]["queryTopology"], True)
        self.assertIs(jobs[-1].get("queryTopologyDetails", True), True)
        for topology, choice, expected_topology, expected_details in [
                (True, None, True, True), (True, False, True, False),
                (False, True, True, True), (False, False, False, False)]:
            with self.subTest(topology=topology, details=choice):
                project.inspect_native(self.root, topology=topology, topology_details=choice,
                                       executor=observe)
                self.assertIs(jobs[-1]["queryTopology"], expected_topology)
                self.assertIs(jobs[-1].get("queryTopologyDetails", True), expected_details)
        self.assertTrue(all(not directory.exists() for directory in directories))
        self.assertEqual(project.inventory(self.meta), before)

    def test_inspection_api_rejects_nonboolean_detail_choices_before_execution(self):
        self.edit()
        before = project.inventory(self.meta)
        worker = mock.Mock(side_effect=AssertionError("invalid details reached worker"))
        for value in (0, 1, -1, 0.0, 1.5, "true", "false", [], {}):
            with self.subTest(value=value), self.assertRaisesRegex(project.ProductionError, "topology_details"):
                project.inspect_native(self.root, topology=True, topology_details=value, executor=worker)
        worker.assert_not_called()
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

    def test_standalone_query_uses_original_path_without_project_adoption(self):
        external = self.folder / "external"
        external.mkdir()
        native = external / "candidate native.blend"
        native.write_bytes(b"BLENDER-standalone-contract-fixture")
        before = project.inventory(self.folder)
        directories = []
        def observe(command, cwd, *args):
            directories.append(Path(cwd))
            job = project.read_json(command[-1])
            self.assertEqual(job["baseBlend"], str(native.resolve()))
            self.assertEqual(job["queryObjects"], ["Selected"])
            self.assertEqual(job["queryFrames"], [1, 49])
            self.assertTrue(job["queryTopology"])
            return self.observation_worker(command, cwd, *args)
        result = project.inspect_native(input_blend=native, objects=["Selected"], frames=[1, 49],
                                        topology=True, executor=observe)
        self.assertIsNone(result["revision"])
        self.assertEqual(result["inputBlend"], str(native.resolve()))
        self.assertEqual(result["nativeSha256"], project.digest(native))
        self.assertNotIn("evidenceFreshness", result)
        self.assertFalse(result["persisted"])
        self.assertEqual(project.inventory(self.folder), before)
        self.assertTrue(all(not directory.exists() for directory in directories))

    def test_inspection_sources_are_unambiguous_in_cli_and_python(self):
        arguments = produce.parser().parse_args(["inspect", "--input-blend", "standalone.blend"])
        self.assertIsNone(arguments.root)
        self.assertEqual(arguments.input_blend, "standalone.blend")
        for argv in (["inspect"], ["inspect", "--root", "project", "--input-blend", "source.blend"]):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                produce.parser().parse_args(argv)
        worker = mock.Mock(side_effect=AssertionError("invalid source reached worker"))
        for options in ({}, {"root": self.root, "input_blend": "source.blend"},
                        {"input_blend": "source.blend", "expected_revision": "none"},
                        {"input_blend": "source.blend", "expected_sequence": 0}):
            with self.subTest(options=options), self.assertRaises(project.ProductionError):
                project.inspect_native(**options, executor=worker)
        worker.assert_not_called()

    def test_standalone_invalid_inputs_do_not_start_blender(self):
        worker = mock.Mock(side_effect=AssertionError("invalid input reached worker"))
        for path in (self.folder / "missing.blend", self.folder):
            with self.subTest(path=path), self.assertRaisesRegex(project.ProductionError, "existing native file"):
                project.inspect_native(input_blend=path, executor=worker)
        worker.assert_not_called()

    def test_standalone_input_change_and_worker_failure_discard_temporary_outputs(self):
        native = self.folder / "external.blend"
        directories = []
        for mode in ("changed", "failed"):
            native.write_bytes(b"BLENDER-original-fixture")
            def fail(command, cwd, *args):
                directories.append(Path(cwd))
                elapsed = self.observation_worker(command, cwd, *args)
                if mode == "changed":
                    native.write_bytes(b"BLENDER-concurrently-changed-fixture")
                    return elapsed
                raise project.ProductionError("intentional standalone worker failure")
            error = "native source changed" if mode == "changed" else "standalone worker failure"
            with self.subTest(mode=mode), self.assertRaisesRegex(project.ProductionError, error):
                project.inspect_native(input_blend=native, executor=fail)
            self.assertTrue(all(not directory.exists() for directory in directories))
            self.assertEqual(list((self.meta / "revisions").iterdir()), [])


if __name__ == "__main__":
    unittest.main()

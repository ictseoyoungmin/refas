"""Explicit legacy-import transaction tests; synthetic claims are not certificates."""
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills/refas/scripts"
sys.path.insert(0, str(SCRIPTS))
from production import VERSION, asset_import, project
from test_production_project import fake_worker


def glb_bytes(document=None):
    payload = json.dumps(document or {"asset": {"version": "2.0"}}).encode()
    payload += b" " * (-len(payload) % 4)
    return b"glTF" + struct.pack("<II", 2, 20 + len(payload)) + struct.pack("<I", len(payload)) + b"JSON" + payload


def create_legacy_project(root, asset_bytes, suffix=".glb", reference_bytes=b"synthetic-source-reference"):
    """Small format fixture with a deliberately unvalidated historical claim."""
    root = Path(root)
    meta = root / ".refas"
    (meta / "checkpoints").mkdir(parents=True)
    (root / "source").mkdir()
    (root / "source/reference.png").write_bytes(reference_bytes)
    source = {"schema": "refas.source-manifest/v1", "path": "source/reference.png",
              "sha256": project.digest(root / "source/reference.png"), "sizeBytes": len(reference_bytes),
              "authority": "primary", "acquisition": {"kind": "synthetic-test-reference"}}
    checkpoint = "cp_" + "a" * 20
    asset = "assets/selected" + suffix
    live = root / asset
    live.parent.mkdir()
    live.write_bytes(asset_bytes)
    asset_hash = project.digest(live)
    archive = meta / "objects" / asset_hash[:2] / asset_hash[2:]
    archive.parent.mkdir(parents=True)
    archive.write_bytes(asset_bytes)
    state = {"schema": "refas.project-state/v1", "version": "1.4.2", "projectId": "synthetic-legacy",
             "source": source, "head": checkpoint, "checkpointIds": [checkpoint], "status": "certified",
             "certification": {"note": "synthetic claimed certificate; not validated by this test"}}
    selected = {"schema": "refas.checkpoint/v1", "id": checkpoint, "parentId": None,
                "artifactRefs": [{"kind": "artifact", "path": asset, "sha256": asset_hash, "sizeBytes": len(asset_bytes)}]}
    project.atomic_json(meta / "project.json", state)
    project.atomic_json(meta / "checkpoints" / (checkpoint + ".json"), selected)
    project.atomic_json(meta / "certification.json", {"synthetic": True, "status": "claimed-certified"})
    return {"root": root, "checkpoint": checkpoint, "artifact": asset, "archive": archive,
            "state": state, "manifest": meta / "project.json", "checkpointFile": meta / "checkpoints" / (checkpoint + ".json")}


class ProductionLegacyImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="refas-import-test-")
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.legacy = create_legacy_project(self.folder / "legacy", glb_bytes())
        self.destination = self.folder / "new-production"

    def run_import(self, **kwargs):
        defaults = {"root": self.destination, "source_project": self.legacy["root"],
                    "checkpoint": self.legacy["checkpoint"], "artifact": self.legacy["artifact"],
                    "name": "imported", "executor": fake_worker}
        return asset_import.import_v1(**{**defaults, **kwargs})

    def test_explicit_archived_asset_and_provenance_without_certificate_transfer(self):
        # The live file is intentionally uncommitted; selection names archived bytes.
        (self.legacy["root"] / self.legacy["artifact"]).write_bytes(b"uncommitted live content")
        before = project.inventory(self.legacy["root"])
        state = self.run_import()
        revision = project.load_revision(self.destination)
        self.assertEqual(revision["kind"], "import-v1")
        self.assertEqual(state["migration"]["route"], "glb")
        self.assertEqual(state["migration"]["artifact"]["kind"], "artifact")
        self.assertEqual(Path(state["inputs"]["import/asset.glb"]).read_bytes(), self.legacy["archive"].read_bytes())
        self.assertEqual(Path(state["inputs"]["import/legacy-project.json"]).read_bytes(), self.legacy["manifest"].read_bytes())
        self.assertEqual(Path(state["inputs"]["import/legacy-checkpoint.json"]).read_bytes(), self.legacy["checkpointFile"].read_bytes())
        self.assertEqual(json.loads(Path(state["inputs"]["import/migration.json"]).read_text()), state["migration"])
        self.assertEqual(state["migration"]["certification"], {"inherited": False, "status": "not-evaluated"})
        self.assertEqual(revision["assessment"], {"referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"})
        self.assertNotIn("certification", project.load_project(self.destination))
        self.assertEqual(state["migration"]["reference"]["legacyAcquisition"]["kind"], "synthetic-test-reference")
        self.assertEqual(project.inventory(self.legacy["root"]), before)

    def test_native_selection_uses_the_same_captured_input_transaction(self):
        native = create_legacy_project(self.folder / "native-legacy", b"BLENDER-v300-native", ".blend")
        jobs = []
        def worker(command, *args):
            jobs.append(project.read_json(command[-1]))
            return fake_worker(command, *args)
        result = self.run_import(source_project=native["root"], artifact=native["artifact"], executor=worker)
        self.assertEqual(result["migration"]["route"], "native")
        self.assertTrue(jobs[0]["legacyImport"])
        self.assertEqual(Path(result["inputs"]["import/asset.blend"]).read_bytes(), native["archive"].read_bytes())
        self.assertNotIn("baseGlb", jobs[0])
        self.assertIn("packed textures", result["migration"]["limitations"][0])

    def test_selection_is_explicit_and_does_not_guess_other_checkpoints_or_assets(self):
        original = self.legacy["checkpointFile"].read_bytes()
        cases = [{"checkpoint": "cp_" + "b" * 20}, {"artifact": "assets/other.glb"}]
        for options in cases:
            with self.subTest(options=options), self.assertRaises(project.ProductionError):
                self.run_import(**options)
            self.assertFalse(self.destination.exists())
        selected = project.read_json(self.legacy["checkpointFile"])
        selected["artifactRefs"] *= 2
        project.atomic_json(self.legacy["checkpointFile"], selected)
        with self.assertRaisesRegex(project.ProductionError, "exactly one"):
            self.run_import()
        self.assertFalse(self.destination.exists())
        self.legacy["checkpointFile"].write_bytes(original)

    def test_damaged_archive_or_reference_is_rejected_without_destination(self):
        for path in (self.legacy["archive"], self.legacy["root"] / "source/reference.png"):
            original = path.read_bytes()
            path.write_bytes(b"corrupt")
            before = project.inventory(self.legacy["root"])
            with self.subTest(path=str(path)), self.assertRaisesRegex(project.ProductionError, "changed or missing"):
                self.run_import()
            self.assertFalse(self.destination.exists())
            self.assertEqual(project.inventory(self.legacy["root"]), before)
            path.write_bytes(original)

    def test_unsafe_paths_symlinks_and_overlapping_destinations_are_rejected(self):
        for path in ("../asset.glb", "/asset.glb", "assets/../asset.glb", "assets\\asset.glb", ".refas/asset.glb"):
            with self.subTest(path=path), self.assertRaises(project.ProductionError):
                self.run_import(artifact=path)
        with self.assertRaisesRegex(project.ProductionError, "disjoint"):
            self.run_import(root=self.legacy["root"] / "new")
        with self.assertRaisesRegex(project.ProductionError, "outside the installed skill"):
            self.run_import(root=SCRIPTS.parent / "must-not-create-import-test")
        archive = self.legacy["archive"]
        saved = self.folder / "asset-copy.glb"
        archive.rename(saved)
        archive.symlink_to(saved)
        with self.assertRaisesRegex(project.ProductionError, "symlink"):
            self.run_import()
        self.assertFalse(self.destination.exists())

    def test_unsupported_version_metadata_and_bad_native_or_external_glb_are_rejected(self):
        for suffix, data in ((".blend", b"not-a-blender-file"),
                             (".glb", b"glTFbad"),
                             (".glb", glb_bytes({"asset": {"version": "2.0"}, "images": [{"uri": "../outside.png"}]}))):
            case = self.folder / ("invalid-" + str(len(list(self.folder.iterdir()))))
            old = create_legacy_project(case, data, suffix)
            with self.subTest(suffix=suffix, data=data[:12]), self.assertRaises(project.ProductionError):
                self.run_import(source_project=case, artifact=old["artifact"])
            self.assertFalse(self.destination.exists())
        state = self.legacy["state"]
        state["version"] = "2.0.0"
        project.atomic_json(self.legacy["manifest"], state)
        with self.assertRaisesRegex(project.ProductionError, "1.x"):
            self.run_import()

    def test_source_snapshot_change_during_capture_is_rejected(self):
        copy = shutil.copy2
        def changing_copy(source, target, *args, **kwargs):
            result = copy(source, target, *args, **kwargs)
            if Path(source) == self.legacy["checkpointFile"]:
                self.legacy["manifest"].write_text('{"changed": true}')
            return result
        with mock.patch.object(asset_import.shutil, "copy2", side_effect=changing_copy):
            with self.assertRaisesRegex(project.ProductionError, "snapshot changed"):
                self.run_import()
        self.assertFalse(self.destination.exists())
        self.assertEqual(list(self.folder.glob(".refas-v1-capture-*")), [])

    def test_glb_extension_declarations_are_captured_and_structurally_checked(self):
        extensions = {"extensionsUsed": ["REFAS_optional_fixture"], "extensionsRequired": []}
        old = create_legacy_project(self.folder / "declared-extensions",
                                    glb_bytes({"asset": {"version": "2.0"}, **extensions}))
        result = self.run_import(source_project=old["root"])
        for name, value in extensions.items():
            self.assertEqual(result["migration"]["artifact"][name], value)
        for index, declaration in enumerate(({"extensionsUsed": "invalid"},
                                             {"extensionsUsed": [None]},
                                             {"extensionsRequired": ["REFAS_missing_used_declaration"]})):
            old = create_legacy_project(self.folder / ("invalid-extension-" + str(index)),
                                        glb_bytes({"asset": {"version": "2.0"}, **declaration}))
            target = self.folder / ("invalid-extension-target-" + str(index))
            with self.subTest(declaration=declaration), self.assertRaisesRegex(project.ProductionError, "extension"):
                self.run_import(root=target, source_project=old["root"])
            self.assertFalse(target.exists())

    def test_external_changes_after_freezing_do_not_change_imported_inputs(self):
        original_manifest = self.legacy["manifest"].read_bytes()
        original_asset = self.legacy["archive"].read_bytes()
        def change_external(command, *args):
            self.legacy["manifest"].write_text('{"externallyChanged": true}')
            self.legacy["archive"].write_bytes(b"externally changed archive")
            return fake_worker(command, *args)
        result = self.run_import(executor=change_external)
        self.assertEqual(Path(result["inputs"]["import/legacy-project.json"]).read_bytes(), original_manifest)
        self.assertEqual(Path(result["inputs"]["import/asset.glb"]).read_bytes(), original_asset)
        self.assertTrue(project.verify_project(self.destination)["ok"])

    def test_failed_worker_or_captured_input_tamper_never_publishes_import(self):
        before = project.inventory(self.legacy["root"])
        def failure(command, cwd, log_file, timeout):
            fake_worker(command, cwd, log_file, timeout)
            raise project.ProductionError("intentional import worker failure")
        def tamper(command, cwd, log_file, timeout):
            result = fake_worker(command, cwd, log_file, timeout)
            job = project.read_json(command[-1])
            Path(job["baseGlb"]).write_bytes(b"worker tampered with frozen GLB")
            return result
        for index, executor in enumerate((failure, tamper)):
            target = self.folder / ("failed-" + str(index))
            with self.subTest(index=index), self.assertRaises(project.ProductionError):
                self.run_import(root=target, executor=executor)
            state = project.status(target)
            self.assertIsNone(state["head"])
            self.assertEqual(state["revisions"], [])
            self.assertEqual(state["incompleteRuns"][0]["status"], "failed")
            self.assertTrue(list((target / ".refas2/runs").glob("*/artifacts/scene.blend")))
        self.assertEqual(project.inventory(self.legacy["root"]), before)

    def test_import_inputs_restore_exactly_after_local_revision(self):
        imported = self.run_import()
        revision = project.load_revision(self.destination)
        edit = self.folder / "edit.py"
        edit.write_text("# local edit after importing\n")
        project.run_edit(self.destination, edit, "local edit", executor=fake_worker)
        restored = project.restore(self.destination, imported["head"])
        current = project.load_revision(self.destination)
        self.assertEqual(current["inputs"], revision["inputs"])
        self.assertEqual(current["artifacts"], revision["artifacts"])
        self.assertEqual(current["migration"], revision["migration"])
        self.assertEqual(restored["evidenceFreshness"]["status"], "current")
        self.assertEqual(project.load_project(self.destination)["sources"][0]["sha256"], self.legacy["state"]["source"]["sha256"])

    def test_reference_name_cannot_collide_with_internal_capture_files(self):
        old = self.legacy["root"] / "source/reference.png"
        old.rename(old.with_name("adopt.py"))
        state = self.legacy["state"]
        state["source"]["path"] = "source/adopt.py"
        project.atomic_json(self.legacy["manifest"], state)
        result = self.run_import()
        self.assertEqual(result["sources"][0]["sha256"], state["source"]["sha256"])

    def test_copied_standalone_cli_reports_version_and_import_contract(self):
        installed = self.folder / "installed-skill"
        shutil.copytree(SCRIPTS.parent, installed)
        cli = [sys.executable, "-B", str(installed / "scripts/produce.py")]
        version = subprocess.run(cli + ["--version"], capture_output=True, text=True, cwd=self.folder)
        self.assertEqual(version.returncode, 0, version.stderr)
        self.assertEqual(version.stdout.strip(), "RefAs " + VERSION)
        help_result = subprocess.run(cli + ["import-v1", "--help"], capture_output=True, text=True, cwd=self.folder)
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("--checkpoint", help_result.stdout)
        refused = subprocess.run(cli + ["import-v1", "--root", str(self.destination), "--source-project", str(self.legacy["root"]),
            "--checkpoint", self.legacy["checkpoint"], "--artifact", "assets/missing.glb", "--name", "explicit"],
            capture_output=True, text=True, cwd=self.folder)
        self.assertEqual(refused.returncode, 1)
        self.assertIn("exactly one", json.loads(refused.stderr)["error"])
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()

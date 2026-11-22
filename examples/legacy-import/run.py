#!/usr/bin/env python3
"""Demonstrate an explicit legacy import, local edit and exact restore.

Invokes a separately installed public CLI. Uses only Python's standard library;
the installed runner invokes Blender. This is an integrity/editability example,
not a source-likeness, certification or whole-project migration test.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def files(root):
    return {p.relative_to(root).as_posix(): {"sha256": sha(p), "bytes": p.stat().st_size}
            for p in sorted(root.rglob("*")) if p.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", required=True, type=Path, help="Installed executable refas launcher, or produce.py")
    parser.add_argument("--legacy-project", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--edit-object", required=True, help="Exact imported mesh name for a small local displacement")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--blender", default="blender")
    args = parser.parse_args()
    out, old, entry = args.out.resolve(), args.legacy_project.resolve(), args.cli.resolve()
    if out.exists() or out.is_relative_to(old) or old.is_relative_to(out):
        raise ValueError("Choose a new output directory disjoint from the legacy project")
    if not old.is_dir() or not entry.is_file():
        raise ValueError("Missing legacy project or installed CLI")
    out.mkdir(parents=True)
    logs = out / "commands"
    logs.mkdir()
    project = out / "project"
    commands = []
    before = files(old)
    save(out / "legacy-before.json", before)
    state = json.loads((old / ".refas/project.json").read_text())
    manifest = json.loads((old / (".refas/checkpoints/" + args.checkpoint + ".json")).read_text())
    selected = [x for x in manifest["artifactRefs"] if x["path"] == args.artifact]
    if len(selected) != 1:
        raise ValueError("Select one recorded artifact")
    selected = selected[0]
    prefix = [sys.executable, "-B", str(entry)] if entry.suffix == ".py" else [str(entry)]

    def execute(label, *arguments, json_output=True):
        command = [*prefix, *map(str, arguments)]
        started = time.time()
        result = subprocess.run(command, cwd=out, capture_output=True, text=True, timeout=270,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        (logs / (label + ".stdout")).write_text(result.stdout, encoding="utf-8")
        (logs / (label + ".stderr")).write_text(result.stderr, encoding="utf-8")
        commands.append({"label": label, "argv": command, "startedUnix": started,
                         "elapsedSeconds": round(time.time() - started, 3), "returncode": result.returncode})
        save(out / "commands.json", commands)
        if result.returncode:
            raise RuntimeError(label + ": " + (result.stderr + result.stdout)[-3000:])
        return json.loads(result.stdout) if json_output else result.stdout.strip()

    def bundle(status):
        revision = project / ".refas2/revisions" / status["head"]
        return {folder + "/" + name: item for folder in ("artifacts", "inputs")
                for name, item in files(revision / folder).items()}

    version = execute("01-version", "--version", json_output=False)
    environment = execute("02-doctor", "doctor", "--blender", args.blender)
    first = execute("03-import", "import-v1", "--root", project, "--source-project", old,
                    "--checkpoint", args.checkpoint, "--artifact", args.artifact,
                    "--name", "legacy-import-proof", "--views", "hero,side", "--size", 192,
                    "--samples", 4, "--blender", args.blender, "--timeout", 240)
    first_bundle = bundle(first)
    original = json.loads(Path(first["outputs"]["scene"]).read_text())
    edit = out / "local-edit.py"
    edit.write_text("import bpy\n"
                   + "target = bpy.data.objects[" + repr(args.edit_object) + "]\n"
                   + "assert target.type == 'MESH'\n"
                   + "target.location.z += 0.005\n", encoding="utf-8")
    changed = execute("04-local-edit", "run", "--root", project, "--script", edit,
                      "--intent", "Move only " + args.edit_object + " by 0.005 along Blender Z; retain all other objects",
                      "--expected-revision", first["head"], "--expected-sequence", first["sequence"],
                      "--views", "hero,side", "--size", 192, "--samples", 4,
                      "--blender", args.blender, "--timeout", 240)
    verify_edit = execute("05-verify-edit", "verify", "--root", project)
    revised = json.loads(Path(changed["outputs"]["scene"]).read_text())
    restored = execute("06-restore", "restore", "--root", project, "--revision", first["head"],
                       "--expected-revision", changed["head"], "--expected-sequence", changed["sequence"])
    verified = execute("07-verify-restored", "verify", "--root", project)
    current = execute("08-restarted-status", "status", "--root", project)
    after = files(old)
    save(out / "legacy-after.json", after)
    old_objects = {x["name"]: x["fingerprint"] for x in original["objects"]}
    new_objects = {x["name"]: x["fingerprint"] for x in revised["objects"]}
    changed_objects = [name for name in old_objects if old_objects[name] != new_objects.get(name)]
    preserved = [name for name in old_objects if old_objects[name] == new_objects.get(name)]
    captured = first["migration"]["artifact"]["capturedPath"]
    reference = first["sources"][0]
    imported_manifest = json.loads(Path(first["inputs"]["import/legacy-project.json"]).read_text())
    pngs = [Path(x["path"]) for status in (first, changed) for x in status["observations"]]
    checks = {
        "archived_asset_bytes_preserved": sha(first["inputs"][captured]) == selected["sha256"],
        "project_manifest_bytes_preserved": sha(first["inputs"]["import/legacy-project.json"]) == sha(old / ".refas/project.json"),
        "checkpoint_manifest_bytes_preserved": sha(first["inputs"]["import/legacy-checkpoint.json"]) == sha(old / (".refas/checkpoints/" + args.checkpoint + ".json")),
        "source_bytes_preserved": sha(project / ".refas2" / reference["path"]) == state["source"]["sha256"],
        "legacy_project_unchanged": before == after,
        "source_provenance_retained": first["migration"]["reference"]["legacyAcquisition"] == state["source"].get("acquisition"),
        "legacy_certification_not_inherited": first["migration"]["certification"] == {"inherited": False, "status": "not-evaluated"},
        "all_assessments_unevaluated": all(s["referenceResemblance"] == "not-evaluated" and s["gameReadiness"] == "not-evaluated" for s in (first, changed, restored, current)),
        "mesh_count_preserved_by_edit": original["statistics"]["meshes"] == revised["statistics"]["meshes"],
        "only_selected_object_changed": changed_objects == [args.edit_object] and old_objects.keys() == new_objects.keys(),
        "real_requested_pngs": len(pngs) == 4 and all(p.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n" for p in pngs),
        "edited_revision_intact": verify_edit["ok"] is True,
        "original_revision_unchanged": first_bundle == bundle(first),
        "restore_exact_artifacts_and_inputs": first_bundle == bundle(restored),
        "restore_provenance_retained": json.loads((project / ".refas2/revisions" / restored["head"] / "revision.json").read_text())["migration"] == first["migration"],
        "restored_revision_intact": verified["ok"] is True,
        "restart_coherent": current["head"] == restored["head"] and current["sequence"] == restored["sequence"],
        "current_reference_evidence": verified["evidenceFreshness"]["status"] == "current",
    }
    report = {"ok": all(checks.values()), "scope": "selected-asset import/edit/restore with real installed CLI",
              "checks": checks, "version": version, "environment": environment,
              "oldFiles": len(before), "oldBytes": sum(x["bytes"] for x in before.values()),
              "legacyCheckpoint": args.checkpoint, "selectedArtifact": selected,
              "legacyCertification": imported_manifest.get("certification"),
              "sourceAcquisition": state["source"].get("acquisition"),
              "sceneStatistics": original["statistics"], "changedObjects": changed_objects,
              "preservedObjectCount": len(preserved), "restoredFileCount": len(first_bundle),
              "originalBundle": first_bundle, "commandCount": len(commands),
              "revisions": {"imported": first["head"], "edited": changed["head"], "restored": restored["head"]},
              "visualAcceptance": "not-evaluated"}
    save(out / "result.json", report)
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

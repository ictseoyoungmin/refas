#!/usr/bin/env python3
"""Reproduce the native production demo through the public CLI, using real Blender.

All subprocess logs and generated assets stay under a new --root directory.
The JSON evidence keeps original artifact hashes while normalizing workspace
paths for publication. No internal production Python functions are imported.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import time


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CLI = REPO / "skills/refas/scripts/produce.py"
FAILURE_SCRIPT = """import bpy
bpy.data.objects['HeadbandOuter'].location.x += 1
raise RuntimeError('Intentional fixture failure after an in-memory edit')
"""


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def actual_inventory(folder):
    return [{"path": path.relative_to(folder).as_posix(), "sha256": sha(path), "bytes": path.stat().st_size}
            for path in sorted(folder.rglob("*")) if path.is_file()]


def check_revision(root, revision_id):
    folder = root / ".refas2/revisions" / revision_id
    revision = read_json(folder / "revision.json")
    for name in ("artifacts", "inputs"):
        require(actual_inventory(folder / name) == revision[name], name + " differs from the recorded inventory")
    return folder, revision


def run_demo(args):
    root = Path(args.root).expanduser().resolve()
    if root.exists():
        raise FileExistsError("Choose a new --root; this harness never overwrites an existing directory")
    root.mkdir(parents=True)
    logs = root / "command-logs"
    logs.mkdir()
    steps = []
    source_paths = [CLI, REPO / "skills/refas/scripts/production/project.py",
                    REPO / "skills/refas/scripts/production/blender_worker.py", HERE / "create_headset.py",
                    HERE / "revise_headset.py", Path(__file__)]
    source_files = [{"path": path.relative_to(REPO).as_posix(), "sha256": sha(path),
                     "bytes": path.stat().st_size} for path in source_paths]

    def sanitize(value):
        if isinstance(value, dict):
            return {key: sanitize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        if isinstance(value, str):
            # In-repository demo paths become repository relative. An external
            # user-selected root is represented by the portable project marker.
            if root.is_relative_to(REPO):
                value = value.replace(str(REPO) + os.sep, "")
            else:
                value = value.replace(str(root), "<project-root>")
                value = value.replace(str(REPO) + os.sep, "")
            return value
        return value

    def invoke(name, *arguments, expected_code=0):
        command = [sys.executable, str(CLI), *map(str, arguments)]
        started = time.monotonic()
        process = subprocess.run(command, cwd=REPO, capture_output=True, text=True,
                                 env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, timeout=args.timeout + 30)
        elapsed = round(time.monotonic() - started, 3)
        prefix = f"{len(steps) + 1:02d}-{name}"
        (logs / (prefix + ".stdout.txt")).write_text(process.stdout, encoding="utf-8")
        (logs / (prefix + ".stderr.txt")).write_text(process.stderr, encoding="utf-8")
        require(process.returncode == expected_code,
                name + " returned " + str(process.returncode) + ": " + process.stderr[-2000:])
        payload = json.loads(process.stdout if expected_code == 0 else process.stderr)
        require(payload.get("ok") is (expected_code == 0), name + " reported an unexpected status")
        steps.append({"name": name, "argv": sanitize(command), "exitCode": process.returncode,
                      "elapsedSeconds": elapsed, "result": sanitize(payload)})
        return payload

    doctor = invoke("doctor", "doctor", "--blender", args.blender)
    initialized = invoke("init", "init", "--root", root, "--name", "Original headset production fixture")
    require(initialized["head"] is None and initialized["sequence"] == 0, "new project already has a head")
    # This retained integration harness verifies native/GLB round trips.
    render_arguments = ["--outputs", "delivery", "--blender", args.blender, "--views", "hero,side", "--size", args.size,
                        "--samples", args.samples, "--timeout", args.timeout]
    created = invoke("create", "run", "--root", root, "--script", HERE / "create_headset.py",
                     "--intent", "Create an original editable headset fixture", "--expected-revision", "none",
                     *render_arguments)
    before_id = created["head"]
    before_dir, before = check_revision(root, before_id)
    before_scene = read_json(before_dir / "artifacts/scene.json")
    revised = invoke("revise", "run", "--root", root, "--script", HERE / "revise_headset.py",
                     "--intent", "Widen only the headband comfort pad by 18 percent", "--expected-revision", before_id,
                     *render_arguments)
    after_id = revised["head"]
    after_dir, after = check_revision(root, after_id)
    after_scene = read_json(after_dir / "artifacts/scene.json")
    require(before_id != after_id and revised["sequence"] == 2, "revision was not published separately")
    a = {row["name"]: row["fingerprint"] for row in before_scene["objects"]}
    b = {row["name"]: row["fingerprint"] for row in after_scene["objects"]}
    require(a.keys() == b.keys(), "local revision added or removed parts")
    changed = sorted(name for name in a if a[name] != b[name])
    preserved = sorted(name for name in a if a[name] == b[name])
    require(changed == ["HeadbandComfortPad"], "local revision changed unexpected objects: " + str(changed))
    require(len(preserved) == 29, "expected 29 preserved parts")
    require(before_scene["bounds"] == after_scene["bounds"], "fixture bounds unexpectedly changed")
    before_views = {view["view"]: view for view in before["observations"]}
    after_views = {view["view"]: view for view in after["observations"]}
    require(before_views.keys() == after_views.keys() == {"hero", "side"}, "requested views missing")
    for view in ("hero", "side"):
        require(before_views[view]["camera"] == after_views[view]["camera"], "before/after camera changed: " + view)
    for folder, revision in ((before_dir, before), (after_dir, after)):
        require(revision["verification"]["native"]["fingerprintMatches"], "native reopen mismatch")
        glb = revision["verification"]["glb"]
        require(glb["status"] == "passed" and all(glb["checks"].values()), "GLB reimport check failed")
        require((folder / "artifacts/scene.blend").read_bytes()[:7] == b"BLENDER", "native file header missing")
        for view in revision["observations"]:
            image = folder / "artifacts" / view["path"]
            image_bytes = image.read_bytes()
            require(image_bytes[:8] == b"\x89PNG\r\n\x1a\n", "observation is not a PNG")
            require(struct.unpack(">II", image_bytes[16:24]) == (args.size, args.size), "render size mismatch")
            require(sha(image) == view["sha256"], "render differs from the original observation")
            require(view["registration"] == "unregistered", "fixture cannot claim camera registration")
    base_capture = next(item for item in after["inputs"] if item["path"] == "base.blend")
    before_blend = next(item for item in before["artifacts"] if item["path"] == "scene.blend")
    require(base_capture["sha256"] == before_blend["sha256"], "revision did not use the exact previous native file")
    state_sha = sha(root / ".refas2/project.json")
    failure_script = root / "intentional_failure.py"
    failure_script.write_text(FAILURE_SCRIPT, encoding="utf-8")
    failure = invoke("intentional-failure", "run", "--root", root, "--script", failure_script,
                     "--intent", "Exercise failed edit recovery without publishing a candidate",
                     "--expected-revision", after_id, *render_arguments, expected_code=1)
    failed_status = invoke("status-after-failure", "status", "--root", root)
    require(failed_status["head"] == after_id and failed_status["sequence"] == 2, "failed edit changed current revision")
    require(sha(root / ".refas2/project.json") == state_sha, "failed edit mutated project publication state")
    require(len(failed_status["incompleteRuns"]) == 1 and failed_status["incompleteRuns"][0]["status"] == "failed",
            "failed attempt was not retained separately")
    restored = invoke("restore", "restore", "--root", root, "--revision", before_id, "--expected-revision", after_id)
    restored_id = restored["head"]
    restored_dir, restored_revision = check_revision(root, restored_id)
    require(restored_id not in {before_id, after_id} and restored["sequence"] == 3, "restore did not publish a new revision")
    require(restored_revision["restoredFrom"] == before_id and restored_revision["parent"] == after_id,
            "restore lineage is incorrect")
    require(restored_revision["artifacts"] == before["artifacts"], "restored artifact inventory is not exact")
    require(restored_revision["inputs"] == before["inputs"], "restored captured-input inventory is not exact")
    check_revision(root, before_id)
    check_revision(root, after_id)
    verified = invoke("verify", "verify", "--root", root)
    require(verified["head"] == restored_id and verified["scope"] == "recorded-file-integrity", "verification scope mismatch")
    require(all(sha(path) == record["sha256"] for path, record in zip(source_paths, source_files)),
            "Source code changed while the demo ran; rerun with a stable source snapshot")
    evidence = {"schema": "refas.production.demo-evidence/v2", "ok": True,
                "recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "projectRoot": sanitize(str(root)), "environment": sanitize(doctor),
                "sourceFiles": source_files,
                "settings": {"views": ["hero", "side"], "size": args.size, "samples": args.samples},
                "steps": steps, "statistics": {"before": before_scene["statistics"], "after": after_scene["statistics"]},
                "assertions": {"onlyTargetPartChanged": True, "changedObjects": changed,
                               "preservedObjectCount": len(preserved), "preservedObjects": preserved,
                               "sameCameras": True, "nativeReopened": True, "glbReimported": True,
                               "exactBaseNativeCaptured": True, "failedEditKeptHead": True,
                               "failedEditKeptProjectState": True, "failedAttemptRetained": True,
                               "restoreArtifactInventoryExact": True, "restoreInputInventoryExact": True,
                               "earlierRevisionsUnchanged": True},
                "revisions": {"before": before, "after": after, "restored": restored_revision},
                "assessments": {"referenceResemblance": "not-evaluated-no-reference",
                                "visualQuality": "requires-human-review", "gameReadiness": "not-evaluated"},
                "limitations": before["warnings"]}
    evidence_path = root / "demo-evidence.json"
    write_json(evidence_path, sanitize(evidence))
    return {"ok": True, "evidence": str(evidence_path), "beforeRevision": before_id,
            "afterRevision": after_id, "restoredRevision": restored_id,
            "changedObjects": changed, "preservedObjectCount": len(preserved),
            "commandCount": len(steps), "blenderVersion": doctor["blender"]["version"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(HERE / "output/demo"))
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--timeout", type=float, default=180)
    try:
        print(json.dumps(run_demo(parser.parse_args()), indent=2))
        return 0
    except (OSError, ValueError, AssertionError, subprocess.SubprocessError) as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

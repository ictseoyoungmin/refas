#!/usr/bin/env python3
"""Exercise explicit input adoption through a separately installed public CLI.

This is a workflow/integrity demonstration, not a visual quality comparison.
Requires an existing native mesh asset, its reference/review and a local edit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--skill-root", required=True, type=Path)
    parser.add_argument("--input-blend", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--review-spec", required=True, type=Path)
    parser.add_argument("--manual-edit", required=True, type=Path)
    parser.add_argument("--intent", default="Apply the supplied local edit, preserve other parts, and refresh observations.")
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--initial-size", type=int, default=96)
    parser.add_argument("--updated-size", type=int, default=128)
    parser.add_argument("--samples", type=int, default=2)
    parser.add_argument("--timeout", type=int, default=240)
    args = parser.parse_args()
    root = args.root.resolve()
    if root.exists():
        raise ValueError("Choose a new demonstration directory: " + str(root))
    entry = args.skill_root.resolve() / "scripts/produce.py"
    native, reference = args.input_blend.resolve(), args.reference.resolve()
    for path in (entry, native, reference, args.review_spec, args.manual_edit):
        if not path.is_file():
            raise ValueError("Missing input: " + str(path))
    blender = shutil.which(args.blender)
    if not blender:
        raise ValueError("Blender is unavailable: " + args.blender)
    root.mkdir(parents=True)
    project, logs = root / "project", root / "commands"
    logs.mkdir()
    manual = root / "manual"
    manual.mkdir()
    original_native_sha = sha(native)
    reference_sha = sha(reference)
    commands = []

    def execute(label, command):
        started = time.time()
        result = subprocess.run([str(x) for x in command], capture_output=True, text=True,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                cwd=root, timeout=args.timeout + 30)
        (logs / (label + ".stdout")).write_text(result.stdout, encoding="utf-8")
        (logs / (label + ".stderr")).write_text(result.stderr, encoding="utf-8")
        commands.append({"label": label, "argv": [str(x) for x in command],
                         "startedUnix": started, "elapsedSeconds": round(time.time() - started, 3),
                         "returncode": result.returncode})
        save(root / "commands.json", commands)
        if result.returncode:
            raise RuntimeError(label + ": " + (result.stderr + result.stdout)[-3000:])
        return result.stdout

    def cli(label, operation, *options):
        return json.loads(execute(label, [sys.executable, "-B", entry, operation,
                                         "--root", project, *options]))

    def lease(state):
        return ["--expected-revision", state["head"] or "none", "--expected-sequence", state["sequence"]]

    def bundle(state):
        revision = project / ".refas2/revisions" / state["head"]
        return {str(p.relative_to(revision)): sha(p)
                for folder in ("artifacts", "inputs")
                for p in sorted((revision / folder).rglob("*")) if p.is_file()}

    def brief(state):
        return {key: state[key] for key in ("head", "sequence", "evidenceFreshness")}

    review_a = json.loads(args.review_spec.read_text(encoding="utf-8"))
    review_a["views"] = review_a["views"][:2]
    review_b = json.loads(json.dumps(review_a))
    review_b["background"] = [0.12, 0.14, 0.18]
    review_b["transparent"] = not review_a.get("transparent", False)
    save(root / "review-a.json", review_a)
    save(root / "review-b.json", review_b)
    (root / "import-a.py").write_text("# Import the original native asset without changing geometry.\n")
    (root / "import-b.py").write_text("# Adopt the separately saved local edit with refreshed review settings.\n")
    (root / "change-request.txt").write_text(args.intent + "\n", encoding="utf-8")

    initial = cli("01-init", "init", "--name", "reference-refresh", "--reference", reference)
    first = cli("02-run-a", "run", "--outputs", "delivery", "--script", root / "import-a.py", "--input-blend", native,
                "--intent", "Capture the original native asset and its current references",
                "--review-spec", root / "review-a.json", "--size", args.initial_size,
                "--samples", args.samples, "--blender", blender, "--timeout", args.timeout, *lease(initial))
    original_bundle = bundle(first)
    original_scene = json.loads(Path(first["outputs"]["scene"]).read_text())
    stale = cli("03-adopt-reference-set", "references", "--reference", reference,
                "--reference", root / "change-request.txt", *lease(first))
    stale_verified = cli("04-verify-stale", "verify")

    edit_copy = manual / "local-edit.py"
    shutil.copy2(args.manual_edit, edit_copy)
    manual_native = manual / "edited.blend"
    wrapper = manual / "save-as.py"
    wrapper.write_text("import bpy\n"
        + "bpy.ops.wm.open_mainfile(filepath=" + repr(first["outputs"]["blend"]) + ")\n"
        + "scope = {'__name__': '__main__', 'bpy': bpy, 'REFAS_OUTPUT_DIR': " + repr(str(manual)) + "}\n"
        + "exec(compile(open(" + repr(str(edit_copy)) + ", encoding='utf-8').read(), "
        + repr(str(edit_copy)) + ", 'exec'), scope)\n"
        + "bpy.ops.wm.save_as_mainfile(filepath=" + repr(str(manual_native)) + ")\n", encoding="utf-8")
    execute("05-manual-save-as", [blender, "-b", "--factory-startup", "--threads", "2",
                                  "--python-exit-code", "1", "--python", wrapper])
    adopted = cli("06-run-b", "run", "--outputs", "delivery", "--script", root / "import-b.py", "--input-blend", manual_native,
                  "--intent", args.intent, "--review-spec", root / "review-b.json",
                  "--size", args.updated_size, "--samples", args.samples + 1,
                  "--blender", blender, "--timeout", args.timeout, *lease(stale))
    adopted_verified = cli("07-verify-current", "verify")
    adopted_scene = json.loads(Path(adopted["outputs"]["scene"]).read_text())
    restored = cli("08-restore-a-under-b", "restore", "--revision", first["head"], *lease(adopted))
    restored_verified = cli("09-verify-restored", "verify")
    current = cli("10-readopt-reference-a", "references", "--reference", reference, *lease(restored))
    pointer = project / ".refas2/project.json"
    pointer_bytes = pointer.read_bytes()
    alias = root / "same-reference-different-name.bin"
    shutil.copy2(reference, alias)
    noop = cli("11-same-content-noop", "references", "--reference", alias,
               "--reference", reference, *lease(current))
    final = cli("12-restarted-status", "status")

    checks = {
        "initial_has_no_revision": initial["evidenceFreshness"]["status"] == "no-revision",
        "first_current": first["evidenceFreshness"]["status"] == "current",
        "reference_change_preserves_head": stale["head"] == first["head"],
        "reference_change_advances_sequence": stale["sequence"] == first["sequence"] + 1,
        "old_evidence_stale_but_intact": stale_verified["ok"] and stale_verified["evidenceFreshness"]["status"] == "stale",
        "manual_native_captured_exactly": sha(adopted["inputs"]["base.blend"]) == sha(manual_native),
        "manual_edit_changes_scene": original_scene["fingerprint"] != adopted_scene["fingerprint"],
        "new_script_captured": sha(adopted["inputs"]["edit.py"]) == sha(root / "import-b.py") != sha(first["inputs"]["edit.py"]),
        "new_review_captured": sha(adopted["inputs"]["review.json"]) == sha(root / "review-b.json") != sha(first["inputs"]["review.json"]),
        "render_settings_adopted": all(o["renderer"]["size"] == [args.updated_size, args.updated_size] and
                                       o["renderer"]["samples"] == args.samples + 1 for o in adopted["observations"]),
        "new_observations_bound_to_changed_scene": all(o["sourceSceneFingerprint"] == adopted_scene["fingerprint"]
                                                       for o in adopted["observations"]),
        "adopted_current_and_intact": adopted_verified["ok"] and adopted_verified["evidenceFreshness"]["status"] == "current",
        "old_bundle_unchanged": bundle(first) == original_bundle,
        "restore_exact": bundle(restored) == original_bundle,
        "restore_keeps_active_references": restored["sources"] == adopted["sources"],
        "restored_evidence_stale_but_intact": restored_verified["ok"] and restored_verified["evidenceFreshness"]["status"] == "stale",
        "readoption_current": current["evidenceFreshness"]["status"] == "current",
        "same_content_is_exact_noop": not noop["referencesChanged"] and pointer.read_bytes() == pointer_bytes,
        "restart_consistent": brief(final) == brief(current),
        "original_inputs_unchanged": sha(native) == original_native_sha and sha(reference) == reference_sha,
        "historical_sources_retained": all(sha(project / ".refas2" / s["path"]) == s["sha256"]
                                           for s in first["sources"] + adopted["sources"]),
        "no_visual_approval_inherited": all(s["evidenceFreshness"]["visualAcceptance"] == "not-evaluated"
                                            for s in (first, stale, adopted, restored, current, final)),
    }
    report = {"ok": all(checks.values()), "scope": "explicit-adoption-and-recorded-integrity",
              "checks": checks, "restoredFileCount": len(original_bundle),
              "stages": {k: brief(v) for k, v in (("initial", initial), ("first", first), ("stale", stale),
                         ("adopted", adopted), ("restored", restored), ("readopted", current), ("final", final))},
              "inputs": {"nativeSha256": original_native_sha, "referenceSha256": reference_sha,
                         "manualEditSha256": sha(edit_copy), "manualNativeSha256": sha(manual_native)},
              "sceneFingerprints": {"before": original_scene["fingerprint"], "after": adopted_scene["fingerprint"]},
              "originalBundle": original_bundle, "commandCount": len(commands),
              "visualAcceptance": "not-evaluated"}
    save(root / "result.json", report)
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

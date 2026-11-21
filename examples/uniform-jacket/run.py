#!/usr/bin/env python3
"""Replay the informed jacket example; this is not a fresh comparative trial."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CLI = REPO / "skills/refas/scripts/produce.py"


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--size", type=int, default=384)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--blender", default="blender")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=False)
    (root / "logs").mkdir()
    steps = []

    def invoke(name, *arguments):
        command = [sys.executable, str(CLI), *map(str, arguments)]
        p = subprocess.run(command, capture_output=True, text=True, timeout=240,
                           env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        (root / "logs" / (name + ".stdout.json")).write_text(p.stdout)
        (root / "logs" / (name + ".stderr.txt")).write_text(p.stderr)
        if p.returncode:
            raise RuntimeError(name + ": " + p.stderr[-2000:])
        result = json.loads(p.stdout)
        if not result.get("ok"):
            raise RuntimeError(name + " did not report success")
        steps.append({"name": name, "head": result.get("head"),
                      "elapsedSeconds": result.get("elapsedSeconds")})
        return result

    def revision(head):
        folder = root / ".refas2/revisions" / head
        return folder, read(folder / "revision.json")

    invoke("doctor", "doctor", "--blender", args.blender)
    invoke("init", "init", "--root", root, "--name", "Uniform jacket reference example",
           "--reference", HERE / "source/reference.png")
    head = "none"
    states = {}
    for name, intent in [
        ("create", "Build the reference jacket's complete initial prototype"),
        ("correct", "Refine the sleeve caps and expose the left shield"),
        ("join_armholes", "Join shared body/sleeve boundaries and seat shoulder tabs"),
        ("edit_cuff", "Increase only the left cuff band from six to seven centimetres"),
    ]:
        state = invoke(name, "run", "--root", root, "--script", HERE / (name + ".py"),
            "--intent", intent, "--expected-revision", head, "--blender", args.blender,
            "--review-spec", HERE / "review.json", "--views", "front,front-three-quarter,back",
            "--size", args.size, "--samples", args.samples, "--timeout", 180)
        head = state["head"]
        states[name] = head
    selected_folder, selected = revision(states["join_armholes"])
    edited_folder, edited = revision(states["edit_cuff"])
    before = read(selected_folder / "artifacts/scene.json")
    after = read(edited_folder / "artifacts/scene.json")
    old = {o["name"]: o["fingerprint"] for o in before["objects"]}
    new = {o["name"]: o["fingerprint"] for o in after["objects"]}
    changed = sorted(name for name in old if old[name] != new[name])
    assert old.keys() == new.keys() and changed and all(n.startswith("L_Cuff_") for n in changed)
    assert all((a["camera"], a["lighting"], a["renderer"]) ==
               (b["camera"], b["lighting"], b["renderer"])
               for a, b in zip(selected["observations"], edited["observations"]))
    restored = invoke("restore", "restore", "--root", root, "--revision", states["join_armholes"],
                      "--expected-revision", states["edit_cuff"])
    restored_folder, recovered = revision(restored["head"])
    for area in ("artifacts", "inputs"):
        assert selected[area] == recovered[area]
        for item in selected[area]:
            assert sha(restored_folder / area / item["path"]) == item["sha256"]
    invoke("verify", "verify", "--root", root)
    evidence = {"scope": "Informed reproduction of the example; not a new blind comparison",
        "sourceSha256": sha(HERE / "source/reference.png"), "steps": steps,
        "revisions": states, "restoredHead": restored["head"],
        "changedCuffObjects": changed, "protectedObjects": len(old) - len(changed),
        "exactRestore": True,
        "cuffChecks": read(edited_folder / "artifacts/cuff-edit-checks.json"),
        "sourceFiles": [{"path": str(p.relative_to(REPO)), "sha256": sha(p)}
                        for p in sorted(HERE.glob("*.py"))]}
    (root / "reproduction.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"ok": True, "root": str(root), "head": restored["head"],
                      "protectedObjects": evidence["protectedObjects"], "exactRestore": True}))


if __name__ == "__main__":
    main()

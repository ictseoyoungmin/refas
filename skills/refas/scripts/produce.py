#!/usr/bin/env python3
"""RefAs 2.0 development production entry; JSON on stdout, errors on stderr."""
import argparse
import json
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
from production.project import ProductionError, initialize, run_edit, status, verify_project, restore


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest="command", required=True)
    doctor = commands.add_parser("doctor", help="Inspect the actual Blender executable")
    doctor.add_argument("--blender", default="blender")
    init = commands.add_parser("init", help="Create a separate production project and copy references")
    init.add_argument("--root", required=True)
    init.add_argument("--name", required=True)
    init.add_argument("--reference", action="append", default=[])
    run = commands.add_parser("run", help="Apply a Python modeling script to a copy of the current native asset")
    run.add_argument("--root", required=True)
    run.add_argument("--script", required=True)
    run.add_argument("--intent", required=True)
    run.add_argument("--input-blend", help="Explicitly import a separately saved manual edit")
    run.add_argument("--blender", default="blender")
    run.add_argument("--views", default="hero,side", help="Comma-separated hero,front(-Y),back(+Y),side(+X),top(+Z); bbox-framed, empty skips previews")
    run.add_argument("--size", type=int, default=384)
    run.add_argument("--samples", type=int, default=8)
    run.add_argument("--timeout", type=float, default=180)
    run.add_argument("--expected-revision", help="Reject stale edits; use none for a new project")
    for name in ("status", "verify"):
        sub = commands.add_parser(name)
        sub.add_argument("--root", required=True)
    revert = commands.add_parser("restore", help="Publish an exact previous bundle as a new revision")
    revert.add_argument("--root", required=True)
    revert.add_argument("--revision", required=True)
    revert.add_argument("--expected-revision")
    return p


def main():
    args = parser().parse_args()
    try:
        if args.command == "doctor":
            executable = shutil.which(args.blender)
            if not executable:
                raise ProductionError("Blender executable is unavailable: " + args.blender)
            result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=15, check=True)
            output = {"ok": True, "entry": "RefAs 2.0 production development", "python": sys.version.split()[0],
                      "blender": {"path": executable, "version": result.stdout.splitlines()[0]},
                      "scope": "executable probe; render device availability is checked during execution"}
        elif args.command == "init":
            output = initialize(args.root, args.name, args.reference)
        elif args.command == "run":
            output = run_edit(args.root, args.script, args.intent, args.blender, args.input_blend,
                              [view.strip() for view in args.views.split(",") if view.strip()],
                              args.size, args.samples, args.timeout, args.expected_revision)
        elif args.command == "status":
            output = status(args.root)
        elif args.command == "verify":
            output = verify_project(args.root)
        else:
            output = restore(args.root, args.revision, args.expected_revision)
        print(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (ProductionError, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

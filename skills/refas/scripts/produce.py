#!/usr/bin/env python3
"""RefAs 2.0 development production entry; JSON on stdout, errors on stderr."""
import argparse
import json
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
from production import VERSION
from production.project import (ProductionError, initialize, replace_references, run_edit, status,
                                verify_project, restore, deliver, inspect_native, export_preflight,
                                storage_stats, compact)


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--version", action="version", version="RefAs " + VERSION)
    commands = p.add_subparsers(dest="command", required=True)
    doctor = commands.add_parser("doctor", help="Inspect the actual Blender executable")
    doctor.add_argument("--blender", default="blender")
    doctor.add_argument("--check-export", action="store_true", help="Probe exporter options and skin-weight preservation before authoring")
    init = commands.add_parser("init", help="Create a separate production project and copy references")
    init.add_argument("--root", required=True)
    init.add_argument("--name", required=True)
    init.add_argument("--reference", action="append", default=[])
    references = commands.add_parser("references", help="Replace active reference files while retaining model history")
    references.add_argument("--root", required=True)
    selection = references.add_mutually_exclusive_group(required=True)
    selection.add_argument("--reference", action="append", help="Copy a reference file; repeat for the complete set")
    selection.add_argument("--clear", action="store_true", help="Explicitly adopt an empty reference set")
    references.add_argument("--expected-revision", help="Also require the current model revision; use none before the first run")
    references.add_argument("--expected-sequence", type=int, required=True, help="Require the sequence returned by status")
    run = commands.add_parser("run", help="Apply a Python modeling script to a copy of the current native asset")
    run.add_argument("--root", required=True)
    run.add_argument("--script", required=True)
    run.add_argument("--intent", required=True)
    run.add_argument("--input-blend", help="Explicitly import a separately saved manual edit")
    run.add_argument("--blender", default="blender")
    run.add_argument("--views", help="Comma-separated views; native defaults to hero, delivery to hero,side, or all supplied review views; empty skips previews")
    run.add_argument("--review-spec", help="Capture fixed orthographic cameras and lighting from a review JSON file")
    run.add_argument("--size", type=int, default=384)
    run.add_argument("--samples", type=int, default=8)
    run.add_argument("--timeout", type=float, default=180)
    run.add_argument("--expected-revision", help="Reject stale edits; use none for a new project")
    run.add_argument("--expected-sequence", type=int, help="Also reject a changed reference set or project sequence")
    run.add_argument("--outputs", choices=("native", "delivery"), default="native",
                     help="Default native saves/reopens and previews; delivery also exports and reimports GLB")
    run.add_argument("--protect-object", action="append", default=[], help="Require this exact existing object's recorded state/materials to remain unchanged; repeat as needed")
    run.add_argument("--keep-diagnostics", action="store_true", help="Keep successful raw job/log files in addition to revision metadata")
    delivery = commands.add_parser("deliver", help="Prepare GLB and requested views from the current native without an edit script")
    delivery.add_argument("--root", required=True)
    delivery.add_argument("--blender", default="blender")
    delivery.add_argument("--views", help="Comma-separated views; default hero,side or all supplied review views")
    delivery.add_argument("--review-spec")
    delivery.add_argument("--size", type=int, default=384)
    delivery.add_argument("--samples", type=int, default=8)
    delivery.add_argument("--timeout", type=float, default=180)
    delivery.add_argument("--expected-revision")
    delivery.add_argument("--expected-sequence", type=int)
    delivery.add_argument("--keep-diagnostics", action="store_true")
    inspect = commands.add_parser("inspect", help="Read native object/pose facts without creating a revision, render or export")
    inspect_source = inspect.add_mutually_exclusive_group(required=True)
    inspect_source.add_argument("--root", help="Inspect the selected managed project revision")
    inspect_source.add_argument("--input-blend", help="Read a standalone native directly without creating a project or copying the model")
    inspect.add_argument("--object", action="append", default=[], help="Exact object name; repeat to select parts, omit for the scene")
    inspect.add_argument("--frame", type=int, action="append", default=[], help="Frame to sample; repeat as needed, omit for the saved frame")
    inspect.add_argument("--topology", action="store_true", help="Include complete topology counts without location samples")
    inspect.add_argument("--topology-details", action="store_true", help="Include bounded topology detail samples (implies --topology)")
    inspect.add_argument("--blender", default="blender")
    inspect.add_argument("--timeout", type=float, default=180)
    inspect.add_argument("--expected-revision")
    inspect.add_argument("--expected-sequence", type=int)
    legacy = commands.add_parser("import-v1", help="Import one explicitly selected archived 1.x asset into a new production project")
    for name in ("root", "source-project", "checkpoint", "artifact", "name"):
        legacy.add_argument("--" + name, required=True)
    legacy.add_argument("--blender", default="blender")
    legacy.add_argument("--views", help="Comma-separated views; default hero,side, or all supplied review views")
    legacy.add_argument("--review-spec")
    legacy.add_argument("--size", type=int, default=384)
    legacy.add_argument("--samples", type=int, default=8)
    legacy.add_argument("--timeout", type=float, default=180)
    for name in ("status", "verify"):
        sub = commands.add_parser(name)
        sub.add_argument("--root", required=True)
    storage = commands.add_parser("storage", help="Summarize workspace file counts and bytes")
    storage.add_argument("--root", required=True)
    cleanup = commands.add_parser("compact", help="Preview redundant committed run copies; checkpoints and failed runs stay")
    cleanup.add_argument("--root", required=True)
    cleanup.add_argument("--apply", action="store_true", help="Remove only byte-verified redundant run payloads")
    cleanup.add_argument("--expected-sequence", type=int)
    revert = commands.add_parser("restore", help="Publish an exact previous bundle as a new revision")
    revert.add_argument("--root", required=True)
    revert.add_argument("--revision", required=True)
    revert.add_argument("--expected-revision")
    revert.add_argument("--expected-sequence", type=int)
    return p


def main():
    args = parser().parse_args()
    try:
        if args.command == "doctor":
            executable = shutil.which(args.blender)
            if not executable:
                raise ProductionError("Blender executable is unavailable: " + args.blender)
            result = subprocess.run([executable, "--version"], capture_output=True, text=True, timeout=15, check=True)
            output = {"ok": True, "entry": "RefAs production", "version": VERSION, "python": sys.version.split()[0],
                      "blender": {"path": executable, "version": result.stdout.splitlines()[0]},
                      "scope": "executable probe; render device availability is checked during execution"}
            if args.check_export:
                output["exportCompatibility"] = export_preflight(executable)
        elif args.command == "init":
            output = initialize(args.root, args.name, args.reference)
        elif args.command == "references":
            output = replace_references(args.root, args.reference, args.clear,
                                        args.expected_revision, args.expected_sequence)
        elif args.command == "run":
            output = run_edit(args.root, args.script, args.intent, args.blender, args.input_blend,
                              [view.strip() for view in args.views.split(",") if view.strip()] if args.views is not None else None,
                              args.size, args.samples, args.timeout, args.expected_revision, review_spec=args.review_spec,
                              expected_sequence=args.expected_sequence, output_profile=args.outputs,
                              protected_objects=args.protect_object, keep_diagnostics=args.keep_diagnostics)
        elif args.command == "deliver":
            output = deliver(args.root, blender=args.blender,
                             views=[view.strip() for view in args.views.split(",") if view.strip()] if args.views is not None else None,
                             size=args.size, samples=args.samples, timeout=args.timeout,
                             expected_revision=args.expected_revision, expected_sequence=args.expected_sequence,
                             review_spec=args.review_spec, keep_diagnostics=args.keep_diagnostics)
        elif args.command == "inspect":
            output = inspect_native(args.root, objects=args.object, frames=args.frame, topology=args.topology,
                                    blender=args.blender, timeout=args.timeout,
                                    expected_revision=args.expected_revision, expected_sequence=args.expected_sequence,
                                    input_blend=args.input_blend, topology_details=args.topology_details)
        elif args.command == "import-v1":
            from production.asset_import import import_v1
            output = import_v1(args.root, args.source_project, args.checkpoint, args.artifact, args.name,
                               blender=args.blender,
                               views=[view.strip() for view in args.views.split(",") if view.strip()] if args.views is not None else None,
                               size=args.size, samples=args.samples, timeout=args.timeout, review_spec=args.review_spec)
        elif args.command == "status":
            output = status(args.root)
        elif args.command == "verify":
            output = verify_project(args.root)
        elif args.command == "storage":
            output = storage_stats(args.root)
        elif args.command == "compact":
            output = compact(args.root, apply=args.apply, expected_sequence=args.expected_sequence)
        else:
            output = restore(args.root, args.revision, args.expected_revision, args.expected_sequence)
        print(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (ProductionError, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

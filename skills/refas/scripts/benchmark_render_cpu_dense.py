#!/usr/bin/env python3
"""R14-05 opt-in dense CPU diagnostic benchmark (no certification claims).

Measure the existing shared-visibility Hero backend with real nondegenerate GLB
triangles, independent subprocesses and Linux peak RSS where available.
Comparison against the portable renderer requires a *separate* R14-00 run:
the backends currently produce different passes and are not certified peers.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import statistics
import sys
import tempfile

import numpy as np

from benchmark_render_cpu import bounded, create_fixture, measured_child, sha256


def main():
    p = argparse.ArgumentParser(description="R14-05 bounded dense-Hero diagnostic measurement")
    p.add_argument("--glb", help="Optional existing source GLB")
    p.add_argument("--frame", help="Source-registered canonical frame for --glb")
    p.add_argument("--case", choices=("strands", "organic", "hard-surface"), default="strands")
    p.add_argument("--triangles", type=int, default=10000)
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--size", type=int, default=96)
    p.add_argument("--tile-size", type=int, choices=(16, 32, 64), default=32)
    p.add_argument("--threads", type=int, choices=(1, 2, 4, 8), default=1)
    p.add_argument("--max-working-mb", type=int, default=1024)
    p.add_argument("--timeout-seconds", type=float, default=180)
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--out", required=True, help="Fresh measurement-only JSON report")
    p.add_argument("--save-fixture", help="Retain generated GLB/frame for comparable replay")
    a = p.parse_args()
    bounded(a.triangles, "--triangles", 2, 1000000)
    bounded(a.size, "--size", 32, 1024)
    bounded(a.max_working_mb, "--max-working-mb", 256, 2048)
    bounded(a.repeats, "--repeats", 1, 20)
    bounded(a.timeout_seconds, "--timeout-seconds", 1, 3600)
    if bool(a.glb) != bool(a.frame):
        p.error("--glb and --frame must be supplied together")
    output = Path(a.out).resolve()
    if output.exists():
        p.error("--out must be a fresh file (no measurement overwrites)")
    temporary = Path(tempfile.mkdtemp(prefix="refas-r14-05-dense-"))
    try:
        generated = None
        if a.glb:
            glb, frame = Path(a.glb).resolve(), Path(a.frame).resolve()
        else:
            fixture_root = Path(a.save_fixture).resolve() if a.save_fixture else temporary / "fixture"
            fixture_root.mkdir(parents=True, exist_ok=True)
            glb, frame = fixture_root / "benchmark.glb", fixture_root / "frame.json"
            if glb.exists() or frame.exists():
                p.error("--save-fixture directory already contains the benchmark output")
            generated = create_fixture(glb, frame, a.case, a.triangles, a.seed)
        runs = []
        worker = Path(__file__).with_name("render_cpu_visibility.py")
        for idx in range(a.repeats):
            run_dir = temporary / ("output-" + str(idx))
            command = [sys.executable, str(worker),
                       "--glb", str(glb), "--frame", str(frame),
                       "--out", str(run_dir),
                       "--size", str(a.size), "--tile-size", str(a.tile_size),
                       "--threads", str(a.threads),
                       "--max-working-mb", str(a.max_working_mb),
                       "--timeout-seconds", str(int(a.timeout_seconds))]
            measured = measured_child(command, a.timeout_seconds + 5)
            if measured["exitCode"] == 0 and measured.get("output", {}).get("status") == "PASS":
                report_path = run_dir / "render-report.json"
                if report_path.is_file():
                    report = json.loads(report_path.read_text(encoding="utf8"))
                    if (report.get("claimScope") == "diagnostic-only" and
                            report.get("certificationEligible") is False and
                            report.get("sourceGlbSha256") == sha256(glb) and
                            report.get("frameFileSha256") == sha256(frame)):
                        measured["status"] = "COMPLETE"
                        measured["stderrExcerpt"] = ""
                        measured["kernelStats"] = report.get("stats")
                        measured["pngDigests"] = {x["pass"]: x["sha256"]
                                                  for x in report["outputs"]}
                    else:
                        measured["status"] = "FAILED_BACKEND"
                        measured["stderrExcerpt"] = "diagnostic report identity mismatch"
            measured.pop("output", None)
            runs.append(measured)
        good = [r for r in runs if r["status"] == "COMPLETE"]
        ms = [r["wallMs"] for r in good]
        report = {
            "schema": "refas.cpu-dense-benchmark/v1",
            "claimScope": "measurement-only",
            "backend": "RefAs Visibility CPU/0.1.0-prototype",
            "fixture": generated,
            "asset": {"sha256": sha256(glb), "bytes": glb.stat().st_size},
            "frame": {"sha256": sha256(frame)},
            "configuration": {"case": a.case if generated else "provided-GLB",
                              "size": a.size, "tileSize": a.tile_size,
                              "threads": a.threads, "maxWorkingMiB": a.max_working_mb,
                              "timeoutSeconds": a.timeout_seconds, "repeats": a.repeats,
                              "cacheEnabled": False, "view": "hero"},
            "environment": {"python": platform.python_version(), "numpy": np.__version__,
                            "platform": platform.platform(), "machine": platform.machine(),
                            "logicalCpus": os.cpu_count()},
            "runs": runs,
            "summary": {"allComplete": len(good) == a.repeats,
                        "completed": len(good),
                        "medianWallMs": statistics.median(ms) if ms else None,
                        "minWallMs": min(ms) if ms else None,
                        "maxWallMs": max(ms) if ms else None},
            "limitations": ["Independent subprocess for every repeat: Numba JIT is cold on every run.",
                            "Hero-only opaque diagnostics; no certified eight-view or PBR.",
                            "No proxy, decimation or generated-to-source resemblance claim.",
                            "Portable v1.3.0 baseline uses different passes; do not assert equal-quality speedup."],
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf8")
        print(json.dumps({"status": "COMPLETE" if len(good) == a.repeats else "INCOMPLETE",
                          "out": str(output), "completed": len(good), "repeats": a.repeats,
                          "medianWallMs": report["summary"]["medianWallMs"]}))
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    main()

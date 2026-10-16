"""R14-05D opt-in same-process warm CPU benchmark small-scale contract smoke."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from render_cpu_tiled import njit, numba_config


@unittest.skipUnless(njit is not None, "optional Numba not installed")
class WarmCpuMatrixTests(unittest.TestCase):
    def test_same_host_warm_parity_and_source_sha(self):
        runner = Path(__file__).resolve().parents[1] / (
            "skills/refas/scripts/benchmark_render_cpu_warm.py")
        workers = (1, 2) if numba_config.NUMBA_NUM_THREADS >= 2 else (1,)
        with tempfile.TemporaryDirectory(prefix="refas-warm-matrix-") as tmp:
            out = Path(tmp) / "warm.json"
            proc = subprocess.run([
                sys.executable, str(runner),
                "--triangles", "120,360", "--matrix-count", "360",
                "--case", "strands", "--size", "48",
                "--baseline-threads", "1", "--baseline-tile", "32",
                "--thread-matrix", ",".join(str(n) for n in workers),
                "--tile-matrix", "16,32", "--repeats", "1",
                "--max-working-mb", "512", "--out", str(out)],
                text=True, capture_output=True, timeout=150)
            self.assertEqual(proc.returncode, 0, proc.stderr[-4000:])
            report = json.loads(out.read_text(encoding="utf8"))
            self.assertEqual(report["schema"], "refas.cpu-warm-same-host-benchmark/v1")
            self.assertEqual(report["claimScope"], "measurement-only")
            self.assertIs(report["certificationEligible"], False)
            self.assertEqual(report["backend"], "RefAs Visibility CPU/0.2.0-microtriangle")
            self.assertEqual(report["status"], "COMPLETE")
            self.assertEqual([t["sourceTriangles"] for t in report["tiers"]], [120, 360])
            self.assertEqual(len(report["tiers"][1]["matrix"]), 2*len(workers)-1)
            self.assertGreater(report["jitWarmup"]["wallMs"], 0)
            for tier in report["tiers"]:
                self.assertEqual(tier["parity"], "EXACT")
                self.assertEqual(tier["geometry"]["triangles"], tier["sourceTriangles"])
                self.assertEqual(len(tier["assetGlbSha256"]), 64)
                self.assertEqual(len(tier["frameSha256"]), 64)
                self.assertEqual(len(tier["referenceDigests"]), 5)
                self.assertEqual(tier["baseline"]["samples"][0]["digests"],
                                 tier["referenceDigests"])
                self.assertGreater(tier["baseline"]["samples"][0]["counts"]["preparedTriangles"], 0)
                for row in tier["matrix"]:
                    for sample in row["samples"]:
                        self.assertEqual(sample["digests"], tier["referenceDigests"])

    def test_invalid_tier_is_refused_without_output(self):
        runner = Path(__file__).resolve().parents[1] / (
            "skills/refas/scripts/benchmark_render_cpu_warm.py")
        with tempfile.TemporaryDirectory(prefix="refas-warm-refuse-") as tmp:
            out = Path(tmp) / "invalid.json"
            proc = subprocess.run([sys.executable, str(runner),
                "--triangles", "120,120", "--matrix-count", "120",
                "--out", str(out)], text=True, capture_output=True, timeout=15)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("duplicate", proc.stderr)
            self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()

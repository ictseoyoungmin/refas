"""R14-06D: actual indexed GLB + PNG stress SHA/timing contract smoke.

Heavy 901,664-triangle private Monster Bed is NOT part of default CI.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from benchmark_pbr_v2_full import run, sha
from create_pbr_v2_texture_benchmark_fixture import make_fixture
from render_pbr_v2_visibility import njit, numba_config


@unittest.skipUnless(njit is not None,"optional Numba runtime unavailable")
class FullSourcePerformanceContractTests(unittest.TestCase):
    def test_real_textured_glb_outputs_repeat_parity_and_source_identity(self):
        with tempfile.TemporaryDirectory(prefix="refas-r14-06d-") as tmp:
            root=Path(tmp)
            source=root/"texture.glb"; frame=root/"frame.json"
            info=make_fixture(source,frame,256,120,137,9987)
            out=root/"results"
            report=run(source,frame,out,[48],1,16,1,[(1,32)],
                       info["glbSha256"],512)
            self.assertEqual(report["schema"],"refas.pbr-v2-full-source-benchmark/v1")
            self.assertEqual(report["asset"]["sourceTriangles"],120)
            self.assertEqual(report["asset"]["glbSha256"],info["glbSha256"])
            self.assertEqual(report["asset"]["frameFileSha256"],info["frameFileSha256"])
            self.assertEqual(report["cameraAuthority"],"UNREGISTERED-DIAGNOSTIC")
            self.assertEqual(report["claimScope"],"material-preview-only")
            self.assertIs(report["certificationEligible"],False)
            self.assertEqual(len(report["views"]),1)
            view=report["views"][0]
            self.assertEqual(view["parity"],"EXACT_PIXEL_AND_VISIBILITY_SHA")
            self.assertEqual(len(view["warm"]),1)
            self.assertEqual(len(view["tileThreadAlternates"]),1)
            self.assertGreater(view["coldFirst"]["textureSampledPixels"],0)
            self.assertEqual(view["coldFirst"]["geometry"]["inputTriangles"],120)
            self.assertEqual(len(view["coldFirst"]["passes"]),4)
            self.assertGreater(view["warmMedianMs"],0)
            self.assertEqual(view["coldFirst"]["passes"],view["warm"][0]["passes"])
            self.assertEqual(view["coldFirst"]["visibilityDigests"],
                             view["tileThreadAlternates"][0]["sample"]["visibilityDigests"])
            for mode,meta in view["coldFirst"]["passes"].items():
                self.assertEqual(sha((out/f"48-{mode}.png").read_bytes()),
                                 meta["pngSha256"])
                self.assertEqual(len(meta["pixelSha256"]),64)
            self.assertFalse((out/"texture.glb").exists())
            with self.assertRaisesRegex(ValueError,"PBR_V2_INVALID_OUTPUT"):
                run(source,frame,out,[48],1,16,1,[],info["glbSha256"],512)

    def test_expected_asset_sha_refusal_leaves_no_report(self):
        with tempfile.TemporaryDirectory(prefix="refas-r14-06d-sha-") as tmp:
            root=Path(tmp);source=root/"texture.glb";frame=root/"frame.json"
            make_fixture(source,frame,256,120,47,9984)
            out=root/"unpublished"
            with self.assertRaisesRegex(ValueError,"PBR_V2_INVALID_ASSET"):
                run(source,frame,out,[48],1,16,1,[],"0"*64,512)
            self.assertFalse(out.exists())


if __name__=="__main__":
    unittest.main()

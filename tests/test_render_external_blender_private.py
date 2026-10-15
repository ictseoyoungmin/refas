"""R14-06E2 private-source SHA/memory/typed refusal without Blender dependency."""
from __future__ import annotations
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from create_blender_color0_texture_fixture import generate
from qa_external_blender_private import run,tree_rss_kib


class PrivateCyclesQaContract(unittest.TestCase):
    def setup(self, folder):
        root=Path(folder);glb=root/"glb.glb";frame=root/"camera.json"
        source=generate(glb,frame,side=256,triangles=120)
        return glb,frame,source

    def test_source_sha_fail_closed_before_binary_or_publication(self):
        with tempfile.TemporaryDirectory() as d:
            glb,frame,source=self.setup(d)
            dest=Path(d)/"missing"
            with self.assertRaisesRegex(ValueError,"R14E2_SOURCE_MISMATCH"):
                run(glb,frame,dest,
                    expected_sha="0"*64,
                    expected_frame_sha=source["frameFileSha256"],
                    expected_triangles=120,
                    sizes=(160,),
                    blender="no-such-blender-0001",
                    rss_cap_mib=512,source_kind="SYNTHETIC_TEST")
            self.assertFalse(dest.exists())

    def test_absent_backend_fails_without_making_false_report(self):
        with tempfile.TemporaryDirectory() as d:
            glb,frame,source=self.setup(d)
            dest=Path(d)/"output"
            with self.assertRaisesRegex(RuntimeError,"R14E2_BACKEND_UNAVAILABLE"):
                run(glb,frame,dest,
                    expected_sha=source["glbSha256"],
                    expected_frame_sha=source["frameFileSha256"],
                    expected_triangles=120,
                    sizes=(160,),
                    blender="no-such-blender-0001",
                    rss_cap_mib=512,source_kind="SYNTHETIC_TEST")
            self.assertFalse(dest.exists())

    def test_ambiguous_evidence_class_and_overwrite_refusal(self):
        with tempfile.TemporaryDirectory() as d:
            glb,frame,source=self.setup(d)
            out=Path(d)/"out"
            with self.assertRaisesRegex(ValueError,"R14E2_INVALID_CONFIG"):
                run(glb,frame,out,
                    expected_sha=source["glbSha256"],
                    expected_frame_sha=source["frameFileSha256"],
                    expected_triangles=120,
                    source_kind="WRONGLY_CERTIFIED",sizes=(160,),rss_cap_mib=512)
            out.mkdir()
            with self.assertRaisesRegex(ValueError,"R14E2_INVALID_OUTPUT"):
                run(glb,frame,out,
                    expected_sha=source["glbSha256"],
                    expected_frame_sha=source["frameFileSha256"],
                    expected_triangles=120,
                    source_kind="SYNTHETIC_TEST",sizes=(160,),rss_cap_mib=512)

    def test_linux_proc_sample_never_negative(self):
        self.assertGreaterEqual(tree_rss_kib(__import__("os").getpid()),0)


if __name__=="__main__":
    unittest.main()

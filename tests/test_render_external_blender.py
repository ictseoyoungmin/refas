"""R14-06E1 host-side Blender glTF/PBR trust boundary regressions.

Real blender execution is opt-in and not part of ordinary PR CI.
"""
from __future__ import annotations
import hashlib
import os
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from create_blender_color0_texture_fixture import generate
from create_blender_no_color_control import make_control
from render_external_blender import preflight,run
from render_external_blender_guard import run_guarded


class BlenderAdapterPreflightTests(unittest.TestCase):
    def test_original_source_feature_inventory_and_camera_bind(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); glb=root/"f.glb";frame=root/"hero.json"
            expected=generate(glb,frame,side=256,triangles=120)
            observed=preflight(glb,frame,160)
            self.assertEqual(observed["sourceTriangles"],120)
            self.assertEqual(observed["sourceGlbSha256"],expected["glbSha256"])
            self.assertEqual(observed["frameFileSha256"],expected["frameFileSha256"])
            self.assertTrue(observed["sourceUsesColor0"])
            self.assertEqual(observed["sourcePrimitiveCount"],1)
            self.assertEqual(observed["camera"]["registration"],
                             "UNREGISTERED-NONAUTHORITATIVE")

    def test_color0_counterfactual_preserves_geometry_and_texture(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);glb=root/"with_color.glb"
            frame=root/"frame.json"; control=root/"control.glb"
            generate(glb,frame,side=256,triangles=120)
            record=make_control(glb,control)
            a=preflight(glb,frame,160)
            b=preflight(control,frame,160)
            self.assertEqual(a["sourceTriangles"],b["sourceTriangles"])
            self.assertEqual(a["sourcePrimitiveCount"],b["sourcePrimitiveCount"])
            self.assertTrue(a["sourceUsesColor0"])
            self.assertFalse(b["sourceUsesColor0"])
            self.assertEqual(record["removedColorAttributes"],1)
            self.assertNotEqual(a["sourceGlbSha256"],b["sourceGlbSha256"])

    def test_missing_backend_has_typed_error_no_false_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);glb=root/"f.glb";frame=root/"hero.json"
            generate(glb,frame,side=256,triangles=120)
            target=root/"should-not-exist"
            with self.assertRaisesRegex(RuntimeError,"R14E_BACKEND_UNAVAILABLE"):
                run(glb,frame,target,blender="definitely-no-blender-install",
                    size=160,threads=1,samples=2)
            self.assertFalse(target.exists())

    def test_unsupported_material_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);glb=root/"f.glb";frame=root/"hero.json"
            generate(glb,frame,side=256,triangles=120)
            # Keep normal source bytes unchanged, but reject forbidden
            # resolution/capability policy before invoking Blender.
            with self.assertRaisesRegex(ValueError,"R14E_UNSUPPORTED"):
                preflight(glb,frame,500)
            with self.assertRaisesRegex(ValueError,"R14E_UNSUPPORTED"):
                preflight(glb,frame,160,max_mib=100)


@unittest.skipUnless(sys.platform.startswith("linux") and
                     Path("/proc/self/status").exists(),"Linux procfs RSS guard")
class BlenderResourceGuardTests(unittest.TestCase):
    def test_small_worker_completes_with_explicit_monitored_peak(self):
        proc=run_guarded([sys.executable,"-c","print('ok')"],
                         env=os.environ.copy(),timeout_seconds=5,max_working_mib=128,
                         poll_seconds=.02)
        self.assertEqual(proc.returncode,0)
        self.assertIn("ok",proc.stdout)
        self.assertEqual(proc.watchdog,"linux-procfs-tree-sampled")
        self.assertFalse(proc.hard_memory_limit)
        self.assertIsInstance(proc.peak_tree_rss_kib,int)

    def test_synthetic_rss_overbudget_terminates_child(self):
        script="import time; allocation=bytearray(64*1024*1024); time.sleep(5)"
        with self.assertRaisesRegex(RuntimeError,"R14E_BACKEND_RESOURCE"):
            run_guarded([sys.executable,"-c",script],env=os.environ.copy(),
                        timeout_seconds=8,max_working_mib=24,poll_seconds=.02)

    def test_descendant_allocation_counts_in_process_tree_budget(self):
        parent=("import subprocess,sys; "
                "subprocess.run([sys.executable,'-c',"
                "'import time; x=bytearray(64*1024*1024); time.sleep(5)'])")
        with self.assertRaisesRegex(RuntimeError,"R14E_BACKEND_RESOURCE"):
            run_guarded([sys.executable,"-c",parent],
                        env=os.environ.copy(),timeout_seconds=8,
                        max_working_mib=24,poll_seconds=.02)

    def test_timed_out_worker_is_killed(self):
        with self.assertRaisesRegex(RuntimeError,"R14E_BACKEND_TIMEOUT"):
            run_guarded([sys.executable,"-c","import time; time.sleep(5)"],
                        env=os.environ.copy(),timeout_seconds=.3,
                        max_working_mib=128,poll_seconds=.02)


if __name__=="__main__":
    unittest.main()

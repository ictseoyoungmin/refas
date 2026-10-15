"""R14-06E1 host-side Blender glTF/PBR trust boundary regressions.

Real blender execution is opt-in and not part of ordinary PR CI.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from create_blender_color0_texture_fixture import generate
from render_external_blender import preflight,run


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


if __name__=="__main__":
    unittest.main()

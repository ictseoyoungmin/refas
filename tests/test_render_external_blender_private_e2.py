"""R14-06E2 private source gate: report/SHA fail-closed contracts.

Synthetic report fixtures here are structural tests only; they are NOT
represented as actual executed Blender evidence.
"""
from __future__ import annotations
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from create_blender_color0_texture_fixture import generate
from render_external_blender import preflight, sha
from verify_blender_private_source_e2 import (run_private_session,validate_capture,
    ORIGINAL_MONSTER_SHA, ORIGINAL_MONSTER_TRIANGLES)


def synthetic_report(source,frame,image):
    return {
        "schema":"refas.external-pbr-preview/v1",
        "status":"COMPLETE",
        "claimScope":"external-pbr-preview-only",
        "certificationEligible":False,
        "crossRendererEquivalence":"NOT_ESTABLISHED",
        "cameraAuthority":"UNREGISTERED-DIAGNOSTIC",
        "backend":{"engine":"Blender Cycles CPU","version":"4.0.2",
                   "workerSha256":"a"*64},
        "source":{"sourceGlbSha256":sha(source),"frameFileSha256":sha(frame),
                  "sourceTriangles":120,"sourcePrimitiveCount":1,
                  "sourceUsesColor0":True,"sourceColor0Triangles":120},
        "materialEvidence":{
            "sourceUsesColor0":True,
            "importedColorAttributes":[{"name":"Col","domain":"CORNER","length":360}],
            "boundColorMaterialNodes":[{"material":"Material_0",
                                        "attribute":"<active color layer>"}]},
        "importerEvidence":{"importedTriangles":120,"importedMeshObjects":1,
                            "colorBearingImportedTriangles":120,
                            "peakProcessRssKiB":75000},
        "output":{"size":[96,96],"sha256":sha(image)},
        "timingsMs":{"blenderProcess":200}
    }


class PrivateExternalGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="r14e2-contract-")
        self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        self.glb=root/"synthetic.glb";self.frame=root/"frame.json"
        generate(self.glb,self.frame,side=256,triangles=120)
        self.image=root/"render.png"
        Image.new("RGB",(96,96),(12,24,37)).save(self.image)
        self.report=synthetic_report(self.glb,self.frame,self.image)

    def check(self,report=None):
        return validate_capture(self.report if report is None else report,self.image,
            source_sha=sha(self.glb),frame_sha=sha(self.frame),
            triangles=120,primitives=1,size=96,minimum_color0_triangles=120)

    def test_actual_source_inventory_and_structural_report(self):
        b=preflight(self.glb,self.frame,96)
        self.assertEqual(b["sourceTriangles"],120)
        self.assertEqual(b["sourceColor0Triangles"],120)
        self.assertEqual(self.check()["importedTriangles"],120)
        self.assertFalse(self.check()["certificationEligible"])

    def test_reject_self_certification_and_imported_triangle_loss(self):
        for field,value in (
            ("certificationEligible",True),("crossRendererEquivalence","PASS"),
            ("cameraAuthority","SOURCE_REGISTERED")):
            altered=copy.deepcopy(self.report)
            altered[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,"R14E2_INVALID_EVIDENCE"):
                self.check(altered)
        for container,field,value in (
            ("source","sourceTriangles",119),
            ("source","sourceColor0Triangles",119),
            ("importerEvidence","importedTriangles",119),
            ("importerEvidence","colorBearingImportedTriangles",119),
            ("output","sha256","0"*64),
            ("materialEvidence","boundColorMaterialNodes",[])):
            altered=copy.deepcopy(self.report)
            altered[container][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,"R14E2_INVALID_EVIDENCE"):
                self.check(altered)

    def test_private_workflow_refuses_source_sha_mismatch_without_output(self):
        root=Path(self.tmp.name)
        out=root/"should-stay-absent"
        with self.assertRaisesRegex(ValueError,"R14E2_SOURCE_MUTATED"):
            run_private_session(glb=self.glb,frame=self.frame,output=out,
                blender="nonexistent-blender",expected_glb_sha=ORIGINAL_MONSTER_SHA,
                expected_frame_sha=sha(self.frame),expected_triangles=120,
                expected_primitives=1,minimum_color0_triangles=120,sizes=(96,))
        self.assertFalse(out.exists())

    def test_private_workflow_missing_blender_cannot_publish(self):
        root=Path(self.tmp.name)
        out=root/"no-blender"
        with self.assertRaisesRegex(RuntimeError,"R14E_BACKEND_UNAVAILABLE"):
            run_private_session(glb=self.glb,frame=self.frame,output=out,
                blender="nonexistent-blender",expected_glb_sha=sha(self.glb),
                expected_frame_sha=sha(self.frame),expected_triangles=120,
                expected_primitives=1,minimum_color0_triangles=120,sizes=(96,),
                samples=2,threads=1)
        self.assertFalse(out.exists())

    def test_no_output_with_wrong_or_missing_blender_evidence(self):
        altered=copy.deepcopy(self.report)
        altered.pop("importerEvidence")
        with self.assertRaisesRegex(ValueError,"R14E2_INVALID_EVIDENCE"):
            self.check(altered)


if __name__=="__main__":
    unittest.main()

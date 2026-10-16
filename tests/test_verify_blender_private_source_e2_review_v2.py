"""Contract negatives for the versioned E2 diagnostic review; no private source in public CI."""
from pathlib import Path
import json, tempfile, unittest
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'skills/refas/scripts'))
import verify_blender_private_source_e2_review_v2 as gate

class GateContractTests(unittest.TestCase):
    def test_missing_input_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'missing'
            with self.assertRaisesRegex(ValueError,'required private inputs absent'):
                gate.verify(p,p,p,p)

    def test_fake_source_refuses_with_real_source_sha_required(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'model.glb';p.write_bytes(b'glTF'+b'\0'*64)
            with self.assertRaisesRegex(ValueError,'original source bytes/SHA'):
                gate.glb_inventory(p)

    def test_wrong_camera_identity_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'frame.json'
            p.write_text(json.dumps({'schema':'refas.canonical-object-frame/v1','hero':{}}))
            with self.assertRaisesRegex(ValueError,'v2 camera SHA'):
                gate.require(gate.digest(p.read_bytes())==gate.FRAME_SHA_V2,'v2 camera SHA')

    def test_noncertification_scope_and_version(self):
        self.assertNotEqual(gate.FRAME_SHA_V2,gate.HISTORICAL_FRAME_SHA)
        self.assertEqual(gate.SCHEMA,'refas.e2-private-original-diagnostic-review/v2')

if __name__=='__main__': unittest.main()

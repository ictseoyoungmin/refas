"""R14-06B: independent oracle for clipped source weights and tiled visibility."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from render_glb import Primitive
from benchmark_render_cpu import create_fixture
from render_pbr_v2_visibility import (NEAR, njit, numba_config, render_visibility)


def part(points,faces,part_id=0,colors=None):
    xyz=np.array(points,dtype=np.float64)
    return Primitive(xyz,np.tile([0.,0.,1.],(len(xyz),1)),
        np.asarray(faces,dtype=np.int64),np.array([1.,1.,1.]),
        0.,.7,part_id,"part-"+str(part_id),
        vertex_colors=colors)


def digest(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def run(parts,threads=1,tile=16,size=80):
    return render_visibility(parts,np.array([0.,0.,0.]),np.array([0.,0.,1.]),
        np.array([0.,1.,0.]),55.,size,tile_size=tile,threads=threads,
        max_working_mib=512)


def ray_reference(cam,face,x,y,size,fov):
    """A separate 3D analytic ray/triangle intersection; no clipped fans.

    Returns original source barycentric weights, independently of the
    candidate screen-edge math or perspective-barycentric interpolation.
    """
    scale=math.tan(math.radians(fov)/2)
    ray=np.array([(x/(size-1)*2-1)*scale,(1-2*y/(size-1))*scale,1.])
    a,b,c=cam[face]
    mat=np.column_stack((b-a,c-a,-ray))
    if abs(np.linalg.det(mat))<1e-13:
        return None
    u,v,t=np.linalg.solve(mat,-a)
    if t<NEAR or u < -1e-9 or v < -1e-9 or u+v > 1+1e-9:
        return None
    return np.array([1-u-v,u,v]),t


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class PbrV2VisibilityTests(unittest.TestCase):
    def test_crossing_near_plane_has_original_triangle_barycentrics(self):
        triangles=[part([[-.3,-.25,.005],[.42,-.3,.12],[-.04,.47,.11]],[[0,1,2]])]
        output=run(triangles)
        stats=output["stats"]
        self.assertEqual(stats["inputTriangles"],1)
        self.assertEqual(stats["nearClippedSourceTriangles"],1)
        self.assertGreaterEqual(stats["preparedRasterTriangles"],1)
        self.assertGreater(stats["coveredPixels"],0)
        yy,xx=np.nonzero(output["winnerSourceTriangle"]>=0)
        for j in np.linspace(0,len(xx)-1,min(len(xx),16),dtype=int):
            x,y=int(xx[j]),int(yy[j])
            oracle=ray_reference(output["cameraVertices"],output["sourceFaces"][0],x,y,80,55.)
            self.assertIsNotNone(oracle)
            weights,distance=oracle
            np.testing.assert_allclose(output["sourceWeights"][y,x],weights,atol=2e-10)
            self.assertAlmostEqual(output["depth"][y,x],distance,delta=2e-10)
        np.testing.assert_allclose(output["sourceWeights"][yy,xx].sum(axis=1),
                                   1.,atol=2e-10)
        self.assertEqual(set(np.unique(output["winnerSourceTriangle"][yy,xx])),{0})

    def test_near_fully_occluded_and_tie_ownership(self):
        a=part([[-.7,-.7,.18],[.7,-.7,.18],[0.,.7,.18]],[[0,1,2]],part_id=0)
        b=part([[-.7,-.7,.18],[.7,-.7,.18],[0.,.7,.18]],[[0,1,2]],part_id=1)
        behind=part([[-.3,-.3,.001],[.3,-.3,.001],[0,.3,.001]],
                    [[0,1,2]],part_id=2)
        rendered=run([a,b,behind])
        s=rendered["stats"]
        self.assertEqual(s["fullyBehindNearTriangles"],1)
        self.assertEqual(s["inputTriangles"],3)
        self.assertGreater(s["coveredPixels"],0)
        self.assertEqual(set(np.unique(rendered["winnerSourceTriangle"][
            rendered["winnerSourceTriangle"]>=0])),{0})
        self.assertEqual(rendered["primitiveBySourceTriangle"].tolist(),[0,1,2])

    def test_tile_thread_and_repeated_execution_are_bit_identical(self):
        parts=[part([[-.35,-.3,.005],[.35,-.3,.18],[-.1,.37,.11],
                    [-.42,-.38,.27],[.42,-.38,.27],[0,.5,.27]],
                    [[0,1,2],[3,4,5],[5,4,3]])]
        reference=run(parts,threads=1,tile=16)
        for tile in (16,32,64):
            for threads in (1,min(2,numba_config.NUMBA_NUM_THREADS),
                            min(4,numba_config.NUMBA_NUM_THREADS)):
                current=run(parts,threads=threads,tile=tile)
                for key in ("depth","winnerRasterSlot","winnerSourceTriangle","sourceWeights"):
                    self.assertEqual(digest(current[key]),digest(reference[key]),
                                     f"{key} differs on tile{tile}/threads{threads}")
                self.assertEqual(current["stats"]["inputTriangles"],3)

    def test_source_material_is_not_claimed_by_geometry_visibility(self):
        tri=part([[-.3,-.3,.25],[.3,-.3,.25],[0,.3,.25]],[[0,1,2]],
            colors=np.array([[.1,.01,.001],[.2,.02,.002],[.3,.03,.003]]))
        a=run([tri]); tri.color=np.zeros(3); tri.vertex_colors=None
        b=run([tri])
        for key in ("depth","winnerRasterSlot","winnerSourceTriangle","sourceWeights"):
            self.assertEqual(digest(a[key]),digest(b[key]))
        self.assertEqual(a["stats"]["claimScope"],"geometry-diagnostic-only")
        self.assertFalse(a["stats"]["certificationEligible"])

    def test_typed_resource_refusal_before_large_setup(self):
        many=part([[0,0,.2],[.5,0,.2],[0,.5,.2]],[[0,1,2]])
        with self.assertRaisesRegex(MemoryError,"PBR_V2_RESOURCE"):
            render_visibility([many],[0,0,0],[0,0,1],[0,1,0],55,80,
                max_working_mib=128)
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED"):
            run([many],tile=13)


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class PbrV2VisibilityCliTests(unittest.TestCase):
    def test_real_glb_frame_cli_no_source_photo_certification(self):
        tool=Path(__file__).resolve().parents[1]/"skills/refas/scripts/render_pbr_v2_visibility.py"
        with tempfile.TemporaryDirectory(prefix="refas-pbr-v2-cli-") as tmp:
            root=Path(tmp); glb=root/"geometry.glb"; frame=root/"frame.json"
            create_fixture(glb,frame,"strands",150,37)
            out=root/"diagnostics"
            cmd=[sys.executable,str(tool),"--glb",str(glb),"--frame",str(frame),
                 "--out",str(out),"--size","48","--threads","1","--tile-size","16",
                 "--max-working-mb","512"]
            proc=subprocess.run(cmd,text=True,capture_output=True,timeout=100)
            self.assertEqual(proc.returncode,0,proc.stderr[-2500:])
            report=json.loads((out/"report.json").read_text())
            self.assertEqual(report["claimScope"],"geometry-diagnostic-only")
            self.assertFalse(report["certificationEligible"])
            self.assertEqual(report["stats"]["inputTriangles"],150)
            self.assertEqual(len(report["digests"]),4)
            for key in ("depth","winnerRasterSlot","sourceWeights"):
                self.assertEqual(digest(np.load(out/(key+".npy"))),report["digests"][key])
            repeat=subprocess.run(cmd,text=True,capture_output=True,timeout=10)
            self.assertNotEqual(repeat.returncode,0)
            self.assertIn("PBR_V2_INVALID_OUTPUT",repeat.stderr)


if __name__=="__main__":
    unittest.main()

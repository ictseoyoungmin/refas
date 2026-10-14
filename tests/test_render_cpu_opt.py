"""R14-02 optional JIT raster correctness; run via python -m unittest discover."""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from render_glb import Primitive, camera_basis, render as render_legacy
from render_cpu_opt import render_hero, require_supported, njit


def mesh(vertices, triangles, oid=0):
    points=np.asarray(vertices, dtype=np.float64)
    return Primitive(points,np.tile([0.,0.,1.],(len(points),1)),
                     np.asarray(triangles,dtype=np.int64),
                     np.asarray([.5,.5,.6]),0.,.7,oid,"part")


@unittest.skipUnless(njit is not None, "optional numba unavailable")
class CompiledHeroTests(unittest.TestCase):
    camera=np.array([0.,0.,0.])
    target=np.array([0.,0.,1.])
    up=np.array([0.,1.,0.])

    def test_real_non_degenerate_normal_and_object_id(self):
        model=mesh([[-.4,-.3,2],[.4,-.3,2],[0,.5,2]], [[0,1,2]])
        pix,depth,winners,s=render_hero([model],self.camera,self.target,self.up,65,64,"normal")
        self.assertGreater(s["coveredPixels"],20)
        self.assertGreater(s["visibleTriangles"],0)
        self.assertTrue(np.all(depth[winners>=0]>0))
        self.assertGreater(len(np.unique(pix.reshape(-1,3),axis=0)),1)
        pix2,_,_,s2=render_hero([model],self.camera,self.target,self.up,65,64,"object-id")
        self.assertEqual(s["coveredPixels"],s2["coveredPixels"])
        self.assertFalse(np.array_equal(pix,pix2))

    def test_near_plane_crossing_is_clipped_not_discarded(self):
        model=mesh([[-.06,-.08,.004],[.13,-.08,.45],[0,.16,.45]], [[0,1,2]])
        pix,depth,winners,s=render_hero([model],self.camera,self.target,self.up,70,96,"object-id")
        self.assertGreater(s["coveredPixels"],0)
        self.assertEqual(s["visibleTriangles"],1)
        self.assertTrue(np.isfinite(depth[winners>=0]).all())

    def test_behind_camera_and_degenerate_faces_do_not_cover_pixels(self):
        behind=mesh([[-.2,-.1,-1],[.2,-.1,-1],[0,.2,-1]], [[0,1,2]])
        _,_,w,s=render_hero([behind],self.camera,self.target,self.up,65,64,"normal")
        self.assertEqual(s["coveredPixels"],0)
        flat=mesh([[0,0,2],[0,0,2],[0,0,2]], [[0,1,2]])
        _,_,w,s=render_hero([flat],self.camera,self.target,self.up,65,64,"normal")
        self.assertEqual(s["coveredPixels"],0)

    def test_identical_inputs_repeat_exactly_and_depth_wins(self):
        # Same geometry in two primitives: near triangle wins independent of pass.
        far=mesh([[-.4,-.3,3],[.4,-.3,3],[0,.5,3]],[[0,1,2]],oid=0)
        near=mesh([[-.4,-.3,2],[.4,-.3,2],[0,.5,2]],[[0,1,2]],oid=1)
        out1,_,win1,s1=render_hero([far,near],self.camera,self.target,self.up,65,64,"object-id")
        out2,_,win2,s2=render_hero([far,near],self.camera,self.target,self.up,65,64,"object-id")
        self.assertTrue(np.array_equal(out1,out2))
        self.assertTrue(np.array_equal(win1,win2))
        self.assertEqual(s1["coveredPixels"],s2["coveredPixels"])
        self.assertTrue(np.any(win1==1))

    def test_material_and_glb_feature_scope_is_explicit(self):
        require_supported({"meshes":[{"primitives":[{"mode":4}]}]})
        with self.assertRaisesRegex(ValueError,"OPTIMIZED_CPU_UNSUPPORTED"):
            require_supported({"meshes":[{"primitives":[{"mode":1}]}]})
        with self.assertRaisesRegex(ValueError,"OPTIMIZED_CPU_UNSUPPORTED"):
            require_supported({"materials":[{"alphaMode":"BLEND"}]})
        with self.assertRaisesRegex(ValueError,"OPTIMIZED_CPU_UNSUPPORTED"):
            require_supported({"skins":[{}]})


if __name__ == "__main__":
    unittest.main()

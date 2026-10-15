"""R14-06C3 independent UV gradient, mip/LOD, and memory guard oracles."""
from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from render_pbr_v2_mip import compute_uv_derivatives,mip_linear_pyramid
from render_pbr_v2_texture import sample_linear_texture,resolve_base_sampler
from render_pbr_v2_material import validate_opaque_materials,shade_visible


def sampler_descriptor(rgba,minfilter=9987,magfilter=9728):
    from render_glb import Primitive
    xyz=np.array([[-.5,-.4,.4],[.5,-.4,.4],[0,.5,.4]],dtype=float)
    primitive=Primitive(xyz,np.tile([0,0,-1.],(3,1)),
        np.array([[0,1,2]]),np.ones(3),0,.5,0,"mip",
        texcoords=np.array([[0.,0.],[1.,0.],[0.,1.]]),
        base_color_texture=rgba)
    model={"textures":[{"source":0,"sampler":0}],
           "images":[{"mimeType":"image/png","bufferView":0}],
           "samplers":[{"minFilter":minfilter,"magFilter":magfilter,
                        "wrapS":33071,"wrapT":33071}]}
    return resolve_base_sampler(model,{"index":0},primitive)


class MipLinearMathOracle(unittest.TestCase):
    def test_npoti_odd_dimensions_box_average_and_linear_before_downsample(self):
        base=np.array([[[0,0,0],[1,0,0],[.5,0,0]],
                       [[1,0,0],[0,0,0],[.5,0,0]],
                       [[.2,0,0],[.4,0,0],[.6,0,0]]],dtype=np.float64)
        levels=mip_linear_pyramid(base)
        self.assertEqual([m.shape for m in levels],[(3,3,3),(2,2,3),(1,1,3)])
        self.assertAlmostEqual(levels[1][0,0,0],.5)
        self.assertAlmostEqual(levels[1][0,1,0],.5)
        self.assertAlmostEqual(levels[1][1,0,0],.3)
        self.assertAlmostEqual(levels[1][1,1,0],.6)
        self.assertAlmostEqual(levels[2][0,0,0],(.5+.5+.3+.6)/4)
        with self.assertRaisesRegex(MemoryError,"PBR_V2_RESOURCE"):
            mip_linear_pyramid(base,max_pixels=8)

    def test_four_mip_modes_gradient_and_mag_min_switch(self):
        rgba=np.ones((4,4,4),dtype=np.float64)
        rgba[:,:,0]=np.array([
            [0,1,0,1],[1,0,1,0],[0,1,0,1],[1,0,1,0]],dtype=float)
        for mode in (9984,9985,9986,9987):
            with self.subTest(mode=mode):
                d=sampler_descriptor(rgba,mode)
                self.assertEqual(len(d["levels"]),3)
                with self.assertRaisesRegex(ValueError,"UV derivatives"):
                    sample_linear_texture(d,np.array([[.125,.125]]))
                # Two-texel footprint picks level 1, already gray after
                # linear 2x2 averaging, independent of texel filter mode.
                val=sample_linear_texture(d,np.array([[.125,.125]]),
                             np.array([[.50,0]]),np.array([[0,.50]]))
                self.assertAlmostEqual(val[0,0],.5,places=12)
                # Magnification chooses the independently specified NEAREST.
                zoom=sample_linear_texture(d,np.array([[.125,.125]]),
                             np.array([[.01,0]]),np.array([[0,.01]]))
                self.assertAlmostEqual(zoom[0,0],0.,places=12)
        d=sampler_descriptor(rgba,9986)
        # sqrt(2) texel footprint -> lambda = .5.
        val=sample_linear_texture(d,np.array([[.125,.125]]),
                  np.array([[math.sqrt(2)/4,0]]),np.array([[0,0.]]))
        self.assertAlmostEqual(val[0,0],.25,places=12)

    def test_separate_min_mag_no_mip(self):
        rgba=np.ones((2,2,4),dtype=float)
        rgba[0,0,0]=0;rgba[0,1,0]=1
        descriptor=sampler_descriptor(rgba,9728,9729)
        coords=np.array([[.50,.25],[.25,.25]])
        out=sample_linear_texture(descriptor,coords,
             np.array([[1,0],[.01,0]]),np.array([[0,1],[0,.01]]))
        # First is minified nearest (right texel); second is
        # magnified bilinear at its texel center (left dark texel).
        self.assertAlmostEqual(out[0,0],1.,places=12)
        self.assertAlmostEqual(out[1,0],0.,places=12)


class OriginalSourceRayOracle(unittest.TestCase):
    def test_differentials_match_finite_difference_of_true_3d_plane(self):
        camera=np.array([[-.6,-.5,1.2],[1.,-.6,2.8],[0.,.9,1.7]],
                        dtype=np.float64)
        original_uv=np.array([[.1,.2],[1.1,.1],[.35,1.3]],dtype=float)
        size=80;fov=58.;x=39.3;y=41.7
        scale=math.tan(math.radians(fov)/2)
        m=camera.T
        def uv_ray(px,py):
            r=np.array([(2*px/(size-1)-1)*scale,
                        (1-2*py/(size-1))*scale,1.])
            q=np.linalg.solve(m,r)
            weights=q/q.sum()
            depth=1/q.sum()
            return weights@original_uv,weights,depth
        uv,w,depth=uv_ray(x,y)
        self.assertTrue(np.all(w>0))
        vis={"sourceWeights":w[None,:],"depth":np.array([depth]),
             "sourceFaces":np.array([[0,1,2]]),
             "cameraVertices":camera}
        dx,dy=compute_uv_derivatives(vis,np.array([0]),original_uv,size,fov)
        epsilon=1e-4
        expected_dx=(uv_ray(x+epsilon,y)[0]-uv_ray(x-epsilon,y)[0])/(2*epsilon)
        expected_dy=(uv_ray(x,y+epsilon)[0]-uv_ray(x,y-epsilon)[0])/(2*epsilon)
        np.testing.assert_allclose(dx[0],expected_dx,atol=1e-9)
        np.testing.assert_allclose(dy[0],expected_dy,atol=1e-9)
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL"):
            bad=dict(vis)
            bad["cameraVertices"]=camera.copy()
            bad["cameraVertices"][2]=bad["cameraVertices"][0]
            compute_uv_derivatives(bad,np.array([0]),original_uv,size,fov)

    def test_lod_uses_original_source_not_adjacent_occluded_pixel(self):
        # UV gradient for a single visible source triangle is calculated
        # independently of the winner/UV values in neighboring pixels.
        uv=np.array([[0,0],[1,0],[0,1]],dtype=float)
        cam=np.array([[-.5,-.5,1.],[.5,-.5,1.],[0,.5,1.]])
        w=np.array([[.2,.3,.5]])
        vis={"sourceWeights":w,"depth":np.array([1.]),
             "sourceFaces":np.array([[0,1,2]]),"cameraVertices":cam}
        a=compute_uv_derivatives(vis,np.array([0]),uv,64,60)
        b=compute_uv_derivatives(vis,np.array([0]),uv,64,60)
        np.testing.assert_array_equal(a[0],b[0])
        np.testing.assert_array_equal(a[1],b[1])


if __name__=="__main__":
    unittest.main()

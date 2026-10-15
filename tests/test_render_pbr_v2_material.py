"""R14-06C: material pixels from original barycentric fragments, not flat fallback."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from benchmark_render_cpu import create_fixture
from render_glb import Primitive,parse_glb
from render_pbr_v2_visibility import njit, numba_config
from render_pbr_v2_material import (
    srgb_to_linear,linear_to_srgb,shade_visible,validate_opaque_materials,
    render_material_preview)


def fixture():
    xyz=np.array([[-.5,-.4,.45],[.5,-.4,.45],[0.,.6,.45]],dtype=float)
    normals=np.tile(np.array([0.,0.,-1.]),(3,1))
    vertex=np.array([[.01,.01,.01],[.36,.04,.08],[.04,.49,.16]])
    primitive=Primitive(xyz,normals,np.array([[0,1,2]],dtype=np.int64),
                        np.array([1.,1.,1.]),0.0,.65,0,"triangle",
                        vertex_colors=vertex)
    model={"scenes":[{"nodes":[0]}],"scene":0,"nodes":[{"mesh":0}],
           "meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"material":0}]}],
           "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[.8,.7,.6,1],
                         "metallicFactor":.0,"roughnessFactor":.65},"doubleSided":True}]}
    return primitive,model


class PureMaterialChecks(unittest.TestCase):
    def test_iec_piecewise_transfer_and_inverse(self):
        values=np.array([[0,.0031308,.18,.9]],dtype=float)
        expected=np.array([[0,.040449936, .46135613,.95468717]])
        np.testing.assert_allclose(linear_to_srgb(values),expected,atol=2e-7)
        np.testing.assert_allclose(srgb_to_linear(linear_to_srgb(values)),values,atol=1e-12)

    def test_gltf_white_default_and_error_on_unhandled_texture(self):
        p,model=fixture()
        model["materials"][0]["pbrMetallicRoughness"].pop("baseColorFactor")
        specs=validate_opaque_materials(model,[p])
        np.testing.assert_array_equal(specs[0][0],[1,1,1])
        model["textures"]=[{"source":0}]
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*texture"):
            validate_opaque_materials(model,[p])
        del model["textures"]
        model["materials"][0]["normalTexture"]={"index":0}
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL"):
            validate_opaque_materials(model,[p])

    def test_vertex_alpha_and_transparency_refuse(self):
        p,model=fixture()
        p.vertex_alpha=np.array([1,.5,1],dtype=float)
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*alpha"):
            validate_opaque_materials(model,[p])
        p.vertex_alpha=None
        model["materials"][0]["alphaMode"]="BLEND"
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*alpha"):
            validate_opaque_materials(model,[p])

    def test_visible_pixel_independent_source_barycentric_color_oracle(self):
        p,model=fixture()
        vis={
            "winnerSourceTriangle":np.array([[-1,0],[-1,-1]],dtype=np.int64),
            "sourceWeights":np.array([
                [[0,0,0],[.25,.5,.25]],
                [[0,0,0],[0,0,0]]],dtype=float),
            "primitiveBySourceTriangle":np.array([0],dtype=np.int32)
        }
        specs=validate_opaque_materials(model,[p])
        images,stats=shade_visible([p],vis,specs,np.array([0,0,0]),
                                   ("albedo","object-id","normal","beauty"))
        source_color=.25*p.vertex_colors[0]+.5*p.vertex_colors[1]+.25*p.vertex_colors[2]
        expected=np.rint(linear_to_srgb(source_color*np.array([.8,.7,.6]))*255).astype(np.uint8)
        np.testing.assert_array_equal(images["albedo"][0,1],expected)
        self.assertEqual(stats["shadedPixels"],1)
        self.assertEqual(stats["coveredPixels"],1)
        np.testing.assert_array_equal(images["albedo"][0,0],[12,15,19])
        self.assertFalse(np.array_equal(images["beauty"][0,1],images["albedo"][0,1]))
        # Material declaration is not a spatial or source image certificate.
        self.assertEqual(stats["claimScope"],"material-preview-only")
        self.assertFalse(stats["certificationEligible"])

    def test_fragment_occlusion_only_shades_winner(self):
        a,model=fixture()
        b=Primitive(a.positions.copy()+[0,0,.2],a.normals.copy(),a.indices.copy(),
             np.ones(3),0.,.65,1,"hidden",vertex_colors=np.ones((3,3)))
        model["meshes"][0]["primitives"].append({"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"material":0})
        vis={"winnerSourceTriangle":np.array([[0,-1],[-1,-1]],dtype=np.int64),
             "sourceWeights":np.array([[[.2,.2,.6],[0,0,0]],
                                       [[0,0,0],[0,0,0]]],dtype=float),
             "primitiveBySourceTriangle":np.array([0,1],dtype=np.int32)}
        images,metrics=shade_visible([a,b],vis,validate_opaque_materials(model,[a,b]),
            np.zeros(3),("albedo",))
        self.assertEqual(metrics["shadedPixels"],1)
        self.assertFalse(np.array_equal(images["albedo"][0,0],[255,255,255]))


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class MaterialVisibilityIntegration(unittest.TestCase):
    def test_one_visibility_four_opaque_passes_and_tile_parity(self):
        p,model=fixture()
        def run(tile,threads):
            return render_material_preview([p],model,
                    np.zeros(3),np.array([0,0,1]),np.array([0,1,0]),55,64,
                    tile_size=tile,threads=threads,max_working_mib=512)
        images,vis,stats=run(16,1)
        self.assertEqual(stats["visibility"]["inputTriangles"],1)
        self.assertEqual(stats["shadedPixels"],stats["visibility"]["coveredPixels"])
        self.assertGreater(stats["shadedPixels"],0)
        for size in (16,32,64):
            for threads in (1,min(2,numba_config.NUMBA_NUM_THREADS)):
                new,other,_=run(size,threads)
                for key in images:
                    np.testing.assert_array_equal(new[key],images[key])
                np.testing.assert_array_equal(other["winnerSourceTriangle"],
                                              vis["winnerSourceTriangle"])
                np.testing.assert_array_equal(other["sourceWeights"],vis["sourceWeights"])
        self.assertEqual(stats["claimScope"],"material-preview-only")


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class MaterialCliIntegration(unittest.TestCase):
    def test_actual_glb_cli_signed_output_preview_not_certification(self):
        worker=Path(__file__).resolve().parents[1]/"skills/refas/scripts/render_pbr_v2_material.py"
        with tempfile.TemporaryDirectory(prefix="refas-r14-06c-") as temp:
            root=Path(temp); glb=root/"asset.glb"; frame=root/"frame.json"
            create_fixture(glb,frame,"strands",120,31)
            out=root/"preview"
            proc=subprocess.run([sys.executable,str(worker),"--glb",str(glb),
                "--frame",str(frame),"--out",str(out),"--threads","1",
                "--size","48","--max-working-mb","512"],text=True,capture_output=True,
                timeout=120)
            self.assertEqual(proc.returncode,0,proc.stderr[-4000:])
            report=json.loads((out/"preview-report.json").read_text())
            self.assertEqual(report["status"],"COMPLETE")
            self.assertEqual(report["claimScope"],"material-preview-only")
            self.assertFalse(report["certificationEligible"])
            self.assertEqual(report["stats"]["visibility"]["inputTriangles"],120)
            self.assertEqual(len(report["outputs"]),4)
            import hashlib
            for row in report["outputs"]:
                data=(out/row["path"]).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),row["sha256"])
                self.assertEqual(np.asarray(Image.open(out/row["path"])).shape,(48,48,3))
            self.assertEqual(len(report["geometryDigests"]),3)


if __name__=="__main__":
    unittest.main()

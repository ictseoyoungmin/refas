"""R14-06C2: glTF sampler independent pixel and actual embedded PNG GLB tests."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from render_glb import Primitive, parse_glb, load_primitives
from render_pbr_v2_texture import (
    LINEAR,NEAREST,REPEAT,CLAMP_TO_EDGE,MIRRORED_REPEAT,
    resolve_base_sampler,sample_linear_texture,srgb_to_linear)
from render_pbr_v2_material import (linear_to_srgb,validate_opaque_materials,
                                     shade_visible)
from benchmark_render_cpu import create_fixture


def sample_primitive():
    xyz=np.array([[-.5,-.5,.2],[.5,-.5,.2],[0,.5,.2]],dtype=np.float64)
    uv=np.array([[.25,.25],[.75,.25],[.5,.75]],dtype=np.float64)
    rgba=np.ones((2,2,4),dtype=np.float64)
    rgba[0,0,0]=0.0
    rgba[0,1,0]=1.0
    rgba[1,0,0]=0.25
    rgba[1,1,0]=0.75
    return Primitive(xyz,np.tile([0.,0.,1.],(3,1)),
        np.array([[0,1,2]]),np.array([1.,1.,1.]),.0,.7,0,"texture",
        texcoords=uv,base_color_texture=rgba,
        vertex_colors=np.array([[.5,.5,.5],[.25,.5,.5],[.75,.5,.5]]))


def tex_model(sampler=None):
    return {
        "scenes":[{"nodes":[0]}],"scene":0,
        "nodes":[{"mesh":0}],
        "meshes":[{"primitives":[{
            "attributes":{"POSITION":0,"NORMAL":1,"TEXCOORD_0":2,"COLOR_0":3},
            "indices":4,"material":0}]}],
        "materials":[{"pbrMetallicRoughness":{
            "baseColorFactor":[.8,.6,.4,1.],
            "roughnessFactor":.7,"metallicFactor":.0,
            "baseColorTexture":{"index":0}}}],
        "textures":[{"source":0,"sampler":0}],
        "images":[{"mimeType":"image/png","bufferView":3}],
        "samplers":[sampler if sampler is not None else {
            "magFilter":9729,"minFilter":9729,
            "wrapS":33071,"wrapT":33071}]
    }


class SamplerOracleTests(unittest.TestCase):
    def test_bilinear_decodes_before_filter_not_after(self):
        p=sample_primitive()
        descriptor=resolve_base_sampler(tex_model(),tex_model()["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"],p)
        result=sample_linear_texture(descriptor,np.array([[.5,.25]]))
        self.assertAlmostEqual(result[0,0],.5,places=12)
        self.assertGreater(abs(result[0,0]-srgb_to_linear(np.array([.5]))[0]),.28)
        expected=np.rint(linear_to_srgb(np.array([.5]))[0]*255)
        self.assertEqual(expected,188.)

    def test_texel_center_nearest_orientation_and_repeated_seam(self):
        p=sample_primitive()
        info={"index":0}
        model=tex_model({"magFilter":NEAREST,"minFilter":NEAREST,
                         "wrapS":REPEAT,"wrapT":REPEAT})
        d=resolve_base_sampler(model,info,p)
        values=sample_linear_texture(d,np.array([
            [.25,.25],[.75,.25],[.25,.75],[1.25,.25],[-.25,.25]]))
        np.testing.assert_allclose(values[:,0],[
            0.0,1.0,srgb_to_linear(np.array([.25]))[0],0.0,1.0],atol=1e-12)
        self.assertEqual(values[0,1],1.0)

    def test_wrap_mirror_and_clamp_independent_indices(self):
        p=sample_primitive();info={"index":0}
        model=tex_model({"magFilter":NEAREST,"minFilter":NEAREST,
                         "wrapS":MIRRORED_REPEAT,"wrapT":CLAMP_TO_EDGE})
        d=resolve_base_sampler(model,info,p)
        uv=np.array([[.25,-2.0],[1.25,-2.0],[2.25,-2.0],[-.25,-2.0]])
        out=sample_linear_texture(d,uv)
        np.testing.assert_allclose(out[:,0],[0.,1.,0.,0.],atol=1e-12)

    def test_no_mipmap_guessing_or_unrepresented_source_texcoords(self):
        p=sample_primitive(); info={"index":0}
        for bad in (9984,9985,9986,9987):
            with self.subTest(filter=bad):
                m=tex_model({"magFilter":LINEAR,"minFilter":bad})
                with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*mipmap"):
                    resolve_base_sampler(m,info,p)
        m=tex_model({"minFilter":NEAREST,"magFilter":LINEAR})
        with self.assertRaisesRegex(ValueError,"LOD-dependent"):
            resolve_base_sampler(m,info,p)
        with self.assertRaisesRegex(ValueError,"TEXCOORD_0"):
            resolve_base_sampler(tex_model(),{"index":0,"texCoord":1},p)
        with self.assertRaisesRegex(ValueError,"embedded PNG"):
            m=tex_model();m["images"][0]={"uri":"image.png"}
            resolve_base_sampler(m,info,p)
        with self.assertRaisesRegex(ValueError,"unknown texture wrapping"):
            m=tex_model({"wrapS":12345})
            resolve_base_sampler(m,info,p)
        # glTF unspecified filtering allows an implementation-chosen
        # default, which the v2 preview pins as LINEAR level-0.
        m=tex_model({})
        self.assertEqual(resolve_base_sampler(m,info,p)["filter"],LINEAR)

    def test_visible_only_texture_times_color_times_material_factor(self):
        p=sample_primitive();model=tex_model()
        specs=validate_opaque_materials(model,[p])
        w=np.array([.25,.5,.25])
        vis={"winnerSourceTriangle":np.array([[0,-1],[-1,-1]],dtype=np.int64),
             "sourceWeights":np.array([[w,[0,0,0]],[[0,0,0],[0,0,0]]]),
             "primitiveBySourceTriangle":np.array([0],dtype=np.int32)}
        images,stats=shade_visible([p],vis,specs,[0,0,0],("albedo","normal","object-id","beauty"))
        uv=w @ p.texcoords
        texture=sample_linear_texture(specs[0][4],uv.reshape(1,2))[0]
        color=(w @ p.vertex_colors)*texture*np.array([.8,.6,.4])
        expected=np.rint(linear_to_srgb(color)*255).astype(np.uint8)
        np.testing.assert_array_equal(images["albedo"][0,0],expected)
        self.assertEqual(stats["textureSampledPixels"],1)
        np.testing.assert_array_equal(images["albedo"][0,1],[12,15,19])


def fixture_embedded_texture(glb,frame):
    create_fixture(glb,frame,"hard-surface",120,31)
    model,binary=parse_glb(glb)
    # Attach a valid TEXCOORD_0 accessor; source positions/normals/triangles
    # and their exact indexes remain unmodified.
    count=model["accessors"][0]["count"]
    uv=np.broadcast_to(np.array([.5,.25],dtype="<f4"),(count,2)).copy()
    texture=np.zeros((2,2,4),dtype=np.uint8)
    texture[:]=[255,255,255,255]
    texture[0,0]=[0,0,0,255]
    png=io.BytesIO()
    Image.fromarray(texture,"RGBA").save(png,format="PNG")
    block=bytearray(binary)
    def append(payload):
        while len(block)%4:block.append(0)
        start=len(block)
        block.extend(payload)
        return start
    uvstart=append(uv.tobytes())
    view=len(model["bufferViews"])
    model["bufferViews"].append({"buffer":0,"byteOffset":uvstart,"byteLength":uv.nbytes})
    uvaccessor=len(model["accessors"])
    model["accessors"].append({"bufferView":view,"componentType":5126,
                              "count":count,"type":"VEC2"})
    model["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"]=uvaccessor
    imgdata=png.getvalue()
    imgstart=append(imgdata)
    model["bufferViews"].append({"buffer":0,"byteOffset":imgstart,"byteLength":len(imgdata)})
    model["images"]=[{"bufferView":len(model["bufferViews"])-1,"mimeType":"image/png"}]
    model["textures"]=[{"source":0,"sampler":0}]
    model["samplers"]=[{"minFilter":LINEAR,"magFilter":LINEAR,
                        "wrapS":REPEAT,"wrapT":CLAMP_TO_EDGE}]
    model["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]={"index":0}
    while len(block)%4:block.append(0)
    model["buffers"][0]["byteLength"]=len(block)
    js=json.dumps(model,separators=(",",":")).encode()
    js+=b" "*(-len(js)%4)
    with glb.open("wb") as out:
        out.write(struct.pack("<III",0x46546c67,2,12+8+len(js)+8+len(block)))
        out.write(struct.pack("<II",len(js),0x4e4f534a))
        out.write(js)
        out.write(struct.pack("<II",len(block),0x004e4942))
        out.write(block)


class EndToEndEmbeddedTexture(unittest.TestCase):
    def test_real_glb_embedded_png_and_all_four_pass_hashes(self):
        worker=Path(__file__).resolve().parents[1]/"skills/refas/scripts/render_pbr_v2_material.py"
        with tempfile.TemporaryDirectory(prefix="r14-06c2-") as d:
            glb=Path(d)/"test.glb";frame=Path(d)/"frame.json"
            fixture_embedded_texture(glb,frame)
            _,primitives=load_primitives(glb)
            self.assertEqual(primitives[0].base_color_texture.shape,(2,2,4))
            self.assertEqual(primitives[0].texcoords.shape[1],2)
            out=Path(d)/"out"
            proc=subprocess.run([sys.executable,str(worker),
                "--glb",str(glb),"--frame",str(frame),"--out",str(out),
                "--threads","1","--size","48","--max-working-mb","512"],
                text=True,capture_output=True,timeout=120)
            self.assertEqual(proc.returncode,0,proc.stderr[-3500:])
            record=json.loads((out/"preview-report.json").read_text())
            self.assertEqual(record["claimScope"],"material-preview-only")
            self.assertFalse(record["certificationEligible"])
            self.assertGreater(record["stats"]["textureSampledPixels"],0)
            self.assertEqual(len(record["outputs"]),4)
            self.assertEqual(record["sourceGlbSha256"],hashlib.sha256(glb.read_bytes()).hexdigest())
            for row in record["outputs"]:
                self.assertEqual(hashlib.sha256((out/row["path"]).read_bytes()).hexdigest(),
                                 row["sha256"])
            self.assertIn("base-color-texture-png-lod0-nearest-linear-wrap",
                          record["materialContract"]["supported"])


if __name__=="__main__":
    unittest.main()

"""R14-05F: native glTF COLOR_0 material correctness + explicit CPU refusal.

Independent barycentric pixel-color oracle and actual GLB bufferView decoding.
Optional Numba needed only for the shared visibility diagnostic smoke.
"""
from __future__ import annotations

import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from benchmark_render_cpu import create_fixture
from render_glb import (Primitive, accessor, camera_basis, load_primitives,
                        parse_glb, render as portable_render)
from render_cpu_tiled import njit
from render_cpu_visibility import render_bundle
from render_pbr import render as pbr_render


def make_color_glb(path, frame_path, *, dtype="float", alpha=False, factor=False):
    create_fixture(path, frame_path, "hard-surface", 2, 29)
    model, binary = parse_glb(path)
    count = model["accessors"][0]["count"]
    c = np.broadcast_to([0.08, 0.25, 0.65], (count, 3)).copy()
    if alpha:
        c = np.column_stack([c, np.full(count, 0.5)])
    if dtype == "u8":
        packed = np.round(c*255).astype("<u1")
        component = 5121
    else:
        packed = c.astype("<f4")
        component = 5126
    primitive = model["meshes"][0]["primitives"][0]
    if not factor:
        model["materials"][0]["pbrMetallicRoughness"].pop("baseColorFactor")
    old = bytes(binary)
    pad = (-len(old)) % 4
    block = old + b"\x00"*pad + packed.tobytes()
    block += b"\x00" * (-len(block) % 4)
    color_view = len(model["bufferViews"])
    model["bufferViews"].append({
        "buffer":0, "byteOffset":len(old)+pad, "byteLength":packed.nbytes
    })
    color_accessor = len(model["accessors"])
    model["accessors"].append({
        "bufferView":color_view, "componentType":component,
        "count":count, "type":"VEC4" if alpha else "VEC3",
        **({"normalized":True} if dtype == "u8" else {})
    })
    primitive["attributes"]["COLOR_0"] = color_accessor
    model["buffers"][0]["byteLength"] = len(block)
    js = json.dumps(model, separators=(",",":")).encode("utf8")
    js += b" "*(-len(js)%4)
    with path.open("wb") as stream:
        stream.write(struct.pack("<III",0x46546c67,2,12+8+len(js)+8+len(block)))
        stream.write(struct.pack("<II",len(js),0x4e4f534a))
        stream.write(js)
        stream.write(struct.pack("<II",len(block),0x004e4942))
        stream.write(block)
    return c


class VertexColorDecodeTests(unittest.TestCase):
    def test_source_glb_color0_float_default_factor_is_white(self):
        with tempfile.TemporaryDirectory() as tmp:
            glb, frame=Path(tmp)/"c.glb",Path(tmp)/"frame.json"
            expected=make_color_glb(glb,frame)
            _,primitives=load_primitives(glb)
            self.assertEqual(len(primitives),1)
            np.testing.assert_array_equal(primitives[0].color, [1,1,1])
            np.testing.assert_allclose(primitives[0].vertex_colors,expected,atol=1e-7)
            self.assertIsNone(primitives[0].vertex_alpha)
            with self.assertRaisesRegex(ValueError,"VERTEX_COLOR_UNSUPPORTED.*COLOR_0"):
                portable_render(primitives,[0,0,-4],[0,0,0],Path(tmp)/"wrong.png",
                                width=48,height=48,mode="albedo")
            self.assertFalse((Path(tmp)/"wrong.png").exists())

    def test_source_glb_normalized_u8_and_vertex_alpha(self):
        with tempfile.TemporaryDirectory() as tmp:
            glb,frame=Path(tmp)/"c.glb",Path(tmp)/"frame.json"
            expected=make_color_glb(glb,frame,dtype="u8",alpha=True)
            _,primitives=load_primitives(glb)
            self.assertEqual(primitives[0].vertex_colors.shape[1],3)
            np.testing.assert_allclose(primitives[0].vertex_colors,
                                       np.round(expected[:,:3]*255)/255,atol=1e-12)
            np.testing.assert_allclose(primitives[0].vertex_alpha,
                                       np.round(expected[:,3]*255)/255,atol=1e-12)
            with self.assertRaisesRegex(ValueError,"VERTEX_COLOR_UNSUPPORTED.*alpha"):
                pbr_render(primitives,[0,0,-4],[0,0,0],Path(tmp)/"refused.png",
                           size=48,mode="albedo",up_hint=[0,1,0],deadline=None)
            self.assertFalse((Path(tmp)/"refused.png").exists())


class PerspectiveColorTests(unittest.TestCase):
    def test_true_perspective_not_affine_and_gltf_linear_transfer(self):
        size,fov=64,65.
        screen=np.array([[9.,55.],[54.,55.],[32.,8.]],dtype=np.float64)
        depth=np.array([1.7,5.0,2.5],dtype=np.float64)
        scale=math.tan(math.radians(fov)/2)
        cam=np.column_stack((
            (screen[:,0]/(size-1)*2-1)*depth*scale,
            (1-screen[:,1]/(size-1)*2)*depth*scale,
            depth))
        right, up, forward=camera_basis(np.zeros(3),np.array([0,0,1.]),[0,1,0])
        world=(cam[:,0,None]*right[None,:]+cam[:,1,None]*up[None,:]
               +cam[:,2,None]*forward[None,:])
        rgb=np.array([[1.,0.,0.],[0.,1.,0.],[0.,0.,1.]])
        factor=np.array([.8,.6,.4])
        primitive=Primitive(world,np.tile([0.,0.,1.],(3,1)),
                            np.array([[0,1,2]]),factor,0.,.7,0,"gradient",
                            vertex_colors=rgb)
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/"albedo.png"
            pbr_render([primitive],np.zeros(3),np.array([0,0,1.]),
                       output,size=size,mode="albedo",up_hint=[0,1,0],
                       deadline=None,fov=fov,tile_size=16)
            actual=np.asarray(Image.open(output))[32,32].astype(np.int64)
        a,b,c=screen
        px=py=32
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        w0=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den
        w1=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den
        w2=1-w0-w1
        affine=np.array([w0,w1,w2])
        self.assertTrue(np.all(affine>0))
        perspective=(affine/depth)/(affine/depth).sum()
        linear=(perspective@rgb)*factor
        transfer=np.where(linear<=.0031308,12.92*linear,
                          1.055*np.power(linear,1/2.4)-.055)
        expected=np.round(transfer*255).astype(np.int64)
        np.testing.assert_allclose(actual,expected,atol=1)
        self.assertGreater(np.max(abs(perspective-affine)),.08)
        np.testing.assert_array_less(actual, [256,256,256])


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class ColorVisibilityGateTests(unittest.TestCase):
    def test_color0_albedo_refuses_before_cache_writes_but_normals_work(self):
        vertices=np.array([[-.5,-.5,0],[.5,-.5,0],[0,.5,0]],dtype=np.float64)
        primitive=Primitive(vertices,np.tile([0.,0.,1.],(3,1)),
                            np.array([[0,1,2]]),np.ones(3),0.,.8,0,"fur",
                            vertex_colors=np.tile([.1,.05,.02],(3,1)))
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/"cache"
            kwargs={"tile_size":16,"threads":1,"max_working_mib":512,
                    "cache_root":folder,"glb_sha":"a"*64,
                    "frame_sha":"b"*64,"frame_digest":"c"*64}
            args=([primitive],np.array([0,0,-4.]),np.zeros(3),
                  np.array([0,1.,0]),65,64)
            with self.assertRaisesRegex(ValueError,"VERTEX_COLOR_UNSUPPORTED"):
                render_bundle(*args,("normal","object-id","albedo"),**kwargs)
            self.assertFalse(folder.exists())
            images,stats=render_bundle(*args,("normal","object-id"),**kwargs)
            self.assertEqual(set(images),{"normal","object-id"})
            self.assertGreater(stats["coveredPixels"],0)
            self.assertFalse(stats["cacheHit"])
            with self.assertRaisesRegex(ValueError,"VERTEX_COLOR_UNSUPPORTED"):
                render_bundle(*args,("albedo",),**kwargs)
            self.assertEqual(len(list(folder.glob("*/manifest.json"))),1)


if __name__=="__main__":
    unittest.main()

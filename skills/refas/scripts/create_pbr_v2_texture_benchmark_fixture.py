#!/usr/bin/env python3
"""Deterministic SYNTHETIC glTF baseColorTexture stress, never source evidence."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

from benchmark_render_cpu import create_fixture
from render_glb import accessor, parse_glb


def make_fixture(path,frame,side=1024,triangles=120,seed=137,filter_mode=9987):
    if side not in (256,512,1024) or not 1<=triangles<=30000:
        raise ValueError("PBR_V2_BENCH_INVALID: fixture bounds")
    create_fixture(path,frame,"hard-surface",triangles,seed)
    model,binary=parse_glb(path)
    primitive=model["meshes"][0]["primitives"][0]
    xyz=accessor(model,binary,primitive["attributes"]["POSITION"]).astype(np.float32)
    uv=np.ascontiguousarray(np.column_stack((
        xyz[:,0]*7.25+.31, xyz[:,1]*5.35+.37)),dtype="<f4")
    yy,xx=np.mgrid[:side,:side]
    grid=np.empty((side,side,4),dtype=np.uint8)
    grid[:,:,0]=np.where(((xx//3+yy//5)%2)==0,8,246)
    grid[:,:,1]=np.mod(xx*19+yy*7,256).astype(np.uint8)
    grid[:,:,2]=np.where(((xx//17+yy//29)%2)==0,45,218)
    grid[:,:,3]=255
    encoded=io.BytesIO()
    Image.fromarray(grid,mode="RGBA").save(encoded,format="PNG",optimize=False)
    png=encoded.getvalue()
    data=bytearray(binary)
    def extend(contents):
        while len(data)%4: data.append(0)
        start=len(data);data.extend(contents)
        return start
    uvstart=extend(uv.tobytes())
    view=len(model["bufferViews"])
    model["bufferViews"].append({
        "buffer":0,"byteOffset":uvstart,"byteLength":uv.nbytes})
    acc=len(model["accessors"])
    model["accessors"].append({
        "bufferView":view,"componentType":5126,
        "count":len(uv),"type":"VEC2"})
    primitive["attributes"]["TEXCOORD_0"]=acc
    image_start=extend(png)
    image_view=len(model["bufferViews"])
    model["bufferViews"].append({
        "buffer":0,"byteOffset":image_start,"byteLength":len(png)})
    model["images"]=[{"bufferView":image_view,"mimeType":"image/png"}]
    model["samplers"]=[{"magFilter":9729,"minFilter":filter_mode,
                        "wrapS":10497,"wrapT":33648}]
    model["textures"]=[{"source":0,"sampler":0}]
    model["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]={"index":0}
    while len(data)%4: data.append(0)
    model["buffers"][0]["byteLength"]=len(data)
    payload=json.dumps(model,separators=(",",":")).encode("utf8")
    payload+=b" "*(-len(payload)%4)
    with path.open("wb") as fp:
        fp.write(struct.pack("<III",0x46546c67,2,12+8+len(payload)+8+len(data)))
        fp.write(struct.pack("<II",len(payload),0x4e4f534a))
        fp.write(payload)
        fp.write(struct.pack("<II",len(data),0x004e4942))
        fp.write(data)
    return {
        "sourceKind":"SYNTHETIC_TEXTURE_STRESS",
        "glbSha256":hashlib.sha256(path.read_bytes()).hexdigest(),
        "frameFileSha256":hashlib.sha256(frame.read_bytes()).hexdigest(),
        "triangleCount":triangles,"textureResolution":[side,side],
        "texturePngEncodedBytes":len(png),"sampler":filter_mode,"seed":seed}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--out-glb",required=True,type=Path)
    p.add_argument("--out-frame",required=True,type=Path)
    p.add_argument("--size",default=1024,type=int)
    p.add_argument("--triangles",default=120,type=int)
    p.add_argument("--seed",default=137,type=int)
    p.add_argument("--filter",default=9987,type=int)
    a=p.parse_args()
    print(json.dumps(make_fixture(a.out_glb,a.out_frame,a.size,a.triangles,a.seed,a.filter),
                     sort_keys=True))


if __name__=="__main__":
    main()

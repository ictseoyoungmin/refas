#!/usr/bin/env python3
"""Opt-in deterministic synthetic GLB with both COLOR_0 and PNG base color.

Never substitute this fixture for the user's Monster Bed source.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import numpy as np

from render_glb import accessor,parse_glb
from create_pbr_v2_texture_benchmark_fixture import make_fixture


def generate(glb,frame,*,side=256,triangles=120,seed=1903):
    data=make_fixture(glb,frame,side,triangles,seed,9987)
    model,binary=parse_glb(glb)
    primitive=model["meshes"][0]["primitives"][0]
    pos=accessor(model,binary,primitive["attributes"]["POSITION"])
    count=len(pos)
    src=np.column_stack((
        np.clip(.14+.22*np.sin(pos[:,0]*13),.02,.55),
        np.clip(.035+.10*np.cos(pos[:,1]*11),.01,.22),
        np.full(count,.025)
    )).astype("<f4")
    raw=bytearray(binary)
    while len(raw)%4: raw.append(0)
    start=len(raw)
    raw.extend(src.tobytes())
    while len(raw)%4: raw.append(0)
    view=len(model["bufferViews"])
    model["bufferViews"].append({
        "buffer":0,"byteOffset":start,"byteLength":src.nbytes})
    acc=len(model["accessors"])
    model["accessors"].append({
        "bufferView":view,"componentType":5126,
        "count":count,"type":"VEC3"})
    primitive["attributes"]["COLOR_0"]=acc
    model["buffers"][0]["byteLength"]=len(raw)
    js=json.dumps(model,separators=(",",":")).encode()
    js+=b" "*(-len(js)%4)
    with glb.open("wb") as f:
        f.write(struct.pack("<III",0x46546c67,2,12+8+len(js)+8+len(raw)))
        f.write(struct.pack("<II",len(js),0x4e4f534a))
        f.write(js)
        f.write(struct.pack("<II",len(raw),0x004e4942))
        f.write(raw)
    data.update({
        "sourceKind":"SYNTHETIC_EXTERNAL_ENGINE_COLOR0_TEXTURE",
        "glbSha256":hashlib.sha256(glb.read_bytes()).hexdigest(),
        "frameFileSha256":hashlib.sha256(frame.read_bytes()).hexdigest(),
        "color0Vertices":count})
    return data


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--glb",type=Path,required=True)
    p.add_argument("--frame",type=Path,required=True)
    p.add_argument("--side",type=int,default=256)
    p.add_argument("--triangles",type=int,default=120)
    a=p.parse_args()
    print(json.dumps(generate(a.glb,a.frame,side=a.side,triangles=a.triangles),
                     sort_keys=True))

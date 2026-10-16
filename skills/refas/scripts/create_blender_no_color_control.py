#!/usr/bin/env python3
"""Build a geometry/texture IDENTICAL no-COLOR_0 comparison fixture.

This is a test counterfactual. Never apply it to the private user GLB.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

from render_glb import parse_glb


def make_control(source, out):
    if out.exists():
        raise ValueError("R14E_INVALID_OUTPUT: refuses overwrite")
    model, binary=parse_glb(source)
    changed=0
    for mesh in model.get("meshes",[]):
        for primitive in mesh.get("primitives",[]):
            changed+=1 if primitive["attributes"].pop("COLOR_0",None) is not None else 0
    if changed<1:
        raise ValueError("R14E_INVALID_ASSET: source has no COLOR_0 to remove")
    # Identical packed geometry, indices, UV, material and PNG bytes. Only
    # the glTF attribute reference is absent in this explicit control.
    js=json.dumps(model,separators=(",",":")).encode()
    js+=b" "*(-len(js)%4)
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("wb") as f:
        f.write(struct.pack("<III",0x46546c67,2,12+8+len(js)+8+len(binary)))
        f.write(struct.pack("<II",len(js),0x4e4f534a))
        f.write(js)
        f.write(struct.pack("<II",len(binary),0x004e4942))
        f.write(binary)
    return {"sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),
            "controlSha256":hashlib.sha256(out.read_bytes()).hexdigest(),
            "removedColorAttributes":changed,"geometryModified":False}


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(make_control(a.source,a.out),sort_keys=True))

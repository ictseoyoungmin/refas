#!/usr/bin/env python3
"""R14-06E1 Blender CLI process adapter with typed source/camera/output proof.

The independent Cycles renderer must be *actually executed* before a result
is accepted. An uninstalled Blender backend fails as UNAVAILABLE rather than
silently falling back to RefAs's own CPU material preview.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image
import numpy as np

from render_glb import (load_canonical_frame,local_to_world,parse_glb)

PROFILE="RefAs Blender Cycles External/0.1.0-experimental"
SCHEMA="refas.external-pbr-preview/v1"


def sha(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()


def preflight(path, frame, size, *, max_mib=2048):
    if size not in (96,160,384,512) or max_mib<256 or max_mib>8192:
        raise ValueError("R14E_UNSUPPORTED: image size or memory budget")
    if path.stat().st_size>100*1024*1024 or path.stat().st_size*3>max_mib*1024*1024:
        raise MemoryError("R14E_RESOURCE: GLB too large for adapter")
    source_sha=sha(path)
    model,buffer=parse_glb(path)
    if model.get("extensionsRequired") or model.get("skins") or model.get("animations"):
        raise ValueError("R14E_UNSUPPORTED: required extensions or deformation")
    supported_attrs={"POSITION","NORMAL","TEXCOORD_0","COLOR_0"}
    source_meshes=model.get("meshes",[])
    node_total=0
    has_colors=False
    for node in model.get("nodes",[]):
        if "mesh" not in node: continue
        node_total+=1
        mesh=source_meshes[node["mesh"]]
        for piece in mesh["primitives"]:
            attrs=piece.get("attributes",{})
            if piece.get("mode",4)!=4 or piece.get("targets") or not {"POSITION","NORMAL"}<=set(attrs) or set(attrs)-supported_attrs:
                raise ValueError("R14E_UNSUPPORTED: non-triangle/morph/tangent attribute")
            has_colors=has_colors or "COLOR_0" in attrs
    for mat in model.get("materials",[]):
        if mat.get("alphaMode","OPAQUE")!="OPAQUE" or mat.get("extensions"):
            raise ValueError("R14E_UNSUPPORTED: alpha or material extensions")
        if mat.get("normalTexture") or mat.get("occlusionTexture") or mat.get("emissiveTexture") or any(
                abs(c)>1e-12 for c in mat.get("emissiveFactor",[0,0,0])):
            raise ValueError("R14E_UNSUPPORTED: material maps and emissive")
        pbr=mat.get("pbrMetallicRoughness",{})
        if any(x not in ("baseColorFactor","metallicFactor","roughnessFactor","baseColorTexture") for x in pbr):
            raise ValueError("R14E_UNSUPPORTED: metallic-roughness texture")
        tex=pbr.get("baseColorTexture")
        if tex is not None and (tex.get("texCoord",0)!=0 or tex.get("extensions")):
            raise ValueError("R14E_UNSUPPORTED: nonprimary UV or texture transform")
    for image in model.get("images",[]):
        if image.get("mimeType")!="image/png" or "bufferView" not in image:
            raise ValueError("R14E_UNSUPPORTED: external/JPEG image")
    for texture in model.get("textures",[]):
        if texture.get("extensions"):
            raise ValueError("R14E_UNSUPPORTED: texture extensions")
    if not node_total:
        raise ValueError("R14E_INVALID_ASSET: no renderable mesh nodes")
    # This does not require flattening/dropping GLB source triangles.
    total=0
    color_triangles=0
    for node in model.get("nodes",[]):
        if "mesh" in node:
            for piece in source_meshes[node["mesh"]]["primitives"]:
                if "indices" not in piece:
                    raise ValueError("R14E_UNSUPPORTED: unindexed source primitives")
                count=int(model["accessors"][piece["indices"]]["count"])
                if count<=0 or count%3:
                    raise ValueError("R14E_INVALID_ASSET: triangle index count")
                total+=count//3
                if "COLOR_0" in piece["attributes"]:
                    color_triangles+=count//3
    if not 1<=total<=2_000_000:
        raise MemoryError("R14E_RESOURCE: source triangle budget")
    canonical,basis,origin,frame_digest=load_canonical_frame(frame)
    hero=canonical.get("hero")
    if not hero:
        raise ValueError("R14E_INVALID_CAMERA: canonical Hero required")
    pos=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    right=np.cross(target-pos,up)
    if np.linalg.norm(right)<1e-10:
        raise ValueError("R14E_INVALID_CAMERA: singular")
    if sha(path)!=source_sha:
        raise ValueError("R14E_SOURCE_MUTATED: changed during preflight")
    return {
        "sourceGlbSha256":source_sha,
        "frameFileSha256":sha(frame),
        "frameDigest":frame_digest,
        "sourceTriangles":total,"sourceUsesColor0":has_colors,
        "sourceColor0Triangles":color_triangles,
        "sourcePrimitiveCount":sum(len(source_meshes[n["mesh"]]["primitives"])
                                    for n in model.get("nodes",[]) if "mesh" in n),
        "camera":{
            "position":pos.tolist(),"target":target.tolist(),"up":up.tolist(),
            "fovY":float(hero.get("fovY",31)),
            "registration": "UNREGISTERED-NONAUTHORITATIVE"
        }
    }


def run(glb,frame,out,*,blender="blender",size=160,samples=12,
        threads=4,timeout=240,max_working_mib=2048):
    if out.exists():
        raise ValueError("R14E_INVALID_OUTPUT: refuses stale destination")
    if not 2<=samples<=128 or not 1<=threads<=16 or not 30<=timeout<=900:
        raise ValueError("R14E_UNSUPPORTED: sample/thread/timeout budget")
    bound=preflight(glb,frame,size,max_mib=max_working_mib)
    executable=shutil.which(blender) if not Path(blender).is_file() else blender
    if not executable:
        raise RuntimeError("R14E_BACKEND_UNAVAILABLE: Blender executable not installed")
    worker=Path(__file__).with_name("render_external_blender_worker.py")
    if not worker.is_file():
        raise RuntimeError("R14E_BACKEND_UNAVAILABLE: Blender worker script absent")
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".refas-external-pbr-",dir=out.parent) as temp:
        tmp=Path(temp)
        config={
            "glb":str(glb.resolve()),"sourceGlbSha256":bound["sourceGlbSha256"],
            "sourceUsesColor0":bound["sourceUsesColor0"],
            "expectedTriangles":bound["sourceTriangles"],
            "camera":bound["camera"],"resolution":size,
            "threads":threads,"samples":samples,
            "png":str(tmp/"render.png"),"result":str(tmp/"worker.json"),
            "lights":[
                {"direction":[-.55,.75,.65],"intensity":2.8,"rgb":[1,.96,.9]},
                {"direction":[.72,.18,.54],"intensity":1.3,"rgb":[.70,.82,1]},
                {"direction":[-.15,-.62,.77],"intensity":.5,"rgb":[1,.76,.58]}
            ]
        }
        (tmp/"config.json").write_text(json.dumps(config,sort_keys=True))
        cmd=[str(executable),"--background","--factory-startup",
             "--python",str(worker),"--","--config",str(tmp/"config.json")]
        start=time.perf_counter()
        try:
            proc=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout,check=False,
                                env={**os.environ,"OMP_NUM_THREADS":str(threads)})
        except subprocess.TimeoutExpired as error:
            raise RuntimeError("R14E_BACKEND_TIMEOUT: Blender exceeded budget") from error
        wall_ms=round((time.perf_counter()-start)*1000,3)
        if proc.returncode!=0 or not (tmp/"worker.json").is_file():
            raise RuntimeError("R14E_RENDER_FAILED: Blender exit="+str(proc.returncode)+
                               " stderr="+proc.stderr[-2200:]+
                               " stdout="+proc.stdout[-1200:])
        result=json.loads((tmp/"worker.json").read_text())
        with Image.open(tmp/"render.png") as img:
            if img.size!=(size,size) or img.mode not in ("RGB","RGBA"):
                raise ValueError("R14E_OUTPUT_INVALID: PNG resolution/mode")
            rgb=img.convert("RGB")
            pixels=np.asarray(rgb)
            if len(np.unique(pixels.reshape(-1,3),axis=0))<2:
                raise ValueError("R14E_OUTPUT_INVALID: constant image")
        if result["triangleCount"]!=bound["sourceTriangles"] or result["sourceGlbSha256"]!=bound["sourceGlbSha256"]:
            raise ValueError("R14E_SOURCE_MISMATCH: importer mutated source triangle inventory")
        if bound["sourceUsesColor0"] and (
                not result["colorAttributes"] or not result.get("boundColorMaterialNodes")):
            raise ValueError("R14E_MATERIAL_MISMATCH: original COLOR_0 not connected to shading")
        if sha(glb)!=bound["sourceGlbSha256"] or sha(frame)!=bound["frameFileSha256"]:
            raise ValueError("R14E_SOURCE_MUTATED: source or camera changed during job")
        image_sha=sha(tmp/"render.png")
        if image_sha!=result["imageSha256"]:
            raise ValueError("R14E_OUTPUT_INVALID: worker hash mismatch")
        report={
            "schema":SCHEMA,"status":"COMPLETE",
            "claimScope":"external-pbr-preview-only","certificationEligible":False,
            "backend":{"name":PROFILE,"executable":Path(executable).name,
                       "workerSha256":sha(worker),
                       "engine":"Blender Cycles CPU",
                       "version":result["blenderVersion"],
                       "samples":samples,"threads":threads},
            "source":bound,
            "materialEvidence":{"sourceUsesColor0":bound["sourceUsesColor0"],
                "importedColorAttributes":result["colorAttributes"],
                "boundColorMaterialNodes":result.get("boundColorMaterialNodes",[]),
                "supportedForThisSlice":["opaque","COLOR_0","baseColorFactor",
                   "baseColorTexture-PNG","metallicFactor","roughnessFactor"],
                "unsupported":["alpha-blend","alpha-mask","normal-map",
                   "metallic-roughness-texture","unsupported-extensions"]},
            "importerEvidence":{
                "importedTriangles":result["triangleCount"],
                "importedMeshObjects":result["meshObjects"],
                "colorBearingImportedTriangles":result.get("colorBearingImportedTriangles"),
                "peakProcessRssKiB":result.get("peakProcessRssKiB")
            },
            "output":{"path":"render.png","sha256":image_sha,
                      "size":[size,size]},
            "timingsMs":{"blenderProcess":wall_ms,
                         "glbImport":result["importMs"],
                         "cyclesRender":result["renderMs"]},
            "cameraAuthority":"UNREGISTERED-DIAGNOSTIC",
            "crossRendererEquivalence":"NOT_ESTABLISHED",
            "referencePhotoResemblance":"NOT_EVALUATED"
        }
        (tmp/"report.json").write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")
        # Do not publish path to private local input/source. Only image + manifest.
        os.mkdir(tmp/"publish")
        shutil.copy2(tmp/"render.png",tmp/"publish/render.png")
        shutil.copy2(tmp/"report.json",tmp/"publish/report.json")
        if out.exists():
            raise ValueError("R14E_INVALID_OUTPUT: appeared while rendering")
        os.rename(tmp/"publish",out)
        return report


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--glb",type=Path,required=True)
    p.add_argument("--frame",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--blender",default="blender")
    p.add_argument("--size",type=int,default=160)
    p.add_argument("--samples",type=int,default=12)
    p.add_argument("--threads",type=int,default=4)
    p.add_argument("--timeout",type=int,default=240)
    p.add_argument("--max-working-mb",type=int,default=2048)
    a=p.parse_args()
    report=run(a.glb,a.frame,a.out,blender=a.blender,size=a.size,
               samples=a.samples,threads=a.threads,timeout=a.timeout,
               max_working_mib=a.max_working_mb)
    print(json.dumps({"status":report["status"],
                      "claimScope":report["claimScope"],
                      "sha256":report["output"]["sha256"],
                      "report":str(a.out/"report.json")}))


if __name__=="__main__":
    main()

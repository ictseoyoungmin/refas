#!/usr/bin/env python3
"""R14-06E2 private original-source Cycles capture and evidence verifier.

This is an opt-in LOCAL command. It never uploads any source or claims
photo registration/PBR equivalence. Only the actual Blender adapter may
produce child reports; this verifier refuses mismatched or missing proofs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time

from PIL import Image, ImageOps, ImageDraw

from render_external_blender import run as run_blender, sha

SCHEMA = "refas.external-pbr-private-source-session/v1"
ORIGINAL_MONSTER_SHA = "30f8e135a34470366780b9b600040dff823171dfe857e7e4ab681c520a95f8d7"
ORIGINAL_FRAME_SHA = "76074dec7ae1dd8accc00453426f13d8070c45dc0f696dfe01ed5739b2e2a5a1"
ORIGINAL_MONSTER_TRIANGLES = 901664
ORIGINAL_MONSTER_PRIMITIVES = 40


def validate_capture(report, image, *, source_sha, frame_sha, triangles,
                     primitives, size, minimum_color0_triangles=1):
    """Validate a *completed* actual Blender result against independent input.

    This is only a report consistency check, NOT a trust certification.
    """
    if not isinstance(report,dict) or report.get("schema")!="refas.external-pbr-preview/v1":
        raise ValueError("R14E2_INVALID_EVIDENCE: external report schema")
    if (report.get("status")!="COMPLETE" or report.get("claimScope")!="external-pbr-preview-only"
            or report.get("certificationEligible") is not False
            or report.get("crossRendererEquivalence")!="NOT_ESTABLISHED"
            or report.get("cameraAuthority")!="UNREGISTERED-DIAGNOSTIC"):
        raise ValueError("R14E2_INVALID_EVIDENCE: authority scope")
    backend=report.get("backend",{})
    if backend.get("engine")!="Blender Cycles CPU" or not backend.get("version") or not backend.get("workerSha256"):
        raise ValueError("R14E2_INVALID_EVIDENCE: independent worker identity")
    source=report.get("source",{})
    if (source.get("sourceGlbSha256")!=source_sha or
            source.get("frameFileSha256")!=frame_sha or
            source.get("sourceTriangles")!=triangles or
            source.get("sourcePrimitiveCount")!=primitives):
        raise ValueError("R14E2_INVALID_EVIDENCE: original source inventory")
    if source.get("sourceUsesColor0") is not True or (
            source.get("sourceColor0Triangles",0)<minimum_color0_triangles):
        raise ValueError("R14E2_INVALID_EVIDENCE: required original COLOR_0 faces missing")
    material=report.get("materialEvidence",{})
    if (material.get("sourceUsesColor0") is not True or
            not material.get("importedColorAttributes") or
            not material.get("boundColorMaterialNodes")):
        raise ValueError("R14E2_INVALID_EVIDENCE: imported COLOR_0 not bound")
    if report.get("output",{}).get("size")!=[size,size]:
        raise ValueError("R14E2_INVALID_EVIDENCE: camera frame size")
    if report["output"].get("sha256")!=sha(image):
        raise ValueError("R14E2_INVALID_EVIDENCE: image digest")
    with Image.open(image) as png:
        png.verify()
    with Image.open(image) as png:
        if png.size!=(size,size) or png.mode not in ("RGB","RGBA"):
            raise ValueError("R14E2_INVALID_EVIDENCE: image format")
        extrema=png.convert("RGB").getextrema()
        if not any(lo != hi for lo,hi in extrema):
            raise ValueError("R14E2_INVALID_EVIDENCE: constant image")
    # Native Blender worker reports imported total separately from source
    # inventory in newer versions. Do not invent it for old workers.
    import_result=report.get("importerEvidence",{})
    if import_result.get("importedTriangles")!=triangles:
        raise ValueError("R14E2_INVALID_EVIDENCE: imported triangles")
    if not isinstance(import_result.get("importedMeshObjects"),int) or (
            import_result["importedMeshObjects"]<1):
        raise ValueError("R14E2_INVALID_EVIDENCE: imported Blender meshes")
    if not isinstance(import_result.get("colorBearingImportedTriangles"),int) or (
            import_result["colorBearingImportedTriangles"]<minimum_color0_triangles):
        raise ValueError("R14E2_INVALID_EVIDENCE: colored imported geometry missing")
    return {
        "size": size, "pngSha256":report["output"]["sha256"],
        "backendVersion": backend["version"],
        "workerSha256": backend["workerSha256"],
        "importedTriangles": import_result.get("importedTriangles"),
        "sourceTriangles": source["sourceTriangles"],
        "sourcePrimitiveCount": source["sourcePrimitiveCount"],
        "sourceColor0Triangles": source["sourceColor0Triangles"],
        "colorBearingImportedTriangles": import_result["colorBearingImportedTriangles"],
        "importedColorAttributes": len(material["importedColorAttributes"]),
        "linkedColorMaterialNodes": len(material["boundColorMaterialNodes"]),
        "timingsMs": report.get("timingsMs"),
        "peakProcessRssKiB": import_result.get("peakProcessRssKiB"),
        "claimScope": "external-pbr-preview-only",
        "certificationEligible": False
    }


def make_board(frames, out):
    """Only real observed Blender PNGs; no generated stand-in image."""
    slots=[]
    for resolution,path in frames.items():
        with Image.open(path) as img:
            rgb=img.convert("RGB")
            thumb=ImageOps.contain(rgb,(512,512))
            canvas=Image.new("RGB",(544,568),(30,33,38))
            canvas.paste(thumb,((544-thumb.width)//2,(536-thumb.height)//2))
            ImageDraw.Draw(canvas).text((12,542),f"Blender Cycles {resolution}px | diagnostic only",
                                        fill=(226,230,235))
            slots.append(canvas)
    board=Image.new("RGB",(544*len(slots),568),(20,22,25))
    for index,item in enumerate(slots):
        board.paste(item,(index*544,0))
    board.save(out)


def run_private_session(*, glb, frame, output, blender, expected_glb_sha,
                        expected_frame_sha, expected_triangles,
                        expected_primitives, minimum_color0_triangles=1,
                        sizes=(160,384), samples=12,
                        threads=4, timeout=900, max_working_mib=2048):
    glb=Path(glb).resolve();frame=Path(frame).resolve();output=Path(output)
    if output.exists():
        raise ValueError("R14E2_INVALID_OUTPUT: refuses existing session")
    if not sizes or len(set(sizes))!=len(sizes) or any(x not in (96,160,384,512) for x in sizes):
        raise ValueError("R14E2_UNSUPPORTED: resolutions")
    if not isinstance(expected_glb_sha,str) or len(expected_glb_sha)!=64:
        raise ValueError("R14E2_INVALID_ASSET: expected SHA required")
    if not isinstance(expected_frame_sha,str) or len(expected_frame_sha)!=64:
        raise ValueError("R14E2_INVALID_CAMERA: expected SHA required")
    if sha(glb)!=expected_glb_sha or sha(frame)!=expected_frame_sha:
        raise ValueError("R14E2_SOURCE_MUTATED: input SHA mismatch")
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".r14e2-private-",dir=output.parent) as d:
        staged=Path(d)
        reports=[]
        frames={}
        started=time.perf_counter()
        for size in sizes:
            folder=staged/f"view-{size}"
            report=run_blender(glb,frame,folder,blender=str(blender),
                        size=size,samples=samples,threads=threads,
                        timeout=timeout,max_working_mib=max_working_mib)
            image=folder/"render.png"
            result=validate_capture(report,image,
                source_sha=expected_glb_sha,frame_sha=expected_frame_sha,
                triangles=expected_triangles,primitives=expected_primitives,
                size=size,minimum_color0_triangles=minimum_color0_triangles)
            reports.append(result)
            frames[size]=image
        if len({v["backendVersion"] for v in reports})!=1 or len(
                {v["workerSha256"] for v in reports})!=1:
            raise ValueError("R14E2_INVALID_EVIDENCE: mixed Blender workers across views")
        if sha(glb)!=expected_glb_sha or sha(frame)!=expected_frame_sha:
            raise ValueError("R14E2_SOURCE_MUTATED: input modified during session")
        make_board(frames,staged/"qa-board.png")
        manifest={
            "schema":SCHEMA,"status":"COMPLETE",
            "claimScope":"external-pbr-preview-only","certificationEligible":False,
            "referencePhotoResemblance":"NOT_EVALUATED",
            "crossRendererEquivalence":"NOT_ESTABLISHED",
            "cameraAuthority":"UNREGISTERED-DIAGNOSTIC",
            "input":{"originalGlbSha256":expected_glb_sha,
                     "frameFileSha256":expected_frame_sha,
                     "expectedSourceTriangles":expected_triangles,
                     "expectedPrimitiveCount":expected_primitives,
                     "minimumColor0Triangles":minimum_color0_triangles},
            "runtime":{"blenderVersion":reports[0]["backendVersion"],
                       "workerSha256":reports[0]["workerSha256"],
                       "threads":threads,"samples":samples,
                       "maxWorkingMiB":"preflight only; not process OS memory cap",
                       "wallIncludingImportAndProcessMs":round(
                           (time.perf_counter()-started)*1000,3)},
            "views":reports,
            "board":{"path":"qa-board.png","sha256":sha(staged/"qa-board.png")}
        }
        (staged/"session-report.json").write_text(json.dumps(
            manifest,indent=2,sort_keys=True)+"\n",encoding="utf-8")
        # No source GLB or source camera file is ever copied into output.
        if output.exists():
            raise ValueError("R14E2_INVALID_OUTPUT: target appeared during render")
        os.rename(staged,output)
        return manifest


def main():
    p=argparse.ArgumentParser(description="Private Blender full-original-scene QA")
    p.add_argument("--glb",type=Path,required=True)
    p.add_argument("--frame",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--blender",required=True,
                   help="Path to installed Blender executable, no fallback")
    p.add_argument("--expected-glb-sha",default=ORIGINAL_MONSTER_SHA)
    p.add_argument("--expected-frame-sha",default=ORIGINAL_FRAME_SHA)
    p.add_argument("--expected-triangles",type=int,default=ORIGINAL_MONSTER_TRIANGLES)
    p.add_argument("--expected-primitives",type=int,default=ORIGINAL_MONSTER_PRIMITIVES)
    p.add_argument("--minimum-color0-triangles",type=int,default=512000)
    p.add_argument("--sizes",default="160,384")
    p.add_argument("--samples",type=int,default=12)
    p.add_argument("--threads",type=int,default=4)
    p.add_argument("--timeout",type=int,default=900)
    p.add_argument("--max-working-mb",type=int,default=2048)
    a=p.parse_args()
    result=run_private_session(
        glb=a.glb,frame=a.frame,output=a.out,blender=a.blender,
        expected_glb_sha=a.expected_glb_sha,
        expected_frame_sha=a.expected_frame_sha,
        expected_triangles=a.expected_triangles,
        expected_primitives=a.expected_primitives,
        minimum_color0_triangles=a.minimum_color0_triangles,
        sizes=tuple(map(int,a.sizes.split(","))),
        samples=a.samples,threads=a.threads,timeout=a.timeout,
        max_working_mib=a.max_working_mb)
    print(json.dumps({"status":result["status"],
                      "claimScope":result["claimScope"],
                      "views":[v["size"] for v in result["views"]],
                      "sessionReport":str(a.out/"session-report.json")}))


if __name__=="__main__":
    main()

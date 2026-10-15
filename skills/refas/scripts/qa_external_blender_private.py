#!/usr/bin/env python3
"""R14-06E2: run UNMODIFIED private GLB through installed independent Cycles.

This harness never uploads original user data. It requires an actual Blender
binary on the same host, pins source + camera and collects process-tree RSS
samples. It cannot certify source-photo resemblance or PBR equivalence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

from PIL import Image


SCHEMA="refas.external-blender-private-fullsource/v1"
ORIGINAL_MONSTER_SHA=("30f8e135a34470366780b9b600040dff823171dfe857e7e4ab681c520a95f8d7")
ORIGINAL_FRAME_SHA=("76074dec7ae1dd8accc00453426f13d8070c45dc0f696dfe01ed5739b2e2a5a1")
ORIGINAL_MONSTER_TRIANGLES=901_664


def sha_file(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda:f.read(1<<20),b""):
            h.update(chunk)
    return h.hexdigest()


def proc_children(pid):
    file=Path(f"/proc/{pid}/task/{pid}/children")
    try:
        return [int(x) for x in file.read_text().split()]
    except (OSError, ValueError):
        return []


def rss_kib(pid):
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except (OSError, ValueError, IndexError):
        return 0
    return 0


def tree_rss_kib(pid):
    seen=set()
    pending=[pid]
    rss=0
    while pending:
        current=pending.pop()
        if current in seen: continue
        seen.add(current)
        rss+=rss_kib(current)
        pending.extend(proc_children(current))
    return rss


def checked_run(cmd,*,timeout_seconds,rss_cap_mib):
    """A process-tree sampled-RSS budget; not a hard OS/cgroup guarantee."""
    p=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE,text=True,start_new_session=True)
    start=time.monotonic()
    peak_kib=0
    reason=None
    while p.poll() is None:
        peak_kib=max(peak_kib,tree_rss_kib(p.pid))
        if peak_kib>rss_cap_mib*1024:
            reason="R14E2_RESOURCE: sampled Blender process-tree RSS cap exceeded"
            break
        if time.monotonic()-start>timeout_seconds:
            reason="R14E2_BACKEND_TIMEOUT: external Cycles did not complete"
            break
        time.sleep(.15)
    if reason:
        try:
            os.killpg(p.pid,signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        stdout,stderr=p.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        p.kill()
        stdout,stderr=p.communicate()
    elapsed=round((time.monotonic()-start)*1000,3)
    peak_kib=max(peak_kib,tree_rss_kib(p.pid))
    if reason:
        raise RuntimeError(reason)
    if p.returncode:
        raise RuntimeError("R14E2_EXTERNAL_FAILED: exit="+str(p.returncode)+
                           " stderr="+stderr[-2400:]+" stdout="+stdout[-1000:])
    return {
        "returnCode":p.returncode,"wallMs":elapsed,
        "sampledPeakProcessTreeRssKiB":peak_kib,
        "rssSampling":"Linux /proc tree every ~150ms; may miss transient peaks"
    }


def run(glb,frame,out,*,expected_sha,expected_frame_sha,
        expected_triangles,sizes=(160,384),samples=4,
        threads=2,blender="blender",rss_cap_mib=4800,
        per_resolution_timeout=900):
    glb=Path(glb).resolve()
    frame=Path(frame).resolve()
    out=Path(out)
    if out.exists():
        raise ValueError("R14E2_INVALID_OUTPUT: refusing existing output")
    if len(sizes)!=len(set(sizes)) or not sizes or any(x not in (96,160,384,512) for x in sizes):
        raise ValueError("R14E2_INVALID_CONFIG: resolutions")
    if not 2<=samples<=16 or not 1<=threads<=8 or not 512<=rss_cap_mib<=8192:
        raise ValueError("R14E2_INVALID_CONFIG: resource profile")
    if not 120<=per_resolution_timeout<=1800:
        raise ValueError("R14E2_INVALID_CONFIG: timeout")
    if sha_file(glb)!=expected_sha or sha_file(frame)!=expected_frame_sha:
        raise ValueError("R14E2_SOURCE_MISMATCH: original source or frame hash")
    executable=(str(Path(blender).resolve()) if Path(blender).is_file()
                else shutil.which(blender))
    if not executable:
        raise RuntimeError("R14E2_BACKEND_UNAVAILABLE: install local Blender without transferring private source")
    worker=Path(__file__).with_name("render_external_blender.py")
    if not worker.exists():
        raise RuntimeError("R14E2_BACKEND_UNAVAILABLE: reviewed E1 host adapter absent")
    entries=[]
    with tempfile.TemporaryDirectory(prefix=".refas-private-external-",
                                     dir=out.parent.resolve()) as stage:
        tmp=Path(stage)
        for size in sizes:
            dest=tmp/str(size)
            cmd=[sys.executable,str(worker),
                 "--glb",str(glb),"--frame",str(frame),
                 "--out",str(dest),"--blender",executable,
                 "--size",str(size),"--samples",str(samples),
                 "--threads",str(threads),
                 "--timeout",str(per_resolution_timeout),
                 "--max-working-mb",str(rss_cap_mib)]
            observation=checked_run(cmd,timeout_seconds=per_resolution_timeout+20,
                                    rss_cap_mib=rss_cap_mib)
            manifest=json.loads((dest/"report.json").read_text())
            if (manifest.get("status")!="COMPLETE" or
                    manifest.get("claimScope")!="external-pbr-preview-only" or
                    manifest.get("certificationEligible") is not False or
                    manifest.get("crossRendererEquivalence")!="NOT_ESTABLISHED"):
                raise ValueError("R14E2_INVALID_EVIDENCE: cannot promote backend report")
            source=manifest["source"]
            if (source["sourceGlbSha256"]!=expected_sha or
                    source["frameFileSha256"]!=expected_frame_sha or
                    source["sourceTriangles"]!=expected_triangles):
                raise ValueError("R14E2_INVALID_EVIDENCE: Blender source inventory mismatch")
            if not source["sourceUsesColor0"] or (
                    not manifest["materialEvidence"].get("boundColorMaterialNodes")):
                raise ValueError("R14E2_INVALID_EVIDENCE: source COLOR_0 shading not bound")
            png=dest/"render.png"
            if sha_file(png)!=manifest["output"]["sha256"]:
                raise ValueError("R14E2_INVALID_EVIDENCE: PNG source hash mismatch")
            with Image.open(png) as image:
                if image.size!=(size,size):
                    raise ValueError("R14E2_INVALID_EVIDENCE: external output resolution")
            entries.append({
                "resolution":[size,size],
                "importedSourceTriangles":source["sourceTriangles"],
                "importedColorAttributes":manifest["materialEvidence"]["importedColorAttributes"],
                "boundColorMaterialNodes":manifest["materialEvidence"]["boundColorMaterialNodes"],
                "blenderVersion":manifest["backend"]["version"],
                "workerSha256":manifest["backend"]["workerSha256"],
                "imageSha256":manifest["output"]["sha256"],
                "renderMs":manifest["timingsMs"]["cyclesRender"],
                "importMs":manifest["timingsMs"]["glbImport"],
                "monitor":observation
            })
        if sha_file(glb)!=expected_sha or sha_file(frame)!=expected_frame_sha:
            raise ValueError("R14E2_SOURCE_MUTATED: original input changed during execution")
        report={
            "schema":SCHEMA,"status":"COMPLETE",
            "sourceKind":"ORIGINAL_PRIVATE_GLTF",
            "sourceGlbSha256":expected_sha,
            "frameSha256":expected_frame_sha,
            "expectedSourceTriangles":expected_triangles,
            "claimScope":"external-pbr-preview-only",
            "cameraAuthority":"UNREGISTERED-DIAGNOSTIC",
            "crossRendererEquivalence":"NOT_ESTABLISHED",
            "photoResemblance":"NOT_EVALUATED",
            "certificationEligible":False,
            "originalGlbPublished":False,
            "rssBudgetMiB":rss_cap_mib,
            "memoryEnforcement":"best-effort sampled process-tree RSS; NOT cgroup/OS hard limit",
            "views":entries
        }
        (tmp/"private-render-report.json").write_text(
            json.dumps(report,indent=2,sort_keys=True)+"\n")
        if out.exists():
            raise ValueError("R14E2_INVALID_OUTPUT: destination appeared")
        shutil.copytree(tmp,out)
    return report


def main():
    p=argparse.ArgumentParser(description="Private original GLB source-bound Cycles QA")
    p.add_argument("--glb",type=Path,required=True)
    p.add_argument("--frame",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--blender",default="blender")
    p.add_argument("--expected-glb-sha",default=ORIGINAL_MONSTER_SHA)
    p.add_argument("--expected-frame-sha",default=ORIGINAL_FRAME_SHA)
    p.add_argument("--expected-triangles",type=int,default=ORIGINAL_MONSTER_TRIANGLES)
    p.add_argument("--sizes",default="160,384")
    p.add_argument("--samples",type=int,default=4)
    p.add_argument("--threads",type=int,default=2)
    p.add_argument("--rss-cap-mib",type=int,default=4800)
    p.add_argument("--timeout",type=int,default=900)
    args=p.parse_args()
    report=run(args.glb,args.frame,args.out,blender=args.blender,
               expected_sha=args.expected_glb_sha,
               expected_frame_sha=args.expected_frame_sha,
               expected_triangles=args.expected_triangles,
               sizes=tuple(int(x) for x in args.sizes.split(",")),
               samples=args.samples,threads=args.threads,
               rss_cap_mib=args.rss_cap_mib,
               per_resolution_timeout=args.timeout)
    print(json.dumps({"status":report["status"],"scope":report["claimScope"],
                      "views":[(v["resolution"],v["imageSha256"])
                               for v in report["views"]]}))


if __name__=="__main__":
    main()

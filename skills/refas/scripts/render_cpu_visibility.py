#!/usr/bin/env python3
"""R14-04: one visibility/depth pass for multiple opaque diagnostic views.

Normal/object-id/albedo are derived from one trusted input/registered hero
visibility result. Optional content-addressed cache is diagnostic-only:
never treat its PNG or visibility arrays as a source-certification proof.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import tempfile
import time

import numpy as np
from PIL import Image

from render_cpu_opt import require_supported
from render_cpu_tiled import render_hero_tiled, njit
from render_glb import MIB, load_canonical_frame, load_primitives, local_to_world, parse_glb, reject_unhandled_vertex_color

PROFILE="RefAs Visibility CPU/0.2.0-microtriangle"
SCHEMA="refas.visibility-cpu-diagnostic/v1"
CACHE_SCHEMA="refas.visibility-cache/v1"
PASSES=("normal","object-id","albedo")
BACKGROUND=np.array([12,15,19],dtype=np.uint8)
CACHE_FILES=("winner.npy","depth.npy","normal_colors.npy","primitive_ids.npy")
MAX_CACHE_BYTES=256*MIB


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    digest=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk: break
            digest.update(chunk)
    return digest.hexdigest()


def stable_bytes(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf8")


def _cache_key(*,glb_sha,frame_sha,frame_digest,position,target,up,fov,size,tile_size,threads):
    import numba
    return sha_bytes(stable_bytes({
        "schema":CACHE_SCHEMA,"profile":PROFILE,"sourceGlbSha256":glb_sha,
        "sourceFrameFileSha256":frame_sha,"canonicalFrameDigest":frame_digest,
        "camera":{"position":np.asarray(position).tolist(),
                  "target":np.asarray(target).tolist(),"up":np.asarray(up).tolist(),
                  "fovY":float(fov)},
        "size":size,"tileSize":tile_size,"threads":threads,
        "rasterWorkerSha256":sha_file(Path(__file__).with_name("render_cpu_tiled.py")),
        "visibilityWorkerSha256":sha_file(Path(__file__)),
        "numpyVersion":np.__version__,"numbaVersion":numba.__version__,
        "machine":platform.machine(),"python":platform.python_version(),
    }))


def _save_cache(root,key,arrays,stats,max_working_mib):
    root=Path(root).resolve()
    root.mkdir(parents=True,exist_ok=True)
    final=root/key
    if final.exists() or final.is_symlink():
        raise ValueError("VISIBILITY_CACHE_INVALID: cache entry appeared before publication")
    stage=Path(tempfile.mkdtemp(prefix=".refas-vis-stage-",dir=root))
    try:
        entries={}
        total=0
        for name,arr in zip(CACHE_FILES,arrays):
            arr=np.ascontiguousarray(arr)
            file=stage/name
            with open(file,"wb") as stream:
                np.save(stream,arr,allow_pickle=False)
            total+=file.stat().st_size
            entries[name]={"sha256":sha_file(file),"bytes":file.stat().st_size,
                           "shape":list(arr.shape),"dtype":str(arr.dtype)}
        if total>min(MAX_CACHE_BYTES,int(max_working_mib*MIB*.5)):
            raise MemoryError("VISIBILITY_CACHE_RESOURCE: cached payload too large")
        metadata={"schema":CACHE_SCHEMA,"key":key,"files":entries,"stats":stats,
                  "certificationEligible":False}
        (stage/"manifest.json").write_bytes(stable_bytes(metadata))
        # A directory rename publishes complete arrays and manifest together.
        os.rename(stage,final)
        return final
    finally:
        if stage.exists(): shutil.rmtree(stage,ignore_errors=True)


def _load_cache(root,key,expected_triangles,size,max_working_mib):
    root=Path(root).resolve()
    final=root/key
    if final.is_symlink():
        raise ValueError("VISIBILITY_CACHE_INVALID: linked cache directory")
    if not final.exists(): return None
    if not final.is_dir() or final.resolve()!=final:
        raise ValueError("VISIBILITY_CACHE_INVALID: cache directory path")
    manifest_path=final/"manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size>128*1024:
        raise ValueError("VISIBILITY_CACHE_INVALID: manifest missing or oversized")
    try:
        manifest=json.loads(manifest_path.read_text(encoding="utf8"))
    except (OSError,ValueError) as exc:
        raise ValueError("VISIBILITY_CACHE_INVALID: unparseable manifest") from exc
    if (manifest.get("schema")!=CACHE_SCHEMA or manifest.get("key")!=key
            or manifest.get("certificationEligible") is not False
            or set(manifest.get("files",{}))!=set(CACHE_FILES)):
        raise ValueError("VISIBILITY_CACHE_INVALID: wrong cache identity")
    total=0
    arrays=[]
    for name in CACHE_FILES:
        file=final/name
        entry=manifest["files"][name]
        if file.is_symlink() or not file.is_file():
            raise ValueError("VISIBILITY_CACHE_INVALID: linked or missing buffer")
        actual_size=file.stat().st_size
        if actual_size>MAX_CACHE_BYTES or actual_size<64 or actual_size!=entry.get("bytes"):
            raise ValueError("VISIBILITY_CACHE_INVALID: invalid buffer size")
        total+=actual_size
        if total>min(MAX_CACHE_BYTES,int(max_working_mib*MIB*.5)):
            raise MemoryError("VISIBILITY_CACHE_RESOURCE: cached payload over budget")
        if sha_file(file)!=entry.get("sha256"):
            raise ValueError("VISIBILITY_CACHE_INVALID: buffer digest mismatch")
        try:
            array=np.load(file,allow_pickle=False,mmap_mode="r",max_header_size=2048)
        except (OSError,ValueError,TypeError) as exc:
            raise ValueError("VISIBILITY_CACHE_INVALID: malformed ndarray") from exc
        if list(array.shape)!=entry.get("shape") or str(array.dtype)!=entry.get("dtype"):
            raise ValueError("VISIBILITY_CACHE_INVALID: buffer metadata mismatch")
        arrays.append(array)
    winner,depth,colors,pids=arrays
    if (winner.dtype!=np.int64 or winner.shape!=(size,size) or
        depth.dtype!=np.float64 or depth.shape!=(size,size) or
        colors.dtype!=np.uint8 or colors.shape!=(2*expected_triangles,3) or
        pids.dtype!=np.int64 or pids.shape!=(expected_triangles,)):
        raise ValueError("VISIBILITY_CACHE_INVALID: unsupported buffer contract")
    if (np.any(winner < -1) or np.any(winner >= 2*expected_triangles) or
        not np.isfinite(depth[winner>=0]).all() or
        not np.isposinf(depth[winner<0]).all()):
        raise ValueError("VISIBILITY_CACHE_INVALID: inconsistent visibility")
    stats=manifest.get("stats")
    if not isinstance(stats,dict) or stats.get("inputTriangles")!=expected_triangles:
        raise ValueError("VISIBILITY_CACHE_INVALID: triangle metadata mismatch")
    return (winner,depth,colors,pids),stats


def _srgb(colors):
    clipped=np.clip(colors,0.,1.)
    return np.round(np.power(clipped,1./2.2)*255).astype(np.uint8)


def _shade_passes(winner,normal_colors,primitive_ids,primitives,passes):
    h,w=winner.shape
    mask=winner>=0
    output={}
    flattened=winner[mask]
    if len(flattened):
        if np.any(flattened//2>=len(primitive_ids)):
            raise ValueError("VISIBILITY_CACHE_INVALID: invalid triangle references")
        primitive_at_pixel=primitive_ids[flattened//2]
        if np.any(primitive_at_pixel<0) or np.any(primitive_at_pixel>=len(primitives)):
            raise ValueError("VISIBILITY_CACHE_INVALID: invalid primitive references")
    else:
        primitive_at_pixel=np.empty(0,dtype=np.int64)
    for mode in passes:
        pixels=np.empty((h,w,3),dtype=np.uint8)
        pixels[:]=BACKGROUND
        if len(flattened):
            if mode=="normal":
                pixels[mask]=normal_colors[flattened]
            elif mode=="object-id":
                # Exactly the R14-02 primitive-ID color formula.
                ids=(primitive_at_pixel.astype(np.uint64)+1)*np.uint64(2654435761)
                rgb=np.column_stack(((ids & 255)/255.,
                     ((ids>>8)&255)/255.,((ids>>16)&255)/255.))
                pixels[mask]=_srgb(rgb)
            elif mode=="albedo":
                palette=np.asarray([p.color for p in primitives],dtype=np.float64)
                pixels[mask]=_srgb(palette[primitive_at_pixel])
            else:
                raise ValueError("VISIBILITY_CPU_UNSUPPORTED: unknown pass")
        output[mode]=pixels
    return output


def render_bundle(primitives,position,target,up,fov,size,passes,
                  *,tile_size=32,threads=1,max_working_mib=512,cache_root=None,
                  glb_sha=None,frame_sha=None,frame_digest=None):
    if njit is None:
        raise RuntimeError("VISIBILITY_CPU_UNAVAILABLE: optional Numba required")
    if not passes or len(passes)!=len(set(passes)) or any(p not in PASSES for p in passes):
        raise ValueError("VISIBILITY_CPU_UNSUPPORTED: pass list")
    # The shared winner/depth cache has no per-pixel perspective weights.
    # Reject material appearance BEFORE cache writes/reads or PNG publication.
    # Normal and Object-ID diagnostics remain available on unchanged geometry.
    if "albedo" in passes:
        reject_unhandled_vertex_color(primitives, "albedo")
    source_triangles=sum(len(p.indices) for p in primitives)
    if source_triangles<=0:
        raise ValueError("VISIBILITY_CPU_INVALID_ASSET: missing triangle faces")
    key=None
    cached=None
    if cache_root is not None:
        if not all(isinstance(v,str) and len(v)==64 and
                   all(x in "0123456789abcdef" for x in v)
                   for v in (glb_sha,frame_sha,frame_digest)):
            raise ValueError("VISIBILITY_CPU_INVALID_ASSET: cache requires verified source digests")
        key=_cache_key(glb_sha=glb_sha,frame_sha=frame_sha,frame_digest=frame_digest,
                       position=position,target=target,up=up,fov=fov,size=size,
                       tile_size=tile_size,threads=threads)
        cached=_load_cache(cache_root,key,source_triangles,size,max_working_mib)
    start=time.perf_counter()
    if cached:
        (winner,depth,colors,primitive_ids),stats=cached
        hit=True
    else:
        (normal_img,depth,winner,stats),visibility=render_hero_tiled(
            primitives,position,target,up,fov,size,"normal",tile_size=tile_size,
            threads=threads,max_working_mib=max_working_mib,return_visibility=True)
        colors=visibility["normalColorByRaster"]
        primitive_ids=visibility["primitiveIdBySourceTriangle"]
        hit=False
        if cache_root is not None:
            _save_cache(cache_root,key,(winner,depth,colors,primitive_ids),
                        stats,max_working_mib)
    visibility_ms=round((time.perf_counter()-start)*1000,3)
    start=time.perf_counter()
    images=_shade_passes(winner,colors,primitive_ids,primitives,passes)
    shade_ms=round((time.perf_counter()-start)*1000,3)
    metrics={**stats,"visibilityComputeOrLoadMs":visibility_ms,
             "shadeAllPassesMs":shade_ms,"visibilityEvaluations":0 if hit else 1,
             "passesRendered":len(passes),"cacheHit":bool(hit),
             "cacheKey":key,"claimScope":"diagnostic-only"}
    return images,metrics


def main():
    parser=argparse.ArgumentParser(description="R14-04 shared opaque diagnostic visibility passes")
    parser.add_argument("--glb",required=True)
    parser.add_argument("--frame",required=True)
    parser.add_argument("--out",required=True)
    parser.add_argument("--passes",default="normal,object-id,albedo")
    parser.add_argument("--size",type=int,default=96)
    parser.add_argument("--tile-size",type=int,choices=(16,32,64),default=32)
    parser.add_argument("--threads",type=int,choices=(1,2,4,8),default=1)
    parser.add_argument("--max-working-mb",type=int,default=512)
    parser.add_argument("--timeout-seconds",type=int,default=180)
    parser.add_argument("--cache-dir",help="Optional diagnostic-only content-addressed visibility cache")
    args=parser.parse_args()
    if njit is None: raise RuntimeError("VISIBILITY_CPU_UNAVAILABLE: install numba")
    if not 32<=args.size<=1024 or not 256<=args.max_working_mb<=2048:
        raise ValueError("VISIBILITY_CPU_RESOURCE: resolution or memory outside profile")
    passes=args.passes.split(",")
    t0=time.perf_counter()
    glb_bytes=Path(args.glb).read_bytes()
    frame_bytes=Path(args.frame).read_bytes()
    if len(glb_bytes)*2>=args.max_working_mb*MIB:
        raise MemoryError("VISIBILITY_CPU_RESOURCE: GLB exceeds resource budget")
    model,binary=parse_glb(Path(args.glb))
    require_supported(model)
    _,primitives=load_primitives(Path(args.glb),parsed=(model,binary))
    frame,basis,origin,frame_digest=load_canonical_frame(Path(args.frame))
    hero=frame.get("hero")
    if not hero: raise ValueError("VISIBILITY_CPU_INVALID_ASSET: registered Hero camera required")
    position=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    images,metrics=render_bundle(primitives,position,target,up,
        float(hero.get("fovY",31)),args.size,passes,tile_size=args.tile_size,
        threads=args.threads,max_working_mib=args.max_working_mb,
        cache_root=args.cache_dir,glb_sha=sha_bytes(glb_bytes),
        frame_sha=sha_bytes(frame_bytes),frame_digest=frame_digest)
    output=Path(args.out)
    if output.exists(): raise ValueError("VISIBILITY_CPU_INVALID_OUTPUT: refuses overwriting existing output")
    parent=output.parent.resolve()
    parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix=".refas-vis-out-",dir=parent))
    try:
        files=[]
        for mode,pixels in images.items():
            file=stage/(mode+".png")
            Image.fromarray(pixels,mode="RGB").save(file,format="PNG")
            files.append({"pass":mode,"path":file.name,"sha256":sha_file(file)})
        report={
          "schema":SCHEMA,"status":"PASS","claimScope":"diagnostic-only",
          "certificationEligible":False,"renderer":{"name":"RefAs Visibility CPU",
              "version":"0.2.0-microtriangle","backend":"numba-tiled-shared-visibility"},
          "sourceGlbSha256":sha_bytes(glb_bytes),"frameFileSha256":sha_bytes(frame_bytes),
          "canonicalFrameDigest":frame_digest,"passes":passes,"size":args.size,
          "tileSize":args.tile_size,"threads":args.threads,"stats":metrics,
          "durationMsIncludingEncode":round((time.perf_counter()-t0)*1000,3),
          "outputs":files,
        }
        (stage/"render-report.json").write_bytes(stable_bytes(report))
        if output.exists(): raise ValueError("VISIBILITY_CPU_INVALID_OUTPUT: destination appeared during render")
        os.rename(stage,output)
    finally:
        if stage.exists(): shutil.rmtree(stage,ignore_errors=True)
    print(json.dumps({"status":"PASS","passes":passes,"cacheHit":metrics["cacheHit"],
                      "outputs":[f["sha256"] for f in files]}))


if __name__=="__main__":
    main()

#!/usr/bin/env python3
"""R14-06B PBR v2 isolated geometry/visibility prototype, NOT PBR certification.

Unlike the v1 Python PBR loop, this path compiles setup/tile raster and retains
original source-triangle perspective weights after exact near-plane clipping.
No material shading, opaque PBR declaration or certification is permitted here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import os
import tempfile
import time

import numpy as np

from render_glb import (MIB, camera_basis, load_canonical_frame, load_primitives,
                        local_to_world, parse_glb)

try:
    from numba import njit, prange, config as numba_config, set_num_threads
except ImportError:
    njit = prange = numba_config = set_num_threads = None

SCHEMA = "refas.pbr-v2-visibility-diagnostic/v1"
PROFILE = "RefAs PBR v2 Visibility/0.1.0-prototype"
NEAR = 0.01
BACKGROUND = (12, 15, 19)


if njit is not None:
    @njit(nogil=True, cache=False)
    def _prepare(camera, faces, size, scale):
        """Clip triangles, preserving barycentric weights of SOURCE vertices.

        Each original triangle produces at most two stable raster slots.
        An empty slot has negative bounds and cannot win a pixel.
        """
        n = len(faces)
        screen = np.zeros((2*n, 3, 3), dtype=np.float64)
        origin_bary = np.zeros((2*n, 3, 3), dtype=np.float64)
        bounds = np.full((2*n, 4), -1, dtype=np.int32)
        poly = np.empty((3, 3), dtype=np.float64)
        poly_w = np.empty((3, 3), dtype=np.float64)
        clip = np.empty((4, 3), dtype=np.float64)
        clip_w = np.empty((4, 3), dtype=np.float64)
        projected = np.empty((3, 3), dtype=np.float64)
        mapped = np.empty((3, 3), dtype=np.float64)
        visible = 0
        crossed = 0
        rejected = 0
        for i in range(n):
            for k in range(3):
                v = faces[i,k]
                for j in range(3):
                    poly[k,j] = camera[v,j]
                    poly_w[k,j] = 1.0 if k == j else 0.0
            length = 0
            last = 2
            last_in = poly[last,2] >= NEAR
            for current in range(3):
                current_in = poly[current,2] >= NEAR
                if current_in != last_in:
                    denom = poly[current,2] - poly[last,2]
                    t = (NEAR - poly[last,2]) / denom
                    for j in range(3):
                        clip[length,j] = poly[last,j] + t*(poly[current,j]-poly[last,j])
                        clip_w[length,j] = poly_w[last,j] + t*(poly_w[current,j]-poly_w[last,j])
                    clip[length,2] = NEAR
                    length += 1
                if current_in:
                    for j in range(3):
                        clip[length,j] = poly[current,j]
                        clip_w[length,j] = poly_w[current,j]
                    length += 1
                last = current
                last_in = current_in
            if length < 3:
                rejected += 1
                continue
            # Crossing is source-triangle classification, not fan count:
            # two vertices behind the near plane leave one clipped fan.
            if (poly[0,2] < NEAR or poly[1,2] < NEAR or poly[2,2] < NEAR):
                crossed += 1
            for fan in range(1, length - 1):
                slot = 2*i + fan - 1
                for k in range(3):
                    src = 0 if k == 0 else (fan if k == 1 else fan+1)
                    z = clip[src,2]
                    projected[k,0] = ((clip[src,0]/(z*scale))*.5 + .5)*(size-1)
                    projected[k,1] = (.5 - clip[src,1]/(z*scale)*.5)*(size-1)
                    projected[k,2] = z
                    for j in range(3):
                        mapped[k,j] = clip_w[src,j]
                area = ((projected[1,0]-projected[0,0])*(projected[2,1]-projected[0,1])
                        -(projected[1,1]-projected[0,1])*(projected[2,0]-projected[0,0]))
                if not math.isfinite(area) or area == 0.0:
                    continue
                if area < 0:
                    for j in range(3):
                        tmp = projected[1,j]
                        projected[1,j] = projected[2,j]
                        projected[2,j] = tmp
                        tmp = mapped[1,j]
                        mapped[1,j] = mapped[2,j]
                        mapped[2,j] = tmp
                if not (math.isfinite(projected[0,0]) and math.isfinite(projected[1,0])
                        and math.isfinite(projected[2,0]) and math.isfinite(projected[0,1])
                        and math.isfinite(projected[1,1]) and math.isfinite(projected[2,1])):
                    continue
                xmin = max(0,int(math.floor(min(projected[0,0],projected[1,0],projected[2,0]))))
                xmax = min(size-1,int(math.ceil(max(projected[0,0],projected[1,0],projected[2,0]))))
                ymin = max(0,int(math.floor(min(projected[0,1],projected[1,1],projected[2,1]))))
                ymax = min(size-1,int(math.ceil(max(projected[0,1],projected[1,1],projected[2,1]))))
                if xmin > xmax or ymin > ymax:
                    continue
                for k in range(3):
                    for j in range(3):
                        screen[slot,k,j] = projected[k,j]
                        origin_bary[slot,k,j] = mapped[k,j]
                bounds[slot,0] = xmin
                bounds[slot,1] = xmax
                bounds[slot,2] = ymin
                bounds[slot,3] = ymax
                visible += 1
        return screen, origin_bary, bounds, visible, crossed, rejected

    @njit(nogil=True, cache=False)
    def _count_bins(bounds,tile,tiles_x,tiles):
        counts = np.zeros(tiles,dtype=np.int64)
        for slot in range(len(bounds)):
            if bounds[slot,0] < 0: continue
            for ty in range(bounds[slot,2]//tile,bounds[slot,3]//tile+1):
                for tx in range(bounds[slot,0]//tile,bounds[slot,1]//tile+1):
                    counts[ty*tiles_x+tx] += 1
        return counts

    @njit(nogil=True, cache=False)
    def _fill_bins(bounds,tile,tiles_x,offsets):
        cursor = offsets[:-1].copy()
        entries = np.empty(offsets[-1],dtype=np.int64)
        for slot in range(len(bounds)):
            if bounds[slot,0] < 0: continue
            for ty in range(bounds[slot,2]//tile,bounds[slot,3]//tile+1):
                for tx in range(bounds[slot,0]//tile,bounds[slot,1]//tile+1):
                    b = ty*tiles_x+tx
                    entries[cursor[b]] = slot
                    cursor[b] += 1
        return entries

    @njit(parallel=True, nogil=True, cache=False)
    def _raster_tiles(screen,src_bary,bounds,offsets,entries,depth,winner,
                      source_weights,tile_size,tiles_x):
        n = offsets.shape[0]-1
        updates = np.zeros(n,dtype=np.int64)
        candidates = np.zeros(n,dtype=np.int64)
        size=depth.shape[0]
        for tile in prange(n):
            ty=tile//tiles_x
            tx=tile%tiles_x
            minx=tx*tile_size; miny=ty*tile_size
            maxx=min(size-1,minx+tile_size-1)
            maxy=min(size-1,miny+tile_size-1)
            update=0; test=0
            for e in range(offsets[tile],offsets[tile+1]):
                slot=entries[e]
                x0,y0,z0=screen[slot,0,0],screen[slot,0,1],screen[slot,0,2]
                x1,y1,z1=screen[slot,1,0],screen[slot,1,1],screen[slot,1,2]
                x2,y2,z2=screen[slot,2,0],screen[slot,2,1],screen[slot,2,2]
                area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
                if area <= 0: continue
                top0=(y2<y1) or (y2==y1 and x2>x1)
                top1=(y0<y2) or (y0==y2 and x0>x2)
                top2=(y1<y0) or (y1==y0 and x1>x0)
                firstx=max(minx,bounds[slot,0])
                lastx=min(maxx,bounds[slot,1])
                firsty=max(miny,bounds[slot,2])
                lasty=min(maxy,bounds[slot,3])
                if firstx>lastx or firsty>lasty: continue
                test += (lastx-firstx+1)*(lasty-firsty+1)
                for py in range(firsty,lasty+1):
                    for px in range(firstx,lastx+1):
                        e0=(x2-x1)*(py-y1)-(y2-y1)*(px-x1)
                        if e0 < 0 or (e0 == 0 and not top0): continue
                        e1=(x0-x2)*(py-y2)-(y0-y2)*(px-x2)
                        if e1 < 0 or (e1 == 0 and not top1): continue
                        e2=(x1-x0)*(py-y0)-(y1-y0)*(px-x0)
                        if e2 < 0 or (e2 == 0 and not top2): continue
                        q0=(e0/area)/z0
                        q1=(e1/area)/z1
                        q2=(e2/area)/z2
                        inv=q0+q1+q2
                        if inv <= 0 or not math.isfinite(inv): continue
                        dist=1.0/inv
                        old=depth[py,px]
                        if dist<old-1e-12 or (abs(dist-old)<=1e-12 and
                                (winner[py,px]<0 or slot<winner[py,px])):
                            depth[py,px]=dist
                            winner[py,px]=slot
                            for k in range(3):
                                source_weights[py,px,k] = (
                                    q0*src_bary[slot,0,k] +
                                    q1*src_bary[slot,1,k] +
                                    q2*src_bary[slot,2,k])/inv
                            update+=1
            updates[tile]=update
            candidates[tile]=test
        return updates,candidates


def _check_source(primitives):
    if not primitives:
        raise ValueError("PBR_V2_INVALID_ASSET: no primitives")
    for primitive in primitives:
        indices = np.asarray(primitive.indices)
        points = np.asarray(primitive.positions)
        if indices.ndim != 2 or indices.shape[1] != 3 or (
                points.ndim != 2 or points.shape[1] != 3):
            raise ValueError("PBR_V2_INVALID_ASSET: triangles and positions require XYZ triplets")
        if np.any(indices<0) or np.any(indices>=len(points)):
            raise ValueError("PBR_V2_INVALID_ASSET: index bounds")
        if not np.isfinite(points).all():
            raise ValueError("PBR_V2_INVALID_ASSET: nonfinite positions")


def render_visibility(primitives,position,target,up,fov,size,*,tile_size=32,
                      threads=1,max_working_mib=1024):
    """One actual camera; source-indexed opaque visibility, NOT material evidence."""
    if njit is None:
        raise RuntimeError("PBR_V2_UNAVAILABLE: optional numba required")
    if not isinstance(size,int) or not 32<=size<=1024 or tile_size not in (16,32,64):
        raise ValueError("PBR_V2_UNSUPPORTED: resolution or tile size")
    if not isinstance(threads,int) or threads<1 or threads>8 or threads>numba_config.NUMBA_NUM_THREADS:
        raise ValueError("PBR_V2_UNSUPPORTED: threads not supported on this host")
    if not 256<=max_working_mib<=2048:
        raise MemoryError("PBR_V2_RESOURCE: memory budget out of range")
    _check_source(primitives)
    nfaces=sum(len(x.indices) for x in primitives)
    nverts=sum(len(x.positions) for x in primitives)
    if nfaces<=0:
        raise ValueError("PBR_V2_INVALID_ASSET: empty indexed geometry")
    # Two raster slots per triangle: camera screen + clip-to-source barycentric
    # + bounds, plus vertex camera data and frame buffers, with JIT headroom.
    # Conservative native/JIT/GLB-decode headroom grounded in original
    # 901,664-triangle Monster Bed local VmHWM (~703 MiB). Per-run caps
    # remain advisory and MUST still be enforced by process memory limits.
    static_bytes=(384*MIB+2*nfaces*(9*8+9*8+4*4)+nverts*(3*8*2)
                  +nfaces*3*8+size*size*(8+8+3*8))
    if static_bytes>max_working_mib*MIB:
        raise MemoryError("PBR_V2_RESOURCE: source-provenance visibility exceeds budget")
    if not 1<=fov<=170:
        raise ValueError("PBR_V2_INVALID_CAMERA: invalid fov")
    origin=np.asarray(position,dtype=np.float64)
    if origin.shape!=(3,):
        raise ValueError("PBR_V2_INVALID_CAMERA: position")
    right,cam_up,forward=camera_basis(origin,target,up)
    scale=math.tan(math.radians(fov)/2)
    local=[]; ids=[]; base=0; primitive_of_triangle=[]
    start=time.perf_counter()
    for pid,primitive in enumerate(primitives):
        coords=np.asarray(primitive.positions,dtype=np.float64)
        relative=coords-origin
        local.append(np.column_stack((relative@right,relative@cam_up,relative@forward)))
        faces=np.asarray(primitive.indices,dtype=np.int64)
        ids.append(faces+base)
        primitive_of_triangle.append(np.full(len(faces),pid,dtype=np.int32))
        base+=len(coords)
    camera=np.ascontiguousarray(np.concatenate(local),dtype=np.float64)
    faces=np.ascontiguousarray(np.concatenate(ids),dtype=np.int64)
    part_ids=np.concatenate(primitive_of_triangle)
    transform_ms=(time.perf_counter()-start)*1000
    start=time.perf_counter()
    screen,clip_weights,bounds,prepared,clipped,rejected=_prepare(camera,faces,size,scale)
    setup_ms=(time.perf_counter()-start)*1000
    ntx=(size+tile_size-1)//tile_size
    ntiles=ntx*ntx
    start=time.perf_counter()
    counts=_count_bins(bounds,tile_size,ntx,ntiles)
    entries=int(counts.sum(dtype=np.int64))
    if entries>32_000_000 or static_bytes+entries*16>max_working_mib*MIB:
        raise MemoryError("PBR_V2_RESOURCE: tile memberships exceed budget")
    offsets=np.zeros(ntiles+1,dtype=np.int64)
    np.cumsum(counts,out=offsets[1:])
    bins=_fill_bins(bounds,tile_size,ntx,offsets)
    bin_ms=(time.perf_counter()-start)*1000
    depth=np.full((size,size),np.inf,dtype=np.float64)
    winner=np.full((size,size),-1,dtype=np.int64)
    source_weights=np.zeros((size,size,3),dtype=np.float64)
    set_num_threads(threads)
    start=time.perf_counter()
    updates,candidates=_raster_tiles(screen,clip_weights,bounds,offsets,bins,depth,winner,
                                     source_weights,tile_size,ntx)
    raster_ms=(time.perf_counter()-start)*1000
    return {
        "depth":depth, "winnerRasterSlot":winner,
        "winnerSourceTriangle":np.where(winner>=0,winner//2,-1),
        "sourceWeights":source_weights, "primitiveBySourceTriangle":part_ids,
        "sourceFaces":faces, "cameraVertices":camera,
        "stats":{
            "profile":PROFILE,"claimScope":"geometry-diagnostic-only",
            "certificationEligible":False,
            "inputTriangles":int(nfaces),"preparedRasterTriangles":int(prepared),
            "nearClippedSourceTriangles":int(clipped),
            "fullyBehindNearTriangles":int(rejected),
            "binEntries":entries,"candidatePixelTests":int(candidates.sum()),
            "depthUpdates":int(updates.sum()),
            "coveredPixels":int(np.count_nonzero(winner>=0)),
            "tileSize":tile_size,"threads":threads,
            "resourcePreflightMiB":round((static_bytes+entries*16)/MIB,3),
            "stagesMs":{"transform":round(transform_ms,3),
                        "setupIncludingJit":round(setup_ms,3),
                        "binningIncludingJit":round(bin_ms,3),
                        "rasterIncludingJit":round(raster_ms,3)}
        }
    }


def _digest(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def main():
    p=argparse.ArgumentParser(description="PBR v2 isolated opaque visibility diagnostic")
    p.add_argument("--glb",required=True)
    p.add_argument("--frame",required=True)
    p.add_argument("--out",required=True)
    p.add_argument("--size",type=int,default=160)
    p.add_argument("--tile-size",type=int,choices=(16,32,64),default=32)
    p.add_argument("--threads",type=int,choices=(1,2,4,8),default=4)
    p.add_argument("--max-working-mb",type=int,default=1024)
    args=p.parse_args()
    source=Path(args.glb); framepath=Path(args.frame); out=Path(args.out)
    if out.exists():
        raise ValueError("PBR_V2_INVALID_OUTPUT: refuses overwrite")
    source_bytes=source.read_bytes(); frame_bytes=framepath.read_bytes()
    if len(source_bytes)*2 >= args.max_working_mb*MIB:
        raise MemoryError("PBR_V2_RESOURCE: GLB source exceeds memory budget")
    model,binary=parse_glb(source)
    if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(source_bytes).digest():
        raise ValueError("PBR_V2_INVALID_ASSET: GLB changed between hash and parse")
    if model.get("extensionsRequired") or model.get("skins") or model.get("animations"):
        raise ValueError("PBR_V2_UNSUPPORTED: animated or required extension geometry")
    for mesh in model.get("meshes",[]):
        for primitive in mesh.get("primitives",[]):
            if primitive.get("mode",4)!=4 or primitive.get("targets"):
                raise ValueError("PBR_V2_UNSUPPORTED: non-triangle or morph geometry")
    for material in model.get("materials",[]):
        if material.get("alphaMode","OPAQUE")!="OPAQUE":
            raise ValueError("PBR_V2_UNSUPPORTED: alpha requires a separate visibility path")
    _,primitives=load_primitives(source,parsed=(model,binary))
    frame,basis,origin,fd=load_canonical_frame(framepath)
    if hashlib.sha256(framepath.read_bytes()).digest() != hashlib.sha256(frame_bytes).digest():
        raise ValueError("PBR_V2_INVALID_CAMERA: frame changed between hash and parse")
    hero=frame.get("hero")
    if not hero:
        raise ValueError("PBR_V2_INVALID_CAMERA: frame hero required")
    pos=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    v=render_visibility(primitives,pos,target,up,float(hero.get("fovY",31)),
                        args.size,tile_size=args.tile_size,threads=args.threads,
                        max_working_mib=args.max_working_mb)
    report={
        "schema":SCHEMA,"status":"COMPLETE",
        "claimScope":"geometry-diagnostic-only","certificationEligible":False,
        "renderer":{"name":PROFILE,"algorithmVersion":"0.1.0-prototype"},
        "sourceGlbSha256":hashlib.sha256(source_bytes).hexdigest(),
        "frameFileSha256":hashlib.sha256(frame_bytes).hexdigest(),
        "frameDigest":fd,"size":args.size,
        "stats":v["stats"],
        "digests":{key:_digest(v[key]) for key in (
            "depth","winnerRasterSlot","winnerSourceTriangle","sourceWeights")}
    }
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".refas-pbr-v2-",dir=out.parent) as temp:
        stage=Path(temp)
        # Diagnostic arrays only, no deceptive appearance PNG.
        for key in ("depth","winnerRasterSlot","sourceWeights"):
            np.save(stage/(key+".npy"),v[key],allow_pickle=False)
        (stage/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
        os.rename(stage,out)
    print(json.dumps({"status":"COMPLETE","sourceTriangles":v["stats"]["inputTriangles"],
                      "coveredPixels":v["stats"]["coveredPixels"],"report":str(out/"report.json")}))


if __name__ == "__main__":
    main()

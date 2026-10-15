#!/usr/bin/env python3
"""R14-03 opt-in tiled CPU diagnostic rasterizer.

Genuine compiled triangle setup, two-pass tile binning and deterministic disjoint
parallel tile ownership. Not a source-fidelity or certification backend.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import time

import numpy as np
from PIL import Image

from render_cpu_opt import require_supported
from render_glb import (
    MIB, camera_basis, estimate_decoded_geometry_bytes, load_canonical_frame,
    load_primitives, local_to_world, parse_glb,
)

try:
    from numba import njit, prange, set_num_threads, config as numba_config
except ImportError:
    njit = None
    prange = None
    set_num_threads = None
    numba_config = None

SCHEMA = "refas.tiled-cpu-diagnostic/v1"
PROFILE = "RefAs Tiled CPU/0.1.0-prototype"
NEAR = 0.01
BACKGROUND = (12, 15, 19)


def sha(data):
    return hashlib.sha256(data).hexdigest()


if njit is not None:
    @njit(cache=False, nogil=True)
    def _setup(camera, positions, indices, primitive_ids, size, scale, mode):
        """Near-clip + screen bounds once per input triangle; at most two fans."""
        count = indices.shape[0]
        screen = np.zeros((2*count, 3, 3), dtype=np.float64)
        bounds = np.full((2*count, 4), -1, dtype=np.int32)
        colors = np.zeros((2*count, 3), dtype=np.uint8)
        n_valid, n_clipped, n_frustum = 0, 0, 0
        for i in range(count):
            a,b,c = indices[i,0],indices[i,1],indices[i,2]
            polygon = np.empty((4,3), dtype=np.float64)
            polygon[0] = camera[a]
            polygon[1] = camera[b]
            polygon[2] = camera[c]
            clipped = np.empty((4,3), dtype=np.float64)
            length = 0
            previous = polygon[2]
            previous_inside = previous[2] >= NEAR
            for j in range(3):
                current = polygon[j]
                inside = current[2] >= NEAR
                if inside != previous_inside:
                    t = (NEAR-previous[2])/(current[2]-previous[2])
                    for k in range(3):
                        clipped[length,k] = previous[k]+t*(current[k]-previous[k])
                    clipped[length,2] = NEAR
                    length += 1
                if inside:
                    for k in range(3):
                        clipped[length,k] = current[k]
                    length += 1
                previous,previous_inside = current,inside
            if length < 3:
                n_frustum += 1
                continue
            if length != 3:
                n_clipped += 1

            if mode == 0:
                pa,pb,pc = positions[a], positions[b], positions[c]
                u0,u1,u2 = pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]
                v0,v1,v2 = pc[0]-pa[0],pc[1]-pa[1],pc[2]-pa[2]
                nx,ny,nz = u1*v2-u2*v1,u2*v0-u0*v2,u0*v1-u1*v0
                n = math.sqrt(nx*nx+ny*ny+nz*nz)
                if n <= 1e-20: continue
                r,g,bl = nx/n*.5+.5,ny/n*.5+.5,nz/n*.5+.5
            else:
                val = ((primitive_ids[i]+1)*2654435761) & 0xffffffff
                r,g,bl = (val & 255)/255.,((val>>8)&255)/255.,((val>>16)&255)/255.
            rgb = np.empty(3,dtype=np.uint8)
            rgb[0] = int(round(max(0.,min(1.,r))**(1./2.2)*255.))
            rgb[1] = int(round(max(0.,min(1.,g))**(1./2.2)*255.))
            rgb[2] = int(round(max(0.,min(1.,bl))**(1./2.2)*255.))

            for fan in range(1,length-1):
                raster_id = 2*i+(fan-1)
                vertices = np.empty((3,3),dtype=np.float64)
                for k in range(3):
                    src = 0 if k == 0 else fan if k == 1 else fan+1
                    z = clipped[src,2]
                    vertices[k,0] = ((clipped[src,0]/(z*scale))*.5+.5)*(size-1)
                    vertices[k,1] = (.5-(clipped[src,1]/(z*scale))*.5)*(size-1)
                    vertices[k,2] = z
                x0,y0=vertices[0,0],vertices[0,1]
                x1,y1=vertices[1,0],vertices[1,1]
                x2,y2=vertices[2,0],vertices[2,1]
                area = (x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
                if abs(area)<1e-12: continue
                if area<0:
                    tmp = vertices[1].copy()
                    vertices[1] = vertices[2]
                    vertices[2] = tmp
                minx=max(0,int(math.floor(min(vertices[0,0],vertices[1,0],vertices[2,0]))))
                maxx=min(size-1,int(math.ceil(max(vertices[0,0],vertices[1,0],vertices[2,0]))))
                miny=max(0,int(math.floor(min(vertices[0,1],vertices[1,1],vertices[2,1]))))
                maxy=min(size-1,int(math.ceil(max(vertices[0,1],vertices[1,1],vertices[2,1]))))
                if minx>maxx or miny>maxy:
                    n_frustum += 1
                    continue
                screen[raster_id] = vertices
                bounds[raster_id,0] = minx
                bounds[raster_id,1] = maxx
                bounds[raster_id,2] = miny
                bounds[raster_id,3] = maxy
                colors[raster_id] = rgb
                n_valid += 1
        return screen,bounds,colors,n_valid,n_clipped,n_frustum

    @njit(cache=False, nogil=True)
    def _tile_counts(bounds, tile_size, tiles_x, count_tiles):
        counts=np.zeros(count_tiles,dtype=np.int64)
        for i in range(bounds.shape[0]):
            if bounds[i,0] < 0: continue
            for ty in range(bounds[i,2]//tile_size,bounds[i,3]//tile_size+1):
                for tx in range(bounds[i,0]//tile_size,bounds[i,1]//tile_size+1):
                    counts[ty*tiles_x+tx]+=1
        return counts

    @njit(cache=False, nogil=True)
    def _scatter(bounds, tile_size, tiles_x, offsets, n_entries):
        cursor=offsets[:-1].copy()
        entries=np.empty(n_entries,dtype=np.int64)
        for i in range(bounds.shape[0]):
            if bounds[i,0] < 0: continue
            for ty in range(bounds[i,2]//tile_size,bounds[i,3]//tile_size+1):
                for tx in range(bounds[i,0]//tile_size,bounds[i,1]//tile_size+1):
                    tile=ty*tiles_x+tx
                    entries[cursor[tile]]=i
                    cursor[tile]+=1
        return entries

    @njit(cache=False,nogil=True,parallel=True)
    def _tiles(screen, colors, offsets, entries, pixels, depth, winner,
               tile_size, tiles_x):
        """Each prange iteration owns a disjoint tile: no shared pixel writers."""
        size=depth.shape[0]
        updates=np.zeros(offsets.shape[0]-1,dtype=np.int64)
        for tile in prange(offsets.shape[0]-1):
            ty=tile//tiles_x
            tx=tile%tiles_x
            minx=tx*tile_size
            miny=ty*tile_size
            maxx=min(size-1,minx+tile_size-1)
            maxy=min(size-1,miny+tile_size-1)
            local_updates=0
            for e in range(offsets[tile],offsets[tile+1]):
                tri=entries[e]
                x0,y0,z0=screen[tri,0,0],screen[tri,0,1],screen[tri,0,2]
                x1,y1,z1=screen[tri,1,0],screen[tri,1,1],screen[tri,1,2]
                x2,y2,z2=screen[tri,2,0],screen[tri,2,1],screen[tri,2,2]
                area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
                if area <= 0: continue
                edge0=(y2<y1) or (y2==y1 and x2>x1)
                edge1=(y0<y2) or (y0==y2 and x0>x2)
                edge2=(y1<y0) or (y1==y0 and x1>x0)
                for py in range(miny,maxy+1):
                    for px in range(minx,maxx+1):
                        e0=(x2-x1)*(py-y1)-(y2-y1)*(px-x1)
                        if e0<0 or (e0==0 and not edge0): continue
                        e1=(x0-x2)*(py-y2)-(y0-y2)*(px-x2)
                        if e1<0 or (e1==0 and not edge1): continue
                        e2=(x1-x0)*(py-y0)-(y1-y0)*(px-x0)
                        if e2<0 or (e2==0 and not edge2): continue
                        invz=(e0/area)/z0+(e1/area)/z1+(e2/area)/z2
                        if invz<=0: continue
                        d=1.0/invz
                        old=depth[py,px]
                        if d<old-1e-12 or (abs(d-old)<=1e-12 and
                            (winner[py,px]<0 or tri<winner[py,px])):
                            depth[py,px]=d
                            winner[py,px]=tri
                            pixels[py,px,0]=colors[tri,0]
                            pixels[py,px,1]=colors[tri,1]
                            pixels[py,px,2]=colors[tri,2]
                            local_updates+=1
            updates[tile]=local_updates
        return updates


def render_hero_tiled(primitives, position, target, up, fov, size, mode,
                      *, tile_size=32, threads=1, max_working_mib=512):
    if njit is None:
        raise RuntimeError("TILED_CPU_UNAVAILABLE: install optional numba")
    if mode not in ("normal","object-id"):
        raise ValueError("TILED_CPU_UNSUPPORTED: normal/object-id only")
    if size<32 or size>1024 or tile_size not in (16,32,64) or not 1<=threads<=8:
        raise ValueError("TILED_CPU_UNSUPPORTED: size/tile-size/threads outside supported range")
    if threads>numba_config.NUMBA_NUM_THREADS:
        raise ValueError("TILED_CPU_UNSUPPORTED: requested threads exceed host Numba maximum")
    if max_working_mib<256 or max_working_mib>2048:
        raise MemoryError("TILED_CPU_RESOURCE: JIT requires a 256..2048 MiB budget")
    tri_total=sum(len(p.indices) for p in primitives)
    vertex_total=sum(len(p.positions) for p in primitives)
    # Include compiled LLVM process headroom as well as setup, binning, output.
    estimated = (192*MIB + 2*tri_total*(9*8+4*4+3+8+1)
                 + vertex_total*3*8*2 + size*size*32)
    if estimated>max_working_mib*MIB:
        raise MemoryError("TILED_CPU_RESOURCE: triangle setup exceeds the declared budget")
    basis_right,basis_up,forward=camera_basis(position,target,up)
    scale=math.tan(math.radians(fov)/2)
    positions=[]
    cameras=[]
    indices=[]
    identities=[]
    base=0
    for pid,primitive in enumerate(primitives):
        world=np.ascontiguousarray(primitive.positions,dtype=np.float64)
        local_ids=np.ascontiguousarray(primitive.indices,dtype=np.int64)
        if (not np.isfinite(world).all() or
            np.any(local_ids<0) or np.any(local_ids>=len(world))):
            raise ValueError("TILED_CPU_INVALID_ASSET: malformed or nonfinite mesh")
        relative=world-position
        camera=np.column_stack((relative@basis_right,relative@basis_up,relative@forward))
        positions.append(world)
        cameras.append(camera)
        indices.append(local_ids+base)
        identities.append(np.full(len(local_ids),pid,dtype=np.int64))
        base+=len(world)
    world=np.ascontiguousarray(np.concatenate(positions),dtype=np.float64)
    camera=np.ascontiguousarray(np.concatenate(cameras),dtype=np.float64)
    ids=np.ascontiguousarray(np.concatenate(indices),dtype=np.int64)
    primitive_ids=np.ascontiguousarray(np.concatenate(identities),dtype=np.int64)

    begun=time.perf_counter()
    screen,bounds,colors,nvalid,nclip,nfrustum=_setup(camera,world,ids,primitive_ids,
        size,scale,0 if mode=="normal" else 1)
    setup_ms=(time.perf_counter()-begun)*1000
    tiles_x=(size+tile_size-1)//tile_size
    tiles_y=tiles_x
    ntiles=tiles_x*tiles_y
    begun=time.perf_counter()
    counts=_tile_counts(bounds,tile_size,tiles_x,ntiles)
    bins=int(counts.sum(dtype=np.int64))
    # Prevent unbounded large-triangle tile memberships before allocating.
    room=max_working_mib*MIB-estimated
    if bins>room//16 or bins>32_000_000:
        raise MemoryError("TILED_CPU_RESOURCE: tile memberships exceed budget")
    offsets=np.zeros(ntiles+1,dtype=np.int64)
    np.cumsum(counts,out=offsets[1:])
    entries=_scatter(bounds,tile_size,tiles_x,offsets,bins)
    bin_ms=(time.perf_counter()-begun)*1000

    pixels=np.empty((size,size,3),dtype=np.uint8)
    pixels[:]=BACKGROUND
    depth=np.full((size,size),np.inf,dtype=np.float64)
    winner=np.full((size,size),-1,dtype=np.int64)
    set_num_threads(threads)
    begun=time.perf_counter()
    updates=_tiles(screen,colors,offsets,entries,pixels,depth,winner,tile_size,tiles_x)
    raster_ms=(time.perf_counter()-begun)*1000
    covered=int(np.count_nonzero(winner>=0))
    return pixels,depth,winner,{
        "inputTriangles":tri_total,"preparedTriangles":int(nvalid),
        "nearClippedTriangles":int(nclip),"frustumRejected":int(nfrustum),
        "tileSize":tile_size,"workerThreads":threads,"tiles":ntiles,
        "binEntries":bins,"largestTileQueue":int(counts.max()) if len(counts) else 0,
        "depthUpdates":int(updates.sum()),"coveredPixels":covered,
        "winnerRasterTriangles":int(len(np.unique(winner[winner>=0]))),
        "stagesMs":{"setupIncludingJit":round(setup_ms,3),
                    "binningIncludingJit":round(bin_ms,3),
                    "rasterIncludingJit":round(raster_ms,3)},
        "memoryEstimateMiB":round((estimated+bins*16)/MIB,2),
    }


def main():
    p=argparse.ArgumentParser(description="R14-03 optional binned parallel CPU diagnostic")
    p.add_argument("--glb",required=True)
    p.add_argument("--frame",required=True)
    p.add_argument("--out",required=True)
    p.add_argument("--size",type=int,default=96)
    p.add_argument("--pass",dest="render_pass",choices=("normal","object-id"),required=True)
    p.add_argument("--tile-size",type=int,choices=(16,32,64),default=32)
    p.add_argument("--threads",type=int,choices=(1,2,4,8),default=1)
    p.add_argument("--max-working-mb",type=int,default=512)
    p.add_argument("--timeout-seconds",type=int,default=180)
    args=p.parse_args()
    if njit is None:
        raise RuntimeError("TILED_CPU_UNAVAILABLE: install optional numba")
    if not 32<=args.size<=1024 or not 256<=args.max_working_mb<=2048:
        raise ValueError("TILED_CPU_RESOURCE: invalid image/memory budget")
    t0=time.perf_counter()
    glb_bytes=Path(args.glb).read_bytes()
    frame_bytes=Path(args.frame).read_bytes()
    if len(glb_bytes)*2>=args.max_working_mb*MIB:
        raise MemoryError("TILED_CPU_RESOURCE: source exceeds memory budget")
    model,binary=parse_glb(Path(args.glb))
    require_supported(model)
    _,primitives=load_primitives(Path(args.glb),parsed=(model,binary))
    spec,basis,origin,frame_digest=load_canonical_frame(Path(args.frame))
    hero=spec.get("hero")
    if not hero:
        raise ValueError("TILED_CPU_INVALID_ASSET: registered hero is required")
    position=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    started=time.perf_counter()
    pix,depth,winner,metrics=render_hero_tiled(primitives,position,target,up,
       float(hero.get("fovY",31)),args.size,args.render_pass,
       tile_size=args.tile_size,threads=args.threads,max_working_mib=args.max_working_mb)
    compute_ms=(time.perf_counter()-started)*1000
    output=Path(args.out)
    output.mkdir(parents=True,exist_ok=True)
    png=output/"hero.png"
    Image.fromarray(pix,mode="RGB").save(png,format="PNG")
    report={
        "schema":SCHEMA,"status":"PASS","claimScope":"diagnostic-only",
        "renderer":{"family":"other","name":"RefAs Tiled CPU",
                    "version":"0.1.0-prototype","backend":"numba-tiled-parallel"},
        "assetSha256":sha(glb_bytes),"frameFileSha256":sha(frame_bytes),
        "canonicalFrameDigest":frame_digest,"pass":args.render_pass,
        "size":args.size,"tileSize":args.tile_size,"threads":args.threads,
        "stats":metrics,"durationsMs":{"computeIncludingJit":round(compute_ms,3),
                                       "totalIncludingJitAndEncode":round((time.perf_counter()-t0)*1000,3)},
        "outputs":[{"path":"hero.png","sha256":sha(png.read_bytes())}]
    }
    (output/"render-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"PASS","heroSha256":report["outputs"][0]["sha256"],
                      "inputTriangles":metrics["inputTriangles"],"tileSize":args.tile_size,
                      "workerThreads":args.threads}))


if __name__=="__main__":
    main()

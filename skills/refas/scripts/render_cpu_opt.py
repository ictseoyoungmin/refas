#!/usr/bin/env python3
"""Optional Numba JIT CPU raster prototype. Diagnostic only, never certificate authority.

R14-02: one registered hero, flat normal/object-ID, opaque glTF triangles.
The v1.3.0 portable renderer and registered replay are not modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

import numpy as np
from PIL import Image

from render_glb import (
    MIB, camera_basis, estimate_decoded_geometry_bytes, load_canonical_frame,
    load_primitives, local_to_world, parse_glb, resource_policy,
)

PROFILE = "RefAs Optimized CPU/1.0.0-jit-prototype"
SCHEMA = "refas.optimized-cpu-diagnostic/v1"
NEAR = 0.01
BACKGROUND = (12, 15, 19)

try:
    from numba import njit
except ImportError:
    njit = None


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


if njit is not None:
    @njit(cache=False, nogil=True)
    def _raster(camera, positions, indices, framebuffer, depth, winner,
                primitive_id, triangle_offset, scale_x, scale_y, mode):
        """Fixed-order Numba triangle hot loop. New, versioned pixel policy.

        Inclusive region bounds, 0.0 pixel centers, top-left edge convention,
        near clip preserving partial triangles, perspective inverse-Z.
        Tie-break by stable global triangle ordinal; no parallel shared writes.
        """
        height, width = depth.shape
        drawn = 0
        for tri_id in range(indices.shape[0]):
            ia = indices[tri_id, 0]
            ib = indices[tri_id, 1]
            ic = indices[tri_id, 2]
            # Clipped polygons use local 4-vertex scratch, not per-pixel arrays.
            poly = np.empty((4, 3), dtype=np.float64)
            poly[0] = camera[ia]
            poly[1] = camera[ib]
            poly[2] = camera[ic]
            clip = np.empty((4, 3), dtype=np.float64)
            size = 0
            prev = poly[2]
            prev_in = prev[2] >= NEAR
            for j in range(3):
                curr = poly[j]
                curr_in = curr[2] >= NEAR
                if curr_in != prev_in:
                    t = (NEAR - prev[2]) / (curr[2] - prev[2])
                    for k in range(3):
                        clip[size, k] = prev[k] + t * (curr[k] - prev[k])
                    clip[size, 2] = NEAR
                    size += 1
                if curr_in:
                    for k in range(3):
                        clip[size, k] = curr[k]
                    size += 1
                prev = curr
                prev_in = curr_in
            if size < 3:
                continue

            if mode == 0:
                a0 = positions[ia]
                a1 = positions[ib]
                a2 = positions[ic]
                ux, uy, uz = a1[0]-a0[0], a1[1]-a0[1], a1[2]-a0[2]
                vx, vy, vz = a2[0]-a0[0], a2[1]-a0[1], a2[2]-a0[2]
                nx, ny, nz = uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx
                norm = math.sqrt(nx*nx + ny*ny + nz*nz)
                if norm <= 1e-20:
                    continue
                red = (nx / norm * .5 + .5)
                green = (ny / norm * .5 + .5)
                blue = (nz / norm * .5 + .5)
            else:
                obj = ((primitive_id + 1) * 2654435761) & 0xffffffff
                red = (obj & 255) / 255.0
                green = ((obj >> 8) & 255) / 255.0
                blue = ((obj >> 16) & 255) / 255.0
            rgb = np.empty(3, dtype=np.uint8)
            rgb[0] = int(round(max(0., min(1., red)) ** (1./2.2) * 255.))
            rgb[1] = int(round(max(0., min(1., green)) ** (1./2.2) * 255.))
            rgb[2] = int(round(max(0., min(1., blue)) ** (1./2.2) * 255.))
            hit = False
            for fan in range(1, size - 1):
                ax, ay, az = clip[0, 0], clip[0, 1], clip[0, 2]
                bx, by, bz = clip[fan, 0], clip[fan, 1], clip[fan, 2]
                cx, cy, cz = clip[fan+1, 0], clip[fan+1, 1], clip[fan+1, 2]
                x0 = ((ax / (az * scale_x)) * .5 + .5) * (width - 1)
                y0 = (.5 - (ay / (az * scale_y)) * .5) * (height - 1)
                x1 = ((bx / (bz * scale_x)) * .5 + .5) * (width - 1)
                y1 = (.5 - (by / (bz * scale_y)) * .5) * (height - 1)
                x2 = ((cx / (cz * scale_x)) * .5 + .5) * (width - 1)
                y2 = (.5 - (cy / (cz * scale_y)) * .5) * (height - 1)
                area = (x1-x0)*(y2-y0) - (y1-y0)*(x2-x0)
                if abs(area) < 1e-12:
                    continue
                if area < 0:
                    x1,x2 = x2,x1
                    y1,y2 = y2,y1
                    bz,cz = cz,bz
                    area = -area
                min_x = max(0, int(math.floor(min(x0,x1,x2))))
                max_x = min(width-1, int(math.ceil(max(x0,x1,x2))))
                min_y = max(0, int(math.floor(min(y0,y1,y2))))
                max_y = min(height-1, int(math.ceil(max(y0,y1,y2))))
                if min_x > max_x or min_y > max_y:
                    continue
                # Screen-down top-left inclusion. No heuristic epsilon on edges.
                edge0 = (y2 < y1) or (y2 == y1 and x2 > x1)
                edge1 = (y0 < y2) or (y0 == y2 and x0 > x2)
                edge2 = (y1 < y0) or (y1 == y0 and x1 > x0)
                for py in range(min_y,max_y+1):
                    for px in range(min_x,max_x+1):
                        e0 = (x2-x1)*(py-y1) - (y2-y1)*(px-x1)
                        if e0 < 0 or (e0 == 0 and not edge0): continue
                        e1 = (x0-x2)*(py-y2) - (y0-y2)*(px-x2)
                        if e1 < 0 or (e1 == 0 and not edge1): continue
                        e2 = (x1-x0)*(py-y0) - (y1-y0)*(px-x0)
                        if e2 < 0 or (e2 == 0 and not edge2): continue
                        w0,w1,w2 = e0/area,e1/area,e2/area
                        invz = w0/az + w1/bz + w2/cz
                        if invz <= 0: continue
                        d = 1.0/invz
                        old = depth[py,px]
                        ordinal = triangle_offset + tri_id
                        if d < old - 1e-12 or (abs(d-old) <= 1e-12 and
                            (winner[py,px] < 0 or ordinal < winner[py,px])):
                            depth[py,px] = d
                            winner[py,px] = ordinal
                            framebuffer[py,px,0] = rgb[0]
                            framebuffer[py,px,1] = rgb[1]
                            framebuffer[py,px,2] = rgb[2]
                            hit = True
            if hit: drawn += 1
        return drawn


def require_supported(model):
    if model.get("extensionsRequired") or model.get("skins") or model.get("animations"):
        raise ValueError("OPTIMIZED_CPU_UNSUPPORTED: glTF extensions, skinning, animations")
    for mesh in model.get("meshes", []):
        if mesh.get("weights"):
            raise ValueError("OPTIMIZED_CPU_UNSUPPORTED: morph weights")
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4 or primitive.get("targets"):
                raise ValueError("OPTIMIZED_CPU_UNSUPPORTED: non-triangle primitives or morph targets")
    for material in model.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        if (material.get("alphaMode", "OPAQUE") != "OPAQUE" or
                material.get("normalTexture") or material.get("occlusionTexture") or
                material.get("emissiveTexture") or pbr.get("baseColorTexture") or
                pbr.get("metallicRoughnessTexture") or material.get("extensions")):
            raise ValueError("OPTIMIZED_CPU_UNSUPPORTED: textures, alpha, or advanced material")
    for node in model.get("nodes", []):
        if node.get("weights") or node.get("skin") is not None:
            raise ValueError("OPTIMIZED_CPU_UNSUPPORTED: skinning or morph weights")


def render_hero(primitives, position, target, up, fov, size, mode):
    if njit is None:
        raise RuntimeError("OPTIMIZED_CPU_UNAVAILABLE: install optional numba")
    right, real_up, forward = camera_basis(position, target, up)
    scale_y = math.tan(math.radians(fov) / 2)
    framebuffer = np.empty((size,size,3),dtype=np.uint8)
    framebuffer[:] = BACKGROUND
    depth = np.full((size,size),np.inf,dtype=np.float64)
    winner = np.full((size,size),-1,dtype=np.int64)
    ntri = 0
    compiled_ms = 0.
    offset = 0
    # Primitive-order processing keeps deterministic ID/depth priority.
    for pid,primitive in enumerate(primitives):
        relative = primitive.positions - position
        camera = np.ascontiguousarray(np.column_stack((
            relative @ right, relative @ real_up, relative @ forward)),dtype=np.float64)
        world = np.ascontiguousarray(primitive.positions,dtype=np.float64)
        indices = np.ascontiguousarray(primitive.indices,dtype=np.int64)
        start=time.perf_counter()
        ntri += _raster(camera,world,indices,framebuffer,depth,winner,pid,offset,
                        scale_y,scale_y,0 if mode=="normal" else 1)
        compiled_ms += (time.perf_counter()-start)*1000
        offset += len(indices)
    return framebuffer,depth,winner,{"compiledRasterIncludingJitMs":round(compiled_ms,3),
        "inputTriangles":offset,"visibleTriangles":ntri,"coveredPixels":int(np.count_nonzero(winner>=0))}


def main():
    parser=argparse.ArgumentParser(description="R14-02 optional JIT hero diagnostic")
    parser.add_argument("--glb",required=True)
    parser.add_argument("--frame",required=True)
    parser.add_argument("--out",required=True)
    parser.add_argument("--size",type=int,default=96)
    parser.add_argument("--pass",dest="render_pass",choices=("normal","object-id"),required=True)
    parser.add_argument("--max-working-mb",type=int,default=512)
    parser.add_argument("--timeout-seconds",type=int,default=180)
    args=parser.parse_args()
    if njit is None:
        raise RuntimeError("OPTIMIZED_CPU_UNAVAILABLE: optional numba not installed")
    if not (32<=args.size<=1024 and 8<=args.max_working_mb<=2048):
        raise ValueError("invalid size or resource budget")
    glb=Path(args.glb)
    framepath=Path(args.frame)
    out=Path(args.out)
    t0=time.perf_counter()
    source_bytes=glb.read_bytes()
    frame_bytes=framepath.read_bytes()
    if len(source_bytes)*2>=args.max_working_mb*MIB:
        raise MemoryError("OPTIMIZED_CPU_RESOURCE: source GLB too large for declared budget")
    model,binary=parse_glb(glb)
    require_supported(model)
    policy=resource_policy(args.size,args.size,max_working_mb=args.max_working_mb,
        source_glb_bytes=len(source_bytes),decoded_geometry_bytes=estimate_decoded_geometry_bytes(model))
    _,primitives=load_primitives(glb,parsed=(model,binary))
    spec,basis,origin,frame_digest=load_canonical_frame(framepath)
    hero=spec.get("hero")
    if not hero:
        raise ValueError("source-registered canonical hero camera is required")
    position=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    if not np.all(np.isfinite(position)) or not np.all(np.isfinite(target)):
        raise ValueError("camera must be finite")
    setup_ms=(time.perf_counter()-t0)*1000
    pixels,_,_,stats=render_hero(primitives,position,target,up,float(hero.get("fovY",31)),
                                  args.size,args.render_pass)
    out.mkdir(parents=True,exist_ok=True)
    image_path=out/"hero.png"
    Image.fromarray(pixels,mode="RGB").save(image_path,format="PNG")
    result={"schema":SCHEMA,"status":"PASS","claimScope":"diagnostic-only",
        "renderer":{"family":"other","name":"RefAs Optimized CPU",
                    "version":"1.0.0-jit-prototype","backend":"numba-serial-raster"},
        "assetSha256":sha_bytes(source_bytes),"frameFileSha256":sha_bytes(frame_bytes),
        "canonicalFrameDigest":frame_digest,
        "pass":args.render_pass,"size":args.size,"inputGeometry":{"parts":len(primitives)},
        "resourcePolicy":policy,"stats":stats,
        "durationsMs":{"decodeAndSetup":round(setup_ms,3),
                       "totalIncludingJit":round((time.perf_counter()-t0)*1000,3)},
        "outputs":[{"path":"hero.png","sha256":sha_bytes(image_path.read_bytes())}]}
    (out/"render-report.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf8")
    print(json.dumps({"status":"PASS","report":str(out/"render-report.json"),
                      "heroSha256":result["outputs"][0]["sha256"],
                      "triangles":stats["inputTriangles"]}))


if __name__=="__main__":
    main()

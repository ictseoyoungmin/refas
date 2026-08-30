#!/usr/bin/env python3
"""Independent, deterministic metallic-roughness PBR renderer for RefAs evidence."""

from __future__ import annotations

import argparse, hashlib, json, math, os, shutil, tempfile, time
from pathlib import Path

import numpy as np
from PIL import Image

from render_glb import (MIB, camera_basis, check_deadline, frame_bounds, frame_digest,
                        load_canonical_frame, load_primitives, local_to_world, make_board,
                        normalize, object_color, parse_glb, resource_policy, sha256, world_bounds,
                        estimate_decoded_geometry_bytes)


def _js_number_normalize(value):
    """Keep Python's JSON numbers equivalent to JSON.stringify numbers.

    Python writes ``0.0`` while JavaScript writes ``0``.  Reports are
    validated and digested by both runtimes, so normalize integral floats
    (including negative zero) before hashing without changing non-integral
    values.
    """
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("canonical JSON cannot contain NaN or Infinity")
        return int(value) if value.is_integer() else value
    if isinstance(value, dict):
        return {key: _js_number_normalize(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_number_normalize(child) for child in value]
    return value


def canonical_digest(value):
    normalized = _js_number_normalize(value)
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def pbr_shade(base, normal, view, metallic, roughness, lights=None, exposure=0.0):
    n = normal / np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-9)
    v = view / np.maximum(np.linalg.norm(view, axis=-1, keepdims=True), 1e-9)
    ndotv = np.clip(np.sum(n * v, axis=-1), 0.001, 1.0)
    alpha = max(0.04, roughness * roughness)
    f0 = 0.04 * (1.0 - metallic) + base * metallic
    result = base * (0.025 + 0.055 * (1.0 - roughness)) * (1.0 - metallic) + f0 * (0.10 + 0.16 * (1.0 - roughness))
    result = np.broadcast_to(result, n.shape).copy()
    lights = lights or [([-0.55, 0.75, 0.65], 3.4, [1.0, 0.96, 0.90]), ([0.72, 0.18, 0.54], 1.5, [0.70, 0.82, 1.0]), ([-0.15, -0.62, 0.77], 0.65, [1.0, 0.76, 0.58])]
    for direction, intensity, tint in lights:
        l = normalize(direction)
        h = v + l
        h /= np.maximum(np.linalg.norm(h, axis=-1, keepdims=True), 1e-9)
        ndotl = np.clip(np.sum(n * l, axis=-1), 0.0, 1.0)
        ndoth = np.clip(np.sum(n * h, axis=-1), 0.0, 1.0)
        vdoth = np.clip(np.sum(v * h, axis=-1), 0.0, 1.0)
        denom = (ndoth * ndoth * (alpha * alpha - 1.0) + 1.0)
        distribution = alpha * alpha / np.maximum(math.pi * denom * denom, 1e-6)
        k = (roughness + 1.0) ** 2 / 8.0
        geometry = (ndotv / (ndotv * (1.0 - k) + k)) * (ndotl / (ndotl * (1.0 - k) + k))
        fresnel = f0 + (1.0 - f0) * np.power(1.0 - vdoth[..., None], 5)
        specular = distribution[..., None] * geometry[..., None] * fresnel / np.maximum(4.0 * ndotv[..., None] * ndotl[..., None], 1e-5)
        diffuse = (1.0 - fresnel) * (1.0 - metallic) * base / math.pi
        result += (diffuse + specular) * ndotl[..., None] * intensity * np.asarray(tint)
    result *= 2.0 ** float(exposure)
    return np.clip(result / (1.0 + result), 0.0, 1.0)


def render(primitives, position, target, output, *, size, mode, up_hint, deadline, lights=None, exposure=0.0, background=(15, 18, 23)):
    right, up, forward = camera_basis(position, target, up_hint); position = np.asarray(position, dtype=np.float64)
    scale = math.tan(math.radians(31) / 2); background = np.asarray(background, dtype=np.uint8)
    image = np.broadcast_to(background, (size, size, 3)).copy(); depth_buffer = np.full((size, size), np.inf)
    for primitive in primitives:
        camera = np.column_stack(((primitive.positions-position)@right, (primitive.positions-position)@up, (primitive.positions-position)@forward))
        for tri in primitive.indices:
            check_deadline(deadline); vertices=camera[tri]
            if np.any(vertices[:,2] <= .01): continue
            screen=np.column_stack(((vertices[:,0]/(vertices[:,2]*scale)*.5+.5)*(size-1),(.5-vertices[:,1]/(vertices[:,2]*scale)*.5)*(size-1)))
            x0=max(0,int(np.floor(screen[:,0].min()))); x1=min(size-1,int(np.ceil(screen[:,0].max()))); y0=max(0,int(np.floor(screen[:,1].min()))); y1=min(size-1,int(np.ceil(screen[:,1].max())))
            if x0>x1 or y0>y1: continue
            a,b,c=screen; den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-10: continue
            yy,xx=np.mgrid[y0:y1+1,x0:x1+1]; w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den; w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den; w2=1-w0-w1
            inside=(w0>=-1e-7)&(w1>=-1e-7)&(w2>=-1e-7); inv=w0/vertices[0,2]+w1/vertices[1,2]+w2/vertices[2,2]; depth=np.where(inv>1e-12,1/inv,np.inf); region_depth=depth_buffer[y0:y1+1,x0:x1+1]; visible=inside&(depth<region_depth)
            if not np.any(visible): continue
            perspective=np.stack((w0/vertices[0,2],w1/vertices[1,2],w2/vertices[2,2]),axis=-1)/np.maximum(inv[...,None],1e-12)
            normals=np.sum(perspective[...,None]*primitive.normals[tri][None,None,:,:],axis=2); worlds=np.sum(perspective[...,None]*primitive.positions[tri][None,None,:,:],axis=2); views=position-worlds
            if mode=='normal': color=np.clip(normals*.5+.5,0,1)
            elif mode=='object-id': color=np.broadcast_to(object_color(primitive.object_id),normals.shape)
            elif mode=='albedo': color=np.broadcast_to(primitive.color,normals.shape)
            else: color=pbr_shade(primitive.color,normals,views,primitive.metallic,primitive.roughness,lights=lights,exposure=exposure)
            encoded=np.round(np.power(np.clip(color,0,1),1/2.2)*255).astype(np.uint8); region=image[y0:y1+1,x0:x1+1]; region[visible]=encoded[visible]; region_depth[visible]=depth[visible]
    Image.fromarray(image,'RGB').save(output)
    return {"path":output.name,"sha256":sha256(output),"mode":mode}


def main():
    p=argparse.ArgumentParser(); p.add_argument('--glb',required=True); p.add_argument('--out',required=True); p.add_argument('--frame',required=True); p.add_argument('--reference'); p.add_argument('--size',type=int,default=420); p.add_argument('--timeout-seconds',type=float,default=180); p.add_argument('--max-working-mb',type=float,default=512); p.add_argument('--exposure',type=float,default=0.0); p.add_argument('--background',default='15,18,23'); p.add_argument('--key-intensity',type=float,default=3.4); p.add_argument('--fill-intensity',type=float,default=1.5); p.add_argument('--rim-intensity',type=float,default=0.65); a=p.parse_args()
    glb=Path(a.glb).resolve(); out=Path(a.out).resolve(); out.parent.mkdir(parents=True,exist_ok=True); frame_path=Path(a.frame).resolve(); model,binary=parse_glb(glb); decoded=estimate_decoded_geometry_bytes(model)
    policy=resource_policy(a.size,a.size,max_working_mb=a.max_working_mb,requested_tile_size=a.size,source_glb_bytes=glb.stat().st_size,decoded_geometry_bytes=decoded)
    if policy['tileSize'] < a.size:
        raise MemoryError(f"PBR render full-frame scratch exceeds the {a.max_working_mb:.2f} MiB working-memory budget; reduce --size or increase --max-working-mb")
    model,primitives=load_primitives(glb,parsed=(model,binary)); frame,basis,origin,fd=load_canonical_frame(frame_path); bounds=frame_bounds(primitives,frame,basis,origin); center=bounds['centerWorld']; distance=bounds['radius']*4.25; deadline=time.monotonic()+a.timeout_seconds
    background=tuple(max(0,min(255,int(value))) for value in a.background.split(','));
    if len(background) != 3: raise ValueError('--background must be r,g,b')
    lights=[([-0.55, 0.75, 0.65], a.key_intensity, [1.0, 0.96, 0.90]), ([0.72, 0.18, 0.54], a.fill_intensity, [0.70, 0.82, 1.0]), ([-0.15, -0.62, 0.77], a.rim_intensity, [1.0, 0.76, 0.58])]
    specs=[('hero',[0,0,1],[0,1,0],'beauty','PBR HERO'),('oblique',[.72,.2,1],[0,1,0],'beauty','PBR OBLIQUE'),('side',[1,.05,.15],[0,1,0],'beauty','PBR SIDE'),('top',[.18,1,.35],[0,0,1],'beauty','PBR TOP'),('grazing',[-1,.05,.18],[0,1,0],'beauty','PBR GRAZING'),('normal',[0,0,1],[0,1,0],'normal','NORMAL'),('object-id',[0,0,1],[0,1,0],'object-id','OBJECT ID'),('albedo',[0,0,1],[0,1,0],'albedo','ALBEDO')]
    staging=Path(tempfile.mkdtemp(prefix='.refas-pbr-',dir=out.parent)); frames=[]
    try:
        for name,direction,up,mode,label in specs:
            pos=center+normalize(local_to_world(direction,basis))*distance; target=center; path=staging/f'{name}.png'; rec=render(primitives,pos,target,path,size=a.size,mode=mode,up_hint=local_to_world(up,basis),deadline=deadline,lights=lights,exposure=a.exposure,background=background); frames.append({**rec,'viewId':name,'label':label,'absolutePath':str(path)})
        board=staging/'pbr-review-board.png'; make_board(Path(a.reference).resolve() if a.reference else None,frames,board)
        rig={"lights":"three-directional-calibrated-v1","keyIntensity":a.key_intensity,"fillIntensity":a.fill_intensity,"rimIntensity":a.rim_intensity,"background":list(background),"cameraFovY":31}; color={"exposure":a.exposure,"toneMapping":"Reinhard","outputColorSpace":"sRGB"}
        payload={"schema":"refas.pbr-render-report/v1","claimScope":"visual-fidelity","assetSha256":sha256(glb),"frameDigest":fd,"renderer":{"family":"other","name":"RefAs Independent PBR","version":"1.0.0","backend":"numpy-cook-torrance-headless","independentProcess":True},"lighting":{"rigId":"fixed-three-light-review-rig","digest":canonical_digest(rig)},"colorPipeline":color,"materialSupport":{"supported":["base-color-factor","metallic-factor","roughness-factor"],"unsupported":["clearcoat","image-based-lighting","normal-maps","textures"]},"outputs":[{"viewId":f['viewId'],"path":f"renders/pbr/{f['path']}","sha256":f['sha256']} for f in frames],"reproducibility":{"mode":"deterministic","tolerance":""}}
        payload['reportDigest']=canonical_digest(payload); (staging/'render-report.json').write_text(json.dumps(payload,indent=2)+'\n'); out.mkdir(parents=True,exist_ok=True)
        for item in staging.iterdir(): os.replace(item,out/item.name)
    finally: shutil.rmtree(staging,ignore_errors=True)
    print(json.dumps({"status":"PASS","report":str(out/'render-report.json'),"board":str(out/'pbr-review-board.png'),"frames":len(frames)},indent=2))

if __name__=='__main__': main()

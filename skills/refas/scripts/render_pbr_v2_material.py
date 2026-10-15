#!/usr/bin/env python3
"""R14-06C: source-faithful opaque base-color samples on PBR v2 visibility.

Material/shading diagnostic ONLY. Deliberately distinct from trusted
render_pbr.py/v1, v1 neutral clay identity and external engine certification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time

import numpy as np
from PIL import Image

from render_glb import load_primitives, load_canonical_frame, local_to_world, parse_glb
from render_pbr_v2_visibility import render_visibility, PROFILE as VISIBILITY_PROFILE
from render_pbr_v2_texture import resolve_base_sampler, sample_linear_texture
from render_pbr_v2_mip import compute_uv_derivatives

SCHEMA="refas.pbr-v2-material-preview/v1"
PROFILE="RefAs PBR v2 Opaque Preview/0.3.0-analytic-mips"
PASSES=("albedo","normal","object-id","beauty")
BACKGROUND=np.array([12,15,19],dtype=np.uint8)


def srgb_to_linear(rgb):
    c=np.clip(np.asarray(rgb,dtype=np.float64),0.0,1.0)
    return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)


def linear_to_srgb(rgb):
    c=np.clip(np.asarray(rgb,dtype=np.float64),0.0,1.0)
    return np.where(c<=0.0031308,12.92*c,1.055*np.power(c,1/2.4)-0.055)


def _asset_material_specs(model,primitives):
    """Recreate the loader's mesh/node primitive order; no material by guess."""
    materials=model.get("materials",[])
    meshes=model.get("meshes",[])
    nodes=model.get("nodes",[])
    scenes=model.get("scenes",[])
    if not scenes or not nodes:
        raise ValueError("PBR_V2_INVALID_ASSET: missing GLB scene")
    specs=[]
    visited=set()
    def visit(i):
        if i in visited:
            raise ValueError("PBR_V2_UNSUPPORTED: reused/cyclic scene node")
        visited.add(i)
        node=nodes[i]
        if "mesh" in node:
            for piece in meshes[node["mesh"]]["primitives"]:
                idx=piece.get("material")
                if idx is not None and (not isinstance(idx,int) or idx<0 or idx>=len(materials)):
                    raise ValueError("PBR_V2_INVALID_ASSET: material index")
                material=materials[idx] if idx is not None else {}
                specs.append((piece,material))
        for child in node.get("children",[]):
            visit(child)
        visited.remove(i)
    scene=model.get("scene",0)
    for root in scenes[scene].get("nodes",[]):
        visit(root)
    if len(specs)!=len(primitives):
        raise ValueError("PBR_V2_INVALID_ASSET: material/mesh order mismatch")
    return specs


def validate_opaque_materials(model,primitives):
    """Fail closed for every source feature v2 cannot yet shade faithfully.

    Stable, explicit limitation, no fake normal-map or alpha appearance PASS.
    """
    if model.get("extensionsRequired") or model.get("extensionsUsed"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: glTF extensions")
    if model.get("skins") or model.get("animations"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: deformation")
    result=[]
    image_cache={}
    allowed_attrs={"POSITION","NORMAL","COLOR_0","TEXCOORD_0"}
    for (piece,mat),primitive in zip(_asset_material_specs(model,primitives),primitives):
        if piece.get("mode",4)!=4 or piece.get("targets"):
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: non-triangle/morph")
        if set(piece["attributes"])-allowed_attrs:
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: unsupported vertex attributes")
        if "NORMAL" not in piece["attributes"]:
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: missing NORMAL")
        if mat.get("alphaMode","OPAQUE")!="OPAQUE":
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: alpha MASK/BLEND")
        if mat.get("extensions") or mat.get("normalTexture") or mat.get("occlusionTexture") or mat.get("emissiveTexture"):
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: maps or extensions")
        if mat.get("emissiveFactor") and any(abs(float(c))>1e-15 for c in mat["emissiveFactor"]):
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: emissive")
        pbr=mat.get("pbrMetallicRoughness",{})
        if set(pbr)-{"baseColorFactor","metallicFactor","roughnessFactor","baseColorTexture"}:
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: metallic/roughness texture")
        if primitive.vertex_alpha is not None and np.any(primitive.vertex_alpha != 1):
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: COLOR_0 alpha")
        if mat.get("alphaCutoff") is not None and mat.get("alphaMode","OPAQUE")=="OPAQUE":
            # cutoff is inoperative on OPAQUE and is ignored by glTF semantics
            pass
        rgba=pbr.get("baseColorFactor",[1.0,1.0,1.0,1.0])
        if len(rgba)!=4 or not np.all(np.isfinite(rgba)) or not np.all((np.asarray(rgba)>=0)&(np.asarray(rgba)<=1)):
            raise ValueError("PBR_V2_INVALID_ASSET: bad baseColorFactor")
        if rgba[3] != 1.0:
            # alpha on nominally opaque materials is ignored by glTF but
            # this preview intentionally refuses ambiguous source alpha.
            raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: baseColor alpha")
        metal=float(pbr.get("metallicFactor",1.0))
        rough=float(pbr.get("roughnessFactor",1.0))
        if not np.isfinite(metal+rough) or not 0<=metal<=1 or not 0<=rough<=1:
            raise ValueError("PBR_V2_INVALID_ASSET: metallic/roughness factors")
        base_texture=pbr.get("baseColorTexture")
        sampler=(resolve_base_sampler(model,base_texture,primitive,
                                      image_cache=image_cache)
                 if base_texture is not None else None)
        result.append((np.asarray(rgba[:3],dtype=np.float64),metal,rough,
                       bool(mat.get("doubleSided",False)),sampler))
    return result


def _safe_normal(v):
    lengths=np.linalg.norm(v,axis=1,keepdims=True)
    return v/np.maximum(lengths,1e-12)


def _pbr_preview(base,normal,eye,metallic,roughness):
    """Pinned explicit direct-light approximation; not IBL/full glTF PBR."""
    n=_safe_normal(normal)
    view=_safe_normal(eye)
    ndotv=np.clip(np.sum(n*view,axis=1),0.001,1)
    alpha=max(.04,roughness*roughness)
    f0=.04*(1-metallic)+base*metallic
    accum=base*(.025+.055*(1-roughness))*(1-metallic)+f0*(.10+.16*(1-roughness))
    lights=(
        ([-.55,.75,.65],3.4,[1,.96,.9]),
        ([.72,.18,.54],1.5,[.70,.82,1]),
        ([-.15,-.62,.77],.65,[1,.76,.58])
    )
    for direction,intensity,tint in lights:
        light=np.asarray(direction,dtype=np.float64)
        light/=np.linalg.norm(light)
        h=_safe_normal(view+light)
        nl=np.clip(np.sum(n*light,axis=1),0,1)
        nh=np.clip(np.sum(n*h,axis=1),0,1)
        vh=np.clip(np.sum(view*h,axis=1),0,1)
        denom=nh*nh*(alpha*alpha-1)+1
        d=alpha*alpha/np.maximum(math.pi*denom*denom,1e-6)
        k=(roughness+1)**2/8
        g=(ndotv/(ndotv*(1-k)+k))*(nl/(nl*(1-k)+k))
        fresnel=f0+(1-f0)*((1-vh[:,None])**5)
        spec=(d*g/np.maximum(4*ndotv*nl,1e-5))[:,None]*fresnel
        diffuse=(1-fresnel)*(1-metallic)*base/math.pi
        accum+=(diffuse+spec)*nl[:,None]*intensity*np.asarray(tint)
    return np.clip(accum/(1+accum),0,1)


def shade_visible(primitives,visibility,material_specs,position,
                  passes=PASSES,*,background=BACKGROUND,camera_fov=None):
    """PBR material attributes interpolated only at pixels that win depth."""
    if not passes or len(set(passes)) != len(passes) or any(x not in PASSES for x in passes):
        raise ValueError("PBR_V2_UNSUPPORTED: requested material passes")
    if len(primitives)!=len(material_specs):
        raise ValueError("PBR_V2_INVALID_ASSET: primitive/material count")
    winners=visibility["winnerSourceTriangle"]
    size=winners.shape[0]
    if winners.shape!=(size,size):
        raise ValueError("PBR_V2_INVALID_VISIBILITY: non-square camera")
    masks=winners>=0
    yy,xx=np.nonzero(masks)
    tri_ids=winners[yy,xx]
    weights=visibility["sourceWeights"][yy,xx]
    parts=visibility["primitiveBySourceTriangle"][tri_ids]
    offsets=np.cumsum([0]+[len(p.indices) for p in primitives])
    outputs={k:np.broadcast_to(np.asarray(background,dtype=np.uint8),(size,size,3)).copy() for k in passes}
    if "normal" in outputs:
        outputs["normal"][:]=BACKGROUND
    shaded=0
    camera_position=np.asarray(position,dtype=np.float64)
    gradient_required=any(spec[4] is not None and (
        spec[4]["minFilter"]!=spec[4]["magFilter"] or
        spec[4]["minFilter"] in (9984,9985,9986,9987)) for spec in material_specs)
    source_uv_scene=(np.ascontiguousarray(np.concatenate([
        p.texcoords if p.texcoords is not None
        else np.zeros((len(p.positions),2),dtype=np.float64) for p in primitives]))
        if gradient_required else None)
    texture_pixel_count=0
    for pid,(primitive,(factor,metallic,roughness,double_sided,sampler)) in enumerate(zip(primitives,material_specs)):
        choose=np.nonzero(parts==pid)[0]
        if not len(choose): continue
        ty,tx=yy[choose],xx[choose]
        local_faces=tri_ids[choose]-offsets[pid]
        tris=primitive.indices[local_faces]
        w=weights[choose]
        if len(w)>size*size:
            raise MemoryError("PBR_V2_RESOURCE: impossible per-pixel fragment count")
        color=np.broadcast_to(factor,(len(choose),3)).copy()
        if primitive.vertex_colors is not None:
            color*=np.einsum("ni,nij->nj",w,primitive.vertex_colors[tris])
        if sampler is not None:
            uv=np.einsum("ni,nij->nj",w,primitive.texcoords[tris])
            needs_gradient=(sampler["minFilter"]!=sampler["magFilter"] or
                            sampler["minFilter"] in (9984,9985,9986,9987))
            if needs_gradient:
                if camera_fov is None:
                    raise ValueError("PBR_V2_INVALID_VISIBILITY: camera projection required for mip LOD")
                dx,dy=compute_uv_derivatives(
                    {"sourceWeights":w,"depth":visibility["depth"][ty,tx],
                     "cameraVertices":visibility["cameraVertices"],
                     "sourceFaces":visibility["sourceFaces"]},
                    tri_ids[choose],source_uv_scene,size,camera_fov)
                color*=sample_linear_texture(sampler,uv,dx,dy)
            else:
                color*=sample_linear_texture(sampler,uv)
            texture_pixel_count+=len(choose)
        color=np.clip(color,0,1)
        if "albedo" in outputs:
            outputs["albedo"][ty,tx]=np.rint(linear_to_srgb(color)*255).astype(np.uint8)
        if "object-id" in outputs:
            seed=((pid+1)*2654435761) & 0xffffffff
            encoded=np.array([seed&255,(seed>>8)&255,(seed>>16)&255],dtype=np.uint8)
            outputs["object-id"][ty,tx]=encoded
        if "normal" in outputs or "beauty" in outputs:
            normal=np.einsum("ni,nij->nj",w,primitive.normals[tris])
            normal=_safe_normal(normal)
            world=np.einsum("ni,nij->nj",w,primitive.positions[tris])
            view=camera_position-world
            if double_sided:
                signs=np.where(np.sum(normal*view,axis=1)<0,-1.0,1.0)
                normal*=signs[:,None]
            if "normal" in outputs:
                outputs["normal"][ty,tx]=np.rint(
                    np.clip(normal*.5+.5,0,1)*255).astype(np.uint8)
            if "beauty" in outputs:
                lit=_pbr_preview(color,normal,view,metallic,roughness)
                outputs["beauty"][ty,tx]=np.rint(linear_to_srgb(lit)*255).astype(np.uint8)
        shaded+=len(choose)
    return outputs,{"shadedPixels":int(shaded),"coveredPixels":int(len(xx)),
                    "textureSampledPixels":int(texture_pixel_count),
                    "claimScope":"material-preview-only","certificationEligible":False}


def render_material_preview(primitives,model,position,target,up,fov,size,passes=PASSES,
                            *,tile_size=32,threads=1,max_working_mib=1024):
    # Conservative pre-raster memory estimate: Numba/native baseline,
    # 2 clipped raster slots per face, source vertex arrays, decoded
    # RGBA, mip hierarchy and temporary filter arrays (96 B/texel).
    # This is a preflight refusal, NOT a hard process RSS cap.
    count=sum(len(p.indices) for p in primitives)
    vertices=sum(len(p.positions) for p in primitives)
    unique_images={id(p.base_color_texture):p.base_color_texture
                   for p in primitives if p.base_color_texture is not None}
    pixels=sum(x.shape[0]*x.shape[1] for x in unique_images.values())
    if pixels>4_194_304 or any(x.shape[0]*x.shape[1]>2_097_152
                                for x in unique_images.values()):
        raise MemoryError("PBR_V2_RESOURCE: decoded scene texture pixel budget")
    estimated=(384*1024*1024+2*count*(9*8+9*8+4*4)
               +vertices*48+count*24+size*size*64+pixels*96)
    if estimated>max_working_mib*1024*1024:
        raise MemoryError("PBR_V2_RESOURCE: visibility plus mip source footprint")
    specs=validate_opaque_materials(model,primitives)
    started=time.perf_counter()
    visibility=render_visibility(primitives,position,target,up,fov,size,
                    tile_size=tile_size,threads=threads,max_working_mib=max_working_mib)
    seen=time.perf_counter()
    outputs,stats=shade_visible(primitives,visibility,specs,position,passes,camera_fov=fov)
    shaded=time.perf_counter()
    return outputs,visibility,{
        **stats,"visibility":visibility["stats"],
        "stageMs":{"visibilityIncludingJit":round((seen-started)*1000,3),
                   "shadeVisible":round((shaded-seen)*1000,3)},
        "renderer":PROFILE}


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    p=argparse.ArgumentParser(description="R14-06C opaque v2 PBR material preview")
    p.add_argument("--glb",required=True)
    p.add_argument("--frame",required=True)
    p.add_argument("--out",required=True)
    p.add_argument("--passes",default="albedo,normal,object-id,beauty")
    p.add_argument("--size",type=int,default=160)
    p.add_argument("--tile-size",type=int,choices=(16,32,64),default=32)
    p.add_argument("--threads",type=int,choices=(1,2,4,8),default=4)
    p.add_argument("--max-working-mb",type=int,default=1024)
    args=p.parse_args()
    out=Path(args.out)
    if out.exists(): raise ValueError("PBR_V2_INVALID_OUTPUT: refuses overwrite")
    glb=Path(args.glb); frame_path=Path(args.frame)
    source=glb.read_bytes(); frame_raw=frame_path.read_bytes()
    if len(source)*2>=args.max_working_mb*1024*1024:
        raise MemoryError("PBR_V2_RESOURCE: source exceeds budget")
    model,binary=parse_glb(glb)
    if _sha(glb.read_bytes())!=_sha(source):
        raise ValueError("PBR_V2_INVALID_ASSET: source modified during read")
    _,primitives=load_primitives(glb,parsed=(model,binary),
        max_texture_pixels=2_097_152,max_total_texture_pixels=4_194_304,
        max_image_encoded_bytes=16*1024*1024)
    frame,basis,origin,frame_digest=load_canonical_frame(frame_path)
    if _sha(frame_path.read_bytes())!=_sha(frame_raw):
        raise ValueError("PBR_V2_INVALID_CAMERA: frame modified during read")
    hero=frame.get("hero")
    if not hero: raise ValueError("PBR_V2_INVALID_CAMERA: Hero required")
    position=local_to_world(hero["position"],basis,origin)
    target=local_to_world(hero["target"],basis,origin)
    up=local_to_world(hero.get("up",[0,1,0]),basis)
    requested=tuple(args.passes.split(","))
    images,visibility,stats=render_material_preview(primitives,model,position,target,up,
        float(hero.get("fovY",31)),args.size,requested,tile_size=args.tile_size,
        threads=args.threads,max_working_mib=args.max_working_mb)
    output_parent=out.parent.resolve()
    output_parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".refas-pbr-v2-material-",dir=output_parent) as temp:
        stage=Path(temp)
        entries=[]
        for mode,image in images.items():
            path=stage/(mode+".png")
            Image.fromarray(image,"RGB").save(path)
            entries.append({"pass":mode,"path":path.name,"sha256":_sha(path.read_bytes())})
        report={
            "schema":SCHEMA,"claimScope":"material-preview-only",
            "certificationEligible":False,"status":"COMPLETE",
            "renderer":{"name":PROFILE,"visibilityProfile":VISIBILITY_PROFILE},
            "sourceGlbSha256":_sha(source),"frameFileSha256":_sha(frame_raw),
            "frameDigest":frame_digest,"size":args.size,
            "passes":list(images),"materialContract":{
                "supported":["opaque","base-color-factor","vertex-color-0","metallic-factor","roughness-factor",
                             "base-color-texture-png-analytic-mipmap-nearest-linear-trilinear"],
                "unsupported":["texture-extensions","texture-derivative-singular",
                               "normal-map","alpha-mask","alpha-blend","ibl","emissive","extensions"],
                "lighting":"fixed-direct-three-light-preview-no-ibl",
                "transfer":"srgb-decode-before-texel-filter-piecewise-v1",
                "textureSampling":"analytic-original-triangle-ray-derivatives-min-mag-mips",
                "mipmapGeneration":"linear-rgb-box-2x2-edge-replicated-v1",
                "appearanceCertified":False},
            "stats":stats,"outputs":entries,
            "geometryDigests":{
                "depth":_sha(np.ascontiguousarray(visibility["depth"]).tobytes()),
                "winner":_sha(np.ascontiguousarray(visibility["winnerSourceTriangle"]).tobytes()),
                "originalBarycentric":_sha(np.ascontiguousarray(visibility["sourceWeights"]).tobytes())}
        }
        (stage/"preview-report.json").write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
        if out.exists(): raise ValueError("PBR_V2_INVALID_OUTPUT: appeared during render")
        os.rename(stage,out)
    print(json.dumps({"status":"COMPLETE","claimScope":"material-preview-only",
                      "sourceTriangles":stats["visibility"]["inputTriangles"],
                      "shadedPixels":stats["shadedPixels"],"report":str(out/"preview-report.json")}))


if __name__=="__main__":
    main()

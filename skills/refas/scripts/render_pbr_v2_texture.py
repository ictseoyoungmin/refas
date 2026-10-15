"""R14-06C2 opaque glTF baseColorTexture: verifiable level-0 sampler only.

glTF source sRGB texels are decoded to linear RGB *before* bilinear
interpolation. No guessed mip selection, implicit normal maps or texture
extension handling. Original glTF (0,0) is image top-left.
"""
from __future__ import annotations

import numpy as np

NEAREST=9728
LINEAR=9729
REPEAT=10497
CLAMP_TO_EDGE=33071
MIRRORED_REPEAT=33648
FILTERS=(NEAREST,LINEAR)
WRAPS=(REPEAT,CLAMP_TO_EDGE,MIRRORED_REPEAT)
MIP_FILTERS=(9984,9985,9986,9987)


def srgb_to_linear(rgb):
    c=np.asarray(rgb,dtype=np.float64)
    return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)


def resolve_base_sampler(model,info,primitive):
    """Strict base-level glTF sampler; no silent mip/UV extension fallback."""
    if not isinstance(info,dict) or info.get("extensions"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: baseColorTexture extensions")
    if info.get("texCoord",0)!=0:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: only TEXCOORD_0 is supported")
    index=info.get("index")
    textures=model.get("textures",[])
    if not isinstance(index,int) or not 0<=index<len(textures):
        raise ValueError("PBR_V2_INVALID_ASSET: baseColorTexture index")
    texture=textures[index]
    if texture.get("extensions"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: texture extensions")
    source=texture.get("source")
    images=model.get("images",[])
    if not isinstance(source,int) or not 0<=source<len(images):
        raise ValueError("PBR_V2_INVALID_ASSET: texture source")
    image=images[source]
    if image.get("mimeType")!="image/png" or "bufferView" not in image or image.get("uri") or image.get("extensions"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: embedded PNG texture required")
    # Missing sampler filtering is implementation-defined per glTF; choose
    # fixed LINEAR at level zero, recorded as a v2 preview profile.
    sampler={}
    if "sampler" in texture:
        sid=texture["sampler"]
        samplers=model.get("samplers",[])
        if not isinstance(sid,int) or not 0<=sid<len(samplers):
            raise ValueError("PBR_V2_INVALID_ASSET: texture sampler index")
        sampler=samplers[sid]
    if sampler.get("extensions"):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: sampler extensions")
    min_filter=sampler.get("minFilter")
    mag_filter=sampler.get("magFilter")
    if min_filter in MIP_FILTERS:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: mipmap LOD unavailable")
    if min_filter is not None and min_filter not in FILTERS:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: unknown minFilter")
    if mag_filter is not None and mag_filter not in FILTERS:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: unknown magFilter")
    if min_filter is not None and mag_filter is not None and min_filter!=mag_filter:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: LOD-dependent filter selection")
    filtering=min_filter if min_filter is not None else (
        mag_filter if mag_filter is not None else LINEAR)
    wrap_s=sampler.get("wrapS",REPEAT)
    wrap_t=sampler.get("wrapT",REPEAT)
    if wrap_s not in WRAPS or wrap_t not in WRAPS:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: unknown texture wrapping")
    if primitive.texcoords is None or len(primitive.texcoords)!=len(primitive.positions):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: missing TEXCOORD_0")
    if not np.isfinite(primitive.texcoords).all():
        raise ValueError("PBR_V2_INVALID_ASSET: nonfinite TEXCOORD_0")
    texels=primitive.base_color_texture
    if texels is None or texels.ndim!=3 or texels.shape[2]!=4:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: decoded RGBA image required")
    if texels.shape[0]*texels.shape[1]>2_097_152:
        raise MemoryError("PBR_V2_RESOURCE: texture exceeds preview sampling budget")
    if not np.isfinite(texels).all() or np.any(texels<0) or np.any(texels>1):
        raise ValueError("PBR_V2_INVALID_ASSET: texture channels")
    return {"wrapS":wrap_s,"wrapT":wrap_t,"filter":filtering,
            "linearRGB":srgb_to_linear(texels[:,:,:3]),
            "alphaMode":"opaque-ignored"}


def _address(indices,length,wrap):
    if wrap==REPEAT:
        return np.mod(indices,length)
    if wrap==CLAMP_TO_EDGE:
        return np.clip(indices,0,length-1)
    if wrap==MIRRORED_REPEAT:
        doubled=2*length
        k=np.mod(indices,doubled)
        return np.where(k>=length,doubled-1-k,k)
    raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: sampler wrap")


def sample_linear_texture(descriptor,uv):
    """Return linear RGB at fragment UV, using texel-center glTF addressing."""
    texels=descriptor["linearRGB"]
    height,width=texels.shape[:2]
    coords=np.asarray(uv,dtype=np.float64)
    if coords.ndim!=2 or coords.shape[1]!=2 or not np.isfinite(coords).all():
        raise ValueError("PBR_V2_INVALID_ASSET: fragment UV")
    if descriptor["filter"]==NEAREST:
        ix=_address(np.floor(coords[:,0]*width).astype(np.int64),width,descriptor["wrapS"])
        iy=_address(np.floor(coords[:,1]*height).astype(np.int64),height,descriptor["wrapT"])
        return texels[iy,ix]
    if descriptor["filter"]!=LINEAR:
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: sampler filter")
    x=coords[:,0]*width-.5
    y=coords[:,1]*height-.5
    xi=np.floor(x).astype(np.int64)
    yi=np.floor(y).astype(np.int64)
    tx=(x-xi)[:,None];ty=(y-yi)[:,None]
    x0=_address(xi,width,descriptor["wrapS"])
    x1=_address(xi+1,width,descriptor["wrapS"])
    y0=_address(yi,height,descriptor["wrapT"])
    y1=_address(yi+1,height,descriptor["wrapT"])
    # Sampling in LINEAR color after decoding each source texel
    return ((1-tx)*(1-ty)*texels[y0,x0]+
            tx*(1-ty)*texels[y0,x1]+
            (1-tx)*ty*texels[y1,x0]+
            tx*ty*texels[y1,x1])

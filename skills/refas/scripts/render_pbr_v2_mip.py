"""R14-06C3: analytic per-source-triangle UV ray differentials and mips.

Diagnostic-only. A pixel neighbor may belong to a different triangle or
be occluded; gradients therefore use the winning ORIGINAL triangle plane.
"""
from __future__ import annotations
import math
import numpy as np


def compute_uv_derivatives(visibility, source_triangles, source_uv, size, fov):
    """Return duv/dx, duv/dy per visible original face sample.

    Source-triangle camera vertices A,B,C are columns of M. For pixel
    ray r=[ndc_x*scale,ndc_y*scale,1], unnormalized weights are
    q=inv(M)@r and UV=(q@UV)/(sum(q)). Since output already stores
    normalized original barycentrics and ray depth, the quotient
    derivative is depth * Σ[dq_i (UV_i-UV_pixel)].
    """
    src=np.asarray(source_triangles,dtype=np.int64)
    w=np.asarray(visibility["sourceWeights"],dtype=np.float64)
    depth=np.asarray(visibility["depth"],dtype=np.float64)
    cam=np.asarray(visibility["cameraVertices"],dtype=np.float64)
    faces=np.asarray(visibility["sourceFaces"],dtype=np.int64)
    uvs=np.asarray(source_uv,dtype=np.float64)
    if src.ndim!=1 or w.shape!=(len(src),3) or depth.shape!=(len(src),):
        raise ValueError("PBR_V2_INVALID_VISIBILITY: source weights or depth")
    if not len(src):
        return np.zeros((0,2)),np.zeros((0,2))
    if np.any(src<0) or np.any(src>=len(faces)):
        raise ValueError("PBR_V2_INVALID_VISIBILITY: original triangle ID")
    if not 32<=size<=1024 or not 1<=fov<=170:
        raise ValueError("PBR_V2_INVALID_CAMERA: gradient projection")
    unique, inverse=np.unique(src,return_inverse=True)
    original_faces=faces[unique]
    mats=np.transpose(cam[original_faces],(0,2,1))
    det=np.linalg.det(mats)
    if (not np.isfinite(det).all() or np.any(np.abs(det)<1e-14)):
        raise ValueError("PBR_V2_UNSUPPORTED_MATERIAL: UV derivative singular camera triangle")
    invert=np.linalg.inv(mats)[inverse]
    face_uv=uvs[faces[src]]
    expected=np.einsum("ni,nij->nj",w,face_uv)
    if not np.isfinite(expected).all() or not np.isfinite(depth).all():
        raise ValueError("PBR_V2_INVALID_VISIBILITY: nonfinite projected UV")
    # Pixel x advances camera-space ray along +x; screen y along -y.
    delta=2*math.tan(math.radians(float(fov))/2)/(size-1)
    dq_dx=invert[:,:,0]*delta
    dq_dy=invert[:,:,1]*(-delta)
    centered=face_uv-expected[:,None,:]
    du_dx=depth[:,None]*np.einsum("ni,nij->nj",dq_dx,centered)
    du_dy=depth[:,None]*np.einsum("ni,nij->nj",dq_dy,centered)
    if not np.isfinite(du_dx).all() or not np.isfinite(du_dy).all():
        raise ValueError("PBR_V2_INVALID_VISIBILITY: nonfinite UV differential")
    return du_dx,du_dy


def mip_linear_pyramid(base,max_pixels=2_097_152):
    """Deterministic 2x2 box filtering in LINEAR RGB with NPOT edge extend.

    The filter is an explicit v2 preview policy, not a glTF-specified
    universal mipmap-generation golden. Never filter raw sRGB bytes.
    """
    tex=np.asarray(base,dtype=np.float64)
    if tex.ndim!=3 or tex.shape[2]!=3 or not np.isfinite(tex).all():
        raise ValueError("PBR_V2_INVALID_ASSET: RGB mip input")
    if tex.shape[0]<1 or tex.shape[1]<1 or tex.shape[0]*tex.shape[1]>max_pixels:
        raise MemoryError("PBR_V2_RESOURCE: mip source pixels")
    levels=[tex]
    while min(levels[-1].shape[:2])>1 or max(levels[-1].shape[:2])>1:
        prev=levels[-1]
        h,w=prev.shape[:2]
        # Edge pixels are replicated for partial 2×2 groups of NPOT sizes.
        padded=np.pad(prev,((0,h%2),(0,w%2),(0,0)),mode="edge")
        nxt=(padded[0::2,0::2]+padded[1::2,0::2]+
             padded[0::2,1::2]+padded[1::2,1::2])*.25
        levels.append(nxt)
    return levels


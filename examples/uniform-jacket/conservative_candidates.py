"""Float64 AABB candidates and batched triangle SAT, including coplanar touch.

Never uses Blender's BVHTree.overlap, which applies a float32 triangle predicate
before returning pairs. scipy cKDTree only bounds triangle-box spheres; explicit
float64 AABB tests decide candidate membership. Padding adds candidates only.
"""
import numpy as np
from scipy.spatial import cKDTree


class AabbIndex:
    """Immutable evaluated surface; reuse its bucket trees for many queries."""
    def __init__(self,vertices,faces):
        self.vertices=np.asarray(vertices,dtype=np.float64); self.faces=np.asarray(faces,dtype=np.int32)
        if not len(self.faces):self.faces=np.empty((0,3),dtype=np.int32)
        assert self.faces.ndim==2 and self.faces.shape[1]==3
        self.triangles=self.vertices[self.faces]
        assert np.isfinite(self.triangles).all()
        self.minimum=self.triangles.min(axis=1); self.maximum=self.triangles.max(axis=1)
        self.centers=(self.minimum+self.maximum)*.5
        self.radii=np.linalg.norm(self.maximum-self.minimum,axis=1)*.5
        bins=np.floor(np.log2(np.maximum(self.radii,1e-12))).astype(np.int32)
        self.buckets=[]
        for bucket in np.unique(bins):
            ids=np.flatnonzero(bins==bucket)
            self.buckets.append((ids,cKDTree(self.centers[ids]),float(self.radii[ids].max()),self.minimum[ids].min(axis=0),self.maximum[ids].max(axis=0)))


def indexed_candidate_pairs(a,b=None,padding=1e-7):
    same=b is None or b is a; b=a if b is None else b
    if not len(a.faces) or not len(b.faces):return np.empty((0,2),dtype=np.int32)
    amin=a.minimum; amax=a.maximum; ac=a.centers; ar=a.radii
    bmin=b.minimum; bmax=b.maximum
    chunks=[]
    for ids,tree,maximum_radius,low,high in b.buckets:
        eligible=np.flatnonzero(np.all(amax>=low-padding,axis=1)&np.all(amin<=high+padding,axis=1))
        if not len(eligible):continue
        radius=ar[eligible]+maximum_radius+np.sqrt(3)*padding+1e-12
        neighbors=tree.query_ball_point(ac[eligible],radius,return_sorted=False)
        counts=np.fromiter((len(x) for x in neighbors),dtype=np.int64,count=len(neighbors))
        if not counts.sum():continue
        left=np.repeat(eligible,counts); right=ids[np.concatenate([np.asarray(x,dtype=np.int32) for x in neighbors if len(x)])]
        keep=np.all(amax[left]>=bmin[right]-padding,axis=1)&np.all(amin[left]<=bmax[right]+padding,axis=1)
        if same:keep&=left<right
        if np.any(keep):chunks.append(np.stack([left[keep],right[keep]],axis=1))
    return np.concatenate(chunks,axis=0) if chunks else np.empty((0,2),dtype=np.int32)


def candidate_pairs(vertices_a, faces_a, vertices_b=None, faces_b=None, padding=1e-7):
    a=AabbIndex(vertices_a,faces_a)
    b=None if vertices_b is None else AabbIndex(vertices_b,faces_b)
    return indexed_candidate_pairs(a,b,padding)


def triangle_contact_mask(one,two,batch_size=8192):
    one=np.asarray(one,dtype=np.float64); two=np.asarray(two,dtype=np.float64)
    assert one.shape==two.shape and one.ndim==3 and one.shape[1:]==(3,3)
    result=np.zeros(len(one),dtype=bool)
    for start in range(0,len(one),batch_size):
        stop=min(start+batch_size,len(one)); origin=one[start:stop,0:1].copy()
        a=one[start:stop]-origin; b=two[start:stop]-origin
        ea=np.roll(a,-1,axis=1)-a; eb=np.roll(b,-1,axis=1)-b
        na=np.cross(ea[:,0],ea[:,1]); nb=np.cross(eb[:,0],eb[:,1])
        edges=np.concatenate([ea,eb],axis=1)
        axes=np.concatenate([na[:,None],nb[:,None],np.cross(ea[:,:,None],eb[:,None]).reshape(-1,9,3),np.cross(na[:,None],edges),np.cross(nb[:,None],edges)],axis=1)
        lengths=np.linalg.norm(axes,axis=2)
        axes=np.divide(axes,lengths[:,:,None],out=np.zeros_like(axes),where=lengths[:,:,None]>0)
        pa=np.einsum('nvi,nai->nva',a,axes); pb=np.einsum('nvi,nai->nva',b,axes)
        span=np.ptp(np.concatenate([a,b],axis=1),axis=1).max(axis=1)
        epsilon=np.maximum(1e-12,span*np.finfo(np.float64).eps*64)
        separated=(pa.max(axis=1)<pb.min(axis=1)-epsilon[:,None])|(pb.max(axis=1)<pa.min(axis=1)-epsilon[:,None])
        result[start:stop]=~np.any(separated,axis=1)&np.any(na!=0,axis=1)&np.any(nb!=0,axis=1)
    return result


def confirmed_pairs(vertices_a,faces_a,vertices_b=None,faces_b=None,padding=1e-7,exclude_shared_vertices=False,labels_a=None,labels_b=None):
    same=vertices_b is None; va=np.asarray(vertices_a,dtype=np.float64); fa=np.asarray(faces_a,dtype=np.int32)
    vb=va if same else np.asarray(vertices_b,dtype=np.float64); fb=fa if same else np.asarray(faces_b,dtype=np.int32)
    pairs=candidate_pairs(va,fa,None if same else vb,None if same else fb,padding)
    if not len(pairs):return pairs
    if same and exclude_shared_vertices:
        keep=~np.any(fa[pairs[:,0],:,None]==fa[pairs[:,1],None,:],axis=(1,2)); pairs=pairs[keep]
    if labels_a is not None:
        la=np.asarray(labels_a); lb=la if same else np.asarray(labels_b)
        pairs=pairs[la[pairs[:,0]]!=lb[pairs[:,1]]]
    if not len(pairs):return pairs
    return pairs[triangle_contact_mask(va[fa[pairs[:,0]]],vb[fb[pairs[:,1]]])]


class SurfaceTree:
    """Compatibility wrapper: conservative overlap, unchanged nearest queries.

Use confirmed_pairs for large observations to run SAT in batches. overlap
returns raw conservative candidates and never performs a triangle predicate.
"""
    def __init__(self,vertices,polygons,all_triangles=True,epsilon=0.):
        assert all_triangles
        self.vertices=np.asarray(vertices,dtype=np.float64)
        self.faces=np.asarray(polygons,dtype=np.int32)
        assert self.faces.ndim==2 and self.faces.shape[1]==3
        self.epsilon=epsilon; self.nearest=None; self.index=AabbIndex(self.vertices,self.faces)
    @classmethod
    def FromPolygons(cls,*args,**kwargs):return cls(*args,**kwargs)
    def overlap(self,other):
        return indexed_candidate_pairs(self.index,other.index,max(self.epsilon,other.epsilon))
    def find_nearest(self,*args,**kwargs):
        if self.nearest is None:
            from mathutils.bvhtree import BVHTree
            self.nearest=BVHTree.FromPolygons(self.vertices.tolist(),self.faces.tolist(),all_triangles=True,epsilon=self.epsilon)
        return self.nearest.find_nearest(*args,**kwargs)

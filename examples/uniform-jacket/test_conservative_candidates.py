"""Independent fixtures and brute-force recall for contact candidate coverage."""
import bpy, hashlib, json, os, sys
from pathlib import Path
import numpy as np
import scipy
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from conservative_candidates import candidate_pairs, indexed_candidate_pairs, AabbIndex, confirmed_pairs, triangle_contact_mask
from geometry_wearable import triangle_contact
rng=np.random.default_rng(710231)
base=np.array([[0.,0.,0.],[.001,0.,0.],[0.,.001,0.]])
inside=np.array([[.0001,.0001,0.],[.0009,.0001,0.],[.0001,.0009,0.]])
f=np.array([[0,1,2]],dtype=np.int32)
left=BVHTree.FromPolygons(base.tolist(),f.tolist(),all_triangles=True,epsilon=1e-7)
right=BVHTree.FromPolygons(inside.tolist(),f.tolist(),all_triangles=True,epsilon=1e-7)
old=left.overlap(right); new=confirmed_pairs(base,f,inside,f)
assert old==[] and new.tolist()==[[0,0]] and triangle_contact(base,inside)
fixture_rows=[]
cases=[('coplanar_overlap',base,inside,True),('coplanar_boundary',base,base+[.001,0,0],True),('separate_plane',base,inside+[0,0,1e-5],False),('edge_through_face',base,np.array([[.0002,.0002,-.001],[.0002,.0002,.001],[.0008,.0002,.001]]),True),('coincident_duplicate',base,base,True),('degenerate',base,base[[0,0,1]],False)]
for name,a,b,expected in cases:
    actual=bool(triangle_contact_mask(a[None],b[None])[0]); assert actual==expected and actual==triangle_contact(a,b),(name,actual,expected)
    if expected:assert len(candidate_pairs(a,f,b,f))==1
    fixture_rows.append({'name':name,'expectedContact':expected,'actualContact':actual})
one=[]; two=[]
for i in range(2000):
    scale=10.**rng.uniform(-6,1)
    origin=rng.choice([0.,1.3,1000.],size=3)
    a=rng.normal(size=(3,3))*scale+origin
    b=rng.normal(size=(3,3))*scale+origin
    if i%4==0:b=a+rng.normal(size=3)*scale*.1
    if i%7==0:
        a[:,2]=origin[2]; b[:,2]=origin[2]
    one.append(a); two.append(b)
one=np.array(one); two=np.array(two)
actual=triangle_contact_mask(one,two); expected=np.array([triangle_contact(a,b) for a,b in zip(one,two)])
assert np.array_equal(actual,expected),np.flatnonzero(actual!=expected).tolist()
recall=[]
for iteration in range(30):
    na=37; nb=43
    scales_a=10.**rng.uniform(-6,1,size=na); scales_b=10.**rng.uniform(-6,1,size=nb)
    origin=rng.choice([0.,1.3,1000.],size=3)
    a=rng.normal(size=(na,3,3))*scales_a[:,None,None]+rng.normal(size=(na,1,3))*.01+origin
    b=rng.normal(size=(nb,3,3))*scales_b[:,None,None]+rng.normal(size=(nb,1,3))*.01+origin
    # Include a tiny triangle deep inside a very large box, exact contact,
    # long thin triangles, and materially different size buckets.
    a[0]=base+origin; b[0]=inside+origin; a[1,:,1:]*=1e-4
    va=a.reshape(-1,3); vb=b.reshape(-1,3); fa=np.arange(na*3).reshape(-1,3); fb=np.arange(nb*3).reshape(-1,3)
    pad=[0.,1e-7,1e-5][iteration%3]
    amin=a.min(axis=1); amax=a.max(axis=1); bmin=b.min(axis=1); bmax=b.max(axis=1)
    brute=np.argwhere(np.all(amax[:,None]>=bmin[None]-pad,axis=2)&np.all(amin[:,None]<=bmax[None]+pad,axis=2))
    found=candidate_pairs(va,fa,vb,fb,pad)
    assert set(map(tuple,found))==set(map(tuple,brute)),iteration
    cached=indexed_candidate_pairs(AabbIndex(va,fa),AabbIndex(vb,fb),pad)
    assert set(map(tuple,cached))==set(map(tuple,brute)),('cache',iteration)
    self_brute=np.argwhere(np.triu(np.all(amax[:,None]>=amin[None]-pad,axis=2)&np.all(amin[:,None]<=amax[None]+pad,axis=2),1))
    self_found=candidate_pairs(va,fa,padding=pad)
    assert set(map(tuple,self_found))==set(map(tuple,self_brute)),('self',iteration)
    recall.append({'case':iteration,'paddingM':pad,'crossPairs':len(brute),'selfPairs':len(self_brute),'missedCrossPairs':0,'missedSelfPairs':0})
out=Path(os.environ['JACKET_WEARABLE_OUT']); out.mkdir(parents=True,exist_ok=True)
helper=Path(__file__).with_name('conservative_candidates.py')
report={'status':'PASS','blender':bpy.app.version_string,'scipy':scipy.__version__,'numpy':np.__version__,'helperSha256':hashlib.sha256(helper.read_bytes()).hexdigest(),'originalBvhCoplanarPairs':old,'correctCoplanarPairs':new.tolist(),'fixtures':fixture_rows,'randomScalarSatParity':{'seed':710231,'trianglePairs':2000,'mismatches':0},'bruteForceAabbRecall':recall,'scope':'Synthetic controls only, no geometry acceptance. Candidate coverage equals exhaustivefloat64AABB tests across disparate triangle sizes, cached/uncached/self queries; batchedSAT matches the independently retained scalar formula including coplanar and edge-through-face controls.'}
(out/'conservative-candidates-controls.json').write_text(json.dumps(report,indent=2)+'\n')
(out/'captured-conservative-candidates.py').write_bytes(helper.read_bytes())
print('CONSERVATIVE_CONTROLS',report['status'],report['helperSha256'])

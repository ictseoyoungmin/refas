import math
import unittest
from collections import Counter
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts/production"))
from section_sweep import sweep_sections

RECT=((-0.03,-0.01),(0.03,-0.01),(0.03,0.01),(-0.03,0.01))

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def unit(a): return tuple(x/math.hypot(*a) for x in a)

def edge_counts(faces):
    return Counter(tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1]))

def volume(mesh):
    return sum(dot(mesh.vertices[f[0]],cross(mesh.vertices[f[j]],mesh.vertices[f[j+1]]))/6
               for f in mesh.faces for j in range(1,len(f)-1))

def signed_edge_counts(faces):
    return Counter((a,b) for f in faces for a,b in zip(f,f[1:]+f[:1]))

class SweepTests(unittest.TestCase):
    def make(self,centers,profile=RECT,**kw):
        return sweep_sections(centers,[profile]*len(centers),(1,0,0),closed_profile=True,**kw)
    def assert_frames(self,m):
        for u,v,t in m.frames:
            for a in (u,v,t): self.assertAlmostEqual(dot(a,a),1,places=12)
            for a,b in ((u,v),(v,t),(t,u)): self.assertAlmostEqual(dot(a,b),0,places=12)
            self.assertAlmostEqual(dot(cross(u,v),t),1,places=12)
    def test_straight_closed_volume_winding(self):
        m=self.make([(0,0,0),(0,0,1),(0,0,2)],cap_ends=True)
        self.assertEqual(len(m.vertices),12)
        self.assertEqual(len(m.faces),12)
        self.assertTrue(all(c==2 for c in edge_counts(m.faces).values()))
        counts=signed_edge_counts(m.faces)
        self.assertTrue(all(n==counts[(b,a)]==1 for (a,b),n in counts.items()))
        self.assertAlmostEqual(volume(m),.06*.02*2)
        self.assertEqual(m.vertices[:4],tuple((x,y,0) for x,y in RECT))
        self.assert_frames(m)
    def test_open_profile_and_uncapped_tube(self):
        c=[(0,0,0),(0,0,1),(0,0,2)]
        m=sweep_sections(c,[RECT[:3]]*3,(1,0,0),closed_profile=False)
        self.assertEqual((len(m.vertices),len(m.faces)),(9,4))
        self.assertEqual(sum(v==1 for v in edge_counts(m.faces).values()),8)
        m=self.make(c)
        self.assertEqual(sum(v==1 for v in edge_counts(m.faces).values()),8)
    def test_inflection_and_helix(self):
        paths=[[(t,.32*t**3,0) for t in [i/50 for i in range(-50,51)]],
               [(math.cos(t),math.sin(t),.3*t) for t in [i/30 for i in range(241)]]]
        for c in paths:
            # Initial vector chosen nonparallel to each guide.
            m=sweep_sections(c,[RECT]*len(c),(0,0,1),closed_profile=True)
            self.assert_frames(m)
            for (u,v,t),(u1,v1,t1) in zip(m.frames,m.frames[1:]):
                # Independent rotation oracle: Rodrigues using axis and angle.
                axis=cross(t,t1); s=math.hypot(*axis); d=dot(t,t1)
                expected=u if s<1e-14 else tuple(d*x+s*y+(1-d)*dot(unit(axis),u)*z for x,y,z in zip(u,cross(unit(axis),u),unit(axis)))
                self.assertLess(math.dist(expected,u1),1e-12)
    def test_legacy_axis_switch_control(self):
        # v1.4.1 frameAt switches world-up at |t.y| > .92. Equal-arc
        # chord bisectors reproduce the sampled tangent away from endpoints.
        angles=[math.radians(45+i/2) for i in range(81)]
        c=[(math.sin(a),1-math.cos(a),0) for a in angles]
        m=sweep_sections(c,[RECT]*len(c),(0,0,1),closed_profile=True,cap_ends=True)
        old=[unit(cross(t,(1,0,0) if abs(t[1])>.92 else (0,1,0))) for u,v,t in m.frames]
        self.assertLess(min(dot(a,b) for a,b in zip(old,old[1:])), -.999999)
        self.assertGreater(min(dot(a[0],b[0]) for a,b in zip(m.frames,m.frames[1:])), .999999)
        self.assertEqual((len(m.vertices),len(m.faces)),(324,324))
        self.assertTrue(all(x==2 for x in edge_counts(m.faces).values()))

    def test_absolute_twist(self):
        m=self.make([(0,0,i) for i in range(3)],twist=[0,math.pi/4,math.pi/4])
        self.assertEqual(m.frames[1],m.frames[2])
        self.assertAlmostEqual(m.frames[2][0][0],2**-.5)
    def test_different_profile_dimensions_and_fixed_ends(self):
        c=[(0,0,i) for i in range(3)]
        m=sweep_sections(c,[RECT,[(x*2,y/2) for x,y in RECT],RECT],(1,0,0),closed_profile=True)
        self.assertAlmostEqual(math.dist(m.vertices[4],m.vertices[5]),.12)
        self.assertEqual(m.vertices[:4],tuple((x,y,0) for x,y in RECT))
        self.assertEqual(m.vertices[-4:],tuple((x,y,2) for x,y in RECT))
    def test_rigid_equivariance(self):
        c=[(0,0,0),(.03,.04,.5),(.1,.09,1)]
        m=self.make(c,cap_ends=True)
        def r(p): return (p[2],p[0],p[1])
        def tr(p): return tuple(a+b for a,b in zip(r(p),(10,-4,3)))
        n=sweep_sections(list(map(tr,c)),[RECT]*3,r((1,0,0)),closed_profile=True,cap_ends=True)
        self.assertEqual(m.faces,n.faces)
        self.assertLess(max(math.dist(tr(a),b) for a,b in zip(m.vertices,n.vertices)),1e-12)
    def test_scale_equivariance(self):
        c=[(0,0,0),(.03,.04,.5),(.1,.09,1)]
        m=self.make(c,cap_ends=True)
        for s in (1e-9,1e9):
            n=self.make([tuple(x*s for x in p) for p in c],[(x*s,y*s) for x,y in RECT],cap_ends=True)
            self.assertEqual(m.faces,n.faces)
            self.assertLess(max(math.dist(a,tuple(x/s for x in b)) for a,b in zip(m.vertices,n.vertices)),1e-12)
    def test_invalid_guide(self):
        for c in ([(0,0,0)],[(0,0,0),(0,0,0)],[(0,0,0),(0,0,1),(0,0,.5)],[(0,0,0),(0,0,1),(0,0,0)],[(0,0,0),(math.nan,0,1)]):
            with self.subTest(c=c),self.assertRaises(ValueError): self.make(c)
        with self.assertRaises(ValueError): self.make([(0,0,0),(1,0,0)])
    def test_invalid_profiles(self):
        c=[(0,0,0),(0,0,1)]
        for profile in (RECT[::-1],(RECT[0],RECT[2],RECT[1],RECT[3]),RECT+(RECT[0],),((0,0),(0,0),(0,1)),((0,0),(1,0),(0,0),(0,1))):
            with self.subTest(profile=profile),self.assertRaises(ValueError): self.make(c,profile)
        with self.assertRaises(ValueError): sweep_sections(c,[RECT,RECT[:3]],(1,0,0),closed_profile=True)
        with self.assertRaises(ValueError): sweep_sections(c,[RECT]*2,(1,0,0),closed_profile=False,cap_ends=True)
        with self.assertRaises(ValueError): self.make(c,twist=[0,math.inf])
    def test_concave_open_ends_and_convex_cap_restriction(self):
        p=((0,0),(2,0),(2,2),(1,1),(0,2))
        c=[(0,0,0),(0,0,4)]
        self.assertEqual(len(self.make(c,p).faces),5)
        with self.assertRaises(ValueError): self.make(c,p,cap_ends=True)
    def test_reject_folded_quad(self):
        with self.assertRaises(ValueError): self.make([(0,0,0),(0,0,.01)],twist=[0,math.pi])

if __name__=='__main__': unittest.main()

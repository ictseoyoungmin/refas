"""R14-03: deterministic compiled parallel tile raster, no certification."""
from __future__ import annotations

import hashlib
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from render_cpu_opt import njit
from render_cpu_tiled import render_hero_tiled, numba_config
from render_glb import Primitive
from benchmark_render_cpu import grid_geometry, strand_geometry


def part(positions, indices, oid=0):
    points=np.asarray(positions,dtype=np.float64)
    return Primitive(points,np.tile([0.,0.,1.],(len(points),1)),
        np.asarray(indices,dtype=np.int64),
        np.asarray([.5,.7,.8]),0.,.6,oid,"body")


@unittest.skipUnless(njit is not None,"optional numba not available")
class TiledCpuTests(unittest.TestCase):
    pos=np.array([0.,0.,0.])
    look=np.array([0.,0.,1.])
    up=np.array([0.,1.,0.])

    def render(self,primitives,mode="object-id",size=96,tiles=32,threads=1,position=None,target=None,budget=512):
        return render_hero_tiled(primitives,
            self.pos if position is None else position,
            self.look if target is None else target,self.up,65,size,mode,
            tile_size=tiles,threads=threads,max_working_mib=budget)

    def test_real_grid_threads_and_tiles_are_bit_identical(self):
        coords,_,faces=grid_geometry(1024,organic=True)
        models=[part(coords,faces)]
        reference=self.render(models,mode="normal",size=96,tiles=32,threads=1)
        self.assertGreater(reference[3]["coveredPixels"],0)
        self.assertEqual(reference[3]["inputTriangles"],1024)
        self.assertGreater(reference[3]["binEntries"],0)
        supported=[1,2,4]
        supported=[n for n in supported if n<=numba_config.NUMBA_NUM_THREADS]
        for tile in (16,32,64):
            for threads in supported:
                candidate=self.render(models,mode="normal",size=96,tiles=tile,threads=threads)
                with self.subTest(tile=tile,threads=threads):
                    self.assertTrue(np.array_equal(reference[0],candidate[0]))
                    self.assertTrue(np.array_equal(reference[1],candidate[1]))
                    self.assertTrue(np.array_equal(reference[2],candidate[2]))
                    self.assertEqual(reference[3]["coveredPixels"],candidate[3]["coveredPixels"])

    def test_near_crossing_and_overlap_stable(self):
        near=part([[-.13,-.16,.005],[.16,-.16,.6],[0,.16,.6]],[[0,1,2]])
        far=part([[-.4,-.3,1.],[.4,-.3,1.],[0,.5,1.]],[[0,1,2]],1)
        a=self.render([far,near],tiles=16,threads=1)
        b=self.render([far,near],tiles=64,threads=min(2,numba_config.NUMBA_NUM_THREADS))
        self.assertGreater(a[3]["nearClippedTriangles"],0)
        self.assertGreater(a[3]["coveredPixels"],0)
        self.assertTrue(np.array_equal(a[0],b[0]))
        self.assertTrue(np.array_equal(a[2],b[2]))

    def test_dense_non_degenerate_hair_ribbons(self):
        coords,_,faces=strand_geometry(12000,seed=91)
        self.assertEqual(len(faces),12000)
        model=part(coords,faces)
        a=self.render([model],size=96,tiles=16,threads=1,
            position=np.array([0.,0.,-4.]),target=np.array([0.,0.,0.]))
        b=self.render([model],size=96,tiles=32,
            threads=min(2,numba_config.NUMBA_NUM_THREADS),
            position=np.array([0.,0.,-4.]),target=np.array([0.,0.,0.]))
        self.assertEqual(a[3]["inputTriangles"],12000)
        self.assertGreater(a[3]["preparedTriangles"],0)
        self.assertGreater(a[3]["binEntries"],0)
        self.assertTrue(np.array_equal(a[0],b[0]))
        self.assertTrue(np.array_equal(a[2],b[2]))

    def test_resource_budget_and_unsupported_options_fail_closed(self):
        model=part([[-.4,-.4,2],[.4,-.4,2],[0,.4,2]],[[0,1,2]])
        with self.assertRaisesRegex(MemoryError,"TILED_CPU_RESOURCE"):
            self.render([model],budget=128)
        with self.assertRaisesRegex(ValueError,"TILED_CPU_UNSUPPORTED"):
            self.render([model],tiles=12)
        with self.assertRaisesRegex(ValueError,"TILED_CPU_UNSUPPORTED"):
            self.render([model],mode="beauty")
        malformed=part([[-.4,-.4,2],[.4,-.4,2],[0,.4,2]],[[0,1,5]])
        with self.assertRaisesRegex(ValueError,"TILED_CPU_INVALID_ASSET"):
            self.render([malformed])

    def test_same_depth_equal_geometry_global_winner_is_stable(self):
        model0=part([[-.4,-.4,2],[.4,-.4,2],[0,.4,2]],[[0,1,2]],0)
        model1=part([[-.4,-.4,2],[.4,-.4,2],[0,.4,2]],[[0,1,2]],1)
        a=self.render([model0,model1],tiles=16,threads=1)
        b=self.render([model0,model1],tiles=64,
                      threads=min(2,numba_config.NUMBA_NUM_THREADS))
        self.assertGreater(a[3]["coveredPixels"],0)
        self.assertTrue(np.array_equal(a[2],b[2]))
        self.assertTrue(np.all(a[2][a[2]>=0] == 0))

if __name__=="__main__":
    unittest.main()

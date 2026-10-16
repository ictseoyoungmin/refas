"""R14-04: shared visibility, digest scoped cache, no certifying claims."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from render_glb import Primitive
from render_cpu_opt import njit
from render_cpu_tiled import render_hero_tiled, numba_config
from render_cpu_visibility import render_bundle, _cache_key
from benchmark_render_cpu import grid_geometry, strand_geometry, create_fixture


def part(positions,faces,oid=0,color=(.45,.7,.2)):
    pts=np.asarray(positions,dtype=np.float64)
    return Primitive(pts,np.tile([0.,0.,1.],(len(pts),1)),
        np.asarray(faces,dtype=np.int64),np.asarray(color,dtype=np.float64),
        0.,.7,oid,"body")


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class VisibilityBundleTests(unittest.TestCase):
    origin=np.array([0.,0.,-4.])
    target=np.array([0.,0.,0.])
    up=np.array([0.,1.,0.])
    source_sha="a"*64
    frame_sha="b"*64
    frame_digest="c"*64

    def run_bundle(self,models,passes=("normal","object-id","albedo"),root=None,
                   size=96,tile_size=32,threads=1,frame_sha=None):
        return render_bundle(models,self.origin,self.target,self.up,65,size,passes,
            tile_size=tile_size,threads=threads,max_working_mib=512,
            cache_root=root,glb_sha=self.source_sha,
            frame_sha=frame_sha or self.frame_sha,frame_digest=self.frame_digest)

    def test_multi_pass_matches_separate_renders_and_one_visibility_evaluation(self):
        pos,_,faces=grid_geometry(1024,organic=True)
        models=[part(pos,faces,color=(.35,.72,.21))]
        images,metrics=self.run_bundle(models)
        self.assertEqual(set(images),{"normal","object-id","albedo"})
        self.assertEqual(metrics["visibilityEvaluations"],1)
        self.assertEqual(metrics["passesRendered"],3)
        self.assertFalse(metrics["cacheHit"])
        self.assertGreater(metrics["coveredPixels"],0)
        for render_pass in ("normal","object-id"):
            standalone,_,_,_=render_hero_tiled(models,self.origin,self.target,self.up,
                65,96,render_pass,tile_size=32,threads=1,max_working_mib=512)
            self.assertTrue(np.array_equal(images[render_pass],standalone),
                            f"{render_pass} differs from direct tiled renderer")
        self.assertGreater(np.count_nonzero(np.any(
            images["albedo"]!=np.asarray([12,15,19]),axis=2)),0)

    def test_cache_hit_does_not_rasterize_and_preserves_png_bytes(self):
        pos,_,faces=grid_geometry(1024,organic=False)
        models=[part(pos,faces)]
        with tempfile.TemporaryDirectory(prefix="refas-vis-cache-test-") as folder:
            root=Path(folder)
            one,s1=self.run_bundle(models,root=root)
            two,s2=self.run_bundle(models,root=root)
            self.assertFalse(s1["cacheHit"])
            self.assertTrue(s2["cacheHit"])
            self.assertEqual(s2["visibilityEvaluations"],0)
            self.assertEqual(s1["cacheKey"],s2["cacheKey"])
            for name in one:
                self.assertTrue(np.array_equal(one[name],two[name]))
            self.assertEqual(len(list(root.glob("*/manifest.json"))),1)

    def test_changed_frame_key_does_not_reuse_cache(self):
        pos,_,faces=grid_geometry(256,organic=True)
        models=[part(pos,faces)]
        with tempfile.TemporaryDirectory(prefix="refas-vis-cache-keys-") as folder:
            a,one=self.run_bundle(models,root=folder)
            b,two=self.run_bundle(models,root=folder,frame_sha="d"*64)
            self.assertFalse(one["cacheHit"])
            self.assertFalse(two["cacheHit"])
            self.assertNotEqual(one["cacheKey"],two["cacheKey"])
            self.assertEqual(len(list(Path(folder).glob("*/manifest.json"))),2)

    def test_corrupt_cache_bytes_fail_closed_and_do_not_use_preview(self):
        pos,_,faces=grid_geometry(256,organic=False)
        models=[part(pos,faces)]
        with tempfile.TemporaryDirectory(prefix="refas-vis-corruption-") as folder:
            first,stats=self.run_bundle(models,root=folder)
            entry=Path(folder)/stats["cacheKey"]/"winner.npy"
            data=bytearray(entry.read_bytes())
            data[-1] ^= 255
            entry.write_bytes(data)
            with self.assertRaisesRegex(ValueError,"VISIBILITY_CACHE_INVALID"):
                self.run_bundle(models,root=folder)

    def test_one_visibility_for_overlapping_dense_strands_and_tile_parity(self):
        pos,_,faces=strand_geometry(12000,seed=91)
        models=[part(pos,faces)]
        a,s1=self.run_bundle(models,tile_size=16,threads=1)
        b,s2=self.run_bundle(models,tile_size=64,
                 threads=min(2,numba_config.NUMBA_NUM_THREADS))
        self.assertEqual(s1["visibilityEvaluations"],1)
        self.assertEqual(s2["visibilityEvaluations"],1)
        for name in a:
            self.assertTrue(np.array_equal(a[name],b[name]),
                            f"{name} varies by threading or tile size")

    def test_bad_pass_and_bad_resource_refused(self):
        pos,_,faces=grid_geometry(128,organic=False)
        models=[part(pos,faces)]
        with self.assertRaisesRegex(ValueError,"VISIBILITY_CPU_UNSUPPORTED"):
            self.run_bundle(models,passes=("normal","normal"))
        with self.assertRaisesRegex(MemoryError,"TILED_CPU_RESOURCE"):
            render_bundle(models,self.origin,self.target,self.up,65,96,
                ("normal",),max_working_mib=128)

    def test_real_cli_two_runs_persist_identical_pngs_and_sha(self):
        source=Path(__file__).resolve().parents[1]/"skills/refas/scripts/render_cpu_visibility.py"
        with tempfile.TemporaryDirectory(prefix="refas-vis-cli-") as folder:
            root=Path(folder)
            glb=root/"asset.glb"
            frame=root/"frame.json"
            create_fixture(glb,frame,"organic",502,17)
            for idx in (0,1):
                out=root/f"output-{idx}"
                command=[sys.executable,str(source),"--glb",str(glb),"--frame",str(frame),
                    "--out",str(out),"--size","48","--cache-dir",str(root/"cache"),
                    "--max-working-mb","512","--threads","1","--tile-size","32"]
                proc=subprocess.run(command,text=True,capture_output=True,timeout=75)
                self.assertEqual(proc.returncode,0,proc.stderr)
                report=json.loads((out/"render-report.json").read_text())
                self.assertEqual(report["claimScope"],"diagnostic-only")
                self.assertFalse(report["certificationEligible"])
                self.assertEqual(report["stats"]["cacheHit"],bool(idx))
                self.assertEqual(len(report["outputs"]),3)
                for item in report["outputs"]:
                    digest=hashlib.sha256((out/item["path"]).read_bytes()).hexdigest()
                    self.assertEqual(digest,item["sha256"])
            self.assertEqual((root/"output-0"/"normal.png").read_bytes(),
                             (root/"output-1"/"normal.png").read_bytes())
            self.assertEqual((root/"output-0"/"object-id.png").read_bytes(),
                             (root/"output-1"/"object-id.png").read_bytes())


if __name__=="__main__":
    unittest.main()

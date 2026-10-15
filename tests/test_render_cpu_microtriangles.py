"""R14-05B tiny positive-area raster correctness (diagnostic only).

A subpixel triangle can still cover a pixel *center*.  World-space normal
length and projected area must not be used as absolute decimation thresholds.
"""
from __future__ import annotations

import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from render_glb import Primitive, camera_basis
import render_cpu_tiled as tiled
from render_cpu_visibility import render_bundle, PROFILE as VISIBILITY_PROFILE


def tiny_model(*, pixel=(32., 32.), radius=3e-7, size=64, depth=2.):
    """Construct a genuine triangle whose screen bbox encloses one pixel center."""
    scale = math.tan(math.radians(65) / 2.)
    cx, cy = pixel
    screen = np.array([[cx-radius, cy-radius],
                       [cx+radius, cy-radius],
                       [cx, cy+radius]], dtype=np.float64)
    camera = np.column_stack((
        (screen[:, 0] / (size-1) * 2. - 1.) * depth * scale,
        (1. - screen[:, 1] / (size-1) * 2.) * depth * scale,
        np.full(3, depth, dtype=np.float64)
    ))
    origin = np.zeros(3, dtype=np.float64)
    target = np.array([0., 0., 1.])
    up = np.array([0., 1., 0.])
    right, up_axis, forward = camera_basis(origin, target, up)
    world = (camera[:, 0, None] * right[None, :]
             + camera[:, 1, None] * up_axis[None, :]
             + camera[:, 2, None] * forward[None, :])
    model = Primitive(world, np.tile([0., 0., 1.], (3, 1)),
                      np.array([[0, 1, 2]], dtype=np.int64),
                      np.array([.5, .7, .8]), 0., .6, 0, "micro")
    return model, camera


@unittest.skipUnless(tiled.njit is not None, "optional Numba not installed")
class MicrotrianglePrecisionTests(unittest.TestCase):
    origin = np.zeros(3)
    target = np.array([0., 0., 1.])
    up = np.array([0., 1., 0.])

    def test_strict_positive_screen_area_survives_normal_and_id(self):
        for radius in (3e-7, 2e-10):
            model, camera = tiny_model(radius=radius)
            # Previously both of these finite, valid cases were skipped:
            # projected abs(area)<1e-12, and normal magnitude<=1e-20.
            for mode in (0, 1):
                with self.subTest(radius=radius, mode=mode):
                    screen, bounds, _, prepared, _, _ = tiled._setup(
                        camera, model.positions, model.indices,
                        np.array([0], dtype=np.int64), 64,
                        math.tan(math.radians(65) / 2.), mode)
                    self.assertEqual(prepared, 1)
                    tri = screen[0]
                    area = ((tri[1, 0] - tri[0, 0]) *
                            (tri[2, 1] - tri[0, 1]) -
                            (tri[1, 1] - tri[0, 1]) *
                            (tri[2, 0] - tri[0, 0]))
                    self.assertGreater(abs(area), 0.)
                    self.assertLess(abs(area), 1e-12)
                    self.assertLessEqual(bounds[0, 0], 32)
                    self.assertGreaterEqual(bounds[0, 1], 32)

            baseline = None
            for tile_size in (16, 32, 64):
                for threads in (1, min(2, tiled.numba_config.NUMBA_NUM_THREADS)):
                    with self.subTest(radius=radius, tile=tile_size, workers=threads):
                        normal = tiled.render_hero_tiled(
                            [model], self.origin, self.target, self.up, 65, 64,
                            "normal", tile_size=tile_size, threads=threads,
                            max_working_mib=512)
                        ids = tiled.render_hero_tiled(
                            [model], self.origin, self.target, self.up, 65, 64,
                            "object-id", tile_size=tile_size, threads=threads,
                            max_working_mib=512)
                        self.assertEqual(normal[3]["preparedTriangles"], 1)
                        self.assertEqual(ids[3]["preparedTriangles"], 1)
                        self.assertEqual(normal[3]["coveredPixels"], 1)
                        self.assertEqual(ids[3]["coveredPixels"], 1)
                        self.assertEqual(int(normal[2][32, 32]), 0)
                        self.assertEqual(int(ids[2][32, 32]), 0)
                        self.assertAlmostEqual(float(normal[1][32, 32]), 2., places=10)
                        np.testing.assert_array_equal(normal[2], ids[2])
                        np.testing.assert_array_equal(normal[1], ids[1])
                        if baseline is None:
                            baseline = normal
                        else:
                            np.testing.assert_array_equal(normal[0], baseline[0])
                            np.testing.assert_array_equal(normal[1], baseline[1])
                            np.testing.assert_array_equal(normal[2], baseline[2])

    def test_noncovering_micro_and_exact_degenerate_are_not_inflated(self):
        micro, _ = tiny_model(pixel=(32.5, 32.5), radius=2e-10)
        for mode in ("normal", "object-id"):
            with self.subTest(mode=mode):
                _, _, winner, stats = tiled.render_hero_tiled(
                    [micro], self.origin, self.target, self.up, 65, 64,
                    mode, tile_size=16, threads=1)
                self.assertEqual(stats["preparedTriangles"], 1)
                self.assertEqual(stats["coveredPixels"], 0)
                self.assertTrue(np.all(winner == -1))
        degenerate, _ = tiny_model()
        degenerate.indices = np.array([[0, 0, 1]], dtype=np.int64)
        for mode in ("normal", "object-id"):
            with self.subTest(mode=mode):
                _, _, winner, stats = tiled.render_hero_tiled(
                    [degenerate], self.origin, self.target, self.up, 65, 64,
                    mode, tile_size=16, threads=1)
                self.assertEqual(stats["preparedTriangles"], 0)
                self.assertEqual(stats["coveredPixels"], 0)
                self.assertTrue(np.all(winner == -1))

    def test_shared_visibility_cache_keeps_micro_coverage(self):
        model, _ = tiny_model(radius=3e-7)
        self.assertEqual(VISIBILITY_PROFILE, "RefAs Visibility CPU/0.2.0-microtriangle")
        with tempfile.TemporaryDirectory(prefix="refas-micro-cache-") as root:
            output = []
            for _ in range(2):
                result, stats = render_bundle(
                    [model], self.origin, self.target, self.up, 65, 64,
                    ("normal", "object-id", "albedo"),
                    tile_size=16, threads=1, max_working_mib=512,
                    cache_root=root, glb_sha="a"*64, frame_sha="b"*64,
                    frame_digest="c"*64)
                self.assertEqual(stats["coveredPixels"], 1)
                self.assertEqual(stats["winnerRasterTriangles"], 1)
                output.append((result, stats))
            self.assertFalse(output[0][1]["cacheHit"])
            self.assertTrue(output[1][1]["cacheHit"])
            for mode in ("normal", "object-id", "albedo"):
                np.testing.assert_array_equal(output[0][0][mode],
                                              output[1][0][mode])
                self.assertNotEqual(tuple(output[0][0][mode][32, 32]),
                                    (12, 15, 19))


if __name__ == "__main__":
    unittest.main()

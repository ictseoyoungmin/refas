"""R14-05A: clipped pixel iteration must match the former full-tile oracle.

Run with npm run test:cpu-jit (optional Numba on Node 24 CI).
The legacy v1.3.0 registered replay is not modified by this optimization.
"""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
import render_cpu_tiled as tiled
from benchmark_render_cpu import strand_geometry
from render_glb import Primitive


def full_tile_oracle(screen, offsets, entries, size, tile_size, tiles_x, colors):
    """Independent Python reproduction of the pre-R14-05 full-tile hot loop."""
    pixels = np.empty((size, size, 3), dtype=np.uint8)
    pixels[:] = [12, 15, 19]
    depth = np.full((size, size), np.inf, dtype=np.float64)
    winner = np.full((size, size), -1, dtype=np.int64)
    for tile in range(len(offsets) - 1):
        ty, tx = divmod(tile, tiles_x)
        minx, miny = tx * tile_size, ty * tile_size
        maxx, maxy = min(size - 1, minx + tile_size - 1), min(size - 1, miny + tile_size - 1)
        for e in range(offsets[tile], offsets[tile + 1]):
            tri = int(entries[e])
            (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = screen[tri]
            area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)
            if area <= 0:
                continue
            edge0 = y2 < y1 or (y2 == y1 and x2 > x1)
            edge1 = y0 < y2 or (y0 == y2 and x0 > x2)
            edge2 = y1 < y0 or (y1 == y0 and x1 > x0)
            for py in range(miny, maxy + 1):
                for px in range(minx, maxx + 1):
                    e0 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
                    if e0 < 0 or (e0 == 0 and not edge0):
                        continue
                    e1 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)
                    if e1 < 0 or (e1 == 0 and not edge1):
                        continue
                    e2 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)
                    if e2 < 0 or (e2 == 0 and not edge2):
                        continue
                    invz = (e0 / area) / z0 + (e1 / area) / z1 + (e2 / area) / z2
                    if invz <= 0:
                        continue
                    d = 1.0 / invz
                    old = depth[py, px]
                    if d < old - 1e-12 or (abs(d - old) <= 1e-12 and
                                             (winner[py, px] < 0 or tri < winner[py, px])):
                        depth[py, px] = d
                        winner[py, px] = tri
                        pixels[py, px] = colors[tri]
    return pixels, depth, winner


@unittest.skipUnless(tiled.njit is not None, "optional Numba not installed")
class DenseBoundsTests(unittest.TestCase):
    def test_bounded_raster_exactly_matches_full_tile_oracle(self):
        size = 48
        screen = np.array([
            [[2.2, 2.2, 1.0], [7.8, 2.2, 1.0], [2.2, 7.8, 1.0]],
            [[0.1, 0.1, 2.0], [47.0, 0.1, 2.0], [0.1, 47.0, 2.0]],
            [[2.2, 2.2, 0.5], [7.8, 2.2, 0.5], [2.2, 7.8, 0.5]],
            [[42.1, 42.1, 1.0], [42.8, 42.1, 1.0], [42.4, 42.9, 1.0]],
        ], dtype=np.float64)
        colors = np.array([[255, 0, 0], [0, 200, 0], [0, 0, 255], [255, 255, 0]], dtype=np.uint8)
        bounds = np.array([
            [max(0, math.floor(tri[:, 0].min())),
             min(size - 1, math.ceil(tri[:, 0].max())),
             max(0, math.floor(tri[:, 1].min())),
             min(size - 1, math.ceil(tri[:, 1].max()))]
            for tri in screen
        ], dtype=np.int32)
        for tile_size in (16, 32, 64):
            with self.subTest(tile_size=tile_size):
                tiles_x = (size + tile_size - 1) // tile_size
                count = tiles_x * tiles_x
                counts = tiled._tile_counts(bounds, tile_size, tiles_x, count)
                offsets = np.zeros(count + 1, dtype=np.int64)
                np.cumsum(counts, out=offsets[1:])
                entries = tiled._scatter(bounds, tile_size, tiles_x, offsets, int(offsets[-1]))
                pixels = np.empty((size, size, 3), dtype=np.uint8)
                pixels[:] = [12, 15, 19]
                depth = np.full((size, size), np.inf, dtype=np.float64)
                winner = np.full((size, size), -1, dtype=np.int64)
                updates, candidate_tests = tiled._tiles(
                    screen, bounds, colors, offsets, entries, pixels, depth,
                    winner, tile_size, tiles_x)
                expected = full_tile_oracle(screen, offsets, entries, size, tile_size, tiles_x, colors)
                np.testing.assert_array_equal(pixels, expected[0])
                np.testing.assert_array_equal(depth, expected[1])
                np.testing.assert_array_equal(winner, expected[2])
                self.assertGreater(int(updates.sum()), 0)
                self.assertLess(int(candidate_tests.sum()),
                                int(offsets[-1]) * tile_size * tile_size)

    def test_dense_positive_area_strands_reduce_candidate_work(self):
        coords, _, faces = strand_geometry(12000, seed=91)
        model = Primitive(np.asarray(coords, dtype=np.float64),
                          np.tile([0., 0., 1.], (len(coords), 1)),
                          np.asarray(faces, dtype=np.int64),
                          np.asarray([.5, .7, .8]), 0., .6, 0, "body")
        camera = np.array([0., 0., -4.])
        _, _, _, stats = tiled.render_hero_tiled(
            [model], camera, np.zeros(3), np.array([0., 1., 0.]),
            65, 96, "normal", tile_size=32, threads=1, max_working_mib=512)
        self.assertEqual(stats["inputTriangles"], 12000)
        self.assertGreater(stats["preparedTriangles"], 0)
        self.assertGreater(stats["candidatePixelTests"], 0)
        self.assertLess(stats["candidatePixelTests"], stats["tileWidePixelTests"])
        self.assertLess(stats["candidatePixelTests"] * 2, stats["tileWidePixelTests"])


if __name__ == "__main__":
    unittest.main()

"""R14-05E: deterministic per-call Numba scratch must preserve setup output.

The fixture includes near clipping (two-fan output), opposite winding,
single-fan triangles, repeated degenerate indices, and both color modes.
These fixed results were obtained from pre-optimization R14-05D _setup.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
import render_cpu_tiled as tiled

POSITIONS = np.array([
    [0, 0, 0.005], [.3, 0, .2], [0, .5, .2],
    [0, 0, .3], [.3, 0, .3], [0, .5, .3],
    [-.3, -.2, .4],
], dtype=np.float64)
FACES = np.array([[0, 1, 2], [3, 4, 5], [6, 4, 5], [3, 3, 5]], dtype=np.int64)
PRIMITIVE_IDS = np.array([0, 1, 1, 2], dtype=np.int64)
GOLDEN = {
    "screen": "9cc804a26c4547ab70c45a6d866a90639d535a48cf96600bcb411c1236a4b94d",
    "bounds": "5fbe7a16e2ec2094f45701d1181b79dc6c6b307e5cb6add2147c3823a49274b0",
    "colors0": "ffffa396c44ceac3515aa79d4ff04639b9ced5b3bd51feac1b503d81a5b1c5af",
    "colors1": "e14cd4ef814c2b0288078ec74d65e0654091fb6e9bc77b4a479c85ab86eccca0",
}


def digest(array):
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


@unittest.skipUnless(tiled.njit is not None, "optional Numba not installed")
class SequentialScratchTests(unittest.TestCase):
    def test_clipped_winding_and_object_id_against_preoptimization_golden(self):
        for mode in (0, 1):
            with self.subTest(mode=mode):
                screen, bounds, colors, valid, clipped, rejected = tiled._setup(
                    POSITIONS, POSITIONS, FACES, PRIMITIVE_IDS, 80, .3, mode)
                self.assertEqual((valid, clipped, rejected), (4, 1, 0))
                self.assertEqual(digest(screen), GOLDEN["screen"])
                self.assertEqual(digest(bounds), GOLDEN["bounds"])
                self.assertEqual(digest(colors), GOLDEN[f"colors{mode}"])

    def test_repeated_calls_cannot_leak_per_triangle_scratch(self):
        original = tiled._setup(POSITIONS, POSITIONS, FACES, PRIMITIVE_IDS, 80, .3, 0)
        changed = POSITIONS.copy()
        changed[:, 0] += .45
        tilted = tiled._setup(changed, changed, FACES, PRIMITIVE_IDS, 80, .3, 1)
        later = tiled._setup(POSITIONS, POSITIONS, FACES, PRIMITIVE_IDS, 80, .3, 0)
        for lhs, rhs in zip(original[:3], later[:3]):
            np.testing.assert_array_equal(lhs, rhs)
        self.assertNotEqual(digest(original[0]), digest(tilted[0]))


if __name__ == "__main__":
    unittest.main()

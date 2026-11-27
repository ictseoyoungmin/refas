"""Analytic controls for the pure surface-attachment authoring helper."""
from __future__ import annotations

from dataclasses import FrozenInstanceError
import math
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from production.surface_binding import bind_surface_points, surface_sample, transport_surface_points


class SurfaceBindingTests(unittest.TestCase):
    def assertPointsClose(self, actual, expected, tolerance=1e-12):
        self.assertEqual(len(actual), len(expected))
        for point, reference in zip(actual, expected):
            for value, target in zip(point, reference):
                self.assertAlmostEqual(value, target, delta=tolerance)

    def test_nonaffine_motion_retains_surface_attachment_and_section_thickness(self):
        vertices = [(0, 0, 0), (2, 0, 0), (0, 2, 0)]
        points = [(0.5, 0.5, 0.1), (0.5, 0.5, 0.2), (0.6, 0.5, 0.1)]
        source = surface_sample(vertices, [(0, 1, 2)])
        binding = bind_surface_points(source, 0, points, barycentric=(0.5, 0.25, 0.25))
        # F(x,y,z)=(x,y,z+x*y): applying F to both cloth and trim is wrong.
        target = surface_sample([(x, y, z + x * y) for x, y, z in vertices], [(0, 1, 2)])
        directly_warped = [(x, y, z + x * y) for x, y, z in points]
        self.assertAlmostEqual(directly_warped[0][2], 0.35)
        moved = transport_surface_points(binding, target)
        self.assertPointsClose(moved, points)
        self.assertAlmostEqual(math.dist(moved[0], moved[1]), 0.1)
        self.assertAlmostEqual(math.dist(moved[0], moved[2]), 0.1)

    def test_anchor_follows_stretched_surface_without_scaling_offsets(self):
        source = surface_sample([(0, 0, 0), (2, 0, 0), (0, 2, 0)], [(0, 1, 2)])
        binding = bind_surface_points(source, 0, [(0.6, 0.7, 0.1), (0.6, 0.7, 0.3)],
                                      barycentric=(0.5, 0.25, 0.25))
        target = surface_sample([(1, 2, 3), (7, 2, 3), (1, 10, 3)], [(0, 1, 2)])
        # New anchor (2.5,4,3); retain source offsets (.1,.2,.1/.3).
        self.assertPointsClose(transport_surface_points(binding, target),
                               [(2.6, 4.2, 3.1), (2.6, 4.2, 3.3)])

    def test_sheared_out_of_plane_surface_transports_orthogonal_offsets(self):
        source = surface_sample([(0, 0, 0), (2, 0, 0), (0, 2, 0)], [(0, 1, 2)])
        binding = bind_surface_points(source, 0, [(0.6, 0.7, 0.3)], barycentric=(0.5, 0.25, 0.25))
        target = surface_sample([(0, 0, 0), (2, 0, 0), (1, 1, 1)], [(0, 1, 2)])
        # Anchor=(.75,.25,.25), tangent=X, binormal=(0,1,1)/sqrt(2).
        # The normal offset adds (0,-.3,+.3)/sqrt(2), independently of stretch.
        root2 = math.sqrt(2)
        self.assertPointsClose(transport_surface_points(binding, target),
                               [(0.85, 0.25 - 0.1 / root2, 0.25 + 0.5 / root2)])

    def test_rigid_rotations_past_ninety_degrees_preserve_points(self):
        vertices = [(0, 0, 0), (2, 0, 0), (0, 3, 0)]
        points = [(0.4, 0.6, 0.2), (0.6, 0.7, -0.1)]
        binding = bind_surface_points(surface_sample(vertices, [(0, 1, 2)]), 0, points,
                                      barycentric=(0.6, 0.2, 0.2))
        for degrees in (0, 45, 90, 135, 180, 225, 270, 315, 360):
            with self.subTest(degrees=degrees):
                angle = math.radians(degrees)
                def rotate(p):
                    x, y, z = p
                    return (x + 3, y * math.cos(angle) - z * math.sin(angle) - 2,
                            y * math.sin(angle) + z * math.cos(angle) + 7)
                target = surface_sample([rotate(p) for p in vertices], [(0, 1, 2)])
                self.assertPointsClose(transport_surface_points(binding, target), [rotate(p) for p in points])

    def test_mirror_uses_oriented_normal_with_rigid_right_handed_offsets(self):
        source = surface_sample([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        binding = bind_surface_points(source, 0, [(0.2, 0.3, 0.1)], barycentric=(0.5, 0.2, 0.3))
        target = surface_sample([(0, 0, 0), (-2, 0, 0), (0, 3, 0)], [(0, 1, 2)])
        # x tangent reverses and winding's normal is -Z; no reflected attachment.
        self.assertPointsClose(transport_surface_points(binding, target), [(-0.4, 0.9, -0.1)])

    def test_scale_relative_frames_work_for_small_and_large_units(self):
        for scale in (1e-120, 1e-9, 1, 1e9, 1e120):
            with self.subTest(scale=scale):
                source = surface_sample([(0, 0, 0), (scale, 0, 0), (0, scale, 0)], [(0, 1, 2)])
                points = [(0.2 * scale, 0.3 * scale, 0.01 * scale)]
                binding = bind_surface_points(source, 0, points, barycentric=(0.5, 0.2, 0.3))
                result = transport_surface_points(binding, source)
                self.assertPointsClose([[x / scale for x in p] for p in result], [(0.2, 0.3, 0.01)])

    def test_large_translation_preserves_representable_small_offsets(self):
        t = 1e6
        source = surface_sample([(t, t, t), (t + 0.01, t, t), (t, t + 0.02, t)], [(0, 1, 2)])
        points = [(t + 0.002, t + 0.004, t + 0.0001)]
        binding = bind_surface_points(source, 0, points, barycentric=(0.6, 0.2, 0.2))
        self.assertPointsClose(transport_surface_points(binding, source), points)

    def test_skinny_oblique_triangle_does_not_shear_a_section_on_identity_transport(self):
        source = surface_sample([(0, 0, 0), (1.3, .7, .9),
                                 (2.6 + 1e-11, 1.4 - 1e-11, 1.8 + 4e-12)], [(0, 1, 2)])
        points = [(0.1, 0.2, 0.3), (0.2, 0.4, 0.6)]
        binding = bind_surface_points(source, 0, points, barycentric=(1, 0, 0))
        result = transport_surface_points(binding, source)
        self.assertPointsClose(result, points)
        self.assertAlmostEqual(math.dist(*result), math.dist(*points), delta=1e-12)

    def test_input_arrays_are_copied_and_results_are_immutable(self):
        vertices, triangles, points = [[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]], [[0, 1, 2]], [[0.2, 0.3, 0.1]]
        source = surface_sample(vertices, triangles)
        binding = bind_surface_points(source, 0, points, barycentric=(0.5, 0.2, 0.3))
        self.assertEqual(vertices[0], [0., 0., 0.])
        vertices[0][0], triangles[0][0], points[0][0] = 99, 2, 99
        self.assertPointsClose(transport_surface_points(binding, source), [(0.2, 0.3, 0.1)])
        self.assertEqual(source.triangles, ((0, 1, 2),))
        with self.assertRaises(FrozenInstanceError):
            binding.topology = "changed"

    def test_complete_topology_winding_and_vertex_count_changes_are_rejected(self):
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)]
        source = surface_sample(vertices, [(0, 1, 2), (1, 3, 2)])
        binding = bind_surface_points(source, 0, [(0.2, 0.3, 0.1)], barycentric=(0.5, 0.2, 0.3))
        changed = [surface_sample(vertices, [(0, 2, 1), (1, 3, 2)]),
                   surface_sample(vertices, [(0, 1, 2), (1, 2, 3)]),
                   surface_sample(vertices, [(1, 3, 2), (0, 1, 2)]),
                   surface_sample(vertices, [(0, 1, 2)]),
                   surface_sample(vertices + [(2, 2, 0)], [(0, 1, 2), (1, 3, 2)])]
        for target in changed:
            with self.subTest(topology=target.topology), self.assertRaisesRegex(ValueError, "topology changed"):
                transport_surface_points(binding, target)

    def test_degenerate_or_nearly_collinear_selected_triangle_is_rejected(self):
        good = surface_sample([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        binding = bind_surface_points(good, 0, [(0.2, 0.3, 0.1)], barycentric=(0.5, 0.2, 0.3))
        for vertices in ([(0, 0, 0), (0, 0, 0), (0, 1, 0)],
                         [(0, 0, 0), (1, 0, 0), (2, 0, 0)],
                         [(0, 0, 0), (1e-9, 0, 0), (2e-9, 1e-24, 0)]):
            target = surface_sample(vertices, [(0, 1, 2)])
            with self.subTest(vertices=vertices), self.assertRaisesRegex(ValueError, "degenerate"):
                transport_surface_points(binding, target)
            with self.assertRaisesRegex(ValueError, "degenerate"):
                bind_surface_points(target, 0, [(0, 0, 1)], barycentric=(1, 0, 0))

    def test_unrelated_degenerate_face_does_not_block_an_authored_binding(self):
        source = surface_sample([(0, 0, 0), (1, 0, 0), (0, 1, 0), (2, 0, 0)],
                                [(0, 1, 2), (0, 1, 3), (3, 3, 3)])
        binding = bind_surface_points(source, 0, [(0.2, 0.3, 0.1)], barycentric=(0.5, 0.2, 0.3))
        self.assertPointsClose(transport_surface_points(binding, source), [(0.2, 0.3, 0.1)])
        with self.assertRaisesRegex(ValueError, "degenerate"):
            bind_surface_points(source, 1, [(0, 0, 1)], barycentric=(1, 0, 0))

    def test_bad_coordinates_indices_weights_and_empty_sections_are_rejected(self):
        vertices, triangles = [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)]
        source = surface_sample(vertices, triangles)
        for point in ((math.nan, 0, 0), (0, math.inf, 0), (True, 0, 0), (0, 0), ("0", 0, 0)):
            with self.subTest(point=point), self.assertRaises(ValueError):
                surface_sample([point, *vertices[1:]], triangles)
            with self.assertRaises(ValueError):
                bind_surface_points(source, 0, [point], barycentric=(1, 0, 0))
        for triangle in ((0, 1, 3), (-1, 1, 2), (0., 1, 2), (True, 1, 2), (0, 1)):
            with self.subTest(triangle=triangle), self.assertRaises(ValueError):
                surface_sample(vertices, [triangle])
        for weights in ((-0.1, 0.5, 0.6), (0, 0, 0), (1, 1, 1), (1, math.nan, 0)):
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                bind_surface_points(source, 0, [(0, 0, 1)], barycentric=weights)
        for index in (-1, 1, True, 0.):
            with self.subTest(index=index), self.assertRaises(ValueError):
                bind_surface_points(source, index, [(0, 0, 1)], barycentric=(1, 0, 0))
        with self.assertRaisesRegex(ValueError, "at least one"):
            bind_surface_points(source, 0, [], barycentric=(1, 0, 0))

    def test_corner_anchor_and_roundoff_in_weights_are_supported(self):
        source = surface_sample([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        for weights in ((1, 0, 0), (1 / 3, 1 / 3, 1 / 3), (0.5, 0.2, 0.30000000000000004)):
            with self.subTest(weights=weights):
                binding = bind_surface_points(source, 0, [(0.2, 0.3, 0.1)], barycentric=weights)
                self.assertPointsClose(transport_surface_points(binding, source), [(0.2, 0.3, 0.1)])


if __name__ == "__main__":
    unittest.main()

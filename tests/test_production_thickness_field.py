"""Independent graph oracle and hard-bound regressions for thickness grading."""
import copy
import math
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills/refas/scripts"))
from production.thickness_field import grade_thickness


def shortest_path_oracle(points, edges, upper, gradient):
    """Floyd-Warshall all-pairs distances, independent of the production heap."""
    n = len(points)
    distances = [[0.0 if i == j else math.inf for j in range(n)] for i in range(n)]
    for a, b in edges:
        distances[a][b] = distances[b][a] = math.dist(points[a], points[b])
    for k in range(n):
        for i in range(n):
            for j in range(n):
                distances[i][j] = min(distances[i][j], distances[i][k] + distances[k][j])
    return [min(upper[j] + gradient * distances[j][i] for j in range(n)) for i in range(n)]


class ThicknessFieldTests(unittest.TestCase):
    def test_matches_independent_shortest_path_oracle_and_edge_order(self):
        points = [(0, 0, 0), (1, 0, 0), (1, 2, 0), (0, 3, 1), (-1, 1, 1)]
        edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 0), (1, 4)]
        request = [0.008, 0.007, 0.009, 0.006, 0.010]
        caps = {0: 0.002, 3: 0.003}
        expected = shortest_path_oracle(points, edges,
                                        [min(v, caps.get(i, v)) for i, v in enumerate(request)], 0.001)
        for ordered in (edges, [(b, a) for a, b in reversed(edges)] + edges):
            result = grade_thickness(points, ordered, request, minimum=0.001,
                                     max_gradient=0.001, caps=caps)
            self.assertEqual(result["status"], "PASS")
            for actual, target in zip(result["vertexThickness"], expected):
                self.assertAlmostEqual(actual, target, delta=1e-14)

    def test_chain_taper_protects_endpoints_and_inputs(self):
        args = dict(vertices=[[i * 0.01, 0, 0] for i in range(9)],
                    edges=[[i, i + 1] for i in range(8)], requested=[0.008] * 9,
                    minimum=0.002, max_gradient=0.1, protected=[8], caps={0: 0.002})
        before = copy.deepcopy(args)
        result = grade_thickness(**args)
        self.assertEqual(args, before)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["vertexThickness"][-1], 0.008)
        for i, value in enumerate(result["vertexThickness"]):
            self.assertAlmostEqual(value, min(0.008, 0.002 + i * 0.001))
        # Six taper vertices plus a one-ULP conservative reduction at its end.
        self.assertEqual(result["reducedVertices"], 7)
        self.assertAlmostEqual(result["maxEdgeGradient"], 0.1)

    def test_infeasible_pin_floor_and_cap_at_all_length_scales(self):
        for scale in (1e-150, 1.0, 1e150):
            points = [(0, 0, 0), (scale, 0, 0)]
            for options in ({"protected": [1]}, {"minimum": [scale, 3 * scale]},
                            {"protected": [0], "minimum": [2 * scale, scale]},
                            {"caps": {0: scale / 2}}):
                args = dict(minimum=scale, max_gradient=0.5)
                args.update(options)
                result = grade_thickness(points, [(0, 1)], [scale, 3 * scale], **args)
                self.assertEqual(result["status"], "FAIL", (scale, options))
                self.assertIsNone(result["vertexThickness"])

    def test_representable_pin_conflict_is_not_hidden_by_thickness_tolerance(self):
        result = grade_thickness([(0, 0, 0), (1e-16, 0, 0)], [(0, 1)],
                                 [1.0, math.nextafter(1.0, math.inf)], minimum=0.5,
                                 max_gradient=0.1, protected=[0, 1])
        self.assertEqual(result["status"], "FAIL")

    def test_small_edge_feasible_field_survives_unit_conversion_roundoff(self):
        # Round-to-nearest(.004 + .001 * .0001) slightly exceeds the edge bound.
        # Scaling every length covers metres, millimetres and smaller/larger units.
        for scale in (1e-9, 0.001, 1.0, 1000.0, 1e9):
            result = grade_thickness([(0, 0, 0), (0.0001 * scale, 0, 0)], [(0, 1)],
                                     [0.004 * scale, 0.008 * scale], minimum=0.002 * scale,
                                     max_gradient=0.001)
            self.assertEqual(result["status"], "PASS", (scale, result))
            a, b = result["vertexThickness"]
            self.assertEqual(a, 0.004 * scale)
            self.assertGreaterEqual(b, 0.002 * scale)
            self.assertLessEqual((b - a) / (0.0001 * scale), 0.001)
            self.assertAlmostEqual(b / scale, 0.0040001, delta=2e-18)

    def test_rotation_translation_and_scale_equivariance(self):
        points = [(0, 0, 0), (1, 2, 0), (3, 2, 1)]
        edges = [(0, 1), (1, 2)]
        baseline = grade_thickness(points, edges, 0.008, minimum=0.001,
                                   max_gradient=0.001, caps={0: 0.002})["vertexThickness"]
        for scale in (1e-100, 1e-6, 1.0, 1e6, 1e100):
            transformed = [(scale * (3 - y), scale * (x - 2), scale * (z + 1))
                           for x, y, z in points]
            result = grade_thickness(transformed, edges, 0.008 * scale,
                                     minimum=0.001 * scale, max_gradient=0.001,
                                     caps={0: 0.002 * scale})
            self.assertEqual(result["status"], "PASS")
            for value, expected in zip(result["vertexThickness"], baseline):
                self.assertAlmostEqual(value / scale, expected, delta=1e-14)

    def test_disconnected_and_isolated_vertices_preserve_local_bounds(self):
        points = [(i, 0, 0) for i in range(5)]
        result = grade_thickness(points, [(0, 1), (2, 3)], 0.008, minimum=0.001,
                                 max_gradient=0.001, caps={0: 0.002, 4: 0.005}, protected=[3])
        self.assertEqual(result["vertexThickness"], [0.002, 0.003, 0.008, 0.008, 0.005])
        no_edit = grade_thickness([(0, 0, 0)], [], 0.008, minimum=0.001, max_gradient=0.1)
        self.assertEqual(no_edit["vertexThickness"], [0.008])
        self.assertEqual(no_edit["maxEdgeGradient"], 0.0)

    def test_malformed_data_raises_value_error(self):
        base = dict(vertices=[(0, 0, 0), (1, 0, 0)], edges=[(0, 1)],
                    requested=0.008, minimum=0.001, max_gradient=0.1)
        invalid = [
            {"vertices": []}, {"vertices": [(0, 0), (1, 0, 0)]},
            {"vertices": [(math.nan, 0, 0), (1, 0, 0)]},
            {"vertices": [(0, 0, 0), (0, 0, 0)]},
            {"vertices": [(-1e308, 0, 0), (1e308, 0, 0)]},
            {"edges": None}, {"edges": [(0, 2)]}, {"edges": [(False, 1)]},
            {"edges": [(0, 0)]}, {"edges": [(0, 1, 1)]},
            {"requested": [0.002]}, {"requested": True}, {"requested": math.inf},
            {"minimum": 0}, {"max_gradient": 0}, {"max_gradient": math.nan},
            {"protected": [0, 0]}, {"protected": [2]}, {"caps": []},
            {"caps": {True: 0.001}}, {"caps": {1: -0.002}},
        ]
        for changes in invalid:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                grade_thickness(**(base | changes))


if __name__ == "__main__":
    unittest.main()

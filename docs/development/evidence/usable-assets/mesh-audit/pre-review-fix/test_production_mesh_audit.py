"""Opt-in actual Blender counterexamples for read-only mesh observations.

REFAS_BLENDER_TESTS=1 python3 -B -m unittest discover -s tests \
    -p test_production_mesh_audit.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "skills/refas/scripts/production/mesh_audit.py"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")

PROBE = r'''
import bpy
import importlib.util
import json
from pathlib import Path
import sys

module_path, result_path = sys.argv[sys.argv.index('--') + 1:]
spec = importlib.util.spec_from_file_location('mesh_audit_under_test', module_path)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

vertices = [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
            (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]
faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]

def make(name, vertices, faces, edges=()):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, edges, faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def observe(obj, **kwargs):
    return audit.audit_mesh(obj, meters_per_unit=1.0, **kwargs)

result = {'blenderVersion': bpy.app.version_string, 'cases': {}, 'errors': {}}
cases = result['cases']
cube = make('closed-cube', vertices, faces)
cases['closed'] = observe(cube)
hole = make('cube-missing-top', vertices, faces[:1] + faces[2:])
cases['hole'] = observe(hole)
flipped = make('one-face-reversed', vertices, [tuple(reversed(faces[0]))] + faces[1:])
cases['flippedFace'] = observe(flipped)
mixed = make('outward-and-inward-components', vertices + [(x+5,y,z) for x,y,z in vertices],
             faces + [tuple(i+8 for i in reversed(f)) for f in faces])
cases['mixedOrientation'] = observe(mixed)
reflected = make('negative-scale', vertices, faces)
reflected.scale = (-1,2,0.5)
cases['reflected'] = observe(reflected)
reflected_inward = make('negative-scale-inward', vertices, [tuple(reversed(f)) for f in faces])
reflected_inward.scale = (-1,2,0.5)
cases['reflectedInward'] = observe(reflected_inward)
loose = make('loose-and-wire', vertices + [(5,0,0),(7,0,0),(8,0,0)], faces, [(9,10)])
cases['loose'] = observe(loose)
degenerate = make('collinear-triangle', [(0,0,0),(1,0,0),(2,0,0)], [(0,1,2)])
cases['degenerate'] = observe(degenerate)
open_sheet = make('intentional-open-cloth', [(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)], [(0,1,2,3)])
cases['intentionalOpening'] = observe(open_sheet)
solid = make('evaluated-solidify', [(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)], [(0,1,2,3)])
modifier = solid.modifiers.new('thickness', 'SOLIDIFY')
modifier.thickness = 0.1
before = {'vertices':len(solid.data.vertices), 'faces':len(solid.data.polygons),
          'modifiers':[m.type for m in solid.modifiers]}
cases['evaluated'] = observe(solid)
result['sourceUnchanged'] = before == {'vertices':len(solid.data.vertices), 'faces':len(solid.data.polygons),
                                      'modifiers':[m.type for m in solid.modifiers]}
nonmanifold = make('three-faces-on-one-edge', [(0,0,0),(1,0,0),(0,1,0),(0,-1,0),(0,0,1)],
                   [(0,1,2),(1,0,3),(0,1,4)])
cases['nonmanifold'] = observe(nonmanifold, max_details=1)
cases['bounded'] = observe(hole, max_details=2)
cases['centimetres'] = audit.audit_mesh(cube, meters_per_unit=0.01)
singular = make('collapsed-scale', vertices, faces)
singular.scale = (0,1,1)
cases['singular'] = observe(singular)

anchor = bpy.data.objects.new('explicit-anchor', None)
bpy.context.collection.objects.link(anchor)
anchor.parent = cube
anchor.location = (0,0,1)
cases['attachedAnchor'] = audit.anchor_gap(anchor, cube, meters_per_unit=1.0, max_gap_m=0.001)
anchor.location.z = 1.05
cases['floatingAnchor'] = audit.anchor_gap(anchor, cube, meters_per_unit=1.0, max_gap_m=0.001)
anchor.location = (0,0,1)
anchor.rotation_euler.y = 0.5
cases['localAnchor'] = audit.anchor_gap(anchor, cube, anchor_local=(0,0,0.1),
                                      meters_per_unit=1.0, max_gap_m=0.001)

empty_mesh = make('empty-mesh', [], [])
curve = bpy.data.curves.new('unconverted-curve', 'CURVE')
curve_obj = bpy.data.objects.new('unconverted-curve', curve)
bpy.context.collection.objects.link(curve_obj)
bad = {
 'zeroScale': lambda: audit.audit_mesh(cube, meters_per_unit=0),
 'unknownUnit': lambda: audit.audit_mesh(cube),
 'negativeTolerance': lambda: observe(cube, length_tolerance_m=-1),
 'nanTolerance': lambda: observe(cube, relative_tolerance=float('nan')),
 'badDetailCount': lambda: observe(cube, max_details=True),
 'curve': lambda: observe(curve_obj),
 'badAnchor': lambda: audit.anchor_gap(anchor, cube, anchor_local=[0,0], meters_per_unit=1, max_gap_m=1),
 'nanAnchor': lambda: audit.anchor_gap(anchor, cube, anchor_local=[0,float('nan'),0], meters_per_unit=1, max_gap_m=1),
 'negativeGap': lambda: audit.anchor_gap(anchor, cube, meters_per_unit=1, max_gap_m=-1),
 'noTargetSurface': lambda: audit.anchor_gap(anchor, empty_mesh, meters_per_unit=1, max_gap_m=1),
 'noUsableTargetSurface': lambda: audit.anchor_gap(anchor, degenerate, meters_per_unit=1, max_gap_m=1),
}
for name, fn in bad.items():
    try:
        fn()
        result['errors'][name] = None
    except (TypeError, ValueError) as error:
        result['errors'][name] = type(error).__name__ + ': ' + str(error)
Path(result_path).write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender installed for actual mesh checks")
class ProductionMeshAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-mesh-audit-")
        cls.root = Path(cls.temp.name)
        script, output = cls.root / "probe.py", cls.root / "observations.json"
        script.write_text(PROBE, encoding="utf-8")
        command = [str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                   "--python-exit-code", "1", "--python", str(script), "--", str(MODULE), str(output)]
        process = subprocess.run(command, capture_output=True, text=True, timeout=90,
                                 env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        if process.returncode:
            raise AssertionError(process.stdout[-5000:] + process.stderr[-5000:])
        cls.result = json.loads(output.read_text())
        cls.cases = cls.result["cases"]
        evidence = os.environ.get("REFAS_MESH_AUDIT_EVIDENCE")
        if evidence:
            destination = Path(evidence)
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output, destination / "observations.json")
            (destination / "blender.log").write_text(process.stdout + process.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_closed_cube_has_positive_volume_and_no_topology_findings(self):
        value = self.cases["closed"]
        for field in ("boundaryEdges", "wireEdges", "looseVertices", "nonManifoldEdges",
                      "inconsistentWindingEdges", "degenerateTriangles", "negativeClosedComponents"):
            self.assertEqual(value["statistics"][field], 0, field)
        self.assertAlmostEqual(value["components"]["items"][0]["orientationAdjustedVolumeM3"], 8.0)
        self.assertNotIn("ok", value)
        self.assertNotIn("gameReadiness", value)

    def test_missing_face_exposes_located_boundary_loop(self):
        value = self.cases["hole"]
        self.assertEqual(value["statistics"]["boundaryEdges"], 4)
        self.assertEqual(value["statistics"]["closedBoundaryLoops"], 1)
        self.assertTrue(all(point[2] == 1 for point in value["boundaryGroups"]["items"][0]["pointsM"]))
        self.assertEqual(value["components"]["items"][0]["orientation"], "indeterminate")

    def test_single_flipped_face_and_disconnected_inward_shell_are_distinct(self):
        self.assertEqual(self.cases["flippedFace"]["statistics"]["inconsistentWindingEdges"], 4)
        value = self.cases["mixedOrientation"]
        self.assertEqual(value["statistics"]["components"], 2)
        self.assertEqual(value["statistics"]["negativeClosedComponents"], 1)
        self.assertEqual([c["orientation"] for c in value["components"]["items"]], ["positive", "negative"])
        self.assertAlmostEqual(sum(c["worldSignedVolumeM3"] for c in value["components"]["items"]), 0.0)

    def test_negative_scale_is_explicit_without_masking_inward_mesh(self):
        value = self.cases["reflected"]
        self.assertTrue(value["reflectedTransform"])
        self.assertEqual(value["statistics"]["negativeClosedComponents"], 0)
        self.assertAlmostEqual(value["components"]["items"][0]["worldSignedVolumeM3"], -8.0)
        self.assertAlmostEqual(value["components"]["items"][0]["orientationAdjustedVolumeM3"], 8.0)
        self.assertEqual(self.cases["reflectedInward"]["statistics"]["negativeClosedComponents"], 1)

    def test_loose_wire_degenerate_and_nonmanifold_geometry_are_observed(self):
        self.assertEqual(self.cases["loose"]["statistics"]["looseVertices"], 1)
        self.assertEqual(self.cases["loose"]["statistics"]["wireEdges"], 1)
        self.assertEqual(self.cases["loose"]["statistics"]["components"], 3)
        self.assertEqual(self.cases["degenerate"]["statistics"]["degenerateTriangles"], 1)
        self.assertEqual(self.cases["nonmanifold"]["statistics"]["nonManifoldEdges"], 1)

    def test_open_cloth_is_described_without_automatic_defect_verdict(self):
        value = self.cases["intentionalOpening"]
        self.assertEqual(value["statistics"]["boundaryEdges"], 4)
        self.assertEqual(value["statistics"]["degenerateTriangles"], 0)
        self.assertNotIn("defects", value)
        self.assertNotIn("passed", value)

    def test_evaluated_modifier_and_units_are_observed_without_source_mutation(self):
        self.assertTrue(self.result["sourceUnchanged"])
        self.assertEqual(self.cases["evaluated"]["statistics"]["boundaryEdges"], 0)
        self.assertEqual(self.cases["evaluated"]["statistics"]["vertices"], 8)
        self.assertAlmostEqual(self.cases["centimetres"]["components"]["items"][0]["orientationAdjustedVolumeM3"], 8e-6)

    def test_parented_floating_anchor_exceeds_explicit_gap(self):
        self.assertTrue(self.cases["attachedAnchor"]["withinDeclaredGap"])
        self.assertFalse(self.cases["floatingAnchor"]["withinDeclaredGap"])
        self.assertAlmostEqual(self.cases["floatingAnchor"]["distanceM"], 0.05, places=6)
        self.assertFalse(self.cases["localAnchor"]["withinDeclaredGap"])

    def test_details_are_bounded_and_collapsed_transform_not_approved(self):
        value = self.cases["bounded"]
        self.assertEqual(value["boundaryEdges"]["count"], 4)
        self.assertEqual(len(value["boundaryEdges"]["items"]), 2)
        self.assertTrue(value["boundaryEdges"]["truncated"])
        value = self.cases["singular"]
        self.assertTrue(value["singularTransform"])
        self.assertGreater(value["statistics"]["degenerateTriangles"], 0)
        self.assertEqual(value["components"]["items"][0]["orientation"], "indeterminate")

    def test_invalid_parameters_and_unsupported_geometry_raise(self):
        self.assertEqual(len(self.result["errors"]), 11)
        self.assertTrue(all(self.result["errors"].values()), self.result["errors"])


if __name__ == "__main__":
    unittest.main()

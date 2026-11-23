"""Opt-in native surface authoring through a separately copied public skill."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / "skills/refas"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")

SURFACE = '''
import bpy
from mathutils import Vector
from surface_binding import surface_sample, bind_surface_points, transport_surface_points

def evaluated_surface(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        return surface_sample([tuple(evaluated.matrix_world @ v.co) for v in mesh.vertices],
                              [tuple(t.vertices) for t in mesh.loop_triangles])
    finally:
        evaluated.to_mesh_clear()
'''

CREATE = SURFACE + '''
mesh = bpy.data.meshes.new('PanelMesh')
mesh.from_pydata([(-1, -.8, 0), (1, -.8, 0), (1, .8, 0), (-1, .8, 0)],
                 [], [(0, 1, 2), (0, 2, 3)])
panel = bpy.data.objects.new('DeformingPanel', mesh)
bpy.context.collection.objects.link(panel)
panel.location = (.35, .2, .45)
panel.rotation_euler = (.15, .2, .1)
panel.scale = (1.2, .9, 1.1)
panel.shape_key_add(name='Basis')
deformed = panel.shape_key_add(name='BentAndStretched')
for vertex, point in zip(deformed.data, [(-1, -.8, 0), (1.8, -.8, .6),
                                        (1.1, 1, 1.2), (-1.2, .8, -.05)]):
    vertex.co = point
for frame, value in [(1, 0), (25, 1)]:
    deformed.value = value
    deformed.keyframe_insert('value', frame=frame)
for curve in mesh.shape_keys.animation_data.action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation = 'LINEAR'
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
sample = evaluated_surface(panel)
a, b, c = (Vector(sample.vertices[i]) for i in (0, 1, 2))
x = (b - a).normalized()
z = (b - a).cross(c - a).normalized()
y = z.cross(x)
anchor = .25 * a + .35 * b + .4 * c
points = [anchor + x * u + y * v + z * w
          for w in (.005, .085) for v in (-.2, .2) for u in (-.32, .32)]
badge_mesh = bpy.data.meshes.new('BadgeMesh')
badge_mesh.from_pydata([(0, 0, 0)] * 8, [],
                       [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
                        (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)])
badge = bpy.data.objects.new('SurfaceBadge', badge_mesh)
bpy.context.collection.objects.link(badge)
badge.location = (.1, -.2, .1)
badge.rotation_euler = (.12, -.15, .07)
bpy.context.view_layer.update()
inverse = badge.matrix_world.inverted()
for vertex, point in zip(badge_mesh.vertices, points):
    vertex.co = inverse @ point
uv = badge_mesh.uv_layers.new(name='BadgeUV')
for polygon in badge_mesh.polygons:
    for loop, value in zip(polygon.loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop].uv = value

def material(obj, name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .35
    obj.data.materials.append(mat)

material(panel, 'PanelBlue', (.07, .3, .42))
material(badge, 'BadgeOrange', (.9, .3, .035))
bpy.ops.mesh.primitive_cube_add(size=.35, location=(-1.5, -.8, .1))
unrelated = bpy.context.object
unrelated.name = 'UnrelatedFastener'
material(unrelated, 'FastenerGrey', (.28, .32, .35))
'''

EDIT = SURFACE + '''
panel, badge = bpy.data.objects['DeformingPanel'], bpy.data.objects['SurfaceBadge']
source = evaluated_surface(panel)
binding = bind_surface_points(source, 0,
                             [tuple(badge.matrix_world @ v.co) for v in badge.data.vertices],
                             barycentric=(.25, .35, .4))
bpy.context.scene.frame_set(13, subframe=.5)
bpy.context.view_layer.update()
points = transport_surface_points(binding, evaluated_surface(panel))
inverse = badge.matrix_world.inverted()
for vertex, point in zip(badge.data.vertices, points):
    vertex.co = inverse @ Vector(point)
badge.data.update()
'''

FAIL = SURFACE + '''
panel, badge = bpy.data.objects['DeformingPanel'], bpy.data.objects['SurfaceBadge']
sample = evaluated_surface(panel)
binding = bind_surface_points(sample, 0,
                             [tuple(badge.matrix_world @ v.co) for v in badge.data.vertices],
                             barycentric=(.25, .35, .4))
bpy.data.objects['UnrelatedFastener'].location.x += 10
# The selected triangle is unchanged; a different face's winding still invalidates the binding.
triangles = list(sample.triangles)
triangles[1] = tuple(reversed(triangles[1]))
transport_surface_points(binding, surface_sample(sample.vertices, triangles))
'''

PROBE = '''
import bpy, json, sys
from pathlib import Path
from mathutils import Vector
before, after, output = sys.argv[sys.argv.index('--') + 1:]
records = {}
for label, path in [('before', before), ('after', after)]:
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    panel = bpy.data.objects['DeformingPanel']
    badge = bpy.data.objects['SurfaceBadge']
    scene = bpy.context.scene
    amount = (scene.frame_current + scene.frame_subframe - 1) / 24
    rest = [Vector(p) for p in [(-1, -.8, 0), (1, -.8, 0), (1, .8, 0), (-1, .8, 0)]]
    deformed = [Vector(p) for p in [(-1, -.8, 0), (1.8, -.8, .6),
                                   (1.1, 1, 1.2), (-1.2, .8, -.05)]]
    expected_panel = [panel.matrix_world @ (p + amount * (q - p))
                      for p, q in zip(rest, deformed)]
    evaluated = panel.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        actual_panel = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    # Independent analytic fixture: the requested key interpolation and authored box offsets.
    a, b, c = expected_panel[:3]
    x = (b - a).normalized()
    z = (b - a).cross(c - a).normalized()
    y = z.cross(x)
    anchor = .25 * a + .35 * b + .4 * c
    expected_badge = [anchor + x * u + y * v + z * w
                      for w in (.005, .085) for v in (-.2, .2) for u in (-.32, .32)]
    actual_badge = [badge.matrix_world @ v.co for v in badge.data.vertices]
    fastener = bpy.data.objects['UnrelatedFastener']
    records[label] = {
        'frame': scene.frame_current, 'subframe': scene.frame_subframe,
        'panelError': max((a - b).length for a, b in zip(actual_panel, expected_panel)),
        'badgeError': max((a - b).length for a, b in zip(actual_badge, expected_badge)),
        'panel': [list(p) for p in actual_panel],
        'badge': [list(p) for p in actual_badge],
        'distances': [(a - b).length for i, a in enumerate(actual_badge)
                      for b in actual_badge[i + 1:]],
        'dimensions': [(actual_badge[j] - actual_badge[0]).length for j in (1, 2, 4)],
        'uv': [list(v.uv) for v in badge.data.uv_layers['BadgeUV'].data],
        'badgeMatrix': [list(row) for row in badge.matrix_world],
        'unrelated': {'matrix': [list(row) for row in fastener.matrix_world],
                      'vertices': [list(v.co) for v in fastener.data.vertices]},
        'shapeKeys': {key.name: [list(v.co) for v in key.data]
                      for key in panel.data.shape_keys.key_blocks},
        'materials': {obj.name: [mat.name for mat in obj.data.materials]
                      for obj in (panel, badge, fastener)},
        'colors': {mat.name: list(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)
                   for mat in bpy.data.materials if mat.use_nodes},
        'objectNames': sorted(obj.name for obj in scene.objects),
    }
Path(output).write_text(json.dumps(records, indent=2) + '\\n')
'''


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native surface regressions")
class ProductionSurfaceBlenderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="refas-surface-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.skill = self.root / "copied-refas"
        shutil.copytree(SKILL, self.skill, ignore=shutil.ignore_patterns("__pycache__"))
        self.project = self.root / "panel-project"

    def command(self, args, success=True):
        result = subprocess.run(list(map(str, args)), cwd=self.root, capture_output=True, text=True,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": ""},
                                timeout=120)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout[-5000:] + result.stderr[-5000:])
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def cli(self, command, *args, success=True):
        return self.command([sys.executable, "-B", self.skill / "scripts/produce.py", command,
                             "--root", self.project, *args], success=success)

    def run_script(self, name, code, previous=None, success=True):
        script = self.root / (name + ".py")
        script.write_text(code)
        options = ["--script", script, "--intent", name, "--outputs", "native", "--blender", BLENDER,
                   "--views", "surface", "--review-spec", self.root / "review.json",
                   "--size", "192", "--samples", "4", "--timeout", "110",
                   "--expected-revision", previous["head"] if previous else "none",
                   "--expected-sequence", str(previous["sequence"] if previous else 0)]
        if previous:
            options += ["--protect-object", "UnrelatedFastener"]
        result = self.cli("run", *options, success=success)
        return json.loads(result.stdout) if success else result

    def test_copied_skill_surface_edit_failure_and_restore(self):
        review = {"schema": "refas.production.review/v2",
                  "views": [{"name": "surface", "position": [3, -5, 5],
                             "target": [.25, .1, .6], "orthoScale": 4.6}],
                  "lighting": {"center": [.25, .1, .6], "radius": 2},
                  "background": [.65, .7, .75], "transparent": False}
        (self.root / "review.json").write_text(json.dumps(review))
        self.cli("init", "--name", "surface-panel")
        before = self.run_script("create-panel", CREATE)
        original_sha = sha(before["outputs"]["blend"])
        after = self.run_script("transport-badge", EDIT, before)
        edited_sha = sha(after["outputs"]["blend"])
        self.assertEqual(after["sequence"], before["sequence"] + 1)
        self.assertEqual(set(after["outputs"]), {"blend", "scene"})
        revision = json.loads((Path(after["outputs"]["blend"]).parent.parent / "revision.json").read_text())
        self.assertTrue(revision["verification"]["native"]["fingerprintMatches"])
        self.assertEqual(revision["verification"]["protectedObjects"]["status"], "passed")
        self.assertEqual(len(after["observations"]), 1)
        inventories = [{obj["name"]: obj for obj in json.loads(Path(result["outputs"]["scene"]).read_text())["objects"]}
                       for result in (before, after)]
        for name in inventories[0]:
            self.assertEqual(inventories[0][name]["materialSlots"], inventories[1][name]["materialSlots"])

        probe = self.root / "probe.py"
        probe.write_text(PROBE)
        output = self.root / "reopened.json"
        self.command([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                      "--python", probe, "--", before["outputs"]["blend"], after["outputs"]["blend"], output])
        a, b = (json.loads(output.read_text())[label] for label in ("before", "after"))
        self.assertEqual((a["frame"], a["subframe"]), (1, 0))
        self.assertEqual((b["frame"], b["subframe"]), (13, .5))
        for record in (a, b):
            self.assertLess(record["panelError"], 2e-6)
            self.assertLess(record["badgeError"], 2e-6)
            for actual, expected in zip(record["dimensions"], (.64, .4, .08)):
                self.assertAlmostEqual(actual, expected, delta=2e-6)
        for left, right in zip(a["distances"], b["distances"]):
            self.assertAlmostEqual(left, right, delta=2e-6)
        self.assertNotEqual(a["panel"], b["panel"])
        self.assertNotEqual(a["badge"], b["badge"])
        for preserved in ("uv", "badgeMatrix", "unrelated", "shapeKeys", "materials", "colors", "objectNames"):
            self.assertEqual(a[preserved], b[preserved], preserved)

        self.run_script("reject-changed-topology", FAIL, after, success=False)
        failed = json.loads(self.cli("status").stdout)
        self.assertEqual((failed["head"], failed["sequence"]), (after["head"], after["sequence"]))
        self.assertEqual(len(failed["incompleteRuns"]), 1)
        run_id = failed["incompleteRuns"][0]["id"]
        failed_artifacts = self.project / ".refas2/runs" / run_id / "artifacts"
        failure = json.loads((failed_artifacts / "result.json").read_text())
        self.assertIn("surface topology changed", failure["error"]["message"])
        self.assertFalse((failed_artifacts / "scene.blend").exists())
        self.assertEqual(sha(after["outputs"]["blend"]), edited_sha)
        restored = json.loads(self.cli("restore", "--revision", before["head"],
                                     "--expected-revision", after["head"],
                                     "--expected-sequence", str(after["sequence"])).stdout)
        self.assertNotIn(restored["head"], (before["head"], after["head"]))
        self.assertEqual(sha(restored["outputs"]["blend"]), original_sha)
        self.assertEqual(sha(before["outputs"]["blend"]), original_sha)
        self.assertEqual(sha(after["outputs"]["blend"]), edited_sha)
        self.assertTrue(json.loads(self.cli("verify").stdout)["ok"])


if __name__ == "__main__":
    unittest.main()

"""Copied-skill thickness fields in native Solidify, not a wearing/clearance claim."""
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

CREATE = '''
import bpy
for name, curvature, location in [('CurvedStrip', .4, 0), ('RigidPanel', 0, .7)]:
    vertices = [((i-2)*.1, (j-2)*.1, curvature*((i-2)*.1)**2)
                for j in range(5) for i in range(5)]
    faces = [(j*5+i, j*5+i+1, (j+1)*5+i+1, (j+1)*5+i)
             for j in range(4) for i in range(4)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.y = location
    uv = mesh.uv_layers.new(name='SurfaceUV')
    for loop in mesh.loops:
        i = loop.vertex_index
        uv.data[loop.index].uv = (i % 5 / 4, i // 5 / 4)
    group = obj.vertex_groups.new(name='Thickness')
    group.add(list(range(25)), 1, 'REPLACE')
    shell = obj.modifiers.new('Shell', 'SOLIDIFY')
    shell.thickness, shell.offset = .02, -1
    shell.vertex_group, shell.thickness_vertex_group = group.name, 0
    shell.use_even_offset = shell.use_quality_normals = False
    obj['thicknessValues'] = [.02]*25
bpy.ops.mesh.primitive_cube_add(size=.1, location=(.6, .3, 0))
bpy.context.object.name = 'Neighbor'
'''

EDIT = '''
import bpy
from thickness_field import grade_thickness
for name in ('CurvedStrip', 'RigidPanel'):
    obj = bpy.data.objects[name]
    result = grade_thickness([tuple(v.co) for v in obj.data.vertices],
        [tuple(e.vertices) for e in obj.data.edges], [.02]*25,
        minimum=.004, max_gradient=.09,
        protected=[i for i in range(25) if i%5 in (0,4) or i//5 in (0,4)],
        caps={12: .004})
    assert result['status'] == 'PASS', result
    values = result['vertexThickness']
    for i, thickness in enumerate(values):
        obj.vertex_groups['Thickness'].add([i], thickness/.02, 'REPLACE')
    obj['thicknessValues'] = values
'''

PROBE = '''
import bpy, sys
def inspect(path, graded):
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    rows = {}
    for obj in bpy.context.scene.objects:
        mesh = obj.data
        rows[obj.name] = ([tuple(v.co) for v in mesh.vertices],
            [tuple(p.vertices) for p in mesh.polygons],
            [[tuple(v.uv) for v in layer.data] for layer in mesh.uv_layers],
            [tuple(row) for row in obj.matrix_world])
        if obj.name == 'Neighbor':
            continue
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        actual = evaluated.to_mesh()
        try:
            points = [v.co.copy() for v in actual.vertices]
            values = list(obj['thicknessValues'])
            assert len(points) == 50
            # Independent native geometry measurement, including the unchanged exterior.
            assert max(min((p-v.co).length for p in points) for v in mesh.vertices) < 1e-6
            assert max(min((p-(v.co-v.normal*t)).length for p in points)
                       for v,t in zip(mesh.vertices,values)) < 1e-6
            assert abs(values[0]-.02) < 1e-8
            assert abs(values[12]-(.004 if graded else .02)) < 1e-8
            if graded:
                assert .004 < values[11] < .02
        finally:
            evaluated.to_mesh_clear()
    return rows
before, after = sys.argv[sys.argv.index('--')+1:]
assert inspect(before, False) == inspect(after, True)
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native thickness tests")
class ProductionThicknessBlenderTests(unittest.TestCase):
    def test_native_fields_preserve_surface_and_restore_exactly(self):
        with tempfile.TemporaryDirectory(prefix="refas-thickness-") as directory:
            root = Path(directory)
            skill, project = root / "copied-refas", root / "project"
            shutil.copytree(SKILL, skill, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

            def command(args):
                result = subprocess.run(list(map(str, args)), cwd=root, capture_output=True,
                    text=True, timeout=120, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": ""})
                if result.returncode:
                    logs = sorted(root.rglob("blender.log"), key=lambda p: p.stat().st_mtime)
                    self.fail(result.stdout[-3000:]+result.stderr[-3000:]+(logs[-1].read_text()[-3000:] if logs else ""))
                return result.stdout

            def cli(name, *args):
                return json.loads(command([sys.executable, "-B", skill / "scripts/produce.py",
                                           name, "--root", project, *args]))

            def run(name, code, prior=None):
                script = root / (name + ".py")
                script.write_text(code)
                args = ["--script", script, "--intent", name, "--outputs", "native",
                        "--views", "", "--blender", BLENDER]
                if prior:
                    args += ["--protect-object", "Neighbor", "--expected-revision", prior["head"],
                             "--expected-sequence", prior["sequence"]]
                return cli("run", *args)

            def bundle(result):
                revision = Path(result["outputs"]["blend"]).parent.parent
                return {str(p.relative_to(revision)): p.read_bytes()
                        for folder in ("inputs", "artifacts")
                        for p in (revision/folder).rglob("*") if p.is_file()}

            catalogue = json.loads(command([sys.executable, "-B", skill / "scripts/produce.py",
                                           "authoring-capabilities", "--id", "thickness-field"]))
            edit = EDIT.replace("from thickness_field import grade_thickness",
                                catalogue["matches"][0]["callables"][0]["authoringImport"])
            cli("init", "--name", "thickness-field")
            before = run("create-surfaces", CREATE)
            graded = run("grade-thickness", edit, before)
            self.assertEqual(graded["observations"], [])
            expected = bundle(graded)
            probe = root / "probe.py"
            probe.write_text(PROBE)
            command([BLENDER, "-b", "--factory-startup", "--threads", "2", "--python-exit-code", "1",
                     "--python", probe, "--", before["outputs"]["blend"], graded["outputs"]["blend"]])
            later = run("change-thickness", edit.replace("caps={12: .004}", "caps={12: .006}"), graded)
            restored = cli("restore", "--revision", graded["head"],
                           "--expected-revision", later["head"], "--expected-sequence", later["sequence"])
            self.assertEqual(bundle(restored), expected)
            self.assertEqual(bundle(graded), expected)
            self.assertTrue(cli("verify")["ok"])


if __name__ == "__main__":
    unittest.main()

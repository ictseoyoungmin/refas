"""Real Blender mounting from a separately copied production skill."""
from __future__ import annotations

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

SETUP = '''
import bpy, math
from mathutils import Matrix, Vector, Euler
from surface_mount import surface_frame, place_on_surface
bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh(name, vertices, faces):
    data = bpy.data.meshes.new(name + 'Mesh')
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return obj

def plane(name='Host'):
    return mesh(name, [(-1,-1,0), (1,-1,0), (1,1,0), (-1,1,0)], [(0,1,2,3)])

def part(name='Detail'):
    return mesh(name, [(-.12,-.08,0), (.12,-.08,0), (.12,.08,0), (-.12,.08,0),
                       (-.12,-.08,.1), (.12,-.08,.1), (.12,.08,.1), (-.12,.08,.1)],
                [(3,2,1,0), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)])

footprint = [(-.12,-.08,0), (.12,-.08,0), (.12,.08,0), (-.12,.08,0)]
arguments = dict(ray_origin=(0,0,2), ray_direction=(0,0,-1), tangent=(1,0,0),
                 contact_points=footprint, clearance=.002, max_distance=3, max_gap=.01)

def close(a, b, tolerance=2e-5):
    assert (Vector(a) - Vector(b)).length <= tolerance, (a,b)

def unchanged(obj, matrix, coordinates):
    assert obj.matrix_world == matrix
    assert [tuple(v.co) for v in obj.data.vertices] == coordinates
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for surface-mount regressions")
class ProductionSurfaceMountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-surface-mount-")
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / "copied-refas"
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def invoke(self, args):
        result = subprocess.run(list(map(str, args)), cwd=self.root, capture_output=True,
                                text=True, timeout=120,
                                env={**os.environ, "PYTHONPATH": "", "PYTHONDONTWRITEBYTECODE": "1"})
        if result.returncode:
            logs = sorted(self.root.rglob("blender.log"), key=lambda p: p.stat().st_mtime)
            self.fail(result.stdout[-4000:] + result.stderr[-4000:]
                      + (logs[-1].read_text()[-4000:] if logs else ""))
        return result

    def probe(self, code):
        script = self.root / (self.id().rsplit('.', 1)[-1] + ".py")
        script.write_text("import sys\nsys.path.insert(0, " + repr(str(self.skill / "scripts/production"))
                          + ")\n" + SETUP + code)
        return self.invoke([BLENDER, "-b", "--factory-startup", "--threads", "2",
                            "--python-exit-code", "1", "--python", script])

    def cli(self, command, *args):
        return json.loads(self.invoke([sys.executable, "-B", self.skill / "scripts/produce.py",
                                       command, *args]).stdout)

    def test_world_frame_and_rigid_scale_on_mirrored_oblique_host(self):
        self.probe('''
host = plane()
host.matrix_world = Matrix.Translation((2,-1,.7)) @ Euler((.4,-.6,.3)).to_matrix().to_4x4() @ Matrix.Diagonal((-2,.7,1.3,1))
detail = part()
detail.scale = (.8,1.4,.6)
detail.location = (-3,2,1)
bpy.context.view_layer.update()
before = [tuple(v.co) for v in detail.data.vertices]
anchor = host.matrix_world @ Vector((.13,-.2,0))
normal = (host.matrix_world.inverted().transposed().to_3x3() @ Vector((0,0,1))).normalized()
tangent = host.matrix_world.to_3x3() @ Vector((1,0,0))
call = {**arguments, 'ray_origin': anchor + normal * 2, 'ray_direction': -normal, 'tangent': tangent}
report = place_on_surface(detail, host, **call)
close(report['frame']['position'], anchor)
close(report['frame']['normal'], normal)
close(detail.matrix_world.to_3x3().col[2].normalized(), normal)
close(detail.matrix_world.to_3x3().col[0].normalized(), tangent.normalized())
close([detail.matrix_world.to_3x3().col[i].length for i in range(3)], (.8,1.4,.6))
assert [tuple(v.co) for v in detail.data.vertices] == before
assert report['sampleCount'] == 5
assert report['minGap'] >= .002
assert report['maxGap'] <= .01
for p in footprint:
    world = detail.matrix_world @ Vector(p)
    gap = (world-anchor).dot(normal)
    assert .002 - report['tolerance'] <= gap <= .01
''')

    def test_evaluated_modifier_is_resampled_after_edit(self):
        self.probe('''
host = plane()
solid = host.modifiers.new('EvaluatedThickness', 'SOLIDIFY')
solid.thickness = .2
solid.offset = 1
detail = part()
first = place_on_surface(detail, host, **arguments)
assert abs(first['frame']['position'][2] - .2) < 2e-6
old_position = detail.location.copy()
solid.thickness = .35
second = place_on_surface(detail, host, **arguments)
assert abs(second['frame']['position'][2] - .35) < 2e-6
assert abs(detail.location.z - old_position.z - .15) < 3e-6
assert len(host.modifiers) == 1 and len(host.data.vertices) == 4
''')

    def test_footprint_rejects_curvature_that_single_anchor_misses(self):
        self.probe('''
xs = [-1,-.5,0,.5,1]
host = mesh('CurvedHost', [(x,y,.3*x*x) for y in (-1,1) for x in xs],
            [(i,i+1,i+6,i+5) for i in range(4)])
detail = part()
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
# The centre has a valid selectable hit, but a broad rigid plate cannot fit.
frame = surface_frame(host, ray_origin=(0,0,2), ray_direction=(0,0,-1), tangent=(1,0,0), max_distance=3)
assert abs(frame['position'][2]) < 1e-6
try:
    place_on_surface(detail, host, **{**arguments, 'contact_points':[(-.65,-.15,0),(.65,-.15,0),(.65,.15,0),(-.65,.15,0)]})
except ValueError as error:
    assert 'max_gap' in str(error)
else:
    raise AssertionError('wide footprint incorrectly accepted')
unchanged(detail, before, coordinates)
''')

    def test_failure_inputs_and_unsupported_part_leave_geometry_untouched(self):
        self.probe('''
host = plane()
detail = part()
detail.location = (2,3,4)
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
bad = [dict(ray_origin=(8,0,2)), dict(ray_origin=(0,0,-2),ray_direction=(0,0,1)),
       dict(tangent=(0,0,1)), dict(contact_points=[(0,0,0),(1,0,0),(2,0,0)]),
       dict(contact_points=[(0,0,0),(.1,0,0),(0,.1,.1)]),
       dict(contact_points=[(-2,-2,0),(2,-2,0),(2,2,0),(-2,2,0)]),
       dict(ray_direction=(0,0,0)),dict(clearance=-1),dict(clearance=float('nan')),
       dict(max_gap=.001),dict(max_distance=0),dict(max_distance=True)]
for override in bad:
    try:
        place_on_surface(detail,host,**{**arguments,**override})
    except ValueError:
        pass
    else:
        raise AssertionError(override)
    unchanged(detail,before,coordinates)
detail.parent = host
bpy.context.view_layer.update()
parented = detail.matrix_world.copy()
try:
    place_on_surface(detail,host,**arguments)
except ValueError as error:
    assert 'unparented' in str(error)
else:
    raise AssertionError('parented part accepted')
unchanged(detail,parented,coordinates)
''')

    def test_front_side_and_centroid_prevent_wrong_surface_layer(self):
        self.probe('''
# Two separate sheets are one explicit host. An oblique ray can select the
# lower sheet, but normal projection from above would hit a different layer.
host = mesh('LayeredHost', [(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0),
                          (-.2,-.2,.4),(.2,-.2,.4),(.2,.2,.4),(-.2,.2,.4)],
            [(0,1,2,3),(4,5,6,7)])
detail = part()
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
try:
    place_on_surface(detail,host,**{**arguments,'ray_origin':(1,0,.2),'ray_direction':(-1,0,-.2),'max_gap':.8})
except ValueError as error:
    assert 'different surface layer' in str(error)
else:
    raise AssertionError('alternate layer accepted')
unchanged(detail,before,coordinates)
''')

    def test_distant_local_contact_plane_cannot_report_ideal_clearance(self):
        self.probe('''
host = plane()
detail = part()
for vertex in detail.data.vertices:
    vertex.co.z += 1e6
points = [(x,y,1e6) for x,y,z in footprint]
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
try:
    place_on_surface(detail,host,**{**arguments,'contact_points':points})
except ValueError as error:
    assert 'recenter' in str(error)
else:
    raise AssertionError('ideal clearance was accepted after float cancellation')
unchanged(detail,before,coordinates)
''')

    def test_distant_local_origin_cannot_shift_tangential_anchor(self):
        self.probe('''
host = plane()
detail = part()
for vertex in detail.data.vertices:
    vertex.co.x += 1e6
points = [(x+1e6,y,z) for x,y,z in footprint]
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
try:
    place_on_surface(detail,host,**{**arguments,'contact_points':points,'ray_origin':(.03,0,2)})
except ValueError as error:
    assert 'recenter' in str(error)
else:
    raise AssertionError('realized footprint lost the intended tangent-plane anchor')
unchanged(detail,before,coordinates)
''')

    def test_far_projection_ray_cannot_hide_raised_support(self):
        self.probe('''
xs = [-1,-.2,-.1,.1,.2,1]
zs = [.02,.02,0,0,.02,.02]
host = mesh('SteppedHost', [(x,y,z) for y in (-1,1) for x,z in zip(xs,zs)],
            [(i,i+1,i+7,i+6) for i in range(5)])
detail = part()
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
for distance in (3, 1e7):
    try:
        place_on_surface(detail,host,**{**arguments,'max_distance':distance,
            'contact_points':[(-.4,-.1,0),(.4,-.1,0),(.4,.1,0),(-.4,.1,0)]})
    except ValueError:
        pass
    else:
        raise AssertionError('raised support was lost through ray precision')
    unchanged(detail,before,coordinates)
''')

    def test_disabled_host_never_falls_back_to_unevaluated_base_mesh(self):
        self.probe('''
host = plane()
solid = host.modifiers.new('EvaluatedThickness', 'SOLIDIFY')
solid.thickness = .2
solid.offset = 1
detail = part()
host.hide_viewport = True
bpy.context.view_layer.update()
before = detail.matrix_world.copy()
coordinates = [tuple(v.co) for v in detail.data.vertices]
try:
    place_on_surface(detail,host,**arguments)
except ValueError as error:
    assert 'current view layer' in str(error)
else:
    raise AssertionError('disabled host base mesh accepted')
unchanged(detail,before,coordinates)
assert host.hide_viewport
''')

    def test_installed_native_edit_reopen_and_exact_restore(self):
        project = self.root / "mount-project"
        self.cli("init", "--root", project, "--name", "surface-mount")
        create = self.root / "create-mounted-detail.py"
        create.write_text(SETUP + '''
host = plane()
detail = part()
neighbor = part('Neighbor')
neighbor.location = (3,0,0)
place_on_surface(detail,host,**arguments)
''')
        flags = ["--root", project, "--outputs", "native", "--views", "", "--blender", BLENDER]
        initial = self.cli("run", *flags, "--script", create, "--intent", "mount a rigid detail")
        before = json.loads(Path(initial["outputs"]["scene"]).read_text())
        edit = self.root / "edit-mounted-detail.py"
        edit.write_text('''import bpy
from surface_mount import place_on_surface
host=bpy.data.objects['Host']
host.rotation_euler=(.2,-.3,.1)
bpy.context.view_layer.update()
from mathutils import Vector
normal=(host.matrix_world.to_3x3() @ Vector((0,0,1))).normalized()
place_on_surface(bpy.data.objects['Detail'],host,ray_origin=normal*2,
    ray_direction=-normal,tangent=(1,0,0),
    contact_points=[(-.12,-.08,0),(.12,-.08,0),(.12,.08,0),(-.12,.08,0)],
    clearance=.003,max_distance=3,max_gap=.01)
''')
        revised = self.cli("run", *flags, "--script", edit, "--intent", "remount on the edited host",
                           "--protect-object", "Neighbor")
        after = json.loads(Path(revised["outputs"]["scene"]).read_text())
        before_objects = {o["name"]: o for o in before["objects"]}
        after_objects = {o["name"]: o for o in after["objects"]}
        self.assertEqual(before_objects["Neighbor"], after_objects["Neighbor"])
        self.assertEqual(before_objects["Detail"]["mesh"], after_objects["Detail"]["mesh"])
        self.assertNotEqual(before_objects["Detail"]["fingerprint"], after_objects["Detail"]["fingerprint"])
        self.assertNotIn("glb", revised["outputs"])
        initial_native = Path(initial["outputs"]["blend"]).read_bytes()
        restored = self.cli("restore", "--root", project, "--revision", initial["head"])
        self.assertEqual(Path(restored["outputs"]["blend"]).read_bytes(), initial_native)
        self.assertTrue(self.cli("verify", "--root", project)["ok"])


if __name__ == '__main__':
    unittest.main()

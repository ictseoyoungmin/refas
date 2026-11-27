"""Real Blender blind recesses from a separately copied production skill."""
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
import recess
from recess import cut_recess
from surface_mount import _surface
bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh(name, vertices, faces):
    data = bpy.data.meshes.new(name + 'Mesh')
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return obj

def slabs(intervals=((-0.6,0),), name='Host'):
    vertices, faces = [], []
    for bottom, top in intervals:
        start = len(vertices)
        vertices += [(x,y,z) for z in (bottom,top) for x,y in
                     [(-1,-.7),(1,-.7),(1,.7),(-1,.7)]]
        faces += [tuple(start+i for i in f) for f in
                  [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]]
    return mesh(name, vertices, faces)

arguments = dict(ray_origin=(0,0,2), ray_direction=(0,0,-1), tangent=(1,0,0),
                 outline=[(-.3,-.2),(.3,-.2),(.3,.2),(-.3,.2)],
                 depth=.2, min_floor=.2, min_wall=.15, max_distance=3)

def snapshot(host):
    bpy.context.view_layer.update()
    return ([tuple(v.co) for v in host.data.vertices], [tuple(p.vertices) for p in host.data.polygons],
            [list(r) for r in host.matrix_world],
            [(m.name,m.type,m.show_viewport,m.show_render,getattr(m,'object',None)) for m in host.modifiers],
            sorted(o.name for o in bpy.data.objects), sorted(m.name for m in bpy.data.meshes))

def reject(host, **overrides):
    before = snapshot(host)
    try:
        cut_recess(host, 'Intake', **{**arguments, **overrides})
    except ValueError:
        pass
    else:
        raise AssertionError('invalid recess accepted: '+str(overrides))
    assert snapshot(host) == before

def floor_z(host, x=0, y=0):
    tree, offset, _, _ = _surface(host)
    point, normal, _, _ = tree.ray_cast(Vector((x,y,2))-offset,Vector((0,0,-1)),3)
    assert point is not None and normal.z > .99
    return (point+offset).z
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for recess regressions")
class ProductionRecessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-recess-")
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

    def probe(self, code, setup=True):
        script = self.root / (self.id().rsplit('.', 1)[-1] + ".py")
        script.write_text("import sys\nsys.path.insert(0, " + repr(str(self.skill / "scripts/production"))
                          + ")\n" + (SETUP if setup else "") + code)
        return self.invoke([BLENDER, "-b", "--factory-startup", "--threads", "2",
                            "--python-exit-code", "1", "--python", script])

    def cli(self, command, *args):
        return json.loads(self.invoke([sys.executable, "-B", self.skill / "scripts/produce.py",
                                       command, *args]).stdout)

    def test_real_floor_walls_and_absolute_same_feature_revision(self):
        self.probe('''
host = slabs()
neighbor = slabs(name='Neighbor')
neighbor.location = (4,0,0)
before_host = [tuple(v.co) for v in host.data.vertices]
before_neighbor = snapshot(neighbor)[:3]
first = cut_recess(host, 'Intake', **arguments)
assert not first['updated'] and abs(floor_z(host)+.2) < 2e-6
assert first['minSampledFloor'] >= .39999 and first['minSampledWall'] >= .49999
cutter = bpy.data.objects[first['cutter']]
modifier = host.modifiers['Intake']
assert modifier.object is cutter and cutter['refas_role'] == 'construction' and cutter.hide_render
second = cut_recess(host, 'Intake', **{**arguments, 'depth':.3})
assert second['updated'] and abs(floor_z(host)+.3) < 2e-6
assert bpy.data.objects[second['cutter']] is cutter and host.modifiers['Intake'] == modifier
assert len(host.modifiers) == 1 and len(cutter.data.vertices) == 8
assert [tuple(v.co) for v in host.data.vertices] == before_host
assert snapshot(neighbor)[:3] == before_neighbor
tree, offset, _, _ = _surface(host)
wall, normal, _, _ = tree.ray_cast(Vector((0,0,-.15))-offset,Vector((1,0,0)),.5)
assert abs((wall+offset).x-.3) < 2e-6 and normal.x < -.99
# Native outline vertices remain editable; the next helper call takes its own
# explicit outline/depth rather than accumulating a hand-edited cutter state.
for vertex in cutter.data.vertices:
    vertex.co.x *= 1.2
cutter.data.update()
bpy.context.view_layer.update()
assert abs(floor_z(host,.33)+.3) < 2e-6
third = cut_recess(host, 'Intake', **arguments)
assert abs(floor_z(host,.33)) < 2e-6 and abs(floor_z(host)+.2) < 2e-6
assert host.modifiers['Intake'].object is cutter
''')

    def test_transformed_host_and_preceding_evaluated_modifier(self):
        self.probe('''
host = mesh('Host',[(-1,-.7,0),(1,-.7,0),(1,.7,0),(-1,.7,0)],[(0,1,2,3)])
solid = host.modifiers.new('Thickness','SOLIDIFY')
solid.thickness = .6
solid.offset = -1
host.matrix_world = Matrix.Translation((2,-1,.7)) @ Euler((.4,-.6,.3)).to_matrix().to_4x4() @ Matrix.Diagonal((-1.5,.8,1.3,1))
bpy.context.view_layer.update()
anchor = host.matrix_world @ Vector((0,0,0))
normal = (host.matrix_world.inverted().transposed().to_3x3() @ Vector((0,0,1))).normalized()
tangent = host.matrix_world.to_3x3() @ Vector((1,0,0))
call = {**arguments,'ray_origin':anchor+normal*2,'ray_direction':-normal,'tangent':tangent}
report = cut_recess(host,'Intake',**call)
assert (Vector(report['frame']['position'])-anchor).length < 3e-6
assert (Vector(report['frame']['normal'])-normal).length < 3e-6
assert max(abs(d-.2) for d in report['depthRange']) < 3e-6
assert len(host.data.vertices) == 4 and host.modifiers[0] == solid
solid.thickness = .7
revised = cut_recess(host,'Intake',**call)
assert revised['minSampledFloor'] > report['minSampledFloor'] + .1299
assert max(abs(d-.2) for d in revised['depthRange']) < 3e-6
''')

    def test_invalid_outlines_frames_and_dimensions_do_not_mutate(self):
        self.probe('''
host = slabs()
star = [(math.cos(a*2*math.pi/5)*.3, math.sin(a*2*math.pi/5)*.3) for a in (0,2,4,1,3)]
bad = [dict(outline=[]), dict(outline=[(-.3,-.2),(.3,.2),(.3,-.2),(-.3,.2)]),
       dict(outline=[(-.3,-.2),(.3,-.2),(0,0),(.3,.2),(-.3,.2)]), dict(outline=star),
       dict(outline=[(-.3,-.2),(.3,-.2),(.3,-.2),(.3,.2),(-.3,.2)]),
       dict(outline=[(1,1),(2,1),(2,2),(1,2)]), dict(outline=[(0,0),(1,0),(2,0)]),
       dict(floor_samples=[(.8,0)]),dict(floor_samples=None),
       dict(ray_origin=(8,0,2)),dict(tangent=(0,0,1)),
       dict(ray_origin=(0,0,-.3),ray_direction=(0,0,1)),
       dict(depth=0),dict(depth=float('nan')),dict(min_floor=-1),dict(min_wall=0),
       dict(max_distance=True)]
for override in bad:
    reject(host,**override)
# Both winding orders are accepted for the same geometric outline.
report = cut_recess(host,'Intake',**{**arguments,'outline':list(reversed(arguments['outline']))})
assert abs(floor_z(host)+.2) < 2e-6
''')

    def test_first_solid_floor_interval_and_sampled_side_breakthrough(self):
        self.probe('''
for intervals, depth, minimum in [(((-.05,0),(-.5,-.2)),.25,.1),
                                  (((-1e-5,0),(-.2,-2e-5)),.05,.02)]:
    host = slabs(intervals)
    reject(host,depth=depth,min_floor=minimum,min_wall=.02)
    bpy.data.objects.remove(host,do_unlink=True)
host = slabs()
reject(host,depth=.5,min_floor=.2)
reject(host,outline=[(-.9,-.2),(.9,-.2),(.9,.2),(-.9,.2)],min_wall=.15)
reject(host,outline=[(-1.1,-.2),(1.1,-.2),(1.1,.2),(-1.1,.2)])
''')

    def test_precision_and_unavailable_evaluation_reject_without_side_effects(self):
        self.probe('''
host = slabs()
reject(host,max_distance=1e7)
host.location = (1e6,0,0)
reject(host,ray_origin=(1e6,0,2))
host.location = (0,0,0)
host.hide_viewport = True
reject(host)
assert host.hide_viewport
host.hide_viewport = False
host.parent = bpy.data.objects.new('Parent',None)
bpy.context.collection.objects.link(host.parent)
reject(host)
''')

    def test_ownership_shared_cutter_and_modifier_order_are_respected(self):
        self.probe('''
host = slabs()
other = host.modifiers.new('Intake','BEVEL')
reject(host)
host.modifiers.remove(other)
report = cut_recess(host,'Intake',**arguments)
cutter = bpy.data.objects[report['cutter']]
original_data, original_matrix = cutter.data, cutter.matrix_world.copy()
neighbor = slabs(name='Neighbor')
shared = neighbor.modifiers.new('SharedCut','BOOLEAN')
shared.object = cutter
reject(host)
neighbor.modifiers.remove(shared)
collection = bpy.data.collections.new('SharedCutters')
bpy.context.scene.collection.children.link(collection)
collection.objects.link(cutter)
shared = neighbor.modifiers.new('SharedCollection','BOOLEAN')
shared.operand_type = 'COLLECTION'
shared.collection = collection
reject(host)
neighbor.modifiers.remove(shared)
bpy.data.collections.remove(collection)
linked = bpy.data.objects.new('SharedMesh',cutter.data)
bpy.context.collection.objects.link(linked)
reject(host)
bpy.data.objects.remove(linked,do_unlink=True)
later = host.modifiers.new('LaterBevel','BEVEL')
reject(host)
host.modifiers.remove(later)
assert cutter.data is original_data and cutter.matrix_world == original_matrix
assert abs(floor_z(host)+.2) < 2e-6
''')

    def test_animated_mesh_data_rigid_cutter_and_delta_transforms_reject(self):
        self.probe('''
host = slabs()
host.data.driver_add('vertices[0].co',2).driver.expression = '-.6'
reject(host)
host.data.animation_data_clear()
report = cut_recess(host,'Intake',**arguments)
cutter = bpy.data.objects[report['cutter']]
old_data, old_matrix = cutter.data, cutter.matrix_world.copy()
cutter.data.animation_data_create()
reject(host)
cutter.data.animation_data_clear()
cutter.delta_location = (.05,0,0)
bpy.context.view_layer.update()
delta_matrix = cutter.matrix_world.copy()
reject(host)
assert cutter.matrix_world == delta_matrix and cutter.data is old_data
cutter.delta_location = (0,0,0)
bpy.context.view_layer.update()
for obj in bpy.context.scene.objects:
    obj.select_set(False)
cutter.select_set(True)
bpy.context.view_layer.objects.active = cutter
bpy.ops.rigidbody.object_add()
reject(host)
assert cutter.rigid_body is not None and cutter.data is old_data
''')

    def test_failed_boolean_postcondition_restores_prior_native_state(self):
        self.probe('''
host = slabs()
report = cut_recess(host,'Intake',**arguments)
cutter = bpy.data.objects[report['cutter']]
modifier = host.modifiers['Intake']
old_data, old_matrix = cutter.data, cutter.matrix_world.copy()
before = snapshot(host)
original_closed = recess._closed
calls = 0
def fail_after_commit(obj):
    global calls
    calls += 1
    if calls == 2:
        raise ValueError('synthetic evaluated Boolean failure')
    return original_closed(obj)
recess._closed = fail_after_commit
reject(host,depth=.3)
recess._closed = original_closed
assert calls == 2
assert snapshot(host) == before
assert cutter.data is old_data and cutter.matrix_world == old_matrix
assert host.modifiers['Intake'] == modifier and modifier.object is cutter
assert modifier.show_viewport and modifier.show_render and abs(floor_z(host)+.2) < 2e-6
# Creation failure also removes its partial cutter, mesh and Boolean.
fresh = slabs(name='Fresh')
before = snapshot(fresh)
calls = 0
recess._closed = fail_after_commit
reject(fresh)
recess._closed = original_closed
assert calls == 2
assert snapshot(fresh) == before
''')

    def test_installed_native_edit_delivery_and_exact_restore(self):
        project = self.root / "recess-project"
        self.cli("init", "--root", project, "--name", "blind-recess")
        create = self.root / "create-recess.py"
        create.write_text(SETUP + '''
host=slabs()
neighbor=slabs(name='Neighbor')
neighbor.location=(4,0,0)
cut_recess(host,'Intake',**arguments)
''')
        flags = ["--root",project,"--outputs","native","--views","","--blender",BLENDER]
        initial = self.cli("run", *flags, "--script",create,"--intent","make a real editable blind cavity")
        initial_bytes = Path(initial["outputs"]["blend"]).read_bytes()
        before = {o["name"]:o for o in json.loads(Path(initial["outputs"]["scene"]).read_text())["objects"]}
        edit = self.root / "edit-recess.py"
        edit.write_text('''import bpy
from recess import cut_recess
cut_recess(bpy.data.objects['Host'],'Intake',ray_origin=(0,0,2),ray_direction=(0,0,-1),
    tangent=(1,0,0),outline=[(-.4,-.2),(.4,-.2),(.4,.2),(-.4,.2)],
    depth=.3,min_floor=.2,min_wall=.15,max_distance=3)
''')
        revised = self.cli("run",*flags,"--script",edit,"--intent","revise outline and absolute depth",
                           "--protect-object","Neighbor")
        after = {o["name"]:o for o in json.loads(Path(revised["outputs"]["scene"]).read_text())["objects"]}
        self.assertEqual(before["Neighbor"],after["Neighbor"])
        self.assertEqual(before["Host"]["mesh"],after["Host"]["mesh"])
        self.assertNotEqual(before["Host"]["evaluatedMesh"],after["Host"]["evaluatedMesh"])
        self.assertNotIn("glb",revised["outputs"])
        delivered = self.cli("deliver","--root",project,"--views","","--blender",BLENDER)
        self.probe('''
for path, native, depth in ''' + repr([(initial["outputs"]["blend"],True,.2),
                                      (revised["outputs"]["blend"],True,.3),
                                      (delivered["outputs"]["blend"],True,.3),
                                      (delivered["outputs"]["glb"],False,.3)]) + ''':
    if native:
        bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    host=bpy.data.objects['Host']
    assert abs(floor_z(host)+depth) < 3e-6
    if native:
        assert len(host.modifiers)==1
        cutter=host.modifiers['Intake'].object
        assert cutter['refas_role']=='construction' and cutter.hide_render
        assert cutter['refas_recess_feature']=='Intake' and len(cutter.data.vertices)==8
    else:
        assert sorted(o.name for o in bpy.context.scene.objects)==['Host','Neighbor']
        assert not host.modifiers
''')
        restored = self.cli("restore","--root",project,"--revision",initial["head"])
        self.assertEqual(Path(restored["outputs"]["blend"]).read_bytes(),initial_bytes)
        self.assertTrue(self.cli("verify","--root",project)["ok"])


if __name__ == '__main__':
    unittest.main()

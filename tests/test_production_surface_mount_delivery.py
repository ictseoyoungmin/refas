"""Native surface relationships survive public save, edit and static delivery."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / 'skills/refas'
BLENDER = os.environ.get('BLENDER_EXE') or shutil.which('blender')

CREATE = '''
import bpy
from surface_mount import bind_on_surface
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new('ClothCage')
mesh.from_pydata([(x/3, y/3, 0) for y in range(-3, 4) for x in range(-3, 4)], [],
    [(j*7+i, j*7+i+1, (j+1)*7+i+1, (j+1)*7+i) for j in range(6) for i in range(6)])
host = bpy.data.objects.new('Cloth', mesh)
bpy.context.collection.objects.link(host)
smooth = host.modifiers.new('Smooth', 'SUBSURF')
smooth.levels = smooth.render_levels = 1
shell = host.modifiers.new('Thickness', 'SOLIDIFY')
shell.thickness, shell.offset = .02, 1
bpy.ops.mesh.primitive_cube_add(size=1)
detail = bpy.context.object
detail.name = 'Button'
for vertex in detail.data.vertices:
    vertex.co.x *= .04
    vertex.co.y *= .03
    vertex.co.z = (vertex.co.z + .5) * .01
bind_on_surface(detail, host, ray_origin=(.1, .1, 1), ray_direction=(0,0,-1),
    tangent=(1,0,0), contact_points=[(-.02,-.015,0),(.02,-.015,0),(.02,.015,0),(-.02,.015,0)],
    clearance=.003, max_gap=.008, max_distance=1.2)
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for native mount delivery')
class ProductionSurfaceMountDeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-mounted-delivery-')
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / 'copied-refas'
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        cls.source = cls.root / 'source.blend'
        cls.probe('create', CREATE + '\nbpy.ops.wm.save_as_mainfile(filepath=' + repr(str(cls.source)) + ')\n')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def invoke(cls, command, success=True):
        result = subprocess.run(list(map(str, command)), cwd=cls.root, capture_output=True,
            text=True, timeout=120, env={**os.environ, 'PYTHONPATH': '', 'PYTHONDONTWRITEBYTECODE': '1'})
        if (result.returncode == 0) != success:
            logs = sorted(cls.root.rglob('blender.log'), key=lambda p: p.stat().st_mtime)
            raise AssertionError(result.stdout[-5000:] + result.stderr[-3000:]
                                 + (logs[-1].read_text()[-5000:] if logs else ''))
        return result

    @classmethod
    def probe(cls, name, code, *args):
        script = cls.root / (name + '.py')
        script.write_text('import sys\nsys.path.insert(0,'
            + repr(str(cls.skill / 'scripts/production')) + ')\n' + code)
        return cls.invoke([BLENDER, '-b', '--factory-startup', '--threads', '2',
                           '--python-exit-code', '1', '--python', script, '--', *args])

    def cli(self, command, *args, success=True):
        result = self.invoke([sys.executable, '-B', self.skill / 'scripts/produce.py', command, *args], success)
        return json.loads(result.stdout) if success else result

    def test_edit_reopen_and_static_glb_preserve_evaluated_geometry(self):
        project = self.root / 'delivery-project'
        self.cli('init', '--root', project, '--name', 'mounted-button')
        edit = self.root / 'tilt-cloth.py'
        edit.write_text('''import bpy
host = bpy.data.objects['Cloth']
for vertex in host.data.vertices:
    vertex.co.z += .12 * vertex.co.x - .08 * vertex.co.y + .05
host.modifiers['Thickness'].thickness = .035
host.data.update()
bpy.context.view_layer.update()
''')
        changed = self.cli('run', '--root', project, '--input-blend', self.source,
            '--script', edit, '--intent', 'tilt cloth and increase its thickness', '--outputs', 'native',
            '--views', '', '--blender', BLENDER)
        delivered = self.cli('deliver', '--root', project, '--views', '', '--blender', BLENDER)
        state = json.loads(Path(delivered['outputs']['scene']).read_text())
        self.assertEqual(state['statistics']['constructionMeshes'], 1)
        self.assertEqual(state['statistics']['meshes'], 2)
        rows = {row['name']: row for row in state['objects']}
        self.assertEqual(rows['Button']['parentVertices'], [0, 1, 2])
        self.assertIn('surfaceMount', rows[rows['Button']['parent']])
        self.probe('verify-roundtrip', '''
import bpy, json, sys
from mathutils import Vector
from surface_mount import check_surface_mount
source, edited, native, glb = sys.argv[sys.argv.index('--')+1:]

def snapshot(path):
    if path.endswith('.glb'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for name in ('Cloth', 'Button'):
        obj = bpy.data.objects[name].evaluated_get(graph)
        mesh = obj.to_mesh()
        try:
            mesh.calc_loop_triangles()
            triangles = []
            for triangle in mesh.loop_triangles:
                points = tuple(tuple(round(x, 5) for x in obj.matrix_world @ mesh.vertices[i].co)
                               for i in triangle.vertices)
                triangles.append(min(points, points[1:]+points[:1], points[2:]+points[:2]))
            result[name] = sorted(triangles)
        finally:
            obj.to_mesh_clear()
    return result

original = snapshot(source)
before_export = snapshot(edited)
saved_native = snapshot(native)
part = bpy.data.objects['Button']
assert part.parent_type == 'VERTEX_3' and part.parent.modifiers[0].is_bound
assert [m.type for m in bpy.data.objects['Cloth'].modifiers] == ['SUBSURF','SOLIDIFY']
report = check_surface_mount(part)
assert .00295 <= report['minGap'] <= report['maxGap'] <= .00805, report
assert original['Button'] != saved_native['Button']
assert before_export == saved_native
reimported = snapshot(glb)
assert set(bpy.context.scene.objects.keys()) == {'Cloth','Button'}
assert saved_native == reimported
''', self.source, changed['outputs']['blend'], delivered['outputs']['blend'], delivered['outputs']['glb'])
        self.cli('verify', '--root', project)

    def test_invalid_mounts_and_unbaked_animated_dependencies_are_rejected(self):
        self.probe('reject-invalid', '''
import bpy, runpy, sys
from pathlib import Path
worker, source, destination = sys.argv[sys.argv.index('--')+1:]
api = runpy.run_path(worker, run_name='mount_delivery_test')
mutations = {
    'topology': "bpy.data.objects['Cloth'].modifiers['Smooth'].levels = 2",
    'parent': "bpy.data.objects['Button'].parent_type = 'OBJECT'",
    'strength': "bpy.data.objects['Button'].parent.modifiers[0].strength = .5",
}
for label, code in mutations.items():
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
    exec(code)
    bpy.context.view_layer.update()
    try:
        api['require_portable_scene']()
    except ValueError:
        pass
    else:
        raise AssertionError(label + ' was accepted')
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
host = bpy.data.objects['Cloth']
host.keyframe_insert(data_path='location', frame=1)
host.location.x = .2
host.keyframe_insert(data_path='location', frame=10)
bpy.context.scene.frame_set(1)
api['require_portable_scene']()
folder = Path(destination)
folder.mkdir()
try:
    api['export_scene'](folder)
except ValueError as error:
    assert 'static' in str(error) or 'bake' in str(error), str(error)
else:
    raise AssertionError('animated surface relation silently flattened')
assert not (folder / 'asset.glb').exists()
assert bpy.data.objects['Button'].parent is not None

# WAVE changes geometry with time even without action curves or drivers.
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
from surface_mount import bind_on_surface
part = bpy.data.objects['Button']
old_carrier = part.parent
matrix = part.matrix_world.copy()
part.parent = None
part.parent_type = 'OBJECT'
part.matrix_world = matrix
bpy.data.objects.remove(old_carrier, do_unlink=True)
host = bpy.data.objects['Cloth']
wave = host.modifiers.new('UnbakedWave', 'WAVE')
wave.height = .01
wave.speed = .5
bpy.context.view_layer.update()
bind_on_surface(part, host, ray_origin=(.1,.1,1), ray_direction=(0,0,-1),
    tangent=(1,0,0), contact_points=[(-.02,-.015,0),(.02,-.015,0),(.02,.015,0),(-.02,.015,0)],
    clearance=.003, max_gap=.008, max_distance=1.2)
api['require_portable_scene']()
assert host.animation_data is None
try:
    api['export_scene'](folder)
except ValueError as error:
    assert 'WAVE' in str(error), str(error)
else:
    raise AssertionError('implicit time-based surface deformation silently flattened')
assert not (folder / 'asset.glb').exists()
''', self.skill / 'scripts/production/blender_worker.py', self.source, self.root / 'rejected-export')


if __name__ == '__main__':
    unittest.main()

"""Profile intent and actual Blender construction from a separately copied skill."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / 'skills/refas'
BLENDER = os.environ.get('BLENDER_EXE') or shutil.which('blender')
SPEC = importlib.util.spec_from_file_location('surface_patch',
    SKILL / 'scripts/production/surface_patch.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProductionProfileSamplesTests(unittest.TestCase):
    def test_exact_breakpoints_and_explicit_curve(self):
        source = [('LINEAR', ((0, 0, 0), (1, 0, 0))),
                  ('BEZIER', ((1, 0, 0), (1, 1, 0), (2, 1, 0), (2, 0, 0)))]
        samples = MODULE.sample_profile(source, divisions=(2, 4))
        self.assertIsInstance(samples, tuple)
        self.assertEqual(len(samples), 7)
        self.assertEqual(samples[:3], ((0, 0, 0), (.5, 0, 0), (1, 0, 0)))
        self.assertEqual(samples[4], (1.5, .75, 0))
        self.assertEqual(samples[-1], (2, 0, 0))
        self.assertEqual(source[1][1][1], (1, 1, 0))

    def test_malformed_or_disconnected_profiles_reject(self):
        line = [('LINEAR', ((0, 0, 0), (1, 0, 0)))]
        cases = [(line, (0,)), (line, (True,)), (line, (2.5,)), (line, ()),
                 ([('AUTO', line[0][1])], (2,)),
                 ([('BEZIER', line[0][1])], (2,)),
                 ([('LINEAR', ((0, 0, 0), (0, 0, 0)))], (2,)),
                 ([('LINEAR', ((0, 0, 0), (float('nan'), 0, 0)))], (2,)),
                 ([('LINEAR', ((0, 0, 0), (10**500, 0, 0)))], (2,)),
                 (line+[('LINEAR', ((1.000000000000001, 0, 0), (2, 0, 0)))], (2, 2))]
        for segments, divisions in cases:
            with self.subTest(segments=segments, divisions=divisions), self.assertRaises(ValueError):
                MODULE.sample_profile(segments, divisions=divisions)


SETUP = '''
import bpy, bmesh, math, struct, sys
from types import SimpleNamespace
from surface_patch import sample_profile, build_surface
bpy.ops.wm.read_factory_settings(use_empty=True)

def line(a,b,n=2):
    return sample_profile([('LINEAR',(a,b))],divisions=(n,))

def pair():
    boundaries = {
        'A-bottom':line((0,0,0),(1,0,0)),
        'shared':line((1,0,0),(1,1,0)),
        'A-top':line((0,1,0),(1,1,0)),
        'A-left':line((0,0,0),(0,1,0)),
        'B-bottom':line((1,0,0),(2,0,0)),
        'B-right':line((2,0,0),(2,1,0)),
        'B-top':line((1,1,0),(2,1,0)),
    }
    patches = {'A':(('A-bottom',False),('shared',False),('A-top',False),('A-left',False)),
               'B':(('B-bottom',False),('B-right',False),('B-top',False),('shared',False))}
    return boundaries,patches

def group(obj,name):
    index=obj.vertex_groups[name].index
    return [v.index for v in obj.data.vertices if any(g.group==index for g in v.groups)]

def context():
    active=bpy.context.view_layer.objects.active
    return (active.as_pointer() if active else None,
            tuple(o.as_pointer() for o in bpy.context.selected_objects),bpy.context.mode,
            tuple(bpy.context.tool_settings.mesh_select_mode))

def data_ids():
    return (tuple(o.as_pointer() for o in bpy.data.objects),
            tuple(m.as_pointer() for m in bpy.data.meshes),context())

def rejected(boundaries,patches,name='Rejected'):
    before=data_ids()
    try:build_surface(name,boundaries=boundaries,patches=patches)
    except ValueError:pass
    else:raise AssertionError('invalid surface was accepted')
    assert data_ids()==before
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for surface construction')
class ProductionSurfacePatchBlenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-surface-patch-')
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / 'copied-refas'
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def probe(self, code):
        script = self.root / (self.id().rsplit('.', 1)[-1]+'.py')
        script.write_text('import sys\nsys.path.insert(0, '+repr(str(self.skill / 'scripts/production'))
                          +')\n'+SETUP+code)
        result = subprocess.run([BLENDER, '-b', '--factory-startup', '--threads', '2',
                                 '--python-exit-code', '1', '--python', str(script)],
                                cwd=self.root, capture_output=True, text=True, timeout=90,
                                env={**os.environ, 'PYTHONPATH':'', 'PYTHONDONTWRITEBYTECODE':'1'})
        self.assertEqual(result.returncode, 0, result.stdout[-5000:]+result.stderr[-5000:])

    def test_shared_indices_winding_no_spatial_weld_and_context(self):
        self.probe('''
bpy.ops.mesh.primitive_cube_add()
sentinel=bpy.context.object
bpy.ops.object.mode_set(mode='EDIT')
before=context()
boundaries,patches=pair()
obj=build_surface('Joined',boundaries=boundaries,patches=patches)
assert context()==before and len(sentinel.data.vertices)==8
assert obj.type=='MESH' and len(obj.data.vertices)==15 and len(obj.data.polygons)==8
assert len(group(obj,'boundary:shared'))==3
assert set(group(obj,'patch:A')) & set(group(obj,'patch:B'))==set(group(obj,'boundary:shared'))
assert [v.value for v in obj.data.attributes['refas_patch'].data]==[0]*4+[1]*4
assert all(v.co.z==0 for v in obj.data.vertices)
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
shared=group(obj,'boundary:shared')
for a,b in zip(shared,shared[1:]):
    edge=bm.edges.get((bm.verts[a],bm.verts[b]))
    assert edge.is_manifold and edge.is_contiguous
assert all(face.normal.z==1 for face in bm.faces)
bm.free()

# Distinct names at identical positions are intentionally not welded.
only={k:v for k,v in boundaries.items() if k.startswith('A-') or k=='shared'}
duplicated={**only,**{'copy-'+k:v for k,v in only.items()}}
separate=build_surface('CoincidentIndependent',boundaries=duplicated,
    patches={'first':patches['A'],'second':tuple(('copy-'+k,r) for k,r in patches['A'])})
assert len(separate.data.vertices)==18 and len(separate.data.polygons)==8
assert not set(group(separate,'patch:first')) & set(group(separate,'patch:second'))
assert context()==before
''')

    def test_curved_boundaries_native_edit_modifier_and_reopen(self):
        self.probe('''
bottom=sample_profile([('BEZIER',((0,0,0),(1/3,0,1),(2/3,0,1),(1,0,0)))],divisions=(8,))
top=tuple((x,1,z) for x,y,z in bottom)
left=sample_profile([('BEZIER',((0,0,0),(0,1/3,.5),(0,2/3,.5),(0,1,0)))],divisions=(8,))
right=tuple((1,y,z) for x,y,z in left)
obj=build_surface('Rolled',boundaries={'bottom':bottom,'right':right,'top':top[::-1],'left':left},
    patches={'face':(('bottom',False),('right',False),('top',True),('left',False))})
assert len(obj.data.vertices)==81 and len(obj.data.polygons)==64
for name,points in [('bottom',bottom),('right',right),('top',top[::-1]),('left',left)]:
    expected={struct.unpack('<3f',struct.pack('<3f',*p)) for p in points}
    assert {tuple(obj.data.vertices[i].co) for i in group(obj,'boundary:'+name)}==expected
center=next(v for v in obj.data.vertices if v.co.x==.5 and v.co.y==.5)
assert abs(center.co.z-1.125)<1e-7
center_index=center.index
center.co.z+=.125
sub=obj.modifiers.new('Native subdivision','SUBSURF');sub.levels=sub.render_levels=1
shell=obj.modifiers.new('Native thickness','SOLIDIFY');shell.thickness=.02
obj.shape_key_add(name='Basis')
key=obj.shape_key_add(name='Later native edit');key.data[center_index].co.z+=.25;key.value=.5
bpy.ops.wm.save_as_mainfile(filepath='surface-native.blend')
bpy.ops.wm.open_mainfile(filepath='surface-native.blend',load_ui=False,use_scripts=False)
obj=bpy.data.objects['Rolled']
assert [m.type for m in obj.modifiers]==['SUBSURF','SOLIDIFY']
assert abs(obj.data.vertices[center_index].co.z-1.25)<1e-7
assert obj.data.shape_keys.key_blocks['Later native edit'].value==.5
assert len(group(obj,'boundary:bottom'))==9
assert [v.value for v in obj.data.attributes['refas_patch'].data]==[0]*64
assert not bpy.app.handlers.depsgraph_update_post
''')

    def test_invalid_layout_native_precision_and_failed_creation_leave_no_data(self):
        self.probe('''
boundaries,patches=pair()
bad=dict(boundaries);bad['A-top']=line((0,1,.001),(1,1,0))
rejected(bad,patches)
bad=dict(boundaries);bad['A-top']=line((0,1,0),(1,1,0),3)
rejected(bad,patches)
wrong=dict(patches)
wrong['B']=(('B-top',False),('B-right',True),('B-bottom',False),('shared',True))
rejected(boundaries,wrong)
rejected(boundaries,{'A':patches['A'],'duplicate':patches['A']})
rejected(boundaries,patches,name='x'*64)
bad={k:tuple((x+2**27,y,z) for x,y,z in v) for k,v in boundaries.items()}
rejected(bad,patches)
bad=dict(boundaries);bad['A-left']=((0,0,0),(0,0,0),(0,1,0))
rejected(bad,patches)

# Force the final scene-link operation to fail, after real Blender datablocks
# and selections were prepared. Both new datablocks must be removed.
before=data_ids()
def fail_link(obj):raise RuntimeError('injected scene link failure')
real_bpy=sys.modules['bpy']
sys.modules['bpy']=SimpleNamespace(data=bpy.data,context=SimpleNamespace(
    scene=SimpleNamespace(collection=SimpleNamespace(objects=SimpleNamespace(link=fail_link)))))
try:
    try:build_surface('Failure',boundaries=boundaries,patches=patches)
    except RuntimeError as exc:assert str(exc)=='injected scene link failure'
    else:raise AssertionError('failure injection did not execute')
finally:sys.modules['bpy']=real_bpy
assert data_ids()==before
''')


if __name__ == '__main__':
    unittest.main()

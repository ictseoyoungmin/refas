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


class ProductionSectionSamplesTests(unittest.TestCase):
    def rows(self, points, *, parameters=(0, 1, 4), divisions=(2, 2), mode='CUBIC'):
        sections = [[('LINEAR', ((0, t, z), (1, t, z)))]
                    for t, z in zip(parameters, points)]
        return MODULE._section_rows(sections, parameters, (2,), divisions, (), mode)

    def test_nonuniform_knots_linear_option_and_planar_invariance(self):
        rows, authored, features = self.rows((0, 1, 16))
        self.assertEqual(authored, [0, 2, 4])
        self.assertEqual(features, {'0': 0, '1': 2})
        self.assertEqual([row[0] for row in rows],
                         [(0, 0, 0), (0, .5, .125), (0, 1, 1),
                          (0, 2.5, 8.125), (0, 4, 16)])
        linear, _, _ = self.rows((0, 1, 16), mode='LINEAR')
        self.assertEqual([row[0][2] for row in linear], [0, .5, 1, 8.5, 16])
        planar, _, _ = self.rows((3, 3.5, 11), parameters=(0, .25, 4))
        for row in planar:
            for x, y, z in row:
                self.assertAlmostEqual(z, 2*y+3, places=13)

    def test_cubic_derivative_shared_across_unequal_intervals(self):
        rows, authored, _ = self.rows((0, 1, 16), divisions=(1000, 3000))
        i = authored[1]
        h = .001
        left = (rows[i][0][2]-rows[i-1][0][2])/h
        right = (rows[i+1][0][2]-rows[i][0][2])/h
        self.assertAlmostEqual(left, 4, delta=.007)
        self.assertAlmostEqual(right, 4, delta=.007)
        self.assertAlmostEqual(left, right, delta=.008)
        # Through-knot cubic is not a monotonicity-preserving fit.
        overshoot, _, _ = self.rows((0, 1, 1), divisions=(2, 4))
        self.assertGreater(max(row[0][2] for row in overshoot), 1)

    def test_bad_parameter_and_correspondence_inputs_reject(self):
        profile = [('LINEAR', ((0, 0, 0), (1, 0, 0)))]
        other = [('LINEAR', ((0, 1, 0), (1, 1, 0)))]
        valid = dict(sections=(profile, other), parameters=(0, 1),
                     profile_divisions=(3,), section_divisions=(2,),
                     feature_names=('left', 'right'), interpolation='CUBIC')
        changes = [dict(sections=(profile,)), dict(parameters=(1, 0)),
                   dict(parameters=(0, 0)), dict(parameters=(0, float('nan'))),
                   dict(parameters=(0, float('inf'))), dict(parameters=(False, 1)),
                   dict(parameters=(0, 10**500)), dict(parameters=(-1e308, 1e308)),
                   dict(parameters=(0,)), dict(profile_divisions=(0,)),
                   dict(profile_divisions=(True,)), dict(profile_divisions=(2.5,)),
                   dict(profile_divisions=(1, 2)), dict(section_divisions=()),
                   dict(section_divisions=(0,)), dict(section_divisions=(True,)),
                   dict(section_divisions=(2.5,)), dict(feature_names=('same', 'same')),
                   dict(feature_names=('one',)), dict(feature_names=('left', 'x'*56)),
                   dict(interpolation='SMOOTH'), dict(sections=(profile, other*2)),
                   dict(sections=None), dict(feature_names=None)]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                MODULE._section_rows(**{**valid, **change})


SETUP = '''
import bpy, bmesh, math, struct, sys
from types import SimpleNamespace
from surface_patch import sample_profile, build_surface, build_sections
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

def section_profiles():
    profiles=[]
    for y,x,z,q in [(0,.32,.20,.08),(.3,.45,.35,.05),(1,.60,.25,.10)]:
        a,b,c,d=(0,y,0),(x,y,z),(x+.15,y,q),(1,y,.12)
        profiles.append([('BEZIER',(a,(x*.35,y,.02),(x*.75,y,z*.8),b)),
                         ('LINEAR',(b,c)),
                         ('BEZIER',(c,(x+.21,y,q),(1,y,.14),d))])
    return profiles

def section_args():
    return dict(sections=section_profiles(),parameters=(0,.3,1),
                profile_divisions=(2,7,3),section_divisions=(2,3),
                feature_names=('center','crest','channel','outer'))
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

    def probe(self, code, *, standalone=False):
        script = self.root / (self.id().rsplit('.', 1)[-1]+'.py')
        prefix = ('' if standalone else 'import sys\nsys.path.insert(0, '
                  +repr(str(self.skill / 'scripts/production'))+')\n'+SETUP)
        script.write_text(prefix+code)
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

    def test_sections_keep_uneven_feature_columns_and_caller_context(self):
        self.probe('''
bpy.ops.mesh.primitive_cube_add()
sentinel=bpy.context.object
bpy.ops.object.mode_set(mode='EDIT')
before=context();objects_before=set(bpy.data.objects)
obj=build_sections('Section panel',**section_args())
assert context()==before and len(sentinel.data.vertices)==8
assert set(bpy.data.objects)-objects_before=={obj}
assert obj.type=='MESH' and len(obj.data.vertices)==78 and len(obj.data.polygons)==60
assert not obj.modifiers and not obj.constraints and not obj.animation_data
assert 'crease_edge' not in obj.data.attributes and not any(p.use_smooth for p in obj.data.polygons)
assert [g.name for g in obj.vertex_groups]==['section:0','section:1','section:2',
    'feature:center','feature:crest','feature:channel','feature:outer']
for j,profile in enumerate(section_profiles()):
    expected=sample_profile(profile,divisions=(2,7,3))
    actual=group(obj,'section:'+str(j))
    assert len(actual)==13
    assert [tuple(obj.data.vertices[i].co) for i in actual]==[
        struct.unpack('<3f',struct.pack('<3f',*p)) for p in expected]
    for feature,column in zip(('center','crest','channel','outer'),(0,2,9,12)):
        shared=set(actual)&set(group(obj,'feature:'+feature))
        assert shared=={actual[column]}
    assert obj.data.vertices[actual[2]].co.z>obj.data.vertices[actual[9]].co.z
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
for name in ('crest','channel'):
    rail=group(obj,'feature:'+name)
    assert len(rail)==6
    for a,b in zip(rail,rail[1:]):
        edge=bm.edges.get((bm.verts[a],bm.verts[b]))
        assert edge.is_manifold and edge.is_contiguous
bm.free()
# A coarse native cage remains available without hidden subdivisions.
args=section_args();args.update(profile_divisions=(1,1,1),section_divisions=(1,1),feature_names=())
coarse=build_sections('Coarse',**args)
assert len(coarse.data.vertices)==12 and len(coarse.data.polygons)==6
assert len(group(coarse,'feature:1'))==3 and not coarse.modifiers
assert context()==before
''')

    def test_sections_native_feature_edit_save_reopen_without_helper(self):
        self.probe('''
obj=build_sections('Editable sections',**section_args())
material=bpy.data.materials.new('Retained paint');obj.data.materials.append(material)
uv=obj.data.uv_layers.new(name='Authored UV')
for i,loop in enumerate(uv.data):loop.uv=(i/300,(i%7)/7)
shell=obj.modifiers.new('Native wall','SOLIDIFY');shell.thickness=.005
obj.shape_key_add(name='Basis');key=obj.shape_key_add(name='Crest edit')
for i in group(obj,'feature:crest'):key.data[i].co.z+=.04
key.value=.5
assert not bpy.app.handlers.depsgraph_update_post
bpy.ops.wm.save_as_mainfile(filepath='sections-native.blend')
''')
        self.probe('''
import bpy, importlib.util
assert importlib.util.find_spec('surface_patch') is None
bpy.ops.wm.open_mainfile(filepath='sections-native.blend',load_ui=False,use_scripts=False)
obj=bpy.data.objects['Editable sections'];me=obj.data
assert len(bpy.context.scene.objects)==1
assert [m.type for m in obj.modifiers]==['SOLIDIFY']
assert abs(obj.modifiers[0].thickness-.005)<1e-8
assert me.materials[0].name=='Retained paint'
assert abs(me.uv_layers['Authored UV'].data[17].uv[0]-17/300)<1e-7
assert abs(me.uv_layers['Authored UV'].data[17].uv[1]-(17%7)/7)<1e-7
group_index=obj.vertex_groups['feature:crest'].index
crest={v.index for v in me.vertices if any(g.group==group_index for g in v.groups)}
basis=me.shape_keys.key_blocks['Basis'];key=me.shape_keys.key_blocks['Crest edit']
assert key.value==.5 and len(crest)==6
for i in range(len(me.vertices)):
    delta=key.data[i].co-basis.data[i].co
    assert abs(delta.z-(.04 if i in crest else 0))<1e-7
    assert delta.x==0 and delta.y==0
# The feature edit must also move the evaluated surface, not merely key data.
shell=obj.modifiers[0];shell.show_viewport=False
def evaluated_positions():
    bpy.context.view_layer.update()
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh()
    result=[tuple(v.co) for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return result
key.value=0.0;base_positions=evaluated_positions()
key.value=1.0;edited_positions=evaluated_positions()
for i,(a,b) in enumerate(zip(base_positions,edited_positions)):
    assert a[:2]==b[:2] and abs(b[2]-a[2]-(.04 if i in crest else 0))<1e-7
shell.show_viewport=True
before=[tuple(loop.uv) for loop in me.uv_layers['Authored UV'].data]
bpy.ops.wm.save_as_mainfile(filepath='sections-edited.blend')
bpy.ops.wm.open_mainfile(filepath='sections-edited.blend',load_ui=False,use_scripts=False)
obj=bpy.data.objects['Editable sections']
assert obj.data.shape_keys.key_blocks['Crest edit'].value==1.0
assert before==[tuple(loop.uv) for loop in obj.data.uv_layers['Authored UV'].data]
assert not bpy.app.handlers.depsgraph_update_post
''', standalone=True)

    def test_sections_invalid_and_failed_link_leave_no_native_data(self):
        self.probe('''
bpy.ops.mesh.primitive_cube_add()
bpy.ops.object.mode_set(mode='EDIT')
def reject(args):
    before=data_ids()
    try:build_sections('Rejected',**args)
    except ValueError:pass
    else:raise AssertionError('invalid section surface was accepted')
    assert data_ids()==before
args=section_args();args['parameters']=(0,.3,.3);reject(args)
args=section_args();args['feature_names']=('a','b','c','a');reject(args)
args=section_args();args['sections'][1]=args['sections'][1][:-1];reject(args)
args=section_args();args['sections']=[
    [(kind,tuple((x+2**27,y,z) for x,y,z in points)) for kind,points in row]
    for row in args['sections']];reject(args)
# Correspondence reverses the second row: local quad validation catches its fold.
reject(dict(sections=[[('LINEAR',((0,0,0),(1,0,0)))],
                      [('LINEAR',((1,1,0),(0,1,0)))]],
            parameters=(0,1),profile_divisions=(1,),section_divisions=(1,)))
before=data_ids()
def fail_link(obj):raise RuntimeError('injected section link failure')
real_bpy=sys.modules['bpy']
sys.modules['bpy']=SimpleNamespace(data=bpy.data,context=SimpleNamespace(
    scene=SimpleNamespace(collection=SimpleNamespace(objects=SimpleNamespace(link=fail_link)))))
try:
    try:build_sections('Failure',**section_args())
    except RuntimeError as exc:assert str(exc)=='injected section link failure'
    else:raise AssertionError('failure injection did not execute')
finally:sys.modules['bpy']=real_bpy
assert data_ids()==before
''')


if __name__ == '__main__':
    unittest.main()

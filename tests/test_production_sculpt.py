"""Copied-skill spatial sculpting on native cages, morphs and static delivery."""
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

SETUP = '''
import bpy, math
from mathutils import Vector
import sculpt
from sculpt import sculpt_brush
bpy.ops.wm.read_factory_settings(use_empty=True)

def grid(name='Panel', n=8):
    mesh=bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata([((i/n-.5)*2,(j/n-.5)*2,0) for j in range(n+1) for i in range(n+1)],[],
        [(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(n) for i in range(n)])
    mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return obj

def coordinates(obj):
    return tuple(tuple(v.co) for v in obj.data.vertices)

def context():
    active=bpy.context.view_layer.objects.active
    return (active.as_pointer() if active else None,
            tuple(o.as_pointer() for o in bpy.context.selected_objects),bpy.context.mode)

def finish(obj):
    uv=obj.data.uv_layers.new(name='PreservedUV')
    for i,loop in enumerate(uv.data):loop.uv=(i*.001,i*.002)
    attr=obj.data.attributes.new('SourceID','INT','POINT')
    for i,item in enumerate(attr.data):item.value=i*3
    material=bpy.data.materials.new('Paint');obj.data.materials.append(material)
    group=obj.vertex_groups.new(name='Thickness')
    group.add(list(range(len(obj.data.vertices))),.7,'REPLACE')
    sub=obj.modifiers.new('SmoothCage','SUBSURF');sub.levels=sub.render_levels=1
    shell=obj.modifiers.new('Shell','SOLIDIFY');shell.thickness=.02;shell.vertex_group=group.name

def layers(obj):
    return (obj.as_pointer(),obj.data.as_pointer(),
        tuple(tuple(loop.uv) for loop in obj.data.uv_layers.active.data),
        tuple(item.value for item in obj.data.attributes['SourceID'].data),
        tuple(m.as_pointer() for m in obj.data.materials),
        tuple((m.as_pointer(),m.type) for m in obj.modifiers),
        tuple((g.name,tuple((v.index,entry.weight) for v in obj.data.vertices
            for entry in v.groups if entry.group==g.index)) for g in obj.vertex_groups),
        tuple(tuple(p.vertices) for p in obj.data.polygons))
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for native sculpt brushes')
class ProductionSculptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-native-sculpt-')
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / 'copied-refas'
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def invoke(self, command):
        result = subprocess.run(list(map(str, command)), cwd=self.root, text=True,
            capture_output=True, timeout=120,
            env={**os.environ, 'PYTHONPATH': '', 'PYTHONDONTWRITEBYTECODE': '1'})
        if result.returncode:
            logs = sorted(self.root.rglob('blender.log'), key=lambda p: p.stat().st_mtime)
            self.fail(result.stdout[-5000:]+result.stderr[-3000:]
                      +(logs[-1].read_text()[-5000:] if logs else ''))
        return result

    def probe(self, code):
        script = self.root / (self.id().rsplit('.', 1)[-1]+'.py')
        script.write_text('import sys\nsys.path.insert(0,'+repr(str(self.skill / 'scripts/production'))+')\n'
                          +SETUP+code)
        self.invoke([BLENDER, '-b', '--factory-startup', '--threads', '2',
                     '--python-exit-code', '1', '--python', script])

    def cli(self, command, *args):
        return json.loads(self.invoke([sys.executable, '-B', self.skill / 'scripts/produce.py',
                                      command, *args]).stdout)

    def test_whole_then_local_grab_draw_flatten_keep_native_layers_and_context(self):
        self.probe('''
obj=grid();finish(obj)
sentinel=grid('Other');sentinel.location.x=4
bpy.context.view_layer.objects.active=sentinel;sentinel.select_set(True)
before_layers=layers(obj);before_context=context();other=coordinates(sentinel)
base=coordinates(obj)
report=sculpt_brush(obj,operation='GRAB',center=(0,0,0),radius=2,delta=(0,0,.3))
assert report['changedVertices']==81 and abs(obj.data.vertices[40].co.z-.3)<1e-6
assert 0 < obj.data.vertices[0].co.z < .1
whole=coordinates(obj)
report=sculpt_brush(obj,operation='DRAW',center=(0,0,.3),radius=.4,direction=(1,0,0),strength=.05)
assert 1 < report['changedVertices'] < 15 and abs(obj.data.vertices[40].co.x-.05)<1e-6
assert coordinates(obj)[0]==whole[0] and coordinates(obj)[80]==whole[80]
report=sculpt_brush(obj,operation='FLATTEN',center=(0,0,.1),radius=10,direction=(0,0,2),strength=1,mask=[40])
assert .1 <= obj.data.vertices[40].co.z < .101
assert all(coordinates(obj)[i]==whole[i] for i in (0,1,7,8,72,80))
assert layers(obj)==before_layers and context()==before_context and coordinates(sentinel)==other
assert report['changedVertices']==1 and report['maxStorageError']<1e-5
''')

    def test_parented_nonuniform_and_sheared_world_transform_and_inflate_normal(self):
        self.probe('''
obj=grid();finish(obj)
parent=bpy.data.objects.new('Assembly',None);bpy.context.collection.objects.link(parent)
parent.location=(2,-3,1);parent.rotation_euler=(.2,.4,-.3);parent.scale=(2,.7,1.2)
obj.parent=parent;obj.location=(.3,.2,-.1);obj.rotation_euler=(.3,-.1,.2);obj.scale=(.4,1.7,.9)
bpy.context.view_layer.update();matrix=obj.matrix_world.copy();before_layers=layers(obj)
center=matrix@obj.data.vertices[40].co;desired=Vector((.06,.03,-.02))
sculpt_brush(obj,operation='GRAB',center=tuple(center),radius=.8,delta=tuple(desired),mask=[40])
actual=obj.matrix_world@obj.data.vertices[40].co
assert (actual-center-desired).length<2e-6,(actual,center,desired)
# Restore a planar basis and observe its geometric world normal independently.
obj.data.vertices[40].co=(0,0,0);obj.data.update();bpy.context.view_layer.update()
a,b,c=[matrix@obj.data.vertices[i].co for i in (0,1,9)]
normal=(b-a).cross(c-a).normalized();center=matrix@obj.data.vertices[40].co
report=sculpt_brush(obj,operation='INFLATE',center=tuple(center),radius=.8,strength=.04,mask=[40])
assert (obj.matrix_world@obj.data.vertices[40].co-center-normal*.04).length<2e-6
assert obj.parent is parent and obj.matrix_world==matrix and layers(obj)==before_layers
# An unapplied mirrored parent must not turn positive inflation inward.
obj.data.vertices[40].co=(0,0,0);parent.scale.x=-2
obj.data.update();bpy.context.view_layer.update();matrix=obj.matrix_world.copy()
assert matrix.to_3x3().determinant()<0
normal=(matrix.to_3x3().inverted().transposed()@Vector((0,0,1))).normalized()
center=matrix@obj.data.vertices[40].co
sculpt_brush(obj,operation='INFLATE',center=tuple(center),radius=.8,strength=.04,mask=[40])
assert (obj.matrix_world@obj.data.vertices[40].co-center-normal*.04).length<2e-6
assert obj.parent is parent and obj.matrix_world==matrix and layers(obj)==before_layers
''')

    def test_smoothing_soft_mask_and_pinned_open_boundary(self):
        self.probe('''
obj=grid();obj.data.vertices[40].co.z=.4;obj.data.update()
mask=obj.vertex_groups.new(name='Soft');mask.add([40],.5,'REPLACE')
before=coordinates(obj)
sculpt_brush(obj,operation='SMOOTH',center=(0,0,.4),radius=2,strength=1,mask='Soft')
assert abs(obj.data.vertices[40].co.z-.2)<1e-7
assert all(coordinates(obj)[i]==before[i] for i in range(81) if i!=40)
before=coordinates(obj)
energy=lambda:sum((obj.data.vertices[e.vertices[0]].co.z-obj.data.vertices[e.vertices[1]].co.z)**2 for e in obj.data.edges)
original_energy=energy()
sculpt_brush(obj,operation='SMOOTH',center=(0,0,0),radius=100,strength=.5,iterations=4,pin_boundary=True)
assert energy()<original_energy*.15
boundary=[j*9+i for j in range(9) for i in range(9) if i in (0,8) or j in (0,8)]
assert all(coordinates(obj)[i]==before[i] for i in boundary)
report=sculpt_brush(obj,operation='GRAB',center=(20,0,0),radius=1,delta=(0,0,1))
assert report['status']=='no-effect' and report['changedVertices']==0
before=coordinates(obj)
report=sculpt_brush(obj,operation='GRAB',center=(1,0,0),radius=1,delta=(1e-12,0,0),mask=[44])
assert report['status']=='no-effect' and report['maxDisplacement']==0 and report['maxRequestedDisplacement']>0
assert coordinates(obj)==before
''')

    def test_symmetry_blends_overlap_without_double_strength_or_centerline_drift(self):
        self.probe('''
obj=grid()
sculpt_brush(obj,operation='GRAB',center=(0,0,0),radius=2,delta=(0,0,.1),symmetry=('X','Y'))
assert abs(obj.data.vertices[40].co.z-.1)<1e-7
assert abs(obj.data.vertices[44].co.z-.05)<1e-7
obj=grid('Symmetric')
sculpt_brush(obj,operation='GRAB',center=(.3,0,0),radius=1,delta=(.1,0,.1),symmetry=('X',))
for j in range(9):
    for i in range(9):
        a,b=obj.data.vertices[j*9+i].co,obj.data.vertices[j*9+8-i].co
        assert abs(a.x+b.x)<1e-7 and abs(a.y-b.y)<1e-7 and abs(a.z-b.z)<1e-7
assert obj.data.vertices[40].co.x==0 and 0<obj.data.vertices[40].co.z<.1
# Symmetry uses the declared world plane, including a translated origin.
obj=grid('Offset');obj.location.x=3;bpy.context.view_layer.update()
sculpt_brush(obj,operation='DRAW',center=(3,0,0),radius=2,direction=(0,0,1),strength=.1,
             symmetry=('X',),symmetry_origin=(3,0,0))
assert abs(obj.data.vertices[40].co.z-.1)<1e-7
# Overlap also remains smooth at the symmetry plane instead of taking a
# pointwise maximum that creates a crease in a nominally smooth brush.
data=bpy.data.meshes.new('SeamProbe');data.from_pydata([(-.001,0,0),(0,0,0),(.001,0,0)],[(0,1),(1,2)],[])
probe=bpy.data.objects.new('SeamProbe',data);bpy.context.collection.objects.link(probe)
sculpt_brush(probe,operation='GRAB',center=(.3,0,0),radius=1,delta=(0,0,.1),symmetry=('X',))
assert abs(data.vertices[0].co.z-data.vertices[1].co.z)<5e-7
assert data.vertices[0].co.z==data.vertices[2].co.z
''')

    def test_shape_key_offsets_and_data_survive_edit_save_and_reopen(self):
        self.probe('''
obj=grid();finish(obj)
base=obj.shape_key_add(name='Basis');first=obj.shape_key_add(name='Bend');second=obj.shape_key_add(name='Detail')
for v in first.data:v.co.z+=.04*v.co.x
for v in second.data:v.co.y+=.03*v.co.x
second.relative_key=first;first.value=.4;second.value=.2;obj.active_shape_key_index=1
before_layers=layers(obj);before=[tuple(tuple(v.co) for v in k.data) for k in obj.data.shape_keys.key_blocks]
report=sculpt_brush(obj,operation='GRAB',center=(0,0,0),radius=1.5,delta=(.02,0,.03),mask=list(range(20,61)))
after=[tuple(tuple(v.co) for v in k.data) for k in obj.data.shape_keys.key_blocks]
for i in range(81):
    move=Vector(after[0][i])-Vector(before[0][i])
    for k in range(1,3):assert (Vector(after[k][i])-Vector(before[k][i])-move).length<1e-7
assert report['shapeKeys']==3 and layers(obj)==before_layers and second.relative_key==first
assert obj.active_shape_key_index==1 and abs(first.value-.4)<1e-7
path='''+repr(str(self.root / 'sculpt-keys.blend'))+'''
bpy.ops.wm.save_as_mainfile(filepath=path)
bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
obj=bpy.data.objects['Panel'];keys=obj.data.shape_keys.key_blocks
assert [tuple(tuple(v.co) for v in k.data) for k in keys]==after
assert keys['Detail'].relative_key==keys['Bend']
sculpt_brush(obj,operation='DRAW',center=(0,0,0),radius=.5,direction=(0,0,1),strength=.01)
assert [m.type for m in obj.modifiers]==['SUBSURF','SOLIDIFY']
# Absolute keys keep the same authored offsets and native timing data too.
obj.data.shape_keys.use_relative=False
old=[tuple(tuple(v.co) for v in k.data) for k in keys];frames=[k.frame for k in keys]
report=sculpt_brush(obj,operation='GRAB',center=(0,0,0),radius=2,delta=(0,.02,0))
assert report['maxMorphOffsetError']<1e-6 and [k.frame for k in keys]==frames
for i in range(81):
    for k in range(1,3):
        assert ((keys[k].data[i].co-keys[0].data[i].co)-(Vector(old[k][i])-Vector(old[0][i]))).length<1e-7
''')

    def test_invalid_input_precision_and_late_failure_restore_cage_keys_and_context(self):
        self.probe('''
obj=grid();finish(obj);obj.shape_key_add(name='Basis');key=obj.shape_key_add(name='Morph')
for v in key.data:v.co.z+=.03
def state():return (coordinates(obj),tuple(tuple(tuple(v.co) for v in k.data) for k in obj.data.shape_keys.key_blocks),layers(obj),context())
base=dict(operation='GRAB',center=(0,0,0),radius=1,delta=(0,0,.1))
for change in ({'radius':0},{'radius':float('nan')},{'delta':(0,float('inf'),0)},
               {'mask':[999]},{'mask':'Missing'},{'symmetry':('X','X')},{'tolerance':False},
               {'operation':'SMOOTH','delta':None,'strength':2},{'iterations':2}):
    before=state()
    try:sculpt_brush(obj,**{**base,**change})
    except ValueError:pass
    else:raise AssertionError(change)
    assert state()==before
# Fail AFTER the successful native update, while both basis and keys are modified.
before=state();real_refresh=sculpt._refresh;calls=0
def failed_refresh(target):
    global calls
    calls+=1;real_refresh(target)
    if calls==1:raise RuntimeError('injected final dependency update failure')
sculpt._refresh=failed_refresh
try:
    try:sculpt_brush(obj,**base)
    except RuntimeError as error:assert 'injected' in str(error)
    else:raise AssertionError('late failure was accepted')
finally:sculpt._refresh=real_refresh
assert state()==before
# A small requested move at a large LOCAL coordinate cannot be rounded away.
for v in obj.data.vertices:v.co.x+=1e7
for k in obj.data.shape_keys.key_blocks:
    for v in k.data:v.co.x+=1e7
obj.data.update();before=state()
try:sculpt_brush(obj,operation='GRAB',center=(1e7,0,0),radius=100,delta=(.01,0,0),tolerance=1e-5)
except ValueError:pass
else:raise AssertionError('unrepresentable displacement was accepted')
assert state()==before
# A shared source or edit-mode caller is not silently converted or switched.
copy=obj.copy();bpy.context.collection.objects.link(copy);before=state()
try:sculpt_brush(obj,**base)
except ValueError:pass
else:raise AssertionError('shared mesh accepted')
assert state()==before;bpy.data.objects.remove(copy,do_unlink=True)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
before=context()
try:sculpt_brush(obj,**base)
except ValueError:pass
else:raise AssertionError('edit mode accepted')
assert context()==before
bpy.ops.object.mode_set(mode='OBJECT')
''')

    def test_copied_native_continuation_delivery_and_exact_restore(self):
        project = self.root / 'project'
        self.cli('init', '--root', project, '--name', 'native-cage-sculpt')
        create = self.root / 'create.py'
        create.write_text(SETUP+'''
obj=grid();finish(obj)
parent=bpy.data.objects.new('Assembly',None);bpy.context.collection.objects.link(parent)
parent.location=(.5,.2,.1);obj.parent=parent;bpy.context.view_layer.update()
sculpt_brush(obj,operation='GRAB',center=(.5,.2,.1),radius=2,delta=(0,0,.2))
other=grid('Unchanged');other.location.x=4
''')
        flags = ['--root', project, '--outputs', 'native', '--views', '', '--blender', BLENDER]
        initial = self.cli('run', *flags, '--script', create, '--intent', 'sculpt the connected primary envelope')
        initial_bytes = Path(initial['outputs']['blend']).read_bytes()
        edit = self.root / 'edit.py'
        edit.write_text('''import bpy
from sculpt import sculpt_brush
obj=bpy.data.objects['Panel']
sculpt_brush(obj,operation='DRAW',center=(.5,.2,.3),radius=.5,direction=(0,0,1),strength=.05)
assert obj.parent.name=='Assembly' and [m.type for m in obj.modifiers]==['SUBSURF','SOLIDIFY']
''')
        revised = self.cli('run', *flags, '--script', edit, '--intent', 'add a local form while retaining the cage',
                           '--protect-object', 'Unchanged')
        delivered = self.cli('deliver', '--root', project, '--views', '', '--blender', BLENDER)
        self.probe('''
def sample(path,native):
    if native:bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update();obj=bpy.data.objects['Panel']
    if native:
        assert len(obj.data.vertices)==81 and obj.parent.name=='Assembly'
        assert [m.type for m in obj.modifiers]==['SUBSURF','SOLIDIFY'] and obj.data.uv_layers.get('PreservedUV')
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    try:return sorted({tuple(round(v,4) for v in evaluated.matrix_world@vertex.co) for vertex in mesh.vertices})
    finally:evaluated.to_mesh_clear()
before=sample('''+repr(revised['outputs']['blend'])+''',True)
after=sample('''+repr(delivered['outputs']['glb'])+''',False)
assert before==after,(len(before),len(after))
''')
        restored = self.cli('restore', '--root', project, '--revision', initial['head'])
        self.assertEqual(Path(restored['outputs']['blend']).read_bytes(), initial_bytes)
        self.assertTrue(self.cli('verify', '--root', project)['ok'])


if __name__ == '__main__':
    unittest.main()

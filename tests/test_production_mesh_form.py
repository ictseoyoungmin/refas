"""Actual native cutting/union and recovery from a separately copied skill."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / 'skills/refas'
BLENDER = os.environ.get('BLENDER_EXE') or shutil.which('blender')

SETUP = '''
import bpy, bmesh, math, json, struct
from pathlib import Path
from mathutils import Matrix, Vector, Euler
import mesh_form
from mesh_form import boolean_form, engrave_path
from surface_mount import _surface
bpy.ops.wm.read_factory_settings(use_empty=True)

def box(name, lo=(-1,-.7,-.5), hi=(1,.7,0)):
    vertices=[(x,y,z) for z in (lo[2],hi[2]) for x,y in
              [(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])]]
    data=bpy.data.meshes.new(name+'Mesh')
    data.from_pydata(vertices,[],[(3,2,1,0),(4,5,6,7),(0,1,5,4),
                                  (1,2,6,5),(2,3,7,6),(3,0,4,7)])
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    return obj

def context():
    active=bpy.context.view_layer.objects.active
    return (active.as_pointer() if active else None,
            tuple(o.as_pointer() for o in bpy.context.selected_objects),bpy.context.mode)

def ids():
    return (tuple(o.as_pointer() for o in bpy.data.objects),
            tuple(m.as_pointer() for m in bpy.data.meshes),
            tuple(c.as_pointer() for c in bpy.data.curves),context())

def cage(obj):
    return (obj.data.as_pointer(),tuple(tuple(v.co) for v in obj.data.vertices),
            tuple(tuple(p.vertices) for p in obj.data.polygons),
            tuple((uv.name,tuple(tuple(v.uv) for v in uv.data)) for uv in obj.data.uv_layers),
            tuple(m.as_pointer() if m else None for m in obj.data.materials),
            obj.parent.as_pointer() if obj.parent else None,
            tuple(tuple(row) for row in obj.matrix_world))

def features(obj):
    return [(m.as_pointer(),m.name,m.type,m.show_viewport,m.show_render,
             getattr(m,'operation',None),getattr(m,'object',None),m.is_active)
            for m in obj.modifiers]

def floor_z(obj,x=0,y=0):
    tree,offset,_,_=_surface(obj)
    point,normal,_,_=tree.ray_cast(Vector((x,y,1))-offset,Vector((0,0,-1)),3)
    assert point is not None
    return (point+offset).z

def rejected(fn,target,*args,**kwargs):
    bpy.context.view_layer.update()
    before=(ids(),cage(target),features(target))
    try:fn(target,*args,**kwargs)
    except ValueError:pass
    else:raise AssertionError('invalid feature was accepted')
    assert (ids(),cage(target),features(target))==before
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for native form regressions')
class ProductionMeshFormTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-mesh-form-')
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / 'copied-refas'
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def probe(self, code):
        script = self.root / (self.id().rsplit('.', 1)[-1] + '.py')
        script.write_text('import sys\nsys.path.insert(0, ' + repr(str(self.skill / 'scripts/production'))
                          + ')\n' + SETUP + code)
        result = subprocess.run([BLENDER, '-b', '--factory-startup', '--threads', '2',
                                 '--python-exit-code', '1', '--python', str(script)],
                                cwd=self.root, capture_output=True, text=True, timeout=120,
                                env={**os.environ, 'PYTHONPATH':'', 'PYTHONDONTWRITEBYTECODE':'1'})
        self.assertEqual(result.returncode, 0, result.stdout[-5500:] + result.stderr[-5500:])

    def test_recess_preserves_cage_uv_finish_and_unrelated_edit_context(self):
        self.probe('''
host=box('Sculpted blank')
uv=host.data.uv_layers.new(name='Authored UV')
for i,point in enumerate(uv.data):point.uv=(i*.01,i*.02)
paint=bpy.data.materials.new('Paint');host.data.materials.append(paint)
bevel=host.modifiers.new('Edge finish','BEVEL');bevel.width=.015;bevel.segments=2
normal=host.modifiers.new('Normals','WEIGHTED_NORMAL')
cutter=box('Prepared pocket',(-.35,-.25,-.2),(.35,.25,.2))
neighbor=box('Unrelated');neighbor.location.x=5
bpy.context.view_layer.objects.active=neighbor;neighbor.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.context.view_layer.update()
before=(cage(host),cage(neighbor),context())
result=boolean_form(host,'Pocket',operand=cutter)
assert (cage(host),cage(neighbor),context())==before
assert [m.name for m in host.modifiers]==['Pocket','Edge finish','Normals']
assert host.modifiers[0].object is cutter and host.modifiers[0].solver=='EXACT'
assert cutter.hide_render and cutter['refas_role']=='construction' and cutter.display_type=='WIRE'
assert abs(floor_z(host)+.2)<2e-6 and abs(floor_z(host,.7))<2e-6
assert result['after']['volume'] < result['before']['volume']-.06
modifier=host.modifiers['Pocket'];operand_id=cutter.as_pointer()
for vertex in cutter.data.vertices:
    if vertex.co.z<0:vertex.co.z=-.3
cutter.data.update()
revised=boolean_form(host,'Pocket',operand=cutter)
assert revised['updated'] and cutter.as_pointer()==operand_id and host.modifiers['Pocket']==modifier
assert abs(floor_z(host)+.3)<2e-6 and cage(host)==before[0]
assert host.modifiers['Edge finish']==bevel and host.modifiers['Normals']==normal
''')

    def test_real_union_intersection_and_disconnected_union_rollback(self):
        self.probe('''
host=box('Base',(-1,-1,-1),(1,1,1))
part=box('Added neck',(.5,-.4,-.4),(1.5,.4,.4))
result=boolean_form(host,'Fuse',operand=part,operation='UNION')
assert result['after']['components']==1 and abs(result['after']['volume']-8.32)<1e-5
assert len(host.data.vertices)==8 and len(part.data.vertices)==8
# Same native feature changes its operation; its operand is not duplicated.
mod=host.modifiers['Fuse']
intersect=boolean_form(host,'Fuse',operand=part,operation='INTERSECT')
assert host.modifiers['Fuse']==mod and abs(intersect['after']['volume']-.32)<1e-5
assert intersect['operation']=='INTERSECT'
isolated=box('Disconnected',(4,-.4,-.4),(5,.4,.4))
before=(dict(isolated.items()),isolated.hide_render,isolated.display_type)
rejected(boolean_form,host,'Invalid union',operand=isolated,operation='UNION')
assert (dict(isolated.items()),isolated.hide_render,isolated.display_type)==before
''')

    def test_parented_scaled_rotated_solids_and_owned_dependency_rejection(self):
        self.probe('''
parent=bpy.data.objects.new('Assembly',None);bpy.context.collection.objects.link(parent)
parent.matrix_world=Matrix.Translation((3,-2,1)) @ Euler((.2,.3,-.4)).to_matrix().to_4x4()
host=box('Host');host.parent=parent;host.scale=(1.4,.7,1.2)
cutter=box('Cutter',(-.3,-.2,-.2),(.3,.2,.2));cutter.parent=host
bpy.context.view_layer.update()
before=(cage(host),cage(cutter))
result=boolean_form(host,'Cut',operand=cutter)
assert (cage(host),cage(cutter))==before
assert abs(result['before']['volume']-1.4*.7*1.2*1.4)<1e-5
assert result['after']['volume']<result['before']['volume']
other=box('Other');other.location.x=8
rejected(boolean_form,other,'Steal',operand=cutter)
rejected(boolean_form,host,'Second owner',operand=cutter)
# A generated operand must not depend back on the target geometry.
loop=box('Loop',(-.2,-.2,-.2),(.2,.2,.2))
wrap=loop.modifiers.new('Target dependent','SHRINKWRAP');wrap.target=host
rejected(boolean_form,host,'Cycle',operand=loop)
''')

    def test_modifier_reorder_is_explicit_and_failed_revision_restores_order(self):
        self.probe('''
host=box('Host')
bevel=host.modifiers.new('Bevel','BEVEL');bevel.width=.015
normal=host.modifiers.new('Normals','WEIGHTED_NORMAL')
cutter=box('Cutter',(-.3,-.2,-.2),(.3,.2,.2))
boolean_form(host,'Pocket',operand=cutter)
modifier=host.modifiers['Pocket']
boolean_form(host,'Pocket',operand=cutter,before='Normals')
assert [m.name for m in host.modifiers]==['Bevel','Pocket','Normals']
# A real invalid union fails after moving the feature and evaluating it.
cutter.location.x=5
bpy.context.view_layer.update()
rejected(boolean_form,host,'Pocket',operand=cutter,operation='UNION',before='Bevel')
assert modifier.operation=='DIFFERENCE' and modifier.object is cutter
assert [m.name for m in host.modifiers]==['Bevel','Pocket','Normals']
rejected(boolean_form,host,'Pocket',operand=cutter,before='Missing')
rejected(boolean_form,host,'Bevel',operand=cutter)
''')

    def test_world_path_real_channel_revision_and_failed_path_recovery(self):
        self.probe('''
host=box('Panel')
parent=bpy.data.objects.new('Panel parent',None);bpy.context.collection.objects.link(parent)
parent.location=(2,1,.5);host.parent=parent
bpy.context.view_layer.update()
before=cage(host)
points=[(1.4,1,.54),(2,1.12,.54),(2.6,1,.54)]
first=engrave_path(host,'Engraved channel',points=points,radius=.12)
cutter=bpy.data.objects[first['operand']]
assert cutter.parent==host and cutter.hide_render and cutter.type=='MESH'
assert len(bpy.data.curves)==0 and cage(host)==before
assert abs(floor_z(host,2,1.12)-.42)<.005
identity=(cutter.as_pointer(),host.modifiers['Engraved channel'].as_pointer())
second=engrave_path(host,'Engraved channel',points=points,radius=.16)
assert (cutter.as_pointer(),host.modifiers['Engraved channel'].as_pointer())==identity
assert abs(floor_z(host,2,1.12)-.38)<.006
old_mesh=cutter.data
rejected(engrave_path,host,'Engraved channel',points=[(8,8,8),(9,8,8)],radius=.1)
assert cutter.data==old_mesh and abs(floor_z(host,2,1.12)-.38)<.006
for kwargs in [dict(points=[]),dict(points=[(0,0,0),(0,0,0)]),dict(radius=-1),
               dict(radius=float('nan')),dict(resolution=True),dict(resolution=9)]:
    rejected(engrave_path,host,'Bad path',**{**dict(points=points,radius=.12),**kwargs})
assert len(bpy.data.curves)==0
''')

    def test_native_reopen_and_actual_export_excludes_construction_cutter(self):
        self.probe('''
host=box('Asset')
engrave_path(host,'Groove',points=[(-.6,0,.04),(.6,0,.04)],radius=.12)
cutter=host.modifiers['Groove'].object
bpy.ops.wm.save_as_mainfile(filepath='form-native.blend')
bpy.ops.wm.open_mainfile(filepath='form-native.blend',load_ui=False,use_scripts=False)
host=bpy.data.objects['Asset'];cutter=host.modifiers['Groove'].object
assert cutter.parent==host and cutter['refas_form_target']==host
assert abs(floor_z(host)+.08)<.003
from blender_worker import export_scene
out=Path('form-export');out.mkdir(exist_ok=True)
export_scene(out)
data=(out/'asset.glb').read_bytes();length,kind=struct.unpack_from('<II',data,12)
document=json.loads(data[20:20+length].decode().strip())
assert len(document['meshes'])==1 and all(n.get('name')!=cutter.name for n in document['nodes'])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out/'asset.glb'))
reopened=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(reopened)==1 and abs(floor_z(reopened[0])+.08)<.003
''')

    def test_small_engraving_and_cyclic_path_are_real_closed_details(self):
        self.probe('''
host=box('Large panel')
# A visible local detail can have much less than a millionth of the host's
# volume. It must not be rejected by an arbitrary whole-body volume budget.
result=engrave_path(host,'Fine engraving',points=[(-.6,0,.0001),(.6,0,.0001)],radius=.0003)
assert -.00021 < floor_z(host) < -.00019
assert 0 < result['before']['volume']-result['after']['volume'] < 2e-7
ring=engrave_path(host,'Closed motif',points=[(-.4,-.35,.03),(.4,-.35,.03),
                  (.4,.35,.03),(-.4,.35,.03)],radius=.08,cyclic=True)
assert ring['path']['cyclic'] and ring['after']['components']==1
assert -.051 < floor_z(host,.4,0) < -.049
assert len(bpy.data.curves)==0
''')


if __name__ == '__main__':
    unittest.main()

"""Exact bounded cage edits, copied-skill continuation and finite guard rollback."""
from __future__ import annotations

import importlib.util
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
SPEC = importlib.util.spec_from_file_location('local_edit', SKILL / 'scripts/production/local_edit.py')
LOCAL_EDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LOCAL_EDIT)


class DisplacementKernelTests(unittest.TestCase):
    def test_full_graph_fixed_neighbor_rows_give_biharmonic_not_harmonic_solution(self):
        points = [(float(i), 0., 0.) for i in range(5)]
        delta, _, residual = LOCAL_EDIT._solve(points, [(i, i+1) for i in range(4)],
                                              {0: (0., 0., 0.), 2: (0., 0., 1.), 4: (0., 0., 0.)})
        self.assertAlmostEqual(delta[1][2], 4/7, places=12)
        self.assertAlmostEqual(delta[3][2], 4/7, places=12)
        self.assertLess(max(residual), 1e-10)

    def test_rest_pose_and_uniform_translation_are_reproduced(self):
        points = [(0., 0., 0.), (.3, .1, .2), (.8, -.1, .3), (1., .1, 0.)]
        edges = [(0, 1), (1, 2), (2, 3)]
        zero, steps, residual = LOCAL_EDIT._solve(points, edges, {0: (0., 0., 0.), 3: (0., 0., 0.)})
        self.assertEqual(zero, [[0., 0., 0.]]*4)
        self.assertEqual(steps, [0, 0, 0])
        self.assertEqual(residual, [0., 0., 0.])
        translated, _, _ = LOCAL_EDIT._solve(points, edges, {0: (.02, -.01, .03), 3: (.02, -.01, .03)})
        for point in translated:
            for actual, expected in zip(point, (.02, -.01, .03)):
                self.assertAlmostEqual(actual, expected, places=12)

    def test_unanchored_component_and_degenerate_edge_are_rejected(self):
        points = [(0., 0., 0.), (1., 0., 0.), (2., 0., 0.), (3., 0., 0.)]
        with self.assertRaisesRegex(ValueError, 'Dirichlet anchor'):
            LOCAL_EDIT._solve(points, [(0, 1), (2, 3)], {0: (0., 0., .1)})
        with self.assertRaisesRegex(ValueError, 'positive lengths'):
            LOCAL_EDIT._solve([points[0], points[0]], [(0, 1)], {0: (0., 0., .1)})


SETUP = '''
import bpy, math
from mathutils import Matrix, Euler
import local_edit
from local_edit import edit_region
bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh(name,vertices,faces):
    data=bpy.data.meshes.new(name+'Mesh');data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return obj

def grid(name='Patch',n=12):
    vertices=[(.4*(i/n-.5),.4*(j/n-.5),.2+.06*(i/n-.5)**2+.008*math.sin(j/n*3))
              for j in range(n+1) for i in range(n+1)]
    faces=[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i)
           for j in range(n) for i in range(n)]
    obj=mesh(name,vertices,faces)
    obj.vertex_groups.new(name='Region').add([j*(n+1)+i for j in range(1,n) for i in range(1,n)],1.,'REPLACE')
    return obj

def obstacle():
    return mesh('Obstacle',[(-.5,-.5,.1),(.5,-.5,.1),(.5,.5,.1),(-.5,.5,.1)],[(0,1,2,3)])

def world(obj):
    matrix=tuple(tuple(r) for r in obj.matrix_world)
    return [tuple(math.fsum((matrix[i][3],*(matrix[i][j]*v.co[j] for j in range(3)))) for i in range(3))
            for v in obj.data.vertices]

def targets(obj):
    points=world(obj)
    return {56:tuple(a+b for a,b in zip(points[56],(.001,0,.006))),
            112:tuple(a+b for a,b in zip(points[112],(-.001,0,-.004)))}

def arguments(obj):
    return dict(region='Region',handles=targets(obj),max_displacement=.02)

def evaluated(obj):
    bpy.context.view_layer.update();e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());data=e.to_mesh()
    try:return tuple(tuple(v.co) for v in data.vertices),tuple(tuple(p.vertices) for p in data.polygons)
    finally:e.to_mesh_clear()

def data_state(obj,coordinates=True):
    fields={'FLOAT':'value','INT':'value','INT8':'value','INT32_2D':'value','BOOLEAN':'value','FLOAT_VECTOR':'vector',
            'FLOAT2':'vector','FLOAT_COLOR':'color','BYTE_COLOR':'color'}
    attributes=[]
    for a in obj.data.attributes:
        if not coordinates and a.name=='position':continue
        values=[]
        for item in a.data:
            v=getattr(item,fields[a.data_type])
            values.append(tuple(v) if a.data_type in ('INT32_2D','FLOAT_VECTOR','FLOAT2','FLOAT_COLOR','BYTE_COLOR') else v)
        attributes.append((a.name,a.domain,a.data_type,tuple(values)))
    return (obj.data.as_pointer(),tuple(tuple(v.co) for v in obj.data.vertices) if coordinates else None,
            tuple((tuple((g.group,g.weight) for g in v.groups),v.select,v.hide) for v in obj.data.vertices),
            tuple((tuple(e.vertices),e.use_seam,e.select,e.hide) for e in obj.data.edges),
            tuple((tuple(p.vertices),p.material_index,p.use_smooth,p.select,p.hide) for p in obj.data.polygons),
            tuple(attributes),tuple((g.name,g.lock_weight) for g in obj.vertex_groups),
            tuple((s.link,s.material) for s in obj.material_slots),obj.active_material_index,
            tuple(tuple(r) for r in obj.matrix_world))

def state(obj):
    bpy.context.view_layer.update();mods=[]
    for m in obj.modifiers:
        values=[]
        for p in m.bl_rna.properties:
            if p.is_readonly:continue
            value=getattr(m,p.identifier)
            if hasattr(value,'as_pointer'):value=value.as_pointer()
            elif getattr(p,'is_array',False):value=tuple(value)
            values.append((p.identifier,value))
        mods.append((m.as_pointer(),tuple(values)))
    active=bpy.context.view_layer.objects.active
    return (data_state(obj),tuple(mods),evaluated(obj),
            obj.modifiers.active.as_pointer() if obj.modifiers.active else None,
            active.as_pointer() if active else None,sorted(o.name for o in bpy.context.selected_objects),
            bpy.context.mode,tuple(bpy.context.tool_settings.mesh_select_mode),
            sorted(o.name for o in bpy.data.objects),sorted(m.name for m in bpy.data.meshes))

def reject(obj,match=None,**overrides):
    before=state(obj)
    try:edit_region(obj,**{**arguments(obj),**overrides})
    except ValueError as error:
        if match:assert match in str(error),str(error)
    else:raise AssertionError('invalid local edit accepted: '+str(overrides))
    assert state(obj)==before,'rejected local edit changed original state'
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for local-edit regressions')
class ProductionLocalEditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-local-edit-')
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / 'copied-refas'
        shutil.copytree(SKILL, cls.skill, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def invoke(self, args):
        result = subprocess.run(list(map(str, args)), cwd=self.root, capture_output=True,
                                text=True, timeout=120,
                                env={**os.environ, 'PYTHONPATH': '', 'PYTHONDONTWRITEBYTECODE': '1'})
        if result.returncode:
            logs = sorted(self.root.rglob('blender.log'), key=lambda p: p.stat().st_mtime)
            self.fail(result.stdout[-5000:] + result.stderr[-5000:]
                      + (logs[-1].read_text()[-5000:] if logs else ''))
        return result

    def probe(self, code):
        script = self.root / (self.id().rsplit('.', 1)[-1] + '.py')
        script.write_text('import sys\nsys.path.insert(0, ' + repr(str(self.skill / 'scripts/production'))
                          + ')\n' + SETUP + code)
        return self.invoke([BLENDER, '-b', '--factory-startup', '--threads', '2',
                            '--python-exit-code', '1', '--python', script])

    def cli(self, command, *args):
        return json.loads(self.invoke([sys.executable, '-B', self.skill / 'scripts/produce.py',
                                       command, *args]).stdout)

    def test_curved_joint_edit_preserves_data_exterior_context_and_exact_noop(self):
        self.probe('''
obj=grid();neighbor=grid('Neighbor');neighbor.location.x=2
for name in ('Cloth','Gold'):obj.data.materials.append(bpy.data.materials.new(name))
for face in obj.data.polygons:face.material_index=face.index%2;face.use_smooth=True
uv=obj.data.uv_layers.new(name='ExistingUV')
for loop in obj.data.loops:uv.data[loop.index].uv=(loop.index*.001,loop.vertex_index*.002)
color=obj.data.color_attributes.new(name='ExistingColor',type='BYTE_COLOR',domain='CORNER')
for item in color.data:item.color=(.2,.4,.6,1)
attr=obj.data.attributes.new(name='ExistingPoint',type='FLOAT',domain='POINT')
for i,item in enumerate(attr.data):item.value=i*.003
crease=obj.data.attributes.new(name='crease_edge',type='FLOAT',domain='EDGE')
for item in crease.data:item.value=.6
obj.data.vertices[7].hide=True;obj.data.edges[4].use_seam=True
obj.select_set(True);neighbor.select_set(True);bpy.context.view_layer.objects.active=neighbor
bpy.context.view_layer.update()
before=[tuple(v.co) for v in obj.data.vertices];metadata=data_state(obj,False);other=state(neighbor)
requested=targets(obj);result=edit_region(obj,**arguments(obj))
assert result['regionVertices']==121 and result['handleCount']==2
assert result['maxHandleError']<1e-7 and result['outsideCageChange']==0
assert .006<result['maxDisplacement']<.007 and max(result['trueResiduals'])<1e-7
selected={v.index for v in obj.data.vertices if any(g.group==obj.vertex_groups['Region'].index for g in v.groups)}
assert all(tuple(v.co)==before[v.index] for v in obj.data.vertices if v.index not in selected)
assert data_state(obj,False)==metadata and state(neighbor)==other
assert sum(tuple(v.co)!=before[v.index] for v in obj.data.vertices)>20
assert max(math.dist(world(obj)[i],p) for i,p in requested.items())<1e-7
original=state(obj);zero={i:world(obj)[i] for i in requested}
report=edit_region(obj,region='Region',handles=zero,max_displacement=0)
assert report['maxDisplacement']==0 and report['iterations']==[0,0,0]
assert state(obj)==original
''')

    def test_finite_pair_shell_and_first_hit_obstacle_constraints_and_rollback(self):
        self.probe('''
obj=grid();target=obstacle();solid=obj.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.003;solid.offset=0
solid.use_even_offset=True
distance=math.dist(*targets(obj).values())
bounds=[dict(name='Size',vertices=(56,112),min=distance-1e-5,max=distance+1e-5)]
shell=[dict(name='Shell sample',vertex=56,min=.0025,max=.004)]
rays=[dict(name='Body gap',object=target,vertices=[56,112],direction=(0,0,-1),min=.09,max=.15)]
result=edit_region(obj,**arguments(obj),distances=bounds,shell_pairs=shell,obstacles=rays)
assert [o['kind'] for o in result['observations']]==['cage pair distance','Solidify pair distance','first-hit ray gap','first-hit ray gap']
reject(obj,'Size',distances=[dict(name='Size',vertices=(56,112),min=.5,max=.6)])
reject(obj,'Shell sample',shell_pairs=[dict(name='Shell sample',vertex=56,min=.01,max=.02)])
reject(obj,'Body gap',obstacles=[dict(name='Body gap',object=target,vertices=[56],direction=(0,0,-1),min=.15,max=.2)])
reject(obj,'missed',obstacles=[dict(name='Miss',object=target,vertices=[56],direction=(0,0,-1),min=0,max=.01)])
back=mesh('Backface',[(-.5,-.5,.15),(.5,-.5,.15),(.5,.5,.15),(-.5,.5,.15),
                      (-.5,-.5,.1),(.5,-.5,.1),(.5,.5,.1),(-.5,.5,.1)],[(3,2,1,0),(4,5,6,7)])
reject(obj,'back-facing',obstacles=[dict(name='First backface',object=back,vertices=[56],direction=(0,0,-1),min=0,max=.2)])
original=local_edit._evaluate
def corrupt_pairing(o):
    points,faces,triangles=original(o)
    if o==obj:
        first=list(faces[0]);first[0]=(first[0]+2)%len(obj.data.vertices);faces[0]=tuple(first)
    return points,faces,triangles
local_edit._evaluate=corrupt_pairing
try:reject(obj,'correspondence',shell_pairs=shell)
finally:local_edit._evaluate=original
''')

    def test_late_failure_deformation_flip_and_movement_limit_restore_everything(self):
        self.probe('''
obj=grid();obj.modifiers.new('Thickness','SOLIDIFY').thickness=.003
neighbor=grid('Neighbor');neighbor.location.x=2;neighbor.select_set(True)
bpy.context.view_layer.objects.active=neighbor
original=state(obj);other=state(neighbor);postcheck=local_edit._postcheck
before=[tuple(v.co) for v in obj.data.vertices]
def late_failure(*args):
    assert [tuple(v.co) for v in obj.data.vertices]!=before
    raise RuntimeError('forced late evaluation failure')
local_edit._postcheck=late_failure
try:
    try:edit_region(obj,**arguments(obj))
    except RuntimeError as error:assert 'forced late' in str(error)
    else:raise AssertionError('late failure ignored')
finally:local_edit._postcheck=postcheck
assert state(obj)==original and state(neighbor)==other
# A native update failure after all postchecks must still restore coordinates.
import sys,types
real_bpy=sys.modules['bpy'];updates=[]
def late_update():
    updates.append(1)
    if len(updates)==2:raise RuntimeError('forced final native update failure')
    real_bpy.context.view_layer.update()
proxy=types.SimpleNamespace(types=real_bpy.types,context=types.SimpleNamespace(
    mode=real_bpy.context.mode,scene=real_bpy.context.scene,
    view_layer=types.SimpleNamespace(update=late_update)))
sys.modules['bpy']=proxy
try:
    try:edit_region(obj,**arguments(obj))
    except RuntimeError as error:assert 'final native update' in str(error)
    else:raise AssertionError('final update failure ignored')
finally:sys.modules['bpy']=real_bpy
assert len(updates)==3 and state(obj)==original and state(neighbor)==other
reject(obj,'movement bound',max_displacement=.001)
center=84;goal=list(world(obj)[center]);goal[0]+=.1
reject(obj,'triangle',region=[center],handles={center:goal},max_displacement=.2)
''')

    def test_unsupported_dependencies_masks_precision_and_unanchored_components(self):
        self.probe('''
obj=grid();target=obstacle()
shared=bpy.data.objects.new('Shared',obj.data);bpy.context.collection.objects.link(shared)
reject(obj,'one user');bpy.data.objects.remove(shared,do_unlink=True)
obj.shape_key_add(name='Basis');reject(obj,'static');obj.shape_key_clear()
obj.animation_data_create();reject(obj,'static');obj.animation_data_clear()
obj.parent=target;reject(obj,'static');obj.parent=None
modifier=obj.modifiers.new('Deformation','SHRINKWRAP');modifier.target=target
reject(obj,'Solidify');obj.modifiers.remove(modifier)
obj.vertex_groups['Region'].add([56],.5,'REPLACE');reject(obj,'zero or one')
obj.vertex_groups['Region'].add([56],1.,'REPLACE')
for bad in (dict(tolerance=0),dict(tolerance=1e-12),dict(max_displacement=float('nan')),
            dict(handles={56:(0,0,float('inf'))}),dict(region=[56,56]),dict(handles={0:(0,0,0)})):
    reject(obj,**bad)
obj.location.z=1e6;bpy.context.view_layer.update();reject(obj,'precision');obj.location.z=0
obj.scale.x=-1;bpy.context.view_layer.update();reject(obj,'positive scale');obj.scale.x=1
first=grid('Disconnected');n=len(first.data.vertices)
verts=[tuple(v.co) for v in first.data.vertices]+[(v.co.x+1,v.co.y,v.co.z) for v in first.data.vertices]
faces=[tuple(p.vertices) for p in first.data.polygons]+[tuple(i+n for i in p.vertices) for p in first.data.polygons]
islands=mesh('Islands',verts,faces)
reject(islands,'Dirichlet anchor',region=list(range(2*n)),handles={56:(0,0,.25)})
''')

    def test_rigid_and_nonuniform_world_transform_targets(self):
        self.probe('''
obj=grid();obj.matrix_world=Matrix.Translation((3,-2,.7))@Euler((.3,-.2,.4)).to_matrix().to_4x4()@Matrix.Diagonal((1,.8,1.2,1))
bpy.context.view_layer.update();requested=targets(obj);result=edit_region(obj,**arguments(obj))
assert result['maxHandleError']<1e-6 and max(math.dist(world(obj)[i],p) for i,p in requested.items())<1e-6
before=state(obj)
zero=edit_region(obj,region='Region',handles={i:world(obj)[i] for i in requested},max_displacement=0)
assert zero['maxDisplacement']==0 and zero['iterations']==[0,0,0] and state(obj)==before
''')

    def test_grazing_native_first_hit_cannot_claim_precise_gap(self):
        self.probe('''
from mathutils import Vector
from mathutils.bvhtree import BVHTree
obj=grid();p=targets(obj)[56];xc=p[0]+.05;zc=p[2]
vertices=[(x,y,zc-.0001*(x-xc)) for x,y in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]]
target=mesh('Grazing',vertices,[(3,2,1,0)])
tree=BVHTree.FromPolygons(vertices,[(3,2,1,0)])
hit,normal,_,gap=tree.ray_cast(Vector(p),Vector((1,0,0)),.15)
assert hit is not None and 0 < -normal.x < .001 and 0 < gap < .15
reject(obj,'ray precision',obstacles=[dict(name='Grazing gap',object=target,vertices=[56],direction=(1,0,0),min=0,max=.15)])
''')

    def test_canceled_large_local_origin_cannot_quantize_the_free_field_silently(self):
        self.probe('''
obj=grid()
for v in obj.data.vertices:v.co.z+=1e6
obj.location.z=-1e6;obj.data.update();bpy.context.view_layer.update()
points=world(obj)
goals={56:(*points[56][:2],points[56][2]+.0625),112:(*points[112][:2],points[112][2]-.0625)}
reject(obj,'local-coordinate precision',handles=goals,max_displacement=.1)
# Even if the conservative preflight is bypassed, actual stored free vertices
# must not inherit the ideal solver's tiny residual as a geometry guarantee.
precision=local_edit._storage_precision;local_edit._storage_precision=lambda *args:0.
try:reject(obj,'stored displacement field',handles=goals,max_displacement=.1)
finally:local_edit._storage_precision=precision
''')

    def test_installed_native_reopen_second_edit_delivery_and_restore(self):
        project = self.root / 'project'
        self.cli('init', '--root', project, '--name', 'bounded-local-edit')
        create = self.root / 'create.py'
        create.write_text(SETUP + '''
obj=grid();obj.modifiers.new('Thickness','SOLIDIFY').thickness=.003
edit_region(obj,**arguments(obj))
neighbor=grid('Neighbor');neighbor.location.x=2
''')
        flags = ['--root', project, '--outputs', 'native', '--views', '', '--blender', BLENDER]
        initial = self.cli('run', *flags, '--script', create, '--intent', 'jointly edit two curved surface landmarks')
        original_bytes = Path(initial['outputs']['blend']).read_bytes()
        edit = self.root / 'edit.py'
        edit.write_text('''import bpy,math
from local_edit import edit_region
obj=bpy.data.objects['Patch'];before=[tuple(v.co) for v in obj.data.vertices]
targets={56:tuple(obj.matrix_world@obj.data.vertices[56].co),112:tuple(obj.matrix_world@obj.data.vertices[112].co)}
targets[56]=(targets[56][0],targets[56][1],targets[56][2]-.002)
targets[112]=(targets[112][0]+.001,targets[112][1],targets[112][2])
report=edit_region(obj,region='Region',handles=targets,max_displacement=.01)
assert report['maxHandleError']<1e-6 and report['outsideCageChange']==0
assert len(obj.data.vertices)==169 and len(obj.modifiers)==1
# Ordinary native mesh edit remains possible without constructing helper controls.
obj.data.vertices[84].co.z+=.0001
obj.data.update()
''')
        revised = self.cli('run', *flags, '--script', edit, '--intent', 'change the reopened shape with a new two-point request',
                           '--protect-object', 'Neighbor')
        delivered = self.cli('deliver', '--root', project, '--views', '', '--blender', BLENDER)
        self.probe('''
for path,native_file in ''' + repr([(revised['outputs']['blend'], True), (delivered['outputs']['glb'], False)]) + ''':
    if native_file:bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=path)
    obj=bpy.data.objects['Patch']
    if native_file:
        assert len(obj.data.vertices)==169 and len(obj.modifiers)==1 and obj.vertex_groups.get('Region')
    else:assert not obj.modifiers and len(obj.data.vertices)>169
    assert sorted(o.name for o in bpy.context.scene.objects)==['Neighbor','Patch']
''')
        restored = self.cli('restore', '--root', project, '--revision', initial['head'])
        self.assertEqual(Path(restored['outputs']['blend']).read_bytes(), original_bytes)
        self.assertTrue(self.cli('verify', '--root', project)['ok'])


if __name__ == '__main__':
    unittest.main()

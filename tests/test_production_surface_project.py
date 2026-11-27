"""Native masked projection, measured and continued from a copied skill."""
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
from mathutils import Matrix, Euler
from surface_project import project_region
bpy.ops.wm.read_factory_settings(use_empty=True)

def mesh(name,vertices,faces):
    data=bpy.data.meshes.new(name+'Mesh');data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return obj

def grid(name,n=16,extent=.4,height=lambda x:.4,layers=1):
    vertices=[];faces=[]
    for layer in range(layers):
        base=len(vertices)
        vertices.extend((extent*(2*i/n-1),extent*(2*j/n-1),height(extent*(2*i/n-1))+.01*layer)
                        for j in range(n+1) for i in range(n+1))
        faces.extend(tuple(base+k for k in (j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i))
                     for j in range(n) for i in range(n))
    obj=mesh(name,vertices,faces)
    for layer in range(layers):
        obj.vertex_groups.new(name='Fit' if layer==0 else 'Layer'+str(layer)).add(
            list(range(layer*(n+1)**2,(layer+1)*(n+1)**2)),1.,'REPLACE')
    return obj

def fixture(n=16,layers=1):
    obj=grid('Patch',n=n,layers=layers)
    target=grid('Target',n=48,extent=.6,height=lambda x:.2-.5*x*x)
    return obj,target

def native(obj,target,group='Fit',name='Fit',offset=.005,limit=.5):
    m=obj.modifiers.new(name,'SHRINKWRAP');m.target=target;m.vertex_group=group
    m.wrap_method='PROJECT';m.wrap_mode='ON_SURFACE';m.cull_face='BACK'
    m.use_project_z=True;m.use_negative_direction=True;m.use_positive_direction=False
    m.offset=offset;m.project_limit=limit
    return m

arguments=dict(name='Fit',group='Fit',axis='Z',direction=-1,offset=.005,
               max_distance=.5,max_displacement=.4,tolerance=.001)

def evaluated(obj,prefix=False):
    flags=[(m,m.show_viewport,m.show_render) for m in obj.modifiers if prefix and m.type in ('SOLIDIFY','BEVEL')]
    try:
        for m,v,r in flags:m.show_viewport=m.show_render=False
        bpy.context.view_layer.update();e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());data=e.to_mesh()
        try:return tuple(tuple(v.co) for v in data.vertices),tuple(tuple(p.vertices) for p in data.polygons)
        finally:e.to_mesh_clear()
    finally:
        for m,v,r in flags:m.show_viewport=v;m.show_render=r
        bpy.context.view_layer.update()

def data_state(obj):
    fields={'FLOAT':'value','INT':'value','INT8':'value','INT32_2D':'value','BOOLEAN':'value','FLOAT_VECTOR':'vector',
            'FLOAT2':'vector','FLOAT_COLOR':'color','BYTE_COLOR':'color'}
    values=[]
    for a in obj.data.attributes:
        rows=[]
        for item in a.data:
            v=getattr(item,fields[a.data_type])
            rows.append(tuple(v) if a.data_type in ('INT32_2D','FLOAT_VECTOR','FLOAT2','FLOAT_COLOR','BYTE_COLOR') else v)
        values.append((a.name,a.domain,a.data_type,tuple(rows)))
    return (obj.data.as_pointer(),tuple(tuple(v.co) for v in obj.data.vertices),
            tuple(tuple((g.group,g.weight) for g in v.groups) for v in obj.data.vertices),
            tuple((tuple(p.vertices),p.material_index,p.use_smooth) for p in obj.data.polygons),tuple(values),
            tuple((g.name,g.lock_weight) for g in obj.vertex_groups),
            tuple((s.link,s.material) for s in obj.material_slots),obj.active_material_index,
            tuple(tuple(r) for r in obj.matrix_world))

def state(obj):
    bpy.context.view_layer.update()
    mods=[]
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

def reject(obj,target,**overrides):
    before=state(obj)
    try:project_region(obj,target,**{**arguments,**overrides})
    except ValueError:pass
    else:raise AssertionError('invalid projection accepted: '+str(overrides))
    assert state(obj)==before,'failed projection changed original state'
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for surface-project regressions')
class ProductionSurfaceProjectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-surface-project-')
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

    def probe(self, code, setup=True):
        script = self.root / (self.id().rsplit('.', 1)[-1] + '.py')
        script.write_text('import sys\nsys.path.insert(0, ' + repr(str(self.skill / 'scripts/production'))
                          + ')\n' + (SETUP if setup else '') + code)
        return self.invoke([BLENDER, '-b', '--factory-startup', '--threads', '2',
                            '--python-exit-code', '1', '--python', script])

    def cli(self, command, *args):
        return json.loads(self.invoke([sys.executable, '-B', self.skill / 'scripts/produce.py',
                                       command, *args]).stdout)

    def test_curved_projection_and_three_disjoint_native_layers(self):
        self.probe('''
obj,target=fixture(layers=3)
solid=obj.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.001
bevel=obj.modifiers.new('Edges','BEVEL');bevel.width=.0001
original=data_state(obj)
for name,offset in [('Fit',.005),('Layer1',.006),('Layer2',.007)]:
    result=project_region(obj,target,**{**arguments,'name':name,'group':name,'offset':offset})
    assert result['selectedVertices']==289 and result['triangles']==512
    assert result['sampleCount']==289+4*512 and 0<result['maxTriangleEdge']<.08
    assert result['maxResidual']<.001 and result['maxTransverseResidual']<1e-6
    assert result['outsideMaskChange']==0 and result['maxDisplacement']>.19
    assert data_state(obj)==original
assert list(obj.modifiers)==[obj.modifiers['Fit'],obj.modifiers['Layer1'],obj.modifiers['Layer2'],solid,bevel]
fit=obj.modifiers['Fit'];uid=fit.as_pointer()
report=project_region(obj,target,**{**arguments,'offset':.00535})
assert not report['created'] and obj.modifiers['Fit'].as_pointer()==uid
assert abs(report['maxEditMovement']-.00035)<1e-7 and report['maxDisplacement']>.19
assert data_state(obj)==original
''')

    def test_cage_layers_groups_other_modifiers_and_context_are_preserved(self):
        self.probe('''
obj,target=fixture(layers=2)
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
weights=obj.vertex_groups.new(name='ThicknessWeights');weights.add(list(range(578)),.65,'REPLACE')
solid=obj.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.001;solid.vertex_group=weights.name
bevel=obj.modifiers.new('Edges','BEVEL');bevel.width=.0001;bevel.segments=2
project_region(obj,target,**{**arguments,'name':'OtherProjection','group':'Layer1','offset':.007})
other_project=obj.modifiers['OtherProjection'];old_settings=(other_project.as_pointer(),other_project.offset,other_project.target)
neighbor=grid('Neighbor');neighbor.location.x=3
obj.select_set(True);neighbor.select_set(True);bpy.context.view_layer.objects.active=neighbor
obj.modifiers.active=solid
bpy.context.view_layer.update()
raw=data_state(obj);target_state=state(target);neighbor_state=state(neighbor)
old_mask=evaluated(obj,prefix=True)[0][289:]
project_region(obj,target,**arguments)
assert data_state(obj)==raw and state(target)==target_state and state(neighbor)==neighbor_state
assert list(obj.modifiers)==[other_project,obj.modifiers['Fit'],solid,bevel]
assert (other_project.as_pointer(),other_project.offset,other_project.target)==old_settings
assert obj.modifiers.active==solid and evaluated(obj,prefix=True)[0][289:]==old_mask
assert bpy.context.view_layer.objects.active==neighbor and obj.select_get() and neighbor.select_get()
''')

    def test_silent_native_miss_first_backface_and_displacement_bounds(self):
        self.probe('''
obj,target=fixture()
raw=evaluated(obj)
native_miss=native(obj,target,limit=.01)
assert evaluated(obj)==raw,'fixture must exercise native silent no-hit'
obj.modifiers.remove(native_miss)
reject(obj,target,max_distance=.01)
reject(obj,target,max_displacement=.01)
layers=mesh('Layers',[(-2,-2,.3),(2,-2,.3),(2,2,.3),(-2,2,.3),
                       (-2,-2,.2),(2,-2,.2),(2,2,.2),(-2,2,.2)],[(3,2,1,0),(4,5,6,7)])
culled=native(obj,layers)
assert evaluated(obj)==raw,'native must cull first backface without searching past it'
obj.modifiers.remove(culled)
reject(obj,layers)
''')

    def test_coarse_face_and_existing_failure_roll_back_exact_native_state(self):
        self.probe('''
coarse,target=fixture(n=1)
solid=coarse.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.001
bevel=coarse.modifiers.new('Edges','BEVEL');bevel.width=.0001
coarse.modifiers.active=solid
reject(coarse,target)
assert coarse.modifiers.active==solid and len(coarse.modifiers)==2
obj=grid('Fine')
solid=obj.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.001
bevel=obj.modifiers.new('Edges','BEVEL');bevel.width=.0001
project_region(obj,target,**arguments)
original=obj.modifiers['Fit'];obj.modifiers.active=solid
reject(obj,target,offset=.006,max_displacement=.01)
assert obj.modifiers['Fit']==original and obj.modifiers.active==solid
''')

    def test_world_transform_limits_and_near_hit_transverse_drift(self):
        self.probe('''
obj,target=fixture()
rigid=Matrix.Translation((3,-2,.7))@Euler((.3,-.2,.4)).to_matrix().to_4x4()
obj.matrix_world=rigid@Matrix.Diagonal((1,.97,1,1));target.matrix_world=rigid
report=project_region(obj,target,**arguments)
assert report['maxResidual']<.001
obj.scale.z*=2;reject(obj,target);obj.scale.z/=2
target.scale.x=2;reject(obj,target);target.scale.x=1
obj.scale.x*=-1;reject(obj,target);obj.scale.x*=-1
near=mesh('Near',[(1000,0,.001),(1000.1,0,.051),(1000,.1,.001)],[(0,1,2)])
near.location.x=-1000
near.vertex_groups.new(name='Fit').add([0,1,2],1.,'REPLACE')
tilt=mesh('Tilt',[(-10,-10,-5),(10,-10,5),(10,10,5),(-10,10,-5)],[(0,1,2,3)])
probe=native(near,tilt,offset=.1,limit=1)
assert max(abs(v[0]-p.co.x) for v,p in zip(evaluated(near)[0],near.data.vertices))>.04
near.modifiers.remove(probe)
reject(near,tilt,offset=.1,max_distance=1,max_displacement=.2,tolerance=.001)
far=grid('Far',n=1,height=lambda x:1)
far_target=grid('FarTarget',n=1,extent=1,height=lambda x:0)
far.location.z=far_target.location.z=1e6
far_native=native(far,far_target,offset=.001,limit=2)
bpy.context.view_layer.update()
assert all((far.matrix_world@v.co).z==1e6 for v in far.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)
far.modifiers.remove(far_native)
reject(far,far_target,offset=.001,max_distance=2,max_displacement=2,tolerance=1e-5)
far.location.z=far_target.location.z=0
# A large native offset also needs a resolvable output movement bound.
reject(far,far_target,offset=1000000.001,max_distance=2,max_displacement=999999.5,tolerance=1)
simple,flat=fixture()
for bad in (dict(max_distance=1e-50),dict(max_distance=1e40),dict(offset=1e40),
            dict(tolerance=1e-12),dict(tolerance=0),dict(max_displacement=float('nan'))):
    reject(simple,flat,**bad)
''')

    def test_masks_name_collisions_and_unsupported_dependencies_reject(self):
        self.probe('''
obj,target=fixture()
fit=obj.vertex_groups['Fit'];fit.add([0],.5,'REPLACE');reject(obj,target);fit.add([0],1.,'REPLACE')
fit.remove([0]);reject(obj,target);fit.add([0],1.,'REPLACE')
obj.vertex_groups.new(name='Empty');reject(obj,target,group='Empty')
project_region(obj,target,**arguments)
obj.vertex_groups.new(name='Alias').add(list(range(len(obj.data.vertices))),1.,'REPLACE')
reject(obj,target,name='Overlap',group='Alias')
reject(obj,target,name='Fit',group='Alias')
reject(obj,target,direction=1)
foreign=grid('Foreign');reject(obj,foreign)
solid=obj.modifiers.new('Thickness','SOLIDIFY');reject(obj,target,name='Thickness')
obj.shape_key_add(name='Basis');reject(obj,target);obj.shape_key_clear()
obj.animation_data_create();reject(obj,target);obj.animation_data_clear()
obj.parent=target;reject(obj,target);obj.parent=None
solid.show_render=False;reject(obj,target);solid.show_render=True
dependency=target.modifiers.new('ExternalDependency','SHRINKWRAP');dependency.target=foreign
reject(obj,target);target.modifiers.remove(dependency)
obj['refas_sweep_version']=1;reject(obj,target);del obj['refas_sweep_version']
''')

    def test_installed_native_reopen_unplanned_offset_edit_export_and_restore(self):
        project = self.root / 'project'
        self.cli('init', '--root', project, '--name', 'native-surface-projection')
        create = self.root / 'create.py'
        create.write_text(SETUP + '''
obj,target=fixture()
obj.modifiers.new('Thickness','SOLIDIFY').thickness=.001
project_region(obj,target,**arguments)
neighbor=grid('Neighbor');neighbor.location.x=3
''')
        flags = ['--root',project,'--outputs','native','--views','','--blender',BLENDER]
        initial = self.cli('run',*flags,'--script',create,'--intent','fit existing curved patch with native Project')
        initial_bytes = Path(initial['outputs']['blend']).read_bytes()
        edit = self.root / 'edit.py'
        edit.write_text('''import bpy, math
obj=bpy.data.objects['Patch'];cage=[tuple(v.co) for v in obj.data.vertices]
modifier=obj.modifiers['Fit'];uid=modifier.as_pointer();solid=obj.modifiers['Thickness']
solid.show_viewport=False
bpy.context.view_layer.update();before=[tuple(v.co) for v in obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices]
modifier.offset+=.00035
bpy.context.view_layer.update();after=[tuple(v.co) for v in obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices]
assert abs(max(math.dist(a,b) for a,b in zip(before,after))-.00035)<1e-7
solid.show_viewport=True
assert modifier.as_pointer()==uid and [tuple(v.co) for v in obj.data.vertices]==cage
''')
        revised = self.cli('run',*flags,'--script',edit,'--intent','raise saved native offset by a new 0.35 mm request',
                           '--protect-object','Target','--protect-object','Neighbor')
        delivered = self.cli('deliver','--root',project,'--views','','--blender',BLENDER)
        self.probe('''
for path,native_file in '''+repr([(revised['outputs']['blend'],True),(delivered['outputs']['glb'],False)])+''':
    if native_file:bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=path)
    obj=bpy.data.objects['Patch']
    if native_file:
        assert len(obj.data.vertices)==289 and len(obj.modifiers)==2
        assert obj.vertex_groups.get('Fit') and abs(obj.modifiers['Fit'].offset-.00535)<1e-7
        assert obj.modifiers['Fit'].target==bpy.data.objects['Target']
    else:
        assert not obj.modifiers and len(obj.data.vertices)>289
        assert sorted(o.name for o in bpy.context.scene.objects)==['Neighbor','Patch','Target']
''')
        restored = self.cli('restore','--root',project,'--revision',initial['head'])
        self.assertEqual(Path(restored['outputs']['blend']).read_bytes(),initial_bytes)
        self.assertTrue(self.cli('verify','--root',project)['ok'])


if __name__ == '__main__':
    unittest.main()

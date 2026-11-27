"""Actual native boundary joins from a separately copied production skill."""
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
import bpy, bmesh, math
from mathutils import Matrix, Vector, Euler
import boundary_bridge
from boundary_bridge import bridge_boundaries
bpy.ops.wm.read_factory_settings(use_empty=True)

def sheets(name='Cage'):
    vertices=[(x,j/3,z) for x,z in ((-.4,.3),(0,0),(1,0),(1.4,.3)) for j in range(4)]
    faces=[(base+j,base+4+j,base+5+j,base+j+1) for base in (0,8) for j in range(3)]
    mesh=bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    return obj

A,B=(4,5,6,7),(8,9,10,11)

def context():
    active=bpy.context.view_layer.objects.active
    return (active.name if active else None, sorted(o.name for o in bpy.context.selected_objects),
            bpy.context.mode, tuple(bpy.context.tool_settings.mesh_select_mode))

def state(obj):
    return (obj.data.as_pointer(),[tuple(v.co) for v in obj.data.vertices],
            [tuple(p.vertices) for p in obj.data.polygons], [tuple(r) for r in obj.matrix_world],
            [(m.name,m.type,m.show_viewport,m.show_render) for m in obj.modifiers],
            sorted(o.name for o in bpy.data.objects),sorted(m.name for m in bpy.data.meshes),context())

def reject(obj, **override):
    bpy.context.view_layer.update()
    before=state(obj)
    args=dict(boundary_a=A,boundary_b=B,cuts=6)
    args.update(override)
    try:
        bridge_boundaries(obj,**args)
    except ValueError:
        pass
    else:
        raise AssertionError('invalid bridge accepted: '+str(override))
    assert state(obj)==before
'''


@unittest.skipUnless(os.environ.get('REFAS_BLENDER_TESTS') == '1' and BLENDER,
                     'Set REFAS_BLENDER_TESTS=1 with Blender for boundary-bridge regressions')
class ProductionBoundaryBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='refas-boundary-bridge-')
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

    def test_surface_join_changes_direction_and_linear_keeps_crease(self):
        self.probe('''
for method in ('LINEAR','SURFACE'):
    obj=sheets(method)
    before=[tuple(v.co) for v in obj.data.vertices]
    result=bridge_boundaries(obj,A,B,cuts=6,interpolation=method)
    assert result['rows'][0]==list(A) and result['rows'][-1]==list(B)
    assert [tuple(v.co) for v in obj.data.vertices[:16]]==before
    assert len(result['newVertices'])==24 and len(result['newFaces'])==21
    rows=result['rows']
    incoming=(obj.data.vertices[4].co-obj.data.vertices[0].co).normalized()
    outgoing=(obj.data.vertices[rows[1][0]].co-obj.data.vertices[4].co).normalized()
    angle=math.degrees(incoming.angle(outgoing))
    assert angle < 2 if method=='SURFACE' else angle > 35
    assert result['maxBulge'] > .25 if method=='SURFACE' else result['maxBulge']==0
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
    for chain in (A,B):
        for x,y in zip(chain,chain[1:]):
            edge=bm.edges.get((bm.verts[x],bm.verts[y]))
            assert edge.is_manifold and edge.is_contiguous
    seen={bm.verts[0]};pending=list(seen)
    while pending:
        for e in pending.pop().link_edges:
            for v in e.verts:
                if v not in seen: seen.add(v);pending.append(v)
    assert len(seen)==len(bm.verts)
    bm.free()
''')

    def test_explicit_correspondence_and_open_endpoints(self):
        self.probe('''
obj=sheets()
reject(obj,boundary_b=tuple(reversed(B)))
reject(obj,boundary_a=(4,6,5,7))
result=bridge_boundaries(obj,tuple(reversed(A)),tuple(reversed(B)),cuts=2)
assert result['rows'][0]==list(reversed(A)) and result['rows'][-1]==list(reversed(B))
for i,row in enumerate(result['rows']):
    assert max(abs(obj.data.vertices[v].co.y-(1-j/3)) for j,v in enumerate(row)) < 1e-6
bm=bmesh.new();bm.from_mesh(obj.data)
assert sum(e.is_boundary for e in bm.edges)==16
bm.free()
''')

    def test_existing_layers_modifiers_and_context_are_retained(self):
        self.probe('''
obj=sheets()
for name in ('Cloth','Trim'):
    obj.data.materials.append(bpy.data.materials.new(name))
for face in obj.data.polygons:
    face.material_index=face.index%2
    face.use_smooth=True
uv=obj.data.uv_layers.new(name='ExistingUV')
for loop in obj.data.loops:
    uv.data[loop.index].uv=(loop.index*.02,loop.vertex_index*.03)
color=obj.data.color_attributes.new(name='ExistingColor',type='FLOAT_COLOR',domain='CORNER')
for i,element in enumerate(color.data): element.color=(i*.01,.25,.5,1)
attribute=obj.data.attributes.new(name='ExistingPoint',type='FLOAT',domain='POINT')
for i,element in enumerate(attribute.data): element.value=i*.13
crease=obj.data.attributes.new(name='crease_edge',type='FLOAT',domain='EDGE')
for i,element in enumerate(crease.data): element.value=.6
group=obj.vertex_groups.new(name='Weights')
for i in range(16): group.add([i],.1+i*.01,'REPLACE')
for v in obj.data.vertices: v.select=bool(v.index%2)
for e in obj.data.edges: e.use_seam=bool(e.index%2)
solid=obj.modifiers.new('Thickness','SOLIDIFY');solid.thickness=.03
bevel=obj.modifiers.new('Edge','BEVEL');bevel.width=.005
old_mesh=obj.data
old_coords=[tuple(v.co) for v in old_mesh.vertices]
old_faces=[(tuple(f.vertices),f.material_index,f.use_smooth) for f in old_mesh.polygons]
old_uv=[tuple(v.uv) for v in old_mesh.uv_layers['ExistingUV'].data]
old_color=[tuple(v.color) for v in old_mesh.color_attributes['ExistingColor'].data]
old_point=[v.value for v in old_mesh.attributes['ExistingPoint'].data]
old_crease=[v.value for v in old_mesh.attributes['crease_edge'].data]
old_weights=[v.groups[0].weight for v in old_mesh.vertices]
other=sheets('Neighbor');other.location=(5,0,0)
obj.select_set(True);other.select_set(True);bpy.context.view_layer.objects.active=other
bpy.context.view_layer.update()
before_context=context();before_other=state(other)[:5]
report=bridge_boundaries(obj,A,B,cuts=4,material_index=1)
assert bpy.data.objects['Cage'] is obj and context()==before_context
assert state(other)[:5]==before_other
assert [tuple(v.co) for v in obj.data.vertices[:16]]==old_coords
assert [(tuple(f.vertices),f.material_index,f.use_smooth) for f in obj.data.polygons[:6]]==old_faces
assert [tuple(v.uv) for v in obj.data.uv_layers['ExistingUV'].data[:24]]==old_uv
assert [tuple(v.color) for v in obj.data.color_attributes['ExistingColor'].data[:24]]==old_color
assert [v.value for v in obj.data.attributes['ExistingPoint'].data[:16]]==old_point
assert [v.value for v in obj.data.attributes['crease_edge'].data[:len(old_crease)]]==old_crease
assert [v.groups[0].weight for v in obj.data.vertices[:16]]==old_weights
assert all(obj.data.polygons[i].material_index==1 for i in report['newFaces'])
assert obj.modifiers[0] == solid and obj.modifiers[1] == bevel
assert solid.thickness==.03 or abs(solid.thickness-.03)<1e-8
''')

    def test_bulge_uses_world_units_under_nonuniform_transform(self):
        self.probe('''
obj=sheets()
obj.matrix_world=Matrix.Translation((2,-1,.4)) @ Euler((.4,.6,-.2)).to_matrix().to_4x4() @ Matrix.Diagonal((3,.5,2,1))
reject(obj,max_bulge=.4)
result=bridge_boundaries(obj,A,B,cuts=6,max_bulge=.52)
assert abs(result['maxBulge']-.5157550573)<2e-6
assert max(abs(v-3) for v in result['spanRange'])<2e-6
for translation,smoothness,limit in ((0,1e-8,1e-10),(1,1e-8,1e-10),(100,1e-6,1e-8)):
    tiny=sheets('SmallBulge')
    tiny.location.z=translation
    reject(tiny,smoothness=smoothness,max_bulge=limit)
''')

    def test_invalid_inputs_numeric_collapse_and_folds_leave_source_untouched(self):
        self.probe('''
obj=sheets()
for bad in [dict(cuts=-1),dict(cuts=True),dict(cuts=2.5),dict(interpolation='PATH'),
            dict(smoothness=float('nan')),dict(smoothness=-1),dict(max_bulge=-.1),
            dict(max_bulge=float('inf')),dict(material_index=0),dict(boundary_a=[]),
            dict(boundary_a=(4,4,5,6)),dict(boundary_b=A),dict(boundary_b=(8,9,10)),
            dict(boundary_a=None),dict(boundary_a=(4,5,6,True)),dict(max_bulge=.1)]:
    reject(obj,**bad)
obj.location=(1e8,0,0)
reject(obj)
obj.location=(0,0,0)
obj.data.vertices[5].co=obj.data.vertices[4].co
reject(obj)
fold=sheets('Fold')
fold.data.vertices[9].co.y=2/3
fold.data.vertices[10].co.y=1/3
reject(fold,cuts=0,interpolation='LINEAR')
''')

    def test_unsupported_control_or_dynamic_states_and_modifiers_reject(self):
        self.probe('''
obj=sheets()
obj['refas_sweep_version']=1;reject(obj);del obj['refas_sweep_version']
obj['refas_role']='construction';reject(obj);del obj['refas_role']
obj.shape_key_add(name='Basis');reject(obj);obj.shape_key_clear()
obj.data.animation_data_create();reject(obj);obj.data.animation_data_clear()
obj.constraints.new('COPY_LOCATION');reject(obj);obj.constraints.clear()
linked=bpy.data.objects.new('Shared',obj.data);bpy.context.collection.objects.link(linked)
reject(obj);bpy.data.objects.remove(linked,do_unlink=True)
modifier=obj.modifiers.new('Mismatch','SUBSURF');modifier.levels=1;modifier.render_levels=2
reject(obj);obj.modifiers.remove(modifier)
modifier=obj.modifiers.new('Nodes','NODES');reject(obj);obj.modifiers.remove(modifier)
other=sheets('EditingOther');other.select_set(True);bpy.context.view_layer.objects.active=other
bpy.ops.object.mode_set(mode='EDIT')
reject(obj)
assert bpy.context.mode=='EDIT_MESH'
bpy.ops.object.mode_set(mode='OBJECT')
''')

    def test_failed_commit_restores_mesh_and_context_without_orphans(self):
        self.probe('''
obj=sheets();other=sheets('Neighbor')
obj.select_set(True);other.select_set(True);bpy.context.view_layer.objects.active=other
mesh=obj.data
before=state(obj)
original=boundary_bridge._postcheck
def fail(obj,mesh): raise ValueError('synthetic commit failure')
boundary_bridge._postcheck=fail
reject(obj)
boundary_bridge._postcheck=original
assert obj.data is mesh and state(obj)==before
''')

    def test_installed_native_reopen_edit_delivery_and_exact_restore(self):
        project = self.root / 'bridge-project'
        self.cli('init', '--root', project, '--name', 'native-boundary-join')
        create = self.root / 'create-bridge.py'
        create.write_text(SETUP + '''
obj=sheets()
obj.modifiers.new('Thickness','SOLIDIFY').thickness=.03
result=bridge_boundaries(obj,A,B,cuts=4)
group=obj.vertex_groups.new(name='TransitionInterior')
group.add(result['newVertices'],1.,'REPLACE')
neighbor=sheets('Neighbor');neighbor.location=(4,0,0)
''')
        flags = ['--root',project,'--outputs','native','--views','','--blender',BLENDER]
        initial = self.cli('run',*flags,'--script',create,'--intent','join two existing cage boundaries')
        initial_bytes = Path(initial['outputs']['blend']).read_bytes()
        before = {o['name']:o for o in json.loads(Path(initial['outputs']['scene']).read_text())['objects']}
        edit = self.root / 'edit-bridge.py'
        edit.write_text('''import bpy
obj=bpy.data.objects['Cage']
group=obj.vertex_groups['TransitionInterior'].index
old=[tuple(v.co) for v in obj.data.vertices[:16]]
for vertex in obj.data.vertices:
    if any(g.group==group and g.weight>0 for g in vertex.groups): vertex.co.z-=.015
obj.data.update()
assert [tuple(v.co) for v in obj.data.vertices[:16]]==old
''')
        revised = self.cli('run',*flags,'--script',edit,'--intent','revise saved transition interior',
                           '--protect-object','Neighbor')
        after = {o['name']:o for o in json.loads(Path(revised['outputs']['scene']).read_text())['objects']}
        self.assertEqual(before['Neighbor'],after['Neighbor'])
        self.assertNotEqual(before['Cage']['mesh'],after['Cage']['mesh'])
        delivered = self.cli('deliver','--root',project,'--views','','--blender',BLENDER)
        self.probe('''
for path,native in '''+repr([(revised['outputs']['blend'],True),(delivered['outputs']['glb'],False)])+''':
    if native:
        bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    obj=bpy.data.objects['Cage']
    if native:
        assert obj.vertex_groups.get('TransitionInterior') and len(obj.modifiers)==1
        assert len(obj.data.vertices)==32
    else:
        assert not obj.modifiers and len(obj.data.vertices)>32
        assert sorted(o.name for o in bpy.context.scene.objects)==['Cage','Neighbor']
''')
        restored = self.cli('restore','--root',project,'--revision',initial['head'])
        self.assertEqual(Path(restored['outputs']['blend']).read_bytes(),initial_bytes)
        self.assertTrue(self.cli('verify','--root',project)['ok'])


if __name__ == '__main__':
    unittest.main()

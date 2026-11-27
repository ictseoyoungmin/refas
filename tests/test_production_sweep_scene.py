"""Actual native sweep controls through a separately copied production skill."""
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
import sweep_scene
from sweep_scene import create_sweep, rebuild_sweep
bpy.ops.wm.read_factory_settings(use_empty=True)
RECT=[(-.1,-.04),(.1,-.04),(.1,.04),(-.1,.04)]
CENTERS=[(0,0,0),(0,0,1),(0,0,2)]

def make(name='Sweep',**changes):
    return create_sweep(name,**{**dict(centers=CENTERS,profiles=[RECT]*3,initial_u=(1,0,0),
                                      closed_profile=True,cap_ends=True,twist=[.2,.6,.6]),**changes})

def objects(report):
    return (bpy.data.objects[report['output']],bpy.data.objects[report['guide']],
            bpy.data.objects[report['axis']],[bpy.data.objects[n] for n in report['profiles']])

def coordinates(obj):
    return [tuple(v.co) for v in obj.data.vertices]

def state(output,profiles):
    bpy.context.view_layer.update()
    return (coordinates(output),[tuple(p.vertices) for p in output.data.polygons],
            [(coordinates(p),[list(r) for r in p.matrix_basis],list(p['refas_sweep_frame'])) for p in profiles],
            sorted(bpy.data.objects.keys()),sorted(bpy.data.meshes.keys()))

def reject(output,profiles):
    before=state(output,profiles)
    try:
        rebuild_sweep(output)
    except ValueError:
        pass
    else:
        raise AssertionError('invalid native sweep edit accepted')
    assert state(output,profiles)==before

def layers(output):
    return ([m.name for m in output.data.materials],
            [(p.material_index,p.use_smooth) for p in output.data.polygons],
            [tuple(d.uv) for d in output.data.uv_layers['UVMap'].data],
            [tuple(d.color) for d in output.data.color_attributes['Tint'].data],
            [[(g.group,g.weight) for g in v.groups] for v in output.data.vertices])

def add_layers(output):
    for name in ('Metal','Trim'):
        output.data.materials.append(bpy.data.materials.new(name))
    for i,polygon in enumerate(output.data.polygons):
        polygon.material_index=i%2
        polygon.use_smooth=bool(i%2)
    uv=output.data.uv_layers.new(name='UVMap')
    for i,item in enumerate(uv.data):
        item.uv=((i%4)/3,(i//4)/8)
    color=output.data.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='POINT')
    for i,item in enumerate(color.data):
        item.color=(i/len(color.data),.2,.4,1)
    output.vertex_groups.new(name='LocalWeight').add([0,1,4,5],.7,'REPLACE')

def center(output,index):
    return sum((v.co for v in output.data.vertices[index*4:(index+1)*4]),Vector())/4
'''


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender for native sweep regressions")
class ProductionSweepSceneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-sweep-scene-")
        cls.root = Path(cls.temp.name)
        cls.skill = cls.root / "copied-refas"
        shutil.copytree(SKILL,cls.skill,ignore=shutil.ignore_patterns("__pycache__","*.pyc"))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def invoke(self,args):
        result=subprocess.run(list(map(str,args)),cwd=self.root,capture_output=True,text=True,timeout=120,
                              env={**os.environ,"PYTHONPATH":"","PYTHONDONTWRITEBYTECODE":"1"})
        if result.returncode:
            logs=sorted(self.root.rglob("blender.log"),key=lambda p:p.stat().st_mtime)
            self.fail(result.stdout[-4000:]+result.stderr[-4000:]
                      +(logs[-1].read_text()[-4000:] if logs else ""))
        return result

    def probe(self,code):
        script=self.root/(self.id().rsplit('.',1)[-1]+".py")
        script.write_text("import sys\nsys.path.insert(0,"+repr(str(self.skill/"scripts/production"))+")\n"+SETUP+code)
        return self.invoke([BLENDER,"-b","--factory-startup","--threads","2",
                            "--python-exit-code","1","--python",script])

    def cli(self,command,*args):
        return json.loads(self.invoke([sys.executable,"-B",self.skill/"scripts/produce.py",command,*args]).stdout)

    def test_real_controls_absolute_twist_and_noop_stability(self):
        self.probe('''
report=make()
output,guide,axis,profiles=objects(report)
assert len(output.data.vertices)==12 and len(output.data.polygons)==12
for i,angle in enumerate((.2,.6,.6)):
    expected=Vector((RECT[0][0]*math.cos(angle)-RECT[0][1]*math.sin(angle),
                     RECT[0][0]*math.sin(angle)+RECT[0][1]*math.cos(angle),0))
    assert (profiles[i].data.vertices[0].co-expected).length<1e-7
assert coordinates(profiles[1])==coordinates(profiles[2])
before=state(output,profiles)
for _ in range(12):
    rebuild_sweep(output)
assert state(output,profiles)==before
guide.data.vertices[1].co.x=.2
for vertex in profiles[1].data.vertices:
    vertex.co.x*=1.5
rebuild_sweep(output)
assert (center(output,1)-Vector((.2,0,1))).length<1e-6
expected_width=(profiles[1].data.vertices[1].co-profiles[1].data.vertices[0].co).length
assert abs((output.data.vertices[5].co-output.data.vertices[4].co).length-expected_width)<1e-6
after=state(output,profiles)
for _ in range(12):
    rebuild_sweep(output)
assert state(output,profiles)==after
''')

    def test_assembly_motion_guide_scale_and_planar_transform_baking(self):
        self.probe('''
output,guide,axis,profiles=objects(make())
output.matrix_world=Matrix.Translation((2,-3,.5)) @ Euler((.3,-.4,.2)).to_matrix().to_4x4() @ Matrix.Diagonal((2,1.5,.8,1))
original_matrix=output.matrix_world.copy()
guide.rotation_euler=(.1,.2,-.1)
guide.scale=(1,1,1.3)
profile=profiles[1]
prior=[v.co.copy() for v in profile.data.vertices]
edit=Matrix.Translation((.02,-.01,0)) @ Matrix.Rotation(.25,4,'Z') @ Matrix.Diagonal((1.4,.7,1,1))
profile.matrix_basis=profile.matrix_basis @ edit
bpy.context.view_layer.update()
rebuild_sweep(output)
assert output.matrix_world==original_matrix
for vertex,old in zip(profile.data.vertices,prior):
    assert (vertex.co-edit @ old).length<5e-7
assert (center(output,0)-guide.matrix_basis @ guide.data.vertices[0].co).length<1e-6
assert (center(output,2)-guide.matrix_basis @ guide.data.vertices[2].co).length<1e-6
after=state(output,profiles)
rebuild_sweep(output)
assert state(output,profiles)==after
''')

    def test_fixed_topology_preserves_mesh_identity_materials_and_layers(self):
        self.probe('''
output,guide,axis,profiles=objects(make())
add_layers(output)
identity,data=output,output.data
before=layers(output)
guide.data.vertices[1].co.y=.12
for vertex in profiles[1].data.vertices:
    vertex.co.y*=1.3
rebuild_sweep(output)
assert output is identity and output.data is data and layers(output)==before
# Local output modifiers remain ordinary editable post-processing.
bevel=output.modifiers.new('SmallBevel','BEVEL')
bevel.width=.002
rebuild_sweep(output)
assert output.modifiers[0]==bevel and layers(output)==before
''')

    def test_open_profiles_and_native_start_axis_are_real_inputs(self):
        self.probe('''
section=[(-.1,0),(.1,.04),(.15,0)]
report=create_sweep('Ribbon',CENTERS,[section]*3,(1,0,0),closed_profile=False)
output,guide,axis,profiles=objects(report)
assert len(output.data.vertices)==9 and len(output.data.polygons)==4
axis.data.vertices[1].co=(0,1,0)
rebuild_sweep(output)
assert (output.data.vertices[1].co-output.data.vertices[0].co-Vector((-.04,.2,0))).length<1e-6
before=state(output,profiles)
rebuild_sweep(output)
assert state(output,profiles)==before
solid=output.modifiers.new('ClothThickness','SOLIDIFY')
solid.thickness=.005
rebuild_sweep(output)
assert output.modifiers[0]==solid
''')

    def test_invalid_control_edits_ownership_and_state_do_not_mutate(self):
        self.probe('''
output,guide,axis,profiles=objects(make())
middle=guide.data.vertices[1].co.copy()
guide.data.vertices[1].co=guide.data.vertices[0].co
reject(output,profiles)
guide.data.vertices[1].co=middle
profiles[1].data.vertices[0].co.z=.01
reject(output,profiles)
profiles[1].data.vertices[0].co.z=0
matrix=profiles[1].matrix_basis.copy()
profiles[1].matrix_basis=matrix @ Matrix.Rotation(.2,4,'X')
reject(output,profiles)
profiles[1].matrix_basis=matrix
saved=list(profiles[1]['refas_sweep_frame'])
profiles[1]['refas_sweep_frame']=[0.]*16
reject(output,profiles)
profiles[1]['refas_sweep_frame']=saved
profiles[1]['refas_sweep_index']=2
reject(output,profiles)
profiles[1]['refas_sweep_index']=1
linked=bpy.data.objects.new('UnrelatedSharedMesh',profiles[1].data)
bpy.context.collection.objects.link(linked)
reject(output,profiles)
bpy.data.objects.remove(linked,do_unlink=True)
output.shape_key_add(name='Basis')
reject(output,profiles)
output.shape_key_clear()
import bmesh
bm=bmesh.new()
bm.from_mesh(output.data)
bm.verts.ensure_lookup_table()
extra=bm.edges.new((bm.verts[0],bm.verts[6]))
bm.to_mesh(output.data)
reject(output,profiles)
bm.edges.remove(extra)
bm.to_mesh(output.data)
bm.free()
guide.data.clear_geometry()
guide.data.from_pydata(CENTERS+[(0,0,3)],[(0,1),(1,2),(2,3)],[])
reject(output,profiles)
''')

    def test_float_realization_refuses_collapsed_or_shifted_geometry(self):
        self.probe('''
before=(sorted(bpy.data.objects.keys()),sorted(bpy.data.meshes.keys()))
for centers,profiles in [([(1e6,0,z) for z in (0,1,2)],[RECT]*3),
                          (CENTERS,[[(x*1e-7,y*1e-7) for x,y in RECT]]*3)]:
    try:
        create_sweep('Bad',centers,profiles,(1,0,0),closed_profile=True,cap_ends=True)
    except ValueError:
        pass
    else:
        raise AssertionError('unrepresentable sweep accepted')
    assert (sorted(bpy.data.objects.keys()),sorted(bpy.data.meshes.keys()))==before
output,guide,axis,profiles=objects(make())
output.location=(1e6,0,0)
reject(output,profiles)
''')

    def test_planarity_is_scaled_and_accepts_oblique_in_plane_edits(self):
        self.probe('''
tiny=[(x*1e-8,y*1e-8) for x,y in RECT]
report=create_sweep('Tiny',[(0,0,z) for z in (0,5e-8,1e-7)],[tiny]*3,(1,0,0),
                    closed_profile=True,cap_ends=True)
output,guide,axis,profiles=objects(report)
profiles[1].location.z+=5e-7
reject(output,profiles)
report=create_sweep('Oblique',[(0,0,0),(.15,.1,.5),(.4,.2,1)],[RECT]*3,(1,0,0),
                    closed_profile=True,cap_ends=True)
output,guide,axis,profiles=objects(report)
profile=profiles[1]
prior=[v.co.copy() for v in profile.data.vertices]
edit=Matrix.Translation((.01,-.005,0)) @ Matrix.Rotation(.15,4,'Z') @ Matrix.Diagonal((1.2,.8,1,1))
profile.matrix_basis=profile.matrix_basis @ edit
rebuild_sweep(output)
for vertex,old in zip(profile.data.vertices,prior):
    assert (vertex.co-edit @ old).length<5e-7
section=[(-.1,0),(.1,.04),(.15,0)]
output,guide,axis,profiles=objects(create_sweep('Open',CENTERS,[section]*3,(1,0,0),closed_profile=False))
profiles[1].matrix_basis=profiles[1].matrix_basis @ Matrix.Rotation(math.pi,4,'X')
reject(output,profiles)
''')

    def test_post_write_failure_rolls_back_output_controls_and_resources(self):
        self.probe('''
output,guide,axis,profiles=objects(make())
add_layers(output)
guide.data.vertices[1].co.x=.2
profiles[1].matrix_basis=profiles[1].matrix_basis @ Matrix.Rotation(.1,4,'Z')
before=state(output,profiles)
before_layers=layers(output)
old_post=sweep_scene._postcheck
calls=0
def fail_after_write(*args):
    global calls
    calls+=1
    raise ValueError('synthetic written-state failure')
sweep_scene._postcheck=fail_after_write
reject(output,profiles)
assert calls==1
assert state(output,profiles)==before and layers(output)==before_layers
resources=(sorted(bpy.data.objects.keys()),sorted(bpy.data.meshes.keys()))
try:
    make(name='FailedCreation')
except ValueError:
    pass
else:
    raise AssertionError('forced creation failure accepted')
assert calls==2
assert (sorted(bpy.data.objects.keys()),sorted(bpy.data.meshes.keys()))==resources
sweep_scene._postcheck=old_post
rebuild_sweep(output)
''')

    def test_installed_reopen_edit_delivery_and_exact_restore(self):
        project=self.root/"sweep-project"
        self.cli("init","--root",project,"--name","native-sweep")
        create=self.root/"create-sweep.py"
        create.write_text(SETUP+'''
output,guide,axis,profiles=objects(make())
add_layers(output)
bpy.ops.mesh.primitive_cube_add(size=.2,location=(3,0,0))
bpy.context.object.name='Neighbor'
''')
        flags=["--root",project,"--outputs","native","--views","","--blender",BLENDER]
        initial=self.cli("run",*flags,"--script",create,"--intent","make editable native sections")
        initial_bytes=Path(initial["outputs"]["blend"]).read_bytes()
        before={o["name"]:o for o in json.loads(Path(initial["outputs"]["scene"]).read_text())["objects"]}
        edit=self.root/"edit-sweep.py"
        edit.write_text('''import bpy
from sweep_scene import rebuild_sweep
output=bpy.data.objects['Sweep']
guide=output['refas_sweep_guide']
profile=output['refas_sweep_profiles']['1']
guide.data.vertices[1].co.x=.2
for vertex in profile.data.vertices:
    vertex.co.x*=1.5
rebuild_sweep(output)
''')
        revised=self.cli("run",*flags,"--script",edit,"--intent","rebuild from saved edited controls",
                         "--protect-object","Neighbor")
        after={o["name"]:o for o in json.loads(Path(revised["outputs"]["scene"]).read_text())["objects"]}
        self.assertEqual(before["Neighbor"],after["Neighbor"])
        self.assertNotEqual(before["Sweep"]["mesh"],after["Sweep"]["mesh"])
        self.assertNotIn("glb",revised["outputs"])
        delivered=self.cli("deliver","--root",project,"--views","","--blender",BLENDER)
        self.probe('''
original_layers=None
for path,kind in '''+repr([(initial["outputs"]["blend"],'before'),
                          (revised["outputs"]["blend"],'after'),
                          (delivered["outputs"]["blend"],'native'),
                          (delivered["outputs"]["glb"],'glb')])+''':
    if kind=='glb':
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.wm.open_mainfile(filepath=path,load_ui=False,use_scripts=False)
    output=bpy.data.objects['Sweep']
    if kind!='glb':
        guide=output['refas_sweep_guide']
        profiles=[output['refas_sweep_profiles'][str(i)] for i in range(3)]
        assert output['refas_sweep_caps'] is True and output['refas_sweep_closed'] is True
        assert all(p['refas_role']=='construction' and p.hide_render for p in [guide,output['refas_sweep_axis'],*profiles])
        before_state=state(output,profiles)
        rebuild_sweep(output)
        assert state(output,profiles)==before_state
        if original_layers is None:
            original_layers=layers(output)
        assert layers(output)==original_layers
        assert abs(center(output,1).x-(0 if kind=='before' else .2))<1e-6
        if kind=='native':
            guide.data.vertices[1].co.x=.25
            rebuild_sweep(output)
            assert abs(center(output,1).x-.25)<1e-6
    else:
        assert sorted(o.name for o in bpy.context.scene.objects)==['Neighbor','Sweep']
        assert len(output.data.vertices)>=12 and len(output.data.polygons)>0
        assert max(v.co.x for v in output.data.vertices)>.3
''')
        restored=self.cli("restore","--root",project,"--revision",initial["head"])
        self.assertEqual(Path(restored["outputs"]["blend"]).read_bytes(),initial_bytes)
        self.assertTrue(self.cli("verify","--root",project)["ok"])


if __name__=='__main__':
    unittest.main()

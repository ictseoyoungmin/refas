"""Independent native/GLB readback plus baseline/last-correction preservation.

Called inside a fresh two-thread Blender process. Extends the established
manifold/shared-armhole/GLB checks, and compares meshes canonically so Blender's
UV-sphere polygon allocation order cannot masquerade as a geometric edit.
"""
import bpy
import hashlib
import json
from pathlib import Path
import runpy
import sys

args = sys.argv[sys.argv.index('--')+1:]
native,glb,out,imported,baseline = map(Path,args[:5])
prior = Path(args[5]) if len(args)>5 else None
old_argv = sys.argv[:]
sys.argv = [__file__,'--',str(native),str(glb),str(out),str(imported)]
runpy.run_path(str(Path(__file__).with_name('inspect_fold.py')), run_name='__main__')
sys.argv = old_argv
report=json.loads(out.read_text())


def canonical_object(ob):
    me=ob.data
    # Cyclic face order is arbitrary, but winding and actual vertex indices
    # are preserved by this canonicalization. Vertex coordinate order is exact.
    faces=[]
    for face in me.polygons:
        ids=list(face.vertices)
        shift=ids.index(min(ids));ids=ids[shift:]+ids[:shift]
        faces.append((tuple(ids),face.material_index,face.use_smooth))
    data={'vertices':[list(v.co) for v in me.vertices], 'faces':sorted(faces),
          'matrix':[list(r) for r in ob.matrix_world],
          'materials':[m.name if m else None for m in me.materials],
          'modifiers':[(m.name,m.type,getattr(m,'levels',None),getattr(m,'thickness',None),getattr(m,'width',None)) for m in ob.modifiers]}
    return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()


def state(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    return {ob.name:canonical_object(ob) for ob in bpy.context.scene.objects if ob.type=='MESH'}


selected=state(native)
body=bpy.data.objects['Body | continuous open front and shoulder yoke']
selected_body_faces=[tuple(p.vertices) for p in body.data.polygons]
selected_body_positions=[list(v.co) for v in body.data.vertices]
selected_cuffs={n:v for n,v in selected.items() if n.startswith(('L_Cuff_','R_Cuff_'))}
selected_mat_names=sorted(m.name for m in bpy.data.materials)
selected_dimensions={key:bpy.context.scene.get(key) for key in ['nominal_shoulder_width_m','nominal_back_length_m','nominal_sleeve_axis_m']}
baseline_state=state(baseline)
body=bpy.data.objects['Body | continuous open front and shoulder yoke']
assert selected_body_faces==[tuple(p.vertices) for p in body.data.polygons]
baseline_dimensions={key:bpy.context.scene.get(key) for key in selected_dimensions}
assert selected_dimensions==baseline_dimensions
positions=[list(v.co) for v in body.data.vertices]
max_displacement=max(sum((a-b)**2 for a,b in zip(p,q))**.5 for p,q in zip(positions,selected_body_positions))
report['baseline_preservation']={'body_cage_topology_exact':True,'nominal_dimension_metadata_exact':True,
    'nominal_dimensions':selected_dimensions,'body_maximum_cage_displacement_m':max_displacement,
    'left_cuff_names':sorted(n for n in selected_cuffs if n.startswith('L_Cuff_')),
    'right_cuff_names':sorted(n for n in selected_cuffs if n.startswith('R_Cuff_')),
    'original_material_names_in_selected_native':sorted(set(m.name for m in bpy.data.materials)&set(selected_mat_names)),
    'original_unused_material_names_absent_in_selected_native':sorted(set(m.name for m in bpy.data.materials)-set(selected_mat_names))}
assert len(report['baseline_preservation']['left_cuff_names'])==8
if prior:
    previous=state(prior)
    assert set(previous)==set(selected)
    changed=sorted(n for n in previous if previous[n]!=selected[n])
    assert changed==['L Identity | front lower draped chain'],changed
    report['last_correction_preservation']={'prior_native':str(prior),'changed_geometry_objects':changed,
        'other_mesh_geometry_materials_and_transforms_canonically_exact':True,
        'protected_mesh_objects':len(selected)-len(changed),
        'note':'Nine newly authored sphere beads/studs may have different polygon allocation order; canonical vertex/face geometry is identical.'}
out.write_text(json.dumps(report,indent=2)+'\n')
print('IDENTITY_INDEPENDENT_CHECK',json.dumps({k:v for k,v in report.items() if k not in ['native_object_states','imported_object_states']}))

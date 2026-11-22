"""Independent native topology readback and neutral GLB materialization.

Run in factory-startup Blender with arguments after --:
  selected.blend selected.glb refinement-summary.json report.json reimport.blend
The output reimport.blend is a disposable observation copy of the GLB.
"""
import bpy
import bmesh
import hashlib
import json
from pathlib import Path
import sys

native,glb,summary_path,report_path,readback_path=sys.argv[sys.argv.index('--')+1:]
summary=json.loads(Path(summary_path).read_text())
bpy.ops.wm.open_mainfile(filepath=str(Path(native).resolve()))
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
shells=[]
for name in summary['changed_existing_objects']:
    ob=bpy.data.objects[name]
    if ob.type!='MESH':
        continue
    ev=ob.evaluated_get(deps);data=ev.to_mesh()
    bm=bmesh.new();bm.from_mesh(data)
    boundary=sum(e.is_boundary for e in bm.edges)
    nonmanifold=sum(not e.is_manifold for e in bm.edges)
    zero=sum(f.calc_area()<1e-14 for f in bm.faces)
    pts=[ob.matrix_world@v.co for v in data.vertices]
    mn=[min(v[i] for v in pts) for i in range(3)]
    mx=[max(v[i] for v in pts) for i in range(3)]
    shells.append({'name':name,'evaluated_vertices':len(data.vertices),
                   'boundary_edges':boundary,'nonmanifold_edges':nonmanifold,
                   'zero_area_faces':zero,'world_bounds_min_m':mn,
                   'world_bounds_max_m':mx,
                   'world_size_m':[mx[i]-mn[i] for i in range(3)],
                   'shell_modifiers':[{'name':m.name,'thickness_local_m':m.thickness,
                                       'object_scale':list(ob.scale)}
                                      for m in ob.modifiers if m.type=='SOLIDIFY']})
    bm.free();ev.to_mesh_clear()
pivots={ob.name:{'parent':ob.parent.name if ob.parent else None,
                 'world_origin':list(ob.matrix_world.translation)}
        for ob in bpy.context.scene.objects if ob.type=='EMPTY'}
report={'native_sha256':hashlib.sha256(Path(native).read_bytes()).hexdigest(),
        'glb_sha256':hashlib.sha256(Path(glb).read_bytes()).hexdigest(),
        'changed_mesh_inspection':shells,'pivots':pivots,
        'limits':'Native evaluated topology and sizes only. Closed surfaces do not prove absence of inter-object penetration or valid fabrication. Socket annuli and decorative glyphs can retain open/degenerate historical details; inspect each named row.'}
Path(report_path).write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(glb).resolve()))
bpy.ops.wm.save_as_mainfile(filepath=str(Path(readback_path).resolve()))

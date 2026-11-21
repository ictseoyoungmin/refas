"""Translate only the service cover subtree by +3 mm in its local Y normal.

Object-level measurements are generated inside the actual loaded native scene.
They compare geometry, topology, UVs, modifiers, materials, parenting and both
local/world transforms. This is deliberately separate from visual acceptance.
"""
import bpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector

def digest(data):
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def matrix(m):return [[float(v) for v in row] for row in m]

def scalar(v):
    if isinstance(v,(str,bool,int,float)) or v is None:return v
    try:return [scalar(x) for x in v]
    except TypeError:return getattr(v,'name',str(type(v)))

def mat_data(mat):
    if not mat:return None
    nodes=[]
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            nodes.append({'name':n.name,'type':n.bl_idname,'inputs':{i.identifier:scalar(i.default_value) for i in n.inputs if hasattr(i,'default_value')}})
    return {'name':mat.name,'color':list(mat.diffuse_color),'nodes':nodes}

def snapshot():
    bpy.context.view_layer.update();data={}
    for o in bpy.context.scene.objects:
        if not o.get('aurix_asset'):continue
        g=None
        if o.type=='MESH':
            g={'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(f.vertices) for f in o.data.polygons],
               'material_indices':[p.material_index for p in o.data.polygons],
               'uv':{u.name:[list(p.uv) for p in u.data] for u in o.data.uv_layers}}
        mods=[]
        for m in o.modifiers:
            props={}
            for p in m.bl_rna.properties:
                if p.identifier=='rna_type' or p.is_readonly:continue
                try:props[p.identifier]=scalar(getattr(m,p.identifier))
                except Exception:pass
            mods.append({'type':m.type,'properties':props})
        data[o.name]={'type':o.type,'parent':o.parent.name if o.parent else None,
                      'geometry':digest(g),'materials':digest([mat_data(s.material) for s in o.material_slots]),
                      'modifiers':digest(mods),'matrix_basis':matrix(o.matrix_basis),
                      'matrix_parent_inverse':matrix(o.matrix_parent_inverse),'matrix_world':matrix(o.matrix_world)}
    return data

cover=bpy.data.objects['SERVICE_COVER']
selected={cover.name}|{o.name for o in cover.children_recursive}
before=snapshot();origin=cover.matrix_world.translation.copy()
normal=Vector(cover['edit_normal_local']).normalized()
cover.location+=normal*.003
bpy.context.view_layer.update();after=snapshot()
unrelated=[n for n in before if n not in selected]
unexpected=[n for n in unrelated if before[n]!=after[n]]
geometry_changes=[n for n in before if any(before[n][k]!=after[n][k] for k in ['geometry','materials','modifiers','parent'])]
displacements={}
for n in sorted(selected):
    a=Vector([before[n]['matrix_world'][i][3] for i in range(3)])
    b=Vector([after[n]['matrix_world'][i][3] for i in range(3)])
    displacements[n]=list(b-a)
delta=cover.matrix_world.translation-origin
result={
 'operation':'translate removable service-cover subtree',
 'normal_local':list(normal),'requested_distance_m':.003,'measured_group_world_delta_m':list(delta),
 'selected_count':len(selected),'unrelated_count':len(unrelated),
 'selected_objects':sorted(selected),'changed_objects':[n for n in before if before[n]!=after[n]],
 'unrelated_changed':unexpected,'geometry_material_modifier_or_parent_changes':geometry_changes,
 'selected_displacements_m':displacements,
 'preservation_pass':not unexpected and not geometry_changes,
 'displacement_pass':all(abs(d[0])<1e-7 and abs(d[1]-.003)<1e-7 and abs(d[2])<1e-7 for d in displacements.values()),
 'before':before,'after':after,
 'measurement_limit':'float32 Blender matrices; displacement tolerance 1e-7 m; no claim of physical fit'
}
Path(REFAS_OUTPUT_DIR,'panel-preservation.json').write_text(json.dumps(result,indent=2))
assert result['preservation_pass'], 'Unrelated object or selected geometry/material/modifier changed'
assert result['displacement_pass'], 'Cover subtree did not move uniformly by declared 3 mm normal'

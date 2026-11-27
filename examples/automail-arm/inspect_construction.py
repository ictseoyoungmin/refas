"""Independent native topology and GLB hierarchy/pose readback.

Arguments: baseline.blend native.blend asset.glb scene.json construction-report.json output.json readback.blend
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
import sys
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree

baseline,native,glb,scene_file,changes_file,output,readback=sys.argv[sys.argv.index('--')+1:]
expected=json.loads(Path(scene_file).read_text())
changes=json.loads(Path(changes_file).read_text())

def matrix(m):return [[float(v) for v in row] for row in m]
def scalar(value):
    if value is None or isinstance(value,(bool,int,float,str)):return value
    try:return [scalar(v) for v in value]
    except TypeError:return getattr(value,'name',str(type(value)))
def material_snapshot(m):
    return {'name':m.name,'use_nodes':m.use_nodes,'diffuse_color':list(m.diffuse_color),
            'metallic':m.metallic,'roughness':m.roughness,
            'nodes':[{'name':n.name,'type':n.bl_idname,
                      'inputs':{i.identifier:scalar(i.default_value) for i in n.inputs if hasattr(i,'default_value')}}
                     for n in m.node_tree.nodes] if m.use_nodes else [],
            'links':[{'from_node':l.from_node.name,'from_socket':l.from_socket.identifier,
                      'to_node':l.to_node.name,'to_socket':l.to_socket.identifier} for l in m.node_tree.links] if m.use_nodes else []}
def native_identity():
    bpy.context.view_layer.update()
    return {'objects':{o.name:{'type':o.type,'parent':o.parent.name if o.parent else None,
                              'matrix_basis':matrix(o.matrix_basis),'matrix_parent_inverse':matrix(o.matrix_parent_inverse),
                              'matrix_world':matrix(o.matrix_world),
                              'material_slots':[s.material.name if s.material else None for s in o.material_slots]}
                       for o in bpy.context.scene.objects if o.get('aurix_asset')},
            'materials':{m.name:hashlib.sha256(json.dumps(material_snapshot(m),sort_keys=True).encode()).hexdigest()
                         for m in bpy.data.materials}}
bpy.ops.wm.open_mainfile(filepath=str(Path(baseline).resolve()))
baseline_identity=native_identity()
bpy.ops.wm.open_mainfile(filepath=str(Path(native).resolve()))
bpy.context.view_layer.update(); deps=bpy.context.evaluated_depsgraph_get()
candidate_identity=native_identity();identity_errors=[];allowed_marking_transforms=[];allowed_material_assignments=[]
for name,before in baseline_identity['objects'].items():
    after=candidate_identity['objects'].get(name)
    if after is None: identity_errors.append({'name':name,'error':'missing original object'});continue
    for field in before:
        if before[field] != after[field]:
            row={'name':name,'field':field,'before':before[field],'after':after[field]}
            if name in {'Crown_A_mark','Crown_AURIX'} and field in {'matrix_basis','matrix_world'}:
                allowed_marking_transforms.append(row)
            elif field=='material_slots' and name in changes['changed_existing_objects']:
                allowed_material_assignments.append(row)
            else:identity_errors.append(row)
material_errors=[name for name,digest in baseline_identity['materials'].items()
                 if candidate_identity['materials'].get(name)!=digest]
identity_check={'original_object_count':len(baseline_identity['objects']),
    'original_pivot_count':sum(o['type']=='EMPTY' for o in baseline_identity['objects'].values()),
    'all_original_parent_basis_parent_inverse_world_and_material_slot_comparisons':True,
    'allowed_crown_marking_transform_changes':allowed_marking_transforms,'unexpected_original_changes':identity_errors,
    'declared_material_assignment_changes':allowed_material_assignments,
    'original_material_count':len(baseline_identity['materials']),
    'original_material_hashes':baseline_identity['materials'],'candidate_original_material_hashes':{n:candidate_identity['materials'].get(n) for n in baseline_identity['materials']},
    'changed_original_material_datablocks':material_errors,
    'passed':not identity_errors and not material_errors}
topology=[]
for name in sorted(set(changes['changed_existing_objects']+changes['added_objects'])):
    ob=bpy.data.objects[name]
    if ob.type!='MESH': continue
    ev=ob.evaluated_get(deps); data=ev.to_mesh()
    bm=bmesh.new(); bm.from_mesh(data)
    topology.append({'name':name,'evaluated_vertices':len(data.vertices),
        'boundary_edges':sum(e.is_boundary for e in bm.edges),
        'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'zero_area_faces':sum(f.calc_area()<1e-14 for f in bm.faces)})
    bm.free();ev.to_mesh_clear()
native_pivots={o.name:{'parent':o.parent.name if o.parent else None,'origin':list(o.matrix_world.translation)}
               for o in bpy.context.scene.objects if o.type=='EMPTY'}
def tree(o):
    ev=o.evaluated_get(deps);data=ev.to_mesh();data.calc_loop_triangles()
    result=BVHTree.FromPolygons([ev.matrix_world@v.co for v in data.vertices],[tuple(t.vertices) for t in data.loop_triangles],all_triangles=True)
    ev.to_mesh_clear();return result
lid_names=['Service_cover_graphite']+['Service_cover_vent_%02d'%i for i in range(10)]
cartridge_names=[prefix+str(side) for side in [-1,1] for prefix in ['Forearm_power_cell_','Forearm_power_gland_','Forearm_elbow_rod_','Service_cartridge_sleeve_','Service_cartridge_lower_band_','Service_cartridge_upper_band_']]
service_trees={n:tree(bpy.data.objects[n]) for n in lid_names+cartridge_names}
service_intersections=[]
for a in lid_names:
    for b in cartridge_names:
        hits=service_trees[a].overlap(service_trees[b])
        if hits:service_intersections.append({'lid':a,'cartridge':b,'overlapping_triangle_pairs':len(hits)})
service_check={'lid_parts':lid_names,'bay_components':cartridge_names,'pairs_tested':len(lid_names)*len(cartridge_names),
               'surface_intersections':service_intersections,'passed':not service_intersections,
               'limits':'Triangle-surface intersection check of neutral cover body/ribs versus paired cartridges only; no containment or complete clearance assertion.'}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(glb).resolve()))
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(Path(readback).resolve()))
names={o.name:o for o in bpy.context.scene.objects}
expected_objects={o['name']:o for o in expected['objects'] if o['type'] in {'MESH','EMPTY'}}
missing=sorted(set(expected_objects)-set(names));extra=sorted(set(names)-set(expected_objects))
parent_mismatch=[];matrix_errors={}
for n,v in expected_objects.items():
    if n not in names: continue
    parent=names[n].parent.name if names[n].parent else None
    if parent!=v['parent']: parent_mismatch.append({'object':n,'expected':v['parent'],'actual':parent})
    error=max(abs(names[n].matrix_world[i][j]-v['matrixWorld'][i][j]) for i in range(4) for j in range(4))
    if error>1e-5:matrix_errors[n]=error
verts=[o.matrix_world@v.co for o in names.values() if o.type=='MESH' for v in o.data.vertices]
mn=[min(v[i] for v in verts) for i in range(3)];mx=[max(v[i] for v in verts) for i in range(3)]
bounds_error=max([abs(mn[i]-expected['bounds']['min'][i]) for i in range(3)]+
                 [abs(mx[i]-expected['bounds']['max'][i]) for i in range(3)])
required={'SHOULDER_PIVOT':'AURIX_ROOT','ELBOW_PIVOT':'SHOULDER_PIVOT','WRIST_PIVOT':'ELBOW_PIVOT','SERVICE_COVER':'ELBOW_PIVOT'}
for digit in ['THUMB','INDEX','MIDDLE','RING','LITTLE']:
    required[digit+'_J0']='WRIST_PIVOT';required[digit+'_J1']=digit+'_J0';required[digit+'_J2']=digit+'_J1'
required.update(changes['added_object_parents'])
relations={n:names[n].parent.name if n in names and names[n].parent else None for n in required}
local_centers={n:sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices)
               for n,o in names.items() if o.type=='MESH'}
def points():return {n:names[n].matrix_world@c for n,c in local_centers.items()}
def matrices():return {n:tuple(v for row in o.matrix_world for v in row) for n,o in names.items()}

# Cover displacement on the independently materialized GLB, with all other
# nodes unchanged. Restore the exact pre-test basis afterward.
panel=names['SERVICE_COVER'];selected={panel.name}|{o.name for o in panel.children_recursive}
before=matrices();saved=panel.matrix_basis.copy();panel.location.y+=.003
bpy.context.view_layer.update();after=matrices()
unrelated=[n for n in names if n not in selected and before[n]!=after[n]]
deltas={n:[after[n][i]-before[n][i] for i in [3,7,11]] for n in selected}
panel_ok=not unrelated and all(abs(d[0])<1e-6 and abs(d[1]-.003)<1e-6 and abs(d[2])<1e-6 for d in deltas.values())
panel.matrix_basis=saved;bpy.context.view_layer.update()

# Independent single-pivot samples predict every descendant mesh centroid,
# including new mechanism/carrier meshes; non-descendants must remain fixed.
poses=[]
for pivot_name,degrees in [('ELBOW_PIVOT',45),('ELBOW_PIVOT',90),('WRIST_PIVOT',20),('INDEX_J0',35),('INDEX_J1',20),('INDEX_J2',10)]:
    pivot=names[pivot_name];descendants={o.name for o in pivot.children_recursive}
    start_points=points();start_mats=matrices();saved=pivot.matrix_basis.copy()
    center=pivot.matrix_world.translation.copy();axis=(pivot.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
    rotation=Quaternion(axis,math.radians(degrees))
    pivot.rotation_mode='XYZ';pivot.rotation_euler.x+=math.radians(degrees)
    bpy.context.view_layer.update();end_points=points();end_mats=matrices()
    errors={n:(end_points[n]-(center+rotation@(start_points[n]-center))).length for n in start_points if n in descendants}
    unexpected=[n for n in names if n not in descendants and n!=pivot_name and start_mats[n]!=end_mats[n]]
    poses.append({'pivot':pivot_name,'degrees':degrees,'descendant_mesh_count':len(errors),
                  'added_descendants':sorted(set(changes['added_objects'])&descendants),
                  'max_centroid_orbit_error_m':max(errors.values(),default=0),'unexpected_unrelated_changes':unexpected,
                  'passed':not unexpected and all(e<1e-5 for e in errors.values())})
    pivot.matrix_basis=saved;bpy.context.view_layer.update()

report={'mode':'Independent Blender factory-startup native/GLB readback','baseline_sha256':hashlib.sha256(Path(baseline).read_bytes()).hexdigest(),
        'baseline_to_selected_identity':identity_check,'neutral_service_lid_cartridge_clearance':service_check,
        'native_sha256':hashlib.sha256(Path(native).read_bytes()).hexdigest(),
        'glb_sha256':hashlib.sha256(Path(glb).read_bytes()).hexdigest(),'native_changed_and_added_topology':topology,
        'native_pivots':native_pivots,'missing_objects':missing,'extra_objects':extra,
        'parent_mismatches':parent_mismatch,'matrix_errors_over_1e_5':matrix_errors,'bounds_max_error_m':bounds_error,
        'required_parent_relationships':relations,'required_parent_relationships_pass':all(relations[n]==p for n,p in required.items()),
        'exported_panel_edit':{'selected_count':len(selected),'unrelated_changed':unrelated,'displacements_m':deltas,'passed':panel_ok},
        'exported_rigid_pose_samples':poses,
        'limits':'Topology rows and named-node hierarchy/centroid motion only. Closed meshes do not prove inter-part clearance. No engine, skinning, UV/bake, continuous collision or physical linkage claim.'}
report['passed']=identity_check['passed'] and service_check['passed'] and not missing and not extra and not parent_mismatch and not matrix_errors and bounds_error<1e-5 and report['required_parent_relationships_pass'] and panel_ok and all(p['passed'] for p in poses)
Path(output).write_text(json.dumps(report,indent=2)+'\n')
assert report['passed'],'Independent hierarchy or rigid motion readback failed'

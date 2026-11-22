"""Additional construction-parent and rigid-motion checks after pose_check.py.

Only the declared elbow, wrist and index rotations are used. Each added mesh's
centroid is independently predicted from neutral joint centers, then compared
with its actual posed centroid. This is not an all-object collision test.
"""
from mathutils import Quaternion

joint_names=['ELBOW_PIVOT','WRIST_PIVOT','INDEX_J0','INDEX_J1','INDEX_J2']
angles=[cfg['elbow_deg'],cfg.get('wrist_deg',0)]+cfg.get('index_deg',[0,0,0])
angles=dict(zip(joint_names,angles))
parts={o.name:o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('construction_parent')}
parent_errors=[{'name':n,'expected':o['construction_parent'],'actual':o.parent.name if o.parent else None}
               for n,o in parts.items() if not o.parent or o.parent.name!=o['construction_parent']]
local_centers={n:sum((v.co for v in o.data.vertices),Vector())/len(o.data.vertices) for n,o in parts.items()}
saved={n:bpy.data.objects[n].rotation_euler.copy() for n in joint_names}
for n in joint_names: bpy.data.objects[n].rotation_euler=(0,0,0)
bpy.context.view_layer.update()
neutral={n:o.matrix_world@local_centers[n] for n,o in parts.items()}
origins={n:bpy.data.objects[n].matrix_world.translation.copy() for n in joint_names}
for n in joint_names: bpy.data.objects[n].rotation_euler=saved[n]
bpy.context.view_layer.update()
rows=[]
for n,o in parts.items():
    chain=[]; p=o.parent
    while p:
        if p.name in joint_names: chain.append(p.name)
        p=p.parent
    expected=neutral[n].copy()
    for pivot_name in chain:
        center=origins[pivot_name]
        expected=center+Quaternion(Vector((1,0,0)),math.radians(angles[pivot_name]))@(expected-center)
    actual=o.matrix_world@local_centers[n]
    rows.append({'name':n,'parent':o.parent.name,'joint_chain_deepest_first':chain,
                 'expected_world_centroid_m':list(expected),'actual_world_centroid_m':list(actual),
                 'orbit_error_m':(actual-expected).length,'movement_m':(actual-neutral[n]).length})
upper_shells=upper_names+[n for n in parts if n.startswith('Upper_blade_carrier_')]
fore_shells=fore_names+[n for n in parts if n.startswith(('Forearm_recessed_carrier_','Forearm_lateral_underlayer_'))]
shell_trees={n:bvh(bpy.data.objects[n]) for n in upper_shells+fore_shells}
carrier_intersections=[]
for a in upper_shells:
    for b in fore_shells:
        hits=shell_trees[a].overlap(shell_trees[b])
        if hits:carrier_intersections.append({'upper':a,'forearm':b,'overlapping_triangle_pairs':len(hits)})
result={'pose':cfg,'added_mesh_count':len(parts),'parent_mismatches':parent_errors,
        'centroid_orbits':rows,'max_orbit_error_m':max((r['orbit_error_m'] for r in rows),default=0),
        'named_upper_forearm_shell_pairs_including_carriers':len(upper_shells)*len(fore_shells),
        'named_upper_forearm_shell_intersections_including_carriers':carrier_intersections,
        'passed':not parent_errors and not carrier_intersections and all(r['orbit_error_m']<1e-6 for r in rows),
        'limits':'Declared new meshes and sampled rigid centroid motion, plus named upper/forearm shell and carrier surface intersections only. No continuous or complete collision assertion.'}
Path(REFAS_OUTPUT_DIR,'construction-pose-check.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['passed'],'New construction mesh did not follow its declared segment/pivot'

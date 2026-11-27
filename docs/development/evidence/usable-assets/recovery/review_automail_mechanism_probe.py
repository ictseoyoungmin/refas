"""Independent read-only source-preservation and rotary-joint probe.

Run with Blender --background --threads 2 --python this_file -- arguments.
The detailed precursor retains original part names. The delivered consolidation
is checked separately through its part map and actual sampled rigid transforms.
This is a geometric motion observation, not a load/physics certification.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
for flag in ('source', 'detailed', 'candidate', 'construction', 'out'):
    p.add_argument('--' + flag, type=Path, required=True)
p.add_argument('--additional-part-repair', action='append', default=[],
               help='Explicitly declared later repair excluded from exact original-vertex identity.')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])


def open_native(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def capture(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    vertices = [ev.matrix_world @ v.co for v in mesh.vertices]
    triangles = len(mesh.loop_triangles)
    ev.to_mesh_clear()
    return vertices, triangles


def bounds(vertices):
    return {'min': [min(v[i] for v in vertices) for i in range(3)],
            'max': [max(v[i] for v in vertices) for i in range(3)]}


def pivots():
    return {o.name: [list(row) for row in o.matrix_world]
            for o in bpy.context.scene.objects if o.type == 'EMPTY'}


open_native(a.source)
source_pivots = pivots()
source = {o.name: capture(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
source_parents = {o.name: o.parent.name if o.parent else None
                  for o in bpy.context.scene.objects if o.type == 'MESH'}
open_native(a.detailed)
detailed_pivots = pivots()
detailed = {o.name: capture(o) for o in bpy.context.scene.objects if o.type == 'MESH'}
changed_geometry = {'Palm_graphite_body', 'Wrist_side_ring_-1', 'Wrist_side_ring_1',
                    'Upper_exposed_hydraulic_-1', 'Upper_exposed_hydraulic_1'}
changed_geometry.update(a.additional_part_repair)
unchanged = []
for name in sorted(set(source) & set(detailed) - changed_geometry):
    sv, st = source[name]
    dv, dt = detailed[name]
    unchanged.append({'object': name, 'sourceVertices': len(sv), 'detailedVertices': len(dv),
                      'sourceTriangles': st, 'detailedTriangles': dt,
                      'maxCorrespondingWorldVertexErrorM':
                      max((x-y).length for x, y in zip(sv, dv)) if len(sv) == len(dv) else None,
                      'parentPreserved': source_parents[name] ==
                      (bpy.data.objects[name].parent.name if bpy.data.objects[name].parent else None)})

mechanical_names = [n for n in source if any(t in n.lower() for t in
                    ('hydraulic', 'rod', 'hose', 'pipe', 'cable', 'cylinder',
                     'gland', 'tendon', 'cartridge', 'actuator', 'rail', 'return', 'axle'))]
mechanical = [{'object': n, 'sourceParent': source_parents[n],
               'sourceBoundsM': bounds(source[n][0]),
               'detailedBoundsM': bounds(detailed[n][0]) if n in detailed else None}
              for n in sorted(mechanical_names)]

# These axes come from the original source geometry. Neutral evaluated bounds
# below expose the actual shaft/ring locations, independently of parenting.
joint_parts = [('elbow', 'Elbow_fixed_axle', 'Elbow_central_rotor', (0, 0, .426)),
               ('wrist', 'Wrist_gimbal_axle', 'Wrist_rotating_stem', (0, 0, .193))]
observations = []
for joint, fixed, moving, center in joint_parts:
    f, m = bpy.data.objects[fixed], bpy.data.objects[moving]
    point = Vector(center)
    x = point + Vector((1, 0, 0))
    observations.append({'joint': joint, 'fixed': fixed, 'moving': moving,
                         'fixedBoundsM': bounds(detailed[fixed][0]),
                         'movingBoundsM': bounds(detailed[moving][0]),
                         'neutralCenterM': list(point),
                         '_fp': f.matrix_world.inverted() @ point,
                         '_mp': m.matrix_world.inverted() @ point,
                         '_fx': f.matrix_world.inverted() @ x,
                         '_mx': m.matrix_world.inverted() @ x,
                         'maxAxisCenterSeparationM': 0.0, 'maxAxisCrossMagnitude': 0.0})
for frame in range(1, 122):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    for row in observations:
        f, m = bpy.data.objects[row['fixed']], bpy.data.objects[row['moving']]
        fp, mp = f.matrix_world @ row['_fp'], m.matrix_world @ row['_mp']
        fx = (f.matrix_world @ row['_fx'] - fp).normalized()
        mx = (m.matrix_world @ row['_mx'] - mp).normalized()
        row['maxAxisCenterSeparationM'] = max(row['maxAxisCenterSeparationM'], (fp-mp).length)
        row['maxAxisCrossMagnitude'] = max(row['maxAxisCrossMagnitude'], fx.cross(mx).length)
for row in observations:
    for key in list(row):
        if key.startswith('_'):
            del row[key]

construction = json.loads(a.construction.read_text())
mapping = construction['sourceToDelivery']
mapped_parts = [part for group in mapping.values() for part in group]
open_native(a.candidate)
candidate_pivots = pivots()
actual_names = {o.name for o in bpy.context.scene.objects}
delivery_observations = []
for joint, fixed, moving, center in joint_parts:
    matches = [[name for name, parts in mapping.items() if part in parts] for part in (fixed, moving)]
    if any(len(names) != 1 for names in matches):
        delivery_observations.append({'joint': joint, 'mappingError': matches})
        continue
    fixed_name, moving_name = matches[0][0], matches[1][0]
    f, m = bpy.data.objects[fixed_name], bpy.data.objects[moving_name]
    point = Vector(center)
    fp_local, mp_local = f.matrix_world.inverted() @ point, m.matrix_world.inverted() @ point
    max_separation = 0
    for frame in range(1, 122):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        max_separation = max(max_separation, (f.matrix_world @ fp_local-m.matrix_world @ mp_local).length)
    delivery_observations.append({'joint': joint, 'fixedDeliveryMesh': fixed_name,
                                  'movingDeliveryMesh': moving_name,
                                  'maxAxisCenterSeparationM': max_separation})
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

result = {
    'scope': 'Read-only source-to-detailed comparison and 121-frame rigid axis contact observation; no saved input mutation, dynamics, load or exhaustive collision claim.',
    'inputs': {flag: {'path': str(getattr(a, flag)),
                      'sha256': hashlib.sha256(getattr(a, flag).read_bytes()).hexdigest()}
               for flag in ('source', 'detailed', 'candidate', 'construction')},
    'sourceMeshes': len(source), 'detailedMeshes': len(detailed),
    'missingSourceMeshesInDetailed': sorted(set(source)-set(detailed)),
    'extraDetailedMeshes': sorted(set(detailed)-set(source)),
    'deliberatelyRebuiltSourceParts': sorted(changed_geometry),
    'unchangedParts': unchanged,
    'sourcePivots': source_pivots, 'detailedPivots': detailed_pivots,
    'candidatePivots': candidate_pivots, 'mechanicalSourceInventory': mechanical,
    'detailedRotaryAxisMotion': observations, 'deliveryRotaryAxisMotion': delivery_observations,
    'unmappedDetailedParts': sorted(set(detailed)-set(mapped_parts)),
    'duplicateMappedParts': sorted(n for n in set(mapped_parts) if mapped_parts.count(n) > 1),
    'missingDeliveryMeshes': sorted(set(mapping)-actual_names),
    'inventedElbowLinkObjects': sorted(n for n in actual_names if n.startswith('Elbow_link_')),
}
a.out.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k not in
                 ('unchangedParts', 'sourcePivots', 'detailedPivots', 'candidatePivots', 'mechanicalSourceInventory')}))

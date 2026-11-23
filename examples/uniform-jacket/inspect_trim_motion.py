"""Read-only full motion self-contact, orientation and coordinate preservation."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--repo', type=Path, required=True)
p.add_argument('--candidate-helper', type=Path)
p.add_argument('--native', type=Path, required=True)
p.add_argument('--baseline', type=Path)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--frames', nargs='+', type=int, default=list(range(1,98)))
a = p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.candidate_helper = a.candidate_helper or a.repo/'examples/uniform-jacket/conservative_candidates.py'
helper_sha = hashlib.sha256(a.candidate_helper.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('refas_trim_contact_candidates', a.candidate_helper)
contact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contact)
assert hashlib.sha256(a.candidate_helper.read_bytes()).hexdigest() == helper_sha, 'Contact helper changed during import'

MAIN = {'Body | continuous open front and shoulder yoke', 'Collar | standing back and neck facing'}
def selected():
    return sorted((o for o in bpy.context.scene.objects if o.type == 'MESH'
        and str(o.get('wearable_weight_policy','')).startswith('Smooth torso/')
        and o.name not in MAIN), key=lambda o:o.name)

def coordinates(mesh):
    data = np.empty(len(mesh.vertices)*3, dtype=np.float32)
    mesh.vertices.foreach_get('co', data)
    return data.reshape(-1,3)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def digest(data):
    return hashlib.sha256(np.ascontiguousarray(data).tobytes()).hexdigest()

assert not a.out.exists(), 'A new output file is required'
input_hashes = {'native':sha(a.native)}
original_positions = {}
if a.baseline:
    input_hashes['baseline'] = sha(a.baseline)
    bpy.ops.wm.open_mainfile(filepath=str(a.baseline))
    objects = selected()
    for frame in a.frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        original_positions[frame] = {}
        for obj in objects:
            ev = obj.evaluated_get(graph)
            mesh = ev.to_mesh()
            original_positions[frame][obj.name] = digest(coordinates(mesh))
            ev.to_mesh_clear()
        if frame%12 == 1:
            print('BASELINE', frame, flush=True)

bpy.ops.wm.open_mainfile(filepath=str(a.native))
objects = selected()
report = {'schema':'refas.trim-motion-topology/v1', 'native':str(a.native),
    'baseline':str(a.baseline) if a.baseline else None, 'inputSha256':input_hashes,
    'scriptSha256':sha(__file__), 'contactCandidateHelperSha256':helper_sha,
    'contactMethod':'Conservative float64 AABB candidates via bounding spheres, followed by batched float64 SAT including coplanar touch. Padding only expands candidates; no physical penetration allowance.', 'frames':a.frames, 'selectedObjectNames':[o.name for o in objects],
    'orientationScope':'Positive oriented triangle normal dot with frame-1 normal over the declared limited motion; degeneracy and fixed topology checked independently.',
    'observations':[]}
rest = {}
for frame in a.frames:
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        ev = obj.evaluated_get(graph)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        local = coordinates(mesh)
        points = np.asarray([list(ev.matrix_world @ v.co) for v in mesh.vertices], dtype=np.float64)
        triangles = np.asarray([tuple(t.vertices) for t in mesh.loop_triangles], dtype=np.int32)
        contacts = contact.confirmed_pairs(points, triangles, padding=1e-7,
                                           exclude_shared_vertices=True).tolist()
        cross = np.cross(points[triangles[:,1]]-points[triangles[:,0]], points[triangles[:,2]]-points[triangles[:,0]])
        lengths = np.linalg.norm(cross,axis=1)
        if frame == a.frames[0]:
            rest[obj.name] = {'triangles':triangles.copy(), 'cross':cross.copy(), 'lengths':lengths.copy()}
        ref = rest[obj.name]
        stable = np.array_equal(ref['triangles'],triangles)
        normal_dots = np.sum(ref['cross']*cross,axis=1)/(lengths*ref['lengths']) if stable else np.asarray([-1.0])
        row = {'object':obj.name, 'frame':frame, 'triangles':len(triangles),
            'contacts':len(contacts), 'contactExamples':[{'triangles':[i,j], 'vertices':[triangles[i].tolist(),triangles[j].tolist()]} for i,j in contacts[:12]],
            'degenerateTriangles':int(np.sum(lengths==0)), 'minimumDoubleArea':float(lengths.min()),
            'fixedTriangulation':stable, 'nonPositiveOrientationDots':int(np.sum(normal_dots<=0)),
            'minimumOrientationDot':float(normal_dots.min()),
            'evaluatedCoordinatesIdentical':digest(local)==original_positions[frame].get(obj.name) if a.baseline else None}
        row['passed'] = not row['contacts'] and not row['degenerateTriangles'] and stable and not row['nonPositiveOrientationDots'] and row['evaluatedCoordinatesIdentical'] is not False
        report['observations'].append(row)
        if not row['passed']:
            print('FAIL',json.dumps(row),flush=True)
        ev.to_mesh_clear()
    print('FRAME',frame,flush=True)
report['inputBytesUnchanged'] = {'native':sha(a.native)==input_hashes['native'],
    'candidateHelper':sha(a.candidate_helper)==report['contactCandidateHelperSha256']}
if a.baseline:
    report['inputBytesUnchanged']['baseline'] = sha(a.baseline)==input_hashes['baseline']
report['passed'] = all(row['passed'] for row in report['observations']) and all(report['inputBytesUnchanged'].values())
report['summary'] = {'objects':len(objects), 'frames':len(a.frames), 'objectFrames':len(report['observations']),
    'contacts':sum(r['contacts'] for r in report['observations']),
    'degenerateTriangles':sum(r['degenerateTriangles'] for r in report['observations']),
    'nonPositiveOrientationDots':sum(r['nonPositiveOrientationDots'] for r in report['observations']),
    'changedTriangulationFrames':sum(not r['fixedTriangulation'] for r in report['observations']),
    'changedCoordinatesFrames':sum(r['evaluatedCoordinatesIdentical'] is False for r in report['observations']),
    'minimumOrientationDot':min(r['minimumOrientationDot'] for r in report['observations'])}
a.out.parent.mkdir(parents=True,exist_ok=True)
a.out.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
print('TRIM_MOTION_COMPLETE',report['passed'],report['summary'],flush=True)
raise SystemExit(0 if report['passed'] else 2)

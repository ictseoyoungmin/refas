"""Read-only audit of the two frozen main cloth meshes before assembly.

The runtime topology observer is rerun from saved bytes. Independent float64
pair projections and triangle SAT include coplanar nonadjacent contact. No
avatar, other garment parts, animation or continuous Hausdorff claim is made.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy
from mathutils.bvhtree import BVHTree
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from check_lining_gap import triangle_intersection

repo = Path('/workspace/scratch/61afcdd4e3c6/refas')
sys.path.insert(0, str(repo / 'skills/refas/scripts/production'))
from mesh_audit import audit_mesh

NAMES = ['Body | continuous open front and shoulder yoke',
         'Collar | standing back and neck facing']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.objects = [n for n in source.objects if n in NAMES or n in ['Optimized ' + v for v in NAMES]]
    assert len(target.objects) == 2
    for obj in target.objects:
        bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    rows = []
    for obj in target.objects:
        ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        v = np.array([ev.matrix_world @ p.co for p in mesh.vertices], dtype=np.float64)
        faces = np.array([t.vertices for t in mesh.loop_triangles], dtype=np.int64)
        count = len(v) // 2
        assert len(v) == count * 2
        attributes = {}
        for name, expected in [('wearable_shell_pair', np.tile(np.arange(count), 2)),
                               ('wearable_shell_side', np.repeat([0, 1], count))]:
            attr = mesh.attributes[name]
            values = np.array([d.value for d in attr.data])
            correct = attr.domain == 'POINT' and attr.data_type == 'INT' and np.array_equal(values, expected)
            attributes[name] = correct
            assert correct, name
        outer = faces[np.max(faces, axis=1) < count]
        inner = faces[np.min(faces, axis=1) >= count]
        outer_counter = Counter(tuple(sorted(f)) for f in outer)
        paired_inner_counter = Counter(tuple(sorted(f - count)) for f in inner)
        triangles = v[outer]
        normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        gaps = -np.einsum('ij,ij->i', normals, (v[outer + count] - triangles).mean(axis=1))
        tree = BVHTree.FromPolygons(v.tolist(), faces.tolist(), all_triangles=True, epsilon=1e-7)
        candidates, contacts, kinds = 0, [], Counter()
        for i, j in tree.overlap(tree):
            if i >= j or set(faces[i]) & set(faces[j]):
                continue
            candidates += 1
            hit = triangle_intersection(v[faces[i]], v[faces[j]])
            assert hit['assessed']
            if hit['intersects']:
                def kind(f):
                    return 'outer' if max(f) < count else 'inner' if min(f) >= count else 'rim'
                category = '/'.join(sorted([kind(faces[i]), kind(faces[j])]))
                kinds[category] += 1
                contacts.append({'triangleIds': [int(i), int(j)], 'kind': category, **hit})
        canonical = Counter(tuple(sorted(tuple(v[k]) for k in face)) for face in faces)
        duplicates = sum(n - 1 for n in canonical.values() if n > 1)
        ev.to_mesh_clear()
        topology = audit_mesh(obj, meters_per_unit=1, max_details=8)
        stats = topology['statistics']
        clean = all(stats[key] == 0 for key in ['boundaryEdges', 'wireEdges', 'looseVertices',
                    'nonManifoldEdges', 'nonManifoldVertices', 'inconsistentWindingEdges',
                    'degenerateTriangles', 'negativeClosedComponents', 'nearZeroClosedComponents'])
        row = {'name': obj.name, 'topology': stats, 'pairAttributesValid': attributes,
               'outerTriangles': len(outer), 'innerTriangles': len(inner),
               'pairedFaceMultiplicityEqual': outer_counter == paired_inner_counter,
               'minimumMeanProjectedGapM': float(gaps.min()),
               'nonpositiveMeanGapFaces': int(np.sum(gaps <= 0)),
               'duplicateCoordinateTriangles': duplicates,
               'broadphaseNonadjacentCandidates': candidates,
               'nonadjacentContacts': len(contacts), 'contactKinds': dict(kinds),
               'contactPairs': [c['triangleIds'] for c in contacts],
               'contactExamples': contacts[:20],
               'positiveClosedComponents': topology['components'],
               'passed': clean and not contacts and not duplicates and gaps.min() > 0
                         and outer_counter == paired_inner_counter}
        rows.append(row)
        print(json.dumps({k: row[k] for k in ['name', 'minimumMeanProjectedGapM',
              'broadphaseNonadjacentCandidates', 'nonadjacentContacts', 'passed']}), flush=True)
    return rows


p = argparse.ArgumentParser()
p.add_argument('--high', type=Path, required=True)
p.add_argument('--low', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
started = time.monotonic()
result = {'startedUtc': datetime.now(timezone.utc).isoformat(),
          'helperSha256': sha(Path(__file__)),
          'scope': 'Two main cloth meshes in rest pose before body gorge relief; not complete garment acceptance.',
          'contactMethod': 'BVH with 0.1 micrometre broadphase padding; independent float64 triangle SAT including coplanar axes, 1 pm arithmetic epsilon; shared-vertex face pairs excluded.',
          'topologyMethod': 'Production mesh observer freshly run on the exact saved native meshes.',
          'inputs': {key: {'path': str(path), 'sha256': sha(path)} for key, path in [('high', a.high), ('low', a.low)]},
          'objects': {}}
for key, path in [('high', a.high), ('low', a.low)]:
    result['objects'][key] = inspect(path)
result['inputBytesUnchanged'] = all(sha(Path(v['path'])) == v['sha256'] for v in result['inputs'].values())
result['passed'] = result['inputBytesUnchanged'] and all(v['passed'] for values in result['objects'].values() for v in values)
result['completedUtc'] = datetime.now(timezone.utc).isoformat()
result['elapsedSeconds'] = time.monotonic() - started
a.out.parent.mkdir(parents=True, exist_ok=True)
a.out.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
raise SystemExit(0 if result['passed'] else 2)

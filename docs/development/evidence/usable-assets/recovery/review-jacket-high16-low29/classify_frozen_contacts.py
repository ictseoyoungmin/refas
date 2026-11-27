"""Independently corroborate SAT pairs with float64 segment/triangle solves.

Only frozen cloth coordinates are read. Neither mathutils ray intersection nor
the SAT predicate is used to compute the segment intersections below.
"""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np

ROOT = Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/frozen-cloth-review')
source = json.loads((ROOT / 'full-pairs-report.json').read_text())
result = {'sourceSha256': hashlib.sha256((ROOT / 'full-pairs-report.json').read_bytes()).hexdigest(),
          'method': 'For every retained SAT pair, solve all six segment/triangle intersection systems in centered float64 coordinates. Strict interior means t,u,v,1-u-v are all >1e-10 and t<1-1e-10. Coplanar/edge-only cases remain separate observations.',
          'objects': []}


def solve_edges(a, b):
    hits = []
    for side, (one, two) in enumerate([(a, b), (b, a)]):
        for edge in range(3):
            start, end = one[edge], one[(edge + 1) % 3]
            mat = np.column_stack([end - start, -(two[1] - two[0]), -(two[2] - two[0])])
            rhs = two[0] - start
            try:
                t, u, v = np.linalg.solve(mat, rhs)
            except np.linalg.LinAlgError:
                continue
            if 0 <= t <= 1 and min(u, v) >= 0 and u + v <= 1:
                hits.append({'side': side, 'edge': edge, 'segmentT': float(t),
                             'barycentric': [float(1-u-v), float(u), float(v)],
                             'pointM': (start + t * (end-start)).tolist(),
                             'strictInterior': bool(min(t, 1-t, u, v, 1-u-v) > 1e-10),
                             'residualM': float(np.linalg.norm(mat @ np.array([t, u, v]) - rhs))})
    return hits


for variant, rows in source['objects'].items():
    path = Path(source['inputs'][variant]['path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source['inputs'][variant]['sha256']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path), link=False) as (df, dt):
        dt.objects = [row['name'] for row in rows]
    for obj in dt.objects:
        bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    for row in rows:
        obj = bpy.data.objects[row['name']]
        ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        faces = [tuple(t.vertices) for t in mesh.loop_triangles]
        vertices = np.array([ev.matrix_world @ v.co for v in mesh.vertices], dtype=np.float64)
        half = len(vertices) // 2
        def kind(face):
            return 'outer' if max(face) < half else 'inner' if min(face) >= half else 'rim'
        counts, strict, examples, classified = Counter(), Counter(), defaultdict(list), []
        all_spans = []
        for i, j in row['contactPairs']:
            fa, fb = faces[i], faces[j]
            assert not set(fa) & set(fb)
            a, b = vertices[list(fa)], vertices[list(fb)]
            hits = solve_edges(a, b)
            category = '/'.join(sorted([kind(fa), kind(fb)]))
            span = max((float(np.linalg.norm(np.array(x['pointM']) - y['pointM']))
                        for x in hits for y in hits), default=0)
            strict_crossing = len(hits) >= 2 and span > 1e-12 and any(h['strictInterior'] for h in hits)
            counts[category] += 1
            strict[category] += strict_crossing
            classified.append({'triangleIds': [i, j], 'kind': category,
                               'segmentHits': len(hits), 'strictInteriorCrossing': strict_crossing,
                               'intersectionSpanM': span})
            if span > 0:
                all_spans.append(span)
            if len(examples[category]) < 2:
                examples[category].append({'triangleIds': [i, j], 'vertexIds': [fa, fb],
                    'trianglesM': [a.tolist(), b.tolist()], 'hits': hits,
                    'strictInteriorCrossing': strict_crossing, 'intersectionSpanM': span})
        result['objects'].append({'variant': variant, 'name': row['name'],
            'satPairs': len(row['contactPairs']), 'shellTypeCounts': dict(counts),
            'strictCrossingCounts': dict(strict), 'strictCrossings': sum(strict.values()),
            'notStrictlyCorroborated': len(classified) - sum(strict.values()),
            'minimumNonzeroIntersectionSpanM': min(all_spans, default=None),
            'maximumIntersectionSpanM': max(all_spans, default=None),
            'examplesByType': dict(examples), 'classifiedPairs': classified})
        ev.to_mesh_clear()
        print(json.dumps({k: result['objects'][-1][k] for k in ['variant', 'name', 'satPairs',
              'strictCrossings', 'notStrictlyCorroborated', 'minimumNonzeroIntersectionSpanM',
              'maximumIntersectionSpanM']}), flush=True)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source['inputs'][variant]['sha256']
result['inputBytesUnchanged'] = True
(ROOT / 'strict-crossing-classification.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')

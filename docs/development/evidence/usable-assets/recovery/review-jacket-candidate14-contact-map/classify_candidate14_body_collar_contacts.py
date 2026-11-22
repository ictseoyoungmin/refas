"""Read-only source-parameter mapping of candidate14 regional-fit body/collar contacts.

All contacts remain observations. Proximity to a source hinge never becomes
an exemption. Only the two cloth meshes and the original collar are loaded.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).parent))
from check_lining_gap import triangle_intersection

ROOT = Path('/workspace/scratch/61afcdd4e3c6')
LOW = ROOT / 'work/garment/candidate-14-clean44/regional-fit-low/wearable-regional-fit.blend'
SOURCE = ROOT / 'recovered/source-models/refas-source-identity-models/jacket/native.blend'
GRID = ROOT / 'work/garment/geometry-repair/collar-grid.npz'
OUT = ROOT / 'work/garment/export-review/body-collar-map-candidate14'
NAMES = ['Body | continuous open front and shoulder yoke', 'Collar | standing back and neck facing']
EXPECTED = {'low': 'bc5adc12543fa04843785ea519fe91d3b3ced5c23be0f0cebcd6b343c4c60cae',
            'source': '528a8b67b2cd74dd5724225a6da4065281f6cfdf033d52a0b28123eab804cafd',
            'grid': '759350d9d8e52529c9afb7b847862e43b596e1d1b1aa89b16f5f9a1400087763'}


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load_objects(path, names):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path), link=False) as (sf, target):
        target.objects = list(names)
    for obj in target.objects:
        bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return target.objects


def evaluated(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    return ev, me, np.array([ev.matrix_world @ v.co for v in me.vertices], dtype=float), np.array([tuple(t.vertices) for t in me.loop_triangles], dtype=int)


def interpolate_line(rows, points, row):
    i = int(np.clip(np.searchsorted(rows, row, side='right') - 1, 0, len(rows)-2))
    t = (row-rows[i]) / (rows[i+1]-rows[i])
    return points[i] * (1-t) + points[i+1] * t


def distance_to_line(point, line):
    delta = line[1:] - line[:-1]
    den = np.einsum('ij,ij->i', delta, delta)
    t = np.divide(np.einsum('ij,ij->i', point-line[:-1], delta), den,
                  out=np.zeros(len(den)), where=den > 0).clip(0, 1)
    return float(np.linalg.norm(line[:-1] + delta*t[:, None] - point, axis=1).min())


def hits_and_parameters(a, b, uv):
    hits = []
    for side, (one, two) in enumerate([(a, b), (b, a)]):
        for edge in range(3):
            start, end = one[edge], one[(edge+1) % 3]
            mat = np.column_stack([end-start, -(two[1]-two[0]), -(two[2]-two[0])])
            try:
                t, u, v = np.linalg.solve(mat, two[0]-start)
            except np.linalg.LinAlgError:
                continue
            if 0 <= t <= 1 and min(u, v) >= 0 and u+v <= 1:
                param = np.array([1-u-v, u, v]) @ uv if side == 0 else uv[edge]*(1-t)+uv[(edge+1) % 3]*t
                point = start + t*(end-start)
                if not any(np.linalg.norm(point - x[0]) < 1e-12 for x in hits):
                    hits.append((point, param))
    return hits


def meets_box(uv, bounds):
    if len(uv) == 1:
        return bool(np.all(uv[0] >= bounds[0]) and np.all(uv[0] <= bounds[1]))
    for i in range(len(uv)):
        for j in range(i+1, len(uv)):
            lo, hi = 0., 1.
            delta = uv[j]-uv[i]
            for axis in range(2):
                if delta[axis] == 0:
                    if not bounds[0][axis] <= uv[i][axis] <= bounds[1][axis]:
                        lo, hi = 1., 0.
                else:
                    a, b = sorted([(bounds[0][axis]-uv[i][axis])/delta[axis], (bounds[1][axis]-uv[i][axis])/delta[axis]])
                    lo, hi = max(lo, a), min(hi, b)
            if lo <= hi:
                return True
    return False


OUT.mkdir(parents=True, exist_ok=True)
for label, path in [('low', LOW), ('source', SOURCE), ('grid', GRID)]:
    assert sha(path) == EXPECTED[label], label
grid = np.load(GRID)['rows']
assert grid.shape == (1385, 45)
inverse = {int(vid): (r, c) for r, row in enumerate(grid) for c, vid in enumerate(row)}

# Source coordinates and semantic groups are sampled from the actual original
# subdivided outer collar, not from the subsequently fitted low geometry.
original = load_objects(SOURCE, [NAMES[1]])[0]
for modifier in list(original.modifiers):
    if modifier.type == 'SOLIDIFY':
        original.modifiers.remove(modifier)
bpy.context.view_layer.update()
ev, me, source_vertices, source_faces = evaluated(original)
assert len(source_vertices) == grid.size
group_names = ['Collar stand and turned leaves', 'L Lapel | rolled facing', 'R Lapel | rolled facing']
group_ids = [original.vertex_groups[name].index for name in group_names]
weights = np.zeros((len(source_vertices), len(group_names)))
for vertex in me.vertices:
    for g in vertex.groups:
        if g.group in group_ids:
            weights[vertex.index, group_ids.index(g.group)] = g.weight
ev.to_mesh_clear()
cells = defaultdict(list)
for face in source_faces:
    q = np.array([inverse[int(i)] for i in face])
    assert np.all(q.max(axis=0)-q.min(axis=0) <= 1)
    cells[tuple(q.min(axis=0))].append((face, q))
source_hinge = source_vertices[grid[:, 0]]


def source_sample(q):
    r, c = q
    cell = min(int(np.floor(r)), 1383), min(int(np.floor(c)), 43)
    for face, tri in cells[cell]:
        u, v = np.linalg.solve(np.column_stack([tri[1]-tri[0], tri[2]-tri[0]]), q-tri[0])
        w = np.array([1-u-v, u, v])
        if w.min() >= -1e-8:
            return w @ source_vertices[face], w @ weights[face]
    raise ValueError(('Source parameter not on original surface', q.tolist()))


loaded = load_objects(LOW, NAMES)
data = []
fit_state = []
bpy.context.scene.frame_set(1)
for obj in loaded:
    ev, me, vertices, faces = evaluated(obj)
    direct = np.array([obj.matrix_world @ v.co for v in obj.data.vertices], dtype=float)
    fit_state.append({'name': obj.name, 'frame': int(bpy.context.scene.frame_current),
        'nativeVertices': len(obj.data.vertices), 'evaluatedVertices': len(vertices),
        'shapeKeyBlocks': len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0,
        'vertexGroups': len(obj.vertex_groups),
        'maxEvaluatedVsDirectPositionErrorM': float(np.linalg.norm(vertices-direct, axis=1).max()) if vertices.shape == direct.shape else None,
        'matrixWorld': [list(row) for row in obj.matrix_world]})
    assert fit_state[-1]['shapeKeyBlocks'] == 0 and fit_state[-1]['vertexGroups'] == 0, fit_state[-1]
    assert fit_state[-1]['maxEvaluatedVsDirectPositionErrorM'] == 0, fit_state[-1]
    side = np.array([a.value for a in me.attributes['wearable_shell_side'].data])
    pair = np.array([a.value for a in me.attributes['wearable_shell_pair'].data])
    uv = np.array([[a.value, b.value] for a, b in zip(me.attributes['wearable_source_row'].data, me.attributes['wearable_source_column'].data)]) if obj.name == NAMES[1] else None
    data.append((vertices, faces, side, pair, uv))
    ev.to_mesh_clear()
bv, bf, bs, bp, _ = data[0]
cv, cf, cs, cp, parameters = data[1]
assert np.array_equal(parameters[cs == 0], parameters[cs == 1])
hinge_ids = [i for i, (r, c) in enumerate(parameters) if cs[i] == 0 and c == 0]
hinge_ids.sort(key=lambda i: parameters[i, 0])
low_rows = parameters[hinge_ids, 0]
low_hinge = cv[hinge_ids]
assert low_rows[0] == 0 and low_rows[-1] == 1384 and np.all(np.diff(low_rows) > 0)
bt = BVHTree.FromPolygons(bv.tolist(), bf.tolist(), all_triangles=True, epsilon=1e-7)
ct = BVHTree.FromPolygons(cv.tolist(), cf.tolist(), all_triangles=True, epsilon=1e-7)


def shell(side, face):
    return 'outer' if np.all(side[face] == 0) else 'inner' if np.all(side[face] == 1) else 'rim'


records = []
for bi, ci in bt.overlap(ct):
    a, b = bv[bf[bi]], cv[cf[ci]]
    observation = triangle_intersection(a, b)
    if not observation['intersects']:
        continue
    hits = hits_and_parameters(a, b, parameters[cf[ci]])
    record = {'bodyTriangle': bi, 'collarTriangle': ci,
              'bodyShell': shell(bs, bf[bi]), 'collarShell': shell(cs, cf[ci]),
              'collarFaceParameters': parameters[cf[ci]].tolist(),
              'collarFaceIncidentToColumn0': bool(np.any(parameters[cf[ci], 1] == 0)),
              'collarFaceIncidentToColumn44': bool(np.any(parameters[cf[ci], 1] == 44)),
              'actualIntersectionMapping': bool(hits)}
    if hits:
        points, uv = np.array([x[0] for x in hits]), np.array([x[1] for x in hits])
        original_points, regions, native_chords, source_chords, native_nearest, source_nearest = [], [], [], [], [], []
        for point, q in hits:
            sq, sw = source_sample(q)
            original_points.append(sq)
            regions.append(sw)
            source_chords.append(float(np.linalg.norm(sq-interpolate_line(np.arange(1385), source_hinge, q[0]))))
            native_chords.append(float(np.linalg.norm(point-interpolate_line(low_rows, low_hinge, q[0]))))
            source_nearest.append(distance_to_line(sq, source_hinge))
            native_nearest.append(distance_to_line(point, low_hinge))
        col_min, col_max = uv[:, 1].min(), uv[:, 1].max()
        if col_max <= 1e-7:
            band = 'column0_boundary'
        elif col_max <= 4+1e-7:
            band = 'first_original_width_cell_0_to_4'
        elif col_min < 4-1e-7:
            band = 'crosses_first_original_width_cell_limit'
        else:
            band = 'beyond_first_original_width_cell'
        group_weight = np.mean(regions, axis=0)
        region = group_names[int(np.argmax(group_weight))]
        record.update({'intersectionPointsM': points.tolist(), 'intersectionSourceParameters': uv.tolist(),
            'intersectionSourceParameterMin': uv.min(axis=0).tolist(), 'intersectionSourceParameterMax': uv.max(axis=0).tolist(),
            'sourceOuterSurfacePointsM': np.asarray(original_points).tolist(),
            'sourceRegion': region, 'sourceRegionWeights': dict(zip(group_names, map(float, group_weight))),
            'parametricBand': band,
            'sourceSameRowAttachmentChordM': source_chords, 'nativeSameRowAttachmentChordM': native_chords,
            'sourceNearestColumn0PolylineM': source_nearest, 'nativeNearestColumn0PolylineM': native_nearest,
            'knownVisibleGorgePatch': meets_box(uv, ([930, 25], [934, 28])),
            'originalDefectiveEndpointRowRange': meets_box(uv, ([0, 0], [8, 44])) or meets_box(uv, ([1376, 0], [1384, 44])),
            'endpointSubdivisionTransitionRows': meets_box(uv, ([8, 0], [12, 44])) or meets_box(uv, ([1372, 0], [1376, 44])),
            'touchesFreeColumn44': bool(np.any(abs(uv[:, 1]-44) <= 1e-7))})
    records.append(record)


def summary(rows):
    mapped = [r for r in rows if r['actualIntersectionMapping']]
    if not mapped:
        return {'pairs': len(rows), 'mappedPairs': 0}
    p = np.concatenate([r['intersectionPointsM'] for r in mapped])
    uv = np.concatenate([r['intersectionSourceParameters'] for r in mapped])
    return {'pairs': len(rows), 'mappedPairs': len(mapped),
            'actualContactBoundsM': {'min': p.min(axis=0).tolist(), 'max': p.max(axis=0).tolist()},
            'sourceParameterBounds': {'min': uv.min(axis=0).tolist(), 'max': uv.max(axis=0).tolist()},
            'nativeNearestColumn0PolylineRangeM': [min(min(r['nativeNearestColumn0PolylineM']) for r in mapped), max(max(r['nativeNearestColumn0PolylineM']) for r in mapped)],
            'sourceNearestColumn0PolylineRangeM': [min(min(r['sourceNearestColumn0PolylineM']) for r in mapped), max(max(r['sourceNearestColumn0PolylineM']) for r in mapped)],
            'originalDefectiveEndpointRegionPairs': sum(r['originalDefectiveEndpointRowRange'] for r in mapped),
            'knownVisibleGorgePatchPairs': sum(r['knownVisibleGorgePatch'] for r in mapped),
            'shellTypes': dict(Counter(r['bodyShell']+'/'+r['collarShell'] for r in rows))}


collar_self = []
collar_self_candidates = 0
for a, b in ct.overlap(ct):
    if a >= b or set(cf[a]) & set(cf[b]):
        continue
    collar_self_candidates += 1
    hit = triangle_intersection(cv[cf[a]], cv[cf[b]])
    if hit['intersects']:
        collar_self.append({'faces': [int(a), int(b)], 'shellTypes': [shell(cs, cf[a]), shell(cs, cf[b])],
            'triangleVerticesM': [cv[cf[a]].tolist(), cv[cf[b]].tolist()],
            'sourceParameters': [parameters[cf[a]].tolist(), parameters[cf[b]].tolist()],
            'predicate': hit})

mapped = [r for r in records if r['actualIntersectionMapping']]
report = {'createdUtc': datetime.now(timezone.utc).isoformat(),
          'inputs': {k: {'path': str(p), 'sha256': sha(p)} for k, p in [('low', LOW), ('source', SOURCE), ('grid', GRID)]},
          'fittedState': fit_state,
          'sourceEndpointStatus': 'High42/low44 repaired the original endpoint construction defect before this regional fit. Original defective parameter ranges are provenance flags, not a claim that the new contacts are inherited or permitted.',
          'collarSelfContact': {'nonadjacentCandidates': collar_self_candidates, 'confirmed': len(collar_self), 'records': collar_self},
          'authorBodyCollarContactCount': 3017,
          'agreesWithAuthorContactCount': len(records) == 3017,
          'helperSha256': sha(Path(__file__)),
          'method': 'Independent float64 SAT and actual edge/triangle intersection solves. Source parameters are barycentrically interpolated on each low collar face; original surface points and semantic groups are sampled on the matching original subdivided collar triangles. Distances to column0 are observations, not exemptions.',
          'sourceConstruction': {'path': str(ROOT/'refas/examples/uniform-jacket/refine_identity.py'), 'sha256': sha(ROOT/'refas/examples/uniform-jacket/refine_identity.py'), 'widthColumns': {'0': 'body hinge / sewn attachment', '4': 'end of first original cage width cell (width fraction 0.02)', '16': 'original cage width index4 (width fraction0.22; crest in neck construction)', '44': 'free piped outline'}},
          'excludedAcceptance': 'Every contact remains unclassified for acceptance. Source inheritance, hinge proximity and the first width cell do not waive crossings. Historical endpoint parameter regions and the known visible gorge parameter patch are explicitly flagged; no old count or region is an allowance for this new fitted candidate.',
          'summary': summary(records),
          'byParametricBand': {k: summary([r for r in mapped if r['parametricBand'] == k]) for k in sorted({r['parametricBand'] for r in mapped})},
          'bySourceRegion': {k: summary([r for r in mapped if r['sourceRegion'] == k]) for k in sorted({r['sourceRegion'] for r in mapped})},
          'visibleGorgePatch': summary([r for r in mapped if r['knownVisibleGorgePatch']]),
          'originalDefectiveEndpointRegions': summary([r for r in mapped if r['originalDefectiveEndpointRowRange']]),
          'records': records}
report['inputBytesUnchanged'] = all(sha(p) == EXPECTED[k] for k, p in [('low', LOW), ('source', SOURCE), ('grid', GRID)])
assert report['inputBytesUnchanged']
(OUT/'report.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
print(json.dumps({'summary': report['summary'], 'bands': {k: v['pairs'] for k,v in report['byParametricBand'].items()}, 'regions': {k: v['pairs'] for k,v in report['bySourceRegion'].items()}}), flush=True)

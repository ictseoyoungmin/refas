"""Compare decoded GLB weights with raw Godot arrays for already-associated points."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT = Path('/workspace/scratch/61afcdd4e3c6/work/garment')
ASSET = ROOT / 'pipeline-probe/.refas2/runs/56cf929963eb4dcc8d9d0cdc92cc5104/artifacts/asset.glb'
RAW = ROOT / 'root-quantization-raw.json'
blob = ASSET.read_bytes()
assert blob[:4] == b'glTF'
cursor = 12
doc = None
binary = None
while cursor < len(blob):
    size, kind = struct.unpack_from('<II', blob, cursor)
    chunk = blob[cursor + 8: cursor + 8 + size]
    if kind == 0x4e4f534a:
        doc = json.loads(chunk)
    elif kind == 0x004e4942:
        binary = chunk
    cursor += 8 + size
assert doc is not None and binary is not None
DTYPES = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def accessor(index):
    a = doc['accessors'][index]
    assert 'sparse' not in a
    v = doc['bufferViews'][a['bufferView']]
    assert v.get('buffer', 0) == 0
    dtype = np.dtype(DTYPES[a['componentType']])
    width = WIDTHS[a['type']]
    array = np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
        offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
        strides=(v.get('byteStride', width * dtype.itemsize), dtype.itemsize)).copy()
    if a.get('normalized'):
        assert a['componentType'] in (5121, 5123)
        return array.astype(np.float64) / np.iinfo(dtype).max
    return array

raw = json.loads(RAW.read_text())
assert raw['assetSha256'] == hashlib.sha256(blob).hexdigest()
sources = {}

def source_weights(probe):
    key = (probe['node'], probe['surface'], probe['vertex'])
    if key in sources:
        return sources[key]
    nodes = [n for n in doc['nodes'] if n.get('name') == probe['node'] and 'mesh' in n]
    assert len(nodes) == 1, (probe['node'], len(nodes))
    node = nodes[0]
    primitive = doc['meshes'][node['mesh']]['primitives'][probe['surface']]
    positions = accessor(primitive['attributes']['POSITION'])
    weights = accessor(primitive['attributes']['WEIGHTS_0']).astype(np.float64)
    joints = accessor(primitive['attributes']['JOINTS_0'])
    joint_names = [doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
    errors = np.linalg.norm(positions.astype(np.float64) - probe['basePosition'], axis=1)
    ids = np.flatnonzero(errors < 1e-7)
    assert len(ids), (key, float(errors.min()))
    dictionaries = []
    for index in ids:
        values = {}
        for joint, weight in zip(joints[index], weights[index]):
            if weight:
                name = joint_names[int(joint)]
                values[name] = values.get(name, 0.0) + float(weight)
        dictionaries.append(values)
    # UV/normal splitting may duplicate positions. Only use them if their
    # complete source weight identities also agree, without fitting to errors.
    assert all(d == dictionaries[0] for d in dictionaries), (key, 'ambiguous source weights')
    source = {'weights': dictionaries[0], 'sourceVertexMatches': ids.tolist(),
              'positionErrorM': float(errors[ids].max()),
              'accessorComponentType': doc['accessors'][primitive['attributes']['WEIGHTS_0']]['componentType']}
    sources[key] = source
    return source

records = []
for sample in raw['samples']:
    for p in sample['probes']:
        source = source_weights(p)
        basis = np.array(p['skeletonBasis'], dtype=float)
        origin = np.array(p['skeletonOrigin'], dtype=float)
        raw_local = np.zeros(3)
        source_local = np.zeros(3)
        bound = 0.0
        maximum_term = 0.0
        items = []
        accounted = set()
        for influence in p['influences']:
            name = influence['bone']
            consumer_w = influence['weight']
            source_w = source['weights'].get(name, 0.0)
            if name in accounted:
                assert consumer_w == 0, (p['name'], 'repeated nonzero consumer bind')
                # Packed unused slots commonly repeat bind zero. They do not
                # represent another occurrence of that source bone's weight.
                source_w = 0.0
            if consumer_w or source_w:
                accounted.add(name)
            term = np.array(influence['localTerm'], dtype=float)
            raw_local += consumer_w * term
            source_local += source_w * term
            term_length = float(np.linalg.norm(basis @ term))
            bound += abs(consumer_w - source_w) * term_length
            maximum_term = max(maximum_term, term_length)
            packed = int(round(consumer_w * 65535))
            items.append({'bone': name, 'sourceWeight': source_w, 'consumerWeight': consumer_w,
                          'consumerUnorm16Integer': packed,
                          'unorm16Residual': consumer_w - packed / 65535,
                          'floorSourceTimes65535': int(np.floor(source_w * 65535)),
                          'weightDifference': consumer_w - source_w})
        assert set(source['weights']).issubset(accounted)
        raw_world = basis @ raw_local + origin
        source_world = basis @ source_local + origin
        expected = np.array(p['expected'], dtype=float)
        observed_actual = np.array(p['actual'], dtype=float)
        records.append({'time': sample['time'], 'name': p['name'], 'sourceMapping': source,
            'influences': items, 'consumerWeightSum': p['weightSum'],
            'sourceWeightSum': sum(source['weights'].values()),
            'nativeErrorM': p['observedDistanceM'],
            'rawReconstructionDifferenceM': float(np.linalg.norm(raw_world - observed_actual)),
            'sameEngineTransformsWithDecodedSourceWeightsResidualM': float(np.linalg.norm(source_world - expected)),
            'predictedWeightPackingErrorM': float(np.linalg.norm(raw_world - source_world)),
            'coefficientDifferenceBoundM': bound,
            'fourInfluenceUnorm16WorstCaseBoundM': 4 * maximum_term / 65535})

report = {'schema': 'refas.skin-weight-quantization-analysis/v1',
    'scope': 'Rejected geometry prototype; explanatory diagnostic, not changed playback or a final consumer pass.',
    'assetSha256': hashlib.sha256(blob).hexdigest(), 'rawConsumerDumpSha256': hashlib.sha256(RAW.read_bytes()).hexdigest(),
    'samples': len(raw['samples']), 'observations': len(records), 'uniqueSourcePoints': len(sources),
    'sourceWeightComponentTypes': sorted({s['accessorComponentType'] for s in sources.values()}),
    'maxNativeErrorM': max(r['nativeErrorM'] for r in records),
    'maxRawReconstructionDifferenceM': max(r['rawReconstructionDifferenceM'] for r in records),
    'maxSameEngineTransformsWithDecodedSourceWeightsResidualM': max(r['sameEngineTransformsWithDecodedSourceWeightsResidualM'] for r in records),
    'maxPredictedWeightPackingErrorM': max(r['predictedWeightPackingErrorM'] for r in records),
    'maxCoefficientDifferenceBoundM': max(r['coefficientDifferenceBoundM'] for r in records),
    'maxFourInfluenceUnorm16WorstCaseBoundM': max(r['fourInfluenceUnorm16WorstCaseBoundM'] for r in records),
    'maxUnorm16RepresentationResidual': max(abs(i['unorm16Residual']) for r in records for i in r['influences']),
    'maxConsumerWeightDifference': max(abs(i['weightDifference']) for r in records for i in r['influences']),
    'allWeightsAgreeWithSourceFloorUnorm16': all(i['consumerUnorm16Integer'] == i['floorSourceTimes65535'] for r in records for i in r['influences']),
    'consumerWeightSumRange': [min(r['consumerWeightSum'] for r in records), max(r['consumerWeightSum'] for r in records)],
    'limitations': ['Only the 30 associated points and five poses are analyzed.',
        'Using decoded source weights with engine transforms is a diagnostic counterfactual; actual playback retains consumer weights.',
        'The four-influence bound uses observed transformed point norms and a 1/65535 coefficient step; it is not a universal engine bound.',
        'The original strict 20 micrometer failures and raw GLB remain unchanged.'],
    'records': records}
(ROOT / 'root-quantization-analysis.json').write_text(json.dumps(report, indent=2) + '\n')
summary = {k: v for k, v in report.items() if k != 'records'}
(ROOT / 'root-quantization-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))

"""Compare two declared cloth lining patches in actual 97-sample Godot output.

Read-only postprocessing: no engine execution, weight normalization or threshold
change. Optional countercheck changes a copied point set and labels it synthetic.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import numpy as np


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def point(value):
    result = np.asarray(value, dtype=np.float64)
    if result.shape != (3,) or not np.isfinite(result).all():
        raise ValueError('Expected a finite three-coordinate point')
    return result


def consumer_point(value):
    x, y, z = point(value)
    return np.array([x, z, -y])


def unit_normal(triangle):
    normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
    length = float(np.linalg.norm(normal))
    return (normal / length if length > 0 else None), length / 2


def triangle_intersection(first, second):
    """Triangle/triangle SAT, including in-plane axes for coplanar triangles.

    A contact includes touching. The 1 pm floor controls floating arithmetic,
    not an allowed physical overlap or a consumer position budget.
    """
    origin = (first.mean(axis=0) + second.mean(axis=0)) / 2
    a, b = first - origin, second - origin
    na, area_a = unit_normal(a)
    nb, area_b = unit_normal(b)
    if na is None or nb is None:
        return {'assessed': False, 'reason': 'Degenerate triangle', 'intersects': None}
    edges_a = np.roll(a, -1, axis=0) - a
    edges_b = np.roll(b, -1, axis=0) - b
    axes = [na, nb]
    axes += [np.cross(x, y) for x in edges_a for y in edges_b]
    axes += [np.cross(normal, edge) for normal in (na, nb) for edge in list(edges_a) + list(edges_b)]
    span = max(float(np.max(np.abs(a))), float(np.max(np.abs(b))))
    epsilon = max(1e-12, span * np.finfo(np.float64).eps * 64)
    separating_gap = 0.0
    for axis in axes:
        length = float(np.linalg.norm(axis))
        if length == 0:
            continue
        direction = axis / length
        ap, bp = a @ direction, b @ direction
        gap = max(float(bp.min() - ap.max()), float(ap.min() - bp.max()))
        separating_gap = max(separating_gap, gap)
        if gap > epsilon:
            return {'assessed': True, 'intersects': False, 'separatingAxisGapM': gap,
                    'numericalEpsilonM': epsilon}
    coplanar = max(float(np.max(np.abs((b - a[0]) @ na))),
                   float(np.max(np.abs((a - b[0]) @ nb)))) <= epsilon
    return {'assessed': True, 'intersects': True, 'coplanar': coplanar,
            'contactScope': 'Boundary touch or interior overlap; no contact is waived',
            'maximumSeparatingGapM': separating_gap, 'numericalEpsilonM': epsilon}


def label_map(items, name):
    result = {}
    for item in items:
        key = name(item)
        if key in result:
            raise ValueError('Ambiguous duplicate probe label: ' + key)
        result[key] = item
    return result


def validate_metadata(patches):
    if len(patches) != 2 or {p['id'] for p in patches} != {'body-minimum-lining', 'collar-minimum-lining'}:
        raise ValueError('Require one declared body patch and one collar patch')
    all_labels = set()
    for patch in patches:
        outer, inner = patch['outerLabels'], patch['innerLabels']
        outer_ids, inner_ids = patch['outerVertexIds'], patch['innerVertexIds']
        if any(len(values) != 3 or len(set(values)) != 3 for values in (outer, inner, outer_ids, inner_ids)):
            raise ValueError('Each patch needs three distinct outer and inner points')
        if set(outer) & set(inner) or set(outer_ids) & set(inner_ids):
            raise ValueError('Outer and inner point identities must be distinct')
        if outer_ids != patch['nativeOuterTriangleVertexIds']:
            raise ValueError('Outer labels must follow the declared oriented outer face')
        if not isinstance(patch['nativeOuterTriangleId'], int):
            raise ValueError('Missing actual outer triangle identity')
        if not isinstance(patch['pairedInnerIsActualTriangle'], bool):
            raise ValueError('Explicit actual-inner-face status is required')
        if patch['pairedInnerIsActualTriangle']:
            order = patch['nativeInnerTriangleLabelOrder']
            face = patch['nativeInnerTriangleVertexIds']
            if not isinstance(patch['nativeInnerTriangleId'], int) or set(face) != set(inner_ids) or len(face) != 3:
                raise ValueError('Paired inner points do not identify the declared actual triangle')
            if len(order) != 3 or set(order) != set(inner):
                raise ValueError('Missing actual inner triangle winding order')
            if [inner_ids[inner.index(label)] for label in order] != face:
                raise ValueError('Inner label order disagrees with native face indices')
        elif any(patch.get(key) is not None for key in ('nativeInnerTriangleId', 'nativeInnerTriangleVertexIds', 'nativeInnerTriangleLabelOrder')):
            raise ValueError('A virtual inner triple must not claim actual face identity')
        if set(patch['sourceHashes']) != {'nativeBlendSha256', 'shellObservationSha256'}:
            raise ValueError('Require native blend and full-shell selection report hashes')
        for value in patch['sourceHashes'].values():
            if not isinstance(value, str) or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
                raise ValueError('Invalid source hash')
        for label in outer + inner:
            key = patch['node'] + ':' + label
            if key in all_labels:
                raise ValueError('Duplicate declared lining point: ' + key)
            all_labels.add(key)
    if len(all_labels) != 12:
        raise ValueError('Expected exactly twelve distinct lining point probes')
    if patches[0]['sourceHashes'] != patches[1]['sourceHashes']:
        raise ValueError('Body and collar probes must come from the same frozen native/shell observations')


def evaluate(inspection, configuration, playback, *, copied_points=False):
    patches = inspection['lining_face_probes']
    validate_metadata(patches)
    source = inspection['consumer_samples']
    if source['matrix_order'] != 'row-major, Blender Z-up world space' or source['fps'] / source.get('fps_base', 1) != 30:
        raise ValueError('Expected the recorded 30 fps Blender world-space inspection')
    native_samples, configured, actual_samples = source['samples'], configuration['samples'], playback['samples']
    if len(native_samples) != 97 or len(configured) != 97 or len(actual_samples) != 97:
        raise ValueError('Require all 97 native/configured/actual samples')
    if configuration['vertexTolerance'] != 0.0001 or playback['tolerances'] != {'matrix': 2e-5, 'restVertexMatchM': 1e-5, 'skinVertexM': 0.0001}:
        raise ValueError('Expected the unchanged explicit 100 micrometre skin profile and original matrix/rest budgets')
    rows = []
    for index, (native_sample, config_sample, actual_sample) in enumerate(zip(native_samples, configured, actual_samples)):
        seconds = native_sample['seconds']
        if abs(seconds * 30 - (index + 1)) > 1e-7 or abs(config_sample['time'] - seconds) > 1e-9 or abs(actual_sample['time'] - seconds) > 1e-9:
            raise ValueError('Native/configured/actual timebases do not match frame 1..97')
        native = label_map(native_sample['skin_vertices'], lambda p: p['node'] + ':' + p['label'])
        expected = label_map(config_sample['vertexProbes'], lambda p: p['node'] + ':' + p['label'])
        actual = label_map(actual_sample['vertexProbes'], lambda p: p['name'])
        for patch in patches:
            node = patch['node']
            keys = [node + ':' + label for label in patch['outerLabels'] + patch['innerLabels']]
            native_points, actual_points, errors = {}, {}, []
            for label, key in zip(patch['outerLabels'] + patch['innerLabels'], keys):
                n = consumer_point(native[key]['world'])
                if float(np.linalg.norm(n - point(expected[key]['expected']))) > 1e-12:
                    raise ValueError('Configured expected point differs from native coordinate conversion')
                value = point(actual[key]['actual'])
                error = float(np.linalg.norm(value - n))
                if not copied_points and abs(error - actual[key]['distanceM']) > 1e-9:
                    raise ValueError('Recorded consumer distance does not match its actual point')
                native_points[label], actual_points[label] = n, value
                errors.append(error)
            no = np.array([native_points[label] for label in patch['outerLabels']])
            ni = np.array([native_points[label] for label in patch['innerLabels']])
            ao = np.array([actual_points[label] for label in patch['outerLabels']])
            ai = np.array([actual_points[label] for label in patch['innerLabels']])
            nn, native_area = unit_normal(no)
            an, actual_area = unit_normal(ao)
            checks = {'nativeOuterNondegenerate': nn is not None, 'actualOuterNondegenerate': an is not None,
                      'recordedSkinProfile': max(errors) <= 0.0001}
            row = {'frame': index + 1, 'seconds': seconds, 'patch': patch['id'], 'node': node,
                   'nativeOuterAreaM2': native_area, 'actualOuterAreaM2': actual_area,
                   'maximumPointErrorM': max(errors), 'checks': checks,
                   'actualInnerTriangleAvailable': patch['pairedInnerIsActualTriangle']}
            if nn is not None and an is not None:
                native_gaps = -((ni - no) @ nn)
                actual_gaps = -((ai - ao) @ an)
                native_axis_gaps = -((ai - ao) @ nn)
                alignment = float(np.dot(nn, an))
                row.update({'nativePerCornerProjectedGapM': native_gaps.tolist(),
                    'actualPerCornerProjectedGapM': actual_gaps.tolist(),
                    'actualPerCornerOnNativeNormalM': native_axis_gaps.tolist(),
                    'nativeFaceAverageGapM': float(native_gaps.mean()),
                    'actualFaceAverageGapM': float(actual_gaps.mean()),
                    'actualFaceAverageOnNativeNormalM': float(native_axis_gaps.mean()),
                    'outerNormalDotNative': alignment})
                checks.update({'nativePositiveAverageGap': float(native_gaps.mean()) > 0,
                    'actualPositiveAverageGap': float(actual_gaps.mean()) > 0,
                    'outerOrientationPreserved': alignment > 0})
                # Per-corner signs are observations, not acceptance gates.
                # Folded sheets can legitimately cross an infinite plane while
                # remaining separated from the finite triangle.
            if patch['pairedInnerIsActualTriangle']:
                order = patch['nativeInnerTriangleLabelOrder']
                nit = np.array([native_points[label] for label in order])
                ait = np.array([actual_points[label] for label in order])
                nin, nia = unit_normal(nit)
                ain, aia = unit_normal(ait)
                native_contact, actual_contact = triangle_intersection(no, nit), triangle_intersection(ao, ait)
                new_contact = actual_contact['intersects'] is True and native_contact['intersects'] is not True
                row.update({'nativeInnerAreaM2': nia, 'actualInnerAreaM2': aia,
                    'innerNormalDotNative': float(np.dot(nin, ain)) if nin is not None and ain is not None else None,
                    'nativeTriangleContact': native_contact, 'actualTriangleContact': actual_contact,
                    'newActualTriangleContact': new_contact})
                checks.update({'nativeInnerNondegenerate': nin is not None, 'actualInnerNondegenerate': ain is not None,
                    'innerOrientationPreserved': nin is not None and ain is not None and float(np.dot(nin, ain)) > 0,
                    'contactAssessedOnActualFaces': native_contact['assessed'] and actual_contact['assessed'],
                    'noNewActualTriangleContact': not new_contact})
            else:
                row['triangleContactScope'] = 'Not assessed: the paired inner triple is not an actual triangle'
                row['innerOrientationScope'] = 'Not claimed for a virtual inner triple'
            row['passed'] = all(checks.values())
            rows.append(row)
    return {'passed': bool(playback.get('ok')) and all(row['passed'] for row in rows),
        'consumerOverallPassed': bool(playback.get('ok')), 'sampleFrames': 97, 'patchesPerFrame': 2,
        'pointObservations': 12 * 97, 'actualTrianglePairsPerFrame': sum(p['pairedInnerIsActualTriangle'] for p in patches),
        'minimumNativeFaceAverageGapM': min(row.get('nativeFaceAverageGapM', 0) for row in rows),
        'minimumActualFaceAverageGapM': min(row.get('actualFaceAverageGapM', 0) for row in rows),
        'newActualTriangleContactRows': sum(row.get('newActualTriangleContact', False) for row in rows),
        'failedRows': [{'frame': r['frame'], 'patch': r['patch'], 'failedChecks': [k for k, v in r['checks'].items() if not v]} for r in rows if not r['passed']],
        'patchMetadata': patches, 'rows': rows}


def countercheck(inspection, configuration, playback, baseline):
    patches = inspection['lining_face_probes']
    available = [p for p in patches if p['pairedInnerIsActualTriangle']]
    patch = available[0] if available else patches[0]
    row = min((r for r in baseline['rows'] if r['patch'] == patch['id']), key=lambda r: r['actualFaceAverageGapM'])
    copied = copy.deepcopy(playback)
    sample = copied['samples'][row['frame'] - 1]
    points = label_map(sample['vertexProbes'], lambda p: p['name'])
    outer = np.array([point(points[patch['node'] + ':' + label]['actual']) for label in patch['outerLabels']])
    normal, _ = unit_normal(outer)
    before, after = {}, {}
    if available:
        # An analytically intersecting inner face: two corners lie behind the
        # actual outer triangle and one in front. Its mean gap stays positive.
        edge = min(float(np.linalg.norm(outer[(i + 1) % 3] - outer[i])) for i in range(3))
        gap = min(row['actualFaceAverageGapM'], edge / 100)
        changed = outer + np.array([-gap, -gap, gap])[:, None] * normal
        operation = 'Copied actual inner corners straddle the finite outer triangle; positive mean gap retained'
    else:
        inner = np.array([point(points[patch['node'] + ':' + label]['actual']) for label in patch['innerLabels']])
        changed = inner + 2 * row['actualFaceAverageGapM'] * normal
        operation = 'Copied paired inner points translated across the outer plane; mean gap becomes negative'
    for label, value in zip(patch['innerLabels'], changed):
        key = patch['node'] + ':' + label
        before[key] = points[key]['actual']
        after[key] = value.tolist()
        points[key]['actual'] = value.tolist()
    checked = evaluate(inspection, configuration, copied, copied_points=True)
    selected = next(r for r in checked['rows'] if r['frame'] == row['frame'] and r['patch'] == row['patch'])
    detected = selected.get('newActualTriangleContact', False) if available else not selected['checks']['actualPositiveAverageGap']
    changes = [(a['frame'], a['patch']) for a, b in zip(baseline['rows'], checked['rows']) if a != b]
    expected = [(row['frame'], row['patch'])]
    if not detected or changes != expected or checked['passed']:
        raise ValueError('Copied-point countercheck did not detect exactly its intended patch/sample change')
    return {'schema': 'refas.copied-point-lining-countercheck/v1', 'synthetic': True,
        'operation': operation, 'frame': row['frame'], 'patch': row['patch'], 'before': before, 'after': after,
        'detected': True, 'allOther193PatchRowsUnchanged': True,
        'actualWeightsAssetsAndRecordedConsumerOutputUnchanged': True,
        'selectedResult': selected,
        'scope': 'Copied-point geometric detector control only; not another Godot execution or a modified deliverable'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspection', type=Path, required=True)
    parser.add_argument('--configuration', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--countercheck-out', type=Path)
    args = parser.parse_args()
    inputs = {name: getattr(args, name) for name in ('inspection', 'configuration', 'result')}
    if args.out.resolve() in {p.resolve() for p in inputs.values()} or args.out.exists():
        raise ValueError('Output must be a new file distinct from every input')
    if args.countercheck_out and (args.countercheck_out.exists() or args.countercheck_out.resolve() in {p.resolve() for p in inputs.values()} | {args.out.resolve()}):
        raise ValueError('Countercheck output must also be a new separate file')
    hashes = {name: sha(path) for name, path in inputs.items()}
    inspection, configuration, playback = (json.loads(inputs[name].read_text()) for name in ('inspection', 'configuration', 'result'))
    if configuration['inspectionSha256'] != hashes['inspection']:
        raise ValueError('Consumer configuration is not derived from this exact native inspection')
    asset = Path(configuration['asset'])
    if sha(asset) != playback['assetSha256']:
        raise ValueError('Actual exported asset no longer matches consumer output')
    report = evaluate(inspection, configuration, playback)
    report.update({'schema': 'refas.godot-sampled-lining-gap/v1',
        'createdUtc': datetime.now(timezone.utc).isoformat(), 'sourceSha256': hashes,
        'assetSha256': playback['assetSha256'], 'scriptSha256': sha(Path(__file__)),
        'consumerTolerancesUnchanged': playback['tolerances'],
        'scope': 'Two metadata-selected narrow lining patches, six points each, all97 recorded poses; actual Godot returned points vs native same-pose geometry.',
        'limitations': ['Not an all-vertex, all-face or continuous-motion clearance guarantee.',
            'Per-corner plane-side signs are reported but are not individual acceptance gates.',
            'Triangle contact and inner normal orientation are asserted only for metadata-confirmed actual inner faces.',
            'Native contacts are reported separately; the contact gate rejects newly introduced actual contact. Native full-shell topology/contact validation remains independent.',
            'No normalization of actual weights or positions and no alteration of the recorded100 micrometre profile.']})
    if args.countercheck_out:
        if not report['passed']:
            report['countercheck'] = 'Not run because the final-data baseline does not pass'
        else:
            control = countercheck(inspection, configuration, playback, report)
            control['originalConsumerResultSha256'] = hashes['result']
            args.countercheck_out.parent.mkdir(parents=True, exist_ok=True)
            args.countercheck_out.write_text(json.dumps(control, indent=2, allow_nan=False) + '\n')
            report['countercheck'] = {'path': str(args.countercheck_out), 'sha256': sha(args.countercheck_out), 'detected': True}
    report['inputBytesUnchanged'] = {name: sha(path) == hashes[name] for name, path in inputs.items()}
    report['passed'] = report['passed'] and all(report['inputBytesUnchanged'].values())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({key: report[key] for key in ('passed', 'sampleFrames', 'pointObservations', 'minimumNativeFaceAverageGapM', 'minimumActualFaceAverageGapM', 'newActualTriangleContactRows', 'failedRows')}))
    return 0 if report['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())

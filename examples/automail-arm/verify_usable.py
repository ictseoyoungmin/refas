"""Recorded destructive-negative copy and reversible public CLI cover exercise.

The selected native and GLB stay unchanged. Every actual command records clocks,
arguments and full logs, including the intentionally failing negative control.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import time


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--selected-revision', required=True)
    parser.add_argument('--phase', choices=('inspect', 'negative', 'cover'), required=True)
    parser.add_argument('--candidate-label', default='candidate-04')
    args = parser.parse_args()
    work = args.work.resolve()
    repo = Path(__file__).resolve().parents[2]
    cli = repo / 'skills/refas/scripts/produce.py'
    selected = work / args.candidate_label
    output = work / ('verification-' + args.phase + '-' + args.candidate_label)
    output.mkdir(exist_ok=False)
    history = []

    def command(label, argv, expected=0):
        argv = [str(value) for value in argv]
        start = dt.datetime.now(dt.timezone.utc).isoformat()
        clock = time.monotonic()
        result = subprocess.run(argv, capture_output=True, text=True, timeout=360)
        (output / (label + '.stdout.txt')).write_text(result.stdout)
        (output / (label + '.stderr.txt')).write_text(result.stderr)
        history.append({'label': label, 'argv': argv, 'startedUtc': start,
                        'endedUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
                        'elapsedSeconds': time.monotonic() - clock,
                        'returncode': result.returncode, 'expectedReturncode': expected,
                        'modelTokens': None, 'billedCost': None})
        (output / 'commands.json').write_text(json.dumps(history, indent=2) + '\n')
        print(json.dumps(history[-1]), flush=True)
        assert result.returncode == expected, result.stderr[-2000:]
        return result.stdout

    baseline_hashes = {name: sha(selected / name) for name in ('scene.blend', 'asset.glb')}
    if args.phase == 'inspect':
        inspection = output / 'inspection'
        command('inspect-selected', ['/usr/bin/blender', '--background', selected / 'scene.blend',
                '--threads', '2', '--python-exit-code', '1', '--python',
                Path(__file__).with_name('inspect_usable.py'), '--', '--glb', selected / 'asset.glb',
                '--lineage', selected / 'optimized-part-triangles.json.gz', '--out', inspection])
        correspondence = json.loads((inspection / 'export-correspondence.json').read_text())
        lineage = json.loads((inspection / 'source-part-correspondence.json').read_text())
        motion = json.loads((inspection / 'native-inspection.json').read_text())
        summary = {'passed': True, 'exportCorrespondence': correspondence['passed'],
                   'sourcePartCorrespondence': lineage['passed'], 'sourcePartCount': len(lineage['sourceParts']),
                   'triangles': correspondence['triangles'], 'meshes': correspondence['nativeMeshes'],
                   'collisionPairs': len(motion['collisionPairs']),
                   'collisionFrames': motion['sampledCollisionFrames'],
                   'surfaceIntersections': len(motion['surfaceIntersections'])}
    elif args.phase == 'negative':
        original = (selected / 'asset.glb').read_bytes()
        changed = bytearray(original)
        json_length, json_type = struct.unpack_from('<II', original, 12)
        assert json_type == 0x4E4F534A
        document = json.loads(original[20:20 + json_length])
        bin_header = 20 + json_length
        bin_length, bin_type = struct.unpack_from('<II', original, bin_header)
        assert bin_type == 0x004E4942
        primitive = document['meshes'][0]['primitives'][0]
        assert primitive.get('mode', 4) == 4
        accessor = document['accessors'][primitive['indices']]
        view = document['bufferViews'][accessor['bufferView']]
        assert 'sparse' not in accessor and accessor['count'] >= 3
        code = {5121: 'B', 5123: 'H', 5125: 'I'}[accessor['componentType']]
        offset = bin_header + 8 + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        first = struct.unpack_from('<3' + code, original, offset)
        assert len(set(first)) == 3
        reversed_face = (first[0], first[2], first[1])
        struct.pack_into('<3' + code, changed, offset, *reversed_face)
        negative = output / 'actual-one-flipped-triangle.glb'
        negative.write_bytes(changed)
        mutation = {'originalSha256': sha(selected / 'asset.glb'),
                    'negativeSha256': sha(negative), 'mesh': document['meshes'][0].get('name'),
                    'primitive': 0, 'triangleIndex': 0, 'indexComponentType': accessor['componentType'],
                    'absoluteBinaryOffset': offset, 'originalIndices': first,
                    'flippedIndices': reversed_face,
                    'changedByteOffsets': [i for i, (a, b) in enumerate(zip(original, changed)) if a != b],
                    'lengthUnchanged': len(original) == len(changed)}
        (output / 'mutation.json').write_text(json.dumps(mutation, indent=2) + '\n')
        inspection = output / 'inspection'
        command('inspect-actual-flip', ['/usr/bin/blender', '--background', selected / 'scene.blend',
                '--threads', '2', '--python-exit-code', '1', '--python',
                Path(__file__).with_name('inspect_usable.py'), '--', '--glb', negative,
                '--out', inspection], expected=2)
        report = json.loads((inspection / 'export-correspondence.json').read_text())
        failures = [row for row in report['correspondence'] if not row.get('passed')]
        assert not report['passed'] and len(failures) == 1
        assert failures[0]['missingOrReversedTriangles'] == 1
        assert failures[0]['extraOrReversedTriangles'] == 1
        summary = {'passed': True, 'operation': 'one actual exported GLB triangle winding reversed',
                   'detectedFailures': failures, 'allOtherImportedMeshesMatched': True,
                   'negativeReturncode': history[-1]['returncode']}
    else:
        project = work / 'project'
        state = json.loads(command('status-before', [sys.executable, cli, 'status', '--root', project]))
        assert state['head'] == args.selected_revision

        def bundle(state):
            root = Path(state['outputs']['blend']).parent.parent
            manifest = json.loads((root / 'revision.json').read_text())
            return {area + '/' + row['path']: sha(root / area / row['path'])
                    for area in ('artifacts', 'inputs') for row in manifest[area]}

        before = bundle(state)
        edited = json.loads(command('local-cover-edit', [sys.executable, cli, 'run',
            '--root', project, '--script', Path(__file__).with_name('edit_panel.py'),
            '--intent', 'move selected service-cover subtree 3 mm; preserve all unrelated objects',
            '--expected-revision', state['head'], '--expected-sequence', state['sequence'],
            '--review-spec', work / 'review.json', '--views', 'service-detail', '--size', '512',
            '--samples', '16', '--timeout', '360']))
        preservation_path = Path(edited['outputs']['blend']).parent / 'panel-preservation.json'
        preservation = json.loads(preservation_path.read_text())
        (output / 'panel-preservation.json').write_text(preservation_path.read_text())
        assert preservation['preservation_pass'] and preservation['displacement_pass']
        restored = json.loads(command('restore-selected', [sys.executable, cli, 'restore',
            '--root', project, '--revision', args.selected_revision,
            '--expected-revision', edited['head'], '--expected-sequence', edited['sequence']]))
        after = bundle(restored)
        assert before == after
        summary = {'passed': True, 'selectedRevision': args.selected_revision,
                   'editedRevision': edited['head'], 'restoredRevision': restored['head'],
                   'selectedCount': preservation['selected_count'],
                   'unrelatedCount': preservation['unrelated_count'],
                   'unrelatedChanged': preservation['unrelated_changed'],
                   'exactRestoredFileCount': len(before), 'before': before, 'after': after}
        (work / 'restored-selected-status.json').write_text(json.dumps(restored, indent=2) + '\n')
    after_hashes = {name: sha(selected / name) for name in baseline_hashes}
    assert baseline_hashes == after_hashes
    summary['selectedBytesUnchanged'] = after_hashes
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()

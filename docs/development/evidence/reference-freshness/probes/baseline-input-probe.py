#!/usr/bin/env python3
"""Read-only repo audit; storage/API fixtures, not Blender or visual evidence.

All mutations are disposable synthetic inputs/projects below this script's directory.
Uses the existing public project APIs and the repository's existing fake executor.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
REPO = Path('/workspace/scratch/c52cb753f160/refas')
OUT = Path(__file__).resolve().parent
SCRIPTS = REPO / 'skills/refas/scripts'
sys.path.insert(0, str(SCRIPTS))
from production import project

fake_worker = runpy.run_path(str(REPO / 'tests/test_production_project.py'))['fake_worker']
ROOTS = Path(tempfile.mkdtemp(prefix='cases-', dir=OUT))


def attempt(fn):
    try:
        return {'ok': True, 'value': fn()}
    except Exception as exc:
        return {'ok': False, 'type': type(exc).__name__, 'error': str(exc)}


def cli(*args):
    result = subprocess.run([sys.executable, '-B', str(SCRIPTS / 'produce.py'), *args],
                            cwd=OUT, text=True, capture_output=True)
    def decode(value):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return {'returncode': result.returncode, 'stdout': decode(result.stdout), 'stderr': decode(result.stderr)}


def fresh(name):
    folder = ROOTS / name
    folder.mkdir()
    root = folder / 'project'
    reference = folder / 'reference.png'
    reference.write_bytes(b'synthetic original reference A')
    script = folder / 'model.py'
    script.write_text('# original modeling instruction A\n')
    manual = folder / 'manual.blend'
    manual.write_bytes(b'BLENDER-manual-input-A')
    review = folder / 'review.json'
    spec = {'schema': 'refas.production.review/v2',
            'lighting': {'center': [0, 0, 0], 'radius': 1},
            'views': [{'name': 'front-detail', 'position': [0, -3, 0],
                       'target': [0, 0, 0], 'orthoScale': 2,
                       'reference': {'sourceSha256': project.digest(reference),
                                     'regionPixels': [0, 0, 100, 100]}}]}
    project.atomic_json(review, spec)
    project.initialize(root, name, [reference])
    return folder, root, reference, script, manual, review, spec


def run(root, script, **kwargs):
    return project.run_edit(root, script, 'synthetic storage audit', executor=fake_worker, **kwargs)


def reference_replacement():
    folder, root, reference, script, manual, review, spec = fresh('reference-replacement')
    first = run(root, script, review_spec=review)
    reference.write_bytes(b'synthetic revised reference B')
    new_spec = copy.deepcopy(spec)
    new_spec['views'][0]['reference']['sourceSha256'] = project.digest(reference)
    replacement_review = folder / 'replacement-review.json'
    project.atomic_json(replacement_review, new_spec)
    same_init = attempt(lambda: project.initialize(root, 'reference-replacement', [reference]))
    new_review = attempt(lambda: run(root, script, review_spec=replacement_review))
    verify = project.verify_project(root)
    current = project.status(root)
    assert verify['ok'] and first['head'] == current['head']
    assert not same_init['ok'] and 'already exists' in same_init['error']
    assert not new_review['ok'] and 'outside this project' in new_review['error']
    assert current['sources'][0]['sha256'] != project.digest(reference)
    return {'case': 'explicit changed reference cannot enter an existing project',
            'root': str(root), 'head': first['head'],
            'captured_source': current['sources'][0], 'new_reference_sha256': project.digest(reference),
            'reinitialize_with_new_reference': same_init, 'run_with_new_reference_review': new_review,
            'verify_after_external_change': verify,
            'status_after_external_change': current,
            'classification': 'Missing explicit intake workflow; independent reference snapshot is intentional.'}


def outside_drift():
    folder, root, reference, script, manual, review, spec = fresh('outside-input-drift')
    old = {p.name: project.digest(p) for p in (reference, script, manual, review)}
    def mutate_originals(command, cwd, log_file, timeout):
        job = project.read_json(command[-1])
        elapsed = fake_worker(command, cwd, log_file, timeout)
        script.write_text('# revised modeling instruction B\n')
        manual.write_bytes(b'BLENDER-manual-input-B')
        reference.write_bytes(b'synthetic revised reference B')
        new_spec = copy.deepcopy(spec)
        new_spec['lighting']['radius'] = 2
        new_spec['views'][0]['orthoScale'] = 3
        project.atomic_json(review, new_spec)
        return elapsed
    published = project.run_edit(root, script, 'external inputs change after capture',
                                 input_blend=manual, review_spec=review, executor=mutate_originals)
    rev = project.load_revision(root)
    captured = {item['path']: item['sha256'] for item in rev['inputs']}
    new = {p.name: project.digest(p) for p in (reference, script, manual, review)}
    assert captured['edit.py'] == old['model.py'] != new['model.py']
    assert captured['base.blend'] == old['manual.blend'] != new['manual.blend']
    assert captured['review.json'] == old['review.json'] != new['review.json']
    restarted_status = cli('status', '--root', str(root))
    restarted_verify = cli('verify', '--root', str(root))
    assert restarted_status['returncode'] == restarted_verify['returncode'] == 0
    assert restarted_verify['stdout']['scope'] == 'recorded-file-integrity'
    return {'case': 'original script native review and reference drift after freezing',
            'root': str(root), 'head': published['head'], 'old_external_hashes': old,
            'new_external_hashes': new, 'frozen_input_hashes': captured,
            'publication': {'ok': published['ok'], 'publishedRevision': published['publishedRevision']},
            'restarted_status': restarted_status, 'restarted_verify': restarted_verify,
            'classification': 'Correct historical capture; no binding to a current workspace or freshness reporting.'}


def manual_native_in_place():
    folder, root, reference, script, manual, review, spec = fresh('manual-native-in-place')
    first = run(root, script)
    native = Path(first['outputs']['blend'])
    original_sha = project.digest(native)
    native.write_bytes(b'BLENDER-edited-directly-from-the-status-output-path')
    manual.write_bytes(native.read_bytes())
    worker_called = []
    def observing_worker(*args):
        worker_called.append(True)
        return fake_worker(*args)
    read_status = attempt(lambda: project.status(root))
    verify = attempt(lambda: project.verify_project(root))
    explicit_import = attempt(lambda: project.run_edit(root, script, 'import separately copied manual save',
                                                       input_blend=manual, executor=observing_worker))
    only_revision_restore = attempt(lambda: project.restore(root, first['head']))
    assert not any(x['ok'] for x in (read_status, verify, explicit_import, only_revision_restore))
    assert not worker_called
    assert project.load_project(root)['head'] == first['head']
    return {'case': 'direct native edit of status output blocks status and explicit import',
            'root': str(root), 'head': first['head'], 'native_path': str(native),
            'original_sha256': original_sha, 'manual_sha256': project.digest(native),
            'status': read_status, 'verify': verify, 'explicit_manual_import': explicit_import,
            'restore_only_revision': only_revision_restore, 'worker_called': bool(worker_called),
            'restarted_cli_status': cli('status', '--root', str(root)),
            'classification': 'Documented manual input flow assumes Save As; no separate editable workspace or damaged-head import recovery.'}


def render_resume():
    folder, root, reference, script, manual, review, spec = fresh('render-resume')
    first = run(root, script, review_spec=review, size=768, samples=16)
    first_job = project.read_json(root / project.STATE_DIR / 'runs' / first['runId'] / 'job.json')
    second = run(root, script)
    second_job = project.read_json(root / project.STATE_DIR / 'runs' / second['runId'] / 'job.json')
    assert first_job['views'] == ['front-detail']
    assert second_job['views'] == ['hero', 'side']
    assert second_job['render'] == {'engine': 'CYCLES', 'samples': 8, 'size': 384}
    assert 'reviewSpec' not in second_job
    assert 'review.json' not in second['inputs']
    assert project.load_revision(root, first['head'])['id'] == first['head']
    return {'case': 'ordinary resumed run does not inherit fixed review or render conditions',
            'root': str(root), 'first_head': first['head'], 'second_head': second['head'],
            'first_job': first_job, 'second_job': second_job,
            'first_views': [x['view'] for x in first['observations']],
            'second_views': [x['view'] for x in second['observations']],
            'verify': project.verify_project(root),
            'classification': 'Documented per-run options; no persisted current render intent for freshness comparison.'}


def explicit_manual_supported():
    folder, root, reference, script, manual, review, spec = fresh('explicit-manual-supported')
    first = run(root, script)
    second = run(root, script, input_blend=manual, expected_revision=first['head'])
    revision = project.load_revision(root)
    captured = next(x for x in revision['inputs'] if x['path'] == 'base.blend')
    assert captured['sha256'] == project.digest(manual)
    assert revision['parent'] == first['head']
    manual.unlink()
    verify = project.verify_project(root)
    assert verify['ok']
    return {'case': 'control: separate manual save is imported and survives external deletion',
            'root': str(root), 'first_head': first['head'], 'import_head': second['head'],
            'captured_input': captured, 'verify_after_external_input_deleted': verify,
            'classification': 'Already implemented; do not reinvent manual import or require originals for historical verification.'}


def main():
    result = {'repo': str(REPO), 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
              'evidence_scope': 'Existing API and CLI storage behavior with existing fake worker; no real Blender, renders, or quality claims.',
              'cases': [reference_replacement(), outside_drift(), manual_native_in_place(), render_resume(), explicit_manual_supported()],
              'cli_help': cli('--help')}
    path = OUT / 'probe-results.json'
    project.atomic_json(path, result)
    print(json.dumps({'result': str(path), 'cases': len(result['cases']),
                      'repository_status': subprocess.check_output(['git', 'status', '--short'], cwd=REPO, text=True)}, indent=2))


if __name__ == '__main__':
    main()

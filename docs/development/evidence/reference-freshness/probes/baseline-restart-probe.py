#!/usr/bin/env python3
"""Disposable probes for RefAs restart and concurrent status behavior.

Uses production public APIs and the repository's existing fake worker. The
load_project wrapper only schedules a legitimate concurrent publication at a
deterministic boundary; it does not forge state or change repository files.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest import mock

sys.dont_write_bytecode = True
REPO = Path('/workspace/scratch/c52cb753f160/refas')
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('production_project_test_fixture', REPO / 'tests/test_production_project.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
project = fixture.project


def create_case(parent, name):
    case = parent / name
    case.mkdir()
    root = case / 'project'
    script = case / 'edit.py'
    script.write_text('# deterministic transaction probe\n', encoding='utf-8')
    project.initialize(root, name)
    first = project.run_edit(root, script, 'create initial revision', executor=fixture.fake_worker)
    return root, script, first


def concurrent_status(parent):
    root, script, first = create_case(parent, 'status-read-race')
    real_load = project.load_project
    advanced = {}
    once = False

    def publish_after_read(candidate_root):
        nonlocal once
        captured_state = real_load(candidate_root)
        if not once:
            once = True
            advanced.update(project.run_edit(root, script, 'concurrent new capture',
                                             views=['top'], executor=fixture.fake_worker))
        return captured_state

    with mock.patch.object(project, 'load_project', side_effect=publish_after_read):
        observed = project.status(root)
    stable = project.status(root)
    missing = [item['path'] for item in observed['observations'] if not Path(item['path']).is_file()]
    missing += [path for path in observed['inputs'].values() if not Path(path).is_file()]
    assert observed['head'] == first['head']
    assert [item['view'] for item in observed['observations']] == ['top']
    assert missing
    assert stable['head'] == advanced['head']
    assert project.verify_project(root)['ok'] is True
    return {
        'classification': 'reproducible coherent-read bug',
        'root': str(root),
        'firstHead': first['head'],
        'committedHead': advanced['head'],
        'racingStatus': observed,
        'missingPathsReturnedWithOkTrue': missing,
        'stableStatus': stable,
        'historyIntegrityAfterRace': project.verify_project(root),
    }


def abandoned_lock(parent):
    root, script, first = create_case(parent, 'abandoned-publication-lock')
    child = '''import os, sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
from production import project
with project.project_lock(Path(sys.argv[2]) / project.STATE_DIR):
    os._exit(73)
'''
    process = subprocess.run([sys.executable, '-B', '-c', child,
                              str(REPO / 'skills/refas/scripts'), str(root)],
                             capture_output=True, text=True, check=False)
    assert process.returncode == 73, process.stderr
    lock = root / project.STATE_DIR / 'write.lock'
    lock_record = project.read_json(lock)
    intact_status = project.status(root)
    try:
        project.restore(root, first['head'])
    except project.ProductionError as exc:
        restore_error = str(exc)
    else:
        raise AssertionError('restore unexpectedly accepted an abandoned lock')
    assert 'locked' in restore_error
    assert project.load_project(root)['head'] == first['head']
    # A stale caller is still rejected before any worker executes.
    calls = []
    def unexpected_worker(*args):
        calls.append(args)
        return fixture.fake_worker(*args)
    try:
        project.run_edit(root, script, 'stale guarded edit', expected_revision='none',
                         executor=unexpected_worker)
    except project.ProductionError as exc:
        stale_error = str(exc)
    else:
        raise AssertionError('stale explicit head accepted')
    assert 'expected revision' in stale_error and not calls
    return {
        'classification': 'documented automatic stale-lock recovery limit',
        'root': str(root),
        'abruptChildExit': process.returncode,
        'lock': lock_record,
        'statusOkDespiteLock': intact_status['ok'],
        'statusFields': sorted(intact_status),
        'verify': project.verify_project(root),
        'restoreError': restore_error,
        'headUnchanged': project.load_project(root)['head'] == first['head'],
        'staleExpectedRevisionError': stale_error,
        'staleExpectedRevisionWorkerCalls': len(calls),
        'lockRetainedForInspection': str(lock),
    }


def main():
    work = Path(tempfile.mkdtemp(prefix='cases-', dir=OUT))
    result = {
        'repo': str(REPO),
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        'scope': 'production state transaction behavior only; fake worker is not Blender or visual evidence',
        'concurrentStatus': concurrent_status(work),
        'abandonedLock': abandoned_lock(work),
    }
    destination = OUT / 'results.json'
    destination.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'results': str(destination), 'work': str(work),
                      'raceMissingPaths': result['concurrentStatus']['missingPathsReturnedWithOkTrue'],
                      'abandonedLockRestoreError': result['abandonedLock']['restoreError']}, indent=2))


if __name__ == '__main__':
    main()

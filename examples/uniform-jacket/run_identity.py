#!/usr/bin/env python3
"""Informed source-identity refinement with timed public production commands.

Stages are deliberately reviewable: baseline, candidate, and finalize. Repeated
candidate stages start from the immutable supplied baseline and retain every
previous revision. This is authoring evidence, never an independent benchmark.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bundle(state):
    files = {'artifacts/' + p.name: p for p in Path(state['outputs']['blend']).parent.iterdir() if p.is_file()}
    files.update({'inputs/' + k: Path(v) for k, v in state.get('inputs', {}).items()})
    return {k: {'sha256': sha(v), 'bytes': v.stat().st_size} for k, v in files.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', choices=['baseline', 'candidate', 'finalize'], required=True)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--skill-root', type=Path, required=True)
    parser.add_argument('--input-blend', type=Path, required=True)
    parser.add_argument('--label', default='identity-01')
    parser.add_argument('--check-prior-label', help='For finalize: verify that only the lower front drape differs geometrically from this retained candidate')
    parser.add_argument('--blender', default='/usr/bin/blender')
    parser.add_argument('--size', type=int, default=640)
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--authoring-start-utc', help='Optional externally observed start for this authoring session; replay defaults to execution time')
    args = parser.parse_args()
    root = args.root.resolve(); root.mkdir(parents=True, exist_ok=True)
    logs = root / 'commands'; logs.mkdir(exist_ok=True)
    example = Path(__file__).resolve().parent
    entry = args.skill_root.resolve() / 'scripts' / 'produce.py'
    source = example / 'source' / 'reference.png'
    native_source = args.input_blend.resolve()
    project = root / 'project'
    record_path = root / 'execution.json'
    record = json.loads(record_path.read_text()) if record_path.exists() else {
        'mode': 'informed-v2 existing-asset source-identity refinement',
        'authoring_start_observed_utc': args.authoring_start_utc or utc(),
        'preparation_note': 'An explicit authoring start is external session evidence; default records this replay execution.',
        'runner_first_start_utc': utc(), 'commands': [], 'candidates': [],
        'original_inputs': {str(p): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in (source, native_source)},
        'versions': {'python': sys.version, 'platform': platform.platform(), 'entry': str(entry), 'entry_sha256': sha(entry)},
        'unexposed_costs': {'model_tokens': None, 'model_billing': None, 'reason': 'Not exposed to the authoring runtime'},
        'limits': ['Informed continuation after prior review, not a fair no-skill/1.x/2.0 benchmark.',
                   'Concurrent machine load is uncontrolled; durations are observations, not comparable isolated performance.',
                   'Reference cameras are unregistered; no automatic resemblance score is claimed.',
                   'No rig, cloth simulation, production UV layout, or engine readiness claim.']}
    recorded_native = next(row['sha256'] for path,row in record['original_inputs'].items() if Path(path).suffix == '.blend')
    if sha(native_source) != recorded_native:
        raise ValueError('Native input differs from the recorded immutable baseline; start a new --root for different bytes')
    recorded_reference = next(row['sha256'] for path,row in record['original_inputs'].items() if Path(path).suffix == '.png')
    if sha(source) != recorded_reference:
        raise ValueError('Source image differs from the recorded immutable reference; start a new --root')
    if args.stage == 'candidate' and any(c['label'] == args.label for c in record['candidates']):
        raise ValueError('Candidate label already exists; choose a unique --label to retain its native/renders: ' + args.label)
    if args.check_prior_label and not any(c['label'] == args.check_prior_label for c in record['candidates']):
        raise ValueError('Unknown --check-prior-label: ' + args.check_prior_label)
    def save():
        record_path.write_text(json.dumps(record, indent=2) + '\n')
    def command(label, argv, parse=True):
        idx = len(record['commands']) + 1
        stem = f'{idx:03d}-{label}'
        row = {'label': label, 'argv': list(map(str, argv)), 'start_utc': utc(), 'start_monotonic': time.monotonic(), 'status': 'running'}
        record['commands'].append(row); save()
        result = subprocess.run(row['argv'], text=True, capture_output=True)
        row.update(end_utc=utc(), end_monotonic=time.monotonic(), exit_status=result.returncode, status='completed')
        row['duration_seconds'] = row['end_monotonic'] - row['start_monotonic']
        row['stdout'] = str(logs / (stem + '.stdout.txt')); row['stderr'] = str(logs / (stem + '.stderr.txt'))
        Path(row['stdout']).write_text(result.stdout); Path(row['stderr']).write_text(result.stderr); save()
        if result.returncode:
            raise RuntimeError(f'{label} failed ({result.returncode}):\n{result.stderr[-1500:]}\n{result.stdout[-2500:]}')
        if not parse:
            return result.stdout
        value = json.loads(result.stdout)
        if not value.get('ok'):
            raise RuntimeError(label + ' returned unsuccessful JSON')
        return value
    def cli(label, *words):
        return command(label, [sys.executable, str(entry), *map(str, words)])
    def capture(label, state):
        folder = root / 'renders' / label; folder.mkdir(parents=True, exist_ok=True)
        for v in state['observations']:
            shutil.copy2(v['path'], folder / Path(v['path']).name)
        (root / (label + '-state.json')).write_text(json.dumps(state, indent=2) + '\n')
    # One ten-view specification preserves every old whole/collar camera and
    # adds a fixed ornament view, used identically for before and after.
    review = root / 'review-identity.json'
    if not review.exists():
        spec = json.loads((example / 'review.json').read_text())
        spec['views'] += json.loads((example / 'review-fold-detail.json').read_text())['views']
        spec['views'].append({'name': 'ornament', 'position': [1.5, -2, .32], 'target': [.174, -.047, .269], 'orthoScale': .245,
                              'reference': {'sourceSha256': sha(source), 'regionPixels': [414, 444, 582, 580]}})
        review.write_text(json.dumps(spec, indent=2) + '\n')
    noop = root / 'identity-observe.py'
    noop.write_text('# Preserve the supplied native asset and render fixed review views.\n')
    def run(label, script, intent, input_blend=None, target=project, views=None):
        current = cli(label + '-status', 'status', '--root', target)
        words = ['run', '--root', target, '--script', script, '--intent', intent,
                 '--review-spec', review, '--size', args.size, '--samples', args.samples,
                 '--timeout', 600, '--blender', args.blender, '--expected-revision', current.get('head') or 'none',
                 '--expected-sequence', current['sequence']]
        if input_blend:
            words += ['--input-blend', input_blend]
        if views is not None:
            words += ['--views', views]
        if script.name == 'refine_identity.py' and 'first_script_execution_start_utc' not in record:
            record['first_script_execution_start_utc'] = utc(); save()
        state = cli(label, *words)
        capture(label, state)
        return state
    if args.stage == 'baseline':
        if (project / '.refas2').exists():
            raise RuntimeError('Use a new root; baseline already exists')
        doctor = cli('doctor', 'doctor', '--blender', args.blender)
        record['versions']['doctor'] = doctor
        cli('init', 'init', '--root', project, '--name', 'uniform-jacket-source-identity', '--reference', source)
        baseline = run('before', noop, 'Immutable selected baseline under fixed source-identity review', native_source)
        record['baseline'] = baseline
        shutil.copy2(baseline['outputs']['blend'], root / 'baseline.blend')
        shutil.copy2(baseline['outputs']['glb'], root / 'baseline.glb')
        save()
    elif args.stage == 'candidate':
        state = run(args.label, example / 'refine_identity.py',
                    'Refine source-visible collar roll, tailored cloth, black straps and left shield-chain assembly', native_source)
        first_render = min(state['observations'], key=lambda v: Path(v['path']).stat().st_mtime)
        record.setdefault('first_actual_rendered_candidate_utc', dt.datetime.fromtimestamp(Path(first_render['path']).stat().st_mtime, dt.timezone.utc).isoformat())
        record.setdefault('first_actual_rendered_candidate', first_render['path'])
        record.setdefault('first_candidate_render_bundle_observed_complete_utc', utc())
        record['candidates'].append({'label': args.label, 'state': state, 'captured_utc': utc(), 'script_sha256': sha(state['inputs']['edit.py'])})
        baseline = record['baseline']
        keys = ('camera', 'lighting', 'renderer', 'referenceRegion', 'registration')
        record['fixed_review_metadata_match'] = [{k:v.get(k) for k in keys} for v in baseline['observations']] == [{k:v.get(k) for k in keys} for v in state['observations']]
        assert record['fixed_review_metadata_match']
        save()
    else:
        candidate = next(c for c in record['candidates'] if c['label'] == args.label)
        selected = candidate['state']; selected_bundle = bundle(selected)
        current = cli('selection-status', 'status', '--root', project)
        if current['head'] != selected['head']:
            cli('select-candidate', 'restore', '--root', project, '--revision', selected['head'], '--expected-revision', current['head'])
        for ext,key in [('blend','blend'),('glb','glb')]:
            shutil.copy2(selected['outputs'][key], root / ('native.' + ext))
        capture('after', selected)
        edited = run('cuff-edited', example / 'edit_cuff.py', 'Meaningful local edit: left cuff +0.01 m, preserving all other parts', views='front,front-three-quarter,left')
        edit_check = Path(edited['outputs']['blend']).parent / 'cuff-edit-checks.json'
        cuff = json.loads(edit_check.read_text())
        assert cuff['protected_changed'] == [] and cuff['materials_unchanged']
        assert len(cuff['changed_objects']) == 7
        assert abs(cuff['native_band_delta_m'] - .01) < 1e-6
        shutil.copy2(edit_check, root / 'cuff-edit-checks.json')
        for ext in ['blend','glb']:
            shutil.copy2(edited['outputs'][ext], root / ('cuff-edited.' + ext))
        cli('restore', 'restore', '--root', project, '--revision', selected['head'], '--expected-revision', edited['head'])
        restored = cli('restored-status', 'status', '--root', project)
        assert bundle(restored) == selected_bundle
        for ext in ['blend','glb']:
            shutil.copy2(restored['outputs'][ext], root / ('restored.' + ext))
        verify = cli('verify', 'verify', '--root', project)
        independent_argv = [args.blender, '--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1',
                  '--python', example / 'inspect_identity.py', '--', root / 'native.blend', root / 'native.glb', root / 'independent-check.json', root / 'imported-glb.blend', native_source]
        if args.check_prior_label:
            previous = next(c for c in record['candidates'] if c['label'] == args.check_prior_label)
            independent_argv.append(previous['state']['outputs']['blend'])
        command('independent-native-glb', independent_argv, False)
        check = json.loads((root / 'independent-check.json').read_text()); assert check['passed']
        observation_project = root / 'glb-observation'
        cli('glb-init', 'init', '--root', observation_project, '--name', 'independent-glb-observation', '--reference', source)
        glb_state = run('glb-readback', noop, 'Independent actual GLB readback in same review camera', root / 'imported-glb.blend', observation_project, 'front-three-quarter,ornament')
        record.update(selected_label=args.label, selected_revision=selected['head'], edited_revision=edited['head'], restored_revision=restored['head'],
                      exact_selected_bundle_restore=True, selected_bundle=selected_bundle, verify=verify,
                      cuff_edit={k:v for k,v in cuff.items() if k not in ['before','after']},
                      independent_native_glb={k:v for k,v in check.items() if k not in ['native_object_states','imported_object_states']},
                      glb_readback=glb_state, authoring_end_utc=utc())
        scripts = root / 'reproduce'; scripts.mkdir(exist_ok=True)
        shutil.copy2(selected['inputs']['edit.py'], scripts / 'refine_identity.py')
        for name in ['run_identity.py','inspect_identity.py','inspect_fold.py','edit_cuff.py','reference.json','compose_identity_review.py']:
            shutil.copy2(example / name, scripts / name)
        (scripts / 'source').mkdir(exist_ok=True)
        shutil.copy2(source, scripts / 'source' / 'reference.png')
        shutil.copy2(review, scripts / 'review-identity.json')
        for name in ['review.json','review-fold-detail.json']:
            shutil.copy2(example / name, scripts / name)
    record['original_inputs_unchanged'] = all(sha(path) == row['sha256'] for path,row in record['original_inputs'].items())
    assert record['original_inputs_unchanged']; save()
    print(json.dumps({'ok': True, 'stage': args.stage, 'record': str(record_path), 'root': str(root)}, indent=2))


if __name__ == '__main__':
    main()

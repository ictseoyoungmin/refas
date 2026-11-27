#!/usr/bin/env python3
"""Reproduce the informed jacket refinement, cuff edit and exact bundle restore.

This calls only the installed public produce.py commands and ordinary Blender
scripts in this example. It does not grade reference resemblance or assert
cloth simulation / engine readiness. --resume-selected operates on an already
reviewed current project and leaves its earlier revisions intact.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bundle(state):
    artifacts = Path(state['outputs']['blend']).parent
    files = {'artifacts/' + p.name: p for p in artifacts.iterdir() if p.is_file()}
    files.update({'inputs/' + name: Path(path) for name, path in state.get('inputs', {}).items()})
    return {name: {'sha256': digest(path), 'bytes': path.stat().st_size} for name, path in files.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True, help='Output folder; production project is ROOT/project')
    parser.add_argument('--skill-root', type=Path, required=True)
    parser.add_argument('--input-blend', type=Path, required=True)
    parser.add_argument('--resume-selected', action='store_true', help='Use the intact existing project head as the selected candidate')
    parser.add_argument('--size', type=int, default=512)
    parser.add_argument('--samples', type=int, default=16)
    args = parser.parse_args()
    root = args.root.resolve(); root.mkdir(parents=True, exist_ok=True)
    project = root / 'project'
    entry = args.skill_root.resolve() / 'scripts' / 'produce.py'
    example = Path(__file__).resolve().parent
    source = example / 'source' / 'reference.png'
    review = example / 'review.json'
    source_blend = args.input_blend.resolve()
    source_hashes = {str(p): digest(p) for p in (source_blend, source, review)}
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    commands = []
    (root / 'commands').mkdir(exist_ok=True)

    def command(label, *words):
        argv = [sys.executable, str(entry), *map(str, words)]
        begin = time.monotonic()
        result = subprocess.run(argv, text=True, capture_output=True)
        elapsed = time.monotonic() - begin
        (root / 'commands' / (label + '.stdout.json')).write_text(result.stdout)
        (root / 'commands' / (label + '.stderr.txt')).write_text(result.stderr)
        commands.append({'label': label, 'argv': argv, 'returncode': result.returncode,
                         'elapsed_seconds': round(elapsed, 3)})
        (root / 'commands.json').write_text(json.dumps(commands, indent=2))
        if result.returncode:
            raise RuntimeError(label + ' failed: ' + result.stderr[-3000:])
        value = json.loads(result.stdout)
        if not value.get('ok', False):
            raise RuntimeError(label + ' did not report success: ' + result.stdout[-3000:])
        return value

    def run(label, script, intent, current=None, input_blend=None):
        words = ['run', '--outputs', 'delivery', '--root', project, '--script', script, '--intent', intent,
                 '--review-spec', review, '--size', args.size, '--samples', args.samples,
                 '--timeout', 240]
        if input_blend:
            words += ['--input-blend', input_blend]
        words += ['--expected-revision', current['head'] if current else 'none']
        return command(label, *words)

    def copy_views(label, state):
        folder = root / 'renders' / label; folder.mkdir(parents=True, exist_ok=True)
        for observation in state['observations']:
            shutil.copy2(observation['path'], folder / Path(observation['path']).name)

    doctor = command('doctor', 'doctor')
    if args.resume_selected:
        command('preexisting-verify', 'verify', '--root', project)
        selected = command('selected-status', 'status', '--root', project)
        if not selected.get('head'):
            raise ValueError('--resume-selected requires an existing non-empty project')
        baseline = None
    else:
        if (project / '.refas2').exists():
            raise ValueError('Project already exists; choose a fresh --root or --resume-selected')
        command('init', 'init', '--root', project, '--name', 'uniform-jacket-refinement', '--reference', source)
        baseline_script = root / 'baseline.py'
        baseline_script.write_text('# Import and render the supplied native source without an asset edit.\n')
        baseline = run('baseline', baseline_script, 'Imported native source before informed refinement', input_blend=source_blend)
        copy_views('before', baseline)
        shutil.copy2(baseline['outputs']['blend'], root / 'baseline.blend')
        shutil.copy2(baseline['outputs']['glb'], root / 'baseline.glb')
        surface = run('surface', example / 'refine_surface.py',
                      'Rebuild matched continuous sleeve caps and fitted torso; preserve cuff and ornament assemblies', baseline)
        selected = run('collar', example / 'refine_collar.py',
                       'Build a turned collar and rolled lapels with material adjustment under unchanged review lights', surface)

    selected_hashes = bundle(selected)
    selected_id = selected['head']
    selected_artifacts = Path(selected['outputs']['blend']).parent
    copy_views('after', selected)
    shutil.copy2(selected['outputs']['blend'], root / 'candidate.blend')
    shutil.copy2(selected['outputs']['glb'], root / 'candidate.glb')
    selected_result = json.loads((selected_artifacts / 'result.json').read_text())

    edited = run('cuff-edit', example / 'edit_cuff.py',
                 'Only wearer-left cuff assembly: extend band 0.01 m proximally; keep distal rim and other asset objects', selected)
    edited_artifacts = Path(edited['outputs']['blend']).parent
    cuff_check = json.loads((edited_artifacts / 'cuff-edit-checks.json').read_text())
    assert cuff_check['protected_changed'] == []
    assert cuff_check['materials_unchanged']
    assert abs(cuff_check['native_band_delta_m'] - .01) < 1e-6
    shutil.copy2(edited['outputs']['blend'], root / 'cuff-edited.blend')
    shutil.copy2(edited['outputs']['glb'], root / 'cuff-edited.glb')
    copy_views('cuff-edited', edited)
    shutil.copy2(edited_artifacts / 'cuff-edit-checks.json', root / 'cuff-edit-checks.json')

    restored = command('restore', 'restore', '--root', project, '--revision', selected_id,
                       '--expected-revision', edited['head'])
    restored_status = command('restored-status', 'status', '--root', project)
    restored_hashes = bundle(restored_status)
    same = selected_hashes == restored_hashes
    if not same:
        raise AssertionError('Restore did not preserve exact selected artifact/input bundle bytes')
    shutil.copy2(restored_status['outputs']['blend'], root / 'restored.blend')
    shutil.copy2(restored_status['outputs']['glb'], root / 'restored.glb')
    verified = command('final-verify', 'verify', '--root', project)
    assert all(digest(path) == checksum for path, checksum in source_hashes.items())

    view_checks = None
    if baseline:
        keys = ('camera', 'lighting', 'renderer', 'referenceRegion', 'registration')
        old = {v['view']: {k: v.get(k) for k in keys} for v in baseline['observations']}
        new = {v['view']: {k: v.get(k) for k in keys} for v in selected['observations']}
        view_checks = old == new
        assert view_checks, 'Before/after review camera, light or renderer metadata changed'

    scripts = root / 'scripts'; scripts.mkdir(exist_ok=True)
    for name in ['refine_surface.py', 'refine_collar.py', 'edit_cuff.py', 'run_refinement.py']:
        shutil.copy2(example / name, scripts / name)
    (scripts / 'source').mkdir(exist_ok=True)
    shutil.copy2(source, scripts / 'source' / 'reference.png')
    for name in ['review.json', 'reference.json', 'TASK.md']:
        shutil.copy2(example / name, scripts / name)
    report = {'started_at': started, 'ended_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'mode': 'informed existing-asset refinement and edit/restore exercise',
              'resume_selected': args.resume_selected, 'source_hashes': source_hashes,
              'original_bytes_preserved': True, 'blender_probe': doctor,
              'baseline_revision': baseline['head'] if baseline else None,
              'selected_revision': selected_id, 'edited_revision': edited['head'],
              'restored_revision': restored_status['head'],
              'bundle_exact_restore': same, 'selected_bundle_hashes': selected_hashes,
              'restored_bundle_hashes': restored_hashes,
              'fixed_review_metadata_match': view_checks,
              'native_and_glb_reopen': selected_result['verification'],
              'cuff_edit': {k:v for k,v in cuff_check.items() if k not in ('before','after')},
              'integrity_verify': verified, 'commands': commands,
              'claim_limits': ['Successful execution does not select a visually accepted asset.',
                               'Native/GLB reopening checks recorded fingerprints, geometry counts, bounds and basic presence.',
                               'Exact restore compares every selected artifact and input file by bytes and SHA-256.',
                               'This runner does not grade resemblance, cloth simulation, skinning, UV quality or engine readiness.']}
    (root / 'execution.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'ok': True, 'selected_revision': selected_id,
                      'restored_revision': restored_status['head'],
                      'exact_bundle_restore': same, 'report': str(root / 'execution.json')}, indent=2))


if __name__ == '__main__':
    main()

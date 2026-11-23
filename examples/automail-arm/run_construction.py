#!/usr/bin/env python3
"""Continue the saved AURIX arm with source-led construction and fixed review.

This is an informed refinement, not a controlled workflow-speed benchmark.
Every launched authoring/validation subprocess has UTC and monotonic timing.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import resource
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bundle_hashes(state):
    folder = Path(state['outputs']['blend']).parent.parent
    manifest = json.loads((folder / 'revision.json').read_text())
    return {area + '/' + e['path']: sha(folder / area / e['path'])
            for area in ('artifacts', 'inputs') for e in manifest[area]}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--skill-root', type=Path, required=True)
    ap.add_argument('--input-blend', type=Path, required=True)
    ap.add_argument('--blender', default='blender')
    ap.add_argument('--phase', choices=['baseline', 'build', 'revise', 'exercise', 'open-service', 'readback', 'package'], default='build')
    ap.add_argument('--evidence-root', type=Path, help='Destination for package evidence; required for package phase')
    ap.add_argument('--intent', default='source-led nested armor, exposed mechanism, recessed service bay and tapered hand')
    ap.add_argument('--authoring-start-utc')
    ap.add_argument('--source-revision', help='Caller-supplied verified package source identity; never inferred from this runner')
    args = ap.parse_args()
    out = args.root.resolve(); out.mkdir(parents=True, exist_ok=True)
    skill = args.skill_root.resolve(); project = out / 'project'
    logs = out / 'logs'; logs.mkdir(exist_ok=True)
    scripts = out / 'scripts'; scripts.mkdir(exist_ok=True)
    originals = out / 'originals'; originals.mkdir(exist_ok=True)
    commands = out / 'construction-commands.json'
    history = json.loads(commands.read_text()) if commands.exists() else []
    timing_path = out / 'construction-timing.json'
    timing = json.loads(timing_path.read_text()) if timing_path.exists() else {
        'mode': 'informed-v2-refinement',
        'authoring_start_utc': args.authoring_start_utc,
        'authoring_start_source': 'caller-supplied timestamp' if args.authoring_start_utc else 'unavailable; runner time is measured separately',
        'runner_started_utc': utc(), 'first_candidate_script_execution_utc': None,
        'first_candidate_render_bundle_observed_complete_utc': None,
        'first_visually_validated_useful_change_utc': None,
        'authoring_end_utc': None,
        'model_tokens': None, 'model_cost': None, 'tool_billing_cost': None,
        'unavailable_cost_reason': 'Provider usage, billing and infrastructure price are not exposed to this authoring session.',
        'blender_threads': 2, 'concurrency': 'A separate garment author runs concurrently; CPU contention is not controlled.',
        'comparison_limit': 'Continuation benefits from previous geometry, critiques and informed design decisions. It is not a no-skill/1.x/2.0 benchmark.'}
    timing_path.write_text(json.dumps(timing, indent=2) + '\n')

    def command(label, argv, timeout=1500):
        argv = [str(a) for a in argv]
        stem = '%03d-%s' % (len(history), label)
        stdout = logs / (stem + '.stdout.txt'); stderr = logs / (stem + '.stderr.txt')
        row = {'label': label, 'argv': argv, 'started_utc': utc(),
               'started_monotonic_seconds': time.monotonic(), 'ended_utc': None,
               'duration_monotonic_seconds': None, 'returncode': None,
               'stdout': str(stdout), 'stderr': str(stderr)}
        history.append(row); commands.write_text(json.dumps(history, indent=2) + '\n')
        prior = resource.getrusage(resource.RUSAGE_CHILDREN)
        try:
            p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
            stdout.write_text(p.stdout); stderr.write_text(p.stderr); row['returncode'] = p.returncode
        except subprocess.TimeoutExpired as exc:
            stdout.write_text(exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or ''))
            stderr.write_text(exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or ''))
            row['returncode'] = -1; row['failure'] = 'timeout after %s seconds' % timeout
            p = None
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        row.update(ended_utc=utc(), duration_monotonic_seconds=time.monotonic() - row['started_monotonic_seconds'],
                   child_user_cpu_seconds=after.ru_utime-prior.ru_utime,
                   child_system_cpu_seconds=after.ru_stime-prior.ru_stime)
        commands.write_text(json.dumps(history, indent=2) + '\n')
        print(json.dumps({k: row[k] for k in ['label', 'started_utc', 'ended_utc', 'duration_monotonic_seconds', 'returncode']}), flush=True)
        if row['returncode']:
            raise RuntimeError(label + ' failed; retained ' + str(stderr))
        return p.stdout

    def cli(label, *parts):
        return json.loads(command(label, [sys.executable, skill / 'scripts/produce.py', *parts]))

    def save(state, label):
        folder = out / 'candidates' / label; folder.mkdir(parents=True, exist_ok=True)
        for kind, name in [('blend', 'native.blend'), ('glb', 'asset.glb'), ('scene', 'scene.json')]:
            shutil.copy2(state['outputs'][kind], folder / name)
        rd = folder / 'renders'; rd.mkdir(exist_ok=True)
        for ob in state['observations']:
            shutil.copy2(ob['path'], rd / (ob['view'] + '.png'))
        (folder / 'revision.json').write_text(json.dumps(state, indent=2) + '\n')
        for name in ['construction-report.json', 'pose-check.json', 'construction-pose-check.json', 'panel-preservation.json']:
            p = Path(state['outputs']['blend']).parent / name
            if p.exists(): shutil.copy2(p, folder / name)
        return folder

    doctor = cli('doctor', 'doctor', '--blender', args.blender)
    blender = doctor['blender']['path']
    (out / 'versions.json').write_text(json.dumps({'python': sys.version, 'platform': platform.platform(), 'doctor': doctor,
        'skill_entry_sha256': sha(skill / 'SKILL.md'), 'skill_root': str(skill),
        'source_revision': args.source_revision, 'source_revision_authority': 'caller-supplied verified identity' if args.source_revision else 'unavailable',
        'render_size': 512, 'render_samples': 16, 'threads': 2}, indent=2) + '\n')
    review = out / 'construction-review.json'
    neutral_views = 'front,side,back,hero,service-detail,armor-depth,socket-depth,palm-depth,mechanism-detail,hand-front,hand-palm'

    def run(label, script, state, input_blend=None, views=neutral_views, review_path=review, project_root=project):
        # package_construction retains raw execution logs for this historical harness.
        argv = ['run', '--outputs', 'delivery', '--keep-diagnostics', '--root', project_root, '--blender', blender, '--script', script,
                '--intent', label, '--expected-revision', state['head'] or 'none',
                '--review-spec', review_path, '--views', views, '--size', '512', '--samples', '16', '--timeout', '1200']
        if input_blend: argv += ['--input-blend', input_blend]
        return cli(label, *argv)

    if args.phase in {'baseline', 'build'}:
        if (project / '.refas2').exists(): raise RuntimeError('Use revise for the existing project')
        shutil.copy2(HERE / 'source/reference.png', originals / 'reference.png')
        shutil.copy2(args.input_blend, originals / 'baseline.blend')
        spec = json.loads((HERE / 'review.json').read_text())
        spec['views'] += [
            {'name': 'armor-depth', 'position': [1.8, -.8, .36], 'target': [0, 0, .30], 'orthoScale': .28},
            {'name': 'socket-depth', 'position': [1.3, -1.6, .82], 'target': [0, 0, .688], 'orthoScale': .22},
            {'name': 'palm-depth', 'position': [1.0, 1.8, .19], 'target': [0, 0, .125], 'orthoScale': .18},
            {'name': 'mechanism-detail', 'position': [.85, 1.8, .63], 'target': [0, .012, .553], 'orthoScale': .23},
            {'name': 'hand-front', 'position': [.6, -1.8, .18], 'target': [-.012, 0, .094], 'orthoScale': .215},
            {'name': 'hand-palm', 'position': [.6, 1.8, .18], 'target': [-.012, 0, .094], 'orthoScale': .215},
            {'name': 'service-open', 'position': [.55, 1.8, .38], 'target': [.035, 0, .30], 'orthoScale': .28}]
        review.write_text(json.dumps(spec, indent=2) + '\n')
        noop = scripts / 'retain_baseline.py'; noop.write_text('"""Retain the explicitly imported immutable native baseline."""\n')
        state = cli('initialize-construction-project', 'init', '--root', project, '--name', 'aurix-source-construction', '--reference', originals / 'reference.png')
        state = run('import-unchanged-baseline', noop, state, input_blend=originals / 'baseline.blend')
        save(state, 'before')
    else:
        state = cli('current-status', 'status', '--root', project)

    if args.phase in {'build', 'revise'}:
        index = len(list(scripts.glob('refine_construction-*.py'))) + 1
        label = 'candidate-%02d' % index
        script = scripts / ('refine_construction-%02d.py' % index)
        shutil.copy2(HERE / 'refine_construction.py', script)
        if not timing['first_candidate_script_execution_utc']:
            timing['first_candidate_script_execution_utc'] = utc()
            timing_path.write_text(json.dumps(timing, indent=2) + '\n')
        state = run('author-' + label, script, state, input_blend=originals / 'baseline.blend')
        folder = save(state, label)
        if not timing.get('first_candidate_render_bundle_observed_complete_utc'):
            timing['first_candidate_render_bundle_observed_complete_utc'] = timing.get('first_actual_rendered_candidate_utc') or utc()
            if timing.get('first_actual_rendered_candidate_utc'):
                timing['render_timestamp_label_correction']='The retained first_actual_rendered_candidate_utc field measured bundle publication after all requested images finished; it was not first-image completion.'
            timing_path.write_text(json.dumps(timing, indent=2) + '\n')
        old = json.loads((out / 'candidates/before/scene.json').read_text())
        new = json.loads((folder / 'scene.json').read_text())
        report = json.loads((folder / 'construction-report.json').read_text())
        a = {o['name']: o for o in old['objects']}; b = {o['name']: o for o in new['objects']}
        intentional = set(report['changed_existing_objects'])
        unexpected = [n for n in a if n not in intentional and a[n] != b.get(n)]
        summary = {'baseline_sha256': sha(originals / 'baseline.blend'), 'source_sha256': sha(originals / 'reference.png'),
            'candidate': label, 'selected_revision': state['head'], 'changed_existing_objects': [n for n in a if a[n] != b.get(n)],
            'declared_existing_objects': sorted(intentional), 'added_objects': sorted(set(b) - set(a)),
            'removed_objects': sorted(set(a) - set(b)), 'unexpected_protected_changes': unexpected,
            'protected_pass': not unexpected, 'review_sha256': sha(review), 'bounds': new['bounds'], 'statistics': new['statistics']}
        (folder / 'construction-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        assert not unexpected, 'A protected original object changed: ' + repr(unexpected)
        (out / 'latest-candidate.json').write_text(json.dumps({'label': label, 'directory': str(folder), 'state': state}, indent=2) + '\n')
        print(json.dumps({'candidate_ready': str(folder), 'revision': state['head']}), flush=True)

    if args.phase == 'open-service':
        open_project = out / 'service-open-project'
        if (open_project / '.refas2').exists():
            os_state = cli('service-open-status', 'status', '--root', open_project)
        else:
            os_state = cli('service-open-init', 'init', '--root', open_project, '--name', 'aurix-service-open-comparison', '--reference', originals / 'reference.png')
        opened = scripts / 'open_service_cover.py'
        opened.write_text('import bpy, math\nfrom mathutils import Vector\nc=bpy.data.objects["SERVICE_COVER"]\nc.location += Vector((.095, .015, 0))\nc.rotation_mode="XYZ"\nc.rotation_euler.z=math.radians(125)\nbpy.context.view_layer.update()\n')
        latest = json.loads((out / 'latest-candidate.json').read_text())
        for label, source_blend in [('before-open-for-' + latest['label'], out / 'candidates/before/native.blend'),
                                    (latest['label'] + '-open', Path(latest['directory']) / 'native.blend')]:
            os_state = run(label, opened, os_state, input_blend=source_blend, views='service-open', project_root=open_project)
            save(os_state, label)
        cli('verify-service-open', 'verify', '--root', open_project)

    if args.phase == 'exercise':
        latest = json.loads((out / 'latest-candidate.json').read_text())
        baseline_id = latest['state']['head']
        if state['head'] != baseline_id:
            state = cli('select-explicit-candidate-for-exercise', 'restore', '--root', project,
                        '--revision', baseline_id, '--expected-revision', state['head'])
        baseline = state; baseline_hashes = bundle_hashes(state)
        assert baseline_hashes == bundle_hashes(latest['state']), 'Exercise input differs from explicit candidate bundle'
        selected_dir = save(state, 'selected')
        state = run('service-cover-outward-3mm', HERE / 'edit_panel.py', state, views='hero,service-detail')
        edit_dir = save(state, 'service-cover-3mm')
        state = cli('restore-after-service-edit', 'restore', '--root', project, '--revision', baseline_id)
        panel_restore = bundle_hashes(state) == baseline_hashes
        assert panel_restore, 'Panel restore changed the selected immutable bundle'
        pose_spec = {'schema': 'refas.production.review/v2', 'views': [
            {'name': 'side', 'position': [1.8, .12, .38], 'target': [0, .12, .38], 'orthoScale': .95},
            {'name': 'hero', 'position': [1.5, -1.8, .70], 'target': [0, .12, .38], 'orthoScale': .95}],
            'lighting': {'center': [0, 0, .38], 'radius': .5}, 'background': [.16, .18, .21], 'transparent': False}
        pose_review = out / 'pose-review.json'; pose_review.write_text(json.dumps(pose_spec, indent=2) + '\n')
        poses = []
        for label, cfg in [
            ('elbow-0', {'elbow_deg': 0, 'wrist_deg': 0, 'index_deg': [0, 0, 0]}),
            ('elbow-45', {'elbow_deg': 45, 'wrist_deg': 0, 'index_deg': [0, 0, 0]}),
            ('elbow-90', {'elbow_deg': 90, 'wrist_deg': 0, 'index_deg': [0, 0, 0]}),
            ('wrist-20-index-35', {'elbow_deg': 45, 'wrist_deg': 20, 'index_deg': [35, 20, 10]})]:
            script = scripts / ('pose-' + label + '.py')
            script.write_text('POSE_CONFIG = ' + repr(cfg) + '\n' + (HERE / 'pose_check.py').read_text() + '\n' + (HERE / 'construction_pose_check.py').read_text())
            state = run('pose-' + label, script, state, input_blend=selected_dir / 'native.blend', views='side,hero', review_path=pose_review)
            folder = save(state, 'pose-' + label)
            poses.append({'label': label, 'directory': str(folder), 'revision': state['head']})
        state = cli('restore-selected-neutral', 'restore', '--root', project, '--revision', baseline_id)
        final_restore = bundle_hashes(state) == baseline_hashes
        assert final_restore, 'Final restore changed selected artifact/input bundle'
        save(state, 'selected')
        integrity = cli('verify-selected-project', 'verify', '--root', project)
        summary = {'selected_revision': baseline_id, 'restored_revision': state['head'],
            'service_edit_directory': str(edit_dir), 'restore_after_service_full_bundle_equality': panel_restore,
            'restore_after_poses_full_bundle_equality': final_restore, 'pose_samples': poses,
            'selected_bundle_file_hashes': baseline_hashes, 'integrity': integrity, 'finished_utc': utc()}
        (out / 'exercise-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        command('independent-native-and-glb-readback', [blender, '--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1',
            '--python', HERE / 'inspect_construction.py', '--', originals / 'baseline.blend', selected_dir / 'native.blend', selected_dir / 'asset.glb', selected_dir / 'scene.json',
            selected_dir / 'construction-report.json', out / 'independent-inspection.json', out / 'readback.blend'])

    if args.phase == 'readback':
        rb_root = out / 'readback-project'
        if (rb_root / '.refas2').exists(): rb = cli('readback-status', 'status', '--root', rb_root)
        else: rb = cli('readback-init', 'init', '--root', rb_root, '--name', 'aurix-independent-readback', '--reference', originals / 'reference.png')
        rb = run('render-independent-glb', scripts / 'retain_baseline.py', rb, input_blend=out / 'readback.blend',
                 views='hero,mechanism-detail,hand-front,hand-palm', project_root=rb_root)
        save(rb, 'glb-readback')
        cli('verify-readback', 'verify', '--root', rb_root)

    if args.phase == 'package':
        if not args.evidence_root:raise RuntimeError('Package phase requires --evidence-root')
        command('materialize-delivery', [sys.executable, HERE / 'package_construction.py', '--root', out, '--evidence', args.evidence_root.resolve()])
        delivery=out/'delivery'
        shutil.copy2(commands,delivery/'evidence/construction-commands.json')
        shutil.copy2(commands,args.evidence_root/'construction-commands.json')
        for p in logs.glob('*.txt'):shutil.copy2(p,delivery/'evidence/logs'/p.name)
        manifest=json.loads((delivery/'MANIFEST.json').read_text())
        manifest['files']={str(p.relative_to(delivery)):{'bytes':p.stat().st_size,'sha256':sha(p)}
                           for p in sorted(delivery.rglob('*')) if p.is_file() and p.name!='MANIFEST.json'}
        (delivery/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')


if __name__ == '__main__':
    main()

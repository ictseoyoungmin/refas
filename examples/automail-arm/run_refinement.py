#!/usr/bin/env python3
"""Import a saved arm, refine compound shells, exercise edits and recover.

Use --phase build for visual iteration and --phase exercise once a candidate
is selected. The default all phase reproduces the complete workflow in a new
output root through the public production CLI.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root', type=Path, required=True)
    ap.add_argument('--skill-root', type=Path, required=True)
    ap.add_argument('--input-blend', type=Path, required=True)
    ap.add_argument('--blender', default='blender')
    ap.add_argument('--phase', choices=['all','build','revise','exercise'], default='all')
    ap.add_argument('--intent', default='refine compound armor, socket depth and separated palm pads')
    args = ap.parse_args()
    out=args.root.resolve();out.mkdir(parents=True,exist_ok=True)
    skill=args.skill_root.resolve();project=out/'project'
    logs=out/'refinement-logs';logs.mkdir(exist_ok=True)
    scripts=out/'scripts';scripts.mkdir(exist_ok=True)
    log_path=out/'refinement-commands.json'
    history=json.loads(log_path.read_text()) if log_path.exists() else []
    def command(label, argv, timeout=1200):
        start=utc()
        p=subprocess.run([str(a) for a in argv],capture_output=True,text=True,timeout=timeout)
        stem='%03d-%s'%(len(history),label)
        log=logs/(stem+'.stdout.txt');err=logs/(stem+'.stderr.txt')
        log.write_text(p.stdout);err.write_text(p.stderr)
        history.append({'label':label,'argv':[str(a) for a in argv],
                        'started_utc':start,'ended_utc':utc(),'returncode':p.returncode,
                        'stdout':str(log),'stderr':str(err)})
        log_path.write_text(json.dumps(history,indent=2)+'\n')
        print(json.dumps({'completed':label,'returncode':p.returncode,'ended_utc':utc()}),flush=True)
        if p.returncode:
            raise RuntimeError(label+' failed; retained logs: '+str(log))
        return p.stdout
    def cli(label,*argv):
        return json.loads(command(label,[sys.executable,skill/'scripts/produce.py',*argv]))
    def save(state,label):
        for k,e in [('blend','blend'),('glb','glb'),('scene','scene.json')]:
            shutil.copy2(state['outputs'][k],out/(label+'.'+e))
        target=out/'renders'/label;target.mkdir(parents=True,exist_ok=True)
        for ob in state['observations']:
            shutil.copy2(ob['path'],target/(ob['view']+'.png'))
        (out/(label+'-revision.json')).write_text(json.dumps(state,indent=2)+'\n')
    blender=cli('refinement-doctor','doctor','--blender',args.blender)['blender']['path']
    review=out/'refinement-review.json'
    if args.phase in {'all','build'}:
        if (project/'.refas2').exists():
            raise RuntimeError('Build requires a fresh output root; use exercise for the selected project')
        spec=json.loads((HERE/'review.json').read_text())
        spec['views'] += [
          {'name':'armor-depth','position':[1.8,-.8,.36],'target':[0,0,.30],'orthoScale':.28},
          {'name':'socket-depth','position':[1.3,-1.6,.82],'target':[0,0,.688],'orthoScale':.22},
          {'name':'palm-depth','position':[1.0,1.8,.19],'target':[0,0,.125],'orthoScale':.18}]
        review.write_text(json.dumps(spec,indent=2)+'\n')
        noop=scripts/'import_baseline.py';noop.write_text('"""Retain the explicitly imported native baseline unchanged."""\n')
        state=cli('refinement-init','init','--root',project,'--name','aurix-compound-shells',
                  '--reference',HERE/'source/reference.png')
        state=cli('import-unchanged-baseline','run','--root',project,'--blender',blender,
                  '--input-blend',args.input_blend.resolve(),'--script',noop,
                  '--intent','import unchanged native baseline for matched comparison',
                  '--expected-revision','none','--review-spec',review,
                  '--size','512','--samples','16','--timeout','600')
        save(state,'before')
        state=cli('refine-compound-shells','run','--root',project,'--blender',blender,
                  '--script',HERE/'refine_armor.py','--intent','refine stepped shoulder, contoured armor and palm volume',
                  '--expected-revision',state['head'],'--review-spec',review,
                  '--size','512','--samples','16','--timeout','600')
        save(state,'after')
    elif args.phase=='revise':
        state=cli('revision-status','status','--root',project)
        state=cli('revise-compound-shells','run','--root',project,'--blender',blender,
                  '--input-blend',args.input_blend.resolve(),
                  '--script',HERE/'refine_armor.py','--intent',args.intent,
                  '--expected-revision',state['head'],'--review-spec',review,
                  '--size','512','--samples','16','--timeout','600')
        save(state,'after')
    else:
        state=cli('selected-status','status','--root',project)
        save(state,'after')
    report_path=Path(state['outputs']['blend']).parent/'surface-refinement.json'
    changes=json.loads(report_path.read_text())
    old=json.loads((out/'before.scene.json').read_text())
    new=json.loads((out/'after.scene.json').read_text())
    a={o['name']:o for o in old['objects']};b={o['name']:o for o in new['objects']}
    intentional=set(changes['changed_existing_objects'])
    unexpected=[n for n in a if n not in intentional and a[n]!=b.get(n)]
    protected=[n for n in a if n not in intentional]
    changed=[n for n in a if a[n]!=b.get(n)]
    summary={'baseline_native_sha256':sha(args.input_blend),
             'source_sha256':sha(HERE/'source/reference.png'),
             'baseline_revision':json.loads((out/'before-revision.json').read_text())['head'],
             'selected_revision':state['head'],'before_scene_fingerprint':old['fingerprint'],
             'after_scene_fingerprint':new['fingerprint'],
             'changed_existing_objects':changed,'declared_existing_objects':sorted(intentional),
             'added_objects':sorted(set(b)-set(a)),'removed_objects':sorted(set(a)-set(b)),
             'protected_object_count':len(protected),'protected_object_names':protected,
             'unexpected_protected_changes':unexpected,'protected_pass':not unexpected,
             'bounds':new['bounds'],'statistics':new['statistics'],
             'review_sha256':sha(review),'surface_refinement':changes}
    assert not unexpected,'A protected object changed'
    (out/'refinement-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    shutil.copy2(report_path,out/'surface-refinement.json')
    if args.phase in {'all','exercise'}:
        command('local-edit-pose-export-exercises',[
          sys.executable,HERE/'run.py','--root',out,'--skill-root',skill,
          '--blender',blender,'--phase','exercise','--baseline',state['head']])
        command('independent-native-readback',[
          blender,'--background','--factory-startup','--threads','2',
          '--python-exit-code','1','--python',HERE/'inspect_refinement.py','--',
          out/'candidate.blend',out/'candidate.glb',out/'refinement-summary.json',
          out/'native-inspection.json',out/'reimport.blend'])
        readback=out/'readback-projects'/summary['selected_revision']
        if (readback/'.refas2').exists():
            rb_state=cli('readback-status','status','--root',readback)
        else:
            rb_state=cli('readback-init','init','--root',readback,'--name','aurix-glb-readback',
                         '--reference',HERE/'source/reference.png')
        rb=cli('readback-render','run','--root',readback,'--blender',blender,
               '--input-blend',out/'reimport.blend','--script',scripts/'import_baseline.py',
               '--intent','inspect independently reimported neutral GLB',
               '--expected-revision',rb_state['head'] or 'none','--review-spec',review,
               '--views','hero,armor-depth,palm-depth','--size','512',
               '--samples','16','--timeout','600')
        save(rb,'glb-readback')
        cli('readback-verify','verify','--root',readback)
    print(json.dumps({'root':str(out),'selected_revision':summary['selected_revision'],
                      'protected_objects':len(protected),'protected_pass':True}),flush=True)


if __name__=='__main__':
    main()

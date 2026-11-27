#!/usr/bin/env python3
"""Materialize the selected construction refinement and evidence without edits.

The production histories remain in the work root. Delivery includes original
inputs, selected native/export, matched renders, rejected candidate natives,
executed script snapshots and logs. No renderer is invoked by this packager.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def copy(source,dest):
    dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root',type=Path,required=True)
    ap.add_argument('--evidence',type=Path,required=True)
    args=ap.parse_args();root=args.root.resolve();ev=args.evidence.resolve();ev.mkdir(parents=True,exist_ok=True)
    latest=json.loads((root/'latest-candidate.json').read_text());label=latest['label']
    selected=root/'candidates/selected';out=root/'delivery';out.mkdir(exist_ok=True)
    exercise=json.loads((root/'exercise-summary.json').read_text())
    check=json.loads((root/'independent-inspection.json').read_text())
    summary=json.loads((Path(latest['directory'])/'construction-summary.json').read_text())
    assert check['passed'] and exercise['restore_after_poses_full_bundle_equality']
    assert exercise['selected_revision']==latest['state']['head'], 'Exercise report belongs to a different selected revision'
    assert check['native_sha256']==sha(selected/'native.blend'), 'Native inspection report is stale'
    assert check['glb_sha256']==sha(selected/'asset.glb'), 'GLB inspection report is stale'
    assert sha(selected/'native.blend')==sha(Path(latest['directory'])/'native.blend')
    assert sha(selected/'asset.glb')==sha(Path(latest['directory'])/'asset.glb')
    copy(selected/'native.blend',out/'native.blend');copy(selected/'asset.glb',out/'arm.glb')
    copy(root/'originals/reference.png',out/'source/reference.png');copy(root/'originals/baseline.blend',out/'baseline/native.blend')
    copy(root/'originals/reference.png',out/'reproduce/source/reference.png')
    if (root/'author-report.md').exists():
        copy(root/'author-report.md',out/'README.md');copy(root/'author-report.md',ev/'AUTHOR_REPORT.md')
    if (root/'author-session-observations.json').exists():
        copy(root/'author-session-observations.json',out/'evidence/author-session-observations.json')
        copy(root/'author-session-observations.json',ev/'author-session-observations.json')
    for p in (ev/'delegation').glob('*'):
        if p.is_file():copy(p,out/'evidence/delegation'/p.name)
    for source,name in [(root/'candidates/before/renders','before'),(selected/'renders','after'),
                        (root/'candidates'/('before-open-for-'+label)/'renders','service-open-before'),
                        (root/'candidates'/(label+'-open')/'renders','service-open-after'),
                        (root/'candidates/glb-readback/renders','glb-readback')]:
        for p in source.glob('*.png'):copy(p,out/'renders'/name/p.name)
    for p in sorted((root/'candidates').glob('pose-*')):
        for f in p.rglob('*'):
            if f.is_file():copy(f,out/'poses'/p.name/f.relative_to(p))
    edit=root/'candidates/service-cover-3mm'
    for p in edit.rglob('*'):
        if p.is_file():copy(p,out/'service-cover-3mm'/p.relative_to(edit))
    for p in sorted((root/'candidates').glob('candidate-*')):
        if p.name==label or p.name==label+'-open':continue
        for f in p.rglob('*'):
            if f.is_file():copy(f,out/'retained-candidates'/p.name/f.relative_to(p))
    for p in (root/'candidates'/(label+'-open')).rglob('*'):
        if p.is_file():copy(p,out/'service-open'/p.relative_to(root/'candidates'/(label+'-open')))
    for p in (root/'scripts').glob('*.py'):copy(p,out/'executed-scripts'/p.name)
    for name in ['run_construction.py','refine_construction.py','inspect_construction.py','construction_pose_check.py','package_construction.py','edit_panel.py','pose_check.py','review.json']:
        copy(HERE/name,out/'reproduce'/name)
    for p in (root/'logs').glob('*.txt'):copy(p,out/'evidence/logs'/p.name)
    for name in ['construction-commands.json','construction-timing.json','construction-review.json','pose-review.json','versions.json','exercise-summary.json','independent-inspection.json','latest-candidate.json']:
        copy(root/name,out/'evidence'/name);copy(root/name,ev/name)
    for name in ['construction-summary.json','construction-report.json','revision.json','scene.json']:
        copy(Path(latest['directory'])/name,out/'evidence'/name);copy(Path(latest['directory'])/name,ev/name)
    for run in (root/'project/.refas2/runs').glob('*'):
        info=run/'run.json'
        if info.exists():
            data=json.loads(info.read_text())
            for name in ['run.json','job.json','blender.log']:
                if (run/name).exists():copy(run/name,out/'evidence/production-runs'/run.name/name)
            edit=run/'inputs/edit.py'
            if not edit.exists() and data.get('revision'):
                edit=root/'project/.refas2/revisions'/data['revision']/'inputs/edit.py'
            if edit.exists():copy(edit,out/'evidence/production-runs'/run.name/'edit.py')
    comp=out/'comparisons';comp.mkdir(exist_ok=True)
    try:font=ImageFont.truetype('DejaVuSans.ttf',17)
    except OSError:font=ImageFont.load_default()
    for view in ['hero','front','side','back','armor-depth','socket-depth','mechanism-detail','hand-front','hand-palm','palm-depth','service-detail','service-open']:
        before=out/'renders'/('service-open-before' if view=='service-open' else 'before')/(view+'.png')
        after=out/'renders'/('service-open-after' if view=='service-open' else 'after')/(view+'.png')
        a=Image.open(before).convert('RGB');b=Image.open(after).convert('RGB')
        assert a.size==b.size
        panel=Image.new('RGB',(a.width+b.width,a.height+34),(24,27,31));d=ImageDraw.Draw(panel)
        d.text((12,7),'BASELINE | '+view,fill=(235,235,235),font=font)
        d.text((a.width+12,7),'SELECTED | '+view,fill=(235,235,235),font=font)
        panel.paste(a,(0,34));panel.paste(b,(a.width,34));panel.save(comp/(view+'.png'))
        copy(comp/(view+'.png'),ev/'comparisons'/(view+'.png'))
    facts={'selected_candidate':label,'selected_revision':latest['state']['head'],
           'restored_revision':exercise['restored_revision'],'selected_native_sha256':sha(out/'native.blend'),
           'selected_glb_sha256':sha(out/'arm.glb'),'source_sha256':sha(out/'source/reference.png'),
           'baseline_sha256':sha(out/'baseline/native.blend'),'statistics':summary['statistics'],
           'bounds':summary['bounds'],'original_object_count':check['baseline_to_selected_identity']['original_object_count'],
           'original_pivot_count':check['baseline_to_selected_identity']['original_pivot_count'],
           'added_objects':len(summary['added_objects']),'removed_objects':len(summary['removed_objects']),
           'original_material_datablocks_preserved':check['baseline_to_selected_identity']['original_material_count'],
           'introduced_mesh_topology_problem_rows':[p for p in check['native_changed_and_added_topology'] if p['name'] not in {'Crown_A_mark','Crown_AURIX'} and (p['nonmanifold_edges'] or p['zero_area_faces'])],
           'packaged_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (out/'evidence/delivery-facts.json').write_text(json.dumps(facts,indent=2)+'\n');copy(out/'evidence/delivery-facts.json',ev/'delivery-facts.json')
    manifest={'schema':'aurix.source-construction.delivery/v1','selected_revision':latest['state']['head'],
              'files':{str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='MANIFEST.json'}}
    (out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'delivery':str(out),'evidence':str(ev),'selected_revision':latest['state']['head'],'files':len(manifest['files'])},indent=2))


if __name__=='__main__':main()

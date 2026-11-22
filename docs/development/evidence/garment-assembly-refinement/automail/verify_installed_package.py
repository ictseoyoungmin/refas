"""Task-local installed-package compatibility replay; exact paths in record."""
import datetime
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import sys

ROOT=Path('/workspace/scratch/c52cb753f160')
OUT=ROOT/'work/automail-package'
OUT.mkdir(parents=True,exist_ok=True)
SKILL=ROOT/'installed-refas/package/skills/refas'
EXAMPLE=ROOT/'refas/examples/automail-arm'
AUTHOR=ROOT/'work/automail'
TARBALL=ROOT/'installed-refas/refas-1.4.2.tgz'
PROJECT=OUT/'project'
LOGS=OUT/'logs';LOGS.mkdir(exist_ok=True)
history=[]

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def command(label,argv):
    started=utc()
    p=subprocess.run([str(a) for a in argv],capture_output=True,text=True,timeout=600)
    log=LOGS/(label+'.stdout.txt');err=LOGS/(label+'.stderr.txt')
    log.write_text(p.stdout);err.write_text(p.stderr)
    history.append({'label':label,'argv':[str(a) for a in argv],
                    'started_utc':started,'ended_utc':utc(),'returncode':p.returncode,
                    'stdout':str(log),'stderr':str(err)})
    (OUT/'commands.json').write_text(json.dumps(history,indent=2)+'\n')
    assert p.returncode==0,label+' failed; see '+str(log)
    print(label,flush=True)
    return p.stdout
def cli(label,*args):
    return json.loads(command(label,[sys.executable,SKILL/'scripts/produce.py',*args]))

helpers=runpy.run_path(str(EXAMPLE/'run.py'))
assert sha(TARBALL)=='0b62e372e335cdf090718ee0a3384e5a51b3e48f309d8c7c1e9e0ba8bbf4e01a'
blender=cli('doctor','doctor','--blender','/usr/bin/blender')['blender']['path']
cli('init','init','--root',PROJECT,'--name','aurix-package-compatibility',
    '--reference',EXAMPLE/'source/reference.png')
review=AUTHOR/'refinement-review.json'
noop=OUT/'retain_selected.py';noop.write_text('"""Retain the explicitly imported selected arm."""\n')
state=cli('import-selected','run','--root',PROJECT,'--blender',blender,
          '--input-blend',AUTHOR/'after.blend','--script',noop,
          '--intent','installed package import of selected refined arm',
          '--expected-revision','none','--review-spec',review,
          '--views','hero,armor-depth,palm-depth','--size','512','--samples','16',
          '--timeout','600')
selected=state;selected_id=state['head'];bundle=helpers['bundle_hashes'](state)
author_scene=json.loads((AUTHOR/'after.scene.json').read_text())
package_scene=json.loads(Path(state['outputs']['scene']).read_text())
same_scene=author_scene['fingerprint']==package_scene['fingerprint'] and author_scene['objects']==package_scene['objects']
assert same_scene,'Installed import changed selected scene state'
for k,ext in [('blend','blend'),('glb','glb'),('scene','scene.json')]:
    shutil.copy2(state['outputs'][k],OUT/('selected.'+ext))
for view in state['observations']:
    shutil.copy2(view['path'],OUT/(view['view']+'.png'))
state=cli('cover-edit','run','--root',PROJECT,'--blender',blender,
          '--script',EXAMPLE/'edit_panel.py','--intent','installed package 3mm service-cover edit',
          '--expected-revision',state['head'],'--review-spec',review,
          '--views','service-detail','--size','512','--samples','16','--timeout','600')
panel=json.loads((Path(state['outputs']['blend']).parent/'panel-preservation.json').read_text())
assert panel['preservation_pass'] and panel['displacement_pass']
state=cli('restore','restore','--root',PROJECT,'--revision',selected_id)
restored_bundle=helpers['bundle_hashes'](state)
assert restored_bundle==bundle,'Installed package full bundle restore differs'
integrity=cli('verify','verify','--root',PROJECT)
export_script=OUT/'verify_export.py';export_script.write_text(helpers['EXPORT_CHECK_SCRIPT'])
command('independent-glb',[blender,'--background','--factory-startup','--threads','2',
                         '--python-exit-code','1','--python',export_script,'--',
                         OUT/'selected.glb',OUT/'selected.scene.json',OUT/'export-check.json'])
export=json.loads((OUT/'export-check.json').read_text());assert export['passed']
summary={
 'kind':'informed installed npm package compatibility replay after complete frozen-skill replay',
 'package':{'path':str(TARBALL),'bytes':TARBALL.stat().st_size,'sha256':sha(TARBALL)},
 'skill_root':str(SKILL),'selected_revision':selected_id,'restored_revision':state['head'],
 'author_selected_revision':json.loads((AUTHOR/'after-revision.json').read_text())['head'],
 'scene_equivalent_to_author_selection':same_scene,
 'scene_fingerprint':package_scene['fingerprint'],
 'selected_bundle_file_hashes':bundle,'full_bundle_byte_restoration':restored_bundle==bundle,
 'cover_edit':{k:panel[k] for k in ['selected_count','unrelated_count','preservation_pass',
                                 'displacement_pass','measured_group_world_delta_m']},
 'independent_glb_pass':export['passed'],'integrity':integrity,
 'scripts':[{ 'path':str(p),'sha256':sha(p)} for p in [EXAMPLE/'refine_armor.py',
             EXAMPLE/'run_refinement.py',EXAMPLE/'inspect_refinement.py',
             EXAMPLE/'edit_panel.py',SKILL/'scripts/produce.py',
             SKILL/'scripts/production/blender_worker.py']],
 'limits':'Imports the final selected native and executes the cover edit/recovery and GLB analytic node checks with the package. The full build and four rendered poses were already executed in the separate frozen-skill clean replay; they are not attributed to this packaged replay.',
 'finished_utc':utc()}
(OUT/'package-compatibility.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'package_compatibility':'PASS','bundle_files':len(bundle),
                  'selected_revision':selected_id,'restored_revision':state['head']}),flush=True)

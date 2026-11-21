#!/usr/bin/env python3
"""Reproduce the AURIX build and exercise through the frozen public CLI.

  python3 run.py --root /absolute/new-output --skill-root /absolute/skill-copy
  python3 run.py --root /existing-output --skill-root /absolute/skill-copy \
      --phase exercise --baseline SELECTED_REVISION

All authoring, edits, pose saves and restores use produce.py. The separate final
Blender invocation only reads the exported GLB and exercises its in-memory nodes.
"""
from pathlib import Path
import argparse,datetime,json,hashlib,subprocess,shutil,sys

HERE=Path(__file__).resolve().parent
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def bundle_hashes(state):
    """Compare every recorded artifact and captured input, not just three outputs."""
    folder=Path(state['outputs']['blend']).parent.parent
    manifest=json.loads((folder/'revision.json').read_text())
    return {area+'/'+entry['path']:sha(folder/area/entry['path'])
            for area in ('artifacts','inputs') for entry in manifest[area]}

EXPORT_CHECK_SCRIPT=r'''
import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector,Quaternion
args=sys.argv[sys.argv.index('--')+1:]
glb,scene_json,out=args
expected=json.loads(Path(scene_json).read_text())
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=glb)
bpy.context.view_layer.update()
names={o.name:o for o in bpy.context.scene.objects}
native={o['name']:o for o in expected['objects'] if o['type'] in {'MESH','EMPTY'}}
missing=sorted(set(native)-set(names));extra=sorted(set(names)-set(native))
parent_mismatch=[];matrix_errors={}
for n,v in native.items():
    if n not in names:continue
    p=names[n].parent.name if names[n].parent else None
    if p!=v['parent']:parent_mismatch.append({'object':n,'expected':v['parent'],'actual':p})
    e=max(abs(names[n].matrix_world[i][j]-v['matrixWorld'][i][j]) for i in range(4) for j in range(4))
    if e>1e-5:matrix_errors[n]=e
verts=[o.matrix_world@v.co for o in names.values() if o.type=='MESH' for v in o.data.vertices]
mn=[min(v[i] for v in verts) for i in range(3)];mx=[max(v[i] for v in verts) for i in range(3)]
bounds_error=max(abs(mn[i]-expected['bounds']['min'][i]) for i in range(3))
bounds_error=max(bounds_error,max(abs(mx[i]-expected['bounds']['max'][i]) for i in range(3)))
def mats():return {n:tuple(v for row in o.matrix_world for v in row) for n,o in names.items()}
panel=names['SERVICE_COVER'];selected={panel.name}|{o.name for o in panel.children_recursive}
before=mats();loc=panel.location.copy();panel.location.y+=.003;bpy.context.view_layer.update();after=mats()
untouched=[n for n in names if n not in selected and before[n]!=after[n]]
delta={n:[after[n][i]-before[n][i] for i in [3,7,11]] for n in sorted(selected)}
panel_ok=not untouched and all(abs(v[0])<1e-6 and abs(v[1]-.003)<1e-6 and abs(v[2])<1e-6 for v in delta.values())
panel.location=loc;bpy.context.view_layer.update()

articulation=[]
for pivot,target,degrees in [('ELBOW_PIVOT','WRIST_PIVOT',45),('WRIST_PIVOT','INDEX_J0',20),('INDEX_J0','INDEX_J1',35)]:
    p=names[pivot];t=names[target];center=p.matrix_world.translation.copy();start=t.matrix_world.translation.copy()
    axis=(p.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
    expected_point=center+Quaternion(axis,math.radians(degrees))@(start-center)
    p.rotation_mode='XYZ';p.rotation_euler.x+=math.radians(degrees);bpy.context.view_layer.update()
    error=(t.matrix_world.translation-expected_point).length
    articulation.append({'pivot':pivot,'descendant':target,'degrees':degrees,'orbit_error_m':error,'passed':error<1e-5,'moved_m':(t.matrix_world.translation-start).length})

required={'SHOULDER_PIVOT':'AURIX_ROOT','ELBOW_PIVOT':'SHOULDER_PIVOT','WRIST_PIVOT':'ELBOW_PIVOT','SERVICE_COVER':'ELBOW_PIVOT'}
for d in ['THUMB','INDEX','MIDDLE','RING','LITTLE']:
    required[d+'_J0']='WRIST_PIVOT';required[d+'_J1']=d+'_J0';required[d+'_J2']=d+'_J1'
relations={n:names[n].parent.name if n in names and names[n].parent else None for n in required}
report={'mode':'independent Blender factory-startup GLB reimport',
 'native_object_count':len(native),'imported_object_count':len(names),'imported_mesh_count':sum(o.type=='MESH' for o in names.values()),
 'missing':missing,'extra':extra,'parent_mismatches':parent_mismatch,'matrix_errors_over_1e_5':matrix_errors,
 'required_parent_relationships':relations,'required_parent_relationships_pass':all(relations[n]==p for n,p in required.items()),
 'bounds_min_m':mn,'bounds_max_m':mx,'bounds_max_error_m':bounds_error,
 'exported_panel_edit':{'selected_count':len(selected),'unrelated_changed':untouched,'displacements_m':delta,'passed':panel_ok},
 'exported_articulation_samples':articulation,
 'limits':'GLB rigid node hierarchy and numeric orbit checks only. No engine, material visual-equivalence, continuous-collision or physical-linkage claim.'}
report['passed']=not missing and not extra and not parent_mismatch and not matrix_errors and bounds_error<1e-5 and report['required_parent_relationships_pass'] and panel_ok and all(a['passed'] for a in articulation)
Path(out).write_text(json.dumps(report,indent=2))
assert report['passed'], 'Export hierarchy, transform or articulation check failed'
'''

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root',required=True,type=Path)
    ap.add_argument('--skill-root',required=True,type=Path)
    ap.add_argument('--blender',default='blender',help='Blender executable name or path')
    ap.add_argument('--phase',choices=['all','exercise'],default='all')
    ap.add_argument('--baseline')
    args=ap.parse_args();out=args.root.resolve();skill=args.skill_root.resolve();out.mkdir(parents=True,exist_ok=True)
    project=out/'project';logs=out/'logs';logs.mkdir(exist_ok=True);scripts=out/'scripts';scripts.mkdir(exist_ok=True)
    entry=skill/'scripts/produce.py';history=[]
    command_file=out/'exercise-commands.json'
    def command(argv,label,timeout=900):
        start=utc();p=subprocess.run([str(a) for a in argv],capture_output=True,text=True,timeout=timeout)
        (logs/(label+'.stdout.txt')).write_text(p.stdout);(logs/(label+'.stderr.txt')).write_text(p.stderr)
        history.append({'label':label,'argv':[str(a) for a in argv],'started_utc':start,'ended_utc':utc(),'returncode':p.returncode,
                        'stdout':str(logs/(label+'.stdout.txt')),'stderr':str(logs/(label+'.stderr.txt'))})
        command_file.write_text(json.dumps(history,indent=2))
        if p.returncode:raise RuntimeError(label+' failed; see retained logs')
        print(json.dumps({'completed':label,'ended_utc':history[-1]['ended_utc']}),flush=True)
        return p.stdout
    def cli(label,*parts):return json.loads(command([sys.executable,entry,*parts],label))
    def run(label,script,state,review,views=None):
        argv=['run','--root',project,'--blender',blender,'--script',script,'--intent',label,'--expected-revision',state['head'] or 'none','--review-spec',review,'--size','512','--samples','16','--timeout','600']
        if views is not None:argv+=['--views',views]
        return cli(label,*argv)
    def materialize(state,label):
        for kind,ext in [('blend','blend'),('glb','glb'),('scene','scene.json')]:
            shutil.copy2(state['outputs'][kind],out/(label+'.'+ext))
        rd=out/'renders'/label;rd.mkdir(parents=True,exist_ok=True)
        for ob in state['observations']:shutil.copy2(ob['path'],rd/(ob['view']+'.png'))
        (out/(label+'-revision.json')).write_text(json.dumps(state,indent=2))
    source=HERE/'source/reference.png';review=HERE/'review.json'
    blender=cli('doctor','doctor','--blender',args.blender)['blender']['path']
    if args.phase=='all':
        if (project/'.refas2').exists():raise RuntimeError('All phase requires a fresh output root; use exercise for the saved project')
        state=cli('init','init','--root',project,'--name','aurix-mkiv-arm','--reference',source)
        state=run('create-complete-candidate',HERE/'create.py',state,review);materialize(state,'first-candidate')
        state=run('correct-shell-openings',HERE/'correct_shells.py',state,review)
        state=run('correct-shoulder-elbow-proportions',HERE/'correct_proportions.py',state,review)
    else:state=cli('initial-status','status','--root',project)
    if args.baseline and state['head']!=args.baseline:raise RuntimeError('Current revision is not the explicit selected baseline')
    baseline=state;baseline_id=state['head'];materialize(state,'candidate')
    baseline_hashes={k:sha(v) for k,v in state['outputs'].items()}
    baseline_bundle=bundle_hashes(state)
    state=run('service-cover-outward-3mm',HERE/'edit_panel.py',state,review);materialize(state,'panel-edited')
    panel_check=Path(state['outputs']['blend']).parent/'panel-preservation.json'
    shutil.copy2(panel_check,out/'panel-preservation.json')
    state=cli('restore-after-panel','restore','--root',project,'--revision',baseline_id)
    restore_panel={k:sha(v)==baseline_hashes[k] for k,v in state['outputs'].items()}
    assert all(restore_panel.values()),'Restore differs from selected neutral artifacts'
    restore_panel_bundle=bundle_hashes(state)==baseline_bundle
    assert restore_panel_bundle,'Restore differs from selected artifact/input bundle'
    pose_review={
      'schema':'refas.production.review/v2','views':[
        {'name':'side','position':[1.8,.12,.38],'target':[0,.12,.38],'orthoScale':.95},
        {'name':'hero','position':[1.5,-1.8,.70],'target':[0,.12,.38],'orthoScale':.95}
      ],'lighting':{'center':[0,0,.38],'radius':.5},'background':[.16,.18,.21],'transparent':False}
    pose_review_path=out/'pose-review.json';pose_review_path.write_text(json.dumps(pose_review,indent=2))
    pose_results=[]
    for label,cfg in [
      ('elbow-0',{'elbow_deg':0,'wrist_deg':0,'index_deg':[0,0,0]}),
      ('elbow-45',{'elbow_deg':45,'wrist_deg':0,'index_deg':[0,0,0]}),
      ('elbow-90',{'elbow_deg':90,'wrist_deg':0,'index_deg':[0,0,0]}),
      ('wrist-20-index-35',{'elbow_deg':45,'wrist_deg':20,'index_deg':[35,20,10]})
    ]:
        wrapper=scripts/(label+'.py');wrapper.write_text('POSE_CONFIG = '+repr(cfg)+'\n'+(HERE/'pose_check.py').read_text())
        state=run('sample-'+label,wrapper,state,pose_review_path)
        pd=out/'poses'/label;pd.mkdir(parents=True,exist_ok=True)
        for kind,ext in [('blend','blend'),('glb','glb')]:shutil.copy2(state['outputs'][kind],pd/('sample.'+ext))
        for ob in state['observations']:shutil.copy2(ob['path'],pd/(ob['view']+'.png'))
        check=Path(state['outputs']['blend']).parent/'pose-check.json';shutil.copy2(check,pd/'pose-check.json')
        pose_results.append({'label':label,'revision':state['head'],'directory':str(pd),'check':json.loads(check.read_text())})
    state=cli('restore-neutral-final','restore','--root',project,'--revision',baseline_id)
    restore_final={k:sha(v)==baseline_hashes[k] for k,v in state['outputs'].items()}
    assert all(restore_final.values()),'Final restore differs from selected neutral artifacts'
    restore_final_bundle=bundle_hashes(state)==baseline_bundle
    assert restore_final_bundle,'Final restore differs from selected artifact/input bundle'
    materialize(state,'candidate')
    integrity=cli('verify-final','verify','--root',project)
    (out/'integrity-check.json').write_text(json.dumps(integrity,indent=2))
    export_script=scripts/'verify_export.py';export_script.write_text(EXPORT_CHECK_SCRIPT)
    command([blender,'--background','--factory-startup','--threads','2','--python-exit-code','1','--python',export_script,'--',out/'candidate.glb',out/'candidate.scene.json',out/'export-check.json'],'independent-glb-check')
    export_check=json.loads((out/'export-check.json').read_text())
    assert export_check['passed'],'Independent GLB verification did not pass'
    provenance={'source':{'path':str(source),'bytes':source.stat().st_size,'sha256':sha(source)},
                'skill_entry':{'path':str(skill/'SKILL.md'),'sha256':sha(skill/'SKILL.md')},'code':[]}
    for p in sorted(HERE.glob('*.py')):
        if p.name not in {'create.py','correct_shells.py','correct_proportions.py','edit_panel.py','pose_check.py','run.py'}:continue
        shutil.copy2(p,scripts/p.name);provenance['code'].append({'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)})
    shutil.copy2(review,out/'review.json');(out/'provenance.json').write_text(json.dumps(provenance,indent=2))
    summary={'selected_neutral_revision':baseline_id,'final_restored_revision':state['head'],
             'panel_revision':json.loads((out/'panel-edited-revision.json').read_text())['head'],
             'restore_after_panel_artifact_byte_equality':restore_panel,
             'restore_final_artifact_byte_equality':restore_final,'pose_samples':pose_results,
             'restore_after_panel_full_bundle_equality':restore_panel_bundle,
             'restore_final_full_bundle_equality':restore_final_bundle,
             'selected_bundle_file_hashes':baseline_bundle,
             'export_passed':export_check['passed'],'integrity':integrity,'finished_utc':utc()}
    (out/'exercise-summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps({'completed':'exercise','root':str(out),'baseline':baseline_id,'restored_head':state['head']}),flush=True)

if __name__=='__main__':main()

#!/usr/bin/env python3
"""Digest-bound evidence utility review and conservative derived-image retention.

This is a worker-authored decision log, not independent proof of judgment or
source resemblance. It verifies actual bytes and candidate edit existence.
"""
from __future__ import annotations
import argparse
import json
import os
import shutil
import tempfile
import time
import hashlib
from pathlib import Path
from observation_image import digest_json, sha256
from render_glb import parse_glb

SCHEMA = 'refas.evidence-utility-decisions/v1'
MANIFEST = 'refas.observation-aid-set/v1'
STATUSES = {'clarified','contradicted','insufficient','no-benefit'}
IMPACTS = {'none','planned','applied'}
RETENTION = {'retain','discard'}


def required(value, label):
    if not isinstance(value,str) or not value.strip() or len(value)>1024:
        raise ValueError(f'{label} requires substantive text (max 1024 characters)')
    return value.strip()


def digest(value, label):
    if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):
        raise ValueError(f'{label} requires lowercase SHA-256')
    return value


def contained(root, value, label):
    if not isinstance(value,str) or not value or Path(value).is_absolute() or '..' in Path(value).parts:
        raise ValueError(f'{label} must be project-contained relative file path')
    full=(root/value)
    if full.is_symlink() or not full.resolve().is_relative_to(root) or not full.is_file():
        raise ValueError(f'{label} must be regular project-contained file')
    return full.resolve()


def verify_report(manifest):
    if manifest.get('schema')!=MANIFEST or manifest.get('claimScope')!='derived-observation-aid-only' or manifest.get('eligibleForCertification') is not False:
        raise ValueError('expected non-authoritative adaptive evidence manifest')
    payload=dict(manifest)
    original=digest(payload.pop('manifestDigest',None),'manifestDigest')
    if digest_json(payload)!=original:
        raise ValueError('evidence manifest digest mismatch')
    return original


def verify_edit(edit, root, evidence_key):
    if not isinstance(edit,dict) or edit.get('status','none') not in IMPACTS:
        raise ValueError(f'{evidence_key} modelImpact.status invalid')
    status=edit.get('status','none')
    if status=='applied':
        required(edit.get('change'),'modelImpact.change')
        required(edit.get('findingId'),'modelImpact.findingId')
        required(edit.get('scopeId'),'modelImpact.scopeId')
        observed=[]
        for role in ('before','after'):
            asset=edit.get(role)
            if not isinstance(asset,dict):
                raise ValueError(f'{evidence_key} requires exact before/after GLB')
            file=contained(root,asset.get('path'),f'{evidence_key}.{role}.path')
            if file.suffix.lower()!='.glb':
                raise ValueError(f'{evidence_key}.{role} must be a GLB file')
            expected=digest(asset.get('sha256'),f'{evidence_key}.{role}.sha256')
            if sha256(file)!=expected:
                raise ValueError(f'{evidence_key}.{role} candidate SHA-256 mismatch')
            try:
                model, _ = parse_glb(file)
                if not model.get('meshes'):
                    raise ValueError('no drawable meshes')
            except (ValueError, KeyError, IndexError, OSError) as error:
                raise ValueError(f'{evidence_key}.{role} is not a usable GLB mesh candidate') from error
            observed.append({'path':asset['path'],'sha256':expected})
        if observed[0]['sha256']==observed[1]['sha256']:
            raise ValueError(f'{evidence_key} cannot claim a model edit with identical candidate bytes')
        return {'status':'applied','change':edit['change'].strip(),
                'findingId':edit['findingId'].strip(),'scopeId':edit['scopeId'].strip(),
                'before':observed[0],'after':observed[1],
                'authority':'worker-attributed-change-only'}
    if any(field in edit for field in ('before','after','findingId','scopeId','change')):
        raise ValueError(f'{evidence_key} non-applied model impact cannot cite an edit')
    return {'status':status,'authority':'not-model-impact-evidence'}


def review(manifest_path,decisions_path,prune=False):
    manifest_path=Path(manifest_path).resolve()
    decisions_path=Path(decisions_path).resolve()
    out=manifest_path.parent
    if manifest_path.name!='manifest.json':
        raise ValueError('assessment requires canonical observation manifest.json')
    root=decisions_path.parent
    if not manifest_path.is_relative_to(root):
        raise ValueError('observation manifest must stay inside the assessment project')
    if decisions_path.is_relative_to(out):
        raise ValueError('decisions file must be outside the observation output')
    original_manifest_sha=sha256(manifest_path)
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    digest_before=verify_report(manifest)
    input_spec=json.loads(decisions_path.read_text(encoding='utf-8'))
    if input_spec.get('schema')!=SCHEMA or input_spec.get('manifestDigest')!=digest_before:
        raise ValueError('stale or invalid evidence utility decisions manifestDigest')
    rows=input_spec.get('assessments')
    if not isinstance(rows,list):
        raise ValueError('assessments must list exactly the selected analysis outputs')
    eligible={}
    source_map={item['id']:item for item in manifest.get('sources',[])}
    for view in manifest.get('views',[]):
        name=f"{view['sourceId']}/{view['id']}"
        for key in view.get('requestedAnalyses',[]):
            if key=='crop':
                continue
            output=next((x for x in view.get('analysisOutputs',[]) if x['analysis']==key),None)
            if output is None:
                raise ValueError(f'{name}/{key} missing from evidence manifest')
            eligible[f'{name}/{key}']=(view,output)
    if not eligible and rows:
        raise ValueError('cannot invent analysis assessments without selected analyses')
    seen={}; assessments=[]
    for entry in rows:
        if not isinstance(entry,dict):
            raise ValueError('assessment must be an object')
        key='/'.join(str(entry.get(f,'')) for f in ('sourceId','viewId','analysis'))
        if key not in eligible or key in seen:
            raise ValueError(f'unknown or duplicated assessment: {key}')
        view,output=eligible[key]
        outcome=entry.get('outcome')
        if outcome not in STATUSES:
            raise ValueError(f'{key} requires clarified/contradicted/insufficient/no-benefit outcome')
        observation=required(entry.get('observation'),f'{key}.observation')
        if not view.get('analysisQuestion') or not view.get('decisionTarget'):
            raise ValueError(f'{key} has no recorded pre-analysis question and target')
        impact=verify_edit(entry.get('modelImpact',{'status':'none'}),root,key)
        retention=entry.get('retention')
        if retention not in RETENTION:
            raise ValueError(f'{key} requires explicit retain/discard')
        reason=required(entry.get('retentionReason'),f'{key}.retentionReason')
        if retention=='discard' and (outcome not in ('no-benefit','insufficient') or impact['status']!='none'):
            raise ValueError(f'{key} cannot discard useful or model-connected evidence')
        if 'path' in output:
            original=contained(out,output['path'],f'{key}.path')
            if sha256(original)!=output['sha256']:
                raise ValueError(f'{key} referenced derived image SHA-256 mismatch')
        elif output.get('alias') not in ('raw-source','crop'):
            raise ValueError(f'{key} missing valid source alias or materialized PNG')
        assessments.append({
            'id':key,'question':view['analysisQuestion'],'decisionTarget':view['decisionTarget'],
            'outcome':outcome,'observation':observation,'outputSha256':output.get('sha256'),
            'retention':retention,'retentionReason':reason,'modelImpact':impact,
        })
        seen[key]=entry
    if set(eligible)!=set(seen):
        raise ValueError('every explicitly requested analysis must receive a disposition: '+', '.join(sorted(set(eligible)-set(seen))))
    # Recheck source provenance; no decision may upgrade a changed original.
    for source in manifest['sources']:
        if source.get('sourceManifest'):
            source_manifest=contained(root,source['sourceManifest'],'sourceManifest.path')
            if sha256(source_manifest)!=digest(source.get('sourceManifestSha256'),'sourceManifest.sha256'):
                raise ValueError('bound source manifest SHA-256 drift')
        if source['kind']=='image':
            original=contained(root,source['path'],'source.path')
            if sha256(original)!=source['sha256']:
                raise ValueError('original source SHA-256 drift')
        else:
            archive=contained(root,source['archive'],'archive.path')
            if sha256(archive)!=source['archiveSha256']:
                raise ValueError('original ZIP SHA-256 drift')
    will_discard={key for key,item in seen.items() if item['retention']=='discard'}
    actual_prune=bool(prune and will_discard)
    assessment={'schema':'refas.evidence-utility-report/v1',
        'claimScope':'worker-attributed-utility-only','eligibleForCertification':False,
        'inputManifestDigest':digest_before,'assessmentInputDigest':digest_json(input_spec),
        'assessments':assessments,'pruned':actual_prune,
        'policy':{'absenceOfCitationIsNotProofOfNonUse':True,
                  'actualBytesProveChangeNotCausation':True,
                  'noSourceFidelityOrVisualPass':True}}
    assessment['reportDigest']=digest_json(assessment)
    replacement=json.loads(json.dumps(manifest))
    replacement['utility']=assessment
    stage=None
    if actual_prune:
        token=hashlib.sha256((digest_before+assessment['reportDigest']+str(time.time_ns())).encode()).hexdigest()[:24]
        snapshot=Path('snapshots')/token
        stage=Path(tempfile.mkdtemp(prefix='.refas-utility-',dir=out.parent))
        def copy_keep(entry):
            relative=entry.get('path')
            if not relative:
                return
            original=contained(out,relative,'derived output')
            if sha256(original)!=entry['sha256']:
                raise ValueError('derived evidence SHA-256 changed before retention')
            parts=Path(relative).parts
            if len(parts)<5 or parts[0]!='snapshots':
                raise ValueError('noncanonical observation snapshot layout')
            # Relative path: snapshots/<revision>/<source>/<view>/<image>.
            suffix=Path(*parts[2:])
            target=stage/suffix
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(original,target)
            entry['path']=(snapshot/suffix).as_posix()
        for view in replacement['views']:
            for entry in view['analysisOutputs']:
                key=f"{view['sourceId']}/{view['id']}/{entry['analysis']}"
                if key in will_discard and 'path' in entry:
                    entry['discardedSha256']=entry.pop('sha256')
                    entry.pop('path',None)
                    entry['retention']='discarded-derivative'
                else:
                    copy_keep(entry)
        if replacement.get('board'):
            # Boards depicting removed views may no longer be presented.
            replacement['board']=None
    replacement.pop('manifestDigest',None)
    replacement['manifestDigest']=digest_json(replacement)
    # A manifest is the sole current authoritative pointer, no second status
    # file whose atomicity could drift from this one.
    published=False; installed=None
    try:
        if stage:
            installed=out/snapshot
            installed.parent.mkdir(parents=True,exist_ok=True)
            os.replace(stage,installed)
            stage=None
        temp=None
        try:
            with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=out,prefix='.utility-',suffix='.json',delete=False) as handle:
                json.dump(replacement,handle,indent=2,ensure_ascii=False)
                handle.write('\n')
                temp=Path(handle.name)
            # Recheck the exact old current pointer before replacing it.
            if sha256(manifest_path)!=original_manifest_sha:
                raise ValueError('manifest changed during review')
            os.replace(temp,manifest_path)
            published=True
        finally:
            if temp:temp.unlink(missing_ok=True)
    finally:
        if stage:shutil.rmtree(stage,ignore_errors=True)
        if installed is not None and not published:shutil.rmtree(installed,ignore_errors=True)
    if actual_prune:
        for old in (out/'snapshots').iterdir():
            if old!=installed and old.is_dir() and not old.is_symlink():
                shutil.rmtree(old)
    print(json.dumps({'status':'PASS','claimScope':'worker-attributed-utility-only',
        'manifest':str(manifest_path),'assessments':len(assessments),
        'discardedAnalyses':len(will_discard) if prune else 0,'candidateEditsAttributed':sum(a['modelImpact']['status']=='applied' for a in assessments)},indent=2))


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',required=True)
    p.add_argument('--decisions',required=True)
    p.add_argument('--prune',action='store_true')
    a=p.parse_args()
    review(a.manifest,a.decisions,a.prune)

if __name__=='__main__':
    main()

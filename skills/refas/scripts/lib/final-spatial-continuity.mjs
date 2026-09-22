import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateCandidateLineageProof} from './candidate-authority.mjs';
import {
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  validatePbrRenderReport,
} from './pbr-render-report.mjs';

export const FINAL_SPATIAL_CONTINUITY_SCHEMA='refas.final-spatial-continuity/v1';
export const FINAL_SPATIAL_CONTINUITY_MODES=Object.freeze([
  'same-digest-carry-forward',
  'changed-digest-reverified',
]);
export const FINAL_SPATIAL_CONTINUITY_VERDICTS=Object.freeze(['PROCEED','REWORK','HOLD']);

const requiredViews=new Set(NEUTRAL_CLAY_REQUIRED_VIEW_IDS);
const canonicalBarrier=(barrier,label)=>{
  if(barrier?.schema!=='refas.volume-barrier/v1') throw new Error(`${label} must be refas.volume-barrier/v1`);
  const {barrierDigest,...payload}=barrier;
  assertDigest(barrierDigest,`${label}.barrierDigest`);
  if(digestJson(payload)!==barrierDigest) throw new Error(`${label} digest mismatch`);
  return barrier;
};

const canonicalMultiview=(report,assetSha256)=>{
  const validation=validatePbrRenderReport(report);
  if(!validation.valid) throw new Error(`finalMultiviewReport is invalid: ${validation.errors.join('; ')}`);
  if(report.assetSha256!==assetSha256) throw new Error('final multiview report binds a different candidate');
  if(report.claimScope!=='shape-resemblance-only'||report.presentation?.mode!=='neutral-clay'){
    throw new Error('final spatial continuity requires canonical neutral-clay multiview evidence');
  }
  const actual=new Set((report.outputs??[]).map((output)=>output.viewId));
  const missing=[...requiredViews].filter((id)=>!actual.has(id));
  if(missing.length) throw new Error(`final multiview report is missing required views: ${missing.join(', ')}`);
  return report;
};

export function createFinalSpatialContinuity({
  sourceSha256,
  hierarchyDigest,
  candidateLineageProof,
  shapeCheckpointId,
  shapeCheckpointDigest,
  shapeBarrier,
  finalBarrier,
  finalMultiviewReport,
}={}){
  const source=assertDigest(sourceSha256,'sourceSha256');
  const hierarchy=assertDigest(hierarchyDigest,'hierarchyDigest');
  const lineageValidation=validateCandidateLineageProof(candidateLineageProof,{sourceSha256:source});
  if(!lineageValidation.valid) throw new Error(`candidateLineageProof is invalid: ${lineageValidation.errors.join('; ')}`);
  const shape=canonicalBarrier(shapeBarrier,'shapeBarrier');
  const final=canonicalBarrier(finalBarrier,'finalBarrier');
  const initial=candidateLineageProof.initialCandidate;
  const resolvedFinal=candidateLineageProof.finalCandidate;
  if(initial.checkpointId!==assertId(shapeCheckpointId,'shapeCheckpointId')) throw new Error('shape checkpoint does not match candidate lineage initial checkpoint');
  const shapeDigest=assertDigest(shapeCheckpointDigest,'shapeCheckpointDigest');
  if(shape.assetSha256!==initial.assetSha256) throw new Error('shape barrier candidate does not match initial candidate');
  if(final.assetSha256!==resolvedFinal.assetSha256) throw new Error('final barrier candidate does not match authoritative final candidate');
  if(shape.sourceSha256!==source||final.sourceSha256!==source) throw new Error('spatial barrier source binding mismatch');
  if(shape.hierarchyDigest!==hierarchy||final.hierarchyDigest!==hierarchy) throw new Error('spatial barrier hierarchy binding mismatch');
  if(shape.expectationSetDigest!==final.expectationSetDigest) throw new Error('final continuity changed the frozen VC02 expectation set');
  if(digestJson(shape.protectedScopeIds)!==digestJson(final.protectedScopeIds)) throw new Error('final continuity changed protected scope authority');

  const mode=initial.assetSha256===resolvedFinal.assetSha256
    ?'same-digest-carry-forward'
    :'changed-digest-reverified';
  if(mode==='same-digest-carry-forward'&&shape.barrierDigest!==final.barrierDigest){
    throw new Error('same-digest continuity must carry forward the exact VC04 barrier');
  }

  const multiview=canonicalMultiview(finalMultiviewReport,resolvedFinal.assetSha256);
  const entries=(final.entries??[]).map((entry)=>({
    scopeId:assertId(entry.scopeId,'entry.scopeId'),
    frozenRole:entry.frozenRole,
    classification:entry.classification,
    spatialEvidenceDigest:assertDigest(entry.spatialEvidenceDigest,'entry.spatialEvidenceDigest'),
    classificationDigest:assertDigest(entry.classificationDigest,'entry.classificationDigest'),
    roleAuthorityDigest:assertDigest(entry.roleAuthorityDigest,'entry.roleAuthorityDigest'),
    status:entry.status,
  })).sort((a,b)=>a.scopeId.localeCompare(b.scopeId));

  const outputs=(multiview.outputs??[])
    .filter((output)=>requiredViews.has(output.viewId))
    .map((output)=>({
      viewId:assertId(output.viewId,'multiview.viewId'),
      path:String(output.path),
      sha256:assertDigest(output.sha256,'multiview.sha256'),
    }))
    .sort((a,b)=>a.viewId.localeCompare(b.viewId));

  const core={
    schema:FINAL_SPATIAL_CONTINUITY_SCHEMA,
    sourceSha256:source,
    hierarchyDigest:hierarchy,
    candidateLineageDigest:assertDigest(candidateLineageProof.lineageDigest,'candidateLineageDigest'),
    shapeCheckpoint:{
      id:assertId(shapeCheckpointId,'shapeCheckpointId'),
      contentDigest:shapeDigest,
      assetSha256:initial.assetSha256,
      volumeBarrierDigest:shape.barrierDigest,
    },
    finalCandidate:{
      checkpointId:assertId(resolvedFinal.checkpointId,'finalCandidate.checkpointId'),
      assetSha256:assertDigest(resolvedFinal.assetSha256,'finalCandidate.assetSha256'),
    },
    mode,
    expectationSetDigest:shape.expectationSetDigest,
    protectedScopeIds:[...shape.protectedScopeIds].sort(),
    scopeBindings:entries,
    finalVolumeBarrierDigest:final.barrierDigest,
    finalMultiview:{
      reportDigest:assertDigest(multiview.reportDigest,'finalMultiview.reportDigest'),
      requiredViewIds:[...NEUTRAL_CLAY_REQUIRED_VIEW_IDS],
      outputs,
    },
    verdict:final.verdict,
    policy:{
      exactFinalCandidateRequired:true,
      changedDigestRequiresFreshSpatialEvidence:true,
      sameDigestCarryForwardRequiresByteIdentity:true,
      finalMultiviewMustPostdateFinalCandidateAuthority:true,
      protectedScopesCannotCompensate:true,
      noAggregateScore:true,
      singleViewIouAuthority:false,
      multiviewIouAuthority:'diagnostic-only',
      doesNotReplaceFinalResemblanceClosure:true,
      finalCertificationAuthority:false,
    },
  };
  return deepFreeze({...core,continuityDigest:digestJson(core)});
}

export function validateFinalSpatialContinuity(value){
  const errors=[];
  try{
    if(value?.schema!==FINAL_SPATIAL_CONTINUITY_SCHEMA) errors.push('invalid final spatial continuity schema');
    const payload=structuredClone(value);
    const digest=payload.continuityDigest;
    delete payload.continuityDigest;
    assertDigest(digest,'continuityDigest');
    if(digestJson(payload)!==digest) errors.push('final spatial continuity digest mismatch');
    if(!FINAL_SPATIAL_CONTINUITY_MODES.includes(value?.mode)) errors.push('final spatial continuity mode is invalid');
    if(!FINAL_SPATIAL_CONTINUITY_VERDICTS.includes(value?.verdict)) errors.push('final spatial continuity verdict is invalid');
    if(value?.policy?.exactFinalCandidateRequired!==true) errors.push('final spatial continuity must require exact final candidate');
    if(value?.policy?.changedDigestRequiresFreshSpatialEvidence!==true) errors.push('changed candidate must require fresh spatial evidence');
    if(value?.policy?.sameDigestCarryForwardRequiresByteIdentity!==true) errors.push('same-digest carry-forward must require byte identity');
    if(value?.policy?.finalCertificationAuthority!==false) errors.push('VC06 must not claim final certification authority');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

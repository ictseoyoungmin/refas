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

function expectedScopeStatus(role,classification){
  if(['volumetric','layered-volume','rod-tubular'].includes(role)){
    if(classification==='NO_PLANAR_COLLAPSE') return 'ADMITTED';
    if(classification==='PLANAR_COLLAPSE') return 'REWORK';
    if(classification==='INDETERMINATE') return 'HOLD';
    throw new Error(`role ${role} has incompatible final classification ${classification}`);
  }
  if(['intentionally-planar','thin-shell'].includes(role)){
    if(classification==='NOT_APPLICABLE') return 'ADMITTED';
    if(classification==='INDETERMINATE') return 'HOLD';
    throw new Error(`role ${role} requires NOT_APPLICABLE or INDETERMINATE, got ${classification}`);
  }
  if(role==='unresolved'){
    if(classification!=='INDETERMINATE') throw new Error('unresolved role must remain INDETERMINATE');
    return 'HOLD';
  }
  throw new Error(`unsupported frozen role ${role}`);
}
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
    assertDigest(value?.sourceSha256,'sourceSha256');
    assertDigest(value?.hierarchyDigest,'hierarchyDigest');
    assertDigest(value?.candidateLineageDigest,'candidateLineageDigest');
    assertId(value?.shapeCheckpoint?.id,'shapeCheckpoint.id');
    assertDigest(value?.shapeCheckpoint?.contentDigest,'shapeCheckpoint.contentDigest');
    assertDigest(value?.shapeCheckpoint?.assetSha256,'shapeCheckpoint.assetSha256');
    assertDigest(value?.shapeCheckpoint?.volumeBarrierDigest,'shapeCheckpoint.volumeBarrierDigest');
    assertId(value?.finalCandidate?.checkpointId,'finalCandidate.checkpointId');
    assertDigest(value?.finalCandidate?.assetSha256,'finalCandidate.assetSha256');
    assertDigest(value?.expectationSetDigest,'expectationSetDigest');
    assertDigest(value?.finalVolumeBarrierDigest,'finalVolumeBarrierDigest');

    if(!FINAL_SPATIAL_CONTINUITY_MODES.includes(value?.mode)) errors.push('final spatial continuity mode is invalid');
    const sameDigest=value?.shapeCheckpoint?.assetSha256===value?.finalCandidate?.assetSha256;
    if(value?.mode==='same-digest-carry-forward'&&!sameDigest) errors.push('same-digest mode requires identical shape and final candidate digests');
    if(value?.mode==='changed-digest-reverified'&&sameDigest) errors.push('changed-digest mode requires a changed final candidate digest');
    if(value?.mode==='same-digest-carry-forward'&&value?.shapeCheckpoint?.volumeBarrierDigest!==value?.finalVolumeBarrierDigest){
      errors.push('same-digest mode must retain the exact shape volume barrier');
    }

    const protectedIds=[...(value?.protectedScopeIds??[])];
    if(!protectedIds.length||new Set(protectedIds).size!==protectedIds.length) errors.push('protectedScopeIds must be non-empty and unique');
    protectedIds.forEach((id,index)=>assertId(id,`protectedScopeIds[${index}]`));
    const bindings=value?.scopeBindings??[];
    if(!Array.isArray(bindings)||bindings.length!==protectedIds.length) errors.push('scopeBindings must exactly cover protected scopes');
    const bindingIds=[];
    for(const [index,binding] of bindings.entries()){
      bindingIds.push(assertId(binding?.scopeId,`scopeBindings[${index}].scopeId`));
      assertDigest(binding?.spatialEvidenceDigest,`scopeBindings[${index}].spatialEvidenceDigest`);
      assertDigest(binding?.classificationDigest,`scopeBindings[${index}].classificationDigest`);
      assertDigest(binding?.roleAuthorityDigest,`scopeBindings[${index}].roleAuthorityDigest`);
      if(!['ADMITTED','REWORK','HOLD'].includes(binding?.status)) {
        errors.push(`scopeBindings[${index}] status is invalid`);
      } else {
        try{
          const expectedStatus=expectedScopeStatus(binding?.frozenRole,binding?.classification);
          if(binding.status!==expectedStatus) errors.push(`scopeBindings[${index}] status does not match frozen role/classification semantics`);
        }catch(error){
          errors.push(`scopeBindings[${index}] ${error.message}`);
        }
      }
    }
    if(digestJson([...protectedIds].sort())!==digestJson([...bindingIds].sort())) errors.push('scopeBindings do not exactly match protectedScopeIds');

    if(!FINAL_SPATIAL_CONTINUITY_VERDICTS.includes(value?.verdict)) errors.push('final spatial continuity verdict is invalid');
    const derivedVerdict=bindings.some((item)=>item.status==='REWORK')
      ?'REWORK'
      :bindings.some((item)=>item.status==='HOLD')
        ?'HOLD'
        :'PROCEED';
    if(value?.verdict!==derivedVerdict) errors.push('final spatial continuity verdict does not reproduce from protected scope status');

    assertDigest(value?.finalMultiview?.reportDigest,'finalMultiview.reportDigest');
    const declaredViews=value?.finalMultiview?.requiredViewIds??[];
    if(digestJson([...declaredViews].sort())!==digestJson([...NEUTRAL_CLAY_REQUIRED_VIEW_IDS].sort())) {
      errors.push('final multiview required view set is not canonical');
    }
    const outputs=value?.finalMultiview?.outputs??[];
    const outputIds=outputs.map((output,index)=>{
      const id=assertId(output?.viewId,`finalMultiview.outputs[${index}].viewId`);
      if(!String(output?.path??'')) errors.push(`finalMultiview.outputs[${index}].path is required`);
      assertDigest(output?.sha256,`finalMultiview.outputs[${index}].sha256`);
      return id;
    });
    if(new Set(outputIds).size!==outputIds.length||digestJson([...outputIds].sort())!==digestJson([...NEUTRAL_CLAY_REQUIRED_VIEW_IDS].sort())){
      errors.push('final multiview outputs must exactly cover canonical required views');
    }

    const expectedPolicy={
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
    };
    if(digestJson(value?.policy)!==digestJson(expectedPolicy)) errors.push('final spatial continuity policy is altered');

    const payload=structuredClone(value);
    const digest=payload.continuityDigest;
    delete payload.continuityDigest;
    assertDigest(digest,'continuityDigest');
    if(digestJson(payload)!==digest) errors.push('final spatial continuity digest mismatch');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

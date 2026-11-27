import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const TRUSTED_SPATIAL_GATE_AUTHORITY_SCHEMA='refas.trusted-spatial-gate-authority/v1';

const gateStatusForBarrier=(verdict)=>{
  if(verdict==='PROCEED') return 'pass';
  if(verdict==='REWORK') return 'fail';
  if(verdict==='HOLD') return 'blocked';
  throw new Error(`unsupported VC04 barrier verdict: ${verdict}`);
};

const refs=(values)=>[...new Set((values??[]).map(String).filter(Boolean))].sort();

export function createRuntimeSpatialGateAuthority({
  sourceSha256,
  scopeId,
  policyDigest,
  mode,
  shapeCheckpointId=null,
  shapeCheckpointDigest=null,
  assetSha256=null,
  volumeBarrier=null,
  fixtureAuthorityDigest=null,
  fixtureDependencyCheckpointId=null,
  fixtureDependencyCheckpointDigest=null,
  fixtureTrusted=false,
  evidenceRefs=[],
}={}){
  const normalizedMode=String(mode??'');
  if(!['volume-barrier','trusted-contract-fixture'].includes(normalizedMode)) throw new Error('trusted spatial gate mode is invalid');
  const core={
    schema:TRUSTED_SPATIAL_GATE_AUTHORITY_SCHEMA,
    issuer:'refas-runtime-policy',
    evaluator:'trusted-spatial-gate',
    mode:normalizedMode,
    sourceSha256:assertDigest(sourceSha256,'sourceSha256'),
    scopeId:assertId(scopeId,'scopeId'),
    policyDigest:assertDigest(policyDigest,'policyDigest'),
    shapeCheckpointId:null,
    shapeCheckpointDigest:null,
    assetSha256:null,
    volumeBarrierDigest:null,
    expectationSetDigest:null,
    protectedScopeIds:[],
    classificationDigests:[],
    fixtureAuthorityDigest:null,
    fixtureDependencyCheckpointId:null,
    fixtureDependencyCheckpointDigest:null,
    gateStatus:'blocked',
    evidenceRefs:refs(evidenceRefs),
    policy:{
      runtimeDerived:true,
      callerStatusAccepted:false,
      selfAuthoredAuthorityArtifactAccepted:false,
      shapeStageAuthorityOnly:true,
      finalCandidateContinuityAuthority:false,
      finalCertificationAuthority:false,
    },
  };

  if(normalizedMode==='volume-barrier'){
    if(!volumeBarrier||volumeBarrier.schema!=='refas.volume-barrier/v1') throw new Error('trusted spatial gate requires canonical VC04 volume barrier');
    core.shapeCheckpointId=assertId(shapeCheckpointId,'shapeCheckpointId');
    core.shapeCheckpointDigest=assertDigest(shapeCheckpointDigest,'shapeCheckpointDigest');
    core.assetSha256=assertDigest(assetSha256,'assetSha256');
    if(volumeBarrier.assetSha256!==core.assetSha256) throw new Error('trusted spatial gate candidate binding mismatch');
    core.volumeBarrierDigest=assertDigest(volumeBarrier.barrierDigest,'volumeBarrier.barrierDigest');
    core.expectationSetDigest=assertDigest(volumeBarrier.expectationSetDigest,'volumeBarrier.expectationSetDigest');
    core.protectedScopeIds=[...(volumeBarrier.protectedScopeIds??[])].map((id)=>assertId(id,'protectedScopeId')).sort();
    core.classificationDigests=[...(volumeBarrier.entries??[])].map((entry)=>assertDigest(entry.classificationDigest,'classificationDigest')).sort();
    core.gateStatus=gateStatusForBarrier(volumeBarrier.verdict);
  }else{
    core.fixtureAuthorityDigest=assertDigest(fixtureAuthorityDigest,'fixtureAuthorityDigest');
    core.fixtureDependencyCheckpointId=assertId(fixtureDependencyCheckpointId,'fixtureDependencyCheckpointId');
    core.fixtureDependencyCheckpointDigest=assertDigest(fixtureDependencyCheckpointDigest,'fixtureDependencyCheckpointDigest');
    core.gateStatus=fixtureTrusted===true?'pass':'blocked';
  }

  if(core.gateStatus==='pass'&&!core.evidenceRefs.length) throw new Error('trusted spatial gate PASS requires runtime-selected evidenceRefs');
  return deepFreeze({...core,authorityDigest:digestJson(core)});
}

export function validateRuntimeSpatialGateAuthority(value,inputs={}){
  const errors=[];
  try{
    if(value?.schema!==TRUSTED_SPATIAL_GATE_AUTHORITY_SCHEMA) errors.push('invalid trusted spatial gate authority schema');
    const recreated=createRuntimeSpatialGateAuthority(inputs);
    if(digestJson(recreated)!==digestJson(value)) errors.push('trusted spatial gate authority does not reproduce from runtime inputs');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

export function validateTrustedSpatialGateAuthority(value){
  const errors=[];
  try{
    if(value?.schema!==TRUSTED_SPATIAL_GATE_AUTHORITY_SCHEMA) errors.push('invalid trusted spatial gate authority schema');
    if(value?.issuer!=='refas-runtime-policy') errors.push('trusted spatial gate issuer is not runtime policy');
    if(value?.evaluator!=='trusted-spatial-gate') errors.push('trusted spatial gate evaluator is invalid');
    if(!['volume-barrier','trusted-contract-fixture'].includes(value?.mode)) errors.push('trusted spatial gate mode is invalid');
    assertDigest(value?.sourceSha256,'sourceSha256');
    assertId(value?.scopeId,'scopeId');
    if(value?.scopeId!=='whole') errors.push('trusted spatial gate authority must cover whole');
    assertDigest(value?.policyDigest,'policyDigest');
    if(!['pass','fail','blocked'].includes(value?.gateStatus)) errors.push('trusted spatial gate status is invalid');
    if(!Array.isArray(value?.evidenceRefs)||!value.evidenceRefs.length) errors.push('trusted spatial gate authority requires evidenceRefs');
    if(value?.policy?.runtimeDerived!==true) errors.push('trusted spatial gate authority must be runtime-derived');
    if(value?.policy?.callerStatusAccepted!==false) errors.push('trusted spatial gate authority cannot accept caller status');
    if(value?.policy?.selfAuthoredAuthorityArtifactAccepted!==false) errors.push('trusted spatial gate authority cannot accept self-authored authority artifact');
    if(value?.policy?.shapeStageAuthorityOnly!==true) errors.push('trusted spatial gate authority must remain shape-stage only');
    if(value?.policy?.finalCandidateContinuityAuthority!==false) errors.push('trusted spatial gate authority cannot claim final-candidate continuity');
    if(value?.policy?.finalCertificationAuthority!==false) errors.push('trusted spatial gate authority cannot claim final certification');
    if(value?.mode==='volume-barrier'){
      assertId(value?.shapeCheckpointId,'shapeCheckpointId');
      assertDigest(value?.shapeCheckpointDigest,'shapeCheckpointDigest');
      assertDigest(value?.assetSha256,'assetSha256');
      assertDigest(value?.volumeBarrierDigest,'volumeBarrierDigest');
      assertDigest(value?.expectationSetDigest,'expectationSetDigest');
      if(!Array.isArray(value?.protectedScopeIds)||!value.protectedScopeIds.length) errors.push('volume-barrier authority requires protectedScopeIds');
      if(!Array.isArray(value?.classificationDigests)||!value.classificationDigests.length) errors.push('volume-barrier authority requires classificationDigests');
      for(const digest of value?.classificationDigests??[]) assertDigest(digest,'classificationDigest');
      if(value?.fixtureAuthorityDigest!==null||value?.fixtureDependencyCheckpointId!==null||value?.fixtureDependencyCheckpointDigest!==null) errors.push('volume-barrier authority cannot carry fixture bindings');
    }else if(value?.mode==='trusted-contract-fixture'){
      assertDigest(value?.fixtureAuthorityDigest,'fixtureAuthorityDigest');
      assertId(value?.fixtureDependencyCheckpointId,'fixtureDependencyCheckpointId');
      assertDigest(value?.fixtureDependencyCheckpointDigest,'fixtureDependencyCheckpointDigest');
      if(value?.shapeCheckpointId!==null||value?.shapeCheckpointDigest!==null||value?.assetSha256!==null||value?.volumeBarrierDigest!==null||value?.expectationSetDigest!==null) errors.push('fixture authority cannot carry real-source shape bindings');
    }
    const payload=structuredClone(value);
    const digest=payload.authorityDigest;
    delete payload.authorityDigest;
    assertDigest(digest,'authorityDigest');
    if(digestJson(payload)!==digest) errors.push('trusted spatial gate authority digest mismatch');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

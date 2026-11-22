import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePerceptualSignatureSet} from './perceptual-signature.mjs';

export const VOLUME_BARRIER_SCHEMA='refas.volume-barrier/v1';
export const VOLUME_BARRIER_VERDICTS=Object.freeze(['PROCEED','REWORK','HOLD']);
export const VOLUME_BARRIER_SCOPE_STATUSES=Object.freeze(['ADMITTED','REWORK','HOLD']);

const PROTECTED_IMPORTANCE=new Set(['macro','identity']);
const VOLUME_ROLES=new Set(['volumetric','layered-volume','rod-tubular']);
const EXCEPTION_ROLES=new Set(['intentionally-planar','thin-shell']);

function canonicalClassification(record,label){
  if(!record||typeof record!=='object'||Array.isArray(record)) throw new Error(`${label} must be an object`);
  if(record.schema!=='refas.spatial-collapse-classification/v1') throw new Error(`${label} has invalid schema`);
  const {classificationDigest,...payload}=record;
  assertDigest(classificationDigest,`${label}.classificationDigest`);
  if(digestJson(payload)!==classificationDigest) throw new Error(`${label} digest mismatch`);
  return record;
}

function protectedScopes(signatureSet){
  const validation=validatePerceptualSignatureSet(signatureSet);
  if(!validation.valid) throw new Error(`signatureSet is invalid: ${validation.errors.join('; ')}`);
  const ids=new Set(['whole']);
  for(const signature of signatureSet.signatures??[]){
    if(PROTECTED_IMPORTANCE.has(signature.importance)) ids.add(signature.scopeId);
  }
  return [...ids].sort();
}

function scopeStatus(role,classification,scopeId){
  if(VOLUME_ROLES.has(role)){
    if(classification==='NO_PLANAR_COLLAPSE') return 'ADMITTED';
    if(classification==='PLANAR_COLLAPSE') return 'REWORK';
    if(classification==='INDETERMINATE') return 'HOLD';
    throw new Error(`protected scope ${scopeId} with role ${role} has incompatible VC03 classification ${classification}`);
  }
  if(EXCEPTION_ROLES.has(role)){
    if(classification==='NOT_APPLICABLE') return 'ADMITTED';
    if(classification==='INDETERMINATE') return 'HOLD';
    throw new Error(`protected scope ${scopeId} with role ${role} requires VC03 NOT_APPLICABLE, got ${classification}`);
  }
  if(role==='unresolved'){
    if(classification!=='INDETERMINATE') throw new Error(`protected unresolved scope ${scopeId} must remain VC03 INDETERMINATE`);
    return 'HOLD';
  }
  throw new Error(`protected scope ${scopeId} has unsupported frozen role ${role}`);
}

export function createVolumeBarrier({
  sourceSha256,
  hierarchyDigest,
  assetSha256,
  signatureSet,
  classifications=[],
}={}){
  const source=assertDigest(sourceSha256,'sourceSha256');
  const hierarchy=assertDigest(hierarchyDigest,'hierarchyDigest');
  const asset=assertDigest(assetSha256,'assetSha256');
  const signatureValidation=validatePerceptualSignatureSet(signatureSet);
  if(!signatureValidation.valid) throw new Error(`signatureSet is invalid: ${signatureValidation.errors.join('; ')}`);
  if(signatureSet.sourceSha256!==source) throw new Error('volume barrier signatureSet source binding mismatch');
  if(signatureSet.hierarchyDigest!==hierarchy) throw new Error('volume barrier signatureSet hierarchy binding mismatch');

  if(!Array.isArray(classifications)) throw new Error('classifications must be an array');
  const byScope=new Map();
  let expectationSetDigest=null;
  for(const [index,raw] of classifications.entries()){
    const value=canonicalClassification(raw,`classifications[${index}]`);
    const scopeId=assertId(value.scopeId,`classifications[${index}].scopeId`);
    if(byScope.has(scopeId)) throw new Error(`duplicate VC03 classification for scope ${scopeId}`);
    if(value.candidateSha256!==asset) throw new Error(`VC03 classification candidate binding mismatch for scope ${scopeId}`);
    if(value.sourceSha256!==source) throw new Error(`VC03 classification source binding mismatch for scope ${scopeId}`);
    if(value.hierarchyDigest!==hierarchy) throw new Error(`VC03 classification hierarchy binding mismatch for scope ${scopeId}`);
    if(expectationSetDigest==null) expectationSetDigest=assertDigest(value.expectationSetDigest,'expectationSetDigest');
    else if(value.expectationSetDigest!==expectationSetDigest) throw new Error('VC03 classifications do not share one VC02 expectation-set authority');
    byScope.set(scopeId,value);
  }

  const protectedScopeIds=protectedScopes(signatureSet);
  const missing=protectedScopeIds.filter((scopeId)=>!byScope.has(scopeId));
  if(missing.length) throw new Error(`volume barrier requires VC03 classification for every protected scope; missing: ${missing.join(', ')}`);
  if(expectationSetDigest==null) throw new Error('volume barrier requires at least one VC03 classification');

  const entries=protectedScopeIds.map((scopeId)=>{
    const value=byScope.get(scopeId);
    const status=scopeStatus(value.frozenRole,value.classification,scopeId);
    return {
      scopeId,
      frozenRole:value.frozenRole,
      classification:value.classification,
      classificationDigest:value.classificationDigest,
      spatialEvidenceDigest:value.spatialEvidenceDigest,
      roleAuthorityDigest:value.roleAuthorityDigest,
      status,
    };
  });

  const ignoredScopeIds=[...byScope.keys()].filter((scopeId)=>!protectedScopeIds.includes(scopeId)).sort();
  const verdict=entries.some((entry)=>entry.status==='REWORK')
    ?'REWORK'
    :entries.some((entry)=>entry.status==='HOLD')
      ?'HOLD'
      :'PROCEED';

  const payload={
    schema:VOLUME_BARRIER_SCHEMA,
    sourceSha256:source,
    hierarchyDigest:hierarchy,
    assetSha256:asset,
    signatureSetDigest:signatureSet.signatureDigest,
    expectationSetDigest,
    protectedScopeIds,
    ignoredScopeIds,
    entries,
    verdict,
    policy:{
      wholeAlwaysProtected:true,
      macroAndIdentityScopesProtected:true,
      detailOnlyScopesCannotCompensate:true,
      noAggregateScore:true,
      roleAwareExceptionsPreserved:true,
      proceedOnlyAuthorizesDownstreamDetail:true,
      proceedDoesNotCertify:true,
      singleViewIouAuthority:false,
      multiViewIouAuthority:'diagnostic-only',
    },
  };
  return deepFreeze({...payload,barrierDigest:digestJson(payload)});
}

export function validateVolumeBarrier(record,{
  sourceSha256=null,
  hierarchyDigest=null,
  assetSha256=null,
  signatureSet=null,
  classifications=null,
}={}){
  const errors=[];
  if(record?.schema!==VOLUME_BARRIER_SCHEMA) errors.push('invalid schema');
  try{
    const expected=createVolumeBarrier({
      sourceSha256:record?.sourceSha256,
      hierarchyDigest:record?.hierarchyDigest,
      assetSha256:record?.assetSha256,
      signatureSet,
      classifications,
    });
    // Stored barriers intentionally bind digests rather than embedding large upstream artifacts.
    const projected={
      ...expected,
      signatureSet:undefined,
      classifications:undefined,
    };
    if(record.barrierDigest!==expected.barrierDigest) errors.push('volume barrier digest mismatch');
    for(const [actual,external,label] of [
      [expected.sourceSha256,sourceSha256,'source'],
      [expected.hierarchyDigest,hierarchyDigest,'hierarchy'],
      [expected.assetSha256,assetSha256,'candidate'],
    ]){
      if(external!=null&&actual!==assertDigest(external,`${label}Sha256`)) errors.push(`volume barrier ${label} binding mismatch`);
    }
    // Compare every persisted field to the canonical projection.
    for(const key of Object.keys(expected)){
      if(digestJson(record?.[key])!==digestJson(expected[key])) errors.push(`volume barrier field is non-canonical: ${key}`);
    }
  }catch(error){
    errors.push(error.message);
  }
  return {valid:errors.length===0,errors};
}

export function assertVolumeBarrierAdmission(record,options={}){
  const validation=validateVolumeBarrier(record,options);
  if(!validation.valid) throw new Error(`volume barrier is invalid: ${validation.errors.join('; ')}`);
  if(record.verdict!=='PROCEED') throw new Error(`downstream detail requires volume barrier PROCEED; current verdict is ${record.verdict}`);
  return record;
}

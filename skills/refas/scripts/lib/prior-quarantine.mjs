import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';

export const PRIOR_QUARANTINE_SCHEMA = 'refas.prior-quarantine/v1';
export const PRIOR_QUARANTINE_KINDS = Object.freeze(['topology','generative-mesh','novel-view']);
export const PRIOR_QUARANTINE_AUTHORITIES = Object.freeze(['inferred','engineered']);
export const PRIOR_TRANSFER_KINDS = Object.freeze(['connectivity','landmark-correspondence','coarse-volume']);
export const PRIOR_STRIP_FEATURES = Object.freeze(['vertex-proportions','shape-keys','modifiers','materials']);
export const PRIOR_CORRESPONDENCE_METHODS = Object.freeze(['explicit-landmark','declared-semantic-id']);

const KIND_SET=new Set(PRIOR_QUARANTINE_KINDS);
const AUTHORITY_SET=new Set(PRIOR_QUARANTINE_AUTHORITIES);
const TRANSFER_SET=new Set(PRIOR_TRANSFER_KINDS);
const STRIP_SET=new Set(PRIOR_STRIP_FEATURES);
const CORRESPONDENCE_SET=new Set(PRIOR_CORRESPONDENCE_METHODS);

function pathText(value,label){
  const text=String(value??'').trim();
  if(!text||text.startsWith('/')||/^[A-Za-z]:/u.test(text)||text.split('/').includes('..')) throw new Error(label+' must be a project-relative path');
  return text.replaceAll('\\','/');
}
function strings(values,label,{required=false,allowed=null}={}){
  if(!Array.isArray(values)) throw new Error(label+' must be an array');
  const out=[...new Set(values.map(v=>String(v??'').trim()).filter(Boolean))].sort();
  if(required&&!out.length) throw new Error(label+' requires at least one value');
  if(allowed) for(const value of out) if(!allowed.has(value)) throw new Error(label+' contains unsupported value '+value);
  return out;
}
function evidenceRefs(values,label){return strings(values,label,{required:true});}
function artifactBinding(raw,label,{authority=null}={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error(label+' must be an object');
  const out={
    path:pathText(raw.path,label+'.path'),
    sha256:assertDigest(raw.sha256,label+'.sha256'),
    role:String(raw.role??'').trim(),
    authority:authority??String(raw.authority??'').trim(),
    sourceEvidenceEligible:raw.sourceEvidenceEligible===true,
  };
  if(!out.role) throw new Error(label+'.role is required');
  if(!AUTHORITY_SET.has(out.authority)) throw new Error(label+'.authority must be inferred or engineered');
  if(out.sourceEvidenceEligible) throw new Error(label+' cannot be source-evidence eligible');
  return out;
}
function inspectSeedGlb(bytes,label){
  const glb=Buffer.from(bytes??[]);
  if(!glb.length) throw new Error(label+' requires exact sanitized seed GLB bytes');
  const {json}=parseGlb(glb);
  const morphTargetCount=(json.meshes??[]).reduce((sum,mesh)=>sum+(mesh.primitives??[]).reduce((n,p)=>n+(p.targets?.length??0),0),0);
  return {
    sha256:digestBytes(glb),
    morphTargetCount,
    materialCount:json.materials?.length??0,
    meshCount:json.meshes?.length??0,
    nodeCount:json.nodes?.length??0,
  };
}
function normalizeCorrespondences(values){
  if(!Array.isArray(values)||!values.length) throw new Error('semanticCorrespondences requires at least one explicit mapping');
  const out=values.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('semanticCorrespondences['+index+'] must be an object');
    const method=String(raw.method??'').trim();
    if(!CORRESPONDENCE_SET.has(method)) throw new Error('semanticCorrespondences['+index+'].method must be explicit-landmark or declared-semantic-id; proximity is not correspondence');
    const sourceScopeId=assertId(raw.sourceScopeId,'semanticCorrespondences['+index+'].sourceScopeId');
    const priorSemanticId=assertId(raw.priorSemanticId,'semanticCorrespondences['+index+'].priorSemanticId');
    const sourceLandmarkId=raw.sourceLandmarkId==null?null:assertId(raw.sourceLandmarkId,'semanticCorrespondences['+index+'].sourceLandmarkId');
    const priorLandmarkId=raw.priorLandmarkId==null?null:assertId(raw.priorLandmarkId,'semanticCorrespondences['+index+'].priorLandmarkId');
    if(method==='explicit-landmark'&&(!sourceLandmarkId||!priorLandmarkId)) throw new Error('explicit-landmark correspondence requires sourceLandmarkId and priorLandmarkId');
    return {sourceScopeId,priorSemanticId,method,sourceLandmarkId,priorLandmarkId,evidenceRefs:evidenceRefs(raw.evidenceRefs,'semanticCorrespondences['+index+'].evidenceRefs')};
  }).sort((a,b)=>a.sourceScopeId.localeCompare(b.sourceScopeId)||a.priorSemanticId.localeCompare(b.priorSemanticId));
  const keys=out.map(x=>x.sourceScopeId+'\u0000'+x.priorSemanticId);
  if(new Set(keys).size!==keys.length) throw new Error('semantic correspondences must be unique');
  return out;
}
export function createPriorQuarantine({
  id,sourceSha256,kind,authority,
  rawPrior,
  sanitizedSeed=null,
  sanitizedSeedGlb=null,
  derivedArtifacts=[],
  transferable=[],
  stripped=[],
  semanticCorrespondences=[],
  evidenceRefs:refs=[],
}={}){
  const priorId=assertId(id,'id');
  const source=assertDigest(sourceSha256,'sourceSha256');
  const priorKind=String(kind??'').trim();
  if(!KIND_SET.has(priorKind)) throw new Error('prior kind must be topology, generative-mesh, or novel-view');
  const priorAuthority=String(authority??'').trim();
  if(!AUTHORITY_SET.has(priorAuthority)) throw new Error('prior authority must be inferred or engineered; observed is forbidden');
  const raw=artifactBinding(rawPrior,'rawPrior',{authority:priorAuthority});
  const allowedTransfers=strings(transferable,'transferable',{required:true,allowed:TRANSFER_SET});
  const strippedFeatures=strings(stripped,'stripped',{required:true,allowed:STRIP_SET});
  const correspondences=normalizeCorrespondences(semanticCorrespondences);
  if(allowedTransfers.includes('landmark-correspondence')&&correspondences.length===0) throw new Error('landmark-correspondence transfer requires explicit semantic correspondences');
  if(allowedTransfers.some(x=>['connectivity','coarse-volume'].includes(x))&&priorKind==='novel-view') throw new Error('novel-view prior cannot transfer mesh connectivity or coarse volume');
  if(!strippedFeatures.includes('vertex-proportions')) throw new Error('prior quarantine must strip vertex-proportions');
  if(!strippedFeatures.includes('shape-keys')) throw new Error('prior quarantine must strip shape-keys');
  if(!strippedFeatures.includes('modifiers')) throw new Error('prior quarantine must strip modifiers');
  if(!strippedFeatures.includes('materials')) throw new Error('prior quarantine must strip materials');

  let seed=null;
  let seedInspection=null;
  if(priorKind!=='novel-view'){
    if(!sanitizedSeed) throw new Error(priorKind+' prior requires a sanitized seed artifact');
    seed=artifactBinding(sanitizedSeed,'sanitizedSeed',{authority:priorAuthority});
    seedInspection=inspectSeedGlb(sanitizedSeedGlb,'sanitizedSeedGlb');
    if(seed.sha256!==seedInspection.sha256) throw new Error('sanitized seed binding does not match exact GLB bytes');
    if(seedInspection.morphTargetCount!==0) throw new Error('sanitized seed still contains shape keys / morph targets declared stripped');
    if(seedInspection.materialCount!==0) throw new Error('sanitized seed still contains materials declared stripped');
    if(seedInspection.meshCount<1) throw new Error('sanitized seed requires at least one mesh');
    if(seed.sha256===raw.sha256) throw new Error('sanitized seed must differ from raw prior bytes so stripped prior state cannot be reused verbatim');
  }else if(sanitizedSeed!=null||sanitizedSeedGlb!=null){
    throw new Error('novel-view prior does not use a sanitized mesh seed');
  }

  const derived=(derivedArtifacts??[]).map((item,index)=>artifactBinding(item,'derivedArtifacts['+index+']',{authority:priorAuthority}))
    .sort((a,b)=>a.path.localeCompare(b.path));
  if(priorKind==='novel-view'&&!derived.length) throw new Error('novel-view prior requires at least one quarantined derived view artifact');
  const all=[raw,...(seed?[seed]:[]),...derived];
  if(new Set(all.map(x=>x.path)).size!==all.length) throw new Error('quarantined artifact paths must be unique');
  if(new Set(all.map(x=>x.sha256)).size!==all.length) throw new Error('raw, sanitized, and derived prior artifacts must have distinct byte digests');

  const payload={
    schema:PRIOR_QUARANTINE_SCHEMA,
    id:priorId,
    sourceSha256:source,
    kind:priorKind,
    authority:priorAuthority,
    rawPrior:raw,
    sanitizedSeed:seed,
    sanitizedSeedInspection:seedInspection,
    derivedArtifacts:derived,
    transferable:allowedTransfers,
    stripped:strippedFeatures,
    semanticCorrespondences:correspondences,
    evidenceRefs:evidenceRefs(refs,'evidenceRefs'),
    policy:{
      observedAuthorityForbidden:true,
      proximityIsNotCorrespondence:true,
      priorMaySeedHypotheses:true,
      priorMaySeedCandidates:true,
      priorCannotAssertSourceFact:true,
      priorCannotServeAsR03SourceEvidence:true,
      priorCannotServeAsVc02SourceEvidence:true,
      priorCannotServeAsCertificationEvidence:true,
      vertexProportionsNeverTransfer:true,
      strippedStateCannotReenterCandidate:true,
    },
  };
  return deepFreeze({...payload,quarantineDigest:digestJson(payload)});
}
export function validatePriorQuarantine(record,{sanitizedSeedGlb=null}={}){
  const errors=[];
  if(record?.schema!==PRIOR_QUARANTINE_SCHEMA) errors.push('invalid schema');
  try{
    const expected=createPriorQuarantine({
      id:record?.id,
      sourceSha256:record?.sourceSha256,
      kind:record?.kind,
      authority:record?.authority,
      rawPrior:record?.rawPrior,
      sanitizedSeed:record?.sanitizedSeed,
      sanitizedSeedGlb:record?.kind==='novel-view'?null:sanitizedSeedGlb,
      derivedArtifacts:record?.derivedArtifacts,
      transferable:record?.transferable,
      stripped:record?.stripped,
      semanticCorrespondences:record?.semanticCorrespondences,
      evidenceRefs:record?.evidenceRefs,
    });
    if(digestJson(expected)!==digestJson(record)) errors.push('prior quarantine is stale, tampered, or non-canonical');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}
export function priorQuarantinedArtifactBindings(record){
  if(record?.schema!==PRIOR_QUARANTINE_SCHEMA) throw new Error('prior quarantine schema is invalid');
  return [record.rawPrior,...(record.sanitizedSeed?[record.sanitizedSeed]:[]),...(record.derivedArtifacts??[])].map(x=>({path:x.path,sha256:x.sha256}));
}
export function assertNoQuarantinedSourceEvidence(value,forbiddenPaths,{label='source authority artifact'}={}){
  const forbidden=forbiddenPaths instanceof Set?forbiddenPaths:new Set(forbiddenPaths??[]);
  const hits=[];
  const visit=(node,key='')=>{
    if(node==null)return;
    if(Array.isArray(node)){for(const child of node)visit(child,key);return;}
    if(typeof node==='object'){for(const [childKey,child] of Object.entries(node))visit(child,childKey);return;}
    if(typeof node==='string'&&forbidden.has(node)&&(/evidenceRefs|referenceGeometryRefs|sourceRef|sourcePath|path/i.test(key)||key==='')){
      hits.push(node);
    }
  };
  visit(value);
  const unique=[...new Set(hits)].sort();
  if(unique.length) throw new Error(label+' cites quarantined prior-derived evidence as source authority: '+unique.join(', '));
  return true;
}

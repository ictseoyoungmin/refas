import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
  createCandidateTransaction,
  createCollisionModel,
  createCrossRepresentationValidation,
  createDivergenceAuthorization,
  createPhysicalAssetBundle,
  createPhysicalClaimCertificationPolicy,
  createPhysicalClaimEvidence,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createSemanticAuthoritySet,
  deriveRepresentationCapacityObligations,
  digestBytes,
  digestJson,
  divergenceAuthoritySubjectId,
  evaluatePhysicalClaimCertification,
  physicalClaimEvidenceRole,
  runExportAdapter,
  runRepresentationNormalizer,
  validatePhysicalClaimEvidence,
  validatePhysicalClaimEvidenceBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function identityInput({unrelated = false} = {}) {
  const entities = [
    {id:'module-root',kind:'assembly-module'},
    {id:'link-a',kind:'rigid-link',frame:{parentId:'module-root',translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]}},
  ];
  const relations = [{id:'contains-link',kind:'CONTAINS',sourceId:'module-root',targetIds:['link-a']}];
  if (unrelated) {
    entities.push({id:'controller-extra',kind:'controller'},{id:'endpoint-extra',kind:'runtime-endpoint'});
    relations.push(
      {id:'contains-controller-extra',kind:'CONTAINS',sourceId:'module-root',targetIds:['controller-extra']},
      {id:'contains-endpoint-extra',kind:'CONTAINS',sourceId:'module-root',targetIds:['endpoint-extra']},
      {id:'runtime-link-binding-extra',kind:'BINDS_RUNTIME',sourceId:'endpoint-extra',targetIds:['link-a']},
    );
  }
  return {scopeId:'whole',sourceSha256:D(),entities,relations};
}

function physicalFixture(options = {}) {
  const identityGraph = createPhysicalIdentityGraph(identityInput(options));
  const dynamics = createRigidBodyDynamics({
    scopeId:'whole',sourceSha256:D(),identityGraph,
    links:[{linkId:'link-a',referenceFrameId:'link-a',mass:{value_kg:2.5},centerOfMass:{value_m:[0.01,-0.02,0.03]},inertia:{tensor_kg_m2:[[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
  });
  const collision = createCollisionModel({
    scopeId:'whole',sourceSha256:D(),identityGraph,groups:['body'],
    links:[{linkId:'link-a',selfCollisionPolicy:'DISABLED',colliders:[{id:'link-a-sphere',frame:{translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]},geometry:{kind:'SPHERE',radius_m:0.1},filter:{groupIds:['body'],maskGroupIds:['body']}}]}],
  });
  const components = [
    {componentId:'collision-main',ownerModuleId:'module-root',contract:collision},
    {componentId:'dynamics-main',ownerModuleId:'module-root',contract:dynamics},
  ];
  const bundle = createPhysicalAssetBundle({bundleId:'physical-main',identityGraph,rootModuleId:'module-root',components});
  return {identityGraph,components,bundle};
}

function semanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    const entity = view.identityProjection.entities.find((item)=>obligation.subjectIds.includes(item.id));
    const relation = view.identityProjection.relations.find((item)=>obligation.subjectIds.includes(item.id));
    if (obligation.semanticPath === 'identity.entity') return {id:entity.id,kind:entity.kind};
    if (obligation.semanticPath === 'frame.transform') return entity.frame;
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') return relation;
    throw new Error(`unsupported identity path ${obligation.semanticPath}`);
  }
  const component = view.components.find((item)=>item.componentId===obligation.source.componentId);
  if (component.schema === 'refas.rigid-body-dynamics/v1') {
    const link = component.contract.links.find((item)=>obligation.subjectIds.includes(item.linkId));
    if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
    if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
    if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  }
  if (component.schema === 'refas.collision-model/v1') {
    const link = component.contract.links.find((item)=>obligation.subjectIds.includes(item.linkId));
    if (obligation.semanticPath === 'collision.self-policy') return link.selfCollisionPolicy;
    const collider = component.contract.links.flatMap((item)=>item.colliders).find((item)=>obligation.subjectIds.includes(item.id));
    if (obligation.semanticPath === 'collision.frame') return collider.frame;
    if (obligation.semanticPath === 'collision.geometry') return collider.geometry;
    if (obligation.semanticPath === 'collision.filter') return collider.filter;
  }
  throw new Error(`unsupported semantic path ${obligation.semanticPath}`);
}

function adapter({massOverride} = {}) {
  return {id:'physical-claim-fixture-export',backend:'physical-claim-fixture',version:'1',project({canonicalView,capacityProfile}) {
    const records=capacityProfile.obligations.map((obligation)=>{
      let value=semanticValue(canonicalView,obligation);
      if(obligation.semanticPath==='dynamics.mass'&&massOverride!==undefined)value=massOverride;
      return{obligationId:obligation.obligationId,value};
    });
    const path='fixture/physical-claim.json';
    return{artifacts:[{path,mediaType:'application/json',content:`${JSON.stringify({schema:'fixture.physical-claim/v1',records})}\n`}],bindings:capacityProfile.obligations.map(({obligationId})=>({obligationId,targets:[{path,locator:`record:${obligationId}`}]}))};
  }};
}
function normalizer(){return{id:'physical-claim-fixture-normalizer',backend:'physical-claim-fixture',version:'1',implementationDigest:D('f'),normalize({manifest,obligations,artifacts}){
  const document=JSON.parse(Buffer.from(artifacts.find((item)=>item.path==='fixture/physical-claim.json').content).toString('utf8'));
  const records=new Map(document.records.map((item)=>[item.obligationId,item.value]));
  const dispositions=new Map(manifest.dispositions.map((item)=>[item.obligationId,item]));
  return{readings:obligations.map((obligation)=>({obligationId:obligation.obligationId,sources:dispositions.get(obligation.obligationId).targets,value:records.get(obligation.obligationId)}))};
}};}

async function pipeline({massOverride,unrelated=false}={}) {
  const context=physicalFixture({unrelated});
  const obligations=deriveRepresentationCapacityObligations(context);
  const capacityProfile=createRepresentationCapacityProfile({profileId:'physical-claim-profile',backend:'physical-claim-fixture',...context,supported:obligations.map(({obligationId})=>({obligationId})),approximated:[],unsupported:[],blockers:[]});
  const representationNormalizer=normalizer();
  const exported=await runExportAdapter({exportId:'physical-claim-export',adapter:adapter({massOverride}),capacityProfile,...context});
  const normalizedRepresentation=await runRepresentationNormalizer({normalizationId:'physical-claim-normalized',normalizer:representationNormalizer,capacityProfile,manifest:exported.manifest,files:exported.files});
  const validation=await createCrossRepresentationValidation({validationId:'physical-claim-validation',capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,...context});
  return{...context,capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,validation};
}
function claimContext(data, extra={}) { return {bundle:data.bundle,identityGraph:data.identityGraph,components:data.components,validation:data.validation,capacityProfile:data.capacityProfile,manifest:data.manifest,files:data.files,normalizedRepresentation:data.normalizedRepresentation,normalizer:data.normalizer,...extra}; }

function authorityEntry(subjectId) {return{id:'p16-divergence-authority',subjectId,authority:'engineered',proposition:'The exact backend-specific override is authorized for this target.',reason:'The downstream backend requires this explicit construction choice.',basis:[{kind:'downstream-requirement',ref:'backend:physical-claim-fixture'}]};}
async function authorizeMassDrift(data) {
  const finding=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass');
  const raw={findingId:finding.findingId,obligationId:finding.obligationId,targetBackend:data.validation.capacityBinding.backend,semanticPath:finding.semanticPath,subjectIds:[...finding.subjectIds],fieldPath:'',canonicalValue:finding.canonicalValue,overrideValue:finding.normalizedValue,reason:'Backend-specific mass realization is required by the declared downstream target.'};
  const subjectId=divergenceAuthoritySubjectId(data.validation.validationDigest,finding.findingId,'');
  const authoritySet=createSemanticAuthoritySet({scopeId:data.validation.scopeId,sourceSha256:data.identityGraph.sourceSha256,targetSchema:data.validation.schema,targetDigest:data.validation.validationDigest,entries:[authorityEntry(subjectId)]});
  const divergenceAuthorization=await createDivergenceAuthorization({authorizationId:'p16-mass-authorization',validation:data.validation,declarations:[raw],authoritySet,...claimContext(data)});
  return{divergenceAuthorization,authoritySet};
}

function checkpoint(candidate) {
  const sha=digestBytes(candidate),content={schema:'refas.checkpoint/v1',parentId:null,capability:'whole-object-certification',scopeId:'whole',reason:'physical claim fixture',artifactRefs:[{kind:'asset',path:'asset.bin',sha256:sha,sizeBytes:candidate.length}],claims:[],gates:[],metadata:{},transactionId:null};
  const contentDigest=digestJson(content);return{...content,id:`cp_${contentDigest.slice(0,20)}`,createdAt:'2026-09-17T00:00:00.000Z',contentDigest};
}

function transactionForEvidence(evidence) {
  const candidate=Buffer.from('physical-claim-candidate');
  const evidenceBytes=Buffer.from(`${JSON.stringify(evidence)}\n`);
  const anchorDocument={schema:'fixture.physical-claim-anchor/v1',candidateSha256:digestBytes(candidate),physicalClaimSha256:digestBytes(evidenceBytes)};
  const anchorBytes=Buffer.from(JSON.stringify(anchorDocument));
  const nodeId='physical-claim-evidence';
  const transaction=createCandidateTransaction({candidateBytes:candidate,checkpoint:checkpoint(candidate),evidence:[
    {id:'candidate-anchor',role:'candidate-anchor',schema:anchorDocument.schema,bytes:anchorBytes,subjectPointer:'/candidateSha256'},
    {id:nodeId,role:physicalClaimEvidenceRole(evidence.claimId),schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA,bytes:evidenceBytes,dependencies:[{nodeId:'candidate-anchor',proof:{kind:'json-pointer-artifact-sha256',holder:'dependency',pointer:'/physicalClaimSha256'}}]},
  ],decisionNodeIds:[nodeId],obligations:[{id:'physical-claim-node',role:physicalClaimEvidenceRole(evidence.claimId),schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA}]});
  return{candidate,transaction,evidenceBytesById:{'candidate-anchor':anchorBytes,[nodeId]:evidenceBytes},nodeId};
}

test('P16 simulation-ready passes for a static rigid asset while higher unrelated control/runtime identities and runtime relations do not back-propagate',async()=>{
  const base=await pipeline(),baseEvidence=await createPhysicalClaimEvidence({evidenceId:'simulation-evidence',claimId:'simulation-ready',...claimContext(base)});
  assert.equal(baseEvidence.status,'PASS');assert.equal(baseEvidence.findings.length,0);assert.deepEqual(validatePhysicalClaimEvidence(baseEvidence),{valid:true,errors:[]});
  const unrelated=await pipeline({unrelated:true}),unrelatedEvidence=await createPhysicalClaimEvidence({evidenceId:'simulation-evidence',claimId:'simulation-ready',...claimContext(unrelated)});
  assert.deepEqual(unrelatedEvidence,baseEvidence);
  assert.deepEqual(await validatePhysicalClaimEvidenceBindings(baseEvidence,claimContext(unrelated)),{valid:true,errors:[]});
  assert.equal(baseEvidence.policy.higherLevelRequirementsDoNotBackPropagate,true);
});

test('P16 claims fail closed on their own missing identities without contaminating lower claims',async()=>{
  const data=await pipeline();
  const articulated=await createPhysicalClaimEvidence({evidenceId:'articulated-evidence',claimId:'articulated-ready',...claimContext(data)});
  const control=await createPhysicalClaimEvidence({evidenceId:'control-evidence',claimId:'control-ready',...claimContext(data)});
  const runtime=await createPhysicalClaimEvidence({evidenceId:'runtime-evidence',claimId:'runtime-ready',...claimContext(data)});
  assert.equal(articulated.status,'FAIL');assert.equal(articulated.findings.some((item)=>item.category==='physical-claim-missing-identity'&&/virtual-joint/.test(item.summary)),true);
  assert.equal(control.status,'FAIL');assert.equal(control.findings.some((item)=>/actuator/.test(item.summary)),true);assert.equal(control.findings.some((item)=>/controller/.test(item.summary)),true);
  assert.equal(runtime.status,'FAIL');assert.equal(runtime.findings.some((item)=>/runtime-endpoint/.test(item.summary)),true);
});

test('P16 relevant P14 DRIFT blocks simulation-ready until an exact live P15 declaration authorizes it',async()=>{
  const data=await pipeline({massOverride:3.5});
  const mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass');assert.equal(mass.outcome,'DRIFT');
  const blocked=await createPhysicalClaimEvidence({evidenceId:'simulation-drift',claimId:'simulation-ready',...claimContext(data)});
  assert.equal(blocked.status,'FAIL');assert.equal(blocked.findings.some((item)=>item.semanticPath==='dynamics.mass'&&item.effectiveOutcome==='DRIFT'&&item.blocking),true);
  const{divergenceAuthorization,authoritySet}=await authorizeMassDrift(data);
  const declared=await createPhysicalClaimEvidence({evidenceId:'simulation-drift',claimId:'simulation-ready',...claimContext(data,{divergenceAuthorization,authoritySet})});
  assert.equal(declared.status,'PASS');assert.equal(declared.findings.some((item)=>item.semanticPath==='dynamics.mass'&&item.effectiveOutcome==='DECLARED_DIVERGENCE'&&!item.blocking),true);assert.notEqual(declared.divergenceBinding,null);

  const changedAuthority=createSemanticAuthoritySet({scopeId:data.validation.scopeId,sourceSha256:data.identityGraph.sourceSha256,targetSchema:data.validation.schema,targetDigest:data.validation.validationDigest,entries:[{...authorityEntry(divergenceAuthoritySubjectId(data.validation.validationDigest,mass.findingId,'')),reason:'A changed rationale must invalidate the old P15 live binding.'}]});
  await assert.rejects(createPhysicalClaimEvidence({evidenceId:'simulation-drift',claimId:'simulation-ready',...claimContext(data,{divergenceAuthorization,authoritySet:changedAuthority})}),/P15 divergence authorization is not live/);
});

test('P16 persisted tamper fails intrinsic validation and claim-relevant upstream edits fail live replay',async()=>{
  const data=await pipeline(),evidence=await createPhysicalClaimEvidence({evidenceId:'simulation-tamper',claimId:'simulation-ready',...claimContext(data)});
  const tampered=structuredClone(evidence);tampered.status='FAIL';assert.equal(validatePhysicalClaimEvidence(tampered).valid,false);
  const changed=physicalFixture();
  const changedDynamics=structuredClone(changed.components.find((item)=>item.componentId==='dynamics-main').contract);
  changedDynamics.links[0].mass.value_kg=3.0;
  assert.equal((await validatePhysicalClaimEvidenceBindings(evidence,{...claimContext(data),components:[changed.components[0],{...changed.components[1],contract:changedDynamics}]})).valid,false);
});

test('P16 standard policy uses the existing certification engine, but typed evaluation requires live physical evidence before delegation',async()=>{
  const data=await pipeline(),evidence=await createPhysicalClaimEvidence({evidenceId:'simulation-certification',claimId:'simulation-ready',...claimContext(data)}),policy=createPhysicalClaimCertificationPolicy({claimIds:['simulation-ready']}),tx=transactionForEvidence(evidence);
  const decision=await evaluatePhysicalClaimCertification({transaction:tx.transaction,policy,evidenceBytesById:tx.evidenceBytesById,physicalClaimContextsByNodeId:{[tx.nodeId]:claimContext(data)}});
  assert.equal(decision.authorized,true);assert.deepEqual(decision.authorizedClaimIds,['simulation-ready']);
  await assert.rejects(evaluatePhysicalClaimCertification({transaction:tx.transaction,policy,evidenceBytesById:tx.evidenceBytesById,physicalClaimContextsByNodeId:{}}),/missing live physical claim context/);
});

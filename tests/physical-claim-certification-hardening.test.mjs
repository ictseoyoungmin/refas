import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
  createCandidateTransaction,
  createCollisionModel,
  createCrossRepresentationValidation,
  createPhysicalAssetBundle,
  createPhysicalClaimCertificationPolicy,
  createPhysicalClaimEvidence,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  deriveRepresentationCapacityObligations,
  digestBytes,
  digestJson,
  evaluateCertificationPolicy,
  evaluatePhysicalClaimCertification,
  physicalClaimEvidenceRole,
  runExportAdapter,
  runRepresentationNormalizer,
  validateClaimCertificationDecision,
  validatePhysicalClaimCertificationDecision,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function physicalFixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId:'whole',sourceSha256:D(),
    entities:[
      {id:'module-root',kind:'assembly-module'},
      {id:'link-a',kind:'rigid-link',frame:{parentId:'module-root',translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]}},
    ],
    relations:[{id:'contains-link',kind:'CONTAINS',sourceId:'module-root',targetIds:['link-a']}],
  });
  const dynamics = createRigidBodyDynamics({
    scopeId:'whole',sourceSha256:D(),identityGraph,
    links:[{linkId:'link-a',referenceFrameId:'link-a',mass:{value_kg:2.5},centerOfMass:{value_m:[0,0,0]},inertia:{tensor_kg_m2:[[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
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

function adapter() {
  return {id:'p16-certification-export',backend:'p16-certification-fixture',version:'1',project({canonicalView,capacityProfile}) {
    const records = capacityProfile.obligations.map((obligation)=>({obligationId:obligation.obligationId,value:semanticValue(canonicalView,obligation)}));
    const path='fixture/p16-certification.json';
    return {
      artifacts:[{path,mediaType:'application/json',content:`${JSON.stringify({schema:'fixture.p16-certification/v1',records})}\n`}],
      bindings:capacityProfile.obligations.map(({obligationId})=>({obligationId,targets:[{path,locator:`record:${obligationId}`}]})),
    };
  }};
}

function normalizer() {
  return {id:'p16-certification-normalizer',backend:'p16-certification-fixture',version:'1',implementationDigest:D('f'),normalize({manifest,obligations,artifacts}) {
    const document=JSON.parse(Buffer.from(artifacts.find((item)=>item.path==='fixture/p16-certification.json').content).toString('utf8'));
    const records=new Map(document.records.map((item)=>[item.obligationId,item.value]));
    const dispositions=new Map(manifest.dispositions.map((item)=>[item.obligationId,item]));
    return {readings:obligations.map((obligation)=>({obligationId:obligation.obligationId,sources:dispositions.get(obligation.obligationId).targets,value:records.get(obligation.obligationId)}))};
  }};
}

async function pipeline() {
  const context=physicalFixture();
  const obligations=deriveRepresentationCapacityObligations(context);
  const capacityProfile=createRepresentationCapacityProfile({profileId:'p16-certification-profile',backend:'p16-certification-fixture',...context,supported:obligations.map(({obligationId})=>({obligationId})),approximated:[],unsupported:[],blockers:[]});
  const representationNormalizer=normalizer();
  const exported=await runExportAdapter({exportId:'p16-certification-export',adapter:adapter(),capacityProfile,...context});
  const normalizedRepresentation=await runRepresentationNormalizer({normalizationId:'p16-certification-normalized',normalizer:representationNormalizer,capacityProfile,manifest:exported.manifest,files:exported.files});
  const validation=await createCrossRepresentationValidation({validationId:'p16-certification-validation',capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,...context});
  return {...context,capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,validation};
}

function claimContext(data) {
  return {bundle:data.bundle,identityGraph:data.identityGraph,components:data.components,validation:data.validation,capacityProfile:data.capacityProfile,manifest:data.manifest,files:data.files,normalizedRepresentation:data.normalizedRepresentation,normalizer:data.normalizer};
}

function checkpoint(candidate) {
  const sha=digestBytes(candidate);
  const content={schema:'refas.checkpoint/v1',parentId:null,capability:'whole-object-certification',scopeId:'whole',reason:'P16 certification hardening fixture',artifactRefs:[{kind:'asset',path:'asset.bin',sha256:sha,sizeBytes:candidate.length}],claims:[],gates:[],metadata:{},transactionId:null};
  const contentDigest=digestJson(content);
  return {...content,id:`cp_${contentDigest.slice(0,20)}`,createdAt:'2026-09-17T00:00:00.000Z',contentDigest};
}

function transactionForEvidenceSet(entries) {
  const candidate=Buffer.from('p16-certification-candidate');
  const evidenceBytesById={};
  const physicalClaims={};
  for (const entry of entries) {
    const bytes=Buffer.from(`${JSON.stringify(entry.evidence)}\n`);
    evidenceBytesById[entry.nodeId]=bytes;
    physicalClaims[entry.nodeId]=digestBytes(bytes);
  }
  const anchorDocument={schema:'fixture.p16-certification-anchor/v1',candidateSha256:digestBytes(candidate),physicalClaims};
  const anchorBytes=Buffer.from(JSON.stringify(anchorDocument));
  evidenceBytesById['candidate-anchor']=anchorBytes;
  const evidence=[{id:'candidate-anchor',role:'candidate-anchor',schema:anchorDocument.schema,bytes:anchorBytes,subjectPointer:'/candidateSha256'}];
  for (const entry of entries) {
    evidence.push({
      id:entry.nodeId,
      role:physicalClaimEvidenceRole(entry.evidence.claimId),
      schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
      bytes:evidenceBytesById[entry.nodeId],
      dependencies:[{nodeId:'candidate-anchor',proof:{kind:'json-pointer-artifact-sha256',holder:'dependency',pointer:`/physicalClaims/${entry.nodeId}`}}],
    });
  }
  const transaction=createCandidateTransaction({
    candidateBytes:candidate,
    checkpoint:checkpoint(candidate),
    evidence,
    decisionNodeIds:entries.map((entry)=>entry.nodeId),
    obligations:entries.map((entry)=>({id:`${entry.nodeId}-obligation`,role:physicalClaimEvidenceRole(entry.evidence.claimId),schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA})),
  });
  return {transaction,evidenceBytesById};
}

test('public generic certification cannot directly authorize live-gated P16 evidence',async()=>{
  const data=await pipeline();
  const evidence=await createPhysicalClaimEvidence({evidenceId:'simulation-public-gate',claimId:'simulation-ready',...claimContext(data)});
  const policy=createPhysicalClaimCertificationPolicy({claimIds:['simulation-ready']});
  const tx=transactionForEvidenceSet([{nodeId:'simulation-node',evidence}]);
  assert.throws(
    ()=>evaluateCertificationPolicy({transaction:tx.transaction,policy,evidenceBytesById:tx.evidenceBytesById}),
    /physical claim evidence is live-gated/,
  );
  assert.equal(validateClaimCertificationDecision({}, {transaction:tx.transaction,policy,evidenceBytesById:tx.evidenceBytesById}).valid,false);
});

test('typed P16 certification validates only physical evidence selected by the active policy',async()=>{
  const data=await pipeline();
  const simulation=await createPhysicalClaimEvidence({evidenceId:'simulation-selected',claimId:'simulation-ready',...claimContext(data)});
  const runtime=await createPhysicalClaimEvidence({evidenceId:'runtime-unselected',claimId:'runtime-ready',...claimContext(data)});
  assert.equal(simulation.status,'PASS');
  assert.equal(runtime.status,'FAIL');
  const policy=createPhysicalClaimCertificationPolicy({claimIds:['simulation-ready']});
  const tx=transactionForEvidenceSet([
    {nodeId:'simulation-node',evidence:simulation},
    {nodeId:'runtime-node',evidence:runtime},
  ]);
  const context={
    transaction:tx.transaction,
    policy,
    evidenceBytesById:tx.evidenceBytesById,
    physicalClaimContextsByNodeId:{'simulation-node':claimContext(data)},
  };
  const decision=await evaluatePhysicalClaimCertification(context);
  assert.equal(decision.authorized,true);
  assert.deepEqual(decision.authorizedClaimIds,['simulation-ready']);
  assert.deepEqual(decision.claims[0].matchedEvidenceNodeIds,['simulation-node']);
  assert.deepEqual(await validatePhysicalClaimCertificationDecision(decision,context),{valid:true,errors:[]});
});

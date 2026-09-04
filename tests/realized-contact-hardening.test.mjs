import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {
  analyzeRealizedContact,
  createAttachmentSemantics,
  createRealizedContactPlan,
  digestJson,
  partsToGlb,
} from '../skills/refas/scripts/lib/index.mjs';

const sha=(value)=>createHash('sha256').update(Buffer.from(value)).digest('hex');
const D=(value='a')=>value.repeat(64);
const E=(id)=>({id,scopeId:id,evidenceRefs:[`model/${id}.json`]});
const R=(id,mode,subjectId,ownerIds=[])=>({id,mode,subjectId,ownerIds,basis:'construction',evidenceRefs:[`model/${id}.json`]});
function box(id,x0,x1,y0,y1,z0,z1){const positions=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,7,3,0,4,7,1,2,6,1,6,5];return{id,materialId:'solid',mesh:{positions,indices}};}
function glb(parts){return partsToGlb({parts,materials:{solid:{baseColor:[0.5,0.5,0.5,1],roughness:0.5}},assetId:'realized-contact-hardening'});}
function fusionArtifact(rootId,members){
  const provenancePayload={schema:'refas.fusion-provenance/v1',planDigest:D('a'),groupId:`fusion-${rootId}`,fusionRootId:rootId,outputMeshDigest:D('b'),sourceMemberIds:[...members].sort(),outputFaces:[],removedInterfaces:[],reopen:{checkpointId:'checkpoint-pre-fusion',stateDigest:D('c'),inputAssetSha256:D('d'),canonicalSource:'pre-fusion-semantic-state'},policy:{everyOutputFaceRequiresSemanticProvenance:true,booleanGeneratedFacesMayHaveMultipleSourceMembers:true,reopenNeverStartsFromFusedMesh:true}};
  const provenance={...provenancePayload,provenanceDigest:digestJson(provenancePayload)};
  const reportPayload={schema:'refas.physical-fusion-report/v1',planDigest:D('a'),scopeId:rootId,groupId:`fusion-${rootId}`,status:'BAKED',blockingReason:null,backendInputDigest:D('e'),backendId:'fixture-backend',inputAssetSha256:D('d'),outputMeshDigest:D('b'),provenanceDigest:provenance.provenanceDigest,topology:{pass:true},metrics:{},reopen:{checkpointId:'checkpoint-pre-fusion',stateDigest:D('c')},evidenceRefs:['reviews/fusion.json'],policy:{onePhysicalMeshProduced:true}};
  return{report:{...reportPayload,reportDigest:digestJson(reportPayload)},provenance};
}

function fusedFixture(){
  const semantics=createAttachmentSemantics({scopeId:'fused-hardening',sourceSha256:D('f'),entities:[E('head-shell'),E('face'),E('nose')],relations:[R('head-free','FREE','head-shell'),R('face-fused','FUSED','face',['head-shell']),R('nose-fused','FUSED','nose',['head-shell'])]});
  const asset=glb([box('head-shell',0,1,0,1,0,1)]),artifact=fusionArtifact('head-shell',['head-shell','face','nose']);
  const fusionBinding={physicalEntityId:'head-shell',semanticMemberIds:['head-shell','face','nose'],fusionReportDigest:artifact.report.reportDigest,provenanceDigest:artifact.provenance.provenanceDigest,evidenceRefs:['reviews/fusion-binding.json']};
  return{semantics,asset,artifact,fusionBinding};
}

test('clearance or forbidden separation cannot be declared inside one physical fusion',()=>{
  const f=fusedFixture();
  for(const kind of ['CLEARANCE','FORBID']) assert.throws(()=>createRealizedContactPlan({attachmentSemantics:f.semantics,id:`bad-${kind.toLowerCase()}-inside-fusion`,assetSha256:sha(f.asset),fusionBindings:[f.fusionBinding],pairExpectations:[{id:`bad-${kind.toLowerCase()}`,kind,subjectId:'face',ownerId:'nose',minimumClearance:0.01,maximumClearance:0.02,evidenceRefs:['reviews/bad.json']}],evidenceRefs:['reviews/bad-plan.json']}),/incompatible with semantic members baked into the same physical fusion/);
});

test('tampered physical-fusion provenance cannot authorize semantic alias collapse',()=>{
  const f=fusedFixture();
  const plan=createRealizedContactPlan({attachmentSemantics:f.semantics,id:'fusion-tamper-plan',assetSha256:sha(f.asset),fusionBindings:[f.fusionBinding],pairExpectations:[{id:'face-nose-contact',kind:'CONTACT',subjectId:'face',ownerId:'nose',maxGap:0,evidenceRefs:['reviews/face-nose.json']}],evidenceRefs:['reviews/fusion-tamper-plan.json']});
  const tampered=structuredClone(f.artifact); tampered.provenance.outputFaces.push({outputFaceIndex:0,sourceMemberIds:['face'],sourceFaceRefs:[],origin:'preserved'});
  assert.throws(()=>analyzeRealizedContact({plan,attachmentSemantics:f.semantics,glb:f.asset,fusionArtifacts:[tampered]}),/fusion artifact digest validation failed/);
});

test('a bound attachment-propagation report must be present and digest-valid',()=>{
  const semantics=createAttachmentSemantics({scopeId:'propagation-binding',sourceSha256:D('1'),entities:[E('root-part'),E('child-part')],relations:[R('root-free','FREE','root-part'),R('child-follow','RIGID_FOLLOW','child-part',['root-part'])]});
  const asset=glb([box('root-part',0,1,0,1,0,1),box('child-part',2,3,0,1,0,1)]);
  const propagationPayload={schema:'refas.attachment-propagation-report/v1',planDigest:D('2'),scopeId:'propagation-binding',sourceSha256:D('1'),executionOrder:['root-part','child-part'],entities:[],blockers:[],pendingRealizedValidation:[],evidenceRefs:['reviews/propagation.json'],policy:{meshBytesAreNotMutated:true}};
  const propagationReport={...propagationPayload,reportDigest:digestJson(propagationPayload)};
  const plan=createRealizedContactPlan({attachmentSemantics:semantics,id:'propagation-bound-contact',assetSha256:sha(asset),propagationReportDigest:propagationReport.reportDigest,evidenceRefs:['reviews/contact.json']});
  assert.throws(()=>analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset}),/propagation report does not match/);
  const tampered=structuredClone(propagationReport); tampered.executionOrder.reverse();
  assert.throws(()=>analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset,propagationReport:tampered}),/propagation report does not match/);
  const result=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset,propagationReport});
  assert.equal(result.graph.propagationCheck.required,true);
  assert.equal(result.graph.propagationCheck.pass,true);
  assert.equal(result.graph.propagationCheck.reportDigest,propagationReport.reportDigest);
});

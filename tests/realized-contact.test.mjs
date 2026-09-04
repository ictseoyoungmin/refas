import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {
  analyzeRealizedContact,
  createAttachmentSemantics,
  createRealizedContactPlan,
  digestJson,
  partsToGlb,
  validateRealizedContactPlan,
  validateRealizedContactResult,
} from '../skills/refas/scripts/lib/index.mjs';

const sha = (value) => createHash('sha256').update(Buffer.from(value)).digest('hex');
const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});

function box(id, x0, x1, y0, y1, z0, z1, extra = {}) {
  const positions = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
  ];
  const indices = [
    0,2,1, 0,3,2,
    4,5,6, 4,6,7,
    0,1,5, 0,5,4,
    3,7,6, 3,6,2,
    0,7,3, 0,4,7,
    1,2,6, 1,6,5,
  ];
  return {id, materialId: 'solid', mesh: {positions, indices}, ...extra};
}

function glb(parts) {
  return partsToGlb({parts, materials: {solid: {baseColor: [0.6,0.6,0.6,1], roughness: 0.5}}, assetId: 'contact-fixture'});
}

function supportFixture() {
  const semantics = createAttachmentSemantics({
    scopeId: 'support-stack', sourceSha256: D('a'),
    entities: [E('base'),E('leg'),E('body')],
    relations: [R('base-free','FREE','base'),R('leg-follow','RIGID_FOLLOW','leg',['base']),R('body-follow','RIGID_FOLLOW','body',['leg'])],
  });
  const asset = glb([
    box('base',0,1,0,1,0,0.2),
    box('leg',0,1,0,1,0.2,1.2),
    box('body',0,1,0,1,1.2,2.2),
  ]);
  const plan = createRealizedContactPlan({
    attachmentSemantics: semantics, id: 'support-stack-contact', assetSha256: sha(asset), supportRoots: ['base'], supportRequiredEntityIds: ['leg','body'],
    pairExpectations: [
      {id:'leg-base-support',kind:'SUPPORT',subjectId:'leg',ownerId:'base',relationId:'leg-follow',maxGap:1e-6,maxPenetration:1e-7,minContactArea:0.5,evidenceRefs:['reviews/leg-base.json']},
      {id:'body-leg-support',kind:'SUPPORT',subjectId:'body',ownerId:'leg',relationId:'body-follow',maxGap:1e-6,maxPenetration:1e-7,minContactArea:0.5,evidenceRefs:['reviews/body-leg.json']},
    ], broadPhaseMargin:0.05, contactTolerance:0.002, penetrationTolerance:1e-7, unexpectedContactPolicy:'REPORT', evidenceRefs:['reviews/support-stack.json'],
  });
  return {semantics, asset, plan};
}

test('actual triangle contact creates a support path to an explicit root', () => {
  const f = supportFixture();
  assert.equal(validateRealizedContactPlan(f.plan,f.semantics).valid,true);
  const result = analyzeRealizedContact({plan:f.plan,attachmentSemantics:f.semantics,glb:f.asset,evidenceRefs:['reviews/support-result.json']});
  assert.equal(result.report.status,'PASS');
  assert.equal(result.report.unsupportedPhysicalEntityIds.length,0);
  const body = result.report.supportChecks.find((check)=>check.physicalEntityId==='body');
  assert.deepEqual(body.path,['body','leg','base']);
  assert.equal(result.report.expectationResults.every((entry)=>entry.pass),true);
  assert.equal(result.graph.broadPhase.authority,'candidate-discovery-only');
  assert.equal(validateRealizedContactResult(result,{plan:f.plan,attachmentSemantics:f.semantics,glb:f.asset}).valid,true);
});

test('an internally connected floating cluster still fails support-root reachability', () => {
  const semantics = createAttachmentSemantics({
    scopeId:'floating-cluster',sourceSha256:D('b'),entities:[E('torso'),E('face'),E('eye')],
    relations:[R('torso-free','FREE','torso'),R('face-follow','RIGID_FOLLOW','face',['torso']),R('eye-follow','RIGID_FOLLOW','eye',['face'])],
  });
  const asset=glb([box('torso',0,1,0,1,0,1),box('face',0,1,0,1,1.1,2.1),box('eye',0.2,0.8,0.2,0.8,2.1,2.3)]);
  const plan=createRealizedContactPlan({attachmentSemantics:semantics,id:'floating-cluster-contact',assetSha256:sha(asset),supportRoots:['torso'],supportRequiredEntityIds:['face','eye'],broadPhaseMargin:0.2,contactTolerance:0.002,penetrationTolerance:1e-7,pairExpectations:[
    {id:'face-torso-support',kind:'SUPPORT',subjectId:'face',ownerId:'torso',maxGap:0.001,minContactArea:0.1,evidenceRefs:['reviews/face-torso.json']},
    {id:'eye-face-support',kind:'SUPPORT',subjectId:'eye',ownerId:'face',maxGap:0.001,minContactArea:0.1,evidenceRefs:['reviews/eye-face.json']},
  ],evidenceRefs:['reviews/floating-cluster.json']});
  const result=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset});
  assert.equal(result.report.status,'BLOCKED');
  assert.ok(result.report.blockers.includes('EXPECTATION:face-torso-support'));
  assert.deepEqual(result.report.unsupportedPhysicalEntityIds,['eye','face']);
  assert.equal(result.report.expectationResults.find((item)=>item.id==='eye-face-support').pass,true);
});

test('broad-phase candidacy cannot masquerade as a realized contact', () => {
  const semantics=createAttachmentSemantics({scopeId:'broad-phase-only',sourceSha256:D('c'),entities:[E('lower'),E('upper')],relations:[R('lower-free','FREE','lower'),R('upper-follow','RIGID_FOLLOW','upper',['lower'])]});
  const asset=glb([box('lower',0,1,0,1,0,0.1),box('upper',0,1,0,1,0.2,0.3)]);
  const plan=createRealizedContactPlan({attachmentSemantics:semantics,id:'broad-phase-plan',assetSha256:sha(asset),pairExpectations:[{id:'must-touch',kind:'CONTACT',subjectId:'upper',ownerId:'lower',maxGap:0.001,minContactArea:0.1,evidenceRefs:['reviews/must-touch.json']}],broadPhaseMargin:0.2,contactTolerance:0.002,evidenceRefs:['reviews/broad-phase.json']});
  const result=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset});
  const edge=result.graph.edges.find((item)=>item.aId==='lower'&&item.bId==='upper');
  assert.equal(edge.type,'CLEARANCE');
  assert.ok(edge.minimumSurfaceDistance>0.09);
  assert.equal(result.report.expectationResults[0].pass,false);
  assert.equal(result.report.status,'BLOCKED');
});

test('contained geometry is penetration, never a successful unexpected contact', () => {
  const semantics=createAttachmentSemantics({scopeId:'penetration-case',sourceSha256:D('d'),entities:[E('shell'),E('intruder')],relations:[R('shell-free','FREE','shell'),R('intruder-follow','RIGID_FOLLOW','intruder',['shell'])]});
  const asset=glb([box('shell',0,2,0,2,0,2),box('intruder',0.5,1.5,0.5,1.5,0.5,1.5)]);
  const plan=createRealizedContactPlan({attachmentSemantics:semantics,id:'penetration-plan',assetSha256:sha(asset),broadPhaseMargin:0.01,contactTolerance:0.001,penetrationTolerance:1e-6,unexpectedContactPolicy:'REPORT',evidenceRefs:['reviews/penetration.json']});
  const result=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset});
  assert.equal(result.graph.edges[0].type,'PENETRATION');
  assert.ok(result.graph.edges[0].penetrationDepthEstimate>0.49);
  assert.equal(result.report.status,'BLOCKED');
  assert.ok(result.report.blockers.some((item)=>item.startsWith('PENETRATION:')));
});

function fusionArtifact(rootId,members){
  const provenancePayload={schema:'refas.fusion-provenance/v1',planDigest:D('e'),groupId:`fusion-${rootId}`,fusionRootId:rootId,outputMeshDigest:D('f'),sourceMemberIds:[...members].sort(),outputFaces:[],removedInterfaces:[],reopen:{checkpointId:'checkpoint-before-fusion',stateDigest:D('1'),inputAssetSha256:D('2'),canonicalSource:'pre-fusion-semantic-state'},policy:{everyOutputFaceRequiresSemanticProvenance:true,booleanGeneratedFacesMayHaveMultipleSourceMembers:true,reopenNeverStartsFromFusedMesh:true}};
  const provenance={...provenancePayload,provenanceDigest:digestJson(provenancePayload)};
  const reportPayload={schema:'refas.physical-fusion-report/v1',planDigest:D('e'),scopeId:rootId,groupId:`fusion-${rootId}`,status:'BAKED',blockingReason:null,backendInputDigest:D('3'),backendId:'fixture-backend',inputAssetSha256:D('2'),outputMeshDigest:D('f'),provenanceDigest:provenance.provenanceDigest,topology:{pass:true},metrics:{},reopen:{checkpointId:'checkpoint-before-fusion',stateDigest:D('1')},evidenceRefs:['reviews/fusion.json'],policy:{onePhysicalMeshProduced:true}};
  return {report:{...reportPayload,reportDigest:digestJson(reportPayload)},provenance};
}

test('A08 fusion provenance collapses semantic members to one physical node', () => {
  const semantics=createAttachmentSemantics({scopeId:'fused-head-contact',sourceSha256:D('e'),entities:[E('head-shell'),E('face'),E('nose'),E('glasses')],relations:[R('head-free','FREE','head-shell'),R('face-fused','FUSED','face',['head-shell']),R('nose-fused','FUSED','nose',['head-shell']),R('glasses-free','FREE','glasses')]});
  const asset=glb([box('head-shell',0,1,0,1,0,1),box('glasses',0,1,0,0.1,1.1,1.2)]),artifact=fusionArtifact('head-shell',['head-shell','face','nose']);
  const plan=createRealizedContactPlan({attachmentSemantics:semantics,id:'fused-head-plan',assetSha256:sha(asset),fusionBindings:[{physicalEntityId:'head-shell',semanticMemberIds:['head-shell','face','nose'],fusionReportDigest:artifact.report.reportDigest,provenanceDigest:artifact.provenance.provenanceDigest,evidenceRefs:['reviews/head-fusion.json']}],pairExpectations:[{id:'face-nose-internal',kind:'CONTACT',subjectId:'face',ownerId:'nose',maxGap:0,minContactArea:0,evidenceRefs:['reviews/face-nose.json']}],broadPhaseMargin:0.2,evidenceRefs:['reviews/fused-head-contact.json']});
  const result=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:asset,fusionArtifacts:[artifact]});
  assert.equal(result.report.status,'PASS');
  assert.equal(result.report.expectationResults[0].status,'SATISFIED_BY_FUSION');
  const headNode=result.graph.nodes.find((node)=>node.physicalEntityId==='head-shell');
  assert.deepEqual(headNode.semanticEntityIds,['face','head-shell','nose']);
  assert.equal(result.graph.fusionChecks[0].pass,true);
});

test('stale GLB and tampered result fail closed', () => {
  const f=supportFixture(),result=analyzeRealizedContact({plan:f.plan,attachmentSemantics:f.semantics,glb:f.asset});
  const other=glb([box('base',0,1,0,1,0,0.25),box('leg',0,1,0,1,0.25,1.2),box('body',0,1,0,1,1.2,2.2)]);
  assert.throws(()=>analyzeRealizedContact({plan:f.plan,attachmentSemantics:f.semantics,glb:other}),/SHA-256 does not match/);
  const tampered=structuredClone(result); tampered.report.supportChecks[0].pass=false;
  assert.equal(validateRealizedContactResult(tampered,{plan:f.plan,attachmentSemantics:f.semantics,glb:f.asset}).valid,false);
});

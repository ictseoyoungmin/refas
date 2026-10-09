import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {readQaGeometryAccessor} from '../skills/refas/scripts/lib/qa-glb-geometry-accessors.mjs';

import {
  bakePhysicalFusion,
  createAttachmentSemantics,
  createCanonicalEditIntent,
  createLogicalFusion,
  createPhysicalFusionPlan,
  parseGlb,
  partsToGlb,
  physicalFusionFrameDigest,
  physicalFusionGeometryDigest,
  physicalFusionReopenTarget,
  validatePhysicalFusionPlan,
  validatePhysicalFusionResult,
  replayExactGlbPhysicalFusion,
  digestJson,
  createRealizedContactPlan,
  analyzeRealizedContact,
  replayRealizedContactEvidence,
  initProject,
  commitCheckpoint,
  contentReference,
  verifySourceBoundObject,
  createAttachmentPropagationPlan,
  propagateAttachmentGraph,
  rigidFrameDigest,
  verifyRealizedPropagationWorldFrames,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const sha = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});

function cube(x0, x1) {
  const positions = [
    [x0, 0, 0], [x1, 0, 0], [x1, 1, 0], [x0, 1, 0],
    [x0, 0, 1], [x1, 0, 1], [x1, 1, 1], [x0, 1, 1],
  ];
  const indices = [
    0,2,1, 0,3,2,
    4,5,6, 4,6,7,
    0,1,5, 0,5,4,
    3,7,6, 3,6,2,
    0,7,3, 0,4,7,
    1,2,6, 1,6,5,
  ];
  return {positions, indices};
}

function fixture(sourceSha256 = D('f'), {includeGlasses = true} = {}) {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'head-shell', sourceSha256,
    entities: [E('head-shell'), E('face'), E('nose'), ...(includeGlasses ? [E('glasses')] : [])],
    relations: [
      R('head-free', 'FREE', 'head-shell'),
      R('face-fused', 'FUSED', 'face', ['head-shell']),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      ...(includeGlasses ? [R('glasses-free', 'FREE', 'glasses')] : []),
    ],
  });
  const logicalFusion = createLogicalFusion({attachmentSemantics, evidenceRefs: ['reviews/head-logical-fusion.json']});
  const canonicalEditIntent = createCanonicalEditIntent({
    id: 'finalize-head-shell', ownerCapability: 'assembly', scopeId: 'head-shell', editClass: 'finalization',
    canonicalBindings: ['finalization.head-shell'],
    realizationOperations: ['mesh-fuse', 'mesh-weld', 'internal-face-cleanup', 'mesh-optimize'],
    evidenceRefs: ['reviews/head-ready.json'],
    intent: 'Bake the closed logical head shell into one reopenable physical mesh.',
  });
  const meshes = new Map([
    ['head-shell', cube(-1, 0)],
    ['face', cube(0, 1)],
    ['nose', cube(1, 2)],
  ]);
  const frame = I();
  const members = [...meshes.entries()].map(([memberId, mesh]) => ({
    memberId,
    geometryDigest: physicalFusionGeometryDigest(mesh),
    frameDigest: physicalFusionFrameDigest(frame),
    materialRegionId: 'skin',
    evidenceRefs: [`model/${memberId}-geometry.json`],
  }));
  const plan = createPhysicalFusionPlan({
    attachmentSemantics, logicalFusion, canonicalEditIntent,
    id: 'head-shell-physical-bake', groupId: 'fusion-head-shell',
    inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: frame, members, strategy: 'WELD_SHARED_BOUNDARY', weldTolerance: 1e-8,
    topologyObligation: 'watertight', evidenceRefs: ['reviews/head-finalization.json'],
  });
  const realizedMembers = [...meshes.entries()].map(([memberId, mesh]) => ({memberId, mesh, worldFrame: frame}));
  return {attachmentSemantics, logicalFusion, canonicalEditIntent, meshes, plan, realizedMembers};
}

test('shared-boundary bake produces one connected watertight physical mesh and removes internal interfaces', () => {
  const f = fixture();
  assert.equal(validatePhysicalFusionPlan(f.plan, f).valid, true);
  const result = bakePhysicalFusion({
    ...f, plan: f.plan,
    currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b'),
    evidenceRefs: ['reviews/head-bake-result.json'],
  });
  assert.equal(result.report.status, 'BAKED');
  assert.equal(result.report.topology.pass, true);
  assert.equal(result.report.topology.watertight, true);
  assert.equal(result.report.topology.connectedComponents, 1);
  assert.equal(result.report.metrics.inputTriangles, 36);
  assert.equal(result.report.metrics.outputTriangles, 28);
  assert.equal(result.report.metrics.internalInterfaceFacePairsRemoved, 4);
  assert.equal(result.provenance.sourceMemberIds.includes('glasses'), false);
  assert.deepEqual(result.provenance.sourceMemberIds, ['face', 'head-shell', 'nose']);
  assert.equal(result.provenance.outputFaces.length, 28);

  const glb = partsToGlb({
    assetId: 'physical-head-shell',
    name: 'Physical Head Shell',
    parts: [{id: 'head-shell-fused', mesh: result.mesh, materialId: 'skin', role: 'physical-fusion-output', scopeId: 'head-shell'}],
    materials: {skin: {baseColor: [0.72, 0.58, 0.48, 1], metallic: 0, roughness: 0.55}},
    extras: {physicalFusionReportDigest: result.report.reportDigest, fusionProvenanceDigest: result.provenance.provenanceDigest},
  });
  const realized = parseGlb(glb).json;
  assert.equal(realized.meshes.length, 1);
  assert.equal(realized.nodes.length, 1);
  assert.deepEqual(realized.extras.refas.partIds, ['head-shell-fused']);
  assert.equal(realized.extras.refas.physicalFusionReportDigest, result.report.reportDigest);
  assert.equal(realized.extras.refas.fusionProvenanceDigest, result.provenance.provenanceDigest);

  assert.equal(validatePhysicalFusionResult(result, {
    ...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b'),
  }).valid, true);
});

test('non-fused dependents cannot be smuggled into a physical fusion plan', () => {
  const f = fixture();
  const members = [...f.plan.members, {
    memberId: 'glasses', geometryDigest: D('c'), frameDigest: physicalFusionFrameDigest(I()), evidenceRefs: ['model/glasses.json'],
  }];
  assert.throws(() => createPhysicalFusionPlan({
    attachmentSemantics: f.attachmentSemantics, logicalFusion: f.logicalFusion, canonicalEditIntent: f.canonicalEditIntent,
    id: 'bad-head-bake', groupId: f.plan.groupId, inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: I(), members, evidenceRefs: ['bad.json'],
  }), /not in logical fusion group/);
});

test('stale geometry, stale frame, asset, or pre-fusion semantic state fails closed before bake', () => {
  const f = fixture();
  const staleGeometry = structuredClone(f.realizedMembers);
  staleGeometry[0].mesh.positions[0][0] -= .1;
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, realizedMembers: staleGeometry, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}), /geometry digest does not match/);

  const staleFrame = structuredClone(f.realizedMembers);
  staleFrame[0].worldFrame.origin = [.1, 0, 0];
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, realizedMembers: staleFrame, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}), /frame digest does not match/);
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('c'), currentPreFusionStateDigest: D('b')}), /input asset is stale/);
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('c')}), /semantic state is stale/);
});

test('SOLID_UNION never degrades to merge or weld when no robust backend proof exists', () => {
  const f = fixture();
  const plan = createPhysicalFusionPlan({
    attachmentSemantics: f.attachmentSemantics, logicalFusion: f.logicalFusion, canonicalEditIntent: f.canonicalEditIntent,
    id: 'head-solid-union', groupId: f.plan.groupId, inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: I(), members: f.plan.members, strategy: 'SOLID_UNION', topologyObligation: 'watertight', evidenceRefs: ['reviews/solid-union.json'],
  });
  const result = bakePhysicalFusion({...f, plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  assert.equal(result.report.status, 'BLOCKED_BACKEND_REQUIRED');
  assert.equal(result.mesh, null);
  assert.equal(result.provenance, null);
  assert.match(result.report.blockingReason, /robust-solid-union/);
});

test('reopen resolves a fused semantic member to exact pre-fusion state, never to the fused mesh', () => {
  const f = fixture();
  const result = bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  const reopen = physicalFusionReopenTarget({report: result.report, provenance: result.provenance, memberId: 'nose'});
  assert.equal(reopen.checkpointId, 'checkpoint-head-semantic');
  assert.equal(reopen.stateDigest, D('b'));
  assert.equal(reopen.inputAssetSha256, D('a'));
  assert.equal(reopen.canonicalSource, 'pre-fusion-semantic-state');
  assert.equal(reopen.fusedOutputMustBeDiscardedBeforeEdit, true);
  assert.throws(() => physicalFusionReopenTarget({report: result.report, provenance: result.provenance, memberId: 'glasses'}), /not part of the physical fusion provenance/);
});

test('plan and baked result are digest-bound and tamper detectable', () => {
  const f = fixture();
  const badPlan = structuredClone(f.plan); badPlan.weldTolerance = 9;
  assert.equal(validatePhysicalFusionPlan(badPlan, f).valid, false);
  const result = bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  const tampered = structuredClone(result); tampered.provenance.outputFaces[0].sourceMemberIds = ['glasses'];
  assert.equal(validatePhysicalFusionResult(tampered, {...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}).valid, false);
});



/** Re-encode every actual indexed triangle geometry accessor with an entirely
 * sparse, implicit-zero base, without changing the decoded physical mesh.
 * The native fusion gate must independently replay these actual GLB BIN bytes.
 */
function fullySparseGeometry(glb,{deform=false,invalidSparseOrder=false}={}){
 const original=parseGlb(glb),json=structuredClone(original.json);
 const parts=[Buffer.from(original.binary)],view=json.bufferViews;
 let length=original.binary.length;
 const align=(n)=>{const padding=(n-length%4)%4;if(padding){parts.push(Buffer.alloc(padding));length+=padding;}};
 const push=(value)=>{align();const bytes=Buffer.from(value);const index=view.length;view.push({
  buffer:0,byteOffset:length,byteLength:bytes.length,
 });parts.push(bytes);length+=bytes.length;return index;};
 let changed=false,spoiled=false;
 for(const mesh of json.meshes??[]){
  for(const primitive of mesh.primitives??[]){
   for(const [index,position] of [[primitive.attributes?.POSITION,true],[primitive.indices,false]]){
    if(index==null)throw Error('fixture requires indexed triangles');
    const acc=json.accessors[index];
    const {json:sourceJson,binary:sourceBinary}=original;
    const decoded=readQaGeometryAccessor(sourceJson,sourceBinary,index,{position});
    if(acc.count>255)throw Error('fixture exceeds byte sparse-index range');
    const indices=Uint8Array.from(Array.from({length:acc.count},(_,i)=>i));
    if(invalidSparseOrder&&!spoiled){indices[0]=1;spoiled=true;}
    let values;
    if(position){
     if(deform&&!changed){decoded[0][0]+=0.25;changed=true;}
     values=Buffer.from(new Float32Array(decoded.flat()).buffer);
    }else{
     const type=acc.componentType;
     const typed=type===5125?new Uint32Array(decoded):
      type===5123?new Uint16Array(decoded):new Uint8Array(decoded);
     values=Buffer.from(typed.buffer);
    }
    const indexView=push(indices),valueView=push(values);
    delete acc.bufferView;delete acc.byteOffset;
    acc.sparse={count:acc.count,
      indices:{bufferView:indexView,componentType:5121},
      values:{bufferView:valueView}};
   }
  }
 }
 json.buffers[0].byteLength=length;
 const raw=Buffer.from(JSON.stringify(json));
 const paddedJson=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]);
 const all=Buffer.concat(parts),bin=Buffer.concat([all,Buffer.alloc((4-all.length%4)%4)]);
 const output=Buffer.alloc(12+8+paddedJson.length+8+bin.length);
 output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);
 output.writeUInt32LE(output.length,8);
 output.writeUInt32LE(paddedJson.length,12);output.writeUInt32LE(0x4e4f534a,16);
 paddedJson.copy(output,20);
 output.writeUInt32LE(bin.length,20+paddedJson.length);
 output.writeUInt32LE(0x004e4942,24+paddedJson.length);
 bin.copy(output,28+paddedJson.length);
 return output;
}


function mutateGlbJson(glb,mutation){
 const {json,binary}=parseGlb(glb);
 const changed=structuredClone(json);
 mutation(changed);
 const raw=Buffer.from(JSON.stringify(changed)),
  padded=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]);
 const bin=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
 const out=Buffer.alloc(12+8+padded.length+8+bin.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);
 out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);
 padded.copy(out,20);
 out.writeUInt32LE(bin.length,20+padded.length);
 out.writeUInt32LE(0x004e4942,24+padded.length);
 bin.copy(out,28+padded.length);
 return out;
}
function splitAllNativeGlbPrimitives(glb){
 return mutateGlbJson(glb,json=>{
  for(const mesh of json.meshes){
   const original=mesh.primitives[0],acc=json.accessors[original.indices];
   assert.equal(mesh.primitives.length,1);
   const before=Math.floor(acc.count/6)*3,after=acc.count-before;
   assert.ok(before>0&&after>0&&before%3===0&&after%3===0);
   const width=acc.componentType===5125?4:acc.componentType===5123?2:1;
   const first=json.accessors.push({...acc,count:before})-1;
   const second=json.accessors.push({...acc,count:after,
    byteOffset:(acc.byteOffset??0)+before*width})-1;
   mesh.primitives=[{...original,indices:first},{...original,indices:second}];
  }
 });
}

test('QA-02n native fusion supports repeated-POSITION multi-primitives, rigid parent chains and exact output poses',()=>{
 const f=fixture(D('c'),{includeGlasses:false}),T=I([3,0,1]);
 const materials={skin:{baseColor:[0.6,0.6,0.6,1],roughness:1,metallic:0}};
 // All three physical components move under the root parent's rigid TRS.
 // Their local mesh geometry remains unchanged; the actual active-scene
 // world transform must be derived through the GLB node graph.
 const preDense=partsToGlb({
  parts:f.realizedMembers.map(member=>({
   id:member.memberId,mesh:member.mesh,materialId:'skin',
   ...(member.memberId==='head-shell'?{translation:T.origin}:{parentId:'head-shell'}),
  })),materials,
 });
 const preFusionGlb=splitAllNativeGlbPrimitives(preDense);
 const checkpointBody={schema:'refas.checkpoint/v1',parentId:null,
  capability:'assembly',scopeId:'whole',reason:'reviewed rigid multi-primitive input',
  claims:[],gates:[],metadata:{},transactionId:null,
  artifactRefs:[{kind:'glb',sha256:sha(preFusionGlb)}]};
 const checkpointDigest=digestJson(checkpointBody);
 const checkpoint={...checkpointBody,id:'cp_'+checkpointDigest.slice(0,20),
  contentDigest:checkpointDigest,createdAt:'2026-10-09T00:00:00.000Z'};
 const plan=createPhysicalFusionPlan({
  attachmentSemantics:f.attachmentSemantics,logicalFusion:f.logicalFusion,
  canonicalEditIntent:f.canonicalEditIntent,id:'native-rigid-multiprim-fusion',
  groupId:f.plan.groupId,inputAssetSha256:sha(preFusionGlb),
  preFusionCheckpointId:checkpoint.id,preFusionStateDigest:checkpoint.contentDigest,
  fusionRootFrame:T,members:f.plan.members.map(member=>({
   ...member,frameDigest:physicalFusionFrameDigest(T),
  })),
  strategy:'WELD_SHARED_BOUNDARY',weldTolerance:f.plan.weldTolerance,
  topologyObligation:f.plan.topologyObligation,
  evidenceRefs:['model/native-rigid-multiprim.json'],
 });
 const baked=bakePhysicalFusion({
  ...f,plan,
  realizedMembers:f.realizedMembers.map(member=>({...member,worldFrame:T})),
  currentInputAssetSha256:plan.inputAssetSha256,
  currentPreFusionStateDigest:plan.preFusionStateDigest,
  evidenceRefs:['reviews/native-rigid-multiprim-result.json'],
 });
 assert.equal(baked.report.status,'BAKED');
 const outputDense=partsToGlb({
  parts:[{id:plan.fusionRootId,mesh:baked.mesh,materialId:'skin',
   translation:T.origin}],materials,
  extras:{physicalFusionReportDigest:baked.report.reportDigest,
   fusionProvenanceDigest:baked.provenance.provenanceDigest},
 });
 const fusedGlb=splitAllNativeGlbPrimitives(outputDense);
 const args={sourceSha256:f.attachmentSemantics.sourceSha256,
  attachmentSemantics:f.attachmentSemantics,preFusionGlb,
  fusedGlb,preFusionCheckpoint:checkpoint,physicalEntityId:plan.fusionRootId,
  logicalFusion:f.logicalFusion,canonicalEditIntent:f.canonicalEditIntent,
  plan,report:baked.report,provenance:baked.provenance};
 const verified=replayExactGlbPhysicalFusion(args);
 assert.equal(verified.status,'PASS',verified.reason);
 // Both semantic members and final mesh must be physically present.
 const faceNode=parseGlb(preFusionGlb).json.nodes.find(n=>n.name==='face');
 assert.ok(!faceNode.translation&&faceNode.mesh!=null);
 assert.equal(replayExactGlbPhysicalFusion({
  ...args,fusedGlb:outputDense}).status,'PASS');
 const fakeTranslation=mutateGlbJson(fusedGlb,json=>{
  const n=json.nodes.find(n=>n.name==='head-shell');n.translation=[3.2,0,1];
 });
 assert.equal(replayExactGlbPhysicalFusion({...args,fusedGlb:fakeTranslation}).status,'FAIL');
 const fakeScale=mutateGlbJson(fusedGlb,json=>{
  const n=json.nodes.find(n=>n.name==='head-shell');n.scale=[2,1,1];
 });
 assert.equal(replayExactGlbPhysicalFusion({...args,fusedGlb:fakeScale}).status,'INSUFFICIENT');
 const fakeIndices=mutateGlbJson(fusedGlb,json=>{
  const primitive=json.meshes[0].primitives[1];
  primitive.indices=json.meshes[0].primitives[0].indices;
 });
 assert.equal(replayExactGlbPhysicalFusion({...args,fusedGlb:fakeIndices}).status,'FAIL');
 const invalidPrimitive=mutateGlbJson(fusedGlb,json=>{
  delete json.meshes[0].primitives[1].indices;
 });
 assert.equal(replayExactGlbPhysicalFusion({
  ...args,fusedGlb:invalidPrimitive}).status,'INSUFFICIENT');
 const staleInput=mutateGlbJson(preFusionGlb,json=>{
  json.nodes.find(n=>n.name==='head-shell').translation=[3.5,0,1];
 });
 assert.equal(replayExactGlbPhysicalFusion({...args,preFusionGlb:staleInput}).status,'FAIL');
 const contactPlan=createRealizedContactPlan({
  attachmentSemantics:f.attachmentSemantics,id:'rigid-multiprim-contact',
  assetSha256:sha(fusedGlb),supportRoots:[plan.fusionRootId],
  fusionBindings:[{
   physicalEntityId:plan.fusionRootId,
   semanticMemberIds:['head-shell','face','nose'],
   fusionReportDigest:baked.report.reportDigest,
   provenanceDigest:baked.provenance.provenanceDigest,
   evidenceRefs:['review/native-physical-members.json'],
  }],evidenceRefs:['review/actual-multiprim-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({
  plan:contactPlan,attachmentSemantics:f.attachmentSemantics,
  glb:fusedGlb,fusionArtifacts:[{report:baked.report,provenance:baked.provenance}],
 });
 assert.equal(report.status,'PASS');
 const independent=replayRealizedContactEvidence({
  glb:fusedGlb,sourceSha256:f.attachmentSemantics.sourceSha256,
  attachmentSemantics:f.attachmentSemantics,plan:contactPlan,
  graph,report,fusionReplayInputs:[args],
 });
 assert.equal(independent.status,'PASS',independent.reason);
});
test('QA-02m native fusion is replayable from sparse-only original and final GLB byte geometries',()=>{
 const f=fixture(D('e'),{includeGlasses:false});
 const mat={skin:{baseColor:[.6,.6,.6,1],metallic:0,roughness:1}};
 const preDense=partsToGlb({
  parts:f.realizedMembers.map(member=>({id:member.memberId,
   mesh:member.mesh,materialId:'skin'})),materials:mat,
 });
 const preFusionGlb=fullySparseGeometry(preDense);
 assert.notEqual(sha(preDense),sha(preFusionGlb));
 const preJson=parseGlb(preFusionGlb).json;
 for(const mesh of preJson.meshes){
  for(const primitive of mesh.primitives){
   for(const index of [primitive.attributes.POSITION,primitive.indices]){
    assert.ok(preJson.accessors[index].sparse);
    assert.equal(preJson.accessors[index].bufferView,undefined);
   }
  }
 }
 const checkpointBody={schema:'refas.checkpoint/v1',parentId:null,capability:'assembly',
  scopeId:'whole',reason:'trusted registered original sparse GLB',claims:[],
  gates:[],metadata:{},transactionId:null,
  artifactRefs:[{kind:'glb',sha256:sha(preFusionGlb)}]};
 const checkpointDigest=digestJson(checkpointBody),checkpoint={
  ...checkpointBody,id:'cp_'+checkpointDigest.slice(0,20),
  contentDigest:checkpointDigest,createdAt:'2026-10-09T00:00:00.000Z',
 };
 const plan=createPhysicalFusionPlan({
  attachmentSemantics:f.attachmentSemantics,logicalFusion:f.logicalFusion,
  canonicalEditIntent:f.canonicalEditIntent,id:'sparse-native-head-bake',
  groupId:f.plan.groupId,inputAssetSha256:sha(preFusionGlb),
  preFusionCheckpointId:checkpoint.id,preFusionStateDigest:checkpoint.contentDigest,
  fusionRootFrame:I(),members:f.plan.members,
  strategy:'WELD_SHARED_BOUNDARY',weldTolerance:f.plan.weldTolerance,
  topologyObligation:f.plan.topologyObligation,
  evidenceRefs:['model/sparse-native-fusion.json'],
 });
 const result=bakePhysicalFusion({...f,plan,
  currentInputAssetSha256:plan.inputAssetSha256,
  currentPreFusionStateDigest:plan.preFusionStateDigest,
  evidenceRefs:['review/sparse-fusion-result.json']});
 assert.equal(result.report.status,'BAKED');
 const fusedDense=partsToGlb({parts:[{id:plan.fusionRootId,mesh:result.mesh,materialId:'skin'}],
  materials:mat,extras:{physicalFusionReportDigest:result.report.reportDigest,
   fusionProvenanceDigest:result.provenance.provenanceDigest}});
 const fusedGlb=fullySparseGeometry(fusedDense);
 assert.notEqual(sha(fusedDense),sha(fusedGlb));
 const args={sourceSha256:f.attachmentSemantics.sourceSha256,
  attachmentSemantics:f.attachmentSemantics,preFusionGlb,fusedGlb,
  preFusionCheckpoint:checkpoint,physicalEntityId:plan.fusionRootId,
  logicalFusion:f.logicalFusion,canonicalEditIntent:f.canonicalEditIntent,
  plan,report:result.report,provenance:result.provenance};
 const proof=replayExactGlbPhysicalFusion(args);
 assert.equal(proof.status,'PASS',proof.reason);
 assert.equal(replayExactGlbPhysicalFusion({...args,fusedGlb:fusedDense}).status,'PASS');
 assert.equal(replayExactGlbPhysicalFusion({...args,
  fusedGlb:fullySparseGeometry(fusedDense,{deform:true})}).status,'FAIL');
 assert.equal(replayExactGlbPhysicalFusion({...args,
  fusedGlb:fullySparseGeometry(fusedDense,{invalidSparseOrder:true})}).status,'FAIL');
 assert.equal(replayExactGlbPhysicalFusion({...args,preFusionGlb:preDense}).status,'FAIL');
 const contactPlan=createRealizedContactPlan({
  attachmentSemantics:f.attachmentSemantics,id:'sparse-baked-head-contact',
  assetSha256:sha(fusedGlb),supportRoots:[plan.fusionRootId],
  fusionBindings:[{physicalEntityId:plan.fusionRootId,
   semanticMemberIds:['head-shell','face','nose'],
   fusionReportDigest:result.report.reportDigest,
   provenanceDigest:result.provenance.provenanceDigest,
   evidenceRefs:['review/sparse-fused-members.json']}],
  evidenceRefs:['review/sparse-fusion-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({plan:contactPlan,
  attachmentSemantics:f.attachmentSemantics,glb:fusedGlb,
  fusionArtifacts:[{report:result.report,provenance:result.provenance}]});
 assert.equal(report.status,'PASS');
 const replay=replayRealizedContactEvidence({
  glb:fusedGlb,sourceSha256:f.attachmentSemantics.sourceSha256,
  attachmentSemantics:f.attachmentSemantics,
  plan:contactPlan,graph,report,
  fusionReplayInputs:[{...args}],
 });
 assert.equal(replay.status,'PASS',replay.reason);
});

test('QA-02e native fused mesh replay independently requires exact original and final GLB bytes',()=>{
 const baseline=fixture();
 const preFusionGlb=partsToGlb({parts:baseline.realizedMembers.map(member=>({
   id:member.memberId,mesh:member.mesh,materialId:'skin',
 })),materials:{skin:{baseColor:[0.6,0.6,0.6,1],roughness:1,metallic:0}}});
 const sourceSha256=baseline.attachmentSemantics.sourceSha256;
 const checkpointBody={schema:'refas.checkpoint/v1',parentId:null,capability:'assembly',
   scopeId:'whole',reason:'persisted original native fusion input',claims:[],gates:[],metadata:{},
   transactionId:null,artifactRefs:[{kind:'glb',sha256:sha(preFusionGlb)}]};
 const digest=digestJson(checkpointBody),checkpoint={
   ...checkpointBody,id:'cp_'+digest.slice(0,20),contentDigest:digest,createdAt:'2026-10-09T00:00:00.000Z',
 };
 const plan=createPhysicalFusionPlan({
   attachmentSemantics:baseline.attachmentSemantics,logicalFusion:baseline.logicalFusion,
   canonicalEditIntent:baseline.canonicalEditIntent,id:'head-native-fusion-check',
   groupId:baseline.plan.groupId,inputAssetSha256:sha(preFusionGlb),
   preFusionCheckpointId:checkpoint.id,preFusionStateDigest:checkpoint.contentDigest,
   fusionRootFrame:I(),members:baseline.plan.members,
   strategy:'WELD_SHARED_BOUNDARY',weldTolerance:baseline.plan.weldTolerance,
   topologyObligation:baseline.plan.topologyObligation,
   evidenceRefs:['model/native-fusion-check.json'],
 });
 const result=bakePhysicalFusion({
   ...baseline,plan,
   currentInputAssetSha256:plan.inputAssetSha256,
   currentPreFusionStateDigest:plan.preFusionStateDigest,
   evidenceRefs:['reviews/native-result.json'],
 });
 assert.equal(result.report.status,'BAKED');
 const fusedGlb=partsToGlb({parts:[{id:plan.fusionRootId,mesh:result.mesh,materialId:'skin'}],
   materials:{skin:{baseColor:[0.6,0.6,0.6,1],roughness:1,metallic:0}},
   extras:{physicalFusionReportDigest:result.report.reportDigest,
     fusionProvenanceDigest:result.provenance.provenanceDigest}});
 const args={sourceSha256,attachmentSemantics:baseline.attachmentSemantics,preFusionGlb,
   fusedGlb,preFusionCheckpoint:checkpoint,physicalEntityId:plan.fusionRootId,
   logicalFusion:baseline.logicalFusion,canonicalEditIntent:baseline.canonicalEditIntent,
   plan,report:result.report,provenance:result.provenance};
 assert.equal(replayExactGlbPhysicalFusion(args).status,'PASS');
 const wrong=partsToGlb({parts:[{id:plan.fusionRootId,mesh:cube(-1,1),materialId:'skin'}],
   materials:{skin:{baseColor:[0.6,0.6,0.6,1],roughness:1,metallic:0}},
   extras:{physicalFusionReportDigest:result.report.reportDigest,
     fusionProvenanceDigest:result.provenance.provenanceDigest}});
 assert.equal(replayExactGlbPhysicalFusion({...args,fusedGlb:wrong}).status,'FAIL');
 assert.equal(replayExactGlbPhysicalFusion({...args,preFusionGlb:fusedGlb}).status,'FAIL');
 assert.equal(replayExactGlbPhysicalFusion({...args,preFusionCheckpoint:{...checkpoint,contentDigest:D('c')}}).status,'INSUFFICIENT');
});


test('QA-02e public verifier loads exact pre-fusion checkpoint and replays current fused GLB',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-native-fusion-qa-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const src=Buffer.from('separately supplied source for physical head fusion');
 const sourceSha256=sha(src),sourcePath=path.join(root,'source','ref.bin');
 await fs.mkdir(path.dirname(sourcePath),{recursive:true});
 await fs.writeFile(sourcePath,src);
 await initProject(root,{projectId:'native-fusion-source-qa',source:{
   schema:'refas.source-manifest/v1',id:'primary',path:'source/ref.bin',
   sha256:sourceSha256,sizeBytes:src.length,width:64,height:64,
   authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const f=fixture(sourceSha256,{includeGlasses:false});
 const material={skin:{baseColor:[0.7,0.7,0.7,1],roughness:1,metallic:0}};
 const preFusionGlb=partsToGlb({parts:f.realizedMembers.map(m=>({
   id:m.memberId,mesh:m.mesh,materialId:'skin',
 })),materials:material});
 const files=path.join(root,'model');await fs.mkdir(files,{recursive:true});
 const beforePath=path.join(files,'original.glb');
 await fs.writeFile(beforePath,preFusionGlb);
 const beforeRef=await contentReference(beforePath,{kind:'glb',root});
 const checkpoint=await commitCheckpoint(root,{
   capability:'source-intake',scopeId:'whole',
   reason:'trusted primary source and original candidate attached before fusion',
   artifactRefs:[beforeRef],claims:['source and original candidate recorded'],
   gates:[{id:'source-intake-gate',evidenceRefs:[beforeRef.path]}],
 });
 const plan=createPhysicalFusionPlan({
   attachmentSemantics:f.attachmentSemantics,logicalFusion:f.logicalFusion,
   canonicalEditIntent:f.canonicalEditIntent,id:'checkpoint-bound-head-native-fusion',
   groupId:f.plan.groupId,inputAssetSha256:sha(preFusionGlb),
   preFusionCheckpointId:checkpoint.id,preFusionStateDigest:checkpoint.contentDigest,
   fusionRootFrame:I(),members:f.plan.members,
   strategy:'WELD_SHARED_BOUNDARY',weldTolerance:f.plan.weldTolerance,
   topologyObligation:f.plan.topologyObligation,
   evidenceRefs:['model/native-plan.json'],
 });
 const bake=bakePhysicalFusion({...f,plan,
   currentInputAssetSha256:plan.inputAssetSha256,
   currentPreFusionStateDigest:plan.preFusionStateDigest,
   evidenceRefs:['model/native-result.json']});
 assert.equal(bake.report.status,'BAKED');
 const fusedGlb=partsToGlb({parts:[{id:plan.fusionRootId,mesh:bake.mesh,materialId:'skin'}],
   materials:material,extras:{physicalFusionReportDigest:bake.report.reportDigest,
     fusionProvenanceDigest:bake.provenance.provenanceDigest}});
 const fusionReplayInputs=[{preFusionGlb,preFusionCheckpoint:checkpoint,plan,
   logicalFusion:f.logicalFusion,canonicalEditIntent:f.canonicalEditIntent,
   report:bake.report,provenance:bake.provenance,physicalEntityId:plan.fusionRootId}];
 const contactPlan=createRealizedContactPlan({
   attachmentSemantics:f.attachmentSemantics,id:'fused-head-contact',
   assetSha256:sha(fusedGlb),supportRoots:['head-shell'],
   fusionBindings:[{
     physicalEntityId:'head-shell',semanticMemberIds:['head-shell','face','nose'],
     fusionReportDigest:bake.report.reportDigest,provenanceDigest:bake.provenance.provenanceDigest,
     evidenceRefs:['model/native-plan.json'],
   }],evidenceRefs:['model/contact-plan.json'],
 });
 const {graph,report}=analyzeRealizedContact({
   plan:contactPlan,attachmentSemantics:f.attachmentSemantics,
   glb:fusedGlb,fusionArtifacts:[{report:bake.report,provenance:bake.provenance}],
 });
 assert.equal(report.status,'PASS');
 assert.equal(replayRealizedContactEvidence({
   glb:fusedGlb,sourceSha256,attachmentSemantics:f.attachmentSemantics,
   plan:contactPlan,graph,report,fusionReplayInputs,
 }).status,'PASS');
 assert.equal(replayRealizedContactEvidence({
   glb:fusedGlb,sourceSha256,attachmentSemantics:f.attachmentSemantics,
   plan:contactPlan,graph,report,
   fusionArtifacts:[{report:bake.report,provenance:bake.provenance}],
 }).status,'INSUFFICIENT'); // self-signed fusion report alone cannot pass

 const assetPath=path.join(files,'fused.glb');await fs.writeFile(assetPath,fusedGlb);
 const entries=[
   ['attachment-semantics',f.attachmentSemantics],
   ['realized-contact-plan',contactPlan],['realized-contact-graph',graph],
   ['realized-contact-report',report],['logical-fusion',f.logicalFusion],
   ['canonical-edit-intent',f.canonicalEditIntent],
   ['physical-fusion-plan',plan],['physical-fusion-report',bake.report],
   ['fusion-provenance',bake.provenance],
 ];
 const refs=[await contentReference(assetPath,{kind:'glb',root}),
   await contentReference(beforePath,{kind:'pre-fusion-glb',root})];
 for(const [kind,value]of entries){
   const file=path.join(files,kind+'.json');await fs.writeFile(file,JSON.stringify(value));
   refs.push(await contentReference(file,{kind,root}));
 }
 await commitCheckpoint(root,{capability:'source-intake',scopeId:'whole',
   reason:'post-fusion original plus independently bound GLB QA artifacts',
   artifactRefs:refs,claims:['actual candidate under QA replay'],
   gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}],
 });
 const qa=await verifySourceBoundObject(root,assetPath);
 assert.equal(qa.checks.find(x=>x.id==='realized-contact-support').status,'PASS');
 assert.equal(qa.decision.state,'BLOCKED'); // not an independent resemblance certificate

 // QA-02j: the same native physical bake now also needs to realize every
 // semantic FUSED world frame when a propagation plan/report is supplied.
 const stateDigest=D('7'),frame=I(),frameDigest=physicalFusionFrameDigest(frame);
 const propagationPlan=createAttachmentPropagationPlan({
   attachmentSemantics:f.attachmentSemantics,id:'fused-physical-frame-plan',
   externalFrameBindings:[
     {entityId:'head-shell',stateDigest,frameDigest:rigidFrameDigest(frame),
       ownerFrameDigests:[],evidenceRefs:['review/head-pose.json']},
     ...['face','nose'].map((entityId,index)=>({
       entityId,stateDigest:D(String(index+8)),frameDigest:rigidFrameDigest(frame),
       ownerFrameDigests:[{ownerId:'head-shell',frameDigest:rigidFrameDigest(frame)}],
       evidenceRefs:['review/'+entityId+'-pose.json'],
     })),
   ],evidenceRefs:['review/fused-propagation-plan.json'],
 });
 const propagationReport=propagateAttachmentGraph({
   plan:propagationPlan,attachmentSemantics:f.attachmentSemantics,
   initialWorldFrames:[
     {entityId:'head-shell',stateDigest,frame},
     {entityId:'face',stateDigest:D('8'),frame},
     {entityId:'nose',stateDigest:D('9'),frame},
   ],evidenceRefs:['review/fused-propagation-report.json'],
 });
 assert.equal(propagationReport.status,'READY_FOR_REALIZATION');
 const fusedPosePlan=createRealizedContactPlan({
   attachmentSemantics:f.attachmentSemantics,id:'fused-pose-contact',
   assetSha256:sha(fusedGlb),supportRoots:['head-shell'],
   fusionBindings:contactPlan.fusionBindings,
   propagationReportDigest:propagationReport.reportDigest,
   evidenceRefs:['review/fused-pose-contact.json'],
 });
 const posed=analyzeRealizedContact({plan:fusedPosePlan,
   attachmentSemantics:f.attachmentSemantics,glb:fusedGlb,propagationReport,
   fusionArtifacts:[{report:bake.report,provenance:bake.provenance}]});
 assert.equal(posed.report.status,'PASS');
 const full={glb:fusedGlb,sourceSha256,attachmentSemantics:f.attachmentSemantics,
   plan:fusedPosePlan,graph:posed.graph,report:posed.report,
   propagationPlan,propagationReport,fusionReplayInputs};
 const proven=replayRealizedContactEvidence(full);
 assert.equal(proven.status,'PASS',proven.reason+': '+proven.details.join('; '));
 const aliasArgs={fusionBindings:fusedPosePlan.fusionBindings,fusionReplayInputs,
   sourceSha256,attachmentSemantics:f.attachmentSemantics};
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,propagationReport).status,'INSUFFICIENT');
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,propagationReport,aliasArgs).status,'PASS');
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,propagationReport,{
   ...aliasArgs,fusionReplayInputs:[],
 }).status,'INSUFFICIENT');
 const incomplete=[{...fusedPosePlan.fusionBindings[0],semanticMemberIds:['head-shell','face']}];
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,propagationReport,{
   ...aliasArgs,fusionBindings:incomplete,
 }).status,'FAIL');
 const forgedWorldFrame=structuredClone(propagationReport);
 forgedWorldFrame.entityResults.find(entry=>entry.entityId==='nose').worldFrame.origin=[5,0,0];
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,forgedWorldFrame,aliasArgs).status,'INSUFFICIENT');
 const fakeProof=structuredClone(fusionReplayInputs);
 fakeProof[0].provenance.provenanceDigest=D('e');
 assert.equal(verifyRealizedPropagationWorldFrames(fusedGlb,propagationReport,{
   ...aliasArgs,fusionReplayInputs:fakeProof,
 }).status,'FAIL');

 await fs.writeFile(path.join(files,'fusion-provenance.json'),JSON.stringify({...bake.provenance,outputFaces:[]}));
 const mutated=await verifySourceBoundObject(root,assetPath);
 assert.equal(mutated.checks.find(x=>x.id==='realized-contact-support').status,'FAIL');
});

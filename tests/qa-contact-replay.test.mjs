import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  analyzeRealizedContact,
  createAttachmentSemantics,
  createRealizedContactPlan,
  partsToGlb,
  replayRealizedContactEvidence,
  initProject,
  commitCheckpoint,
  contentReference,
  loadProject,
  verifySourceBoundObject,
  inventoryGlbTriangleComponents,
  parseGlb,
  createAttachmentPropagationPlan,
  propagateAttachmentGraph,
  rigidFrameDigest,
} from '../skills/refas/scripts/lib/index.mjs';

const D=(c)=>c.repeat(64);
const sha=(v)=>createHash('sha256').update(Buffer.from(v)).digest('hex');
const E=(id)=>({id,scopeId:id,evidenceRefs:['review/'+id+'.json']});
const R=(id,mode,subjectId,ownerIds=[])=>({
 id,mode,subjectId,ownerIds,basis:'construction',evidenceRefs:['review/'+id+'.json'],
});
function box(id,z0,z1) {
 return {id,materialId:'solid',mesh:{
  positions:[[0,0,z0],[1,0,z0],[1,1,z0],[0,1,z0],[0,0,z1],[1,0,z1],[1,1,z1],[0,1,z1]],
  indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,7,3,0,4,7,1,2,6,1,6,5],
 }};
}
function fixture({gap=0,includeExtra=false,sourceSha256=D('a')}={}) {
 const entities=[E('base'),E('leg'),...(includeExtra?[E('extra')]:[])];
 const relations=[R('base-free','FREE','base'),R('leg-follow','RIGID_FOLLOW','leg',['base']),...(includeExtra?[R('extra-free','FREE','extra')]:[])];
 const attachmentSemantics=createAttachmentSemantics({scopeId:'qa-support',sourceSha256,entities,relations});
 const glb=partsToGlb({assetId:'qa-contact',parts:[box('base',0,0.2),box('leg',0.2+gap,1.2+gap),...(includeExtra?[box('extra',3,4)]:[])],
   materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 const plan=createRealizedContactPlan({
  attachmentSemantics,id:'contact-qa',assetSha256:sha(glb),
  supportRoots:['base'],supportRequiredEntityIds:['leg'],
  pairExpectations:[{id:'base-leg-support',kind:'SUPPORT',subjectId:'leg',ownerId:'base',maxGap:1e-6,maxPenetration:1e-7,minContactArea:0.5,evidenceRefs:['review/support.json']}],
  contactTolerance:0.002,penetrationTolerance:1e-7,evidenceRefs:['review/contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({plan,attachmentSemantics,glb});
 return {glb,sourceSha256,attachmentSemantics,plan,graph,report};
}

test('QA-02 recomputes actual touching triangles and support path before PASS',()=>{
 const f=fixture();
 assert.equal(f.report.status,'PASS');
 const r=replayRealizedContactEvidence(f);
 assert.equal(r.status,'PASS',r.reason+' '+r.details);
});

test('a report with a disconnected support cannot be promoted by self-PASS',()=>{
 const f=fixture({gap:0.1});
 assert.equal(f.report.status,'BLOCKED');
 const r=replayRealizedContactEvidence(f);
 assert.equal(r.status,'FAIL',r.reason);
 const fake={...f,report:{...f.report,status:'PASS',blockers:[]}};
 assert.equal(replayRealizedContactEvidence(fake).status,'FAIL');
});

test('changing the actual GLB candidate fails even when the old support report is PASS',()=>{
 const f=fixture();
 const changed=fixture({gap:0.1}).glb;
 assert.equal(replayRealizedContactEvidence({...f,glb:changed}).status,'FAIL');
});

test('a physical part omitted from the support obligation inventory cannot pass',()=>{
 const f=fixture({includeExtra:true});
 assert.equal(f.report.status,'PASS');
 const r=replayRealizedContactEvidence(f);
 assert.equal(r.status,'INSUFFICIENT');
 assert.ok(r.details.some(s=>s.includes('missing-support-classification:extra')));
});

test('mutated source authority or missing plan cannot pass',()=>{
 const f=fixture();
 assert.equal(replayRealizedContactEvidence({...f,sourceSha256:D('b')}).status,'FAIL');
 assert.equal(replayRealizedContactEvidence({...f,plan:null}).status,'NOT_RUN');
});

test('source-bound public QA independently loads and replays four exact checkpoint artifacts',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-contact-bound-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from('independent source bytes for typed geometric replay');
 const sourceSha256=sha(bytes),sourcePath=path.join(root,'source','reference.bin');
 await fs.mkdir(path.dirname(sourcePath),{recursive:true});
 await fs.writeFile(sourcePath,bytes);
 await initProject(root,{projectId:'qa-contact-bound',source:{
  schema:'refas.source-manifest/v1',id:'primary-reference',
  path:'source/reference.bin',sha256:sourceSha256,sizeBytes:bytes.length,
  width:80,height:60,authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const f=fixture({sourceSha256});
 const model=path.join(root,'model');
 await fs.mkdir(model,{recursive:true});
 const asset=path.join(model,'candidate.glb');
 await fs.writeFile(asset,f.glb);
 const names=[
  ['attachment-semantics',f.attachmentSemantics],
  ['realized-contact-plan',f.plan],
  ['realized-contact-graph',f.graph],
  ['realized-contact-report',f.report],
 ];
 const refs=[await contentReference(asset,{kind:'glb',root})];
 for(const [kind,value] of names){
  const target=path.join(model,kind+'.json');
  await fs.writeFile(target,JSON.stringify(value));
  refs.push(await contentReference(target,{kind,root}));
 }
 await commitCheckpoint(root,{
  capability:'source-intake',scopeId:'whole',reason:'Source-bound QA evidence fixture',
  artifactRefs:refs,claims:['Source attached and candidate assembled for downstream critique'],
  gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}],
 });
 const before=JSON.stringify(await loadProject(root));
 const report=await verifySourceBoundObject(root,asset);
 assert.equal(report.checks.find((c)=>c.id==='realized-contact-support').status,'PASS');
 assert.equal(report.decision.state,'BLOCKED'); // No final certification or visual proof.
 assert.equal(JSON.stringify(await loadProject(root)),before); // Read-only replay.
 await fs.writeFile(path.join(model,'realized-contact-report.json'),JSON.stringify({...f.report,status:'PASS',reportDigest:D('f')}));
 const drift=await verifySourceBoundObject(root,asset);
 assert.equal(drift.checks.find((c)=>c.id==='realized-contact-support').status,'FAIL');
 assert.equal(drift.decision.state,'BLOCKED');
});

test('index-edge component inventory distinguishes connected and split GLB nodes without a physics verdict',()=>{
 const f=fixture();
 const whole=inventoryGlbTriangleComponents(f.glb);
 assert.equal(whole.metrics.meshNodes,2);
 assert.equal(whole.metrics.componentCount,2);
 assert.equal(whole.metrics.splitMeshNodes,0);
 assert.equal(whole.inventoryDigest,inventoryGlbTriangleComponents(f.glb).inventoryDigest);
});

test('grafted disconnected islands inside ONE declared physical node remain INSUFFICIENT, not falsely PASS or automatically FAIL',()=>{
 const sourceSha256=D('a');
 const attachmentSemantics=createAttachmentSemantics({
   scopeId:'qa-support',sourceSha256,entities:[E('base')],relations:[R('base-free','FREE','base')],
 });
 const first=box('base',0,0.2).mesh, second=box('base',4,4.2).mesh;
 const mesh={positions:[...first.positions,...second.positions],
   indices:[...first.indices,...second.indices.map(index=>index+first.positions.length)]};
 const glb=partsToGlb({parts:[{id:'base',materialId:'solid',mesh}],
   materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 const inventory=inventoryGlbTriangleComponents(glb);
 assert.equal(inventory.metrics.meshNodes,1);
 assert.equal(inventory.nodes[0].componentCount,2);
 assert.deepEqual(inventory.nodes[0].primitives[0].triangleCounts,[12,12]);
 const plan=createRealizedContactPlan({attachmentSemantics,id:'split-node-contact',
   assetSha256:sha(glb),supportRoots:['base'],supportRequiredEntityIds:[],
   pairExpectations:[],evidenceRefs:['review/assembly.json']});
 const {graph,report}=analyzeRealizedContact({plan,attachmentSemantics,glb});
 assert.equal(report.status,'PASS'); // Existing node-level support report cannot see internal disconnection.
 const replay=replayRealizedContactEvidence({glb,sourceSha256,attachmentSemantics,plan,graph,report});
 assert.equal(replay.status,'INSUFFICIENT');
 assert.ok(replay.details.some(line=>line==='unreviewed-triangle-islands:base:2'));
});

test('intrinsic index-edge inventory rejects malformed index buffers instead of yielding an empty-pass',()=>{
 const f=fixture();
 const bad=Buffer.from(f.glb);
 const {json}=parseGlb(bad);
 const primitive=json.meshes[0].primitives[0];
 const accessor=json.accessors[primitive.indices];
 const view=json.bufferViews[accessor.bufferView];
 const indexOffset=20+bad.readUInt32LE(12)+8+(view.byteOffset??0)+(accessor.byteOffset??0);
 const invalidVertexIndex=json.accessors[primitive.attributes.POSITION].count+20;
 if(accessor.componentType===5125)bad.writeUInt32LE(invalidVertexIndex,indexOffset);
 else if(accessor.componentType===5123)bad.writeUInt16LE(invalidVertexIndex,indexOffset);
 else if(accessor.componentType===5121)bad.writeUInt8(invalidVertexIndex,indexOffset);
 else throw new Error('unsupported fixture index type');
 assert.throws(()=>inventoryGlbTriangleComponents(bad),/triangle index exceeds POSITION count/u);
 assert.notEqual(inventoryGlbTriangleComponents(f.glb).assetSha256,sha(bad));
});

function freePropagationFixture(){
 const sourceSha256=D('a');
 const attachmentSemantics=createAttachmentSemantics({
   scopeId:'qa-propagation-root',sourceSha256,
   entities:[E('base')],relations:[R('base-free','FREE','base')],
 });
 const frame={origin:[0,0,0],xAxis:[1,0,0],yAxis:[0,1,0],zAxis:[0,0,1]};
 const stateDigest=D('1');
 const propagationPlan=createAttachmentPropagationPlan({
   attachmentSemantics,id:'qa-propagation-plan',
   externalFrameBindings:[{entityId:'base',stateDigest,frameDigest:rigidFrameDigest(frame),
     ownerFrameDigests:[],evidenceRefs:['review/root-frame.json']}],
   evidenceRefs:['review/propagation-plan.json'],
 });
 const propagationReport=propagateAttachmentGraph({
   plan:propagationPlan,attachmentSemantics,
   initialWorldFrames:[{entityId:'base',stateDigest,frame}],
   evidenceRefs:['review/propagation-report.json'],
 });
 const glb=partsToGlb({parts:[box('base',0,1)],
   materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 const plan=createRealizedContactPlan({
   attachmentSemantics,id:'qa-propagated-root',assetSha256:sha(glb),
   propagationReportDigest:propagationReport.reportDigest,
   supportRoots:['base'],evidenceRefs:['review/root-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({
   plan,attachmentSemantics,glb,propagationReport,
 });
 return {sourceSha256,glb,attachmentSemantics,plan,graph,report,propagationPlan,propagationReport};
}

test('QA-02c recomputes saved FREE-root propagation rather than trusting a signed report',()=>{
 const f=freePropagationFixture();
 assert.equal(f.propagationReport.status,'READY_FOR_REALIZATION');
 assert.equal(f.report.status,'PASS');
 assert.equal(replayRealizedContactEvidence(f).status,'PASS');
 assert.equal(replayRealizedContactEvidence({...f,propagationPlan:null}).status,'NOT_RUN');
 const forged={...f,propagationReport:{...f.propagationReport,eligibleForRealization:false}};
 assert.equal(replayRealizedContactEvidence(forged).status,'FAIL');
 const mismatchedPlan={...f,propagationPlan:{...f.propagationPlan,externalFrameBindings:[]}};
 assert.equal(replayRealizedContactEvidence(mismatchedPlan).status,'FAIL');
});

test('source-bound QA reads exact persisted propagation plan+report and rejects stale bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-propagation-bound-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=Buffer.from('source for persisted propagation re-evaluation');
 const sourceSha256=sha(source);
 await fs.mkdir(path.join(root,'source'),{recursive:true});
 await fs.writeFile(path.join(root,'source','reference.bin'),source);
 await initProject(root,{projectId:'qa-propagation-bound',source:{
   schema:'refas.source-manifest/v1',id:'primary-reference',path:'source/reference.bin',
   sha256:sourceSha256,sizeBytes:source.length,width:80,height:60,
   authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const f=freePropagationFixture();
 // Propagation and contact semantics must both be attached to the project's real source.
 const semantics=createAttachmentSemantics({
   scopeId:'qa-propagation-root',sourceSha256,
   entities:[E('base')],relations:[R('base-free','FREE','base')],
 });
 const frame=f.propagationReport.initialWorldFrames[0].frame;
 const stateDigest=D('1');
 const propagationPlan=createAttachmentPropagationPlan({
   attachmentSemantics:semantics,id:'qa-propagation-plan',
   externalFrameBindings:[{entityId:'base',stateDigest,frameDigest:rigidFrameDigest(frame),
     ownerFrameDigests:[],evidenceRefs:['review/root-frame.json']}],
   evidenceRefs:['review/propagation-plan.json'],
 });
 const propagationReport=propagateAttachmentGraph({
   plan:propagationPlan,attachmentSemantics:semantics,
   initialWorldFrames:[{entityId:'base',stateDigest,frame}],
   evidenceRefs:['review/propagation-report.json'],
 });
 const plan=createRealizedContactPlan({
   attachmentSemantics:semantics,id:'qa-propagated-root',assetSha256:sha(f.glb),
   propagationReportDigest:propagationReport.reportDigest,
   supportRoots:['base'],evidenceRefs:['review/root-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({plan,attachmentSemantics:semantics,glb:f.glb,propagationReport});
 const art=path.join(root,'model');
 await fs.mkdir(art,{recursive:true});
 const asset=path.join(art,'candidate.glb');
 await fs.writeFile(asset,f.glb);
 const records=[
   ['attachment-semantics',semantics],
   ['realized-contact-plan',plan],
   ['realized-contact-graph',graph],
   ['realized-contact-report',report],
   ['attachment-propagation-plan',propagationPlan],
   ['attachment-propagation-report',propagationReport],
 ];
 const refs=[await contentReference(asset,{kind:'glb',root})];
 for(const [kind,value]of records){
   const target=path.join(art,kind+'.json');
   await fs.writeFile(target,JSON.stringify(value));
   refs.push(await contentReference(target,{kind,root}));
 }
 await commitCheckpoint(root,{capability:'source-intake',scopeId:'whole',reason:'independent propagation replay fixture',
   artifactRefs:refs,claims:['Source attached for propagation replay'],gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}]});
 const before=await verifySourceBoundObject(root,asset);
 assert.equal(before.checks.find(c=>c.id==='realized-contact-support').status,'PASS');
 assert.equal(before.decision.state,'BLOCKED'); // Never become a source-fidelity certificate.
 const target=path.join(art,'attachment-propagation-report.json');
 await fs.writeFile(target,JSON.stringify({...propagationReport,eligibleForRealization:false}));
 const after=await verifySourceBoundObject(root,asset);
 assert.equal(after.checks.find(c=>c.id==='realized-contact-support').status,'FAIL');
});

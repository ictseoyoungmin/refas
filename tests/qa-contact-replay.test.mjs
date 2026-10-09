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
  verifyRealizedPropagationWorldFrames,
  createAttachmentFollowState,
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

function packTestGlb(json,bin){
 const data=Buffer.from(bin),binPad=(4-data.length%4)%4;
 const binBytes=Buffer.concat([data,Buffer.alloc(binPad)]);
 json.buffers[0].byteLength=data.length;
 // Regenerate JSON because its buffer length is now part of the manifest.
 const encoded=Buffer.from(JSON.stringify(json)),ep=(4-encoded.length%4)%4;
 const paddedJson=Buffer.concat([encoded,Buffer.alloc(ep,0x20)]);
 const total=12+8+paddedJson.length+8+binBytes.length;
 const glb=Buffer.alloc(total);glb.writeUInt32LE(0x46546c67,0);
 glb.writeUInt32LE(2,4);glb.writeUInt32LE(total,8);
 glb.writeUInt32LE(paddedJson.length,12);glb.writeUInt32LE(0x4e4f534a,16);
 paddedJson.copy(glb,20);
 const binaryOffset=20+paddedJson.length;
 glb.writeUInt32LE(binBytes.length,binaryOffset);
 glb.writeUInt32LE(0x004e4942,binaryOffset+4);
 binBytes.copy(glb,binaryOffset+8);
 return glb;
}

function seamVariant(f,{mode='nonindexed'}={}){
 const {json:original,binary}=parseGlb(f.glb),json=structuredClone(original);
 const node=json.nodes.find(node=>node.extras?.refasPartId==='base');
 assert.ok(node);
 const primitive=json.meshes[node.mesh].primitives[0];
 const posAccessor=json.accessors[primitive.attributes.POSITION];
 const posView=json.bufferViews[posAccessor.bufferView];
 const idxAccessor=json.accessors[primitive.indices],idxView=json.bufferViews[idxAccessor.bufferView];
 const positionDv=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
 const indexDv=positionDv;
 const positions=Array.from({length:posAccessor.count},(_,index)=>Array.from({length:3},(_,axis)=>
   positionDv.getFloat32((posView.byteOffset??0)+(posAccessor.byteOffset??0)+index*12+axis*4,true)));
 const indices=Array.from({length:idxAccessor.count},(_,index)=>{
   const offset=(idxView.byteOffset??0)+(idxAccessor.byteOffset??0)+index*(idxAccessor.componentType===5125?4:2);
   return idxAccessor.componentType===5125?indexDv.getUint32(offset,true):indexDv.getUint16(offset,true);
 });
 const chunks=[Buffer.from(binary)],offset=()=>chunks.reduce((sum,b)=>sum+b.length,0);
 if(mode==='nonindexed'){
   const dense=new Float32Array(indices.flatMap(index=>positions[index]));
   const start=offset();
   chunks.push(Buffer.from(dense.buffer));
   const view=json.bufferViews.push({buffer:0,byteOffset:start,byteLength:dense.byteLength})-1;
   const accessor=json.accessors.push({bufferView:view,componentType:5126,count:indices.length,type:'VEC3',min:positions[0].map((_,axis)=>Math.min(...positions.map(p=>p[axis]))),
     max:positions[0].map((_,axis)=>Math.max(...positions.map(p=>p[axis])))})-1;
   primitive.attributes.POSITION=accessor;
   // Normal streams have a different vertex count after de-indexing.
   // glTF permits omitting NORMAL; this remains a valid triangle mesh.
   delete primitive.attributes.NORMAL;
   delete primitive.indices;
 }else{
   // Split *one* closed shell into two material primitives whose shared
   // edge geometry is identical but index-edge inventory cannot cross.
   const midpoint=indices.length/2;
   const newPrimitives=[];
   for(const part of [indices.slice(0,midpoint),indices.slice(midpoint)]){
     const data=new Uint16Array(part);
     const start=offset();chunks.push(Buffer.from(data.buffer));
     const view=json.bufferViews.push({buffer:0,byteOffset:start,byteLength:data.byteLength})-1;
     const accessor=json.accessors.push({bufferView:view,componentType:5123,count:part.length,type:'SCALAR'})-1;
     newPrimitives.push({...structuredClone(primitive),indices:accessor,material:0});
   }
   json.meshes[node.mesh].primitives=newPrimitives;
 }
 const updated=packTestGlb(json,Buffer.concat(chunks));
 return updated;
}

test('QA-02d index seams: nonindexed GLB cube has one contiguous geometric shell',()=>{
 const f=fixture();
 const mutated=seamVariant(f,{mode:'nonindexed'});
 const indexOnly=inventoryGlbTriangleComponents(mutated).nodes.find(n=>n.nodeId==='base');
 assert.ok(indexOnly.componentCount>1);
 assert.equal(indexOnly.spatial.componentCount,1);
 assert.equal(indexOnly.spatial.ambiguousEdges,0);
 const plan=createRealizedContactPlan({
   attachmentSemantics:f.attachmentSemantics,id:'qa-seam-cube',assetSha256:sha(mutated),
   supportRoots:['base'],supportRequiredEntityIds:['leg'],
   pairExpectations:f.plan.pairExpectations,
   contactTolerance:f.plan.contactTolerance,penetrationTolerance:f.plan.penetrationTolerance,
   evidenceRefs:['review/contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({glb:mutated,attachmentSemantics:f.attachmentSemantics,plan});
 assert.equal(replayRealizedContactEvidence({glb:mutated,sourceSha256:f.sourceSha256,
   attachmentSemantics:f.attachmentSemantics,plan,graph,report}).status,'PASS');
});

test('QA-02d a material-primitive seam is not a detached shard',()=>{
 const f=fixture(),mutated=seamVariant(f,{mode:'two-material-primitives'});
 const node=inventoryGlbTriangleComponents(mutated).nodes.find(n=>n.nodeId==='base');
 assert.ok(node.componentCount>1);
 assert.equal(node.spatial.componentCount,1);
 assert.equal(node.spatial.ambiguousEdges,0);
});

test('QA-02d material-separated shell also passes trusted source-bound GLB contact replay',()=>{
 const f=fixture(),glb=seamVariant(f,{mode:'two-material-primitives'});
 const plan=createRealizedContactPlan({
   attachmentSemantics:f.attachmentSemantics,id:'qa-multi-primitive-contact',
   assetSha256:sha(glb),supportRoots:['base'],supportRequiredEntityIds:['leg'],
   pairExpectations:f.plan.pairExpectations,contactTolerance:f.plan.contactTolerance,
   penetrationTolerance:f.plan.penetrationTolerance,evidenceRefs:['review/contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({glb,attachmentSemantics:f.attachmentSemantics,plan});
 assert.equal(report.status,'PASS');
 const result=replayRealizedContactEvidence({glb,sourceSha256:f.sourceSha256,
   attachmentSemantics:f.attachmentSemantics,plan,graph,report});
 assert.equal(result.status,'PASS',result.reason+': '+result.details.join('; '));
});

test('QA-02d component inventory rejects coincident overlapping same-oriented faces',()=>{
 const f=fixture(),{json,binary}=parseGlb(f.glb);
 const copy=structuredClone(json),node=copy.nodes.find(n=>n.extras?.refasPartId==='base');
 copy.meshes[node.mesh].primitives.push(structuredClone(copy.meshes[node.mesh].primitives[0]));
 const duplicated=packTestGlb(copy,binary);
 const nodeInfo=inventoryGlbTriangleComponents(duplicated).nodes.find(n=>n.nodeId==='base');
 assert.ok(nodeInfo.spatial.ambiguousEdges>0);
});

test('QA-02d tiny real positive gap is never welded by an epsilon',()=>{
 const f=fixture();
 const first=box('base',0,0.2).mesh;
 const second=box('base',0.200001,0.4).mesh;
 const glb=partsToGlb({parts:[{id:'base',materialId:'solid',mesh:{
   positions:[...first.positions,...second.positions],
   indices:[...first.indices,...second.indices.map(i=>i+first.positions.length)],
 }}],materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 const result=inventoryGlbTriangleComponents(glb);
 assert.equal(result.nodes[0].spatial.componentCount,2);
});




function rigidFollowEvidence(f){
 const frame={origin:[0,0,0],xAxis:[1,0,0],yAxis:[0,1,0],zAxis:[0,0,1]};
 const followState=createAttachmentFollowState({
  attachmentSemantics:f.attachmentSemantics,
  bindings:[{id:'leg-follows-base',relationId:'leg-follow',
   baselineOwnerFrame:frame,baselineSubjectFrame:frame,
   evidenceRefs:['review/follow-leg.json']}],
  evidenceRefs:['review/follow-state.json'],
 });
 const stateDigest=D('1');
 const propagationPlan=createAttachmentPropagationPlan({
  attachmentSemantics:f.attachmentSemantics,id:'follow-qa-plan',
  followState,externalFrameBindings:[{
   entityId:'base',stateDigest,frameDigest:rigidFrameDigest(frame),
   ownerFrameDigests:[],evidenceRefs:['review/base-state.json'],
  }],evidenceRefs:['review/follow-propagation-plan.json'],
 });
 const propagationReport=propagateAttachmentGraph({
  plan:propagationPlan,attachmentSemantics:f.attachmentSemantics,followState,
  initialWorldFrames:[{entityId:'base',stateDigest,frame}],
  evidenceRefs:['review/follow-report.json'],
 });
 const plan=createRealizedContactPlan({
  attachmentSemantics:f.attachmentSemantics,id:'qa-follow-contact',
  assetSha256:sha(f.glb),supportRoots:['base'],supportRequiredEntityIds:['leg'],
  pairExpectations:f.plan.pairExpectations,
  contactTolerance:f.plan.contactTolerance,
  penetrationTolerance:f.plan.penetrationTolerance,
  propagationReportDigest:propagationReport.reportDigest,
  evidenceRefs:['review/qa-follow-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({
  glb:f.glb,plan,attachmentSemantics:f.attachmentSemantics,propagationReport,
 });
 return {followState,propagationPlan,propagationReport,plan,graph,report};
}

test('QA-02g persisted RIGID_FOLLOW requires actual typed dependency to PASS',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-follow-persisted-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=Buffer.from('independent source for rich rigid follow QA');
 const sourceSha256=sha(source);
 await fs.mkdir(path.join(root,'source'),{recursive:true});
 await fs.writeFile(path.join(root,'source','reference.bin'),source);
 await initProject(root,{projectId:'qa-rich-follow',source:{
  schema:'refas.source-manifest/v1',id:'primary-reference',
  path:'source/reference.bin',sha256:sourceSha256,sizeBytes:source.length,
  width:80,height:60,authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const f=fixture({sourceSha256}),g=rigidFollowEvidence(f);
 assert.equal(g.propagationReport.status,'READY_FOR_REALIZATION');
 assert.equal(g.report.status,'PASS');
 const args={...f,plan:g.plan,graph:g.graph,report:g.report,
  propagationPlan:g.propagationPlan,propagationReport:g.propagationReport,
  propagationDependencies:{followState:g.followState}};
 assert.equal(replayRealizedContactEvidence(args).status,'PASS');
 assert.equal(replayRealizedContactEvidence({...args,propagationDependencies:{
   followState:g.followState,
   plan:{sourceSha256:D('c')},report:{eligibleForRealization:false},
   attachmentSemantics:{sourceSha256:D('d')},
 }}).status,'PASS'); // injected auxiliary keys cannot override the trusted plan
 assert.equal(replayRealizedContactEvidence({...args,propagationDependencies:{}}).status,'INSUFFICIENT');
 const art=path.join(root,'model');await fs.mkdir(art,{recursive:true});
 const candidate=path.join(art,'candidate.glb');await fs.writeFile(candidate,f.glb);
 const entries=[
  ['attachment-semantics',f.attachmentSemantics],
  ['realized-contact-plan',g.plan],['realized-contact-graph',g.graph],
  ['realized-contact-report',g.report],
  ['attachment-propagation-plan',g.propagationPlan],
  ['attachment-propagation-report',g.propagationReport],
  ['attachment-follow-state',g.followState],
 ];
 const refs=[await contentReference(candidate,{kind:'glb',root})];
 for(const [kind,value]of entries){
  const dest=path.join(art,kind+'.json');await fs.writeFile(dest,JSON.stringify(value));
  refs.push(await contentReference(dest,{kind,root}));
 }
 await commitCheckpoint(root,{capability:'source-intake',scopeId:'whole',
  reason:'Independent source with rich follow graph verified',
  artifactRefs:refs,claims:['candidate stored for QA'],
  gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}],
 });
 const valid=await verifySourceBoundObject(root,candidate);
 assert.equal(valid.checks.find(c=>c.id==='realized-contact-support').status,'PASS');
 assert.equal(valid.decision.state,'BLOCKED');
 const followFile=path.join(art,'attachment-follow-state.json');
 await fs.writeFile(followFile,JSON.stringify({...g.followState,followStateDigest:D('a')}));
 const forged=await verifySourceBoundObject(root,candidate);
 assert.equal(forged.checks.find(c=>c.id==='realized-contact-support').status,'FAIL');
});

test('QA-02f source-independent GLB world pose replay detects contradictory, re-signed positions',()=>{
 const f=freePropagationFixture();
 assert.equal(verifyRealizedPropagationWorldFrames(f.glb,f.propagationReport).status,'PASS');
 const changedGlb=partsToGlb({parts:[{...box('base',0,1),translation:[3,0,0]}],
   materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 const changedPlan=createRealizedContactPlan({
   attachmentSemantics:f.attachmentSemantics,id:'shifted-but-source-claims-origin',
   assetSha256:sha(changedGlb),propagationReportDigest:f.propagationReport.reportDigest,
   supportRoots:['base'],evidenceRefs:['review/shifted-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({
   glb:changedGlb,plan:changedPlan,attachmentSemantics:f.attachmentSemantics,
   propagationReport:f.propagationReport,
 });
 assert.equal(report.status,'PASS');
 const contradiction=replayRealizedContactEvidence({
   ...f,glb:changedGlb,plan:changedPlan,graph,report,
 });
 assert.equal(contradiction.status,'FAIL');
 assert.match(contradiction.reason,/world transforms/);
});

test('QA-02f actual GLB translation and parented rotation agree with a bound world-frame report',()=>{
 const f=freePropagationFixture(),stateDigest=D('1');
 const frame={origin:[2,3,4],xAxis:[0,1,0],yAxis:[-1,0,0],zAxis:[0,0,1]};
 const plan=createAttachmentPropagationPlan({attachmentSemantics:f.attachmentSemantics,
   id:'qa-propagation-transformed',externalFrameBindings:[{
     entityId:'base',stateDigest,frameDigest:rigidFrameDigest(frame),
     ownerFrameDigests:[],evidenceRefs:['review/real-world-frame.json'],
   }],evidenceRefs:['review/real-world-frame-plan.json'],
 });
 const report=propagateAttachmentGraph({plan,attachmentSemantics:f.attachmentSemantics,
   initialWorldFrames:[{entityId:'base',stateDigest,frame}],
   evidenceRefs:['review/real-world-frame-report.json'],
 });
 const glb=partsToGlb({parts:[{
   ...box('base',0,1),translation:[2,3,4],
   rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],
 }],materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 assert.equal(verifyRealizedPropagationWorldFrames(glb,report).status,'PASS');
 const wrongGlb=partsToGlb({parts:[{
   ...box('base',0,1),translation:[2,3,4],
   rotation:[0,0,0,1],
 }],materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 assert.equal(verifyRealizedPropagationWorldFrames(wrongGlb,report).status,'FAIL');
});

test('QA-02f arbitrary scale cannot be mistaken for a rigid attachment frame',()=>{
 const f=freePropagationFixture();
 const scaled=partsToGlb({parts:[{...box('base',0,1),scale:[2,1,1]}],
   materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 assert.equal(verifyRealizedPropagationWorldFrames(scaled,f.propagationReport).status,'INSUFFICIENT');
});


test('QA-02f inherited parent transform contributes to current physical node world frame',()=>{
 const f=freePropagationFixture(),stateDigest=D('1');
 const frame={origin:[2,4,4],xAxis:[1,0,0],yAxis:[0,1,0],zAxis:[0,0,1]};
 const plan=createAttachmentPropagationPlan({
   attachmentSemantics:f.attachmentSemantics,id:'parent-world-frame',
   externalFrameBindings:[{entityId:'base',stateDigest,
     frameDigest:rigidFrameDigest(frame),ownerFrameDigests:[],
     evidenceRefs:['review/parent-frame.json']}],
   evidenceRefs:['review/parent-propagation.json'],
 });
 const report=propagateAttachmentGraph({plan,attachmentSemantics:f.attachmentSemantics,
   initialWorldFrames:[{entityId:'base',stateDigest,frame}],
   evidenceRefs:['review/parent-report.json'],
 });
 const glb=partsToGlb({parts:[
   {...box('carrier',0,0.1),translation:[2,3,4]},
   {...box('base',0,1),parentId:'carrier',translation:[0,1,0]},
 ],materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 assert.equal(verifyRealizedPropagationWorldFrames(glb,report).status,'PASS');
 const inconsistent=partsToGlb({parts:[
   {...box('carrier',0,0.1),translation:[2,3,4]},
   {...box('base',0,1),parentId:'carrier',translation:[0,2,0]},
 ],materials:{solid:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}}});
 assert.equal(verifyRealizedPropagationWorldFrames(inconsistent,report).status,'FAIL');
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  createAttachmentSemantics,createRealizedContactPlan,
  analyzeRealizedContact,partsToGlb,inventoryGlbTriangleComponents,
  createTriangleComponentSupportPlan,replayTriangleComponentSupport,
  replayRealizedContactEvidence,initProject,commitCheckpoint,
  contentReference,verifySourceBoundObject,
} from '../skills/refas/scripts/lib/index.mjs';

const digest=(c='a')=>c.repeat(64);
const sha=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const E=id=>({id,scopeId:id,evidenceRefs:['assembly/'+id+'.json']});
const R=(id,mode,subjectId,ownerIds=[])=>({
  id,mode,subjectId,ownerIds,basis:'construction',evidenceRefs:['assembly/'+id+'.json'],
});

function box(z0,z1) {
 return {
  positions:[[0,0,z0],[1,0,z0],[1,1,z0],[0,1,z0],
    [0,0,z1],[1,0,z1],[1,1,z1],[0,1,z1]],
  indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
    3,7,6,3,6,2,0,7,3,0,4,7,1,2,6,1,6,5],
 };
}
function fixture({sourceSha256=digest(),gap=0,extra=false}={}){
 const attachmentSemantics=createAttachmentSemantics({
  scopeId:'split-root',sourceSha256,
  entities:[E('base')],relations:[R('root-free','FREE','base')],
 });
 const segments=[box(0,.2),box(.2+gap,.4+gap),...(extra?[box(.4+gap,.6+gap)]:[])];
 const positions=[],indices=[];
 for(const part of segments){
  const start=positions.length;
  positions.push(...part.positions);
  indices.push(...part.indices.map(i=>i+start));
 }
 const glb=partsToGlb({parts:[{id:'base',materialId:'solid',mesh:{positions,indices}}],
  materials:{solid:{baseColor:[.6,.6,.6,1],roughness:1,metallic:0}}});
 const inventory=inventoryGlbTriangleComponents(glb);
 const node=inventory.nodes[0];
 const plan=createRealizedContactPlan({
  attachmentSemantics,id:'split-support',assetSha256:sha(glb),
  supportRoots:['base'],evidenceRefs:['review/contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({glb,attachmentSemantics,plan});
 const links=[
 {childTriangleIndex:12,ownerTriangleIndex:2,evidenceRefs:['assembly/first-contact.json']},
 {childTriangleIndex:13,ownerTriangleIndex:3,evidenceRefs:['assembly/second-contact.json']},
 ];
 const componentSupportPlan=createTriangleComponentSupportPlan({
  assetSha256:sha(glb),inventoryDigest:inventory.inventoryDigest,
  nodes:[{nodeId:'base',rootTriangleIndex:0,links}],
  evidenceRefs:['review/physical-support.json'],
 });
 return {glb,sourceSha256,attachmentSemantics,plan,graph,report,
  inventory,node,componentSupportPlan};
}

test('QA-02k exact opposed face from two separately indexed shells connects every island',()=>{
 const f=fixture();
 assert.equal(f.node.spatial.componentCount,2);
 assert.equal(f.report.status,'PASS');
 assert.equal(replayRealizedContactEvidence(f).status,'INSUFFICIENT');
 const check=replayTriangleComponentSupport(f.glb,f.componentSupportPlan);
 assert.equal(check.status,'PASS',check.reason+':'+check.details.join(','));
 const contact=replayRealizedContactEvidence(f);
 assert.equal(contact.status,'INSUFFICIENT');
 const proven=replayRealizedContactEvidence({...f,componentSupportPlan:f.componentSupportPlan});
 assert.equal(proven.status,'PASS',proven.reason+': '+proven.details.join(','));
 // Existing diagnostic contract is unchanged by requesting extra geometry.
 const rich=inventoryGlbTriangleComponents(f.glb,{withTriangleDetails:true});
 assert.equal(rich.inventory.inventoryDigest,f.inventory.inventoryDigest);
 assert.equal(rich.details[0].componentIds.length,24);
});

test('QA-02k re-signed plan cannot turn a real distance gap into contact',()=>{
 for(const gap of [0.000001,.25,4]){
  const f=fixture({gap});
  assert.equal(f.report.status,'PASS');
  const measured=replayTriangleComponentSupport(f.glb,f.componentSupportPlan);
  assert.equal(measured.status,'FAIL',gap+': '+measured.reason);
  assert.equal(replayRealizedContactEvidence({...f,
   componentSupportPlan:f.componentSupportPlan}).status,'FAIL');
 }
});

test('QA-02k component graph must be complete, rooted and tied to actual triangles',()=>{
 const f=fixture({extra:true});
 assert.equal(f.node.spatial.componentCount,3);
 const underDeclared=replayTriangleComponentSupport(f.glb,f.componentSupportPlan);
 assert.equal(underDeclared.status,'INSUFFICIENT');
 const positive=createTriangleComponentSupportPlan({
  assetSha256:sha(f.glb),inventoryDigest:f.inventory.inventoryDigest,
  nodes:[{nodeId:'base',rootTriangleIndex:0,links:[
   {childTriangleIndex:12,ownerTriangleIndex:2,evidenceRefs:['assembly/first-face.json']},
   {childTriangleIndex:13,ownerTriangleIndex:3,evidenceRefs:['assembly/first-face-b.json']},
   {childTriangleIndex:24,ownerTriangleIndex:14,evidenceRefs:['assembly/second-face.json']},
   {childTriangleIndex:25,ownerTriangleIndex:15,evidenceRefs:['assembly/second-face-b.json']},
  ]}],evidenceRefs:['review/three-boxes.json'],
 });
 assert.equal(replayTriangleComponentSupport(f.glb,positive).status,'PASS');
 assert.equal(replayRealizedContactEvidence({...f,componentSupportPlan:positive}).status,'PASS');
 const cyclic=createTriangleComponentSupportPlan({
  assetSha256:sha(f.glb),inventoryDigest:f.inventory.inventoryDigest,
  nodes:[{nodeId:'base',rootTriangleIndex:0,links:[
   {childTriangleIndex:12,ownerTriangleIndex:26,evidenceRefs:['assembly/unsupported.json']},
   {childTriangleIndex:13,ownerTriangleIndex:27,evidenceRefs:['assembly/unsupported.json']},
   {childTriangleIndex:24,ownerTriangleIndex:14,evidenceRefs:['assembly/unsupported.json']},
   {childTriangleIndex:25,ownerTriangleIndex:15,evidenceRefs:['assembly/unsupported.json']},
  ]}],evidenceRefs:['review/cyclic.json'],
 });
 assert.notEqual(replayTriangleComponentSupport(f.glb,cyclic).status,'PASS');
 const forged={...positive,nodes:[{...positive.nodes[0],rootTriangleIndex:14}]};
 assert.equal(replayTriangleComponentSupport(f.glb,forged).status,'FAIL');
});

test('QA-02k malformed, absent or stale witness evidence never silently passes',()=>{
 const f=fixture();
 assert.equal(replayTriangleComponentSupport(f.glb,null).status,'INSUFFICIENT');
 assert.equal(replayTriangleComponentSupport(f.glb,{
  ...f.componentSupportPlan,assetSha256:digest('b')}).status,'FAIL');
 const noSuchTriangle=createTriangleComponentSupportPlan({
  assetSha256:sha(f.glb),inventoryDigest:f.inventory.inventoryDigest,
  nodes:[{nodeId:'base',rootTriangleIndex:0,links:[
   {childTriangleIndex:800,ownerTriangleIndex:2,evidenceRefs:['review/invalid.json']},
  ]}],evidenceRefs:['review/invalid.json'],
 });
 assert.equal(replayTriangleComponentSupport(f.glb,noSuchTriangle).status,'FAIL');
});

test('QA-02k exact source-bound checkpoint reads component evidence and detects changed bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-component-proof-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const raw=Buffer.from('operator supplied source for reviewed geometric contact');
 const sourceSha256=sha(raw);
 await fs.mkdir(path.join(root,'source'),{recursive:true});
 await fs.writeFile(path.join(root,'source','ref.bin'),raw);
 await initProject(root,{projectId:'component-contact',source:{
  schema:'refas.source-manifest/v1',id:'primary-reference',
  path:'source/ref.bin',sha256:sourceSha256,sizeBytes:raw.length,
  width:64,height:64,authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const f=fixture({sourceSha256});
 const model=path.join(root,'model');await fs.mkdir(model,{recursive:true});
 const asset=path.join(model,'candidate.glb');await fs.writeFile(asset,f.glb);
 const refs=[await contentReference(asset,{kind:'glb',root})];
 for(const [kind,data] of [
  ['attachment-semantics',f.attachmentSemantics],
  ['realized-contact-plan',f.plan],['realized-contact-graph',f.graph],
  ['realized-contact-report',f.report],
  ['triangle-component-support-plan',f.componentSupportPlan],
 ]){
  const dest=path.join(model,kind+'.json');
  await fs.writeFile(dest,JSON.stringify(data));
  refs.push(await contentReference(dest,{kind,root}));
 }
 await commitCheckpoint(root,{capability:'source-intake',scopeId:'whole',
  reason:'reviewed component geometry and raw primary source',
  artifactRefs:refs,claims:['source preserved'],
  gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}],
 });
 const positive=await verifySourceBoundObject(root,asset);
 assert.equal(positive.checks.find(c=>c.id==='realized-contact-support').status,'PASS');
 assert.equal(positive.decision.state,'BLOCKED'); // No source-semantic fidelity proof.
 const file=path.join(model,'triangle-component-support-plan.json');
 await fs.writeFile(file,JSON.stringify({...f.componentSupportPlan,evidenceRefs:['forged.json']}));
 const changed=await verifySourceBoundObject(root,asset);
 assert.equal(changed.checks.find(c=>c.id==='realized-contact-support').status,'FAIL');
});

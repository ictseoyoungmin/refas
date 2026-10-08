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

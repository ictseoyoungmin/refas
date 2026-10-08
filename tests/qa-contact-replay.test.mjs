import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {
  analyzeRealizedContact,
  createAttachmentSemantics,
  createRealizedContactPlan,
  partsToGlb,
  replayRealizedContactEvidence,
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
function fixture({gap=0,includeExtra=false}={}) {
 const sourceSha256=D('a');
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

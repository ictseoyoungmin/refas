import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
 analyzeRealizedContact,createAttachmentSemantics,createRealizedContactPlan,
 inventoryGlbTriangleComponents,parseGlb,replayRealizedContactEvidence,
 verifyRealizedSurfaceDescriptors,initProject,commitCheckpoint,contentReference,verifySourceBoundObject,
} from '../skills/refas/scripts/lib/index.mjs';
import {readQaGeometryAccessor} from '../skills/refas/scripts/lib/qa-glb-geometry-accessors.mjs';

const D=(v='a')=>v.repeat(64);
const sha=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const anchorSet={anchors:[{ownerId:'panel'}]};
const surfaces=[{ownerId:'panel',geometryDigest:D('b'),
 vertices:[[0,0,0],[1,0,0],[0,1,0]],
 triangles:[{id:'panel-face',patchId:'panel-patch',indices:[0,1,2]}]}];

function fixture({
 implicitBase=true,sparseIndices=true,indexComponent=5121,changedPointZ=0,
 sparseIndexLocations=[1,2],truncateValues=false,
}={}){
 const views=[],chunks=[];
 let length=0;
 function add(bytes){
  const pad=(4-length%4)%4;
  if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
  const offset=length;
  const body=Buffer.from(bytes);
  chunks.push(body);length+=body.length;
  views.push({buffer:0,byteOffset:offset,byteLength:body.length});
  return views.length-1;
 }
 const positions=new Float32Array([0,0,0, 1,0,0, 0,1,0]);
 const triangleIndices=new Uint16Array([0,1,2]);
 const densePositionView=implicitBase?undefined:add(Buffer.from(positions.buffer));
 const denseIndexView=sparseIndices?undefined:add(Buffer.from(triangleIndices.buffer));
 const typeSize=indexComponent===5125?4:indexComponent===5123?2:1;
 const sparsePositionIndexView=add(Uint8Array.from([1,2]));
 const sparsePositionValueView=add(Buffer.from(new Float32Array([1,0,changedPointZ, 0,1,0]).buffer));
 const array=indexComponent===5125?new Uint32Array(sparseIndexLocations):
    indexComponent===5123?new Uint16Array(sparseIndexLocations):new Uint8Array(sparseIndexLocations);
 const sparseIndexIndexView=add(Buffer.from(array.buffer));
 const sparseIndexValueView=add(Buffer.from(new Uint16Array([1,2]).buffer));
 if(truncateValues)views[sparsePositionValueView].byteLength-=4;
 const bin=Buffer.concat(chunks);
 const json={
  asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
  nodes:[{mesh:0,name:'panel',extras:{refasPartId:'panel'}}],
  buffers:[{byteLength:bin.length}],bufferViews:views,
  accessors:[
   {componentType:5126,count:3,type:'VEC3',
    ...(implicitBase?{}:{bufferView:densePositionView}),
    sparse:{count:2,indices:{bufferView:sparsePositionIndexView,componentType:5121},
      values:{bufferView:sparsePositionValueView}}},
   {componentType:5123,count:3,type:'SCALAR',
    ...(sparseIndices?{sparse:{count:2,indices:{
      bufferView:sparseIndexIndexView,componentType:indexComponent},
      values:{bufferView:sparseIndexValueView}}}:{bufferView:denseIndexView})},
  ],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
 };
 return pack(json,bin);
}
function pack(json,binary){
 json.buffers[0].byteLength=binary.length;
 const raw=Buffer.from(JSON.stringify(json));
 const j=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]);
 const bin=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
 const out=Buffer.alloc(12+8+j.length+8+bin.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);
 out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);
 out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);
 out.writeUInt32LE(bin.length,20+j.length);
 out.writeUInt32LE(0x004e4942,24+j.length);bin.copy(out,28+j.length);
 return out;
}
function scenario(glb,sourceSha256=D('a')){
 const attachmentSemantics=createAttachmentSemantics({
  scopeId:'sparse-test',sourceSha256,
  entities:[{id:'panel',scopeId:'panel',evidenceRefs:['review/panel.json']}],
  relations:[{id:'panel-free',mode:'FREE',subjectId:'panel',ownerIds:[],
    basis:'construction',evidenceRefs:['review/panel-free.json']}],
 });
 const plan=createRealizedContactPlan({
  attachmentSemantics,id:'sparse-glb-contact',
  assetSha256:sha(glb),supportRoots:['panel'],evidenceRefs:['review/physical-contact.json'],
 });
 const {graph,report}=analyzeRealizedContact({glb,attachmentSemantics,plan});
 return {glb,sourceSha256,attachmentSemantics,plan,graph,report};
}
function contact(glb){
 return replayRealizedContactEvidence(scenario(glb));
}

test('QA-02l sparse-only accessor POSITION and indices decode same triangles in all trusted QA paths',()=>{
 for(const componentType of [5121,5123,5125]){
  const glb=fixture({indexComponent:componentType});
  const {json,binary}=parseGlb(glb);
  assert.deepEqual(readQaGeometryAccessor(json,binary,0,{position:true}),[[0,0,0],[1,0,0],[0,1,0]]);
  assert.deepEqual(readQaGeometryAccessor(json,binary,1),[0,1,2]);
  const inventory=inventoryGlbTriangleComponents(glb);
  assert.equal(inventory.nodes[0].spatial.componentCount,1);
  assert.equal(inventory.nodes[0].triangleCount,1);
  assert.equal(verifyRealizedSurfaceDescriptors(glb,surfaces,anchorSet).status,'PASS');
  const outcome=contact(glb);
  assert.equal(outcome.status,'PASS',outcome.reason+': '+outcome.details.join('; '));
 }
});

test('QA-02l sparse overlay on a real dense base cannot invent a nonexistent patch',()=>{
 const preserved=fixture({implicitBase:false,sparseIndices:false});
 assert.equal(verifyRealizedSurfaceDescriptors(preserved,surfaces,anchorSet).status,'PASS');
 assert.equal(inventoryGlbTriangleComponents(preserved).nodes[0].triangleCount,1);
 const drift=fixture({implicitBase:false,sparseIndices:false,changedPointZ:0.4});
 assert.equal(verifyRealizedSurfaceDescriptors(drift,surfaces,anchorSet).status,'FAIL');
 assert.notEqual(sha(drift),sha(preserved));
});

test('QA-02l rejects reordered/duplicate/out of range sparse index writes',()=>{
 for(const positions of [[2,1],[1,1],[1,3]]){
  const glb=fixture({sparseIndexLocations:positions});
  const {json,binary}=parseGlb(glb);
  assert.throws(()=>readQaGeometryAccessor(json,binary,1),/strictly increasing/);
  assert.throws(()=>inventoryGlbTriangleComponents(glb),/strictly increasing/);
  assert.equal(verifyRealizedSurfaceDescriptors(glb,surfaces,anchorSet).status,'FAIL');
 }
});

test('QA-02l sparse value buffer bounds are not extended by BIN chunk padding',()=>{
 const glb=fixture({truncateValues:true});
 assert.throws(()=>inventoryGlbTriangleComponents(glb),/invalid or out-of-range/);
 assert.equal(verifyRealizedSurfaceDescriptors(glb,surfaces,anchorSet).status,'FAIL');
});

test('QA-02l sparse geometry is byte-bound even if worker re-signs metadata',()=>{
 const valid=fixture(),changed=fixture({changedPointZ:0.25});
 assert.notEqual(sha(valid),sha(changed));
 assert.equal(verifyRealizedSurfaceDescriptors(changed,surfaces,anchorSet).status,'FAIL');
 assert.equal(inventoryGlbTriangleComponents(changed).nodes[0].spatial.componentCount,1);
 assert.equal(contact(changed).status,'PASS'); // Geometric validity alone is not source fidelity.
});

test('QA-02l stored sparse GLB requires current checkpoint bytes, never stale digest declarations',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-sparse-glb-qa-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const raw=Buffer.from('registered operator photo bytes for actual sparse GLB QA');
 const sourceSha256=sha(raw);
 await fs.mkdir(path.join(root,'source'),{recursive:true});
 await fs.writeFile(path.join(root,'source','primary.bin'),raw);
 await initProject(root,{projectId:'actual-sparse-geometry',source:{
  schema:'refas.source-manifest/v1',id:'primary',path:'source/primary.bin',
  sha256:sourceSha256,sizeBytes:raw.length,width:48,height:48,
  authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const glb=fixture({indexComponent:5125});
 const f=scenario(glb,sourceSha256);
 const out=path.join(root,'model');await fs.mkdir(out,{recursive:true});
 const asset=path.join(out,'candidate.glb');await fs.writeFile(asset,glb);
 const refs=[await contentReference(asset,{kind:'glb',root})];
 for(const [kind,value] of [
  ['attachment-semantics',f.attachmentSemantics],
  ['realized-contact-plan',f.plan],
  ['realized-contact-graph',f.graph],
  ['realized-contact-report',f.report],
 ]){
  const dest=path.join(out,kind+'.json');await fs.writeFile(dest,JSON.stringify(value));
  refs.push(await contentReference(dest,{kind,root}));
 }
 await commitCheckpoint(root,{
  capability:'source-intake',scopeId:'whole',
  reason:'original sparse candidate bound to primary-source checksum',
  artifactRefs:refs,claims:['candidate registered for trusted QA'],
  gates:[{id:'source-intake-gate',evidenceRefs:[refs[0].path]}],
 });
 const correct=await verifySourceBoundObject(root,asset);
 assert.equal(correct.checks.find(x=>x.id==='realized-contact-support').status,'PASS');
 assert.equal(correct.decision.state,'BLOCKED'); // original photo fidelity not certified
 await fs.writeFile(asset,fixture({indexComponent:5125,changedPointZ:0.5}));
 const tampered=await verifySourceBoundObject(root,asset);
 assert.equal(tampered.checks.find(x=>x.id==='realized-contact-support').status,'FAIL');
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {
 analyzeRealizedContact,createAttachmentSemantics,createRealizedContactPlan,
 inventoryGlbTriangleComponents,parseGlb,replayRealizedContactEvidence,
 verifyRealizedSurfaceDescriptors,
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
function contact(glb){
 const sourceSha256=D('a');
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
 return replayRealizedContactEvidence({
  glb,sourceSha256,attachmentSemantics,plan,graph,report,
 });
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

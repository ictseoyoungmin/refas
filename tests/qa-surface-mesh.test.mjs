import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  parseGlb, verifyRealizedSurfaceDescriptors,
} from '../skills/refas/scripts/lib/index.mjs';

function pack(json, binary) {
  const raw = Buffer.from(JSON.stringify(json));
  const alignedJson = Buffer.concat([raw, Buffer.alloc((4-raw.length%4)%4, 0x20)]);
  const bin = Buffer.concat([binary, Buffer.alloc((4-binary.length%4)%4)]);
  json.buffers[0].byteLength = binary.length;
  // Re-encode after updating the declared byte length.
  const text = Buffer.from(JSON.stringify(json));
  const j = Buffer.concat([text, Buffer.alloc((4-text.length%4)%4, 0x20)]);
  const out = Buffer.alloc(12+8+j.length+8+bin.length);
  out.writeUInt32LE(0x46546c67,0);
  out.writeUInt32LE(2,4);
  out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(j.length,12);
  out.writeUInt32LE(0x4e4f534a,16);
  j.copy(out,20);
  out.writeUInt32LE(bin.length,20+j.length);
  out.writeUInt32LE(0x004e4942,24+j.length);
  bin.copy(out,28+j.length);
  return out;
}

function candidate({nonindexed=false,splitPrimitive=false}={}) {
  const p0 = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
  const p1 = new Float32Array([0,0,1, 1,0,1, 0,1,1]);
  const positions = new Float32Array([...p0,...p1]);
  const raw = Buffer.from(positions.buffer);
  const index = new Uint16Array([0,1,2,3,4,5]);
  const binary = Buffer.concat([raw,Buffer.from(index.buffer)]);
  const json = {
    asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
    nodes:[{mesh:0,name:'panel',extras:{refasPartId:'panel'}}],
    buffers:[{byteLength:binary.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:raw.length},
      {buffer:0,byteOffset:raw.length,byteLength:index.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3'},
      {bufferView:1,componentType:5123,count:6,type:'SCALAR'}],
    meshes:[{primitives:[{attributes:{POSITION:0},
      ...(nonindexed?{}:{indices:1}),mode:4}]}],
  };
  if(nonindexed) {
    // The six stored vertices already form two non-indexed triangles.
    delete json.meshes[0].primitives[0].indices;
  }
  if(splitPrimitive){
    json.accessors.push({bufferView:1,componentType:5123,count:3,type:'SCALAR'});
    json.accessors.push({bufferView:1,byteOffset:6,componentType:5123,count:3,type:'SCALAR'});
    json.meshes[0].primitives=[
      {attributes:{POSITION:0},indices:2,mode:4},
      {attributes:{POSITION:0},indices:3,mode:4},
    ];
  }
  return pack(json,binary);
}
const anchorSet={anchors:[{ownerId:'panel'}]};
const surfaces=[{ownerId:'panel',geometryDigest:'a'.repeat(64),
  vertices:[[0,0,1],[1,0,1],[0,1,1]],
  triangles:[{id:'panel-patch',patchId:'tip',indices:[0,1,2]}]}];

test('QA-02i accepts a real patch from indexed, nonindexed and multiple GLB primitives',()=>{
 for(const mode of [{},{nonindexed:true},{splitPrimitive:true}]){
  const result=verifyRealizedSurfaceDescriptors(candidate(mode),surfaces,anchorSet);
  assert.equal(result.status,'PASS',JSON.stringify(mode)+': '+result.reason);
 }
});

test('QA-02i sparse POSITION cannot self-certify realized geometry',()=>{
 const {json,binary}=parseGlb(candidate());
 json.accessors[0].sparse={count:1,indices:{bufferView:1,componentType:5123},
  values:{bufferView:0}};
 const result=verifyRealizedSurfaceDescriptors(pack(json,binary),surfaces,anchorSet);
 assert.equal(result.status,'INSUFFICIENT');
});

test('QA-02i duplicate physical owner and reversed face winding fail closed',()=>{
 const {json,binary}=parseGlb(candidate());
 json.nodes.push(structuredClone(json.nodes[0]));
 json.scenes[0].nodes.push(1);
 assert.equal(verifyRealizedSurfaceDescriptors(pack(json,binary),surfaces,anchorSet).status,'INSUFFICIENT');
 const reverse=surfaces.map(s=>({...s,
  triangles:[{id:'panel-patch',patchId:'tip',indices:[0,2,1]}]}));
 assert.equal(verifyRealizedSurfaceDescriptors(candidate(),reverse,anchorSet).status,'FAIL');
});

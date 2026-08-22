import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const align4=(value)=>(value+3)&~3;

function buildLargeGlb(extraTriangles=30_000){
  const positions=new Float32Array([
    0,0.65,0,
    -0.6,-0.45,0.5,
    0.6,-0.45,0.5,
    0,-0.45,-0.65,
  ]);
  const normals=new Float32Array([
    0,1,0,
    -0.6,-0.45,0.5,
    0.6,-0.45,0.5,
    0,-0.45,-0.65,
  ]);
  const indices=new Uint16Array(12+extraTriangles*3);
  indices.set([0,1,2,0,2,3,0,3,1,1,3,2]);
  // Remaining triangles are intentionally zero-area workload records. They
  // exercise large triangle-count policy without making the test raster-bound.
  const chunks=[];let offset=0;
  const push=(typed)=>{const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength);const start=align4(offset);chunks.push({start,bytes});offset=start+bytes.length;return {byteOffset:start,byteLength:bytes.length};};
  const positionView=push(positions),normalView=push(normals),indexView=push(indices);
  const binary=Buffer.alloc(align4(offset));for(const chunk of chunks)chunk.bytes.copy(binary,chunk.start);
  const json={asset:{version:'2.0',generator:'RefAs resource safety test'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'large-mesh'}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[0.3,0.5,0.7,1],metallicFactor:0.1,roughnessFactor:0.5}}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-0.6,-0.45,-0.65],max:[0.6,0.65,0.5]},{bufferView:1,componentType:5126,count:4,type:'VEC3'},{bufferView:2,componentType:5123,count:indices.length,type:'SCALAR'}],bufferViews:[{buffer:0,...positionView},{buffer:0,...normalView},{buffer:0,...indexView}],buffers:[{byteLength:binary.length}]};
  const jsonBytes=Buffer.from(JSON.stringify(json)),jsonLength=align4(jsonBytes.length),binaryLength=align4(binary.length),total=12+8+jsonLength+8+binaryLength;
  const output=Buffer.alloc(total);output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(total,8);output.writeUInt32LE(jsonLength,12);output.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(output,20);output.fill(0x20,20+jsonBytes.length,20+jsonLength);const binaryOffset=20+jsonLength;output.writeUInt32LE(binaryLength,binaryOffset);output.writeUInt32LE(0x004e4942,binaryOffset+4);binary.copy(output,binaryOffset+8);return output;
}

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-render-safety-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const glb=path.join(root,'large.glb');await fs.writeFile(glb,buildLargeGlb());return {root,glb};
}

function render(args){return spawnSync(process.execPath,[CLI,'render',...args],{encoding:'utf8',timeout:45_000});}

test('renderer accepts more than 30k triangles when no policy cap is requested',async(t)=>{
  const {root,glb}=await fixture(t);const out=path.join(root,'accepted');
  const result=render(['--glb',glb,'--out',out,'--size','32','--tile-size','16','--timeout-seconds','30','--max-working-mb','32']);
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(await fs.readFile(path.join(out,'render-report.json'),'utf8'));
  assert.equal(report.geometry.triangles,30_004);
  assert.equal(report.resourcePolicy.maxTriangles,null);
  assert.ok(report.resourcePolicy.sourceGlbMiB>0);
  assert.ok(report.resourcePolicy.decodedGeometryMiB>0);
  assert.ok(report.resourcePolicy.estimatedPeakMiB<=32);
});

test('explicit triangle cap fails before rendering and leaves no partial output',async(t)=>{
  const {root,glb}=await fixture(t);const out=path.join(root,'capped');
  const result=render(['--glb',glb,'--out',out,'--size','32','--max-triangles','30000']);
  assert.equal(result.status,1);
  assert.match(result.stderr,/triangle count 30004 exceeds explicit limit 30000/);
  await assert.rejects(fs.access(path.join(out,'render-report.json')));
});

test('memory preflight rejects an unsafe framebuffer budget without partial output',async(t)=>{
  const {root,glb}=await fixture(t);const out=path.join(root,'memory-rejected');
  const result=render(['--glb',glb,'--out',out,'--size','640','--max-working-mb','1']);
  assert.equal(result.status,1);
  assert.match(result.stderr,/requires at least .* MiB for the framebuffer/);
  await assert.rejects(fs.access(path.join(out,'render-report.json')));
});

test('internal deadline stops work instead of waiting indefinitely',async(t)=>{
  const {root,glb}=await fixture(t);const out=path.join(root,'timed-out');
  const result=render(['--glb',glb,'--out',out,'--size','64','--timeout-seconds','0.000001']);
  assert.equal(result.status,1);
  assert.match(result.stderr,/configured wall-clock timeout/);
  await assert.rejects(fs.access(path.join(out,'render-report.json')));
});

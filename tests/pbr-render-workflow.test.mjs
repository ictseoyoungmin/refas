import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {createSegmentPrism, partsToGlb} from '../skills/refas/scripts/lib/index.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const FRAME={
  schema:'refas.canonical-object-frame/v1',id:'fixture-frame',scopeId:'whole',
  origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},
  scopeParts:[],hero:{position:[0.55,0.3,5],target:[0,0,0],up:[0,1,0],fovY:34,registrationDigest:'a'.repeat(64)},
};

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-pbr-safety-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const parts=Array.from({length:18},(_,i)=>({
    id:`visible-part-${i}`,scopeId:'whole',materialId:'paint',
    mesh:createSegmentPrism({
      start:[-0.9+(i%6)*0.36,-0.7+Math.floor(i/6)*0.55,-0.2+(i%3)*0.14],
      end:[-0.72+(i%6)*0.36,-0.5+Math.floor(i/6)*0.55,0.2+(i%3)*0.14],
      width:0.14,height:0.12,upHint:[0,1,0],
    }),
  }));
  const glb=path.join(root,'candidate.glb'),frame=path.join(root,'frame.json');
  await fs.writeFile(glb,partsToGlb({parts,materials:{paint:{baseColor:[0.3,0.45,0.7,1],metallic:0.15,roughness:0.45}}}));
  await fs.writeFile(frame,JSON.stringify(FRAME));
  return {root,glb,frame};
}

function run(glb,frame,out,extra=[]){
  return spawnSync(process.execPath,[CLI,'render-pbr','--glb',glb,'--frame',frame,'--out',out,'--size','80',
    '--max-working-mb','24','--timeout-seconds','60',...extra],{encoding:'utf8',timeout:70_000});
}

test('PBR nondegenerate geometry is tile-size invariant, with optional single presentation board',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const normal=path.join(root,'normal'),boardless=path.join(root,'boardless');
  const small=run(glb,frame,normal,['--tile-size','24']);
  const large=run(glb,frame,boardless,['--tile-size','80','--no-board']);
  assert.equal(small.status,0,small.stderr);
  assert.equal(large.status,0,large.stderr);
  const first=JSON.parse(await fs.readFile(path.join(normal,'render-report.json'),'utf8'));
  const second=JSON.parse(await fs.readFile(path.join(boardless,'render-report.json'),'utf8'));
  assert.equal(first.reportDigest,second.reportDigest,'tile size and board presentation must not affect PBR evidence');
  assert.equal(first.outputs.length,8);
  assert.ok(first.outputs.every((v)=>second.outputs.some((w)=>w.viewId===v.viewId&&w.sha256===v.sha256)));
  await fs.access(path.join(normal,'pbr-review-board.png'));
  await assert.rejects(fs.access(path.join(boardless,'pbr-review-board.png')));
  const repeat=run(glb,frame,normal,['--tile-size','32','--no-board']);
  assert.equal(repeat.status,0,repeat.stderr);
  const rerendered=JSON.parse(await fs.readFile(path.join(normal,'render-report.json'),'utf8'));
  assert.equal(rerendered.reportDigest,first.reportDigest);
  await assert.rejects(fs.access(path.join(normal,'pbr-review-board.png')),'successful boardless rerender must remove a stale previous montage');
});

test('PBR tiny memory and timeout refuse partial publication',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const lowMem=path.join(root,'lowmem');
  const rejected=run(glb,frame,lowMem,['--size','1024','--max-working-mb','1']);
  assert.equal(rejected.status,1);
  assert.match(rejected.stderr,/working-memory budget|render requires/i);
  await assert.rejects(fs.access(path.join(lowMem,'render-report.json')));
  const timedOut=path.join(root,'timeout');
  const late=run(glb,frame,timedOut,['--timeout-seconds','0.000001']);
  assert.equal(late.status,1);
  assert.match(late.stderr,/timeout|deadline/i);
  await assert.rejects(fs.access(path.join(timedOut,'render-report.json')));
});

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
  return spawnSync(process.execPath,[CLI,'render-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',out,'--size','80',
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

test('explicit v2 neutral-clay override remains prohibited',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const out=path.join(root,'forbidden');
  const invalid=run(glb,frame,out,['--backend','opaque-v2','--neutral-clay']);
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/NEUTRAL_CLAY/);
  await assert.rejects(fs.access(path.join(out,'render-report.json')));
  const unknown=run(glb,frame,path.join(root,'unknown'),['--backend','imaginary']);
  assert.equal(unknown.status,1);
  assert.match(unknown.stderr,/unknown PBR backend/);
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

test('preview-only selective renderer reuses exact inputs without providing canonical gate evidence',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const out=path.join(root,'preview');
  const args=[CLI,'preview-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',out,
    '--size','80','--views','hero,side','--reuse','--timeout-seconds','60','--max-working-mb','24'];
  const runPreview=()=>spawnSync(process.execPath,args,{encoding:'utf8',timeout:70_000});
  const first=runPreview();
  assert.equal(first.status,0,first.stderr);
  assert.match(first.stdout,/"status": "PASS"/);
  const manifest=JSON.parse(await fs.readFile(path.join(out,'preview-manifest.json'),'utf8'));
  assert.equal(manifest.claimScope,'preview-only');
  assert.equal(manifest.eligibleForCertification,false);
  assert.deepEqual(manifest.outputs.map(x=>x.viewId),['hero','side']);
  await assert.rejects(fs.access(path.join(out,'render-report.json')));
  await assert.rejects(fs.access(path.join(out,'pbr-review-board.png')));
  const cached=runPreview();
  assert.equal(cached.status,0,cached.stderr);
  assert.match(cached.stdout,/"status": "REUSED"/);
  await fs.writeFile(path.join(out,'side.png'),Buffer.from('tampered'));
  const repaired=runPreview();
  assert.equal(repaired.status,0,repaired.stderr);
  assert.match(repaired.stdout,/"status": "PASS"/);
  const nextFrame={...FRAME,hero:{...FRAME.hero,fovY:44}};
  await fs.writeFile(frame,JSON.stringify(nextFrame));
  const changed=runPreview();
  assert.equal(changed.status,0,changed.stderr);
  assert.match(changed.stdout,/"status": "PASS"/);
  const refreshed=JSON.parse(await fs.readFile(path.join(out,'preview-manifest.json'),'utf8'));
  assert.notEqual(manifest.inputDigest,refreshed.inputDigest);
  const invalid=spawnSync(process.execPath,[CLI,'render-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',path.join(root,'invalid'),
      '--views','hero','--size','80'],{encoding:'utf8',timeout:15000});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/preview-only/);
  const badClay=spawnSync(process.execPath,[CLI,'preview-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',path.join(root,'bad-clay'),
      '--neutral-clay','--size','80'],{encoding:'utf8',timeout:15000});
  assert.equal(badClay.status,1);
  assert.match(badClay.stderr,/cannot produce canonical neutral-clay/);
});

test('unified review board binds exact portable, PBR and neutral-clay images and rejects tampering',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const portable=path.join(root,'portable'),pbr=path.join(root,'pbr'),clay=path.join(root,'clay');
  const portableRun=spawnSync(process.execPath,[CLI,'render','--glb',glb,'--frame',frame,'--out',portable,
      '--size','80','--max-working-mb','24'],{encoding:'utf8',timeout:70_000});
  assert.equal(portableRun.status,0,portableRun.stderr);
  const pbrRun=run(glb,frame,pbr,['--no-board']);
  const clayRun=run(glb,frame,clay,['--neutral-clay','--no-board']);
  assert.equal(pbrRun.status,0,pbrRun.stderr);
  assert.equal(clayRun.status,0,clayRun.stderr);
  const board=path.join(root,'unified.png');
  const combine=()=>spawnSync(process.execPath,[CLI,'review-board','--portable',portable,'--pbr',pbr,'--clay',clay,'--out',board],
      {encoding:'utf8',timeout:30000});
  const pass=combine();assert.equal(pass.status,0,pass.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(root,'unified.json'),'utf8'));
  assert.equal(summary.claimScope,'presentation-only');
  assert.equal(summary.eligibleForCertification,false);
  assert.equal(summary.cells.length,12);
  await fs.access(board);
  await fs.writeFile(path.join(clay,'side.png'),Buffer.from('stale-image'));
  const rejected=combine();
  assert.equal(rejected.status,1);
  assert.match(rejected.stderr,/digest mismatch/);
  const preview=path.join(root,'preview');
  const previewRun=spawnSync(process.execPath,[CLI,'preview-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',preview,'--size','80'],
    {encoding:'utf8',timeout:30000});
  assert.equal(previewRun.status,0,previewRun.stderr);
  const invalid=spawnSync(process.execPath,[CLI,'review-board','--portable',portable,'--pbr',preview,'--out',path.join(root,'invalid.png')],
    {encoding:'utf8',timeout:15000});
  assert.equal(invalid.status,1,'a preview manifest must not authorize an official review board');
});

test('PBR publication fault restores the prior complete report, frames and board',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const out=path.join(root,'transaction');
  const first=run(glb,frame,out);
  assert.equal(first.status,0,first.stderr);
  const files=(await fs.readdir(out)).sort();
  const before=Object.fromEntries(await Promise.all(files.map(async file=>[file,await fs.readFile(path.join(out,file),'base64')])));
  await fs.writeFile(frame,JSON.stringify({...FRAME,hero:{...FRAME.hero,fovY:42}}));
  const bad=spawnSync(process.execPath,[CLI,'render-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',out,
    '--size','80','--max-working-mb','24','--timeout-seconds','60'],
    {encoding:'utf8',timeout:70_000,
     env:{...process.env,REFAS_TEST_PBR_PUBLISH_FAIL_AFTER:'2'}});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/injected PBR publication failure/);
  assert.deepEqual((await fs.readdir(out)).sort(),files);
  for(const file of files){
    assert.equal(await fs.readFile(path.join(out,file),'base64'),before[file],file+' must roll back');
  }
  const recovered=run(glb,frame,out,['--no-board']);
  assert.equal(recovered.status,0,recovered.stderr);
  await assert.rejects(fs.access(path.join(out,'pbr-review-board.png')));
  const report=JSON.parse(await fs.readFile(path.join(out,'render-report.json'),'utf8'));
  assert.equal(report.outputs.length,8);
  assert.notEqual(await fs.readFile(path.join(out,'render-report.json'),'base64'),before['render-report.json']);
});

test('preview publish rollback also retains an exact reusable prior manifest',async(t)=>{
  const {root,glb,frame}=await fixture(t);
  const out=path.join(root,'preview-transaction');
  const args=[CLI,'preview-pbr','--backend','legacy','--glb',glb,'--frame',frame,'--out',out,'--size','80',
    '--views','hero,side','--timeout-seconds','60','--max-working-mb','24'];
  const first=spawnSync(process.execPath,args,{encoding:'utf8',timeout:70_000});
  assert.equal(first.status,0,first.stderr);
  const names=(await fs.readdir(out)).sort();
  const contents=Object.fromEntries(await Promise.all(names.map(async n=>[n,await fs.readFile(path.join(out,n),'base64')])));
  await fs.writeFile(frame,JSON.stringify({...FRAME,hero:{...FRAME.hero,fovY:42}}));
  const fail=spawnSync(process.execPath,args,{encoding:'utf8',timeout:70_000,
    env:{...process.env,REFAS_TEST_PBR_PUBLISH_FAIL_AFTER:'1'}});
  assert.notEqual(fail.status,0);
  assert.match(fail.stderr,/injected PBR publication failure/);
  assert.deepEqual((await fs.readdir(out)).sort(),names);
  for(const name of names)assert.equal(await fs.readFile(path.join(out,name),'base64'),contents[name]);
});

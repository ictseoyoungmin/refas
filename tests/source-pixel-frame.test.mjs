import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {
  createCylinder, digestBytes, initProject, partsToGlb,
  inspectSourcePixelFrameBytes,
} from '../skills/refas/scripts/lib/index.mjs';
import {verifySourceBoundObject} from '../skills/refas/scripts/lib/qa-coverage.mjs';

const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
const materials={panel:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:1}};
function generateImage(file, format, orientation=1) {
  const script=[
    'from PIL import Image',
    'import sys',
    'im=Image.new("RGB",(12,8),(35,88,150))',
    'if int(sys.argv[3]) != 1:',
    '  exif=Image.Exif();exif[274]=int(sys.argv[3])',
    '  im.save(sys.argv[1],format=sys.argv[2],exif=exif)',
    'else:',
    '  im.save(sys.argv[1],format=sys.argv[2])',
  ].join('\n');
  const result=spawnSync(PYTHON,['-c',script,file,format,String(orientation)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
async function project(t,{format='PNG',orientation=1,invalid=false,incorrectWidth=false}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-source-pixel-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'source'));
  const file=path.join(root,'source',format==='JPEG'?'reference.jpg':'reference.png');
  if(invalid) await fs.writeFile(file,Buffer.from('not actually an image'));
  else generateImage(file,format,orientation);
  const data=await fs.readFile(file);
  const source={
    schema:'refas.source-manifest/v1',id:'primary',path:path.relative(root,file).split(path.sep).join('/'),
    sha256:digestBytes(data),sizeBytes:data.length,width:incorrectWidth?13:12,height:8,
    authority:'primary',acquisition:{kind:'operator-supplied'},
  };
  await initProject(root,{projectId:'pixel-replay-fixture',source});
  const mesh=createCylinder({center:[0,0,0],radius:0.2,height:0.3,segments:12});
  const asset=path.join(root,'candidate.glb');
  await fs.writeFile(asset,partsToGlb({parts:[{id:'part',materialId:'panel',mesh}],materials}));
  return {root,file,source,data,asset};
}
function pixelCheck(report) { return report.checks.find(x=>x.id==='primary-source-pixel-frame'); }

for(const format of ['PNG','JPEG']) {
  test('trusted source-bound QA replays real '+format+' source pixels from exact file bytes',async t=>{
    const p=await project(t,{format});
    const proof=inspectSourcePixelFrameBytes(p.data,{
      sourceSha256:p.source.sha256,sizeBytes:p.source.sizeBytes,
      width:p.source.width,height:p.source.height,
    });
    assert.equal(proof.sourceSha256,p.source.sha256);
    assert.equal(proof.coordinateSpace,'encoded-top-left');
    assert.equal(proof.width,12);
    const report=await verifySourceBoundObject(p.root,p.asset);
    assert.equal(pixelCheck(report).status,'PASS');
    assert.equal(report.checks.find(x=>x.id==='source-provenance').status,'PASS');
    assert.equal(report.decision.state,'BLOCKED','pixel integrity is not whole-object certification');
  });
}

test('trusted QA refuses a digest-valid, non-image primary source',async t=>{
  const p=await project(t,{invalid:true});
  const report=await verifySourceBoundObject(p.root,p.asset);
  assert.equal(report.checks.find(x=>x.id==='source-provenance').status,'PASS');
  assert.equal(pixelCheck(report).status,'FAIL');
  assert.ok(report.decision.blockingCheckIds.includes('primary-source-pixel-frame'));
});

test('trusted QA refuses a wrong manifest raster coordinate frame even with correct SHA',async t=>{
  const p=await project(t,{incorrectWidth:true});
  const report=await verifySourceBoundObject(p.root,p.asset);
  assert.equal(pixelCheck(report).status,'FAIL');
  assert.match(pixelCheck(report).reason,/dimensions disagree with manifest/u);
});

test('trusted QA refuses EXIF-rotated source without explicit coordinate mapping',async t=>{
  const p=await project(t,{format:'JPEG',orientation:6});
  const report=await verifySourceBoundObject(p.root,p.asset);
  assert.equal(report.checks.find(x=>x.id==='source-provenance').status,'PASS');
  assert.equal(pixelCheck(report).status,'FAIL');
});

test('current source bytes cannot be changed or re-signed to preserve stale pixel evidence',async t=>{
  const p=await project(t);
  const before=await verifySourceBoundObject(p.root,p.asset);
  assert.equal(pixelCheck(before).status,'PASS');
  await fs.writeFile(p.file,Buffer.from('changed raw source'));
  const changed=await verifySourceBoundObject(p.root,p.asset);
  assert.equal(pixelCheck(changed).status,'FAIL');
  assert.equal(changed.checks.find(x=>x.id==='source-provenance').status,'FAIL');
  assert.throws(()=>inspectSourcePixelFrameBytes(p.data,{...p.source,sourceSha256:'0'.repeat(64)}),
    /SHA-256/u);
});

test('source-bound QA never treats absent original pixels as PASS',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-source-pixel-empty-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await initProject(root,{projectId:'without-primary'});
  const mesh=createCylinder({center:[0,0,0],radius:0.2,height:0.3,segments:12});
  const asset=path.join(root,'draft.glb');
  await fs.writeFile(asset,partsToGlb({parts:[{id:'part',materialId:'panel',mesh}],materials}));
  const report=await verifySourceBoundObject(root,asset);
  assert.equal(pixelCheck(report).status,'NOT_RUN');
});

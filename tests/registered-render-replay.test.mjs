import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  createSegmentPrism, partsToGlb, digestBytes, sha256File,
  verifyRegisteredRenderReplay,
} from '../skills/refas/scripts/lib/index.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const REG='a'.repeat(64);
const MATERIALS={panel:{baseColor:[.55,.65,.72,1],metallic:.1,roughness:.6}};

function glb({variant='original'}={}) {
  const mesh=createSegmentPrism({
    start:[-1,0,0],end:variant==='moved'?[.15,0,0]:[1,0,0],
    width:.45,height:variant==='moved'?.95:.35,upHint:[0,1,0],
  });
  return partsToGlb({parts:[{id:'body',scopeId:'whole',materialId:'panel',mesh}],materials:MATERIALS});
}
async function writeJson(file,value) {await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-trusted-glb-render-'));
  t.after(()=>fs.rm(root,{force:true,recursive:true}));
  await fs.mkdir(path.join(root,'model'),{recursive:true});
  await fs.mkdir(path.join(root,'render'),{recursive:true});
  await fs.writeFile(path.join(root,'model/candidate.glb'),glb());
  const canonical={
    schema:'refas.canonical-object-frame/v1',id:'source-selected-whole',scopeId:'whole',
    origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},
    scopeParts:[],hero:{
      position:[0,0,5],target:[0,0,0],up:[0,1,0],fovY:29,registrationDigest:REG,
    },
  };
  await writeJson(path.join(root,'model/frame.json'),canonical);
  const output=path.join(root,'render');
  const run=spawnSync(process.execPath,[CLI,'render',
    '--glb',path.join(root,'model/candidate.glb'),
    '--frame',path.join(root,'model/frame.json'),
    '--out',output,'--size','96','--timeout-seconds','30','--max-working-mb','256',
  ],{encoding:'utf8',timeout:45000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(await fs.readFile(path.join(output,'render-report.json'),'utf8'));
  return {
    root,report,canonical,
    params:{
      root,glbPath:'model/candidate.glb',framePath:'model/frame.json',
      renderReportPath:'render/render-report.json',heroImagePath:'render/hero.png',
      assetSha256:digestBytes(glb()),frameSha256:await sha256File(path.join(output,'hero.png')),
      renderSize:96,
    },
  };
}

test('S02b1 exact current GLB + source-selected canonical camera independently reproduces hero pixels',async t=>{
  const {params,report}=await fixture(t);
  const result=await verifyRegisteredRenderReplay(params);
  assert.equal(result.status,'PASS');
  assert.equal(result.claimScope,'render-provenance-only');
  assert.equal(result.heroSha256,params.frameSha256);
  assert.equal(result.assetSha256,params.assetSha256);
  assert.equal(result.canonicalFrameDigest,report.frameDigest);
  assert.equal(result.cannotAuthorizeReferenceFidelity,true);
});

test('S02b1 actual changed GLB with re-signed candidate SHA and stale claimed hero is rejected',async t=>{
  const {root,params,report}=await fixture(t);
  const changed=glb({variant:'moved'});
  await fs.writeFile(path.join(root,'model/candidate.glb'),changed);
  const changedSha=digestBytes(changed);
  report.assetSha256=changedSha;
  report.asset.sha256=changedSha;
  await writeJson(path.join(root,'render/render-report.json'),report);
  await assert.rejects(
    ()=>verifyRegisteredRenderReplay({...params,assetSha256:changedSha}),
    /registered hero pixels differs from independently replayed source/u,
  );
});

test('S02b1 arbitrary forged render pixels fail even with re-signed PNG and matching render report digests',async t=>{
  const {root,params,report}=await fixture(t);
  const png=path.join(root,'render/hero.png');
  const python=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',[
    '-c','from PIL import Image,ImageDraw; import sys; im=Image.open(sys.argv[1]).convert("RGB"); ImageDraw.Draw(im).rectangle((38,38,58,58),fill=(255,12,34)); im.save(sys.argv[1])',
    png,
  ],{encoding:'utf8'});
  assert.equal(python.status,0,python.stderr);
  const changedSha=await sha256File(png);
  report.heroImageSha256=changedSha;
  report.frames.find(f=>f.path==='hero.png').sha256=changedSha;
  await writeJson(path.join(root,'render/render-report.json'),report);
  await assert.rejects(
    ()=>verifyRegisteredRenderReplay({...params,frameSha256:changedSha}),
    /registered hero pixels differs from independently replayed source/u,
  );
});

test('S02b1 changed frozen source-selected camera fails against original render',async t=>{
  const {root,params,canonical}=await fixture(t);
  canonical.hero.position=[1,0,5];
  await writeJson(path.join(root,'model/frame.json'),canonical);
  await assert.rejects(
    ()=>verifyRegisteredRenderReplay(params),
    /frozen camera frame digest differs|render hero camera differs|registered hero pixels differs/u,
  );
});

test('S02b1 absent source-registered frozen camera cannot authenticate an author-claimed render',async t=>{
  const {root,params,canonical}=await fixture(t);
  delete canonical.hero.registrationDigest;
  await writeJson(path.join(root,'model/frame.json'),canonical);
  await assert.rejects(
    ()=>verifyRegisteredRenderReplay(params),
    /source-registered frozen canonical hero camera/u,
  );
});

test('S02b1 project boundary rejects GLB path traversal and unsupported self-named renderer',async t=>{
  const {root,params,report}=await fixture(t);
  await assert.rejects(()=>verifyRegisteredRenderReplay({...params,glbPath:'../candidate.glb'}),
    /exact project-contained relative path/u);
  report.renderer.name='Claimed third-party renderer';
  await writeJson(path.join(root,'render/render-report.json'),report);
  await assert.rejects(()=>verifyRegisteredRenderReplay(params),/render backend name differs/u);
});

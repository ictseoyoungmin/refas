import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createSegmentPrism,partsToGlb} from '../skills/refas/scripts/lib/index.mjs';
import {
  CPU_RENDER_BACKENDS, getTrustedRenderBackend, normalizeCpuRenderJob,
  renderDiagnosticHero, RENDER_EXECUTION_SCHEMA,
} from '../skills/refas/scripts/lib/render-backend.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-r14-01-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'data'));
  await fs.mkdir(path.join(root,'diagnostics'));
  const mesh=createSegmentPrism({start:[-1,0,0],end:[1,0,0],width:.4,height:.35,upHint:[0,1,0]});
  const bytes=partsToGlb({parts:[{id:'body',scopeId:'whole',materialId:'panel',mesh}],
    materials:{panel:{baseColor:[.5,.6,.7,1],metallic:.1,roughness:.7}}});
  const frame=Buffer.from(JSON.stringify({
    schema:'refas.canonical-object-frame/v1',id:'whole',scopeId:'whole',origin:[0,0,0],
    axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},scopeParts:[],
    hero:{position:[0,0,5],target:[0,0,0],up:[0,1,0],fovY:29,registrationDigest:'a'.repeat(64)},
  }));
  await fs.writeFile(path.join(root,'data','candidate.glb'),bytes);
  await fs.writeFile(path.join(root,'data','frame.json'),frame);
  const job={schema:'refas.render-job/v1',
    asset:{path:'data/candidate.glb',sha256:digest(bytes)},
    frame:{path:'data/frame.json',sha256:digest(frame)},
    backend:{id:'legacy-portable',algorithmVersion:'1.0.0'},
    view:'hero',size:48,resources:{timeoutSeconds:30,maxWorkingMiB:64},intent:'diagnostic'};
  return {root,job};
}

test('trusted registry has pinned legacy and unavailable, non-certifying optimized worker',()=>{
  assert.equal(getTrustedRenderBackend('legacy-portable').identity,'RefAs Portable Rasterizer/1.0.0');
  assert.equal(getTrustedRenderBackend('optimized-cpu').installed,false);
  assert.equal(CPU_RENDER_BACKENDS['optimized-cpu'].admissibleCertification,'none');
  assert.throws(()=>getTrustedRenderBackend('attacker-blender'),/trusted registry/);
});
test('R14-01 renders a digest-bound diagnostic hero without claiming certified replay',async t=>{
  const {root,job}=await fixture(t);
  const output=await renderDiagnosticHero({root,job,outDir:'diagnostics/hero-run'});
  assert.equal(output.schema,RENDER_EXECUTION_SCHEMA);
  assert.equal(output.status,'COMPLETE');
  assert.equal(output.claimScope,'diagnostic-only');
  assert.equal(output.certificationEligible,false);
  assert.equal(output.sourceSha256,job.asset.sha256);
  assert.equal(output.frameSha256,job.frame.sha256);
  assert.equal(output.outputs.length,1);
  const bytes=await fs.readFile(path.join(root,'diagnostics/hero-run/hero.png'));
  assert.equal(digest(bytes),output.outputs[0].sha256);
  const report=JSON.parse(await fs.readFile(path.join(root,'diagnostics/hero-run/execution.json'),'utf8'));
  assert.equal(report.outputs[0].sha256,output.outputs[0].sha256);
  await assert.rejects(()=>renderDiagnosticHero({root,job,outDir:'diagnostics/hero-run'}),/already exists/);
});
test('R14-01 refuses stale GLB/frame digests and path traversal',async t=>{
  const {root,job}=await fixture(t);
  const invalid={...job,asset:{...job.asset,sha256:'f'.repeat(64)}};
  await assert.rejects(()=>renderDiagnosticHero({root,job:invalid,outDir:'diagnostics/no-write'}),/source SHA mismatch/);
  await assert.rejects(fs.access(path.join(root,'diagnostics/no-write')));
  await assert.rejects(()=>renderDiagnosticHero({root,job:{...job,frame:{...job.frame,path:'../frame.json'}},
    outDir:'diagnostics/traversal'}),/project-contained/);
  await assert.rejects(()=>renderDiagnosticHero({root,job,outDir:'../escape'}),/project-contained/);
  assert.throws(()=>normalizeCpuRenderJob({...job,intent:'certify'}),/diagnostic-only/);
  assert.throws(()=>normalizeCpuRenderJob({...job,backend:{id:'legacy-portable',algorithmVersion:'2.0.0'}}),/algorithmVersion/);
});
test('optimized CPU cannot impersonate the legacy profile or silently fallback',async t=>{
  const {root,job}=await fixture(t);
  const result=await renderDiagnosticHero({root,job:{...job,backend:{id:'optimized-cpu',algorithmVersion:'1'}},
    outDir:'diagnostics/optimized'});
  assert.equal(result.status,'BLOCKED_UNSUPPORTED');
  assert.equal(result.outputs.length,0);
  assert.equal(result.claimScope,'diagnostic-only');
  await assert.rejects(fs.access(path.join(root,'diagnostics/optimized')));
});
test('resource blocked is not reported as a defective asset or a valid render',async t=>{
  const {root,job}=await fixture(t);
  const output=await renderDiagnosticHero({root,job:{...job,size:1024,resources:{timeoutSeconds:10,maxWorkingMiB:8}},
    outDir:'diagnostics/resource-refused'});
  assert.equal(output.status,'BLOCKED_RESOURCE',output.reason);
  assert.equal(output.outputs.length,0);
  await assert.rejects(fs.access(path.join(root,'diagnostics/resource-refused')));
});

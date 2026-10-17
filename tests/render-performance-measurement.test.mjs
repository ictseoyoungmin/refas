import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runMeasurement} from '../skills/refas/scripts/measure_render_pbr.mjs';

test('nondegenerate renderer benchmark records full, preview and cache reuse with bounded resource accounting',async(t)=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-render-measurement-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const reportPath=path.join(root,'results.json');
  const report=await runMeasurement({segments:22,rings:14,objects:2,size:48,'timeout-seconds':60,'max-working-mb':512,out:reportPath});
  assert.equal(report.schema,'refas.renderer-workload-measurement/v1');
  assert.equal(report.claimScope,'measurement-only');
  assert.equal(report.candidate.kind,'procedural-nondegenerate');
  assert.ok(report.candidate.estimatedTriangles>=500);
  assert.equal(report.measurements.length,3);
  assert.deepEqual(report.measurements.map(v=>v.label),['canonical-full-8','iterative-preview-hero-side','identical-preview-reuse']);
  assert.ok(report.measurements.every(x=>x.status==='PASS'),JSON.stringify(report.measurements));
  assert.equal(report.finding.everyRunSucceeded,true);
  assert.equal(report.finding.measuredCacheHit,true);
  assert.equal(report.measurements[2].reportedStatus,'REUSED');
  assert.ok(report.measurements.every(x=>x.wallMs>=0&&x.peakRssKiB!==undefined));
  assert.equal(report.finding.sourceResemblanceCertified,false);
  const written=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(written.candidate.sha256,report.candidate.sha256);
  // Stable machine-readable resource observations are useful; not a speedup claim.
  console.log('RENDER PERFORMANCE MEASUREMENT',JSON.stringify(report.measurements.map(({label,wallMs,peakRssKiB,failureKind})=>({label,wallMs,peakRssKiB,failureKind}))));
});

test('renderer benchmark discloses memory-budget failure rather than reporting a false pass',async()=>{
  const report=await runMeasurement({segments:10,rings:6,objects:1,size:1024,'timeout-seconds':8,'max-working-mb':8});
  assert.equal(report.finding.everyRunSucceeded,false);
  assert.ok(report.measurements.some(x=>x.status==='FAIL'&&x.failureKind==='memory-budget'));
  assert.equal(report.finding.sourceResemblanceCertified,false);
});

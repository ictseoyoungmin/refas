import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

const script=path.resolve('skills/refas/scripts/benchmark_render_cpu.py');
const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';

function measured(args,timeout=90_000){
  return spawnSync(python,[script,...args],{encoding:'utf8',timeout,maxBuffer:8*1024*1024});
}

test('R14-00 produces a real indexed nondegenerate mesh and bounded measured hero',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-r14-benchmark-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const outfile=path.join(root,'measurement.json');
  const fixture=path.join(root,'fixture');
  const done=measured(['--case','organic','--triangles','502','--views','hero','--size','36',
    '--tile-size','16','--timeout-seconds','30','--max-working-mb','64',
    '--save-fixture',fixture,'--out',outfile]);
  assert.equal(done.status,0,done.stderr);
  const report=JSON.parse(await fs.readFile(outfile,'utf8'));
  assert.equal(report.schema,'refas.cpu-render-benchmark/v1');
  assert.equal(report.claimScope,'measurement-only');
  assert.equal(report.backend,'RefAs Portable Rasterizer/1.0.0');
  assert.equal(report.generated.triangles,502);
  assert.ok(report.generated.sampledMinArea>0);
  assert.equal(report.summary.runsCompleted,1);
  assert.equal(report.summary.everyRunCompleted,true);
  assert.equal(report.measurements[0].status,'COMPLETE');
  assert.equal(report.measurements[0].output.actualTriangles,502);
  assert.equal(report.measurements[0].output.viewResults.length,1);
  assert.match(report.measurements[0].output.viewResults[0].pngSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.measurements[0].output.stageMs.triangleSetupBinningRasterShadingSeparatelyMeasured,false);
  await fs.access(path.join(fixture,'benchmark.glb'));
  await fs.access(path.join(fixture,'frame.json'));
});

test('R14-00 dense strands generated as real geometry with a stable seed',async()=>{
  const args=['--case','strands','--triangles','1201','--seed','47','--dry-run'];
  const first=measured(args);
  const second=measured(args);
  assert.equal(first.status,0,first.stderr);
  assert.equal(second.status,0,second.stderr);
  const a=JSON.parse(first.stdout),b=JSON.parse(second.stdout);
  assert.equal(a.generated.triangles,1201);
  assert.equal(a.generated.estimatedDegenerateTriangles,0);
  assert.ok(a.generated.sampledMinArea>0);
  assert.equal(a.asset.sha256,b.asset.sha256);
  assert.equal(a.summary.runsCompleted,0);
  assert.equal(a.summary.everyRunCompleted,false);
  assert.equal(a.claimScope,'measurement-only');
});

test('R14-00 distinguishes resource refusal from malformed asset and false performance PASS',async()=>{
  const result=measured(['--case','hard-surface','--triangles','50000','--size','32',
    '--max-working-mb','1','--timeout-seconds','10']);
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.generated.triangles,50000);
  assert.equal(report.summary.runsCompleted,0);
  assert.equal(report.summary.everyRunCompleted,false);
  assert.equal(report.measurements[0].status,'BLOCKED_RESOURCE');
  assert.equal(report.measurements[0].output,null);
  assert.equal(report.claimScope,'measurement-only');
});

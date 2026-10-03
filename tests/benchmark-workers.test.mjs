import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {digestJson} from '../skills/refas/scripts/lib/index.mjs';

const script = path.resolve('examples/benchmark-matrix/run-workers.mjs');
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(root, {scoreField = false, selfReportedMetrics = false, emitMultiview = true, emitReopen = true} = {}) {
  const references = [];
  const categories = {articulated:'articulated-manufactured-organic',mechanical:'hard-surface-mechanical',irregular:'irregular-nonmechanical'};
  for (const id of Object.keys(categories)) {
    const bytes = Buffer.from(`independent source: ${id}`);
    await fs.writeFile(path.join(root, `${id}.png`), bytes);
    references.push({id, category: categories[id], path: `${id}.png`, sha256: digest(bytes)});
  }
  await fs.writeFile(path.join(root, 'common.txt'), 'shared task');
  for (const id of ['plain', 'guided']) await fs.writeFile(path.join(root, `${id}.txt`), `${id} prompt`);

  const routeCore = {
    schema: 'refas.repair-route/v1', action: 'REOPEN_CAPABILITY', scopeId: 'whole',
    ownerCapability: 'shape-reconstruction', rollbackCheckpointId: null,
    invalidatedCapabilities: [],
    finding: {schema:'refas.finding/v1',category:'fixture',severity:'major',scopeId:'whole',summary:'fixture reopen',evidenceRefs:['fixture'],ownerCapability:'shape-reconstruction',introducedByEdit:false,routable:true,blocking:true,evidenceSufficient:true},
    reason: 'fixture reopen',
  };
  const route = {...routeCore, routeDigest: digestJson(routeCore)};
  const workerFile = path.join(root, 'worker.mjs');
  const extraOutcome = `${selfReportedMetrics ? ",reopenCount:99,firstMultiviewSeconds:0.001" : ''}${scoreField ? ",resemblanceScore:0.99" : ''}`;
  await fs.writeFile(workerFile, `import fs from 'node:fs/promises'; import path from 'node:path';\nconst out=process.env.REFAS_BENCHMARK_OUTPUT; await fs.writeFile(path.join(out,'proof.json'),JSON.stringify({source:process.env.REFAS_BENCHMARK_REFERENCE,commit:process.env.REFAS_BENCHMARK_REFAS_COMMIT})); ${emitMultiview ? `await fs.mkdir(path.join(out,'renders','clay'),{recursive:true}); await fs.writeFile(path.join(out,'renders','clay','render-report.json'),JSON.stringify({presentation:{mode:'neutral-clay'},reportDigest:'${'a'.repeat(64)}',outputs:['hero','side','top','oblique','grazing'].map(viewId=>({viewId}))}));` : ''} ${emitReopen ? `await fs.writeFile(path.join(out,'reopen.json'),${JSON.stringify(JSON.stringify(route))});` : ''} await fs.writeFile(path.join(out,'outcome.json'),JSON.stringify({r04:'HOLD',vc03:'INSUFFICIENT',vc04:'HOLD',certification:'not-attempted',evidence:[{path:'proof.json'}]${extraOutcome}}));`);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  return {
    refasRoot: process.cwd(), expectedRefasCommit: head, references,
    commonPrompt:'common.txt', prompts: [{id:'plain',path:'plain.txt'},{id:'guided',path:'guided.txt'}],
    workers: [
      {id:'model-a',provider:'fixture-a',model:'a',executable:process.execPath,args:[workerFile],timeoutSeconds:10},
      {id:'model-b',provider:'fixture-b',model:'b',executable:process.execPath,args:[workerFile],timeoutSeconds:10},
    ],
  };
}

test('worker matrix runs every cell and runner derives operational observations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-benchmark-'));
  try {
    const manifest = await fixture(root);
    const manifestPath = path.join(root, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const dry = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'plan'), '--dry-run', 'true'], {encoding:'utf8'});
    assert.equal(dry.status, 0, dry.stderr);
    const plan = JSON.parse(await fs.readFile(path.join(root,'plan','plan.json'),'utf8'));
    assert.equal(plan.cells, 12);
    assert.equal(plan.refasCommit, manifest.expectedRefasCommit);
    assert.equal(plan.policy.aggregateScoreForbidden, true);
    assert.equal(plan.policy.exactCheckoutInstructionsOnly, true);
    assert.equal(plan.policy.operationalMetricsRunnerDerived, true);

    const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'runs')], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
    assert.equal(matrix.results.length, 12);
    assert.equal(matrix.complete, true);
    assert.equal(matrix.fullMatrix, true);
    assert.equal(matrix.refasCommit, manifest.expectedRefasCommit);
    assert.equal(matrix.policy.completeDoesNotMeanAccepted, true);
    assert.equal(matrix.policy.operationalMetricsRunnerDerived, true);
    assert.ok(matrix.results.every((item) => item.logs.length === 2));
    assert.ok(matrix.results.every((item) => item.outcome?.evidence[0]?.sha256 && !item.error));
    assert.ok(matrix.results.every((item) => item.outcome.reopenCount === 1));
    assert.ok(matrix.results.every((item) => Number.isFinite(item.outcome.firstMultiviewSeconds) && item.outcome.firstMultiviewSeconds >= 0));
    assert.ok(matrix.results.every((item) => item.outcome.observations.reopen.evidence[0]?.routeDigest));
    assert.ok(matrix.results.every((item) => item.outcome.observations.firstMultiview.evidence?.viewIds.length === 5));

    const one = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'one'), '--only', 'articulated--model-a--plain'], {encoding:'utf8'});
    assert.equal(one.status, 0, one.stderr);
    const partial = JSON.parse(await fs.readFile(path.join(root,'one','matrix.json'),'utf8'));
    assert.equal(partial.results.length, 1);
    assert.equal(partial.complete, true);
    assert.equal(partial.fullMatrix, false);

    const wrongCommit = structuredClone(manifest);
    wrongCommit.expectedRefasCommit = '0'.repeat(40);
    await fs.writeFile(path.join(root,'wrong-commit.json'), JSON.stringify(wrongCommit));
    const mismatchCommit = spawnSync(process.execPath, [script, '--manifest', path.join(root,'wrong-commit.json'), '--out', path.join(root,'wrong-commit')], {encoding:'utf8'});
    assert.notEqual(mismatchCommit.status, 0);
    assert.match(mismatchCommit.stderr, /checkout mismatch/u);

    const invalidClass = structuredClone(manifest);
    invalidClass.references[0].category = 'invented';
    await fs.writeFile(path.join(root,'invalid-class.json'), JSON.stringify(invalidClass));
    const wrongClass = spawnSync(process.execPath, [script, '--manifest', path.join(root,'invalid-class.json'), '--out', path.join(root,'invalid-class'), '--dry-run', 'true'], {encoding:'utf8'});
    assert.notEqual(wrongClass.status, 0);
    assert.match(wrongClass.stderr, /invalid reference/u);

    await fs.writeFile(path.join(root,'mechanical.png'), 'changed');
    const mismatch = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'other')], {encoding:'utf8'});
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /reference digest mismatch/u);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('runner records unavailable operational observations as null and zero without worker guesses', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-benchmark-observation-'));
  try {
    const manifest = await fixture(root, {emitMultiview:false, emitReopen:false});
    const manifestPath = path.join(root, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'runs'), '--only', 'articulated--model-a--plain'], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
    assert.equal(matrix.complete, true);
    assert.equal(matrix.results[0].outcome.reopenCount, 0);
    assert.equal(matrix.results[0].outcome.firstMultiviewSeconds, null);
    assert.equal(matrix.results[0].outcome.observations.firstMultiview.evidence, null);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('worker matrix rejects self-reported operational metrics and aggregate evaluative fields', async () => {
  for (const [name, options, pattern] of [
    ['self-report', {selfReportedMetrics:true}, /worker outcome fields must be exactly/u],
    ['score', {scoreField:true}, /prohibited aggregate\/evaluative field/u],
  ]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `refas-benchmark-${name}-`));
    try {
      const manifest = await fixture(root, options);
      const manifestPath = path.join(root, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'runs'), '--only', 'articulated--model-a--plain'], {encoding:'utf8'});
      assert.equal(result.status, 0, result.stderr);
      const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
      assert.equal(matrix.complete, false);
      assert.match(matrix.results[0].error, pattern);
      assert.equal(matrix.results[0].outcome, null);
    } finally { await fs.rm(root,{recursive:true,force:true}); }
  }
});

test('benchmark prompts isolate checkout instructions and keep guidance roles distinct', async () => {
  const promptRoot = path.resolve('examples/benchmark-matrix/prompts');
  const common = await fs.readFile(path.join(promptRoot, 'common.md'), 'utf8');
  const plain = await fs.readFile(path.join(promptRoot, 'plain.md'), 'utf8');
  const guided = await fs.readFile(path.join(promptRoot, 'guided.md'), 'utf8');
  assert.match(common, /exact RefAs checkout path/u);
  assert.match(common, /globally installed, cached, newer, sibling/u);
  assert.doesNotMatch(common, /Record rejected hypotheses|Produce actual neutral-clay multiview/u);
  assert.match(plain, /exact checkout path/u);
  assert.doesNotMatch(plain, /Follow the installed RefAs instructions/u);
  assert.match(guided, /measured checkout contains contracts/u);
  assert.doesNotMatch(guided, /v1\.2/u);
});

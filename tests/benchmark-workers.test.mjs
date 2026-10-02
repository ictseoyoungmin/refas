import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const script = path.resolve('examples/benchmark-matrix/run-workers.mjs');
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(root, {scoreField = false} = {}) {
  const references = [];
  const categories = {articulated:'articulated-manufactured-organic',mechanical:'hard-surface-mechanical',irregular:'irregular-nonmechanical'};
  for (const id of Object.keys(categories)) {
    const bytes = Buffer.from(`independent source: ${id}`);
    await fs.writeFile(path.join(root, `${id}.png`), bytes);
    references.push({id, category: categories[id], path: `${id}.png`, sha256: digest(bytes)});
  }
  await fs.writeFile(path.join(root, 'common.txt'), 'shared task');
  for (const id of ['plain', 'guided']) await fs.writeFile(path.join(root, `${id}.txt`), `${id} prompt`);
  const workerFile = path.join(root, 'worker.mjs');
  await fs.writeFile(workerFile, `import fs from 'node:fs/promises'; import path from 'node:path';\nconst out=process.env.REFAS_BENCHMARK_OUTPUT; await fs.writeFile(path.join(out,'proof.json'),JSON.stringify({source:process.env.REFAS_BENCHMARK_REFERENCE,commit:process.env.REFAS_BENCHMARK_REFAS_COMMIT})); await fs.writeFile(path.join(out,'outcome.json'),JSON.stringify({r04:'HOLD',vc03:'INSUFFICIENT',vc04:'HOLD',certification:'not-attempted',reopenCount:0,firstMultiviewSeconds:null,evidence:[{path:'proof.json'}]${scoreField ? ",resemblanceScore:0.99" : ''}}));`);
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

test('worker matrix runs every cell and binds commit, sources, prompts, logs, and evidence', async () => {
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

    const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'runs')], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
    assert.equal(matrix.results.length, 12);
    assert.equal(matrix.complete, true);
    assert.equal(matrix.fullMatrix, true);
    assert.equal(matrix.refasCommit, manifest.expectedRefasCommit);
    assert.equal(matrix.policy.completeDoesNotMeanAccepted, true);
    assert.ok(matrix.results.every((item) => item.logs.length === 2));
    assert.ok(matrix.results.every((item) => item.outcome?.evidence[0]?.sha256 && !item.error));
    assert.ok(matrix.results.every((item) => item.outcome.firstMultiviewSeconds === null));

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

test('worker matrix rejects aggregate score or ranking fields from worker outcomes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-benchmark-score-'));
  try {
    const manifest = await fixture(root, {scoreField:true});
    const manifestPath = path.join(root, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [script, '--manifest', manifestPath, '--out', path.join(root,'runs'), '--only', 'articulated--model-a--plain'], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
    assert.equal(matrix.complete, false);
    assert.match(matrix.results[0].error, /prohibited aggregate\/evaluative field/u);
    assert.equal(matrix.results[0].outcome, null);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

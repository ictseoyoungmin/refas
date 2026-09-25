import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const script = path.resolve('examples/benchmark-matrix/run-workers.mjs');
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('worker matrix runs every cell and binds source and evidence bytes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-benchmark-'));
  try {
    const references = [];
    for (const id of ['articulated', 'mechanical', 'irregular']) {
      const bytes = Buffer.from(`independent source: ${id}`);
      await fs.writeFile(path.join(root, `${id}.png`), bytes);
      references.push({id, category: id, path: `${id}.png`, sha256: digest(bytes)});
    }
    await fs.writeFile(path.join(root, 'common.txt'), 'shared task');
    for (const id of ['plain', 'guided']) await fs.writeFile(path.join(root, `${id}.txt`), `${id} prompt`);
    const workerFile = path.join(root, 'worker.mjs');
    await fs.writeFile(workerFile, `import fs from 'node:fs/promises'; import path from 'node:path';\nconst out=process.env.REFAS_BENCHMARK_OUTPUT; await fs.writeFile(path.join(out,'proof.json'),JSON.stringify({source:process.env.REFAS_BENCHMARK_REFERENCE})); await fs.writeFile(path.join(out,'outcome.json'),JSON.stringify({r04:'HOLD',vc03:'INSUFFICIENT',vc04:'HOLD',certification:'not-attempted',reopenCount:0,firstMultiviewSeconds:null,evidence:[{path:'proof.json'}]}));`);
    const manifest = {references, commonPrompt:'common.txt', prompts: [{id:'plain',path:'plain.txt'},{id:'guided',path:'guided.txt'}], workers: [{id:'model-a',model:'a',executable:process.execPath,args:[workerFile],timeoutSeconds:10},{id:'model-b',model:'b',executable:process.execPath,args:[workerFile],timeoutSeconds:10}]};
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [script, '--manifest', path.join(root,'manifest.json'), '--out', path.join(root,'runs')], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(await fs.readFile(path.join(root,'runs','matrix.json'),'utf8'));
    assert.equal(matrix.results.length, 12);
    assert.equal(matrix.complete, true);
    assert.ok(matrix.results.every((item) => item.logs.length === 2));
    assert.ok(matrix.results.every((item) => item.outcome?.evidence[0]?.sha256 && !item.error));
    await fs.writeFile(path.join(root,'mechanical.png'), 'changed');
    const mismatch = spawnSync(process.execPath, [script, '--manifest', path.join(root,'manifest.json'), '--out', path.join(root,'other')], {encoding:'utf8'});
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /reference digest mismatch/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

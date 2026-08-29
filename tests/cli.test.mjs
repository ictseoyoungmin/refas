import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

const CLI = path.resolve('skills/refas/scripts/refas.mjs');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {encoding: 'utf8'});
}

test('CLI help exposes recovery, validation, and certification commands', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  const help = JSON.parse(result.stdout);
  assert.equal(help.version, '1.0.0');
  for (const command of ['source-manifest', 'resume', 'abort-edit', 'report-finding', 'validate-spec', 'certify']) assert.ok(help.commands[command]);
  assert.match(help.commands.render, /--timeout-seconds 300/);
  assert.match(help.commands.render, /--max-working-mb 512/);
  assert.match(help.commands.render, /--max-triangles N/);
  assert.match(help.commands.render, /--frame canonical-frame.json/);
  assert.match(help.commands['render-pbr'], /--frame canonical-frame.json/);
  assert.match(help.commands['render-pbr'], /--timeout-seconds 180/);
  assert.match(help.commands['fit-parameters'], /--root DIR/);
});

test('CLI runs a joint parameter evaluator and emits a validated report', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-fit-cli-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const planPath = path.join(root, 'plan.json'), workerPath = path.join(root, 'worker.mjs'), reportPath = path.join(root, 'report.json');
  await fs.writeFile(planPath, JSON.stringify({
    id: 'cli-shape-fit', scopeId: 'whole', sourceSha256: 'a'.repeat(64),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: createHash('sha256').update('b').digest('hex'), sizeBytes: 1},
    parameters: [
      {id: 'span', binding: 'shape.span', minimum: -2, maximum: 2, initial: -1},
      {id: 'bend', binding: 'shape.bend', minimum: -2, maximum: 2, initial: 1},
    ],
    objectives: [{id: 'fit-error', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 7, populationSize: 6, evaluationBudget: 20, patience: 18},
  }));
  await fs.writeFile(workerPath, `
    import fs from 'node:fs/promises'; import path from 'node:path'; import {createHash} from 'node:crypto';
    export async function evaluate(parameters, context) {
      const make = async (name, kind) => { const bytes=Buffer.from(name); await fs.writeFile(path.join(context.artifactRoot,name),bytes); return {schema:'refas.content-reference/v1',kind,path:name,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}; };
      return {measurements:{'fit-error':(parameters.span-0.7)**2+(parameters.bend+0.4)**2}, candidateAsset:await make(context.trialId+'.glb','glb'), renderEvidence:await make(context.trialId+'.json','render-report')};
    }
  `);
  await fs.writeFile(path.join(root, 'baseline.glb'), 'b');
  const result = run(['fit-parameters', '--root', root, '--plan', planPath, '--worker', workerPath, '--out', reportPath]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout), report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(summary.reportDigest, report.reportDigest);
  assert.equal(report.ownerCapability, 'shape-reconstruction');
  assert.ok(report.evaluationCount <= 20);
  const validated = run(['validate-spec', '--file', reportPath]);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).valid, true);
});

test('CLI resume returns one safe next action and unknown commands fail actionably', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-cli-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const initialized = run(['init', '--root', root, '--project', 'cli-study']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const resumed = run(['resume', '--root', root]);
  assert.equal(resumed.status, 0, resumed.stderr);
  const guidance = JSON.parse(resumed.stdout);
  assert.deepEqual(guidance.activeWork, {capability: 'source-intake', scopeId: 'whole'});
  assert.equal(guidance.nextAction, 'BIND_PRIMARY_SOURCE');

  const unknown = run(['invent-geometry']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown command: invent-geometry/);
});

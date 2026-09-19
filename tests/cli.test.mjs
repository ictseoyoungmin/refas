import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

const CLI = path.resolve('skills/refas/scripts/refas.mjs');

function run(args, {cli = CLI, cwd} = {}) {
  return spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8', cwd});
}

test('CLI help exposes recovery, validation, and certification commands', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  const help = JSON.parse(result.stdout);
  assert.equal(help.version, '1.1.0');
  for (const command of ['source-manifest', 'resume', 'abort-edit', 'report-finding', 'validate-spec', 'certify', 'describe']) assert.ok(help.commands[command]);
  assert.match(help.commands.describe, /describe node <instruction-node-id>/);
  assert.match(help.commands.describe, /describe capability <runtime-capability-id>/);
  assert.match(help.commands.render, /--timeout-seconds 300/);
  assert.match(help.commands.render, /--max-working-mb 512/);
  assert.match(help.commands.render, /--max-triangles N/);
  assert.match(help.commands.render, /--frame canonical-frame.json/);
  assert.match(help.commands['render-pbr'], /--frame canonical-frame.json/);
  assert.match(help.commands['render-pbr'], /--timeout-seconds 180/);
  assert.match(help.commands['fit-parameters'], /--root DIR/);
});

test('CLI describe resolves every instruction node and runtime capability exactly', async () => {
  const graph = JSON.parse(await fs.readFile(path.resolve('skills/refas/references/GRAPH.json'), 'utf8'));
  for (const node of graph.nodes) {
    const result = run(['describe', 'node', node.id]);
    assert.equal(result.status, 0, result.stderr);
    const described = JSON.parse(result.stdout);
    assert.equal(described.namespace, 'node');
    assert.equal(described.id, node.id);
    assert.equal(described.path, node.path);
    assert.deepEqual(described.owners, node.owners);
    assert.deepEqual(described.runtimeCapabilities, node.runtimeCapabilities);
    assert.deepEqual(described.interface, node.interface);
  }

  const capabilities = [...new Set(graph.nodes.flatMap((node) => node.runtimeCapabilities))];
  assert.equal(capabilities.length, 11);
  for (const capability of capabilities) {
    const result = run(['describe', 'capability', capability]);
    assert.equal(result.status, 0, result.stderr);
    const described = JSON.parse(result.stdout);
    assert.equal(described.namespace, 'capability');
    assert.equal(described.id, capability);
    const expected = graph.nodes.filter((node) => node.runtimeCapabilities.includes(capability)).map((node) => node.id);
    assert.deepEqual(described.nodes.map((node) => node.id), expected);
    assert.ok(described.nodes.every((node) => node.runtimeCapabilities.includes(capability)));
  }
});

test('CLI describe rejects ambiguous, routing-only, and unknown lookups without guessing', () => {
  for (const args of [
    ['describe'],
    ['describe', 'assembly'],
    ['describe', 'node'],
    ['describe', 'capability'],
    ['describe', 'node', 'assembly', 'extra'],
    ['describe', 'capability', 'assembly', 'extra'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /describe/);
  }

  const control = run(['describe', 'capability', 'control']);
  assert.equal(control.status, 1);
  assert.match(control.stderr, /unknown runtime capability: control/);

  const unknownNode = run(['describe', 'node', 'not-a-node']);
  assert.equal(unknownNode.status, 1);
  assert.match(unknownNode.stderr, /unknown instruction node: not-a-node/);

  const unknownCapability = run(['describe', 'capability', 'not-a-capability']);
  assert.equal(unknownCapability.status, 1);
  assert.match(unknownCapability.stderr, /unknown runtime capability: not-a-capability/);
});

test('CLI describe works from a bare copied installed skill with repository absent', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-describe-installed-'));
  t.after(() => fs.rm(temp, {recursive: true, force: true}));
  const installed = path.join(temp, 'refas');
  await fs.cp(path.resolve('skills/refas'), installed, {recursive: true});
  const installedCli = path.join(installed, 'scripts', 'refas.mjs');

  const node = run(['describe', 'node', 'attachment-follow'], {cli: installedCli, cwd: temp});
  assert.equal(node.status, 0, node.stderr);
  const describedNode = JSON.parse(node.stdout);
  assert.equal(describedNode.id, 'attachment-follow');
  assert.equal(describedNode.interface.interfaces.length, 2);
  assert.deepEqual(describedNode.runtimeCapabilities, ['assembly']);

  const capability = run(['describe', 'capability', 'assembly'], {cli: installedCli, cwd: temp});
  assert.equal(capability.status, 0, capability.stderr);
  const describedCapability = JSON.parse(capability.stdout);
  assert.equal(describedCapability.id, 'assembly');
  assert.ok(describedCapability.nodes.some((entry) => entry.id === 'backend-export'));
  assert.ok(describedCapability.nodes.some((entry) => entry.id === 'realized-contact-support'));
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
    objectives: [{id: 'fit-error', goal: 'minimize', scale: 1, weight: 1, authority: 'RANKING_ALLOWED'}],
    optimizer: {seed: 7, populationSize: 6, evaluationBudget: 20, patience: 18},
  }));
  await fs.writeFile(workerPath, `
    import fs from 'node:fs/promises'; import path from 'node:path'; import {createHash} from 'node:crypto';
    export async function evaluate(parameters, context) {
      const make = async (name, kind, contents=name) => { const bytes=Buffer.from(contents); await fs.writeFile(path.join(context.artifactRoot,name),bytes); return {schema:'refas.content-reference/v1',kind,path:name,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}; };
      const candidateName = context.phase === 'baseline' ? 'baseline.glb' : context.trialId+'.glb';
      return {measurements:{'fit-error':(parameters.span-0.7)**2+(parameters.bend+0.4)**2}, candidateAsset:await make(candidateName,'glb', context.phase === 'baseline' ? 'b' : candidateName), renderEvidence:await make(context.trialId+'.json','render-report')};
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

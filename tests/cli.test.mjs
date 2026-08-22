import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
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

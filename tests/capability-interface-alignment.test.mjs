import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {analyzeCapabilityInterfaces} from '../skills/refas/scripts/verify_capability_interfaces.mjs';

const CLI = path.resolve('skills/refas/scripts/refas.mjs');

function runCli(args, cli = CLI, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8', cwd});
}

test('AD03 enumerates and executes public constructor contracts per interface', async () => {
  const report = await analyzeCapabilityInterfaces();
  assert.equal(report.status, 'PASS', report.errors.join('\n'));
  assert.equal(report.instructionNodes, 40);
  assert.equal(report.executableInterfaces, 83);
  assert.equal(report.constructorContracts, 42);
  assert.equal(report.constructorContractsExercised, 42);
  assert.ok(report.declaredTemplates >= 42);

  const keys = new Set(report.audited.map((item) => item.key));
  assert.equal(keys.size, 83);
  for (const key of [
    'relational-structure/relational-structure',
    'inference-authority/semantic-authority',
    'whole-system-relational-barrier/relational-barrier',
    'candidate-transactions/candidate-transaction',
    'validation/visual-review',
    'physical-claims/physical-claim-evidence',
  ]) {
    const item = report.audited.find((candidate) => candidate.key === key);
    assert.ok(item, key);
    assert.equal(item.constructorExercised, true, key);
    assert.equal(item.materializedInput, true, key);
  }
});

test('AD03 describe exposes canonical placeholders and public enum constants', () => {
  const relation = runCli(['describe', 'node', 'relational-structure']);
  assert.equal(relation.status, 0, relation.stderr);
  const relationJson = JSON.parse(relation.stdout);
  const relationInterface = relationJson.interface.interfaces.find((item) => item.id === 'relational-structure');
  assert.equal(relationInterface.templateProcessor.library, 'materializeCapabilityInputTemplate');
  assert.ok(relationInterface.templateContract.requirements.values.some((item) => item.name === 'sourceSha256'));
  assert.ok(Array.isArray(relationInterface.publicConstantValues.RELATIONAL_RELATION_KINDS));

  const authority = runCli(['describe', 'node', 'inference-authority']);
  assert.equal(authority.status, 0, authority.stderr);
  const authorityJson = JSON.parse(authority.stdout);
  const authorityInterface = authorityJson.interface.interfaces.find((item) => item.id === 'semantic-authority');
  assert.ok(authorityInterface.templateContract.requirements.values.some((item) => item.name === 'targetDigest'));
  assert.ok(authorityInterface.publicConstantValues.SEMANTIC_AUTHORITY_CLASSES.includes('observed'));
});

test('AD03 verifier passes from a bare copied installed skill', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-ad03-installed-'));
  t.after(() => fs.rm(temp, {recursive: true, force: true}));
  const installed = path.join(temp, 'refas');
  await fs.cp(path.resolve('skills/refas'), installed, {recursive: true});
  const verifier = path.join(installed, 'scripts', 'verify_capability_interfaces.mjs');
  const result = spawnSync(process.execPath, [verifier], {cwd: temp, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'PASS');
  assert.equal(report.instructionNodes, 40);
  assert.equal(report.executableInterfaces, 83);
  assert.equal(report.constructorContracts, 42);
  assert.equal(report.constructorContractsExercised, 42);
});

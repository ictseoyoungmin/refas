import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {verifyPluginDistribution} from '../tools/verify-plugin-distribution.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'package.json',
  'skills/refas/SKILL.md',
  'skills/refas/assets/icon.svg',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-plugin-distribution-'));
  for (const relative of FILES) {
    const destination = path.join(root, relative);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.copyFile(path.join(ROOT, relative), destination);
  }
  return root;
}

async function rewriteJson(root, relative, mutate) {
  const absolute = path.join(root, relative);
  const value = JSON.parse(await fs.readFile(absolute, 'utf8'));
  mutate(value);
  await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

test('plugin distribution adapters resolve one canonical RefAs skill tree', async () => {
  const result = await verifyPluginDistribution({root: ROOT});
  assert.equal(result.status, 'PASS');
  assert.equal(result.version, '1.1.0');
  assert.equal(result.skillSource, './skills/');
  assert.deepEqual(result.adapters, ['claude', 'codex', 'agents']);
});

test('plugin distribution rejects manifest version drift', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await rewriteJson(root, '.codex-plugin/plugin.json', (value) => { value.version = '0.0.0'; });
  await assert.rejects(verifyPluginDistribution({root}), /version must match package\.json/u);
});

test('plugin distribution rejects alternate skill sources', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await rewriteJson(root, '.agents/plugins/marketplace.json', (value) => { value.plugins[0].source.path = './other-skills/'; });
  await assert.rejects(verifyPluginDistribution({root}), /canonical skills tree/u);
});

test('plugin distribution rejects icon drift or missing product identity', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await rewriteJson(root, '.codex-plugin/plugin.json', (value) => { value.interface.logo = './skills/refas/assets/other.svg'; });
  await assert.rejects(verifyPluginDistribution({root}), /canonical RefAs icon/u);
});

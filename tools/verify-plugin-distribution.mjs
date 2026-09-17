#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const SKILL_SOURCE = './skills/';
const ICON_PATH = './skills/refas/assets/icon.svg';

async function readJson(root, relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}

async function requirePath(root, relative) {
  await fs.access(path.join(root, relative));
}

function assertPluginIdentity(plugin, packageJson, label) {
  assert.equal(plugin.name, 'refas', `${label} name must be refas`);
  assert.equal(plugin.version, packageJson.version, `${label} version must match package.json`);
  assert.equal(plugin.license, packageJson.license, `${label} license must match package.json`);
  assert.equal(plugin.homepage, 'https://github.com/ictseoyoungmin/refas', `${label} homepage must target the RefAs repository`);
  assert.equal(plugin.repository, 'https://github.com/ictseoyoungmin/refas', `${label} repository must target the RefAs repository`);
  assert.equal(plugin.author?.name, 'ictseoyoungmin', `${label} author must identify the repository owner`);
}

export async function verifyPluginDistribution({root = DEFAULT_ROOT} = {}) {
  const required = [
    'package.json',
    'skills/refas/SKILL.md',
    'skills/refas/assets/icon.svg',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    '.codex-plugin/plugin.json',
    '.agents/plugins/marketplace.json',
  ];
  for (const relative of required) await requirePath(root, relative);

  const packageJson = await readJson(root, 'package.json');
  const claudePlugin = await readJson(root, '.claude-plugin/plugin.json');
  const claudeMarketplace = await readJson(root, '.claude-plugin/marketplace.json');
  const codexPlugin = await readJson(root, '.codex-plugin/plugin.json');
  const agentMarketplace = await readJson(root, '.agents/plugins/marketplace.json');
  const skill = await fs.readFile(path.join(root, 'skills/refas/SKILL.md'), 'utf8');

  assert.match(skill, /^---\s*\nname:\s*refas\s*$/mu, 'canonical skill frontmatter must keep name: refas');
  assert.match(skill, /^description:\s*\S.+$/mu, 'canonical skill frontmatter must keep a non-empty description');

  assertPluginIdentity(claudePlugin, packageJson, 'Claude plugin');
  assertPluginIdentity(codexPlugin, packageJson, 'Codex plugin');

  assert.equal(claudeMarketplace.name, 'refas', 'Claude marketplace name must be refas');
  assert.equal(claudeMarketplace.owner?.name, 'ictseoyoungmin', 'Claude marketplace owner must match the repository owner');
  assert.equal(claudeMarketplace.plugins?.length, 1, 'Claude marketplace must expose exactly one RefAs plugin');
  assert.equal(claudeMarketplace.plugins?.[0]?.name, 'refas', 'Claude marketplace plugin name must be refas');
  assert.equal(claudeMarketplace.plugins?.[0]?.source, SKILL_SOURCE, 'Claude marketplace must route to the canonical skills tree');

  assert.equal(codexPlugin.skills, SKILL_SOURCE, 'Codex plugin must route to the canonical skills tree');
  assert.equal(codexPlugin.interface?.displayName, 'RefAs', 'Codex display name must be RefAs');
  assert.equal(codexPlugin.interface?.developerName, 'ictseoyoungmin', 'Codex developer name must match the repository owner');
  assert.equal(codexPlugin.interface?.category, 'Creative Tools', 'Codex category must remain Creative Tools');
  assert.equal(codexPlugin.interface?.websiteURL, 'https://github.com/ictseoyoungmin/refas', 'Codex website must target the RefAs repository');
  assert.deepEqual(codexPlugin.interface?.capabilities, ['Instructions', 'Visualization', 'Interactive'], 'Codex capabilities must remain explicit and stable');
  assert.ok(Array.isArray(codexPlugin.interface?.defaultPrompt) && codexPlugin.interface.defaultPrompt.length >= 2, 'Codex plugin must provide discoverable default prompts');
  assert.equal(codexPlugin.interface?.brandColor, '#10161D', 'Codex brand color must match the RefAs dark charcoal identity');
  assert.equal(codexPlugin.interface?.composerIcon, ICON_PATH, 'Codex composer icon must use the canonical RefAs icon');
  assert.equal(codexPlugin.interface?.logo, ICON_PATH, 'Codex logo must use the canonical RefAs icon');
  await requirePath(root, codexPlugin.interface.composerIcon.replace(/^\.\//u, ''));
  await requirePath(root, codexPlugin.interface.logo.replace(/^\.\//u, ''));

  assert.equal(agentMarketplace.name, 'refas', 'Agent marketplace name must be refas');
  assert.equal(agentMarketplace.interface?.displayName, 'RefAs', 'Agent marketplace display name must be RefAs');
  assert.equal(agentMarketplace.plugins?.length, 1, 'Agent marketplace must expose exactly one RefAs plugin');
  const agentPlugin = agentMarketplace.plugins?.[0];
  assert.equal(agentPlugin?.name, 'refas', 'Agent marketplace plugin name must be refas');
  assert.deepEqual(agentPlugin?.source, {source: 'local', path: SKILL_SOURCE}, 'Agent marketplace must route to the canonical skills tree');
  assert.deepEqual(agentPlugin?.policy, {installation: 'AVAILABLE', authentication: 'ON_INSTALL'}, 'Agent marketplace policy must remain installable');
  assert.equal(agentPlugin?.category, 'Creative Tools', 'Agent marketplace category must remain Creative Tools');

  return {
    status: 'PASS',
    version: packageJson.version,
    skillSource: SKILL_SOURCE,
    icon: ICON_PATH,
    adapters: ['claude', 'codex', 'agents'],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(MODULE_PATH)) {
  verifyPluginDistribution()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`Plugin distribution verification failed: ${error.message}\n`);
      process.exit(1);
    });
}

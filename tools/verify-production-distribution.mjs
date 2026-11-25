#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every installed file has a production use. New dependencies require an
// explicit review here, so an accidental legacy copy cannot silently ship.
export const PRODUCTION_SKILL_FILES = Object.freeze([
  'SKILL.md',
  'agents/openai.yaml',
  'assets/icon.svg',
  'references/production-assemblies.md',
  'references/production-garments.md',
  'references/production-import.md',
  'references/production-review.md',
  'references/production-topology.md',
  'scripts/produce.py',
  'scripts/production/__init__.py',
  'scripts/production/project.py',
  'scripts/production/blender_worker.py',
  'scripts/production/review.py',
  'scripts/production/image_compare.py',
  'scripts/production/asset_import.py',
  'scripts/production/mesh_audit.py',
  'scripts/production/surface_binding.py',
  'scripts/production/section_sweep.py',
]);
const SKILL_IGNORE_FILES = ['.npmignore', 'scripts/.npmignore'];
const PACKAGE_FILES = ['LICENSE', 'README.md', 'package.json', 'bin/refas.mjs', ...PRODUCTION_SKILL_FILES.map(file => `skills/refas/${file}`)];

async function filesIn(directory, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
    const child = path.posix.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), `production skill cannot contain symlinks: ${child}`);
    // Python cache files are ignored by npm. Everything else must be declared.
    if (entry.name === '__pycache__' || /\.py[co]$/u.test(entry.name)) continue;
    if (entry.isDirectory()) result.push(...await filesIn(directory, child));
    else if (entry.isFile()) result.push(child);
  }
  return result.sort();
}

function sameFiles(actual, expected, label) {
  const unexpected = actual.filter(file => !expected.includes(file));
  const missing = expected.filter(file => !actual.includes(file));
  assert.deepEqual(unexpected, [], `${label} contains undeclared files: ${unexpected.join(', ')}`);
  assert.deepEqual(missing, [], `${label} omits required files: ${missing.join(', ')}`);
}

export function verifyProductionPack(pack) {
  assert.ok(pack?.files?.length, 'npm pack must report a nonempty file list');
  sameFiles(pack.files.map(file => file.path), PACKAGE_FILES, 'production package');
  return {packagedFiles: pack.files.length, unpackedBytes: pack.unpackedSize,
    skillFiles: PRODUCTION_SKILL_FILES.length,
    skillBytes: pack.files.filter(file => file.path.startsWith('skills/refas/')).reduce((total, file) => total + file.size, 0)};
}

export async function verifyProductionDistribution({root = ROOT, pack = null} = {}) {
  const skillRoot = path.join(root, 'skills/refas');
  sameFiles(await filesIn(skillRoot), [...PRODUCTION_SKILL_FILES, ...SKILL_IGNORE_FILES], 'production skill');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const identity = await fs.readFile(path.join(skillRoot, 'scripts/production/__init__.py'), 'utf8');
  const version = identity.match(/^VERSION = ["']([^"']+)["']$/mu)?.[1];
  assert.ok(version, 'production runtime must expose VERSION');
  assert.equal(pkg.version, version, 'package and production runtime versions must match');
  assert.deepEqual(pkg.bin, {refas: 'bin/refas.mjs'}, 'npm must expose only the production launcher');
  assert.equal(pkg.exports, undefined, 'production package cannot expose the legacy JavaScript API');
  assert.deepEqual(pkg.files, ['bin/refas.mjs', 'skills/refas'], 'npm allowlist must contain only production');
  for (const name of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    assert.equal(JSON.parse(await fs.readFile(path.join(root, name), 'utf8')).version, version, `${name} version mismatch`);
  }
  for (const relative of PRODUCTION_SKILL_FILES.filter(file => file.endsWith('.md'))) {
    const source = await fs.readFile(path.join(skillRoot, relative), 'utf8');
    assert.doesNotMatch(source, /(?:node\s+)?scripts\/refas(?:-host)?\.mjs|references\/(?:INDEX\.md|GRAPH\.json)|(?:\.\.\/|legacy\/v1\/)/u,
      `${relative} routes outside the production skill`);
    for (const match of source.matchAll(/(?:references|scripts|assets)\/[A-Za-z0-9_./-]+\.(?:md|py|svg)/gu)) {
      assert.ok(PRODUCTION_SKILL_FILES.includes(match[0]), `${relative} links an undeclared production file: ${match[0]}`);
    }
  }
  return {status: 'PASS', version, skillFiles: PRODUCTION_SKILL_FILES.length, ...(pack ? verifyProductionPack(pack) : {})};
}

export function packProduction({root = ROOT, destination = null} = {}) {
  const args = ['pack', '--json', '--ignore-scripts', ...(destination ? ['--pack-destination', destination] : ['--dry-run'])];
  const result = spawnSync('npm', args, {cwd: root, encoding: 'utf8', timeout: 120000,
    env: {...process.env, NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_OFFLINE: 'true',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_CACHE: path.join(os.tmpdir(), 'refas-npm-cache')}});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout)[0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyProductionDistribution({pack: packProduction()}).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {process.stderr.write(`Production distribution failed: ${error.message}\n`); process.exitCode = 1;});
}

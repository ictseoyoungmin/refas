#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {packProduction, verifyProductionDistribution, verifyProductionPack} from './verify-production-distribution.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.REFAS_PYTHON || process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

function run(command, args, {cwd = ROOT, env = {}, status = 0} = {}) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 120000,
    env: {...process.env, NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_OFFLINE: 'true',
      PYTHONDONTWRITEBYTECODE: '1', ...env}});
  assert.equal(result.status, status, `${command} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result;
}

export async function verifyPackedInstall({root = ROOT, tarball = null, packed = null} = {}) {
  assert.equal(Boolean(tarball), Boolean(packed), 'an existing archive needs its npm pack metadata');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-installed-tarball-'));
  try {
    packed ||= packProduction({root, destination: tmp});
    const distribution = await verifyProductionDistribution({root, pack: packed});
    const version = distribution.version;
    assert.equal(packed.name, 'refas');
    assert.equal(packed.version, version);
    tarball = tarball ? path.resolve(tarball) : path.join(tmp, packed.filename);
    const tarFiles = run('tar', ['-tzf', tarball]).stdout.trim().split('\n').filter(name => !name.endsWith('/'));
    assert.equal(new Set(tarFiles).size, tarFiles.length, 'archive contains duplicate entries');
    verifyProductionPack({...packed, files: tarFiles.map(name => {
      assert.ok(name.startsWith('package/'), `unexpected tarball root: ${name}`);
      return {path: name.slice('package/'.length), size: 0};
    })});
    const prefix = path.join(tmp, 'installed');
    run('npm', ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--offline', tarball]);
    const mod = path.join(prefix, 'node_modules/refas');
    for (const {path: relative} of packed.files) {
      const installed = path.join(mod, relative);
      assert.ok((await fs.lstat(installed)).isFile(), `installed entry is not a regular file: ${relative}`);
      assert.deepEqual(await fs.readFile(installed), await fs.readFile(path.join(root, relative)),
        `installed archive differs from source: ${relative}`);
    }
    const pkg = JSON.parse(await fs.readFile(path.join(mod, 'package.json'), 'utf8'));
    assert.equal(pkg.version, version);
    assert.deepEqual(pkg.bin, {refas: 'bin/refas.mjs'});
    const executable = path.join(prefix, 'node_modules/.bin/refas');
    assert.ok((await fs.lstat(executable)).isSymbolicLink(), 'npm must install the refas executable');
    await assert.rejects(fs.access(path.join(prefix, 'node_modules/.bin/refas-host')), {code: 'ENOENT'});
    assert.equal(run(executable, ['--version'], {cwd: tmp}).stdout.trim(), `RefAs ${version}`);
    const help = run(executable, ['--help'], {cwd: tmp}).stdout;
    for (const command of ['init', 'run', 'restore', 'import-v1', 'authoring-capabilities']) assert.ok(help.includes(command), command);
    const project = path.join(tmp, 'project with spaces 한글');
    const reference = path.join(tmp, 'reference with spaces.txt');
    await fs.writeFile(reference, 'source bytes for installed argument and copy verification\n');
    const initialized = JSON.parse(run(executable, ['init', '--root', project, '--name', 'Asset 한글 with spaces', '--reference', reference], {cwd: tmp}).stdout);
    assert.equal(initialized.name, 'Asset 한글 with spaces');
    assert.equal(initialized.head, null);
    assert.equal(JSON.parse(run(executable, ['status', '--root', project], {cwd: tmp}).stdout).projectId, initialized.projectId);
    assert.equal(JSON.parse(run(executable, ['verify', '--root', project], {cwd: tmp}).stdout).ok, true);
    run(executable, ['not-a-command'], {cwd: tmp, status: 2});
    const missing = run(executable, ['status', '--root', path.join(tmp, 'missing')], {cwd: tmp, status: 1});
    assert.equal(JSON.parse(missing.stderr).ok, false);
    const noPython = run(executable, ['--version'], {cwd: tmp, env: {REFAS_PYTHON: path.join(tmp, 'missing-python')}, status: 127});
    assert.match(noPython.stderr, /could not start Python/u);

    // A plain installed-skill copy must also work without Node or site packages.
    const python = run(PYTHON, ['-c', 'import sys; print(sys.executable)']).stdout.trim();
    const copied = path.join(tmp, 'copied-skill');
    await fs.cp(path.join(mod, 'skills/refas'), copied, {recursive: true});
    const standaloneEnv = {PATH: path.join(tmp, 'empty-path'), PYTHONPATH: '', PYTHONNOUSERSITE: '1'};
    const cli = path.join(copied, 'scripts/produce.py');
    assert.equal(run(python, ['-B', '-S', cli, '--version'], {cwd: tmp, env: standaloneEnv}).stdout.trim(), `RefAs ${version}`);
    const capabilities = JSON.parse(run(python, ['-B', '-S', cli, 'authoring-capabilities', '--id', 'thickness-field'], {cwd: tmp, env: standaloneEnv}).stdout);
    assert.equal(capabilities.matches[0].callables[0].authoringImport, 'from thickness_field import grade_thickness');
    assert.match(capabilities.matches[0].callables[0].signature, /minimum.*max_gradient/u);
    const standalone = JSON.parse(run(python, ['-B', '-S', cli, 'init', '--root', path.join(tmp, 'standalone-project'), '--name', 'Copied skill'], {cwd: tmp, env: standaloneEnv}).stdout);
    assert.equal(standalone.name, 'Copied skill');
    return {...distribution, tarball: packed.filename, installedCli: true, sourceFilesIdentical: true,
      exitStatuses: [0, 1, 2, 127], plainSkillWithoutNodeOrSitePackages: true};
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPackedInstall().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {console.error(error); process.exitCode = 1;});
}

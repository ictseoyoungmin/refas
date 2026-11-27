import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {prepareReleasePackage, publishReleasePackage} from '../tools/release-package.mjs';
import {packProduction} from '../tools/verify-production-distribution.mjs';
import {verifyPackedInstall} from '../tools/verify-packed-install.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = 'a'.repeat(40);
const VERSION = '2.0.0';
const REPO = 'owner/refas';
const TOKEN = 'test-only-token';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-release-assets-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const filename = `refas-${VERSION}.tgz`;
  const bytes = Buffer.from('a synthetic archive for HTTP boundary tests\n');
  const checksum = Buffer.from(`${hash(bytes)}  ${filename}\n`);
  await fs.writeFile(path.join(directory, filename), bytes);
  await fs.writeFile(path.join(directory, `${filename}.sha256`), checksum);
  await fs.writeFile(path.join(directory, 'release-package.json'), JSON.stringify({sourceCommit: SHA,
    version: VERSION, filename, size: bytes.length, sha256: hash(bytes),
    installation: {status: 'PASS', installedCli: true, sourceFilesIdentical: true}}));
  return {directory, files: [{name: filename, bytes}, {name: `${filename}.sha256`, bytes: checksum}]};
}

function github(files) {
  const state = {main: SHA, tag: SHA, releaseSha: SHA, assets: [], downloads: new Map(), calls: [],
    uploadUrl: `https://uploads.github.com/repos/${REPO}/releases/7/assets{?name,label}`,
    failUpload: null};
  const metadata = file => ({id: state.assets.length + 1, name: file.name, size: file.bytes.length,
    digest: `sha256:${hash(file.bytes)}`, state: 'uploaded',
    browser_download_url: `https://github.com/${REPO}/releases/download/v${VERSION}/${file.name}`});
  function seed(file) {
    const asset = metadata(file);
    state.assets.push(asset);
    state.downloads.set(asset.browser_download_url, file.bytes);
    return asset;
  }
  async function fetchImpl(address, options = {}) {
    const url = new URL(address);
    state.calls.push({url: url.href, method: options.method || 'GET', headers: options.headers, redirect: options.redirect});
    if (url.origin === 'https://api.github.com') {
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(options.redirect, 'error');
      const suffix = url.pathname.slice(`/repos/${REPO}`.length);
      if (suffix === '/git/ref/heads/main') return Response.json({object: {type: 'commit', sha: state.main}});
      if (suffix === `/git/ref/tags/v${VERSION}`) return Response.json({object: {type: 'commit', sha: state.tag}});
      if (suffix === `/releases/tags/v${VERSION}`) return Response.json({id: 7, target_commitish: state.releaseSha,
        tag_name: `v${VERSION}`, draft: false, prerelease: false, upload_url: state.uploadUrl});
      if (suffix === '/releases/7/assets') return Response.json(state.assets);
    }
    if (url.origin === 'https://uploads.github.com') {
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      const name = url.searchParams.get('name');
      if (state.failUpload === name) return new Response('upstream failure', {status: 502});
      assert.ok(!state.assets.some(asset => asset.name === name), 'must never overwrite an asset');
      const file = files.find(candidate => candidate.name === name);
      assert.ok(file, 'only the archive and checksum may be uploaded');
      assert.deepEqual(options.body, file.bytes);
      assert.equal(options.headers['Content-Length'], String(file.bytes.length));
      return Response.json(seed(file), {status: 201});
    }
    if (state.downloads.has(url.href)) {
      assert.equal(options.headers.Authorization, undefined, 'public downloads must not carry the token');
      return new Response(state.downloads.get(url.href));
    }
    throw new Error(`unexpected test endpoint: ${url.origin}${url.pathname}`);
  }
  return {state, seed, fetchImpl};
}

const publish = (fixture, remote, extra = {}) => publishReleasePackage({directory: fixture.directory,
  sha: SHA, version: VERSION, repo: REPO, token: TOKEN, fetchImpl: remote.fetchImpl, ...extra});
const uploads = remote => remote.state.calls.filter(call => call.method === 'POST');

test('publishes exact archive and checksum bytes, then verifies a rerun without writes', async t => {
  const local = await fixture(t);
  const remote = github(local.files);
  const first = await publish(local, remote);
  assert.equal(first.uploaded, 2);
  assert.deepEqual(first.assets.map(asset => asset.sha256), local.files.map(file => hash(file.bytes)));
  assert.equal(uploads(remote).length, 2);
  const second = await publish(local, remote);
  assert.equal(second.uploaded, 0);
  assert.equal(uploads(remote).length, 2);
  assert.ok(remote.state.calls.every(call => !['PATCH', 'DELETE'].includes(call.method)));
});

test('same-name size, digest, byte or incomplete-upload conflict blocks all new assets', async t => {
  for (const kind of ['size', 'digest', 'bytes', 'starter', 'duplicate']) {
    await t.test(kind, async t => {
      const local = await fixture(t);
      const remote = github(local.files);
      // A checksum conflict must be found before the missing archive is uploaded.
      const asset = remote.seed(local.files[1]);
      if (kind === 'size') asset.size++;
      if (kind === 'digest') asset.digest = `sha256:${'0'.repeat(64)}`;
      if (kind === 'bytes') remote.state.downloads.set(asset.browser_download_url, Buffer.from('different bytes'));
      if (kind === 'starter') asset.state = 'starter';
      if (kind === 'duplicate') remote.state.assets.push({...asset});
      await assert.rejects(publish(local, remote), /conflict|not fully uploaded|duplicate/u);
      assert.equal(uploads(remote).length, 0);
    });
  }
});

test('wrong main, tag or release SHA cannot upload to an existing release', async t => {
  for (const field of ['main', 'tag', 'releaseSha']) {
    await t.test(field, async t => {
      const local = await fixture(t);
      const remote = github(local.files);
      remote.state[field] = 'b'.repeat(40);
      await assert.rejects(publish(local, remote), /SHA|current main/u);
      assert.equal(uploads(remote).length, 0);
    });
  }
});

test('upload URLs cannot redirect authentication to another host or release', async t => {
  for (const url of [
    `https://attacker.example/repos/${REPO}/releases/7/assets{?name,label}`,
    `http://uploads.github.com/repos/${REPO}/releases/7/assets{?name,label}`,
    `https://uploads.github.com/repos/${REPO}/releases/8/assets{?name,label}`,
    `https://user:password@uploads.github.com/repos/${REPO}/releases/7/assets`,
    `https://uploads.github.com/repos/${REPO}/releases/7/assets?unexpected=1`,
  ]) {
    const local = await fixture(t);
    const remote = github(local.files);
    remote.state.uploadUrl = url;
    await assert.rejects(publish(local, remote), /upload host|upload path|upload URL/u);
    assert.equal(uploads(remote).length, 0);
    assert.ok(remote.state.calls.every(call => new URL(call.url).origin === 'https://api.github.com'));
  }
});

test('a failed second upload leaves the first immutable and a manual retry adds only the missing file', async t => {
  const local = await fixture(t);
  const remote = github(local.files);
  remote.state.failUpload = local.files[1].name;
  await assert.rejects(publish(local, remote), /HTTP 502/u);
  assert.deepEqual(remote.state.assets.map(asset => asset.name), [local.files[0].name]);
  remote.state.failUpload = null;
  const retried = await publish(local, remote);
  assert.equal(retried.uploaded, 1);
  assert.equal(uploads(remote).filter(call => new URL(call.url).searchParams.get('name') === local.files[0].name).length, 1);
  assert.equal(remote.state.assets.length, 2);
});

test('changed local prepared files and another source receipt are rejected before network access', async t => {
  for (const kind of ['archive', 'checksum', 'source', 'installation']) {
    await t.test(kind, async t => {
      const local = await fixture(t);
      const remote = github(local.files);
      if (kind === 'archive') await fs.appendFile(path.join(local.directory, local.files[0].name), 'tampered');
      if (kind === 'checksum') await fs.writeFile(path.join(local.directory, local.files[1].name), 'wrong checksum');
      if (kind === 'source' || kind === 'installation') {
        const name = path.join(local.directory, 'release-package.json');
        const receipt = JSON.parse(await fs.readFile(name, 'utf8'));
        if (kind === 'source') receipt.sourceCommit = 'b'.repeat(40);
        else receipt.installation.status = 'FAIL';
        await fs.writeFile(name, JSON.stringify(receipt));
      }
      await assert.rejects(publish(local, remote), /archive|checksum|source SHA|installation/u);
      assert.equal(remote.state.calls.length, 0);
    });
  }
});

test('actual committed archive installs; substituted archive bytes and dirty source are rejected', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-release-prepare-'));
  t.after(() => fs.rm(temporary, {recursive: true, force: true}));
  const root = path.join(temporary, 'source');
  await fs.mkdir(root);
  for (const name of ['package.json', 'README.md', 'LICENSE', 'bin', 'skills', '.codex-plugin', '.claude-plugin']) {
    await fs.cp(path.join(ROOT, name), path.join(root, name), {recursive: true});
  }
  function git(...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Release test', '-c', 'user.email=release-test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic release source fixture');
  const sha = git('rev-parse', 'HEAD');
  const directory = path.join(temporary, 'release');
  const receipt = await prepareReleasePackage({root, directory, sha});
  assert.equal(receipt.sourceCommit, sha);
  assert.equal(receipt.installation.installedCli, true);
  assert.equal(receipt.installation.sourceFilesIdentical, true);
  assert.equal(receipt.installation.plainSkillWithoutNodeOrSitePackages, true);
  // Repacking the same source must preserve the immutable public filename bytes.
  const replay = path.join(temporary, 'repacked');
  await fs.mkdir(replay);
  const packed = packProduction({root, destination: replay});
  assert.equal(hash(await fs.readFile(path.join(replay, packed.filename))), receipt.sha256);
  // Keep the original pack metadata and source, but substitute one archived file.
  const extracted = path.join(temporary, 'changed-archive');
  await fs.mkdir(extracted);
  let result = spawnSync('tar', ['-xzf', path.join(replay, packed.filename), '-C', extracted], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  await fs.appendFile(path.join(extracted, 'package/README.md'), '\nSubstituted archive bytes.\n');
  const substituted = path.join(temporary, 'substituted.tgz');
  result = spawnSync('tar', ['-czf', substituted, '-C', extracted, 'package'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(verifyPackedInstall({root, tarball: substituted, packed}),
    /installed archive differs from source: README\.md/u);
  await fs.appendFile(path.join(root, 'README.md'), '\nUncommitted source mutation.\n');
  const rejected = path.join(temporary, 'rejected');
  await assert.rejects(prepareReleasePackage({root, directory: rejected, sha}), /packaged source differs from release commit/u);
  await assert.rejects(fs.access(path.join(rejected, 'release-package.json')), {code: 'ENOENT'});
});

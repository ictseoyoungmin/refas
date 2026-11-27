#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {packProduction} from './verify-production-distribution.mjs';
import {verifyPackedInstall} from './verify-packed-install.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function git(root, args) {
  const result = spawnSync('git', args, {cwd: root, timeout: 30000, maxBuffer: 2 * 1024 * 1024});
  assert.equal(result.status, 0, `source identity check failed: git ${args[0]}`);
  return result.stdout;
}

/** Prepare the exact archive that will be installed, hashed and published. */
export async function prepareReleasePackage({root = ROOT, directory, sha}) {
  assert.match(sha || '', /^[0-9a-f]{40}$/u, 'invalid exact release SHA');
  assert.equal(git(root, ['rev-parse', 'HEAD']).toString().trim(), sha, 'checkout differs from release SHA');
  directory = path.resolve(directory);
  const relative = path.relative(root, directory);
  assert.ok(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'prepare the archive outside the repository');
  await fs.mkdir(directory, {recursive: true});
  const packed = packProduction({root, destination: directory});
  assert.match(packed.version, versionPattern);
  assert.equal(packed.filename, `refas-${packed.version}.tgz`);
  const tarball = path.join(directory, packed.filename);
  const before = await fs.readFile(tarball);
  const installation = await verifyPackedInstall({root, tarball, packed});
  for (const {path: name} of packed.files) {
    assert.deepEqual(await fs.readFile(path.join(root, name)), git(root, ['show', `${sha}:${name}`]),
      `packaged source differs from release commit: ${name}`);
  }
  assert.deepEqual(await fs.readFile(tarball), before, 'archive changed during installation verification');
  const receipt = {sourceCommit: sha, version: packed.version, filename: packed.filename,
    size: before.length, sha256: digest(before), installation};
  await fs.writeFile(`${tarball}.sha256`, `${receipt.sha256}  ${packed.filename}\n`);
  await fs.writeFile(path.join(directory, 'release-package.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function preparedFiles(directory, sha, version) {
  const receipt = JSON.parse(await fs.readFile(path.join(directory, 'release-package.json'), 'utf8'));
  assert.equal(receipt.sourceCommit, sha, 'prepared package belongs to another source SHA');
  assert.equal(receipt.version, version, 'prepared package version differs from release');
  assert.ok(receipt.installation?.status === 'PASS' && receipt.installation.installedCli === true &&
    receipt.installation.sourceFilesIdentical === true, 'prepared package lacks successful installation evidence');
  assert.equal(receipt.filename, `refas-${version}.tgz`, 'unexpected archive filename');
  const bytes = await fs.readFile(path.join(directory, receipt.filename));
  assert.equal(bytes.length, receipt.size, 'prepared archive size changed');
  assert.equal(digest(bytes), receipt.sha256, 'prepared archive digest changed');
  const checksum = await fs.readFile(path.join(directory, `${receipt.filename}.sha256`));
  assert.equal(checksum.toString(), `${receipt.sha256}  ${receipt.filename}\n`, 'checksum file differs from archive');
  return [{name: receipt.filename, bytes, contentType: 'application/gzip'},
    {name: `${receipt.filename}.sha256`, bytes: checksum, contentType: 'text/plain'}];
}

/** Add only missing assets; existing release records and asset bytes are immutable. */
export async function publishReleasePackage({directory, sha, version, repo, token, fetchImpl = fetch}) {
  assert.match(sha || '', /^[0-9a-f]{40}$/u, 'invalid exact release SHA');
  assert.match(version || '', versionPattern, 'invalid release version');
  assert.match(repo || '', /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u, 'invalid repository');
  assert.ok(token, 'release authentication is missing');
  const files = await preparedFiles(directory, sha, version);
  const tag = `v${version}`;
  const headers = {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'};
  async function get(suffix) {
    const response = await fetchImpl(`${API}/repos/${repo}${suffix}`, {headers, redirect: 'error'});
    assert.ok(response.ok, `release metadata request failed: HTTP ${response.status}`);
    return response.json();
  }
  async function target() {
    const main = await get('/git/ref/heads/main');
    assert.equal(main.object?.type, 'commit', 'main is not a commit');
    assert.equal(main.object?.sha, sha, 'release SHA is not current main');
    const ref = await get(`/git/ref/tags/${encodeURIComponent(tag)}`);
    assert.equal(ref.object?.type, 'commit', 'release tag is not a lightweight commit tag');
    assert.equal(ref.object?.sha, sha, 'release tag belongs to another SHA');
    const release = await get(`/releases/tags/${encodeURIComponent(tag)}`);
    assert.equal(release.target_commitish, sha, 'release target differs from approved SHA');
    assert.equal(release.tag_name, tag, 'release tag name differs');
    assert.equal(release.draft, false, 'release is still a draft');
    assert.equal(release.prerelease, version.includes('-'), 'release prerelease state differs');
    assert.ok(Number.isSafeInteger(release.id) && release.id > 0, 'invalid release ID');
    return release;
  }
  const release = await target();
  const upload = new URL(release.upload_url.replace(/\{\?name,label\}$/u, ''));
  assert.equal(upload.origin, 'https://uploads.github.com', 'untrusted release upload host');
  assert.equal(upload.pathname, `/repos/${repo}/releases/${release.id}/assets`, 'unexpected release upload path');
  assert.ok(!upload.username && !upload.password && !upload.search && !upload.hash, 'invalid release upload URL');
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await get(`/releases/${release.id}/assets?per_page=100&page=${page}`);
    assert.ok(Array.isArray(batch), 'invalid release asset list');
    assets.push(...batch);
    if (batch.length < 100) break;
  }
  async function verifyAsset(asset, file) {
    assert.equal(asset.name, file.name, 'release asset filename differs');
    assert.equal(asset.state, 'uploaded', `asset is not fully uploaded: ${file.name}`);
    assert.equal(asset.size, file.bytes.length, `asset size conflict: ${file.name}`);
    assert.equal(asset.digest, `sha256:${digest(file.bytes)}`, `asset digest conflict: ${file.name}`);
    const download = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file.name)}`;
    assert.equal(asset.browser_download_url, download, 'unexpected public asset URL');
    // Public downloads never receive the workflow token, including on redirects.
    const response = await fetchImpl(download, {headers: {Accept: 'application/octet-stream'}, redirect: 'follow'});
    assert.ok(response.ok, `public asset download failed: HTTP ${response.status}`);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(file.bytes), `public asset bytes conflict: ${file.name}`);
    return {name: file.name, size: file.bytes.length, sha256: digest(file.bytes), url: download};
  }
  const completed = [];
  const missing = [];
  // Find every conflict before uploading anything; a partial earlier run is reusable.
  for (const file of files) {
    const matching = assets.filter(asset => asset.name === file.name);
    assert.ok(matching.length <= 1, `duplicate release assets: ${file.name}`);
    if (matching.length) completed.push(await verifyAsset(matching[0], file));
    else missing.push(file);
  }
  for (const file of missing) {
    assert.equal((await target()).id, release.id, 'release identity changed before upload');
    const url = new URL(upload);
    url.searchParams.set('name', file.name);
    const response = await fetchImpl(url.href, {method: 'POST', redirect: 'error',
      headers: {...headers, 'Content-Type': file.contentType, 'Content-Length': String(file.bytes.length)}, body: file.bytes});
    assert.equal(response.status, 201, `asset upload failed: HTTP ${response.status}; retry manually after inspecting the release`);
    completed.push(await verifyAsset(await response.json(), file));
  }
  assert.equal((await target()).id, release.id, 'release identity changed after upload');
  return {sourceCommit: sha, version, assets: completed, uploaded: missing.length};
}

async function main() {
  const [command, directory, ...extra] = process.argv.slice(2);
  assert.ok(directory && extra.length === 0 && ['prepare', 'publish'].includes(command),
    'Usage: node tools/release-package.mjs prepare|publish OUTSIDE_REPOSITORY_DIRECTORY');
  const sha = process.env.RELEASE_SHA;
  const result = command === 'prepare' ? await prepareReleasePackage({directory, sha})
    : await publishReleasePackage({directory, sha,
      version: JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version,
      repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN});
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(`Release package failed: ${error.message}`); process.exitCode = 1;});
}

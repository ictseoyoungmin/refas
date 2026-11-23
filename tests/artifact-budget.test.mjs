import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ARTIFACT_LIMITS, checkArtifactBudget} from '../tools/check-artifact-budget.mjs';

const CLI = fileURLToPath(new URL('../tools/check-artifact-budget.mjs', import.meta.url));

function git(root, ...args) {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function write(root, name, content) {
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, content);
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-artifact-budget-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Artifact test');
  git(root, 'config', 'user.email', 'artifact-test@example.invalid');
  await write(root, 'README.md', 'Initial source\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  return {root, base: git(root, 'rev-parse', 'HEAD')};
}

function save(root, message = 'candidate') {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
  return git(root, 'rev-parse', 'HEAD');
}

test('working, index and committed modes inspect their actual bytes, including spaced paths', async t => {
  const {root, base} = await fixture(t);
  await write(root, 'docs/short report.md', '# Result\n3 checks pass.\n');
  assert.equal(checkArtifactBudget({root}).changedFiles, 1);
  git(root, 'add', '.');
  await write(root, 'docs/short report.md', Buffer.from([0, 1, 2]));
  assert.equal(checkArtifactBudget({root, staged: true}).ok, true);
  assert.equal(checkArtifactBudget({root}).ok, false);
  git(root, 'commit', '-qm', 'short report');
  const checked = checkArtifactBudget({root, base, head: 'HEAD'});
  assert.equal(checked.ok, true);
  assert.equal(checked.changedFiles, 1);
  assert.equal(checked.changedBytes, Buffer.byteLength('# Result\n3 checks pass.\n'));
});

test('unmodified historical evidence is retained but new and modified payloads fail', async t => {
  const {root} = await fixture(t);
  await write(root, 'docs/development/evidence/old.glb', Buffer.from([0, 1, 2]));
  const base = save(root, 'historical evidence');
  await write(root, 'new.py', 'print("source")\n');
  assert.equal(checkArtifactBudget({root, base}).changedFiles, 0);
  assert.equal(checkArtifactBudget({root}).ok, true);
  await write(root, 'docs/development/evidence/old.glb', Buffer.from([0, 1, 3]));
  assert.equal(checkArtifactBudget({root}).ok, false);
  await fs.rm(path.join(root, 'docs/development/evidence/old.glb'));
  assert.equal(checkArtifactBudget({root}).ok, true, 'deletions do not trigger payload inspection');
  await write(root, 'docs/development/evidence/new.gltf', '{"asset":{"version":"2.0"}}');
  assert.match(checkArtifactBudget({root}).errors.join('\n'), /new\.gltf.*payload/u);
});

test('the fixed ancestry boundary excludes old payloads but never edits after that boundary', async t => {
  const {root, base} = await fixture(t);
  await write(root, 'historical.blend', 'old payload');
  const anchor = save(root, 'historical checkpoint');
  await write(root, 'source.py', '# compact implementation\n');
  save(root);
  const oldPr = checkArtifactBudget({root, base}, {grandfatherCommit: anchor});
  assert.equal(oldPr.ok, true);
  assert.equal(oldPr.effectiveBase, anchor);
  assert.equal(oldPr.grandfatherApplied, true);
  assert.equal(oldPr.changedFiles, 1);
  await write(root, 'historical.blend', 'changed historical payload');
  const featureBase = git(root, 'rev-parse', 'HEAD');
  save(root);
  const changed = checkArtifactBudget({root, base}, {grandfatherCommit: anchor});
  assert.equal(changed.ok, false);
  assert.match(changed.errors.join('\n'), /historical\.blend/u);
  const feature = checkArtifactBudget({root, base: featureBase}, {grandfatherCommit: anchor});
  assert.equal(feature.effectiveBase, featureBase);
  assert.equal(feature.grandfatherApplied, false);
});

test('unrelated or missing legacy anchors give no exemption and divergent bases use the common ancestor', async t => {
  const {root, base} = await fixture(t);
  git(root, 'checkout', '-qb', 'other');
  await write(root, 'unrelated.md', 'other branch\n');
  const unrelated = save(root);
  git(root, 'checkout', '--detach', base);
  await write(root, 'model.blend.gz', 'compressed output');
  save(root);
  for (const anchor of [unrelated, 'f'.repeat(40)]) {
    const checked = checkArtifactBudget({root, base: unrelated}, {grandfatherCommit: anchor});
    assert.equal(checked.effectiveBase, base);
    assert.equal(checked.grandfatherApplied, false);
    assert.equal(checked.ok, false);
  }
});

test('raw arrays, numeric tables, logs, archives, media and disguised binary outputs fail', async t => {
  const {root} = await fixture(t);
  const payloads = {
    'docs/evidence/vertices.json': JSON.stringify({positions: Array.from({length: 64}, () => [1, 2, 3])}),
    'docs/evidence/vertices.JSON': JSON.stringify({positions: Array.from({length: 64}, () => [1, 2, 3])}),
    'docs/evidence/frames.json': JSON.stringify({frames: Array.from({length: 97}, (_, frame) => ({frame, passed: true}))}),
    'docs/evidence/stdout.txt': 'long command output',
    'small.csv': 'frame,x,y\n1,0,0\n',
    'small.npz': 'array data',
    'capture.mp4': 'video data',
    'bundle.tar.zst': 'archive data',
    'preview.png': 'image data',
    'innocent.data': Buffer.from([0xff, 0xfe]),
    'renders/readme.md': 'generated observation',
  };
  for (const [name, bytes] of Object.entries(payloads)) await write(root, name, bytes);
  const checked = checkArtifactBudget({root});
  assert.equal(checked.ok, false);
  assert.equal(checked.errors.length, Object.keys(payloads).length);
  for (const name of Object.keys(payloads)) assert.ok(checked.errors.some(error => error.startsWith(`${name}:`)), name);
});

test('compact aggregate JSON and code-generated fixtures remain acceptable', async t => {
  const {root} = await fixture(t);
  await write(root, 'docs/evidence/summary.json', JSON.stringify({tests: 98, failures: 0,
    frames: 97, maxErrorMm: 0.5, outputSha256: 'a'.repeat(64), source: 'external artifact reference'}));
  await write(root, 'tests/create_fixture.py', 'points = [(i, i + 1, i + 2) for i in range(1000)]\n');
  assert.equal(checkArtifactBudget({root}).ok, true);
});

test('per-file, cumulative byte and file-count budgets reject oversized additions', async t => {
  const {root} = await fixture(t);
  await write(root, 'large.md', 'x'.repeat(ARTIFACT_LIMITS.textBytes + 1));
  await write(root, 'large.py', '#'.repeat(ARTIFACT_LIMITS.sourceBytes + 1));
  const oversized = checkArtifactBudget({root});
  assert.equal(oversized.errors.filter(error => /file budget/u.test(error)).length, 2);
  await fs.rm(path.join(root, 'large.md'));
  await fs.rm(path.join(root, 'large.py'));
  for (let i = 0; i < 3; i++) await write(root, `source${i}.py`, '#'.repeat(400 * 1024));
  const total = checkArtifactBudget({root});
  assert.equal(total.errors.length, 1);
  assert.match(total.errors[0], /Changed payload/u);
  for (let i = 0; i < 3; i++) await fs.rm(path.join(root, `source${i}.py`));
  for (let i = 0; i <= ARTIFACT_LIMITS.changedFiles; i++) await write(root, `tiny/${i}.md`, 'x');
  assert.match(checkArtifactBudget({root}).errors[0], /Changed file count/u);
});

test('identical documentation relocations are reported separately in every input mode', async t => {
  const {root} = await fixture(t);
  let bytes = 0;
  for (let i = 0; i < 6; i++) {
    const content = `# Historical document ${i}\n${'x'.repeat(200 * 1024)}\n`;
    bytes += Buffer.byteLength(content);
    await write(root, `docs/old ${i}.md`, content);
  }
  const base = save(root, 'existing documentation');
  await fs.mkdir(path.join(root, 'docs/archive/v1'), {recursive: true});
  for (let i = 0; i < 6; i++) {
    await fs.rename(path.join(root, `docs/old ${i}.md`), path.join(root, `docs/archive/v1/old ${i}.md`));
  }
  const assertRelocations = checked => {
    assert.equal(checked.ok, true, checked.errors.join('\n'));
    assert.equal(checked.changedFiles, 6, 'relocations still count against the file limit');
    assert.equal(checked.changedBytes, 0);
    assert.equal(checked.relocatedFiles, 6);
    assert.equal(checked.relocatedBytes, bytes);
    assert.ok(bytes > ARTIFACT_LIMITS.changedBytes);
  };
  assertRelocations(checkArtifactBudget({root}));
  git(root, 'add', '-A');
  assertRelocations(checkArtifactBudget({root, staged: true}));
  save(root, 'relocate existing documentation');
  assertRelocations(checkArtifactBudget({root, base, head: 'HEAD'}));
});

test('edited documents, copies and overwritten paths retain their full byte charge', async t => {
  const {root} = await fixture(t);
  const originals = {'move.md': 'Move once\n', 'edit.md': 'Before edit\n',
    'keep.md': 'Keep the original\n', 'removed.md': 'Replace destination\n', 'existing.md': 'Earlier destination\n'};
  for (const [name, text] of Object.entries(originals)) await write(root, `docs/${name}`, text);
  save(root, 'existing documents');
  for (const name of ['move.md', 'edit.md', 'removed.md']) await fs.rm(path.join(root, `docs/${name}`));
  const candidates = {'archive/v1/first.md': originals['move.md'], 'archive/v1/second.md': originals['move.md'],
    'archive/v1/edited.md': 'After edit\n', 'archive/v1/copy.md': originals['keep.md'],
    'existing.md': originals['removed.md']};
  for (const [name, text] of Object.entries(candidates)) await write(root, `docs/${name}`, text);
  const checked = checkArtifactBudget({root});
  assert.equal(checked.ok, true, checked.errors.join('\n'));
  assert.equal(checked.relocatedFiles, 1, 'one deleted source cannot exempt multiple copies');
  assert.equal(checked.relocatedBytes, Buffer.byteLength(originals['move.md']));
  assert.equal(checked.changedBytes, Object.values(candidates).reduce((sum, text) => sum + Buffer.byteLength(text), 0) - checked.relocatedBytes);
});

test('a staged deletion recreated in the working tree cannot supply relocation credit', async t => {
  const {root} = await fixture(t);
  for (let i = 0; i < 6; i++) await write(root, `docs/source${i}.md`, `${i}\n${'x'.repeat(200 * 1024)}`);
  const base = save(root, 'existing documents');
  git(root, 'rm', '-r', 'docs');
  for (let i = 0; i < 6; i++) {
    await write(root, `docs/source${i}.md`, 'Replacement\n');
    await write(root, `docs/archive/v1/source${i}.md`, `${i}\n${'x'.repeat(200 * 1024)}`);
  }
  const assertCopies = checked => {
    assert.equal(checked.ok, false);
    assert.equal(checked.relocatedFiles, 0);
    assert.ok(checked.changedBytes > ARTIFACT_LIMITS.changedBytes);
    assert.match(checked.errors.join('\n'), /Changed payload/u);
  };
  assertCopies(checkArtifactBudget({root}));
  git(root, 'add', '-A');
  assertCopies(checkArtifactBudget({root, staged: true}));
  save(root, 'keep originals and add copies');
  assertCopies(checkArtifactBudget({root, base, head: 'HEAD'}));
});

test('relocation accounting never exempts evidence, non-documents, forbidden paths or invalid files', async t => {
  const {root} = await fixture(t);
  const originals = {
    'docs/evidence/record.md': 'Existing evidence\n',
    'docs/logs/record.md': 'Existing log\n',
    'outside/record.md': 'Outside docs\n',
    'docs/record.txt': 'Not Markdown\n',
    'docs/binary.md': Buffer.from([0, 255, 1]),
    'docs/oversized.md': 'x'.repeat(ARTIFACT_LIMITS.textBytes + 1),
    'docs/source.md': 'Ordinary document\n',
  };
  for (const [name, content] of Object.entries(originals)) await write(root, name, content);
  save(root, 'historical files');
  let index = 0;
  for (const [name, content] of Object.entries(originals)) {
    await fs.rm(path.join(root, name));
    await write(root, name === 'docs/source.md' ? 'docs/outputs/result.md' : `docs/archive/v1/${index++}.md`, content);
  }
  const checked = checkArtifactBudget({root});
  assert.equal(checked.relocatedFiles, 0);
  assert.equal(checked.relocatedBytes, 0);
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some(error => /binary payload/u.test(error)));
  assert.ok(checked.errors.some(error => /file budget/u.test(error)));
  assert.ok(checked.errors.some(error => /outputs\/result\.md.*payload/u.test(error)));
});

test('ignored local work is excluded, forced staging is checked, and CLI has no policy override', async t => {
  const {root} = await fixture(t);
  await write(root, '.gitignore', '*.blend\n');
  save(root);
  await write(root, 'local.blend', 'private local work');
  assert.equal(checkArtifactBudget({root}).changedFiles, 0);
  git(root, 'add', '-f', 'local.blend');
  assert.equal(checkArtifactBudget({root, staged: true}).ok, false);
  for (const args of [['--grandfather-commit', 'HEAD'], ['--max-bytes', '999999999'], ['--head', 'HEAD'], ['--staged', '--base', 'HEAD']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).ok, false);
  }
});

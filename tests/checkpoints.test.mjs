import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CAPABILITY_ORDER,
  abortEdit,
  auditProject,
  beginEdit,
  certifyProject,
  commitCheckpoint,
  contentReference,
  digestBytes,
  finishEdit,
  initProject,
  loadProject,
  reportFinding,
  restoreCheckpoint,
  resumeProject,
} from '../skills/refas/scripts/lib/index.mjs';

async function makeProject(t, projectId = 'checkpoint-study') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  const sourceBytes = Buffer.from('immutable primary source bytes\n');
  await fs.writeFile(path.join(root, 'source', 'reference.bin'), sourceBytes);
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(sourceBytes),
    sizeBytes: sourceBytes.length,
    width: 32,
    height: 24,
    authority: 'primary',
    acquisition: {kind: 'test-fixture'},
  };
  await initProject(root, {projectId, source});
  await fs.mkdir(path.join(root, 'model'), {recursive: true});
  return {root, source, artifactPath: path.join(root, 'model', 'state.bin')};
}

async function writeArtifact(root, file, bytes, kind = 'model-spec') {
  await fs.writeFile(file, bytes);
  return contentReference(file, {kind, root});
}

async function checkpoint(root, artifactPath, capability, content, scopeId = 'whole', gates = null) {
  const artifact = await writeArtifact(root, artifactPath, Buffer.from(content));
  return commitCheckpoint(root, {
    capability,
    scopeId,
    reason: `${capability} fixture is trustworthy`,
    artifactRefs: [artifact],
    claims: [`${capability} closed`],
    gates: gates ?? [{id: `${capability}-gate`, status: 'pass', evidenceRefs: [artifact.path]}],
  });
}

async function advanceThrough(root, artifactPath, lastCapability) {
  const checkpoints = [];
  for (const capability of CAPABILITY_ORDER) {
    checkpoints.push(await checkpoint(root, artifactPath, capability, `trusted:${capability}\n`));
    if (capability === lastCapability) break;
  }
  return checkpoints;
}

test('checkpoint restore materializes exact content-addressed artifact bytes', async (t) => {
  const {root, artifactPath} = await makeProject(t);
  const [source, hierarchy, observation] = await advanceThrough(root, artifactPath, 'visual-observation');
  assert.notEqual(source.id, hierarchy.id);
  assert.notEqual(hierarchy.id, observation.id);

  await fs.writeFile(artifactPath, Buffer.from('untrusted mutation\n'));
  const drifted = await auditProject(root);
  assert.equal(drifted.valid, false);
  assert.match(drifted.errors.join('\n'), /head artifact drift/);

  const result = await restoreCheckpoint(root, source.id, {reason: 'return to source truth'});
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:source-intake\n');
  assert.equal(result.nextCapability, 'visual-hierarchy');
  const guidance = await resumeProject(root);
  assert.equal(guidance.activeWork.capability, 'visual-hierarchy');
  assert.equal(guidance.nextAction, 'BEGIN_REPAIR_EDIT');
  assert.equal((await auditProject(root)).valid, true);
});

test('failed bounded edit restores baseline bytes and preserves rejected candidate history', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'bounded-edit-study');
  const checkpoints = await advanceThrough(root, artifactPath, 'assembly');
  const baseline = checkpoints.at(-1);
  const baselineBytes = await fs.readFile(artifactPath);

  await beginEdit(root, {ownerCapability: 'assembly', scopeId: 'whole', intent: 'test fastener root placement', protectedMetrics: ['attachment']});
  const candidate = await checkpoint(root, artifactPath, 'assembly', 'candidate:floating-fastener\n');
  const decision = await finishEdit(root, {
    candidateCheckpointId: candidate.id,
    before: {checkpointId: baseline.id, evidenceRefs: ['renders/before-grazing.png'], utilityScore: 0.82},
    after: {checkpointId: candidate.id, evidenceRefs: ['renders/after-grazing.png'], utilityScore: 0.9},
    findings: [{category: 'attachment-mismatch', severity: 'major', scopeId: 'whole.fastener', summary: 'The fastener floats above the shell.', evidenceRefs: ['renders/after-grazing.png'], introducedByEdit: true}],
  });
  assert.equal(decision.action, 'ROLLBACK_EDIT');
  assert.equal((await fs.readFile(artifactPath)).equals(baselineBytes), true);
  const state = await loadProject(root);
  assert.equal(state.head, baseline.id);
  assert.ok(state.checkpointIds.includes(candidate.id));
  assert.equal((await auditProject(root)).valid, true);
});

test('abort edit restores the baseline even before a candidate checkpoint exists', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'abort-study');
  const [baseline] = await advanceThrough(root, artifactPath, 'source-intake');
  await beginEdit(root, {ownerCapability: 'visual-hierarchy', scopeId: 'whole', intent: 'test a hierarchy alternative'});
  await fs.writeFile(artifactPath, Buffer.from('uncheckpointed and unsafe\n'));
  const decision = await abortEdit(root, {reason: 'evidence disproved the branch'});
  assert.equal(decision.baselineCheckpointId, baseline.id);
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:source-intake\n');
  assert.equal((await auditProject(root)).valid, true);
});

test('typed finding applies rollback state and resume selects the first invalidated owner', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'routing-study');
  const checkpoints = await advanceThrough(root, artifactPath, 'assembly');
  const spatial = checkpoints.find((item) => item.capability === 'spatial-hypotheses');
  const decision = await reportFinding(root, {
    finding: {category: 'silhouette-mismatch', severity: 'major', scopeId: 'whole', summary: 'Outer contour is too narrow.', evidenceRefs: ['renders/hero.png']},
  });
  assert.equal(decision.route.ownerCapability, 'shape-reconstruction');
  assert.equal(decision.route.rollbackCheckpointId, spatial.id);
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:spatial-hypotheses\n');
  const guidance = await resumeProject(root);
  assert.equal(guidance.activeWork.capability, 'shape-reconstruction');
  assert.deepEqual(guidance.invalidatedCapabilities.slice(0, 3), ['shape-reconstruction', 'surface-topology', 'assembly']);
  assert.equal((await auditProject(root)).valid, true);
});

test('artifact paths cannot escape the project through traversal or symlinks', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'containment-study');
  await fs.writeFile(artifactPath, Buffer.from('safe\n'));
  const fake = {kind: 'model-spec', path: '../escape.bin', sha256: digestBytes(Buffer.from('safe\n')), sizeBytes: 5};
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'unsafe path should fail', artifactRefs: [fake],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /escapes the project root/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'internal path should fail',
    artifactRefs: [{...fake, path: '.refas/project.json'}],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /internal state/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'empty artifact set should fail', artifactRefs: [],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /recoverable artifact/);

  const safeRef = await contentReference(artifactPath, {root});
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'evidence-free gate should fail', artifactRefs: [safeRef],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: []}],
  }), /current evidenceRefs/);

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-outside-'));
  t.after(() => fs.rm(outside, {recursive: true, force: true}));
  await fs.writeFile(path.join(outside, 'payload.bin'), Buffer.from('outside\n'));
  await fs.symlink(outside, path.join(root, 'model', 'outside-link'));
  const linked = {...await contentReference(path.join(outside, 'payload.bin'), {root}), path: 'model/outside-link/payload.bin'};
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'symlink should fail', artifactRefs: [linked],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /outside the project root/);
});

test('whole-object certification binds a passing head and survives audit', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'certification-study');
  const checkpoints = await advanceThrough(root, artifactPath, 'whole-object-certification');
  const head = checkpoints.at(-1);
  assert.equal(head.capability, 'whole-object-certification');
  const certificate = await certifyProject(root);
  assert.equal(certificate.checkpointId, head.id);
  assert.equal(certificate.sourceSha256, source.sha256);
  assert.equal(certificate.version, '1.0.0');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'DONE');
  assert.equal((await auditProject(root)).valid, true);

  await beginEdit(root, {ownerCapability: 'whole-object-certification', scopeId: 'whole', intent: 'reassess closure evidence'});
  const state = await loadProject(root);
  assert.equal(state.certification, null);
  await abortEdit(root, {reason: 'no change required'});
});

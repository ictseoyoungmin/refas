import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  commitCheckpoint,
  contentReference,
  digestBytes,
  getCurrentArtifact,
  getCurrentCheckpoint,
  loadHostSession,
  loadProject,
  openHostSession,
  initProject,
} from '../skills/refas/scripts/lib/index.mjs';

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-session-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}

async function sourceFixture(root, projectId = 'host-project') {
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  const bytes = Buffer.from('host session source bytes\n');
  const sourcePath = path.join(root, 'source', 'reference.bin');
  await fs.writeFile(sourcePath, bytes);
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(bytes),
    sizeBytes: bytes.length,
    width: 64,
    height: 64,
    authority: 'primary',
    acquisition: {kind: 'test-fixture'},
  };
  await initProject(root, {projectId, source});
  return source;
}

async function commitGlbHead(root) {
  await fs.mkdir(path.join(root, 'model'), {recursive: true});
  const candidatePath = path.join(root, 'model', 'candidate.glb');
  await fs.writeFile(candidatePath, Buffer.from('exact GLB candidate bytes\n'));
  const artifact = await contentReference(candidatePath, {kind: 'glb', root});
  const checkpoint = await commitCheckpoint(root, {
    capability: 'source-intake',
    scopeId: 'whole',
    reason: 'Host session fixture binds one exact current GLB candidate.',
    artifactRefs: [artifact],
    claims: ['Current host candidate is exact and digest-bound.'],
    gates: [{id: 'source-intake-gate', status: 'pass', evidenceRefs: [artifact.path]}],
  });
  return {artifact, checkpoint, candidatePath};
}

test('host session opens a new project without advancing reconstruction state', async (t) => {
  const root = await tempRoot(t);
  const session = await openHostSession(root, {sessionId: 'studio-session', projectId: 'host-project'});
  assert.equal(session.schema, 'refas.host-session/v1');
  assert.equal(session.status, 'idle');
  assert.equal(session.headCheckpointId, null);
  assert.equal(session.currentCandidate, null);
  assert.equal(session.sourceDigest, null);
  assert.equal(session.sequence, 0);
  const stored = JSON.parse(await fs.readFile(path.join(root, '.refas', 'host', 'session.json'), 'utf8'));
  assert.equal(stored.schema, 'refas.host-session-state/v1');
  assert.notEqual(stored.schema, session.schema);
  const state = await loadProject(root);
  assert.equal(state.status, 'source-required');
  assert.equal(state.head, null);
});

test('host session reopening is stable and does not mutate an existing project', async (t) => {
  const root = await tempRoot(t);
  await sourceFixture(root);
  const {artifact, checkpoint} = await commitGlbHead(root);
  const before = await loadProject(root);
  const opened = await openHostSession(root, {sessionId: 'studio-session', projectId: 'host-project'});
  const reopened = await loadHostSession(root, {sessionId: 'studio-session', projectId: 'host-project'});
  const after = await loadProject(root);
  assert.deepEqual(after, before);
  assert.deepEqual(reopened, opened);
  assert.equal(opened.status, 'active');
  assert.equal(opened.headCheckpointId, checkpoint.id);
  assert.deepEqual(opened.currentCandidate, {sha256: artifact.sha256, kind: 'glb'});
  assert.equal(opened.sourceDigest, before.source.sha256);
});

test('host session identity mismatches fail closed', async (t) => {
  const root = await tempRoot(t);
  await openHostSession(root, {sessionId: 'studio-session', projectId: 'host-project'});
  await assert.rejects(
    openHostSession(root, {sessionId: 'other-session', projectId: 'host-project'}),
    /already has host session studio-session/,
  );
  await assert.rejects(
    loadHostSession(root, {sessionId: 'studio-session', projectId: 'other-project'}),
    /host project mismatch/,
  );
});

test('current checkpoint and artifact queries return exact current bytes', async (t) => {
  const root = await tempRoot(t);
  await sourceFixture(root);
  const {artifact, checkpoint, candidatePath} = await commitGlbHead(root);
  await openHostSession(root, {sessionId: 'studio-session', projectId: 'host-project'});
  const currentCheckpoint = await getCurrentCheckpoint(root);
  const currentArtifact = await getCurrentArtifact(root);
  assert.equal(currentCheckpoint.id, checkpoint.id);
  assert.deepEqual(currentArtifact, {
    schema: 'refas.content-reference/v1',
    kind: 'glb',
    path: artifact.path,
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes,
  });
  await fs.writeFile(candidatePath, Buffer.from('drifted GLB bytes\n'));
  await assert.rejects(getCurrentArtifact(root), /current candidate size does not match|current candidate digest does not match/);
});

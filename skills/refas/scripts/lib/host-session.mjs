import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertId,
  deepFreeze,
  readJson,
  sha256File,
  writeJsonAtomic,
} from './canonical.mjs';
import {
  initProject,
  loadCheckpoint,
  loadProject,
} from './checkpoint-store.mjs';

export const HOST_SESSION_SCHEMA = 'refas.host-session/v1';
export const HOST_SESSION_STATUSES = Object.freeze([
  'idle',
  'active',
  'paused',
  'cancelling',
  'cancelled',
  'blocked',
  'reviewable',
  'completed',
  'failed',
]);

const HOST_STATE_DIR = path.join('.refas', 'host');
const HOST_SESSION_FILE = 'session.json';

function projectRoot(root) {
  return path.resolve(root);
}

function sessionPath(root) {
  return path.join(projectRoot(root), HOST_STATE_DIR, HOST_SESSION_FILE);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeSequence(value) {
  const sequence = Number(value ?? 0);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('host session sequence must be a non-negative safe integer');
  return sequence;
}

function validateStoredSession(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== HOST_SESSION_SCHEMA) throw new Error('invalid RefAs host session state');
  return {
    schema: HOST_SESSION_SCHEMA,
    sessionId: assertId(raw.sessionId, 'sessionId'),
    projectId: assertId(raw.projectId, 'projectId'),
    sequence: normalizeSequence(raw.sequence),
  };
}

function deriveHostStatus(state) {
  switch (state.status) {
    case 'source-required':
    case 'ready':
      return 'idle';
    case 'blocked':
      return 'blocked';
    case 'review-required':
    case 'closure-eligible':
      return 'reviewable';
    case 'certified':
      return 'completed';
    default:
      return 'active';
  }
}

async function readStoredSession(root) {
  return validateStoredSession(await readJson(sessionPath(root)));
}

async function verifiedGlbArtifact(root, checkpoint) {
  const candidates = (checkpoint?.artifactRefs ?? []).filter((artifact) => artifact?.kind === 'glb');
  if (!candidates.length) return null;
  if (candidates.length !== 1) throw new Error('current checkpoint has multiple GLB artifacts; host candidate is ambiguous');
  const artifact = candidates[0];
  const rawPath = String(artifact.path ?? '');
  if (!rawPath || path.isAbsolute(rawPath)) throw new Error('current candidate path must be project-relative');
  const absoluteRoot = projectRoot(root);
  const absoluteArtifact = path.resolve(absoluteRoot, rawPath);
  if (!isInside(absoluteRoot, absoluteArtifact)) throw new Error('current candidate path escapes the project root');
  const [realRoot, realArtifact] = await Promise.all([fs.realpath(absoluteRoot), fs.realpath(absoluteArtifact)]);
  if (!isInside(realRoot, realArtifact)) throw new Error('current candidate resolves outside the project root');
  const stat = await fs.stat(realArtifact);
  if (!stat.isFile()) throw new Error('current candidate is not a file');
  if (stat.size !== artifact.sizeBytes) throw new Error('current candidate size does not match its checkpoint reference');
  if (await sha256File(realArtifact) !== artifact.sha256) throw new Error('current candidate digest does not match its checkpoint reference');
  return deepFreeze({
    schema: 'refas.content-reference/v1',
    kind: 'glb',
    path: rawPath.split(path.sep).join('/'),
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes,
  });
}

async function buildSnapshot(root, stored, state) {
  if (state.projectId !== stored.projectId) throw new Error(`host session project mismatch: expected ${stored.projectId}, found ${state.projectId}`);
  const currentArtifact = await getCurrentArtifact(root, {state});
  return deepFreeze({
    schema: HOST_SESSION_SCHEMA,
    sessionId: stored.sessionId,
    projectId: stored.projectId,
    root: projectRoot(root),
    sourceDigest: state.source?.sha256 ?? null,
    status: deriveHostStatus(state),
    headCheckpointId: state.head ?? null,
    currentCandidate: currentArtifact ? {sha256: currentArtifact.sha256, kind: currentArtifact.kind} : null,
    sequence: stored.sequence,
  });
}

export async function openHostSession(root, {sessionId, projectId} = {}) {
  root = projectRoot(root);
  sessionId = assertId(sessionId, 'sessionId');
  projectId = assertId(projectId, 'projectId');

  let state;
  try {
    state = await loadProject(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = await initProject(root, {projectId});
  }
  if (state.projectId !== projectId) throw new Error(`project already initialized as ${state.projectId}`);

  let stored;
  try {
    stored = await readStoredSession(root);
    if (stored.sessionId !== sessionId) throw new Error(`project already has host session ${stored.sessionId}`);
    if (stored.projectId !== projectId) throw new Error(`host session already belongs to project ${stored.projectId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    stored = {schema: HOST_SESSION_SCHEMA, sessionId, projectId, sequence: 0};
    await writeJsonAtomic(sessionPath(root), stored);
  }

  return buildSnapshot(root, stored, state);
}

export async function loadHostSession(root, {sessionId = null, projectId = null} = {}) {
  root = projectRoot(root);
  const stored = await readStoredSession(root);
  if (sessionId != null && stored.sessionId !== assertId(sessionId, 'sessionId')) throw new Error(`host session mismatch: expected ${sessionId}, found ${stored.sessionId}`);
  if (projectId != null && stored.projectId !== assertId(projectId, 'projectId')) throw new Error(`host project mismatch: expected ${projectId}, found ${stored.projectId}`);
  const state = await loadProject(root);
  return buildSnapshot(root, stored, state);
}

export const getHostSession = loadHostSession;

export async function getCurrentCheckpoint(root, {state = null} = {}) {
  root = projectRoot(root);
  state ??= await loadProject(root);
  if (!state.head) return null;
  return deepFreeze(await loadCheckpoint(root, state.head));
}

export async function getCurrentArtifact(root, {state = null} = {}) {
  root = projectRoot(root);
  state ??= await loadProject(root);
  const checkpoint = await getCurrentCheckpoint(root, {state});
  if (!checkpoint) return null;
  return verifiedGlbArtifact(root, checkpoint);
}

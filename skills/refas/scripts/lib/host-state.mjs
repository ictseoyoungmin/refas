import fs from 'node:fs/promises';
import path from 'node:path';

import {assertId, readJson, writeJsonAtomic} from './canonical.mjs';

export const HOST_SESSION_STATE_SCHEMA = 'refas.host-session-state/v1';
const HOST_STATE_DIR = path.join('.refas', 'host');
const HOST_SESSION_FILE = 'session.json';
const mutationTails = new Map();

function rootPath(root) { return path.resolve(root); }
export function hostStatePath(root) { return path.join(rootPath(root), HOST_STATE_DIR, HOST_SESSION_FILE); }
function hostLockPath(root) { return `${hostStatePath(root)}.lock`; }

function sequence(value) {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('host session sequence must be a non-negative safe integer');
  return result;
}

export function normalizeHostState(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== HOST_SESSION_STATE_SCHEMA) throw new Error('invalid RefAs host session persistence state');
  return {
    schema: HOST_SESSION_STATE_SCHEMA,
    sessionId: assertId(raw.sessionId, 'sessionId'),
    projectId: assertId(raw.projectId, 'projectId'),
    sequence: sequence(raw.sequence),
    events: Array.isArray(raw.events) ? structuredClone(raw.events) : [],
  };
}

export async function readHostState(root) { return normalizeHostState(await readJson(hostStatePath(root))); }

export async function createHostState(root, {sessionId, projectId} = {}) {
  const state = {schema: HOST_SESSION_STATE_SCHEMA, sessionId: assertId(sessionId, 'sessionId'), projectId: assertId(projectId, 'projectId'), sequence: 0, events: []};
  await writeJsonAtomic(hostStatePath(root), state);
  return structuredClone(state);
}

export async function mutateHostState(root, mutation) {
  root = rootPath(root);
  const previous = mutationTails.get(root) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  mutationTails.set(root, tail);
  await previous.catch(() => {});
  const lockPath = hostLockPath(root);
  try {
    await fs.mkdir(lockPath);
  } catch (error) {
    release();
    if (mutationTails.get(root) === tail) mutationTails.delete(root);
    if (error.code === 'EEXIST') throw new Error('host state is locked by another mutating process');
    throw error;
  }
  try {
    const state = await readHostState(root);
    const result = await mutation(state);
    await writeJsonAtomic(hostStatePath(root), state);
    return result;
  } finally {
    await fs.rm(lockPath, {recursive: true, force: true});
    release();
    if (mutationTails.get(root) === tail) mutationTails.delete(root);
  }
}

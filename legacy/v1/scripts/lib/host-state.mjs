import fs from 'node:fs/promises';
import path from 'node:path';

import {assertId, readJson, writeJsonAtomic} from './canonical.mjs';

export const HOST_SESSION_STATE_SCHEMA = 'refas.host-session-state/v1';
const HOST_STATE_DIR = path.join('.refas', 'host');
const HOST_SESSION_FILE = 'session.json';
const mutationTails = new Map();
const STALE_LOCK_MS = 30_000;

function rootPath(root) { return path.resolve(root); }
export function hostStatePath(root) { return path.join(rootPath(root), HOST_STATE_DIR, HOST_SESSION_FILE); }
function hostLockPath(root) { return `${hostStatePath(root)}.lock`; }

function sequence(value) {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('host session sequence must be a non-negative safe integer');
  return result;
}

function operations(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('host operations persistence must be an array');
  const out = value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`host operations[${index}] must be an object`);
    assertId(item.operationId, `host operations[${index}].operationId`);
    return structuredClone(item);
  });
  const ids = out.map((item) => item.operationId);
  if (new Set(ids).size !== ids.length) throw new Error('host operation IDs must be unique');
  return out;
}

export function normalizeHostState(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== HOST_SESSION_STATE_SCHEMA) throw new Error('invalid RefAs host session persistence state');
  const normalizedOperations = operations(raw.operations);
  const currentOperationId = raw.currentOperationId == null ? null : assertId(raw.currentOperationId, 'currentOperationId');
  if (currentOperationId && !normalizedOperations.some((item) => item.operationId === currentOperationId)) throw new Error('current host operation is missing from persistence');
  return {
    schema: HOST_SESSION_STATE_SCHEMA,
    sessionId: assertId(raw.sessionId, 'sessionId'),
    projectId: assertId(raw.projectId, 'projectId'),
    sequence: sequence(raw.sequence),
    events: Array.isArray(raw.events) ? structuredClone(raw.events) : [],
    operations: normalizedOperations,
    currentOperationId,
  };
}

export async function readHostState(root) { return normalizeHostState(await readJson(hostStatePath(root))); }

export async function createHostState(root, {sessionId, projectId} = {}) {
  const state = {
    schema: HOST_SESSION_STATE_SCHEMA,
    sessionId: assertId(sessionId, 'sessionId'),
    projectId: assertId(projectId, 'projectId'),
    sequence: 0,
    events: [],
    operations: [],
    currentOperationId: null,
  };
  await writeJsonAtomic(hostStatePath(root), state);
  return structuredClone(state);
}

async function acquireHostLock(lockPath) {
  try { await fs.mkdir(lockPath); return; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = await fs.stat(lockPath).catch(() => null);
    if (!stat || Date.now() - stat.mtimeMs <= STALE_LOCK_MS) throw new Error('host state is locked by another mutating process');
    await fs.rm(lockPath, {recursive:true, force:true});
    try { await fs.mkdir(lockPath); }
    catch (retryError) {
      if (retryError.code === 'EEXIST') throw new Error('host state is locked by another mutating process');
      throw retryError;
    }
  }
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
  try { await acquireHostLock(lockPath); }
  catch (error) {
    release();
    if (mutationTails.get(root) === tail) mutationTails.delete(root);
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

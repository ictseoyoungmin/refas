import fs from 'node:fs/promises';
import path from 'node:path';

import {assertDigest, assertId, deepFreeze, digestJson, sha256File} from './canonical.mjs';
import {assertCapability} from './ownership.mjs';
import {mutateHostState, readHostState} from './host-state.mjs';

export const HOST_EVENT_SCHEMA = 'refas.host-event/v1';
export const HOST_EVENT_KINDS = Object.freeze([
  'session-opened','session-resumed','session-paused','session-cancel-requested','session-cancelled',
  'source-bound','work-started','scope-entered','checkpoint-created','checkpoint-restored',
  'candidate-created','candidate-updated','candidate-rejected','evidence-ready','render-ready','comparison-ready',
  'finding-opened','finding-updated','finding-resolved','reopen-required','review-bundle-ready',
  'certification-started','certification-passed','certification-failed','blocked','warning','failed','completed',
]);

const EVENT_INPUT_FIELDS = new Set(['kind','operationId','scopeId','capability','message','artifactRefs','recoverable']);
const EVENT_FIELDS = new Set(['schema','eventId','sessionId','sequence','time','kind','operationId','scopeId','capability','message','artifactRefs','recoverable']);
const listeners = new Map();

function rootPath(root) { return path.resolve(root); }
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function exactArtifact(root, raw, index) {
  if (!raw || typeof raw !== 'object' || raw.schema !== 'refas.content-reference/v1') throw new Error(`artifactRefs[${index}] must be a refas.content-reference/v1 reference`);
  const kind = assertId(raw.kind, `artifactRefs[${index}].kind`);
  const relative = String(raw.path ?? '');
  if (!relative || path.isAbsolute(relative)) throw new Error(`artifactRefs[${index}].path must be project-relative`);
  const sha256 = assertDigest(raw.sha256, `artifactRefs[${index}].sha256`);
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error(`artifactRefs[${index}].sizeBytes must be a non-negative safe integer`);
  const base = rootPath(root);
  const absolute = path.resolve(base, relative);
  if (!inside(base, absolute)) throw new Error(`artifactRefs[${index}].path escapes the project root`);
  const [realRoot, realFile] = await Promise.all([fs.realpath(base), fs.realpath(absolute)]);
  if (!inside(realRoot, realFile)) throw new Error(`artifactRefs[${index}] resolves outside the project root`);
  const stat = await fs.stat(realFile);
  if (!stat.isFile() || stat.size !== sizeBytes) throw new Error(`artifactRefs[${index}] size does not match exact bytes`);
  if (await sha256File(realFile) !== sha256) throw new Error(`artifactRefs[${index}] digest does not match exact bytes`);
  return {schema:'refas.content-reference/v1',kind,path:path.relative(realRoot,realFile).split(path.sep).join('/'),sha256,sizeBytes};
}

function validateEvent(event, sessionId, expectedSequence) {
  if (!event || event.schema !== HOST_EVENT_SCHEMA) throw new Error('unknown host event schema');
  for (const key of Object.keys(event)) if (!EVENT_FIELDS.has(key)) throw new Error(`unsupported persisted host event field: ${key}`);
  for (const key of EVENT_FIELDS) if (!(key in event)) throw new Error(`persisted host event is missing field: ${key}`);
  if (event.sessionId !== sessionId) throw new Error('host event session mismatch');
  if (event.sequence !== expectedSequence) throw new Error(`host event sequence gap at ${expectedSequence}`);
  if (!HOST_EVENT_KINDS.includes(event.kind)) throw new Error(`unknown host event kind: ${event.kind}`);
  const {eventId, ...core} = event;
  const expectedId = `event_${digestJson(core).slice(0, 20)}`;
  if (eventId !== expectedId) throw new Error('host event ID/content digest mismatch');
}

function assertHistory(state) {
  let expected = 1;
  for (const event of state.events) { validateEvent(event, state.sessionId, expected); expected += 1; }
  if (state.sequence !== state.events.length) throw new Error('host event sequence does not match persisted event history');
}

function notify(root, event) {
  for (const listener of listeners.get(rootPath(root)) ?? []) {
    try { listener(event); } catch { /* persisted delivery remains authoritative */ }
  }
}

export async function emitHostEvent(root, input = {}) {
  for (const key of Object.keys(input)) if (!EVENT_INPUT_FIELDS.has(key)) throw new Error(`unsupported host event field: ${key}`);
  const kind = String(input.kind ?? '');
  if (!HOST_EVENT_KINDS.includes(kind)) throw new Error(`unknown host event kind: ${kind}`);
  const operationId = input.operationId == null ? null : assertId(input.operationId, 'operationId');
  const scopeId = input.scopeId == null ? null : assertId(input.scopeId, 'scopeId');
  const capability = input.capability == null ? null : assertCapability(input.capability);
  const message = input.message == null ? null : String(input.message);
  if (message != null && message.length > 1000) throw new Error('host event message exceeds 1000 characters');
  const refs = [];
  for (const [index, raw] of (input.artifactRefs ?? []).entries()) refs.push(await exactArtifact(root, raw, index));
  const recoverable = input.recoverable !== false;
  let event;
  await mutateHostState(root, async (state) => {
    assertHistory(state);
    const sequence = state.sequence + 1;
    const core = {schema:HOST_EVENT_SCHEMA,sessionId:state.sessionId,sequence,time:new Date().toISOString(),kind,operationId,scopeId,capability,message,artifactRefs:refs,recoverable};
    const eventId = `event_${digestJson(core).slice(0, 20)}`;
    event = deepFreeze({...core,eventId});
    state.sequence = sequence;
    state.events.push(event);
  });
  notify(root, event);
  return event;
}

export async function getHostEvents(root, {afterSequence = 0} = {}) {
  afterSequence = Number(afterSequence);
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error('afterSequence must be a non-negative safe integer');
  const state = await readHostState(root);
  assertHistory(state);
  if (afterSequence > state.sequence) throw new Error('afterSequence is ahead of the current host event sequence');
  return deepFreeze(state.events.filter((event) => event.sequence > afterSequence).map((event) => structuredClone(event)));
}

export async function subscribeHostEvents(root, {afterSequence = 0, onEvent} = {}) {
  if (typeof onEvent !== 'function') throw new Error('subscribeHostEvents requires onEvent(event)');
  root = rootPath(root);
  let delivered = Number(afterSequence);
  const deliver = (event) => { if (event.sequence > delivered) { delivered = event.sequence; onEvent(event); } };
  for (const event of await getHostEvents(root, {afterSequence: delivered})) deliver(event);
  const bucket = listeners.get(root) ?? new Set();
  bucket.add(deliver);
  listeners.set(root, bucket);
  for (const event of await getHostEvents(root, {afterSequence: delivered})) deliver(event);
  return Object.freeze({
    get lastSequence() { return delivered; },
    unsubscribe() {
      const current = listeners.get(root);
      current?.delete(deliver);
      if (current?.size === 0) listeners.delete(root);
    },
  });
}

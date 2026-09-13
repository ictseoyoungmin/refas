import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {abortEdit, loadProject} from './checkpoint-store.mjs';
import {emitHostEvent} from './host-event.mjs';
import {mutateHostState, readHostState} from './host-state.mjs';

export const HOST_OPERATION_SCHEMA = 'refas.host-operation/v1';
export const HOST_OPERATION_STATUSES = Object.freeze([
  'active','pausing','paused','resuming','cancelling','cancelled','completed','failed',
]);

const REQUEST_FIELDS = new Set(['operationId','mode','intent','inputDigest']);
const OPERATION_FIELDS = new Set([
  'schema','operationId','sessionId','projectId','requestDigest','mode','intent','inputDigest','status',
  'startedAt','updatedAt','pauseRequestedAt','cancelRequestedAt','resumeCount','terminal',
]);
const runtimeControllers = new Map();

function runtimeKey(root, operationId) { return `${new URL(`file://${String(root)}`).pathname}::${operationId}`; }
function now() { return new Date().toISOString(); }
function terminalStatus(status) { return ['cancelled','completed','failed'].includes(status); }

function requestCore(request = {}) {
  for (const key of Object.keys(request)) if (!REQUEST_FIELDS.has(key)) throw new Error(`unsupported host operation request field: ${key}`);
  const operationId = assertId(request.operationId, 'operationId');
  const mode = String(request.mode ?? 'mutating');
  if (!['mutating','read-only'].includes(mode)) throw new Error('host operation mode must be mutating or read-only');
  const intent = String(request.intent ?? '');
  if (!intent || intent.length > 1000) throw new Error('host operation intent must contain 1..1000 characters');
  const inputDigest = request.inputDigest == null ? null : assertDigest(request.inputDigest, 'inputDigest');
  return {operationId,mode,intent,inputDigest};
}

function validateTerminal(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object') throw new Error('host operation terminal must be an object or null');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== ['errorCode','headCheckpointId','status'].sort().join(',')) throw new Error('host operation terminal contains unsupported fields');
  if (!['cancelled','completed','failed'].includes(value.status)) throw new Error('host operation terminal status is invalid');
  return {
    status:value.status,
    headCheckpointId:value.headCheckpointId == null ? null : assertId(value.headCheckpointId, 'terminal.headCheckpointId'),
    errorCode:value.errorCode == null ? null : assertId(value.errorCode, 'terminal.errorCode'),
  };
}

function validateOperation(raw, state) {
  if (!raw || raw.schema !== HOST_OPERATION_SCHEMA) throw new Error('unknown host operation schema');
  for (const key of Object.keys(raw)) if (!OPERATION_FIELDS.has(key)) throw new Error(`unsupported persisted host operation field: ${key}`);
  for (const key of OPERATION_FIELDS) if (!(key in raw)) throw new Error(`persisted host operation is missing field: ${key}`);
  const operationId = assertId(raw.operationId, 'operationId');
  if (raw.sessionId !== state.sessionId || raw.projectId !== state.projectId) throw new Error('host operation session/project mismatch');
  const mode = String(raw.mode);
  if (!['mutating','read-only'].includes(mode)) throw new Error('persisted host operation mode is invalid');
  const intent = String(raw.intent ?? '');
  if (!intent || intent.length > 1000) throw new Error('persisted host operation intent is invalid');
  const inputDigest = raw.inputDigest == null ? null : assertDigest(raw.inputDigest, 'inputDigest');
  const requestDigest = assertDigest(raw.requestDigest, 'requestDigest');
  if (requestDigest !== digestJson({mode,intent,inputDigest})) throw new Error('host operation request digest mismatch');
  if (!HOST_OPERATION_STATUSES.includes(raw.status)) throw new Error('persisted host operation status is invalid');
  const resumeCount = Number(raw.resumeCount);
  if (!Number.isSafeInteger(resumeCount) || resumeCount < 0) throw new Error('host operation resumeCount is invalid');
  const terminal = validateTerminal(raw.terminal);
  if (terminalStatus(raw.status) !== Boolean(terminal)) throw new Error('host operation terminal/status mismatch');
  return deepFreeze(structuredClone({...raw,operationId,mode,intent,inputDigest,requestDigest,resumeCount,terminal}));
}

function locate(state, operationId) {
  const raw = state.operations.find((item) => item.operationId === operationId);
  if (!raw) throw new Error(`unknown host operation ${operationId}`);
  return raw;
}

async function snapshot(root, operationId) {
  const state = await readHostState(root);
  return validateOperation(locate(state, operationId), state);
}

async function headId(root) { return (await loadProject(root)).head ?? null; }

async function updateOperation(root, operationId, mutate) {
  let result;
  await mutateHostState(root, async (state) => {
    const raw = locate(state, operationId);
    validateOperation(raw, state);
    mutate(raw, state);
    raw.updatedAt = now();
    result = validateOperation(raw, state);
  });
  return result;
}

async function finalizePaused(root, operationId) {
  const current = await snapshot(root, operationId);
  if (current.status === 'paused') return current;
  if (terminalStatus(current.status)) return current;
  if (!['active','resuming','pausing'].includes(current.status)) throw new Error(`cannot pause host operation from ${current.status}`);
  const operation = await updateOperation(root, operationId, (raw) => { raw.status = 'paused'; });
  await emitHostEvent(root, {kind:'session-paused',operationId,message:'Host operation paused at a safe boundary.',recoverable:true});
  return operation;
}

async function finalizeCancelled(root, operationId) {
  let project = await loadProject(root);
  if (project.activeTransaction) {
    await abortEdit(root, {reason:`host operation ${operationId} cancelled`});
    project = await loadProject(root);
  }
  const current = await snapshot(root, operationId);
  if (current.status === 'cancelled') return current;
  if (current.status === 'completed') return current;
  const operation = await updateOperation(root, operationId, (raw, state) => {
    raw.status = 'cancelled';
    raw.terminal = {status:'cancelled',headCheckpointId:project.head ?? null,errorCode:null};
    if (raw.mode === 'mutating') state.currentOperationId = operationId;
  });
  await emitHostEvent(root, {kind:'session-cancelled',operationId,message:'Host operation cancelled and in-flight bounded edit abandoned.',recoverable:true});
  return operation;
}

async function finalizeCompleted(root, operationId) {
  const current = await snapshot(root, operationId);
  if (terminalStatus(current.status)) return current;
  const checkpointId = await headId(root);
  const operation = await updateOperation(root, operationId, (raw, state) => {
    if (raw.status === 'pausing' || raw.status === 'paused' || raw.status === 'cancelling') return;
    raw.status = 'completed';
    raw.terminal = {status:'completed',headCheckpointId:checkpointId,errorCode:null};
    if (raw.mode === 'mutating') state.currentOperationId = operationId;
  });
  if (operation.status === 'completed') await emitHostEvent(root, {kind:'completed',operationId,message:'Host operation completed.',recoverable:true});
  return operation;
}

async function finalizeFailed(root, operationId, errorCode = 'executor-failed') {
  const current = await snapshot(root, operationId);
  if (terminalStatus(current.status)) return current;
  const checkpointId = await headId(root);
  const operation = await updateOperation(root, operationId, (raw, state) => {
    raw.status = 'failed';
    raw.terminal = {status:'failed',headCheckpointId:checkpointId,errorCode:assertId(errorCode, 'errorCode')};
    if (raw.mode === 'mutating') state.currentOperationId = operationId;
  });
  await emitHostEvent(root, {kind:'failed',operationId,message:'Host operation failed.',recoverable:true});
  return operation;
}

class BoundaryStop extends Error { constructor(kind) { super(kind); this.kind = kind; } }

async function safeBoundary(root, operationId) {
  const operation = await snapshot(root, operationId);
  if (operation.status === 'pausing') { await finalizePaused(root, operationId); throw new BoundaryStop('paused'); }
  if (operation.status === 'cancelling') { await finalizeCancelled(root, operationId); throw new BoundaryStop('cancelled'); }
  if (operation.status === 'paused' || operation.status === 'cancelled') throw new BoundaryStop(operation.status);
  return operation;
}

async function runExecutor(root, operationId, executor) {
  if (typeof executor !== 'function') throw new Error('host operation executor must be a function');
  const key = runtimeKey(root, operationId);
  if (runtimeControllers.has(key)) return snapshot(root, operationId);
  const controller = new AbortController();
  runtimeControllers.set(key, controller);
  try {
    const before = await snapshot(root, operationId);
    if (!['active','resuming'].includes(before.status)) return before;
    try {
      await executor({operationId,signal:controller.signal,safeBoundary:()=>safeBoundary(root, operationId)});
    } catch (error) {
      if (error instanceof BoundaryStop) return snapshot(root, operationId);
      const current = await snapshot(root, operationId);
      if (current.status === 'pausing') return finalizePaused(root, operationId);
      if (current.status === 'cancelling') return finalizeCancelled(root, operationId);
      if (current.status === 'paused' || current.status === 'cancelled') return current;
      await finalizeFailed(root, operationId, 'executor-failed');
      throw error;
    }
    const current = await snapshot(root, operationId);
    if (current.status === 'pausing') return finalizePaused(root, operationId);
    if (current.status === 'cancelling') return finalizeCancelled(root, operationId);
    if (current.status === 'paused' || current.status === 'cancelled') return current;
    return finalizeCompleted(root, operationId);
  } finally {
    if (runtimeControllers.get(key) === controller) runtimeControllers.delete(key);
  }
}

export async function executeHostOperation(root, request = {}, executor) {
  const normalized = requestCore(request);
  const requestDigest = digestJson({mode:normalized.mode,intent:normalized.intent,inputDigest:normalized.inputDigest});
  let created = false;
  let operation;
  await mutateHostState(root, async (state) => {
    const existing = state.operations.find((item) => item.operationId === normalized.operationId);
    if (existing) {
      operation = validateOperation(existing, state);
      if (operation.requestDigest !== requestDigest) throw new Error(`operationId ${normalized.operationId} was already used for a different request`);
      return;
    }
    if (normalized.mode === 'mutating' && state.currentOperationId) {
      const current = validateOperation(locate(state, state.currentOperationId), state);
      if (!terminalStatus(current.status)) throw new Error(`mutating host operation already active: ${current.operationId}`);
    }
    const time = now();
    const raw = {
      schema:HOST_OPERATION_SCHEMA,operationId:normalized.operationId,sessionId:state.sessionId,projectId:state.projectId,
      requestDigest,mode:normalized.mode,intent:normalized.intent,inputDigest:normalized.inputDigest,status:'active',
      startedAt:time,updatedAt:time,pauseRequestedAt:null,cancelRequestedAt:null,resumeCount:0,terminal:null,
    };
    state.operations.push(raw);
    if (normalized.mode === 'mutating') state.currentOperationId = normalized.operationId;
    operation = validateOperation(raw, state);
    created = true;
  });
  if (!created) return operation;
  await emitHostEvent(root, {kind:'work-started',operationId:operation.operationId,message:'Host operation started.',recoverable:true});
  return runExecutor(root, operation.operationId, executor);
}

export async function pauseHostOperation(root, {operationId} = {}) {
  operationId = assertId(operationId, 'operationId');
  let changed = false;
  const operation = await updateOperation(root, operationId, (raw) => {
    if (terminalStatus(raw.status) || raw.status === 'paused' || raw.status === 'pausing') return;
    if (!['active','resuming'].includes(raw.status)) throw new Error(`cannot request pause from ${raw.status}`);
    raw.status = 'pausing';
    raw.pauseRequestedAt = now();
    changed = true;
  });
  if (!changed) return operation;
  const controller = runtimeControllers.get(runtimeKey(root, operationId));
  controller?.abort(new Error('host pause requested'));
  if (!controller) return finalizePaused(root, operationId);
  return snapshot(root, operationId);
}

export async function resumeHostOperation(root, {operationId} = {}, executor) {
  operationId = assertId(operationId, 'operationId');
  const operation = await updateOperation(root, operationId, (raw, state) => {
    if (raw.status !== 'paused') throw new Error(`cannot resume host operation from ${raw.status}`);
    if (raw.mode === 'mutating' && state.currentOperationId && state.currentOperationId !== operationId) throw new Error(`another mutating host operation owns the project: ${state.currentOperationId}`);
    raw.status = 'resuming';
    raw.resumeCount += 1;
    if (raw.mode === 'mutating') state.currentOperationId = operationId;
  });
  await emitHostEvent(root, {kind:'session-resumed',operationId,message:'Host operation resumed.',recoverable:true});
  await updateOperation(root, operationId, (raw) => { if (raw.status === 'resuming') raw.status = 'active'; });
  return runExecutor(root, operationId, executor);
}

export async function cancelHostOperation(root, {operationId} = {}) {
  operationId = assertId(operationId, 'operationId');
  let changed = false;
  const operation = await updateOperation(root, operationId, (raw) => {
    if (terminalStatus(raw.status) || raw.status === 'cancelling') return;
    raw.status = 'cancelling';
    raw.cancelRequestedAt = now();
    changed = true;
  });
  if (!changed) return operation;
  await emitHostEvent(root, {kind:'session-cancel-requested',operationId,message:'Host operation cancellation requested.',recoverable:true});
  const controller = runtimeControllers.get(runtimeKey(root, operationId));
  controller?.abort(new Error('host cancellation requested'));
  if (!controller) return finalizeCancelled(root, operationId);
  return snapshot(root, operationId);
}

export async function getHostOperation(root, {operationId} = {}) {
  return snapshot(root, assertId(operationId, 'operationId'));
}

export async function listHostOperations(root) {
  const state = await readHostState(root);
  return deepFreeze(state.operations.map((item) => validateOperation(item, state)));
}

export async function recoverInterruptedHostOperation(root) {
  const state = await readHostState(root);
  if (!state.currentOperationId) return null;
  const operation = validateOperation(locate(state, state.currentOperationId), state);
  if (terminalStatus(operation.status) || operation.status === 'paused') return operation;
  if (runtimeControllers.has(runtimeKey(root, operation.operationId))) return operation;
  if (operation.status === 'cancelling') return finalizeCancelled(root, operation.operationId);
  if (['active','resuming','pausing'].includes(operation.status)) return finalizePaused(root, operation.operationId);
  return operation;
}

export function hostOperationStatus(hostState) {
  if (!hostState?.currentOperationId) return null;
  const raw = hostState.operations?.find((item) => item.operationId === hostState.currentOperationId);
  if (!raw) throw new Error('current host operation is missing');
  if (raw.status === 'paused') return 'paused';
  if (raw.status === 'cancelling') return 'cancelling';
  if (raw.status === 'cancelled') return 'cancelled';
  if (raw.status === 'failed') return 'failed';
  if (['active','resuming','pausing'].includes(raw.status)) return 'active';
  return null;
}

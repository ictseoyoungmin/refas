import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertDigest,
  assertId,
  deepFreeze,
  digestJson,
  sha256File,
  stableStringify,
} from './canonical.mjs';
import {emitHostEvent} from './host-event.mjs';
import {getHostOperation} from './host-operation.mjs';
import {loadHostSession} from './host-session.mjs';

export const WORKER_REQUEST_SCHEMA = 'refas.worker-request/v1';
export const WORKER_RESPONSE_SCHEMA = 'refas.worker-response/v1';

const MAX_TIMEOUT_MS = 86_400_000;
const MAX_TERMINATION_GRACE_MS = 10_000;
const MAX_STDOUT_BYTES = 1_048_576;
const MAX_STDERR_BYTES = 65_536;
const MAX_CONTENT_REFS = 256;
const REQUEST_KEYS = Object.freeze([
  'schema','workerRunId','workerId','sessionId','projectId','operationId','operationRequestDigest',
  'intent','inputDigest','inputs','timeoutMs','requestDigest',
]);
const RESPONSE_KEYS = Object.freeze([
  'schema','workerRunId','operationId','requestDigest','status','message','artifactRefs',
]);
const BUILD_FIELDS = new Set(['workerRunId','workerId','operationId','intent','inputDigest','inputRefs','timeoutMs']);
const RUN_FIELDS = new Set([
  'workerRunId','workerId','operationId','command','args','intent','inputDigest','inputRefs',
  'timeoutMs','terminationGraceMs',
]);

function projectRoot(root) { return path.resolve(root); }

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (stableStringify(keys) !== stableStringify(wanted)) throw new Error(`${label} contains unsupported or missing fields`);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeContentReference(raw, label) {
  exactKeys(raw, ['schema','kind','path','sha256','sizeBytes'], label);
  if (raw.schema !== 'refas.content-reference/v1') throw new Error(`${label}.schema must be refas.content-reference/v1`);
  const kind = assertId(raw.kind, `${label}.kind`);
  const relative = String(raw.path ?? '');
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.startsWith('/') ||
    relative.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/u.test(relative) ||
    relative.includes('\\')
  ) throw new Error(`${label}.path must be normalized and project-relative`);
  if (relative === '.refas' || relative.startsWith('.refas/') || relative.split('/').includes('..')) {
    throw new Error(`${label}.path may not reference RefAs internal or parent state`);
  }
  if (path.posix.normalize(relative) !== relative) throw new Error(`${label}.path must already be normalized`);
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error(`${label}.sizeBytes must be a non-negative safe integer`);
  return {
    schema:'refas.content-reference/v1',
    kind,
    path:relative,
    sha256:assertDigest(raw.sha256, `${label}.sha256`),
    sizeBytes,
  };
}

async function verifyContentReference(root, raw, label) {
  const normalized = normalizeContentReference(raw, label);
  const base = projectRoot(root);
  const absolute = path.resolve(base, normalized.path);
  if (!inside(base, absolute)) throw new Error(`${label}.path escapes the project root`);
  const [realRoot, realFile] = await Promise.all([fs.realpath(base), fs.realpath(absolute)]);
  if (!inside(realRoot, realFile)) throw new Error(`${label} resolves outside the project root`);
  const stat = await fs.stat(realFile);
  if (!stat.isFile()) throw new Error(`${label} is not a file`);
  if (stat.size !== normalized.sizeBytes) throw new Error(`${label} size does not match exact bytes`);
  if (await sha256File(realFile) !== normalized.sha256) throw new Error(`${label} digest does not match exact bytes`);
  const relative = path.relative(realRoot, realFile).split(path.sep).join('/');
  if (relative !== normalized.path) throw new Error(`${label} canonical path does not match its real project-relative path`);
  return deepFreeze(normalized);
}

function normalizeTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be an integer in 1..${MAX_TIMEOUT_MS}`);
  }
  return timeoutMs;
}

function normalizeRequestIntrinsic(request) {
  exactKeys(request, REQUEST_KEYS, 'worker request');
  if (request.schema !== WORKER_REQUEST_SCHEMA) throw new Error('invalid worker request schema');
  const workerRunId = assertId(request.workerRunId, 'workerRunId');
  const workerId = assertId(request.workerId, 'workerId');
  const sessionId = assertId(request.sessionId, 'sessionId');
  const projectId = assertId(request.projectId, 'projectId');
  const operationId = assertId(request.operationId, 'operationId');
  const operationRequestDigest = assertDigest(request.operationRequestDigest, 'operationRequestDigest');
  const intent = String(request.intent ?? '');
  if (!intent || intent.length > 1000) throw new Error('worker request intent must contain 1..1000 characters');
  const inputDigest = request.inputDigest == null ? null : assertDigest(request.inputDigest, 'inputDigest');
  if (!Array.isArray(request.inputs) || request.inputs.length > MAX_CONTENT_REFS) {
    throw new Error(`worker request inputs must contain at most ${MAX_CONTENT_REFS} content references`);
  }
  const inputs = request.inputs.map((item, index) => normalizeContentReference(item, `inputs[${index}]`));
  const timeoutMs = normalizeTimeout(request.timeoutMs);
  const core = {
    schema:WORKER_REQUEST_SCHEMA,
    workerRunId,
    workerId,
    sessionId,
    projectId,
    operationId,
    operationRequestDigest,
    intent,
    inputDigest,
    inputs,
    timeoutMs,
  };
  const requestDigest = assertDigest(request.requestDigest, 'requestDigest');
  if (requestDigest !== digestJson(core)) throw new Error('worker request digest mismatch');
  return deepFreeze({...core, requestDigest});
}

function normalizeResponseIntrinsic(response, request = null) {
  exactKeys(response, RESPONSE_KEYS, 'worker response');
  if (response.schema !== WORKER_RESPONSE_SCHEMA) throw new Error('invalid worker response schema');
  const workerRunId = assertId(response.workerRunId, 'workerRunId');
  const operationId = assertId(response.operationId, 'operationId');
  const requestDigest = assertDigest(response.requestDigest, 'requestDigest');
  if (response.status !== 'completed') throw new Error('worker response status must be completed');
  const message = response.message == null ? null : String(response.message);
  if (message != null && message.length > 1000) throw new Error('worker response message exceeds 1000 characters');
  if (!Array.isArray(response.artifactRefs) || response.artifactRefs.length > MAX_CONTENT_REFS) {
    throw new Error(`worker response artifactRefs must contain at most ${MAX_CONTENT_REFS} content references`);
  }
  const artifactRefs = response.artifactRefs.map((item, index) => normalizeContentReference(item, `artifactRefs[${index}]`));
  if (request) {
    if (workerRunId !== request.workerRunId) throw new Error('worker response workerRunId mismatch');
    if (operationId !== request.operationId) throw new Error('worker response operationId mismatch');
    if (requestDigest !== request.requestDigest) throw new Error('worker response requestDigest mismatch');
  }
  return deepFreeze({
    schema:WORKER_RESPONSE_SCHEMA,
    workerRunId,
    operationId,
    requestDigest,
    status:'completed',
    message,
    artifactRefs,
  });
}

export function validateWorkerRequest(request) {
  const errors = [];
  try { normalizeRequestIntrinsic(request); } catch (error) { errors.push(error.message); }
  return {valid:errors.length === 0, errors};
}

export function validateWorkerResponse(response, {request = null} = {}) {
  const errors = [];
  try {
    const normalizedRequest = request == null ? null : normalizeRequestIntrinsic(request);
    normalizeResponseIntrinsic(response, normalizedRequest);
  } catch (error) {
    errors.push(error.message);
  }
  return {valid:errors.length === 0, errors};
}

export async function buildWorkerRequest(root, input = {}) {
  for (const key of Object.keys(input)) if (!BUILD_FIELDS.has(key)) throw new Error(`unsupported worker request field: ${key}`);
  root = projectRoot(root);
  const workerRunId = assertId(input.workerRunId, 'workerRunId');
  const workerId = assertId(input.workerId, 'workerId');
  const operationId = assertId(input.operationId, 'operationId');
  const intent = String(input.intent ?? '');
  if (!intent || intent.length > 1000) throw new Error('worker intent must contain 1..1000 characters');
  const inputDigest = input.inputDigest == null ? null : assertDigest(input.inputDigest, 'inputDigest');
  const timeoutMs = normalizeTimeout(input.timeoutMs ?? 30_000);
  const rawInputs = input.inputRefs ?? [];
  if (!Array.isArray(rawInputs) || rawInputs.length > MAX_CONTENT_REFS) {
    throw new Error(`inputRefs must contain at most ${MAX_CONTENT_REFS} content references`);
  }

  const [session, operation] = await Promise.all([
    loadHostSession(root),
    getHostOperation(root, {operationId}),
  ]);
  if (operation.sessionId !== session.sessionId || operation.projectId !== session.projectId) {
    throw new Error('worker request host operation/session mismatch');
  }
  if (!['active','resuming'].includes(operation.status)) {
    throw new Error(`worker request requires an active host operation, found ${operation.status}`);
  }

  const inputs = [];
  for (const [index, raw] of rawInputs.entries()) {
    inputs.push(await verifyContentReference(root, raw, `inputRefs[${index}]`));
  }
  const core = {
    schema:WORKER_REQUEST_SCHEMA,
    workerRunId,
    workerId,
    sessionId:session.sessionId,
    projectId:session.projectId,
    operationId,
    operationRequestDigest:operation.requestDigest,
    intent,
    inputDigest,
    inputs,
    timeoutMs,
  };
  return deepFreeze({...core, requestDigest:digestJson(core)});
}

function captureState(limit) {
  return {limit,bytes:0,chunks:[],truncated:false};
}

function appendCapture(state, chunk) {
  const bytes = Buffer.from(chunk);
  const remaining = Math.max(0, state.limit - state.bytes);
  if (remaining > 0) {
    const accepted = bytes.subarray(0, remaining);
    state.chunks.push(accepted);
    state.bytes += accepted.length;
  }
  if (bytes.length > remaining) state.truncated = true;
}

function captureText(state, {markTruncated = false} = {}) {
  const text = Buffer.concat(state.chunks).toString('utf8');
  return markTruncated && state.truncated ? `${text}\n[diagnostics truncated]` : text;
}

function normalizeRunOptions(options = {}) {
  for (const key of Object.keys(options)) if (!RUN_FIELDS.has(key)) throw new Error(`unsupported external worker option: ${key}`);
  const command = String(options.command ?? '');
  if (!command || command.length > 4096) throw new Error('external worker command must contain 1..4096 characters');
  const rawArgs = options.args ?? [];
  if (!Array.isArray(rawArgs) || rawArgs.length > 64) throw new Error('external worker args must be an array of at most 64 strings');
  const args = rawArgs.map((value, index) => {
    const arg = String(value);
    if (arg.length > 4096) throw new Error(`external worker args[${index}] exceeds 4096 characters`);
    return arg;
  });
  const terminationGraceMs = Number(options.terminationGraceMs ?? 250);
  if (!Number.isSafeInteger(terminationGraceMs) || terminationGraceMs < 0 || terminationGraceMs > MAX_TERMINATION_GRACE_MS) {
    throw new Error(`terminationGraceMs must be an integer in 0..${MAX_TERMINATION_GRACE_MS}`);
  }
  return {...options, command, args, terminationGraceMs};
}

export class ExternalWorkerError extends Error {
  constructor(code, message, {diagnostics = ''} = {}) {
    super(message);
    this.name = 'ExternalWorkerError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

async function emitWorkerTerminal(root, {kind, operationId, workerRunId, artifactRefs = [], message}) {
  return emitHostEvent(root, {
    kind,
    operationId,
    workerRunId,
    message,
    artifactRefs,
    recoverable:true,
  });
}

async function classifyAbort(root, request, diagnostics) {
  const operation = await getHostOperation(root, {operationId:request.operationId});
  if (operation.status === 'cancelling' || operation.status === 'cancelled') {
    await emitWorkerTerminal(root, {
      kind:'worker-cancelled',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker terminated for host cancellation.',
    });
    throw new ExternalWorkerError('worker-cancelled', 'external worker cancelled by host operation', {diagnostics});
  }
  if (operation.status === 'pausing' || operation.status === 'paused') {
    throw new ExternalWorkerError('worker-paused', 'external worker interrupted for host operation pause', {diagnostics});
  }
  await emitWorkerTerminal(root, {
    kind:'worker-failed',
    operationId:request.operationId,
    workerRunId:request.workerRunId,
    message:'External worker received an unexpected abort signal.',
  });
  throw new ExternalWorkerError('worker-failed', 'external worker aborted outside host pause/cancel semantics', {diagnostics});
}

export async function runExternalWorker(root, options = {}, {signal = null} = {}) {
  root = projectRoot(root);
  const normalized = normalizeRunOptions(options);
  if (signal != null && (typeof signal.addEventListener !== 'function' || typeof signal.aborted !== 'boolean')) {
    throw new Error('external worker signal must be an AbortSignal');
  }
  const request = await buildWorkerRequest(root, {
    workerRunId:normalized.workerRunId,
    workerId:normalized.workerId,
    operationId:normalized.operationId,
    intent:normalized.intent,
    inputDigest:normalized.inputDigest,
    inputRefs:normalized.inputRefs,
    timeoutMs:normalized.timeoutMs,
  });
  if (signal?.aborted) return classifyAbort(root, request, '');

  await emitHostEvent(root, {
    kind:'worker-started',
    operationId:request.operationId,
    workerRunId:request.workerRunId,
    message:'External worker run started by the parent host.',
    recoverable:true,
  });
  if (signal?.aborted) return classifyAbort(root, request, '');

  let child;
  try {
    child = spawn(normalized.command, normalized.args, {
      cwd:root,
      shell:false,
      stdio:['pipe','pipe','pipe'],
    });
  } catch (error) {
    if (signal?.aborted) return classifyAbort(root, request, '');
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker launch failed before process creation.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker launch failed: ${error.message}`);
  }
  const stdout = captureState(MAX_STDOUT_BYTES);
  const stderr = captureState(MAX_STDERR_BYTES);
  let terminalCause = null;
  let killTimer = null;
  let timeoutTimer = null;
  let settled = false;

  const terminate = (cause) => {
    if (terminalCause == null) terminalCause = cause;
    if (child.exitCode != null || child.signalCode != null) return;
    try { child.kill('SIGTERM'); } catch { /* close/error path will classify */ }
    if (normalized.terminationGraceMs === 0) {
      try { child.kill('SIGKILL'); } catch { /* process may already be gone */ }
      return;
    }
    if (!killTimer) {
      killTimer = setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null) {
          try { child.kill('SIGKILL'); } catch { /* process may already be gone */ }
        }
      }, normalized.terminationGraceMs);
      killTimer.unref?.();
    }
  };

  child.stdout.on('data', (chunk) => {
    appendCapture(stdout, chunk);
    if (stdout.truncated) terminate('stdout-overflow');
  });
  child.stderr.on('data', (chunk) => appendCapture(stderr, chunk));

  const abortListener = () => terminate('aborted');
  signal?.addEventListener('abort', abortListener, {once:true});
  if (signal?.aborted) terminate('aborted');

  const outcomePromise = new Promise((resolve) => {
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once('error', (error) => finish({kind:'error',error}));
    child.once('close', (code, signalName) => finish({kind:'close',code,signalName}));
  });

  const spawnResult = await new Promise((resolve) => {
    const onSpawn = () => { cleanup(); resolve({ok:true}); };
    const onError = (error) => { cleanup(); resolve({ok:false,error}); };
    const cleanup = () => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });

  if (!spawnResult.ok) {
    signal?.removeEventListener('abort', abortListener);
    const diagnostics = captureText(stderr, {markTruncated:true});
    if (terminalCause === 'aborted' || signal?.aborted) return classifyAbort(root, request, diagnostics);
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker failed to start.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker failed to start: ${spawnResult.error.message}`, {diagnostics});
  }

  child.stdin.on('error', () => { /* close/error path remains authoritative */ });
  child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');

  timeoutTimer = setTimeout(() => terminate('timeout'), request.timeoutMs);
  timeoutTimer.unref?.();

  const outcome = await outcomePromise;

  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
  signal?.removeEventListener('abort', abortListener);
  const diagnostics = captureText(stderr, {markTruncated:true});

  if (terminalCause === 'aborted') return classifyAbort(root, request, diagnostics);
  if (terminalCause === 'timeout') {
    await emitWorkerTerminal(root, {
      kind:'worker-timeout',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker exceeded its parent-owned timeout.',
    });
    throw new ExternalWorkerError('worker-timeout', `external worker exceeded timeoutMs=${request.timeoutMs}`, {diagnostics});
  }
  if (terminalCause === 'stdout-overflow') {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker stdout exceeded the protocol size limit.',
    });
    throw new ExternalWorkerError('worker-failed', 'external worker stdout exceeded the protocol size limit', {diagnostics});
  }
  if (outcome.kind === 'error') {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker process failed abnormally.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker process error: ${outcome.error.message}`, {diagnostics});
  }
  if (outcome.code !== 0 || outcome.signalName != null) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker exited without a valid completion.',
    });
    throw new ExternalWorkerError(
      'worker-failed',
      `external worker exited abnormally (code=${outcome.code}, signal=${outcome.signalName ?? 'none'})`,
      {diagnostics},
    );
  }

  const wire = captureText(stdout).trim();
  if (!wire || wire.includes('\n') || wire.includes('\r')) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker stdout violated the one-object JSON protocol.',
    });
    throw new ExternalWorkerError('worker-failed', 'external worker stdout must contain exactly one JSON object line', {diagnostics});
  }

  let parsed;
  try { parsed = JSON.parse(wire); }
  catch (error) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker stdout was not valid JSON.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker stdout is invalid JSON: ${error.message}`, {diagnostics});
  }

  let intrinsic;
  try { intrinsic = normalizeResponseIntrinsic(parsed, request); }
  catch (error) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker response violated the public protocol.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker response is invalid: ${error.message}`, {diagnostics});
  }

  const artifactRefs = [];
  try {
    for (const [index, raw] of intrinsic.artifactRefs.entries()) {
      artifactRefs.push(await verifyContentReference(root, raw, `artifactRefs[${index}]`));
    }
  } catch (error) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker returned stale, unsafe, or unverifiable artifact bytes.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker artifact verification failed: ${error.message}`, {diagnostics});
  }

  const response = deepFreeze({...intrinsic, artifactRefs});
  if (signal?.aborted) return classifyAbort(root, request, diagnostics);
  const completionOperation = await getHostOperation(root, {operationId:request.operationId});
  if (completionOperation.status === 'cancelling' || completionOperation.status === 'cancelled') {
    await emitWorkerTerminal(root, {
      kind:'worker-cancelled',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker completion was superseded by host cancellation.',
    });
    throw new ExternalWorkerError('worker-cancelled', 'external worker completion was superseded by host cancellation', {diagnostics});
  }
  if (completionOperation.status === 'pausing' || completionOperation.status === 'paused') {
    throw new ExternalWorkerError('worker-paused', 'external worker completion was superseded by host pause', {diagnostics});
  }
  if (!['active','resuming'].includes(completionOperation.status)) {
    await emitWorkerTerminal(root, {
      kind:'worker-failed',
      operationId:request.operationId,
      workerRunId:request.workerRunId,
      message:'External worker completion arrived after the owning operation left its runnable state.',
    });
    throw new ExternalWorkerError('worker-failed', `external worker completion cannot bind operation status ${completionOperation.status}`, {diagnostics});
  }
  await emitWorkerTerminal(root, {
    kind:'worker-completed',
    operationId:request.operationId,
    workerRunId:request.workerRunId,
    artifactRefs,
    message:'External worker completed with parent-verified output artifacts.',
  });
  return deepFreeze({request,response,diagnostics});
}

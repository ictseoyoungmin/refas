import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ExternalWorkerError,
  contentReference,
  emitHostEvent,
  executeHostOperation,
  getHostEvents,
  getHostOperation,
  loadProject,
  openHostSession,
  pauseHostOperation,
  resumeHostOperation,
  runExternalWorker,
  cancelHostOperation,
  validateWorkerRequest,
  validateWorkerResponse,
} from '../skills/refas/scripts/lib/index.mjs';

async function makeHost(t, suffix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-worker-test-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  await openHostSession(root, {
    sessionId:`session-${suffix}`,
    projectId:`project-${suffix}`,
  });
  return root;
}

async function waitForEvent(root, kind, workerRunId = null, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await getHostEvents(root);
    const found = events.find((event) => event.kind === kind && (workerRunId == null || event.workerRunId === workerRunId));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${kind}${workerRunId ? `/${workerRunId}` : ''}`);
}

function nodeWorkerArgs(script) {
  return ['--input-type=module','-e',script];
}

function successWorkerScript({extraStdout = false, badDigest = false, delayMs = 0} = {}) {
  return `
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

let wire = '';
for await (const chunk of process.stdin) wire += chunk;
const request = JSON.parse(wire);
${delayMs ? `await new Promise((resolve) => setTimeout(resolve, ${delayMs}));` : ''}
const relative = 'worker-output/' + request.workerRunId + '.txt';
fs.mkdirSync(path.dirname(relative), {recursive:true});
const bytes = Buffer.from('worker-output:' + request.workerRunId + '\\n');
fs.writeFileSync(relative, bytes);
const sha256 = ${badDigest ? "'0'.repeat(64)" : "createHash('sha256').update(bytes).digest('hex')"};
const response = {
  schema:'refas.worker-response/v1',
  workerRunId:request.workerRunId,
  operationId:request.operationId,
  requestDigest:request.requestDigest,
  status:'completed',
  message:'worker completed',
  artifactRefs:[{
    schema:'refas.content-reference/v1',
    kind:'worker-output',
    path:relative,
    sha256,
    sizeBytes:bytes.length,
  }],
};
process.stderr.write('diagnostic-only:' + request.workerRunId + '\\n');
process.stdout.write(JSON.stringify(response) + '\\n');
${extraStdout ? "process.stdout.write('protocol-chatter\\n');" : ''}
`;
}

const hangingWorkerScript = `
let wire = '';
for await (const chunk of process.stdin) wire += chunk;
JSON.parse(wire);
setInterval(() => {}, 1000);
await new Promise(() => {});
`;

const nonzeroWorkerScript = `
let wire = '';
for await (const chunk of process.stdin) wire += chunk;
JSON.parse(wire);
process.stderr.write('nonzero diagnostic only\\n');
process.exitCode = 7;
`;

test('external worker request/response are exact-operation bound and success is parent-verified', async (t) => {
  const root = await makeHost(t, 'success');
  const inputPath = path.join(root, 'inputs', 'request.txt');
  await fs.mkdir(path.dirname(inputPath), {recursive:true});
  await fs.writeFile(inputPath, 'input bytes\n');
  const inputRef = await contentReference(inputPath, {kind:'worker-input', root});
  const before = await loadProject(root);
  let workerResult = null;

  const operation = await executeHostOperation(root, {
    operationId:'op-worker-success',
    intent:'run one bounded external worker',
    inputDigest:'a'.repeat(64),
  }, async ({signal}) => {
    workerResult = await runExternalWorker(root, {
      workerRunId:'run-worker-success',
      workerId:'fixture-worker',
      operationId:'op-worker-success',
      command:process.execPath,
      args:nodeWorkerArgs(successWorkerScript()),
      intent:'produce one exact output artifact',
      inputDigest:'b'.repeat(64),
      inputRefs:[inputRef],
      timeoutMs:2000,
    }, {signal});
  });

  assert.equal(operation.status, 'completed');
  assert.ok(workerResult);
  assert.equal(validateWorkerRequest(workerResult.request).valid, true);
  assert.equal(validateWorkerResponse(workerResult.response, {request:workerResult.request}).valid, true);
  assert.equal(workerResult.request.operationRequestDigest, (await getHostOperation(root, {operationId:'op-worker-success'})).requestDigest);
  assert.equal(workerResult.response.artifactRefs.length, 1);
  assert.match(workerResult.diagnostics, /diagnostic-only:run-worker-success/);
  assert.deepEqual(await loadProject(root), before);

  const events = await getHostEvents(root);
  const started = events.find((event) => event.kind === 'worker-started');
  const completed = events.find((event) => event.kind === 'worker-completed');
  assert.equal(started.workerRunId, 'run-worker-success');
  assert.equal(completed.workerRunId, 'run-worker-success');
  assert.deepEqual(completed.artifactRefs, workerResult.response.artifactRefs);
  assert.equal(events.some((event) => String(event.message ?? '').includes('diagnostic-only')), false);
});

test('worker stdout chatter and stale output digests fail closed as worker-failed', async (t) => {
  const root = await makeHost(t, 'protocol-failures');

  for (const [suffix, script, expected] of [
    ['chatter', successWorkerScript({extraStdout:true}), /exactly one JSON object line/],
    ['digest', successWorkerScript({badDigest:true}), /artifact verification failed/],
  ]) {
    await assert.rejects(
      () => executeHostOperation(root, {
        operationId:`op-worker-${suffix}`,
        intent:`exercise ${suffix} fail-closed path`,
      }, async ({signal}) => {
        await runExternalWorker(root, {
          workerRunId:`run-worker-${suffix}`,
          workerId:'fixture-worker',
          operationId:`op-worker-${suffix}`,
          command:process.execPath,
          args:nodeWorkerArgs(script),
          intent:`exercise ${suffix} worker protocol`,
          timeoutMs:2000,
        }, {signal});
      }),
      (error) => error instanceof ExternalWorkerError && error.code === 'worker-failed' && expected.test(error.message),
    );
    const operation = await getHostOperation(root, {operationId:`op-worker-${suffix}`});
    assert.equal(operation.status, 'failed');
    const events = await getHostEvents(root);
    assert.equal(events.some((event) => event.kind === 'worker-failed' && event.workerRunId === `run-worker-${suffix}`), true);
  }
});

test('nonzero worker exit keeps stderr diagnostic-only and emits worker-failed', async (t) => {
  const root = await makeHost(t, 'nonzero');
  let caught = null;
  try {
    await executeHostOperation(root, {
      operationId:'op-worker-nonzero',
      intent:'exercise abnormal worker exit',
    }, async ({signal}) => {
      await runExternalWorker(root, {
        workerRunId:'run-worker-nonzero',
        workerId:'fixture-worker',
        operationId:'op-worker-nonzero',
        command:process.execPath,
        args:nodeWorkerArgs(nonzeroWorkerScript),
        intent:'exit nonzero after writing diagnostics',
        timeoutMs:2000,
      }, {signal});
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ExternalWorkerError);
  assert.equal(caught.code, 'worker-failed');
  assert.match(caught.diagnostics, /nonzero diagnostic only/);
  const events = await getHostEvents(root);
  assert.equal(events.some((event) => String(event.message ?? '').includes('nonzero diagnostic only')), false);
  assert.equal(events.some((event) => event.kind === 'worker-failed' && event.workerRunId === 'run-worker-nonzero'), true);
});

test('worker timeout is distinct from worker failure and fails the owning host operation', async (t) => {
  const root = await makeHost(t, 'timeout');

  await assert.rejects(
    () => executeHostOperation(root, {
      operationId:'op-worker-timeout',
      intent:'exercise parent-owned worker timeout',
    }, async ({signal}) => {
      await runExternalWorker(root, {
        workerRunId:'run-worker-timeout',
        workerId:'fixture-worker',
        operationId:'op-worker-timeout',
        command:process.execPath,
        args:nodeWorkerArgs(hangingWorkerScript),
        intent:'hang until the parent timeout terminates the worker',
        timeoutMs:80,
        terminationGraceMs:20,
      }, {signal});
    }),
    (error) => error instanceof ExternalWorkerError && error.code === 'worker-timeout',
  );

  assert.equal((await getHostOperation(root, {operationId:'op-worker-timeout'})).status, 'failed');
  const events = await getHostEvents(root);
  assert.equal(events.filter((event) => event.kind === 'worker-timeout' && event.workerRunId === 'run-worker-timeout').length, 1);
  assert.equal(events.some((event) => event.kind === 'worker-failed' && event.workerRunId === 'run-worker-timeout'), false);
  assert.equal(events.some((event) => event.kind === 'failed' && event.operationId === 'op-worker-timeout'), true);
});

test('host cancellation terminates a worker as worker-cancelled and Slice 3 owns final cancellation', async (t) => {
  const root = await makeHost(t, 'cancel');
  const promise = executeHostOperation(root, {
    operationId:'op-worker-cancel',
    intent:'cancel an active external worker',
  }, async ({signal}) => {
    await runExternalWorker(root, {
      workerRunId:'run-worker-cancel',
      workerId:'fixture-worker',
      operationId:'op-worker-cancel',
      command:process.execPath,
      args:nodeWorkerArgs(hangingWorkerScript),
      intent:'wait until host cancellation',
      timeoutMs:5000,
      terminationGraceMs:20,
    }, {signal});
  });

  await waitForEvent(root, 'worker-started', 'run-worker-cancel');
  const requested = await cancelHostOperation(root, {operationId:'op-worker-cancel'});
  assert.equal(requested.status, 'cancelling');
  const operation = await promise;
  assert.equal(operation.status, 'cancelled');

  const events = await getHostEvents(root);
  assert.equal(events.filter((event) => event.kind === 'worker-cancelled' && event.workerRunId === 'run-worker-cancel').length, 1);
  assert.equal(events.some((event) => event.kind === 'worker-failed' && event.workerRunId === 'run-worker-cancel'), false);
  assert.equal(events.some((event) => event.kind === 'worker-timeout' && event.workerRunId === 'run-worker-cancel'), false);
  assert.equal(events.some((event) => event.kind === 'session-cancelled' && event.operationId === 'op-worker-cancel'), true);
});

test('host pause interrupts a worker without mislabeling cancellation and resume uses a new worker run', async (t) => {
  const root = await makeHost(t, 'pause');
  const promise = executeHostOperation(root, {
    operationId:'op-worker-pause',
    intent:'pause an active external worker',
  }, async ({signal}) => {
    await runExternalWorker(root, {
      workerRunId:'run-worker-pause-first',
      workerId:'fixture-worker',
      operationId:'op-worker-pause',
      command:process.execPath,
      args:nodeWorkerArgs(hangingWorkerScript),
      intent:'wait until host pause',
      timeoutMs:5000,
      terminationGraceMs:20,
    }, {signal});
  });

  await waitForEvent(root, 'worker-started', 'run-worker-pause-first');
  const requested = await pauseHostOperation(root, {operationId:'op-worker-pause'});
  assert.equal(requested.status, 'pausing');
  const paused = await promise;
  assert.equal(paused.status, 'paused');

  let events = await getHostEvents(root);
  assert.equal(events.some((event) => event.workerRunId === 'run-worker-pause-first' && ['worker-cancelled','worker-timeout','worker-failed'].includes(event.kind)), false);
  assert.equal(events.some((event) => event.kind === 'session-paused' && event.operationId === 'op-worker-pause'), true);

  const resumed = await resumeHostOperation(root, {operationId:'op-worker-pause'}, async ({signal}) => {
    await runExternalWorker(root, {
      workerRunId:'run-worker-pause-resumed',
      workerId:'fixture-worker',
      operationId:'op-worker-pause',
      command:process.execPath,
      args:nodeWorkerArgs(successWorkerScript()),
      intent:'complete after host resume',
      timeoutMs:2000,
    }, {signal});
  });
  assert.equal(resumed.status, 'completed');

  events = await getHostEvents(root);
  assert.equal(events.some((event) => event.kind === 'worker-completed' && event.workerRunId === 'run-worker-pause-resumed'), true);
  assert.equal(events.some((event) => event.kind === 'session-resumed' && event.operationId === 'op-worker-pause'), true);
});

test('worker event binding and intrinsic response fields are fail-closed', async (t) => {
  const root = await makeHost(t, 'binding');

  await assert.rejects(
    () => emitHostEvent(root, {kind:'worker-failed',operationId:'op-binding',message:'missing worker id'}),
    /requires workerRunId/,
  );
  await assert.rejects(
    () => emitHostEvent(root, {kind:'warning',workerRunId:'run-binding',message:'worker id on non-worker event'}),
    /cannot carry workerRunId/,
  );

  const response = {
    schema:'refas.worker-response/v1',
    workerRunId:'run-binding',
    operationId:'op-binding',
    requestDigest:'a'.repeat(64),
    status:'failed',
    message:null,
    artifactRefs:[],
  };
  const validation = validateWorkerResponse(response);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /status must be completed/);

  const hidden = {...response, status:'completed', reasoning:'hidden'};
  const hiddenValidation = validateWorkerResponse(hidden);
  assert.equal(hiddenValidation.valid, false);
  assert.match(hiddenValidation.errors.join('\n'), /unsupported or missing fields/);
});

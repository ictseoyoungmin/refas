import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  beginEdit,
  commitCheckpoint,
  contentReference,
  digestBytes,
  digestJson,
  executeHostOperation,
  getHostEvents,
  getHostOperation,
  initProject,
  loadHostSession,
  loadProject,
  openHostSession,
  pauseHostOperation,
  resumeHostOperation,
  cancelHostOperation,
} from '../skills/refas/scripts/lib/index.mjs';

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-operation-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  return root;
}

async function sourceProject(root) {
  await fs.mkdir(path.join(root, 'source'), {recursive:true});
  const bytes = Buffer.from('host operation source\n');
  await fs.writeFile(path.join(root, 'source', 'reference.bin'), bytes);
  await initProject(root, {projectId:'host-project', source:{
    schema:'refas.source-manifest/v1',id:'primary-reference',path:'source/reference.bin',sha256:digestBytes(bytes),sizeBytes:bytes.length,
    width:32,height:32,authority:'primary',acquisition:{kind:'test-fixture'},
  }});
}

async function checkpointArtifact(root, bytes, kind = 'model-spec') {
  await fs.mkdir(path.join(root, 'model'), {recursive:true});
  const file = path.join(root, 'model', 'state.bin');
  await fs.writeFile(file, Buffer.from(bytes));
  return {file, reference:await contentReference(file, {kind,root})};
}

function abortWait(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(signal.reason), {once:true});
  });
}

test('completed host operation is idempotent and conflicting reuse fails closed', async (t) => {
  const root = await tempRoot(t);
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  let executions = 0;
  const request = {operationId:'operation-one',mode:'mutating',intent:'Perform one bounded host mutation.'};
  const first = await executeHostOperation(root, request, async ({signal}) => {
    executions += 1;
    assert.equal(signal.aborted, false);
  });
  assert.equal(first.status, 'completed');
  assert.equal(executions, 1);
  const replay = await executeHostOperation(root, request, async () => { executions += 100; });
  assert.equal(replay.status, 'completed');
  assert.equal(executions, 1);
  await assert.rejects(
    executeHostOperation(root, {...request,intent:'Different mutation.'}, async () => {}),
    /already used for a different request/,
  );
});

test('only one nonterminal mutating host operation owns a project', async (t) => {
  const root = await tempRoot(t);
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  let release;
  const running = executeHostOperation(root, {operationId:'operation-one',intent:'Hold project ownership.'}, async () => new Promise((resolve) => { release = resolve; }));
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await assert.rejects(
    executeHostOperation(root, {operationId:'operation-two',intent:'Competing project mutation.'}, async () => {}),
    /mutating host operation already active/,
  );
  release();
  await running;
});

test('pause preserves exact reconstruction state and resume keeps the same operation identity', async (t) => {
  const root = await tempRoot(t);
  await sourceProject(root);
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  const before = await loadProject(root);
  let started = false;
  const running = executeHostOperation(root, {operationId:'operation-pause',intent:'Pause at the next safe boundary.'}, async ({signal}) => {
    started = true;
    await abortWait(signal);
  });
  while (!started) await new Promise((resolve) => setTimeout(resolve, 1));
  const requested = await pauseHostOperation(root, {operationId:'operation-pause'});
  assert.equal(requested.status, 'pausing');
  const paused = await running;
  assert.equal(paused.operationId, 'operation-pause');
  assert.equal(paused.status, 'paused');
  assert.deepEqual(await loadProject(root), before);
  assert.equal((await loadHostSession(root)).status, 'paused');

  const resumed = await resumeHostOperation(root, {operationId:'operation-pause'}, async ({operationId,safeBoundary}) => {
    assert.equal(operationId, 'operation-pause');
    await safeBoundary();
  });
  assert.equal(resumed.operationId, 'operation-pause');
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.resumeCount, 1);
  const kinds = (await getHostEvents(root)).filter((event) => event.operationId === 'operation-pause').map((event) => event.kind);
  assert.deepEqual(kinds, ['work-started','session-paused','session-resumed','completed']);
});

test('pause does not abandon an existing bounded edit', async (t) => {
  const root = await tempRoot(t);
  await sourceProject(root);
  const baselineArtifact = await checkpointArtifact(root, 'pause baseline bytes\n');
  const baseline = await commitCheckpoint(root, {capability:'source-intake',scopeId:'whole',reason:'Pause fixture baseline.',artifactRefs:[baselineArtifact.reference],claims:[],gates:[]});
  const edit = await beginEdit(root, {ownerCapability:'source-intake',scopeId:'whole',intent:'Keep this bounded edit active across pause.'});
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  let started = false;
  const running = executeHostOperation(root, {operationId:'operation-pause-edit',intent:'Pause without rolling back RefAs edit state.'}, async ({signal}) => {
    started = true;
    await abortWait(signal);
  });
  while (!started) await new Promise((resolve) => setTimeout(resolve, 1));
  await pauseHostOperation(root, {operationId:'operation-pause-edit'});
  assert.equal((await running).status, 'paused');
  const project = await loadProject(root);
  assert.equal(project.head, baseline.id);
  assert.equal(project.activeTransaction.id, edit.id);
});

test('cancel abandons an active bounded edit through RefAs abort authority', async (t) => {
  const root = await tempRoot(t);
  await sourceProject(root);
  const baselineArtifact = await checkpointArtifact(root, 'baseline model bytes\n');
  const baseline = await commitCheckpoint(root, {capability:'source-intake',scopeId:'whole',reason:'Host cancellation baseline.',artifactRefs:[baselineArtifact.reference],claims:[],gates:[]});
  await beginEdit(root, {ownerCapability:'source-intake',scopeId:'whole',intent:'Create a cancellable candidate.'});
  const candidateArtifact = await checkpointArtifact(root, 'candidate model bytes\n');
  await commitCheckpoint(root, {capability:'source-intake',scopeId:'whole',reason:'Candidate that must be abandoned on cancel.',artifactRefs:[candidateArtifact.reference],claims:[],gates:[]});
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});

  let started = false;
  const running = executeHostOperation(root, {operationId:'operation-cancel',intent:'Cancel this in-flight bounded edit.'}, async ({signal}) => {
    started = true;
    await abortWait(signal);
  });
  while (!started) await new Promise((resolve) => setTimeout(resolve, 1));
  const request = await cancelHostOperation(root, {operationId:'operation-cancel'});
  assert.equal(request.status, 'cancelling');
  const cancelled = await running;
  assert.equal(cancelled.status, 'cancelled');
  const project = await loadProject(root);
  assert.equal(project.head, baseline.id);
  assert.equal(project.activeTransaction, null);
  assert.equal(await fs.readFile(baselineArtifact.file, 'utf8'), 'baseline model bytes\n');
  assert.equal((await loadHostSession(root)).status, 'cancelled');
});

test('late executor success after cancellation cannot become authoritative completion', async (t) => {
  const root = await tempRoot(t);
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  let release;
  const running = executeHostOperation(root, {operationId:'operation-late',intent:'Ignore a late executor success.'}, async ({signal}) => {
    assert.ok(signal instanceof AbortSignal);
    await new Promise((resolve) => { release = resolve; });
  });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  await cancelHostOperation(root, {operationId:'operation-late'});
  release();
  const result = await running;
  assert.equal(result.status, 'cancelled');
  assert.equal((await getHostOperation(root, {operationId:'operation-late'})).status, 'cancelled');
  const operationEvents = (await getHostEvents(root)).filter((event) => event.operationId === 'operation-late');
  assert.equal(operationEvents.some((event) => event.kind === 'completed'), false);
  assert.equal(operationEvents.at(-1).kind, 'session-cancelled');
});

test('opening after process loss recovers a ghost active operation as paused', async (t) => {
  const root = await tempRoot(t);
  await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  const statePath = path.join(root, '.refas', 'host', 'session.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const time = new Date().toISOString();
  const intent = 'Recover this operation after simulated process loss.';
  state.operations.push({
    schema:'refas.host-operation/v1',operationId:'operation-restart',sessionId:state.sessionId,projectId:state.projectId,
    requestDigest:digestJson({mode:'mutating',intent,inputDigest:null}),mode:'mutating',intent,inputDigest:null,status:'active',
    startedAt:time,updatedAt:time,pauseRequestedAt:null,cancelRequestedAt:null,resumeCount:0,terminal:null,
  });
  state.currentOperationId = 'operation-restart';
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const reopened = await openHostSession(root, {sessionId:'studio-session',projectId:'host-project'});
  assert.equal(reopened.status, 'paused');
  assert.equal((await getHostOperation(root, {operationId:'operation-restart'})).status, 'paused');
  const last = (await getHostEvents(root)).at(-1);
  assert.equal(last.kind, 'session-paused');
  assert.equal(last.operationId, 'operation-restart');
});

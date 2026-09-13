import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  contentReference,
  emitHostEvent,
  getHostEvents,
  getHostSession,
  openHostSession,
  subscribeHostEvents,
} from '../skills/refas/scripts/lib/index.mjs';

async function project(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-events-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const session = await openHostSession(root, {sessionId:'host-events-session', projectId:'host-events-project'});
  return {root, session};
}

async function readPrivateState(root) {
  return JSON.parse(await fs.readFile(path.join(root,'.refas','host','session.json'),'utf8'));
}

async function writePrivateState(root, value) {
  await fs.writeFile(path.join(root,'.refas','host','session.json'), `${JSON.stringify(value,null,2)}\n`, 'utf8');
}

test('new host session records one durable session-opened event', async (t) => {
  const {root, session} = await project(t);
  assert.equal(session.sequence, 1);
  const events = await getHostEvents(root);
  assert.equal(events.length, 1);
  assert.equal(events[0].schema, 'refas.host-event/v1');
  assert.equal(events[0].kind, 'session-opened');
  assert.equal(events[0].sequence, 1);
  assert.equal(events[0].sessionId, session.sessionId);
  const reopened = await openHostSession(root, {sessionId:session.sessionId, projectId:session.projectId});
  assert.equal(reopened.sequence, 1);
  assert.equal((await getHostEvents(root)).length, 1);
});

test('events are exact-artifact aware, monotonic, and replayable without mutation', async (t) => {
  const {root} = await project(t);
  await fs.mkdir(path.join(root,'evidence'), {recursive:true});
  const artifactPath = path.join(root,'evidence','render.png');
  await fs.writeFile(artifactPath, Buffer.from('render bytes\n'));
  const artifact = await contentReference(artifactPath, {kind:'render-frame', root});
  const second = await emitHostEvent(root, {kind:'render-ready',operationId:'op-017',scopeId:'left-hand',capability:'rendering',message:'Updated multiview render is available.',artifactRefs:[artifact]});
  const third = await emitHostEvent(root, {kind:'warning',operationId:'op-017',scopeId:'left-hand',message:'Public recoverable warning.'});
  assert.equal(second.sequence, 2);
  assert.equal(third.sequence, 3);
  const replayA = await getHostEvents(root, {afterSequence:1});
  const replayB = await getHostEvents(root, {afterSequence:1});
  assert.deepEqual(replayA, replayB);
  assert.deepEqual(replayA.map((event)=>event.sequence), [2,3]);
  assert.equal((await getHostSession(root)).sequence, 3);
});

test('event protocol rejects product vocabulary and hidden-reasoning field injection', async (t) => {
  const {root} = await project(t);
  await assert.rejects(emitHostEvent(root, {kind:'quiet-review'}), /unknown host event kind/);
  await assert.rejects(emitHostEvent(root, {kind:'warning', reasoning:'private scratchpad'}), /unsupported host event field: reasoning/);
  assert.equal((await getHostSession(root)).sequence, 1);
});

test('event artifact reference byte drift fails closed', async (t) => {
  const {root} = await project(t);
  const target = path.join(root,'artifact.bin');
  await fs.writeFile(target, Buffer.from('original bytes\n'));
  const reference = await contentReference(target, {kind:'evidence', root});
  await fs.writeFile(target, Buffer.from('drifted bytes\n'));
  await assert.rejects(emitHostEvent(root, {kind:'evidence-ready',artifactRefs:[reference]}), /size does not match|digest does not match/);
  assert.equal((await getHostSession(root)).sequence, 1);
});

test('event replay detects persisted sequence gaps', async (t) => {
  const {root} = await project(t);
  await emitHostEvent(root, {kind:'warning'});
  await emitHostEvent(root, {kind:'completed'});
  const state = await readPrivateState(root);
  state.events = state.events.filter((event)=>event.sequence !== 2);
  await writePrivateState(root, state);
  await assert.rejects(getHostEvents(root), /sequence gap|does not match persisted event history/);
});

test('subscription replays then delivers live events without sequence duplicates', async (t) => {
  const {root} = await project(t);
  const received = [];
  const subscription = await subscribeHostEvents(root, {afterSequence:1,onEvent:(event)=>received.push(event.sequence)});
  await emitHostEvent(root, {kind:'warning'});
  assert.deepEqual(received, [2]);
  assert.equal(subscription.lastSequence, 2);
  subscription.unsubscribe();
  await emitHostEvent(root, {kind:'completed'});
  assert.deepEqual(received, [2]);
  const replayed = [];
  const second = await subscribeHostEvents(root, {afterSequence:1,onEvent:(event)=>replayed.push(event.sequence)});
  assert.deepEqual(replayed, [2,3]);
  second.unsubscribe();
});

test('Slice 1 persistence without events migrates read-only and remains usable', async (t) => {
  const {root} = await project(t);
  const state = await readPrivateState(root);
  delete state.events;
  state.sequence = 0;
  await writePrivateState(root, state);
  const session = await getHostSession(root);
  assert.equal(session.sequence, 0);
  const first = await emitHostEvent(root, {kind:'warning'});
  assert.equal(first.sequence, 1);
  assert.equal((await getHostEvents(root)).length, 1);
});

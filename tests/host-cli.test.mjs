import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {digestJson} from '../skills/refas/scripts/lib/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'skills', 'refas', 'scripts', 'refas-host.mjs');

function run(args, {expect = 0} = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {cwd:ROOT, encoding:'utf8'});
  assert.equal(result.status, expect, result.stderr || result.stdout);
  return result;
}

test('refas-host exposes v1.1.0 host commands and durable JSONL replay', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-cli-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));

  const help = JSON.parse(run(['help']).stdout);
  assert.equal(help.name, 'refas-host');
  assert.equal(help.version, '1.1.0');
  for (const command of ['open','status','events','review-bundle','handoff','validate-worker']) {
    assert.equal(typeof help.commands[command], 'string');
  }

  const opened = JSON.parse(run([
    'open','--root',root,'--session','session-cli','--project','project-cli',
  ]).stdout);
  assert.equal(opened.schema, 'refas.host-session/v1');
  assert.equal(opened.sequence, 1);

  const status = JSON.parse(run(['status','--root',root]).stdout);
  assert.equal(status.sessionId, 'session-cli');
  assert.equal(status.projectId, 'project-cli');

  const replay = run(['events','--root',root,'--after','0','--jsonl']).stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(replay.length, 1);
  assert.equal(replay[0].kind, 'session-opened');
  assert.equal(replay[0].sequence, 1);
  assert.equal(run(['events','--root',root,'--after','1','--jsonl']).stdout, '');
});

test('refas-host validates exact worker request/response binding without running a worker', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-cli-worker-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));

  const core = {
    schema:'refas.worker-request/v1',
    workerRunId:'run-cli-worker',
    workerId:'fixture-worker',
    sessionId:'session-cli-worker',
    projectId:'project-cli-worker',
    operationId:'op-cli-worker',
    operationRequestDigest:'a'.repeat(64),
    intent:'validate the public worker wire contract',
    inputDigest:null,
    inputs:[],
    timeoutMs:1000,
  };
  const request = {...core, requestDigest:digestJson(core)};
  const response = {
    schema:'refas.worker-response/v1',
    workerRunId:request.workerRunId,
    operationId:request.operationId,
    requestDigest:request.requestDigest,
    status:'completed',
    message:null,
    artifactRefs:[],
  };
  const requestPath = path.join(root, 'request.json');
  const responsePath = path.join(root, 'response.json');
  await fs.writeFile(requestPath, JSON.stringify(request));
  await fs.writeFile(responsePath, JSON.stringify(response));

  const result = JSON.parse(run([
    'validate-worker','--request',requestPath,'--response',responsePath,
  ]).stdout);
  assert.equal(result.valid, true);
  assert.equal(result.request.valid, true);
  assert.equal(result.response.valid, true);
});

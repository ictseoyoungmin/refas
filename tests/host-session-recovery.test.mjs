import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  getHostEvents,
  initProject,
  openHostSession,
} from '../skills/refas/scripts/lib/index.mjs';

test('reopening a zero-sequence host state repairs exactly one session-opened event', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-recovery-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));

  await initProject(root, {projectId:'host-recovery-project'});
  const hostDir = path.join(root, '.refas', 'host');
  await fs.mkdir(hostDir, {recursive:true});
  await fs.writeFile(path.join(hostDir, 'session.json'), `${JSON.stringify({
    schema:'refas.host-session-state/v1',
    sessionId:'host-recovery-session',
    projectId:'host-recovery-project',
    sequence:0,
    events:[],
    operations:[],
    currentOperationId:null,
  }, null, 2)}\n`, 'utf8');

  const first = await openHostSession(root, {
    sessionId:'host-recovery-session',
    projectId:'host-recovery-project',
  });
  assert.equal(first.sequence, 1);
  let events = await getHostEvents(root);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'session-opened');
  assert.equal(events[0].sequence, 1);

  const second = await openHostSession(root, {
    sessionId:'host-recovery-session',
    projectId:'host-recovery-project',
  });
  assert.equal(second.sequence, 1);
  events = await getHostEvents(root);
  assert.equal(events.filter((event) => event.kind === 'session-opened').length, 1);
});

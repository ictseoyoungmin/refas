import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runFreshWorkerDogfood} from '../skills/refas/scripts/verify_fresh_worker_dogfood.mjs';

test('AD05 fresh worker executes the canonical chain without raw implementation discovery', {timeout: 120000}, async () => {
  const report = await runFreshWorkerDogfood();
  assert.equal(report.status, 'PASS');
  assert.equal(report.installedSkillOnly, true);
  assert.equal(report.capabilitiesDiscovered, 11);
  assert.equal(report.checkpointsCommitted, 11);
  assert.equal(report.rawImplementationReads, 0);
  assert.equal(report.implementationSearchCommands, 0);
  assert.equal(report.forbiddenRawReadProbe, 'BLOCKED');
  assert.equal(report.verifierOwnedAccessBoundary, true);
  assert.equal(report.normalBoundaryViolations, 0);
  assert.equal(report.bypassProbesBlocked, 3);
  assert.match(report.certificateDigest, /^[a-f0-9]{64}$/);
});

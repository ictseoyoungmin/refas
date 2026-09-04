import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createFitStructuralEligibility,
  digestBytes,
  digestJson,
  validateFitStructuralEligibility,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const candidate = Buffer.from('candidate-glb-fixture');

function forgedWithoutRealizedContact() {
  const payload = {
    schema: 'refas.fit-structural-eligibility/v1',
    candidateAssetSha256: digestBytes(candidate),
    requiredStages: ['attachment-propagation'],
    status: 'ELIGIBLE',
    eligible: true,
    blockers: [],
    stageChecks: [
      {stage: 'attachment-propagation', present: true, valid: true, pass: true, digest: D('b'), status: 'READY_FOR_REALIZATION', reasons: []},
      {stage: 'physical-fusion', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
      {stage: 'realized-contact', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
    ],
    evidenceRefs: ['reviews/structure.json'],
    policy: {
      structuralInvalidityIsHardBarrier: true,
      structuralInvalidityIsNeverScorePenalty: true,
      visualMetricsCannotOverrideStructuralEligibility: true,
      exactCandidateBytesAreBound: true,
      artifactDoesNotAuthorizeClosure: true,
    },
  };
  return {...payload, eligibilityDigest: digestJson(payload)};
}

test('structural eligibility cannot use semantic propagation as a substitute for realized candidate proof', () => {
  assert.throws(() => createFitStructuralEligibility({
    candidateGlb: candidate,
    requiredStages: ['attachment-propagation'],
  }), /requires realized-contact/);

  const forged = forgedWithoutRealizedContact();
  const validation = validateFitStructuralEligibility(forged, candidate);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('; '), /must require realized-contact/);
});

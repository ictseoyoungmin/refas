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

function policy() {
  return {
    structuralInvalidityIsHardBarrier: true,
    structuralInvalidityIsNeverScorePenalty: true,
    visualMetricsCannotOverrideStructuralEligibility: true,
    exactCandidateBytesAreBound: true,
    structuralStagesMustBindThroughRealizedContact: true,
    artifactDoesNotAuthorizeClosure: true,
  };
}

function forgedWithoutRealizedContact() {
  const payload = {
    schema: 'refas.fit-structural-eligibility/v1',
    candidateAssetSha256: digestBytes(candidate),
    requiredStages: ['attachment-propagation'],
    realizationBindings: {propagationReportDigest: D('b'), fusionReportDigests: []},
    status: 'ELIGIBLE',
    eligible: true,
    blockers: [],
    stageChecks: [
      {stage: 'attachment-propagation', present: true, valid: true, pass: true, digest: D('b'), status: 'READY_FOR_REALIZATION', reasons: []},
      {stage: 'physical-fusion', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
      {stage: 'realized-contact', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
    ],
    evidenceRefs: ['reviews/structure.json'],
    policy: policy(),
  };
  return {...payload, eligibilityDigest: digestJson(payload)};
}

function forgedCrossBindingMismatch() {
  const payload = {
    schema: 'refas.fit-structural-eligibility/v1',
    candidateAssetSha256: digestBytes(candidate),
    requiredStages: ['attachment-propagation', 'realized-contact'],
    realizationBindings: {propagationReportDigest: D('c'), fusionReportDigests: []},
    status: 'ELIGIBLE',
    eligible: true,
    blockers: [],
    stageChecks: [
      {stage: 'attachment-propagation', present: true, valid: true, pass: true, digest: D('b'), status: 'READY_FOR_REALIZATION', reasons: []},
      {stage: 'physical-fusion', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
      {stage: 'realized-contact', present: true, valid: true, pass: true, digest: D('d'), status: 'PASS', reasons: []},
    ],
    evidenceRefs: ['reviews/structure.json'],
    policy: policy(),
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

test('missing realized evidence remains a valid ineligible candidate artifact', () => {
  const eligibility = createFitStructuralEligibility({candidateGlb: candidate, requiredStages: ['realized-contact']});
  assert.equal(eligibility.status, 'INELIGIBLE');
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.blockers.includes('REALIZED_CONTACT_MISSING'));
  assert.deepEqual(validateFitStructuralEligibility(eligibility, candidate), {valid: true, errors: []});
});

test('structural stage digests must be cross-bound through the realized-contact proof', () => {
  const validation = validateFitStructuralEligibility(forgedCrossBindingMismatch(), candidate);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('; '), /attachment propagation stage is not cross-bound through realized contact/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
  createCertificationPolicy,
  evaluateCertificationPolicy,
  validateClaimCertificationDecision,
} from '../skills/refas/scripts/lib/index.mjs';

test('public generic certification detects P16 nodes even when a policy hides them behind a generic selector', () => {
  const policy = createCertificationPolicy({
    id: 'generic-selector-physical-probe',
    claims: [{
      id: 'generic-probe',
      required: true,
      obligations: [{id:'generic-evidence',role:'generic-evidence',minCount:1}],
      findingSources: [],
    }],
  });
  const transaction = {
    evidenceNodes: [{
      id: 'hidden-physical-node',
      role: 'generic-evidence',
      schema: PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
    }],
  };

  assert.throws(
    () => evaluateCertificationPolicy({transaction, policy, evidenceBytesById:{}}),
    /physical claim evidence is live-gated/,
  );
  const decisionValidation = validateClaimCertificationDecision({}, {transaction, policy, evidenceBytesById:{}});
  assert.equal(decisionValidation.valid, false);
  assert.match(decisionValidation.errors.join('; '), /physical claim certification decisions are live-gated/);
});

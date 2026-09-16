import assert from 'node:assert/strict';
import test from 'node:test';

import {
  digestJson,
  validateCrossRepresentationValidation,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function findingId(backend, obligationId) {
  return `cross-representation:${digestJson({backend, obligationId}).slice(0, 48)}`;
}

function baseValidation() {
  const backend = 'fixture-cross';
  const obligationId = 'obligation-a';
  const payload = {
    schema: 'refas.cross-representation-validation/v1',
    validationId: 'validation-hardening',
    scopeId: 'whole',
    canonicalBinding: {
      canonicalViewDigest: D('1'),
      bundleDigest: D('2'),
      rootClosureDigest: D('3'),
      rootModuleId: 'module-root',
      identityProjectionDigest: D('4'),
    },
    capacityBinding: {
      profileId: 'profile-hardening',
      backend,
      capacityDigest: D('5'),
    },
    representationBinding: {
      normalizationId: 'normalization-hardening',
      normalizationDigest: D('6'),
      semanticDigest: D('7'),
      exportId: 'export-hardening',
      exportDigest: D('8'),
      normalizerImplementationDigest: D('9'),
    },
    findings: [{
      findingId: findingId(backend, obligationId),
      obligationId,
      semanticPath: 'dynamics.mass',
      subjectIds: ['link-a'],
      ownerCapability: 'assembly',
      outcome: 'EQUIVALENT',
      exportDisposition: 'EMITTED_EXACT',
      reasonCode: 'EXACT_SEMANTIC_MATCH',
      summary: 'Normalized backend semantics reproduce the current canonical semantic value.',
      canonicalValue: 2.5,
      normalizedValue: 2.5,
      loss: null,
    }],
    summary: {total: 1, equivalent: 1, lossy: 0, drift: 0, unresolved: 0, invalid: 0},
    policy: {
      canonicalStateRemainsAuthoritative: true,
      normalizedRepresentationIsEvidenceOnly: true,
      p11ObligationIdentityIsComparisonIdentity: true,
      p13ReplayRequiredBeforeComparison: true,
      oneTypedOutcomePerObligation: true,
      declaredRepresentationLossStaysExplicit: true,
      aggregateScoresCannotOverrideFindings: true,
      declaredDivergenceRequiresDownstreamContract: true,
      validationDoesNotAuthorizePhysicalClaims: true,
    },
  };
  return {...payload, validationDigest: digestJson(payload)};
}

function resign(value) {
  const next = structuredClone(value);
  const payload = structuredClone(next);
  delete payload.validationDigest;
  next.validationDigest = digestJson(payload);
  return next;
}

test('P14 intrinsic validation rejects a re-signed non-P12 export disposition', () => {
  const original = baseValidation();
  assert.deepEqual(validateCrossRepresentationValidation(original), {valid: true, errors: []});
  const tampered = structuredClone(original);
  tampered.findings[0].exportDisposition = 'FAKE_DISPOSITION';
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /exportDisposition is not a P12 disposition/);
});

test('P14 intrinsic validation recomputes deterministic finding identity after re-signing', () => {
  const original = baseValidation();
  const tampered = structuredClone(original);
  tampered.findings[0].findingId = 'cross-representation:forged';
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /findingId must be canonical/);
});

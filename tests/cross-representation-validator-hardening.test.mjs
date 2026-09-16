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

function summaryFor(findings) {
  const summary = {total: findings.length, equivalent: 0, lossy: 0, drift: 0, unresolved: 0, invalid: 0};
  for (const finding of findings) summary[finding.outcome.toLowerCase()] += 1;
  return summary;
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
  next.summary = summaryFor(next.findings);
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

test('P14 intrinsic validation rejects unresolved mass hiding a replayable string as UNRESOLVED', () => {
  const tampered = structuredClone(baseValidation());
  Object.assign(tampered.findings[0], {
    canonicalValue: null,
    normalizedValue: 'not-a-mass',
    outcome: 'UNRESOLVED',
    reasonCode: 'CANONICAL_VALUE_UNRESOLVED',
  });
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /outcome must be INVALID/);
});

test('P14 intrinsic validation rejects wrong-length COM arrays as non-INVALID outcomes', () => {
  const tampered = structuredClone(baseValidation());
  Object.assign(tampered.findings[0], {
    semanticPath: 'dynamics.center-of-mass',
    canonicalValue: [0, 0, 0],
    normalizedValue: [0, 0],
    outcome: 'DRIFT',
    reasonCode: 'REPRESENTABLE_VALUE_MISMATCH',
  });
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /outcome must be INVALID/);
});

test('P14 intrinsic validation rejects malformed inertia matrices as non-INVALID outcomes', () => {
  const tampered = structuredClone(baseValidation());
  Object.assign(tampered.findings[0], {
    semanticPath: 'dynamics.inertia',
    canonicalValue: [[1,0,0],[0,1,0],[0,0,1]],
    normalizedValue: [[1,0],[0,1]],
    outcome: 'DRIFT',
    reasonCode: 'REPRESENTABLE_VALUE_MISMATCH',
  });
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /outcome must be INVALID/);
});

test('P14 semantic sets remain variable length and differing valid sets are DRIFT', () => {
  const candidate = structuredClone(baseValidation());
  Object.assign(candidate.findings[0], {
    semanticPath: 'compatibility.family',
    canonicalValue: ['family-a'],
    normalizedValue: ['family-a', 'family-b'],
    outcome: 'DRIFT',
    reasonCode: 'REPRESENTABLE_VALUE_MISMATCH',
  });
  assert.deepEqual(validateCrossRepresentationValidation(resign(candidate)), {valid: true, errors: []});
});

test('P14 intrinsic validation rejects EQUIVALENT + OMITTED_UNSUPPORTED even after re-signing', () => {
  const tampered = structuredClone(baseValidation());
  Object.assign(tampered.findings[0], {
    exportDisposition: 'OMITTED_UNSUPPORTED',
    normalizedValue: null,
    outcome: 'EQUIVALENT',
    reasonCode: 'EXACT_SEMANTIC_MATCH',
    loss: null,
  });
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /outcome must be LOSSY/);
});

test('P14 intrinsic validation rejects DRIFT + EMITTED_APPROXIMATION even after re-signing', () => {
  const tampered = structuredClone(baseValidation());
  Object.assign(tampered.findings[0], {
    exportDisposition: 'EMITTED_APPROXIMATION',
    normalizedValue: 3.5,
    outcome: 'DRIFT',
    reasonCode: 'REPRESENTABLE_VALUE_MISMATCH',
    loss: {
      kind: 'APPROXIMATION',
      reason: 'fixture approximation',
      strategy: 'REDUCED',
      retainedSemantics: ['mass scale'],
      lossSemantics: ['exact mass'],
    },
  });
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /outcome must be LOSSY/);
});

test('P14 intrinsic validation rejects a reasonCode inconsistent with deterministic outcome semantics', () => {
  const tampered = structuredClone(baseValidation());
  tampered.findings[0].reasonCode = 'REPRESENTABLE_VALUE_MISMATCH';
  const result = validateCrossRepresentationValidation(resign(tampered));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /reasonCode must be EXACT_SEMANTIC_MATCH/);
});

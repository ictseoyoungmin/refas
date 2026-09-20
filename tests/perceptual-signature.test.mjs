import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMetricUseAllowed,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  metricAuthority,
  validatePerceptualSignatureEvidence,
  validatePerceptualSignatureSet,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (ch) => ch.repeat(64);
const SOURCE = D('a');
const ASSET = D('b');

function signatureSet() {
  return createPerceptualSignatureSet({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    signatures: [
      {
        id: 'angular-language',
        scopeId: 'whole',
        family: 'plane-edge-language',
        importance: 'identity',
        sourceObservation: 'The source identity is carried by explicit angular plane breaks rather than one smooth continuous shell.',
        evidenceRefs: ['source/reference.png'],
      },
      {
        id: 'major-mass',
        scopeId: 'whole',
        family: 'mass-proportion',
        importance: 'macro',
        sourceObservation: 'The main body mass is compact and broad relative to the attached secondary masses.',
        evidenceRefs: ['source/reference.png'],
      },
    ],
    evidenceRefs: ['source/reference.png'],
  });
}

function signatureEvidence(set = signatureSet()) {
  return createPerceptualSignatureEvidence({
    signatureSet: set,
    assetSha256: ASSET,
    observations: [
      {
        signatureId: 'angular-language',
        status: 'mismatch',
        candidateObservation: 'The candidate reads as one smooth rounded mass with the source plane breaks erased.',
        comparisonConclusion: 'The candidate loses the source-specific angular plane/edge language.',
        evidenceRefs: ['source/reference.png', 'renders/hero.png', 'renders/grazing.png'],
      },
      {
        signatureId: 'major-mass',
        status: 'insufficient',
        candidateObservation: 'The current framing does not yet expose enough orthogonal mass evidence.',
        comparisonConclusion: 'Mass-proportion resemblance remains unresolved.',
        evidenceRefs: ['source/reference.png', 'renders/hero.png'],
      },
    ],
    evidenceRefs: ['source/reference.png', 'renders/hero.png', 'renders/grazing.png'],
  });
}

test('R03 source perceptual signatures are canonical, source-bound, and domain-neutral', () => {
  const set = signatureSet();
  assert.equal(validatePerceptualSignatureSet(set).valid, true);
  assert.equal(set.signatures.length, 2);
  assert.ok(set.signatures.every((item) => item.sourceSha256 === SOURCE));
  assert.equal(set.policy.correspondenceDoesNotImplyResemblance, true);

  assert.throws(() => createPerceptualSignatureSet({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    signatures: [
      {id: 'dup', family: 'silhouette-character', importance: 'macro', sourceObservation: 'A', evidenceRefs: ['source.png']},
      {id: 'dup', family: 'mass-proportion', importance: 'identity', sourceObservation: 'B', evidenceRefs: ['source.png']},
    ],
    evidenceRefs: ['source.png'],
  }), /IDs must be unique/);

  assert.throws(() => createPerceptualSignatureSet({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    signatures: [{id: 'bad', family: 'mechanical-bird-style', importance: 'identity', sourceObservation: 'Asset-specific category.', evidenceRefs: ['source.png']}],
    evidenceRefs: ['source.png'],
  }), /family is unsupported/);

  assert.throws(() => createPerceptualSignatureSet({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    signatures: [{id: 'empty', family: 'curvature-character', importance: 'identity', sourceObservation: '', evidenceRefs: ['source.png']}],
    evidenceRefs: ['source.png'],
  }), /sourceObservation is required/);
});

test('R03 candidate evidence covers every signature exactly once and emits typed mismatches', () => {
  const set = signatureSet();
  const evidence = signatureEvidence(set);
  assert.equal(validatePerceptualSignatureEvidence(evidence, {sourceSha256: SOURCE, assetSha256: ASSET}).valid, true);
  assert.equal(evidence.observations.length, set.signatures.length);
  const angular = evidence.observations.find((item) => item.signatureId === 'angular-language');
  assert.equal(angular.status, 'mismatch');
  assert.equal(angular.finding.category, 'curvature-mismatch');
  assert.equal(angular.finding.ownerCapability, 'shape-reconstruction');
  const mass = evidence.observations.find((item) => item.signatureId === 'major-mass');
  assert.equal(mass.status, 'insufficient');
  assert.equal(mass.finding, null);
  assert.equal(evidence.policy.matchCannotPassVisualGate, true);
  assert.equal(evidence.policy.matchCannotCertify, true);

  assert.throws(() => createPerceptualSignatureEvidence({
    signatureSet: set,
    assetSha256: ASSET,
    observations: [{
      signatureId: 'angular-language',
      status: 'match',
      candidateObservation: 'Angular breaks are present.',
      comparisonConclusion: 'Observed agreement.',
      evidenceRefs: ['renders/hero.png'],
    }],
    evidenceRefs: ['renders/hero.png'],
  }), /cover every signature exactly once/);
});

test('R03 evidence fails closed on source, signature, and candidate drift', () => {
  const evidence = signatureEvidence();
  assert.equal(validatePerceptualSignatureEvidence(evidence, {sourceSha256: D('c')}).valid, false);
  assert.equal(validatePerceptualSignatureEvidence(evidence, {assetSha256: D('d')}).valid, false);

  const tampered = structuredClone(evidence);
  tampered.signatureSet.signatures[0].sourceObservation = 'tampered';
  assert.equal(validatePerceptualSignatureEvidence(tampered).valid, false);
});

test('R03 resemblance signal authority requires current signature evidence and cannot rank or optimize', () => {
  const evidence = signatureEvidence();

  assert.throws(() => metricAuthority('edge-character-score', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
  }), /requires current perceptual-signature evidence/);

  const authority = metricAuthority('edge-character-score', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  });
  assert.equal(authority.authority, 'RESEMBLANCE_SIGNAL');
  assert.equal(authority.resemblanceEvidenceDigest, evidence.evidenceDigest);

  assert.doesNotThrow(() => assertMetricUseAllowed('edge-character-score', 'resemblance', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  }));
  assert.throws(() => assertMetricUseAllowed('edge-character-score', 'objective', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  }), /cannot be used for objective/);
  assert.throws(() => assertMetricUseAllowed('edge-character-score', 'ranking', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  }), /cannot be used for ranking/);
  assert.throws(() => assertMetricUseAllowed('edge-character-score', 'certification', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  }), /cannot be used for certification/);
});

test('R03 never promotes single-view IoU to resemblance authority', () => {
  const evidence = signatureEvidence();
  assert.throws(() => assertMetricUseAllowed('silhouetteIoU', 'resemblance', {
    declaredAuthority: 'RESEMBLANCE_SIGNAL',
    resemblanceEvidence: evidence,
    currentSourceSha256: SOURCE,
    currentCandidateAssetSha256: ASSET,
  }), /FORBIDDEN_SINGLE_VIEW_IOU/);
});

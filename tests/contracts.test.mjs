import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createObservation,
  createReferenceRegistration,
  createSpatialHypothesisSet,
  createVisualHierarchy,
  digestJson,
  mapChildToParent,
  mapParentToChild,
  stableStringify,
  validateObservation,
  validateReferenceRegistration,
  validateSpatialHypothesisSet,
  validateVisualHierarchy,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_DIGEST = 'a'.repeat(64);

function hierarchyFixture() {
  return createVisualHierarchy({
    source: {path: 'source/reference.png', sha256: SOURCE_DIGEST, width: 640, height: 480},
    nodes: [
      {id: 'whole', label: 'Whole', level: 'whole', parentId: null, roi: [0, 0, 1, 1]},
      {id: 'cover', label: 'Cover', level: 'region', parentId: 'whole', roi: [0.1, 0.1, 0.8, 0.75]},
      {id: 'fastener', label: 'Fastener', level: 'part', parentId: 'cover', roi: [0.42, 0.34, 0.12, 0.14]},
    ],
  });
}

test('canonical JSON and digests are stable across key order', () => {
  assert.equal(stableStringify({z: 1, a: {d: 4, c: 3}}), '{"a":{"c":3,"d":4},"z":1}');
  assert.equal(digestJson({z: 1, a: 2}), digestJson({a: 2, z: 1}));
  assert.throws(() => stableStringify({unsafe: Number.NaN}), /NaN or Infinity/);
});

test('visual hierarchy preserves whole context and observation authority', () => {
  const hierarchy = hierarchyFixture();
  assert.deepEqual(validateVisualHierarchy(hierarchy), {valid: true, errors: [], nodeCount: 3});
  const structurallyInvalid = structuredClone(hierarchy);
  structurallyInvalid.nodes.find((node) => node.id === 'fastener').parentId = 'missing-parent';
  const hierarchyPayload = structuredClone(structurallyInvalid);
  delete hierarchyPayload.hierarchyDigest;
  structurallyInvalid.hierarchyDigest = digestJson(hierarchyPayload);
  assert.equal(validateVisualHierarchy(structurallyInvalid).valid, false);

  const observation = createObservation({
    hierarchy,
    nodeId: 'fastener',
    evidence: [
      {id: 'raw-reference', kind: 'source', path: 'source/reference.png', sha256: SOURCE_DIGEST, sourceSha256: SOURCE_DIGEST, primary: true},
      {id: 'fastener-crop', kind: 'crop', path: 'evidence/fastener.png', sha256: 'b'.repeat(64), sourceSha256: SOURCE_DIGEST, recipeDigest: 'c'.repeat(64)},
    ],
    facts: [{claim: 'A circular highlight lies inside the cover boundary.', evidenceIds: ['raw-reference', 'fastener-crop']}],
    interpretations: ['The highlight may belong to a raised fastener.'],
    hypotheses: ['A shallow cylinder could explain the grazing highlight.'],
    ambiguities: ['The hidden attachment method is not visible.'],
  });
  assert.deepEqual(observation.ancestry, ['whole', 'cover', 'fastener']);
  assert.deepEqual(validateObservation(observation, hierarchy), {valid: true, errors: []});
  const authorityInvalid = structuredClone(observation);
  authorityInvalid.evidence[0].primary = false;
  authorityInvalid.evidence[0].recipeDigest = 'd'.repeat(64);
  const observationPayload = structuredClone(authorityInvalid);
  delete observationPayload.observationDigest;
  authorityInvalid.observationDigest = digestJson(observationPayload);
  assert.equal(validateObservation(authorityInvalid, hierarchy).valid, false);

  assert.throws(() => createObservation({
    hierarchy,
    nodeId: 'fastener',
    evidence: [{id: 'crop-only', sha256: 'b'.repeat(64), sourceSha256: SOURCE_DIGEST, recipeDigest: 'c'.repeat(64)}],
    facts: ['A circular highlight is visible.'],
  }), /primary evidence/);

  assert.throws(() => createVisualHierarchy({
    source: hierarchy.source,
    nodes: [
      {id: 'whole', level: 'whole', parentId: null, roi: [0, 0, 1, 1]},
      {id: 'escaped', level: 'part', parentId: 'whole', roi: [0.9, 0.9, 0.2, 0.2]},
    ],
  }), /inside the source image/);
});

test('spatial selection requires a falsified high-impact competitor', () => {
  const base = {
    scopeId: 'whole',
    sourceSha256: SOURCE_DIGEST,
    attestation: {attested: true, evidenceRefs: ['evidence/reference.png']},
    hypotheses: [
      {
        id: 'shallow-crown',
        description: 'A shallow crown viewed nearly orthographically.',
        camera: {projection: 'orthographic'},
        predictions: {silhouette: 'stable', occlusion: 'minimal', sideView: 'thin', topView: 'broad', grazing: 'soft ridge'},
        falsifiers: ['A strong converging side profile.'],
        evidenceRefs: ['evidence/reference.png'],
        evidenceCoverage: 0.9,
        assumptionCost: 0.2,
        status: 'selected-candidate',
      },
      {
        id: 'deep-crown',
        description: 'A deeper crown under perspective projection.',
        camera: {projection: 'perspective'},
        predictions: {silhouette: 'tapered', occlusion: 'strong', sideView: 'deep', topView: 'narrow', grazing: 'sharp ridge'},
        falsifiers: ['A nearly constant-width contour.'],
        evidenceRefs: ['evidence/reference.png'],
        evidenceCoverage: 0.6,
        assumptionCost: 0.45,
        status: 'plausible',
      },
    ],
  };
  assert.throws(() => createSpatialHypothesisSet({...base, selectedId: 'shallow-crown'}), /competitors remain unfalsified/);
  base.hypotheses[1].status = 'falsified';
  const set = createSpatialHypothesisSet({...base, selectedId: 'shallow-crown'});
  assert.equal(set.ranking[0], 'shallow-crown');
  assert.deepEqual(validateSpatialHypothesisSet(set), {valid: true, errors: []});
  const misranked = structuredClone(set);
  misranked.ranking.reverse();
  const misrankedPayload = structuredClone(misranked);
  delete misrankedPayload.hypothesisSetDigest;
  misranked.hypothesisSetDigest = digestJson(misrankedPayload);
  assert.equal(validateSpatialHypothesisSet(misranked).valid, false);
});

test('reference registration is invertible and remains placement-only evidence', () => {
  const affine = ([x, y]) => [0.1 + 0.7 * x + 0.05 * y, 0.2 - 0.03 * x + 0.6 * y];
  const parentPoints = [[0.1, 0.15], [0.8, 0.12], [0.15, 0.82], [0.78, 0.76], [0.48, 0.42]];
  const registration = createReferenceRegistration({
    parentFrameId: 'whole-frame',
    childFrameId: 'cover-frame',
    parentSourceSha256: SOURCE_DIGEST,
    childSourceSha256: 'd'.repeat(64),
    model: 'projective-homography',
    correspondences: parentPoints.map((parent, index) => ({id: `point-${index}`, parent, child: affine(parent), evidenceRefs: ['evidence/registration.png']})),
    attestation: {attested: true, evidenceRefs: ['evidence/registration.png']},
    ambiguities: ['The mapping constrains placement, not hidden shape.'],
  });
  assert.ok(registration.metrics.rmse < 1e-9);
  assert.equal(registration.policy.registrationIsPlacementAuthorityNotShapeTruth, true);
  assert.equal(validateReferenceRegistration(registration).valid, true);
  const point = [0.34, 0.51];
  const child = mapParentToChild(registration, point);
  const restored = mapChildToParent(registration, child);
  assert.ok(Math.hypot(restored[0] - point[0], restored[1] - point[1]) < 1e-9);
  const falseTransform = structuredClone(registration);
  falseTransform.homographyParentToChild[2] += 0.05;
  const falseTransformPayload = structuredClone(falseTransform);
  delete falseTransformPayload.registrationDigest;
  falseTransform.registrationDigest = digestJson(falseTransformPayload);
  assert.equal(validateReferenceRegistration(falseTransform).valid, false);

  assert.throws(() => createReferenceRegistration({
    parentFrameId: 'whole-frame',
    childFrameId: 'cover-frame',
    parentSourceSha256: SOURCE_DIGEST,
    childSourceSha256: 'd'.repeat(64),
    correspondences: Array.from({length: 4}, (_, index) => ({id: `same-${index}`, parent: [0.2, 0.2], child: [0.3, 0.3], evidenceRefs: ['evidence/registration.png']})),
    attestation: {attested: true, evidenceRefs: ['evidence/registration.png']},
  }), /singular or underconstrained/);
});

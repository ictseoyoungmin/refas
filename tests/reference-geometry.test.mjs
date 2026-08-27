import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createReferenceGeometry,
  validateReferenceGeometry,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'a'.repeat(64);

function fixture() {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE,
    anchors: [
      {id: 'head-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.48, 0.18], visibility: 'visible', confidence: 0.98, semanticRole: 'head centroid'},
      {id: 'left-shoulder', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.39, 0.32], visibility: 'visible', confidence: 0.95, semanticRole: 'shoulder joint'},
      {id: 'left-elbow', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.35, 0.50], visibility: 'visible', confidence: 0.96, semanticRole: 'elbow joint'},
      {id: 'left-wrist', importance: 'identity', evidenceRefs: ['source/reference.png'], xy: [0.45, 0.28], visibility: 'visible', confidence: 0.9, semanticRole: 'wrist/contact region'},
      {id: 'pelvis-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.51, 0.56], visibility: 'visible', confidence: 0.88, semanticRole: 'pelvis center'},
    ],
    chains: [
      {id: 'left-arm-chain', importance: 'macro', evidenceRefs: ['source/reference.png'], anchorIds: ['left-shoulder', 'left-elbow', 'left-wrist'], closed: false},
    ],
    axes: [
      {id: 'upper-body-axis', importance: 'macro', evidenceRefs: ['source/reference.png'], fromAnchorId: 'pelvis-center', toAnchorId: 'head-center'},
    ],
    contacts: [
      {id: 'wrist-head-near', importance: 'identity', evidenceRefs: ['source/reference.png'], aAnchorId: 'left-wrist', bAnchorId: 'head-center', relation: 'near', toleranceNormalized: 0.15},
    ],
    occlusions: [
      {id: 'arm-front-of-body', importance: 'identity', evidenceRefs: ['source/reference.png'], frontId: 'left-arm-chain', backId: 'upper-body-axis'},
    ],
    negativeSpaces: [
      {id: 'arm-torso-gap', importance: 'macro', evidenceRefs: ['source/reference.png'], polygon: [[0.39, 0.33], [0.42, 0.43], [0.36, 0.48]]},
    ],
    contours: [
      {id: 'upper-silhouette', importance: 'macro', evidenceRefs: ['source/reference.png'], points: [[0.35, 0.17], [0.48, 0.11], [0.59, 0.23], [0.64, 0.45]], closed: false},
    ],
    dimensions: [
      {id: 'shoulder-elbow-span', importance: 'macro', evidenceRefs: ['source/reference.png'], aAnchorId: 'left-shoulder', bAnchorId: 'left-elbow', kind: 'distance'},
    ],
    attestation: {attested: true, evidenceRefs: ['source/reference.png']},
  };
}

test('reference geometry is source-space, linked, canonical, and digest-bound', () => {
  const geometry = createReferenceGeometry(fixture());
  assert.equal(geometry.coordinateSpace.kind, 'normalized-image');
  assert.equal(geometry.policy.referenceGeometryContainsNo3dCoordinates, true);
  assert.equal(geometry.policy.modelProjectionMustBindSeparately, true);
  assert.deepEqual(validateReferenceGeometry(geometry), {valid: true, errors: []});

  const tampered = structuredClone(geometry);
  tampered.anchors[0].xy[0] += 0.05;
  assert.equal(validateReferenceGeometry(tampered).valid, false);
});

test('reference geometry rejects 3D source claims and broken semantic links', () => {
  const with3d = fixture();
  with3d.anchors[0].xyz = [0, 0, 0];
  assert.throws(() => createReferenceGeometry(with3d), /must not contain 3D coordinates/);

  const brokenChain = fixture();
  brokenChain.chains[0].anchorIds.push('missing-anchor');
  assert.throws(() => createReferenceGeometry(brokenChain), /unknown anchor/);

  const brokenOcclusion = fixture();
  brokenOcclusion.occlusions[0].backId = 'missing-geometry';
  assert.throws(() => createReferenceGeometry(brokenOcclusion), /unknown geometry primitive/);
});

test('reference geometry rejects out-of-frame and degenerate evidence geometry', () => {
  const outOfFrame = fixture();
  outOfFrame.anchors[0].xy = [1.01, 0.2];
  assert.throws(() => createReferenceGeometry(outOfFrame), /normalized image coordinates/);

  const degenerateGap = fixture();
  degenerateGap.negativeSpaces[0].polygon = [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]];
  assert.throws(() => createReferenceGeometry(degenerateGap), /degenerate/);
});

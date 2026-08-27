import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createReferenceGeometry,
  validateReferenceGeometry,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'a'.repeat(64);
const EVIDENCE = ['source/reference.png'];

function fixture() {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE,
    anchors: [
      {id: 'head-crown', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.46, 0.16], visibility: 'visible', confidence: 0.95, semanticRole: 'structural crown, not silhouette extremum'},
      {id: 'head-contour-topmost', importance: 'identity', evidenceRefs: EVIDENCE, xy: [0.43, 0.13], visibility: 'visible', confidence: 1, semanticRole: 'screen-space topmost silhouette sample'},
      {id: 'neck-center', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.48, 0.27], visibility: 'visible', confidence: 0.98, semanticRole: 'neck joint center'},
      {id: 'torso-upper-center', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.47, 0.36], visibility: 'visible', confidence: 0.98, semanticRole: 'upper torso shell center'},
      {id: 'torso-mid-center', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.48, 0.47], visibility: 'visible', confidence: 0.96, semanticRole: 'intermediate torso connector center'},
      {id: 'torso-lower-center', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.49, 0.57], visibility: 'visible', confidence: 0.97, semanticRole: 'lower torso shell center'},
      {id: 'left-shoulder', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.39, 0.32], visibility: 'visible', confidence: 0.95, semanticRole: 'shoulder joint'},
      {id: 'left-elbow', importance: 'macro', evidenceRefs: EVIDENCE, xy: [0.35, 0.50], visibility: 'visible', confidence: 0.96, semanticRole: 'elbow joint'},
      {id: 'left-wrist', importance: 'identity', evidenceRefs: EVIDENCE, xy: [0.45, 0.28], visibility: 'visible', confidence: 0.9, semanticRole: 'wrist/contact region'},
    ],
    chains: [
      {id: 'torso-chain', importance: 'macro', evidenceRefs: EVIDENCE, anchorIds: ['neck-center', 'torso-upper-center', 'torso-mid-center', 'torso-lower-center'], closed: false},
      {id: 'left-arm-chain', importance: 'macro', evidenceRefs: EVIDENCE, anchorIds: ['left-shoulder', 'left-elbow', 'left-wrist'], closed: false},
    ],
    axes: [
      {id: 'head-axis', importance: 'macro', evidenceRefs: EVIDENCE, fromAnchorId: 'head-crown', toAnchorId: 'neck-center'},
    ],
    segments: [
      {
        id: 'torso-upper-shell', importance: 'identity', evidenceRefs: EVIDENCE, label: 'shoulder and chest shell',
        polygon: [[0.38, 0.29], [0.56, 0.28], [0.58, 0.41], [0.40, 0.42]], anchorIds: ['torso-upper-center'], visibility: 'visible', separation: 'explicit',
      },
      {
        id: 'torso-mid-connector', importance: 'identity', evidenceRefs: EVIDENCE, label: 'intermediate torso connector',
        polygon: [[0.42, 0.42], [0.56, 0.41], [0.55, 0.51], [0.43, 0.52]], anchorIds: ['torso-mid-center'], visibility: 'visible', separation: 'explicit',
      },
      {
        id: 'torso-lower-shell', importance: 'identity', evidenceRefs: EVIDENCE, label: 'waist and pelvis shell',
        polygon: [[0.40, 0.52], [0.57, 0.51], [0.59, 0.62], [0.39, 0.63]], anchorIds: ['torso-lower-center'], visibility: 'visible', separation: 'explicit',
      },
      {
        id: 'left-upper-arm', importance: 'identity', evidenceRefs: EVIDENCE, label: 'left upper arm body',
        polygon: [[0.37, 0.33], [0.42, 0.34], [0.39, 0.49], [0.34, 0.50]], anchorIds: ['left-shoulder', 'left-elbow'], visibility: 'visible', separation: 'explicit',
      },
      {
        id: 'left-forearm', importance: 'identity', evidenceRefs: EVIDENCE, label: 'left forearm body',
        polygon: [[0.34, 0.50], [0.39, 0.49], [0.48, 0.31], [0.44, 0.28]], anchorIds: ['left-elbow', 'left-wrist'], visibility: 'visible', separation: 'explicit',
      },
    ],
    interfaces: [
      {
        id: 'upper-to-mid-interface', importance: 'identity', evidenceRefs: EVIDENCE,
        subjectSegmentId: 'torso-upper-shell', objectSegmentId: 'torso-mid-connector', kind: 'joint-boundary', separation: 'explicit',
        boundary: [[0.40, 0.42], [0.56, 0.41]], visibility: 'visible',
      },
      {
        id: 'mid-to-lower-interface', importance: 'identity', evidenceRefs: EVIDENCE,
        subjectSegmentId: 'torso-mid-connector', objectSegmentId: 'torso-lower-shell', kind: 'joint-boundary', separation: 'explicit',
        boundary: [[0.43, 0.52], [0.55, 0.51]], visibility: 'visible',
      },
      {
        id: 'left-elbow-interface', importance: 'identity', evidenceRefs: EVIDENCE,
        subjectSegmentId: 'left-upper-arm', objectSegmentId: 'left-forearm', kind: 'joint-gap', separation: 'explicit',
        boundary: [[0.34, 0.50], [0.39, 0.49]], visibility: 'visible',
      },
    ],
    contacts: [
      {id: 'wrist-head-near', importance: 'identity', evidenceRefs: EVIDENCE, aAnchorId: 'left-wrist', bAnchorId: 'head-crown', relation: 'near', toleranceNormalized: 0.15},
    ],
    occlusions: [
      {id: 'arm-front-of-torso', importance: 'identity', evidenceRefs: EVIDENCE, frontId: 'left-arm-chain', backId: 'torso-upper-shell'},
    ],
    negativeSpaces: [
      {id: 'arm-torso-gap', importance: 'macro', evidenceRefs: EVIDENCE, polygon: [[0.39, 0.33], [0.42, 0.43], [0.36, 0.48]]},
    ],
    contours: [
      {id: 'head-top-contour', importance: 'identity', evidenceRefs: EVIDENCE, points: [[0.42, 0.14], [0.43, 0.13], [0.45, 0.135]], closed: false},
    ],
    dimensions: [
      {id: 'shoulder-elbow-span', importance: 'macro', evidenceRefs: EVIDENCE, aAnchorId: 'left-shoulder', bAnchorId: 'left-elbow', kind: 'distance'},
    ],
    attestation: {attested: true, evidenceRefs: EVIDENCE},
  };
}

test('reference geometry preserves source-space part buildup before assembly', () => {
  const geometry = createReferenceGeometry(fixture());
  assert.equal(geometry.coordinateSpace.kind, 'normalized-image');
  assert.equal(geometry.segments.length, 5);
  assert.equal(geometry.interfaces.length, 3);
  assert.equal(geometry.policy.referenceGeometryContainsNo3dCoordinates, true);
  assert.equal(geometry.policy.observedSegmentationPrecedesPhysicalAssembly, true);
  assert.equal(geometry.policy.segmentSeparationMayRemainUncertain, true);
  assert.equal(geometry.policy.modelProjectionMustBindSeparately, true);
  assert.deepEqual(validateReferenceGeometry(geometry), {valid: true, errors: []});
});

test('structural crown remains distinct from the topmost silhouette sample', () => {
  const geometry = createReferenceGeometry(fixture());
  assert.notDeepEqual(
    geometry.anchors.find((item) => item.id === 'head-crown').xy,
    geometry.anchors.find((item) => item.id === 'head-contour-topmost').xy,
  );
});

test('reference geometry rejects 3D source claims and broken semantic links', () => {
  const with3d = fixture();
  with3d.segments[0].depthBand = [0, 1];
  assert.throws(() => createReferenceGeometry(with3d), /must not contain 3D geometry field/);

  const brokenChain = fixture();
  brokenChain.chains[0].anchorIds.push('missing-anchor');
  assert.throws(() => createReferenceGeometry(brokenChain), /unknown anchor/);

  const brokenInterface = fixture();
  brokenInterface.interfaces[0].objectSegmentId = 'missing-segment';
  assert.throws(() => createReferenceGeometry(brokenInterface), /unknown segment/);

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

test('tampering with observed segmentation invalidates the digest', () => {
  const geometry = structuredClone(createReferenceGeometry(fixture()));
  geometry.segments[0].separation = 'uncertain';
  assert.equal(validateReferenceGeometry(geometry).valid, false);
});

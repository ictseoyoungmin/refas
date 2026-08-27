import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  createProjectionAwareVisualReview,
  createProjectionFit,
  createReferenceGeometry,
  createVisualReview,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
const passVerdicts = (ids, prefix) => ids.map((id) => ({
  id,
  status: 'pass',
  evidenceRefs: [`reviews/${prefix}-${id}.png`],
  summary: `${id} was directly compared against current source-bound evidence and has no blocking mismatch.`,
}));

function referenceGeometry() {
  return createReferenceGeometry({
    scopeId: 'whole',
    sourceSha256: D('a'),
    anchors: [
      {id: 'head-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.50, 0.20], visibility: 'visible', confidence: 1},
      {id: 'shoulder-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.43, 0.35], visibility: 'visible', confidence: 1},
      {id: 'pelvis-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.52, 0.58], visibility: 'visible', confidence: 1},
    ],
    chains: [
      {id: 'body-chain', importance: 'macro', evidenceRefs: ['source/reference.png'], anchorIds: ['head-center', 'shoulder-center', 'pelvis-center']},
    ],
    axes: [
      {id: 'torso-axis', importance: 'macro', evidenceRefs: ['source/reference.png'], fromAnchorId: 'pelvis-center', toAnchorId: 'shoulder-center'},
    ],
    negativeSpaces: [
      {id: 'major-gap', importance: 'macro', evidenceRefs: ['source/reference.png'], polygon: [[0.40, 0.38], [0.47, 0.48], [0.42, 0.54]]},
    ],
    attestation: {attested: true, evidenceRefs: ['source/reference.png']},
  });
}

const project = (referenceId, xy) => ({
  referenceId,
  projectedXY: xy,
  binding: {kind: 'node-local-point', nodeId: `node-${referenceId}`, localPoint: [0, 0, 0]},
  evidenceRefs: ['renders/hero.png'],
});

function projectionFit(kind = 'good') {
  const geometry = referenceGeometry();
  const coordinates = kind === 'good'
    ? {head: [0.502, 0.201], shoulder: [0.431, 0.351], pelvis: [0.521, 0.581]}
    : {head: [0.70, 0.12], shoulder: [0.62, 0.26], pelvis: [0.40, 0.73]};
  return createProjectionFit({
    referenceGeometry: geometry,
    cameraHypothesisId: 'camera-candidate',
    cameraDigest: D('b'),
    modelBindingDigest: D('c'),
    anchorProjections: [
      project('head-center', coordinates.head),
      project('shoulder-center', coordinates.shoulder),
      project('pelvis-center', coordinates.pelvis),
    ],
    negativeSpaceProjections: [{
      referenceId: 'major-gap',
      polygon: kind === 'good'
        ? [[0.40, 0.38], [0.47, 0.48], [0.42, 0.54]]
        : [[0.68, 0.55], [0.82, 0.70], [0.74, 0.82]],
    }],
    evidenceRefs: ['renders/hero.png'],
  });
}

function reviewInput() {
  return {
    scopeId: 'whole',
    sourceSha256: D('a'),
    assetSha256: D('d'),
    evidenceClass: 'independent-reference',
    verdict: 'pass',
    views: passVerdicts(REQUIRED_REVIEW_VIEW_IDS, 'view'),
    gateVerdicts: passVerdicts(REQUIRED_VISUAL_GATE_IDS, 'gate'),
    unresolvedFindings: [],
    renderer: {
      kind: 'independent-pbr',
      family: 'blender-cycles',
      reportRef: 'renders/pbr/report.json',
      reportSha256: D('e'),
      independentProcess: true,
      claimScope: 'visual-fidelity',
      supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupportedMaterialFeatures: [],
    },
    requiredMaterialFeatures: [],
    attestation: {attested: true, evidenceRefs: ['source/reference.png', 'renders/hero.png']},
  };
}

test('passing visual evidence cannot use empty or whitespace-only summaries', () => {
  const emptyView = reviewInput();
  emptyView.views[0].summary = '   ';
  assert.throws(() => createVisualReview(emptyView), /substantive observation summary/);

  const emptyGate = reviewInput();
  emptyGate.gateVerdicts[0].summary = '';
  assert.throws(() => createVisualReview(emptyGate), /substantive observation summary/);
});

test('material projection mismatch vetoes a requested passing visual review', () => {
  assert.throws(
    () => createProjectionAwareVisualReview({...reviewInput(), projectionFit: projectionFit('bad')}),
    /cannot contain unresolved major, critical, or blocking findings/,
  );
});

test('projection-aware review preserves human visual authority when geometry is not materially inconsistent', () => {
  const review = createProjectionAwareVisualReview({...reviewInput(), projectionFit: projectionFit('good')});
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.unresolvedFindings, []);
  assert.equal(review.policy.unresolvedBlockingFindingsPreventClosure, true);
});

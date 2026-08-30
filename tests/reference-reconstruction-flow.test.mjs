import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  createProjectionAwareVisualReview,
  createProjectionFit,
  createReferenceGeometry,
  findingsFromProjectionFit,
  routeFinding,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
const projection = (referenceId, projectedXY) => ({
  referenceId,
  projectedXY,
  binding: {kind: 'node-local-point', nodeId: `node-${referenceId}`, localPoint: [0, 0, 0]},
  evidenceRefs: ['renders/hero.png'],
});
const observation = (id) => ({
  sourceObservation: `The source ${id} evidence is visible in the bound reference.`,
  renderObservation: `The current ${id} render is visible in the bound candidate evidence.`,
  comparisonConclusion: `The ${id} comparison was directly reviewed for a blocking mismatch.`,
  evidenceRefs: [`reviews/${id}.png`],
});

function geometry() {
  return createReferenceGeometry({
    scopeId: 'whole', sourceSha256: D('a'),
    anchors: [
      {id: 'head-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [.50, .18], visibility: 'visible', confidence: 1},
      {id: 'shoulder-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [.43, .34], visibility: 'visible', confidence: 1},
      {id: 'pelvis-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [.49, .57], visibility: 'visible', confidence: 1},
      {id: 'knee-center', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [.62, .66], visibility: 'visible', confidence: 1},
    ],
    chains: [
      {id: 'body-chain', importance: 'macro', evidenceRefs: ['source/reference.png'], anchorIds: ['head-center', 'shoulder-center', 'pelvis-center']},
      {id: 'leg-chain', importance: 'macro', evidenceRefs: ['source/reference.png'], anchorIds: ['pelvis-center', 'knee-center']},
    ],
    axes: [{id: 'torso-axis', importance: 'macro', evidenceRefs: ['source/reference.png'], fromAnchorId: 'pelvis-center', toAnchorId: 'shoulder-center'}],
    negativeSpaces: [{id: 'torso-arm-gap', importance: 'macro', evidenceRefs: ['source/reference.png'], polygon: [[.47,.36],[.54,.43],[.48,.51]]}],
    attestation: {attested: true, evidenceRefs: ['source/reference.png']},
  });
}

function fit(kind) {
  const referenceGeometry = geometry();
  const xy = kind === 'good'
    ? {head:[.502,.181], shoulder:[.431,.341], pelvis:[.491,.571], knee:[.621,.661]}
    : {head:[.68,.10], shoulder:[.61,.25], pelvis:[.36,.66], knee:[.78,.75]};
  return createProjectionFit({
    referenceGeometry,
    cameraHypothesisId: 'camera-candidate', cameraDigest: D('b'), modelBindingDigest: D('c'),
    anchorProjections: [
      projection('head-center', xy.head), projection('shoulder-center', xy.shoulder),
      projection('pelvis-center', xy.pelvis), projection('knee-center', xy.knee),
    ],
    negativeSpaceProjections: [{referenceId: 'torso-arm-gap', polygon: kind === 'good'
      ? [[.47,.36],[.54,.43],[.48,.51]]
      : [[.65,.55],[.80,.66],[.71,.78]]}],
    evidenceRefs: ['renders/hero.png'],
  });
}

const passItems = (ids, prefix) => ids.map((id) => ({
  id, status: 'pass', evidenceRefs: [`reviews/${prefix}-${id}.png`],
  observation: observation(`${prefix}-${id}`),
  summary: `${id} was compared against current source-bound evidence and no blocking mismatch remains.`,
}));

function reviewInput(projectionFit) {
  return {
    projectionFit,
    scopeId: 'whole', sourceSha256: D('a'), assetSha256: D('d'),
    evidenceClass: 'independent-reference', verdict: 'pass',
    views: passItems(REQUIRED_REVIEW_VIEW_IDS, 'view'),
    gateVerdicts: passItems(REQUIRED_VISUAL_GATE_IDS, 'gate'),
    unresolvedFindings: [],
    registeredComparison: {
      path: 'reviews/registered-comparison/comparison-report.json', sha256: D('f'), comparisonDigest: D('0'),
      sourceSha256: D('a'), sourceManifestSha256: D('b'), assetSha256: D('d'),
      renderReportPath: 'renders/pbr/report.json', renderReportSha256: D('1'), framePath: 'renders/pbr/hero.png', frameSha256: D('2'),
      registrationDigest: D('3'), hierarchyDigest: D('4'), inputDigest: D('5'), scopeIds: ['whole'],
    },
    comparisonAssessment: {
      sourceObservation: 'The source whole object and its visible macro boundaries were inspected.',
      renderObservation: 'The current whole render and registered comparison board were inspected.',
      comparisonConclusion: 'The registered comparison is sufficient for this review.',
      evidenceRefs: ['source/reference.png', 'reviews/registered-comparison/comparison-report.json'],
      contradictionResolution: {status: 'not-present', explanation: '', evidenceRefs: [], findingRefs: []},
    },
    renderer: {
      kind: 'independent-pbr', family: 'blender-cycles', reportRef: 'renders/pbr/report.json', reportSha256: D('e'),
      independentProcess: true, claimScope: 'visual-fidelity',
      supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'], unsupportedMaterialFeatures: [],
    },
    requiredMaterialFeatures: [],
    attestation: {attested: true, evidenceRefs: ['source/reference.png', 'renders/hero.png']},
  };
}

test('reference geometry through projection-aware review preserves the good path', () => {
  const projectionFit = fit('good');
  assert.deepEqual(findingsFromProjectionFit(projectionFit), []);
  const review = createProjectionAwareVisualReview(reviewInput(projectionFit));
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.unresolvedFindings, []);
});

test('macro projection disagreement is localized, routed upstream, and vetoes closure', () => {
  const projectionFit = fit('bad');
  const findings = findingsFromProjectionFit(projectionFit);
  assert.ok(findings.length > 0);
  assert.ok(findings.some((finding) => finding.ownerCapability === 'shape-reconstruction'));
  for (const finding of findings) {
    const route = routeFinding({finding});
    assert.equal(route.action, 'REOPEN_CAPABILITY');
    assert.ok(route.invalidatedCapabilities.includes(route.ownerCapability));
  }
  assert.throws(
    () => createProjectionAwareVisualReview(reviewInput(projectionFit)),
    /cannot contain unresolved major, critical, or blocking findings/,
  );
});

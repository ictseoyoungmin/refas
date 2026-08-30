import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';

import {
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  createProjectionAwareVisualReview,
  createProjectionFit,
  createReferenceGeometry,
  createVisualReview,
  assessCertification,
  auditProject,
  certifyProject,
  findComparisonContradictions,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
const observation = (id) => ({
  sourceObservation: `The source ${id} evidence is visible in the bound reference.`,
  renderObservation: `The current ${id} render is visible in the bound candidate evidence.`,
  comparisonConclusion: `The ${id} comparison was directly reviewed for a blocking mismatch.`,
  evidenceRefs: [`reviews/${id}.png`],
});
const passVerdicts = (ids, prefix) => ids.map((id) => ({
  id,
  status: 'pass',
  evidenceRefs: [`reviews/${prefix}-${id}.png`],
  observation: observation(`${prefix}-${id}`),
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
  delete emptyView.views[0].observation;
  emptyView.views[0].summary = '   ';
  assert.throws(() => createVisualReview(emptyView), /substantive observation summary/);

  const emptyGate = reviewInput();
  delete emptyGate.gateVerdicts[0].observation;
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

test('independent passing review requires an exact registered comparison and assessment', () => {
  const missingComparison = reviewInput();
  delete missingComparison.registeredComparison;
  assert.throws(() => createVisualReview(missingComparison), /exact registered comparison binding/);

  const missingAssessment = reviewInput();
  delete missingAssessment.comparisonAssessment;
  assert.throws(() => createVisualReview(missingAssessment), /comparison assessment/);
});

test('comparison screening emits evidence without becoming a visual gate', () => {
  const report = {
    comparisonDigest: D('0'),
    scopes: [{scopeId: 'whole', metrics: {silhouetteIoU: 0.424, sourceForegroundPixels: 1000, renderForegroundPixels: 300}, images: [{path: 'whole/comparison-board.png'}]}],
  };
  const signals = findComparisonContradictions(report);
  assert.deepEqual(signals.map((signal) => signal.category), ['silhouette-mismatch', 'mass-proportion-mismatch']);
  assert.ok(signals.every((signal) => signal.evidenceRefs.includes('whole/comparison-board.png')));
});

test('historical thinker all-pass empty review cannot be certified after migration', async () => {
  const root = path.resolve('temp/refas-thinker-articulated-figure-certified/articulated-drawing-figure/output/project');
  try { await fs.access(root); } catch {
    // Keep the regression portable for clean checkouts where the user-supplied
    // artifact is not redistributed: the same legacy shape is rejected at the
    // validator boundary even without its project bytes.
    const legacy = reviewInput();
    legacy.views.forEach((item) => { delete item.observation; item.summary = ''; });
    legacy.gateVerdicts.forEach((item) => { delete item.observation; item.summary = ''; });
    assert.throws(() => createVisualReview(legacy), /substantive observation summary/);
    return;
  }
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /visual review is invalid|substantive observation/);
  await assert.rejects(() => certifyProject(root), /certification refused/);
  assert.equal((await auditProject(root)).valid, false);
});

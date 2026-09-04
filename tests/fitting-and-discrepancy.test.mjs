import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAppearanceFitPlan, createBenchmarkMatrix, createCameraFitPlan, createLandmarkCage,
  createLightingCalibrationPlan, createLongitudinalGuide, createMacroFitCoordinatorPlan,
  createNegativeSpaceCutaway, createPerceptualDiscrepancy, createRepresentationCapacityReport, createSectionProfileLoft,
  createSegmentPrism, createPoseFitPlan, fitAppearance, fitCamera, fitLighting, fitPose,
  partsToGlb, applyParentLocalTransformEdits, parseGlb, assessBenchmarkCapabilityClosure, recordBenchmarkResult, validateBenchmarkMatrix, validateCameraFitPlan, validatePoseFitPlan,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const sourceRef = {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: D(), sizeBytes: 1};
const camera = {projection: 'perspective', position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: 45, aspect: 1};

test('camera fitter is bounded, deterministic, and owner-local', async () => {
  const plan = createCameraFitPlan({id: 'camera-fit', scopeId: 'whole', sourceSha256: D(), baselineCamera: camera, hypothesisId: 'camera-hypothesis', variables: [{id: 'fov', binding: 'camera.fovY', minimum: 30, maximum: 60, initial: 45}], evaluationBudget: 8});
  assert.equal(validateCameraFitPlan(plan).valid, true);
  const evaluate = async (candidate) => ({measurements: {'macro-camera-loss': Math.abs(candidate.fovY - 40)}});
  const first = await fitCamera(plan, evaluate), second = await fitCamera(plan, evaluate);
  assert.equal(first.reportDigest, second.reportDigest);
  assert.equal(first.trials[first.selectedTrialId ? first.trials.findIndex((item) => item.id === first.selectedTrialId) : 0].camera.position[2], 5);
});

test('camera fitter evaluates declared perspective and orthographic hypotheses', async () => {
  const plan = createCameraFitPlan({id: 'camera-projections', scopeId: 'whole', sourceSha256: D(), baselineCamera: camera, hypothesisId: 'camera-hypotheses', projectionCandidates: ['perspective', 'orthographic'], variables: [{id: 'target-y', binding: 'camera.target.y', minimum: -.2, maximum: .2, initial: 0}], evaluationBudget: 6});
  const report = await fitCamera(plan, async (candidate) => ({measurements: {'macro-camera-loss': candidate.projection === 'orthographic' ? 0 : 1}}));
  assert.equal(validateCameraFitPlan(plan).valid, true);
  assert.equal(report.trials.some((trial) => trial.projection === 'orthographic'), true);
  assert.equal(report.trials.find((trial) => trial.id === report.selectedTrialId).camera.projection, 'orthographic');
});

test('pose fitter preserves exact mesh bytes while changing only transform edits', async () => {
  const glb = partsToGlb({parts: [{id: 'root-part', scopeId: 'whole', materialId: 'wood', mesh: createSegmentPrism({start: [-.1, 0, 0], end: [.1, 0, 0], width: .1, height: .1})}], materials: {wood: {baseColor: [0.6, 0.4, 0.2, 1], roughness: .7, metallic: 0}}});
  const plan = createPoseFitPlan({id: 'pose-fit', scopeId: 'whole', sourceSha256: D(), baselineAsset: {...sourceRef, sizeBytes: glb.length, sha256: '0'.repeat(64)}, variables: [{id: 'bend', binding: 'assembly.joint.root-part.angle', minimum: -1, maximum: 1, initial: 0}], evaluationBudget: 4, structuralEligibilityRequired: false});
  // Bind the real baseline digest after construction to keep the fixture explicit.
  const bound = createPoseFitPlan({...plan, evaluationBudget: 6, baselineAsset: {...plan.baselineAsset, sha256: (await import('../skills/refas/scripts/lib/index.mjs')).digestBytes(glb)}});
  assert.equal(validatePoseFitPlan(bound).valid, true);
  const report = await fitPose(bound, {baselineGlb: glb, buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits), evaluate: async (_candidate, context) => ({measurements: {'pose-loss': Math.abs(context.parameters.bend - .5)}})});
  assert.equal(report.status, 'IMPROVED');
  assert.equal(report.trials.every((trial) => trial.candidateBinarySha256 === trial.baselineBinarySha256), true);
  assert.notDeepEqual(parseGlb(applyParentLocalTransformEdits(glb, [{nodeId: 'root-part', angle: .3}])).json.nodes[0].rotation, parseGlb(glb).json.nodes[0].rotation);
});

test('generic loft exposes high-capacity sections and explicit representation blockers', () => {
  const guide = createLongitudinalGuide({points: [{v: 0, point: [0, 0, 0]}, {v: .5, point: [.1, 0, .5]}, {v: 1, point: [0, 0, 1]}], twist: [{v: 0, radians: 0}, {v: 1, radians: .4}]});
  const cage = createLandmarkCage({landmarks: [{id: 'crest', point: [0, .1, .5], role: 'extremum'}]});
  const loft = createSectionProfileLoft({guide, sections: [{v: 0, width: .3, depth: .2, offset: [0, 0]}, {v: .5, width: .5, depth: .3, flattening: .7}, {v: 1, width: .2, depth: .15}], profile: {model: 'superellipse', exponent: 3, samples: 12}});
  assert.equal(loft.analysis.valid, true); assert.equal(loft.loft.capacity.asymmetricWidthDepth, true); assert.equal(cage.landmarks[0].id, 'crest');
  const report = createRepresentationCapacityReport({obligations: [{id: 'cutaway', description: 'visible opening'}], supported: ['section-profile'], unsupported: ['cutaway']});
  assert.equal(report.blockers[0].category, 'representation-blocker');
  const cutaway = createNegativeSpaceCutaway({outerProfile: [[-1, -1], [1, -1], [1, 1], [-1, 1]], cutouts: [{id: 'opening', profile: [[-.3, -.3], [.3, -.3], [.3, .3], [-.3, .3]]}], thickness: .2});
  assert.equal(cutaway.cutaway.actualOpening, true); assert.equal(cutaway.analysis.watertight, true);
});

test('model-free discrepancy is deterministic and never a visual gate', () => {
  const source = {width: 4, height: 4, channels: 1, data: [0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]};
  const render = {...source, data: [0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0]};
  const first = createPerceptualDiscrepancy({source, render, sourceSha256: D(), assetSha256: D()});
  const second = createPerceptualDiscrepancy({source, render, sourceSha256: D(), assetSha256: D()});
  assert.equal(first.discrepancyDigest, second.discrepancyDigest); assert.equal(first.policy.metricsCannotPassVisualGate, true); assert.ok(first.metrics.silhouetteIoU < 1);
});

test('appearance and lighting plans require frozen geometry evidence', async () => {
  const appearance = createAppearanceFitPlan({id: 'appearance-fit', scopeId: 'whole', sourceSha256: D(), baselineAsset: sourceRef, geometryDigest: D('b'), variables: [{id: 'rough', binding: 'appearance.material.wood.roughness', minimum: .1, maximum: .9, initial: .5}], evaluationBudget: 3});
  const lighting = createLightingCalibrationPlan({id: 'lighting-fit', scopeId: 'whole', sourceSha256: D(), baselineAsset: sourceRef, geometryDigest: D('b'), frameDigest: D('c'), variables: [{id: 'exposure', binding: 'lighting.exposure', minimum: -1, maximum: 1, initial: 0}], evaluationBudget: 3});
  await assert.rejects(() => fitAppearance(appearance, async () => ({measurements: {'appearance-loss': 1}, geometryDigest: D('x')})), /frozen geometry/);
  await assert.rejects(() => fitLighting(lighting, async () => ({measurements: {'lighting-loss': 1}, geometryDigest: D('b'), frameDigest: D('x')})), /frameDigest/);
  const appearanceReport = await fitAppearance(appearance, async () => ({measurements: {'appearance-loss': 0.5}, geometryDigest: D('b'), candidateAsset: {...sourceRef, kind: 'glb'}}));
  const lightingReport = await fitLighting(lighting, async () => ({measurements: {'lighting-loss': 0.5}, geometryDigest: D('b'), frameDigest: D('c'), candidateAsset: {...sourceRef, kind: 'glb'}}));
  assert.equal(appearanceReport.trials.every((trial) => trial.candidateAsset.sha256 === sourceRef.sha256), true);
  assert.equal(lightingReport.trials.every((trial) => trial.candidateAsset.sha256 === sourceRef.sha256), true);
});

test('macro coordinator enforces camera → pose → shape sequence and benchmark closure', async () => {
  const plan = createMacroFitCoordinatorPlan({id: 'macro-fit', scopeId: 'whole', sourceSha256: D(), maxOuterCycles: 1});
  const order = [];
  const report = await (await import('../skills/refas/scripts/lib/index.mjs')).runMacroFit({plan, fitters: {camera: async () => { order.push('camera'); return {state: {stage: 'camera'}, status: 'IMPROVED', evaluationCount: 1}; }, pose: async (state) => { order.push('pose'); return {state, status: 'NO_IMPROVEMENT', evaluationCount: 1}; }, shape: async (state) => { order.push('shape'); return {state, status: 'NO_IMPROVEMENT', evaluationCount: 1}; }}});
  assert.deepEqual(order, ['camera', 'pose', 'shape']); assert.equal(report.policy.coordinatorCannotCertify, true);
  const matrix = createBenchmarkMatrix({benchmarks: [{id: 'organic', category: 'articulated-manufactured-organic', source: sourceRef}, {id: 'mechanical', category: 'hard-surface-mechanical', source: {...sourceRef, path: 'mechanical.png', sha256: D('b')}}]});
  assert.equal(validateBenchmarkMatrix(matrix).valid, true);
  assert.throws(() => createBenchmarkMatrix({benchmarks: [{id: 'aa', category: 'articulated-manufactured-organic', source: sourceRef}, {id: 'bb', category: 'hard-surface-mechanical', source: {...sourceRef, path: 'same.png'}}]}), /distinct source digests/);
  assert.throws(() => recordBenchmarkResult(matrix, 'organic', {baselineAsset: sourceRef, finalAsset: sourceRef, certificate: sourceRef}), /visually justified|explicitly passing visual review/);
  const organic = recordBenchmarkResult(matrix, 'organic', {baselineAsset: sourceRef, finalAsset: sourceRef, comparisons: [sourceRef], visualReview: {...sourceRef, kind: 'visual-review'}, visualReviewVerdict: 'pass'});
  const complete = recordBenchmarkResult(organic, 'mechanical', {baselineAsset: sourceRef, finalAsset: {...sourceRef, sha256: D('c')}, visualReview: {...sourceRef, kind: 'visual-review'}, visualReviewVerdict: 'pass'});
  assert.equal(validateBenchmarkMatrix(complete).valid, true);
  assert.equal(assessBenchmarkCapabilityClosure(complete, 'camera-fit').complete, true);
});

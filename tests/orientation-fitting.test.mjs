import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  applyParentLocalTransformEdits,
  createOrientationDiscrepancy,
  createOrientationPoseFitPlan,
  createPoseFitPlan,
  createSegmentPrism,
  digestBytes,
  fitOrientationPose,
  orientationFrameResidual,
  orientationPoseCandidateVectors,
  partsToGlb,
  resolveOrientedFrame,
  validateOrientationDiscrepancy,
  validateOrientationPoseFitPlan,
  validateOrientationPoseFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

test('orientation pose fitting evaluates the smallest responsible chain as a coupled candidate', async () => {
  const glb = partsToGlb({
    parts: [
      {id: 'forearm', scopeId: 'whole', materialId: 'metal', mesh: createSegmentPrism({start: [0, 0, 0], end: [0, 0, 1], width: .12, height: .12})},
      {id: 'palm', scopeId: 'whole', materialId: 'metal', mesh: createSegmentPrism({start: [0, 0, 1], end: [0, 0, 1.4], width: .2, height: .08})},
    ],
    materials: {metal: {baseColor: [.6, .6, .6, 1], roughness: .5, metallic: .4}},
  });
  const posePlan = createPoseFitPlan({
    id: 'distal-pose', scopeId: 'whole', sourceSha256: D(),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: digestBytes(glb), sizeBytes: glb.length},
    variables: [
      {id: 'forearm-twist', binding: 'assembly.node.forearm.rotation.z', minimum: -1, maximum: 1, initial: 0},
      {id: 'palm-twist', binding: 'assembly.node.palm.rotation.z', minimum: -1, maximum: 1, initial: 0},
    ],
    objectives: [{id: 'orientation-loss', goal: 'minimize', weight: 1}],
    evaluationBudget: 6,
    structuralEligibilityRequired: false,
  });
  const plan = createOrientationPoseFitPlan({
    id: 'distal-orientation-fit', posePlan, orientationEvidenceDigest: D('e'),
    chains: [{id: 'forearm-wrist-palm', terminalNodeId: 'palm', variableIds: ['forearm-twist', 'palm-twist'], evidenceRefs: ['orientation:left-palm']}],
    chainFractions: [-.5, .5, 1],
  });
  assert.equal(validateOrientationPoseFitPlan(plan).valid, true);
  const vectors = orientationPoseCandidateVectors(plan);
  assert.deepEqual(vectors[0], [0, 0]);
  assert.equal(vectors.some(([forearm, palm]) => forearm === .5 && palm === .5), true);

  const report = await fitOrientationPose(plan, {
    baselineGlb: glb,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluate: async (_candidate, context) => ({
      measurements: {'orientation-loss': (context.parameters['forearm-twist'] - .5) ** 2 + (context.parameters['palm-twist'] - .5) ** 2},
      orientationDiscrepancyDigest: D('f'),
      evidenceRefs: ['orientation:left-palm'],
    }),
  });
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.equal(report.status, 'IMPROVED');
  assert.equal(selected.parameters['forearm-twist'], .5);
  assert.equal(selected.parameters['palm-twist'], .5);
  assert.equal(report.trials.every((trial) => trial.candidateBinarySha256 === trial.baselineBinarySha256), true);
  assert.equal(validateOrientationPoseFitReport(report, plan).valid, true);
});

test('same silhouette axis can still fail terminal facing and twist evidence', () => {
  const reference = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, -1, 0]});
  const candidate = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [1, 0, 0]});
  const residual = orientationFrameResidual(reference, candidate);
  const report = createOrientationDiscrepancy({
    scopeId: 'palm', sourceSha256: D(), assetSha256: D('b'), orientationEvidenceDigest: D('c'),
    residuals: [{id: 'palm-facing', entityId: 'palm', ...residual, evidenceRefs: ['orientation:palm']}],
  });
  assert.ok(report.metrics.primaryAxisMeanRadians < 1e-10);
  assert.ok(Math.abs(report.metrics.facingMeanRadians - Math.PI / 2) < 1e-10);
  assert.ok(Math.abs(report.metrics.twistMeanRadians - Math.PI / 2) < 1e-10);
  assert.equal(report.policy.orientationMetricsCannotPassVisualGate, true);
  assert.equal(validateOrientationDiscrepancy(report).valid, true);
});

test('orientation chain plans fail closed when a terminal chain cites an unknown pose variable', () => {
  const glb = partsToGlb({parts: [{id: 'tool', scopeId: 'whole', materialId: 'm', mesh: createSegmentPrism({start: [0, 0, 0], end: [0, 0, 1], width: .1, height: .1})}], materials: {m: {baseColor: [1, 1, 1, 1], roughness: .5, metallic: 0}}});
  const posePlan = createPoseFitPlan({
    id: 'tool-pose', scopeId: 'whole', sourceSha256: D(),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'tool.glb', sha256: digestBytes(glb), sizeBytes: glb.length},
    variables: [{id: 'tool-roll', binding: 'assembly.node.tool.rotation.z', minimum: -1, maximum: 1, initial: 0}],
    evaluationBudget: 4,
  });
  assert.throws(() => createOrientationPoseFitPlan({
    id: 'bad-chain', posePlan, orientationEvidenceDigest: D('d'),
    chains: [{id: 'tool-chain', terminalNodeId: 'tool', variableIds: ['missing-roll'], evidenceRefs: ['orientation:tool']}],
  }), /unknown pose variables/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  applyParentLocalTransformEdits,
  createOrientationDiscrepancy,
  createOrientationEvidenceSet,
  createOrientationPoseFitPlan,
  createPoseFitPlan,
  createSegmentPrism,
  digestBytes,
  digestJson,
  fitOrientationPose,
  orientationFrameResidual,
  orientationPoseCandidateVectors,
  partsToGlb,
  resolveOrientedFrame,
  validateOrientationPoseFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function makeGlb() {
  return partsToGlb({
    parts: [
      {id: 'parent', scopeId: 'whole', materialId: 'm', mesh: createSegmentPrism({start: [0, 0, 0], end: [0, 0, 1], width: .12, height: .12})},
      {id: 'terminal', scopeId: 'whole', materialId: 'm', mesh: createSegmentPrism({start: [0, 0, 1], end: [0, 0, 1.4], width: .2, height: .08})},
    ],
    materials: {m: {baseColor: [.7, .7, .7, 1], roughness: .5, metallic: .2}},
  });
}

function makePlan(glb, {evaluationBudget = 8} = {}) {
  const posePlan = createPoseFitPlan({
    id: 'generic-terminal-pose', scopeId: 'whole', sourceSha256: D(),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: digestBytes(glb), sizeBytes: glb.length},
    variables: [
      {id: 'parent-twist', binding: 'assembly.node.parent.rotation.z', minimum: -1, maximum: 1, initial: 0},
      {id: 'terminal-twist', binding: 'assembly.node.terminal.rotation.z', minimum: -1, maximum: 1, initial: 0},
    ],
    objectives: [{id: 'orientation-loss', goal: 'minimize', weight: 1}],
    evaluationBudget,
  });
  return createOrientationPoseFitPlan({
    id: 'generic-terminal-orientation-fit', posePlan, orientationEvidenceDigest: D('e'),
    chains: [{id: 'parent-terminal', terminalNodeId: 'terminal', variableIds: ['parent-twist', 'terminal-twist'], evidenceRefs: ['orientation:terminal']}],
    chainFractions: [.5],
  });
}

function discrepancyFor(candidate, plan, context, {wrongCandidate = false} = {}) {
  const error = Math.abs(context.parameters['parent-twist'] - .5) + Math.abs(context.parameters['terminal-twist'] + .5);
  return createOrientationDiscrepancy({
    scopeId: plan.scopeId,
    sourceSha256: plan.sourceSha256,
    assetSha256: wrongCandidate ? D('f') : digestBytes(candidate),
    orientationEvidenceDigest: plan.orientationEvidenceDigest,
    residuals: [{
      id: 'terminal-frame', entityId: 'terminal',
      primaryAxisErrorRadians: 0,
      facingErrorRadians: Math.min(Math.PI, error),
      lateralErrorRadians: Math.min(Math.PI, error),
      twistErrorRadians: Math.min(Math.PI, error),
      evidenceRefs: ['orientation:terminal'],
    }],
    evidenceRefs: ['orientation:terminal'],
  });
}

test('same primary axis still rejects wrong terminal facing across generic asset classes', () => {
  for (const entityId of ['palm', 'foot', 'tool', 'keyed-gear']) {
    const reference = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, -1, 0]});
    const candidate = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [1, 0, 0]});
    const residual = orientationFrameResidual(reference, candidate);
    const discrepancy = createOrientationDiscrepancy({
      scopeId: entityId, sourceSha256: D(), assetSha256: D('b'), orientationEvidenceDigest: D('c'),
      residuals: [{id: `${entityId}-facing`, entityId, ...residual, evidenceRefs: [`orientation:${entityId}`]}],
    });
    assert.ok(discrepancy.metrics.primaryAxisMeanRadians < 1e-10);
    assert.ok(Math.abs(discrepancy.metrics.facingMeanRadians - Math.PI / 2) < 1e-10);
    assert.ok(discrepancy.metrics.twistMeanRadians > 1);
  }
});

test('large primary-axis mismatch produces bounded discrepancy instead of throwing', () => {
  const reference = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, 1, 0]});
  const candidate = resolveOrientedFrame({primaryAxis: [0, 1, 0], facingHint: [0, 0, 1]});
  const residual = orientationFrameResidual(reference, candidate);
  assert.ok(Math.abs(residual.primaryAxisErrorRadians - Math.PI / 2) < 1e-10);
  for (const value of Object.values(residual)) assert.ok(Number.isFinite(value) && value >= 0 && value <= Math.PI);
  assert.ok(Math.abs(residual.twistErrorRadians - Math.PI / 2) < 1e-10);
});

test('generic orientation evidence rejects anatomy-specific twist vocabulary', () => {
  assert.throws(() => createOrientationEvidenceSet({
    scopeId: 'whole', sourceSha256: D(),
    observations: [{
      id: 'terminal-orientation', entityId: 'terminal', parentId: 'parent',
      primaryAxis: {screenDirection: [1, 0]}, facing: 'downward', visiblePlane: 'broad-face-dominant',
      nearSide: null, relativeTwist: 'pronated', confidence: 'high', evidenceRefs: ['source:crop'], notes: [],
    }],
  }), /relativeTwist is invalid/);
});

test('responsible-chain search includes mixed-sign parent-child counter-rotation', () => {
  const plan = makePlan(makeGlb());
  const vectors = orientationPoseCandidateVectors(plan);
  assert.equal(vectors.some(([parent, terminal]) => parent === .5 && terminal === -.5), true);
  assert.equal(vectors.some(([parent, terminal]) => parent === -.5 && terminal === .5), true);
});

test('orientation pose fitting derives loss from exact candidate-bound discrepancy and resists re-signed report tampering', async () => {
  const glb = makeGlb(), plan = makePlan(glb);
  const report = await fitOrientationPose(plan, {
    baselineGlb: glb,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluate: async (candidate, context) => ({orientationDiscrepancy: discrepancyFor(candidate, plan, context), evidenceRefs: ['orientation:terminal']}),
  });
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.equal(report.status, 'IMPROVED');
  assert.equal(selected.parameters['parent-twist'], .5);
  assert.equal(selected.parameters['terminal-twist'], -.5);
  assert.equal(selected.measurements['orientation-loss'], 0);
  assert.equal(validateOrientationPoseFitReport(report, plan).valid, true);

  const selectedTamper = structuredClone(report);
  selectedTamper.selectedTrialId = selectedTamper.baselineTrialId;
  delete selectedTamper.reportDigest;
  selectedTamper.reportDigest = digestJson(selectedTamper);
  assert.equal(validateOrientationPoseFitReport(selectedTamper, plan).valid, false);

  const scoreTamper = structuredClone(report);
  const chosen = scoreTamper.trials.find((trial) => trial.id === scoreTamper.selectedTrialId);
  chosen.objectiveLoss += .25;
  delete scoreTamper.reportDigest;
  scoreTamper.reportDigest = digestJson(scoreTamper);
  assert.equal(validateOrientationPoseFitReport(scoreTamper, plan).valid, false);
});

test('orientation pose fitting rejects discrepancy evidence bound to the wrong candidate', async () => {
  const glb = makeGlb(), plan = makePlan(glb, {evaluationBudget: 4});
  await assert.rejects(() => fitOrientationPose(plan, {
    baselineGlb: glb,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluate: async (candidate, context) => ({orientationDiscrepancy: discrepancyFor(candidate, plan, context, {wrongCandidate: true})}),
  }), /does not bind exact candidate SHA-256/);
});

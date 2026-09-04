import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  applyParentLocalTransformEdits,
  createPoseFitPlan,
  createSegmentPrism,
  digestBytes,
  digestJson,
  fitPose,
  partsToGlb,
  validatePoseFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function ref(path, bytes) {
  return {schema: 'refas.content-reference/v1', kind: 'glb', path, sha256: digestBytes(bytes), sizeBytes: bytes.length};
}

async function fixture() {
  const baseline = partsToGlb({
    parts: [{id: 'root-part', materialId: 'wood', mesh: createSegmentPrism({start: [0,0,0], end: [0,0,1], width: .1, height: .1})}],
    materials: {wood: {baseColor: [.5,.4,.3,1]}},
  });
  const plan = createPoseFitPlan({
    id: 'pose-report-integrity', scopeId: 'whole', sourceSha256: D('a'),
    baselineAsset: ref('assets/pose.glb', baseline),
    variables: [{id: 'bend', binding: 'assembly.joint.root-part.angle', minimum: -1, maximum: 1, initial: 0}],
    evaluationBudget: 4,
  });
  const report = await fitPose(plan, {
    baselineGlb: baseline,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluate: async (_candidate, context) => ({measurements: {'pose-loss': Math.abs(context.parameters.bend - .5)}}),
  });
  return {plan, report};
}

function resign(report) {
  const copy = structuredClone(report);
  delete copy.reportDigest;
  copy.reportDigest = digestJson(copy);
  return copy;
}

test('pose report validator recomputes score and status instead of trusting a re-signed report', async () => {
  const {plan, report} = await fixture();
  assert.deepEqual(validatePoseFitReport(report, plan), {valid: true, errors: []});

  const scoreTamper = structuredClone(report);
  scoreTamper.trials.find((trial) => trial.id === scoreTamper.selectedTrialId).objectiveLoss += 1;
  const scoreValidation = validatePoseFitReport(resign(scoreTamper), plan);
  assert.equal(scoreValidation.valid, false);
  assert.match(scoreValidation.errors.join('; '), /objectiveLoss does not match measurements|selected trial is not the best structurally eligible trial/);

  const statusTamper = structuredClone(report);
  statusTamper.status = report.status === 'IMPROVED' ? 'NO_IMPROVEMENT' : 'IMPROVED';
  const statusValidation = validatePoseFitReport(resign(statusTamper), plan);
  assert.equal(statusValidation.valid, false);
  assert.match(statusValidation.errors.join('; '), /status does not match selected improvement/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createParameterFitPlan,
  createRelationalDiscrepancy,
  createRelationalStructure,
  digestBytes,
  fitParameters,
  validateParameterFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);
const reference = (path, kind = 'fixture') => ({
  schema: 'refas.content-reference/v1', kind, path,
  sha256: digestBytes(path), sizeBytes: Buffer.byteLength(path),
});
const verifyReference = async () => true;

function relationalStructure(range = [0, 1]) {
  return createRelationalStructure({
    scopeId: 'whole', sourceSha256: D('a'),
    entities: [
      {id: 'landmark-a', kind: 'landmark'}, {id: 'landmark-b', kind: 'landmark'},
      {id: 'landmark-c', kind: 'landmark'}, {id: 'landmark-d', kind: 'landmark'},
    ],
    relations: [{
      id: 'span-ratio', kind: 'distance-ratio', scope: 'whole-system', importance: 'macro',
      entityIds: ['landmark-a', 'landmark-b', 'landmark-c', 'landmark-d'], range, basisRefs: ['source:front'],
    }],
  });
}

function relationalPlan(structure) {
  return createParameterFitPlan({
    id: 'relational-shape-fit', scopeId: 'whole', sourceSha256: D('a'), baselineAsset: reference('assets/baseline.glb', 'glb'),
    parameters: [
      {id: 'span', binding: 'model.shape.span', kind: 'integer', minimum: 0, maximum: 3, initial: 0},
      {id: 'bend', binding: 'model.shape.bend', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
    ],
    objectives: [{id: 'shape-error', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 3, populationSize: 8, evaluationBudget: 8, patience: 8, initializationAttemptBudget: 16},
    relationalEligibilityRequired: true,
    relationalStructureDigest: structure.structureDigest,
    evidenceRefs: ['source:reference'],
  });
}

function candidateFor(context) {
  return context.phase === 'baseline' ? reference('assets/baseline.glb', 'glb') : reference(`trials/${context.trialId}/candidate.glb`, 'glb');
}

function evaluated(parameters, context, structure) {
  const candidateAsset = candidateFor(context);
  const relationalDiscrepancy = createRelationalDiscrepancy({
    relationalStructure: structure,
    candidateAssetSha256: candidateAsset.sha256,
    observations: [{relationId: 'span-ratio', value: parameters.span, evidenceRefs: [`proof:${context.trialId}`]}],
  });
  return {
    measurements: {'shape-error': (parameters.span - 3) ** 2 + parameters.bend ** 2},
    candidateAsset,
    renderEvidence: reference(`trials/${context.trialId}/render-report.json`, 'render-report'),
    relationalDiscrepancy,
    evidenceRefs: [`trials/${context.trialId}/hero.png`],
  };
}

test('a lower-loss candidate cannot win when whole-system relations fail', async () => {
  const structure = relationalStructure();
  const plan = relationalPlan(structure);
  const report = await fitParameters(plan, async (parameters, context) => evaluated(parameters, context, structure), {verifyReference});
  assert.deepEqual(validateParameterFitReport(report, plan), {valid: true, errors: []});
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.equal(selected.parameters.span, 1);
  assert.equal(selected.relationalDiscrepancy.eligible, true);
  const visuallyBest = report.trials.find((trial) => trial.parameters.span === 3 && trial.parameters.bend === 0);
  assert.ok(visuallyBest);
  assert.equal(visuallyBest.objectiveLoss, 0);
  assert.equal(visuallyBest.relationalDiscrepancy.eligible, false);
  assert.equal(visuallyBest.eligible, false);
  assert.ok(visuallyBest.objectiveLoss < selected.objectiveLoss);
  assert.equal(report.policy.relationalInvalidityIsHardBarrier, true);
  assert.equal(report.policy.relationalInvalidityIsNeverScorePenalty, true);
});

test('relationally gated plans fail closed when evaluator evidence is missing', async () => {
  const structure = relationalStructure();
  const plan = relationalPlan(structure);
  await assert.rejects(() => fitParameters(plan, async (parameters, context) => {
    const candidateAsset = candidateFor(context);
    return {
      measurements: {'shape-error': parameters.span + parameters.bend},
      candidateAsset,
      renderEvidence: reference(`trials/${context.trialId}/render-report.json`, 'render-report'),
      evidenceRefs: ['hero'],
    };
  }, {verifyReference}), /relational discrepancy is required by the fit plan/);
});

test('relational discrepancy must bind both exact candidate bytes and the planned relation graph', async () => {
  const structure = relationalStructure();
  const plan = relationalPlan(structure);
  await assert.rejects(() => fitParameters(plan, async (parameters, context) => {
    const result = evaluated(parameters, context, structure);
    result.relationalDiscrepancy = createRelationalDiscrepancy({
      relationalStructure: structure,
      candidateAssetSha256: D('f'),
      observations: [{relationId: 'span-ratio', value: parameters.span, evidenceRefs: ['proof:wrong-candidate']}],
    });
    return result;
  }, {verifyReference}), /does not bind candidateAsset SHA-256/);

  const otherStructure = relationalStructure([0, 2]);
  await assert.rejects(() => fitParameters(plan, async (parameters, context) => evaluated(parameters, context, otherStructure), {verifyReference}), /does not bind the plan relationalStructureDigest/);
});

test('legacy fit plans remain canonical when no relational gate is requested', async () => {
  const plan = createParameterFitPlan({
    id: 'legacy-shape-fit', scopeId: 'whole', sourceSha256: D('a'), baselineAsset: reference('assets/baseline.glb', 'glb'),
    parameters: [
      {id: 'span', binding: 'model.shape.span', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
      {id: 'bend', binding: 'model.shape.bend', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
    ],
    objectives: [{id: 'shape-error', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 2, populationSize: 4, evaluationBudget: 5, patience: 4, initializationAttemptBudget: 8},
  });
  assert.equal(Object.hasOwn(plan, 'relationalEligibilityRequired'), false);
  assert.equal(Object.hasOwn(plan.policy, 'relationalInvalidityIsHardBarrier'), false);
  const report = await fitParameters(plan, async (parameters, context) => ({
    measurements: {'shape-error': parameters.span + parameters.bend},
    candidateAsset: candidateFor(context),
    renderEvidence: reference(`trials/${context.trialId}/render-report.json`, 'render-report'),
    evidenceRefs: ['hero'],
  }), {verifyReference});
  assert.deepEqual(validateParameterFitReport(report, plan), {valid: true, errors: []});
  assert.ok(report.trials.every((trial) => !Object.hasOwn(trial, 'relationalDiscrepancy')));
});

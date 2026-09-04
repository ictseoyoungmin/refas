import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createParameterFitPlan,
  digestBytes,
  digestJson,
  fitParameters,
  validateParameterFitPlan,
  validateParameterFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character) => character.repeat(64);
const reference = (path, kind = 'fixture') => ({
  schema: 'refas.content-reference/v1', kind, path,
  sha256: digestBytes(path), sizeBytes: Buffer.byteLength(path),
});

function plan(overrides = {}) {
  return createParameterFitPlan({
    id: 'coupled-shape-fit', scopeId: 'whole', sourceSha256: D('a'), baselineAsset: reference('assets/baseline.glb', 'glb'),
    parameters: [
      {id: 'span', binding: 'model.shape.span', minimum: -4, maximum: 4, initial: -3, evidenceRefs: ['model/reference-geometry.json']},
      {id: 'bend', binding: 'model.shape.bend', minimum: -4, maximum: 4, initial: 3, evidenceRefs: ['model/reference-geometry.json']},
    ],
    objectives: [{id: 'shape-error', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 9, populationSize: 16, evaluationBudget: 240, patience: 200},
    evidenceRefs: ['source/reference.png'],
    ...overrides,
  });
}

const evidence = (context, measurements) => ({
  measurements,
  candidateAsset: context.phase === 'baseline' ? reference('assets/baseline.glb', 'glb') : reference(`trials/${context.trialId}/candidate.glb`, 'glb'),
  renderEvidence: reference(`trials/${context.trialId}/render-report.json`, 'render-report'),
  evidenceRefs: [`trials/${context.trialId}/hero.png`],
});
const verifyReference = async () => true;

test('joint differential evolution improves coupled geometry parameters deterministically', async () => {
  const input = plan();
  const evaluate = async (parameters, context) => evidence(context, {
    'shape-error': (parameters.span - 1.25) ** 2 + (parameters.bend + 0.75) ** 2 + 0.4 * (parameters.span + parameters.bend - 0.5) ** 2,
  });
  const first = await fitParameters(input, evaluate, {verifyReference});
  const second = await fitParameters(input, evaluate, {verifyReference});
  const selected = first.trials.find((trial) => trial.id === first.selectedTrialId);
  assert.equal(first.status, 'IMPROVED');
  assert.ok(selected.measurements['shape-error'] < 0.01, JSON.stringify(selected));
  assert.ok(Math.abs(selected.parameters.span - input.parameters[0].initial) > 1);
  assert.ok(Math.abs(selected.parameters.bend - input.parameters[1].initial) > 1);
  assert.deepEqual(second, first, 'fixed seed and evaluator must produce a byte-stable report');
  assert.deepEqual(validateParameterFitReport(first, input), {valid: true, errors: []});
  assert.equal(first.policy.selectionAuthority, 'candidate-ranking-only');
  assert.equal(first.policy.metricsCannotSelectOwner, true);
  assert.equal(first.policy.metricsCannotPassVisualGate, true);
  assert.equal(first.policy.fitCannotMutateProjectState, true);
});

test('baseline trial cannot score a candidate different from the plan baseline asset', async () => {
  const input = plan({optimizer: {seed: 3, populationSize: 4, evaluationBudget: 5, patience: 2}});
  await assert.rejects(() => fitParameters(input, async (parameters, context) => ({
    ...evidence(context, {'shape-error': parameters.span ** 2 + parameters.bend ** 2}),
    candidateAsset: reference('trials/not-the-baseline.glb', 'glb'),
  }), {verifyReference}), /trial-0001 candidateAsset must match plan\.baselineAsset SHA-256/);
});

test('protected measurements reject regressions while another geometry parameter improves', async () => {
  const input = plan({
    parameters: [
      {id: 'span', binding: 'model.shape.span', minimum: 0, maximum: 4, initial: 0},
      {id: 'depth', binding: 'model.shape.depth', kind: 'integer', minimum: 1, maximum: 2, initial: 1},
    ],
    objectives: [
      {id: 'shape-error', goal: 'minimize', scale: 1, weight: 1},
      {id: 'side-error', goal: 'minimize', scale: 1, weight: 0.01},
    ],
    protectedTerms: [{id: 'side-error', goal: 'minimize', maxRegression: 0}],
    optimizer: {seed: 4, populationSize: 10, evaluationBudget: 100, patience: 40},
  });
  const report = await fitParameters(input, async (parameters, context) => evidence(context, {
    'shape-error': (parameters.span - 2.5) ** 2,
    'side-error': parameters.depth - 1,
  }), {verifyReference});
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.equal(selected.parameters.depth, 1);
  assert.ok(Math.abs(selected.parameters.span - 2.5) < 0.15);
  assert.ok(report.trials.some((trial) => !trial.eligible && trial.protectedRegressions.some((item) => item.id === 'side-error')));
});

test('finite integer search spaces terminate population initialization', async () => {
  const input = plan({
    parameters: [
      {id: 'span', binding: 'model.shape.span', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
      {id: 'bend', binding: 'model.shape.bend', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
    ],
    optimizer: {seed: 5, populationSize: 8, evaluationBudget: 9, patience: 4, initializationAttemptBudget: 8},
  });
  const report = await fitParameters(input, async (parameters, context) => evidence(context, {
    'shape-error': parameters.span + parameters.bend,
  }), {verifyReference});
  assert.ok(report.evaluationCount <= input.optimizer.evaluationBudget);
  assert.ok(report.trials.length >= 4);
  assert.ok(['evaluation-budget', 'search-space-exhausted'].includes(report.stopReason));
});

test('plans fail closed on cross-owner parameters and malformed evaluator evidence', async () => {
  assert.throws(() => plan({parameters: [
    {id: 'span', binding: 'model.shape.span', minimum: 0, maximum: 2, initial: 1},
    {id: 'camera-yaw', binding: 'camera.yaw', ownerCapability: 'spatial-hypotheses', minimum: -1, maximum: 1, initial: 0},
  ]}), /one fit plan may contain only shape-reconstruction parameters/);
  assert.throws(() => plan({parameters: [
    {id: 'span', binding: 'model.shape.span', minimum: 2, maximum: 1, initial: 1.5},
    {id: 'bend', binding: 'model.shape.bend', minimum: 0, maximum: 1, initial: 0.5},
  ]}), /maximum must be greater/);
  const input = plan({optimizer: {seed: 1, populationSize: 4, evaluationBudget: 5, patience: 2}});
  await assert.rejects(() => fitParameters(input, async () => ({})), /verifyReference must verify exact artifact bytes/);
  await assert.rejects(() => fitParameters(input, async () => ({measurements: {'shape-error': 1}}), {verifyReference}), /candidateAsset must be a refas.content-reference/);
});

test('fit publication re-verifies retained trial bytes', async () => {
  const input = plan({optimizer: {seed: 1, populationSize: 4, evaluationBudget: 5, patience: 2}});
  await assert.rejects(() => fitParameters(input, async (parameters, context) => evidence(context, {
    'shape-error': parameters.span ** 2 + parameters.bend ** 2,
  }), {verifyReference: async (_reference, label) => {
    if (label.endsWith('.final')) throw new Error('retained bytes changed');
  }}), /retained bytes changed/);
});

test('plan and report digest tampering is detected', async () => {
  const input = plan({optimizer: {seed: 2, populationSize: 4, evaluationBudget: 5, patience: 2}});
  const alteredPlan = structuredClone(input); alteredPlan.parameters[0].initial += 0.1;
  assert.equal(validateParameterFitPlan(alteredPlan).valid, false);
  const report = await fitParameters(input, async (parameters, context) => evidence(context, {
    'shape-error': parameters.span ** 2 + parameters.bend ** 2,
  }), {verifyReference});
  const alteredReport = structuredClone(report); alteredReport.trials[0].parameters.span += 0.1;
  assert.equal(validateParameterFitReport(alteredReport, input).valid, false);
  const forgedBaseline = structuredClone(report);
  forgedBaseline.trials[0].candidateAsset = {...forgedBaseline.trials[0].candidateAsset, sha256: D('e')};
  delete forgedBaseline.reportDigest;
  forgedBaseline.reportDigest = digestJson(forgedBaseline);
  assert.match(validateParameterFitReport(forgedBaseline, input).errors.join('; '), /candidateAsset must match baselineAsset SHA-256/);
  const forgedSelection = structuredClone(report);
  forgedSelection.selectedTrialId = forgedSelection.baselineTrialId;
  delete forgedSelection.reportDigest;
  forgedSelection.reportDigest = digestJson(forgedSelection);
  assert.match(validateParameterFitReport(forgedSelection, input).errors.join('; '), /selected trial is not the best structurally eligible ranked trial/);
});

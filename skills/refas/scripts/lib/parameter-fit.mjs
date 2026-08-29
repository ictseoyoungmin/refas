import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const PARAMETER_FIT_PLAN_SCHEMA = 'refas.parameter-fit-plan/v1';
export const PARAMETER_FIT_REPORT_SCHEMA = 'refas.parameter-fit-report/v1';

const ALGORITHM = 'differential-evolution';
const OWNER = 'shape-reconstruction';

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function normalizeContentReference(value, label) {
  if (value?.schema !== 'refas.content-reference/v1') throw new Error(`${label} must be a refas.content-reference/v1`);
  const sizeBytes = Number(value.sizeBytes);
  const portablePath = String(value.path ?? '');
  const kind = String(value.kind ?? 'artifact').trim();
  if (!portablePath || portablePath.startsWith('/') || /^[A-Za-z]:/u.test(portablePath) || portablePath.includes('\\') || portablePath.split('/').includes('..')) throw new Error(`${label}.path must be a project-relative portable path`);
  if (!kind) throw new Error(`${label}.kind is required`);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) throw new Error(`${label} requires path and non-negative integer sizeBytes`);
  return {
    schema: 'refas.content-reference/v1',
    kind,
    path: portablePath,
    sha256: assertDigest(value.sha256, `${label}.sha256`),
    sizeBytes,
  };
}

function normalizeParameter(raw, index) {
  const label = `parameters[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const kind = String(raw?.kind ?? 'continuous');
  if (!['continuous', 'integer'].includes(kind)) throw new Error(`${label}.kind must be continuous or integer`);
  const minimum = finite(raw?.minimum, `${label}.minimum`);
  const maximum = finite(raw?.maximum, `${label}.maximum`);
  const initial = finite(raw?.initial, `${label}.initial`);
  if (!(maximum > minimum)) throw new Error(`${label} maximum must be greater than minimum`);
  if (initial < minimum || initial > maximum) throw new Error(`${label} initial must remain inside bounds`);
  if (kind === 'integer' && ![minimum, maximum, initial].every(Number.isInteger)) throw new Error(`${label} integer bounds and initial must be integers`);
  if (raw?.ownerCapability != null && raw.ownerCapability !== OWNER) throw new Error(`${label} belongs to ${raw.ownerCapability}; one fit plan may contain only ${OWNER} parameters`);
  const binding = String(raw?.binding ?? '').trim();
  if (!binding) throw new Error(`${label}.binding is required`);
  return {id, binding, ownerCapability: OWNER, kind, minimum, maximum, initial, evidenceRefs: uniqueStrings(raw?.evidenceRefs)};
}

function normalizeObjective(raw, index) {
  const label = `objectives[${index}]`;
  const goal = String(raw?.goal ?? 'minimize');
  if (!['minimize', 'maximize', 'target'].includes(goal)) throw new Error(`${label}.goal is invalid`);
  const scale = finite(raw?.scale ?? 1, `${label}.scale`);
  const weight = finite(raw?.weight ?? 1, `${label}.weight`);
  if (!(scale > 0) || !(weight > 0)) throw new Error(`${label} scale and weight must be positive`);
  const objective = {id: assertId(raw?.id, `${label}.id`), goal, scale, weight};
  if (goal === 'target') objective.target = finite(raw?.target, `${label}.target`);
  return objective;
}

function normalizeProtected(raw, index) {
  const label = `protectedTerms[${index}]`;
  const goal = String(raw?.goal ?? 'minimize');
  if (!['minimize', 'maximize'].includes(goal)) throw new Error(`${label}.goal must be minimize or maximize`);
  const maxRegression = finite(raw?.maxRegression ?? 0, `${label}.maxRegression`);
  if (maxRegression < 0) throw new Error(`${label}.maxRegression must be non-negative`);
  return {id: assertId(raw?.id, `${label}.id`), goal, maxRegression};
}

function normalizeOptimizer(raw = {}, parameterCount) {
  const seed = Number(raw.seed ?? 1);
  const populationSize = Number(raw.populationSize ?? Math.max(8, parameterCount * 6));
  const evaluationBudget = Number(raw.evaluationBudget ?? Math.max(40, populationSize * 5));
  const differentialWeight = finite(raw.differentialWeight ?? 0.8, 'optimizer.differentialWeight');
  const crossoverRate = finite(raw.crossoverRate ?? 0.9, 'optimizer.crossoverRate');
  const improvementTolerance = finite(raw.improvementTolerance ?? 1e-6, 'optimizer.improvementTolerance');
  const patience = Number(raw.patience ?? Math.max(populationSize * 2, 12));
  const initializationAttemptBudget = Number(raw.initializationAttemptBudget ?? Math.max(populationSize * 32, 64));
  if (String(raw.algorithm ?? ALGORITHM) !== ALGORITHM) throw new Error(`optimizer.algorithm must be ${ALGORITHM}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('optimizer.seed must be an unsigned 32-bit integer');
  if (!Number.isInteger(populationSize) || populationSize < 4) throw new Error('optimizer.populationSize must be at least 4');
  if (!Number.isInteger(evaluationBudget) || evaluationBudget < populationSize + 1) throw new Error('optimizer.evaluationBudget must cover baseline plus the population');
  if (!(differentialWeight > 0 && differentialWeight <= 2)) throw new Error('optimizer.differentialWeight must be in (0, 2]');
  if (!(crossoverRate > 0 && crossoverRate <= 1)) throw new Error('optimizer.crossoverRate must be in (0, 1]');
  if (improvementTolerance < 0) throw new Error('optimizer.improvementTolerance must be non-negative');
  if (!Number.isInteger(patience) || patience < 1) throw new Error('optimizer.patience must be a positive integer');
  if (!Number.isInteger(initializationAttemptBudget) || initializationAttemptBudget < 1) throw new Error('optimizer.initializationAttemptBudget must be a positive integer');
  return {algorithm: ALGORITHM, seed, populationSize, evaluationBudget, differentialWeight, crossoverRate, improvementTolerance, patience, initializationAttemptBudget};
}

export function createParameterFitPlan({
  id,
  scopeId,
  sourceSha256,
  baselineAsset,
  parameters = [],
  objectives = [],
  protectedTerms = [],
  optimizer = {},
  evidenceRefs = [],
} = {}) {
  if (parameters.length < 2) throw new Error('joint parameter fitting requires at least two parameters');
  if (!objectives.length) throw new Error('at least one objective is required');
  const normalizedParameters = parameters.map(normalizeParameter);
  const normalizedObjectives = objectives.map(normalizeObjective);
  const normalizedProtected = protectedTerms.map(normalizeProtected);
  for (const [label, values] of [['parameter', normalizedParameters], ['objective', normalizedObjectives], ['protected term', normalizedProtected]]) {
    const ids = values.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`${label} IDs must be unique`);
  }
  const objectiveIds = new Set(normalizedObjectives.map((item) => item.id));
  for (const item of normalizedProtected) if (!objectiveIds.has(item.id)) throw new Error(`protected term ${item.id} must also be an objective measurement`);
  const payload = {
    schema: PARAMETER_FIT_PLAN_SCHEMA,
    id: assertId(id, 'id'),
    ownerCapability: OWNER,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    baselineAsset: normalizeContentReference(baselineAsset, 'baselineAsset'),
    parameters: normalizedParameters,
    objectives: normalizedObjectives,
    protectedTerms: normalizedProtected,
    optimizer: normalizeOptimizer(optimizer, normalizedParameters.length),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      selectionAuthority: 'candidate-ranking-only',
      metricsCannotSelectOwner: true,
      metricsCannotPassVisualGate: true,
      fitCannotMutateProjectState: true,
      selectedTrialRequiresActualVisualReview: true,
      oneCheckpointCandidateAfterSelection: true,
      trialContentReferencesMustVerify: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateParameterFitPlan(plan) {
  const errors = [];
  try {
    const recreated = createParameterFitPlan(plan);
    assertDigest(plan?.planDigest, 'planDigest');
    if (recreated.planDigest !== plan.planDigest) errors.push('parameter fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(plan)) errors.push('parameter fit plan is not in canonical normalized form');
    if (plan?.ownerCapability !== OWNER) errors.push(`parameter fit plan owner must be ${OWNER}`);
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function decodeVector(vector, parameters) {
  return Object.fromEntries(parameters.map((parameter, index) => {
    let value = Math.min(parameter.maximum, Math.max(parameter.minimum, vector[index]));
    if (parameter.kind === 'integer') value = Math.round(value);
    return [parameter.id, value];
  }));
}

function encodeParameters(values, parameters) {
  return parameters.map((parameter) => finite(values[parameter.id], `parameters.${parameter.id}`));
}

function vectorKey(vector) {
  return vector.map((value) => Number(value).toPrecision(15)).join('|');
}

function finiteIntegerSearchSpaceCardinality(parameters) {
  if (parameters.some((parameter) => parameter.kind !== 'integer')) return null;
  let cardinality = 1;
  for (const parameter of parameters) {
    cardinality *= parameter.maximum - parameter.minimum + 1;
    if (cardinality > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return cardinality;
}

function integerVectorAt(index, parameters) {
  let cursor = index;
  return parameters.map((parameter) => {
    const cardinality = parameter.maximum - parameter.minimum + 1;
    const value = parameter.minimum + (cursor % cardinality);
    cursor = Math.floor(cursor / cardinality);
    return value;
  });
}

function objectiveContribution(value, objective) {
  if (objective.goal === 'target') return Math.abs(value - objective.target) / objective.scale * objective.weight;
  const signed = value / objective.scale * objective.weight;
  return objective.goal === 'minimize' ? signed : -signed;
}

function scoreMeasurements(measurements, plan, baselineMeasurements) {
  const normalized = {};
  const decomposition = [];
  let objectiveLoss = 0;
  for (const objective of plan.objectives) {
    const value = finite(measurements?.[objective.id], `measurements.${objective.id}`);
    normalized[objective.id] = value;
    const contribution = objectiveContribution(value, objective);
    decomposition.push({id: objective.id, value, contribution});
    objectiveLoss += contribution;
  }
  const protectedRegressions = [];
  if (baselineMeasurements) for (const term of plan.protectedTerms) {
    const baseline = baselineMeasurements[term.id], value = normalized[term.id];
    const regression = term.goal === 'minimize' ? value - baseline : baseline - value;
    if (regression > term.maxRegression + 1e-12) protectedRegressions.push({id: term.id, baseline, value, regression, maxRegression: term.maxRegression});
  }
  return {measurements: normalized, decomposition, objectiveLoss, eligible: protectedRegressions.length === 0, protectedRegressions};
}

function compareTrials(a, b) {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.objectiveLoss !== b.objectiveLoss) return a.objectiveLoss - b.objectiveLoss;
  return a.sequence - b.sequence;
}

function normalizeEvaluation(raw, label) {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} evaluator result must be an object`);
  return {
    measurements: raw.measurements,
    candidateAsset: normalizeContentReference(raw.candidateAsset, `${label}.candidateAsset`),
    renderEvidence: normalizeContentReference(raw.renderEvidence, `${label}.renderEvidence`),
    evidenceRefs: uniqueStrings(raw.evidenceRefs),
  };
}

export async function fitParameters(plan, evaluate, {verifyReference} = {}) {
  const validation = validateParameterFitPlan(plan);
  if (!validation.valid) throw new Error(`parameter fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof evaluate !== 'function') throw new Error('evaluate must be a function');
  if (typeof verifyReference !== 'function') throw new Error('verifyReference must verify exact artifact bytes before fitting');
  await verifyReference(plan.baselineAsset, 'baselineAsset');
  const random = mulberry32(plan.optimizer.seed);
  const trials = [];
  const seen = new Set();
  let baselineMeasurements = null;
  let bestImprovementSequence = 0;
  let bestLoss = null;

  const run = async (values, phase, generation) => {
    const parameters = decodeVector(values, plan.parameters);
    const vector = encodeParameters(parameters, plan.parameters);
    const key = vectorKey(vector);
    if (seen.has(key)) return null;
    seen.add(key);
    const sequence = trials.length + 1;
    const id = `trial-${String(sequence).padStart(4, '0')}`;
    let raw;
    try {
      raw = await evaluate(deepFreeze({...parameters}), deepFreeze({trialId: id, sequence, phase, generation, planDigest: plan.planDigest}));
    } catch (error) {
      throw new Error(`${id} evaluator failed: ${error.message}`);
    }
    const result = normalizeEvaluation(raw, id);
    await verifyReference(result.candidateAsset, `${id}.candidateAsset`);
    await verifyReference(result.renderEvidence, `${id}.renderEvidence`);
    const score = scoreMeasurements(result.measurements, plan, baselineMeasurements);
    if (sequence === 1) baselineMeasurements = score.measurements;
    const trial = deepFreeze({
      id, sequence, phase, generation, parameters, ...score,
      candidateAsset: result.candidateAsset,
      renderEvidence: result.renderEvidence,
      evidenceRefs: result.evidenceRefs,
    });
    trials.push(trial);
    if (trial.eligible && (bestLoss == null || trial.objectiveLoss < bestLoss - plan.optimizer.improvementTolerance)) {
      bestLoss = trial.objectiveLoss;
      bestImprovementSequence = sequence;
    }
    return {trial, vector};
  };

  const initial = plan.parameters.map((parameter) => parameter.initial);
  const baseline = await run(initial, 'baseline', 0);
  const population = [baseline];
  const cardinality = finiteIntegerSearchSpaceCardinality(plan.parameters);
  const populationTarget = cardinality == null ? plan.optimizer.populationSize : Math.min(plan.optimizer.populationSize, cardinality);
  let initializationAttempts = 0;
  while (population.length < populationTarget && trials.length < plan.optimizer.evaluationBudget && initializationAttempts < plan.optimizer.initializationAttemptBudget) {
    initializationAttempts += 1;
    const vector = cardinality == null
      ? plan.parameters.map((parameter) => parameter.minimum + random() * (parameter.maximum - parameter.minimum))
      : integerVectorAt(initializationAttempts - 1, plan.parameters);
    const evaluated = await run(vector, 'population', 0);
    if (evaluated) population.push(evaluated);
  }
  if (population.length < 4) throw new Error('parameter search space was exhausted before four unique candidates could be initialized');

  let generation = 1;
  let stopReason = 'evaluation-budget';
  while (trials.length < plan.optimizer.evaluationBudget) {
    let evaluatedInGeneration = 0;
    for (let index = 0; index < population.length && trials.length < plan.optimizer.evaluationBudget; index += 1) {
      const choices = [...population.keys()].filter((choice) => choice !== index);
      for (let cursor = choices.length - 1; cursor > 0; cursor -= 1) {
        const swap = Math.floor(random() * (cursor + 1));
        [choices[cursor], choices[swap]] = [choices[swap], choices[cursor]];
      }
      const [a, b, c] = choices.slice(0, 3).map((choice) => population[choice].vector);
      const forced = Math.floor(random() * plan.parameters.length);
      const target = population[index].vector;
      const vector = target.map((value, dimension) => {
        if (dimension !== forced && random() > plan.optimizer.crossoverRate) return value;
        const parameter = plan.parameters[dimension];
        return Math.min(parameter.maximum, Math.max(parameter.minimum, a[dimension] + plan.optimizer.differentialWeight * (b[dimension] - c[dimension])));
      });
      const evaluated = await run(vector, 'evolution', generation);
      if (!evaluated) continue;
      evaluatedInGeneration += 1;
      if (compareTrials(evaluated.trial, population[index].trial) < 0) population[index] = evaluated;
      if (trials.length - bestImprovementSequence >= plan.optimizer.patience) {
        stopReason = 'patience';
        break;
      }
    }
    if (stopReason === 'patience') break;
    if (!evaluatedInGeneration) { stopReason = 'search-space-exhausted'; break; }
    generation += 1;
  }

  await verifyReference(plan.baselineAsset, 'baselineAsset.final');
  for (const trial of trials) {
    await verifyReference(trial.candidateAsset, `${trial.id}.candidateAsset.final`);
    await verifyReference(trial.renderEvidence, `${trial.id}.renderEvidence.final`);
  }

  const ordered = [...trials].sort(compareTrials);
  const selected = ordered[0];
  const baselineTrial = trials[0];
  const improvement = baselineTrial.objectiveLoss - selected.objectiveLoss;
  const payload = {
    schema: PARAMETER_FIT_REPORT_SCHEMA,
    plan,
    planDigest: plan.planDigest,
    ownerCapability: OWNER,
    scopeId: plan.scopeId,
    sourceSha256: plan.sourceSha256,
    baselineAssetSha256: plan.baselineAsset.sha256,
    optimizer: plan.optimizer,
    status: selected.id !== baselineTrial.id && improvement > plan.optimizer.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT',
    stopReason,
    evaluationCount: trials.length,
    baselineTrialId: baselineTrial.id,
    selectedTrialId: selected.id,
    objectiveImprovement: improvement,
    trials,
    policy: plan.policy,
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateParameterFitReport(report, plan = null) {
  const errors = [];
  try {
    if (report?.schema !== PARAMETER_FIT_REPORT_SCHEMA) errors.push('invalid schema');
    assertDigest(report?.planDigest, 'planDigest');
    assertDigest(report?.sourceSha256, 'sourceSha256');
    assertDigest(report?.baselineAssetSha256, 'baselineAssetSha256');
    assertDigest(report?.reportDigest, 'reportDigest');
    if (report?.ownerCapability !== OWNER) errors.push(`report owner must be ${OWNER}`);
    if (!['IMPROVED', 'NO_IMPROVEMENT'].includes(report?.status)) errors.push('invalid status');
    if (!Number.isFinite(report?.objectiveImprovement)) errors.push('objectiveImprovement must be finite');
    if (!['evaluation-budget', 'patience', 'search-space-exhausted'].includes(report?.stopReason)) errors.push('invalid stopReason');
    if (!Array.isArray(report?.trials) || !report.trials.length || report.evaluationCount !== report.trials.length) errors.push('trial ledger is missing or incomplete');
    const ids = new Set(report?.trials?.map((trial) => trial.id));
    if (!ids.has(report?.baselineTrialId) || !ids.has(report?.selectedTrialId)) errors.push('baseline or selected trial is missing');
    for (const trial of report?.trials ?? []) {
      if (!Number.isFinite(trial.objectiveLoss)) errors.push(`${trial.id} has invalid objectiveLoss`);
      if (!['baseline', 'population', 'evolution'].includes(trial.phase) || !Number.isInteger(trial.generation) || trial.generation < 0) errors.push(`${trial.id} has invalid phase or generation`);
      const candidate = normalizeContentReference(trial.candidateAsset, `${trial.id}.candidateAsset`);
      const render = normalizeContentReference(trial.renderEvidence, `${trial.id}.renderEvidence`);
      if (digestJson(candidate) !== digestJson(trial.candidateAsset) || digestJson(render) !== digestJson(trial.renderEvidence)) errors.push(`${trial.id} content references are not canonical`);
    }
    const policy = report?.policy ?? {};
    if (policy.selectionAuthority !== 'candidate-ranking-only' || policy.metricsCannotSelectOwner !== true || policy.metricsCannotPassVisualGate !== true || policy.fitCannotMutateProjectState !== true || policy.selectedTrialRequiresActualVisualReview !== true || policy.oneCheckpointCandidateAfterSelection !== true || policy.trialContentReferencesMustVerify !== true) errors.push('parameter-fit authority policy is missing');
    const embeddedPlan = report?.plan;
    if (!embeddedPlan) errors.push('report must embed its exact normalized plan');
    else {
      const embeddedValidation = validateParameterFitPlan(embeddedPlan);
      if (!embeddedValidation.valid) errors.push(`embedded plan is invalid: ${embeddedValidation.errors.join('; ')}`);
      if (report.planDigest !== embeddedPlan.planDigest) errors.push('report does not bind its embedded plan');
    }
    if (plan && embeddedPlan && plan.planDigest !== embeddedPlan.planDigest) errors.push('embedded plan does not match the supplied plan');
    const boundPlan = embeddedPlan ?? plan;
    if (boundPlan) {
      const planValidation = validateParameterFitPlan(boundPlan);
      if (!planValidation.valid) errors.push(`plan is invalid: ${planValidation.errors.join('; ')}`);
      if (report.planDigest !== boundPlan.planDigest) errors.push('report does not bind the supplied plan');
      if (report.sourceSha256 !== boundPlan.sourceSha256 || report.scopeId !== boundPlan.scopeId) errors.push('report source or scope does not match the supplied plan');
      if (report.baselineAssetSha256 !== boundPlan.baselineAsset.sha256) errors.push('report baseline asset does not match the plan');
      if (digestJson(report.optimizer) !== digestJson(boundPlan.optimizer)) errors.push('report optimizer does not match the plan');
      if (digestJson(report.policy) !== digestJson(boundPlan.policy)) errors.push('report policy does not match the plan');
      if (report.evaluationCount > boundPlan.optimizer.evaluationBudget) errors.push('report exceeds the plan evaluation budget');
      if (report.stopReason === 'evaluation-budget' && report.evaluationCount !== boundPlan.optimizer.evaluationBudget) errors.push('evaluation-budget stop must consume the declared budget');
      const baseline = report.trials?.find((trial) => trial.id === report.baselineTrialId);
      const selected = report.trials?.find((trial) => trial.id === report.selectedTrialId);
      if (baseline && selected) {
        if (baseline.sequence !== 1 || baseline.phase !== 'baseline') errors.push('baseline trial must be the first evaluated trial');
        const expected = [...report.trials].sort(compareTrials)[0];
        if (selected.id !== expected.id) errors.push('selected trial is not the best eligible ranked trial');
        const improvement = baseline.objectiveLoss - selected.objectiveLoss;
        if (Math.abs(improvement - report.objectiveImprovement) > 1e-10) errors.push('objectiveImprovement does not match baseline and selected trials');
        const expectedStatus = selected.id !== baseline.id && improvement > boundPlan.optimizer.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
        if (report.status !== expectedStatus) errors.push('status does not match selected improvement');
      }
      const parameterById = new Map(boundPlan.parameters.map((item) => [item.id, item]));
      const objectiveIds = new Set(boundPlan.objectives.map((item) => item.id));
      const trialIds = new Set();
      for (const [index, trial] of (report.trials ?? []).entries()) {
        if (trialIds.has(trial.id)) errors.push(`duplicate trial ID: ${trial.id}`); else trialIds.add(trial.id);
        if (trial.sequence !== index + 1) errors.push(`${trial.id} sequence is not contiguous`);
        if (new Set(Object.keys(trial.parameters ?? {})).size !== parameterById.size) errors.push(`${trial.id} parameter set is incomplete`);
        for (const [id, value] of Object.entries(trial.parameters ?? {})) {
          const parameter = parameterById.get(id);
          if (!parameter || !Number.isFinite(value) || value < parameter.minimum || value > parameter.maximum || (parameter.kind === 'integer' && !Number.isInteger(value))) errors.push(`${trial.id} parameter ${id} violates the plan`);
        }
        if (new Set(Object.keys(trial.measurements ?? {})).size !== objectiveIds.size || Object.keys(trial.measurements ?? {}).some((id) => !objectiveIds.has(id))) errors.push(`${trial.id} measurements do not match plan objectives`);
        try {
          const expectedScore = scoreMeasurements(trial.measurements, boundPlan, index === 0 ? null : baseline?.measurements);
          if (Math.abs(expectedScore.objectiveLoss - trial.objectiveLoss) > 1e-10 || expectedScore.eligible !== trial.eligible) errors.push(`${trial.id} score or eligibility does not match the plan`);
          if (digestJson(expectedScore.decomposition) !== digestJson(trial.decomposition) || digestJson(expectedScore.protectedRegressions) !== digestJson(trial.protectedRegressions)) errors.push(`${trial.id} score decomposition is not reproducible`);
        } catch (error) { errors.push(`${trial.id}: ${error.message}`); }
      }
    }
    const payload = structuredClone(report); delete payload.reportDigest;
    if (digestJson(payload) !== report.reportDigest) errors.push('parameter fit report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

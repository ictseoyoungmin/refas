import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {poseParametersFromVector, poseTransformEdits, validatePoseFitPlan} from './pose-fit.mjs';
import {validateFitStructuralEligibility} from './fit-structural-eligibility.mjs';

export const ORIENTATION_POSE_FIT_SCHEMA = 'refas.orientation-pose-fit/v1';
export const ORIENTATION_POSE_FIT_OWNER = 'assembly';

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();
const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
};

function normalizeChain(raw, index, variableIds) {
  const label = `chains[${index}]`;
  const ids = uniqueStrings(raw?.variableIds);
  if (!ids.length) throw new Error(`${label}.variableIds requires at least one pose variable`);
  const unknown = ids.filter((id) => !variableIds.has(id));
  if (unknown.length) throw new Error(`${label}.variableIds references unknown pose variables: ${unknown.join(', ')}`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires orientation evidence`);
  return {
    id: assertId(raw?.id, `${label}.id`),
    terminalNodeId: assertId(raw?.terminalNodeId, `${label}.terminalNodeId`),
    variableIds: ids,
    evidenceRefs,
  };
}

export function createOrientationPoseFitPlan({
  id,
  posePlan,
  orientationEvidenceDigest,
  chains = [],
  chainFractions = [-1, -0.5, 0.5, 1],
  evidenceRefs = [],
} = {}) {
  const validation = validatePoseFitPlan(posePlan);
  if (!validation.valid) throw new Error(`posePlan is invalid: ${validation.errors.join('; ')}`);
  if (posePlan.ownerCapability !== ORIENTATION_POSE_FIT_OWNER) throw new Error('orientation pose fitting must remain owned by assembly');
  if (!Array.isArray(chains) || !chains.length) throw new Error('orientation pose fitting requires at least one responsible chain');
  const variableIds = new Set(posePlan.variables.map((item) => item.id));
  const normalizedChains = chains.map((item, index) => normalizeChain(item, index, variableIds)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalizedChains.map((item) => item.id)).size !== normalizedChains.length) throw new Error('orientation chain IDs must be unique');
  const fractions = [...new Set(chainFractions.map((value, index) => {
    const number = finite(value, `chainFractions[${index}]`);
    if (number < -1 || number > 1 || Math.abs(number) < 1e-12) throw new Error('chainFractions must be non-zero and in [-1, 1]');
    return number;
  }))].sort((a, b) => a - b);
  const payload = {
    schema: ORIENTATION_POSE_FIT_SCHEMA,
    id: assertId(id, 'id'),
    ownerCapability: ORIENTATION_POSE_FIT_OWNER,
    scopeId: posePlan.scopeId,
    sourceSha256: posePlan.sourceSha256,
    posePlan,
    posePlanDigest: posePlan.planDigest,
    orientationEvidenceDigest: assertDigest(orientationEvidenceDigest, 'orientationEvidenceDigest'),
    chains: normalizedChains,
    chainFractions: fractions,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      terminalMismatchReopensSmallestResponsibleChain: true,
      chainVariablesRemainParentLocal: true,
      meshBytesImmutable: true,
      structuralEligibilityRemainsHardBarrier: true,
      orientationMetricsCannotPassVisualGate: true,
      selectedCandidateRequiresActualVisualReview: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateOrientationPoseFitPlan(value) {
  const errors = [];
  try {
    if (value?.schema !== ORIENTATION_POSE_FIT_SCHEMA) errors.push('invalid schema');
    const recreated = createOrientationPoseFitPlan(value);
    if (recreated.planDigest !== value?.planDigest) errors.push('orientation pose fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('orientation pose fit plan is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function addUnique(vectors, next) {
  if (!vectors.some((item) => item.every((value, index) => Math.abs(value - next[index]) < 1e-12))) vectors.push(next);
}

export function orientationPoseCandidateVectors(plan) {
  const validation = validateOrientationPoseFitPlan(plan);
  if (!validation.valid) throw new Error(`orientation pose fit plan is invalid: ${validation.errors.join('; ')}`);
  const posePlan = plan.posePlan;
  const baseline = posePlan.variables.map((item) => item.initial);
  const variableIndex = new Map(posePlan.variables.map((item, index) => [item.id, index]));
  const vectors = [baseline];
  for (const chain of plan.chains) {
    for (const fraction of plan.chainFractions) {
      if (vectors.length >= posePlan.evaluationBudget) break;
      const next = [...baseline];
      for (const variableId of chain.variableIds) {
        const index = variableIndex.get(variableId), variable = posePlan.variables[index];
        const target = fraction < 0 ? variable.minimum : variable.maximum;
        next[index] = variable.initial + Math.abs(fraction) * (target - variable.initial);
      }
      addUnique(vectors, next);
    }
  }
  return vectors.slice(0, posePlan.evaluationBudget);
}

function score(measurements, objectives) {
  let objectiveLoss = 0;
  const normalized = {}, decomposition = [];
  for (const objective of objectives) {
    const value = finite(measurements?.[objective.id], `measurements.${objective.id}`);
    normalized[objective.id] = value;
    const contribution = value * objective.weight;
    objectiveLoss += contribution;
    decomposition.push({id: objective.id, value, contribution});
  }
  return {measurements: normalized, decomposition, objectiveLoss};
}

export async function fitOrientationPose(plan, {
  baselineGlb,
  buildCandidate,
  evaluate,
  evaluateStructure = null,
  verifyReference = null,
} = {}) {
  const validation = validateOrientationPoseFitPlan(plan);
  if (!validation.valid) throw new Error(`orientation pose fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof buildCandidate !== 'function' || typeof evaluate !== 'function') throw new Error('buildCandidate and evaluate are required');
  const posePlan = plan.posePlan;
  if (posePlan.structuralEligibilityRequired && typeof evaluateStructure !== 'function') throw new Error('evaluateStructure is required by the bound pose plan');
  const baselineBytes = Buffer.from(baselineGlb ?? []);
  if (!baselineBytes.length || digestBytes(baselineBytes) !== posePlan.baselineAsset.sha256) throw new Error('baselineGlb does not match bound posePlan baselineAsset');
  const baselineParsed = parseGlb(baselineBytes);
  const trials = [];
  for (const vector of orientationPoseCandidateVectors(plan)) {
    const sequence = trials.length + 1, trialId = `orientation-pose-trial-${String(sequence).padStart(4, '0')}`;
    const parameters = poseParametersFromVector(posePlan, vector), edits = poseTransformEdits(posePlan, parameters);
    const context = deepFreeze({
      trialId, sequence, parameters, edits, chains: plan.chains,
      orientationEvidenceDigest: plan.orientationEvidenceDigest,
      orientationPosePlanDigest: plan.planDigest,
    });
    const candidate = Buffer.from(await buildCandidate({parameters: deepFreeze(parameters), edits: deepFreeze(edits), baselineGlb: baselineBytes, context}));
    if (!candidate.length) throw new Error(`${trialId} buildCandidate returned empty bytes`);
    const parsed = parseGlb(candidate);
    if (!parsed.binary.equals(baselineParsed.binary)) throw new Error(`${trialId} changed mesh/accessor bytes; orientation pose fitting may only alter parent-local transforms`);
    let structuralEligibility = null;
    if (typeof evaluateStructure === 'function') {
      structuralEligibility = await evaluateStructure(candidate, context);
      const structuralValidation = validateFitStructuralEligibility(structuralEligibility, candidate);
      if (!structuralValidation.valid) throw new Error(`${trialId} structural eligibility is invalid: ${structuralValidation.errors.join('; ')}`);
    }
    if (posePlan.structuralEligibilityRequired && !structuralEligibility) throw new Error(`${trialId} structural eligibility is required`);
    const raw = await evaluate(candidate, context);
    const scored = score(raw?.measurements ?? raw, posePlan.objectives);
    if (raw?.renderEvidence && typeof verifyReference === 'function') await verifyReference(raw.renderEvidence, `${trialId}.renderEvidence`);
    const eligible = structuralEligibility ? structuralEligibility.eligible === true : !posePlan.structuralEligibilityRequired;
    trials.push(deepFreeze({
      id: trialId, sequence, parameters, edits,
      candidateSha256: digestBytes(candidate), candidateBinarySha256: digestBytes(parsed.binary), baselineBinarySha256: digestBytes(baselineParsed.binary),
      ...scored, structuralEligibility, eligible, renderEvidence: raw?.renderEvidence ?? null,
      orientationDiscrepancyDigest: raw?.orientationDiscrepancyDigest ?? null,
      evidenceRefs: uniqueStrings(raw?.evidenceRefs),
    }));
  }
  const eligible = trials.filter((item) => item.eligible).sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence);
  const baseline = trials[0], selected = eligible[0] ?? null;
  const improvement = selected ? baseline.objectiveLoss - selected.objectiveLoss : 0;
  const status = !selected ? 'NO_ELIGIBLE_CANDIDATE' : selected.id !== baseline.id && improvement > posePlan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
  const payload = {
    schema: ORIENTATION_POSE_FIT_SCHEMA,
    plan, planDigest: plan.planDigest, ownerCapability: ORIENTATION_POSE_FIT_OWNER,
    scopeId: plan.scopeId, sourceSha256: plan.sourceSha256,
    baselineTrialId: baseline.id, selectedTrialId: selected?.id ?? null,
    status, objectiveImprovement: improvement, evaluationCount: trials.length, trials,
    policy: plan.policy,
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateOrientationPoseFitReport(value, plan = null) {
  const errors = [];
  try {
    if (value?.schema !== ORIENTATION_POSE_FIT_SCHEMA) errors.push('invalid schema');
    const bound = value?.plan;
    const planValidation = validateOrientationPoseFitPlan(bound);
    if (!planValidation.valid) errors.push(`embedded plan is invalid: ${planValidation.errors.join('; ')}`);
    if (plan && bound?.planDigest !== plan.planDigest) errors.push('orientation pose report plan does not match supplied plan');
    if (value?.planDigest !== bound?.planDigest) errors.push('orientation pose report does not bind its plan');
    const trials = value?.trials ?? [];
    if (!trials.length || value?.evaluationCount !== trials.length) errors.push('orientation pose trial ledger is missing or incomplete');
    for (const trial of trials) {
      if (trial.candidateBinarySha256 !== trial.baselineBinarySha256) errors.push(`${trial.id} changed mesh bytes`);
      if (bound?.posePlan?.structuralEligibilityRequired && trial.structuralEligibility == null) errors.push(`${trial.id} is missing structural eligibility`);
    }
    const eligible = trials.filter((item) => item.eligible).sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence);
    const expected = eligible[0] ?? null;
    if ((value?.selectedTrialId ?? null) !== (expected?.id ?? null)) errors.push('orientation pose selected trial is not the best eligible chain candidate');
    const payload = structuredClone(value); delete payload.reportDigest;
    if (digestJson(payload) !== value?.reportDigest) errors.push('orientation pose fit report digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

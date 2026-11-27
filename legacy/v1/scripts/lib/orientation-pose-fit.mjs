import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {poseParametersFromVector, poseTransformEdits, validatePoseFitPlan} from './pose-fit.mjs';
import {validateFitStructuralEligibility} from './fit-structural-eligibility.mjs';
import {orientationLossFromDiscrepancy, validateOrientationDiscrepancy} from './orientation-discrepancy.mjs';

export const ORIENTATION_POSE_FIT_SCHEMA = 'refas.orientation-pose-fit/v1';
export const ORIENTATION_POSE_FIT_OWNER = 'assembly';

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();
const finite = (value, label) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${label} must be finite`); return n; };

function normalizeOrientationWeights(raw = {}) {
  const output = {};
  for (const [key, fallback] of Object.entries({primaryAxis: 1, facing: 1, lateral: 0.5, twist: 1})) {
    const value = finite(raw?.[key] ?? fallback, `orientationWeights.${key}`);
    if (value < 0) throw new Error(`orientationWeights.${key} must be non-negative`);
    output[key] = value;
  }
  if (!(Object.values(output).reduce((sum, value) => sum + value, 0) > 0)) throw new Error('orientationWeights requires at least one positive weight');
  return output;
}

function normalizeChain(raw, index, variableIds) {
  const label = `chains[${index}]`, ids = uniqueStrings(raw?.variableIds), evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!ids.length) throw new Error(`${label}.variableIds requires at least one pose variable`);
  const unknown = ids.filter((id) => !variableIds.has(id));
  if (unknown.length) throw new Error(`${label}.variableIds references unknown pose variables: ${unknown.join(', ')}`);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires orientation evidence`);
  return {id: assertId(raw?.id, `${label}.id`), terminalNodeId: assertId(raw?.terminalNodeId, `${label}.terminalNodeId`), variableIds: ids, evidenceRefs};
}

export function createOrientationPoseFitPlan({id, posePlan, orientationEvidenceDigest, chains = [], chainFractions = [-1, -0.5, 0.5, 1], orientationWeights = {}, evidenceRefs = []} = {}) {
  const validation = validatePoseFitPlan(posePlan);
  if (!validation.valid) throw new Error(`posePlan is invalid: ${validation.errors.join('; ')}`);
  if (posePlan.ownerCapability !== ORIENTATION_POSE_FIT_OWNER) throw new Error('orientation pose fitting must remain owned by assembly');
  if (!posePlan.objectives.some((item) => item.id === 'orientation-loss')) throw new Error('orientation pose fitting requires an orientation-loss objective in the bound pose plan');
  if (!Array.isArray(chains) || !chains.length) throw new Error('orientation pose fitting requires at least one responsible chain');
  const variableIds = new Set(posePlan.variables.map((item) => item.id));
  const normalizedChains = chains.map((item, index) => normalizeChain(item, index, variableIds)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalizedChains.map((item) => item.id)).size !== normalizedChains.length) throw new Error('orientation chain IDs must be unique');
  const fractions = [...new Set(chainFractions.map((value, index) => {
    const number = finite(value, `chainFractions[${index}]`);
    if (number < -1 || number > 1 || Math.abs(number) < 1e-12) throw new Error('chainFractions must be non-zero and in [-1, 1]');
    return number;
  }))].sort((a, b) => a - b);
  if (!fractions.length) throw new Error('orientation pose fitting requires at least one chain fraction');
  const payload = {
    schema: ORIENTATION_POSE_FIT_SCHEMA, id: assertId(id, 'id'), ownerCapability: ORIENTATION_POSE_FIT_OWNER,
    scopeId: posePlan.scopeId, sourceSha256: posePlan.sourceSha256, posePlan, posePlanDigest: posePlan.planDigest,
    orientationEvidenceDigest: assertDigest(orientationEvidenceDigest, 'orientationEvidenceDigest'), chains: normalizedChains, chainFractions: fractions,
    orientationWeights: normalizeOrientationWeights(orientationWeights), evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {terminalMismatchReopensSmallestResponsibleChain: true, chainVariablesRemainParentLocal: true, meshBytesImmutable: true, structuralEligibilityRemainsHardBarrier: true, orientationEvidenceMustBindExactCandidate: true, orientationLossIsDerivedFromBoundDiscrepancy: true, orientationMetricsCannotPassVisualGate: true, selectedCandidateRequiresActualVisualReview: true},
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
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function addUnique(vectors, next) { if (!vectors.some((item) => item.every((value, index) => Math.abs(value - next[index]) < 1e-12))) vectors.push(next); }
function chainVector(baseline, posePlan, variableIndex, chain, signs, magnitude) {
  const next = [...baseline];
  for (const [chainIndex, variableId] of chain.variableIds.entries()) {
    const index = variableIndex.get(variableId), variable = posePlan.variables[index], target = signs[chainIndex] < 0 ? variable.minimum : variable.maximum;
    next[index] = variable.initial + magnitude * (target - variable.initial);
  }
  return next;
}

/** Baseline, coordinated chain edits, then bounded mixed-sign counter-rotations. */
export function orientationPoseCandidateVectors(plan) {
  const validation = validateOrientationPoseFitPlan(plan);
  if (!validation.valid) throw new Error(`orientation pose fit plan is invalid: ${validation.errors.join('; ')}`);
  const posePlan = plan.posePlan, baseline = posePlan.variables.map((item) => item.initial), variableIndex = new Map(posePlan.variables.map((item, index) => [item.id, index])), vectors = [baseline];
  for (const chain of plan.chains) for (const fraction of plan.chainFractions) {
    if (vectors.length >= posePlan.evaluationBudget) break;
    addUnique(vectors, chainVector(baseline, posePlan, variableIndex, chain, Array(chain.variableIds.length).fill(Math.sign(fraction)), Math.abs(fraction)));
  }
  const magnitudes = [...new Set(plan.chainFractions.map(Math.abs))].sort((a, b) => a - b);
  for (const chain of plan.chains) {
    if (chain.variableIds.length < 2) continue;
    for (const magnitude of magnitudes) {
      if (vectors.length >= posePlan.evaluationBudget) break;
      const count = chain.variableIds.length;
      if (count <= 12) {
        const allPositive = (1 << count) - 1;
        for (let mask = 1; mask < allPositive && vectors.length < posePlan.evaluationBudget; mask += 1) {
          const signs = Array.from({length: count}, (_, index) => (mask & (1 << index)) ? 1 : -1);
          addUnique(vectors, chainVector(baseline, posePlan, variableIndex, chain, signs, magnitude));
        }
      } else for (const offset of [0, 1]) {
        if (vectors.length >= posePlan.evaluationBudget) break;
        addUnique(vectors, chainVector(baseline, posePlan, variableIndex, chain, Array.from({length: count}, (_, index) => ((index + offset) % 2 === 0 ? 1 : -1)), magnitude));
      }
    }
  }
  return vectors.slice(0, posePlan.evaluationBudget);
}

function score(measurements, objectives) {
  let objectiveLoss = 0; const normalized = {}, decomposition = [];
  for (const objective of objectives) {
    const value = finite(measurements?.[objective.id], `measurements.${objective.id}`), contribution = value * objective.weight;
    normalized[objective.id] = value; objectiveLoss += contribution; decomposition.push({id: objective.id, value, contribution});
  }
  return {measurements: normalized, decomposition, objectiveLoss};
}

function bindOrientationDiscrepancy(raw, plan, candidateSha256, trialId) {
  const report = raw?.orientationDiscrepancy, validation = validateOrientationDiscrepancy(report);
  if (!validation.valid) throw new Error(`${trialId} orientation discrepancy is invalid: ${validation.errors.join('; ')}`);
  if (report.assetSha256 !== candidateSha256) throw new Error(`${trialId} orientation discrepancy does not bind exact candidate SHA-256`);
  if (report.sourceSha256 !== plan.sourceSha256) throw new Error(`${trialId} orientation discrepancy source does not match the plan`);
  if (report.orientationEvidenceDigest !== plan.orientationEvidenceDigest) throw new Error(`${trialId} orientation discrepancy does not bind the plan orientation evidence`);
  return report;
}

export async function fitOrientationPose(plan, {baselineGlb, buildCandidate, evaluate, evaluateStructure = null, verifyReference = null} = {}) {
  const validation = validateOrientationPoseFitPlan(plan);
  if (!validation.valid) throw new Error(`orientation pose fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof buildCandidate !== 'function' || typeof evaluate !== 'function') throw new Error('buildCandidate and evaluate are required');
  const posePlan = plan.posePlan;
  if (posePlan.structuralEligibilityRequired && typeof evaluateStructure !== 'function') throw new Error('evaluateStructure is required by the bound pose plan');
  const baselineBytes = Buffer.from(baselineGlb ?? []);
  if (!baselineBytes.length || digestBytes(baselineBytes) !== posePlan.baselineAsset.sha256) throw new Error('baselineGlb does not match bound posePlan baselineAsset');
  const baselineParsed = parseGlb(baselineBytes), trials = [];
  for (const vector of orientationPoseCandidateVectors(plan)) {
    const sequence = trials.length + 1, trialId = `orientation-pose-trial-${String(sequence).padStart(4, '0')}`;
    const parameters = poseParametersFromVector(posePlan, vector), edits = poseTransformEdits(posePlan, parameters);
    const context = deepFreeze({trialId, sequence, parameters, edits, chains: plan.chains, orientationEvidenceDigest: plan.orientationEvidenceDigest, orientationPosePlanDigest: plan.planDigest});
    const candidate = Buffer.from(await buildCandidate({parameters: deepFreeze(parameters), edits: deepFreeze(edits), baselineGlb: baselineBytes, context}));
    if (!candidate.length) throw new Error(`${trialId} buildCandidate returned empty bytes`);
    const candidateSha256 = digestBytes(candidate), parsed = parseGlb(candidate);
    if (!parsed.binary.equals(baselineParsed.binary)) throw new Error(`${trialId} changed mesh/accessor bytes; orientation pose fitting may only alter parent-local transforms`);
    let structuralEligibility = null;
    if (typeof evaluateStructure === 'function') {
      structuralEligibility = await evaluateStructure(candidate, context);
      const structuralValidation = validateFitStructuralEligibility(structuralEligibility, candidate);
      if (!structuralValidation.valid) throw new Error(`${trialId} structural eligibility is invalid: ${structuralValidation.errors.join('; ')}`);
    }
    if (posePlan.structuralEligibilityRequired && !structuralEligibility) throw new Error(`${trialId} structural eligibility is required`);
    const raw = await evaluate(candidate, context), orientationDiscrepancy = bindOrientationDiscrepancy(raw, plan, candidateSha256, trialId);
    const derivedOrientationLoss = orientationLossFromDiscrepancy(orientationDiscrepancy, plan.orientationWeights);
    if (raw?.measurements?.['orientation-loss'] != null && Math.abs(finite(raw.measurements['orientation-loss'], 'measurements.orientation-loss') - derivedOrientationLoss) > 1e-10) throw new Error(`${trialId} caller orientation-loss does not match the bound orientation discrepancy`);
    const scored = score({...raw?.measurements, 'orientation-loss': derivedOrientationLoss}, posePlan.objectives);
    if (raw?.renderEvidence && typeof verifyReference === 'function') await verifyReference(raw.renderEvidence, `${trialId}.renderEvidence`);
    const eligible = structuralEligibility ? structuralEligibility.eligible === true : !posePlan.structuralEligibilityRequired;
    trials.push(deepFreeze({id: trialId, sequence, parameters, edits, candidateSha256, candidateBinarySha256: digestBytes(parsed.binary), baselineBinarySha256: digestBytes(baselineParsed.binary), ...scored, structuralEligibility, eligible, renderEvidence: raw?.renderEvidence ?? null, orientationDiscrepancy, orientationDiscrepancyDigest: orientationDiscrepancy.discrepancyDigest, evidenceRefs: uniqueStrings(raw?.evidenceRefs)}));
  }
  const eligible = trials.filter((item) => item.eligible).sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence), baseline = trials[0], selected = eligible[0] ?? null;
  const improvement = selected ? baseline.objectiveLoss - selected.objectiveLoss : 0;
  const status = !selected ? 'NO_ELIGIBLE_CANDIDATE' : selected.id !== baseline.id && improvement > posePlan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
  const payload = {schema: ORIENTATION_POSE_FIT_SCHEMA, plan, planDigest: plan.planDigest, ownerCapability: ORIENTATION_POSE_FIT_OWNER, scopeId: plan.scopeId, sourceSha256: plan.sourceSha256, baselineTrialId: baseline.id, selectedTrialId: selected?.id ?? null, status, objectiveImprovement: improvement, evaluationCount: trials.length, trials, policy: plan.policy};
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateOrientationPoseFitReport(value, plan = null) {
  const errors = [];
  try {
    if (value?.schema !== ORIENTATION_POSE_FIT_SCHEMA) errors.push('invalid schema');
    const bound = value?.plan, planValidation = validateOrientationPoseFitPlan(bound);
    if (!planValidation.valid) errors.push(`embedded plan is invalid: ${planValidation.errors.join('; ')}`);
    if (plan && bound?.planDigest !== plan.planDigest) errors.push('orientation pose report plan does not match supplied plan');
    if (value?.planDigest !== bound?.planDigest) errors.push('orientation pose report does not bind its plan');
    if (value?.ownerCapability !== ORIENTATION_POSE_FIT_OWNER || value?.scopeId !== bound?.scopeId || value?.sourceSha256 !== bound?.sourceSha256) errors.push('orientation pose report identity does not match its plan');
    if (digestJson(value?.policy) !== digestJson(bound?.policy)) errors.push('orientation pose report policy does not match its plan');
    const trials = value?.trials ?? [];
    if (!Array.isArray(value?.trials) || !trials.length || value?.evaluationCount !== trials.length) errors.push('orientation pose trial ledger is missing or incomplete');
    if (bound && trials.length > bound.posePlan.evaluationBudget) errors.push('orientation pose report exceeds the evaluation budget');
    const ids = new Set(trials.map((trial) => trial.id));
    if (!ids.has(value?.baselineTrialId) || value?.baselineTrialId !== trials[0]?.id) errors.push('orientation pose baseline trial must be the first evaluated trial');
    if (value?.selectedTrialId != null && !ids.has(value.selectedTrialId)) errors.push('orientation pose selected trial is missing');
    const eligibleTrials = []; let baselineBinarySha256 = null;
    for (const [index, trial] of trials.entries()) {
      if (trial.sequence !== index + 1) errors.push(`${trial.id} sequence is not contiguous`);
      for (const [key, digest] of [['candidateSha256', trial.candidateSha256], ['candidateBinarySha256', trial.candidateBinarySha256], ['baselineBinarySha256', trial.baselineBinarySha256], ['orientationDiscrepancyDigest', trial.orientationDiscrepancyDigest]]) try { assertDigest(digest, `${trial.id}.${key}`); } catch (error) { errors.push(error.message); }
      if (baselineBinarySha256 == null) baselineBinarySha256 = trial.baselineBinarySha256;
      if (trial.baselineBinarySha256 !== baselineBinarySha256 || trial.candidateBinarySha256 !== trial.baselineBinarySha256) errors.push(`${trial.id} changed mesh bytes or baseline BIN identity`);
      const parameterIds = new Set(bound?.posePlan?.variables?.map((variable) => variable.id) ?? []), actualParameterIds = Object.keys(trial.parameters ?? {});
      if (actualParameterIds.length !== parameterIds.size || actualParameterIds.some((id) => !parameterIds.has(id))) errors.push(`${trial.id} parameter set does not match the pose plan`);
      for (const variable of bound?.posePlan?.variables ?? []) { const parameter = trial.parameters?.[variable.id]; if (!Number.isFinite(parameter) || parameter < variable.minimum || parameter > variable.maximum) errors.push(`${trial.id} parameter ${variable.id} violates the pose plan`); }
      try {
        if (digestJson(poseTransformEdits(bound.posePlan, trial.parameters)) !== digestJson(trial.edits)) errors.push(`${trial.id} transform edits do not match parameters`);
        const discrepancyValidation = validateOrientationDiscrepancy(trial.orientationDiscrepancy);
        if (!discrepancyValidation.valid) errors.push(`${trial.id} orientation discrepancy is invalid: ${discrepancyValidation.errors.join('; ')}`);
        if (trial.orientationDiscrepancy?.discrepancyDigest !== trial.orientationDiscrepancyDigest) errors.push(`${trial.id} orientation discrepancy digest is not bound`);
        if (trial.orientationDiscrepancy?.assetSha256 !== trial.candidateSha256 || trial.orientationDiscrepancy?.sourceSha256 !== bound.sourceSha256 || trial.orientationDiscrepancy?.orientationEvidenceDigest !== bound.orientationEvidenceDigest) errors.push(`${trial.id} orientation discrepancy provenance does not match candidate/plan`);
        const expectedScore = score({...trial.measurements, 'orientation-loss': orientationLossFromDiscrepancy(trial.orientationDiscrepancy, bound.orientationWeights)}, bound.posePlan.objectives);
        if (Math.abs(expectedScore.objectiveLoss - trial.objectiveLoss) > 1e-10 || digestJson(expectedScore.measurements) !== digestJson(trial.measurements) || digestJson(expectedScore.decomposition) !== digestJson(trial.decomposition)) errors.push(`${trial.id} score is not reproducible from bound evidence`);
      } catch (error) { errors.push(`${trial.id}: ${error.message}`); }
      if (trial.structuralEligibility != null) {
        const structuralValidation = validateFitStructuralEligibility(trial.structuralEligibility);
        if (!structuralValidation.valid) errors.push(`${trial.id} structural eligibility is invalid: ${structuralValidation.errors.join('; ')}`);
        if (trial.structuralEligibility.candidateAssetSha256 !== trial.candidateSha256) errors.push(`${trial.id} structural eligibility does not bind candidate SHA-256`);
      } else if (bound?.posePlan?.structuralEligibilityRequired) errors.push(`${trial.id} is missing structural eligibility`);
      const expectedEligible = trial.structuralEligibility ? trial.structuralEligibility.eligible === true : !bound?.posePlan?.structuralEligibilityRequired;
      if (trial.eligible !== expectedEligible) errors.push(`${trial.id} eligible flag does not match structural evidence`);
      if (trial.eligible) eligibleTrials.push(trial);
    }
    eligibleTrials.sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence);
    const expected = eligibleTrials[0] ?? null, baseline = trials[0] ?? null;
    if ((value?.selectedTrialId ?? null) !== (expected?.id ?? null)) errors.push('orientation pose selected trial is not the best eligible chain candidate');
    if (!expected) {
      if (value?.status !== 'NO_ELIGIBLE_CANDIDATE' || Math.abs(Number(value?.objectiveImprovement ?? Infinity)) > 1e-12) errors.push('orientation pose no-eligible status/improvement is inconsistent');
    } else if (baseline) {
      const improvement = baseline.objectiveLoss - expected.objectiveLoss, expectedStatus = expected.id !== baseline.id && improvement > bound.posePlan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
      if (Math.abs(improvement - value.objectiveImprovement) > 1e-10) errors.push('orientation pose objectiveImprovement is inconsistent');
      if (value.status !== expectedStatus) errors.push('orientation pose status is inconsistent with selected trial');
    }
    const payload = structuredClone(value); delete payload.reportDigest;
    if (digestJson(payload) !== value?.reportDigest) errors.push('orientation pose fit report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {validateFitStructuralEligibility} from './fit-structural-eligibility.mjs';

export const POSE_FIT_SCHEMA = 'refas.pose-fit/v1';
export const POSE_FIT_OWNER = 'assembly';

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
};
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function normalizeVariable(raw, index) {
  const label = `variables[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const binding = String(raw?.binding ?? '').trim();
  if (!/^(?:assembly\.joint\.[a-z0-9._:-]+\.angle|assembly\.node\.[a-z0-9._:-]+\.(?:translation|rotation)\.[xyz])$/u.test(binding)) {
    throw new Error(`${label}.binding must target an assembly joint angle or node-local transform`);
  }
  const minimum = finite(raw?.minimum, `${label}.minimum`), maximum = finite(raw?.maximum, `${label}.maximum`), initial = finite(raw?.initial, `${label}.initial`);
  if (!(maximum > minimum) || initial < minimum || initial > maximum) throw new Error(`${label} bounds do not contain initial`);
  return {id, binding, minimum, maximum, initial, evidenceRefs: uniqueStrings(raw?.evidenceRefs)};
}

function normalizeConstraint(raw, index) {
  const label = `constraints[${index}]`;
  const kind = String(raw?.kind ?? '');
  if (!['grounded', 'support', 'collision'].includes(kind)) throw new Error(`${label}.kind must be grounded, support, or collision`);
  const nodeId = assertId(raw?.nodeId, `${label}.nodeId`);
  const axis = raw?.axis == null ? null : String(raw.axis);
  if (axis != null && !['x', 'y', 'z'].includes(axis)) throw new Error(`${label}.axis must be x, y, or z`);
  return {kind, nodeId, axis, minimum: raw?.minimum == null ? null : finite(raw.minimum, `${label}.minimum`), maximum: raw?.maximum == null ? null : finite(raw.maximum, `${label}.maximum`), evidenceRefs: uniqueStrings(raw?.evidenceRefs)};
}

export function createPoseFitPlan({id, scopeId, sourceSha256, baselineAsset, variables = [], constraints = [], objectives = [], evaluationBudget = 64, improvementTolerance = 1e-6, structuralEligibilityRequired = false, evidenceRefs = []} = {}) {
  if (!variables.length) throw new Error('pose fitting requires at least one transform variable');
  const normalizedVariables = variables.map(normalizeVariable);
  if (new Set(normalizedVariables.map((item) => item.id)).size !== normalizedVariables.length) throw new Error('pose variable IDs must be unique');
  const normalizedConstraints = constraints.map(normalizeConstraint);
  const asset = baselineAsset && typeof baselineAsset === 'object' ? {...baselineAsset} : null;
  if (asset?.schema !== 'refas.content-reference/v1' || !asset?.sha256 || asset.kind !== 'glb' || !asset.path || asset.path.startsWith('/') || asset.path.includes('..') || !Number.isInteger(Number(asset.sizeBytes)) || Number(asset.sizeBytes) < 0) throw new Error('baselineAsset must be a GLB content reference');
  assertDigest(asset.sha256, 'baselineAsset.sha256');
  const budget = Number(evaluationBudget);
  if (!Number.isInteger(budget) || budget < 2) throw new Error('evaluationBudget must be at least two');
  const normalizedObjectives = (objectives.length ? objectives : [{id: 'pose-loss', goal: 'minimize', weight: 1}]).map((raw, index) => {
    const id = assertId(raw?.id, `objectives[${index}].id`), goal = String(raw?.goal ?? 'minimize');
    if (goal !== 'minimize') throw new Error(`objectives[${index}].goal must minimize`);
    const weight = finite(raw?.weight ?? 1, `objectives[${index}].weight`);
    if (!(weight > 0)) throw new Error(`objectives[${index}].weight must be positive`);
    return {id, goal, weight};
  });
  const structuralGateRequired = normalizedConstraints.length > 0 || Boolean(structuralEligibilityRequired);
  const payload = {
    schema: POSE_FIT_SCHEMA, id: assertId(id, 'id'), ownerCapability: POSE_FIT_OWNER,
    scopeId: assertId(scopeId, 'scopeId'), sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    baselineAsset: asset, variables: normalizedVariables, constraints: normalizedConstraints, objectives: normalizedObjectives,
    evaluationBudget: budget, improvementTolerance: finite(improvementTolerance, 'improvementTolerance'), structuralEligibilityRequired: structuralGateRequired, evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {poseOwnerOnly: true, parentLocalTransformsOnly: true, meshBytesImmutable: true, collisionAndSupportConstraintsRequired: true, metricsCannotSelectOwner: true, metricsCannotPassVisualGate: true, selectedCandidateRequiresActualVisualReview: true, oneCheckpointCandidateAfterSelection: true, structuralInvalidityIsHardBarrier: true, structuralInvalidityIsNeverScorePenalty: true, poseStructuralGateRequiresPropagationAndRealizedContact: true},
  };
  if (payload.improvementTolerance < 0) throw new Error('improvementTolerance must be non-negative');
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validatePoseFitPlan(plan) {
  const errors = [];
  try {
    if (plan?.schema !== POSE_FIT_SCHEMA) errors.push('invalid schema');
    if (plan?.ownerCapability !== POSE_FIT_OWNER) errors.push(`pose fit owner must be ${POSE_FIT_OWNER}`);
    const recreated = createPoseFitPlan(plan);
    if (recreated.planDigest !== plan.planDigest) errors.push('pose fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(plan)) errors.push('pose fit plan is not canonical');
    if ((plan?.constraints?.length ?? 0) > 0 && plan?.structuralEligibilityRequired !== true) errors.push('constrained pose fitting requires structural eligibility');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function candidateVectors(plan) {
  const baseline = plan.variables.map((v) => v.initial), result = [baseline];
  for (let i = 0; i < plan.variables.length && result.length < plan.evaluationBudget; i += 1) {
    const v = plan.variables[i];
    for (const value of [v.minimum, v.maximum, (v.minimum + v.initial) / 2, (v.maximum + v.initial) / 2]) {
      if (result.length >= plan.evaluationBudget) break;
      const next = [...baseline]; next[i] = value;
      if (!result.some((item) => item.every((x, k) => Math.abs(x - next[k]) < 1e-12))) result.push(next);
    }
  }
  let cursor = 0;
  while (result.length < plan.evaluationBudget) {
    const next = plan.variables.map((v, i) => v.minimum + (((cursor * (i + 1) + i * 19) % 100003) / 100002) * (v.maximum - v.minimum));
    cursor += 1;
    if (!result.some((item) => item.every((x, k) => Math.abs(x - next[k]) < 1e-12))) result.push(next);
  }
  return result;
}

function score(raw, objectives) {
  let objectiveLoss = 0; const measurements = {}; const decomposition = [];
  for (const objective of objectives) {
    const value = finite(raw?.[objective.id], `measurements.${objective.id}`);
    measurements[objective.id] = value;
    const contribution = value * objective.weight;
    objectiveLoss += contribution; decomposition.push({id: objective.id, value, contribution});
  }
  return {measurements, decomposition, objectiveLoss};
}

export function poseParametersFromVector(plan, vector) {
  if (!Array.isArray(vector) || vector.length !== plan.variables.length) throw new Error('pose vector length does not match plan');
  return Object.fromEntries(plan.variables.map((v, i) => [v.id, Math.min(v.maximum, Math.max(v.minimum, finite(vector[i], `${v.id}`)))]));
}

/** Return a normalized map of transform edits for a pose candidate. */
export function poseTransformEdits(plan, parameters) {
  const edits = {};
  for (const variable of plan.variables) {
    const value = finite(parameters[variable.id], variable.id);
    const match = variable.binding.match(/^assembly\.(joint|node)\.([a-z0-9._:-]+)\.(.+)$/u);
    const [, kind, nodeId, property] = match;
    const item = edits[nodeId] ?? {nodeId, kind};
    if (kind === 'joint') item.angle = value;
    else if (property.startsWith('translation.')) (item.translation ??= {})[property.at(-1)] = value;
    else (item.rotation ??= {})[property.at(-1)] = value;
    edits[nodeId] = item;
  }
  return Object.values(edits).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/**
 * Run an owner-local pose search. `buildCandidate` receives parent-local edit
 * records and must preserve the baseline mesh/accessor bytes. Structural
 * eligibility is evaluated separately from visual/objective scoring.
 */
export async function fitPose(plan, {baselineGlb, buildCandidate, evaluate, evaluateStructure = null, verifyReference = null} = {}) {
  const validation = validatePoseFitPlan(plan);
  if (!validation.valid) throw new Error(`pose fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof buildCandidate !== 'function' || typeof evaluate !== 'function') throw new Error('buildCandidate and evaluate are required');
  if (plan.structuralEligibilityRequired && typeof evaluateStructure !== 'function') throw new Error('evaluateStructure is required when pose structural eligibility is required');
  const baselineBytes = Buffer.from(baselineGlb ?? []);
  if (!baselineBytes.length || digestBytes(baselineBytes) !== plan.baselineAsset.sha256) throw new Error('baselineGlb does not match plan.baselineAsset SHA-256');
  const baselineParsed = parseGlb(baselineBytes);
  const trials = [];
  for (const vector of candidateVectors(plan)) {
    const sequence = trials.length + 1, id = `pose-trial-${String(sequence).padStart(4, '0')}`;
    const parameters = poseParametersFromVector(plan, vector), edits = poseTransformEdits(plan, parameters);
    const context = deepFreeze({parameters, edits, constraints: plan.constraints, trialId: id, sequence, planDigest: plan.planDigest});
    const candidate = Buffer.from(await buildCandidate({parameters: deepFreeze(parameters), edits: deepFreeze(edits), baselineGlb: baselineBytes, context: {trialId: id, sequence, planDigest: plan.planDigest}}));
    if (!candidate.length) throw new Error(`${id} buildCandidate returned empty bytes`);
    const candidateParsed = parseGlb(candidate);
    if (!candidateParsed.binary.equals(baselineParsed.binary)) throw new Error(`${id} changed mesh/accessor bytes; pose fitting may only alter parent-local transforms`);
    let structuralEligibility = null;
    if (typeof evaluateStructure === 'function') {
      structuralEligibility = await evaluateStructure(candidate, context);
      const structuralValidation = validateFitStructuralEligibility(structuralEligibility, candidate);
      if (!structuralValidation.valid) throw new Error(`${id} structural eligibility is invalid: ${structuralValidation.errors.join('; ')}`);
      if (plan.structuralEligibilityRequired) {
        const stages = new Set(structuralEligibility.requiredStages ?? []);
        if (!stages.has('attachment-propagation') || !stages.has('realized-contact')) throw new Error(`${id} pose structural eligibility must require attachment-propagation and realized-contact`);
      }
    }
    if (plan.structuralEligibilityRequired && !structuralEligibility) throw new Error(`${id} structural eligibility is required`);
    const raw = await evaluate(candidate, context);
    const scored = score(raw?.measurements ?? raw, plan.objectives);
    if (raw?.renderEvidence && typeof verifyReference === 'function') await verifyReference(raw.renderEvidence, `${id}.renderEvidence`);
    const eligible = structuralEligibility ? structuralEligibility.eligible === true : !plan.structuralEligibilityRequired;
    trials.push(deepFreeze({id, sequence, parameters, edits, candidateSha256: digestBytes(candidate), candidateBinarySha256: digestBytes(candidateParsed.binary), baselineBinarySha256: digestBytes(baselineParsed.binary), ...scored, structuralEligibility, eligible, renderEvidence: raw?.renderEvidence ?? null, evidenceRefs: uniqueStrings(raw?.evidenceRefs)}));
  }
  const eligibleTrials = trials.filter((trial) => trial.eligible).sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence);
  const selected = eligibleTrials[0] ?? null, baseline = trials[0];
  const improvement = selected ? baseline.objectiveLoss - selected.objectiveLoss : 0;
  const status = !selected ? 'NO_ELIGIBLE_CANDIDATE' : selected.id !== baseline.id && improvement > plan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
  const payload = {schema: POSE_FIT_SCHEMA, plan, planDigest: plan.planDigest, ownerCapability: POSE_FIT_OWNER, scopeId: plan.scopeId, sourceSha256: plan.sourceSha256, baselineTrialId: baseline.id, selectedTrialId: selected?.id ?? null, status, objectiveImprovement: improvement, evaluationCount: trials.length, trials, policy: plan.policy};
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validatePoseFitReport(report, plan = null) {
  const errors = [];
  try {
    if (report?.schema !== POSE_FIT_SCHEMA) errors.push('invalid schema');
    if (report?.ownerCapability !== POSE_FIT_OWNER) errors.push(`pose fit owner must be ${POSE_FIT_OWNER}`);
    if (!['IMPROVED', 'NO_IMPROVEMENT', 'NO_ELIGIBLE_CANDIDATE'].includes(report?.status)) errors.push('invalid status');
    if (!Number.isFinite(report?.objectiveImprovement)) errors.push('objectiveImprovement must be finite');
    assertDigest(report?.reportDigest, 'reportDigest');

    const embeddedPlan = report?.plan;
    if (!embeddedPlan) errors.push('pose report must embed its exact normalized plan');
    else {
      const planValidation = validatePoseFitPlan(embeddedPlan);
      if (!planValidation.valid) errors.push(`embedded pose plan is invalid: ${planValidation.errors.join('; ')}`);
      if (report?.planDigest !== embeddedPlan.planDigest) errors.push('pose report does not bind its embedded plan');
    }
    if (plan && embeddedPlan && plan.planDigest !== embeddedPlan.planDigest) errors.push('embedded pose plan does not match the supplied plan');
    const bound = embeddedPlan ?? plan;
    if (!bound || report?.planDigest !== bound.planDigest) errors.push('pose report does not bind its plan');
    if (bound) {
      if (report?.scopeId !== bound.scopeId || report?.sourceSha256 !== bound.sourceSha256) errors.push('pose report scope or source does not match the plan');
      if (digestJson(report?.policy) !== digestJson(bound.policy)) errors.push('pose report policy does not match the plan');
      if ((bound.constraints?.length ?? 0) > 0 && bound.structuralEligibilityRequired !== true) errors.push('constrained pose report is bound to a plan without structural eligibility');
    }
    if (!report?.policy?.meshBytesImmutable || !report?.policy?.parentLocalTransformsOnly || !report?.policy?.structuralInvalidityIsHardBarrier || !report?.policy?.structuralInvalidityIsNeverScorePenalty || !report?.policy?.poseStructuralGateRequiresPropagationAndRealizedContact) errors.push('pose structural/mesh policy is missing');

    const trials = report?.trials ?? [];
    if (!Array.isArray(report?.trials) || !trials.length || report?.evaluationCount !== trials.length) errors.push('pose trial ledger is missing or incomplete');
    if (bound && trials.length > bound.evaluationBudget) errors.push('pose report exceeds the evaluation budget');
    const ids = new Set(trials.map((trial) => trial.id));
    if (!ids.has(report?.baselineTrialId)) errors.push('pose baseline trial is missing');
    if (report?.selectedTrialId != null && !ids.has(report.selectedTrialId)) errors.push('pose selected trial is missing');
    if (report?.selectedTrialId == null && report?.status !== 'NO_ELIGIBLE_CANDIDATE') errors.push('pose selectedTrialId may be null only when no eligible candidate exists');

    const eligibleTrials = [];
    let baselineBinarySha256 = null;
    for (const [index, trial] of trials.entries()) {
      if (trial.sequence !== index + 1) errors.push(`${trial.id} sequence is not contiguous`);
      try {
        assertDigest(trial.candidateSha256, `${trial.id}.candidateSha256`);
        assertDigest(trial.candidateBinarySha256, `${trial.id}.candidateBinarySha256`);
        assertDigest(trial.baselineBinarySha256, `${trial.id}.baselineBinarySha256`);
      } catch (error) { errors.push(error.message); }
      if (baselineBinarySha256 == null) baselineBinarySha256 = trial.baselineBinarySha256;
      if (trial.baselineBinarySha256 !== baselineBinarySha256) errors.push(`${trial.id} baseline binary digest changed within one pose report`);
      if (trial.candidateBinarySha256 !== trial.baselineBinarySha256) errors.push(`${trial.id} changed mesh bytes during pose fitting`);

      if (bound) {
        const parameterIds = new Set(bound.variables.map((variable) => variable.id));
        const actualParameterIds = Object.keys(trial.parameters ?? {});
        if (actualParameterIds.length !== parameterIds.size || actualParameterIds.some((id) => !parameterIds.has(id))) errors.push(`${trial.id} parameter set does not match the pose plan`);
        for (const variable of bound.variables) {
          const value = trial.parameters?.[variable.id];
          if (!Number.isFinite(value) || value < variable.minimum || value > variable.maximum) errors.push(`${trial.id} parameter ${variable.id} violates the pose plan`);
        }
        try {
          const expectedEdits = poseTransformEdits(bound, trial.parameters);
          if (digestJson(expectedEdits) !== digestJson(trial.edits)) errors.push(`${trial.id} transform edits do not match its pose parameters`);
          const expectedScore = score(trial.measurements, bound.objectives);
          if (Math.abs(expectedScore.objectiveLoss - trial.objectiveLoss) > 1e-10) errors.push(`${trial.id} objectiveLoss does not match measurements`);
          if (digestJson(expectedScore.measurements) !== digestJson(trial.measurements) || digestJson(expectedScore.decomposition) !== digestJson(trial.decomposition)) errors.push(`${trial.id} score decomposition is not reproducible`);
        } catch (error) { errors.push(`${trial.id}: ${error.message}`); }
      }

      if (trial.structuralEligibility != null) {
        const structuralValidation = validateFitStructuralEligibility(trial.structuralEligibility);
        if (!structuralValidation.valid) errors.push(`${trial.id} structural eligibility is invalid: ${structuralValidation.errors.join('; ')}`);
        if (trial.structuralEligibility.candidateAssetSha256 !== trial.candidateSha256) errors.push(`${trial.id} structural eligibility does not bind candidate SHA-256`);
        if (bound?.structuralEligibilityRequired) {
          const stages = new Set(trial.structuralEligibility.requiredStages ?? []);
          if (!stages.has('attachment-propagation') || !stages.has('realized-contact')) errors.push(`${trial.id} structural eligibility lacks required pose stages`);
        }
      } else if (bound?.structuralEligibilityRequired) errors.push(`${trial.id} is missing required structural eligibility`);
      const expectedEligible = trial.structuralEligibility ? trial.structuralEligibility.eligible === true : !bound?.structuralEligibilityRequired;
      if (trial.eligible !== expectedEligible) errors.push(`${trial.id} eligible flag does not match structural eligibility`);
      if (trial.eligible) eligibleTrials.push(trial);
    }

    const baseline = trials.find((trial) => trial.id === report?.baselineTrialId) ?? null;
    if (baseline && (baseline.sequence !== 1 || baseline.id !== trials[0]?.id)) errors.push('pose baseline trial must be the first evaluated trial');
    eligibleTrials.sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence);
    const expectedSelected = eligibleTrials[0] ?? null;
    if ((report?.selectedTrialId ?? null) !== (expectedSelected?.id ?? null)) errors.push('pose selected trial is not the best structurally eligible trial');
    if (!expectedSelected) {
      if (report?.status !== 'NO_ELIGIBLE_CANDIDATE') errors.push('pose report without eligible trials must use NO_ELIGIBLE_CANDIDATE');
      if (Math.abs(Number(report?.objectiveImprovement ?? Infinity)) > 1e-12) errors.push('pose report without eligible trials must report zero objective improvement');
    } else if (baseline) {
      const improvement = baseline.objectiveLoss - expectedSelected.objectiveLoss;
      if (Math.abs(improvement - report.objectiveImprovement) > 1e-10) errors.push('pose objectiveImprovement does not match baseline and selected trials');
      if (bound) {
        const expectedStatus = expectedSelected.id !== baseline.id && improvement > bound.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT';
        if (report.status !== expectedStatus) errors.push('pose status does not match selected improvement');
      }
    }

    const payload = structuredClone(report); delete payload.reportDigest;
    if (digestJson(payload) !== report.reportDigest) errors.push('pose fit report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

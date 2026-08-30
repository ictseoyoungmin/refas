import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const APPEARANCE_FIT_SCHEMA = 'refas.appearance-fit/v1';
export const LIGHTING_FIT_SCHEMA = 'refas.lighting-fit/v1';

const finite = (value, label) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${label} must be finite`); return n; };
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function contentReference(raw, label) {
  if (!raw || typeof raw !== 'object' || raw.schema !== 'refas.content-reference/v1') throw new Error(`${label} must be a content reference`);
  const path = String(raw.path ?? '');
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error(`${label}.path must be project-relative`);
  const sizeBytes = Number(raw.sizeBytes ?? 0);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) throw new Error(`${label}.sizeBytes must be a non-negative integer`);
  return {schema: raw.schema, kind: String(raw.kind ?? 'artifact'), path, sha256: assertDigest(raw.sha256, `${label}.sha256`), sizeBytes};
}

function normalizeVariable(raw, index, kind) {
  const label = `variables[${index}]`, id = assertId(raw?.id, `${label}.id`), binding = String(raw?.binding ?? '').trim();
  const pattern = kind === 'appearance'
    ? /^appearance\.material\.[a-z0-9._:-]+\.(?:baseColor\.[rgb]|roughness|metallic|clearcoat)$/u
    : /^lighting\.(?:exposure|background\.(?:r|g|b|brightness)|key\.(?:intensity|azimuth|elevation)|fill\.(?:intensity|azimuth|elevation)|rim\.(?:intensity|azimuth|elevation))$/u;
  if (!pattern.test(binding)) throw new Error(`${label}.binding is not a supported ${kind} parameter`);
  const minimum = finite(raw?.minimum, `${label}.minimum`), maximum = finite(raw?.maximum, `${label}.maximum`), initial = finite(raw?.initial, `${label}.initial`);
  if (!(maximum > minimum) || initial < minimum || initial > maximum) throw new Error(`${label} bounds do not contain initial`);
  return {id, binding, minimum, maximum, initial, evidenceRefs: uniqueStrings(raw?.evidenceRefs)};
}

function createPlan({kind, schema, ownerCapability, id, scopeId, sourceSha256, baselineAsset, variables, objectives = [], evaluationBudget = 48, improvementTolerance = 1e-6, geometryDigest = null, frameDigest = null, evidenceRefs = []}) {
  if (!Array.isArray(variables) || !variables.length) throw new Error(`${kind} fitting requires at least one bounded variable`);
  const asset = baselineAsset && typeof baselineAsset === 'object' ? {...baselineAsset} : null;
  if (asset?.schema !== 'refas.content-reference/v1' || !asset?.sha256 || !asset.path || asset.path.startsWith('/') || asset.path.includes('..') || !Number.isInteger(Number(asset.sizeBytes)) || Number(asset.sizeBytes) < 0) throw new Error('baselineAsset content reference is required');
  assertDigest(asset.sha256, 'baselineAsset.sha256');
  const budget = Number(evaluationBudget); if (!Number.isInteger(budget) || budget < 2) throw new Error('evaluationBudget must be at least two');
  const normalizedObjectives = (objectives.length ? objectives : [{id: `${kind}-loss`, goal: 'minimize', weight: 1}]).map((raw, index) => {
    const objective = {id: assertId(raw?.id, `objectives[${index}].id`), goal: String(raw?.goal ?? 'minimize'), weight: finite(raw?.weight ?? 1, `objectives[${index}].weight`)};
    if (objective.goal !== 'minimize' || !(objective.weight > 0)) throw new Error(`objectives[${index}] must minimize with positive weight`);
    return objective;
  });
  const payload = {schema, id: assertId(id, 'id'), ownerCapability, scopeId: assertId(scopeId, 'scopeId'), sourceSha256: assertDigest(sourceSha256, 'sourceSha256'), baselineAsset: asset, variables: variables.map((raw, index) => normalizeVariable(raw, index, kind)), objectives: normalizedObjectives, evaluationBudget: budget, improvementTolerance: finite(improvementTolerance, 'improvementTolerance'), geometryDigest: geometryDigest == null ? null : assertDigest(geometryDigest, 'geometryDigest'), frameDigest: frameDigest == null ? null : assertDigest(frameDigest, 'frameDigest'), evidenceRefs: uniqueStrings(evidenceRefs), policy: {ownerLocalOnly: true, geometryFrozen: true, illuminationSeparatedFromMaterial: kind === 'appearance' ? true : undefined, backgroundMustBeBound: kind === 'lighting' ? true : undefined, metricsCannotSelectOwner: true, metricsCannotPassVisualGate: true, selectedCandidateRequiresActualVisualReview: true, oneCheckpointCandidateAfterSelection: true} };
  if (payload.improvementTolerance < 0) throw new Error('improvementTolerance must be non-negative');
  // Undefined policy keys are not part of the canonical contract.
  if (payload.policy.illuminationSeparatedFromMaterial === undefined) delete payload.policy.illuminationSeparatedFromMaterial;
  if (payload.policy.backgroundMustBeBound === undefined) delete payload.policy.backgroundMustBeBound;
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function createAppearanceFitPlan(options = {}) { return createPlan({...options, kind: 'appearance', schema: APPEARANCE_FIT_SCHEMA, ownerCapability: 'appearance'}); }
export function createLightingCalibrationPlan(options = {}) { return createPlan({...options, kind: 'lighting', schema: LIGHTING_FIT_SCHEMA, ownerCapability: 'rendering'}); }

function validatePlan(plan, schema, owner) {
  const errors = [];
  try {
    if (plan?.schema !== schema) errors.push('invalid schema');
    if (plan?.ownerCapability !== owner) errors.push(`fit owner must be ${owner}`);
    const recreated = createPlan({...plan, kind: schema === APPEARANCE_FIT_SCHEMA ? 'appearance' : 'lighting', schema, ownerCapability: owner});
    if (recreated.planDigest !== plan.planDigest) errors.push('fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(plan)) errors.push('fit plan is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}
export function validateAppearanceFitPlan(plan) { return validatePlan(plan, APPEARANCE_FIT_SCHEMA, 'appearance'); }
export function validateLightingCalibrationPlan(plan) { return validatePlan(plan, LIGHTING_FIT_SCHEMA, 'rendering'); }

function vectors(plan) {
  const baseline = plan.variables.map((v) => v.initial), values = [baseline];
  for (let index = 0; index < plan.variables.length && values.length < plan.evaluationBudget; index += 1) {
    const variable = plan.variables[index];
    for (const candidate of [variable.minimum, variable.maximum, (variable.minimum + variable.initial) / 2, (variable.maximum + variable.initial) / 2]) {
      if (values.length >= plan.evaluationBudget) break;
      const next = [...baseline]; next[index] = candidate;
      if (!values.some((item) => item.every((x, i) => Math.abs(x - next[i]) < 1e-12))) values.push(next);
    }
  }
  let cursor = 0;
  while (values.length < plan.evaluationBudget) {
    const next = plan.variables.map((v, i) => v.minimum + (((cursor * (i + 1) + 13 * i) % 100003) / 100002) * (v.maximum - v.minimum)); cursor += 1;
    if (!values.some((item) => item.every((x, i) => Math.abs(x - next[i]) < 1e-12))) values.push(next);
  }
  return values;
}
function score(measurements, objectives) {
  let objectiveLoss = 0; const normalized = {}; const decomposition = [];
  for (const objective of objectives) { const value = finite(measurements?.[objective.id], `measurements.${objective.id}`); normalized[objective.id] = value; const contribution = value * objective.weight; objectiveLoss += contribution; decomposition.push({id: objective.id, value, contribution}); }
  return {measurements: normalized, objectiveLoss, decomposition};
}

async function fit(plan, evaluate, {verifyReference, schema, owner}) {
  const validation = validatePlan(plan, schema, owner); if (!validation.valid) throw new Error(`fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof evaluate !== 'function') throw new Error('evaluate must be a function');
  const trials = [];
  for (const vector of vectors(plan)) {
    const sequence = trials.length + 1, id = `fit-trial-${String(sequence).padStart(4, '0')}`;
    const parameters = Object.fromEntries(plan.variables.map((v, i) => [v.id, vector[i]]));
    const raw = await evaluate(deepFreeze(parameters), deepFreeze({trialId: id, sequence, planDigest: plan.planDigest}));
    if (!raw || typeof raw !== 'object') throw new Error(`${id} evaluator result must be an object`);
    if (plan.geometryDigest != null && raw.geometryDigest !== plan.geometryDigest) throw new Error(`${id} geometryDigest does not preserve the frozen geometry state`);
    if (plan.frameDigest != null && raw.frameDigest !== plan.frameDigest) throw new Error(`${id} frameDigest does not preserve the requested frame`);
    if (raw.renderEvidence && typeof verifyReference === 'function') await verifyReference(raw.renderEvidence, `${id}.renderEvidence`);
    const candidateAsset = contentReference(raw.candidateAsset, `${id}.candidateAsset`);
    trials.push(deepFreeze({id, sequence, parameters, candidateAsset, ...score(raw.measurements, plan.objectives), renderEvidence: raw.renderEvidence ?? null, evidenceRefs: uniqueStrings(raw.evidenceRefs)}));
  }
  const selected = [...trials].sort((a, b) => a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence)[0], baseline = trials[0], improvement = baseline.objectiveLoss - selected.objectiveLoss;
  const payload = {schema, plan, planDigest: plan.planDigest, ownerCapability: owner, scopeId: plan.scopeId, sourceSha256: plan.sourceSha256, baselineTrialId: baseline.id, selectedTrialId: selected.id, status: selected.id !== baseline.id && improvement > plan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT', objectiveImprovement: improvement, evaluationCount: trials.length, trials, policy: plan.policy};
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function fitAppearance(plan, evaluate, options = {}) { return fit(plan, evaluate, {...options, schema: APPEARANCE_FIT_SCHEMA, owner: 'appearance'}); }
export function fitLighting(plan, evaluate, options = {}) { return fit(plan, evaluate, {...options, schema: LIGHTING_FIT_SCHEMA, owner: 'rendering'}); }

function validateReport(report, schema, owner) {
  const errors = [];
  try {
    if (report?.schema !== schema) errors.push('invalid schema');
    if (report?.ownerCapability !== owner) errors.push(`fit owner must be ${owner}`);
    if (report?.policy?.ownerLocalOnly !== true || report?.policy?.geometryFrozen !== true) errors.push('frozen geometry policy is missing');
    if (!report?.plan || report.planDigest !== report.plan.planDigest) errors.push('fit report does not embed its exact plan');
    for (const trial of report?.trials ?? []) {
      if (!trial?.parameters || !Number.isFinite(trial.objectiveLoss)) errors.push(`${trial?.id ?? '?'} trial is incomplete`);
      try { contentReference(trial.candidateAsset, `${trial?.id ?? '?'}.candidateAsset`); } catch (error) { errors.push(error.message); }
    }
    const payload = structuredClone(report); delete payload.reportDigest; if (digestJson(payload) !== report.reportDigest) errors.push('fit report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}
export function validateAppearanceFitReport(report) { return validateReport(report, APPEARANCE_FIT_SCHEMA, 'appearance'); }
export function validateLightingFitReport(report) { return validateReport(report, LIGHTING_FIT_SCHEMA, 'rendering'); }

export function materialParametersFromTrial(plan, trial) { return Object.fromEntries(plan.variables.filter((v) => v.binding.startsWith('appearance.material.')).map((v) => [v.binding, trial.parameters[v.id]])); }
export function lightingParametersFromTrial(plan, trial) { return Object.fromEntries(plan.variables.filter((v) => v.binding.startsWith('lighting.')).map((v) => [v.binding, trial.parameters[v.id]])); }

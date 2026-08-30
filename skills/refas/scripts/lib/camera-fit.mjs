import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {normalizeProjectionCamera} from './realized-projection.mjs';

/**
 * Bounded camera fitting is deliberately a small owner-local search.  It
 * ranks already evaluated camera candidates; it does not mutate project state
 * and has no certification authority.
 */
export const CAMERA_FIT_SCHEMA = 'refas.camera-fit/v1';
export const CAMERA_FIT_OWNER = 'spatial-hypotheses';
const CAMERA_BINDINGS = new Set([
  'camera.fovY', 'camera.orthoHeight', 'camera.roll',
  'camera.position.x', 'camera.position.y', 'camera.position.z',
  'camera.target.x', 'camera.target.y', 'camera.target.z',
]);
const CAMERA_PROJECTIONS = new Set(['perspective', 'orthographic']);

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
};

function uniqueStrings(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function normalizeVariable(raw, index) {
  const label = `variables[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const binding = String(raw?.binding ?? '').trim();
  if (!CAMERA_BINDINGS.has(binding)) throw new Error(`${label}.binding must be a supported camera binding`);
  const minimum = finite(raw?.minimum, `${label}.minimum`);
  const maximum = finite(raw?.maximum, `${label}.maximum`);
  const initial = finite(raw?.initial, `${label}.initial`);
  if (!(maximum > minimum) || initial < minimum || initial > maximum) throw new Error(`${label} bounds do not contain initial`);
  const step = finite(raw?.step ?? (maximum - minimum) / 8, `${label}.step`);
  if (!(step > 0)) throw new Error(`${label}.step must be positive`);
  return {id, binding, minimum, maximum, initial, step, evidenceRefs: uniqueStrings(raw?.evidenceRefs)};
}

function normalizeObjectives(values = []) {
  const objectives = values.length ? values : [{id: 'macro-camera-loss', goal: 'minimize', weight: 1, scale: 1}];
  return objectives.map((raw, index) => {
    const id = assertId(raw?.id, `objectives[${index}].id`);
    const goal = String(raw?.goal ?? 'minimize');
    if (goal !== 'minimize') throw new Error(`objectives[${index}].goal must be minimize`);
    const scale = finite(raw?.scale ?? 1, `objectives[${index}].scale`);
    const weight = finite(raw?.weight ?? 1, `objectives[${index}].weight`);
    if (!(scale > 0 && weight > 0)) throw new Error(`objectives[${index}] scale and weight must be positive`);
    return {id, goal, scale, weight};
  });
}

export function createCameraFitPlan({
  id, scopeId, sourceSha256, baselineCamera, hypothesisId,
  variables = [], objectives = [], projectionCandidates = [], evaluationBudget = 64,
  improvementTolerance = 1e-6, evidenceRefs = [],
} = {}) {
  if (!variables.length) throw new Error('camera fitting requires at least one bounded variable');
  if (new Set(variables.map((item) => item.id)).size !== variables.length) throw new Error('camera variable IDs must be unique');
  const camera = normalizeProjectionCamera(baselineCamera);
  const projections = [...new Set((projectionCandidates.length ? projectionCandidates : [camera.projection]).map((value) => String(value).toLowerCase()))];
  if (!projections.length || projections.some((value) => !CAMERA_PROJECTIONS.has(value))) throw new Error('projectionCandidates must contain perspective or orthographic');
  if (projections.length > 1 && variables.some((variable) => ['camera.fovY', 'camera.orthoHeight'].includes(String(variable?.binding)))) {
    throw new Error('projection choice plans may only bind camera variables shared by both projections');
  }
  for (const variable of variables) {
    const binding = String(variable?.binding ?? '');
    if (camera.projection === 'perspective' && binding === 'camera.orthoHeight') throw new Error('perspective camera plans cannot bind camera.orthoHeight');
    if (camera.projection === 'orthographic' && binding === 'camera.fovY') throw new Error('orthographic camera plans cannot bind camera.fovY');
  }
  const budget = Number(evaluationBudget);
  if (!Number.isInteger(budget) || budget < 2) throw new Error('evaluationBudget must be at least two');
  const tolerance = finite(improvementTolerance, 'improvementTolerance');
  if (tolerance < 0) throw new Error('improvementTolerance must be non-negative');
  const payload = {
    schema: CAMERA_FIT_SCHEMA,
    id: assertId(id, 'id'),
    ownerCapability: CAMERA_FIT_OWNER,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    hypothesisId: assertId(hypothesisId, 'hypothesisId'),
    baselineCamera: camera,
    baselineCameraDigest: digestJson(camera),
    projectionCandidates: projections,
    variables: variables.map(normalizeVariable),
    objectives: normalizeObjectives(objectives),
    evaluationBudget: budget,
    improvementTolerance: tolerance,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      cameraOwnerOnly: true,
      cameraFitDoesNotMutateGeometry: true,
      metricsCannotSelectOwner: true,
      metricsCannotPassVisualGate: true,
      selectedCandidateRequiresActualVisualReview: true,
      oneCheckpointCandidateAfterSelection: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateCameraFitPlan(plan) {
  const errors = [];
  try {
    if (plan?.schema !== CAMERA_FIT_SCHEMA) errors.push('invalid schema');
    if (plan?.ownerCapability !== CAMERA_FIT_OWNER) errors.push(`camera fit owner must be ${CAMERA_FIT_OWNER}`);
    const recreated = createCameraFitPlan(plan);
    if (recreated.planDigest !== plan.planDigest) errors.push('camera fit plan digest mismatch');
    if (digestJson(recreated) !== digestJson(plan)) errors.push('camera fit plan is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function setBinding(cameraInput, binding, value) {
  const camera = structuredClone(cameraInput);
  // The normalized camera carries a derived basis. Any position/target/up
  // edit invalidates that cached basis, so let normalization recompute it.
  delete camera.basis;
  const number = finite(value, `${binding} value`);
  if (binding === 'camera.fovY') camera.fovY = number;
  else if (binding === 'camera.orthoHeight') camera.orthoHeight = number;
  else if (binding === 'camera.position.x') camera.position[0] = number;
  else if (binding === 'camera.position.y') camera.position[1] = number;
  else if (binding === 'camera.position.z') camera.position[2] = number;
  else if (binding === 'camera.target.x') camera.target[0] = number;
  else if (binding === 'camera.target.y') camera.target[1] = number;
  else if (binding === 'camera.target.z') camera.target[2] = number;
  else if (binding === 'camera.roll') {
    const base = normalizeProjectionCamera(camera);
    const angle = number * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle);
    camera.up = [base.up[0] * c + base.right[0] * s, base.up[1] * c + base.right[1] * s, base.up[2] * c + base.right[2] * s];
  }
  return normalizeProjectionCamera(camera);
}

function withProjection(cameraInput, projection) {
  const camera = structuredClone(cameraInput);
  if (!projection || projection === camera.projection) return camera;
  const distance = Math.hypot(...camera.position.map((value, index) => value - camera.target[index]));
  if (!(distance > 1e-8)) throw new Error('camera projection conversion requires non-degenerate position and target');
  if (projection === 'orthographic') {
    const fovY = Number(camera.fovY ?? 45);
    camera.orthoHeight = 2 * distance * Math.tan(fovY * Math.PI / 360);
  } else if (projection === 'perspective') {
    const orthoHeight = Number(camera.orthoHeight ?? 2);
    camera.fovY = 2 * Math.atan(orthoHeight / (2 * distance)) * 180 / Math.PI;
  } else throw new Error(`unsupported camera projection: ${projection}`);
  camera.projection = projection;
  return camera;
}

export function cameraFromParameters(baselineCamera, variables, values = {}, projection = null) {
  let camera = withProjection(normalizeProjectionCamera(baselineCamera), projection);
  for (const variable of variables) camera = setBinding(camera, variable.binding, values[variable.id] ?? variable.initial);
  return camera;
}

function measurementsLoss(measurements, objectives) {
  let loss = 0;
  const normalized = {};
  const decomposition = [];
  for (const objective of objectives) {
    const value = finite(measurements?.[objective.id], `measurements.${objective.id}`);
    normalized[objective.id] = value;
    const contribution = value / objective.scale * objective.weight;
    decomposition.push({id: objective.id, value, contribution});
    loss += contribution;
  }
  return {measurements: normalized, decomposition, objectiveLoss: loss};
}

function compare(a, b) { return a.objectiveLoss - b.objectiveLoss || a.sequence - b.sequence; }

function candidateValues(plan) {
  const values = plan.variables.map((variable) => variable.initial);
  const candidates = [values];
  for (let dimension = 0; dimension < plan.variables.length && candidates.length < plan.evaluationBudget; dimension += 1) {
    const variable = plan.variables[dimension];
    const positions = [variable.minimum, variable.maximum, variable.initial - variable.step, variable.initial + variable.step];
    for (const value of positions) {
      if (candidates.length >= plan.evaluationBudget) break;
      const next = [...values]; next[dimension] = Math.min(variable.maximum, Math.max(variable.minimum, value));
      if (!candidates.some((item) => item.every((v, index) => Math.abs(v - next[index]) < 1e-12))) candidates.push(next);
    }
  }
  let cursor = 0;
  while (candidates.length < plan.evaluationBudget) {
    const next = [...values];
    for (let dimension = 0; dimension < plan.variables.length; dimension += 1) {
      const variable = plan.variables[dimension];
      // A mixed-radix lattice gives deterministic, non-repeating bounded
      // candidates even when the requested budget is larger than nine.
      const phase = ((cursor * (dimension + 1) + dimension * 17) % 1000003) / 1000002;
      next[dimension] = variable.minimum + phase * (variable.maximum - variable.minimum);
    }
    cursor += 1;
    if (!candidates.some((item) => item.every((v, index) => Math.abs(v - next[index]) < 1e-12))) candidates.push(next);
  }
  return candidates;
}

/** Run a deterministic bounded camera search over an evaluator callback. */
export async function fitCamera(plan, evaluate, {verifyReference = null} = {}) {
  const validation = validateCameraFitPlan(plan);
  if (!validation.valid) throw new Error(`camera fit plan is invalid: ${validation.errors.join('; ')}`);
  if (typeof evaluate !== 'function') throw new Error('evaluate must be a function');
  const trials = [];
  const vectors = candidateValues(plan);
  const projections = plan.projectionCandidates ?? [normalizeProjectionCamera(plan.baselineCamera).projection];
  // Interleave projection hypotheses so a bounded budget still evaluates
  // every declared projection instead of spending the entire budget on the
  // first camera family.
  const candidates = vectors.flatMap((values) => projections.map((projection) => ({projection, values})));
  for (const {projection, values} of candidates.slice(0, plan.evaluationBudget)) {
    const sequence = trials.length + 1;
    const camera = cameraFromParameters(plan.baselineCamera, plan.variables, Object.fromEntries(plan.variables.map((v, i) => [v.id, values[i]])), projection);
    const raw = await evaluate(camera, deepFreeze({trialId: `camera-trial-${String(sequence).padStart(4, '0')}`, sequence, planDigest: plan.planDigest, hypothesisId: plan.hypothesisId}));
    if (!raw || typeof raw !== 'object') throw new Error(`camera trial ${sequence} evaluator result must be an object`);
    const score = measurementsLoss(raw.measurements, plan.objectives);
    if (raw.renderEvidence && typeof verifyReference === 'function') await verifyReference(raw.renderEvidence, `camera-trial-${sequence}.renderEvidence`);
    trials.push(deepFreeze({id: `camera-trial-${String(sequence).padStart(4, '0')}`, sequence, projection, parameters: Object.fromEntries(plan.variables.map((v, i) => [v.id, values[i]])), camera, cameraDigest: digestJson(camera), ...score, renderEvidence: raw.renderEvidence ?? null, evidenceRefs: uniqueStrings(raw.evidenceRefs)}));
  }
  const selected = [...trials].sort(compare)[0];
  const baseline = trials[0];
  const improvement = baseline.objectiveLoss - selected.objectiveLoss;
  const payload = {
    schema: CAMERA_FIT_SCHEMA,
    plan, planDigest: plan.planDigest, ownerCapability: CAMERA_FIT_OWNER,
    scopeId: plan.scopeId, sourceSha256: plan.sourceSha256, hypothesisId: plan.hypothesisId,
    baselineTrialId: baseline.id, selectedTrialId: selected.id,
    status: selected.id !== baseline.id && improvement > plan.improvementTolerance ? 'IMPROVED' : 'NO_IMPROVEMENT',
    objectiveImprovement: improvement, evaluationCount: trials.length, trials,
    policy: plan.policy,
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateCameraFitReport(report, plan = null) {
  const errors = [];
  try {
    if (report?.schema !== CAMERA_FIT_SCHEMA) errors.push('invalid schema');
    if (report?.ownerCapability !== CAMERA_FIT_OWNER) errors.push(`camera fit owner must be ${CAMERA_FIT_OWNER}`);
    if (!report?.policy?.cameraOwnerOnly || !report?.policy?.cameraFitDoesNotMutateGeometry) errors.push('camera owner policy is missing');
    const bound = plan ?? report?.plan;
    if (!bound || report?.planDigest !== bound.planDigest) errors.push('camera report does not bind its plan');
    for (const trial of report?.trials ?? []) { assertDigest(trial.cameraDigest, `${trial.id}.cameraDigest`); normalizeProjectionCamera(trial.camera); }
    const payload = structuredClone(report); delete payload.reportDigest; if (digestJson(payload) !== report.reportDigest) errors.push('camera fit report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

/** Build a camera evaluator from realized source-space landmark evidence. */
export function createRealizedCameraEvaluator({referenceGeometry, glb, anchorBindings = [], cameraHypothesisId, objectiveId = 'macro-camera-loss', evidenceRefs = []} = {}) {
  if (!referenceGeometry || !glb) throw new Error('referenceGeometry and glb are required');
  return async (camera) => {
    // Importing lazily avoids a module cycle with realized-projection's camera
    // normalization while keeping this boundary useful to callers.
    const {createRealizedProjection} = await import('./realized-projection.mjs');
    const proof = createRealizedProjection({referenceGeometry, glb, cameraHypothesisId, camera, anchorBindings, evidenceRefs});
    return {measurements: {[objectiveId]: proof.projectionFit.metrics.macroAnchorRmseNormalized ?? Infinity, ...cameraFitMeasurementsFromProjection(proof)}, evidenceRefs};
  };
}

/** Map realized projection evidence to explicit camera-fitting objectives. */
export function cameraFitMeasurementsFromProjection(proof) {
  const metrics = proof?.projectionFit?.metrics ?? {};
  return {
    'macro-anchor-rmse': Number(metrics.macroAnchorRmseNormalized ?? Infinity),
    'chain-angle-error': Number(metrics.chainAngleRmseDegrees ?? Infinity) / 180,
    'negative-space-loss': metrics.negativeSpaceMeanIoU == null ? Infinity : 1 - Number(metrics.negativeSpaceMeanIoU),
    'bbox-loss': metrics.dimensionMeanRelativeError == null ? Infinity : Number(metrics.dimensionMeanRelativeError),
    'occlusion-loss': Number(metrics.occlusionOrderViolations ?? 0),
  };
}

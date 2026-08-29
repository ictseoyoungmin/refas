import {assertDigest, deepFreeze, digestBytes} from './canonical.mjs';
import {findingsFromRealizedProjection} from './projection-findings.mjs';
import {fitParameters, createParameterFitPlan, validateParameterFitPlan} from './parameter-fit.mjs';
import {createRealizedProjection, validateRealizedProjection} from './realized-projection.mjs';

export const PROJECTION_REPAIR_METRIC_IDS = Object.freeze([
  'macro-anchor-rmse',
  'chain-angle-error',
  'negative-space-loss',
  'segment-iou-loss',
  'interface-boundary-error',
]);

const METRIC_SET = new Set(PROJECTION_REPAIR_METRIC_IDS);

function finiteMetric(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a finite non-negative number`);
  return number;
}

function assertGeometryBinding(binding, label) {
  const value = String(binding ?? '').trim();
  if (!/^model\.(?:shape|geometry)\.[a-z0-9._:-]+$/u.test(value)) {
    throw new Error(`${label} must bind a model.shape or model.geometry parameter`);
  }
  return value;
}

function normalizedLoss(value, label, fallback = 0) {
  if (value == null) return fallback;
  return finiteMetric(value, label);
}

/**
 * Convert an actual realized projection into the bounded shape-repair loss
 * vocabulary. These values are derived from the exact GLB hierarchy and
 * digest-bound camera; callers cannot provide projected coordinates here.
 */
export function projectionResidualMeasurements(proof) {
  const validation = validateRealizedProjection(proof);
  if (!validation.valid) throw new Error(`realized projection is invalid: ${validation.errors.join('; ')}`);
  const projection = proof.projectionFit.metrics;
  const measurements = {
    'macro-anchor-rmse': normalizedLoss(projection.macroAnchorRmseNormalized, 'macroAnchorRmseNormalized'),
    'chain-angle-error': normalizedLoss(projection.chainAngleRmseDegrees, 'chainAngleRmseDegrees') / 180,
    'negative-space-loss': projection.negativeSpaceMeanIoU == null ? 0 : 1 - finiteMetric(projection.negativeSpaceMeanIoU, 'negativeSpaceMeanIoU'),
    'segment-iou-loss': proof.segmentationMetrics?.sourceVisibleSegmentMeanIoU == null ? 0 : 1 - finiteMetric(proof.segmentationMetrics.sourceVisibleSegmentMeanIoU, 'sourceVisibleSegmentMeanIoU'),
    'interface-boundary-error': normalizedLoss(proof.segmentationMetrics?.interfaceBoundaryMeanErrorNormalized, 'interfaceBoundaryMeanErrorNormalized'),
  };
  return deepFreeze(measurements);
}

export function validateProjectionRepairPlan(plan) {
  const validation = validateParameterFitPlan(plan);
  const errors = [...validation.errors];
  for (const parameter of plan?.parameters ?? []) {
    try { assertGeometryBinding(parameter.binding, `parameter ${parameter.id}.binding`); }
    catch (error) { errors.push(error.message); }
  }
  for (const objective of plan?.objectives ?? []) {
    if (!METRIC_SET.has(objective.id)) errors.push(`objective ${objective.id} is not a projection repair metric`);
    else if (objective.goal !== 'minimize') errors.push(`projection repair objective ${objective.id} must minimize residual error`);
  }
  return {valid: errors.length === 0, errors};
}

/**
 * Create a shape-only plan whose objective IDs are guaranteed to map to
 * realized projection residuals. Camera, appearance, and lighting bindings
 * are rejected at this boundary and must be fitted by their owning capability.
 */
export function createProjectionRepairPlan(options = {}) {
  const plan = createParameterFitPlan(options);
  const validation = validateProjectionRepairPlan(plan);
  if (!validation.valid) throw new Error(`projection repair plan is invalid: ${validation.errors.join('; ')}`);
  return plan;
}

function normalizeGlb(value, label) {
  const glb = Buffer.from(value?.glb ?? value ?? []);
  if (!glb.length) throw new Error(`${label} must return non-empty exact GLB bytes`);
  return glb;
}

function normalizedFindings(proof, thresholds) {
  return findingsFromRealizedProjection(proof, thresholds);
}

function blockingCategoryCounts(findings) {
  const counts = new Map();
  for (const finding of findings) if (finding.blocking) counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  return counts;
}

function blockingRegressions(baselineFindings, selectedFindings) {
  const baseline = blockingCategoryCounts(baselineFindings);
  const selected = blockingCategoryCounts(selectedFindings);
  return [...selected.entries()]
    .filter(([category, count]) => count > (baseline.get(category) ?? 0))
    .map(([category, count]) => ({category, baselineCount: baseline.get(category) ?? 0, selectedCount: count}));
}

/**
 * Build the concrete evaluator required by the projection repair loop. Each
 * trial is generated as exact GLB bytes, re-projected through the real
 * hierarchy/camera, and then rendered by the caller before entering the
 * generic evidence-verifying parameter ledger.
 */
export function createProjectionRepairEvaluator({
  plan,
  referenceGeometry,
  cameraHypothesisId,
  camera,
  anchorBindings = [],
  segmentBindings = [],
  buildCandidate,
  renderCandidate,
  thresholds = {},
} = {}) {
  const validation = validateProjectionRepairPlan(plan);
  if (!validation.valid) throw new Error(`projection repair plan is invalid: ${validation.errors.join('; ')}`);
  if (referenceGeometry?.scopeId !== plan.scopeId) throw new Error('reference geometry scope does not match the fit plan');
  if (referenceGeometry?.sourceSha256 !== plan.sourceSha256) throw new Error('reference geometry source digest does not match the fit plan');
  if (typeof buildCandidate !== 'function') throw new Error('buildCandidate must return exact GLB bytes for each parameter vector');
  if (typeof renderCandidate !== 'function') throw new Error('renderCandidate must render each exact candidate GLB and return verified content references');

  const proofs = new Map();
  const projectionArgs = {referenceGeometry, cameraHypothesisId, camera, anchorBindings, segmentBindings, evidenceRefs: plan.evidenceRefs};
  const evaluate = async (parameters, context) => {
    const glb = normalizeGlb(await buildCandidate(parameters, context), `candidate ${context.trialId}`);
    const proof = createRealizedProjection({...projectionArgs, glb});
    const rendered = await renderCandidate({glb, parameters, context, proof});
    if (!rendered || typeof rendered !== 'object') throw new Error(`candidate ${context.trialId} renderer must return an object`);
    if (rendered.candidateAsset?.sha256 !== digestBytes(glb)) throw new Error(`candidate ${context.trialId} candidateAsset must bind the exact generated GLB bytes`);
    if (!rendered.candidateAsset || !rendered.renderEvidence) throw new Error(`candidate ${context.trialId} renderer must return candidateAsset and renderEvidence references`);
    proofs.set(context.trialId, proof);
    return {measurements: projectionResidualMeasurements(proof), ...rendered};
  };
  return deepFreeze({evaluate, proofs});
}

/**
 * Run one bounded, shape-owned repair loop. The returned decision is advisory:
 * KEEP means the ranked candidate improved the declared loss without adding a
 * blocking finding; ROLLBACK leaves project state untouched and retains the
 * report/evidence for routing or review.
 */
export async function repairShapeFromProjection({
  plan,
  baselineGlb,
  referenceGeometry,
  cameraHypothesisId,
  camera,
  anchorBindings = [],
  segmentBindings = [],
  buildCandidate,
  renderCandidate,
  verifyReference,
  thresholds = {},
} = {}) {
  const validation = validateProjectionRepairPlan(plan);
  if (!validation.valid) throw new Error(`projection repair plan is invalid: ${validation.errors.join('; ')}`);
  const baselineBytes = normalizeGlb(baselineGlb, 'baselineGlb');
  assertDigest(plan.baselineAsset.sha256, 'plan.baselineAsset.sha256');
  if (digestBytes(baselineBytes) !== plan.baselineAsset.sha256) throw new Error('baselineGlb does not match plan.baselineAsset SHA-256');
  const baselineProof = createRealizedProjection({referenceGeometry, glb: baselineBytes, cameraHypothesisId, camera, anchorBindings, segmentBindings, evidenceRefs: plan.evidenceRefs});
  const baselineFindings = normalizedFindings(baselineProof, thresholds);
  const evaluator = createProjectionRepairEvaluator({plan, referenceGeometry, cameraHypothesisId, camera, anchorBindings, segmentBindings, buildCandidate, renderCandidate, thresholds});
  const report = await fitParameters(plan, evaluator.evaluate, {verifyReference});
  const selectedProof = evaluator.proofs.get(report.selectedTrialId);
  if (!selectedProof) throw new Error(`selected trial ${report.selectedTrialId} did not produce realized projection evidence`);
  const selectedFindings = normalizedFindings(selectedProof, thresholds);
  const regressions = blockingRegressions(baselineFindings, selectedFindings);
  const decision = report.status === 'IMPROVED' && regressions.length === 0 ? 'KEEP' : 'ROLLBACK';
  return deepFreeze({
    baselineProof,
    baselineFindings,
    report,
    selectedProof,
    selectedFindings,
    blockingRegressions: regressions,
    decision,
    decisionReason: decision === 'KEEP'
      ? 'selected projection-repair trial improved the bounded objective without adding a blocking typed finding'
      : report.status !== 'IMPROVED'
        ? 'no eligible projection-repair trial improved the bounded objective'
        : 'selected projection-repair trial introduced a new blocking typed finding',
  });
}

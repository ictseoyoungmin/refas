import {assertDigest, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {findingsFromRealizedProjection} from './projection-findings.mjs';
import {fitParameters, createParameterFitPlan, validateParameterFitPlan} from './parameter-fit.mjs';
import {createRealizedProjection, normalizeProjectionCamera, validateRealizedProjection} from './realized-projection.mjs';

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

function requiredResidual(value, label) {
  if (value == null) throw new Error(`${label} is unevaluable; the reference evidence required by this objective is missing`);
  return finiteMetric(value, label);
}

/**
 * Convert an actual realized projection into the bounded shape-repair loss
 * vocabulary. These values are derived from the exact GLB hierarchy and
 * digest-bound camera; callers cannot provide projected coordinates here.
 */
export function projectionResidualMeasurements(proof, objectiveIds = PROJECTION_REPAIR_METRIC_IDS) {
  const validation = validateRealizedProjection(proof);
  if (!validation.valid) throw new Error(`realized projection is invalid: ${validation.errors.join('; ')}`);
  const requested = [...new Set(objectiveIds.map(String))];
  for (const id of requested) if (!METRIC_SET.has(id)) throw new Error(`objective ${id} is not a projection repair metric`);
  const projection = proof.projectionFit.metrics;
  const measurements = {};
  for (const id of requested) {
    measurements[id] = {
      'macro-anchor-rmse': () => requiredResidual(projection.macroAnchorRmseNormalized, 'macroAnchorRmseNormalized'),
      'chain-angle-error': () => requiredResidual(projection.chainAngleRmseDegrees, 'chainAngleRmseDegrees') / 180,
      'negative-space-loss': () => 1 - requiredResidual(projection.negativeSpaceMeanIoU, 'negativeSpaceMeanIoU'),
      'segment-iou-loss': () => 1 - requiredResidual(proof.segmentationMetrics?.sourceVisibleSegmentMeanIoU, 'sourceVisibleSegmentMeanIoU'),
      'interface-boundary-error': () => requiredResidual(proof.segmentationMetrics?.interfaceBoundaryMeanErrorNormalized, 'interfaceBoundaryMeanErrorNormalized'),
    }[id]();
  }
  return deepFreeze(measurements);
}

function referenceObjectiveErrors(referenceGeometry, objectives = []) {
  if (!referenceGeometry) return [];
  const errors = [];
  const hasMacroAnchors = (referenceGeometry.anchors ?? []).some((anchor) => anchor.importance !== 'detail' && !['occluded', 'inferred'].includes(anchor.visibility));
  const hasChain = (referenceGeometry.chains ?? []).some((chain) => (chain.anchorIds ?? []).length >= 2);
  const hasNegativeSpace = (referenceGeometry.negativeSpaces ?? []).length > 0;
  const hasSegments = (referenceGeometry.segments ?? []).some((segment) => segment.importance !== 'detail' && !['occluded', 'inferred'].includes(segment.visibility));
  const hasInterface = (referenceGeometry.interfaces ?? []).length > 0;
  for (const objective of objectives) {
    const available = {
      'macro-anchor-rmse': hasMacroAnchors,
      'chain-angle-error': hasChain,
      'negative-space-loss': hasNegativeSpace,
      'segment-iou-loss': hasSegments,
      'interface-boundary-error': hasInterface && hasSegments,
    }[objective.id];
    if (available === false) errors.push(`objective ${objective.id} requires reference evidence that is not declared by the reference geometry`);
  }
  return errors;
}

export function validateProjectionRepairPlan(plan, referenceGeometry = null) {
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
  errors.push(...referenceObjectiveErrors(referenceGeometry, plan?.objectives ?? []));
  return {valid: errors.length === 0, errors};
}

/**
 * Create a shape-only plan whose objective IDs are guaranteed to map to
 * realized projection residuals. Camera, appearance, and lighting bindings
 * are rejected at this boundary and must be fitted by their owning capability.
 */
export function createProjectionRepairPlan(options = {}) {
  const {referenceGeometry = null, ...planOptions} = options;
  const plan = createParameterFitPlan(planOptions);
  const validation = validateProjectionRepairPlan(plan, referenceGeometry);
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

function findingCheckId(finding) {
  return finding.checkId ?? `${finding.category}:${finding.scopeId}`;
}

function blockingCheckCounts(findings) {
  const counts = new Map();
  for (const finding of findings) if (finding.blocking) {
    const checkId = findingCheckId(finding);
    counts.set(checkId, (counts.get(checkId) ?? 0) + 1);
  }
  return counts;
}

function blockingRegressions(baselineFindings, selectedFindings) {
  const baseline = blockingCheckCounts(baselineFindings);
  const selected = blockingCheckCounts(selectedFindings);
  return [...selected.entries()]
    .filter(([checkId, count]) => count > (baseline.get(checkId) ?? 0))
    .map(([checkId, count]) => ({checkId, baselineCount: baseline.get(checkId) ?? 0, selectedCount: count}));
}

function bytesFromReference(value, label) {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  throw new Error(`${label} reader must return exact bytes`);
}

async function readExactReference(reference, label, readReference) {
  const bytes = bytesFromReference(await readReference(reference, label), label);
  if (bytes.length !== reference.sizeBytes || digestBytes(bytes) !== reference.sha256) {
    throw new Error(`${label} bytes do not match its content reference`);
  }
  return bytes;
}

function validateRenderReportBinding(report, {assetSha256, camera, cameraDigest, frameDigest, label}) {
  if (!report || typeof report !== 'object') throw new Error(`${label} must be a parsed actual render report`);
  if (report.schema !== 'refas.multiview-render-report/v1') throw new Error(`${label}.schema must be refas.multiview-render-report/v1 from the portable renderer`);
  if (report.status !== 'PASS') throw new Error(`${label}.status must be PASS`);
  if (report.assetSha256 !== assetSha256) throw new Error(`${label}.assetSha256 must bind the exact candidate GLB`);
  if (report.asset?.sha256 != null && report.asset.sha256 !== report.assetSha256) throw new Error(`${label}.asset.sha256 must agree with assetSha256`);
  if (report.cameraDigest !== report.heroCameraDigest) throw new Error(`${label}.cameraDigest must agree with the renderer's heroCameraDigest`);
  assertDigest(report.heroCameraDigest, `${label}.heroCameraDigest`);
  if (!report.heroCamera || typeof report.heroCamera !== 'object') throw new Error(`${label}.heroCamera is required and must describe the actual hero render camera`);
  let normalizedHeroCamera;
  try { normalizedHeroCamera = normalizeProjectionCamera(report.heroCamera); }
  catch (error) { throw new Error(`${label}.heroCamera is invalid: ${error.message}`); }
  if (digestJson(report.heroCamera) !== digestJson(normalizedHeroCamera)) throw new Error(`${label}.heroCamera must be normalized and must not contain an unverifiable camera basis`);
  if (digestJson(normalizedHeroCamera) !== report.heroCameraDigest) throw new Error(`${label}.heroCameraDigest must be computed from the actual heroCamera`);
  if (report.heroCameraDigest !== cameraDigest || digestJson(normalizedHeroCamera) !== cameraDigest || digestJson(normalizedHeroCamera) !== digestJson(camera)) {
    throw new Error(`${label}.heroCamera must bind the realized projection camera`);
  }
  if (report.frameDigest !== frameDigest) throw new Error(`${label}.frameDigest must bind the requested render frame`);
  assertDigest(report.heroImageSha256, `${label}.heroImageSha256`);
  if (!report.renderer || typeof report.renderer.name !== 'string' || !report.renderer.name || typeof report.renderer.version !== 'string' || !report.renderer.version) {
    throw new Error(`${label}.renderer.name and renderer.version are required`);
  }
  const hero = Array.isArray(report.frames) ? report.frames.find((frame) => frame?.path === 'hero.png') : null;
  if (!hero || hero.sha256 !== report.heroImageSha256) throw new Error(`${label} must bind heroImageSha256 to the rendered hero frame`);
  if (digestJson(hero.camera) !== digestJson(report.heroCamera)) throw new Error(`${label} hero frame camera must agree with heroCamera`);
  if (hero.frameBinding?.frameDigest !== frameDigest) throw new Error(`${label} hero frame binding must agree with frameDigest`);
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
  frameDigest,
  buildCandidate,
  renderCandidate,
  readReference,
  thresholds = {},
} = {}) {
  const validation = validateProjectionRepairPlan(plan, referenceGeometry);
  if (!validation.valid) throw new Error(`projection repair plan is invalid: ${validation.errors.join('; ')}`);
  if (referenceGeometry?.scopeId !== plan.scopeId) throw new Error('reference geometry scope does not match the fit plan');
  if (referenceGeometry?.sourceSha256 !== plan.sourceSha256) throw new Error('reference geometry source digest does not match the fit plan');
  if (typeof buildCandidate !== 'function') throw new Error('buildCandidate must return exact GLB bytes for each parameter vector');
  if (typeof renderCandidate !== 'function') throw new Error('renderCandidate must render each exact candidate GLB and return verified content references');
  if (typeof readReference !== 'function') throw new Error('readReference must return exact bytes for candidate and render references');
  assertDigest(frameDigest, 'frameDigest');

  const proofs = new Map();
  const heroImages = new Map();
  const projectionArgs = {referenceGeometry, cameraHypothesisId, camera, anchorBindings, segmentBindings, evidenceRefs: plan.evidenceRefs};
  const evaluate = async (parameters, context) => {
    const glb = normalizeGlb(await buildCandidate(parameters, context), `candidate ${context.trialId}`);
    const proof = createRealizedProjection({...projectionArgs, glb});
    const rendered = await renderCandidate({glb, parameters, context, proof});
    if (!rendered || typeof rendered !== 'object') throw new Error(`candidate ${context.trialId} renderer must return an object`);
    if (!rendered.candidateAsset || !rendered.renderEvidence || !rendered.heroImage) throw new Error(`candidate ${context.trialId} renderer must return candidateAsset, renderEvidence, and heroImage references`);
    if (rendered.candidateAsset.kind !== 'glb') throw new Error(`candidate ${context.trialId} candidateAsset must be a GLB content reference`);
    if (rendered.renderEvidence.kind !== 'render-report') throw new Error(`candidate ${context.trialId} renderEvidence must be a render-report content reference`);
    if (rendered.heroImage.kind !== 'render-image') throw new Error(`candidate ${context.trialId} heroImage must be a render-image content reference`);
    const candidateBytes = await readExactReference(rendered.candidateAsset, `${context.trialId}.candidateAsset`, readReference);
    if (!candidateBytes.equals(glb)) throw new Error(`candidate ${context.trialId} candidateAsset must bind the exact generated GLB bytes`);
    const renderBytes = await readExactReference(rendered.renderEvidence, `${context.trialId}.renderEvidence`, readReference);
    let report;
    try { report = JSON.parse(renderBytes.toString('utf8')); }
    catch (error) { throw new Error(`candidate ${context.trialId} renderEvidence is not valid JSON: ${error.message}`); }
    validateRenderReportBinding(report, {assetSha256: proof.assetSha256, camera: proof.camera, cameraDigest: proof.cameraDigest, frameDigest, label: `${context.trialId}.renderEvidence`});
    const heroBytes = await readExactReference(rendered.heroImage, `${context.trialId}.heroImage`, readReference);
    if (digestBytes(heroBytes) !== report.heroImageSha256) throw new Error(`candidate ${context.trialId} heroImage must bind the report heroImageSha256`);
    proofs.set(context.trialId, proof);
    heroImages.set(context.trialId, rendered.heroImage);
    return {measurements: projectionResidualMeasurements(proof, plan.objectives.map((objective) => objective.id)), ...rendered};
  };
  return deepFreeze({evaluate, proofs, heroImages});
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
  frameDigest,
  buildCandidate,
  renderCandidate,
  verifyReference,
  readReference,
  thresholds = {},
} = {}) {
  const validation = validateProjectionRepairPlan(plan, referenceGeometry);
  if (!validation.valid) throw new Error(`projection repair plan is invalid: ${validation.errors.join('; ')}`);
  const baselineBytes = normalizeGlb(baselineGlb, 'baselineGlb');
  assertDigest(plan.baselineAsset.sha256, 'plan.baselineAsset.sha256');
  if (digestBytes(baselineBytes) !== plan.baselineAsset.sha256) throw new Error('baselineGlb does not match plan.baselineAsset SHA-256');
  const baselineProof = createRealizedProjection({referenceGeometry, glb: baselineBytes, cameraHypothesisId, camera, anchorBindings, segmentBindings, evidenceRefs: plan.evidenceRefs});
  const baselineFindings = normalizedFindings(baselineProof, thresholds);
  const evaluator = createProjectionRepairEvaluator({plan, referenceGeometry, cameraHypothesisId, camera, anchorBindings, segmentBindings, frameDigest, buildCandidate, renderCandidate, readReference, thresholds});
  const report = await fitParameters(plan, evaluator.evaluate, {verifyReference});
  for (const trial of report.trials) {
    const heroImage = evaluator.heroImages.get(trial.id);
    if (!heroImage) throw new Error(`${trial.id} did not retain a hero image reference`);
    await verifyReference(heroImage, `${trial.id}.heroImage.final`);
  }
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
    selectedHeroImage: evaluator.heroImages.get(report.selectedTrialId),
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

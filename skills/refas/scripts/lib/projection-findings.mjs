import {deepFreeze} from './canonical.mjs';
import {normalizeFinding} from './failure-router.mjs';
import {validateProjectionFit} from './projection-fit.mjs';
import {validateRealizedProjection} from './realized-projection.mjs';

export const DEFAULT_PROJECTION_FINDING_THRESHOLDS = Object.freeze({
  macroAnchorRmseNormalized: 0.035,
  macroAnchorMaxErrorNormalized: 0.06,
  chainAngleRmseDegrees: 8,
  axisAngleRmseDegrees: 8,
  contactMaxExcessNormalized: 0.025,
  negativeSpaceMeanIoU: 0.72,
  dimensionMeanRelativeError: 0.12,
  occlusionOrderViolations: 0,
  sourceVisibleSegmentMeanIoU: 0.68,
  interfaceBoundaryMeanErrorNormalized: 0.035,
  explicitOwnershipViolations: 0,
});

function evidence(fit, suffix) {
  return [...new Set([...(fit.evidenceRefs ?? []), `projection-fit:${fit.projectionFitDigest}:${suffix}`])];
}
function realizedEvidence(proof, suffix) {
  return [...new Set([...(proof.evidenceRefs ?? []), `realized-projection:${proof.realizedProjectionDigest}:${suffix}`])];
}
function typed(category, scopeId, summary, evidenceRefs, severity = 'blocking', checkId) {
  return normalizeFinding({category, severity, scopeId, summary, evidenceRefs, checkId});
}

export function comparisonMetricsFromProjectionFit(fit) {
  const validation = validateProjectionFit(fit);
  if (!validation.valid) throw new Error(`projection fit is invalid: ${validation.errors.join('; ')}`);
  return deepFreeze({
    landmarkResidualRmse: fit.metrics.macroAnchorRmseNormalized,
    landmarkResidualMax: fit.metrics.macroAnchorMaxErrorNormalized,
    chainAngleRmseDegrees: fit.metrics.chainAngleRmseDegrees,
    axisAngleRmseDegrees: fit.metrics.axisAngleRmseDegrees,
    contactMaxExcessNormalized: fit.metrics.contactMaxExcessNormalized,
    negativeSpaceIoU: fit.metrics.negativeSpaceMeanIoU,
    dimensionMeanRelativeError: fit.metrics.dimensionMeanRelativeError,
    occlusionOrderViolations: fit.metrics.occlusionOrderViolations,
    projectionFitDigest: fit.projectionFitDigest,
  });
}

export function findingsFromProjectionFit(fit, thresholds = {}) {
  const validation = validateProjectionFit(fit);
  if (!validation.valid) throw new Error(`projection fit is invalid: ${validation.errors.join('; ')}`);
  const t = {...DEFAULT_PROJECTION_FINDING_THRESHOLDS, ...thresholds}, m = fit.metrics, findings = [];
  const push = (category, summary, suffix, severity = 'blocking', checkId) => findings.push(typed(category, fit.scopeId, summary, evidence(fit, suffix), severity, checkId));
  if ((m.axisAngleRmseDegrees ?? 0) > t.axisAngleRmseDegrees || (m.chainAngleRmseDegrees ?? 0) > t.chainAngleRmseDegrees) push('orientation-mismatch', `Projected macro directions disagree with source evidence (chain ${m.chainAngleRmseDegrees ?? 'n/a'}°, axis ${m.axisAngleRmseDegrees ?? 'n/a'}° RMSE).`, 'orientation', 'blocking', 'projection.orientation');
  if ((m.macroAnchorRmseNormalized ?? 0) > t.macroAnchorRmseNormalized || (m.macroAnchorMaxErrorNormalized ?? 0) > t.macroAnchorMaxErrorNormalized || (m.dimensionMeanRelativeError ?? 0) > t.dimensionMeanRelativeError) push('mass-proportion-mismatch', `Projected macro anchors or dimensions materially disagree with the source (RMSE ${m.macroAnchorRmseNormalized ?? 'n/a'}, max ${m.macroAnchorMaxErrorNormalized ?? 'n/a'}).`, 'macro-anchors', 'blocking', 'projection.macro-anchor');
  if (m.negativeSpaceMeanIoU != null && m.negativeSpaceMeanIoU < t.negativeSpaceMeanIoU) push('silhouette-mismatch', `Projected negative spaces disagree with source evidence (mean IoU ${m.negativeSpaceMeanIoU}).`, 'negative-space', 'blocking', 'projection.negative-space');
  if (m.contactMaxExcessNormalized != null && m.contactMaxExcessNormalized > t.contactMaxExcessNormalized) push('attachment-mismatch', `Observed contact relationships are not preserved in projection (max excess ${m.contactMaxExcessNormalized}).`, 'contact', 'blocking', 'projection.contact');
  if ((m.occlusionOrderViolations ?? 0) > t.occlusionOrderViolations) push('occlusion-mismatch', `Projected depth order violates ${m.occlusionOrderViolations} observed occlusion relationship(s).`, 'occlusion', 'blocking', 'projection.occlusion');
  return deepFreeze(findings);
}

export function findingsFromRealizedProjection(proof, thresholds = {}) {
  const validation = validateRealizedProjection(proof);
  if (!validation.valid) throw new Error(`realized projection is invalid: ${validation.errors.join('; ')}`);
  const findings = [...findingsFromProjectionFit(proof.projectionFit, thresholds)];
  if (!proof.segmentationMetrics) return deepFreeze(findings);
  const t = {...DEFAULT_PROJECTION_FINDING_THRESHOLDS, ...thresholds}, m = proof.segmentationMetrics;
  if (m.sourceVisibleSegmentMeanIoU != null && m.sourceVisibleSegmentMeanIoU < t.sourceVisibleSegmentMeanIoU) {
    findings.push(typed('silhouette-mismatch', proof.scopeId, `Realized GLB part regions collapse or drift from source-visible macro/identity segments (mean segment IoU ${m.sourceVisibleSegmentMeanIoU}).`, realizedEvidence(proof, 'segments'), 'blocking', 'projection.segment-iou'));
  }
  if (m.interfaceBoundaryMeanErrorNormalized != null && m.interfaceBoundaryMeanErrorNormalized > t.interfaceBoundaryMeanErrorNormalized) {
    findings.push(typed('attachment-mismatch', proof.scopeId, `Realized part interfaces do not track source-visible boundaries (mean normalized boundary error ${m.interfaceBoundaryMeanErrorNormalized}).`, realizedEvidence(proof, 'interfaces'), 'blocking', 'projection.interface-boundary'));
  }
  if ((m.explicitOwnershipViolations ?? 0) > t.explicitOwnershipViolations) {
    findings.push(typed('attachment-mismatch', proof.scopeId, `${m.explicitOwnershipViolations} explicit source-visible physical interface(s) collapse into overlapping GLB mesh ownership.`, realizedEvidence(proof, 'ownership'), 'blocking', 'projection.ownership'));
  }
  return deepFreeze(findings);
}

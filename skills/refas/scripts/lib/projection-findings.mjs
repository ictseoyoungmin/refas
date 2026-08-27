import {deepFreeze} from './canonical.mjs';
import {normalizeFinding} from './failure-router.mjs';
import {validateProjectionFit} from './projection-fit.mjs';

export const DEFAULT_PROJECTION_FINDING_THRESHOLDS = Object.freeze({
  macroAnchorRmseNormalized: 0.035,
  macroAnchorMaxErrorNormalized: 0.06,
  chainAngleRmseDegrees: 8,
  axisAngleRmseDegrees: 8,
  contactMaxExcessNormalized: 0.025,
  negativeSpaceMeanIoU: 0.72,
  dimensionMeanRelativeError: 0.12,
  occlusionOrderViolations: 0,
});

function evidence(fit, suffix) {
  return [...new Set([...(fit.evidenceRefs ?? []), `projection-fit:${fit.projectionFitDigest}:${suffix}`])];
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
  const t = {...DEFAULT_PROJECTION_FINDING_THRESHOLDS, ...thresholds};
  const m = fit.metrics;
  const findings = [];
  const push = (category, summary, suffix, severity = 'blocking') => findings.push(normalizeFinding({
    category, severity, scopeId: fit.scopeId, summary, evidenceRefs: evidence(fit, suffix),
  }));

  if ((m.axisAngleRmseDegrees ?? 0) > t.axisAngleRmseDegrees || (m.chainAngleRmseDegrees ?? 0) > t.chainAngleRmseDegrees) {
    push('orientation-mismatch', `Projected macro directions disagree with source evidence (chain ${m.chainAngleRmseDegrees ?? 'n/a'}°, axis ${m.axisAngleRmseDegrees ?? 'n/a'}° RMSE).`, 'orientation');
  }
  if ((m.macroAnchorRmseNormalized ?? 0) > t.macroAnchorRmseNormalized || (m.macroAnchorMaxErrorNormalized ?? 0) > t.macroAnchorMaxErrorNormalized || (m.dimensionMeanRelativeError ?? 0) > t.dimensionMeanRelativeError) {
    push('mass-proportion-mismatch', `Projected macro anchors or dimensions materially disagree with the source (RMSE ${m.macroAnchorRmseNormalized ?? 'n/a'}, max ${m.macroAnchorMaxErrorNormalized ?? 'n/a'}).`, 'macro-anchors');
  }
  if (m.negativeSpaceMeanIoU != null && m.negativeSpaceMeanIoU < t.negativeSpaceMeanIoU) {
    push('silhouette-mismatch', `Projected negative spaces disagree with source evidence (mean IoU ${m.negativeSpaceMeanIoU}).`, 'negative-space');
  }
  if (m.contactMaxExcessNormalized != null && m.contactMaxExcessNormalized > t.contactMaxExcessNormalized) {
    push('attachment-mismatch', `Observed contact relationships are not preserved in projection (max excess ${m.contactMaxExcessNormalized}).`, 'contact');
  }
  if ((m.occlusionOrderViolations ?? 0) > t.occlusionOrderViolations) {
    push('occlusion-mismatch', `Projected depth order violates ${m.occlusionOrderViolations} observed occlusion relationship(s).`, 'occlusion');
  }
  return deepFreeze(findings);
}

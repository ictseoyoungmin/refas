import {assertDigest} from './canonical.mjs';

export const REGISTERED_COMPARISON_SCHEMA = 'refas.registered-comparison/v1';

export function validateRegisteredComparison(report) {
  const errors = [];
  if (report?.schema !== REGISTERED_COMPARISON_SCHEMA) errors.push('invalid schema');
  if (report?.claimScope !== 'critique-evidence-only') errors.push('claimScope must be critique-evidence-only');
  try {
    assertDigest(report?.source?.sha256, 'source.sha256');
    assertDigest(report?.source?.manifestSha256, 'source.manifestSha256');
    assertDigest(report?.render?.assetSha256, 'render.assetSha256');
    assertDigest(report?.render?.frameSha256, 'render.frameSha256');
    assertDigest(report?.render?.reportSha256, 'render.reportSha256');
    assertDigest(report?.registration?.digest, 'registration.digest');
    assertDigest(report?.registration?.fileSha256, 'registration.fileSha256');
    assertDigest(report?.hierarchy?.digest, 'hierarchy.digest');
    assertDigest(report?.hierarchy?.fileSha256, 'hierarchy.fileSha256');
    assertDigest(report?.inputDigest, 'inputDigest');
    for (const scope of report?.scopes ?? []) {
      if (!scope.scopeId || !Array.isArray(scope.ancestry) || scope.ancestry[0] !== 'whole' || scope.ancestry.at(-1) !== scope.scopeId) errors.push(`scope ${scope?.scopeId ?? '?'} does not retain whole-context ancestry`);
      if (!Number.isFinite(scope?.metrics?.silhouetteIoU) || scope.metrics.silhouetteIoU < 0 || scope.metrics.silhouetteIoU > 1) errors.push(`scope ${scope?.scopeId ?? '?'} has invalid silhouette IoU`);
      for (const image of scope?.images ?? []) assertDigest(image.sha256, `${scope.scopeId} image sha256`);
      for (const landmark of scope?.landmarks ?? []) if (landmark.evidenceClass !== 'derived-observation-aid') errors.push(`landmark ${landmark.id} has invalid evidence class`);
      for (const dimension of scope?.dimensions ?? []) if (dimension.evidenceClass !== 'derived-observation-aid') errors.push(`dimension ${dimension.id} has invalid evidence class`);
    }
    if (!(report?.scopes?.length > 0)) errors.push('at least one hierarchy scope is required');
  } catch (error) { errors.push(error.message); }
  const policy = report?.policy ?? {};
  if (policy.rawSourceRemainsPrimary !== true || policy.outputsAreDerivedObservationAids !== true) errors.push('source authority policy is missing');
  if (policy.metricsCannotSetVisualGate !== true || policy.metricFailureRequiresTypedFindingBeforeRouting !== true) errors.push('non-authoritative metric policy is missing');
  if (policy.registrationResidualIsNotShapeTruth !== true) errors.push('registration residual policy is missing');
  try { assertDigest(report?.comparisonDigest, 'comparisonDigest'); } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

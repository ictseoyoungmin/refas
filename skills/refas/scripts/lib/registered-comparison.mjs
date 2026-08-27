import {assertDigest} from './canonical.mjs';

export const REGISTERED_COMPARISON_SCHEMA = 'refas.registered-comparison/v1';

const CONTRACT_FIXTURE_ACQUISITIONS = new Set([
  'test-fixture',
  'deterministic-project-fixture',
  'synthetic-test-fixture',
]);

const finitePoint = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

export function validateRegisteredComparison(report) {
  const errors = [];
  if (report?.schema !== REGISTERED_COMPARISON_SCHEMA) errors.push('invalid schema');
  if (report?.claimScope !== 'critique-evidence-only') errors.push('claimScope must be critique-evidence-only');
  const acquisitionKind = String(report?.source?.acquisitionKind ?? '').toLowerCase();
  const realSource = acquisitionKind ? !CONTRACT_FIXTURE_ACQUISITIONS.has(acquisitionKind) : false;
  const projectionByScope = new Map();

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

    for (const binding of report?.projectionEvidence ?? []) {
      if (!binding?.scopeId || projectionByScope.has(binding.scopeId)) errors.push(`duplicate or missing projection binding scope: ${binding?.scopeId ?? '?'}`);
      projectionByScope.set(binding?.scopeId, binding);
      assertDigest(binding?.referenceGeometryFileSha256, `${binding?.scopeId} reference geometry file sha256`);
      assertDigest(binding?.referenceGeometryDigest, `${binding?.scopeId} reference geometry digest`);
      assertDigest(binding?.realizedProjectionFileSha256, `${binding?.scopeId} realized projection file sha256`);
      assertDigest(binding?.realizedProjectionDigest, `${binding?.scopeId} realized projection digest`);
      assertDigest(binding?.projectionFitDigest, `${binding?.scopeId} projection fit digest`);
      assertDigest(binding?.assetSha256, `${binding?.scopeId} projection asset sha256`);
      if (binding?.assetSha256 !== report?.render?.assetSha256) errors.push(`projection binding asset does not match rendered asset: ${binding?.scopeId}`);
    }

    for (const scope of report?.scopes ?? []) {
      const scopeId = scope?.scopeId ?? '?';
      if (!scope.scopeId || !Array.isArray(scope.ancestry) || scope.ancestry[0] !== 'whole' || scope.ancestry.at(-1) !== scope.scopeId) errors.push(`scope ${scopeId} does not retain whole-context ancestry`);
      if (!Number.isFinite(scope?.metrics?.silhouetteIoU) || scope.metrics.silhouetteIoU < 0 || scope.metrics.silhouetteIoU > 1) errors.push(`scope ${scopeId} has invalid silhouette IoU`);
      if (!['realized-projection', 'declared-test-fixture', 'image-only'].includes(scope?.measurementAuthority)) errors.push(`scope ${scopeId} has invalid measurement authority`);
      if (realSource && scope?.measurementAuthority !== 'realized-projection') errors.push(`real-source scope ${scopeId} must use realized projection measurements`);

      for (const image of scope?.images ?? []) assertDigest(image.sha256, `${scopeId} image sha256`);
      for (const landmark of scope?.landmarks ?? []) {
        if (landmark.evidenceClass !== 'derived-observation-aid') errors.push(`landmark ${landmark.id} has invalid evidence class`);
      }
      for (const dimension of scope?.dimensions ?? []) {
        if (dimension.evidenceClass !== 'derived-observation-aid') errors.push(`dimension ${dimension.id} has invalid evidence class`);
      }

      if (scope?.measurementAuthority === 'realized-projection') {
        const binding = projectionByScope.get(scope.scopeId);
        if (!binding || !scope?.projectionBinding) errors.push(`scope ${scopeId} is missing realized projection binding`);
        if (binding && JSON.stringify(binding) !== JSON.stringify(scope.projectionBinding)) errors.push(`scope ${scopeId} projection binding does not match top-level evidence`);
        if (!(scope?.landmarks?.length > 0)) errors.push(`scope ${scopeId} realized projection requires landmarks`);
        if (!Number.isFinite(scope?.metrics?.landmarkResidualRmse)) errors.push(`scope ${scopeId} realized projection requires finite landmarkResidualRmse`);
        const errorsSquared = [];
        for (const landmark of scope?.landmarks ?? []) {
          if (!finitePoint(landmark.sourceNormalized) || !finitePoint(landmark.registeredSourceNormalized) || !finitePoint(landmark.realizedRenderNormalized)) errors.push(`landmark ${landmark.id} lacks realized source/render coordinates`);
          if ('declaredRenderNormalized' in landmark) errors.push(`landmark ${landmark.id} cannot use declared render coordinates under realized authority`);
          if (!Number.isFinite(landmark.residualNormalized) || landmark.residualNormalized < 0) errors.push(`landmark ${landmark.id} has invalid realized residual`);
          else errorsSquared.push(landmark.residualNormalized ** 2);
        }
        if (errorsSquared.length) {
          const rmse = Math.sqrt(errorsSquared.reduce((sum, value) => sum + value, 0) / errorsSquared.length);
          if (Math.abs(rmse - scope.metrics.landmarkResidualRmse) > 1e-10) errors.push(`scope ${scopeId} landmarkResidualRmse does not match realized landmarks`);
        }
      } else {
        if (scope?.projectionBinding != null) errors.push(`scope ${scopeId} has projection binding without realized authority`);
        if (scope?.measurementAuthority === 'declared-test-fixture' && realSource) errors.push(`real-source scope ${scopeId} cannot use declared test-fixture coordinates`);
      }
    }
    if (!(report?.scopes?.length > 0)) errors.push('at least one hierarchy scope is required');
    if (realSource && projectionByScope.size !== (report?.scopes?.length ?? 0)) errors.push('real-source comparison must bind realized projection evidence for every compared scope');
  } catch (error) {
    errors.push(error.message);
  }

  const policy = report?.policy ?? {};
  if (policy.rawSourceRemainsPrimary !== true || policy.outputsAreDerivedObservationAids !== true) errors.push('source authority policy is missing');
  if (policy.metricsCannotSetVisualGate !== true || policy.metricFailureRequiresTypedFindingBeforeRouting !== true) errors.push('non-authoritative metric policy is missing');
  if (policy.registrationResidualIsNotShapeTruth !== true) errors.push('registration residual policy is missing');
  if (policy.realSourceLandmarksMustUseRealizedProjection !== true || policy.manualRenderCoordinatesCannotClaimRealSourceGeometry !== true) errors.push('realized projection measurement authority policy is missing');
  if (policy.projectionMetricsRemainVetoOnly !== true) errors.push('projection metric authority policy is missing');
  try { assertDigest(report?.comparisonDigest, 'comparisonDigest'); } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

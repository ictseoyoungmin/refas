import {assertDigest, assertId, deepFreeze} from './canonical.mjs';

export const REGISTERED_COMPARISON_SCHEMA = 'refas.registered-comparison/v1';

const BINDING_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/u;

function bindingPath(value, label) {
  const normalized = String(value ?? '').trim();
  if (!BINDING_PATH.test(normalized)) throw new Error(`${label} must be a non-empty project-relative path`);
  return normalized;
}

function bindingStrings(values, label, {required = false, identifiers = false} = {}) {
  const normalized = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && !normalized.length) throw new Error(`${label} requires at least one value`);
  if (identifiers) normalized.forEach((value, index) => assertId(value, `${label}[${index}]`));
  return normalized;
}

/**
 * Normalize the identity tuple a certification-valid visual review must cite.
 * This is a binding contract only; it does not read files or decide fidelity.
 */
export function assertRegisteredComparisonBinding(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('registeredComparison binding is required');
  const binding = {
    path: bindingPath(raw.path, 'registeredComparison.path'),
    sha256: assertDigest(raw.sha256 ?? raw.fileSha256, 'registeredComparison.sha256'),
    comparisonDigest: assertDigest(raw.comparisonDigest, 'registeredComparison.comparisonDigest'),
    sourceSha256: assertDigest(raw.sourceSha256, 'registeredComparison.sourceSha256'),
    sourceManifestSha256: assertDigest(raw.sourceManifestSha256, 'registeredComparison.sourceManifestSha256'),
    assetSha256: assertDigest(raw.assetSha256, 'registeredComparison.assetSha256'),
    renderReportPath: bindingPath(raw.renderReportPath, 'registeredComparison.renderReportPath'),
    renderReportSha256: assertDigest(raw.renderReportSha256, 'registeredComparison.renderReportSha256'),
    framePath: bindingPath(raw.framePath, 'registeredComparison.framePath'),
    frameSha256: assertDigest(raw.frameSha256, 'registeredComparison.frameSha256'),
    registrationDigest: assertDigest(raw.registrationDigest, 'registeredComparison.registrationDigest'),
    hierarchyDigest: assertDigest(raw.hierarchyDigest, 'registeredComparison.hierarchyDigest'),
    inputDigest: assertDigest(raw.inputDigest, 'registeredComparison.inputDigest'),
    scopeIds: bindingStrings(raw.scopeIds, 'registeredComparison.scopeIds', {required: true, identifiers: true}),
  };
  if (!binding.scopeIds.includes('whole')) throw new Error('registeredComparison.scopeIds must include whole');
  return deepFreeze(binding);
}

/**
 * Produce screening-only contrary signals from an already validated report.
 * These values are deliberately not acceptance thresholds: callers must still
 * obtain a typed finding or a substantive source-grounded resolution.
 */
export function findComparisonContradictions(report, {silhouetteIoUBelow = 0.5, foregroundAreaRatioOutside = [0.55, 1.8], landmarkResidualAbove = 0.12, dimensionRelativeErrorAbove = 0.35, edgeDisagreementAbove = 0.45} = {}) {
  const whole = (report?.scopes ?? []).find((scope) => scope?.scopeId === 'whole');
  if (!whole) return [];
  const signals = [];
  const metricEvidence = [...new Set((whole.images ?? []).map((image) => image?.path).filter(Boolean))];
  const evidenceRefs = metricEvidence.length ? metricEvidence : [`comparison:${report.comparisonDigest ?? 'unbound'}:whole`];
  const silhouetteIoU = Number(whole.metrics?.silhouetteIoU);
  if (Number.isFinite(silhouetteIoU) && silhouetteIoU < silhouetteIoUBelow) {
    signals.push({
      id: 'whole-silhouette-screen', category: 'silhouette-mismatch', metric: 'silhouetteIoU', value: silhouetteIoU,
      summary: `Registered whole-source silhouette agreement is ${silhouetteIoU.toFixed(6)}, below the contradiction-screening band.`,
      evidenceRefs,
    });
  }
  const sourcePixels = Number(whole.metrics?.sourceForegroundPixels);
  const renderPixels = Number(whole.metrics?.renderForegroundPixels);
  if (sourcePixels > 0 && renderPixels >= 0) {
    const ratio = renderPixels / sourcePixels;
    if (ratio < foregroundAreaRatioOutside[0] || ratio > foregroundAreaRatioOutside[1]) {
      signals.push({
        id: 'whole-foreground-area-screen', category: 'mass-proportion-mismatch', metric: 'foregroundAreaRatio', value: ratio,
        summary: `Registered foreground occupancy ratio is ${ratio.toFixed(6)}, outside the contradiction-screening band.`,
        evidenceRefs,
      });
    }
  }
  const landmarkResidual = Number(whole.metrics?.macroLandmarkResidualRmse ?? whole.metrics?.landmarkResidualRmse);
  if (Number.isFinite(landmarkResidual) && landmarkResidual > landmarkResidualAbove) {
    signals.push({
      id: 'whole-landmark-screen', category: 'landmark-mismatch', metric: 'macroLandmarkResidualRmse', value: landmarkResidual,
      summary: `Registered whole-source landmark residual is ${landmarkResidual.toFixed(6)}, above the contradiction-screening band.`, evidenceRefs,
    });
  }
  const dimensionError = Number(whole.metrics?.dimensionMeanRelativeError);
  if (Number.isFinite(dimensionError) && dimensionError > dimensionRelativeErrorAbove) {
    signals.push({
      id: 'whole-dimension-screen', category: 'mass-proportion-mismatch', metric: 'dimensionMeanRelativeError', value: dimensionError,
      summary: `Registered whole-source dimension error is ${dimensionError.toFixed(6)}, above the contradiction-screening band.`, evidenceRefs,
    });
  }
  const edgeDisagreement = Number(whole.metrics?.perceptual?.edgeDisagreement);
  if (Number.isFinite(edgeDisagreement) && edgeDisagreement > edgeDisagreementAbove) {
    signals.push({
      id: 'whole-edge-screen', category: 'silhouette-mismatch', metric: 'perceptual.edgeDisagreement', value: edgeDisagreement,
      summary: `Registered edge disagreement is ${edgeDisagreement.toFixed(6)}, above the contradiction-screening band.`, evidenceRefs,
    });
  }
  return signals;
}

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
  const legacyContract = acquisitionKind === '';
  const realSource = !legacyContract && !CONTRACT_FIXTURE_ACQUISITIONS.has(acquisitionKind);
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
      if (!legacyContract && !['realized-projection', 'declared-test-fixture', 'image-only'].includes(scope?.measurementAuthority)) errors.push(`scope ${scopeId} has invalid measurement authority`);
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
      } else if (!legacyContract) {
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
  if (!legacyContract && (policy.realSourceLandmarksMustUseRealizedProjection !== true || policy.manualRenderCoordinatesCannotClaimRealSourceGeometry !== true)) errors.push('realized projection measurement authority policy is missing');
  if (!legacyContract && policy.projectionMetricsRemainVetoOnly !== true) errors.push('projection metric authority policy is missing');
  try { assertDigest(report?.comparisonDigest, 'comparisonDigest'); } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

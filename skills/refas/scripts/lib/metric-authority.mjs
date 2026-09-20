import {assertDigest, deepFreeze, digestJson} from './canonical.mjs';
import {validateRegisteredComparison} from './registered-comparison.mjs';
import {validatePerceptualSignatureEvidence} from './perceptual-signature.mjs';

export const METRIC_AUTHORITIES = Object.freeze([
  'RANKING_ALLOWED',
  'GATE_ONLY',
  'DIAGNOSTIC_ONLY',
  'RESEMBLANCE_SIGNAL',
  'CORRESPONDENCE_AID',
]);

export const METRIC_USES = Object.freeze([
  'objective',
  'ranking',
  'correspondence-gate',
  'diagnostic',
  'resemblance',
  'certification',
]);

const AUTHORITIES = new Set(METRIC_AUTHORITIES);
const USES = new Set(METRIC_USES);

const IOU_DERIVED_METRICS = new Set([
  'silhouetteiou',
  'silhouette-iou',
  'segmentiou',
  'segment-iou',
  'segment-iou-loss',
  'segmentmeaniou',
  'sourcevisiblesegmentmeaniou',
  'negative-space-iou',
  'negative-space-loss',
  'negativespacemeaniou',
]);

function metricKey(metricId) {
  return String(metricId ?? '').trim().toLowerCase();
}

export function isIouDerivedMetric(metricId) {
  const key = metricKey(metricId);
  if (!key) return false;
  return IOU_DERIVED_METRICS.has(key) || key.endsWith('iou') || key.includes('-iou-');
}

function validateComparisonDigest(report, label) {
  const validation = validateRegisteredComparison(report);
  if (!validation.valid) throw new Error(`${label} is not a valid registered comparison: ${validation.errors.join('; ')}`);
  const payload = structuredClone(report);
  delete payload.comparisonDigest;
  if (digestJson(payload) !== report.comparisonDigest) throw new Error(`${label} comparison digest mismatch`);
}

function normalizeRegisteredSourceViews(raw, {
  currentViewId = null,
  currentSourceSha256 = null,
  currentCandidateAssetSha256 = null,
} = {}) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('registeredComparisons must be an array');
  const views = raw.map((item, index) => {
    const label = `registeredComparisons[${index}]`;
    const viewId = String(item?.viewId ?? '').trim();
    if (!viewId) throw new Error(`${label}.viewId is required`);
    const report = item?.report;
    if (!report || typeof report !== 'object') throw new Error(`${label}.report is required`);
    validateComparisonDigest(report, `${label}.report`);
    return {
      viewId,
      sourceSha256: assertDigest(report.source?.sha256, `${label}.report.source.sha256`),
      registrationDigest: assertDigest(report.registration?.digest, `${label}.report.registration.digest`),
      candidateAssetSha256: assertDigest(report.render?.assetSha256, `${label}.report.render.assetSha256`),
      comparisonDigest: assertDigest(report.comparisonDigest, `${label}.report.comparisonDigest`),
    };
  });
  if (new Set(views.map((view) => view.viewId)).size !== views.length) throw new Error('registeredComparisons viewId values must be unique');
  if (new Set(views.map((view) => view.sourceSha256)).size !== views.length) throw new Error('registeredComparisons must be independently source-backed');
  if (new Set(views.map((view) => view.registrationDigest)).size !== views.length) throw new Error('registeredComparisons registration digests must be unique');
  if (new Set(views.map((view) => view.comparisonDigest)).size !== views.length) throw new Error('registeredComparisons comparison digests must be unique');
  const candidates = new Set(views.map((view) => view.candidateAssetSha256));
  if (candidates.size > 1) throw new Error('registeredComparisons must bind the same 3D candidate');
  if (views.length >= 2 && (currentViewId == null || currentSourceSha256 == null || currentCandidateAssetSha256 == null)) {
    throw new Error('multiview IoU authority requires currentViewId, currentSourceSha256, and currentCandidateAssetSha256');
  }

  if (currentSourceSha256 != null) {
    const source = assertDigest(currentSourceSha256, 'currentSourceSha256');
    if (!views.some((view) => view.sourceSha256 === source)) throw new Error('current source is not present in registeredComparisons');
  }
  if (currentCandidateAssetSha256 != null) {
    const candidate = assertDigest(currentCandidateAssetSha256, 'currentCandidateAssetSha256');
    if (views.length && views[0].candidateAssetSha256 !== candidate) throw new Error('current candidate is not the candidate bound by registeredComparisons');
  }
  if (currentViewId != null) {
    const id = String(currentViewId).trim();
    const current = views.find((view) => view.viewId === id);
    if (!current) throw new Error('current view is not present in registeredComparisons');
    if (currentSourceSha256 != null && current.sourceSha256 !== currentSourceSha256) throw new Error('current view does not bind the current source');
    if (currentCandidateAssetSha256 != null && current.candidateAssetSha256 !== currentCandidateAssetSha256) throw new Error('current view does not bind the current candidate');
  } else if (views.length >= 2) {
    throw new Error('currentViewId is required for multiview IoU authority');
  }

  return views;
}

function allowedUses(authority) {
  return {
    RANKING_ALLOWED: ['objective', 'ranking', 'diagnostic'],
    GATE_ONLY: ['correspondence-gate', 'diagnostic'],
    DIAGNOSTIC_ONLY: ['diagnostic'],
    RESEMBLANCE_SIGNAL: ['diagnostic'],
    CORRESPONDENCE_AID: ['correspondence-gate', 'diagnostic'],
  }[authority] ?? [];
}

export function metricAuthority(metricId, {
  declaredAuthority = 'RANKING_ALLOWED',
  registeredComparisons = null,
  currentViewId = null,
  currentSourceSha256 = null,
  currentCandidateAssetSha256 = null,
  resemblanceEvidence = null,
} = {}) {
  const id = String(metricId ?? '').trim();
  if (!id) throw new Error('metricId is required');

  if (isIouDerivedMetric(id)) {
    const views = normalizeRegisteredSourceViews(registeredComparisons, {currentViewId, currentSourceSha256, currentCandidateAssetSha256});
    const multiview = views.length >= 2;
    return deepFreeze({
      metricId: id,
      authority: multiview ? 'CORRESPONDENCE_AID' : 'FORBIDDEN_SINGLE_VIEW_IOU',
      allowedUses: multiview ? ['correspondence-gate', 'diagnostic'] : [],
      registeredSourceViewCount: views.length,
      sourceViewIds: views.map((view) => view.viewId),
      comparisonDigests: views.map((view) => view.comparisonDigest),
      reason: multiview
        ? 'IoU is admitted only for two or more independently source-backed, digest-valid registered-comparison artifacts of the same 3D candidate; it never ranks candidates or proves resemblance.'
        : 'IoU is forbidden unless two or more independently source-backed, digest-valid registered-comparison artifacts of the same 3D candidate are provided.',
    });
  }

  const authority = String(declaredAuthority ?? '').trim().toUpperCase();
  if (!AUTHORITIES.has(authority)) throw new Error(`unknown metric authority: ${declaredAuthority}`);
  if (authority === 'RESEMBLANCE_SIGNAL') {
    if (!resemblanceEvidence) throw new Error('RESEMBLANCE_SIGNAL requires current perceptual-signature evidence');
    if (currentSourceSha256 == null || currentCandidateAssetSha256 == null) {
      throw new Error('RESEMBLANCE_SIGNAL requires explicit currentSourceSha256 and currentCandidateAssetSha256 bindings');
    }
    const validation = validatePerceptualSignatureEvidence(resemblanceEvidence, {
      sourceSha256: currentSourceSha256,
      assetSha256: currentCandidateAssetSha256,
    });
    if (!validation.valid) throw new Error(`RESEMBLANCE_SIGNAL evidence is invalid: ${validation.errors.join('; ')}`);
    return deepFreeze({
      metricId: id,
      authority,
      allowedUses: allowedUses(authority),
      resemblanceEvidenceDigest: resemblanceEvidence.evidenceDigest,
      signatureSetDigest: resemblanceEvidence.signatureSetDigest,
      reason: 'R03 keeps numeric resemblance signals diagnostic-only; actual resemblance authority remains in current source/candidate-bound perceptual-signature observations.',
    });
  }
  return deepFreeze({
    metricId: id,
    authority,
    allowedUses: allowedUses(authority),
    reason: 'Non-IoU metric authority is caller-declared and preserved in the executable contract.',
  });
}

export function assertMetricUseAllowed(metricId, use, context = {}) {
  const normalizedUse = String(use ?? '').trim();
  if (!USES.has(normalizedUse)) throw new Error(`unknown metric use: ${use}`);
  const authority = metricAuthority(metricId, context);
  if (!authority.allowedUses.includes(normalizedUse)) {
    throw new Error(`metric ${metricId} with authority ${authority.authority} cannot be used for ${normalizedUse}: ${authority.reason}`);
  }
  return authority;
}

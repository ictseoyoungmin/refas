import {assertDigest, deepFreeze} from './canonical.mjs';

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

function normalizeRegisteredSourceViews(raw, {currentSourceSha256 = null, currentCandidateAssetSha256 = null} = {}) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('registeredSourceViews must be an array');
  const views = raw.map((view, index) => {
    const viewId = String(view?.viewId ?? '').trim();
    if (!viewId) throw new Error(`registeredSourceViews[${index}].viewId is required`);
    return {
      viewId,
      sourceSha256: assertDigest(view?.sourceSha256, `registeredSourceViews[${index}].sourceSha256`),
      registrationDigest: assertDigest(view?.registrationDigest, `registeredSourceViews[${index}].registrationDigest`),
      candidateAssetSha256: assertDigest(view?.candidateAssetSha256, `registeredSourceViews[${index}].candidateAssetSha256`),
    };
  });
  if (new Set(views.map((view) => view.viewId)).size !== views.length) throw new Error('registeredSourceViews viewId values must be unique');
  if (new Set(views.map((view) => view.sourceSha256)).size !== views.length) throw new Error('registeredSourceViews must be independently source-backed');
  if (new Set(views.map((view) => view.registrationDigest)).size !== views.length) throw new Error('registeredSourceViews registration digests must be unique');
  const candidates = new Set(views.map((view) => view.candidateAssetSha256));
  if (candidates.size > 1) throw new Error('registeredSourceViews must bind the same 3D candidate');
  if (currentSourceSha256 != null) {
    const source = assertDigest(currentSourceSha256, 'currentSourceSha256');
    if (!views.some((view) => view.sourceSha256 === source)) throw new Error('current source is not present in registeredSourceViews');
  }
  if (currentCandidateAssetSha256 != null) {
    const candidate = assertDigest(currentCandidateAssetSha256, 'currentCandidateAssetSha256');
    if (views.length && views[0].candidateAssetSha256 !== candidate) throw new Error('current candidate is not the candidate bound by registeredSourceViews');
  }
  return views;
}

function allowedUses(authority) {
  return {
    RANKING_ALLOWED: ['objective', 'ranking', 'diagnostic'],
    GATE_ONLY: ['correspondence-gate', 'diagnostic'],
    DIAGNOSTIC_ONLY: ['diagnostic'],
    RESEMBLANCE_SIGNAL: ['objective', 'ranking', 'diagnostic', 'resemblance'],
    CORRESPONDENCE_AID: ['correspondence-gate', 'diagnostic'],
  }[authority] ?? [];
}

export function metricAuthority(metricId, {
  declaredAuthority = 'RANKING_ALLOWED',
  registeredSourceViews = null,
  currentSourceSha256 = null,
  currentCandidateAssetSha256 = null,
} = {}) {
  const id = String(metricId ?? '').trim();
  if (!id) throw new Error('metricId is required');

  if (isIouDerivedMetric(id)) {
    const views = normalizeRegisteredSourceViews(registeredSourceViews, {currentSourceSha256, currentCandidateAssetSha256});
    const multiview = views.length >= 2;
    return deepFreeze({
      metricId: id,
      authority: multiview ? 'CORRESPONDENCE_AID' : 'FORBIDDEN_SINGLE_VIEW_IOU',
      allowedUses: multiview ? ['correspondence-gate', 'diagnostic'] : [],
      registeredSourceViewCount: views.length,
      sourceViewIds: views.map((view) => view.viewId),
      reason: multiview
        ? 'IoU is admitted only for two or more independently source-backed digest-bound registered views of the same 3D candidate; it never ranks candidates or proves resemblance.'
        : 'IoU is forbidden unless two or more independently source-backed digest-bound registered views of the same 3D candidate are provided.',
    });
  }

  const authority = String(declaredAuthority ?? '').trim().toUpperCase();
  if (!AUTHORITIES.has(authority)) throw new Error(`unknown metric authority: ${declaredAuthority}`);
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

import {deepFreeze} from './canonical.mjs';

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

function count(raw, fallback) {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value >= 0 ? value : 0;
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
  sourceViewCount = 1,
  independentlySourceBackedViewCount = sourceViewCount,
  registeredSourceViewCount = independentlySourceBackedViewCount,
} = {}) {
  const id = String(metricId ?? '').trim();
  if (!id) throw new Error('metricId is required');

  if (isIouDerivedMetric(id)) {
    const sourceViews = count(sourceViewCount, 1);
    const independentViews = count(independentlySourceBackedViewCount, sourceViews);
    const registeredViews = count(registeredSourceViewCount, independentViews);
    const multiview = sourceViews >= 2 && independentViews >= 2 && registeredViews >= 2;
    return deepFreeze({
      metricId: id,
      authority: multiview ? 'CORRESPONDENCE_AID' : 'FORBIDDEN_SINGLE_VIEW_IOU',
      allowedUses: multiview ? ['correspondence-gate', 'diagnostic'] : [],
      sourceViewCount: sourceViews,
      independentlySourceBackedViewCount: independentViews,
      registeredSourceViewCount: registeredViews,
      reason: multiview
        ? 'IoU is admitted only as multiview correspondence evidence; it never ranks candidates or proves resemblance.'
        : 'IoU is forbidden unless at least two independently source-backed views are registered to the same 3D candidate.',
    });
  }

  const authority = String(declaredAuthority ?? '').trim().toUpperCase();
  if (!AUTHORITIES.has(authority)) throw new Error(`unknown metric authority: ${declaredAuthority}`);
  return deepFreeze({
    metricId: id,
    authority,
    allowedUses: allowedUses(authority),
    sourceViewCount: count(sourceViewCount, 1),
    independentlySourceBackedViewCount: count(independentlySourceBackedViewCount, sourceViewCount),
    registeredSourceViewCount: count(registeredSourceViewCount, independentlySourceBackedViewCount ?? sourceViewCount),
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

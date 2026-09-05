import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const ORIENTATION_DISCREPANCY_SCHEMA = 'refas.orientation-discrepancy/v1';

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();
function angle(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > Math.PI + 1e-10) throw new Error(`${label} must be a finite angle in [0, pi]`);
  return Math.min(Math.PI, number);
}

function normalizeResidual(raw, index) {
  const label = `residuals[${index}]`;
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one orientation evidence reference`);
  return {
    id: assertId(raw?.id, `${label}.id`),
    entityId: assertId(raw?.entityId, `${label}.entityId`),
    primaryAxisErrorRadians: angle(raw?.primaryAxisErrorRadians ?? 0, `${label}.primaryAxisErrorRadians`),
    facingErrorRadians: angle(raw?.facingErrorRadians ?? 0, `${label}.facingErrorRadians`),
    lateralErrorRadians: angle(raw?.lateralErrorRadians ?? 0, `${label}.lateralErrorRadians`),
    twistErrorRadians: angle(raw?.twistErrorRadians ?? 0, `${label}.twistErrorRadians`),
    evidenceRefs,
  };
}

const mean = (items, key) => items.reduce((sum, item) => sum + item[key], 0) / items.length;
const maximum = (items, key) => Math.max(...items.map((item) => item[key]));

export function createOrientationDiscrepancy({scopeId, sourceSha256, assetSha256, orientationEvidenceDigest, residuals = [], evidenceRefs = []} = {}) {
  if (!Array.isArray(residuals) || !residuals.length) throw new Error('orientation discrepancy requires at least one residual');
  const normalized = residuals.map(normalizeResidual).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('orientation residual IDs must be unique');
  const metrics = {
    primaryAxisMeanRadians: mean(normalized, 'primaryAxisErrorRadians'), facingMeanRadians: mean(normalized, 'facingErrorRadians'),
    lateralMeanRadians: mean(normalized, 'lateralErrorRadians'), twistMeanRadians: mean(normalized, 'twistErrorRadians'),
    primaryAxisMaxRadians: maximum(normalized, 'primaryAxisErrorRadians'), facingMaxRadians: maximum(normalized, 'facingErrorRadians'), twistMaxRadians: maximum(normalized, 'twistErrorRadians'),
  };
  const payload = {
    schema: ORIENTATION_DISCREPANCY_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'), sourceSha256: assertDigest(sourceSha256, 'sourceSha256'), assetSha256: assertDigest(assetSha256, 'assetSha256'),
    orientationEvidenceDigest: assertDigest(orientationEvidenceDigest, 'orientationEvidenceDigest'), residuals: normalized, metrics, evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {samePrimaryAxisDoesNotImplySameOrientation: true, orientationMetricsRankCandidatesOnly: true, orientationMetricsCannotSelectOwner: true, orientationMetricsCannotPassVisualGate: true, actualVisualReviewRemainsRequired: true},
  };
  return deepFreeze({...payload, discrepancyDigest: digestJson(payload)});
}

export function validateOrientationDiscrepancy(value) {
  const errors = [];
  try {
    if (value?.schema !== ORIENTATION_DISCREPANCY_SCHEMA) errors.push('invalid schema');
    const recreated = createOrientationDiscrepancy(value);
    if (recreated.discrepancyDigest !== value?.discrepancyDigest) errors.push('orientation discrepancy digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('orientation discrepancy is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

/** Return a normalized weighted loss in [0,1] from validated orientation evidence. */
export function orientationLossFromDiscrepancy(value, weights = {}) {
  const validation = validateOrientationDiscrepancy(value);
  if (!validation.valid) throw new Error(`orientation discrepancy is invalid: ${validation.errors.join('; ')}`);
  const normalizedWeights = {};
  for (const [key, fallback] of Object.entries({primaryAxis: 1, facing: 1, lateral: 0.5, twist: 1})) {
    const weight = Number(weights?.[key] ?? fallback);
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`orientation weight ${key} must be finite and non-negative`);
    normalizedWeights[key] = weight;
  }
  const total = Object.values(normalizedWeights).reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) throw new Error('orientation loss requires at least one positive weight');
  const metrics = value.metrics;
  const weighted = normalizedWeights.primaryAxis * metrics.primaryAxisMeanRadians + normalizedWeights.facing * metrics.facingMeanRadians + normalizedWeights.lateral * metrics.lateralMeanRadians + normalizedWeights.twist * metrics.twistMeanRadians;
  return weighted / (Math.PI * total);
}

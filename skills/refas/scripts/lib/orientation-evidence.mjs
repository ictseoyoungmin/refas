import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const ORIENTATION_EVIDENCE_SCHEMA = 'refas.orientation-evidence-set/v1';

const FACING_RELATIONS = new Set([
  'toward-camera', 'away-from-camera', 'upward', 'downward', 'leftward', 'rightward',
  'toward-parent', 'away-from-parent', 'ambiguous', 'unknown',
]);
const PLANE_VISIBILITY = new Set(['broad-face-dominant', 'edge-dominant', 'mixed', 'occluded', 'unknown']);
const TWIST_RELATIONS = new Set(['pronated', 'supinated', 'clockwise', 'counterclockwise', 'neutral', 'ambiguous', 'unknown']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function finiteDirection2(value, label) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain two numbers`);
  const output = value.map(Number);
  if (!output.every(Number.isFinite)) throw new Error(`${label} must contain finite numbers`);
  if (Math.hypot(...output) <= 1e-9) throw new Error(`${label} must have non-zero length`);
  return output;
}

function normalizeObservation(raw, index) {
  const label = `observations[${index}]`;
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one reference`);
  const primaryAxis = raw?.primaryAxis?.screenDirection == null ? null : {
    screenDirection: finiteDirection2(raw.primaryAxis.screenDirection, `${label}.primaryAxis.screenDirection`),
  };
  const facing = String(raw?.facing ?? 'unknown');
  const visiblePlane = String(raw?.visiblePlane ?? 'unknown');
  const relativeTwist = String(raw?.relativeTwist ?? 'unknown');
  const confidence = String(raw?.confidence ?? 'medium');
  if (!FACING_RELATIONS.has(facing)) throw new Error(`${label}.facing is invalid`);
  if (!PLANE_VISIBILITY.has(visiblePlane)) throw new Error(`${label}.visiblePlane is invalid`);
  if (!TWIST_RELATIONS.has(relativeTwist)) throw new Error(`${label}.relativeTwist is invalid`);
  if (!CONFIDENCE.has(confidence)) throw new Error(`${label}.confidence is invalid`);
  if (!primaryAxis && facing === 'unknown' && visiblePlane === 'unknown' && relativeTwist === 'unknown') {
    throw new Error(`${label} must preserve at least one orientation cue`);
  }
  return {
    id: assertId(raw?.id, `${label}.id`),
    entityId: assertId(raw?.entityId, `${label}.entityId`),
    parentId: raw?.parentId == null ? null : assertId(raw.parentId, `${label}.parentId`),
    primaryAxis,
    facing,
    visiblePlane,
    nearSide: raw?.nearSide == null ? null : String(raw.nearSide),
    relativeTwist,
    confidence,
    evidenceRefs,
    notes: uniqueStrings(raw?.notes),
  };
}

export function createOrientationEvidenceSet({scopeId, sourceSha256, observations = [], evidenceRefs = []} = {}) {
  if (!Array.isArray(observations) || !observations.length) throw new Error('orientation evidence requires at least one observation');
  const normalized = observations.map(normalizeObservation);
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('orientation evidence IDs must be unique');
  const payload = {
    schema: ORIENTATION_EVIDENCE_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    observations: normalized.sort((a, b) => a.id.localeCompare(b.id)),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      positionAndPrimaryAxisDoNotFullySpecifyOrientation: true,
      cameraRelativeEvidencePreferredOverInventedEulerAngles: true,
      terminalFacingAndTwistRemainExplicit: true,
      ambiguousRollMustRemainAmbiguousUntilResolved: true,
      orientationEvidenceDoesNotAuthorizeVisualClosure: true,
    },
  };
  return deepFreeze({...payload, evidenceDigest: digestJson(payload)});
}

export function validateOrientationEvidenceSet(value) {
  const errors = [];
  try {
    if (value?.schema !== ORIENTATION_EVIDENCE_SCHEMA) errors.push('invalid schema');
    const recreated = createOrientationEvidenceSet(value);
    if (recreated.evidenceDigest !== value?.evidenceDigest) errors.push('orientation evidence digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('orientation evidence is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

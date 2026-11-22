import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateVisualHierarchy} from './hierarchy.mjs';

export const SPATIAL_ROLE_EXPECTATION_SET_SCHEMA = 'refas.spatial-role-expectation-set/v1';
export const SPATIAL_ROLE_VALUES = Object.freeze([
  'volumetric',
  'layered-volume',
  'thin-shell',
  'rod-tubular',
  'intentionally-planar',
  'unresolved',
]);

const ROLE_SET = new Set(SPATIAL_ROLE_VALUES);
const INPUT_KEYS = new Set(['hierarchy', 'sourceSha256', 'expectations']);
const EXPECTATION_KEYS = new Set(['scopeId', 'role', 'sourceObservation', 'rationale', 'evidenceRefs', 'ambiguity']);

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field ${key}; candidate/classifier-derived role authoring is forbidden`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeEvidenceRefs(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort();
  if (!normalized.length) throw new Error(`${label} requires at least one source evidence reference`);
  return normalized;
}

function validateBoundHierarchy(hierarchy, sourceSha256) {
  const validation = validateVisualHierarchy(hierarchy);
  if (!validation.valid) throw new Error(`spatial role hierarchy is invalid: ${validation.errors.join('; ')}`);
  if (hierarchy.source.sha256 !== sourceSha256) throw new Error('spatial role source SHA-256 must match the bound visual hierarchy source');
  return new Set(hierarchy.nodes.map((node) => node.id));
}

function normalizedPayload({hierarchy, sourceSha256, expectations}) {
  const source = assertDigest(sourceSha256, 'sourceSha256');
  const allowedScopeIds = validateBoundHierarchy(hierarchy, source);
  if (!Array.isArray(expectations) || !expectations.length) throw new Error('spatial role expectation set requires at least one scope expectation');

  const normalized = expectations.map((raw, index) => {
    rejectUnknownKeys(raw, EXPECTATION_KEYS, `expectations[${index}]`);
    const scopeId = assertId(raw.scopeId, `expectations[${index}].scopeId`);
    if (!allowedScopeIds.has(scopeId)) throw new Error(`expectations[${index}].scopeId is not present in the bound visual hierarchy: ${scopeId}`);
    const role = String(raw.role ?? '').trim();
    if (!ROLE_SET.has(role)) throw new Error(`expectations[${index}].role is unsupported: ${role || 'empty'}`);
    const sourceObservation = requiredText(raw.sourceObservation, `expectations[${index}].sourceObservation`);
    const rationale = requiredText(raw.rationale, `expectations[${index}].rationale`);
    const evidenceRefs = normalizeEvidenceRefs(raw.evidenceRefs, `expectations[${index}].evidenceRefs`);
    if (!evidenceRefs.includes(hierarchy.source.path)) {
      throw new Error(`expectations[${index}] must cite the exact raw source path ${hierarchy.source.path}`);
    }
    const ambiguity = raw.ambiguity == null ? null : requiredText(raw.ambiguity, `expectations[${index}].ambiguity`);
    if (role === 'unresolved' && ambiguity == null) {
      throw new Error(`expectations[${index}] unresolved role requires explicit ambiguity`);
    }
    return {scopeId, role, sourceObservation, rationale, evidenceRefs, ambiguity};
  }).sort((a, b) => a.scopeId.localeCompare(b.scopeId));

  if (new Set(normalized.map((item) => item.scopeId)).size !== normalized.length) {
    throw new Error('spatial role expectation scopes must be unique');
  }

  return {
    schema: SPATIAL_ROLE_EXPECTATION_SET_SCHEMA,
    sourceSha256: source,
    hierarchyDigest: hierarchy.hierarchyDigest,
    expectations: normalized,
    policy: {
      sourceDerivedOnly: true,
      candidateIndependent: true,
      classifierIndependent: true,
      preClassifierBindingRequired: true,
      unresolvedAllowed: true,
      observationDoesNotClassify: true,
      expectationDoesNotCertify: true,
    },
  };
}

export function createSpatialRoleExpectationSet(input = {}) {
  rejectUnknownKeys(input, INPUT_KEYS, 'spatial role expectation input');
  const payload = normalizedPayload(input);
  return deepFreeze({...payload, expectationSetDigest: digestJson(payload)});
}

export function validateSpatialRoleExpectationSet(record, hierarchy) {
  const errors = [];
  if (record?.schema !== SPATIAL_ROLE_EXPECTATION_SET_SCHEMA) errors.push('invalid schema');
  try {
    if (!hierarchy) throw new Error('visual hierarchy is required to validate spatial role scope/source authority');
    const expected = createSpatialRoleExpectationSet({
      hierarchy,
      sourceSha256: record?.sourceSha256,
      expectations: record?.expectations,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('spatial role expectation set is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

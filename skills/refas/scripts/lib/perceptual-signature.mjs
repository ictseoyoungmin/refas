import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {normalizeFinding} from './failure-router.mjs';

export const PERCEPTUAL_SIGNATURE_SET_SCHEMA = 'refas.perceptual-signature-set/v1';
export const PERCEPTUAL_SIGNATURE_EVIDENCE_SCHEMA = 'refas.perceptual-signature-evidence/v1';

export const PERCEPTUAL_SIGNATURE_FAMILIES = Object.freeze([
  'silhouette-character',
  'mass-proportion',
  'curvature-character',
  'plane-edge-language',
  'negative-space-structure',
  'part-segmentation-rhythm',
  'junction-transition',
  'surface-pattern-structure',
]);

export const PERCEPTUAL_SIGNATURE_IMPORTANCE = Object.freeze(['macro', 'identity', 'detail']);
export const PERCEPTUAL_SIGNATURE_STATUSES = Object.freeze(['match', 'mismatch', 'insufficient']);

const FAMILY_SET = new Set(PERCEPTUAL_SIGNATURE_FAMILIES);
const IMPORTANCE_SET = new Set(PERCEPTUAL_SIGNATURE_IMPORTANCE);
const STATUS_SET = new Set(PERCEPTUAL_SIGNATURE_STATUSES);

function strings(values, label, {required = false, ids = false} = {}) {
  if (values == null) values = [];
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const out = [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort();
  if (required && !out.length) throw new Error(`${label} requires at least one value`);
  if (ids) out.forEach((value, index) => assertId(value, `${label}[${index}]`));
  return out;
}

function requiredText(value, label) {
  const out = String(value ?? '').trim();
  if (!out) throw new Error(`${label} is required`);
  return out;
}

function normalizeSignature(raw, index, {sourceSha256, defaultScopeId}) {
  if (!raw || typeof raw !== 'object') throw new Error(`signatures[${index}] must be an object`);
  const id = assertId(raw.id, `signatures[${index}].id`);
  const scopeId = assertId(raw.scopeId ?? defaultScopeId, `signatures[${index}].scopeId`);
  const family = String(raw.family ?? '').trim();
  const importance = String(raw.importance ?? '').trim();
  if (!FAMILY_SET.has(family)) throw new Error(`signatures[${index}].family is unsupported: ${family || 'empty'}`);
  if (!IMPORTANCE_SET.has(importance)) throw new Error(`signatures[${index}].importance is invalid`);
  const sourceObservation = requiredText(raw.sourceObservation, `signatures[${index}].sourceObservation`);
  const evidenceRefs = strings(raw.evidenceRefs, `signatures[${index}].evidenceRefs`, {required: true});
  const relatedScopeIds = strings(raw.relatedScopeIds, `signatures[${index}].relatedScopeIds`, {ids: true});
  const referenceGeometryRefs = strings(raw.referenceGeometryRefs, `signatures[${index}].referenceGeometryRefs`);
  const ambiguity = raw.ambiguity == null ? null : requiredText(raw.ambiguity, `signatures[${index}].ambiguity`);
  return {
    id,
    scopeId,
    sourceSha256,
    family,
    importance,
    sourceObservation,
    evidenceRefs,
    relatedScopeIds,
    referenceGeometryRefs,
    ambiguity,
  };
}

export function createPerceptualSignatureSet({
  scopeId = 'whole',
  sourceSha256,
  signatures = [],
  ambiguities = [],
  evidenceRefs = [],
} = {}) {
  const normalizedScopeId = assertId(scopeId, 'scopeId');
  const source = assertDigest(sourceSha256, 'sourceSha256');
  if (!Array.isArray(signatures) || signatures.length === 0) throw new Error('perceptual signature set requires at least one signature');
  const normalized = signatures.map((item, index) => normalizeSignature(item, index, {
    sourceSha256: source,
    defaultScopeId: normalizedScopeId,
  }));
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('perceptual signature IDs must be unique');

  const payload = {
    schema: PERCEPTUAL_SIGNATURE_SET_SCHEMA,
    scopeId: normalizedScopeId,
    sourceSha256: source,
    signatures: normalized.sort((a, b) => a.id.localeCompare(b.id)),
    ambiguities: strings(ambiguities, 'ambiguities'),
    evidenceRefs: strings(evidenceRefs, 'evidenceRefs', {required: true}),
    policy: {
      sourceDerivedOnly: true,
      candidateIndependent: true,
      metricsDoNotDefineIdentity: true,
      correspondenceDoesNotImplyResemblance: true,
      signatureSetDoesNotCertify: true,
    },
  };
  return deepFreeze({...payload, signatureDigest: digestJson(payload)});
}

export function validatePerceptualSignatureSet(record) {
  const errors = [];
  if (record?.schema !== PERCEPTUAL_SIGNATURE_SET_SCHEMA) errors.push('invalid schema');
  try {
    const expected = createPerceptualSignatureSet({
      scopeId: record?.scopeId,
      sourceSha256: record?.sourceSha256,
      signatures: record?.signatures,
      ambiguities: record?.ambiguities,
      evidenceRefs: record?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('perceptual signature set is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function findingForSignature(signature, observation) {
  const category = {
    'silhouette-character': 'silhouette-mismatch',
    'mass-proportion': 'mass-proportion-mismatch',
    'curvature-character': 'curvature-mismatch',
    'plane-edge-language': 'curvature-mismatch',
    'negative-space-structure': 'silhouette-mismatch',
    'part-segmentation-rhythm': 'pattern-topology-mismatch',
    'junction-transition': 'curvature-mismatch',
    'surface-pattern-structure': 'pattern-topology-mismatch',
  }[signature.family] ?? 'unroutable-visual-finding';

  return normalizeFinding({
    category,
    severity: signature.importance === 'detail' ? 'minor' : 'major',
    scopeId: signature.scopeId,
    summary: `Perceptual signature ${signature.id} mismatch: ${observation.comparisonConclusion}`,
    evidenceRefs: observation.evidenceRefs,
    introducedByEdit: false,
  });
}

function normalizeEvidenceObservation(raw, signature, index) {
  if (!raw || typeof raw !== 'object') throw new Error(`observations[${index}] must be an object`);
  const signatureId = assertId(raw.signatureId, `observations[${index}].signatureId`);
  if (signatureId !== signature.id) throw new Error(`observations[${index}] signature binding mismatch`);
  const status = String(raw.status ?? '').trim().toLowerCase();
  if (!STATUS_SET.has(status)) throw new Error(`observations[${index}].status is invalid`);
  const candidateObservation = requiredText(raw.candidateObservation, `observations[${index}].candidateObservation`);
  const comparisonConclusion = requiredText(raw.comparisonConclusion, `observations[${index}].comparisonConclusion`);
  const evidenceRefs = strings(raw.evidenceRefs, `observations[${index}].evidenceRefs`, {required: true});
  const observation = {
    signatureId,
    scopeId: signature.scopeId,
    family: signature.family,
    importance: signature.importance,
    status,
    sourceObservation: signature.sourceObservation,
    candidateObservation,
    comparisonConclusion,
    evidenceRefs,
    finding: null,
  };
  if (status === 'mismatch') observation.finding = findingForSignature(signature, observation);
  return observation;
}

export function createPerceptualSignatureEvidence({
  signatureSet,
  assetSha256,
  observations = [],
  evidenceRefs = [],
} = {}) {
  const setValidation = validatePerceptualSignatureSet(signatureSet);
  if (!setValidation.valid) throw new Error(`signatureSet is invalid: ${setValidation.errors.join('; ')}`);
  const asset = assertDigest(assetSha256, 'assetSha256');
  if (!Array.isArray(observations)) throw new Error('observations must be an array');

  const byId = new Map();
  for (const [index, raw] of observations.entries()) {
    const id = assertId(raw?.signatureId, `observations[${index}].signatureId`);
    if (byId.has(id)) throw new Error(`duplicate perceptual signature observation: ${id}`);
    byId.set(id, raw);
  }
  const expectedIds = signatureSet.signatures.map((item) => item.id);
  const missing = expectedIds.filter((id) => !byId.has(id));
  const unexpected = [...byId.keys()].filter((id) => !expectedIds.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(`perceptual signature evidence must cover every signature exactly once; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`);
  }

  const normalized = signatureSet.signatures.map((signature, index) => normalizeEvidenceObservation(byId.get(signature.id), signature, index));
  const payload = {
    schema: PERCEPTUAL_SIGNATURE_EVIDENCE_SCHEMA,
    scopeId: signatureSet.scopeId,
    sourceSha256: signatureSet.sourceSha256,
    assetSha256: asset,
    signatureSet,
    signatureSetDigest: signatureSet.signatureDigest,
    observations: normalized,
    findings: normalized.filter((item) => item.finding).map((item) => item.finding),
    evidenceRefs: strings(evidenceRefs, 'evidenceRefs', {required: true}),
    policy: {
      matchCannotPassVisualGate: true,
      matchCannotCertify: true,
      mismatchMayRouteTypedFinding: true,
      insufficientDoesNotSelectOwner: true,
      numericMetricsDoNotReplaceSignatureObservation: true,
      sourceSignatureRemainsPrimary: true,
    },
  };
  return deepFreeze({...payload, evidenceDigest: digestJson(payload)});
}

export function validatePerceptualSignatureEvidence(record, {
  sourceSha256 = null,
  assetSha256 = null,
} = {}) {
  const errors = [];
  if (record?.schema !== PERCEPTUAL_SIGNATURE_EVIDENCE_SCHEMA) errors.push('invalid schema');
  try {
    const observations = (record?.observations ?? []).map((item) => ({
      signatureId: item.signatureId,
      status: item.status,
      candidateObservation: item.candidateObservation,
      comparisonConclusion: item.comparisonConclusion,
      evidenceRefs: item.evidenceRefs,
    }));
    const expected = createPerceptualSignatureEvidence({
      signatureSet: record?.signatureSet,
      assetSha256: record?.assetSha256,
      observations,
      evidenceRefs: record?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('perceptual signature evidence is not canonical');
    if (sourceSha256 != null && expected.sourceSha256 !== assertDigest(sourceSha256, 'sourceSha256')) errors.push('perceptual signature evidence source binding mismatch');
    if (assetSha256 != null && expected.assetSha256 !== assertDigest(assetSha256, 'assetSha256')) errors.push('perceptual signature evidence candidate binding mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const CONSTRUCTION_QUALITY_SCHEMA = 'refas.construction-quality/v1';
export const REQUIRED_VISIBLE_FORM_GATES = Object.freeze([
  'whole-silhouette',
  'major-landmarks',
  'principal-sections',
  'curvature-transitions',
  'coarse-negative-space',
  'registered-source-comparison',
]);

const CLAIMS = new Set(['blockout', 'identity-bearing']);
const STATUSES = new Set(['pass', 'fail', 'insufficient']);
const GENERIC_ONLY_FAMILIES = new Set(['generic-primitive']);

function uniqueStrings(values, label) {
  const output = [...new Set((values ?? []).map(String).filter(Boolean))].sort();
  if (!output.length) throw new Error(`${label} requires at least one value`);
  return output;
}

function normalizeGate(raw, index) {
  const id = assertId(raw?.id, `visibleFormGates[${index}].id`);
  const status = String(raw?.status ?? 'insufficient').toLowerCase();
  if (!STATUSES.has(status)) throw new Error(`visibleFormGates[${index}].status is invalid`);
  return {
    id,
    status,
    evidenceRefs: uniqueStrings(raw?.evidenceRefs, `visibleFormGates[${index}].evidenceRefs`),
    summary: String(raw?.summary ?? ''),
  };
}

function exactGateSet(gates) {
  const ids = gates.map((gate) => gate.id);
  if (new Set(ids).size !== ids.length) throw new Error('visible-form gate IDs must be unique');
  const missing = REQUIRED_VISIBLE_FORM_GATES.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !REQUIRED_VISIBLE_FORM_GATES.includes(id));
  if (missing.length || unexpected.length) throw new Error(`visibleFormGates must contain exactly ${REQUIRED_VISIBLE_FORM_GATES.join(', ')}; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`);
}

export function createConstructionQuality({
  scopeId,
  sourceSha256,
  assetSha256,
  claim = 'blockout',
  constructionFamilies = [],
  visibleFormGates = [],
  identityFeatures = [],
  wholeDependency,
  registeredComparison,
  ambiguities = [],
} = {}) {
  const normalizedClaim = String(claim);
  if (!CLAIMS.has(normalizedClaim)) throw new Error('claim must be blockout or identity-bearing');
  const families = uniqueStrings(constructionFamilies, 'constructionFamilies');
  const gates = visibleFormGates.map(normalizeGate);
  exactGateSet(gates);
  const normalizedFeatures = identityFeatures.map((feature, index) => ({
    id: assertId(feature?.id, `identityFeatures[${index}].id`),
    scopeId: assertId(feature?.scopeId, `identityFeatures[${index}].scopeId`),
    kind: assertId(feature?.kind, `identityFeatures[${index}].kind`),
    evidenceRefs: uniqueStrings(feature?.evidenceRefs, `identityFeatures[${index}].evidenceRefs`),
  }));
  const genericPrimitiveOnly = families.every((family) => GENERIC_ONLY_FAMILIES.has(family));
  const normalizedWholeDependency = {
    scopeId: assertId(wholeDependency?.scopeId, 'wholeDependency.scopeId'),
    status: String(wholeDependency?.status ?? 'insufficient'),
    evidenceRefs: uniqueStrings(wholeDependency?.evidenceRefs, 'wholeDependency.evidenceRefs'),
  };
  if (normalizedWholeDependency.scopeId !== 'whole') throw new Error('wholeDependency.scopeId must be whole');
  if (!STATUSES.has(normalizedWholeDependency.status)) throw new Error('wholeDependency.status is invalid');
  const normalizedComparison = {
    path: String(registeredComparison?.path ?? ''),
    sha256: assertDigest(registeredComparison?.sha256, 'registeredComparison.sha256'),
    scopeIds: uniqueStrings(registeredComparison?.scopeIds, 'registeredComparison.scopeIds').map((id, index) => assertId(id, `registeredComparison.scopeIds[${index}]`)),
  };
  if (!normalizedComparison.path) throw new Error('registeredComparison.path is required');
  if (!normalizedComparison.scopeIds.includes('whole')) throw new Error('registered comparison must cover whole');

  const closureErrors = [];
  if (normalizedClaim === 'identity-bearing') {
    if (genericPrimitiveOnly) closureErrors.push('generic primitive-only geometry is blockout and cannot close shape reconstruction');
    if (!normalizedFeatures.length) closureErrors.push('identity-bearing geometry requires observed identity features');
    if (normalizedWholeDependency.status !== 'pass') closureErrors.push('whole-shape dependency barrier has not passed');
    for (const gate of gates) if (gate.status !== 'pass') closureErrors.push(`${gate.id} is ${gate.status}`);
  }
  if (closureErrors.length) throw new Error(`construction quality cannot claim identity-bearing closure: ${closureErrors.join('; ')}`);

  const payload = {
    schema: CONSTRUCTION_QUALITY_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    assetSha256: assertDigest(assetSha256, 'assetSha256'),
    claim: normalizedClaim,
    constructionFamilies: families,
    genericPrimitiveOnly,
    visibleFormGates: gates,
    identityFeatures: normalizedFeatures,
    wholeDependency: normalizedWholeDependency,
    registeredComparison: normalizedComparison,
    ambiguities: [...new Set(ambiguities.map(String).filter(Boolean))].sort(),
    policy: {
      primitiveOnlyIsBlockout: true,
      wholeShapePrecedesLowerScopes: true,
      visibleEvidenceCannotBeDeferredAsHiddenUncertainty: true,
      triangleCountIsNotFidelityAuthority: true,
      validationVolumeCannotReplaceConstructionQuality: true,
    },
  };
  return deepFreeze({...payload, constructionQualityDigest: digestJson(payload)});
}

export function validateConstructionQuality(record) {
  const errors = [];
  if (record?.schema !== CONSTRUCTION_QUALITY_SCHEMA) errors.push('invalid schema');
  try {
    const recreated = createConstructionQuality(record);
    if (recreated.constructionQualityDigest !== record.constructionQualityDigest) errors.push('construction quality normalization mismatch');
    const payload = structuredClone(record); delete payload.constructionQualityDigest;
    if (digestJson(payload) !== record.constructionQualityDigest) errors.push('construction quality digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

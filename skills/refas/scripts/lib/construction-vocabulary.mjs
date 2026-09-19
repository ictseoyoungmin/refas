import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const CONSTRUCTION_VOCABULARY_SCHEMA = 'refas.construction-vocabulary-decision/v1';

export const CONSTRUCTION_VOCABULARIES = Object.freeze([
  'hard-surface',
  'organic',
  'mechanical-articulated',
  'hybrid',
  'unresolved',
]);

export const CONSTRUCTION_FAMILY_CLASSES = Object.freeze([
  'generic-primitive',
  'hard-surface',
  'organic',
  'mechanical-articulated',
]);

const RESOLVED = new Set(CONSTRUCTION_VOCABULARIES.filter((value) => !['hybrid','unresolved'].includes(value)));
const VOCABULARIES = new Set(CONSTRUCTION_VOCABULARIES);
const FAMILY_CLASSES = new Set(CONSTRUCTION_FAMILY_CLASSES);

export const CONSTRUCTION_VOCABULARY_POLICY = deepFreeze({
  schema: 'refas.construction-vocabulary-policy/v1',
  compatibility: {
    'hard-surface': ['hard-surface'],
    organic: ['organic'],
    'mechanical-articulated': ['mechanical-articulated', 'hard-surface'],
    hybrid: ['hard-surface', 'organic', 'mechanical-articulated'],
    unresolved: [],
  },
  requirements: {
    'hard-surface': {requiredFamilies: ['hard-surface']},
    organic: {requiredFamilies: ['organic']},
    'mechanical-articulated': {requiredFamilies: ['mechanical-articulated']},
    hybrid: {minimumResolvedAssignments: 2, minimumDistinctAssignedVocabularies: 2},
    unresolved: {identityBearingAllowed: false},
  },
  genericPrimitive: {
    blockoutAllowed: true,
    identityBearingByItself: false,
  },
});

export const CONSTRUCTION_VOCABULARY_POLICY_DIGEST = digestJson(CONSTRUCTION_VOCABULARY_POLICY);

function uniqueStrings(values, label, {allowEmpty = false} = {}) {
  const normalized = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (!allowEmpty && normalized.length === 0) throw new Error(`${label} requires at least one value`);
  return normalized;
}

function normalizeVocabulary(value, label) {
  const vocabulary = String(value ?? '').trim().toLowerCase();
  if (!VOCABULARIES.has(vocabulary)) throw new Error(`${label} must be one of ${CONSTRUCTION_VOCABULARIES.join(', ')}`);
  return vocabulary;
}

function normalizeAssignments(vocabulary, raw = []) {
  if (!Array.isArray(raw)) throw new Error('assignments must be an array');
  const assignments = raw.map((item, index) => {
    const scopeId = assertId(item?.scopeId, `assignments[${index}].scopeId`);
    const assignedVocabulary = normalizeVocabulary(item?.vocabulary, `assignments[${index}].vocabulary`);
    if (!RESOLVED.has(assignedVocabulary)) throw new Error(`assignments[${index}].vocabulary must be a resolved non-hybrid vocabulary`);
    return {
      scopeId,
      vocabulary: assignedVocabulary,
      evidenceRefs: uniqueStrings(item?.evidenceRefs, `assignments[${index}].evidenceRefs`),
    };
  });
  const ids = assignments.map((item) => item.scopeId);
  if (new Set(ids).size !== ids.length) throw new Error('assignment scope IDs must be unique');
  if (vocabulary !== 'hybrid' && assignments.length) throw new Error('assignments are only valid for hybrid vocabulary');
  if (vocabulary === 'hybrid') {
    const rule = CONSTRUCTION_VOCABULARY_POLICY.requirements.hybrid;
    if (assignments.length < rule.minimumResolvedAssignments) throw new Error(`hybrid vocabulary requires at least ${rule.minimumResolvedAssignments} resolved scope assignments`);
    const distinct = new Set(assignments.map((item) => item.vocabulary));
    if (distinct.size < rule.minimumDistinctAssignedVocabularies) throw new Error('hybrid vocabulary requires at least two distinct resolved vocabularies');
  }
  return assignments;
}

export function createConstructionVocabularyDecision({
  scopeId,
  sourceSha256,
  vocabulary,
  evidenceRefs = [],
  rationale,
  ambiguities = [],
  assignments = [],
} = {}) {
  const normalizedVocabulary = normalizeVocabulary(vocabulary, 'vocabulary');
  const normalizedScopeId = assertId(scopeId, 'scopeId');
  const normalizedEvidence = uniqueStrings(evidenceRefs, 'evidenceRefs');
  const normalizedRationale = String(rationale ?? '').trim();
  if (!normalizedRationale) throw new Error('rationale is required');
  const normalizedAssignments = normalizeAssignments(normalizedVocabulary, assignments);
  const normalizedAmbiguities = uniqueStrings(ambiguities, 'ambiguities', {allowEmpty: true});
  if (normalizedVocabulary === 'unresolved' && normalizedAmbiguities.length === 0) {
    throw new Error('unresolved vocabulary requires at least one explicit ambiguity');
  }

  const payload = {
    schema: CONSTRUCTION_VOCABULARY_SCHEMA,
    scopeId: normalizedScopeId,
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    vocabulary: normalizedVocabulary,
    evidenceRefs: normalizedEvidence,
    rationale: normalizedRationale,
    ambiguities: normalizedAmbiguities,
    assignments: normalizedAssignments,
    policyDigest: CONSTRUCTION_VOCABULARY_POLICY_DIGEST,
    policy: {
      sourceBound: true,
      decisionPrecedesIdentityBearingConstruction: true,
      hybridIsNotUncertaintyFallback: true,
      unresolvedBlocksIdentityBearingClosure: true,
      genericPrimitiveRemainsBlockoutOnly: true,
    },
  };
  return deepFreeze({...payload, decisionDigest: digestJson(payload)});
}

export function validateConstructionVocabularyDecision(decision) {
  const errors = [];
  if (decision?.schema !== CONSTRUCTION_VOCABULARY_SCHEMA) errors.push('invalid schema');
  if (decision?.policyDigest !== CONSTRUCTION_VOCABULARY_POLICY_DIGEST) errors.push('construction vocabulary policy digest mismatch');
  try {
    const recreated = createConstructionVocabularyDecision(decision);
    if (recreated.decisionDigest !== decision.decisionDigest) errors.push('construction vocabulary normalization mismatch');
    const payload = structuredClone(decision);
    delete payload.decisionDigest;
    if (digestJson(payload) !== decision.decisionDigest) errors.push('construction vocabulary decision digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function constructionFamilyCompatibility(decision, constructionFamilies = [], {
  claim = 'blockout',
  scopeId = null,
  sourceSha256 = null,
} = {}) {
  const validation = validateConstructionVocabularyDecision(decision);
  const errors = [...validation.errors];
  const normalizedClaim = String(claim ?? '').trim();
  if (!['blockout','identity-bearing'].includes(normalizedClaim)) errors.push('claim must be blockout or identity-bearing');

  const families = uniqueStrings(constructionFamilies, 'constructionFamilies');
  for (const family of families) {
    if (!FAMILY_CLASSES.has(family)) errors.push(`unknown canonical construction family: ${family}`);
  }

  if (scopeId != null && decision?.scopeId !== scopeId) errors.push(`vocabulary decision scope mismatch: expected ${scopeId}, got ${decision?.scopeId ?? 'missing'}`);
  if (sourceSha256 != null && decision?.sourceSha256 !== sourceSha256) errors.push('vocabulary decision source digest mismatch');

  const productionFamilies = families.filter((family) => family !== 'generic-primitive');
  if (normalizedClaim === 'identity-bearing') {
    if (decision?.vocabulary === 'unresolved') errors.push('unresolved vocabulary cannot authorize identity-bearing construction');
    if (productionFamilies.length === 0) errors.push('identity-bearing construction requires at least one non-generic canonical construction family');

    if (decision?.vocabulary === 'hybrid') {
      const assigned = new Set((decision.assignments ?? []).map((item) => item.vocabulary));
      for (const family of productionFamilies) if (!assigned.has(family)) errors.push(`hybrid construction family ${family} has no matching resolved scope assignment`);
      for (const vocabulary of assigned) if (!productionFamilies.includes(vocabulary)) errors.push(`hybrid assignment vocabulary ${vocabulary} is not represented by the construction families`);
    } else if (RESOLVED.has(decision?.vocabulary)) {
      const allowed = new Set(CONSTRUCTION_VOCABULARY_POLICY.compatibility[decision.vocabulary] ?? []);
      for (const family of productionFamilies) if (!allowed.has(family)) errors.push(`construction family ${family} is incompatible with vocabulary ${decision.vocabulary}`);
      const required = CONSTRUCTION_VOCABULARY_POLICY.requirements[decision.vocabulary]?.requiredFamilies ?? [];
      for (const family of required) if (!productionFamilies.includes(family)) errors.push(`vocabulary ${decision.vocabulary} requires construction family ${family}`);
    }
  }

  return deepFreeze({
    valid: errors.length === 0,
    vocabulary: decision?.vocabulary ?? null,
    constructionFamilies: families,
    productionFamilies,
    claim: normalizedClaim,
    errors,
  });
}

export function assertConstructionFamilyCompatible(decision, constructionFamilies = [], options = {}) {
  const result = constructionFamilyCompatibility(decision, constructionFamilies, options);
  if (!result.valid) throw new Error(`construction vocabulary gate failed: ${result.errors.join('; ')}`);
  return result;
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {createHardSurfaceShell} from './hard-surface.mjs';
import {createSectionProfileLoft} from './geometry-backend.mjs';
import {createSurfaceNetworkParts, validateSurfaceNetwork} from './surface-network.mjs';

export const CONSTRUCTION_VOCABULARY_SCHEMA = 'refas.construction-vocabulary/v1';
export const CONSTRUCTION_OPERATION_PERMIT_SCHEMA = 'refas.construction-operation-permit/v1';

export const CONSTRUCTION_VOCABULARIES = Object.freeze([
  'hard-surface',
  'organic',
  'mechanical-articulated',
  'hybrid',
  'unresolved',
]);

export const CONSTRUCTION_OPERATIONS = Object.freeze([
  'hard-surface-shell',
  'surface-network-parts',
  'section-profile-loft-rigid',
  'section-profile-loft-organic',
  'assembly-decomposition',
]);

const VOCABULARY_SET = new Set(CONSTRUCTION_VOCABULARIES);
const OPERATION_SET = new Set(CONSTRUCTION_OPERATIONS);
const LEAF_VOCABULARIES = new Set(['hard-surface', 'organic']);
const OPERATION_VOCABULARY = Object.freeze({
  'hard-surface-shell': 'hard-surface',
  'surface-network-parts': 'hard-surface',
  'section-profile-loft-rigid': 'hard-surface',
  'section-profile-loft-organic': 'organic',
  'assembly-decomposition': 'mechanical-articulated',
});

function strings(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function requiredStrings(values, label) {
  const output = strings(values);
  if (!output.length) throw new Error(`${label} requires at least one value`);
  return output;
}

function normalizeCue(raw, index, label) {
  const evidenceRefs = requiredStrings(raw?.evidenceRefs, `${label}[${index}].evidenceRefs`);
  const description = String(raw?.description ?? '').trim();
  if (!description) throw new Error(`${label}[${index}].description is required`);
  return {
    id: assertId(raw?.id, `${label}[${index}].id`),
    description,
    evidenceRefs,
  };
}

function normalizeMechanicalDecomposition(raw, identityScopes) {
  if (!raw || typeof raw !== 'object') throw new Error('mechanical-articulated vocabulary requires mechanicalDecomposition');
  const partIds = requiredStrings(raw.partIds, 'mechanicalDecomposition.partIds').map((id, index) => assertId(id, `mechanicalDecomposition.partIds[${index}]`));
  const interfaceIds = requiredStrings(raw.interfaceIds, 'mechanicalDecomposition.interfaceIds').map((id, index) => assertId(id, `mechanicalDecomposition.interfaceIds[${index}]`));
  const articulationIds = requiredStrings(raw.articulationIds, 'mechanicalDecomposition.articulationIds').map((id, index) => assertId(id, `mechanicalDecomposition.articulationIds[${index}]`));
  const evidenceRefs = requiredStrings(raw.evidenceRefs, 'mechanicalDecomposition.evidenceRefs');
  if (JSON.stringify([...partIds].sort()) !== JSON.stringify([...identityScopes].sort())) {
    throw new Error('mechanicalDecomposition.partIds must exactly cover identityScopes');
  }
  return {partIds, interfaceIds, articulationIds, evidenceRefs};
}

function normalizedChildDecision(raw, sourceSha256, index) {
  const validation = validateConstructionVocabulary(raw);
  if (!validation.valid) throw new Error(`childDecisions[${index}] is invalid: ${validation.errors.join('; ')}`);
  if (raw.sourceSha256 !== sourceSha256) throw new Error(`childDecisions[${index}] does not bind the parent source`);
  if (!LEAF_VOCABULARIES.has(raw.vocabulary)) throw new Error(`childDecisions[${index}] must resolve to hard-surface or organic`);
  return raw;
}

export function createConstructionVocabulary({
  scopeId,
  sourceSha256,
  vocabulary = 'unresolved',
  cues = [],
  contraryCues = [],
  ambiguities = [],
  evidenceRefs = [],
  identityScopes = [],
  childDecisions = [],
  mechanicalDecomposition = null,
} = {}) {
  const normalizedScopeId = assertId(scopeId, 'scopeId');
  const normalizedSource = assertDigest(sourceSha256, 'sourceSha256');
  const normalizedVocabulary = String(vocabulary ?? '').trim().toLowerCase();
  if (!VOCABULARY_SET.has(normalizedVocabulary)) throw new Error(`unknown construction vocabulary: ${vocabulary}`);
  const normalizedEvidence = requiredStrings(evidenceRefs, 'evidenceRefs');
  const normalizedCues = cues.map((item, index) => normalizeCue(item, index, 'cues'));
  const normalizedContrary = contraryCues.map((item, index) => normalizeCue(item, index, 'contraryCues'));
  const normalizedAmbiguities = strings(ambiguities);

  if (normalizedVocabulary === 'unresolved') {
    if (normalizedCues.length && !normalizedAmbiguities.length) throw new Error('unresolved vocabulary with positive cues must declare the unresolved ambiguity');
  } else if (!normalizedCues.length) {
    throw new Error(`${normalizedVocabulary} vocabulary requires at least one source-grounded cue`);
  }

  let normalizedIdentityScopes;
  let normalizedChildren;
  let normalizedMechanical = null;

  if (normalizedVocabulary === 'hybrid' || normalizedVocabulary === 'mechanical-articulated') {
    normalizedIdentityScopes = requiredStrings(identityScopes, 'identityScopes').map((id, index) => assertId(id, `identityScopes[${index}]`));
    if (normalizedIdentityScopes.length < 2) throw new Error(`${normalizedVocabulary} vocabulary requires at least two identity scopes`);
    normalizedChildren = childDecisions.map((child, index) => normalizedChildDecision(child, normalizedSource, index))
      .sort((a, b) => a.scopeId.localeCompare(b.scopeId));
    if (new Set(normalizedChildren.map((child) => child.scopeId)).size !== normalizedChildren.length) throw new Error('child decision scope IDs must be unique');
    if (normalizedChildren.some((child) => child.scopeId === normalizedScopeId)) throw new Error('composite vocabulary child scope cannot equal the parent scope');
    if (JSON.stringify(normalizedChildren.map((child) => child.scopeId).sort()) !== JSON.stringify([...normalizedIdentityScopes].sort())) {
      throw new Error('childDecisions must exactly cover identityScopes');
    }
    if (normalizedVocabulary === 'mechanical-articulated') {
      normalizedMechanical = normalizeMechanicalDecomposition(mechanicalDecomposition, normalizedIdentityScopes);
    } else if (mechanicalDecomposition != null) {
      throw new Error('mechanicalDecomposition is only valid for mechanical-articulated vocabulary');
    }
  } else {
    normalizedIdentityScopes = [normalizedScopeId];
    normalizedChildren = [];
    if (identityScopes.length && !(identityScopes.length === 1 && identityScopes[0] === normalizedScopeId)) {
      throw new Error('leaf/unresolved vocabulary identityScopes must be omitted or contain only scopeId');
    }
    if (childDecisions.length) throw new Error('leaf/unresolved vocabulary cannot carry childDecisions');
    if (mechanicalDecomposition != null) throw new Error('mechanicalDecomposition is only valid for mechanical-articulated vocabulary');
  }

  const payload = {
    schema: CONSTRUCTION_VOCABULARY_SCHEMA,
    scopeId: normalizedScopeId,
    sourceSha256: normalizedSource,
    vocabulary: normalizedVocabulary,
    cues: normalizedCues,
    contraryCues: normalizedContrary,
    ambiguities: normalizedAmbiguities,
    evidenceRefs: normalizedEvidence,
    identityScopes: normalizedIdentityScopes,
    childDecisions: normalizedChildren,
    mechanicalDecomposition: normalizedMechanical,
    policy: {
      decisionPrecedesIdentityGeometry: true,
      unresolvedIsBlockoutOnly: true,
      compositeWholeCannotUseOneUndifferentiatedGeometryFamily: true,
      mechanicalWholeRequiresExplicitDecomposition: true,
      evidenceRemainsPrimary: true,
    },
  };
  return deepFreeze({...payload, vocabularyDigest: digestJson(payload)});
}

export function validateConstructionVocabulary(record) {
  const errors = [];
  try {
    if (record?.schema !== CONSTRUCTION_VOCABULARY_SCHEMA) errors.push('invalid schema');
    const recreated = createConstructionVocabulary(record);
    if (recreated.vocabularyDigest !== record.vocabularyDigest) errors.push('construction vocabulary normalization mismatch');
    if (digestJson(recreated) !== digestJson(record)) errors.push('construction vocabulary is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function findEffectiveDecision(rootDecision, scopeId) {
  if (rootDecision.scopeId === scopeId) return rootDecision;
  return (rootDecision.childDecisions ?? []).find((child) => child.scopeId === scopeId) ?? null;
}

function operationAllowed(vocabulary, operation, {isRootScope = false} = {}) {
  if (operation === 'assembly-decomposition') return vocabulary === 'mechanical-articulated' && isRootScope;
  const required = OPERATION_VOCABULARY[operation];
  return required === vocabulary;
}

export function createConstructionOperationPermit({
  decision,
  scopeId,
  operation,
  evidenceRefs = [],
} = {}) {
  const validation = validateConstructionVocabulary(decision);
  if (!validation.valid) throw new Error(`construction vocabulary is invalid: ${validation.errors.join('; ')}`);
  const targetScope = assertId(scopeId, 'scopeId');
  const normalizedOperation = String(operation ?? '').trim();
  if (!OPERATION_SET.has(normalizedOperation)) throw new Error(`unknown construction operation: ${operation}`);

  const effective = findEffectiveDecision(decision, targetScope);
  if (!effective) throw new Error(`construction vocabulary does not cover scope ${targetScope}`);
  if (effective.vocabulary === 'unresolved') throw new Error('unresolved construction vocabulary cannot authorize identity-bearing geometry');
  const isRootScope = targetScope === decision.scopeId;
  if ((decision.vocabulary === 'hybrid' || decision.vocabulary === 'mechanical-articulated') && isRootScope && normalizedOperation !== 'assembly-decomposition') {
    throw new Error(`${decision.vocabulary} whole scope cannot authorize one undifferentiated identity geometry operation`);
  }
  if (!operationAllowed(effective.vocabulary, normalizedOperation, {isRootScope})) {
    throw new Error(`construction operation ${normalizedOperation} is incompatible with vocabulary ${effective.vocabulary}`);
  }
  if (decision.vocabulary === 'mechanical-articulated' && normalizedOperation !== 'assembly-decomposition') {
    if (!decision.mechanicalDecomposition?.partIds.includes(targetScope)) throw new Error(`mechanical decomposition does not cover part scope ${targetScope}`);
  }

  const mechanicalDecompositionDigest = decision.mechanicalDecomposition == null ? null : digestJson(decision.mechanicalDecomposition);
  const normalizedEvidence = strings([
    ...decision.evidenceRefs,
    ...effective.evidenceRefs,
    ...(decision.mechanicalDecomposition?.evidenceRefs ?? []),
    ...evidenceRefs,
  ]);
  const payload = {
    schema: CONSTRUCTION_OPERATION_PERMIT_SCHEMA,
    rootScopeId: decision.scopeId,
    scopeId: targetScope,
    sourceSha256: decision.sourceSha256,
    vocabulary: effective.vocabulary,
    operation: normalizedOperation,
    vocabularyDigest: decision.vocabularyDigest,
    effectiveVocabularyDigest: effective.vocabularyDigest,
    mechanicalDecompositionDigest,
    evidenceRefs: normalizedEvidence,
    policy: {
      identityGeometryRequiresPermit: true,
      permitIsScopeSourceDecisionAndOperationBound: true,
      lowLevelPrimitivesDoNotImplyIdentityAuthority: true,
    },
  };
  return deepFreeze({...payload, permitDigest: digestJson(payload)});
}

export function validateConstructionOperationPermit(decision, permit, {scopeId = null, operation = null} = {}) {
  const errors = [];
  try {
    if (permit?.schema !== CONSTRUCTION_OPERATION_PERMIT_SCHEMA) errors.push('invalid permit schema');
    const expected = createConstructionOperationPermit({
      decision,
      scopeId: scopeId ?? permit?.scopeId,
      operation: operation ?? permit?.operation,
      evidenceRefs: permit?.evidenceRefs ?? [],
    });
    if (expected.permitDigest !== permit?.permitDigest) errors.push('construction permit digest mismatch');
    if (digestJson(expected) !== digestJson(permit)) errors.push('construction permit is not canonical for the bound decision');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function requirePermit(decision, permit, operation, scopeId) {
  const validation = validateConstructionOperationPermit(decision, permit, {operation, scopeId});
  if (!validation.valid) throw new Error(`construction operation permit is invalid: ${validation.errors.join('; ')}`);
}

function constructionAuthority(decision, permit) {
  return {
    schema: CONSTRUCTION_OPERATION_PERMIT_SCHEMA,
    scopeId: permit.scopeId,
    sourceSha256: permit.sourceSha256,
    vocabulary: permit.vocabulary,
    operation: permit.operation,
    vocabularyDigest: permit.vocabularyDigest,
    effectiveVocabularyDigest: permit.effectiveVocabularyDigest,
    permitDigest: permit.permitDigest,
  };
}

export function createPermittedHardSurfaceShell({decision, permit, spec = {}} = {}) {
  requirePermit(decision, permit, 'hard-surface-shell', permit?.scopeId);
  const mesh = createHardSurfaceShell(spec);
  return deepFreeze({...mesh, constructionAuthority: constructionAuthority(decision, permit)});
}

export function createPermittedSectionProfileLoft({decision, permit, spec = {}} = {}) {
  if (!['section-profile-loft-rigid', 'section-profile-loft-organic'].includes(permit?.operation)) {
    throw new Error('section-profile loft requires a rigid or organic loft permit');
  }
  requirePermit(decision, permit, permit.operation, permit.scopeId);
  const mesh = createSectionProfileLoft(spec);
  return deepFreeze({...mesh, constructionAuthority: constructionAuthority(decision, permit)});
}

export function createPermittedSurfaceNetworkParts({decision, permit, network, options = {}} = {}) {
  requirePermit(decision, permit, 'surface-network-parts', permit?.scopeId);
  const networkValidation = validateSurfaceNetwork(network);
  if (!networkValidation.valid) throw new Error(`surface network is invalid: ${networkValidation.errors.join('; ')}`);
  if (network.scopeId !== permit.scopeId) throw new Error('surface network scope does not match construction permit');
  if (network.sourceSha256 !== permit.sourceSha256) throw new Error('surface network source does not match construction permit');
  const parts = createSurfaceNetworkParts(network, options);
  return deepFreeze({...parts, constructionAuthority: constructionAuthority(decision, permit)});
}

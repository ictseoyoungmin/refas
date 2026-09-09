import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateRelationalStructure} from './relational-structure.mjs';

export const SEMANTIC_AUTHORITY_SCHEMA = 'refas.semantic-authority-set/v1';
export const SEMANTIC_AUTHORITY_CLASSES = Object.freeze(['observed', 'inferred', 'engineered', 'unknown', 'forbidden']);
export const SEMANTIC_BASIS_KINDS = Object.freeze([
  'source-evidence',
  'source-contradiction',
  'relation',
  'structural-prior',
  'functional-requirement',
  'downstream-requirement',
  'external-spec',
  'hard-constraint',
]);

const AUTHORITY = new Set(SEMANTIC_AUTHORITY_CLASSES);
const BASIS = new Set(SEMANTIC_BASIS_KINDS);
const SOURCE_SUPPORT = new Set(['source-evidence']);
const INFERENCE_SUPPORT = new Set(['source-evidence', 'relation', 'structural-prior', 'external-spec']);
const ENGINEERING_SUPPORT = new Set(['functional-requirement', 'downstream-requirement']);
const FORBIDDING_SUPPORT = new Set(['source-contradiction', 'hard-constraint']);

function text(value, label, {required = false} = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new Error(`${label} is required`);
  return result;
}

function normalizeBasis(raw, entryLabel, index) {
  const label = `${entryLabel}.basis[${index}]`;
  const kind = text(raw?.kind, `${label}.kind`, {required: true}).toLowerCase();
  if (!BASIS.has(kind)) throw new Error(`${label}.kind must be one of: ${SEMANTIC_BASIS_KINDS.join(', ')}`);
  const ref = text(raw?.ref, `${label}.ref`, {required: true});
  const digest = raw?.digest == null ? null : assertDigest(raw.digest, `${label}.digest`);
  return {kind, ref, digest};
}

function authorityCapabilities(authority) {
  return {
    canAssertSourceFact: authority === 'observed',
    canInstantiateConstruction: ['observed', 'inferred', 'engineered'].includes(authority),
    canServeAsHypothesis: ['observed', 'inferred', 'engineered', 'unknown'].includes(authority),
    requiresResolutionBeforePositiveClaim: authority === 'unknown',
    prohibitsConstruction: authority === 'forbidden',
  };
}

function requireBasisKind(basis, acceptedKinds, message) {
  if (!basis.some((item) => acceptedKinds.has(item.kind))) throw new Error(message);
}

function normalizeEntry(raw, index) {
  const label = `entries[${index}]`;
  const authority = text(raw?.authority, `${label}.authority`, {required: true}).toLowerCase();
  if (!AUTHORITY.has(authority)) throw new Error(`${label}.authority must be one of: ${SEMANTIC_AUTHORITY_CLASSES.join(', ')}`);
  const basis = (raw?.basis ?? []).map((item, basisIndex) => normalizeBasis(item, label, basisIndex));
  const basisKeys = basis.map((item) => `${item.kind}:${item.ref}:${item.digest ?? ''}`);
  if (new Set(basisKeys).size !== basisKeys.length) throw new Error(`${label}.basis entries must be unique`);
  const reason = text(raw?.reason, `${label}.reason`, {required: authority !== 'observed'});

  if (authority === 'observed') {
    requireBasisKind(basis, SOURCE_SUPPORT, `${label} OBSERVED requires source-evidence basis`);
    if (basis.some((item) => item.kind === 'source-contradiction')) throw new Error(`${label} OBSERVED cannot carry source-contradiction basis`);
  } else if (authority === 'inferred') {
    requireBasisKind(basis, INFERENCE_SUPPORT, `${label} INFERRED requires evidence, relation, structural-prior, or external-spec basis`);
    if (basis.some((item) => item.kind === 'source-contradiction')) throw new Error(`${label} INFERRED cannot ignore source contradiction`);
  } else if (authority === 'engineered') {
    requireBasisKind(basis, ENGINEERING_SUPPORT, `${label} ENGINEERED requires functional-requirement or downstream-requirement basis`);
    if (basis.some((item) => item.kind === 'source-contradiction')) throw new Error(`${label} ENGINEERED cannot override source contradiction`);
  } else if (authority === 'forbidden') {
    requireBasisKind(basis, FORBIDDING_SUPPORT, `${label} FORBIDDEN requires source-contradiction or hard-constraint basis`);
  }

  const entry = {
    id: assertId(raw?.id, `${label}.id`),
    subjectId: assertId(raw?.subjectId, `${label}.subjectId`),
    authority,
    proposition: text(raw?.proposition, `${label}.proposition`, {required: true}),
    reason,
    basis: basis.sort((a, b) => `${a.kind}:${a.ref}`.localeCompare(`${b.kind}:${b.ref}`)),
    capabilities: authorityCapabilities(authority),
  };
  const payload = {...entry};
  return {...entry, authorityDigest: digestJson(payload)};
}

export function createSemanticAuthoritySet({scopeId, sourceSha256, targetSchema, targetDigest, entries = []} = {}) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('semantic authority set requires at least one entry');
  const normalized = entries.map(normalizeEntry).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) throw new Error('semantic authority entry IDs must be unique');
  if (new Set(normalized.map((entry) => entry.subjectId)).size !== normalized.length) throw new Error('each subject may have only one active semantic authority entry per set');
  const payload = {
    schema: SEMANTIC_AUTHORITY_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    targetSchema: text(targetSchema, 'targetSchema', {required: true}),
    targetDigest: assertDigest(targetDigest, 'targetDigest'),
    entries: normalized,
    policy: {
      unknownIsNotForbidden: true,
      unobservedDoesNotMeanForbidden: true,
      engineeredIsNotObserved: true,
      inferredIsNotObserved: true,
      positiveConstructionRequiresNonUnknownAuthority: true,
      forbiddenIsExplicitContradictionOrConstraint: true,
      authorityNeverPromotesItselfToSourceFact: true,
    },
  };
  return deepFreeze({...payload, authoritySetDigest: digestJson(payload)});
}

export function validateSemanticAuthoritySet(value) {
  const errors = [];
  try {
    if (value?.schema !== SEMANTIC_AUTHORITY_SCHEMA) errors.push('invalid schema');
    const recreated = createSemanticAuthoritySet(value);
    if (recreated.authoritySetDigest !== value?.authoritySetDigest) errors.push('semantic authority set digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('semantic authority set is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function semanticAuthorityCapabilities(entry) {
  const authority = text(entry?.authority, 'authority', {required: true}).toLowerCase();
  if (!AUTHORITY.has(authority)) throw new Error(`authority must be one of: ${SEMANTIC_AUTHORITY_CLASSES.join(', ')}`);
  return deepFreeze(authorityCapabilities(authority));
}

export function validateSemanticAuthorityTransition(previousEntry, nextEntry) {
  const errors = [];
  try {
    const previous = normalizeEntry(previousEntry, 0), next = normalizeEntry(nextEntry, 1);
    if (previous.subjectId !== next.subjectId) errors.push('semantic authority transition must preserve subjectId');
    if (previous.authority === 'forbidden' && next.authority !== 'forbidden') {
      const rebuttal = next.basis.some((item) => ['source-evidence', 'external-spec', 'hard-constraint'].includes(item.kind) && !previous.basis.some((old) => old.kind === item.kind && old.ref === item.ref && old.digest === item.digest));
      if (!rebuttal) errors.push('leaving FORBIDDEN requires new rebutting evidence/spec/constraint basis');
    }
    if (next.authority === 'observed' && !next.basis.some((item) => item.kind === 'source-evidence')) errors.push('promotion to OBSERVED requires source evidence');
    if (next.authority === 'engineered' && !next.basis.some((item) => ENGINEERING_SUPPORT.has(item.kind))) errors.push('promotion to ENGINEERED requires an explicit functional/downstream requirement');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateRelationalAuthorityCoverage(authoritySet, relationalStructure, {wholeSystemOnly = true} = {}) {
  const errors = [];
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!authorityValidation.valid) errors.push(`authority set invalid: ${authorityValidation.errors.join('; ')}`);
  const structureValidation = validateRelationalStructure(relationalStructure);
  if (!structureValidation.valid) errors.push(`relational structure invalid: ${structureValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: []};
  if (authoritySet.sourceSha256 !== relationalStructure.sourceSha256) errors.push('authority set and relational structure sourceSha256 differ');
  if (authoritySet.targetSchema !== relationalStructure.schema || authoritySet.targetDigest !== relationalStructure.structureDigest) errors.push('authority set does not bind the exact relational structure');
  const requiredIds = relationalStructure.relations.filter((relation) => !wholeSystemOnly || relation.scope === 'whole-system').map((relation) => relation.id).sort();
  const covered = new Set(authoritySet.entries.map((entry) => entry.subjectId));
  const missingSubjectIds = requiredIds.filter((id) => !covered.has(id));
  if (missingSubjectIds.length) errors.push(`missing semantic authority for relation(s): ${missingSubjectIds.join(', ')}`);
  const unknownSubjectIds = authoritySet.entries.map((entry) => entry.subjectId).filter((id) => !relationalStructure.relations.some((relation) => relation.id === id) && !relationalStructure.entities.some((entity) => entity.id === id)).sort();
  if (unknownSubjectIds.length) errors.push(`authority set references subject(s) outside relational structure: ${unknownSubjectIds.join(', ')}`);
  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

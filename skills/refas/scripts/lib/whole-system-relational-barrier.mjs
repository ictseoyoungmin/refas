import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateRelationalStructure, wholeSystemRelationalObligations} from './relational-structure.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const WHOLE_SYSTEM_RELATIONAL_BARRIER_SCHEMA = 'refas.whole-system-relational-barrier/v1';
export const RELATIONAL_CHECK_STATUSES = Object.freeze(['pass', 'fail', 'unresolved']);

const CHECK_STATUSES = new Set(RELATIONAL_CHECK_STATUSES);
const ALLOWED_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);

const uniqueStrings = (values = []) => [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))].sort();

function normalizeInputCheck(raw, index) {
  const relationId = assertId(raw?.relationId, `relationChecks[${index}].relationId`);
  const status = String(raw?.status ?? '').toLowerCase();
  if (!CHECK_STATUSES.has(status)) throw new Error(`relationChecks[${index}].status must be one of: ${RELATIONAL_CHECK_STATUSES.join(', ')}`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs ?? []);
  if (status === 'pass' && !evidenceRefs.length) throw new Error(`relationChecks[${index}] requires evidenceRefs to pass`);
  return {relationId, status, evidenceRefs};
}

function requireExactIds(actual, expected, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (new Set(sortedActual).size !== sortedActual.length) throw new Error(`${label} contains duplicate relation IDs`);
  if (digestJson(sortedActual) !== digestJson(sortedExpected)) {
    const missing = sortedExpected.filter((id) => !sortedActual.includes(id));
    const unexpected = sortedActual.filter((id) => !sortedExpected.includes(id));
    throw new Error(`${label} must exactly cover whole-system obligations; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`);
  }
}

function blockerCode(code, relationId) {
  return `${code}:${relationId}`;
}

function validateBindings(relationalStructure, authoritySet) {
  const structureValidation = validateRelationalStructure(relationalStructure);
  if (!structureValidation.valid) throw new Error(`relational structure is invalid: ${structureValidation.errors.join('; ')}`);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!authorityValidation.valid) throw new Error(`semantic authority set is invalid: ${authorityValidation.errors.join('; ')}`);
  if (relationalStructure.sourceSha256 !== authoritySet.sourceSha256) throw new Error('relational structure and semantic authority set sourceSha256 differ');
  if (authoritySet.scopeId !== relationalStructure.scopeId) throw new Error('semantic authority set scopeId does not match relational structure');
  if (authoritySet.targetSchema !== relationalStructure.schema || authoritySet.targetDigest !== relationalStructure.structureDigest) {
    throw new Error('semantic authority set does not bind the exact relational structure');
  }
  const subjectIds = new Set([...relationalStructure.entities, ...relationalStructure.relations].map((item) => item.id));
  for (const entry of authoritySet.entries) if (!subjectIds.has(entry.subjectId)) throw new Error(`semantic authority references subject outside relational structure: ${entry.subjectId}`);
}

export function createWholeSystemRelationalBarrier({relationalStructure, authoritySet, relationChecks = []} = {}) {
  validateBindings(relationalStructure, authoritySet);
  const requiredRelationIds = [...wholeSystemRelationalObligations(relationalStructure)].sort();
  const normalizedInputs = relationChecks.map(normalizeInputCheck);
  requireExactIds(normalizedInputs.map((check) => check.relationId), requiredRelationIds, 'relationChecks');

  const relationById = new Map(relationalStructure.relations.map((relation) => [relation.id, relation]));
  const authorityBySubject = new Map(authoritySet.entries.map((entry) => [entry.subjectId, entry]));
  const inputByRelation = new Map(normalizedInputs.map((check) => [check.relationId, check]));
  const blockers = [];
  const checks = [];

  for (const relationId of requiredRelationIds) {
    const relation = relationById.get(relationId);
    const authorityEntry = authorityBySubject.get(relationId) ?? null;
    const check = inputByRelation.get(relationId);
    const authority = authorityEntry?.authority ?? null;

    if (!authorityEntry) blockers.push(blockerCode('AUTHORITY_MISSING', relationId));
    else if (authority === 'unknown') blockers.push(blockerCode('AUTHORITY_UNKNOWN', relationId));
    else if (authority === 'forbidden') blockers.push(blockerCode('AUTHORITY_FORBIDDEN', relationId));
    else if (!ALLOWED_AUTHORITIES.has(authority)) blockers.push(blockerCode('AUTHORITY_INVALID', relationId));

    if (check.status === 'unresolved') blockers.push(blockerCode('RELATION_UNRESOLVED', relationId));
    if (check.status === 'fail') blockers.push(blockerCode('RELATION_FAILED', relationId));

    checks.push({
      relationId,
      relationKind: relation.kind,
      importance: relation.importance,
      status: check.status,
      evidenceRefs: check.evidenceRefs,
      authority,
      authorityDigest: authorityEntry?.authorityDigest ?? null,
    });
  }

  const normalizedBlockers = uniqueStrings(blockers);
  const payload = {
    schema: WHOLE_SYSTEM_RELATIONAL_BARRIER_SCHEMA,
    scopeId: assertId(relationalStructure.scopeId, 'scopeId'),
    sourceSha256: assertDigest(relationalStructure.sourceSha256, 'sourceSha256'),
    relationalStructureDigest: assertDigest(relationalStructure.structureDigest, 'relationalStructureDigest'),
    semanticAuthoritySetDigest: assertDigest(authoritySet.authoritySetDigest, 'semanticAuthoritySetDigest'),
    requiredRelationIds,
    relationChecks: checks,
    blockers: normalizedBlockers,
    status: normalizedBlockers.length ? 'BLOCKED' : 'PASS',
    mayHardenLocal: normalizedBlockers.length === 0,
    policy: {
      wholeSystemRelationsPrecedeLocalHardening: true,
      macroAndIdentityRelationsRequireCurrentEvidence: true,
      unknownAuthorityCannotAuthorizePositiveConstruction: true,
      forbiddenAuthorityBlocksConstruction: true,
      localDetailCannotSatisfyWholeSystemRelations: true,
      visualScoreCannotOverrideRelationalBarrier: true,
      exactStructureAndAuthorityDigestsAreBound: true,
    },
  };
  return deepFreeze({...payload, barrierDigest: digestJson(payload)});
}

export function validateWholeSystemRelationalBarrier(value, {relationalStructure = null, authoritySet = null} = {}) {
  const errors = [];
  try {
    if (value?.schema !== WHOLE_SYSTEM_RELATIONAL_BARRIER_SCHEMA) errors.push('invalid schema');
    assertId(value?.scopeId, 'scopeId');
    assertDigest(value?.sourceSha256, 'sourceSha256');
    assertDigest(value?.relationalStructureDigest, 'relationalStructureDigest');
    assertDigest(value?.semanticAuthoritySetDigest, 'semanticAuthoritySetDigest');
    assertDigest(value?.barrierDigest, 'barrierDigest');
    if (!['PASS', 'BLOCKED'].includes(value?.status)) errors.push('invalid status');
    if (value?.mayHardenLocal !== (value?.status === 'PASS')) errors.push('mayHardenLocal does not match status');
    const requiredIds = uniqueStrings(value?.requiredRelationIds ?? []);
    if (digestJson(requiredIds) !== digestJson(value?.requiredRelationIds ?? [])) errors.push('requiredRelationIds are not canonical');
    if (!requiredIds.length) errors.push('whole-system relational barrier requires at least one relation');
    if (!Array.isArray(value?.relationChecks)) errors.push('relationChecks must be an array');
    else {
      requireExactIds(value.relationChecks.map((check) => check.relationId), requiredIds, 'relationChecks');
      for (const [index, check] of value.relationChecks.entries()) {
        if (!CHECK_STATUSES.has(check?.status)) errors.push(`relationChecks[${index}].status is invalid`);
        const evidenceRefs = uniqueStrings(check?.evidenceRefs ?? []);
        if (digestJson(evidenceRefs) !== digestJson(check?.evidenceRefs ?? [])) errors.push(`relationChecks[${index}].evidenceRefs are not canonical`);
        if (check?.status === 'pass' && !evidenceRefs.length) errors.push(`relationChecks[${index}] pass requires evidenceRefs`);
        if (check?.authorityDigest != null) assertDigest(check.authorityDigest, `relationChecks[${index}].authorityDigest`);
      }
    }
    const blockers = uniqueStrings(value?.blockers ?? []);
    if (digestJson(blockers) !== digestJson(value?.blockers ?? [])) errors.push('blockers are not canonical');
    if (value?.status === 'PASS' && blockers.length) errors.push('passing barrier cannot contain blockers');
    if (value?.status === 'BLOCKED' && !blockers.length) errors.push('blocked barrier requires blockers');
    const policy = value?.policy ?? {};
    for (const key of [
      'wholeSystemRelationsPrecedeLocalHardening',
      'macroAndIdentityRelationsRequireCurrentEvidence',
      'unknownAuthorityCannotAuthorizePositiveConstruction',
      'forbiddenAuthorityBlocksConstruction',
      'localDetailCannotSatisfyWholeSystemRelations',
      'visualScoreCannotOverrideRelationalBarrier',
      'exactStructureAndAuthorityDigestsAreBound',
    ]) if (policy[key] !== true) errors.push(`barrier policy is incomplete: ${key}`);
    const payload = structuredClone(value); delete payload.barrierDigest;
    if (digestJson(payload) !== value?.barrierDigest) errors.push('barrier digest mismatch');

    if (relationalStructure && authoritySet) {
      const recreated = createWholeSystemRelationalBarrier({
        relationalStructure,
        authoritySet,
        relationChecks: value.relationChecks.map(({relationId, status, evidenceRefs}) => ({relationId, status, evidenceRefs})),
      });
      if (recreated.barrierDigest !== value.barrierDigest) errors.push('barrier does not match the supplied relational structure and semantic authority set');
    } else if (relationalStructure || authoritySet) {
      errors.push('relationalStructure and authoritySet must be supplied together for exact binding validation');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

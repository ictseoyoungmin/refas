import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const ATTACHMENT_SEMANTICS_SCHEMA = 'refas.attachment-semantics/v1';

export const ATTACHMENT_MODES = Object.freeze([
  'FUSED',
  'RIGID_FOLLOW',
  'SURFACE_OFFSET',
  'MULTI_ANCHOR',
  'ARTICULATED',
  'SUPPORTED_CLEARANCE',
  'FREE',
]);

const MODE_RULES = Object.freeze({
  FUSED: {minOwners: 1, maxOwners: 1, propagatesOwnerChange: true, requiresSolver: false},
  RIGID_FOLLOW: {minOwners: 1, maxOwners: 1, propagatesOwnerChange: true, requiresSolver: false},
  SURFACE_OFFSET: {minOwners: 1, maxOwners: 1, propagatesOwnerChange: true, requiresSolver: true},
  MULTI_ANCHOR: {minOwners: 2, maxOwners: Infinity, propagatesOwnerChange: true, requiresSolver: true},
  ARTICULATED: {minOwners: 1, maxOwners: 1, propagatesOwnerChange: true, requiresSolver: true},
  SUPPORTED_CLEARANCE: {minOwners: 1, maxOwners: Infinity, propagatesOwnerChange: true, requiresSolver: true},
  FREE: {minOwners: 0, maxOwners: 0, propagatesOwnerChange: false, requiresSolver: false},
});

const BASIS = new Set(['observed', 'interpreted', 'construction']);
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function normalizeEntity(raw, index) {
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`entities[${index}].evidenceRefs requires at least one reference`);
  return {
    id: assertId(raw?.id, `entities[${index}].id`),
    scopeId: assertId(raw?.scopeId, `entities[${index}].scopeId`),
    evidenceRefs,
  };
}

function normalizeRelation(raw, index, entityIds) {
  const label = `relations[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const mode = String(raw?.mode ?? '').trim();
  const rule = MODE_RULES[mode];
  if (!rule) throw new Error(`${label}.mode must be one of: ${ATTACHMENT_MODES.join(', ')}`);
  const subjectId = assertId(raw?.subjectId, `${label}.subjectId`);
  if (!entityIds.has(subjectId)) throw new Error(`${label}.subjectId references an unknown entity`);
  const ownerIds = uniqueStrings(raw?.ownerIds);
  if (ownerIds.length < rule.minOwners || ownerIds.length > rule.maxOwners) {
    const expected = rule.maxOwners === Infinity ? `at least ${rule.minOwners}` : rule.minOwners === rule.maxOwners ? `${rule.minOwners}` : `${rule.minOwners}-${rule.maxOwners}`;
    throw new Error(`${label}.ownerIds requires ${expected} owner(s) for ${mode}`);
  }
  for (const ownerId of ownerIds) {
    assertId(ownerId, `${label}.ownerIds`);
    if (!entityIds.has(ownerId)) throw new Error(`${label}.ownerIds references an unknown entity: ${ownerId}`);
    if (ownerId === subjectId) throw new Error(`${label} may not attach an entity to itself`);
  }
  const basis = String(raw?.basis ?? '').trim();
  if (!BASIS.has(basis)) throw new Error(`${label}.basis must be observed, interpreted, or construction`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one reference`);
  return {
    id,
    mode,
    subjectId,
    ownerIds,
    basis,
    evidenceRefs,
    semantics: {
      propagatesOwnerChange: rule.propagatesOwnerChange,
      requiresSolver: rule.requiresSolver,
    },
  };
}

function findCycle(entityIds, relations) {
  const graph = new Map([...entityIds].map((id) => [id, []]));
  for (const relation of relations) {
    if (relation.mode === 'FREE') continue;
    for (const ownerId of relation.ownerIds) graph.get(ownerId).push(relation.subjectId);
  }
  const visiting = new Set();
  const done = new Set();
  function walk(id) {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) if (walk(next)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  }
  return [...entityIds].some(walk);
}

export function createAttachmentSemantics({
  scopeId,
  sourceSha256,
  entities = [],
  relations = [],
  evidenceRefs = [],
} = {}) {
  if (!entities.length) throw new Error('attachment semantics requires at least one entity');
  const normalizedEntities = entities.map(normalizeEntity);
  const entityIds = new Set(normalizedEntities.map((entity) => entity.id));
  if (entityIds.size !== normalizedEntities.length) throw new Error('attachment entity IDs must be unique');
  const normalizedRelations = relations.map((relation, index) => normalizeRelation(relation, index, entityIds));
  if (new Set(normalizedRelations.map((relation) => relation.id)).size !== normalizedRelations.length) throw new Error('attachment relation IDs must be unique');

  const relationCountBySubject = new Map();
  for (const relation of normalizedRelations) relationCountBySubject.set(relation.subjectId, (relationCountBySubject.get(relation.subjectId) ?? 0) + 1);
  const multiplyClassified = [...relationCountBySubject.entries()].filter(([, count]) => count !== 1).map(([subjectId]) => subjectId);
  if (multiplyClassified.length) throw new Error(`each attachment entity must have exactly one primary semantic relation: ${multiplyClassified.join(', ')}`);

  if (findCycle(entityIds, normalizedRelations)) throw new Error('attachment ownership graph contains a cycle');

  const relatedSubjects = new Set(normalizedRelations.map((relation) => relation.subjectId));
  const unclassified = normalizedEntities.filter((entity) => !relatedSubjects.has(entity.id)).map((entity) => entity.id);
  if (unclassified.length) throw new Error(`every attachment entity must have an explicit semantic relation, including FREE: ${unclassified.join(', ')}`);

  const payload = {
    schema: ATTACHMENT_SEMANTICS_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    entities: normalizedEntities,
    relations: normalizedRelations,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      implicitAttachmentForbidden: true,
      everyEntityRequiresExplicitMode: true,
      exactlyOnePrimaryRelationPerEntity: true,
      ownerDependentRolesAreExplicit: true,
      ownershipCyclesForbidden: true,
      modeSpecificOwnerArityRequired: true,
      semanticsDoNotMutateGeometry: true,
      semanticsDoNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, semanticsDigest: digestJson(payload)});
}

export function validateAttachmentSemantics(value) {
  const errors = [];
  try {
    if (value?.schema !== ATTACHMENT_SEMANTICS_SCHEMA) errors.push('invalid schema');
    const recreated = createAttachmentSemantics(value);
    if (recreated.semanticsDigest !== value.semanticsDigest) errors.push('attachment semantics digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('attachment semantics is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function attachmentRelationsForSubject(contract, subjectId) {
  const validation = validateAttachmentSemantics(contract);
  if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(subjectId, 'subjectId');
  return contract.relations.filter((relation) => relation.subjectId === id);
}

export function attachmentDirectDependents(contract, ownerId) {
  const validation = validateAttachmentSemantics(contract);
  if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(ownerId, 'ownerId');
  return [...new Set(contract.relations.filter((relation) => relation.ownerIds.includes(id)).map((relation) => relation.subjectId))].sort();
}

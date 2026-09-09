import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const RELATIONAL_STRUCTURE_SCHEMA = 'refas.relational-structure/v1';
export const RELATIONAL_ENTITY_KINDS = Object.freeze(['landmark', 'axis', 'plane', 'volume', 'region', 'interface', 'system']);
export const RELATIONAL_RELATION_KINDS = Object.freeze(['distance-ratio', 'alignment', 'ordering', 'plane-chain', 'volume-ratio']);
export const RELATIONAL_IMPORTANCE = Object.freeze(['macro', 'identity', 'detail']);
export const RELATIONAL_SCOPES = Object.freeze(['whole-system', 'local']);

const ENTITY_KINDS = new Set(RELATIONAL_ENTITY_KINDS);
const RELATION_KINDS = new Set(RELATIONAL_RELATION_KINDS);
const IMPORTANCE = new Set(RELATIONAL_IMPORTANCE);
const SCOPES = new Set(RELATIONAL_SCOPES);
const ALIGNMENT_MODES = new Set(['collinear', 'parallel', 'perpendicular', 'coplanar', 'centered', 'symmetric']);
const ORDER_AXES = new Set(['reference-right', 'reference-up', 'reference-forward']);
const PLANE_CONTINUITY = new Set(['smooth', 'broken', 'stepped', 'unknown']);

function strings(values, label, {required = false} = {}) {
  const result = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && !result.length) throw new Error(`${label} requires at least one reference`);
  return result;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function positiveRange(value, label) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must be [minimum, maximum]`);
  const minimum = finite(value[0], `${label}[0]`), maximum = finite(value[1], `${label}[1]`);
  if (minimum < 0 || maximum < minimum) throw new Error(`${label} must satisfy 0 <= minimum <= maximum`);
  return [minimum, maximum];
}

function normalizeEntity(raw, index) {
  const label = `entities[${index}]`;
  const kind = String(raw?.kind ?? '').toLowerCase();
  if (!ENTITY_KINDS.has(kind)) throw new Error(`${label}.kind must be one of: ${RELATIONAL_ENTITY_KINDS.join(', ')}`);
  return {
    id: assertId(raw?.id, `${label}.id`),
    kind,
    role: String(raw?.role ?? '').trim(),
    basisRefs: strings(raw?.basisRefs, `${label}.basisRefs`),
  };
}

function normalizeRelation(raw, index, entityIds) {
  const label = `relations[${index}]`;
  const kind = String(raw?.kind ?? '').toLowerCase();
  const importance = String(raw?.importance ?? 'detail').toLowerCase();
  const scope = String(raw?.scope ?? 'local').toLowerCase();
  if (!RELATION_KINDS.has(kind)) throw new Error(`${label}.kind must be one of: ${RELATIONAL_RELATION_KINDS.join(', ')}`);
  if (!IMPORTANCE.has(importance)) throw new Error(`${label}.importance must be one of: ${RELATIONAL_IMPORTANCE.join(', ')}`);
  if (!SCOPES.has(scope)) throw new Error(`${label}.scope must be one of: ${RELATIONAL_SCOPES.join(', ')}`);
  const relationEntityIds = (raw?.entityIds ?? []).map((value, i) => assertId(value, `${label}.entityIds[${i}]`));
  if (new Set(relationEntityIds).size !== relationEntityIds.length) throw new Error(`${label}.entityIds must be unique`);
  for (const id of relationEntityIds) if (!entityIds.has(id)) throw new Error(`${label} references unknown entity: ${id}`);
  const dependsOn = strings(raw?.dependsOn, `${label}.dependsOn`).map((value, i) => assertId(value, `${label}.dependsOn[${i}]`));
  const basisRefs = strings(raw?.basisRefs, `${label}.basisRefs`, {required: true});
  const normalized = {
    id: assertId(raw?.id, `${label}.id`), kind, scope, importance,
    entityIds: relationEntityIds, dependsOn, basisRefs,
  };

  if (kind === 'distance-ratio') {
    if (relationEntityIds.length !== 4) throw new Error(`${label}.distance-ratio requires [a, b, c, d] entities`);
    normalized.range = positiveRange(raw?.range, `${label}.range`);
  } else if (kind === 'volume-ratio') {
    if (relationEntityIds.length !== 2) throw new Error(`${label}.volume-ratio requires two volume/system entities`);
    normalized.range = positiveRange(raw?.range, `${label}.range`);
  } else if (kind === 'alignment') {
    if (relationEntityIds.length < 2) throw new Error(`${label}.alignment requires at least two entities`);
    const mode = String(raw?.mode ?? '').toLowerCase();
    if (!ALIGNMENT_MODES.has(mode)) throw new Error(`${label}.mode is invalid`);
    normalized.mode = mode;
    if (raw?.tolerance != null) {
      const tolerance = finite(raw.tolerance, `${label}.tolerance`);
      if (tolerance < 0) throw new Error(`${label}.tolerance must be non-negative`);
      normalized.tolerance = tolerance;
    }
  } else if (kind === 'ordering') {
    if (relationEntityIds.length < 2) throw new Error(`${label}.ordering requires at least two entities`);
    const axis = String(raw?.axis ?? '').toLowerCase();
    if (!ORDER_AXES.has(axis)) throw new Error(`${label}.axis must be one of: ${[...ORDER_AXES].join(', ')}`);
    normalized.axis = axis;
    normalized.direction = raw?.direction === 'reverse' ? 'reverse' : 'forward';
  } else if (kind === 'plane-chain') {
    if (relationEntityIds.length < 2) throw new Error(`${label}.plane-chain requires at least two entities`);
    const continuity = String(raw?.continuity ?? 'unknown').toLowerCase();
    if (!PLANE_CONTINUITY.has(continuity)) throw new Error(`${label}.continuity is invalid`);
    normalized.continuity = continuity;
  }
  return normalized;
}

function ensureUniqueIds(entities, relations) {
  const seen = new Set();
  for (const item of [...entities, ...relations]) {
    if (seen.has(item.id)) throw new Error(`relational structure IDs must be globally unique; duplicate: ${item.id}`);
    seen.add(item.id);
  }
}

function relationOrder(relations) {
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  for (const relation of relations) {
    for (const dependencyId of relation.dependsOn) {
      if (!byId.has(dependencyId)) throw new Error(`${relation.id} depends on unknown relation: ${dependencyId}`);
      if (dependencyId === relation.id) throw new Error(`${relation.id} cannot depend on itself`);
    }
  }
  const indegree = new Map(relations.map((relation) => [relation.id, 0]));
  const children = new Map(relations.map((relation) => [relation.id, []]));
  for (const relation of relations) for (const dependencyId of relation.dependsOn) {
    indegree.set(relation.id, indegree.get(relation.id) + 1);
    children.get(dependencyId).push(relation.id);
  }
  const ready = [...relations.map((relation) => relation.id).filter((id) => indegree.get(id) === 0)].sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift(); order.push(id);
    for (const childId of children.get(id).sort()) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) { ready.push(childId); ready.sort(); }
    }
  }
  if (order.length !== relations.length) throw new Error('relational structure dependency graph contains a cycle');
  return order;
}

export function createRelationalStructure({scopeId, sourceSha256, entities = [], relations = [], basisRefs = []} = {}) {
  if (!Array.isArray(entities) || entities.length < 2) throw new Error('relational structure requires at least two entities');
  if (!Array.isArray(relations) || !relations.length) throw new Error('relational structure requires at least one relation');
  const normalizedEntities = entities.map(normalizeEntity).sort((a, b) => a.id.localeCompare(b.id));
  const entityIds = new Set(normalizedEntities.map((entity) => entity.id));
  if (entityIds.size !== normalizedEntities.length) throw new Error('relational entity IDs must be unique');
  const normalizedRelations = relations.map((relation, index) => normalizeRelation(relation, index, entityIds)).sort((a, b) => a.id.localeCompare(b.id));
  ensureUniqueIds(normalizedEntities, normalizedRelations);
  const dependencyOrder = relationOrder(normalizedRelations);
  const wholeSystemRelationIds = normalizedRelations.filter((relation) => relation.scope === 'whole-system').map((relation) => relation.id).sort();
  if (!wholeSystemRelationIds.length) throw new Error('relational structure requires at least one whole-system relation');
  const payload = {
    schema: RELATIONAL_STRUCTURE_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    entities: normalizedEntities,
    relations: normalizedRelations,
    dependencyOrder,
    wholeSystemRelationIds,
    basisRefs: strings(basisRefs, 'basisRefs'),
    policy: {
      relationsPrecedeLocalFeatureHardening: true,
      visibleEvidenceConstrainsButDoesNotDefineWholeModel: true,
      relationBasisDoesNotAutomaticallyBecomeSourceFact: true,
      wholeSystemRelationsRemainExplicitDependencies: true,
      assetSpecificVocabularyStaysOutsideCore: true,
    },
  };
  return deepFreeze({...payload, structureDigest: digestJson(payload)});
}

export function relationalDependencyOrder(value) {
  const validation = validateRelationalStructure(value);
  if (!validation.valid) throw new Error(`relational structure is invalid: ${validation.errors.join('; ')}`);
  return [...value.dependencyOrder];
}

export function wholeSystemRelationalObligations(value, {includeIdentity = true, includeDetail = false} = {}) {
  const validation = validateRelationalStructure(value);
  if (!validation.valid) throw new Error(`relational structure is invalid: ${validation.errors.join('; ')}`);
  const allowed = new Set(['macro']);
  if (includeIdentity) allowed.add('identity');
  if (includeDetail) allowed.add('detail');
  return deepFreeze(value.relations.filter((relation) => relation.scope === 'whole-system' && allowed.has(relation.importance)).map((relation) => relation.id).sort());
}

export function validateRelationalStructure(value) {
  const errors = [];
  try {
    if (value?.schema !== RELATIONAL_STRUCTURE_SCHEMA) errors.push('invalid schema');
    const recreated = createRelationalStructure(value);
    if (recreated.structureDigest !== value?.structureDigest) errors.push('relational structure digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('relational structure is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';

export const PHYSICAL_IDENTITY_GRAPH_SCHEMA = 'refas.physical-identity-graph/v1';

export const PHYSICAL_IDENTITY_KINDS = Object.freeze([
  'assembly-module',
  'attachment-interface',
  'physical-part',
  'rigid-link',
  'virtual-joint',
  'mechanism',
  'transmission',
  'actuator',
  'controller',
  'runtime-endpoint',
]);

export const PHYSICAL_IDENTITY_RELATION_KINDS = Object.freeze([
  'CONTAINS',
  'EXPOSES',
  'COMPATIBLE_WITH',
  'BINDS_TO',
  'AGGREGATES_INTO',
  'CONNECTS',
  'REALIZES',
  'MAPS',
  'DRIVES',
  'COMMANDS',
  'BINDS_RUNTIME',
]);

const KIND_SET = new Set(PHYSICAL_IDENTITY_KINDS);
const RELATION_KIND_SET = new Set(PHYSICAL_IDENTITY_RELATION_KINDS);
const FRAME_KINDS = new Set([
  'assembly-module',
  'attachment-interface',
  'physical-part',
  'rigid-link',
  'virtual-joint',
  'mechanism',
  'actuator',
]);
const FRAME_PARENT_KINDS = new Set([
  'assembly-module',
  'physical-part',
  'rigid-link',
  'mechanism',
  'actuator',
]);
const CONTAINABLE_KINDS = new Set(PHYSICAL_IDENTITY_KINDS.filter((kind) => kind !== 'attachment-interface'));

const RELATION_RULES = Object.freeze({
  CONTAINS: {
    sourceKinds: new Set(['assembly-module']),
    targetKinds: CONTAINABLE_KINDS,
    minTargets: 1,
    maxTargets: 1,
  },
  EXPOSES: {
    sourceKinds: new Set(['assembly-module']),
    targetKinds: new Set(['attachment-interface']),
    minTargets: 1,
    maxTargets: 1,
  },
  COMPATIBLE_WITH: {
    sourceKinds: new Set(['attachment-interface']),
    targetKinds: new Set(['attachment-interface']),
    minTargets: 1,
    maxTargets: 1,
    symmetric: true,
  },
  BINDS_TO: {
    sourceKinds: new Set(['attachment-interface']),
    targetKinds: new Set(['attachment-interface']),
    minTargets: 1,
    maxTargets: 1,
    symmetric: true,
    requiresAttachmentRelation: true,
  },
  AGGREGATES_INTO: {
    sourceKinds: new Set(['physical-part']),
    targetKinds: new Set(['rigid-link']),
    minTargets: 1,
    maxTargets: 1,
  },
  CONNECTS: {
    sourceKinds: new Set(['virtual-joint']),
    targetKinds: new Set(['rigid-link']),
    minTargets: 2,
    maxTargets: 2,
  },
  REALIZES: {
    sourceKinds: new Set(['mechanism']),
    targetKinds: new Set(['virtual-joint']),
    minTargets: 1,
    maxTargets: Infinity,
  },
  MAPS: {
    sourceKinds: new Set(['transmission']),
    targetKinds: new Set(['virtual-joint', 'mechanism', 'actuator']),
    minTargets: 2,
    maxTargets: Infinity,
  },
  DRIVES: {
    sourceKinds: new Set(['actuator']),
    targetKinds: new Set(['transmission', 'mechanism', 'virtual-joint']),
    minTargets: 1,
    maxTargets: 1,
  },
  COMMANDS: {
    sourceKinds: new Set(['controller']),
    targetKinds: new Set(['actuator']),
    minTargets: 1,
    maxTargets: 1,
  },
  BINDS_RUNTIME: {
    sourceKinds: new Set(['runtime-endpoint']),
    targetKinds: new Set(['actuator', 'controller', 'virtual-joint', 'rigid-link', 'attachment-interface']),
    minTargets: 1,
    maxTargets: 1,
  },
});

const ENTITY_KEYS = new Set(['id', 'kind', 'frame', 'compatibilityFamilyIds']);
const RELATION_KEYS = new Set(['id', 'kind', 'sourceId', 'targetIds', 'attachmentRelationId']);
const FRAME_KEYS = new Set(['parentId', 'translation_m', 'rotation_quat_xyzw']);
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'scopeId',
  'sourceSha256',
  'entities',
  'relations',
  'attachmentSemantics',
  'attachmentSemanticsRef',
  'policy',
  'graphDigest',
]);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeVector(values, length, label) {
  if (!Array.isArray(values) || values.length !== length) throw new Error(`${label} must contain exactly ${length} numbers`);
  return values.map((value, index) => finiteNumber(value, `${label}[${index}]`));
}

export function canonicalizePhysicalQuaternion(values, label = 'rotation_quat_xyzw') {
  let quaternion = normalizeVector(values, 4, label);
  let norm = Math.hypot(...quaternion);
  if (!(norm > 1e-12)) throw new Error(`${label} must have non-zero norm`);
  quaternion = quaternion.map((value) => value / norm);
  quaternion = quaternion.map((value) => Math.abs(value) <= 1e-15 ? 0 : value);
  norm = Math.hypot(...quaternion);
  quaternion = quaternion.map((value) => value / norm);
  quaternion = quaternion.map((value) => Math.abs(value) <= 1e-15 ? 0 : value);

  let flip = quaternion[3] < 0;
  if (quaternion[3] === 0) {
    const firstNonZero = quaternion.slice(0, 3).find((value) => value !== 0);
    flip = firstNonZero != null && firstNonZero < 0;
  }
  if (flip) quaternion = quaternion.map((value) => -value);
  return quaternion.map((value) => Object.is(value, -0) ? 0 : value);
}

function normalizeFrame(raw, label) {
  assertKnownKeys(raw, FRAME_KEYS, label);
  return {
    parentId: assertId(raw.parentId, `${label}.parentId`),
    translation_m: normalizeVector(raw.translation_m, 3, `${label}.translation_m`),
    rotation_quat_xyzw: canonicalizePhysicalQuaternion(raw.rotation_quat_xyzw, `${label}.rotation_quat_xyzw`),
  };
}

function normalizeEntity(raw, index) {
  const label = `entities[${index}]`;
  assertKnownKeys(raw, ENTITY_KEYS, label);
  const id = assertId(raw.id, `${label}.id`);
  const kind = String(raw.kind ?? '').trim().toLowerCase();
  if (!KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${PHYSICAL_IDENTITY_KINDS.join(', ')}`);

  if (raw.frame != null && !FRAME_KINDS.has(kind)) throw new Error(`${label}.frame is not valid for ${kind}`);
  if (kind === 'attachment-interface' && raw.frame == null) throw new Error(`${label}.frame is required for attachment-interface`);

  const entity = {id, kind};
  if (raw.frame != null) entity.frame = normalizeFrame(raw.frame, `${label}.frame`);

  if (kind === 'attachment-interface') {
    const families = raw.compatibilityFamilyIds ?? [];
    if (!Array.isArray(families)) throw new Error(`${label}.compatibilityFamilyIds must be an array`);
    const normalizedFamilies = families.map((value, familyIndex) => assertId(value, `${label}.compatibilityFamilyIds[${familyIndex}]`));
    if (new Set(normalizedFamilies).size !== normalizedFamilies.length) throw new Error(`${label}.compatibilityFamilyIds must be unique`);
    entity.compatibilityFamilyIds = [...normalizedFamilies].sort();
  } else if (raw.compatibilityFamilyIds != null) {
    throw new Error(`${label}.compatibilityFamilyIds is only valid for attachment-interface`);
  }

  return entity;
}

function normalizeAttachmentRef(raw, label = 'attachmentSemanticsRef') {
  if (raw == null) return null;
  assertKnownKeys(raw, new Set(['schema', 'digest']), label);
  if (raw.schema !== 'refas.attachment-semantics/v1') throw new Error(`${label}.schema must be refas.attachment-semantics/v1`);
  return {schema: raw.schema, digest: assertDigest(raw.digest, `${label}.digest`)};
}

function normalizeRelation(raw, index, entityById) {
  const label = `relations[${index}]`;
  assertKnownKeys(raw, RELATION_KEYS, label);
  const id = assertId(raw.id, `${label}.id`);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!RELATION_KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${PHYSICAL_IDENTITY_RELATION_KINDS.join(', ')}`);
  const rule = RELATION_RULES[kind];

  let sourceId = assertId(raw.sourceId, `${label}.sourceId`);
  if (!entityById.has(sourceId)) throw new Error(`${label}.sourceId references unknown entity: ${sourceId}`);
  if (!Array.isArray(raw.targetIds)) throw new Error(`${label}.targetIds must be an array`);
  let targetIds = raw.targetIds.map((targetId, targetIndex) => assertId(targetId, `${label}.targetIds[${targetIndex}]`));
  if (new Set(targetIds).size !== targetIds.length) throw new Error(`${label}.targetIds must be unique`);
  targetIds = [...targetIds].sort();
  if (targetIds.length < rule.minTargets || targetIds.length > rule.maxTargets) {
    const expected = rule.maxTargets === Infinity ? `at least ${rule.minTargets}` : rule.minTargets === rule.maxTargets ? `${rule.minTargets}` : `${rule.minTargets}-${rule.maxTargets}`;
    throw new Error(`${label}.targetIds requires ${expected} target(s) for ${kind}`);
  }
  for (const targetId of targetIds) {
    if (!entityById.has(targetId)) throw new Error(`${label}.targetIds references unknown entity: ${targetId}`);
    if (targetId === sourceId) throw new Error(`${label} may not reference itself`);
  }

  if (rule.symmetric) {
    [sourceId, targetIds] = [[sourceId, targetIds[0]].sort()[0], [[sourceId, targetIds[0]].sort()[1]]];
  }

  const sourceKind = entityById.get(sourceId).kind;
  if (!rule.sourceKinds.has(sourceKind)) throw new Error(`${label}.${kind} source must be one of: ${[...rule.sourceKinds].join(', ')}`);
  for (const targetId of targetIds) {
    const targetKind = entityById.get(targetId).kind;
    if (!rule.targetKinds.has(targetKind)) throw new Error(`${label}.${kind} target ${targetId} has invalid kind ${targetKind}`);
  }

  const relation = {id, kind, sourceId, targetIds};
  if (rule.requiresAttachmentRelation) {
    relation.attachmentRelationId = assertId(raw.attachmentRelationId, `${label}.attachmentRelationId`);
  } else if (raw.attachmentRelationId != null) {
    throw new Error(`${label}.attachmentRelationId is only valid for BINDS_TO`);
  }
  return relation;
}

function findDirectedCycle(nodes, edges) {
  const graph = new Map([...nodes].map((id) => [id, []]));
  for (const [from, to] of edges) graph.get(from)?.push(to);
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

  return [...nodes].some(walk);
}

function validateFrameReferences(entities, entityById) {
  const frameEdges = [];
  for (const entity of entities) {
    if (!entity.frame) continue;
    const parent = entityById.get(entity.frame.parentId);
    if (!parent) throw new Error(`entity ${entity.id} frame references unknown parent: ${entity.frame.parentId}`);
    if (parent.id === entity.id) throw new Error(`entity ${entity.id} frame may not parent itself`);
    if (!FRAME_PARENT_KINDS.has(parent.kind)) throw new Error(`entity ${entity.id} frame parent ${parent.id} has non-physical parent kind ${parent.kind}`);
    frameEdges.push([parent.id, entity.id]);
  }
  const frameNodes = new Set(frameEdges.flat());
  if (frameEdges.length && findDirectedCycle(frameNodes, frameEdges)) throw new Error('physical frame graph contains a cycle');
}

function validateContainment(relations, entityById) {
  const containmentEdges = [];
  const owners = new Map();
  for (const relation of relations.filter((item) => item.kind === 'CONTAINS')) {
    const targetId = relation.targetIds[0];
    if (owners.has(targetId)) throw new Error(`entities may have at most one containing module: ${targetId}`);
    owners.set(targetId, relation.sourceId);
    if (entityById.get(targetId).kind === 'assembly-module') containmentEdges.push([relation.sourceId, targetId]);
  }
  const moduleNodes = new Set(containmentEdges.flat());
  if (containmentEdges.length && findDirectedCycle(moduleNodes, containmentEdges)) throw new Error('assembly module containment graph contains a cycle');
  return owners;
}

function exposureMap(relations) {
  const owners = new Map();
  for (const relation of relations.filter((item) => item.kind === 'EXPOSES')) {
    const interfaceId = relation.targetIds[0];
    if (owners.has(interfaceId)) throw new Error(`attachment interfaces may be exposed by at most one module: ${interfaceId}`);
    owners.set(interfaceId, relation.sourceId);
  }
  return owners;
}

function semanticOwnerId(entity, containmentOwners, interfaceOwners) {
  if (entity.kind === 'attachment-interface') return interfaceOwners.get(entity.id) ?? null;
  return containmentOwners.get(entity.id) ?? null;
}

function validateFrameOwnershipLocality(entities, entityById, containmentOwners, interfaceOwners) {
  for (const entity of entities) {
    if (entity.kind === 'attachment-interface' && !interfaceOwners.has(entity.id)) {
      throw new Error(`attachment interface ${entity.id} must be exposed by exactly one assembly module`);
    }
    if (!entity.frame) continue;

    const ownerModuleId = semanticOwnerId(entity, containmentOwners, interfaceOwners);
    if (entity.kind === 'assembly-module' && !ownerModuleId) {
      throw new Error(`root assembly module ${entity.id} may not declare a parent frame without CONTAINS ownership`);
    }
    if (!ownerModuleId) continue;

    let cursorId = entity.frame.parentId;
    const visited = new Set();
    while (cursorId !== ownerModuleId) {
      if (visited.has(cursorId)) throw new Error(`entity ${entity.id} frame ancestry contains a cycle`);
      visited.add(cursorId);
      const cursor = entityById.get(cursorId);
      if (!cursor) throw new Error(`entity ${entity.id} frame ancestry references unknown parent: ${cursorId}`);
      if (cursor.kind === 'assembly-module') {
        throw new Error(`entity ${entity.id} frame escapes owning module ${ownerModuleId} through module ${cursor.id}`);
      }
      const cursorOwnerId = semanticOwnerId(cursor, containmentOwners, interfaceOwners);
      if (cursorOwnerId !== ownerModuleId) {
        throw new Error(`entity ${entity.id} frame escapes owning module ${ownerModuleId} through ${cursor.id}`);
      }
      if (!cursor.frame) {
        throw new Error(`entity ${entity.id} frame ancestry does not resolve to owning module ${ownerModuleId}`);
      }
      cursorId = cursor.frame.parentId;
    }
  }
}

function sharedCompatibilityFamilyIds(source, target) {
  const targetFamilies = new Set(target.compatibilityFamilyIds ?? []);
  return (source.compatibilityFamilyIds ?? []).filter((familyId) => targetFamilies.has(familyId));
}

function validateCompatibilityRelations(relations, entityById) {
  for (const relation of relations) {
    if (relation.kind !== 'COMPATIBLE_WITH' && relation.kind !== 'BINDS_TO') continue;
    const source = entityById.get(relation.sourceId);
    const target = entityById.get(relation.targetIds[0]);
    const sharedFamilies = sharedCompatibilityFamilyIds(source, target);
    if (relation.kind === 'COMPATIBLE_WITH' && sharedFamilies.length === 0) {
      throw new Error(`COMPATIBLE_WITH endpoints must share at least one compatibility family: ${relation.id}`);
    }
    const sourceFamilies = source.compatibilityFamilyIds ?? [];
    const targetFamilies = target.compatibilityFamilyIds ?? [];
    if (relation.kind === 'BINDS_TO' && sourceFamilies.length && targetFamilies.length && sharedFamilies.length === 0) {
      throw new Error(`BINDS_TO endpoints declare disjoint compatibility families: ${relation.id}`);
    }
  }
}

function validateRelationUniqueness(relations) {
  const semanticKeys = relations.map((relation) => `${relation.kind}|${relation.sourceId}|${relation.targetIds.join(',')}|${relation.attachmentRelationId ?? ''}`);
  if (new Set(semanticKeys).size !== semanticKeys.length) throw new Error('physical identity graph contains duplicate semantic relations');

  const aggregateSource = new Map();
  const connectedJoint = new Map();
  for (const relation of relations) {
    if (relation.kind === 'AGGREGATES_INTO') aggregateSource.set(relation.sourceId, (aggregateSource.get(relation.sourceId) ?? 0) + 1);
    if (relation.kind === 'CONNECTS') connectedJoint.set(relation.sourceId, (connectedJoint.get(relation.sourceId) ?? 0) + 1);
  }
  const multiplyAggregated = [...aggregateSource.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  if (multiplyAggregated.length) throw new Error(`physical parts may aggregate into at most one rigid link: ${multiplyAggregated.join(', ')}`);
  const multiplyConnected = [...connectedJoint.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  if (multiplyConnected.length) throw new Error(`virtual joints may have at most one CONNECTS relation: ${multiplyConnected.join(', ')}`);
}

function assertBindingMatchesAttachmentRelation(binding, attachmentRelation, interfaceOwners) {
  const sourceModuleId = interfaceOwners.get(binding.sourceId);
  const targetModuleId = interfaceOwners.get(binding.targetIds[0]);
  if (!sourceModuleId || !targetModuleId) {
    throw new Error(`BINDS_TO endpoints must each be exposed by an assembly module: ${binding.id}`);
  }
  const sourceIsSubject = attachmentRelation.subjectId === sourceModuleId && attachmentRelation.ownerIds.includes(targetModuleId);
  const targetIsSubject = attachmentRelation.subjectId === targetModuleId && attachmentRelation.ownerIds.includes(sourceModuleId);
  if (!sourceIsSubject && !targetIsSubject) {
    throw new Error(`BINDS_TO ${binding.id} does not match subject/owner modules of attachment relation ${binding.attachmentRelationId}`);
  }
}

function validateAttachmentBindingProof({relations, scopeId, sourceSha256, attachmentSemantics, attachmentSemanticsRef, requireLiveBindingProof}) {
  const bindings = relations.filter((relation) => relation.kind === 'BINDS_TO');
  if (!bindings.length) {
    if (attachmentSemantics != null || attachmentSemanticsRef != null) throw new Error('attachment semantics reference is only valid when BINDS_TO relations exist');
    return null;
  }

  if (attachmentSemantics != null) {
    const validation = validateAttachmentSemantics(attachmentSemantics);
    if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
    if (attachmentSemantics.scopeId !== scopeId) throw new Error('attachment semantics and physical identity graph scopeId differ');
    if (attachmentSemantics.sourceSha256 !== sourceSha256) throw new Error('attachment semantics and physical identity graph sourceSha256 differ');
    const relationById = new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation]));
    const interfaceOwners = exposureMap(relations);
    for (const binding of bindings) {
      const relation = relationById.get(binding.attachmentRelationId);
      if (!relation) throw new Error(`BINDS_TO references unknown attachment relation: ${binding.attachmentRelationId}`);
      if (relation.mode === 'FREE') throw new Error(`BINDS_TO cannot reference FREE attachment relation: ${binding.attachmentRelationId}`);
      assertBindingMatchesAttachmentRelation(binding, relation, interfaceOwners);
    }
    return {schema: attachmentSemantics.schema, digest: attachmentSemantics.semanticsDigest};
  }

  if (requireLiveBindingProof) throw new Error('BINDS_TO requires the exact attachment semantics contract');
  const normalizedRef = normalizeAttachmentRef(attachmentSemanticsRef);
  if (!normalizedRef) throw new Error('BINDS_TO requires attachmentSemanticsRef');
  return normalizedRef;
}

function buildPhysicalIdentityGraph(raw, {requireLiveBindingProof = false, attachmentSemantics = raw?.attachmentSemantics ?? null} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'physical identity graph input');
  if (!Array.isArray(raw.entities) || !raw.entities.length) throw new Error('physical identity graph requires at least one entity');
  if (!Array.isArray(raw.relations)) throw new Error('physical identity graph relations must be an array');

  const entities = raw.entities.map(normalizeEntity).sort((a, b) => a.id.localeCompare(b.id));
  const entityById = new Map();
  for (const entity of entities) {
    if (entityById.has(entity.id)) throw new Error(`physical identity IDs must be globally unique: ${entity.id}`);
    entityById.set(entity.id, entity);
  }
  validateFrameReferences(entities, entityById);

  const relations = raw.relations.map((relation, index) => normalizeRelation(relation, index, entityById)).sort((a, b) => a.id.localeCompare(b.id));
  const relationIds = new Set();
  for (const relation of relations) {
    if (relationIds.has(relation.id)) throw new Error(`physical relation IDs must be unique: ${relation.id}`);
    if (entityById.has(relation.id)) throw new Error(`relation ID collides with entity ID: ${relation.id}`);
    relationIds.add(relation.id);
  }

  const containmentOwners = validateContainment(relations, entityById);
  const interfaceOwners = exposureMap(relations);
  validateFrameOwnershipLocality(entities, entityById, containmentOwners, interfaceOwners);
  validateCompatibilityRelations(relations, entityById);
  validateRelationUniqueness(relations);

  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  const attachmentSemanticsRef = validateAttachmentBindingProof({
    relations,
    scopeId,
    sourceSha256,
    attachmentSemantics,
    attachmentSemanticsRef: raw.attachmentSemanticsRef,
    requireLiveBindingProof,
  });

  const payload = {
    schema: PHYSICAL_IDENTITY_GRAPH_SCHEMA,
    scopeId,
    sourceSha256,
    entities,
    relations,
    attachmentSemanticsRef,
    policy: {
      globalSemanticIds: true,
      relationIdsDisjointFromEntityIds: true,
      backendIndicesNeverSemanticIdentity: true,
      attachmentInterfacesAreNotJoints: true,
      bindingReusesAttachmentSemantics: true,
      canonicalFramesUseMeters: true,
      canonicalFramesUseQuaternionXyzw: true,
      canonicalQuaternionSign: true,
      semanticFramesHaveNoScale: true,
      containmentCyclesForbidden: true,
      frameCyclesForbidden: true,
      relationsDoNotAuthorizeSourceTruth: true,
    },
  };
  return {...payload, graphDigest: digestJson(payload)};
}

export function createPhysicalIdentityGraph(input = {}) {
  return deepFreeze(buildPhysicalIdentityGraph(input, {
    requireLiveBindingProof: true,
    attachmentSemantics: input.attachmentSemantics ?? null,
  }));
}

export function validatePhysicalIdentityGraph(value) {
  const errors = [];
  try {
    if (value?.schema !== PHYSICAL_IDENTITY_GRAPH_SCHEMA) errors.push('invalid schema');
    const recreated = buildPhysicalIdentityGraph(value, {requireLiveBindingProof: false, attachmentSemantics: null});
    if (recreated.graphDigest !== value?.graphDigest) errors.push('physical identity graph digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('physical identity graph is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validatePhysicalIdentityGraphBindings(graph, attachmentSemantics) {
  const errors = [];
  const graphValidation = validatePhysicalIdentityGraph(graph);
  if (!graphValidation.valid) errors.push(`physical identity graph is invalid: ${graphValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors};

  try {
    const bindings = graph.relations.filter((relation) => relation.kind === 'BINDS_TO');
    if (!bindings.length) {
      if (graph.attachmentSemanticsRef != null) errors.push('graph without BINDS_TO must not retain attachmentSemanticsRef');
      return {valid: errors.length === 0, errors};
    }
    const validation = validateAttachmentSemantics(attachmentSemantics);
    if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
    if (attachmentSemantics.scopeId !== graph.scopeId) throw new Error('attachment semantics and physical identity graph scopeId differ');
    if (attachmentSemantics.sourceSha256 !== graph.sourceSha256) throw new Error('attachment semantics and physical identity graph sourceSha256 differ');
    if (graph.attachmentSemanticsRef?.schema !== attachmentSemantics.schema || graph.attachmentSemanticsRef?.digest !== attachmentSemantics.semanticsDigest) {
      throw new Error('physical identity graph does not bind the exact attachment semantics contract');
    }
    const relationById = new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation]));
    const interfaceOwners = exposureMap(graph.relations);
    for (const binding of bindings) {
      const relation = relationById.get(binding.attachmentRelationId);
      if (!relation) throw new Error(`BINDS_TO references unknown attachment relation: ${binding.attachmentRelationId}`);
      if (relation.mode === 'FREE') throw new Error(`BINDS_TO cannot reference FREE attachment relation: ${binding.attachmentRelationId}`);
      assertBindingMatchesAttachmentRelation(binding, relation, interfaceOwners);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function physicalIdentityById(graph, id) {
  const validation = validatePhysicalIdentityGraph(graph);
  if (!validation.valid) throw new Error(`physical identity graph is invalid: ${validation.errors.join('; ')}`);
  const semanticId = assertId(id, 'id');
  return graph.entities.find((entity) => entity.id === semanticId) ?? null;
}

export function physicalRelationsForEntity(graph, id) {
  const validation = validatePhysicalIdentityGraph(graph);
  if (!validation.valid) throw new Error(`physical identity graph is invalid: ${validation.errors.join('; ')}`);
  const semanticId = assertId(id, 'id');
  return graph.relations.filter((relation) => relation.sourceId === semanticId || relation.targetIds.includes(semanticId));
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {canonicalizePhysicalQuaternion, validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const COLLISION_MODEL_SCHEMA = 'refas.collision-model/v1';
export const PHYSICAL_COLLISION_IDENTITY_BINDING_SCHEMA = 'refas.physical-collision-identity-binding/v1';
export const PHYSICAL_COLLISION_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-collision-identity-projection/v1';

export const COLLISION_GEOMETRY_KINDS = Object.freeze([
  'BOX',
  'SPHERE',
  'CAPSULE',
  'CYLINDER',
  'CONVEX_HULL',
  'MESH',
]);

const GEOMETRY_KIND_SET = new Set(COLLISION_GEOMETRY_KINDS);
const CONSTRUCTION_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);
const SELF_COLLISION_POLICIES = new Set(['ENABLED', 'DISABLED']);
const MESH_REUSE_MODES = new Set(['COLLISION_ONLY', 'DECLARED_VISUAL_REUSE']);

const TOP_LEVEL_KEYS = new Set([
  'schema',
  'scopeId',
  'sourceSha256',
  'identityGraph',
  'identityBinding',
  'groups',
  'links',
  'policy',
  'collisionDigest',
]);
const IDENTITY_BINDING_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const LINK_KEYS = new Set(['linkId', 'selfCollisionPolicy', 'filterAuthoritySubjectId', 'colliders']);
const COLLIDER_KEYS = new Set(['id', 'frame', 'geometry', 'filter', 'authoritySubjectId']);
const FRAME_KEYS = new Set(['translation_m', 'rotation_quat_xyzw']);
const FILTER_KEYS = new Set(['groupIds', 'maskGroupIds']);
const BOX_KEYS = new Set(['kind', 'size_m']);
const SPHERE_KEYS = new Set(['kind', 'radius_m']);
const CAPSULE_KEYS = new Set(['kind', 'radius_m', 'segmentLength_m']);
const CYLINDER_KEYS = new Set(['kind', 'radius_m', 'height_m']);
const HULL_KEYS = new Set(['kind', 'vertices_m']);
const MESH_KEYS = new Set(['kind', 'meshId', 'geometryDigest', 'reuseMode', 'visualGeometryRef']);
const VISUAL_REF_KEYS = new Set(['geometryId', 'geometryDigest']);

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

function positiveNumber(value, label, {allowZero = false} = {}) {
  const normalized = finiteNumber(value, label);
  if (allowZero ? normalized < 0 : normalized <= 0) {
    throw new Error(`${label} must be ${allowZero ? 'non-negative' : 'strictly positive'}`);
  }
  return normalized;
}

function normalizeVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain exactly 3 numbers`);
  return value.map((item, index) => finiteNumber(item, `${label}[${index}]`));
}

function normalizePositiveVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain exactly 3 numbers`);
  return value.map((item, index) => positiveNumber(item, `${label}[${index}]`));
}

function normalizeFrame(raw, label) {
  assertKnownKeys(raw, FRAME_KEYS, label);
  return {
    translation_m: normalizeVector3(raw.translation_m, `${label}.translation_m`),
    rotation_quat_xyzw: canonicalizePhysicalQuaternion(raw.rotation_quat_xyzw, `${label}.rotation_quat_xyzw`),
  };
}

function normalizeIdArray(value, label, {requireNonEmpty = false} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (requireNonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const ids = value.map((item, index) => assertId(item, `${label}[${index}]`)).sort();
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must not contain duplicate IDs`);
  return ids;
}

function compareVector3(left, right) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis] !== right[axis]) return left[axis] - right[axis];
  }
  return 0;
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function squaredNorm(vector) {
  return dot(vector, vector);
}

function normalizeHullVertices(value, label) {
  if (!Array.isArray(value) || value.length < 4) throw new Error(`${label} must contain at least 4 vertices`);
  const vertices = value.map((vertex, index) => normalizeVector3(vertex, `${label}[${index}]`)).sort(compareVector3);
  const deduplicated = [];
  for (const vertex of vertices) {
    if (!deduplicated.length || compareVector3(deduplicated.at(-1), vertex) !== 0) deduplicated.push(vertex);
  }
  if (deduplicated.length < 4) throw new Error(`${label} must contain at least 4 unique vertices`);

  const scale = Math.max(1, ...deduplicated.flat().map((item) => Math.abs(item)));
  const lengthTolerance2 = scale ** 2 * 1e-24;
  const areaTolerance2 = scale ** 4 * 1e-24;
  const volumeTolerance = scale ** 3 * 1e-12;
  const origin = deduplicated[0];
  let edge = null;
  for (let index = 1; index < deduplicated.length; index += 1) {
    const candidate = subtract(deduplicated[index], origin);
    if (squaredNorm(candidate) > lengthTolerance2) {
      edge = candidate;
      break;
    }
  }
  if (!edge) throw new Error(`${label} is degenerate`);

  let normal = null;
  for (let index = 1; index < deduplicated.length; index += 1) {
    const candidate = cross(edge, subtract(deduplicated[index], origin));
    if (squaredNorm(candidate) > areaTolerance2) {
      normal = candidate;
      break;
    }
  }
  if (!normal) throw new Error(`${label} vertices are collinear`);

  const nonCoplanar = deduplicated.some((vertex) => Math.abs(dot(normal, subtract(vertex, origin))) > volumeTolerance);
  if (!nonCoplanar) throw new Error(`${label} vertices must be non-coplanar`);
  return deduplicated;
}

function normalizeVisualGeometryRef(raw, label) {
  assertKnownKeys(raw, VISUAL_REF_KEYS, label);
  return {
    geometryId: assertId(raw.geometryId, `${label}.geometryId`),
    geometryDigest: assertDigest(raw.geometryDigest, `${label}.geometryDigest`),
  };
}

function normalizeGeometry(raw, label) {
  assertRecord(raw, label);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!GEOMETRY_KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${COLLISION_GEOMETRY_KINDS.join(', ')}`);

  if (kind === 'BOX') {
    assertKnownKeys(raw, BOX_KEYS, label);
    return {kind, size_m: normalizePositiveVector3(raw.size_m, `${label}.size_m`)};
  }
  if (kind === 'SPHERE') {
    assertKnownKeys(raw, SPHERE_KEYS, label);
    return {kind, radius_m: positiveNumber(raw.radius_m, `${label}.radius_m`)};
  }
  if (kind === 'CAPSULE') {
    assertKnownKeys(raw, CAPSULE_KEYS, label);
    return {
      kind,
      radius_m: positiveNumber(raw.radius_m, `${label}.radius_m`),
      segmentLength_m: positiveNumber(raw.segmentLength_m, `${label}.segmentLength_m`, {allowZero: true}),
    };
  }
  if (kind === 'CYLINDER') {
    assertKnownKeys(raw, CYLINDER_KEYS, label);
    return {
      kind,
      radius_m: positiveNumber(raw.radius_m, `${label}.radius_m`),
      height_m: positiveNumber(raw.height_m, `${label}.height_m`),
    };
  }
  if (kind === 'CONVEX_HULL') {
    assertKnownKeys(raw, HULL_KEYS, label);
    return {kind, vertices_m: normalizeHullVertices(raw.vertices_m, `${label}.vertices_m`)};
  }

  assertKnownKeys(raw, MESH_KEYS, label);
  const meshId = assertId(raw.meshId, `${label}.meshId`);
  const geometryDigest = assertDigest(raw.geometryDigest, `${label}.geometryDigest`);
  const reuseMode = String(raw.reuseMode ?? '').trim().toUpperCase();
  if (!MESH_REUSE_MODES.has(reuseMode)) throw new Error(`${label}.reuseMode must be COLLISION_ONLY or DECLARED_VISUAL_REUSE`);
  if (reuseMode === 'COLLISION_ONLY') {
    if (raw.visualGeometryRef !== null) throw new Error(`${label}.visualGeometryRef must be null for COLLISION_ONLY`);
    return {kind, meshId, geometryDigest, reuseMode, visualGeometryRef: null};
  }
  if (raw.visualGeometryRef == null) throw new Error(`${label}.visualGeometryRef is required for DECLARED_VISUAL_REUSE`);
  const visualGeometryRef = normalizeVisualGeometryRef(raw.visualGeometryRef, `${label}.visualGeometryRef`);
  if (visualGeometryRef.geometryDigest !== geometryDigest) {
    throw new Error(`${label} declared visual reuse must bind the exact same geometry digest`);
  }
  return {kind, meshId, geometryDigest, reuseMode, visualGeometryRef};
}

export function collisionColliderAuthoritySubjectId(colliderId) {
  const id = assertId(colliderId, 'colliderId');
  const readable = `${id}:collision`;
  if (readable.length <= 128) return assertId(readable, 'authoritySubjectId');
  return assertId(`collision:${digestJson({colliderId: id}).slice(0, 48)}`, 'authoritySubjectId');
}

export function collisionFilterAuthoritySubjectId(linkId) {
  const id = assertId(linkId, 'linkId');
  const readable = `${id}:collision-filter`;
  if (readable.length <= 128) return assertId(readable, 'filterAuthoritySubjectId');
  return assertId(`collision-filter:${digestJson({linkId: id}).slice(0, 48)}`, 'filterAuthoritySubjectId');
}

function normalizeFilter(raw, groups, label) {
  assertKnownKeys(raw, FILTER_KEYS, label);
  const groupIds = normalizeIdArray(raw.groupIds, `${label}.groupIds`, {requireNonEmpty: true});
  const maskGroupIds = normalizeIdArray(raw.maskGroupIds, `${label}.maskGroupIds`);
  for (const id of [...groupIds, ...maskGroupIds]) {
    if (!groups.has(id)) throw new Error(`${label} references undeclared collision group: ${id}`);
  }
  return {groupIds, maskGroupIds};
}

function normalizeCollider(raw, groups, linkId, index) {
  const label = `links[${linkId}].colliders[${index}]`;
  assertKnownKeys(raw, COLLIDER_KEYS, label);
  const id = assertId(raw.id, `${label}.id`);
  const expectedAuthority = collisionColliderAuthoritySubjectId(id);
  const authoritySubjectId = raw.authoritySubjectId == null
    ? expectedAuthority
    : assertId(raw.authoritySubjectId, `${label}.authoritySubjectId`);
  if (authoritySubjectId !== expectedAuthority) throw new Error(`${label}.authoritySubjectId must be canonical subject ${expectedAuthority}`);
  return {
    id,
    frame: normalizeFrame(raw.frame, `${label}.frame`),
    geometry: normalizeGeometry(raw.geometry, `${label}.geometry`),
    filter: normalizeFilter(raw.filter, groups, `${label}.filter`),
    authoritySubjectId,
  };
}

function normalizeLink(raw, groups, index) {
  const label = `links[${index}]`;
  assertKnownKeys(raw, LINK_KEYS, label);
  const linkId = assertId(raw.linkId, `${label}.linkId`);
  const selfCollisionPolicy = String(raw.selfCollisionPolicy ?? '').trim().toUpperCase();
  if (!SELF_COLLISION_POLICIES.has(selfCollisionPolicy)) throw new Error(`${label}.selfCollisionPolicy must be ENABLED or DISABLED`);
  const expectedFilterAuthority = collisionFilterAuthoritySubjectId(linkId);
  const filterAuthoritySubjectId = raw.filterAuthoritySubjectId == null
    ? expectedFilterAuthority
    : assertId(raw.filterAuthoritySubjectId, `${label}.filterAuthoritySubjectId`);
  if (filterAuthoritySubjectId !== expectedFilterAuthority) {
    throw new Error(`${label}.filterAuthoritySubjectId must be canonical subject ${expectedFilterAuthority}`);
  }
  if (!Array.isArray(raw.colliders) || !raw.colliders.length) throw new Error(`${label}.colliders must contain at least one collider`);
  const colliders = raw.colliders.map((collider, colliderIndex) => normalizeCollider(collider, groups, linkId, colliderIndex))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(colliders.map((collider) => collider.id)).size !== colliders.length) throw new Error(`${label}.collider IDs must be unique`);
  return {linkId, selfCollisionPolicy, filterAuthoritySubjectId, colliders};
}

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function validateLinkBindings(links, identityGraph) {
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  for (const link of links) {
    const entity = entityById.get(link.linkId);
    if (!entity) throw new Error(`collision link references unknown physical identity: ${link.linkId}`);
    if (entity.kind !== 'rigid-link') throw new Error(`collision subject ${link.linkId} must be a rigid-link, found ${entity.kind}`);
  }
}

export function physicalCollisionIdentityProjection(identityGraph, linkIds) {
  validateIdentityGraph(identityGraph);
  const ids = normalizeIdArray(linkIds, 'linkIds', {requireNonEmpty: true});
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const links = ids.map((linkId) => {
    const entity = entityById.get(linkId);
    if (!entity) throw new Error(`collision projection references unknown physical identity: ${linkId}`);
    if (entity.kind !== 'rigid-link') throw new Error(`collision projection subject ${linkId} must be a rigid-link, found ${entity.kind}`);
    return {id: entity.id, kind: entity.kind, frame: entity.frame ?? null};
  });
  return deepFreeze({
    schema: PHYSICAL_COLLISION_IDENTITY_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    links,
  });
}

function identityBindingFor(identityGraph, linkIds) {
  const projection = physicalCollisionIdentityProjection(identityGraph, linkIds);
  return {
    schema: PHYSICAL_COLLISION_IDENTITY_BINDING_SCHEMA,
    sourceSchema: identityGraph.schema,
    projectionDigest: digestJson(projection),
  };
}

function normalizeIdentityBinding(raw, label = 'identityBinding') {
  assertKnownKeys(raw, IDENTITY_BINDING_KEYS, label);
  if (raw.schema !== PHYSICAL_COLLISION_IDENTITY_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_COLLISION_IDENTITY_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.physical-identity-graph/v1') throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);
  return {
    schema: raw.schema,
    sourceSchema: raw.sourceSchema,
    projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`),
  };
}

function validateMeshIdentityConsistency(links) {
  const byMeshId = new Map();
  for (const link of links) {
    for (const collider of link.colliders) {
      if (collider.geometry.kind !== 'MESH') continue;
      const signature = digestJson(collider.geometry);
      const previous = byMeshId.get(collider.geometry.meshId);
      if (previous && previous !== signature) {
        throw new Error(`meshId ${collider.geometry.meshId} is reused with different collision geometry semantics`);
      }
      byMeshId.set(collider.geometry.meshId, signature);
    }
  }
}

function buildCollisionModel(raw, {identityGraph = raw?.identityGraph ?? null, requireLiveIdentityGraph = false} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'collision model input');
  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  const groups = normalizeIdArray(raw.groups, 'groups', {requireNonEmpty: true});
  const groupSet = new Set(groups);
  if (!Array.isArray(raw.links) || !raw.links.length) throw new Error('collision model requires at least one link record');
  const links = raw.links.map((link, index) => normalizeLink(link, groupSet, index)).sort((left, right) => left.linkId.localeCompare(right.linkId));
  if (new Set(links.map((link) => link.linkId)).size !== links.length) throw new Error('collision model link IDs must be unique');
  const colliderIds = links.flatMap((link) => link.colliders.map((collider) => collider.id));
  if (new Set(colliderIds).size !== colliderIds.length) throw new Error('collider IDs must be globally unique within one collision model');
  validateMeshIdentityConsistency(links);

  let identityBinding;
  if (identityGraph) {
    validateIdentityGraph(identityGraph);
    if (identityGraph.scopeId !== scopeId) throw new Error('identity graph and collision model scopeId differ');
    if (identityGraph.sourceSha256 !== sourceSha256) throw new Error('identity graph and collision model sourceSha256 differ');
    validateLinkBindings(links, identityGraph);
    const liveBinding = identityBindingFor(identityGraph, links.map((link) => link.linkId));
    if (raw.identityBinding != null) {
      const declared = normalizeIdentityBinding(raw.identityBinding);
      if (digestJson(declared) !== digestJson(liveBinding)) throw new Error('identityBinding does not bind the current collision-relevant identity projection');
    }
    identityBinding = liveBinding;
  } else {
    if (requireLiveIdentityGraph) throw new Error('collision model creation requires the exact physical identity graph contract');
    identityBinding = normalizeIdentityBinding(raw.identityBinding);
  }

  const payload = {
    schema: COLLISION_MODEL_SCHEMA,
    scopeId,
    sourceSha256,
    identityBinding,
    groups,
    links,
    policy: {
      rigidLinkIdentityRequired: true,
      scopedIdentityBinding: true,
      collisionIdentityIndependentFromRenderIdentity: true,
      visualReuseRequiresExplicitDeclaration: true,
      backendFilterIndicesAreNotSemantic: true,
      colliderFramesAreLinkLocal: true,
      colliderFramesHaveNoScale: true,
      semanticAuthorityRemainsExternal: true,
    },
  };
  return {...payload, collisionDigest: digestJson(payload)};
}

export function createCollisionModel(input = {}) {
  return deepFreeze(buildCollisionModel(input, {
    identityGraph: input.identityGraph ?? null,
    requireLiveIdentityGraph: true,
  }));
}

export function validateCollisionModel(value) {
  const errors = [];
  try {
    if (value?.schema !== COLLISION_MODEL_SCHEMA) errors.push('invalid schema');
    const recreated = buildCollisionModel(value, {identityGraph: null, requireLiveIdentityGraph: false});
    if (recreated.collisionDigest !== value?.collisionDigest) errors.push('collision model digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('collision model is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateCollisionModelBindings(value, identityGraph) {
  const errors = [];
  const validation = validateCollisionModel(value);
  if (!validation.valid) errors.push(`collision model invalid: ${validation.errors.join('; ')}`);
  try {
    validateIdentityGraph(identityGraph);
    if (value?.scopeId !== identityGraph?.scopeId) errors.push('collision model and identity graph scopeId differ');
    if (value?.sourceSha256 !== identityGraph?.sourceSha256) errors.push('collision model and identity graph sourceSha256 differ');
    if (!errors.length) {
      validateLinkBindings(value.links, identityGraph);
      const liveBinding = identityBindingFor(identityGraph, value.links.map((link) => link.linkId));
      if (digestJson(value.identityBinding) !== digestJson(liveBinding)) {
        errors.push('collision model does not bind the current collision-relevant identity projection');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function authorityDescriptors(contract) {
  return contract.links.flatMap((link) => [
    {subjectId: link.filterAuthoritySubjectId, kind: 'filter', ownerId: link.linkId},
    ...link.colliders.map((collider) => ({subjectId: collider.authoritySubjectId, kind: 'collider', ownerId: collider.id})),
  ]);
}

export function collisionAuthoritySubjectIds(contract) {
  const validation = validateCollisionModel(contract);
  if (!validation.valid) throw new Error(`collision model is invalid: ${validation.errors.join('; ')}`);
  return authorityDescriptors(contract).map((item) => item.subjectId).sort();
}

export function validateCollisionModelAuthority(contract, authoritySet) {
  const errors = [];
  const collisionValidation = validateCollisionModel(contract);
  if (!collisionValidation.valid) errors.push(`collision model invalid: ${collisionValidation.errors.join('; ')}`);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!authorityValidation.valid) errors.push(`semantic authority set invalid: ${authorityValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: [], unknownSubjectIds: []};

  if (authoritySet.scopeId !== contract.scopeId) errors.push('authority set and collision model scopeId differ');
  if (authoritySet.sourceSha256 !== contract.sourceSha256) errors.push('authority set and collision model sourceSha256 differ');
  if (authoritySet.targetSchema !== contract.schema || authoritySet.targetDigest !== contract.collisionDigest) {
    errors.push('authority set does not bind the exact collision model contract');
  }

  const descriptors = authorityDescriptors(contract);
  const expectedIds = new Set(descriptors.map((item) => item.subjectId));
  const entryBySubject = new Map();
  for (const entry of authoritySet.entries) {
    if (entryBySubject.has(entry.subjectId)) errors.push(`duplicate authority subject: ${entry.subjectId}`);
    entryBySubject.set(entry.subjectId, entry);
  }
  const missingSubjectIds = [...expectedIds].filter((subjectId) => !entryBySubject.has(subjectId)).sort();
  const unknownSubjectIds = [...entryBySubject.keys()].filter((subjectId) => !expectedIds.has(subjectId)).sort();
  if (missingSubjectIds.length) errors.push(`missing collision authority subjects: ${missingSubjectIds.join(', ')}`);
  if (unknownSubjectIds.length) errors.push(`unknown collision authority subjects: ${unknownSubjectIds.join(', ')}`);

  for (const descriptor of descriptors) {
    const entry = entryBySubject.get(descriptor.subjectId);
    if (!entry) continue;
    if (!CONSTRUCTION_AUTHORITIES.has(entry.authority)) {
      errors.push(`${descriptor.kind} ${descriptor.ownerId} requires observed, inferred, or engineered authority`);
    }
  }
  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

export function validateCollisionVisualReuseBindings(contract, visualGeometries = []) {
  const errors = [];
  const validation = validateCollisionModel(contract);
  if (!validation.valid) return {valid: false, errors: [`collision model invalid: ${validation.errors.join('; ')}`]};
  if (!Array.isArray(visualGeometries)) return {valid: false, errors: ['visualGeometries must be an array']};

  const visualById = new Map();
  try {
    for (let index = 0; index < visualGeometries.length; index += 1) {
      const normalized = normalizeVisualGeometryRef(visualGeometries[index], `visualGeometries[${index}]`);
      if (visualById.has(normalized.geometryId)) throw new Error(`duplicate visual geometry ID: ${normalized.geometryId}`);
      visualById.set(normalized.geometryId, normalized.geometryDigest);
    }
  } catch (error) {
    return {valid: false, errors: [error.message]};
  }

  for (const link of contract.links) {
    for (const collider of link.colliders) {
      const geometry = collider.geometry;
      if (geometry.kind !== 'MESH' || geometry.reuseMode !== 'DECLARED_VISUAL_REUSE') continue;
      const liveDigest = visualById.get(geometry.visualGeometryRef.geometryId);
      if (!liveDigest) {
        errors.push(`declared visual geometry is missing: ${geometry.visualGeometryRef.geometryId}`);
        continue;
      }
      if (liveDigest !== geometry.visualGeometryRef.geometryDigest || liveDigest !== geometry.geometryDigest) {
        errors.push(`declared visual geometry digest drift: ${geometry.visualGeometryRef.geometryId}`);
      }
    }
  }
  return {valid: errors.length === 0, errors};
}

export function collisionForLink(contract, linkId) {
  const validation = validateCollisionModel(contract);
  if (!validation.valid) throw new Error(`collision model is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(linkId, 'linkId');
  return contract.links.find((link) => link.linkId === id) ?? null;
}

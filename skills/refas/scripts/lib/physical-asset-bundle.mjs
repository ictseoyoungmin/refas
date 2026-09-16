import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';

export const PHYSICAL_ASSET_BUNDLE_SCHEMA = 'refas.physical-asset-bundle/v1';
export const PHYSICAL_ASSET_BUNDLE_IDENTITY_BINDING_SCHEMA = 'refas.physical-asset-bundle-identity-binding/v1';
export const PHYSICAL_ASSET_BUNDLE_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-asset-bundle-identity-projection/v1';
export const PHYSICAL_MODULE_CLOSURE_SCHEMA = 'refas.physical-module-closure/v1';

export const PHYSICAL_ASSET_COMPONENT_SCHEMAS = Object.freeze([
  'refas.rigid-body-dynamics/v1',
  'refas.collision-model/v1',
  'refas.articulation-graph/v1',
  'refas.mechanism-graph/v1',
  'refas.transmission-model/v1',
  'refas.actuation-model/v1',
  'refas.control-profile/v1',
  'refas.runtime-binding/v1',
]);

const COMPONENT_DIGEST_FIELD = new Map([
  ['refas.rigid-body-dynamics/v1', 'dynamicsDigest'],
  ['refas.collision-model/v1', 'collisionDigest'],
  ['refas.articulation-graph/v1', 'articulationDigest'],
  ['refas.mechanism-graph/v1', 'mechanismDigest'],
  ['refas.transmission-model/v1', 'transmissionDigest'],
  ['refas.actuation-model/v1', 'actuationDigest'],
  ['refas.control-profile/v1', 'controlProfileDigest'],
  ['refas.runtime-binding/v1', 'runtimeBindingDigest'],
]);

const TOP_LEVEL_KEYS = new Set([
  'schema', 'bundleId', 'scopeId', 'sourceSha256', 'rootModuleId',
  'identityBinding', 'componentRefs', 'moduleClosures', 'rootClosureDigest', 'policy', 'bundleDigest',
]);
const IDENTITY_BINDING_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const COMPONENT_REF_KEYS = new Set(['componentId', 'ownerModuleId', 'schema', 'digest']);
const LOCAL_COMPONENT_REF_KEYS = new Set(['componentId', 'schema', 'digest']);
const MODULE_CLOSURE_KEYS = new Set([
  'schema', 'moduleId', 'identityProjectionDigest', 'componentRefs', 'childModules', 'closureDigest',
]);
const CHILD_MODULE_KEYS = new Set(['relationId', 'moduleId', 'placementFrame', 'closureDigest']);
const TRANSFORM_KEYS = new Set(['parentId', 'translation_m', 'rotation_quat_xyzw']);
const POLICY_KEYS = new Set([
  'bundleIsManifestNotTruthOwner',
  'componentPayloadsRemainExternal',
  'scopedIdentityProjection',
  'rootIncomingPlacementExcludedFromModuleClosure',
  'childPlacementOwnedByParentClosure',
  'childClosureReusedByExactDigest',
  'backendOrderingIsNotSemanticIdentity',
  'bundleDoesNotAuthorizePhysicalClaims',
]);

const CANONICAL_POLICY = Object.freeze({
  bundleIsManifestNotTruthOwner: true,
  componentPayloadsRemainExternal: true,
  scopedIdentityProjection: true,
  rootIncomingPlacementExcludedFromModuleClosure: true,
  childPlacementOwnedByParentClosure: true,
  childClosureReusedByExactDigest: true,
  backendOrderingIsNotSemanticIdentity: true,
  bundleDoesNotAuthorizePhysicalClaims: true,
});

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain exactly ${length} numbers`);
  return value.map((item, index) => finite(item, `${label}[${index}]`));
}

function normalizePlacementFrame(raw, label) {
  if (raw == null) return null;
  assertKnownKeys(raw, TRANSFORM_KEYS, label);
  return {
    parentId: assertId(raw.parentId, `${label}.parentId`),
    translation_m: normalizeVector(raw.translation_m, 3, `${label}.translation_m`),
    rotation_quat_xyzw: normalizeVector(raw.rotation_quat_xyzw, 4, `${label}.rotation_quat_xyzw`),
  };
}

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function entitySnapshot(entity, {stripFrame = false} = {}) {
  const result = {id: entity.id, kind: entity.kind};
  if (!stripFrame && entity.frame != null) result.frame = structuredClone(entity.frame);
  if (entity.compatibilityFamilyIds != null) result.compatibilityFamilyIds = [...entity.compatibilityFamilyIds];
  return result;
}

function relationSnapshot(relation) {
  const result = {id: relation.id, kind: relation.kind, sourceId: relation.sourceId, targetIds: [...relation.targetIds]};
  if (relation.attachmentRelationId != null) result.attachmentRelationId = relation.attachmentRelationId;
  return result;
}

function physicalMaps(identityGraph) {
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const containsByModule = new Map();
  const exposesByModule = new Map();
  for (const relation of identityGraph.relations) {
    if (relation.kind === 'CONTAINS') {
      if (!containsByModule.has(relation.sourceId)) containsByModule.set(relation.sourceId, []);
      containsByModule.get(relation.sourceId).push(relation);
    }
    if (relation.kind === 'EXPOSES') {
      if (!exposesByModule.has(relation.sourceId)) exposesByModule.set(relation.sourceId, []);
      exposesByModule.get(relation.sourceId).push(relation);
    }
  }
  for (const values of [...containsByModule.values(), ...exposesByModule.values()]) values.sort((a, b) => a.id.localeCompare(b.id));
  return {entityById, containsByModule, exposesByModule};
}

function directChildModules(moduleId, maps) {
  return (maps.containsByModule.get(moduleId) ?? [])
    .flatMap((relation) => relation.targetIds.map((targetId) => ({relation, targetId})))
    .filter(({targetId}) => maps.entityById.get(targetId)?.kind === 'assembly-module')
    .sort((a, b) => a.targetId.localeCompare(b.targetId));
}

function moduleSubtree(identityGraph, rootModuleId) {
  const maps = physicalMaps(identityGraph);
  const root = maps.entityById.get(rootModuleId);
  if (!root) throw new Error(`rootModuleId references unknown physical identity: ${rootModuleId}`);
  if (root.kind !== 'assembly-module') throw new Error(`rootModuleId must reference assembly-module, found ${root.kind}`);

  const moduleIds = new Set();
  const selectedIds = new Set();
  const stack = [rootModuleId];
  while (stack.length) {
    const moduleId = stack.pop();
    if (moduleIds.has(moduleId)) continue;
    moduleIds.add(moduleId);
    selectedIds.add(moduleId);

    for (const relation of maps.containsByModule.get(moduleId) ?? []) {
      for (const targetId of relation.targetIds) {
        selectedIds.add(targetId);
        if (maps.entityById.get(targetId)?.kind === 'assembly-module') stack.push(targetId);
      }
    }
    for (const relation of maps.exposesByModule.get(moduleId) ?? []) {
      for (const targetId of relation.targetIds) selectedIds.add(targetId);
    }
  }
  return {maps, moduleIds, selectedIds};
}

export function physicalAssetBundleIdentityProjection(identityGraph, rootModuleId) {
  validateIdentityGraph(identityGraph);
  const normalizedRootModuleId = assertId(rootModuleId, 'rootModuleId');
  const {maps, selectedIds} = moduleSubtree(identityGraph, normalizedRootModuleId);

  const entities = [...selectedIds]
    .map((id) => maps.entityById.get(id))
    .filter(Boolean)
    .map((entity) => entitySnapshot(entity, {stripFrame: entity.id === normalizedRootModuleId}))
    .sort((a, b) => a.id.localeCompare(b.id));

  const relations = identityGraph.relations
    .filter((relation) => selectedIds.has(relation.sourceId) && relation.targetIds.every((id) => selectedIds.has(id)))
    .map(relationSnapshot)
    .sort((a, b) => a.id.localeCompare(b.id));

  return deepFreeze({
    schema: PHYSICAL_ASSET_BUNDLE_IDENTITY_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    rootModuleId: normalizedRootModuleId,
    entities,
    relations,
  });
}

function identityBindingFor(identityGraph, rootModuleId) {
  return {
    schema: PHYSICAL_ASSET_BUNDLE_IDENTITY_BINDING_SCHEMA,
    sourceSchema: 'refas.physical-identity-graph/v1',
    projectionDigest: digestJson(physicalAssetBundleIdentityProjection(identityGraph, rootModuleId)),
  };
}

function normalizeIdentityBinding(raw, label = 'identityBinding') {
  assertKnownKeys(raw, IDENTITY_BINDING_KEYS, label);
  if (raw.schema !== PHYSICAL_ASSET_BUNDLE_IDENTITY_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_ASSET_BUNDLE_IDENTITY_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.physical-identity-graph/v1') throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

function contractDigest(contract, label) {
  assertRecord(contract, label);
  const schema = String(contract.schema ?? '');
  const digestField = COMPONENT_DIGEST_FIELD.get(schema);
  if (!digestField) throw new Error(`${label}.schema is not a supported P10 component schema: ${schema || 'null'}`);
  const digest = assertDigest(contract[digestField], `${label}.${digestField}`);
  const payload = {...contract};
  delete payload[digestField];
  const reproduced = digestJson(payload);
  if (reproduced !== digest) throw new Error(`${label}.${digestField} does not reproduce from the supplied component payload`);
  return {schema, digest};
}

function normalizeLiveComponents(components, identityGraph, moduleIds) {
  if (!Array.isArray(components)) throw new Error('components must be an array');
  const refs = components.map((item, index) => {
    const label = `components[${index}]`;
    assertRecord(item, label);
    const extras = Object.keys(item).filter((key) => !['componentId', 'ownerModuleId', 'contract'].includes(key));
    if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
    const componentId = assertId(item.componentId, `${label}.componentId`);
    const ownerModuleId = assertId(item.ownerModuleId, `${label}.ownerModuleId`);
    if (!moduleIds.has(ownerModuleId)) throw new Error(`${label}.ownerModuleId is outside the selected root-module subtree: ${ownerModuleId}`);
    const {schema, digest} = contractDigest(item.contract, `${label}.contract`);
    if (item.contract.scopeId !== identityGraph.scopeId || item.contract.sourceSha256 !== identityGraph.sourceSha256) {
      throw new Error(`${label}.contract scope/source does not match the physical identity graph`);
    }
    return {componentId, ownerModuleId, schema, digest};
  }).sort((a, b) => a.componentId.localeCompare(b.componentId));
  if (new Set(refs.map((item) => item.componentId)).size !== refs.length) throw new Error('componentId values must be globally unique within one physical asset bundle');
  return refs;
}

function normalizeComponentRef(raw, label) {
  assertKnownKeys(raw, COMPONENT_REF_KEYS, label);
  const schema = String(raw.schema ?? '');
  if (!COMPONENT_DIGEST_FIELD.has(schema)) throw new Error(`${label}.schema is not supported by P10: ${schema || 'null'}`);
  return {
    componentId: assertId(raw.componentId, `${label}.componentId`),
    ownerModuleId: assertId(raw.ownerModuleId, `${label}.ownerModuleId`),
    schema,
    digest: assertDigest(raw.digest, `${label}.digest`),
  };
}

function normalizeLocalComponentRef(raw, label) {
  assertKnownKeys(raw, LOCAL_COMPONENT_REF_KEYS, label);
  const schema = String(raw.schema ?? '');
  if (!COMPONENT_DIGEST_FIELD.has(schema)) throw new Error(`${label}.schema is not supported by P10: ${schema || 'null'}`);
  return {
    componentId: assertId(raw.componentId, `${label}.componentId`),
    schema,
    digest: assertDigest(raw.digest, `${label}.digest`),
  };
}

function moduleIdentityProjectionDigest(identityGraph, moduleId) {
  return digestJson(physicalAssetBundleIdentityProjection(identityGraph, moduleId));
}

function buildClosures(identityGraph, rootModuleId, componentRefs) {
  const {maps, moduleIds} = moduleSubtree(identityGraph, rootModuleId);
  const refsByModule = new Map([...moduleIds].map((id) => [id, []]));
  for (const ref of componentRefs) refsByModule.get(ref.ownerModuleId).push(ref);
  for (const refs of refsByModule.values()) refs.sort((a, b) => a.componentId.localeCompare(b.componentId));

  const closureByModule = new Map();
  const visiting = new Set();

  function close(moduleId) {
    if (closureByModule.has(moduleId)) return closureByModule.get(moduleId);
    if (visiting.has(moduleId)) throw new Error(`module closure recursion contains a cycle at ${moduleId}`);
    visiting.add(moduleId);

    const childModules = directChildModules(moduleId, maps).map(({relation, targetId}) => {
      if (!moduleIds.has(targetId)) throw new Error(`child module ${targetId} escaped selected root-module subtree`);
      const childClosure = close(targetId);
      const childEntity = maps.entityById.get(targetId);
      return {
        relationId: relation.id,
        moduleId: targetId,
        placementFrame: childEntity.frame == null ? null : structuredClone(childEntity.frame),
        closureDigest: childClosure.closureDigest,
      };
    }).sort((a, b) => a.moduleId.localeCompare(b.moduleId));

    const localComponentRefs = (refsByModule.get(moduleId) ?? []).map((ref) => ({
      componentId: ref.componentId,
      schema: ref.schema,
      digest: ref.digest,
    }));

    const payload = {
      schema: PHYSICAL_MODULE_CLOSURE_SCHEMA,
      moduleId,
      identityProjectionDigest: moduleIdentityProjectionDigest(identityGraph, moduleId),
      componentRefs: localComponentRefs,
      childModules,
    };
    const closure = deepFreeze({...payload, closureDigest: digestJson(payload)});
    visiting.delete(moduleId);
    closureByModule.set(moduleId, closure);
    return closure;
  }

  close(rootModuleId);
  return [...closureByModule.values()].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

function normalizeChildModule(raw, label) {
  assertKnownKeys(raw, CHILD_MODULE_KEYS, label);
  return {
    relationId: assertId(raw.relationId, `${label}.relationId`),
    moduleId: assertId(raw.moduleId, `${label}.moduleId`),
    placementFrame: normalizePlacementFrame(raw.placementFrame, `${label}.placementFrame`),
    closureDigest: assertDigest(raw.closureDigest, `${label}.closureDigest`),
  };
}

function normalizeModuleClosure(raw, label) {
  assertKnownKeys(raw, MODULE_CLOSURE_KEYS, label);
  if (raw.schema !== PHYSICAL_MODULE_CLOSURE_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_MODULE_CLOSURE_SCHEMA}`);
  const componentRefs = (raw.componentRefs ?? []).map((item, index) => normalizeLocalComponentRef(item, `${label}.componentRefs[${index}]`))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  if (new Set(componentRefs.map((item) => item.componentId)).size !== componentRefs.length) throw new Error(`${label}.componentRefs contains duplicate componentId values`);
  const childModules = (raw.childModules ?? []).map((item, index) => normalizeChildModule(item, `${label}.childModules[${index}]`))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  if (new Set(childModules.map((item) => item.moduleId)).size !== childModules.length) throw new Error(`${label}.childModules contains duplicate moduleId values`);
  const payload = {
    schema: raw.schema,
    moduleId: assertId(raw.moduleId, `${label}.moduleId`),
    identityProjectionDigest: assertDigest(raw.identityProjectionDigest, `${label}.identityProjectionDigest`),
    componentRefs,
    childModules,
  };
  const closureDigest = assertDigest(raw.closureDigest, `${label}.closureDigest`);
  if (digestJson(payload) !== closureDigest) throw new Error(`${label}.closureDigest does not reproduce`);
  return {...payload, closureDigest};
}

function normalizePolicy(raw) {
  assertKnownKeys(raw, POLICY_KEYS, 'policy');
  if (digestJson(raw) !== digestJson(CANONICAL_POLICY)) throw new Error('policy must equal the canonical P10 policy');
  return {...CANONICAL_POLICY};
}

function normalizePersistedBundle(value) {
  assertKnownKeys(value, TOP_LEVEL_KEYS, 'physical asset bundle');
  if (value.schema !== PHYSICAL_ASSET_BUNDLE_SCHEMA) throw new Error(`schema must be ${PHYSICAL_ASSET_BUNDLE_SCHEMA}`);
  const bundleId = assertId(value.bundleId, 'bundleId');
  const scopeId = assertId(value.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(value.sourceSha256, 'sourceSha256');
  const rootModuleId = assertId(value.rootModuleId, 'rootModuleId');
  const identityBinding = normalizeIdentityBinding(value.identityBinding);

  if (!Array.isArray(value.componentRefs)) throw new Error('componentRefs must be an array');
  const componentRefs = value.componentRefs.map((item, index) => normalizeComponentRef(item, `componentRefs[${index}]`))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  if (new Set(componentRefs.map((item) => item.componentId)).size !== componentRefs.length) throw new Error('componentRefs contains duplicate componentId values');

  if (!Array.isArray(value.moduleClosures) || !value.moduleClosures.length) throw new Error('moduleClosures must contain at least one module closure');
  const moduleClosures = value.moduleClosures.map((item, index) => normalizeModuleClosure(item, `moduleClosures[${index}]`))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  const closureByModule = new Map(moduleClosures.map((item) => [item.moduleId, item]));
  if (closureByModule.size !== moduleClosures.length) throw new Error('moduleClosures contains duplicate moduleId values');
  if (!closureByModule.has(rootModuleId)) throw new Error('rootModuleId has no corresponding module closure');

  const globalRefById = new Map(componentRefs.map((item) => [item.componentId, item]));
  const seenComponentIds = new Set();
  const parentCount = new Map(moduleClosures.map((item) => [item.moduleId, 0]));
  for (const closure of moduleClosures) {
    for (const localRef of closure.componentRefs) {
      const globalRef = globalRefById.get(localRef.componentId);
      if (!globalRef) throw new Error(`module ${closure.moduleId} references unknown component ${localRef.componentId}`);
      if (globalRef.ownerModuleId !== closure.moduleId) throw new Error(`component ${localRef.componentId} is listed under the wrong module closure`);
      if (globalRef.schema !== localRef.schema || globalRef.digest !== localRef.digest) throw new Error(`component ${localRef.componentId} local ref does not match global exact digest ref`);
      if (seenComponentIds.has(localRef.componentId)) throw new Error(`component ${localRef.componentId} appears in more than one module closure`);
      seenComponentIds.add(localRef.componentId);
    }
    for (const child of closure.childModules) {
      const childClosure = closureByModule.get(child.moduleId);
      if (!childClosure) throw new Error(`module ${closure.moduleId} references missing child closure ${child.moduleId}`);
      if (child.closureDigest !== childClosure.closureDigest) throw new Error(`module ${closure.moduleId} child closure digest is stale for ${child.moduleId}`);
      parentCount.set(child.moduleId, (parentCount.get(child.moduleId) ?? 0) + 1);
    }
  }
  if (seenComponentIds.size !== componentRefs.length) throw new Error('every global component ref must appear exactly once in its owner module closure');
  if ((parentCount.get(rootModuleId) ?? 0) !== 0) throw new Error('root module closure may not appear as a child');
  for (const [moduleId, count] of parentCount) {
    if (moduleId === rootModuleId) continue;
    if (count !== 1) throw new Error(`non-root module closure ${moduleId} must have exactly one parent closure`);
  }

  const rootClosure = closureByModule.get(rootModuleId);
  if (identityBinding.projectionDigest !== rootClosure.identityProjectionDigest) throw new Error('identityBinding must match the root module scoped identity projection digest');
  const rootClosureDigest = assertDigest(value.rootClosureDigest, 'rootClosureDigest');
  if (rootClosureDigest !== rootClosure.closureDigest) throw new Error('rootClosureDigest does not match the root module closure');

  const policy = normalizePolicy(value.policy);
  const payload = {
    schema: value.schema,
    bundleId,
    scopeId,
    sourceSha256,
    rootModuleId,
    identityBinding,
    componentRefs,
    moduleClosures,
    rootClosureDigest,
    policy,
  };
  const bundleDigest = assertDigest(value.bundleDigest, 'bundleDigest');
  if (digestJson(payload) !== bundleDigest) throw new Error('bundleDigest does not reproduce');
  return {...payload, bundleDigest};
}

export function createPhysicalAssetBundle({bundleId, identityGraph, rootModuleId, components = []} = {}) {
  validateIdentityGraph(identityGraph);
  const normalizedBundleId = assertId(bundleId, 'bundleId');
  const normalizedRootModuleId = assertId(rootModuleId, 'rootModuleId');
  const {moduleIds} = moduleSubtree(identityGraph, normalizedRootModuleId);
  const componentRefs = normalizeLiveComponents(components, identityGraph, moduleIds);
  const moduleClosures = buildClosures(identityGraph, normalizedRootModuleId, componentRefs);
  const rootClosure = moduleClosures.find((item) => item.moduleId === normalizedRootModuleId);
  const payload = {
    schema: PHYSICAL_ASSET_BUNDLE_SCHEMA,
    bundleId: normalizedBundleId,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    rootModuleId: normalizedRootModuleId,
    identityBinding: identityBindingFor(identityGraph, normalizedRootModuleId),
    componentRefs,
    moduleClosures,
    rootClosureDigest: rootClosure.closureDigest,
    policy: {...CANONICAL_POLICY},
  };
  return deepFreeze({...payload, bundleDigest: digestJson(payload)});
}

export function validatePhysicalAssetBundle(value) {
  const errors = [];
  try {
    const normalized = normalizePersistedBundle(value);
    if (digestJson(normalized) !== digestJson(value)) errors.push('physical asset bundle is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validatePhysicalAssetBundleBindings(value, {identityGraph, components = []} = {}) {
  const errors = [];
  const intrinsic = validatePhysicalAssetBundle(value);
  if (!intrinsic.valid) errors.push(`physical asset bundle invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const recreated = createPhysicalAssetBundle({
        bundleId: value.bundleId,
        identityGraph,
        rootModuleId: value.rootModuleId,
        components,
      });
      if (recreated.bundleDigest !== value.bundleDigest) errors.push('physical asset bundle does not reproduce against current identity/component inputs');
      if (digestJson(recreated) !== digestJson(value)) errors.push('physical asset bundle current bindings are stale or noncanonical');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function physicalModuleClosureById(bundle, moduleId) {
  const validation = validatePhysicalAssetBundle(bundle);
  if (!validation.valid) throw new Error(`physical asset bundle is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(moduleId, 'moduleId');
  return bundle.moduleClosures.find((item) => item.moduleId === id) ?? null;
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {
  PHYSICAL_ASSET_BUNDLE_SCHEMA,
  PHYSICAL_ASSET_COMPONENT_SCHEMAS,
  physicalAssetBundleIdentityProjection,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
} from './physical-asset-bundle.mjs';

export const REPRESENTATION_CAPACITY_SCHEMA = 'refas.representation-capacity/v1';
export const REPRESENTATION_CAPACITY_BUNDLE_BINDING_SCHEMA = 'refas.representation-capacity-bundle-binding/v1';
export const REPRESENTATION_SOURCE_KINDS = Object.freeze(['IDENTITY', 'COMPONENT']);
export const REPRESENTATION_APPROXIMATION_STRATEGIES = Object.freeze(['BAKED', 'REDUCED', 'SURROGATE', 'BACKEND_EXTENSION', 'CUSTOM']);

const SOURCE_KIND_SET = new Set(REPRESENTATION_SOURCE_KINDS);
const COMPONENT_SCHEMA_SET = new Set(PHYSICAL_ASSET_COMPONENT_SCHEMAS);
const APPROXIMATION_STRATEGY_SET = new Set(REPRESENTATION_APPROXIMATION_STRATEGIES);
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const SEMANTIC_PATH_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u;
const TOP_LEVEL_KEYS = new Set(['schema','profileId','backend','bundleBinding','obligations','supported','approximated','unsupported','blockers','exportable','policy','capacityDigest']);
const BUNDLE_BINDING_KEYS = new Set(['schema','bundleSchema','bundleDigest','rootClosureDigest','rootModuleId','identityProjectionDigest']);
const OBLIGATION_KEYS = new Set(['obligationId','source','semanticPath','subjectIds']);
const IDENTITY_SOURCE_KEYS = new Set(['kind','projectionDigest']);
const COMPONENT_SOURCE_KEYS = new Set(['kind','componentId','schema','digest']);
const SUPPORTED_KEYS = new Set(['obligationId']);
const APPROXIMATED_KEYS = new Set(['obligationId','strategy','reason','retainedSemantics','lossSemantics']);
const UNSUPPORTED_KEYS = new Set(['obligationId','reason']);
const BLOCKER_KEYS = new Set(['blockerId','obligationIds','reason']);
const POLICY_KEYS = new Set(['bundleIsCanonicalInput','profileDoesNotOwnCanonicalTruth','obligationsDerivedFromCanonicalBundle','everyObligationClassifiedExactlyOnce','approximationMustBeExplicit','unsupportedSemanticsRemainExplicit','blockerPreventsExport','backendOrderingIsNotSemanticIdentity','profileDoesNotAuthorizeClaims','exporterImplementationRemainsDownstream']);
const CANONICAL_POLICY = Object.freeze({
  bundleIsCanonicalInput: true,
  profileDoesNotOwnCanonicalTruth: true,
  obligationsDerivedFromCanonicalBundle: true,
  everyObligationClassifiedExactlyOnce: true,
  approximationMustBeExplicit: true,
  unsupportedSemanticsRemainExplicit: true,
  blockerPreventsExport: true,
  backendOrderingIsNotSemanticIdentity: true,
  profileDoesNotAuthorizeClaims: true,
  exporterImplementationRemainsDownstream: true,
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
function text(value, label, {maxLength = 2048} = {}) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || value.length > maxLength) {
    throw new Error(`${label} must be a trimmed non-empty string up to ${maxLength} characters`);
  }
  if (CONTROL_RE.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}
function backend(value) { return text(value, 'backend', {maxLength: 256}); }
function semanticPath(value, label) {
  const path = text(value, label, {maxLength: 160});
  if (!SEMANTIC_PATH_RE.test(path)) throw new Error(`${label} must be a canonical dotted semantic path`);
  return path;
}
function idArray(value, label, {nonEmpty = true} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (nonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const ids = value.map((item, index) => assertId(item, `${label}[${index}]`)).sort();
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must contain unique IDs`);
  return ids;
}
function stringArray(value, label, {nonEmpty = true} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (nonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const items = value.map((item, index) => text(item, `${label}[${index}]`, {maxLength: 256})).sort();
  if (new Set(items).size !== items.length) throw new Error(`${label} must contain unique entries`);
  return items;
}
function uniqueIds(values) { return [...new Set(values.filter((value) => value != null))].sort(); }
function normalizeSource(raw, label) {
  assertRecord(raw, label);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!SOURCE_KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${REPRESENTATION_SOURCE_KINDS.join(', ')}`);
  if (kind === 'IDENTITY') {
    assertKnownKeys(raw, IDENTITY_SOURCE_KEYS, label);
    return {kind, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
  }
  assertKnownKeys(raw, COMPONENT_SOURCE_KEYS, label);
  const schema = text(raw.schema, `${label}.schema`, {maxLength: 160});
  if (!COMPONENT_SCHEMA_SET.has(schema)) throw new Error(`${label}.schema must be a P10 physical component schema`);
  return {kind, componentId: assertId(raw.componentId, `${label}.componentId`), schema, digest: assertDigest(raw.digest, `${label}.digest`)};
}

export function representationObligationId(source, path, subjectIds) {
  const normalizedSource = normalizeSource(source, 'source');
  const normalizedPath = semanticPath(path, 'semanticPath');
  const ids = idArray(subjectIds, 'subjectIds');
  return assertId(`representation:${digestJson({source: normalizedSource, semanticPath: normalizedPath, subjectIds: ids}).slice(0, 48)}`, 'obligationId');
}
function obligation(source, path, subjects) {
  const ids = uniqueIds(subjects);
  if (!ids.length) return null;
  const normalizedPath = semanticPath(path, 'semanticPath');
  return {
    obligationId: representationObligationId(source, normalizedPath, ids),
    source,
    semanticPath: normalizedPath,
    subjectIds: ids,
  };
}
function pushObligation(items, source, path, subjects) {
  const item = obligation(source, path, subjects);
  if (item) items.push(item);
}
function normalizeObligation(raw, index) {
  const label = `obligations[${index}]`;
  assertKnownKeys(raw, OBLIGATION_KEYS, label);
  const source = normalizeSource(raw.source, `${label}.source`);
  const path = semanticPath(raw.semanticPath, `${label}.semanticPath`);
  const subjectIds = idArray(raw.subjectIds, `${label}.subjectIds`);
  const obligationId = assertId(raw.obligationId, `${label}.obligationId`);
  const expected = representationObligationId(source, path, subjectIds);
  if (obligationId !== expected) throw new Error(`${label}.obligationId must be canonical ID ${expected}`);
  return {obligationId, source, semanticPath: path, subjectIds};
}
function normalizeSupported(raw, index) {
  const label = `supported[${index}]`;
  assertKnownKeys(raw, SUPPORTED_KEYS, label);
  return {obligationId: assertId(raw.obligationId, `${label}.obligationId`)};
}
function normalizeApproximated(raw, index) {
  const label = `approximated[${index}]`;
  assertKnownKeys(raw, APPROXIMATED_KEYS, label);
  const strategy = String(raw.strategy ?? '').trim().toUpperCase();
  if (!APPROXIMATION_STRATEGY_SET.has(strategy)) throw new Error(`${label}.strategy must be one of: ${REPRESENTATION_APPROXIMATION_STRATEGIES.join(', ')}`);
  const retainedSemantics = stringArray(raw.retainedSemantics, `${label}.retainedSemantics`);
  const lossSemantics = stringArray(raw.lossSemantics, `${label}.lossSemantics`);
  const retained = new Set(retainedSemantics);
  for (const item of lossSemantics) if (retained.has(item)) throw new Error(`${label} may not list the same semantic as both retained and lost: ${item}`);
  return {obligationId: assertId(raw.obligationId, `${label}.obligationId`), strategy, reason: text(raw.reason, `${label}.reason`), retainedSemantics, lossSemantics};
}
function normalizeUnsupported(raw, index) {
  const label = `unsupported[${index}]`;
  assertKnownKeys(raw, UNSUPPORTED_KEYS, label);
  return {obligationId: assertId(raw.obligationId, `${label}.obligationId`), reason: text(raw.reason, `${label}.reason`)};
}
function normalizeBlocker(raw, index) {
  const label = `blockers[${index}]`;
  assertKnownKeys(raw, BLOCKER_KEYS, label);
  return {blockerId: assertId(raw.blockerId, `${label}.blockerId`), obligationIds: idArray(raw.obligationIds, `${label}.obligationIds`), reason: text(raw.reason, `${label}.reason`)};
}
function normalizePolicy(raw) {
  assertKnownKeys(raw, POLICY_KEYS, 'policy');
  if (digestJson(raw) !== digestJson(CANONICAL_POLICY)) throw new Error('policy must equal the canonical P11 representation-capacity policy');
  return {...CANONICAL_POLICY};
}
function bundleBindingFor(bundle) {
  return {
    schema: REPRESENTATION_CAPACITY_BUNDLE_BINDING_SCHEMA,
    bundleSchema: PHYSICAL_ASSET_BUNDLE_SCHEMA,
    bundleDigest: bundle.bundleDigest,
    rootClosureDigest: bundle.rootClosureDigest,
    rootModuleId: bundle.rootModuleId,
    identityProjectionDigest: bundle.identityBinding.projectionDigest,
  };
}
function normalizeBundleBinding(raw) {
  assertKnownKeys(raw, BUNDLE_BINDING_KEYS, 'bundleBinding');
  if (raw.schema !== REPRESENTATION_CAPACITY_BUNDLE_BINDING_SCHEMA) throw new Error(`bundleBinding.schema must be ${REPRESENTATION_CAPACITY_BUNDLE_BINDING_SCHEMA}`);
  if (raw.bundleSchema !== PHYSICAL_ASSET_BUNDLE_SCHEMA) throw new Error(`bundleBinding.bundleSchema must be ${PHYSICAL_ASSET_BUNDLE_SCHEMA}`);
  return {
    schema: raw.schema,
    bundleSchema: raw.bundleSchema,
    bundleDigest: assertDigest(raw.bundleDigest, 'bundleBinding.bundleDigest'),
    rootClosureDigest: assertDigest(raw.rootClosureDigest, 'bundleBinding.rootClosureDigest'),
    rootModuleId: assertId(raw.rootModuleId, 'bundleBinding.rootModuleId'),
    identityProjectionDigest: assertDigest(raw.identityProjectionDigest, 'bundleBinding.identityProjectionDigest'),
  };
}

function identitySemanticUnits(identity) {
  const units = [];
  for (const entity of identity.entities ?? []) {
    units.push({path: 'identity.entity', subjects: [entity.id]});
    if (entity.frame != null) units.push({path: 'frame.transform', subjects: [entity.id]});
    if (entity.kind === 'attachment-interface') units.push({path: 'composition.interface', subjects: [entity.id]});
    if ((entity.compatibilityFamilyIds ?? []).length) units.push({path: 'compatibility.family', subjects: [entity.id]});
  }
  for (const relation of identity.relations ?? []) {
    units.push({path: 'identity.relation', subjects: [relation.id]});
    if (relation.kind === 'CONTAINS') units.push({path: 'composition.contains', subjects: [relation.id, relation.sourceId, ...relation.targetIds]});
  }
  return units;
}

function componentSemanticUnits(contract) {
  const units = [];
  switch (contract.schema) {
    case 'refas.rigid-body-dynamics/v1':
      for (const link of contract.links ?? []) {
        for (const path of ['dynamics.mass', 'dynamics.center-of-mass', 'dynamics.inertia']) units.push({path, subjects: [link.linkId]});
      }
      break;
    case 'refas.collision-model/v1':
      for (const link of contract.links ?? []) {
        units.push({path: 'collision.self-policy', subjects: [link.linkId]});
        for (const collider of link.colliders ?? []) {
          const subjects = [link.linkId, collider.id];
          units.push({path: 'collision.frame', subjects});
          units.push({path: 'collision.geometry', subjects});
          units.push({path: 'collision.filter', subjects});
        }
      }
      break;
    case 'refas.articulation-graph/v1':
      if (contract.rootLinkId) units.push({path: 'articulation.topology', subjects: [contract.rootLinkId]});
      for (const joint of contract.joints ?? []) {
        const subjects = [joint.virtualJointId, joint.parentLinkId, joint.childLinkId];
        units.push({path: 'articulation.topology', subjects});
        units.push({path: 'articulation.joint-frame', subjects});
        units.push({path: 'articulation.reference-configuration', subjects});
        units.push({path: 'articulation.joint-limit', subjects});
      }
      break;
    case 'refas.mechanism-graph/v1':
      for (const mechanism of contract.mechanisms ?? []) {
        const subjects = [
          mechanism.mechanismId,
          ...(mechanism.realizedJointIds ?? []),
          ...(mechanism.members ?? []).map((member) => member.physicalIdentityId),
        ];
        units.push({path: 'mechanism.kind', subjects: [mechanism.mechanismId]});
        units.push({path: 'mechanism.topology', subjects});
      }
      break;
    case 'refas.transmission-model/v1':
      for (const transmission of contract.transmissions ?? []) {
        const subjects = [
          transmission.transmissionId,
          ...(transmission.contextMechanismIds ?? []),
          ...(transmission.inputSpace?.coordinates ?? []).map((coordinate) => coordinate.semanticIdentityId),
          ...(transmission.outputSpace?.coordinates ?? []).map((coordinate) => coordinate.semanticIdentityId),
        ];
        for (const path of ['transmission.coordinate-space', 'transmission.coordinate-map', 'transmission.velocity-map', 'transmission.effort-map']) {
          units.push({path, subjects});
        }
        if (['NONLINEAR', 'EXTERNAL_SOLVER'].includes(transmission.mapping?.kind)) units.push({path: 'transmission.external-implementation', subjects});
      }
      break;
    case 'refas.actuation-model/v1':
      for (const actuator of contract.actuators ?? []) {
        const subjects = [actuator.actuatorId];
        for (const path of [
          'actuation.kind',
          'actuation.coordinate-class',
          'actuation.position-range',
          'actuation.velocity-limit',
          'actuation.effort-limit',
          'actuation.stiffness',
          'actuation.damping',
          'actuation.armature',
          'actuation.control-modes',
          'actuation.response-latency',
        ]) units.push({path, subjects});
      }
      break;
    case 'refas.control-profile/v1':
      for (const profile of contract.profiles ?? []) {
        const subjects = [profile.profileId, profile.selector?.controllerId, profile.selector?.actuatorId];
        for (const path of ['control.coordinate-class', 'control.mode', 'control.command-space', 'control.gains', 'control.delay']) units.push({path, subjects});
      }
      break;
    case 'refas.runtime-binding/v1':
      for (const binding of contract.bindings ?? []) {
        const subjects = [binding.bindingId, binding.selector?.runtimeEndpointId, binding.selector?.targetId];
        for (const path of ['runtime.endpoint', 'runtime.coordinate-class', 'runtime.locator', 'runtime.index', 'runtime.calibration', 'runtime.transport-delay']) units.push({path, subjects});
      }
      break;
    default:
      break;
  }
  return units.map((unit) => ({...unit, subjects: uniqueIds(unit.subjects)})).filter((unit) => unit.subjects.length);
}

function buildLiveInventory(bundle, identityGraph, components) {
  const intrinsic = validatePhysicalAssetBundle(bundle);
  if (!intrinsic.valid) throw new Error(`physical asset bundle is invalid: ${intrinsic.errors.join('; ')}`);
  const bindings = validatePhysicalAssetBundleBindings(bundle, {identityGraph, components});
  if (!bindings.valid) throw new Error(`physical asset bundle bindings are stale: ${bindings.errors.join('; ')}`);
  const identityProjection = physicalAssetBundleIdentityProjection(identityGraph, bundle.rootModuleId);
  const bundleRefById = new Map(bundle.componentRefs.map((ref) => [ref.componentId, ref]));
  const liveById = new Map();
  for (const item of components ?? []) if (item && typeof item === 'object' && bundleRefById.has(item.componentId)) liveById.set(item.componentId, item.contract);
  return {identityProjection, bundleRefById, liveById};
}

export function deriveRepresentationCapacityObligations({bundle, identityGraph, components = []} = {}) {
  const inventory = buildLiveInventory(bundle, identityGraph, components);
  const identitySource = {kind: 'IDENTITY', projectionDigest: bundle.identityBinding.projectionDigest};
  const items = [];

  for (const unit of identitySemanticUnits(inventory.identityProjection)) pushObligation(items, identitySource, unit.path, unit.subjects);

  for (const ref of bundle.componentRefs) {
    const contract = inventory.liveById.get(ref.componentId);
    if (!contract) throw new Error(`representation obligation derivation requires live component payload for ${ref.componentId}`);
    const componentSource = {kind: 'COMPONENT', componentId: ref.componentId, schema: ref.schema, digest: ref.digest};
    const units = componentSemanticUnits(contract);
    if (!units.length) throw new Error(`component ${ref.componentId} exposes no semantic representation units`);
    for (const unit of units) pushObligation(items, componentSource, unit.path, unit.subjects);
  }

  items.sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  const ids = new Set();
  const signatures = new Set();
  for (const item of items) {
    if (ids.has(item.obligationId)) throw new Error(`duplicate representation obligation ID: ${item.obligationId}`);
    ids.add(item.obligationId);
    const signature = digestJson({source: item.source, semanticPath: item.semanticPath, subjectIds: item.subjectIds});
    if (signatures.has(signature)) throw new Error(`duplicate semantic representation obligation: ${item.semanticPath}`);
    signatures.add(signature);
  }
  if (!items.length) throw new Error('representation capacity requires at least one derived obligation');
  return deepFreeze(items);
}

function normalizeDecisionSets(raw) {
  if (!Array.isArray(raw.supported) || !Array.isArray(raw.approximated) || !Array.isArray(raw.unsupported) || !Array.isArray(raw.blockers)) {
    throw new Error('supported, approximated, unsupported, and blockers must be arrays');
  }
  const supported = raw.supported.map(normalizeSupported).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  const approximated = raw.approximated.map(normalizeApproximated).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  const unsupported = raw.unsupported.map(normalizeUnsupported).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  const blockers = raw.blockers.map(normalizeBlocker).sort((a, b) => a.blockerId.localeCompare(b.blockerId));
  if (new Set(supported.map((item) => item.obligationId)).size !== supported.length) throw new Error('supported contains duplicate obligationId values');
  if (new Set(approximated.map((item) => item.obligationId)).size !== approximated.length) throw new Error('approximated contains duplicate obligationId values');
  if (new Set(unsupported.map((item) => item.obligationId)).size !== unsupported.length) throw new Error('unsupported contains duplicate obligationId values');
  if (new Set(blockers.map((item) => item.blockerId)).size !== blockers.length) throw new Error('blockers contains duplicate blockerId values');
  return {supported, approximated, unsupported, blockers};
}
function validateCoverage(obligations, decisions) {
  const ids = new Set(obligations.map((item) => item.obligationId));
  const count = new Map(obligations.map((item) => [item.obligationId, 0]));
  const supported = new Set(decisions.supported.map((item) => item.obligationId));
  for (const item of [...decisions.supported, ...decisions.approximated, ...decisions.unsupported]) {
    if (!ids.has(item.obligationId)) throw new Error(`classification references unknown obligation: ${item.obligationId}`);
    count.set(item.obligationId, count.get(item.obligationId) + 1);
  }
  for (const [id, number] of count) if (number !== 1) throw new Error(`obligation ${id} must be classified exactly once; found ${number}`);
  for (const blocker of decisions.blockers) {
    for (const id of blocker.obligationIds) {
      if (!ids.has(id)) throw new Error(`blocker ${blocker.blockerId} references unknown obligation: ${id}`);
      if (supported.has(id)) throw new Error(`blocker ${blocker.blockerId} may not block exactly supported obligation ${id}`);
    }
  }
}
function normalizePersistedProfile(value) {
  assertKnownKeys(value, TOP_LEVEL_KEYS, 'representation capacity profile');
  if (value.schema !== REPRESENTATION_CAPACITY_SCHEMA) throw new Error(`schema must be ${REPRESENTATION_CAPACITY_SCHEMA}`);
  const profileId = assertId(value.profileId, 'profileId');
  const backendName = backend(value.backend);
  const bundleBinding = normalizeBundleBinding(value.bundleBinding);
  if (!Array.isArray(value.obligations) || !value.obligations.length) throw new Error('obligations must contain at least one projection obligation');
  const obligations = value.obligations.map(normalizeObligation).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  if (new Set(obligations.map((item) => item.obligationId)).size !== obligations.length) throw new Error('obligations contains duplicate obligationId values');
  const decisions = normalizeDecisionSets(value);
  validateCoverage(obligations, decisions);
  if (typeof value.exportable !== 'boolean') throw new Error('exportable must be boolean');
  if (value.exportable !== (decisions.blockers.length === 0)) throw new Error('exportable must equal blockers.length === 0');
  const policy = normalizePolicy(value.policy);
  const payload = {
    schema: value.schema,
    profileId,
    backend: backendName,
    bundleBinding,
    obligations,
    supported: decisions.supported,
    approximated: decisions.approximated,
    unsupported: decisions.unsupported,
    blockers: decisions.blockers,
    exportable: value.exportable,
    policy,
  };
  const capacityDigest = assertDigest(value.capacityDigest, 'capacityDigest');
  if (digestJson(payload) !== capacityDigest) throw new Error('capacityDigest does not reproduce');
  return {...payload, capacityDigest};
}

export function createRepresentationCapacityProfile({profileId, backend: backendName, bundle, identityGraph, components = [], supported = [], approximated = [], unsupported = [], blockers = []} = {}) {
  const obligations = deriveRepresentationCapacityObligations({bundle, identityGraph, components});
  const decisions = normalizeDecisionSets({supported, approximated, unsupported, blockers});
  validateCoverage(obligations, decisions);
  const payload = {
    schema: REPRESENTATION_CAPACITY_SCHEMA,
    profileId: assertId(profileId, 'profileId'),
    backend: backend(backendName),
    bundleBinding: bundleBindingFor(bundle),
    obligations: [...obligations],
    supported: decisions.supported,
    approximated: decisions.approximated,
    unsupported: decisions.unsupported,
    blockers: decisions.blockers,
    exportable: decisions.blockers.length === 0,
    policy: {...CANONICAL_POLICY},
  };
  return deepFreeze({...payload, capacityDigest: digestJson(payload)});
}
export function validateRepresentationCapacityProfile(value) {
  const errors = [];
  try {
    const normalized = normalizePersistedProfile(value);
    if (digestJson(normalized) !== digestJson(value)) errors.push('representation capacity profile is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}
export function validateRepresentationCapacityBindings(value, {bundle, identityGraph, components = []} = {}) {
  const errors = [];
  const intrinsic = validateRepresentationCapacityProfile(value);
  if (!intrinsic.valid) errors.push(`representation capacity profile invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const bundleValidation = validatePhysicalAssetBundle(bundle);
      if (!bundleValidation.valid) throw new Error(`physical asset bundle is invalid: ${bundleValidation.errors.join('; ')}`);
      if (digestJson(bundleBindingFor(bundle)) !== digestJson(value.bundleBinding)) throw new Error('representation capacity bundle binding is stale');
      const expected = deriveRepresentationCapacityObligations({bundle, identityGraph, components});
      if (digestJson(expected) !== digestJson(value.obligations)) throw new Error('representation capacity obligation inventory is stale or incomplete for the current bundle');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}
export function representationCapacityDecision(profile, obligationId) {
  const validation = validateRepresentationCapacityProfile(profile);
  if (!validation.valid) throw new Error(`representation capacity profile is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(obligationId, 'obligationId');
  const supported = profile.supported.find((item) => item.obligationId === id);
  if (supported) return deepFreeze({status: 'SUPPORTED', ...supported});
  const approximated = profile.approximated.find((item) => item.obligationId === id);
  if (approximated) return deepFreeze({status: 'APPROXIMATED', ...approximated});
  const unsupported = profile.unsupported.find((item) => item.obligationId === id);
  if (unsupported) return deepFreeze({status: 'UNSUPPORTED', ...unsupported});
  return null;
}
export function assertRepresentationCapacityExportable(profile, {bundle, identityGraph, components = []} = {}) {
  const binding = validateRepresentationCapacityBindings(profile, {bundle, identityGraph, components});
  if (!binding.valid) throw new Error(`representation capacity profile is not live: ${binding.errors.join('; ')}`);
  if (!profile.exportable) throw new Error(`representation capacity profile is blocked: ${profile.blockers.map((item) => item.blockerId).join(', ')}`);
  return profile;
}

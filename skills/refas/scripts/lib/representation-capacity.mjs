import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {
  PHYSICAL_ASSET_BUNDLE_SCHEMA,
  physicalAssetBundleIdentityProjection,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
} from './physical-asset-bundle.mjs';

export const REPRESENTATION_CAPACITY_SCHEMA = 'refas.representation-capacity/v1';
export const REPRESENTATION_CAPACITY_BUNDLE_BINDING_SCHEMA = 'refas.representation-capacity-bundle-binding/v1';
export const REPRESENTATION_SOURCE_KINDS = Object.freeze(['IDENTITY', 'COMPONENT']);
export const REPRESENTATION_APPROXIMATION_STRATEGIES = Object.freeze(['BAKED', 'REDUCED', 'SURROGATE', 'BACKEND_EXTENSION', 'CUSTOM']);

const SOURCE_KIND_SET = new Set(REPRESENTATION_SOURCE_KINDS);
const APPROXIMATION_STRATEGY_SET = new Set(REPRESENTATION_APPROXIMATION_STRATEGIES);
const BACKEND_CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const SEMANTIC_PATH_RE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/u;

const TOP_LEVEL_KEYS = new Set([
  'schema', 'profileId', 'backend', 'bundleBinding', 'obligations',
  'supported', 'approximated', 'unsupported', 'blockers', 'exportable', 'policy', 'capacityDigest',
]);
const BUNDLE_BINDING_KEYS = new Set([
  'schema', 'bundleSchema', 'bundleDigest', 'rootClosureDigest', 'rootModuleId', 'identityProjectionDigest',
]);
const OBLIGATION_KEYS = new Set(['obligationId', 'source', 'semanticPath', 'subjectIds']);
const IDENTITY_SOURCE_KEYS = new Set(['kind', 'projectionDigest']);
const COMPONENT_SOURCE_KEYS = new Set(['kind', 'componentId', 'schema', 'digest']);
const SUPPORTED_KEYS = new Set(['obligationId']);
const APPROXIMATED_KEYS = new Set(['obligationId', 'strategy', 'reason', 'lossSemantics']);
const UNSUPPORTED_KEYS = new Set(['obligationId', 'reason']);
const BLOCKER_KEYS = new Set(['blockerId', 'obligationIds', 'reason']);
const POLICY_KEYS = new Set([
  'bundleIsCanonicalInput',
  'profileDoesNotOwnCanonicalTruth',
  'everyObligationClassifiedExactlyOnce',
  'approximationMustBeExplicit',
  'unsupportedSemanticsRemainExplicit',
  'blockerPreventsExport',
  'backendOrderingIsNotSemanticIdentity',
  'profileDoesNotAuthorizeClaims',
  'exporterImplementationRemainsDownstream',
]);
const CANONICAL_POLICY = Object.freeze({
  bundleIsCanonicalInput: true,
  profileDoesNotOwnCanonicalTruth: true,
  everyObligationClassifiedExactlyOnce: true,
  approximationMustBeExplicit: true,
  unsupportedSemanticsRemainExplicit: true,
  blockerPreventsExport: true,
  backendOrderingIsNotSemanticIdentity: true,
  profileDoesNotAuthorizeClaims: true,
  exporterImplementationRemainsDownstream: true,
});

const SEMANTIC_PATHS_BY_SCHEMA = new Map([
  ['IDENTITY', new Set(['identity.entity', 'composition.contains', 'composition.interface', 'frame.transform', 'compatibility.family'])],
  ['refas.rigid-body-dynamics/v1', new Set(['dynamics.mass', 'dynamics.center-of-mass', 'dynamics.inertia'])],
  ['refas.collision-model/v1', new Set(['collision.geometry', 'collision.filter', 'collision.self-policy'])],
  ['refas.articulation-graph/v1', new Set(['articulation.topology', 'articulation.joint-frame', 'articulation.reference-configuration', 'articulation.joint-limit'])],
  ['refas.mechanism-graph/v1', new Set(['mechanism.topology'])],
  ['refas.transmission-model/v1', new Set(['transmission.coordinate-map', 'transmission.velocity-map', 'transmission.effort-map', 'transmission.external-implementation'])],
  ['refas.actuation-model/v1', new Set(['actuation.kind', 'actuation.position-range', 'actuation.velocity-limit', 'actuation.effort-limit', 'actuation.passive-dynamics', 'actuation.control-modes'])],
  ['refas.control-profile/v1', new Set(['control.mode', 'control.command-space', 'control.gains', 'control.delay'])],
  ['refas.runtime-binding/v1', new Set(['runtime.endpoint', 'runtime.locator', 'runtime.index', 'runtime.calibration', 'runtime.transport-delay'])],
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

function nonemptyString(value, label, {maxLength = 2048} = {}) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  if (!value.length || value.trim() !== value || value.length > maxLength) throw new Error(`${label} must be a trimmed non-empty string up to ${maxLength} characters`);
  if (BACKEND_CONTROL_RE.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}

function normalizeBackend(value) {
  return nonemptyString(value, 'backend', {maxLength: 256});
}

function normalizeSemanticPath(value, label) {
  const path = nonemptyString(value, label, {maxLength: 160});
  if (!SEMANTIC_PATH_RE.test(path)) throw new Error(`${label} must be a canonical dotted semantic path`);
  return path;
}

function normalizeIdArray(value, label, {nonEmpty = true} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (nonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const ids = value.map((item, index) => assertId(item, `${label}[${index}]`)).sort();
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must contain unique IDs`);
  return ids;
}

function normalizeStringArray(value, label, {nonEmpty = true} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (nonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const entries = value.map((item, index) => nonemptyString(item, `${label}[${index}]`, {maxLength: 256})).sort();
  if (new Set(entries).size !== entries.length) throw new Error(`${label} must contain unique entries`);
  return entries;
}

function normalizeSource(raw, label) {
  assertRecord(raw, label);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!SOURCE_KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${REPRESENTATION_SOURCE_KINDS.join(', ')}`);
  if (kind === 'IDENTITY') {
    assertKnownKeys(raw, IDENTITY_SOURCE_KEYS, label);
    return {kind, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
  }
  assertKnownKeys(raw, COMPONENT_SOURCE_KEYS, label);
  return {
    kind,
    componentId: assertId(raw.componentId, `${label}.componentId`),
    schema: nonemptyString(raw.schema, `${label}.schema`, {maxLength: 160}),
    digest: assertDigest(raw.digest, `${label}.digest`),
  };
}

function normalizeObligation(raw, index) {
  const label = `obligations[${index}]`;
  assertKnownKeys(raw, OBLIGATION_KEYS, label);
  return {
    obligationId: assertId(raw.obligationId, `${label}.obligationId`),
    source: normalizeSource(raw.source, `${label}.source`),
    semanticPath: normalizeSemanticPath(raw.semanticPath, `${label}.semanticPath`),
    subjectIds: normalizeIdArray(raw.subjectIds, `${label}.subjectIds`),
  };
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
  return {
    obligationId: assertId(raw.obligationId, `${label}.obligationId`),
    strategy,
    reason: nonemptyString(raw.reason, `${label}.reason`),
    lossSemantics: normalizeStringArray(raw.lossSemantics, `${label}.lossSemantics`),
  };
}

function normalizeUnsupported(raw, index) {
  const label = `unsupported[${index}]`;
  assertKnownKeys(raw, UNSUPPORTED_KEYS, label);
  return {
    obligationId: assertId(raw.obligationId, `${label}.obligationId`),
    reason: nonemptyString(raw.reason, `${label}.reason`),
  };
}

function normalizeBlocker(raw, index) {
  const label = `blockers[${index}]`;
  assertKnownKeys(raw, BLOCKER_KEYS, label);
  return {
    blockerId: assertId(raw.blockerId, `${label}.blockerId`),
    obligationIds: normalizeIdArray(raw.obligationIds, `${label}.obligationIds`),
    reason: nonemptyString(raw.reason, `${label}.reason`),
  };
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

function componentSemanticIdentityIds(contract) {
  switch (contract.schema) {
    case 'refas.rigid-body-dynamics/v1':
    case 'refas.collision-model/v1':
      return (contract.links ?? []).map((item) => item.linkId);
    case 'refas.articulation-graph/v1':
      return [contract.rootLinkId, ...(contract.linkBindings ?? []).map((item) => item.linkId), ...(contract.joints ?? []).flatMap((item) => [item.virtualJointId, item.parentLinkId, item.childLinkId])];
    case 'refas.mechanism-graph/v1':
      return (contract.mechanisms ?? []).flatMap((item) => [item.mechanismId, ...(item.realizedJointIds ?? []), ...(item.members ?? []).map((member) => member.physicalIdentityId)]);
    case 'refas.transmission-model/v1':
      return (contract.transmissions ?? []).flatMap((item) => [item.transmissionId, ...(item.contextMechanismIds ?? []), ...(item.inputSpace?.coordinates ?? []).map((coordinate) => coordinate.semanticIdentityId), ...(item.outputSpace?.coordinates ?? []).map((coordinate) => coordinate.semanticIdentityId)]);
    case 'refas.actuation-model/v1':
      return (contract.actuators ?? []).flatMap((item) => [item.actuatorId, item.drivenTargetId]);
    case 'refas.control-profile/v1':
      return (contract.profiles ?? []).flatMap((item) => [item.selector?.controllerId, item.selector?.actuatorId]);
    case 'refas.runtime-binding/v1':
      return (contract.bindings ?? []).flatMap((item) => [item.selector?.runtimeEndpointId, item.selector?.targetId]);
    default:
      return [];
  }
}

function buildLiveInventory(bundle, identityGraph, components) {
  const bundleValidation = validatePhysicalAssetBundle(bundle);
  if (!bundleValidation.valid) throw new Error(`physical asset bundle is invalid: ${bundleValidation.errors.join('; ')}`);
  const bindingValidation = validatePhysicalAssetBundleBindings(bundle, {identityGraph, components});
  if (!bindingValidation.valid) throw new Error(`physical asset bundle bindings are stale: ${bindingValidation.errors.join('; ')}`);

  const identityProjection = physicalAssetBundleIdentityProjection(identityGraph, bundle.rootModuleId);
  const identitySubjectIds = new Set(identityProjection.entities.map((entity) => entity.id));
  const bundleRefById = new Map(bundle.componentRefs.map((ref) => [ref.componentId, ref]));
  const liveComponentById = new Map();
  for (const item of components ?? []) {
    if (!item || typeof item !== 'object') continue;
    const ref = bundleRefById.get(item.componentId);
    if (!ref) continue;
    liveComponentById.set(item.componentId, {ref, contract: item.contract});
  }
  return {identityProjection, identitySubjectIds, bundleRefById, liveComponentById};
}

function validateObligationSource(obligation, bundle, inventory) {
  if (obligation.source.kind === 'IDENTITY') {
    if (obligation.source.projectionDigest !== bundle.identityBinding.projectionDigest) {
      throw new Error(`obligation ${obligation.obligationId} identity projection digest is stale`);
    }
    const allowed = SEMANTIC_PATHS_BY_SCHEMA.get('IDENTITY');
    if (!allowed.has(obligation.semanticPath)) throw new Error(`obligation ${obligation.obligationId} semanticPath ${obligation.semanticPath} is not valid for IDENTITY source`);
    for (const subjectId of obligation.subjectIds) {
      if (!inventory.identitySubjectIds.has(subjectId)) throw new Error(`obligation ${obligation.obligationId} references identity subject outside the bound bundle projection: ${subjectId}`);
    }
    return;
  }

  const current = inventory.bundleRefById.get(obligation.source.componentId);
  if (!current) throw new Error(`obligation ${obligation.obligationId} references component not present in the bound bundle: ${obligation.source.componentId}`);
  if (current.schema !== obligation.source.schema || current.digest !== obligation.source.digest) {
    throw new Error(`obligation ${obligation.obligationId} component source is stale for ${obligation.source.componentId}`);
  }
  const live = inventory.liveComponentById.get(obligation.source.componentId);
  if (!live?.contract) throw new Error(`obligation ${obligation.obligationId} requires live component payload for ${obligation.source.componentId}`);
  const allowed = SEMANTIC_PATHS_BY_SCHEMA.get(current.schema);
  if (!allowed?.has(obligation.semanticPath)) throw new Error(`obligation ${obligation.obligationId} semanticPath ${obligation.semanticPath} is not valid for ${current.schema}`);
  const subjectIds = new Set(componentSemanticIdentityIds(live.contract).filter((id) => id != null));
  for (const subjectId of obligation.subjectIds) {
    if (!subjectIds.has(subjectId)) throw new Error(`obligation ${obligation.obligationId} subject ${subjectId} is not referenced by component ${obligation.source.componentId}`);
  }
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
  const obligationIds = new Set(obligations.map((item) => item.obligationId));
  const classificationCount = new Map(obligations.map((item) => [item.obligationId, 0]));
  const supportedIds = new Set(decisions.supported.map((item) => item.obligationId));
  for (const entry of [...decisions.supported, ...decisions.approximated, ...decisions.unsupported]) {
    if (!obligationIds.has(entry.obligationId)) throw new Error(`classification references unknown obligation: ${entry.obligationId}`);
    classificationCount.set(entry.obligationId, classificationCount.get(entry.obligationId) + 1);
  }
  for (const [obligationId, count] of classificationCount) {
    if (count !== 1) throw new Error(`obligation ${obligationId} must be classified exactly once; found ${count}`);
  }
  for (const blocker of decisions.blockers) {
    for (const obligationId of blocker.obligationIds) {
      if (!obligationIds.has(obligationId)) throw new Error(`blocker ${blocker.blockerId} references unknown obligation: ${obligationId}`);
      if (supportedIds.has(obligationId)) throw new Error(`blocker ${blocker.blockerId} may not block exactly supported obligation ${obligationId}`);
    }
  }
}

function normalizePersistedProfile(value) {
  assertKnownKeys(value, TOP_LEVEL_KEYS, 'representation capacity profile');
  if (value.schema !== REPRESENTATION_CAPACITY_SCHEMA) throw new Error(`schema must be ${REPRESENTATION_CAPACITY_SCHEMA}`);
  const profileId = assertId(value.profileId, 'profileId');
  const backend = normalizeBackend(value.backend);
  const bundleBinding = normalizeBundleBinding(value.bundleBinding);
  if (!Array.isArray(value.obligations) || !value.obligations.length) throw new Error('obligations must contain at least one projection obligation');
  const obligations = value.obligations.map(normalizeObligation).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  if (new Set(obligations.map((item) => item.obligationId)).size !== obligations.length) throw new Error('obligations contains duplicate obligationId values');
  const signatureSet = new Set();
  for (const obligation of obligations) {
    const signature = digestJson({source: obligation.source, semanticPath: obligation.semanticPath, subjectIds: obligation.subjectIds});
    if (signatureSet.has(signature)) throw new Error(`duplicate semantic obligation detected at ${obligation.obligationId}`);
    signatureSet.add(signature);
  }
  const decisions = normalizeDecisionSets(value);
  validateCoverage(obligations, decisions);
  const exportable = value.exportable;
  if (typeof exportable !== 'boolean') throw new Error('exportable must be boolean');
  if (exportable !== (decisions.blockers.length === 0)) throw new Error('exportable must equal blockers.length === 0');
  const policy = normalizePolicy(value.policy);
  const payload = {
    schema: value.schema,
    profileId,
    backend,
    bundleBinding,
    obligations,
    supported: decisions.supported,
    approximated: decisions.approximated,
    unsupported: decisions.unsupported,
    blockers: decisions.blockers,
    exportable,
    policy,
  };
  const capacityDigest = assertDigest(value.capacityDigest, 'capacityDigest');
  if (digestJson(payload) !== capacityDigest) throw new Error('capacityDigest does not reproduce');
  return {...payload, capacityDigest};
}

export function createRepresentationCapacityProfile({
  profileId,
  backend,
  bundle,
  identityGraph,
  components = [],
  obligations = [],
  supported = [],
  approximated = [],
  unsupported = [],
  blockers = [],
} = {}) {
  const bundleValidation = validatePhysicalAssetBundle(bundle);
  if (!bundleValidation.valid) throw new Error(`physical asset bundle is invalid: ${bundleValidation.errors.join('; ')}`);
  const inventory = buildLiveInventory(bundle, identityGraph, components);
  if (!Array.isArray(obligations) || !obligations.length) throw new Error('obligations must contain at least one projection obligation');
  const normalizedObligations = obligations.map(normalizeObligation).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  if (new Set(normalizedObligations.map((item) => item.obligationId)).size !== normalizedObligations.length) throw new Error('obligations contains duplicate obligationId values');
  for (const obligation of normalizedObligations) validateObligationSource(obligation, bundle, inventory);
  const decisions = normalizeDecisionSets({supported, approximated, unsupported, blockers});
  validateCoverage(normalizedObligations, decisions);
  const payload = {
    schema: REPRESENTATION_CAPACITY_SCHEMA,
    profileId: assertId(profileId, 'profileId'),
    backend: normalizeBackend(backend),
    bundleBinding: bundleBindingFor(bundle),
    obligations: normalizedObligations,
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
      const inventory = buildLiveInventory(bundle, identityGraph, components);
      for (const obligation of value.obligations) validateObligationSource(obligation, bundle, inventory);
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
  const supported = profile.supported.find((entry) => entry.obligationId === id);
  if (supported) return deepFreeze({status: 'SUPPORTED', ...supported});
  const approximated = profile.approximated.find((entry) => entry.obligationId === id);
  if (approximated) return deepFreeze({status: 'APPROXIMATED', ...approximated});
  const unsupported = profile.unsupported.find((entry) => entry.obligationId === id);
  if (unsupported) return deepFreeze({status: 'UNSUPPORTED', ...unsupported});
  return null;
}

export function assertRepresentationCapacityExportable(profile) {
  const validation = validateRepresentationCapacityProfile(profile);
  if (!validation.valid) throw new Error(`representation capacity profile is invalid: ${validation.errors.join('; ')}`);
  if (!profile.exportable) throw new Error(`representation capacity profile is blocked: ${profile.blockers.map((item) => item.blockerId).join(', ')}`);
  return profile;
}

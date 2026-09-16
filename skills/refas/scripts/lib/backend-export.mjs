import {Buffer} from 'node:buffer';

import {assertDigest, assertId, deepFreeze, digestBytes, digestJson, stableStringify} from './canonical.mjs';
import {
  physicalAssetBundleIdentityProjection,
  validatePhysicalAssetBundleBindings,
} from './physical-asset-bundle.mjs';
import {
  assertRepresentationCapacityExportable,
  representationCapacityDecision,
  validateRepresentationCapacityProfile,
} from './representation-capacity.mjs';

export const CANONICAL_EXPORT_VIEW_SCHEMA = 'refas.canonical-export-view/v1';
export const BACKEND_EXPORT_SCHEMA = 'refas.backend-export/v1';
export const BACKEND_EXPORT_DISPOSITIONS = Object.freeze(['EMITTED_EXACT', 'EMITTED_APPROXIMATION', 'OMITTED_UNSUPPORTED']);

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
const VIEW_KEYS = new Set(['schema', 'bundleBinding', 'identityProjection', 'components', 'canonicalViewDigest']);
const VIEW_BINDING_KEYS = new Set(['bundleId', 'scopeId', 'sourceSha256', 'bundleDigest', 'rootClosureDigest', 'rootModuleId', 'identityProjectionDigest']);
const VIEW_COMPONENT_KEYS = new Set(['componentId', 'ownerModuleId', 'schema', 'digest', 'contract']);
const MANIFEST_KEYS = new Set(['schema', 'exportId', 'adapter', 'canonicalBinding', 'capacityBinding', 'artifacts', 'dispositions', 'policy', 'exportDigest']);
const ADAPTER_KEYS = new Set(['id', 'backend', 'version']);
const CANONICAL_BINDING_KEYS = new Set(['canonicalViewDigest', 'bundleDigest', 'rootClosureDigest', 'rootModuleId', 'identityProjectionDigest']);
const CAPACITY_BINDING_KEYS = new Set(['profileId', 'backend', 'capacityDigest']);
const ARTIFACT_KEYS = new Set(['artifactId', 'path', 'mediaType', 'sha256', 'sizeBytes']);
const TARGET_KEYS = new Set(['artifactId', 'locator']);
const APPROXIMATION_KEYS = new Set(['strategy', 'reason', 'retainedSemantics', 'lossSemantics']);
const POLICY_KEYS = new Set([
  'canonicalInputOnly',
  'backendArtifactsNeverCanonical',
  'backendToBackendCanonicalChainsForbidden',
  'artifactDigestsComputedByRefAs',
  'everyCapacityObligationHasDisposition',
  'unsupportedSemanticsRemainExplicitOmissions',
  'backendLocatorsAreNotSemanticIdentity',
  'normalizationRemainsDownstream',
  'crossRepresentationValidationRemainsDownstream',
  'declaredDivergenceRemainsDownstream',
  'physicalClaimsRemainDownstream',
]);
const CANONICAL_POLICY = Object.freeze({
  canonicalInputOnly: true,
  backendArtifactsNeverCanonical: true,
  backendToBackendCanonicalChainsForbidden: true,
  artifactDigestsComputedByRefAs: true,
  everyCapacityObligationHasDisposition: true,
  unsupportedSemanticsRemainExplicitOmissions: true,
  backendLocatorsAreNotSemanticIdentity: true,
  normalizationRemainsDownstream: true,
  crossRepresentationValidationRemainsDownstream: true,
  declaredDivergenceRemainsDownstream: true,
  physicalClaimsRemainDownstream: true,
});
const DISPOSITION_KEYS = new Set(['obligationId', 'status', 'targets', 'approximation', 'reason']);
const RAW_ADAPTER_KEYS = new Set(['id', 'backend', 'version', 'project']);
const RAW_RESULT_KEYS = new Set(['artifacts', 'bindings']);
const RAW_ARTIFACT_KEYS = new Set(['path', 'mediaType', 'content']);
const RAW_BINDING_KEYS = new Set(['obligationId', 'targets']);
const RAW_TARGET_KEYS = new Set(['path', 'locator']);
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;

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
function backend(value, label = 'backend') { return text(value, label, {maxLength: 256}); }
function stringArray(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  const normalized = value.map((item, index) => text(item, `${label}[${index}]`, {maxLength: 256})).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must contain unique entries`);
  return normalized;
}
function relativeArtifactPath(value, label = 'path') {
  const normalized = text(value, label, {maxLength: 1024});
  if (normalized.includes('\\')) throw new Error(`${label} must use forward slashes`);
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) throw new Error(`${label} must be relative`);
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment.length || segment === '.' || segment === '..')) throw new Error(`${label} contains an unsafe path segment`);
  return normalized;
}
function cloneJson(value, label) {
  try {
    return structuredClone(value);
  } catch {
    throw new Error(`${label} must be structured-cloneable canonical data`);
  }
}
function componentDigest(contract, schema, label) {
  assertRecord(contract, label);
  if (contract.schema !== schema) throw new Error(`${label}.schema does not match component schema ${schema}`);
  const field = COMPONENT_DIGEST_FIELD.get(schema);
  if (!field) throw new Error(`${label}.schema is not a P10 physical component schema: ${schema}`);
  const digest = assertDigest(contract[field], `${label}.${field}`);
  const payload = {...contract};
  delete payload[field];
  if (digestJson(payload) !== digest) throw new Error(`${label}.${field} does not reproduce`);
  return digest;
}

function canonicalViewBundleBinding(bundle) {
  return {
    bundleId: assertId(bundle.bundleId, 'bundle.bundleId'),
    scopeId: assertId(bundle.scopeId, 'bundle.scopeId'),
    sourceSha256: assertDigest(bundle.sourceSha256, 'bundle.sourceSha256'),
    bundleDigest: assertDigest(bundle.bundleDigest, 'bundle.bundleDigest'),
    rootClosureDigest: assertDigest(bundle.rootClosureDigest, 'bundle.rootClosureDigest'),
    rootModuleId: assertId(bundle.rootModuleId, 'bundle.rootModuleId'),
    identityProjectionDigest: assertDigest(bundle.identityBinding?.projectionDigest, 'bundle.identityBinding.projectionDigest'),
  };
}

export function createCanonicalExportView({bundle, identityGraph, components = []} = {}) {
  const validation = validatePhysicalAssetBundleBindings(bundle, {identityGraph, components});
  if (!validation.valid) throw new Error(`physical asset bundle bindings are stale: ${validation.errors.join('; ')}`);
  const byId = new Map((components ?? []).map((item) => [item?.componentId, item]));
  const componentViews = bundle.componentRefs.map((ref, index) => {
    const live = byId.get(ref.componentId);
    if (!live?.contract) throw new Error(`components are missing live payload for ${ref.componentId}`);
    const digest = componentDigest(live.contract, ref.schema, `components[${index}].contract`);
    if (digest !== ref.digest) throw new Error(`component ${ref.componentId} digest is stale relative to P10`);
    return {
      componentId: ref.componentId,
      ownerModuleId: ref.ownerModuleId,
      schema: ref.schema,
      digest: ref.digest,
      contract: cloneJson(live.contract, `components[${index}].contract`),
    };
  }).sort((left, right) => left.componentId.localeCompare(right.componentId));
  const identityProjection = cloneJson(physicalAssetBundleIdentityProjection(identityGraph, bundle.rootModuleId), 'identityProjection');
  const payload = {
    schema: CANONICAL_EXPORT_VIEW_SCHEMA,
    bundleBinding: canonicalViewBundleBinding(bundle),
    identityProjection,
    components: componentViews,
  };
  return deepFreeze({...payload, canonicalViewDigest: digestJson(payload)});
}

function normalizeViewBinding(raw) {
  assertKnownKeys(raw, VIEW_BINDING_KEYS, 'bundleBinding');
  return {
    bundleId: assertId(raw.bundleId, 'bundleBinding.bundleId'),
    scopeId: assertId(raw.scopeId, 'bundleBinding.scopeId'),
    sourceSha256: assertDigest(raw.sourceSha256, 'bundleBinding.sourceSha256'),
    bundleDigest: assertDigest(raw.bundleDigest, 'bundleBinding.bundleDigest'),
    rootClosureDigest: assertDigest(raw.rootClosureDigest, 'bundleBinding.rootClosureDigest'),
    rootModuleId: assertId(raw.rootModuleId, 'bundleBinding.rootModuleId'),
    identityProjectionDigest: assertDigest(raw.identityProjectionDigest, 'bundleBinding.identityProjectionDigest'),
  };
}
function normalizeViewComponent(raw, index) {
  const label = `components[${index}]`;
  assertKnownKeys(raw, VIEW_COMPONENT_KEYS, label);
  const schema = text(raw.schema, `${label}.schema`, {maxLength: 160});
  const contract = cloneJson(assertRecord(raw.contract, `${label}.contract`), `${label}.contract`);
  const digest = componentDigest(contract, schema, `${label}.contract`);
  const declaredDigest = assertDigest(raw.digest, `${label}.digest`);
  if (digest !== declaredDigest) throw new Error(`${label}.digest does not match the canonical component payload`);
  return {
    componentId: assertId(raw.componentId, `${label}.componentId`),
    ownerModuleId: assertId(raw.ownerModuleId, `${label}.ownerModuleId`),
    schema,
    digest: declaredDigest,
    contract,
  };
}
function normalizeCanonicalExportView(value) {
  assertKnownKeys(value, VIEW_KEYS, 'canonical export view');
  if (value.schema !== CANONICAL_EXPORT_VIEW_SCHEMA) throw new Error(`schema must be ${CANONICAL_EXPORT_VIEW_SCHEMA}`);
  const bundleBinding = normalizeViewBinding(value.bundleBinding);
  const identityProjection = cloneJson(assertRecord(value.identityProjection, 'identityProjection'), 'identityProjection');
  if (digestJson(identityProjection) !== bundleBinding.identityProjectionDigest) throw new Error('identityProjection does not reproduce bundleBinding.identityProjectionDigest');
  if (identityProjection.scopeId !== bundleBinding.scopeId || identityProjection.sourceSha256 !== bundleBinding.sourceSha256 || identityProjection.rootModuleId !== bundleBinding.rootModuleId) {
    throw new Error('identityProjection scope/source/root does not match bundleBinding');
  }
  if (!Array.isArray(value.components)) throw new Error('components must be an array');
  const components = value.components.map(normalizeViewComponent).sort((left, right) => left.componentId.localeCompare(right.componentId));
  if (new Set(components.map((item) => item.componentId)).size !== components.length) throw new Error('components contains duplicate componentId values');
  const payload = {schema: value.schema, bundleBinding, identityProjection, components};
  const canonicalViewDigest = assertDigest(value.canonicalViewDigest, 'canonicalViewDigest');
  if (digestJson(payload) !== canonicalViewDigest) throw new Error('canonicalViewDigest does not reproduce');
  return {...payload, canonicalViewDigest};
}
export function validateCanonicalExportView(value) {
  const errors = [];
  try {
    const normalized = normalizeCanonicalExportView(value);
    if (digestJson(normalized) !== digestJson(value)) errors.push('canonical export view is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}
export function validateCanonicalExportViewBindings(value, context = {}) {
  const errors = [];
  const intrinsic = validateCanonicalExportView(value);
  if (!intrinsic.valid) errors.push(`canonical export view invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const recreated = createCanonicalExportView(context);
      if (recreated.canonicalViewDigest !== value.canonicalViewDigest || digestJson(recreated) !== digestJson(value)) {
        throw new Error('canonical export view is stale relative to current P10 construction inputs');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function normalizeAdapter(raw) {
  assertKnownKeys(raw, RAW_ADAPTER_KEYS, 'adapter');
  if (typeof raw.project !== 'function') throw new Error('adapter.project must be a function');
  return {
    id: assertId(raw.id, 'adapter.id'),
    backend: backend(raw.backend, 'adapter.backend'),
    version: text(raw.version, 'adapter.version', {maxLength: 128}),
    project: raw.project,
  };
}
function bytesFromContent(content, label) {
  if (typeof content === 'string') return Buffer.from(content, 'utf8');
  if (content instanceof Uint8Array) return Buffer.from(content);
  throw new Error(`${label} must be a UTF-8 string or Uint8Array`);
}
function normalizeRawArtifacts(rawArtifacts) {
  if (!Array.isArray(rawArtifacts)) throw new Error('adapter result artifacts must be an array');
  const outputs = rawArtifacts.map((raw, index) => {
    const label = `adapter result artifacts[${index}]`;
    assertKnownKeys(raw, RAW_ARTIFACT_KEYS, label);
    const path = relativeArtifactPath(raw.path, `${label}.path`);
    const mediaType = text(raw.mediaType, `${label}.mediaType`, {maxLength: 256});
    const content = bytesFromContent(raw.content, `${label}.content`);
    const sha256 = digestBytes(content);
    const sizeBytes = content.byteLength;
    const artifactId = assertId(`artifact:${digestJson({path, mediaType, sha256, sizeBytes}).slice(0, 48)}`, `${label}.artifactId`);
    return {artifactId, path, mediaType, sha256, sizeBytes, content};
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(outputs.map((item) => item.path)).size !== outputs.length) throw new Error('adapter result artifacts contain duplicate paths');
  if (new Set(outputs.map((item) => item.artifactId)).size !== outputs.length) throw new Error('adapter result artifacts contain duplicate artifact identities');
  return outputs;
}
function normalizeRawBindings(rawBindings) {
  if (!Array.isArray(rawBindings)) throw new Error('adapter result bindings must be an array');
  const bindings = rawBindings.map((raw, index) => {
    const label = `adapter result bindings[${index}]`;
    assertKnownKeys(raw, RAW_BINDING_KEYS, label);
    if (!Array.isArray(raw.targets) || !raw.targets.length) throw new Error(`${label}.targets must be a non-empty array`);
    const targets = raw.targets.map((target, targetIndex) => {
      const targetLabel = `${label}.targets[${targetIndex}]`;
      assertKnownKeys(target, RAW_TARGET_KEYS, targetLabel);
      return {
        path: relativeArtifactPath(target.path, `${targetLabel}.path`),
        locator: text(target.locator, `${targetLabel}.locator`, {maxLength: 1024}),
      };
    }).sort((left, right) => left.path.localeCompare(right.path) || left.locator.localeCompare(right.locator));
    const targetKeys = targets.map((target) => `${target.path}\u0000${target.locator}`);
    if (new Set(targetKeys).size !== targetKeys.length) throw new Error(`${label}.targets contains duplicates`);
    return {obligationId: assertId(raw.obligationId, `${label}.obligationId`), targets};
  }).sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  if (new Set(bindings.map((item) => item.obligationId)).size !== bindings.length) throw new Error('adapter result bindings contain duplicate obligationId values');
  return bindings;
}
function artifactDescriptors(outputs) {
  return outputs.map(({content, ...descriptor}) => descriptor);
}
function manifestAdapter(adapterRecord) {
  return {id: adapterRecord.id, backend: adapterRecord.backend, version: adapterRecord.version};
}
function canonicalBinding(view) {
  return {
    canonicalViewDigest: view.canonicalViewDigest,
    bundleDigest: view.bundleBinding.bundleDigest,
    rootClosureDigest: view.bundleBinding.rootClosureDigest,
    rootModuleId: view.bundleBinding.rootModuleId,
    identityProjectionDigest: view.bundleBinding.identityProjectionDigest,
  };
}
function capacityBinding(profile) {
  return {profileId: profile.profileId, backend: profile.backend, capacityDigest: profile.capacityDigest};
}
function approximationFromDecision(decision) {
  return {
    strategy: decision.strategy,
    reason: decision.reason,
    retainedSemantics: [...decision.retainedSemantics],
    lossSemantics: [...decision.lossSemantics],
  };
}
function buildDispositions(profile, rawBindings, outputs) {
  const artifactByPath = new Map(outputs.map((item) => [item.path, item]));
  const obligationIds = new Set(profile.obligations.map((item) => item.obligationId));
  for (const binding of rawBindings) if (!obligationIds.has(binding.obligationId)) throw new Error(`adapter binding references unknown P11 obligation ${binding.obligationId}`);
  const bindingById = new Map(rawBindings.map((item) => [item.obligationId, item]));
  const dispositions = [];
  for (const obligation of profile.obligations) {
    const decision = representationCapacityDecision(profile, obligation.obligationId);
    const binding = bindingById.get(obligation.obligationId) ?? null;
    if (decision.status === 'UNSUPPORTED') {
      if (binding) throw new Error(`adapter may not emit unsupported P11 obligation ${obligation.obligationId}`);
      dispositions.push({obligationId: obligation.obligationId, status: 'OMITTED_UNSUPPORTED', targets: [], reason: decision.reason});
      continue;
    }
    if (!binding) throw new Error(`adapter did not emit required ${decision.status} P11 obligation ${obligation.obligationId}`);
    const targets = binding.targets.map((target) => {
      const artifact = artifactByPath.get(target.path);
      if (!artifact) throw new Error(`adapter binding for ${obligation.obligationId} references unknown artifact path ${target.path}`);
      return {artifactId: artifact.artifactId, locator: target.locator};
    }).sort((left, right) => left.artifactId.localeCompare(right.artifactId) || left.locator.localeCompare(right.locator));
    if (decision.status === 'SUPPORTED') dispositions.push({obligationId: obligation.obligationId, status: 'EMITTED_EXACT', targets});
    else dispositions.push({obligationId: obligation.obligationId, status: 'EMITTED_APPROXIMATION', targets, approximation: approximationFromDecision(decision)});
  }
  return dispositions.sort((left, right) => left.obligationId.localeCompare(right.obligationId));
}

function normalizePersistedAdapter(raw) {
  assertKnownKeys(raw, ADAPTER_KEYS, 'adapter');
  return {id: assertId(raw.id, 'adapter.id'), backend: backend(raw.backend, 'adapter.backend'), version: text(raw.version, 'adapter.version', {maxLength: 128})};
}
function normalizeCanonicalBinding(raw) {
  assertKnownKeys(raw, CANONICAL_BINDING_KEYS, 'canonicalBinding');
  return {
    canonicalViewDigest: assertDigest(raw.canonicalViewDigest, 'canonicalBinding.canonicalViewDigest'),
    bundleDigest: assertDigest(raw.bundleDigest, 'canonicalBinding.bundleDigest'),
    rootClosureDigest: assertDigest(raw.rootClosureDigest, 'canonicalBinding.rootClosureDigest'),
    rootModuleId: assertId(raw.rootModuleId, 'canonicalBinding.rootModuleId'),
    identityProjectionDigest: assertDigest(raw.identityProjectionDigest, 'canonicalBinding.identityProjectionDigest'),
  };
}
function normalizeCapacityBinding(raw) {
  assertKnownKeys(raw, CAPACITY_BINDING_KEYS, 'capacityBinding');
  return {
    profileId: assertId(raw.profileId, 'capacityBinding.profileId'),
    backend: backend(raw.backend, 'capacityBinding.backend'),
    capacityDigest: assertDigest(raw.capacityDigest, 'capacityBinding.capacityDigest'),
  };
}
function normalizeArtifactDescriptor(raw, index) {
  const label = `artifacts[${index}]`;
  assertKnownKeys(raw, ARTIFACT_KEYS, label);
  const sizeBytes = raw.sizeBytes;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error(`${label}.sizeBytes must be a non-negative safe integer`);
  return {
    artifactId: assertId(raw.artifactId, `${label}.artifactId`),
    path: relativeArtifactPath(raw.path, `${label}.path`),
    mediaType: text(raw.mediaType, `${label}.mediaType`, {maxLength: 256}),
    sha256: assertDigest(raw.sha256, `${label}.sha256`),
    sizeBytes,
  };
}
function normalizeTargets(raw, label) {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  const targets = raw.map((target, index) => {
    const targetLabel = `${label}[${index}]`;
    assertKnownKeys(target, TARGET_KEYS, targetLabel);
    return {artifactId: assertId(target.artifactId, `${targetLabel}.artifactId`), locator: text(target.locator, `${targetLabel}.locator`, {maxLength: 1024})};
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId) || left.locator.localeCompare(right.locator));
  const keys = targets.map((target) => `${target.artifactId}\u0000${target.locator}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate targets`);
  return targets;
}
function normalizeApproximation(raw, label) {
  assertKnownKeys(raw, APPROXIMATION_KEYS, label);
  const retainedSemantics = stringArray(raw.retainedSemantics, `${label}.retainedSemantics`);
  const lossSemantics = stringArray(raw.lossSemantics, `${label}.lossSemantics`);
  const retained = new Set(retainedSemantics);
  for (const item of lossSemantics) if (retained.has(item)) throw new Error(`${label} may not list the same semantic as retained and lost: ${item}`);
  return {
    strategy: text(raw.strategy, `${label}.strategy`, {maxLength: 128}),
    reason: text(raw.reason, `${label}.reason`),
    retainedSemantics,
    lossSemantics,
  };
}
function normalizeDisposition(raw, index) {
  const label = `dispositions[${index}]`;
  assertKnownKeys(raw, DISPOSITION_KEYS, label);
  const obligationId = assertId(raw.obligationId, `${label}.obligationId`);
  const status = text(raw.status, `${label}.status`, {maxLength: 64});
  if (!BACKEND_EXPORT_DISPOSITIONS.includes(status)) throw new Error(`${label}.status is not a P12 export disposition`);
  const targets = normalizeTargets(raw.targets, `${label}.targets`);
  if (status === 'EMITTED_EXACT') {
    if (!targets.length) throw new Error(`${label}.targets must not be empty for EMITTED_EXACT`);
    if (raw.approximation != null || raw.reason != null) throw new Error(`${label} exact emission may not carry approximation or omission reason`);
    return {obligationId, status, targets};
  }
  if (status === 'EMITTED_APPROXIMATION') {
    if (!targets.length) throw new Error(`${label}.targets must not be empty for EMITTED_APPROXIMATION`);
    if (raw.reason != null) throw new Error(`${label} approximation emission uses approximation.reason, not top-level reason`);
    return {obligationId, status, targets, approximation: normalizeApproximation(raw.approximation, `${label}.approximation`)};
  }
  if (targets.length) throw new Error(`${label}.targets must be empty for OMITTED_UNSUPPORTED`);
  if (raw.approximation != null) throw new Error(`${label} unsupported omission may not carry approximation`);
  return {obligationId, status, targets, reason: text(raw.reason, `${label}.reason`)};
}
function normalizePolicy(raw) {
  assertKnownKeys(raw, POLICY_KEYS, 'policy');
  if (digestJson(raw) !== digestJson(CANONICAL_POLICY)) throw new Error('policy must equal the canonical P12 backend-export policy');
  return {...CANONICAL_POLICY};
}
function normalizeBackendExportManifest(value) {
  assertKnownKeys(value, MANIFEST_KEYS, 'backend export manifest');
  if (value.schema !== BACKEND_EXPORT_SCHEMA) throw new Error(`schema must be ${BACKEND_EXPORT_SCHEMA}`);
  const exportId = assertId(value.exportId, 'exportId');
  const adapter = normalizePersistedAdapter(value.adapter);
  const canonical = normalizeCanonicalBinding(value.canonicalBinding);
  const capacity = normalizeCapacityBinding(value.capacityBinding);
  if (adapter.backend !== capacity.backend) throw new Error('adapter.backend must match capacityBinding.backend');
  if (!Array.isArray(value.artifacts)) throw new Error('artifacts must be an array');
  const artifacts = value.artifacts.map(normalizeArtifactDescriptor).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(artifacts.map((item) => item.path)).size !== artifacts.length) throw new Error('artifacts contains duplicate paths');
  if (new Set(artifacts.map((item) => item.artifactId)).size !== artifacts.length) throw new Error('artifacts contains duplicate artifactId values');
  if (!Array.isArray(value.dispositions) || !value.dispositions.length) throw new Error('dispositions must contain at least one P11 obligation disposition');
  const dispositions = value.dispositions.map(normalizeDisposition).sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  if (new Set(dispositions.map((item) => item.obligationId)).size !== dispositions.length) throw new Error('dispositions contains duplicate obligationId values');
  const artifactIds = new Set(artifacts.map((item) => item.artifactId));
  for (const disposition of dispositions) for (const target of disposition.targets) if (!artifactIds.has(target.artifactId)) throw new Error(`disposition ${disposition.obligationId} references unknown artifact ${target.artifactId}`);
  const policy = normalizePolicy(value.policy);
  const payload = {schema: value.schema, exportId, adapter, canonicalBinding: canonical, capacityBinding: capacity, artifacts, dispositions, policy};
  const exportDigest = assertDigest(value.exportDigest, 'exportDigest');
  if (digestJson(payload) !== exportDigest) throw new Error('exportDigest does not reproduce');
  return {...payload, exportDigest};
}
export function validateBackendExportManifest(value) {
  const errors = [];
  try {
    const normalized = normalizeBackendExportManifest(value);
    if (digestJson(normalized) !== digestJson(value)) errors.push('backend export manifest is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function sameJson(left, right) { return digestJson(left) === digestJson(right); }
export function validateBackendExportBindings(manifest, {capacityProfile, bundle, identityGraph, components = []} = {}) {
  const errors = [];
  const intrinsic = validateBackendExportManifest(manifest);
  if (!intrinsic.valid) errors.push(`backend export manifest invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      assertRepresentationCapacityExportable(capacityProfile, {bundle, identityGraph, components});
      const view = createCanonicalExportView({bundle, identityGraph, components});
      if (!sameJson(manifest.canonicalBinding, canonicalBinding(view))) throw new Error('backend export canonical binding is stale');
      if (!sameJson(manifest.capacityBinding, capacityBinding(capacityProfile))) throw new Error('backend export capacity binding is stale');
      if (manifest.adapter.backend !== capacityProfile.backend) throw new Error('backend export adapter backend does not match current P11 profile backend');
      const dispositionById = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
      if (dispositionById.size !== capacityProfile.obligations.length) throw new Error('backend export disposition inventory is incomplete for current P11 profile');
      for (const obligation of capacityProfile.obligations) {
        const disposition = dispositionById.get(obligation.obligationId);
        if (!disposition) throw new Error(`backend export is missing disposition for ${obligation.obligationId}`);
        const decision = representationCapacityDecision(capacityProfile, obligation.obligationId);
        if (decision.status === 'SUPPORTED' && disposition.status !== 'EMITTED_EXACT') throw new Error(`supported obligation ${obligation.obligationId} must be EMITTED_EXACT`);
        if (decision.status === 'APPROXIMATED') {
          if (disposition.status !== 'EMITTED_APPROXIMATION') throw new Error(`approximated obligation ${obligation.obligationId} must be EMITTED_APPROXIMATION`);
          if (!sameJson(disposition.approximation, approximationFromDecision(decision))) throw new Error(`approximation metadata drift for ${obligation.obligationId}`);
        }
        if (decision.status === 'UNSUPPORTED') {
          if (disposition.status !== 'OMITTED_UNSUPPORTED') throw new Error(`unsupported obligation ${obligation.obligationId} must be OMITTED_UNSUPPORTED`);
          if (disposition.reason !== decision.reason) throw new Error(`unsupported omission reason drift for ${obligation.obligationId}`);
        }
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}
export function validateBackendExportArtifacts(manifest, files) {
  const errors = [];
  const intrinsic = validateBackendExportManifest(manifest);
  if (!intrinsic.valid) errors.push(`backend export manifest invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const outputs = normalizeRawArtifacts(files);
      const descriptors = artifactDescriptors(outputs);
      if (!sameJson(descriptors, manifest.artifacts)) throw new Error('backend artifact bytes/metadata do not reproduce the manifest artifact set');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}
export function validateBackendExportResult(result, context = {}) {
  const errors = [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {valid: false, errors: ['backend export result must be an object']};
  const bindings = validateBackendExportBindings(result.manifest, context);
  if (!bindings.valid) errors.push(...bindings.errors);
  const artifacts = validateBackendExportArtifacts(result.manifest, result.files);
  if (!artifacts.valid) errors.push(...artifacts.errors);
  return {valid: errors.length === 0, errors};
}

export async function runExportAdapter({exportId, adapter, capacityProfile, bundle, identityGraph, components = []} = {}) {
  const normalizedAdapter = normalizeAdapter(adapter);
  const profileValidation = validateRepresentationCapacityProfile(capacityProfile);
  if (!profileValidation.valid) throw new Error(`representation capacity profile is invalid: ${profileValidation.errors.join('; ')}`);
  if (normalizedAdapter.backend !== capacityProfile.backend) throw new Error(`adapter backend ${normalizedAdapter.backend} does not match P11 backend ${capacityProfile.backend}`);
  assertRepresentationCapacityExportable(capacityProfile, {bundle, identityGraph, components});
  const canonicalView = createCanonicalExportView({bundle, identityGraph, components});
  const input = deepFreeze({canonicalView, capacityProfile: deepFreeze(cloneJson(capacityProfile, 'capacityProfile'))});
  const rawResult = await normalizedAdapter.project(input);
  assertKnownKeys(rawResult, RAW_RESULT_KEYS, 'adapter result');
  const outputs = normalizeRawArtifacts(rawResult.artifacts);
  const bindings = normalizeRawBindings(rawResult.bindings);
  const artifacts = artifactDescriptors(outputs);
  const dispositions = buildDispositions(capacityProfile, bindings, outputs);
  const payload = {
    schema: BACKEND_EXPORT_SCHEMA,
    exportId: assertId(exportId, 'exportId'),
    adapter: manifestAdapter(normalizedAdapter),
    canonicalBinding: canonicalBinding(canonicalView),
    capacityBinding: capacityBinding(capacityProfile),
    artifacts,
    dispositions,
    policy: {...CANONICAL_POLICY},
  };
  const manifest = deepFreeze({...payload, exportDigest: digestJson(payload)});
  return {manifest, files: outputs.map((item) => ({path: item.path, mediaType: item.mediaType, content: Buffer.from(item.content)}))};
}

export function createSemanticJsonExportAdapter() {
  return Object.freeze({
    id: 'refas-semantic-json-adapter',
    backend: 'refas-semantic-json',
    version: '1',
    project({canonicalView, capacityProfile}) {
      if (capacityProfile.approximated.length || capacityProfile.unsupported.length) {
        throw new Error('refas-semantic-json adapter requires every P11 obligation to be exactly supported');
      }
      const path = 'semantic/physical-asset.json';
      const document = {
        schema: 'refas.semantic-json-backend/v1',
        canonicalViewDigest: canonicalView.canonicalViewDigest,
        bundleBinding: canonicalView.bundleBinding,
        identityProjection: canonicalView.identityProjection,
        components: canonicalView.components,
      };
      return {
        artifacts: [{path, mediaType: 'application/json', content: `${stableStringify(document)}\n`}],
        bindings: capacityProfile.obligations.map((obligation) => ({
          obligationId: obligation.obligationId,
          targets: [{path, locator: `obligation:${obligation.obligationId}`}],
        })),
      };
    },
  });
}

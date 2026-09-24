import {deepFreeze, digestJson, assertDigest, assertId} from './canonical.mjs';
import * as core from './backend-export-core.mjs';
import {validateRigidBodyDynamicsBindings} from './rigid-body-dynamics.mjs';
import {
  COLLISION_VISUAL_GEOMETRY_MANIFEST_SCHEMA,
  validateCollisionModelBindings,
  validateCollisionVisualGeometryManifest,
  validateCollisionVisualReuseBindings,
} from './collision-model.mjs';
import {validateArticulationGraphBindings} from './articulation-graph.mjs';
import {validateMechanismGraphBindings} from './mechanism-graph.mjs';
import {
  TRANSMISSION_IMPLEMENTATION_MANIFEST_SCHEMA,
  validateTransmissionImplementationBindings,
  validateTransmissionImplementationManifest,
  validateTransmissionModelBindings,
} from './transmission-model.mjs';
import {validateActuationModelBindings} from './actuation-model.mjs';
import {validateControlProfileBindings} from './control-profile.mjs';
import {validateRuntimeBindingBindings} from './runtime-binding.mjs';

export * from './backend-export-core.mjs';

const EXTRA_DEPENDENCY_KINDS = Object.freeze({
  COLLISION_VISUAL_GEOMETRY_MANIFEST: Object.freeze({
    schema: COLLISION_VISUAL_GEOMETRY_MANIFEST_SCHEMA,
    digestField: 'manifestDigest',
  }),
  TRANSMISSION_IMPLEMENTATION_MANIFEST: Object.freeze({
    schema: TRANSMISSION_IMPLEMENTATION_MANIFEST_SCHEMA,
    digestField: 'manifestDigest',
  }),
});
const EXTRA_DEPENDENCY_KIND_SET = new Set(Object.keys(EXTRA_DEPENDENCY_KINDS));
const P10_DIGEST_FIELD = new Map([
  ['refas.rigid-body-dynamics/v1', 'dynamicsDigest'],
  ['refas.collision-model/v1', 'collisionDigest'],
  ['refas.articulation-graph/v1', 'articulationDigest'],
  ['refas.mechanism-graph/v1', 'mechanismDigest'],
  ['refas.transmission-model/v1', 'transmissionDigest'],
  ['refas.actuation-model/v1', 'actuationDigest'],
  ['refas.control-profile/v1', 'controlProfileDigest'],
  ['refas.runtime-binding/v1', 'runtimeBindingDigest'],
]);
const DEPENDENCY_KEYS = new Set(['dependencyId', 'kind', 'schema', 'digest', 'contract']);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}
function cloneJson(value, label) {
  try {
    return structuredClone(value);
  } catch {
    throw new Error(`${label} must be structured-cloneable canonical data`);
  }
}
function assertValid(validation, label) {
  if (!validation?.valid) throw new Error(`${label}: ${(validation?.errors ?? ['unknown validation failure']).join('; ')}`);
}
function componentContext(live) {
  const context = live?.validationContext ?? {};
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error(`component ${live?.componentId ?? 'unknown'} validationContext must be an object`);
  return context;
}
function assertBundledP10Context(context, components, componentId) {
  for (const [name, candidate] of Object.entries(context)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const digestField = P10_DIGEST_FIELD.get(candidate.schema);
    if (!digestField) continue;
    const digest = assertDigest(candidate[digestField], `${componentId}.validationContext.${name}.${digestField}`);
    const found = components.some((item) => item?.contract?.schema === candidate.schema && item.contract?.[digestField] === digest);
    if (!found) throw new Error(`component ${componentId} validationContext.${name} must reference an exact P10-bundled ${candidate.schema} contract`);
  }
}
function requiresVisualReuse(contract) {
  return (contract?.links ?? []).some((link) => (link.colliders ?? []).some((collider) => collider?.geometry?.kind === 'MESH' && collider.geometry.reuseMode === 'DECLARED_VISUAL_REUSE'));
}
function requiresRuntimeJointContext(contract) {
  return (contract?.bindings ?? []).some((binding) => binding?.selector?.targetKind === 'virtual-joint');
}
function requireValue(value, label) {
  if (value == null) throw new Error(`${label} is required for current upstream validation`);
  return value;
}

function validateLiveComponent(live, identityGraph, components) {
  const contract = assertRecord(live?.contract, `component ${live?.componentId ?? 'unknown'}.contract`);
  const context = componentContext(live);
  const label = `component ${live.componentId}`;
  assertBundledP10Context(context, components, live.componentId);

  if (contract.schema === 'refas.rigid-body-dynamics/v1') {
    assertValid(validateRigidBodyDynamicsBindings(contract, identityGraph), `${label} P02 bindings are stale`);
    return;
  }
  if (contract.schema === 'refas.collision-model/v1') {
    assertValid(validateCollisionModelBindings(contract, identityGraph), `${label} P03 bindings are stale`);
    if (requiresVisualReuse(contract)) {
      const manifest = requireValue(context.visualGeometryManifest, `${label}.validationContext.visualGeometryManifest`);
      const expected = requireValue(context.expectedVisualArtifactDigest, `${label}.validationContext.expectedVisualArtifactDigest`);
      assertValid(
        validateCollisionVisualReuseBindings(contract, manifest, {expectedVisualArtifactDigest: expected}),
        `${label} P03 visual-reuse binding is stale`,
      );
    }
    return;
  }
  if (contract.schema === 'refas.articulation-graph/v1') {
    const attachmentSemantics = requireValue(context.attachmentSemantics, `${label}.validationContext.attachmentSemantics`);
    const jointContracts = requireValue(context.jointContracts, `${label}.validationContext.jointContracts`);
    assertValid(
      validateArticulationGraphBindings(contract, identityGraph, {attachmentSemantics, jointContracts}),
      `${label} P04 bindings are stale`,
    );
    return;
  }
  if (contract.schema === 'refas.mechanism-graph/v1') {
    const articulationGraph = requireValue(context.articulationGraph, `${label}.validationContext.articulationGraph`);
    assertValid(validateMechanismGraphBindings(contract, identityGraph, articulationGraph), `${label} P05 bindings are stale`);
    return;
  }
  if (contract.schema === 'refas.transmission-model/v1') {
    assertValid(
      validateTransmissionModelBindings(contract, identityGraph, {
        mechanismGraph: context.mechanismGraph ?? null,
        articulationGraph: context.articulationGraph ?? null,
        implementationManifest: context.implementationManifest ?? null,
        expectedImplementationArtifactDigest: context.expectedImplementationArtifactDigest ?? null,
      }),
      `${label} P06 bindings are stale`,
    );
    return;
  }
  if (contract.schema === 'refas.actuation-model/v1') {
    assertValid(
      validateActuationModelBindings(contract, identityGraph, {
        transmissionModel: context.transmissionModel ?? null,
        mechanismGraph: context.mechanismGraph ?? null,
        articulationGraph: context.articulationGraph ?? null,
        implementationManifest: context.implementationManifest ?? null,
        expectedImplementationArtifactDigest: context.expectedImplementationArtifactDigest ?? null,
      }),
      `${label} P07 bindings are stale`,
    );
    return;
  }
  if (contract.schema === 'refas.control-profile/v1') {
    assertValid(
      validateControlProfileBindings(contract, identityGraph, {
        actuationModel: context.actuationModel ?? null,
        transmissionModel: context.transmissionModel ?? null,
        mechanismGraph: context.mechanismGraph ?? null,
        articulationGraph: context.articulationGraph ?? null,
        implementationManifest: context.implementationManifest ?? null,
        expectedImplementationArtifactDigest: context.expectedImplementationArtifactDigest ?? null,
      }),
      `${label} P08 bindings are stale`,
    );
    return;
  }
  if (contract.schema === 'refas.runtime-binding/v1') {
    if (requiresRuntimeJointContext(contract)) {
      requireValue(context.articulationGraph, `${label}.validationContext.articulationGraph`);
      requireValue(context.attachmentSemantics, `${label}.validationContext.attachmentSemantics`);
      requireValue(context.jointContracts, `${label}.validationContext.jointContracts`);
    }
    assertValid(
      validateRuntimeBindingBindings(contract, identityGraph, {
        actuationModel: context.actuationModel ?? null,
        transmissionModel: context.transmissionModel ?? null,
        mechanismGraph: context.mechanismGraph ?? null,
        articulationGraph: context.articulationGraph ?? null,
        attachmentSemantics: context.attachmentSemantics ?? null,
        jointContracts: context.jointContracts ?? null,
        implementationManifest: context.implementationManifest ?? null,
        expectedImplementationArtifactDigest: context.expectedImplementationArtifactDigest ?? null,
      }),
      `${label} P09 bindings are stale`,
    );
    return;
  }
  throw new Error(`${label} uses unsupported P10 component schema ${contract.schema}`);
}

function dependencyId(kind, schema, digest) {
  return assertId(`dependency:${digestJson({kind, schema, digest}).slice(0, 48)}`, 'dependencyId');
}
function dependencyEnvelope(kind, contract, digestField, label) {
  const schema = String(contract?.schema ?? '');
  const digest = assertDigest(contract?.[digestField], `${label}.${digestField}`);
  const payload = cloneJson(contract, label);
  return {
    dependencyId: dependencyId(kind, schema, digest),
    kind,
    schema,
    digest,
    contract: payload,
  };
}
function extraDependenciesFor(live) {
  const contract = live.contract;
  const context = componentContext(live);
  if (contract.schema === 'refas.collision-model/v1' && requiresVisualReuse(contract)) {
    const manifest = requireValue(context.visualGeometryManifest, `component ${live.componentId}.validationContext.visualGeometryManifest`);
    return [dependencyEnvelope('COLLISION_VISUAL_GEOMETRY_MANIFEST', manifest, 'manifestDigest', `component ${live.componentId} visualGeometryManifest`)];
  }
  if (contract.schema === 'refas.transmission-model/v1' && contract.implementationBinding != null) {
    const manifest = requireValue(context.implementationManifest, `component ${live.componentId}.validationContext.implementationManifest`);
    return [dependencyEnvelope('TRANSMISSION_IMPLEMENTATION_MANIFEST', manifest, 'manifestDigest', `component ${live.componentId} implementationManifest`)];
  }
  return [];
}
function sortDependencies(dependencies) {
  return [...dependencies].sort((left, right) => left.dependencyId.localeCompare(right.dependencyId));
}
function payloadDigest(value, digestField) {
  const digest = assertDigest(value?.[digestField], digestField);
  const payload = cloneJson(value, digestField);
  delete payload[digestField];
  if (digestJson(payload) !== digest) throw new Error(`${digestField} does not reproduce from dependency payload`);
  return digest;
}
function validateExtraDependency(raw, label) {
  assertKnownKeys(raw, DEPENDENCY_KEYS, label);
  const rule = EXTRA_DEPENDENCY_KINDS[raw.kind];
  if (!rule) throw new Error(`${label}.kind is not a supported P12 external dependency`);
  if (raw.schema !== rule.schema) throw new Error(`${label}.schema must be ${rule.schema}`);
  const contract = assertRecord(raw.contract, `${label}.contract`);
  if (contract.schema !== raw.schema) throw new Error(`${label}.contract.schema does not match dependency schema`);
  const actualDigest = payloadDigest(contract, rule.digestField);
  const digest = assertDigest(raw.digest, `${label}.digest`);
  if (actualDigest !== digest) throw new Error(`${label}.digest does not match dependency payload`);
  const expectedId = dependencyId(raw.kind, raw.schema, digest);
  if (raw.dependencyId !== expectedId) throw new Error(`${label}.dependencyId must be canonical ID ${expectedId}`);
  if (raw.kind === 'COLLISION_VISUAL_GEOMETRY_MANIFEST') {
    assertValid(validateCollisionVisualGeometryManifest(contract), `${label} visual geometry manifest is invalid`);
  } else {
    assertValid(validateTransmissionImplementationManifest(contract), `${label} implementation manifest is invalid`);
  }
  return raw;
}
function componentExtraDependencies(component) {
  return (component.dependencies ?? []).filter((dependency) => EXTRA_DEPENDENCY_KIND_SET.has(dependency.kind));
}
function baseCompatibleView(value) {
  const baseLike = cloneJson(value, 'canonical export view');
  for (const component of baseLike.components ?? []) {
    component.dependencies = (component.dependencies ?? []).filter((dependency) => !EXTRA_DEPENDENCY_KIND_SET.has(dependency.kind));
  }
  const payload = {...baseLike};
  delete payload.canonicalViewDigest;
  baseLike.canonicalViewDigest = digestJson(payload);
  return baseLike;
}
function validateExtraDependencyClosure(value) {
  for (const [componentIndex, component] of (value.components ?? []).entries()) {
    const label = `components[${componentIndex}]`;
    const ids = (component.dependencies ?? []).map((dependency) => dependency.dependencyId);
    const sortedIds = [...ids].sort();
    if (digestJson(ids) !== digestJson(sortedIds)) throw new Error(`${label}.dependencies must be sorted by dependencyId`);
    if (new Set(ids).size !== ids.length) throw new Error(`${label}.dependencies contains duplicate dependencyId values`);
    const extras = componentExtraDependencies(component).map((dependency, index) => validateExtraDependency(dependency, `${label}.externalDependencies[${index}]`));
    const contract = component.contract;
    if (contract?.schema === 'refas.collision-model/v1') {
      const required = requiresVisualReuse(contract) ? 1 : 0;
      const manifests = extras.filter((dependency) => dependency.kind === 'COLLISION_VISUAL_GEOMETRY_MANIFEST');
      if (manifests.length !== required) throw new Error(`${label} must contain exactly ${required} COLLISION_VISUAL_GEOMETRY_MANIFEST dependency`);
      if (required) {
        assertValid(
          validateCollisionVisualReuseBindings(contract, manifests[0].contract, {expectedVisualArtifactDigest: manifests[0].contract.visualArtifactDigest}),
          `${label} collision visual dependency does not realize declared visual reuse`,
        );
      }
    } else if (extras.some((dependency) => dependency.kind === 'COLLISION_VISUAL_GEOMETRY_MANIFEST')) {
      throw new Error(`${label} may not carry collision visual geometry dependencies`);
    }
    if (contract?.schema === 'refas.transmission-model/v1') {
      const required = contract.implementationBinding != null ? 1 : 0;
      const manifests = extras.filter((dependency) => dependency.kind === 'TRANSMISSION_IMPLEMENTATION_MANIFEST');
      if (manifests.length !== required) throw new Error(`${label} must contain exactly ${required} TRANSMISSION_IMPLEMENTATION_MANIFEST dependency`);
      if (required) {
        assertValid(
          validateTransmissionImplementationBindings(contract, manifests[0].contract, {expectedImplementationArtifactDigest: manifests[0].contract.artifactDigest}),
          `${label} transmission implementation dependency does not match the model`,
        );
      }
    } else if (extras.some((dependency) => dependency.kind === 'TRANSMISSION_IMPLEMENTATION_MANIFEST')) {
      throw new Error(`${label} may not carry transmission implementation dependencies`);
    }
  }
}

export function createCanonicalExportView({bundle, identityGraph, components = []} = {}) {
  const baseView = core.createCanonicalExportView({bundle, identityGraph, components});
  for (const live of components) validateLiveComponent(live, identityGraph, components);
  const liveById = new Map(components.map((item) => [item.componentId, item]));
  const hardenedComponents = baseView.components.map((component) => {
    const live = liveById.get(component.componentId);
    if (!live) throw new Error(`components are missing live payload for ${component.componentId}`);
    const dependencies = sortDependencies([...component.dependencies, ...extraDependenciesFor(live)]);
    if (new Set(dependencies.map((dependency) => dependency.dependencyId)).size !== dependencies.length) {
      throw new Error(`component ${component.componentId} has duplicate canonical dependency identities`);
    }
    return {...component, dependencies};
  });
  const payload = {
    schema: baseView.schema,
    bundleBinding: cloneJson(baseView.bundleBinding, 'bundleBinding'),
    identityProjection: cloneJson(baseView.identityProjection, 'identityProjection'),
    components: hardenedComponents,
  };
  return deepFreeze({...payload, canonicalViewDigest: digestJson(payload)});
}

export function validateCanonicalExportView(value) {
  const errors = [];
  try {
    assertRecord(value, 'canonical export view');
    const declaredDigest = assertDigest(value.canonicalViewDigest, 'canonicalViewDigest');
    const payload = cloneJson(value, 'canonical export view');
    delete payload.canonicalViewDigest;
    if (digestJson(payload) !== declaredDigest) throw new Error('canonicalViewDigest does not reproduce');
    const baseValidation = core.validateCanonicalExportView(baseCompatibleView(value));
    assertValid(baseValidation, 'canonical export view base projection is invalid');
    validateExtraDependencyClosure(value);
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
        throw new Error('canonical export view is stale relative to current live P01-P09 construction inputs');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function hardenedCanonicalBinding(view) {
  return {
    canonicalViewDigest: view.canonicalViewDigest,
    bundleDigest: view.bundleBinding.bundleDigest,
    rootClosureDigest: view.bundleBinding.rootClosureDigest,
    rootModuleId: view.bundleBinding.rootModuleId,
    identityProjectionDigest: view.bundleBinding.identityProjectionDigest,
  };
}
function reboundManifest(manifest, canonicalViewDigest) {
  const rebound = cloneJson(manifest, 'backend export manifest');
  rebound.canonicalBinding.canonicalViewDigest = canonicalViewDigest;
  const payload = {...rebound};
  delete payload.exportDigest;
  rebound.exportDigest = digestJson(payload);
  return rebound;
}

export function validateBackendExportBindings(manifest, context = {}) {
  const errors = [];
  const intrinsic = core.validateBackendExportManifest(manifest);
  if (!intrinsic.valid) errors.push(`backend export manifest invalid: ${intrinsic.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const hardenedView = createCanonicalExportView(context);
      if (digestJson(manifest.canonicalBinding) !== digestJson(hardenedCanonicalBinding(hardenedView))) {
        throw new Error('backend export canonical binding is stale relative to current live P01-P09 state');
      }
      const baseView = core.createCanonicalExportView(context);
      const baseManifest = reboundManifest(manifest, baseView.canonicalViewDigest);
      const baseValidation = core.validateBackendExportBindings(baseManifest, context);
      assertValid(baseValidation, 'backend export capacity/disposition binding is stale');
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
  const artifacts = core.validateBackendExportArtifacts(result.manifest, result.files);
  if (!artifacts.valid) errors.push(...artifacts.errors);
  return {valid: errors.length === 0, errors};
}

export async function runExportAdapter({exportId, adapter, capacityProfile, bundle, identityGraph, components = []} = {}) {
  assertKnownKeys(adapter, new Set(['id', 'backend', 'version', 'project']), 'adapter');
  if (typeof adapter.project !== 'function') throw new Error('adapter.project must be a function');
  const hardenedView = createCanonicalExportView({bundle, identityGraph, components});
  const proxyAdapter = {
    id: adapter?.id,
    backend: adapter?.backend,
    version: adapter?.version,
    async project(input) {
      return adapter.project.call(adapter, {
        canonicalView: hardenedView,
        capacityProfile: input.capacityProfile,
      });
    },
  };
  const result = await core.runExportAdapter({exportId, adapter: proxyAdapter, capacityProfile, bundle, identityGraph, components});
  const manifest = reboundManifest(result.manifest, hardenedView.canonicalViewDigest);
  return {manifest: deepFreeze(manifest), files: result.files};
}

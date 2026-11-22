import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {createActuationModel, validateActuationModel} from './actuation-model.mjs';
import {transmissionArticulationProjection} from './transmission-model.mjs';
import {ARTICULATED_JOINT_SCHEMA} from './articulation-clearance.mjs';
import {normalizeRigidFrame} from './attachment-follow.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const RUNTIME_BINDING_SCHEMA = 'refas.runtime-binding/v1';
export const PHYSICAL_RUNTIME_IDENTITY_BINDING_SCHEMA = 'refas.physical-runtime-identity-binding/v1';
export const PHYSICAL_RUNTIME_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-runtime-identity-projection/v1';
export const RUNTIME_TARGET_BINDING_SCHEMA = 'refas.runtime-target-binding/v1';
export const RUNTIME_TARGET_PROJECTION_SCHEMA = 'refas.runtime-target-projection/v1';
export const RUNTIME_COORDINATE_CLASSES = Object.freeze(['NONE', 'ROTARY', 'LINEAR']);
export const RUNTIME_BINDING_AUTHORITY_PROPERTIES = Object.freeze([
  'definition', 'device', 'bus', 'runtime-index', 'sign', 'zero-offset', 'encoder-scale', 'transport-delay',
]);

const COORDINATE_CLASS_SET = new Set(RUNTIME_COORDINATE_CLASSES);
const AUTHORITY_PROPERTY_SET = new Set(RUNTIME_BINDING_AUTHORITY_PROPERTIES);
const CONSTRUCTION_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);
const TOP_LEVEL_KEYS = new Set([
  'schema', 'scopeId', 'sourceSha256',
  'identityGraph', 'actuationModel', 'transmissionModel', 'mechanismGraph', 'articulationGraph',
  'attachmentSemantics', 'jointContracts', 'implementationManifest', 'expectedImplementationArtifactDigest',
  'identityBinding', 'targetBinding', 'bindings', 'policy', 'runtimeBindingDigest',
]);
const BINDING_KEYS = new Set([
  'bindingId', 'selector', 'coordinateClass', 'device', 'bus', 'runtimeIndex',
  'sign', 'zeroOffset', 'encoderScale', 'transportDelay', 'definitionAuthoritySubjectId',
]);
const SELECTOR_KEYS = new Set(['runtimeEndpointId', 'bindsRuntimeRelationId', 'targetId', 'targetKind']);
const AUTHORITY_VALUE_KEYS = new Set(['value', 'authoritySubjectId']);
const BINDING_REF_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const ZERO_OFFSET_KEYS = new Set(['value', 'unit']);
const ENCODER_SCALE_KEYS = new Set(['value', 'unit']);
const DELAY_KEYS = new Set(['value_s']);
const TARGET_KINDS = new Set(['actuator', 'controller', 'virtual-joint', 'rigid-link', 'attachment-interface']);
const ARTICULATED_JOINT_KEYS = new Set([
  'schema', 'id', 'scopeId', 'sourceSha256', 'attachmentSemanticsDigest', 'relationId', 'subjectId', 'ownerId',
  'jointType', 'axisConvention', 'zeroConfiguration', 'ownerJointFrame', 'subjectJointFrame', 'limits', 'evidenceRefs', 'policy', 'jointDigest',
]);
const RUNTIME_LOCATOR_MAX_LENGTH = 512;
const RUNTIME_LOCATOR_CONTROL_RE = /[\u0000-\u001f\u007f]/u;

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

function nonnegative(value, label) {
  const normalized = finite(value, label);
  if (normalized < 0) throw new Error(`${label} must be non-negative`);
  return normalized;
}

function positive(value, label) {
  const normalized = finite(value, label);
  if (!(normalized > 0)) throw new Error(`${label} must be positive`);
  return normalized;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function normalizeCoordinateClass(value, label) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!COORDINATE_CLASS_SET.has(normalized)) throw new Error(`${label} must be one of: ${RUNTIME_COORDINATE_CLASSES.join(', ')}`);
  return normalized;
}

function normalizeSelector(raw, label) {
  assertKnownKeys(raw, SELECTOR_KEYS, label);
  const targetKind = String(raw.targetKind ?? '').trim().toLowerCase();
  if (!TARGET_KINDS.has(targetKind)) throw new Error(`${label}.targetKind must be one of: ${[...TARGET_KINDS].join(', ')}`);
  return {
    runtimeEndpointId: assertId(raw.runtimeEndpointId, `${label}.runtimeEndpointId`),
    bindsRuntimeRelationId: assertId(raw.bindsRuntimeRelationId, `${label}.bindsRuntimeRelationId`),
    targetId: assertId(raw.targetId, `${label}.targetId`),
    targetKind,
  };
}

export function runtimeBindingAuthoritySubjectId(bindingId, property) {
  const id = assertId(bindingId, 'bindingId');
  const normalizedProperty = String(property ?? '').trim().toLowerCase();
  if (!AUTHORITY_PROPERTY_SET.has(normalizedProperty)) throw new Error(`property must be one of: ${RUNTIME_BINDING_AUTHORITY_PROPERTIES.join(', ')}`);
  const readable = `${id}:runtime:${normalizedProperty}`;
  if (readable.length <= 128) return assertId(readable, 'authoritySubjectId');
  return assertId(`runtime:${digestJson({bindingId: id, property: normalizedProperty}).slice(0, 48)}`, 'authoritySubjectId');
}

function normalizeAuthorityValue(raw, bindingId, property, normalizeValue, label, {required = false} = {}) {
  assertKnownKeys(raw, AUTHORITY_VALUE_KEYS, label);
  const expected = runtimeBindingAuthoritySubjectId(bindingId, property);
  const authoritySubjectId = raw.authoritySubjectId == null ? expected : assertId(raw.authoritySubjectId, `${label}.authoritySubjectId`);
  if (authoritySubjectId !== expected) throw new Error(`${label}.authoritySubjectId must be canonical subject ${expected}`);
  if (required && raw.value == null) throw new Error(`${label}.value must be resolved`);
  return {value: raw.value == null ? null : normalizeValue(raw.value, `${label}.value`), authoritySubjectId};
}

function normalizeRuntimeLocator(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a runtime locator string`);
  if (!value.length || value.length > RUNTIME_LOCATOR_MAX_LENGTH) throw new Error(`${label} must contain 1-${RUNTIME_LOCATOR_MAX_LENGTH} characters`);
  if (value.trim() !== value) throw new Error(`${label} must not contain leading or trailing whitespace`);
  if (RUNTIME_LOCATOR_CONTROL_RE.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}

function normalizeDevice(value, label) { return normalizeRuntimeLocator(value, label); }
function normalizeBus(value, label) { return normalizeRuntimeLocator(value, label); }
function normalizeRuntimeIndex(value, label) { return nonnegativeInteger(value, label); }
function normalizeSign(value, label) {
  const normalized = finite(value, label);
  if (normalized !== 1 && normalized !== -1) throw new Error(`${label} must be +1 or -1`);
  return normalized;
}
function normalizeDelay(raw, label) {
  assertKnownKeys(raw, DELAY_KEYS, label);
  return {value_s: nonnegative(raw.value_s, `${label}.value_s`)};
}
function zeroOffsetUnit(coordinateClass) {
  if (coordinateClass === 'ROTARY') return 'rad';
  if (coordinateClass === 'LINEAR') return 'm';
  return null;
}
function encoderScaleUnit(coordinateClass) {
  if (coordinateClass === 'ROTARY') return 'rad_per_runtime_unit';
  if (coordinateClass === 'LINEAR') return 'm_per_runtime_unit';
  return null;
}
function normalizeZeroOffset(raw, label, coordinateClass) {
  assertKnownKeys(raw, ZERO_OFFSET_KEYS, label);
  const expectedUnit = zeroOffsetUnit(coordinateClass);
  if (!expectedUnit) throw new Error(`${label} is forbidden for NONE coordinate class`);
  if (raw.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit}`);
  return {value: finite(raw.value, `${label}.value`), unit: expectedUnit};
}
function normalizeEncoderScale(raw, label, coordinateClass) {
  assertKnownKeys(raw, ENCODER_SCALE_KEYS, label);
  const expectedUnit = encoderScaleUnit(coordinateClass);
  if (!expectedUnit) throw new Error(`${label} is forbidden for NONE coordinate class`);
  if (raw.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit}`);
  return {value: positive(raw.value, `${label}.value`), unit: expectedUnit};
}

function normalizeBinding(raw, index) {
  const label = `bindings[${index}]`;
  assertKnownKeys(raw, BINDING_KEYS, label);
  const bindingId = assertId(raw.bindingId, `${label}.bindingId`);
  const selector = normalizeSelector(raw.selector, `${label}.selector`);
  const coordinateClass = normalizeCoordinateClass(raw.coordinateClass, `${label}.coordinateClass`);
  const definitionExpected = runtimeBindingAuthoritySubjectId(bindingId, 'definition');
  const definitionAuthoritySubjectId = raw.definitionAuthoritySubjectId == null
    ? definitionExpected
    : assertId(raw.definitionAuthoritySubjectId, `${label}.definitionAuthoritySubjectId`);
  if (definitionAuthoritySubjectId !== definitionExpected) throw new Error(`${label}.definitionAuthoritySubjectId must be canonical subject ${definitionExpected}`);

  const binding = {
    bindingId,
    selector,
    coordinateClass,
    device: normalizeAuthorityValue(raw.device, bindingId, 'device', normalizeDevice, `${label}.device`, {required: true}),
    bus: normalizeAuthorityValue(raw.bus, bindingId, 'bus', normalizeBus, `${label}.bus`),
    runtimeIndex: normalizeAuthorityValue(raw.runtimeIndex, bindingId, 'runtime-index', normalizeRuntimeIndex, `${label}.runtimeIndex`),
    sign: normalizeAuthorityValue(raw.sign, bindingId, 'sign', normalizeSign, `${label}.sign`),
    zeroOffset: normalizeAuthorityValue(raw.zeroOffset, bindingId, 'zero-offset', (value, valueLabel) => normalizeZeroOffset(value, valueLabel, coordinateClass), `${label}.zeroOffset`),
    encoderScale: normalizeAuthorityValue(raw.encoderScale, bindingId, 'encoder-scale', (value, valueLabel) => normalizeEncoderScale(value, valueLabel, coordinateClass), `${label}.encoderScale`),
    transportDelay: normalizeAuthorityValue(raw.transportDelay, bindingId, 'transport-delay', normalizeDelay, `${label}.transportDelay`),
    definitionAuthoritySubjectId,
  };

  if (coordinateClass === 'NONE') {
    for (const [name, property] of [['sign', binding.sign], ['zeroOffset', binding.zeroOffset], ['encoderScale', binding.encoderScale]]) {
      if (property.value != null) throw new Error(`${label}.${name}.value must be null for NONE coordinate class`);
    }
  }
  return binding;
}

function resolvedCalibration(rawBinding) {
  const binding = normalizeBinding(rawBinding, 0);
  if (binding.coordinateClass === 'NONE') throw new Error(`runtime binding ${binding.bindingId} has no scalar runtime coordinate`);
  if (binding.sign.value == null || binding.zeroOffset.value == null || binding.encoderScale.value == null) {
    throw new Error(`runtime binding ${binding.bindingId} calibration is unresolved; sign, zeroOffset, and encoderScale are required for conversion`);
  }
  return {
    binding,
    sign: binding.sign.value,
    zeroOffset: binding.zeroOffset.value.value,
    encoderScale: binding.encoderScale.value.value,
  };
}

export function runtimeValueToCanonical(rawBinding, runtimeValue) {
  const {sign, zeroOffset, encoderScale} = resolvedCalibration(rawBinding);
  const raw = finite(runtimeValue, 'runtimeValue');
  return finite(zeroOffset + sign * encoderScale * raw, 'canonicalValue');
}

export function canonicalValueToRuntime(rawBinding, canonicalValue) {
  const {sign, zeroOffset, encoderScale} = resolvedCalibration(rawBinding);
  const canonical = finite(canonicalValue, 'canonicalValue');
  return finite(sign * (canonical - zeroOffset) / encoderScale, 'runtimeValue');
}

export function physicalRuntimeIdentityProjection(identityGraph, bindings) {
  validateIdentityGraph(identityGraph);
  if (!Array.isArray(bindings) || !bindings.length) throw new Error('physical runtime identity projection requires bindings');
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const relationById = new Map(identityGraph.relations.map((relation) => [relation.id, relation]));
  const projected = bindings.map((binding) => {
    const {runtimeEndpointId, bindsRuntimeRelationId, targetId, targetKind} = binding.selector;
    const endpoint = entityById.get(runtimeEndpointId);
    if (!endpoint) throw new Error(`runtime binding ${binding.bindingId} references unknown runtime endpoint: ${runtimeEndpointId}`);
    if (endpoint.kind !== 'runtime-endpoint') throw new Error(`runtime binding ${binding.bindingId} source ${runtimeEndpointId} must be runtime-endpoint, found ${endpoint.kind}`);
    const target = entityById.get(targetId);
    if (!target) throw new Error(`runtime binding ${binding.bindingId} references unknown target: ${targetId}`);
    if (target.kind !== targetKind) throw new Error(`runtime binding ${binding.bindingId} targetKind is stale; expected ${target.kind}`);
    const relation = relationById.get(bindsRuntimeRelationId);
    if (!relation) throw new Error(`runtime binding ${binding.bindingId} references unknown BINDS_RUNTIME relation: ${bindsRuntimeRelationId}`);
    if (relation.kind !== 'BINDS_RUNTIME' || relation.sourceId !== runtimeEndpointId) throw new Error(`relation ${bindsRuntimeRelationId} must be BINDS_RUNTIME from ${runtimeEndpointId}`);
    if (relation.targetIds.length !== 1 || relation.targetIds[0] !== targetId) throw new Error(`runtime binding ${binding.bindingId} BINDS_RUNTIME target must equal ${targetId}`);
    return {
      bindingId: binding.bindingId,
      runtimeEndpoint: {id: endpoint.id, kind: endpoint.kind},
      relation: {id: relation.id, kind: relation.kind, sourceId: relation.sourceId, targetIds: [...relation.targetIds]},
      target: {id: target.id, kind: target.kind},
    };
  }).sort((a, b) => a.bindingId.localeCompare(b.bindingId));
  return deepFreeze({schema: PHYSICAL_RUNTIME_IDENTITY_PROJECTION_SCHEMA, scopeId: identityGraph.scopeId, sourceSha256: identityGraph.sourceSha256, bindings: projected});
}

function identityBindingFor(identityGraph, bindings) {
  return {schema: PHYSICAL_RUNTIME_IDENTITY_BINDING_SCHEMA, sourceSchema: identityGraph.schema, projectionDigest: digestJson(physicalRuntimeIdentityProjection(identityGraph, bindings))};
}

function normalizeBindingRef(raw, expectedSchema, expectedSourceSchema, label) {
  assertKnownKeys(raw, BINDING_REF_KEYS, label);
  if (raw.schema !== expectedSchema) throw new Error(`${label}.schema must be ${expectedSchema}`);
  if (raw.sourceSchema !== expectedSourceSchema) throw new Error(`${label}.sourceSchema must be ${expectedSourceSchema}`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

function actuatorSemanticProjection(binding, actuationModel, identityGraph, dependencies) {
  const validation = validateActuationModel(actuationModel);
  if (!validation.valid) throw new Error(`actuationModel is invalid: ${validation.errors.join('; ')}`);
  const actuator = actuationModel.actuators.find((item) => item.actuatorId === binding.selector.targetId);
  if (!actuator) throw new Error(`runtime binding ${binding.bindingId} target actuator ${binding.selector.targetId} is absent from actuation model`);
  if (binding.coordinateClass !== actuator.coordinateClass) throw new Error(`runtime binding ${binding.bindingId} coordinateClass is stale; expected ${actuator.coordinateClass}`);
  const liveScopedModel = createActuationModel({
    scopeId: actuationModel.scopeId,
    sourceSha256: actuationModel.sourceSha256,
    identityGraph,
    transmissionModel: dependencies.transmissionModel ?? null,
    mechanismGraph: dependencies.mechanismGraph ?? null,
    articulationGraph: dependencies.articulationGraph ?? null,
    implementationManifest: dependencies.implementationManifest ?? null,
    expectedImplementationArtifactDigest: dependencies.expectedImplementationArtifactDigest ?? null,
    actuators: [actuator],
  });
  return {
    bindingId: binding.bindingId,
    targetKind: 'actuator',
    targetId: actuator.actuatorId,
    coordinateClass: actuator.coordinateClass,
    liveDependencyBindings: {
      identityBinding: liveScopedModel.identityBinding,
      articulationBinding: liveScopedModel.articulationBinding,
      transmissionBinding: liveScopedModel.transmissionBinding,
    },
  };
}

function runtimeJointCoordinateSemantics(joint) {
  if (joint?.jointContract?.schema !== ARTICULATED_JOINT_SCHEMA) throw new Error(`runtime virtual-joint target requires ${ARTICULATED_JOINT_SCHEMA}`);
  if (joint.jointContract.id !== joint.virtualJointId) throw new Error('runtime virtual-joint jointContract.id must equal virtualJointId');
  return {
    virtualJointId: joint.virtualJointId,
    parentLinkId: joint.parentLinkId,
    childLinkId: joint.childLinkId,
    jointContract: {schema: joint.jointContract.schema, id: joint.jointContract.id},
    parentJointFrame: structuredClone(joint.parentJointFrame),
    childJointFrame: structuredClone(joint.childJointFrame),
    referenceAngle: joint.referenceAngle,
    referenceChildFrameInParent: structuredClone(joint.referenceChildFrameInParent),
  };
}

function currentTypedJointCoordinateSemantics(binding, joint, jointContracts, attachmentSemantics, identityGraph) {
  if (!Array.isArray(jointContracts)) throw new Error(`runtime binding ${binding.bindingId} requires jointContracts for virtual-joint target`);
  const contract = jointContracts.find((item) => item?.id === joint.virtualJointId);
  if (!contract) throw new Error(`runtime binding ${binding.bindingId} requires current typed joint ${joint.virtualJointId}`);
  const label = `runtime binding ${binding.bindingId} typed joint`;
  assertKnownKeys(contract, ARTICULATED_JOINT_KEYS, label);
  if (contract.schema !== ARTICULATED_JOINT_SCHEMA) throw new Error(`${label}.schema must be ${ARTICULATED_JOINT_SCHEMA}`);
  const payload = structuredClone(contract);
  const jointDigest = assertDigest(payload.jointDigest, `${label}.jointDigest`);
  delete payload.jointDigest;
  if (digestJson(payload) !== jointDigest) throw new Error(`${label} digest mismatch`);
  if (contract.id !== joint.virtualJointId) throw new Error(`${label}.id must equal selected virtualJointId`);
  if (contract.scopeId !== identityGraph.scopeId || contract.sourceSha256 !== identityGraph.sourceSha256) throw new Error(`${label} scope/source does not match identityGraph`);
  if (contract.jointType !== 'REVOLUTE') throw new Error(`${label}.jointType must be REVOLUTE for ${ARTICULATED_JOINT_SCHEMA}`);
  if (contract.axisConvention !== 'owner-joint-z') throw new Error(`${label}.axisConvention must be owner-joint-z`);
  if (contract.zeroConfiguration !== 'owner-and-subject-joint-frames-coincident') throw new Error(`${label}.zeroConfiguration is unsupported`);

  if (!attachmentSemantics) throw new Error(`runtime binding ${binding.bindingId} requires attachmentSemantics for virtual-joint target`);
  const attachmentValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!attachmentValidation.valid) throw new Error(`attachmentSemantics is invalid: ${attachmentValidation.errors.join('; ')}`);
  if (attachmentSemantics.scopeId !== identityGraph.scopeId || attachmentSemantics.sourceSha256 !== identityGraph.sourceSha256) throw new Error('attachmentSemantics scope/source does not match identityGraph');
  const relation = attachmentSemantics.relations.find((item) => item.id === contract.relationId);
  if (!relation) throw new Error(`${label} relation ${contract.relationId} is absent from current attachment semantics`);
  if (relation.mode !== 'ARTICULATED') throw new Error(`${label} relation ${contract.relationId} is not ARTICULATED`);
  if (relation.subjectId !== contract.subjectId || relation.ownerIds.length !== 1 || relation.ownerIds[0] !== contract.ownerId) throw new Error(`${label} selected attachment relation owner/subject drift`);

  return {
    schema: contract.schema,
    id: contract.id,
    relationId: assertId(contract.relationId, `${label}.relationId`),
    subjectId: assertId(contract.subjectId, `${label}.subjectId`),
    ownerId: assertId(contract.ownerId, `${label}.ownerId`),
    jointType: contract.jointType,
    axisConvention: contract.axisConvention,
    zeroConfiguration: contract.zeroConfiguration,
    ownerJointFrame: normalizeRigidFrame(contract.ownerJointFrame, `${label}.ownerJointFrame`),
    subjectJointFrame: normalizeRigidFrame(contract.subjectJointFrame, `${label}.subjectJointFrame`),
  };
}

function virtualJointSemanticProjection(binding, articulationGraph, identityGraph, {attachmentSemantics = null, jointContracts = null} = {}) {
  if (!articulationGraph) throw new Error(`runtime binding ${binding.bindingId} requires articulationGraph for virtual-joint target`);
  const live = transmissionArticulationProjection(articulationGraph, identityGraph, [binding.selector.targetId]);
  const joint = live.joints.find((item) => item.virtualJointId === binding.selector.targetId);
  if (!joint) throw new Error(`runtime binding ${binding.bindingId} target virtual-joint ${binding.selector.targetId} is absent from articulation graph`);
  const articulationJoint = runtimeJointCoordinateSemantics(joint);
  const typedJoint = currentTypedJointCoordinateSemantics(binding, joint, jointContracts, attachmentSemantics, identityGraph);
  const coordinateClass = typedJoint.jointType === 'REVOLUTE' ? 'ROTARY' : null;
  if (!coordinateClass) throw new Error(`runtime binding ${binding.bindingId} typed joint has no supported scalar runtime coordinate class`);
  if (binding.coordinateClass !== coordinateClass) throw new Error(`runtime binding ${binding.bindingId} coordinateClass is stale; expected ${coordinateClass}`);
  return {
    bindingId: binding.bindingId,
    targetKind: 'virtual-joint',
    targetId: binding.selector.targetId,
    coordinateClass,
    articulationJoint,
    typedJoint,
    liveIdentityProjection: live.liveIdentityProjection,
  };
}

export function runtimeTargetProjection(bindings, identityGraph, {
  actuationModel = null,
  transmissionModel = null,
  mechanismGraph = null,
  articulationGraph = null,
  attachmentSemantics = null,
  jointContracts = null,
  implementationManifest = null,
  expectedImplementationArtifactDigest = null,
} = {}) {
  validateIdentityGraph(identityGraph);
  const projected = bindings.map((binding) => {
    if (binding.selector.targetKind === 'actuator') {
      if (!actuationModel) throw new Error(`runtime binding ${binding.bindingId} requires actuationModel for actuator target`);
      return actuatorSemanticProjection(binding, actuationModel, identityGraph, {
        transmissionModel, mechanismGraph, articulationGraph, implementationManifest, expectedImplementationArtifactDigest,
      });
    }
    if (binding.selector.targetKind === 'virtual-joint') {
      return virtualJointSemanticProjection(binding, articulationGraph, identityGraph, {attachmentSemantics, jointContracts});
    }
    if (binding.coordinateClass !== 'NONE') throw new Error(`runtime binding ${binding.bindingId} target kind ${binding.selector.targetKind} requires NONE coordinate class`);
    return {bindingId: binding.bindingId, targetKind: binding.selector.targetKind, targetId: binding.selector.targetId, coordinateClass: 'NONE'};
  }).sort((a, b) => a.bindingId.localeCompare(b.bindingId));
  return deepFreeze({schema: RUNTIME_TARGET_PROJECTION_SCHEMA, scopeId: identityGraph.scopeId, sourceSha256: identityGraph.sourceSha256, bindings: projected});
}

function targetBindingFor(bindings, identityGraph, dependencies) {
  return {schema: RUNTIME_TARGET_BINDING_SCHEMA, sourceSchema: RUNTIME_TARGET_PROJECTION_SCHEMA, projectionDigest: digestJson(runtimeTargetProjection(bindings, identityGraph, dependencies))};
}

function buildPayload(raw, {
  identityGraph = null,
  actuationModel = null,
  transmissionModel = null,
  mechanismGraph = null,
  articulationGraph = null,
  attachmentSemantics = null,
  jointContracts = null,
  implementationManifest = null,
  expectedImplementationArtifactDigest = null,
  requireLiveDependencies = false,
} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'runtimeBinding');
  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  if (raw.schema != null && raw.schema !== RUNTIME_BINDING_SCHEMA) throw new Error(`schema must be ${RUNTIME_BINDING_SCHEMA}`);
  if (!Array.isArray(raw.bindings) || !raw.bindings.length) throw new Error('bindings must contain at least one runtime binding');
  const bindings = raw.bindings.map((binding, index) => normalizeBinding(binding, index)).sort((a, b) => a.bindingId.localeCompare(b.bindingId));
  if (new Set(bindings.map((binding) => binding.bindingId)).size !== bindings.length) throw new Error('runtime binding IDs must be unique');
  if (new Set(bindings.map((binding) => binding.selector.runtimeEndpointId)).size !== bindings.length) throw new Error('each runtime endpoint may have only one active runtime binding');
  if (new Set(bindings.map((binding) => binding.selector.bindsRuntimeRelationId)).size !== bindings.length) throw new Error('each BINDS_RUNTIME relation may have only one active runtime binding');

  let identityBinding;
  let targetBinding;
  if (identityGraph) {
    validateIdentityGraph(identityGraph);
    if (identityGraph.scopeId !== scopeId || identityGraph.sourceSha256 !== sourceSha256) throw new Error('identityGraph scope/source does not match runtime binding');
    const liveIdentity = identityBindingFor(identityGraph, bindings);
    if (raw.identityBinding != null && digestJson(normalizeBindingRef(raw.identityBinding, PHYSICAL_RUNTIME_IDENTITY_BINDING_SCHEMA, 'refas.physical-identity-graph/v1', 'identityBinding')) !== digestJson(liveIdentity)) {
      throw new Error('identityBinding does not bind current runtime identity projection');
    }
    identityBinding = liveIdentity;
    const dependencies = {actuationModel, transmissionModel, mechanismGraph, articulationGraph, attachmentSemantics, jointContracts, implementationManifest, expectedImplementationArtifactDigest};
    const liveTarget = targetBindingFor(bindings, identityGraph, dependencies);
    if (raw.targetBinding != null && digestJson(normalizeBindingRef(raw.targetBinding, RUNTIME_TARGET_BINDING_SCHEMA, RUNTIME_TARGET_PROJECTION_SCHEMA, 'targetBinding')) !== digestJson(liveTarget)) {
      throw new Error('targetBinding does not bind current runtime target semantics');
    }
    targetBinding = liveTarget;
  } else {
    if (requireLiveDependencies) throw new Error('identityGraph is required to create runtime binding');
    identityBinding = normalizeBindingRef(raw.identityBinding, PHYSICAL_RUNTIME_IDENTITY_BINDING_SCHEMA, 'refas.physical-identity-graph/v1', 'identityBinding');
    targetBinding = normalizeBindingRef(raw.targetBinding, RUNTIME_TARGET_BINDING_SCHEMA, RUNTIME_TARGET_PROJECTION_SCHEMA, 'targetBinding');
  }

  return {
    schema: RUNTIME_BINDING_SCHEMA,
    scopeId,
    sourceSha256,
    identityBinding,
    targetBinding,
    bindings,
    policy: {
      runtimeEndpointRemainsDistinctFromTarget: true,
      runtimeIndexIsNotSemanticIdentity: true,
      runtimeLocatorsAreConfigurationStrings: true,
      runtimeCalibrationDoesNotRewriteUpstreamSemantics: true,
      canonicalCalibrationEquationDefined: true,
      zeroOffsetUsesGeneralizedCoordinateUnits: true,
      zeroOffsetIsNotEulerOrientation: true,
      signAndScaleRemainSeparate: true,
      controllerDelayAndTransportDelayRemainDistinct: true,
      unknownCalibrationRemainsExplicit: true,
      scopedIdentityBinding: true,
      scopedTargetBinding: true,
      targetBindingTracksCoordinateSemanticsOnly: true,
      semanticAuthorityRemainsExternal: true,
      fabricatedDefaultsForbidden: true,
      runtimeBindingDoesNotAssertSourceTruth: true,
      modelDoesNotAuthorizeClosure: true,
    },
  };
}

export function createRuntimeBinding(input = {}) {
  const payload = buildPayload(input, {
    identityGraph: input.identityGraph ?? null,
    actuationModel: input.actuationModel ?? null,
    transmissionModel: input.transmissionModel ?? null,
    mechanismGraph: input.mechanismGraph ?? null,
    articulationGraph: input.articulationGraph ?? null,
    attachmentSemantics: input.attachmentSemantics ?? null,
    jointContracts: input.jointContracts ?? null,
    implementationManifest: input.implementationManifest ?? null,
    expectedImplementationArtifactDigest: input.expectedImplementationArtifactDigest ?? null,
    requireLiveDependencies: true,
  });
  return deepFreeze({...payload, runtimeBindingDigest: digestJson(payload)});
}

export function validateRuntimeBinding(value) {
  const errors = [];
  try {
    if (value?.schema !== RUNTIME_BINDING_SCHEMA) errors.push('invalid schema');
    const payload = buildPayload(value);
    const recreated = {...payload, runtimeBindingDigest: digestJson(payload)};
    if (recreated.runtimeBindingDigest !== value?.runtimeBindingDigest) errors.push('runtime binding digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('runtime binding is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function validateRuntimeBindingBindings(value, identityGraph, dependencies = {}) {
  const errors = [];
  const validation = validateRuntimeBinding(value);
  if (!validation.valid) errors.push(`runtime binding invalid: ${validation.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const payload = buildPayload({...value, identityGraph, ...dependencies}, {identityGraph, ...dependencies, requireLiveDependencies: true});
      const recreated = {...payload, runtimeBindingDigest: digestJson(payload)};
      if (recreated.runtimeBindingDigest !== value.runtimeBindingDigest) errors.push('runtime binding does not reproduce against current scoped dependencies');
    }
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function runtimeBindingAuthoritySubjectIds(model) {
  const ids = [];
  for (const binding of model.bindings ?? []) {
    ids.push(binding.definitionAuthoritySubjectId);
    for (const property of [binding.device, binding.bus, binding.runtimeIndex, binding.sign, binding.zeroOffset, binding.encoderScale, binding.transportDelay]) ids.push(property.authoritySubjectId);
  }
  return [...ids].sort();
}

export function validateRuntimeBindingAuthority(model, authoritySet) {
  const errors = [];
  const modelValidation = validateRuntimeBinding(model);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!modelValidation.valid) errors.push(`runtime binding invalid: ${modelValidation.errors.join('; ')}`);
  if (!authorityValidation.valid) errors.push(`authority set invalid: ${authorityValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: [], unknownSubjectIds: []};
  if (authoritySet.scopeId !== model.scopeId || authoritySet.sourceSha256 !== model.sourceSha256) errors.push('authority set scope/source does not match runtime binding');
  if (authoritySet.targetSchema !== model.schema || authoritySet.targetDigest !== model.runtimeBindingDigest) errors.push('authority set does not bind exact runtime binding');
  const required = runtimeBindingAuthoritySubjectIds(model);
  const entryBySubject = new Map(authoritySet.entries.map((entry) => [entry.subjectId, entry]));
  const missingSubjectIds = required.filter((subjectId) => !entryBySubject.has(subjectId));
  if (missingSubjectIds.length) errors.push(`missing semantic authority for runtime subject(s): ${missingSubjectIds.join(', ')}`);
  const unknownSubjectIds = authoritySet.entries.map((entry) => entry.subjectId).filter((subjectId) => !required.includes(subjectId)).sort();
  if (unknownSubjectIds.length) errors.push(`authority set references subject(s) outside runtime binding: ${unknownSubjectIds.join(', ')}`);
  for (const binding of model.bindings) {
    const definition = entryBySubject.get(binding.definitionAuthoritySubjectId);
    if (definition && !CONSTRUCTION_AUTHORITIES.has(definition.authority)) errors.push(`runtime binding definition ${binding.bindingId} requires observed, inferred, or engineered authority`);
    for (const property of [binding.device, binding.bus, binding.runtimeIndex, binding.sign, binding.zeroOffset, binding.encoderScale, binding.transportDelay]) {
      const entry = entryBySubject.get(property.authoritySubjectId);
      if (!entry) continue;
      if (property.value == null && entry.authority !== 'unknown') errors.push(`unresolved runtime subject ${property.authoritySubjectId} requires unknown authority`);
      if (property.value != null && !CONSTRUCTION_AUTHORITIES.has(entry.authority)) errors.push(`resolved runtime subject ${property.authoritySubjectId} requires observed, inferred, or engineered authority`);
    }
  }
  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

export function runtimeBindingForEndpoint(model, runtimeEndpointId) {
  const id = assertId(runtimeEndpointId, 'runtimeEndpointId');
  const validation = validateRuntimeBinding(model);
  if (!validation.valid) throw new Error(`runtime binding invalid: ${validation.errors.join('; ')}`);
  return model.bindings.find((binding) => binding.selector.runtimeEndpointId === id) ?? null;
}

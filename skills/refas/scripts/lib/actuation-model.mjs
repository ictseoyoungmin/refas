import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {
  physicalTransmissionIdentityProjection,
  validateTransmissionModel,
} from './transmission-model.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const ACTUATION_MODEL_SCHEMA = 'refas.actuation-model/v1';
export const PHYSICAL_ACTUATION_IDENTITY_BINDING_SCHEMA = 'refas.physical-actuation-identity-binding/v1';
export const PHYSICAL_ACTUATION_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-actuation-identity-projection/v1';
export const ACTUATION_TRANSMISSION_BINDING_SCHEMA = 'refas.actuation-transmission-binding/v1';
export const ACTUATION_TRANSMISSION_PROJECTION_SCHEMA = 'refas.actuation-transmission-projection/v1';
export const ACTUATOR_KINDS = Object.freeze(['ROTARY_ELECTRIC', 'LINEAR_ELECTRIC', 'HYDRAULIC', 'PNEUMATIC', 'ABSTRACT']);
export const ACTUATOR_COORDINATE_CLASSES = Object.freeze(['ROTARY', 'LINEAR']);
export const ACTUATOR_CONTROL_MODES = Object.freeze(['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE']);
export const ACTUATION_AUTHORITY_PROPERTIES = Object.freeze([
  'definition',
  'supported-control-modes',
  'position-range',
  'velocity-limit',
  'effort-limit',
  'stiffness',
  'damping',
  'armature',
  'response-latency',
]);

const KIND_SET = new Set(ACTUATOR_KINDS);
const COORDINATE_CLASS_SET = new Set(ACTUATOR_COORDINATE_CLASSES);
const CONTROL_MODE_SET = new Set(ACTUATOR_CONTROL_MODES);
const DRIVE_TARGET_KINDS = new Set(['transmission', 'mechanism', 'virtual-joint']);
const CONSTRUCTION_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);
const AUTHORITY_PROPERTY_SET = new Set(ACTUATION_AUTHORITY_PROPERTIES);
const TOP_LEVEL_KEYS = new Set([
  'schema', 'scopeId', 'sourceSha256', 'identityGraph', 'transmissionModel',
  'identityBinding', 'transmissionBinding', 'actuators', 'policy', 'actuationDigest',
]);
const BINDING_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const ACTUATOR_KEYS = new Set([
  'actuatorId', 'drivesRelationId', 'drivenTargetId', 'drivenTargetKind', 'kind', 'coordinateClass',
  'definitionAuthoritySubjectId', 'supportedControlModes', 'positionRange', 'velocityLimit', 'effortLimit',
  'stiffness', 'damping', 'armature', 'responseLatency',
]);
const AUTHORITY_VALUE_KEYS = new Set(['value', 'authoritySubjectId']);
const RANGE_KEYS = new Set(['minimum', 'maximum', 'unit']);
const LIMIT_KEYS = new Set(['maxAbs', 'unit']);
const QUANTITY_KEYS = new Set(['value', 'unit']);

const UNITS = Object.freeze({
  ROTARY: Object.freeze({
    position: 'rad', velocity: 'rad_s', effort: 'N_m', stiffness: 'N_m_per_rad',
    damping: 'N_m_s_per_rad', armature: 'kg_m2',
  }),
  LINEAR: Object.freeze({
    position: 'm', velocity: 'm_s', effort: 'N', stiffness: 'N_per_m',
    damping: 'N_s_per_m', armature: 'kg',
  }),
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

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function normalizeIdentityBinding(raw, label = 'identityBinding') {
  assertKnownKeys(raw, BINDING_KEYS, label);
  if (raw.schema !== PHYSICAL_ACTUATION_IDENTITY_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_ACTUATION_IDENTITY_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.physical-identity-graph/v1') throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

function normalizeTransmissionBinding(raw, label = 'transmissionBinding') {
  if (raw == null) return null;
  assertKnownKeys(raw, BINDING_KEYS, label);
  if (raw.schema !== ACTUATION_TRANSMISSION_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${ACTUATION_TRANSMISSION_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.transmission-model/v1') throw new Error(`${label}.sourceSchema must be refas.transmission-model/v1`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

export function actuationAuthoritySubjectId(actuatorId, property) {
  const id = assertId(actuatorId, 'actuatorId');
  const normalizedProperty = String(property ?? '').trim().toLowerCase();
  if (!AUTHORITY_PROPERTY_SET.has(normalizedProperty)) throw new Error(`property must be one of: ${ACTUATION_AUTHORITY_PROPERTIES.join(', ')}`);
  const readable = `${id}:actuation:${normalizedProperty}`;
  if (readable.length <= 128) return assertId(readable, 'authoritySubjectId');
  return assertId(`actuation:${digestJson({actuatorId: id, property: normalizedProperty}).slice(0, 48)}`, 'authoritySubjectId');
}

function normalizeAuthorityValue(raw, actuatorId, property, normalizeValue, label) {
  assertKnownKeys(raw, AUTHORITY_VALUE_KEYS, label);
  const expected = actuationAuthoritySubjectId(actuatorId, property);
  const authoritySubjectId = raw.authoritySubjectId == null ? expected : assertId(raw.authoritySubjectId, `${label}.authoritySubjectId`);
  if (authoritySubjectId !== expected) throw new Error(`${label}.authoritySubjectId must be canonical subject ${expected}`);
  return {
    value: raw.value == null ? null : normalizeValue(raw.value, `${label}.value`),
    authoritySubjectId,
  };
}

function normalizeControlModes(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must contain at least one supported control mode`);
  const modes = value.map((item, index) => {
    const mode = String(item ?? '').trim().toUpperCase();
    if (!CONTROL_MODE_SET.has(mode)) throw new Error(`${label}[${index}] must be one of: ${ACTUATOR_CONTROL_MODES.join(', ')}`);
    return mode;
  });
  if (new Set(modes).size !== modes.length) throw new Error(`${label} must contain unique control modes`);
  return [...modes].sort();
}

function normalizePositionRange(value, label, coordinateClass) {
  assertKnownKeys(value, RANGE_KEYS, label);
  const minimum = finite(value.minimum, `${label}.minimum`);
  const maximum = finite(value.maximum, `${label}.maximum`);
  if (minimum > maximum) throw new Error(`${label}.minimum must be <= maximum`);
  const expectedUnit = UNITS[coordinateClass].position;
  if (value.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit} for ${coordinateClass}`);
  return {minimum, maximum, unit: expectedUnit};
}

function normalizeLimit(value, label, expectedUnit) {
  assertKnownKeys(value, LIMIT_KEYS, label);
  if (value.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit}`);
  return {maxAbs: positive(value.maxAbs, `${label}.maxAbs`), unit: expectedUnit};
}

function normalizeQuantity(value, label, expectedUnit) {
  assertKnownKeys(value, QUANTITY_KEYS, label);
  if (value.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit}`);
  return {value: nonnegative(value.value, `${label}.value`), unit: expectedUnit};
}

function normalizeActuator(raw, index) {
  const label = `actuators[${index}]`;
  assertKnownKeys(raw, ACTUATOR_KEYS, label);
  const actuatorId = assertId(raw.actuatorId, `${label}.actuatorId`);
  const drivesRelationId = assertId(raw.drivesRelationId, `${label}.drivesRelationId`);
  const drivenTargetId = assertId(raw.drivenTargetId, `${label}.drivenTargetId`);
  const drivenTargetKind = String(raw.drivenTargetKind ?? '').trim().toLowerCase();
  if (!DRIVE_TARGET_KINDS.has(drivenTargetKind)) throw new Error(`${label}.drivenTargetKind must be transmission, mechanism, or virtual-joint`);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${ACTUATOR_KINDS.join(', ')}`);
  const coordinateClass = String(raw.coordinateClass ?? '').trim().toUpperCase();
  if (!COORDINATE_CLASS_SET.has(coordinateClass)) throw new Error(`${label}.coordinateClass must be ROTARY or LINEAR`);
  if (kind === 'ROTARY_ELECTRIC' && coordinateClass !== 'ROTARY') throw new Error(`${label}.ROTARY_ELECTRIC requires ROTARY coordinateClass`);
  if (kind === 'LINEAR_ELECTRIC' && coordinateClass !== 'LINEAR') throw new Error(`${label}.LINEAR_ELECTRIC requires LINEAR coordinateClass`);

  const definitionExpected = actuationAuthoritySubjectId(actuatorId, 'definition');
  const definitionAuthoritySubjectId = raw.definitionAuthoritySubjectId == null
    ? definitionExpected
    : assertId(raw.definitionAuthoritySubjectId, `${label}.definitionAuthoritySubjectId`);
  if (definitionAuthoritySubjectId !== definitionExpected) throw new Error(`${label}.definitionAuthoritySubjectId must be canonical subject ${definitionExpected}`);

  return {
    actuatorId,
    drivesRelationId,
    drivenTargetId,
    drivenTargetKind,
    kind,
    coordinateClass,
    definitionAuthoritySubjectId,
    supportedControlModes: normalizeAuthorityValue(raw.supportedControlModes, actuatorId, 'supported-control-modes', normalizeControlModes, `${label}.supportedControlModes`),
    positionRange: normalizeAuthorityValue(raw.positionRange, actuatorId, 'position-range', (value, valueLabel) => normalizePositionRange(value, valueLabel, coordinateClass), `${label}.positionRange`),
    velocityLimit: normalizeAuthorityValue(raw.velocityLimit, actuatorId, 'velocity-limit', (value, valueLabel) => normalizeLimit(value, valueLabel, UNITS[coordinateClass].velocity), `${label}.velocityLimit`),
    effortLimit: normalizeAuthorityValue(raw.effortLimit, actuatorId, 'effort-limit', (value, valueLabel) => normalizeLimit(value, valueLabel, UNITS[coordinateClass].effort), `${label}.effortLimit`),
    stiffness: normalizeAuthorityValue(raw.stiffness, actuatorId, 'stiffness', (value, valueLabel) => normalizeQuantity(value, valueLabel, UNITS[coordinateClass].stiffness), `${label}.stiffness`),
    damping: normalizeAuthorityValue(raw.damping, actuatorId, 'damping', (value, valueLabel) => normalizeQuantity(value, valueLabel, UNITS[coordinateClass].damping), `${label}.damping`),
    armature: normalizeAuthorityValue(raw.armature, actuatorId, 'armature', (value, valueLabel) => normalizeQuantity(value, valueLabel, UNITS[coordinateClass].armature), `${label}.armature`),
    responseLatency: normalizeAuthorityValue(raw.responseLatency, actuatorId, 'response-latency', (value, valueLabel) => normalizeQuantity(value, valueLabel, 's'), `${label}.responseLatency`),
  };
}

export function physicalActuationIdentityProjection(identityGraph, actuators) {
  validateIdentityGraph(identityGraph);
  if (!Array.isArray(actuators) || !actuators.length) throw new Error('physical actuation identity projection requires actuator records');
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const relationById = new Map(identityGraph.relations.map((relation) => [relation.id, relation]));
  const projected = actuators.map((actuator) => {
    const actuatorEntity = entityById.get(actuator.actuatorId);
    if (!actuatorEntity) throw new Error(`actuation references unknown actuator identity: ${actuator.actuatorId}`);
    if (actuatorEntity.kind !== 'actuator') throw new Error(`actuation ${actuator.actuatorId} must bind a P01 actuator identity, found ${actuatorEntity.kind}`);
    const relation = relationById.get(actuator.drivesRelationId);
    if (!relation) throw new Error(`actuation ${actuator.actuatorId} references unknown DRIVES relation: ${actuator.drivesRelationId}`);
    if (relation.kind !== 'DRIVES' || relation.sourceId !== actuator.actuatorId) throw new Error(`relation ${actuator.drivesRelationId} must be DRIVES from actuator ${actuator.actuatorId}`);
    if (relation.targetIds.length !== 1 || relation.targetIds[0] !== actuator.drivenTargetId) throw new Error(`actuation ${actuator.actuatorId} DRIVES target must equal ${actuator.drivenTargetId}`);
    const target = entityById.get(actuator.drivenTargetId);
    if (!target) throw new Error(`actuation ${actuator.actuatorId} references unknown driven target: ${actuator.drivenTargetId}`);
    if (!DRIVE_TARGET_KINDS.has(target.kind)) throw new Error(`actuation driven target ${target.id} has invalid kind ${target.kind}`);
    if (actuator.drivenTargetKind !== target.kind) throw new Error(`actuation ${actuator.actuatorId} drivenTargetKind is stale; expected ${target.kind}`);
    return {
      actuator: structuredClone(actuatorEntity),
      drivesRelation: structuredClone(relation),
      drivenTarget: structuredClone(target),
    };
  }).sort((a, b) => a.actuator.id.localeCompare(b.actuator.id));
  return deepFreeze({
    schema: PHYSICAL_ACTUATION_IDENTITY_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    actuators: projected,
  });
}

function identityBindingFor(identityGraph, actuators) {
  return {
    schema: PHYSICAL_ACTUATION_IDENTITY_BINDING_SCHEMA,
    sourceSchema: identityGraph.schema,
    projectionDigest: digestJson(physicalActuationIdentityProjection(identityGraph, actuators)),
  };
}

export function actuationTransmissionProjection(transmissionModel, transmissionIds, identityGraph) {
  const ids = [...new Set((transmissionIds ?? []).map((id, index) => assertId(id, `transmissionIds[${index}]`)))].sort();
  if (!ids.length) return null;
  const transmissionValidation = validateTransmissionModel(transmissionModel);
  if (!transmissionValidation.valid) throw new Error(`transmissionModel is invalid: ${transmissionValidation.errors.join('; ')}`);
  validateIdentityGraph(identityGraph);
  if (transmissionModel.scopeId !== identityGraph.scopeId || transmissionModel.sourceSha256 !== identityGraph.sourceSha256) throw new Error('transmissionModel scope/source does not match identityGraph');
  const transmissionById = new Map(transmissionModel.transmissions.map((transmission) => [transmission.transmissionId, transmission]));
  const transmissions = ids.map((id) => {
    const transmission = transmissionById.get(id);
    if (!transmission) throw new Error(`actuation references transmission ${id} not present in current transmission model`);
    return structuredClone(transmission);
  });
  return deepFreeze({
    schema: ACTUATION_TRANSMISSION_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    transmissions,
    physicalIdentityProjection: physicalTransmissionIdentityProjection(identityGraph, transmissions),
  });
}

function transmissionBindingFor(transmissionModel, transmissionIds, identityGraph) {
  const projection = actuationTransmissionProjection(transmissionModel, transmissionIds, identityGraph);
  return projection == null ? null : {
    schema: ACTUATION_TRANSMISSION_BINDING_SCHEMA,
    sourceSchema: 'refas.transmission-model/v1',
    projectionDigest: digestJson(projection),
  };
}

function buildPayload(raw, {identityGraph = null, transmissionModel = null, requireLiveIdentityGraph = false} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'actuationModel');
  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  if (raw.schema != null && raw.schema !== ACTUATION_MODEL_SCHEMA) throw new Error(`schema must be ${ACTUATION_MODEL_SCHEMA}`);
  if (!Array.isArray(raw.actuators) || !raw.actuators.length) throw new Error('actuators must contain at least one actuator');
  const actuators = raw.actuators.map((actuator, index) => normalizeActuator(actuator, index)).sort((a, b) => a.actuatorId.localeCompare(b.actuatorId));
  if (new Set(actuators.map((actuator) => actuator.actuatorId)).size !== actuators.length) throw new Error('actuator IDs must be unique');
  if (new Set(actuators.map((actuator) => actuator.drivesRelationId)).size !== actuators.length) throw new Error('DRIVES relation IDs must be unique across actuation records');

  let identityBinding;
  if (identityGraph) {
    validateIdentityGraph(identityGraph);
    if (identityGraph.scopeId !== scopeId || identityGraph.sourceSha256 !== sourceSha256) throw new Error('identityGraph scope/source does not match actuation model');
    const live = identityBindingFor(identityGraph, actuators);
    if (raw.identityBinding != null && digestJson(normalizeIdentityBinding(raw.identityBinding)) !== digestJson(live)) throw new Error('identityBinding does not bind the current actuation-relevant identity projection');
    identityBinding = live;
  } else {
    if (requireLiveIdentityGraph) throw new Error('identityGraph is required to create actuation model');
    identityBinding = normalizeIdentityBinding(raw.identityBinding);
  }

  const transmissionIds = actuators.filter((actuator) => actuator.drivenTargetKind === 'transmission').map((actuator) => actuator.drivenTargetId).sort();
  let transmissionBinding;
  if (transmissionIds.length) {
    if (identityGraph && transmissionModel) {
      const live = transmissionBindingFor(transmissionModel, transmissionIds, identityGraph);
      if (raw.transmissionBinding != null && digestJson(normalizeTransmissionBinding(raw.transmissionBinding)) !== digestJson(live)) throw new Error('transmissionBinding does not bind the current referenced transmission projection');
      transmissionBinding = live;
    } else if (requireLiveIdentityGraph) {
      throw new Error('transmissionModel is required when an actuator DRIVES a transmission');
    } else {
      transmissionBinding = normalizeTransmissionBinding(raw.transmissionBinding);
      if (transmissionBinding == null) throw new Error('transmissionBinding is required when an actuator DRIVES a transmission');
    }
  } else {
    if (raw.transmissionBinding != null) throw new Error('transmissionBinding must be null when no actuator DRIVES a transmission');
    transmissionBinding = null;
  }

  return {
    schema: ACTUATION_MODEL_SCHEMA,
    scopeId,
    sourceSha256,
    identityBinding,
    transmissionBinding,
    actuators,
    policy: {
      actuatorAndTransmissionRemainDistinct: true,
      actuatorAndControllerRemainDistinct: true,
      actuatorAndRuntimeBindingRemainDistinct: true,
      supportedControlModesAreCapabilityNotTuning: true,
      unresolvedValuesRemainNull: true,
      fabricatedDefaultsForbidden: true,
      unitsAreCoordinateClassSpecific: true,
      scopedIdentityBinding: true,
      scopedTransmissionBinding: true,
      semanticAuthorityRemainsExternal: true,
      actuationDoesNotAssertSourceTruth: true,
      modelDoesNotAuthorizeClosure: true,
    },
  };
}

export function createActuationModel(input = {}) {
  const payload = buildPayload(input, {
    identityGraph: input.identityGraph ?? null,
    transmissionModel: input.transmissionModel ?? null,
    requireLiveIdentityGraph: true,
  });
  return deepFreeze({...payload, actuationDigest: digestJson(payload)});
}

export function validateActuationModel(value) {
  const errors = [];
  try {
    if (value?.schema !== ACTUATION_MODEL_SCHEMA) errors.push('invalid schema');
    const payload = buildPayload(value);
    const recreated = {...payload, actuationDigest: digestJson(payload)};
    if (recreated.actuationDigest !== value?.actuationDigest) errors.push('actuation model digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('actuation model is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateActuationModelBindings(value, identityGraph, {transmissionModel = null} = {}) {
  const errors = [];
  const validation = validateActuationModel(value);
  if (!validation.valid) errors.push(`actuation model invalid: ${validation.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const payload = buildPayload({...value, identityGraph, transmissionModel}, {
        identityGraph,
        transmissionModel,
        requireLiveIdentityGraph: true,
      });
      const recreated = {...payload, actuationDigest: digestJson(payload)};
      if (recreated.actuationDigest !== value.actuationDigest) errors.push('actuation model does not reproduce against current scoped dependencies');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function actuationAuthoritySubjectIds(model) {
  const ids = [];
  for (const actuator of model.actuators ?? []) {
    ids.push(actuator.definitionAuthoritySubjectId);
    ids.push(actuator.supportedControlModes.authoritySubjectId);
    ids.push(actuator.positionRange.authoritySubjectId);
    ids.push(actuator.velocityLimit.authoritySubjectId);
    ids.push(actuator.effortLimit.authoritySubjectId);
    ids.push(actuator.stiffness.authoritySubjectId);
    ids.push(actuator.damping.authoritySubjectId);
    ids.push(actuator.armature.authoritySubjectId);
    ids.push(actuator.responseLatency.authoritySubjectId);
  }
  return [...ids].sort();
}

export function validateActuationModelAuthority(model, authoritySet) {
  const errors = [];
  const modelValidation = validateActuationModel(model);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!modelValidation.valid) errors.push(`actuation model invalid: ${modelValidation.errors.join('; ')}`);
  if (!authorityValidation.valid) errors.push(`authority set invalid: ${authorityValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: [], unknownSubjectIds: []};
  if (authoritySet.scopeId !== model.scopeId || authoritySet.sourceSha256 !== model.sourceSha256) errors.push('authority set scope/source does not match actuation model');
  if (authoritySet.targetSchema !== model.schema || authoritySet.targetDigest !== model.actuationDigest) errors.push('authority set does not bind exact actuation model');

  const required = actuationAuthoritySubjectIds(model);
  const entryBySubject = new Map(authoritySet.entries.map((entry) => [entry.subjectId, entry]));
  const missingSubjectIds = required.filter((subjectId) => !entryBySubject.has(subjectId));
  if (missingSubjectIds.length) errors.push(`missing semantic authority for actuation subject(s): ${missingSubjectIds.join(', ')}`);
  const unknownSubjectIds = authoritySet.entries.map((entry) => entry.subjectId).filter((subjectId) => !required.includes(subjectId)).sort();
  if (unknownSubjectIds.length) errors.push(`authority set references subject(s) outside actuation model: ${unknownSubjectIds.join(', ')}`);

  for (const actuator of model.actuators) {
    const definitionEntry = entryBySubject.get(actuator.definitionAuthoritySubjectId);
    if (definitionEntry && !CONSTRUCTION_AUTHORITIES.has(definitionEntry.authority)) errors.push(`actuator definition ${actuator.actuatorId} requires observed, inferred, or engineered authority`);
    const properties = [
      actuator.supportedControlModes,
      actuator.positionRange,
      actuator.velocityLimit,
      actuator.effortLimit,
      actuator.stiffness,
      actuator.damping,
      actuator.armature,
      actuator.responseLatency,
    ];
    for (const property of properties) {
      const entry = entryBySubject.get(property.authoritySubjectId);
      if (!entry) continue;
      if (property.value == null && entry.authority !== 'unknown') errors.push(`unresolved actuation subject ${property.authoritySubjectId} requires unknown authority`);
      if (property.value != null && !CONSTRUCTION_AUTHORITIES.has(entry.authority)) errors.push(`resolved actuation subject ${property.authoritySubjectId} requires observed, inferred, or engineered authority`);
    }
  }

  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

export function actuationForActuator(model, actuatorId) {
  const id = assertId(actuatorId, 'actuatorId');
  const validation = validateActuationModel(model);
  if (!validation.valid) throw new Error(`actuation model invalid: ${validation.errors.join('; ')}`);
  return model.actuators.find((actuator) => actuator.actuatorId === id) ?? null;
}

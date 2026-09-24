import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {
  createActuationModel,
  validateActuationModel,
} from './actuation-model.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const CONTROL_PROFILE_SCHEMA = 'refas.control-profile/v1';
export const PHYSICAL_CONTROL_IDENTITY_BINDING_SCHEMA = 'refas.physical-control-identity-binding/v1';
export const PHYSICAL_CONTROL_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-control-identity-projection/v1';
export const CONTROL_ACTUATION_BINDING_SCHEMA = 'refas.control-actuation-binding/v1';
export const CONTROL_ACTUATION_PROJECTION_SCHEMA = 'refas.control-actuation-projection/v1';
export const CONTROL_MODES = Object.freeze(['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE']);
export const CONTROL_GAIN_MODEL_KINDS = Object.freeze(['NONE', 'P', 'PD']);
export const CONTROL_PROFILE_AUTHORITY_PROPERTIES = Object.freeze([
  'definition',
  'mode',
  'gain-model',
  'controller-delay',
]);

const MODE_SET = new Set(CONTROL_MODES);
const GAIN_MODEL_KIND_SET = new Set(CONTROL_GAIN_MODEL_KINDS);
const CONSTRUCTION_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);
const AUTHORITY_PROPERTY_SET = new Set(CONTROL_PROFILE_AUTHORITY_PROPERTIES);
const TOP_LEVEL_KEYS = new Set([
  'schema', 'scopeId', 'sourceSha256',
  'identityGraph', 'actuationModel', 'transmissionModel', 'mechanismGraph', 'articulationGraph',
  'implementationManifest', 'expectedImplementationArtifactDigest',
  'identityBinding', 'actuationBinding', 'profiles', 'policy', 'controlProfileDigest',
]);
const BINDING_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const PROFILE_KEYS = new Set([
  'profileId', 'selector', 'coordinateClass', 'mode', 'commandSpace', 'gainModel',
  'controllerDelay', 'definitionAuthoritySubjectId',
]);
const SELECTOR_KEYS = new Set(['controllerId', 'commandsRelationId', 'actuatorId']);
const AUTHORITY_VALUE_KEYS = new Set(['value', 'authoritySubjectId']);
const COMMAND_SPACE_KEYS = new Set(['channels']);
const CHANNEL_KEYS = new Set(['quantity', 'unit']);
const GAIN_NONE_KEYS = new Set(['kind']);
const GAIN_P_KEYS = new Set(['kind', 'kp']);
const GAIN_PD_KEYS = new Set(['kind', 'kp', 'kd']);
const GAIN_VALUE_KEYS = new Set(['value', 'unit']);
const DELAY_KEYS = new Set(['value_s']);

const QUANTITY_ORDER = Object.freeze(['POSITION', 'VELOCITY', 'EFFORT']);
const QUANTITY_ORDER_INDEX = new Map(QUANTITY_ORDER.map((value, index) => [value, index]));

const COMMAND_UNITS = Object.freeze({
  ROTARY: Object.freeze({POSITION: 'rad', VELOCITY: 'rad_s', EFFORT: 'N_m'}),
  LINEAR: Object.freeze({POSITION: 'm', VELOCITY: 'm_s', EFFORT: 'N'}),
});

const POSITION_GAINS = Object.freeze({
  ROTARY: Object.freeze({kp: 'N_m_per_rad', kd: 'N_m_s_per_rad'}),
  LINEAR: Object.freeze({kp: 'N_per_m', kd: 'N_s_per_m'}),
});

const VELOCITY_GAINS = Object.freeze({
  ROTARY: Object.freeze({kp: 'N_m_s_per_rad', kd: 'N_m_s2_per_rad'}),
  LINEAR: Object.freeze({kp: 'N_s_per_m', kd: 'N_s2_per_m'}),
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

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function normalizeIdentityBinding(raw, label = 'identityBinding') {
  assertKnownKeys(raw, BINDING_KEYS, label);
  if (raw.schema !== PHYSICAL_CONTROL_IDENTITY_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_CONTROL_IDENTITY_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.physical-identity-graph/v1') throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

function normalizeActuationBinding(raw, label = 'actuationBinding') {
  assertKnownKeys(raw, BINDING_KEYS, label);
  if (raw.schema !== CONTROL_ACTUATION_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${CONTROL_ACTUATION_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.actuation-model/v1') throw new Error(`${label}.sourceSchema must be refas.actuation-model/v1`);
  return {schema: raw.schema, sourceSchema: raw.sourceSchema, projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`)};
}

export function controlProfileAuthoritySubjectId(profileId, property) {
  const id = assertId(profileId, 'profileId');
  const normalizedProperty = String(property ?? '').trim().toLowerCase();
  if (!AUTHORITY_PROPERTY_SET.has(normalizedProperty)) throw new Error(`property must be one of: ${CONTROL_PROFILE_AUTHORITY_PROPERTIES.join(', ')}`);
  const readable = `${id}:control:${normalizedProperty}`;
  if (readable.length <= 128) return assertId(readable, 'authoritySubjectId');
  return assertId(`control:${digestJson({profileId: id, property: normalizedProperty}).slice(0, 48)}`, 'authoritySubjectId');
}

function normalizeAuthorityValue(raw, profileId, property, normalizeValue, label) {
  assertKnownKeys(raw, AUTHORITY_VALUE_KEYS, label);
  const expected = controlProfileAuthoritySubjectId(profileId, property);
  const authoritySubjectId = raw.authoritySubjectId == null ? expected : assertId(raw.authoritySubjectId, `${label}.authoritySubjectId`);
  if (authoritySubjectId !== expected) throw new Error(`${label}.authoritySubjectId must be canonical subject ${expected}`);
  return {
    value: raw.value == null ? null : normalizeValue(raw.value, `${label}.value`),
    authoritySubjectId,
  };
}

function normalizeSelector(raw, label) {
  assertKnownKeys(raw, SELECTOR_KEYS, label);
  return {
    controllerId: assertId(raw.controllerId, `${label}.controllerId`),
    commandsRelationId: assertId(raw.commandsRelationId, `${label}.commandsRelationId`),
    actuatorId: assertId(raw.actuatorId, `${label}.actuatorId`),
  };
}

function normalizeCoordinateClass(value, label) {
  const result = String(value ?? '').trim().toUpperCase();
  if (!['ROTARY', 'LINEAR'].includes(result)) throw new Error(`${label} must be ROTARY or LINEAR`);
  return result;
}

function normalizeMode(value, label) {
  const result = String(value ?? '').trim().toUpperCase();
  if (!MODE_SET.has(result)) throw new Error(`${label} must be one of: ${CONTROL_MODES.join(', ')}`);
  return result;
}

function expectedCommandChannels(mode, coordinateClass) {
  if (mode === 'POSITION') return [{quantity: 'POSITION', unit: COMMAND_UNITS[coordinateClass].POSITION}];
  if (mode === 'VELOCITY') return [{quantity: 'VELOCITY', unit: COMMAND_UNITS[coordinateClass].VELOCITY}];
  if (mode === 'EFFORT') return [{quantity: 'EFFORT', unit: COMMAND_UNITS[coordinateClass].EFFORT}];
  return [
    {quantity: 'POSITION', unit: COMMAND_UNITS[coordinateClass].POSITION},
    {quantity: 'VELOCITY', unit: COMMAND_UNITS[coordinateClass].VELOCITY},
  ];
}

function normalizeCommandSpace(raw, label, mode, coordinateClass) {
  assertKnownKeys(raw, COMMAND_SPACE_KEYS, label);
  if (!Array.isArray(raw.channels) || !raw.channels.length) throw new Error(`${label}.channels must contain at least one channel`);
  const channels = raw.channels.map((channel, index) => {
    const channelLabel = `${label}.channels[${index}]`;
    assertKnownKeys(channel, CHANNEL_KEYS, channelLabel);
    const quantity = String(channel.quantity ?? '').trim().toUpperCase();
    if (!QUANTITY_ORDER_INDEX.has(quantity)) throw new Error(`${channelLabel}.quantity must be POSITION, VELOCITY, or EFFORT`);
    const unit = String(channel.unit ?? '').trim();
    return {quantity, unit};
  });
  if (new Set(channels.map((channel) => channel.quantity)).size !== channels.length) throw new Error(`${label}.channels must contain unique quantities`);
  const canonical = [...channels].sort((a, b) => QUANTITY_ORDER_INDEX.get(a.quantity) - QUANTITY_ORDER_INDEX.get(b.quantity));
  const expected = expectedCommandChannels(mode, coordinateClass);
  if (digestJson(canonical) !== digestJson(expected)) {
    throw new Error(`${label} must equal canonical ${mode}/${coordinateClass} command space`);
  }
  return {channels: canonical};
}

function gainUnits(mode, coordinateClass) {
  if (mode === 'POSITION' || mode === 'IMPEDANCE') return POSITION_GAINS[coordinateClass];
  if (mode === 'VELOCITY') return VELOCITY_GAINS[coordinateClass];
  return null;
}

function normalizeGainValue(raw, label, expectedUnit) {
  assertKnownKeys(raw, GAIN_VALUE_KEYS, label);
  if (raw.unit !== expectedUnit) throw new Error(`${label}.unit must be ${expectedUnit}`);
  return {value: nonnegative(raw.value, `${label}.value`), unit: expectedUnit};
}

function normalizeGainModel(raw, label, mode, coordinateClass) {
  assertRecord(raw, label);
  const kind = String(raw.kind ?? '').trim().toUpperCase();
  if (!GAIN_MODEL_KIND_SET.has(kind)) throw new Error(`${label}.kind must be one of: ${CONTROL_GAIN_MODEL_KINDS.join(', ')}`);
  if (mode === 'EFFORT' && kind !== 'NONE') throw new Error(`${label} must be NONE for EFFORT mode`);
  if (kind === 'NONE') {
    assertKnownKeys(raw, GAIN_NONE_KEYS, label);
    return {kind};
  }
  const units = gainUnits(mode, coordinateClass);
  if (!units) throw new Error(`${label} feedback gains are not defined for ${mode} mode`);
  if (kind === 'P') {
    assertKnownKeys(raw, GAIN_P_KEYS, label);
    return {kind, kp: normalizeGainValue(raw.kp, `${label}.kp`, units.kp)};
  }
  assertKnownKeys(raw, GAIN_PD_KEYS, label);
  return {
    kind,
    kp: normalizeGainValue(raw.kp, `${label}.kp`, units.kp),
    kd: normalizeGainValue(raw.kd, `${label}.kd`, units.kd),
  };
}

function normalizeControllerDelay(raw, label) {
  assertKnownKeys(raw, DELAY_KEYS, label);
  return {value_s: nonnegative(raw.value_s, `${label}.value_s`)};
}

function normalizeProfile(raw, index) {
  const label = `profiles[${index}]`;
  assertKnownKeys(raw, PROFILE_KEYS, label);
  const profileId = assertId(raw.profileId, `${label}.profileId`);
  const selector = normalizeSelector(raw.selector, `${label}.selector`);
  const coordinateClass = normalizeCoordinateClass(raw.coordinateClass, `${label}.coordinateClass`);
  const mode = normalizeAuthorityValue(raw.mode, profileId, 'mode', normalizeMode, `${label}.mode`);
  if (mode.value == null) throw new Error(`${label}.mode.value must be resolved`);
  const definitionExpected = controlProfileAuthoritySubjectId(profileId, 'definition');
  const definitionAuthoritySubjectId = raw.definitionAuthoritySubjectId == null
    ? definitionExpected
    : assertId(raw.definitionAuthoritySubjectId, `${label}.definitionAuthoritySubjectId`);
  if (definitionAuthoritySubjectId !== definitionExpected) throw new Error(`${label}.definitionAuthoritySubjectId must be canonical subject ${definitionExpected}`);
  return {
    profileId,
    selector,
    coordinateClass,
    mode,
    commandSpace: normalizeCommandSpace(raw.commandSpace, `${label}.commandSpace`, mode.value, coordinateClass),
    gainModel: normalizeAuthorityValue(
      raw.gainModel,
      profileId,
      'gain-model',
      (value, valueLabel) => normalizeGainModel(value, valueLabel, mode.value, coordinateClass),
      `${label}.gainModel`,
    ),
    controllerDelay: normalizeAuthorityValue(
      raw.controllerDelay,
      profileId,
      'controller-delay',
      normalizeControllerDelay,
      `${label}.controllerDelay`,
    ),
    definitionAuthoritySubjectId,
  };
}

export function physicalControlIdentityProjection(identityGraph, profiles) {
  validateIdentityGraph(identityGraph);
  if (!Array.isArray(profiles) || !profiles.length) throw new Error('physical control identity projection requires profiles');
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const relationById = new Map(identityGraph.relations.map((relation) => [relation.id, relation]));
  const projected = profiles.map((profile) => {
    const {controllerId, commandsRelationId, actuatorId} = profile.selector;
    const controller = entityById.get(controllerId);
    if (!controller) throw new Error(`control profile ${profile.profileId} references unknown controller identity: ${controllerId}`);
    if (controller.kind !== 'controller') throw new Error(`control profile ${profile.profileId} controller ${controllerId} must be P01 controller, found ${controller.kind}`);
    const actuator = entityById.get(actuatorId);
    if (!actuator) throw new Error(`control profile ${profile.profileId} references unknown actuator identity: ${actuatorId}`);
    if (actuator.kind !== 'actuator') throw new Error(`control profile ${profile.profileId} target ${actuatorId} must be P01 actuator, found ${actuator.kind}`);
    const relation = relationById.get(commandsRelationId);
    if (!relation) throw new Error(`control profile ${profile.profileId} references unknown COMMANDS relation: ${commandsRelationId}`);
    if (relation.kind !== 'COMMANDS' || relation.sourceId !== controllerId) throw new Error(`relation ${commandsRelationId} must be COMMANDS from controller ${controllerId}`);
    if (relation.targetIds.length !== 1 || relation.targetIds[0] !== actuatorId) throw new Error(`control profile ${profile.profileId} COMMANDS target must equal ${actuatorId}`);
    return {
      profileId: profile.profileId,
      controller: {id: controller.id, kind: controller.kind},
      commandsRelation: {id: relation.id, kind: relation.kind, sourceId: relation.sourceId, targetIds: [...relation.targetIds]},
      actuator: {id: actuator.id, kind: actuator.kind},
    };
  }).sort((a, b) => a.profileId.localeCompare(b.profileId));
  return deepFreeze({
    schema: PHYSICAL_CONTROL_IDENTITY_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    profiles: projected,
  });
}

function identityBindingFor(identityGraph, profiles) {
  return {
    schema: PHYSICAL_CONTROL_IDENTITY_BINDING_SCHEMA,
    sourceSchema: identityGraph.schema,
    projectionDigest: digestJson(physicalControlIdentityProjection(identityGraph, profiles)),
  };
}

export function controlActuationProjection(
  actuationModel,
  actuatorIds,
  identityGraph,
  {
    transmissionModel = null,
    mechanismGraph = null,
    articulationGraph = null,
    implementationManifest = null,
    expectedImplementationArtifactDigest = null,
  } = {},
) {
  const validation = validateActuationModel(actuationModel);
  if (!validation.valid) throw new Error(`actuationModel is invalid: ${validation.errors.join('; ')}`);
  validateIdentityGraph(identityGraph);
  if (actuationModel.scopeId !== identityGraph.scopeId || actuationModel.sourceSha256 !== identityGraph.sourceSha256) {
    throw new Error('actuationModel scope/source does not match identityGraph');
  }
  const ids = [...new Set((actuatorIds ?? []).map((id, index) => assertId(id, `actuatorIds[${index}]`)))].sort();
  if (!ids.length) throw new Error('control actuation projection requires actuator IDs');
  const byId = new Map(actuationModel.actuators.map((actuator) => [actuator.actuatorId, actuator]));
  const actuators = ids.map((id) => {
    const actuator = byId.get(id);
    if (!actuator) throw new Error(`control profile references actuator ${id} not present in current actuation model`);
    return structuredClone(actuator);
  });
  const liveScopedModel = createActuationModel({
    scopeId: actuationModel.scopeId,
    sourceSha256: actuationModel.sourceSha256,
    identityGraph,
    transmissionModel,
    mechanismGraph,
    articulationGraph,
    implementationManifest,
    expectedImplementationArtifactDigest,
    actuators,
  });
  return deepFreeze({
    schema: CONTROL_ACTUATION_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    actuators,
    liveDependencyBindings: {
      identityBinding: liveScopedModel.identityBinding,
      articulationBinding: liveScopedModel.articulationBinding,
      transmissionBinding: liveScopedModel.transmissionBinding,
    },
  });
}

function actuationBindingFor(actuationModel, actuatorIds, identityGraph, dependencies = {}) {
  return {
    schema: CONTROL_ACTUATION_BINDING_SCHEMA,
    sourceSchema: actuationModel.schema,
    projectionDigest: digestJson(controlActuationProjection(actuationModel, actuatorIds, identityGraph, dependencies)),
  };
}

function assertProfileActuationCompatibility(profiles, actuationModel) {
  const actuatorById = new Map(actuationModel.actuators.map((actuator) => [actuator.actuatorId, actuator]));
  for (const profile of profiles) {
    const actuator = actuatorById.get(profile.selector.actuatorId);
    if (!actuator) throw new Error(`control profile ${profile.profileId} references actuator ${profile.selector.actuatorId} not present in current actuation model`);
    if (profile.coordinateClass !== actuator.coordinateClass) {
      throw new Error(`control profile ${profile.profileId} coordinateClass is stale; expected ${actuator.coordinateClass}`);
    }
    const supported = actuator.supportedControlModes.value;
    if (supported == null) {
      throw new Error(`control profile ${profile.profileId} cannot select ${profile.mode.value}; actuator supportedControlModes is unresolved`);
    }
    if (!supported.includes(profile.mode.value)) {
      throw new Error(`control profile ${profile.profileId} selects unsupported actuator mode ${profile.mode.value}`);
    }
  }
}

function buildPayload(raw, {
  identityGraph = null,
  actuationModel = null,
  transmissionModel = null,
  mechanismGraph = null,
  articulationGraph = null,
  implementationManifest = null,
  expectedImplementationArtifactDigest = null,
  requireLiveDependencies = false,
} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'controlProfile');
  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  if (raw.schema != null && raw.schema !== CONTROL_PROFILE_SCHEMA) throw new Error(`schema must be ${CONTROL_PROFILE_SCHEMA}`);
  if (!Array.isArray(raw.profiles) || !raw.profiles.length) throw new Error('profiles must contain at least one profile');
  const profiles = raw.profiles.map((profile, index) => normalizeProfile(profile, index)).sort((a, b) => a.profileId.localeCompare(b.profileId));
  if (new Set(profiles.map((profile) => profile.profileId)).size !== profiles.length) throw new Error('profile IDs must be unique');
  if (new Set(profiles.map((profile) => profile.selector.commandsRelationId)).size !== profiles.length) throw new Error('each COMMANDS relation may have only one active control profile');

  let identityBinding;
  if (identityGraph) {
    validateIdentityGraph(identityGraph);
    if (identityGraph.scopeId !== scopeId || identityGraph.sourceSha256 !== sourceSha256) throw new Error('identityGraph scope/source does not match control profile');
    const live = identityBindingFor(identityGraph, profiles);
    if (raw.identityBinding != null && digestJson(normalizeIdentityBinding(raw.identityBinding)) !== digestJson(live)) {
      throw new Error('identityBinding does not bind the current control-relevant identity projection');
    }
    identityBinding = live;
  } else {
    if (requireLiveDependencies) throw new Error('identityGraph is required to create control profile');
    identityBinding = normalizeIdentityBinding(raw.identityBinding);
  }

  const actuatorIds = profiles.map((profile) => profile.selector.actuatorId).sort();
  let actuationBinding;
  if (identityGraph && actuationModel) {
    assertProfileActuationCompatibility(profiles, actuationModel);
    const live = actuationBindingFor(actuationModel, actuatorIds, identityGraph, {
      transmissionModel,
      mechanismGraph,
      articulationGraph,
      implementationManifest,
      expectedImplementationArtifactDigest,
    });
    if (raw.actuationBinding != null && digestJson(normalizeActuationBinding(raw.actuationBinding)) !== digestJson(live)) {
      throw new Error('actuationBinding does not bind current selected actuator capability and live upstream dependencies');
    }
    actuationBinding = live;
  } else {
    if (requireLiveDependencies) throw new Error('actuationModel is required to create control profile');
    actuationBinding = normalizeActuationBinding(raw.actuationBinding);
  }

  return {
    schema: CONTROL_PROFILE_SCHEMA,
    scopeId,
    sourceSha256,
    identityBinding,
    actuationBinding,
    profiles,
    policy: {
      controllerAndActuatorRemainDistinct: true,
      controllerAndRuntimeBindingRemainDistinct: true,
      controlTuningDoesNotRewriteActuation: true,
      commandSpaceUsesCanonicalUnits: true,
      selectedModeRequiresActuatorSupport: true,
      unknownActuatorModesFailClosed: true,
      selectedActuationRequiresLiveUpstreamDependencies: true,
      controllerDelayExcludesActuatorResponseAndRuntimeTransport: true,
      feedbackGainSemanticsAreModeSpecific: true,
      scopedIdentityBinding: true,
      scopedActuationBinding: true,
      semanticAuthorityRemainsExternal: true,
      fabricatedDefaultsForbidden: true,
      controlProfileDoesNotAssertSourceTruth: true,
      modelDoesNotAuthorizeClosure: true,
    },
  };
}

export function createControlProfile(input = {}) {
  const payload = buildPayload(input, {
    identityGraph: input.identityGraph ?? null,
    actuationModel: input.actuationModel ?? null,
    transmissionModel: input.transmissionModel ?? null,
    mechanismGraph: input.mechanismGraph ?? null,
    articulationGraph: input.articulationGraph ?? null,
    implementationManifest: input.implementationManifest ?? null,
    expectedImplementationArtifactDigest: input.expectedImplementationArtifactDigest ?? null,
    requireLiveDependencies: true,
  });
  return deepFreeze({...payload, controlProfileDigest: digestJson(payload)});
}

export function validateControlProfile(value) {
  const errors = [];
  try {
    if (value?.schema !== CONTROL_PROFILE_SCHEMA) errors.push('invalid schema');
    const payload = buildPayload(value);
    const recreated = {...payload, controlProfileDigest: digestJson(payload)};
    if (recreated.controlProfileDigest !== value?.controlProfileDigest) errors.push('control profile digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('control profile is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateControlProfileBindings(value, identityGraph, {
  actuationModel = null,
  transmissionModel = null,
  mechanismGraph = null,
  articulationGraph = null,
  implementationManifest = null,
  expectedImplementationArtifactDigest = null,
} = {}) {
  const errors = [];
  const validation = validateControlProfile(value);
  if (!validation.valid) errors.push(`control profile invalid: ${validation.errors.join('; ')}`);
  try {
    if (!errors.length) {
      const payload = buildPayload({
        ...value,
        identityGraph,
        actuationModel,
        transmissionModel,
        mechanismGraph,
        articulationGraph,
        implementationManifest,
        expectedImplementationArtifactDigest,
      }, {
        identityGraph,
        actuationModel,
        transmissionModel,
        mechanismGraph,
        articulationGraph,
        implementationManifest,
        expectedImplementationArtifactDigest,
        requireLiveDependencies: true,
      });
      const recreated = {...payload, controlProfileDigest: digestJson(payload)};
      if (recreated.controlProfileDigest !== value.controlProfileDigest) {
        errors.push('control profile does not reproduce against current scoped dependencies');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function controlProfileAuthoritySubjectIds(model) {
  const ids = [];
  for (const profile of model.profiles ?? []) {
    ids.push(profile.definitionAuthoritySubjectId);
    ids.push(profile.mode.authoritySubjectId);
    ids.push(profile.gainModel.authoritySubjectId);
    ids.push(profile.controllerDelay.authoritySubjectId);
  }
  return [...ids].sort();
}

export function validateControlProfileAuthority(model, authoritySet) {
  const errors = [];
  const modelValidation = validateControlProfile(model);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!modelValidation.valid) errors.push(`control profile invalid: ${modelValidation.errors.join('; ')}`);
  if (!authorityValidation.valid) errors.push(`authority set invalid: ${authorityValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: [], unknownSubjectIds: []};
  if (authoritySet.scopeId !== model.scopeId || authoritySet.sourceSha256 !== model.sourceSha256) errors.push('authority set scope/source does not match control profile');
  if (authoritySet.targetSchema !== model.schema || authoritySet.targetDigest !== model.controlProfileDigest) errors.push('authority set does not bind exact control profile');

  const required = controlProfileAuthoritySubjectIds(model);
  const entryBySubject = new Map(authoritySet.entries.map((entry) => [entry.subjectId, entry]));
  const missingSubjectIds = required.filter((subjectId) => !entryBySubject.has(subjectId));
  if (missingSubjectIds.length) errors.push(`missing semantic authority for control subject(s): ${missingSubjectIds.join(', ')}`);
  const unknownSubjectIds = authoritySet.entries.map((entry) => entry.subjectId).filter((subjectId) => !required.includes(subjectId)).sort();
  if (unknownSubjectIds.length) errors.push(`authority set references subject(s) outside control profile: ${unknownSubjectIds.join(', ')}`);

  for (const profile of model.profiles) {
    const definition = entryBySubject.get(profile.definitionAuthoritySubjectId);
    if (definition && !CONSTRUCTION_AUTHORITIES.has(definition.authority)) {
      errors.push(`control profile definition ${profile.profileId} requires observed, inferred, or engineered authority`);
    }
    const mode = entryBySubject.get(profile.mode.authoritySubjectId);
    if (mode && !CONSTRUCTION_AUTHORITIES.has(mode.authority)) {
      errors.push(`control mode ${profile.profileId} requires observed, inferred, or engineered authority`);
    }
    for (const property of [profile.gainModel, profile.controllerDelay]) {
      const entry = entryBySubject.get(property.authoritySubjectId);
      if (!entry) continue;
      if (property.value == null && entry.authority !== 'unknown') {
        errors.push(`unresolved control subject ${property.authoritySubjectId} requires unknown authority`);
      }
      if (property.value != null && !CONSTRUCTION_AUTHORITIES.has(entry.authority)) {
        errors.push(`resolved control subject ${property.authoritySubjectId} requires observed, inferred, or engineered authority`);
      }
    }
  }

  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

export function controlProfileForRelation(model, commandsRelationId) {
  const id = assertId(commandsRelationId, 'commandsRelationId');
  const validation = validateControlProfile(model);
  if (!validation.valid) throw new Error(`control profile invalid: ${validation.errors.join('; ')}`);
  return model.profiles.find((profile) => profile.selector.commandsRelationId === id) ?? null;
}

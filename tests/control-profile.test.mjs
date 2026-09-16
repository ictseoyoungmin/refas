import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  controlActuationProjection,
  controlProfileAuthoritySubjectIds,
  controlProfileForRelation,
  createActuationModel,
  createControlProfile,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  createTransmissionModel,
  digestJson,
  physicalControlIdentityProjection,
  validateControlProfile,
  validateControlProfileAuthority,
  validateControlProfileBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function identityInput({commandTarget = 'actuator-drive', withRuntimeBinding = false} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'controller-main', kind: 'controller'},
    {id: 'controller-unrelated', kind: 'controller'},
    {id: 'actuator-drive', kind: 'actuator'},
    {id: 'actuator-load', kind: 'actuator'},
    {id: 'actuator-extra-a', kind: 'actuator'},
    {id: 'actuator-extra-b', kind: 'actuator'},
    {id: 'tx-drive', kind: 'transmission'},
    {id: 'tx-extra', kind: 'transmission'},
  ];
  const relations = [
    {id: 'contains-controller-main', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-main']},
    {id: 'contains-controller-unrelated', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-unrelated']},
    {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
    {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
    {id: 'contains-actuator-extra-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-extra-a']},
    {id: 'contains-actuator-extra-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-extra-b']},
    {id: 'contains-tx-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
    {id: 'contains-tx-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-extra']},
    {id: 'tx-drive-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive', 'actuator-load']},
    {id: 'tx-extra-maps', kind: 'MAPS', sourceId: 'tx-extra', targetIds: ['actuator-extra-a', 'actuator-extra-b']},
    {id: 'actuator-drive-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
    {id: 'actuator-extra-a-drives', kind: 'DRIVES', sourceId: 'actuator-extra-a', targetIds: ['tx-extra']},
    {id: 'controller-main-commands-drive', kind: 'COMMANDS', sourceId: 'controller-main', targetIds: [commandTarget]},
    {id: 'controller-unrelated-commands-load', kind: 'COMMANDS', sourceId: 'controller-unrelated', targetIds: ['actuator-load']},
  ];
  if (withRuntimeBinding) {
    entities.push({id: 'runtime-main', kind: 'runtime-endpoint'});
    relations.push({id: 'contains-runtime-main', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-main']});
    relations.push({id: 'runtime-main-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-main', targetIds: ['controller-main']});
  }
  return {scopeId: 'whole', sourceSha256: D(), entities, relations};
}

function transmissionModel(identityGraph, {driveRatio = 2, extraRatio = 3} = {}) {
  return createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    transmissions: [
      {
        transmissionId: 'tx-drive', mapsRelationIds: ['tx-drive-maps'], contextMechanismIds: [],
        inputSpace: {id: 'drive-in', coordinates: [{id: 'drive-q', semanticIdentityId: 'actuator-drive'}], order: ['drive-q']},
        outputSpace: {id: 'drive-out', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
        mapping: {kind: 'RATIO', ratio: driveRatio, offset: 0},
      },
      {
        transmissionId: 'tx-extra', mapsRelationIds: ['tx-extra-maps'], contextMechanismIds: [],
        inputSpace: {id: 'extra-in', coordinates: [{id: 'extra-a-q', semanticIdentityId: 'actuator-extra-a'}], order: ['extra-a-q']},
        outputSpace: {id: 'extra-out', coordinates: [{id: 'extra-b-q', semanticIdentityId: 'actuator-extra-b'}], order: ['extra-b-q']},
        mapping: {kind: 'RATIO', ratio: extraRatio, offset: 0},
      },
    ],
  });
}

function actuatorRecord({actuatorId, drivesRelationId, drivenTargetId, supported = ['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE'], effort = 12, latency = 0.002} = {}) {
  return {
    actuatorId, drivesRelationId, drivenTargetId, drivenTargetKind: 'transmission',
    kind: 'ROTARY_ELECTRIC', coordinateClass: 'ROTARY',
    supportedControlModes: {value: supported},
    positionRange: {value: {kind: 'BOUNDED', minimum: -3.1, maximum: 3.1, unit: 'rad'}},
    velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}},
    effortLimit: {value: {maxAbs: effort, unit: 'N_m'}},
    stiffness: {value: null},
    damping: {value: {value: 0.05, unit: 'N_m_s_per_rad'}},
    armature: {value: {value: 0.001, unit: 'kg_m2'}},
    responseLatency: {value: {value: latency, unit: 's'}},
  };
}

function actuationModel(identityGraph, transmission, {driveSupported = ['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE'], driveEffort = 12, extraEffort = 6, driveLatency = 0.002} = {}) {
  return createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel: transmission,
    actuators: [
      actuatorRecord({actuatorId: 'actuator-drive', drivesRelationId: 'actuator-drive-drives', drivenTargetId: 'tx-drive', supported: driveSupported, effort: driveEffort, latency: driveLatency}),
      actuatorRecord({actuatorId: 'actuator-extra-a', drivesRelationId: 'actuator-extra-a-drives', drivenTargetId: 'tx-extra', supported: ['POSITION'], effort: extraEffort}),
    ],
  });
}

function positionProfile() {
  return {
    profileId: 'control-drive',
    selector: {controllerId: 'controller-main', commandsRelationId: 'controller-main-commands-drive', actuatorId: 'actuator-drive'},
    coordinateClass: 'ROTARY',
    mode: {value: 'POSITION'},
    commandSpace: {channels: [{quantity: 'POSITION', unit: 'rad'}]},
    gainModel: {value: {kind: 'PD', kp: {value: 20, unit: 'N_m_per_rad'}, kd: {value: 0.4, unit: 'N_m_s_per_rad'}}},
    controllerDelay: {value: {value_s: 0.001}},
  };
}

function stack(options = {}) {
  const identityGraph = createPhysicalIdentityGraph(identityInput(options));
  const transmission = transmissionModel(identityGraph, options);
  const actuation = actuationModel(identityGraph, transmission, options);
  const model = createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph, actuationModel: actuation, transmissionModel: transmission, profiles: [positionProfile()]});
  return {identityGraph, transmissionModel: transmission, actuationModel: actuation, model};
}

function authoritySet(model, {nullGain = false, nullDelay = false} = {}) {
  const profile = model.profiles[0];
  const nullSubjects = new Set();
  if (nullGain) nullSubjects.add(profile.gainModel.authoritySubjectId);
  if (nullDelay) nullSubjects.add(profile.controllerDelay.authoritySubjectId);
  return createSemanticAuthoritySet({
    scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.controlProfileDigest,
    entries: controlProfileAuthoritySubjectIds(model).map((subjectId, index) => nullSubjects.has(subjectId) ? {
      id: `authority-${index}`, subjectId, authority: 'unknown', proposition: `unresolved ${subjectId}`, reason: 'controller tuning value is unresolved', basis: [],
    } : {
      id: `authority-${index}`, subjectId, authority: 'engineered', proposition: `control property ${subjectId}`, reason: 'explicit controller configuration decision', basis: [{kind: 'functional-requirement', ref: `control/${subjectId}`}],
    }),
  });
}

test('control profile keeps controller, actuator, actuation, and runtime ownership distinct', () => {
  const {model} = stack();
  assert.deepEqual(validateControlProfile(model), {valid: true, errors: []});
  assert.equal(model.policy.controllerAndActuatorRemainDistinct, true);
  assert.equal(model.policy.controllerAndRuntimeBindingRemainDistinct, true);
  assert.equal(model.policy.controlTuningDoesNotRewriteActuation, true);
  assert.equal(model.policy.controllerDelayExcludesActuatorResponseAndRuntimeTransport, true);
  assert.deepEqual(model.profiles[0].commandSpace, {channels: [{quantity: 'POSITION', unit: 'rad'}]});
  assert.equal(controlProfileForRelation(model, 'controller-main-commands-drive')?.profileId, 'control-drive');
  assert.equal('identityGraph' in model, false);
  assert.equal('actuationModel' in model, false);
});

test('P01 COMMANDS selector is exact-bound and target drift fails closed', () => {
  const base = stack();
  assert.equal(digestJson(physicalControlIdentityProjection(base.identityGraph, base.model.profiles)), base.model.identityBinding.projectionDigest);
  const identityGraph = createPhysicalIdentityGraph(identityInput({commandTarget: 'actuator-load'}));
  const transmission = transmissionModel(identityGraph);
  const actuation = actuationModel(identityGraph, transmission);
  const validation = validateControlProfileBindings(base.model, identityGraph, {actuationModel: actuation, transmissionModel: transmission});
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /COMMANDS target|identityBinding|projection/);
});

test('scoped identity binding ignores P09-style runtime binding edits', () => {
  const base = stack();
  const identityGraph = createPhysicalIdentityGraph(identityInput({withRuntimeBinding: true}));
  const transmission = transmissionModel(identityGraph);
  const actuation = actuationModel(identityGraph, transmission);
  const validation = validateControlProfileBindings(base.model, identityGraph, {actuationModel: actuation, transmissionModel: transmission});
  assert.equal(validation.valid, true, validation.errors.join('\n'));
});

test('selected control mode must be explicitly supported by the live P07 actuator', () => {
  const identityGraph = createPhysicalIdentityGraph(identityInput());
  const transmission = transmissionModel(identityGraph);
  const unsupported = actuationModel(identityGraph, transmission, {driveSupported: ['EFFORT']});
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph, actuationModel: unsupported, transmissionModel: transmission, profiles: [positionProfile()]}), /unsupported actuator mode POSITION/);
  const unknown = actuationModel(identityGraph, transmission, {driveSupported: null});
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph, actuationModel: unknown, transmissionModel: transmission, profiles: [positionProfile()]}), /supportedControlModes is unresolved/);
});

test('command space is canonical for mode and coordinate class', () => {
  const base = stack();
  const impedance = positionProfile();
  impedance.mode.value = 'IMPEDANCE';
  impedance.commandSpace.channels = [{quantity: 'VELOCITY', unit: 'rad_s'}, {quantity: 'POSITION', unit: 'rad'}];
  const model = createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [impedance]});
  assert.deepEqual(model.profiles[0].commandSpace.channels, [{quantity: 'POSITION', unit: 'rad'}, {quantity: 'VELOCITY', unit: 'rad_s'}]);
  const wrongUnit = positionProfile();
  wrongUnit.commandSpace.channels[0].unit = 'm';
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [wrongUnit]}), /canonical POSITION\/ROTARY command space/);
});

test('feedback gains are typed by mode and do not leak into effort or actuator semantics', () => {
  const base = stack();
  const effort = positionProfile();
  effort.mode.value = 'EFFORT';
  effort.commandSpace = {channels: [{quantity: 'EFFORT', unit: 'N_m'}]};
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [effort]}), /must be NONE for EFFORT mode/);
  effort.gainModel.value = {kind: 'NONE'};
  assert.equal(createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [effort]}).profiles[0].gainModel.value.kind, 'NONE');
  const velocity = positionProfile();
  velocity.mode.value = 'VELOCITY';
  velocity.commandSpace = {channels: [{quantity: 'VELOCITY', unit: 'rad_s'}]};
  velocity.gainModel.value = {kind: 'PD', kp: {value: 2, unit: 'N_m_s_per_rad'}, kd: {value: 0.1, unit: 'N_m_s2_per_rad'}};
  assert.equal(createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [velocity]}).profiles[0].gainModel.value.kd.unit, 'N_m_s2_per_rad');
  const gainLeak = positionProfile(); gainLeak.kp = 100;
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [gainLeak]}), /unsupported field/);
  assert.equal(base.actuationModel.actuators[0].stiffness.value, null);
  assert.equal(base.actuationModel.actuators[0].damping.value.value, 0.05);
});

test('controller delay is nonnegative and P09 runtime fields are rejected', () => {
  const base = stack();
  const negativeDelay = positionProfile(); negativeDelay.controllerDelay.value.value_s = -0.001;
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [negativeDelay]}), /must be non-negative/);
  const runtimeLeak = positionProfile(); runtimeLeak.motorIndex = 4;
  assert.throws(() => createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [runtimeLeak]}), /unsupported field/);
});

test('scoped P07 binding ignores unrelated actuator changes but catches selected actuator changes', () => {
  const base = stack();
  const unrelatedActuation = actuationModel(base.identityGraph, base.transmissionModel, {extraEffort: 20});
  assert.equal(validateControlProfileBindings(base.model, base.identityGraph, {actuationModel: unrelatedActuation, transmissionModel: base.transmissionModel}).valid, true);
  const selectedActuation = actuationModel(base.identityGraph, base.transmissionModel, {driveEffort: 20});
  assert.equal(validateControlProfileBindings(base.model, base.identityGraph, {actuationModel: selectedActuation, transmissionModel: base.transmissionModel}).valid, false);
  const projection = controlActuationProjection(base.actuationModel, ['actuator-drive'], base.identityGraph, {transmissionModel: base.transmissionModel});
  assert.equal(digestJson(projection), base.model.actuationBinding.projectionDigest);
});

test('selected P07 upstream transmission drift invalidates the control profile', () => {
  const base = stack();
  const changedTransmission = transmissionModel(base.identityGraph, {driveRatio: 4, extraRatio: 3});
  const changedActuation = actuationModel(base.identityGraph, changedTransmission);
  assert.equal(validateControlProfileBindings(base.model, base.identityGraph, {actuationModel: changedActuation, transmissionModel: changedTransmission}).valid, false);
});

test('semantic authority is exact and unresolved gain/delay require unknown authority', () => {
  const base = stack();
  assert.equal(validateControlProfileAuthority(base.model, authoritySet(base.model)).valid, true);
  const unresolved = positionProfile(); unresolved.gainModel.value = null; unresolved.controllerDelay.value = null;
  const model = createControlProfile({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, profiles: [unresolved]});
  const authority = authoritySet(model, {nullGain: true, nullDelay: true});
  assert.equal(validateControlProfileAuthority(model, authority).valid, true);
  const wrong = createSemanticAuthoritySet({scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.controlProfileDigest, entries: authority.entries.map((entry) => entry.subjectId === model.profiles[0].gainModel.authoritySubjectId ? {id: entry.id, subjectId: entry.subjectId, authority: 'engineered', proposition: entry.proposition, reason: 'backend convenience', basis: [{kind: 'downstream-requirement', ref: 'backend/default'}]} : {id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis})});
  assert.equal(validateControlProfileAuthority(model, wrong).valid, false);
});

test('tampering with controller tuning invalidates the canonical digest', () => {
  const {model} = stack();
  const tampered = structuredClone(model); tampered.profiles[0].gainModel.value.kp.value = 999;
  assert.equal(validateControlProfile(tampered).valid, false);
});

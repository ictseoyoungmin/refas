import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  actuationAuthoritySubjectIds,
  actuationForActuator,
  actuationTransmissionProjection,
  createActuationModel,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  createTransmissionModel,
  digestJson,
  physicalActuationIdentityProjection,
  validateActuationModel,
  validateActuationModelAuthority,
  validateActuationModelBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function identityInput({withController = false, driveTarget = 'tx-drive'} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'actuator-drive', kind: 'actuator'},
    {id: 'actuator-load', kind: 'actuator'},
    {id: 'actuator-extra-a', kind: 'actuator'},
    {id: 'actuator-extra-b', kind: 'actuator'},
    {id: 'tx-drive', kind: 'transmission'},
    {id: 'tx-extra', kind: 'transmission'},
  ];
  const relations = [
    {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
    {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
    {id: 'contains-actuator-extra-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-extra-a']},
    {id: 'contains-actuator-extra-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-extra-b']},
    {id: 'contains-tx-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
    {id: 'contains-tx-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-extra']},
    {id: 'tx-drive-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive', 'actuator-load']},
    {id: 'tx-extra-maps', kind: 'MAPS', sourceId: 'tx-extra', targetIds: ['actuator-extra-a', 'actuator-extra-b']},
    {id: 'actuator-drive-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: [driveTarget]},
  ];
  if (withController) {
    entities.push({id: 'controller-extra', kind: 'controller'});
    relations.push({id: 'contains-controller-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-extra']});
    relations.push({id: 'controller-commands-load', kind: 'COMMANDS', sourceId: 'controller-extra', targetIds: ['actuator-load']});
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

function resolvedActuator() {
  return {
    actuatorId: 'actuator-drive',
    drivesRelationId: 'actuator-drive-drives',
    drivenTargetId: 'tx-drive',
    drivenTargetKind: 'transmission',
    kind: 'ROTARY_ELECTRIC',
    coordinateClass: 'ROTARY',
    supportedControlModes: {value: ['POSITION', 'EFFORT']},
    positionRange: {value: {minimum: -3.1, maximum: 3.1, unit: 'rad'}},
    velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}},
    effortLimit: {value: {maxAbs: 12, unit: 'N_m'}},
    stiffness: {value: null},
    damping: {value: {value: 0.05, unit: 'N_m_s_per_rad'}},
    armature: {value: {value: 0.001, unit: 'kg_m2'}},
    responseLatency: {value: {value: 0.002, unit: 's'}},
  };
}

function modelStack({withController = false, driveTarget = 'tx-drive', driveRatio = 2, extraRatio = 3} = {}) {
  const identityGraph = createPhysicalIdentityGraph(identityInput({withController, driveTarget}));
  const transmission = transmissionModel(identityGraph, {driveRatio, extraRatio});
  const model = createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel: transmission,
    actuators: [resolvedActuator()],
  });
  return {identityGraph, transmissionModel: transmission, model};
}

function authoritySet(model) {
  const actuator = model.actuators[0];
  const nullSubjects = new Set([
    actuator.stiffness.authoritySubjectId,
  ]);
  return createSemanticAuthoritySet({
    scopeId: model.scopeId,
    sourceSha256: model.sourceSha256,
    targetSchema: model.schema,
    targetDigest: model.actuationDigest,
    entries: actuationAuthoritySubjectIds(model).map((subjectId, index) => {
      if (nullSubjects.has(subjectId)) {
        return {
          id: `authority-${index}`,
          subjectId,
          authority: 'unknown',
          proposition: `unresolved ${subjectId}`,
          reason: 'capability value is not resolved',
          basis: [],
        };
      }
      return {
        id: `authority-${index}`,
        subjectId,
        authority: 'engineered',
        proposition: `actuation property ${subjectId}`,
        reason: 'explicit physical capability construction decision',
        basis: [{kind: 'functional-requirement', ref: `actuation/${subjectId}`}],
      };
    }),
  });
}

test('actuation model keeps actuator, transmission, controller, and runtime ownership distinct', () => {
  const {model} = modelStack();
  assert.deepEqual(validateActuationModel(model), {valid: true, errors: []});
  assert.equal(model.actuators[0].kind, 'ROTARY_ELECTRIC');
  assert.equal(model.actuators[0].coordinateClass, 'ROTARY');
  assert.equal(model.policy.actuatorAndTransmissionRemainDistinct, true);
  assert.equal(model.policy.actuatorAndControllerRemainDistinct, true);
  assert.equal(model.policy.actuatorAndRuntimeBindingRemainDistinct, true);
  assert.equal(model.policy.supportedControlModesAreCapabilityNotTuning, true);
  assert.equal('identityGraph' in model, false);
  assert.equal('transmissionModel' in model, false);
  assert.notEqual(model.identityBinding, null);
  assert.notEqual(model.transmissionBinding, null);
  assert.equal(actuationForActuator(model, 'actuator-drive')?.actuatorId, 'actuator-drive');
});

test('rotary and linear capability units are explicit and cannot silently cross', () => {
  const base = modelStack();
  const wrongVelocity = resolvedActuator();
  wrongVelocity.velocityLimit.value.unit = 'm_s';
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, transmissionModel: base.transmissionModel, actuators: [wrongVelocity]}), /unit must be rad_s/);

  const wrongKind = resolvedActuator();
  wrongKind.kind = 'LINEAR_ELECTRIC';
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, transmissionModel: base.transmissionModel, actuators: [wrongKind]}), /LINEAR_ELECTRIC requires LINEAR/);

  const wrongEffort = resolvedActuator();
  wrongEffort.effortLimit.value.maxAbs = 0;
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, transmissionModel: base.transmissionModel, actuators: [wrongEffort]}), /must be positive/);

  const wrongRange = resolvedActuator();
  wrongRange.positionRange.value = {minimum: 2, maximum: -2, unit: 'rad'};
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, transmissionModel: base.transmissionModel, actuators: [wrongRange]}), /minimum must be <= maximum/);
});

test('unresolved physical capability stays null instead of receiving simulator defaults', () => {
  const stack = modelStack();
  const unresolved = resolvedActuator();
  unresolved.supportedControlModes.value = null;
  unresolved.positionRange.value = null;
  unresolved.velocityLimit.value = null;
  unresolved.effortLimit.value = null;
  unresolved.stiffness.value = null;
  unresolved.damping.value = null;
  unresolved.armature.value = null;
  unresolved.responseLatency.value = null;
  const model = createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, transmissionModel: stack.transmissionModel, actuators: [unresolved]});
  const actuator = model.actuators[0];
  assert.equal(actuator.positionRange.value, null);
  assert.equal(actuator.velocityLimit.value, null);
  assert.equal(actuator.effortLimit.value, null);
  assert.equal(actuator.stiffness.value, null);
  assert.equal(model.policy.fabricatedDefaultsForbidden, true);
});

test('P01 DRIVES relation and target kind are exact-bound and target drift fails closed', () => {
  const stack = modelStack();
  const projection = physicalActuationIdentityProjection(stack.identityGraph, stack.model.actuators);
  assert.equal(digestJson(projection), stack.model.identityBinding.projectionDigest);

  const driftedIdentity = createPhysicalIdentityGraph(identityInput({driveTarget: 'tx-extra'}));
  const validation = validateActuationModelBindings(stack.model, driftedIdentity, {transmissionModel: stack.transmissionModel});
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /DRIVES target|identityBinding|projection/);
});

test('scoped identity binding ignores unrelated controller edits', () => {
  const base = modelStack();
  const identityGraph = createPhysicalIdentityGraph(identityInput({withController: true}));
  const transmission = transmissionModel(identityGraph);
  const validation = validateActuationModelBindings(base.model, identityGraph, {transmissionModel: transmission});
  assert.equal(validation.valid, true, validation.errors.join('\n'));
});

test('scoped P06 binding ignores unrelated transmission edits but catches selected mapping drift', () => {
  const base = modelStack();
  const unrelatedChanged = transmissionModel(base.identityGraph, {driveRatio: 2, extraRatio: 9});
  const unrelatedValidation = validateActuationModelBindings(base.model, base.identityGraph, {transmissionModel: unrelatedChanged});
  assert.equal(unrelatedValidation.valid, true, unrelatedValidation.errors.join('\n'));

  const selectedChanged = transmissionModel(base.identityGraph, {driveRatio: 4, extraRatio: 3});
  const selectedValidation = validateActuationModelBindings(base.model, base.identityGraph, {transmissionModel: selectedChanged});
  assert.equal(selectedValidation.valid, false);

  const projection = actuationTransmissionProjection(base.transmissionModel, ['tx-drive'], base.identityGraph);
  assert.equal(digestJson(projection), base.model.transmissionBinding.projectionDigest);
});

test('control mode declaration is a canonical set, not controller tuning', () => {
  const stack = modelStack();
  const reordered = resolvedActuator();
  reordered.supportedControlModes.value = ['EFFORT', 'POSITION'];
  const model = createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, transmissionModel: stack.transmissionModel, actuators: [reordered]});
  assert.equal(model.actuationDigest, stack.model.actuationDigest);
  assert.deepEqual(model.actuators[0].supportedControlModes.value, ['EFFORT', 'POSITION']);

  const gainLeak = resolvedActuator();
  gainLeak.kp = 100;
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, transmissionModel: stack.transmissionModel, actuators: [gainLeak]}), /unsupported field/);

  const runtimeLeak = resolvedActuator();
  runtimeLeak.motorIndex = 4;
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, transmissionModel: stack.transmissionModel, actuators: [runtimeLeak]}), /unsupported field/);
});

test('semantic authority is exact per actuation property and unknown is required for null values', () => {
  const {model} = modelStack();
  const authority = authoritySet(model);
  assert.equal(validateActuationModelAuthority(model, authority).valid, true);

  const wrongUnknown = createSemanticAuthoritySet({
    scopeId: model.scopeId,
    sourceSha256: model.sourceSha256,
    targetSchema: model.schema,
    targetDigest: model.actuationDigest,
    entries: authority.entries.map((entry) => entry.subjectId === model.actuators[0].stiffness.authoritySubjectId
      ? {id: entry.id, subjectId: entry.subjectId, authority: 'engineered', proposition: entry.proposition, reason: 'guessed simulator value', basis: [{kind: 'downstream-requirement', ref: 'simulator/default'}]}
      : {id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis}),
  });
  assert.equal(validateActuationModelAuthority(model, wrongUnknown).valid, false);

  const missingEntries = authority.entries.slice(1).map((entry) => ({id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis}));
  const missing = createSemanticAuthoritySet({scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.actuationDigest, entries: missingEntries});
  assert.equal(validateActuationModelAuthority(model, missing).valid, false);
});

test('tampering with actuator capability invalidates the canonical digest', () => {
  const {model} = modelStack();
  const tampered = structuredClone(model);
  tampered.actuators[0].effortLimit.value.maxAbs = 99;
  assert.equal(validateActuationModel(tampered).valid, false);
});

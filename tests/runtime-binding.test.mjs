import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createActuationModel,
  createPhysicalIdentityGraph,
  createRuntimeBinding,
  createSemanticAuthoritySet,
  createTransmissionModel,
  digestJson,
  physicalRuntimeIdentityProjection,
  runtimeBindingAuthoritySubjectIds,
  runtimeBindingForEndpoint,
  validateRuntimeBinding,
  validateRuntimeBindingAuthority,
  validateRuntimeBindingBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function identityInput({actuatorRuntimeTarget = 'actuator-drive', withUnrelatedRuntime = false} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'controller-main', kind: 'controller'},
    {id: 'actuator-drive', kind: 'actuator'},
    {id: 'actuator-load', kind: 'actuator'},
    {id: 'tx-drive', kind: 'transmission'},
    {id: 'runtime-controller', kind: 'runtime-endpoint'},
    {id: 'runtime-actuator', kind: 'runtime-endpoint'},
  ];
  const relations = [
    {id: 'contains-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-main']},
    {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
    {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
    {id: 'contains-tx', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
    {id: 'contains-runtime-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-controller']},
    {id: 'contains-runtime-actuator', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-actuator']},
    {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive', 'actuator-load']},
    {id: 'drive-drives-tx', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
    {id: 'controller-commands-drive', kind: 'COMMANDS', sourceId: 'controller-main', targetIds: ['actuator-drive']},
    {id: 'runtime-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller', targetIds: ['controller-main']},
    {id: 'runtime-binds-actuator', kind: 'BINDS_RUNTIME', sourceId: 'runtime-actuator', targetIds: [actuatorRuntimeTarget]},
  ];
  if (withUnrelatedRuntime) {
    entities.push({id: 'runtime-extra', kind: 'runtime-endpoint'});
    relations.push({id: 'contains-runtime-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-extra']});
    relations.push({id: 'runtime-extra-binds-load', kind: 'BINDS_RUNTIME', sourceId: 'runtime-extra', targetIds: ['actuator-load']});
  }
  return {scopeId: 'whole', sourceSha256: D(), entities, relations};
}

function transmissionModel(identityGraph, ratio = 2) {
  return createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    transmissions: [{
      transmissionId: 'tx-drive', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'runtime-in', coordinates: [{id: 'drive-q', semanticIdentityId: 'actuator-drive'}], order: ['drive-q']},
      outputSpace: {id: 'runtime-out', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
      mapping: {kind: 'RATIO', ratio, offset: 0},
    }],
  });
}

function actuationModel(identityGraph, transmission, effort = 12) {
  return createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel: transmission,
    actuators: [{
      actuatorId: 'actuator-drive', drivesRelationId: 'drive-drives-tx', drivenTargetId: 'tx-drive', drivenTargetKind: 'transmission',
      kind: 'ROTARY_ELECTRIC', coordinateClass: 'ROTARY',
      supportedControlModes: {value: ['POSITION', 'EFFORT']},
      positionRange: {value: {kind: 'CONTINUOUS', unit: 'rad'}},
      velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}},
      effortLimit: {value: {maxAbs: effort, unit: 'N_m'}},
      stiffness: {value: null}, damping: {value: null}, armature: {value: null}, responseLatency: {value: null},
    }],
  });
}

function controllerBinding({runtimeIndex = 1} = {}) {
  return {
    bindingId: 'binding-controller',
    selector: {runtimeEndpointId: 'runtime-controller', bindsRuntimeRelationId: 'runtime-binds-controller', targetId: 'controller-main', targetKind: 'controller'},
    coordinateClass: 'NONE',
    device: {value: 'device-controller'},
    bus: {value: 'bus-main'},
    runtimeIndex: {value: runtimeIndex},
    sign: {value: null}, zeroOffset: {value: null}, encoderScale: {value: null},
    transportDelay: {value: {value_s: 0.001}},
  };
}

function actuatorBinding() {
  return {
    bindingId: 'binding-actuator',
    selector: {runtimeEndpointId: 'runtime-actuator', bindsRuntimeRelationId: 'runtime-binds-actuator', targetId: 'actuator-drive', targetKind: 'actuator'},
    coordinateClass: 'ROTARY',
    device: {value: 'device-drive'},
    bus: {value: 'bus-main'},
    runtimeIndex: {value: 4},
    sign: {value: -1},
    zeroOffset: {value: {value: 0.125, unit: 'rad'}},
    encoderScale: {value: {value: 0.001, unit: 'rad_per_runtime_unit'}},
    transportDelay: {value: {value_s: 0.002}},
  };
}

function stack(options = {}) {
  const identityGraph = createPhysicalIdentityGraph(identityInput(options));
  const transmission = transmissionModel(identityGraph, options.ratio ?? 2);
  const actuation = actuationModel(identityGraph, transmission, options.effort ?? 12);
  const model = createRuntimeBinding({
    scopeId: 'whole', sourceSha256: D(), identityGraph, actuationModel: actuation, transmissionModel: transmission,
    bindings: [controllerBinding(options), actuatorBinding()],
  });
  return {identityGraph, transmissionModel: transmission, actuationModel: actuation, model};
}

function authoritySet(model) {
  const nullSubjects = new Set();
  for (const binding of model.bindings) {
    for (const property of [binding.bus, binding.runtimeIndex, binding.sign, binding.zeroOffset, binding.encoderScale, binding.transportDelay]) {
      if (property.value == null) nullSubjects.add(property.authoritySubjectId);
    }
  }
  return createSemanticAuthoritySet({
    scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.runtimeBindingDigest,
    entries: runtimeBindingAuthoritySubjectIds(model).map((subjectId, index) => nullSubjects.has(subjectId) ? {
      id: `authority-${index}`, subjectId, authority: 'unknown', proposition: `unresolved ${subjectId}`, reason: 'runtime calibration is unresolved', basis: [],
    } : {
      id: `authority-${index}`, subjectId, authority: 'engineered', proposition: `runtime configuration ${subjectId}`, reason: 'explicit deployment configuration', basis: [{kind: 'functional-requirement', ref: `runtime/${subjectId}`}],
    }),
  });
}

test('runtime binding keeps endpoint identity, locator, and upstream semantics distinct', () => {
  const {model} = stack();
  assert.deepEqual(validateRuntimeBinding(model), {valid: true, errors: []});
  assert.equal(model.policy.runtimeIndexIsNotSemanticIdentity, true);
  assert.equal(model.policy.runtimeCalibrationDoesNotRewriteUpstreamSemantics, true);
  assert.equal(model.policy.zeroOffsetIsNotEulerOrientation, true);
  assert.equal(model.policy.controllerDelayAndTransportDelayRemainDistinct, true);
  assert.equal(runtimeBindingForEndpoint(model, 'runtime-actuator')?.selector.targetId, 'actuator-drive');
  assert.equal('identityGraph' in model, false);
  assert.equal('actuationModel' in model, false);
});

test('P01 BINDS_RUNTIME relation is exact-bound and target drift fails closed', () => {
  const base = stack();
  const driftIdentity = createPhysicalIdentityGraph(identityInput({actuatorRuntimeTarget: 'actuator-load'}));
  const transmission = transmissionModel(driftIdentity);
  const actuation = actuationModel(driftIdentity, transmission);
  const validation = validateRuntimeBindingBindings(base.model, driftIdentity, {actuationModel: actuation, transmissionModel: transmission});
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /BINDS_RUNTIME target|identityBinding|projection/);
});

test('scoped identity binding ignores unrelated runtime endpoints', () => {
  const base = stack();
  const identityGraph = createPhysicalIdentityGraph(identityInput({withUnrelatedRuntime: true}));
  const transmission = transmissionModel(identityGraph);
  const actuation = actuationModel(identityGraph, transmission);
  const validation = validateRuntimeBindingBindings(base.model, identityGraph, {actuationModel: actuation, transmissionModel: transmission});
  assert.equal(validation.valid, true, validation.errors.join('\n'));
});

test('actuator runtime calibration uses generalized-coordinate units and live P07 semantics', () => {
  const base = stack();
  const actuator = base.model.bindings.find((binding) => binding.bindingId === 'binding-actuator');
  assert.equal(actuator.coordinateClass, 'ROTARY');
  assert.deepEqual(actuator.zeroOffset.value, {value: 0.125, unit: 'rad'});
  assert.deepEqual(actuator.encoderScale.value, {value: 0.001, unit: 'rad_per_runtime_unit'});
  const wrongUnit = actuatorBinding(); wrongUnit.zeroOffset.value.unit = 'm';
  assert.throws(() => createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, bindings: [controllerBinding(), wrongUnit]}), /unit must be rad/);
  const wrongSign = actuatorBinding(); wrongSign.sign.value = 0;
  assert.throws(() => createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, bindings: [controllerBinding(), wrongSign]}), /must be \+1 or -1/);
});

test('NONE targets reject coordinate calibration instead of inventing orientation semantics', () => {
  const base = stack();
  const invalid = controllerBinding(); invalid.sign.value = 1;
  assert.throws(() => createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, bindings: [invalid, actuatorBinding()]}), /must be null for NONE coordinate class/);
  const leak = controllerBinding(); leak.controllerDelay = 0.01;
  assert.throws(() => createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel, bindings: [leak, actuatorBinding()]}), /unsupported field/);
});

test('scoped target binding ignores unrelated runtime locator edits but catches selected actuator semantic drift', () => {
  const base = stack();
  const changedIndex = createRuntimeBinding({
    scopeId: 'whole', sourceSha256: D(), identityGraph: base.identityGraph, actuationModel: base.actuationModel, transmissionModel: base.transmissionModel,
    bindings: [controllerBinding({runtimeIndex: 99}), actuatorBinding()],
  });
  assert.equal(changedIndex.identityBinding.projectionDigest, base.model.identityBinding.projectionDigest);
  assert.equal(changedIndex.targetBinding.projectionDigest, base.model.targetBinding.projectionDigest);
  assert.notEqual(changedIndex.runtimeBindingDigest, base.model.runtimeBindingDigest);

  const changedActuation = actuationModel(base.identityGraph, base.transmissionModel, 20);
  assert.equal(validateRuntimeBindingBindings(base.model, base.identityGraph, {actuationModel: changedActuation, transmissionModel: base.transmissionModel}).valid, false);
});

test('P06 drift underneath selected actuator invalidates P09 target binding', () => {
  const base = stack();
  const transmission = transmissionModel(base.identityGraph, 4);
  const actuation = actuationModel(base.identityGraph, transmission);
  assert.equal(validateRuntimeBindingBindings(base.model, base.identityGraph, {actuationModel: actuation, transmissionModel: transmission}).valid, false);
});

test('semantic authority is exact and unresolved runtime calibration requires unknown authority', () => {
  const {model} = stack();
  const authority = authoritySet(model);
  assert.equal(validateRuntimeBindingAuthority(model, authority).valid, true);
  const controller = model.bindings.find((binding) => binding.bindingId === 'binding-controller');
  const wrong = createSemanticAuthoritySet({
    scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.runtimeBindingDigest,
    entries: authority.entries.map((entry) => entry.subjectId === controller.sign.authoritySubjectId ? {
      id: entry.id, subjectId: entry.subjectId, authority: 'engineered', proposition: entry.proposition, reason: 'backend default', basis: [{kind: 'downstream-requirement', ref: 'backend/default'}],
    } : {id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis}),
  });
  assert.equal(validateRuntimeBindingAuthority(model, wrong).valid, false);
});

test('tampering with runtime calibration invalidates canonical digest', () => {
  const {model} = stack();
  const tampered = structuredClone(model);
  tampered.bindings.find((binding) => binding.bindingId === 'binding-actuator').zeroOffset.value.value = 2;
  assert.equal(validateRuntimeBinding(tampered).valid, false);
});

test('runtime identity projection excludes locator/index values from semantic identity', () => {
  const {identityGraph, model} = stack();
  const before = physicalRuntimeIdentityProjection(identityGraph, model.bindings);
  const changed = structuredClone(model.bindings); changed[0].runtimeIndex.value = 123;
  const after = physicalRuntimeIdentityProjection(identityGraph, changed);
  assert.equal(digestJson(before), digestJson(after));
});

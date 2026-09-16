import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  actuationArticulationProjection,
  actuationTransmissionProjection,
  createActuationModel,
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createPhysicalIdentityGraph,
  createTransmissionImplementationManifest,
  createTransmissionModel,
  digestJson,
  physicalActuationIdentityProjection,
  validateActuationModelBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const Q = (parentId, translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({parentId, translation_m, rotation_quat_xyzw});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const T = (translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({translation_m, rotation_quat_xyzw});

function attachmentFixture() {
  return createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'base-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'drive-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
    ],
    relations: [
      {id: 'base-free', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'drive-hinge', mode: 'ARTICULATED', subjectId: 'drive-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
    ],
    evidenceRefs: ['source/ref.png'],
  });
}

function jointIdentityInput({driveX = 1, directJointDrive = false} = {}) {
  return {
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
      {id: 'drive-link', kind: 'rigid-link', frame: Q('module-root', [driveX, 0, 0])},
      {id: 'joint-drive', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
      {id: 'actuator-drive', kind: 'actuator', frame: Q('module-root')},
      {id: 'actuator-load', kind: 'actuator', frame: Q('module-root')},
      {id: 'tx-drive', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
      {id: 'contains-drive-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['drive-link']},
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-drive']},
      {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
      {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
      {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
      {id: 'joint-connects', kind: 'CONNECTS', sourceId: 'joint-drive', targetIds: ['base-link', 'drive-link']},
      {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['joint-drive', 'actuator-load']},
      {id: 'actuator-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: [directJointDrive ? 'joint-drive' : 'tx-drive']},
    ],
  };
}

function articulationStack({driveX = 1, directJointDrive = false} = {}) {
  const identityGraph = createPhysicalIdentityGraph(jointIdentityInput({driveX, directJointDrive}));
  const attachmentSemantics = attachmentFixture();
  const joint = createArticulatedJoint({
    attachmentSemantics,
    id: 'joint-drive',
    relationId: 'drive-hinge',
    ownerJointFrame: I([1, 0, 0]),
    subjectJointFrame: I(),
    minimumAngle: -2,
    maximumAngle: 2,
    evidenceRefs: ['model/drive.json'],
  });
  const articulationGraph = createArticulationGraph({
    scopeId: 'whole', sourceSha256: D(), identityGraph, attachmentSemantics, jointContracts: [joint], rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'drive-link', attachmentEntityId: 'drive-body', attachmentFrameInLink: T()},
    ],
    joints: [{
      virtualJointId: 'joint-drive', parentLinkId: 'base-link', childLinkId: 'drive-link', referenceAngle: 0,
      jointContract: {schema: joint.schema, id: joint.id, jointDigest: joint.jointDigest},
    }],
  });
  return {identityGraph, articulationGraph};
}

function capability({targetKind = 'transmission', targetId = 'tx-drive', coordinateClass = 'ROTARY', kind = 'ROTARY_ELECTRIC'} = {}) {
  const rotary = coordinateClass === 'ROTARY';
  return {
    actuatorId: 'actuator-drive',
    drivesRelationId: 'actuator-drives',
    drivenTargetId: targetId,
    drivenTargetKind: targetKind,
    kind,
    coordinateClass,
    supportedControlModes: {value: ['POSITION', 'EFFORT']},
    positionRange: {value: rotary ? {kind: 'BOUNDED', minimum: -2, maximum: 2, unit: 'rad'} : {kind: 'BOUNDED', minimum: -1, maximum: 1, unit: 'm'}},
    velocityLimit: {value: {maxAbs: 4, unit: rotary ? 'rad_s' : 'm_s'}},
    effortLimit: {value: {maxAbs: 8, unit: rotary ? 'N_m' : 'N'}},
    stiffness: {value: null},
    damping: {value: null},
    armature: {value: null},
    responseLatency: {value: null},
  };
}

function jointTransmission(stack) {
  return createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, articulationGraph: stack.articulationGraph,
    transmissions: [{
      transmissionId: 'tx-drive', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'joint-space', coordinates: [{id: 'joint-q', semanticIdentityId: 'joint-drive'}], order: ['joint-q']},
      outputSpace: {id: 'load-space', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
      mapping: {kind: 'RATIO', ratio: 2, offset: 0},
    }],
  });
}

function solverIdentityGraph({withFrames = false} = {}) {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'actuator-drive', kind: 'actuator', ...(withFrames ? {frame: Q('module-root', [1, 0, 0])} : {})},
      {id: 'actuator-load', kind: 'actuator'},
      {id: 'tx-drive', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
      {id: 'contains-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
      {id: 'contains-tx', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
      {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive', 'actuator-load']},
      {id: 'actuator-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
    ],
  });
}

function solverManifest(digest = D('b'), artifactDigest = D('e')) {
  return createTransmissionImplementationManifest({
    scopeId: 'whole', sourceSha256: D(), artifactDigest,
    implementations: [{
      schema: 'refas.transmission-solver/v1', id: 'solver-model', digest,
      inputSemanticIdentityOrder: ['actuator-drive'], outputSemanticIdentityOrder: ['actuator-load'],
    }],
  });
}

function solverTransmission(identityGraph, manifest = solverManifest()) {
  return createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    implementationManifest: manifest, expectedImplementationArtifactDigest: manifest.artifactDigest,
    transmissions: [{
      transmissionId: 'tx-drive', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'drive-space', coordinates: [{id: 'drive-q', semanticIdentityId: 'actuator-drive'}], order: ['drive-q']},
      outputSpace: {id: 'load-space', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
      mapping: {kind: 'EXTERNAL_SOLVER', solverRef: {schema: 'refas.transmission-solver/v1', id: 'solver-model', digest: D('b')}},
    }],
  });
}

test('direct virtual-joint drive requires current P04 articulation and rotary coordinate class', () => {
  const stack = articulationStack({directJointDrive: true});
  const rotary = capability({targetKind: 'virtual-joint', targetId: 'joint-drive'});
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, actuators: [rotary]}), /articulationGraph is required/);

  const model = createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, articulationGraph: stack.articulationGraph, actuators: [rotary]});
  assert.notEqual(model.articulationBinding, null);
  assert.equal(model.transmissionBinding, null);
  assert.equal(digestJson(actuationArticulationProjection(stack.articulationGraph, ['joint-drive'], stack.identityGraph)), model.articulationBinding.projectionDigest);

  const linear = capability({targetKind: 'virtual-joint', targetId: 'joint-drive', coordinateClass: 'LINEAR', kind: 'ABSTRACT'});
  assert.throws(() => createActuationModel({scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, articulationGraph: stack.articulationGraph, actuators: [linear]}), /require ROTARY coordinateClass/);
});

test('selected transmission binding revalidates its current P04 dependency', () => {
  const stack = articulationStack();
  const transmissionModel = jointTransmission(stack);
  const model = createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph: stack.identityGraph, articulationGraph: stack.articulationGraph,
    transmissionModel, actuators: [capability()],
  });
  assert.notEqual(model.transmissionBinding, null);
  assert.equal(digestJson(actuationTransmissionProjection(transmissionModel, ['tx-drive'], stack.identityGraph, {articulationGraph: stack.articulationGraph})), model.transmissionBinding.projectionDigest);

  const staleIdentity = createPhysicalIdentityGraph(jointIdentityInput({driveX: 2}));
  const stale = validateActuationModelBindings(model, staleIdentity, {transmissionModel, articulationGraph: stack.articulationGraph});
  assert.equal(stale.valid, false);
  assert.match(stale.errors.join('\n'), /reference pose|current|articulation|reproduce|projection/i);
});

test('selected external implementation drift fails closed without binding unrelated artifact changes', () => {
  const identityGraph = solverIdentityGraph();
  const manifest = solverManifest();
  const transmissionModel = solverTransmission(identityGraph, manifest);
  const model = createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel,
    implementationManifest: manifest, expectedImplementationArtifactDigest: manifest.artifactDigest,
    actuators: [capability()],
  });

  const unrelatedArtifactChange = solverManifest(D('b'), D('f'));
  const unrelated = validateActuationModelBindings(model, identityGraph, {
    transmissionModel,
    implementationManifest: unrelatedArtifactChange,
    expectedImplementationArtifactDigest: D('f'),
  });
  assert.equal(unrelated.valid, true, unrelated.errors.join('\n'));

  const selectedImplementationDrift = solverManifest(D('c'), D('f'));
  const stale = validateActuationModelBindings(model, identityGraph, {
    transmissionModel,
    implementationManifest: selectedImplementationDrift,
    expectedImplementationArtifactDigest: D('f'),
  });
  assert.equal(stale.valid, false);
});

test('P07 identity projection ignores unrelated actuator frame metadata', () => {
  const identityGraph = solverIdentityGraph();
  const manifest = solverManifest();
  const transmissionModel = solverTransmission(identityGraph, manifest);
  const model = createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel,
    implementationManifest: manifest, expectedImplementationArtifactDigest: manifest.artifactDigest,
    actuators: [capability()],
  });
  const framedIdentity = solverIdentityGraph({withFrames: true});
  const framedTransmission = solverTransmission(framedIdentity, manifest);
  assert.equal(digestJson(physicalActuationIdentityProjection(framedIdentity, model.actuators)), model.identityBinding.projectionDigest);
  const validation = validateActuationModelBindings(model, framedIdentity, {
    transmissionModel: framedTransmission,
    implementationManifest: manifest,
    expectedImplementationArtifactDigest: manifest.artifactDigest,
  });
  assert.equal(validation.valid, true, validation.errors.join('\n'));
});

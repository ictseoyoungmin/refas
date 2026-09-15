import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createMechanismGraph,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  createTransmissionModel,
  digestJson,
  evaluateTransmissionMapping,
  physicalTransmissionIdentityProjection,
  transmissionMappingAuthoritySubjectId,
  transmissionMechanismProjection,
  validateTransmissionModel,
  validateTransmissionModelAuthority,
  validateTransmissionModelBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const Q = (parentId, translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({parentId, translation_m, rotation_quat_xyzw});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const T = (translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({translation_m, rotation_quat_xyzw});

function physicalInput({withController = false} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
    {id: 'drive-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
    {id: 'joint-drive', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
    {id: 'drive-part', kind: 'physical-part', frame: Q('drive-link')},
    {id: 'drive-mechanism', kind: 'mechanism', frame: Q('module-root')},
    {id: 'actuator-drive', kind: 'actuator', frame: Q('module-root')},
    {id: 'drive-transmission', kind: 'transmission'},
  ];
  const relations = [
    {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
    {id: 'contains-drive-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['drive-link']},
    {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-drive']},
    {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['drive-part']},
    {id: 'contains-mechanism', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['drive-mechanism']},
    {id: 'contains-actuator', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
    {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['drive-transmission']},
    {id: 'joint-connects', kind: 'CONNECTS', sourceId: 'joint-drive', targetIds: ['base-link', 'drive-link']},
    {id: 'part-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'drive-part', targetIds: ['drive-link']},
    {id: 'mechanism-realizes', kind: 'REALIZES', sourceId: 'drive-mechanism', targetIds: ['joint-drive']},
    {id: 'transmission-maps', kind: 'MAPS', sourceId: 'drive-transmission', targetIds: ['joint-drive', 'actuator-drive', 'drive-mechanism']},
  ];
  if (withController) {
    entities.push({id: 'controller-extra', kind: 'controller'});
    relations.push({id: 'contains-controller-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-extra']});
  }
  return {scopeId: 'whole', sourceSha256: D(), entities, relations};
}

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

function physicalStack({withController = false, memberRole = 'LINK_ELEMENT'} = {}) {
  const identityGraph = createPhysicalIdentityGraph(physicalInput({withController}));
  const attachmentSemantics = attachmentFixture();
  const joint = createArticulatedJoint({attachmentSemantics, id: 'joint-drive', relationId: 'drive-hinge', ownerJointFrame: I([1, 0, 0]), subjectJointFrame: I(), minimumAngle: -2, maximumAngle: 2, evidenceRefs: ['model/drive.json']});
  const articulationGraph = createArticulationGraph({
    scopeId: 'whole', sourceSha256: D(), identityGraph, attachmentSemantics, jointContracts: [joint], rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'drive-link', attachmentEntityId: 'drive-body', attachmentFrameInLink: T()},
    ],
    joints: [{virtualJointId: 'joint-drive', parentLinkId: 'base-link', childLinkId: 'drive-link', referenceAngle: 0, jointContract: {schema: joint.schema, id: joint.id, jointDigest: joint.jointDigest}}],
  });
  const mechanismGraph = createMechanismGraph({
    scopeId: 'whole', sourceSha256: D(), identityGraph, articulationGraph,
    mechanisms: [{mechanismId: 'drive-mechanism', kind: 'DIRECT', realizesRelationIds: ['mechanism-realizes'], realizedJointIds: ['joint-drive'], members: [{id: 'drive-member', physicalIdentityId: 'drive-part', role: memberRole}], edges: []}],
  });
  return {identityGraph, articulationGraph, mechanismGraph};
}

function ratioInput(stack = physicalStack()) {
  return {
    scopeId: 'whole', sourceSha256: D(), ...stack,
    transmissions: [{
      transmissionId: 'drive-transmission', mapsRelationIds: ['transmission-maps'], contextMechanismIds: ['drive-mechanism'],
      inputSpace: {id: 'joint-space', coordinates: [{id: 'joint-q', semanticIdentityId: 'joint-drive'}], order: ['joint-q']},
      outputSpace: {id: 'actuator-space', coordinates: [{id: 'actuator-q', semanticIdentityId: 'actuator-drive'}], order: ['actuator-q']},
      mapping: {kind: 'RATIO', ratio: -2, offset: 0},
    }],
  };
}

function linearIdentityInput() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'joint-x', kind: 'virtual-joint', frame: Q('module-root')},
      {id: 'joint-y', kind: 'virtual-joint', frame: Q('module-root')},
      {id: 'actuator-x', kind: 'actuator', frame: Q('module-root')},
      {id: 'actuator-y', kind: 'actuator', frame: Q('module-root')},
      {id: 'matrix-transmission', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-joint-x', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-x']},
      {id: 'contains-joint-y', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-y']},
      {id: 'contains-actuator-x', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-x']},
      {id: 'contains-actuator-y', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-y']},
      {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['matrix-transmission']},
      {id: 'matrix-maps', kind: 'MAPS', sourceId: 'matrix-transmission', targetIds: ['joint-x', 'joint-y', 'actuator-x', 'actuator-y']},
    ],
  });
}

function linearInput(identityGraph = linearIdentityInput()) {
  return {
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    transmissions: [{
      transmissionId: 'matrix-transmission', mapsRelationIds: ['matrix-maps'], contextMechanismIds: [],
      inputSpace: {id: 'joint-space', coordinates: [{id: 'joint-y-q', semanticIdentityId: 'joint-y'}, {id: 'joint-x-q', semanticIdentityId: 'joint-x'}], order: ['joint-x-q', 'joint-y-q']},
      outputSpace: {id: 'actuator-space', coordinates: [{id: 'actuator-y-q', semanticIdentityId: 'actuator-y'}, {id: 'actuator-x-q', semanticIdentityId: 'actuator-x'}], order: ['actuator-x-q', 'actuator-y-q']},
      mapping: {kind: 'LINEAR_MATRIX', matrix: [[1, 2], [3, 4]], offset: [0.5, -0.5]},
    }],
  };
}

function authoritySet(model) {
  return createSemanticAuthoritySet({
    scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.transmissionDigest,
    entries: model.transmissions.map((transmission, index) => ({id: `authority-${index}`, subjectId: transmission.authoritySubjectId, authority: 'engineered', proposition: `transmission mapping ${transmission.transmissionId}`, reason: 'mapping parameters are an explicit construction decision', basis: [{kind: 'functional-requirement', ref: `transmission/${transmission.transmissionId}`}]})),
  });
}

test('ratio transmission keeps mechanism, transmission, joint, and actuator semantics distinct', () => {
  const input = ratioInput(), model = createTransmissionModel(input);
  assert.deepEqual(validateTransmissionModel(model), {valid: true, errors: []});
  assert.equal(model.transmissions[0].mapping.kind, 'RATIO');
  assert.equal(model.transmissions[0].mapping.ratio, -2);
  assert.equal(model.policy.mechanismAndTransmissionRemainDistinct, true);
  assert.equal(model.policy.transmissionMappingDoesNotImplyActuatorLimits, true);
  assert.equal('identityGraph' in model, false);
  assert.equal('mechanismGraph' in model, false);
  assert.equal('articulationGraph' in model, false);
  assert.notEqual(model.identityBinding, null);
  assert.notEqual(model.mechanismBinding, null);
  assert.equal(transmissionMappingAuthoritySubjectId('drive-transmission'), model.transmissions[0].authoritySubjectId);
});

test('ratio evaluation follows q_out, dq_out, and transpose-effort semantics', () => {
  const model = createTransmissionModel(ratioInput()), transmission = model.transmissions[0];
  const result = evaluateTransmissionMapping(transmission, {position: [0.5], velocity: [1.5], outputEffort: [4]});
  assert.deepEqual(result.outputPosition, [-1]);
  assert.deepEqual(result.outputVelocity, [-3]);
  assert.deepEqual(result.inputEffort, [-8]);
  assert.deepEqual(result.jacobian, [[-2]]);
  assert.deepEqual(result.inputCoordinateOrder, ['joint-q']);
  assert.deepEqual(result.outputCoordinateOrder, ['actuator-q']);
});

test('linear matrix mapping preserves explicit vector order independently of coordinate definition order', () => {
  const input = linearInput(), model = createTransmissionModel(input), transmission = model.transmissions[0];
  const result = evaluateTransmissionMapping(transmission, {position: [2, 3], velocity: [5, 7], outputEffort: [11, 13]});
  assert.deepEqual(result.outputPosition, [8.5, 17.5]);
  assert.deepEqual(result.outputVelocity, [19, 43]);
  assert.deepEqual(result.inputEffort, [50, 74]);

  const reordered = linearInput();
  reordered.transmissions[0].inputSpace.coordinates.reverse();
  reordered.transmissions[0].outputSpace.coordinates.reverse();
  const model2 = createTransmissionModel(reordered);
  assert.equal(model2.transmissionDigest, model.transmissionDigest);
  assert.deepEqual(model2, model);

  const semanticReorder = linearInput();
  semanticReorder.transmissions[0].inputSpace.order.reverse();
  const model3 = createTransmissionModel(semanticReorder);
  assert.notEqual(model3.transmissionDigest, model.transmissionDigest);
});

test('transmission requires exact P01 MAPS targets and rejects mapping-domain leakage', () => {
  const input = ratioInput();
  const missingContext = structuredClone(input); missingContext.transmissions[0].contextMechanismIds = [];
  assert.throws(() => createTransmissionModel(missingContext), /MAPS targets must equal/);
  const limitLeak = structuredClone(input); limitLeak.transmissions[0].effortLimit = 100;
  assert.throws(() => createTransmissionModel(limitLeak), /unsupported field/);
  const zeroRatio = structuredClone(input); zeroRatio.transmissions[0].mapping.ratio = 0;
  assert.throws(() => createTransmissionModel(zeroRatio), /ratio must be non-zero/);
});

test('nonlinear and external solver mappings require exact digest-bound references and are not silently executable', () => {
  const identityGraph = linearIdentityInput();
  const nonlinear = linearInput(identityGraph);
  nonlinear.transmissions[0].mapping = {kind: 'NONLINEAR', positionModelRef: {schema: 'refas.transmission-nonlinear-position/v1', id: 'position-model', digest: D('b')}, jacobianModelRef: {schema: 'refas.transmission-nonlinear-jacobian/v1', id: 'jacobian-model', digest: D('c')}};
  const nonlinearModel = createTransmissionModel(nonlinear);
  assert.throws(() => evaluateTransmissionMapping(nonlinearModel.transmissions[0], {position: [0, 0], velocity: [0, 0], outputEffort: [0, 0]}), /requires its declared external/);
  const missingJacobian = structuredClone(nonlinear); delete missingJacobian.transmissions[0].mapping.jacobianModelRef;
  assert.throws(() => createTransmissionModel(missingJacobian), /jacobianModelRef/);

  const external = linearInput(identityGraph);
  external.transmissions[0].mapping = {kind: 'EXTERNAL_SOLVER', solverRef: {schema: 'refas.transmission-solver/v1', id: 'solver-model', digest: D('d')}};
  const externalModel = createTransmissionModel(external);
  assert.throws(() => evaluateTransmissionMapping(externalModel.transmissions[0], {position: [0, 0], velocity: [0, 0], outputEffort: [0, 0]}), /requires its declared external/);
});

test('scoped identity binding ignores unrelated controller edits but fails on relevant MAPS drift', () => {
  const baseStack = physicalStack(), model = createTransmissionModel(ratioInput(baseStack));
  const unrelatedStack = physicalStack({withController: true});
  assert.equal(validateTransmissionModelBindings(model, unrelatedStack.identityGraph, {mechanismGraph: unrelatedStack.mechanismGraph, articulationGraph: unrelatedStack.articulationGraph}).valid, true);
  const projection = physicalTransmissionIdentityProjection(unrelatedStack.identityGraph, model.transmissions);
  assert.equal(digestJson(projection), model.identityBinding.projectionDigest);

  const changed = physicalInput();
  changed.entities.push({id: 'actuator-other', kind: 'actuator', frame: Q('module-root')});
  changed.relations.push({id: 'contains-actuator-other', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-other']});
  changed.relations.find((relation) => relation.id === 'transmission-maps').targetIds = ['joint-drive', 'actuator-other', 'drive-mechanism'];
  const changedIdentity = createPhysicalIdentityGraph(changed);
  assert.equal(validateTransmissionModelBindings(model, changedIdentity, {mechanismGraph: baseStack.mechanismGraph, articulationGraph: baseStack.articulationGraph}).valid, false);
});

test('mechanism context binding is scoped and catches referenced mechanism semantic drift', () => {
  const stack = physicalStack(), model = createTransmissionModel(ratioInput(stack));
  const projection = transmissionMechanismProjection(stack.mechanismGraph, stack.identityGraph, stack.articulationGraph, ['drive-mechanism']);
  assert.equal(digestJson(projection), model.mechanismBinding.projectionDigest);

  const changedStack = physicalStack({memberRole: 'CONTACT_ELEMENT'});
  assert.equal(validateTransmissionModelBindings(model, changedStack.identityGraph, {mechanismGraph: changedStack.mechanismGraph, articulationGraph: changedStack.articulationGraph}).valid, false);
});

test('transmission model reuses semantic authority and remains tamper detectable', () => {
  const model = createTransmissionModel(ratioInput()), authority = authoritySet(model);
  assert.equal(validateTransmissionModelAuthority(model, authority).valid, true);
  const unresolved = createSemanticAuthoritySet({scopeId: model.scopeId, sourceSha256: model.sourceSha256, targetSchema: model.schema, targetDigest: model.transmissionDigest, entries: authority.entries.map((entry) => ({id: entry.id, subjectId: entry.subjectId, authority: 'unknown', proposition: entry.proposition, reason: 'unresolved', basis: []}))});
  assert.equal(validateTransmissionModelAuthority(model, unresolved).valid, false);

  const tampered = structuredClone(model); tampered.transmissions[0].mapping.ratio = -3;
  assert.equal(validateTransmissionModel(tampered).valid, false);
});

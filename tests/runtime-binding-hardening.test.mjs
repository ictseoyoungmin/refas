import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  canonicalValueToRuntime,
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createPhysicalIdentityGraph,
  createRuntimeBinding,
  runtimeValueToCanonical,
  validateRuntimeBindingBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Q = (parentId, translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({parentId, translation_m, rotation_quat_xyzw});
const T = (translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({translation_m, rotation_quat_xyzw});

function scalarBinding(overrides = {}) {
  return {
    bindingId: 'binding-calibration',
    selector: {runtimeEndpointId: 'runtime-axis', bindsRuntimeRelationId: 'runtime-binds-axis', targetId: 'joint-axis', targetKind: 'virtual-joint'},
    coordinateClass: 'ROTARY',
    device: {value: '/dev/ttyUSB0'},
    bus: {value: 'CAN0/ch:A'},
    runtimeIndex: {value: 3},
    sign: {value: -1},
    zeroOffset: {value: {value: 0.125, unit: 'rad'}},
    encoderScale: {value: {value: 0.001, unit: 'rad_per_runtime_unit'}},
    transportDelay: {value: {value_s: 0.002}},
    ...overrides,
  };
}

test('P09 canonical calibration equation is unique and round-trips', () => {
  const binding = scalarBinding();
  const canonical = runtimeValueToCanonical(binding, 100);
  assert.equal(canonical, 0.025);
  assert.equal(canonicalValueToRuntime(binding, canonical), 100);

  const unresolved = scalarBinding({zeroOffset: {value: null}});
  assert.throws(() => runtimeValueToCanonical(unresolved, 1), /calibration is unresolved/);
});

function controllerIdentity() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'controller-main', kind: 'controller'},
      {id: 'runtime-controller', kind: 'runtime-endpoint'},
    ],
    relations: [
      {id: 'contains-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-main']},
      {id: 'contains-runtime', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-controller']},
      {id: 'runtime-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller', targetIds: ['controller-main']},
    ],
  });
}

function controllerBinding(device = '/dev/ttyUSB0', bus = 'COM3') {
  return {
    bindingId: 'binding-controller',
    selector: {runtimeEndpointId: 'runtime-controller', bindsRuntimeRelationId: 'runtime-binds-controller', targetId: 'controller-main', targetKind: 'controller'},
    coordinateClass: 'NONE',
    device: {value: device},
    bus: {value: bus},
    runtimeIndex: {value: 0},
    sign: {value: null}, zeroOffset: {value: null}, encoderScale: {value: null}, transportDelay: {value: null},
  };
}

test('runtime locator strings are configuration values, not semantic IDs', () => {
  const identityGraph = controllerIdentity();
  const model = createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph, bindings: [controllerBinding()]});
  assert.equal(model.bindings[0].device.value, '/dev/ttyUSB0');
  assert.equal(model.bindings[0].bus.value, 'COM3');
  assert.throws(() => createRuntimeBinding({scopeId: 'whole', sourceSha256: D(), identityGraph, bindings: [controllerBinding(' /dev/ttyUSB0')]}), /leading or trailing whitespace/);
});

function attachmentFixture() {
  return createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'base-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'arm-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'tip-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
    ],
    relations: [
      {id: 'base-free', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'arm-hinge', mode: 'ARTICULATED', subjectId: 'arm-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'tip-hinge', mode: 'ARTICULATED', subjectId: 'tip-body', ownerIds: ['arm-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
    ],
    evidenceRefs: ['source/ref.png'],
  });
}

function articulationIdentity() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
      {id: 'arm-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
      {id: 'tip-link', kind: 'rigid-link', frame: Q('module-root', [2, 0, 0])},
      {id: 'joint-shoulder', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
      {id: 'joint-tip', kind: 'virtual-joint', frame: Q('arm-link', [1, 0, 0])},
      {id: 'runtime-joint', kind: 'runtime-endpoint'},
    ],
    relations: [
      {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
      {id: 'contains-arm', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['arm-link']},
      {id: 'contains-tip', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tip-link']},
      {id: 'contains-shoulder', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-shoulder']},
      {id: 'contains-tip-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-tip']},
      {id: 'contains-runtime-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-joint']},
      {id: 'shoulder-connects', kind: 'CONNECTS', sourceId: 'joint-shoulder', targetIds: ['arm-link', 'base-link']},
      {id: 'tip-connects', kind: 'CONNECTS', sourceId: 'joint-tip', targetIds: ['tip-link', 'arm-link']},
      {id: 'runtime-binds-shoulder', kind: 'BINDS_RUNTIME', sourceId: 'runtime-joint', targetIds: ['joint-shoulder']},
    ],
  });
}

function contracts(attachmentSemantics, {shoulderMaximum = 1, tipMaximum = 0.5} = {}) {
  return [
    createArticulatedJoint({attachmentSemantics, id: 'joint-shoulder', relationId: 'arm-hinge', ownerJointFrame: I([1, 0, 0]), subjectJointFrame: I(), minimumAngle: -1, maximumAngle: shoulderMaximum, evidenceRefs: ['model/shoulder.json']}),
    createArticulatedJoint({attachmentSemantics, id: 'joint-tip', relationId: 'tip-hinge', ownerJointFrame: I([1, 0, 0]), subjectJointFrame: I(), minimumAngle: -0.5, maximumAngle: tipMaximum, evidenceRefs: ['model/tip.json']}),
  ];
}

function articulationGraph(identityGraph, attachmentSemantics, jointContracts) {
  return createArticulationGraph({
    scopeId: 'whole', sourceSha256: D(), identityGraph, attachmentSemantics, jointContracts, rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'arm-link', attachmentEntityId: 'arm-body', attachmentFrameInLink: T()},
      {linkId: 'tip-link', attachmentEntityId: 'tip-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-shoulder', parentLinkId: 'base-link', childLinkId: 'arm-link', referenceAngle: 0, jointContract: {schema: jointContracts[0].schema, id: jointContracts[0].id, jointDigest: jointContracts[0].jointDigest}},
      {virtualJointId: 'joint-tip', parentLinkId: 'arm-link', childLinkId: 'tip-link', referenceAngle: 0, jointContract: {schema: jointContracts[1].schema, id: jointContracts[1].id, jointDigest: jointContracts[1].jointDigest}},
    ],
  });
}

function jointRuntimeBinding() {
  return {
    bindingId: 'binding-shoulder',
    selector: {runtimeEndpointId: 'runtime-joint', bindsRuntimeRelationId: 'runtime-binds-shoulder', targetId: 'joint-shoulder', targetKind: 'virtual-joint'},
    coordinateClass: 'ROTARY',
    device: {value: 'can://arm/shoulder'}, bus: {value: 'CAN0'}, runtimeIndex: {value: 1},
    sign: {value: 1}, zeroOffset: {value: {value: 0, unit: 'rad'}}, encoderScale: {value: {value: 0.001, unit: 'rad_per_runtime_unit'}}, transportDelay: {value: null},
  };
}

test('virtual-joint target binding is scoped to the selected P04 joint', () => {
  const identityGraph = articulationIdentity();
  const attachmentSemantics = attachmentFixture();
  const initialContracts = contracts(attachmentSemantics);
  const initialGraph = articulationGraph(identityGraph, attachmentSemantics, initialContracts);
  const model = createRuntimeBinding({
    scopeId: 'whole', sourceSha256: D(), identityGraph, articulationGraph: initialGraph, attachmentSemantics, jointContracts: initialContracts,
    bindings: [jointRuntimeBinding()],
  });

  const unrelatedContracts = contracts(attachmentSemantics, {tipMaximum: 0.25});
  const unrelatedGraph = articulationGraph(identityGraph, attachmentSemantics, unrelatedContracts);
  const unrelatedValidation = validateRuntimeBindingBindings(model, identityGraph, {
    articulationGraph: unrelatedGraph, attachmentSemantics, jointContracts: unrelatedContracts,
  });
  assert.equal(unrelatedValidation.valid, true, unrelatedValidation.errors.join('\n'));

  const selectedContracts = contracts(attachmentSemantics, {shoulderMaximum: 0.75});
  const selectedGraph = articulationGraph(identityGraph, attachmentSemantics, selectedContracts);
  const selectedValidation = validateRuntimeBindingBindings(model, identityGraph, {
    articulationGraph: selectedGraph, attachmentSemantics, jointContracts: selectedContracts,
  });
  assert.equal(selectedValidation.valid, false);
});

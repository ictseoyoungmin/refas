import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createMechanismGraph,
  createPhysicalIdentityGraph,
  physicalMechanismIdentityProjection,
  validateMechanismGraph,
} from '../skills/refas/scripts/lib/index.mjs';

const D = 'a'.repeat(64);
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Q = (parentId, translation_m = [0, 0, 0]) => ({parentId, translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});
const T = (translation_m = [0, 0, 0]) => ({translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});

function fixture() {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D,
    entities: [
      {id: 'base-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'wheel-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
    ],
    relations: [
      {id: 'base-free', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'wheel-hinge', mode: 'ARTICULATED', subjectId: 'wheel-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
    ],
    evidenceRefs: ['source/ref.png'],
  });

  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
      {id: 'wheel-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
      {id: 'joint-a', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
      {id: 'pulley-part', kind: 'physical-part', frame: Q('wheel-link')},
      {id: 'belt-part', kind: 'physical-part', frame: Q('module-root', [0.5, 0, 0])},
      {id: 'belt-mechanism', kind: 'mechanism', frame: Q('module-root')},
    ],
    relations: [
      {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
      {id: 'contains-wheel', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['wheel-link']},
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-a']},
      {id: 'contains-pulley', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['pulley-part']},
      {id: 'contains-belt', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['belt-part']},
      {id: 'contains-mechanism', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['belt-mechanism']},
      {id: 'joint-connects', kind: 'CONNECTS', sourceId: 'joint-a', targetIds: ['base-link', 'wheel-link']},
      {id: 'pulley-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'pulley-part', targetIds: ['wheel-link']},
      {id: 'belt-realizes', kind: 'REALIZES', sourceId: 'belt-mechanism', targetIds: ['joint-a']},
    ],
  });

  const jointContract = createArticulatedJoint({
    attachmentSemantics,
    id: 'joint-a',
    relationId: 'wheel-hinge',
    ownerJointFrame: I([1, 0, 0]),
    subjectJointFrame: I(),
    minimumAngle: -2,
    maximumAngle: 2,
    evidenceRefs: ['model/wheel.json'],
  });

  const articulationGraph = createArticulationGraph({
    scopeId: 'whole', sourceSha256: D, identityGraph, attachmentSemantics, jointContracts: [jointContract], rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'wheel-link', attachmentEntityId: 'wheel-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-a', parentLinkId: 'base-link', childLinkId: 'wheel-link', referenceAngle: 0, jointContract: {schema: jointContract.schema, id: jointContract.id, jointDigest: jointContract.jointDigest}},
    ],
  });

  return {identityGraph, articulationGraph};
}

function beltInput(identityGraph, articulationGraph, tensionRole = 'TENSION_ELEMENT') {
  return {
    scopeId: 'whole', sourceSha256: D, identityGraph, articulationGraph,
    mechanisms: [{
      mechanismId: 'belt-mechanism', kind: 'BELT', realizesRelationIds: ['belt-realizes'], realizedJointIds: ['joint-a'],
      members: [
        {id: 'belt-member', physicalIdentityId: 'belt-part', role: tensionRole},
        {id: 'pulley-member', physicalIdentityId: 'pulley-part', role: 'CONTACT_ELEMENT'},
      ],
      edges: [{id: 'belt-contact', kind: 'BELT_CONTACT', memberIds: ['belt-member', 'pulley-member']}],
    }],
  };
}

test('BELT permits an edge-anchored unaggregated TENSION_ELEMENT', () => {
  const {identityGraph, articulationGraph} = fixture();
  const input = beltInput(identityGraph, articulationGraph);
  const graph = createMechanismGraph(input);
  assert.deepEqual(validateMechanismGraph(graph), {valid: true, errors: []});
  const projection = physicalMechanismIdentityProjection(identityGraph, graph.mechanisms);
  const belt = projection.mechanisms[0].members.find((member) => member.memberId === 'belt-member');
  assert.equal(belt.aggregation, null);
  assert.equal(belt.effectiveRigidLinkId, null);
});

test('unaggregated physical parts cannot masquerade as rigidly incident contact elements', () => {
  const {identityGraph, articulationGraph} = fixture();
  const input = beltInput(identityGraph, articulationGraph, 'CONTACT_ELEMENT');
  input.mechanisms[0].kind = 'GEAR';
  input.mechanisms[0].edges[0].kind = 'MESHES_WITH';
  input.mechanisms[0].members[1].role = 'CONTACT_ELEMENT';
  assert.throws(() => createMechanismGraph(input), /requires exactly one AGGREGATES_INTO relation/);
});

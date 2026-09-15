import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createMechanismGraph,
  createPhysicalIdentityGraph,
  validateMechanismGraphBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = 'a'.repeat(64);
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Q = (parentId, translation_m = [0, 0, 0]) => ({parentId, translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});
const T = (translation_m = [0, 0, 0]) => ({translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});

function attachmentFixture() {
  return createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D,
    entities: [
      {id: 'base-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'gear-a-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
      {id: 'gear-b-body', scopeId: 'whole', evidenceRefs: ['source/ref.png']},
    ],
    relations: [
      {id: 'base-free', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'gear-a-hinge', mode: 'ARTICULATED', subjectId: 'gear-a-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
      {id: 'gear-b-hinge', mode: 'ARTICULATED', subjectId: 'gear-b-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/ref.png']},
    ],
    evidenceRefs: ['source/ref.png'],
  });
}

function identityInput({baseOffset = [0, 0, 0], unrelatedPart = false} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'base-link', kind: 'rigid-link', frame: Q('module-root', baseOffset)},
    {id: 'gear-a-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
    {id: 'gear-b-link', kind: 'rigid-link', frame: Q('module-root', [-1, 0, 0])},
    {id: 'joint-a', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
    {id: 'joint-b', kind: 'virtual-joint', frame: Q('base-link', [-1, 0, 0])},
    {id: 'gear-a-part', kind: 'physical-part', frame: Q('gear-a-link')},
    {id: 'gear-b-part', kind: 'physical-part', frame: Q('gear-b-link')},
    {id: 'gear-pair', kind: 'mechanism', frame: Q('module-root')},
  ];
  const relations = [
    {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
    {id: 'contains-gear-a-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-a-link']},
    {id: 'contains-gear-b-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-b-link']},
    {id: 'contains-joint-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-a']},
    {id: 'contains-joint-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-b']},
    {id: 'contains-gear-a-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-a-part']},
    {id: 'contains-gear-b-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-b-part']},
    {id: 'contains-gear-pair', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-pair']},
    {id: 'joint-a-connects', kind: 'CONNECTS', sourceId: 'joint-a', targetIds: ['base-link', 'gear-a-link']},
    {id: 'joint-b-connects', kind: 'CONNECTS', sourceId: 'joint-b', targetIds: ['base-link', 'gear-b-link']},
    {id: 'gear-a-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'gear-a-part', targetIds: ['gear-a-link']},
    {id: 'gear-b-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'gear-b-part', targetIds: ['gear-b-link']},
    {id: 'gear-pair-realizes', kind: 'REALIZES', sourceId: 'gear-pair', targetIds: ['joint-a', 'joint-b']},
  ];
  if (unrelatedPart) {
    entities.push(
      {id: 'unrelated-link', kind: 'rigid-link', frame: Q('module-root', [0, 2, 0])},
      {id: 'unrelated-part', kind: 'physical-part', frame: Q('unrelated-link')},
    );
    relations.push(
      {id: 'contains-unrelated-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['unrelated-link']},
      {id: 'contains-unrelated-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['unrelated-part']},
      {id: 'unrelated-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'unrelated-part', targetIds: ['unrelated-link']},
    );
  }
  return {scopeId: 'whole', sourceSha256: D, entities, relations};
}

const identityFixture = (options = {}) => createPhysicalIdentityGraph(identityInput(options));

function articulationFixture(identityGraph) {
  const attachmentSemantics = attachmentFixture();
  const jointContracts = [
    createArticulatedJoint({attachmentSemantics, id: 'joint-a', relationId: 'gear-a-hinge', ownerJointFrame: I([1, 0, 0]), subjectJointFrame: I(), minimumAngle: -2, maximumAngle: 2, evidenceRefs: ['model/gear-a.json']}),
    createArticulatedJoint({attachmentSemantics, id: 'joint-b', relationId: 'gear-b-hinge', ownerJointFrame: I([-1, 0, 0]), subjectJointFrame: I(), minimumAngle: -2, maximumAngle: 2, evidenceRefs: ['model/gear-b.json']}),
  ];
  return createArticulationGraph({
    scopeId: 'whole', sourceSha256: D, identityGraph, attachmentSemantics, jointContracts, rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'gear-a-link', attachmentEntityId: 'gear-a-body', attachmentFrameInLink: T()},
      {linkId: 'gear-b-link', attachmentEntityId: 'gear-b-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-a', parentLinkId: 'base-link', childLinkId: 'gear-a-link', referenceAngle: 0, jointContract: {schema: jointContracts[0].schema, id: jointContracts[0].id, jointDigest: jointContracts[0].jointDigest}},
      {virtualJointId: 'joint-b', parentLinkId: 'base-link', childLinkId: 'gear-b-link', referenceAngle: 0, jointContract: {schema: jointContracts[1].schema, id: jointContracts[1].id, jointDigest: jointContracts[1].jointDigest}},
    ],
  });
}

function mechanismInput(identityGraph, articulationGraph, firstPhysicalIdentityId = 'gear-a-part') {
  return {
    scopeId: 'whole', sourceSha256: D, identityGraph, articulationGraph,
    mechanisms: [{
      mechanismId: 'gear-pair', kind: 'GEAR', realizesRelationIds: ['gear-pair-realizes'], realizedJointIds: ['joint-a', 'joint-b'],
      members: [
        {id: 'gear-a-member', physicalIdentityId: firstPhysicalIdentityId, role: 'CONTACT_ELEMENT'},
        {id: 'gear-b-member', physicalIdentityId: 'gear-b-part', role: 'CONTACT_ELEMENT'},
      ],
      edges: [{id: 'gear-mesh', kind: 'MESHES_WITH', memberIds: ['gear-a-member', 'gear-b-member']}],
    }],
  };
}

test('mechanism members must resolve onto rigid links incident to realized joints', () => {
  const identityGraph = identityFixture({unrelatedPart: true});
  const articulationGraph = articulationFixture(identityGraph);
  assert.throws(
    () => createMechanismGraph(mechanismInput(identityGraph, articulationGraph, 'unrelated-part')),
    /is not incident to any realized articulation joint/,
  );
});

test('every realized joint requires at least one physically incident mechanism member', () => {
  const identityGraph = identityFixture();
  const articulationGraph = articulationFixture(identityGraph);
  const input = mechanismInput(identityGraph, articulationGraph);
  input.mechanisms[0].members[1].physicalIdentityId = 'gear-a-link';
  assert.throws(() => createMechanismGraph(input), /joint joint-b has no physically incident mechanism member/);
});

test('mechanism binding rejects a stale realized P04 reference pose even when P05 member projection is unchanged', () => {
  const identityGraph = identityFixture();
  const articulationGraph = articulationFixture(identityGraph);
  const graph = createMechanismGraph(mechanismInput(identityGraph, articulationGraph));

  const driftedIdentity = identityFixture({baseOffset: [0.125, 0, 0]});
  assert.equal(validateMechanismGraphBindings(graph, driftedIdentity, articulationGraph).valid, false);
  assert.match(validateMechanismGraphBindings(graph, driftedIdentity, articulationGraph).errors.join('; '), /stale against the current physical identity graph/);
});

test('BELT, LINKAGE, TENDON and sliding-contact edges enforce structural member roles', () => {
  const identityGraph = identityFixture();
  const articulationGraph = articulationFixture(identityGraph);

  const belt = mechanismInput(identityGraph, articulationGraph);
  belt.mechanisms[0].kind = 'BELT';
  belt.mechanisms[0].edges[0].kind = 'BELT_CONTACT';
  assert.throws(() => createMechanismGraph(belt), /requires at least one TENSION_ELEMENT|requires one TENSION_ELEMENT/);

  const linkage = mechanismInput(identityGraph, articulationGraph);
  linkage.mechanisms[0].kind = 'LINKAGE';
  linkage.mechanisms[0].edges[0].kind = 'PIN_CONNECTED';
  assert.throws(() => createMechanismGraph(linkage), /requires at least one LINK_ELEMENT|requires LINK_ELEMENT\/CARRIER/);

  const tendon = mechanismInput(identityGraph, articulationGraph);
  tendon.mechanisms[0].kind = 'TENDON';
  tendon.mechanisms[0].edges[0].kind = 'ROUTES_OVER';
  assert.throws(() => createMechanismGraph(tendon), /requires at least one TENSION_ELEMENT|requires a TENSION_ELEMENT/);

  const sliding = mechanismInput(identityGraph, articulationGraph);
  sliding.mechanisms[0].kind = 'CUSTOM';
  sliding.mechanisms[0].edges[0].kind = 'SLIDING_CONTACT';
  assert.throws(() => createMechanismGraph(sliding), /requires a GUIDE/);
});

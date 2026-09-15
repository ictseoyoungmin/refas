import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createMechanismGraph,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  digestJson,
  mechanismArticulationProjection,
  mechanismEdgeAuthoritySubjectId,
  mechanismTopologyAuthoritySubjectId,
  physicalMechanismIdentityProjection,
  validateMechanismGraph,
  validateMechanismGraphAuthority,
  validateMechanismGraphBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Q = (parentId, translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({parentId, translation_m, rotation_quat_xyzw});
const T = (translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({translation_m, rotation_quat_xyzw});

function attachmentFixture() {
  return createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(),
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

function identityInput({withController = false, gearAPartOffset = [0, 0, 0]} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
    {id: 'gear-a-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
    {id: 'gear-b-link', kind: 'rigid-link', frame: Q('module-root', [-1, 0, 0])},
    {id: 'joint-a', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
    {id: 'joint-b', kind: 'virtual-joint', frame: Q('base-link', [-1, 0, 0])},
    {id: 'gear-a-part', kind: 'physical-part', frame: Q('gear-a-link', gearAPartOffset)},
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
  if (withController) {
    entities.push({id: 'controller-extra', kind: 'controller'});
    relations.push({id: 'contains-controller-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-extra']});
  }
  return {scopeId: 'whole', sourceSha256: D(), entities, relations};
}

const identityFixture = (options = {}) => createPhysicalIdentityGraph(identityInput(options));

function jointContracts(attachmentSemantics) {
  return [
    createArticulatedJoint({attachmentSemantics, id: 'joint-a', relationId: 'gear-a-hinge', ownerJointFrame: I([1, 0, 0]), subjectJointFrame: I(), minimumAngle: -2, maximumAngle: 2, evidenceRefs: ['model/gear-a.json']}),
    createArticulatedJoint({attachmentSemantics, id: 'joint-b', relationId: 'gear-b-hinge', ownerJointFrame: I([-1, 0, 0]), subjectJointFrame: I(), minimumAngle: -2, maximumAngle: 2, evidenceRefs: ['model/gear-b.json']}),
  ];
}

function articulationFixture({identityGraph = identityFixture(), attachmentSemantics = attachmentFixture()} = {}) {
  const contracts = jointContracts(attachmentSemantics);
  const graph = createArticulationGraph({
    scopeId: 'whole', sourceSha256: D(), identityGraph, attachmentSemantics, jointContracts: contracts, rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'gear-a-link', attachmentEntityId: 'gear-a-body', attachmentFrameInLink: T()},
      {linkId: 'gear-b-link', attachmentEntityId: 'gear-b-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-a', parentLinkId: 'base-link', childLinkId: 'gear-a-link', referenceAngle: 0, jointContract: {schema: contracts[0].schema, id: contracts[0].id, jointDigest: contracts[0].jointDigest}},
      {virtualJointId: 'joint-b', parentLinkId: 'base-link', childLinkId: 'gear-b-link', referenceAngle: 0, jointContract: {schema: contracts[1].schema, id: contracts[1].id, jointDigest: contracts[1].jointDigest}},
    ],
  });
  return {graph, contracts, attachmentSemantics};
}

function mechanismInput({identityGraph = identityFixture(), articulationGraph = articulationFixture({identityGraph}).graph} = {}) {
  return {
    scopeId: 'whole', sourceSha256: D(), identityGraph, articulationGraph,
    mechanisms: [{
      mechanismId: 'gear-pair', kind: 'GEAR', realizesRelationIds: ['gear-pair-realizes'], realizedJointIds: ['joint-b', 'joint-a'],
      members: [
        {id: 'gear-a-member', physicalIdentityId: 'gear-a-part', role: 'CONTACT_ELEMENT'},
        {id: 'gear-b-member', physicalIdentityId: 'gear-b-part', role: 'CONTACT_ELEMENT'},
      ],
      edges: [{id: 'gear-mesh', kind: 'MESHES_WITH', memberIds: ['gear-b-member', 'gear-a-member']}],
    }],
  };
}

function authoritySet(graph) {
  const subjects = graph.mechanisms.flatMap((mechanism) => [mechanism.authoritySubjectId, ...mechanism.edges.map((edge) => edge.authoritySubjectId)]);
  return createSemanticAuthoritySet({
    scopeId: graph.scopeId, sourceSha256: graph.sourceSha256, targetSchema: graph.schema, targetDigest: graph.mechanismDigest,
    entries: subjects.map((subjectId, index) => ({id: `authority-${index}`, subjectId, authority: 'inferred', proposition: `mechanism construction ${subjectId}`, reason: 'physical mechanism structure requires an explicit semantic interpretation', basis: [{kind: 'structural-prior', ref: `mechanism/${subjectId}`}]})),
  });
}

test('mechanism graph keeps geared structure distinct from articulation and transmission semantics', () => {
  const input = mechanismInput(), graph = createMechanismGraph(input);
  assert.deepEqual(validateMechanismGraph(graph), {valid: true, errors: []});
  assert.equal(graph.mechanisms[0].kind, 'GEAR');
  assert.deepEqual(graph.mechanisms[0].realizedJointIds, ['joint-a', 'joint-b']);
  assert.equal(graph.mechanisms[0].edges[0].kind, 'MESHES_WITH');
  assert.equal('ratio' in graph.mechanisms[0], false);
  assert.equal('transmission' in graph.mechanisms[0], false);
  assert.equal(graph.policy.mechanismIdentityRemainsDistinctFromVirtualJoint, true);
  assert.equal(graph.policy.physicalStructureDoesNotImplyTransmission, true);
  assert.equal('identityGraph' in graph, false);
  assert.equal('articulationGraph' in graph, false);

  const reordered = mechanismInput();
  reordered.mechanisms[0].members.reverse(); reordered.mechanisms[0].realizedJointIds.reverse(); reordered.mechanisms[0].edges[0].memberIds.reverse();
  const graph2 = createMechanismGraph(reordered);
  assert.equal(graph2.mechanismDigest, graph.mechanismDigest);
  assert.deepEqual(graph2, graph);
});

test('mechanism graph binds exact P01 REALIZES targets and P04 realized joints', () => {
  const input = mechanismInput();
  const wrongRelation = structuredClone(input); wrongRelation.mechanisms[0].realizesRelationIds = ['joint-a-connects'];
  assert.throws(() => createMechanismGraph(wrongRelation), /must be REALIZES/);
  const missingJoint = structuredClone(input); missingJoint.mechanisms[0].realizedJointIds = ['joint-a'];
  assert.throws(() => createMechanismGraph(missingJoint), /must equal the union/);
  const articulationProjection = mechanismArticulationProjection(input.articulationGraph, ['joint-b', 'joint-a']);
  assert.deepEqual(articulationProjection.joints.map((joint) => joint.virtualJointId), ['joint-a', 'joint-b']);
  assert.throws(() => mechanismArticulationProjection(input.articulationGraph, ['joint-a', 'missing-joint']), /not present in the current articulation graph/);
});

test('GEAR mechanism requires connected contact topology and physical members', () => {
  const input = mechanismInput();
  const wrongRole = structuredClone(input); wrongRole.mechanisms[0].members[0].role = 'SUPPORT';
  assert.throws(() => createMechanismGraph(wrongRole), /requires CONTACT_ELEMENT members/);
  const missingMesh = structuredClone(input); missingMesh.mechanisms[0].edges[0].kind = 'FIXED_TO';
  assert.throws(() => createMechanismGraph(missingMesh), /requires at least one MESHES_WITH/);
  const dangling = structuredClone(input); dangling.mechanisms[0].edges[0].memberIds[1] = 'missing-member';
  assert.throws(() => createMechanismGraph(dangling), /unknown mechanism member/);
  const wrongKind = structuredClone(input); wrongKind.mechanisms[0].members[0].physicalIdentityId = 'joint-a';
  assert.throws(() => createMechanismGraph(wrongKind), /must reference physical-part or rigid-link/);
});

test('mechanism scoped identity binding ignores unrelated controller edits but catches resolved member-pose drift', () => {
  const input = mechanismInput(), graph = createMechanismGraph(input);
  const unrelatedIdentity = identityFixture({withController: true});
  const unrelatedArticulation = articulationFixture({identityGraph: unrelatedIdentity}).graph;
  assert.equal(validateMechanismGraphBindings(graph, unrelatedIdentity, unrelatedArticulation).valid, true);
  const graph2 = createMechanismGraph(mechanismInput({identityGraph: unrelatedIdentity, articulationGraph: unrelatedArticulation}));
  assert.equal(graph2.identityBinding.projectionDigest, graph.identityBinding.projectionDigest);
  assert.equal(graph2.mechanismDigest, graph.mechanismDigest);

  const driftedIdentity = identityFixture({gearAPartOffset: [.125, 0, 0]});
  const driftedArticulation = articulationFixture({identityGraph: driftedIdentity}).graph;
  const projection = physicalMechanismIdentityProjection(driftedIdentity, graph.mechanisms);
  assert.notEqual(graph.identityBinding.projectionDigest, digestJson(projection));
  assert.equal(validateMechanismGraphBindings(graph, driftedIdentity, driftedArticulation).valid, false);
});

test('mechanism articulation binding is scoped to realized P04 joints', () => {
  const input = mechanismInput(), graph = createMechanismGraph(input);
  const changedArticulation = structuredClone(input.articulationGraph);
  changedArticulation.joints[0].referenceAngle = .25;
  const payload = structuredClone(changedArticulation); delete payload.articulationDigest;
  changedArticulation.articulationDigest = digestJson(payload);
  assert.equal(validateMechanismGraphBindings(graph, input.identityGraph, changedArticulation).valid, false);
});

test('mechanism graph requires existing semantic authority for topology and structural edges', () => {
  const graph = createMechanismGraph(mechanismInput()), authority = authoritySet(graph);
  assert.equal(validateMechanismGraphAuthority(graph, authority).valid, true);
  assert.equal(mechanismTopologyAuthoritySubjectId('gear-pair'), graph.mechanisms[0].authoritySubjectId);
  assert.equal(mechanismEdgeAuthoritySubjectId('gear-pair', 'gear-mesh'), graph.mechanisms[0].edges[0].authoritySubjectId);
  const unresolved = createSemanticAuthoritySet({
    scopeId: graph.scopeId, sourceSha256: graph.sourceSha256, targetSchema: graph.schema, targetDigest: graph.mechanismDigest,
    entries: authority.entries.map((entry, index) => index === 0 ? {id: entry.id, subjectId: entry.subjectId, authority: 'unknown', proposition: entry.proposition, reason: 'unresolved', basis: []} : {id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis}),
  });
  assert.equal(validateMechanismGraphAuthority(graph, unresolved).valid, false);
});

test('mechanism graph rejects transmission leakage, backend identity, and tampering', () => {
  const input = mechanismInput();
  const ratioLeak = structuredClone(input); ratioLeak.mechanisms[0].ratio = 2;
  assert.throws(() => createMechanismGraph(ratioLeak), /unsupported field/);
  const backendLeak = structuredClone(input); backendLeak.mechanisms[0].members[0].backendIndex = 3;
  assert.throws(() => createMechanismGraph(backendLeak), /unsupported field/);
  const graph = createMechanismGraph(input), tampered = structuredClone(graph); tampered.mechanisms[0].edges[0].kind = 'FIXED_TO';
  assert.equal(validateMechanismGraph(tampered).valid, false);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  articulationJointAuthoritySubjectId,
  articulationLinkBindingAuthoritySubjectId,
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  digestJson,
  physicalArticulationIdentityProjection,
  validateArticulationGraph,
  validateArticulationGraphAuthority,
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

function identityInput({withController = false} = {}) {
  const entities = [
    {id: 'module-root', kind: 'assembly-module'},
    {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
    {id: 'arm-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
    {id: 'tip-link', kind: 'rigid-link', frame: Q('module-root', [2, 0, 0])},
    {id: 'joint-shoulder', kind: 'virtual-joint', frame: Q('base-link')},
    {id: 'joint-tip', kind: 'virtual-joint', frame: Q('arm-link')},
  ];
  const relations = [
    {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
    {id: 'contains-arm', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['arm-link']},
    {id: 'contains-tip', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tip-link']},
    {id: 'contains-shoulder', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-shoulder']},
    {id: 'contains-tip-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-tip']},
    {id: 'shoulder-connects', kind: 'CONNECTS', sourceId: 'joint-shoulder', targetIds: ['arm-link', 'base-link']},
    {id: 'tip-connects', kind: 'CONNECTS', sourceId: 'joint-tip', targetIds: ['tip-link', 'arm-link']},
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
    createArticulatedJoint({attachmentSemantics, id: 'joint-shoulder', relationId: 'arm-hinge', ownerJointFrame: I(), subjectJointFrame: I(), minimumAngle: -1, maximumAngle: 1, evidenceRefs: ['model/shoulder.json']}),
    createArticulatedJoint({attachmentSemantics, id: 'joint-tip', relationId: 'tip-hinge', ownerJointFrame: I(), subjectJointFrame: I(), minimumAngle: -.5, maximumAngle: .5, evidenceRefs: ['model/tip.json']}),
  ];
}

function graphInput({identityGraph = identityFixture(), attachmentSemantics = attachmentFixture(), jointContracts: contracts = jointContracts(attachmentSemantics)} = {}) {
  return {
    identityGraph, attachmentSemantics, jointContracts: contracts, rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'arm-link', attachmentEntityId: 'arm-body', attachmentFrameInLink: T()},
      {linkId: 'tip-link', attachmentEntityId: 'tip-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-shoulder', parentLinkId: 'base-link', childLinkId: 'arm-link', jointContract: {schema: contracts[0].schema, id: contracts[0].id, jointDigest: contracts[0].jointDigest}},
      {virtualJointId: 'joint-tip', parentLinkId: 'arm-link', childLinkId: 'tip-link', jointContract: {schema: contracts[1].schema, id: contracts[1].id, jointDigest: contracts[1].jointDigest}},
    ],
  };
}

function authoritySet(graph) {
  const subjects = [...graph.linkBindings.map((binding) => binding.authoritySubjectId), ...graph.joints.map((joint) => joint.authoritySubjectId)];
  return createSemanticAuthoritySet({
    scopeId: graph.scopeId, sourceSha256: graph.sourceSha256, targetSchema: graph.schema, targetDigest: graph.articulationDigest,
    entries: subjects.map((subjectId, index) => ({id: `authority-${index}`, subjectId, authority: 'inferred', proposition: `construction mapping ${subjectId}`, reason: 'assembly topology requires an explicit semantic mapping', basis: [{kind: 'structural-prior', ref: `articulation/${subjectId}`}]})),
  });
}

test('articulation graph composes existing typed joints into a deterministic rooted tree', () => {
  const input = graphInput();
  const graph = createArticulationGraph(input);
  assert.equal(validateArticulationGraph(graph, {attachmentSemantics: input.attachmentSemantics, jointContracts: input.jointContracts}).valid, true);
  assert.equal(graph.topology, 'TREE');
  assert.equal(graph.rootLinkId, 'base-link');
  assert.equal(graph.joints.length, 2);
  assert.deepEqual(graph.joints[0].parentJointFrame, T());
  assert.deepEqual(graph.joints[1].parentJointFrame, T());
  assert.equal(graph.policy.existingTypedJointContractsRemainAuthoritative, true);
  assert.equal(graph.policy.attachmentInterfacesRemainDistinctFromJoints, true);
  const reordered = graphInput(); reordered.linkBindings.reverse(); reordered.joints.reverse(); reordered.jointContracts.reverse();
  const graph2 = createArticulationGraph(reordered);
  assert.equal(graph2.articulationDigest, graph.articulationDigest);
  assert.deepEqual(graph2, graph);
});

test('articulation graph binds exact P01 joint identities and CONNECTS pairs', () => {
  const input = graphInput();
  const wrongPair = structuredClone(input); wrongPair.joints[0].childLinkId = 'tip-link';
  assert.throws(() => createArticulationGraph(wrongPair), /CONNECTS relation does not match/);
  const wrongId = structuredClone(input); wrongId.joints[0].jointContract.id = 'joint-tip';
  assert.throws(() => createArticulationGraph(wrongId), /must equal virtualJointId/);
  const stale = structuredClone(input); stale.joints[0].jointContract.jointDigest = D('f');
  assert.throws(() => createArticulationGraph(stale), /typed joint digest is stale/);
});

test('articulation graph rejects attachment-owner mismatch and canonical joint-frame drift', () => {
  const input = graphInput();
  const ownerMismatch = structuredClone(input);
  const baseBinding = ownerMismatch.linkBindings.find((binding) => binding.linkId === 'base-link');
  const tipBinding = ownerMismatch.linkBindings.find((binding) => binding.linkId === 'tip-link');
  [baseBinding.attachmentEntityId, tipBinding.attachmentEntityId] = [tipBinding.attachmentEntityId, baseBinding.attachmentEntityId];
  assert.throws(() => createArticulationGraph(ownerMismatch), /typed joint owner does not map to parent rigid link/);
  const frameDriftInput = identityInput(); frameDriftInput.entities.find((entity) => entity.id === 'joint-shoulder').frame.translation_m = [.1, 0, 0];
  const frameDrift = graphInput({identityGraph: createPhysicalIdentityGraph(frameDriftInput)});
  assert.throws(() => createArticulationGraph(frameDrift), /canonical frame does not match/);
});

test('articulation graph rejects malformed parent assignments and incomplete topology', () => {
  const input = graphInput();
  const malformed = structuredClone(input); malformed.joints[1].childLinkId = 'arm-link';
  assert.throws(() => createArticulationGraph(malformed), /parent and child links must differ|CONNECTS relation does not match|multiple parent joints/);
  const missing = structuredClone(input); missing.joints.pop();
  assert.throws(() => createArticulationGraph(missing), /exactly links - 1 joints|cover exactly/);
});

test('articulation identity binding is scoped and ignores unrelated controller edits', () => {
  const base = graphInput(), graph = createArticulationGraph(base);
  const unrelatedIdentity = identityFixture({withController: true});
  const graph2 = createArticulationGraph(graphInput({identityGraph: unrelatedIdentity, attachmentSemantics: base.attachmentSemantics, jointContracts: base.jointContracts}));
  assert.equal(graph2.identityBinding.projectionDigest, graph.identityBinding.projectionDigest);
  const changedIdentityInput = identityInput(); changedIdentityInput.entities.find((entity) => entity.id === 'joint-tip').frame.rotation_quat_xyzw = [0, 0, 1, 0];
  const projection = physicalArticulationIdentityProjection(createPhysicalIdentityGraph(changedIdentityInput), ['base-link', 'arm-link', 'tip-link'], ['joint-shoulder', 'joint-tip']);
  assert.notEqual(graph.identityBinding.projectionDigest, digestJson(projection));
});

test('articulation graph requires existing semantic authority for link mappings and topology', () => {
  const input = graphInput(), graph = createArticulationGraph(input), authority = authoritySet(graph);
  assert.equal(validateArticulationGraphAuthority(graph, authority, {attachmentSemantics: input.attachmentSemantics, jointContracts: input.jointContracts}).valid, true);
  const unresolved = createSemanticAuthoritySet({scopeId: graph.scopeId, sourceSha256: graph.sourceSha256, targetSchema: graph.schema, targetDigest: graph.articulationDigest, entries: authority.entries.map((entry, index) => index === 0 ? {id: entry.id, subjectId: entry.subjectId, authority: 'unknown', proposition: entry.proposition, reason: 'unresolved', basis: []} : {id: entry.id, subjectId: entry.subjectId, authority: entry.authority, proposition: entry.proposition, reason: entry.reason, basis: entry.basis})});
  assert.equal(validateArticulationGraphAuthority(graph, unresolved, {attachmentSemantics: input.attachmentSemantics, jointContracts: input.jointContracts}).valid, false);
});

test('articulation graph remains tamper detectable without mutating legacy joint contracts', () => {
  const input = graphInput(), legacyDigest = input.jointContracts[0].jointDigest, graph = createArticulationGraph(input), tampered = structuredClone(graph);
  tampered.joints[0].childJointFrame.translation_m[0] = .25;
  assert.equal(validateArticulationGraph(tampered, {attachmentSemantics: input.attachmentSemantics, jointContracts: input.jointContracts}).valid, false);
  assert.equal(input.jointContracts[0].jointDigest, legacyDigest);
  assert.equal(input.jointContracts[0].schema, 'refas.articulated-joint/v1');
  assert.equal(articulationLinkBindingAuthoritySubjectId('base-link').includes('base-link'), true);
  assert.equal(articulationJointAuthoritySubjectId('joint-shoulder').includes('joint-shoulder'), true);
});

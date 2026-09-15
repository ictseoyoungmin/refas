import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizePhysicalQuaternion,
  createAttachmentSemantics,
  createPhysicalIdentityGraph,
  digestJson,
  physicalIdentityById,
  physicalRelationsForEntity,
  validatePhysicalIdentityGraph,
  validatePhysicalIdentityGraphBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_DIGEST = 'a'.repeat(64);

function attachmentFixture() {
  return createAttachmentSemantics({
    scopeId: 'whole',
    sourceSha256: SOURCE_DIGEST,
    entities: [
      {id: 'module-a', scopeId: 'whole', evidenceRefs: ['source/reference.png']},
      {id: 'module-b', scopeId: 'whole', evidenceRefs: ['source/reference.png']},
    ],
    relations: [
      {
        id: 'attachment-root',
        mode: 'FREE',
        subjectId: 'module-a',
        ownerIds: [],
        basis: 'construction',
        evidenceRefs: ['source/reference.png'],
      },
      {
        id: 'attachment-module-b',
        mode: 'RIGID_FOLLOW',
        subjectId: 'module-b',
        ownerIds: ['module-a'],
        basis: 'construction',
        evidenceRefs: ['source/reference.png'],
      },
    ],
    evidenceRefs: ['source/reference.png'],
  });
}

function graphInput({attachmentSemantics = attachmentFixture()} = {}) {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE_DIGEST,
    attachmentSemantics,
    entities: [
      {id: 'module-a', kind: 'assembly-module'},
      {
        id: 'module-b',
        kind: 'assembly-module',
        frame: {parentId: 'module-a', translation_m: [0.4, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-shell',
        kind: 'physical-part',
        frame: {parentId: 'module-a', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, -2]},
      },
      {
        id: 'link-a',
        kind: 'rigid-link',
        frame: {parentId: 'module-a', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'link-b',
        kind: 'rigid-link',
        frame: {parentId: 'module-b', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'interface-a',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-standard-a'],
        frame: {parentId: 'module-a', translation_m: [0.2, 0, 0], rotation_quat_xyzw: [1, 0, 0, 0]},
      },
      {
        id: 'interface-b',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-standard-a'],
        frame: {parentId: 'module-b', translation_m: [-0.2, 0, 0], rotation_quat_xyzw: [-1, 0, 0, 0]},
      },
      {
        id: 'joint-a',
        kind: 'virtual-joint',
        frame: {parentId: 'link-a', translation_m: [0.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'mechanism-a',
        kind: 'mechanism',
        frame: {parentId: 'module-a', translation_m: [0.1, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {id: 'transmission-a', kind: 'transmission'},
      {
        id: 'actuator-a',
        kind: 'actuator',
        frame: {parentId: 'module-a', translation_m: [0.1, 0.1, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {id: 'controller-a', kind: 'controller'},
      {id: 'runtime-endpoint-a', kind: 'runtime-endpoint'},
    ],
    relations: [
      {id: 'contains-module-b', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['module-b']},
      {id: 'contains-part-shell', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['part-shell']},
      {id: 'contains-link-a', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['link-a']},
      {id: 'contains-link-b', kind: 'CONTAINS', sourceId: 'module-b', targetIds: ['link-b']},
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['joint-a']},
      {id: 'contains-mechanism', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['mechanism-a']},
      {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['transmission-a']},
      {id: 'contains-actuator', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['actuator-a']},
      {id: 'contains-controller', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['controller-a']},
      {id: 'contains-runtime', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['runtime-endpoint-a']},
      {id: 'exposes-interface-a', kind: 'EXPOSES', sourceId: 'module-a', targetIds: ['interface-a']},
      {id: 'exposes-interface-b', kind: 'EXPOSES', sourceId: 'module-b', targetIds: ['interface-b']},
      {id: 'interfaces-compatible', kind: 'COMPATIBLE_WITH', sourceId: 'interface-b', targetIds: ['interface-a']},
      {
        id: 'interfaces-bound',
        kind: 'BINDS_TO',
        sourceId: 'interface-b',
        targetIds: ['interface-a'],
        attachmentRelationId: 'attachment-module-b',
      },
      {id: 'part-to-link', kind: 'AGGREGATES_INTO', sourceId: 'part-shell', targetIds: ['link-a']},
      {id: 'joint-connects-links', kind: 'CONNECTS', sourceId: 'joint-a', targetIds: ['link-b', 'link-a']},
      {id: 'mechanism-realizes-joint', kind: 'REALIZES', sourceId: 'mechanism-a', targetIds: ['joint-a']},
      {id: 'transmission-maps-spaces', kind: 'MAPS', sourceId: 'transmission-a', targetIds: ['joint-a', 'actuator-a']},
      {id: 'actuator-drives-transmission', kind: 'DRIVES', sourceId: 'actuator-a', targetIds: ['transmission-a']},
      {id: 'controller-commands-actuator', kind: 'COMMANDS', sourceId: 'controller-a', targetIds: ['actuator-a']},
      {id: 'runtime-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-endpoint-a', targetIds: ['controller-a']},
    ],
  };
}

test('physical identity graph preserves separate identities and canonicalizes ordering and quaternion sign', () => {
  const attachmentSemantics = attachmentFixture();
  const input = graphInput({attachmentSemantics});
  const graph = createPhysicalIdentityGraph(input);

  assert.deepEqual(validatePhysicalIdentityGraph(graph), {valid: true, errors: []});
  assert.deepEqual(validatePhysicalIdentityGraphBindings(graph, attachmentSemantics), {valid: true, errors: []});
  assert.equal(graph.policy.attachmentInterfacesAreNotJoints, true);
  assert.equal(graph.policy.backendIndicesNeverSemanticIdentity, true);
  assert.deepEqual(
    physicalIdentityById(graph, 'part-shell').frame.rotation_quat_xyzw,
    [0, 0, 0, 1],
  );
  assert.deepEqual(
    physicalIdentityById(graph, 'interface-b').frame.rotation_quat_xyzw,
    [1, 0, 0, 0],
  );
  assert.deepEqual(
    graph.relations.find((relation) => relation.id === 'interfaces-bound'),
    {
      id: 'interfaces-bound',
      kind: 'BINDS_TO',
      sourceId: 'interface-a',
      targetIds: ['interface-b'],
      attachmentRelationId: 'attachment-module-b',
    },
  );

  const reordered = graphInput({attachmentSemantics});
  reordered.entities.reverse();
  reordered.relations.reverse();
  const reorderedGraph = createPhysicalIdentityGraph(reordered);
  assert.equal(reorderedGraph.graphDigest, graph.graphDigest);
  assert.deepEqual(reorderedGraph, graph);

  assert.deepEqual(canonicalizePhysicalQuaternion([0, 0, 0, -5]), [0, 0, 0, 1]);
  assert.deepEqual(canonicalizePhysicalQuaternion([-1, 0, 0, 0]), [1, 0, 0, 0]);
  assert.equal(physicalRelationsForEntity(graph, 'joint-a').some((relation) => relation.kind === 'CONNECTS'), true);
});

test('physical identity graph rejects identity collisions, backend indices, dangling relations, and joint-interface conflation', () => {
  const base = graphInput();

  const duplicate = structuredClone(base);
  duplicate.entities.push({id: 'joint-a', kind: 'actuator'});
  assert.throws(() => createPhysicalIdentityGraph(duplicate), /globally unique/);

  const relationCollision = structuredClone(base);
  relationCollision.relations[0].id = 'module-a';
  assert.throws(() => createPhysicalIdentityGraph(relationCollision), /collides with entity ID/);

  const backendIndex = structuredClone(base);
  backendIndex.entities.find((entity) => entity.id === 'actuator-a').backendIndex = 3;
  assert.throws(() => createPhysicalIdentityGraph(backendIndex), /unsupported field/);

  const dangling = structuredClone(base);
  dangling.relations.find((relation) => relation.id === 'controller-commands-actuator').targetIds = ['missing-actuator'];
  assert.throws(() => createPhysicalIdentityGraph(dangling), /unknown entity/);

  const conflated = structuredClone(base);
  conflated.relations.find((relation) => relation.id === 'joint-connects-links').sourceId = 'interface-a';
  assert.throws(() => createPhysicalIdentityGraph(conflated), /CONNECTS source must be one of: virtual-joint/);
});

test('physical identity graph rejects invalid canonical frames and cycles', () => {
  const zeroQuaternion = structuredClone(graphInput());
  zeroQuaternion.entities.find((entity) => entity.id === 'interface-a').frame.rotation_quat_xyzw = [0, 0, 0, 0];
  assert.throws(() => createPhysicalIdentityGraph(zeroQuaternion), /non-zero norm/);

  const nonFinite = structuredClone(graphInput());
  nonFinite.entities.find((entity) => entity.id === 'interface-a').frame.translation_m = [0, Number.POSITIVE_INFINITY, 0];
  assert.throws(() => createPhysicalIdentityGraph(nonFinite), /finite number/);

  const selfParent = structuredClone(graphInput());
  selfParent.entities.find((entity) => entity.id === 'link-a').frame.parentId = 'link-a';
  assert.throws(() => createPhysicalIdentityGraph(selfParent), /may not parent itself/);

  const frameCycle = structuredClone(graphInput());
  frameCycle.entities.find((entity) => entity.id === 'module-a').frame = {
    parentId: 'module-b',
    translation_m: [0, 0, 0],
    rotation_quat_xyzw: [0, 0, 0, 1],
  };
  assert.throws(() => createPhysicalIdentityGraph(frameCycle), /frame graph contains a cycle/);

  const containmentCycle = structuredClone(graphInput());
  containmentCycle.relations.push({
    id: 'contains-module-a',
    kind: 'CONTAINS',
    sourceId: 'module-b',
    targetIds: ['module-a'],
  });
  assert.throws(() => createPhysicalIdentityGraph(containmentCycle), /containment graph contains a cycle/);
});

test('interface binding reuses exact attachment semantics instead of declaring a second attachment mode', () => {
  const attachmentSemantics = attachmentFixture();
  const input = graphInput({attachmentSemantics});

  const missingProof = structuredClone(input);
  delete missingProof.attachmentSemantics;
  assert.throws(() => createPhysicalIdentityGraph(missingProof), /exact attachment semantics contract/);

  const unknownRelation = graphInput({attachmentSemantics});
  unknownRelation.relations.find((relation) => relation.kind === 'BINDS_TO').attachmentRelationId = 'missing-relation';
  assert.throws(() => createPhysicalIdentityGraph(unknownRelation), /unknown attachment relation/);

  const freeRelation = graphInput({attachmentSemantics});
  freeRelation.relations.find((relation) => relation.kind === 'BINDS_TO').attachmentRelationId = 'attachment-root';
  assert.throws(() => createPhysicalIdentityGraph(freeRelation), /cannot reference FREE/);

  const graph = createPhysicalIdentityGraph(input);
  const otherAttachment = structuredClone(attachmentSemantics);
  otherAttachment.semanticsDigest = 'f'.repeat(64);
  assert.equal(validatePhysicalIdentityGraphBindings(graph, otherAttachment).valid, false);
});

test('persisted physical identity graphs fail canonical validation after re-signed noncanonical mutation', () => {
  const graph = createPhysicalIdentityGraph(graphInput());
  const tampered = structuredClone(graph);
  const interfaceEntity = tampered.entities.find((entity) => entity.id === 'interface-a');
  interfaceEntity.frame.rotation_quat_xyzw = [-1, 0, 0, 0];
  const payload = structuredClone(tampered);
  delete payload.graphDigest;
  tampered.graphDigest = digestJson(payload);

  const validation = validatePhysicalIdentityGraph(tampered);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => /not canonical|digest mismatch/.test(error)), true);
});

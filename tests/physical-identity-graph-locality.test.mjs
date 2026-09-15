import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAttachmentSemantics,
  createPhysicalIdentityGraph,
  validatePhysicalIdentityGraph,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_DIGEST = 'b'.repeat(64);

function attachmentFixture(scopeId = 'whole') {
  return createAttachmentSemantics({
    scopeId,
    sourceSha256: SOURCE_DIGEST,
    entities: [
      {id: 'module-a', scopeId, evidenceRefs: ['source/reference.png']},
      {id: 'module-b', scopeId, evidenceRefs: ['source/reference.png']},
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

function graphFixture({attachmentSemantics = attachmentFixture()} = {}) {
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
        id: 'link-b',
        kind: 'rigid-link',
        frame: {parentId: 'module-b', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-b',
        kind: 'physical-part',
        frame: {parentId: 'link-b', translation_m: [0, 0.02, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'interface-a',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-standard-a'],
        frame: {parentId: 'module-a', translation_m: [0.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'interface-b',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-standard-a'],
        frame: {parentId: 'part-b', translation_m: [-0.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
    ],
    relations: [
      {id: 'contains-module-b', kind: 'CONTAINS', sourceId: 'module-a', targetIds: ['module-b']},
      {id: 'contains-link-b', kind: 'CONTAINS', sourceId: 'module-b', targetIds: ['link-b']},
      {id: 'contains-part-b', kind: 'CONTAINS', sourceId: 'module-b', targetIds: ['part-b']},
      {id: 'exposes-interface-a', kind: 'EXPOSES', sourceId: 'module-a', targetIds: ['interface-a']},
      {id: 'exposes-interface-b', kind: 'EXPOSES', sourceId: 'module-b', targetIds: ['interface-b']},
      {id: 'interfaces-compatible', kind: 'COMPATIBLE_WITH', sourceId: 'interface-a', targetIds: ['interface-b']},
      {
        id: 'interfaces-bound',
        kind: 'BINDS_TO',
        sourceId: 'interface-a',
        targetIds: ['interface-b'],
        attachmentRelationId: 'attachment-module-b',
      },
    ],
  };
}

test('physical frame ancestry stays inside the semantic owner module', () => {
  const graph = createPhysicalIdentityGraph(graphFixture());
  assert.deepEqual(validatePhysicalIdentityGraph(graph), {valid: true, errors: []});

  const escapedInterface = structuredClone(graphFixture());
  escapedInterface.entities.find((entity) => entity.id === 'interface-b').frame.parentId = 'module-a';
  assert.throws(
    () => createPhysicalIdentityGraph(escapedInterface),
    /interface-b frame escapes owning module module-b/,
  );

  const escapedContainedLink = structuredClone(graphFixture());
  escapedContainedLink.entities.find((entity) => entity.id === 'link-b').frame.parentId = 'module-a';
  assert.throws(
    () => createPhysicalIdentityGraph(escapedContainedLink),
    /link-b frame escapes owning module module-b/,
  );
});

test('attachment interfaces require one module exposure before they can own a local frame', () => {
  const input = graphFixture();
  input.relations = input.relations.filter((relation) => relation.id !== 'exposes-interface-b');
  assert.throws(
    () => createPhysicalIdentityGraph(input),
    /attachment interface interface-b must be exposed by exactly one assembly module/,
  );
});

test('compatibility families constrain explicit compatibility but do not create it implicitly', () => {
  const incompatibleEdge = graphFixture();
  incompatibleEdge.entities.find((entity) => entity.id === 'interface-b').compatibilityFamilyIds = ['mount-standard-b'];
  assert.throws(
    () => createPhysicalIdentityGraph(incompatibleEdge),
    /COMPATIBLE_WITH endpoints must share at least one compatibility family/,
  );

  const incompatibleBinding = graphFixture();
  incompatibleBinding.entities.find((entity) => entity.id === 'interface-b').compatibilityFamilyIds = ['mount-standard-b'];
  incompatibleBinding.relations = incompatibleBinding.relations.filter((relation) => relation.kind !== 'COMPATIBLE_WITH');
  assert.throws(
    () => createPhysicalIdentityGraph(incompatibleBinding),
    /BINDS_TO endpoints declare disjoint compatibility families/,
  );

  const familyOnly = graphFixture();
  familyOnly.relations = familyOnly.relations.filter((relation) => relation.kind !== 'COMPATIBLE_WITH' && relation.kind !== 'BINDS_TO');
  delete familyOnly.attachmentSemantics;
  const graph = createPhysicalIdentityGraph(familyOnly);
  assert.equal(graph.relations.some((relation) => relation.kind === 'COMPATIBLE_WITH'), false);
  assert.equal(graph.relations.some((relation) => relation.kind === 'BINDS_TO'), false);
});

test('attachment binding proof must match physical graph scope as well as source bytes', () => {
  const input = graphFixture({attachmentSemantics: attachmentFixture('region')});
  assert.throws(
    () => createPhysicalIdentityGraph(input),
    /attachment semantics and physical identity graph scopeId differ/,
  );
});

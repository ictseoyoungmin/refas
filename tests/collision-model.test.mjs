import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collisionAuthoritySubjectIds,
  collisionColliderAuthoritySubjectId,
  collisionFilterAuthoritySubjectId,
  collisionForLink,
  createCollisionModel,
  createCollisionVisualGeometryManifest,
  createPhysicalIdentityGraph,
  createSemanticAuthoritySet,
  physicalCollisionIdentityProjection,
  validateCollisionModel,
  validateCollisionModelAuthority,
  validateCollisionModelBindings,
  validateCollisionVisualReuseBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function identityGraphInput() {
  return {
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'link-a',
        kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'link-b',
        kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0.5, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-a',
        kind: 'physical-part',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
    ],
    relations: [
      {id: 'contains-link-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-link-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-b']},
      {id: 'contains-part-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'part-a-to-link-a', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  };
}

function identityGraph() {
  return createPhysicalIdentityGraph(identityGraphInput());
}

function collisionInput(graph = identityGraph()) {
  return {
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph: graph,
    groups: ['environment', 'body', 'tool'],
    links: [
      {
        linkId: 'link-b',
        selfCollisionPolicy: 'DISABLED',
        colliders: [
          {
            id: 'link-b-sphere',
            frame: {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, -2]},
            geometry: {kind: 'SPHERE', radius_m: 0.08},
            filter: {groupIds: ['body'], maskGroupIds: ['environment', 'tool']},
          },
        ],
      },
      {
        linkId: 'link-a',
        selfCollisionPolicy: 'ENABLED',
        colliders: [
          {
            id: 'link-a-box',
            frame: {translation_m: [0.01, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
            geometry: {kind: 'BOX', size_m: [0.2, 0.1, 0.08]},
            filter: {groupIds: ['body'], maskGroupIds: ['tool', 'environment']},
          },
          {
            id: 'link-a-hull',
            frame: {translation_m: [0, 0, 0.04], rotation_quat_xyzw: [0, 0, 0, 1]},
            geometry: {
              kind: 'CONVEX_HULL',
              vertices_m: [
                [0.03, 0.02, 0.02],
                [0, 0, 0],
                [0, 0.02, 0],
                [0.03, 0, 0],
                [0, 0, 0.02],
              ],
            },
            filter: {groupIds: ['body'], maskGroupIds: ['environment']},
          },
          {
            id: 'link-a-mesh',
            frame: {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
            geometry: {
              kind: 'MESH',
              meshId: 'collision-shell-a',
              geometryDigest: D('b'),
              reuseMode: 'DECLARED_VISUAL_REUSE',
              visualGeometryRef: {geometryId: 'visual-shell-a', geometryDigest: D('b')},
            },
            filter: {groupIds: ['tool'], maskGroupIds: ['body', 'environment']},
          },
        ],
      },
    ],
  };
}

function authorityEntry(subjectId, authority = 'engineered') {
  if (authority === 'observed') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${subjectId} is directly supported by source evidence.`,
      basis: [{kind: 'source-evidence', ref: `source:${subjectId}`}],
    };
  }
  if (authority === 'inferred') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${subjectId} is a bounded collision inference.`,
      reason: 'Visible structure constrains a conservative proxy.',
      basis: [{kind: 'structural-prior', ref: `prior:${subjectId}`}],
    };
  }
  if (authority === 'unknown') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${subjectId} is unresolved.`,
      reason: 'Available evidence does not authorize a positive collision construction.',
      basis: [],
    };
  }
  return {
    id: `authority-${subjectId.replaceAll(':', '-')}`,
    subjectId,
    authority: 'engineered',
    proposition: `${subjectId} is deliberately engineered for collision behavior.`,
    reason: 'The declared downstream simulation use requires explicit collision semantics.',
    basis: [{kind: 'functional-requirement', ref: `requirement:${subjectId}`}],
  };
}

function authoritySet(contract, overrides = {}, {omit = [], extra = []} = {}) {
  const omitted = new Set(omit);
  const entries = collisionAuthoritySubjectIds(contract)
    .filter((subjectId) => !omitted.has(subjectId))
    .map((subjectId) => authorityEntry(subjectId, overrides[subjectId] ?? 'engineered'));
  entries.push(...extra);
  return createSemanticAuthoritySet({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    targetSchema: contract.schema,
    targetDigest: contract.collisionDigest,
    entries,
  });
}

test('collision model canonicalizes ordering, local frames, filters, and hull point sets', () => {
  const graph = identityGraph();
  const contract = createCollisionModel(collisionInput(graph));

  assert.deepEqual(validateCollisionModel(contract), {valid: true, errors: []});
  assert.deepEqual(validateCollisionModelBindings(contract, graph), {valid: true, errors: []});
  assert.deepEqual(contract.groups, ['body', 'environment', 'tool']);
  assert.deepEqual(contract.links.map((link) => link.linkId), ['link-a', 'link-b']);
  assert.deepEqual(collisionForLink(contract, 'link-b').colliders[0].frame.rotation_quat_xyzw, [0, 0, 0, 1]);
  assert.deepEqual(collisionForLink(contract, 'link-a').colliders.find((item) => item.id === 'link-a-box').filter.maskGroupIds, ['environment', 'tool']);
  assert.deepEqual(collisionForLink(contract, 'link-a').colliders.find((item) => item.id === 'link-a-hull').geometry.vertices_m, [
    [0, 0, 0],
    [0, 0, 0.02],
    [0, 0.02, 0],
    [0.03, 0, 0],
    [0.03, 0.02, 0.02],
  ]);
  assert.equal(contract.policy.collisionIdentityIndependentFromRenderIdentity, true);
  assert.equal(contract.policy.visualReuseRequiresExplicitDeclaration, true);
  assert.equal(contract.policy.backendFilterIndicesAreNotSemantic, true);

  const reordered = collisionInput(graph);
  reordered.groups.reverse();
  reordered.links.reverse();
  for (const link of reordered.links) {
    link.colliders.reverse();
    for (const collider of link.colliders) {
      collider.filter.groupIds.reverse();
      collider.filter.maskGroupIds.reverse();
      if (collider.geometry.kind === 'CONVEX_HULL') collider.geometry.vertices_m.reverse();
    }
  }
  const reorderedContract = createCollisionModel(reordered);
  assert.equal(reorderedContract.collisionDigest, contract.collisionDigest);
  assert.deepEqual(reorderedContract, contract);

  const projection = physicalCollisionIdentityProjection(graph, ['link-b', 'link-a']);
  assert.deepEqual(projection.links.map((link) => link.id), ['link-a', 'link-b']);
});

test('collision model validates primitive dimensions and convex hull realizability', () => {
  const graph = identityGraph();

  const badBox = collisionInput(graph);
  badBox.links[1].colliders[0].geometry.size_m[1] = 0;
  assert.throws(() => createCollisionModel(badBox), /strictly positive/);

  const badSphere = collisionInput(graph);
  badSphere.links[0].colliders[0].geometry.radius_m = Number.POSITIVE_INFINITY;
  assert.throws(() => createCollisionModel(badSphere), /finite number/);

  const coplanar = collisionInput(graph);
  coplanar.links[1].colliders.find((item) => item.id === 'link-a-hull').geometry.vertices_m = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  ];
  assert.throws(() => createCollisionModel(coplanar), /non-coplanar/);

  const duplicateHull = collisionInput(graph);
  duplicateHull.links[1].colliders.find((item) => item.id === 'link-a-hull').geometry.vertices_m = [
    [0, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0],
  ];
  assert.throws(() => createCollisionModel(duplicateHull), /at least 4 unique/);
});

test('mesh collision never inherits visual geometry implicitly', () => {
  const graph = identityGraph();
  const contract = createCollisionModel(collisionInput(graph));
  const visualArtifactDigest = D('c');
  const validManifest = createCollisionVisualGeometryManifest({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest: D('b')}],
  });
  assert.deepEqual(
    validateCollisionVisualReuseBindings(contract, validManifest, {expectedVisualArtifactDigest: visualArtifactDigest}),
    {valid: true, errors: []},
  );

  const staleManifest = createCollisionVisualGeometryManifest({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest: D('d')}],
  });
  const staleVisual = validateCollisionVisualReuseBindings(contract, staleManifest, {expectedVisualArtifactDigest: visualArtifactDigest});
  assert.equal(staleVisual.valid, false);
  assert.equal(staleVisual.errors.some((error) => /digest drift/.test(error)), true);

  const missingManifest = createCollisionVisualGeometryManifest({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [],
  });
  const missingVisual = validateCollisionVisualReuseBindings(contract, missingManifest, {expectedVisualArtifactDigest: visualArtifactDigest});
  assert.equal(missingVisual.valid, false);
  assert.equal(missingVisual.errors.some((error) => /missing/.test(error)), true);

  const implicit = collisionInput(graph);
  const mesh = implicit.links[1].colliders.find((item) => item.id === 'link-a-mesh').geometry;
  mesh.reuseMode = 'COLLISION_ONLY';
  assert.throws(() => createCollisionModel(implicit), /visualGeometryRef must be null/);

  const undeclared = collisionInput(graph);
  const undeclaredMesh = undeclared.links[1].colliders.find((item) => item.id === 'link-a-mesh').geometry;
  undeclaredMesh.reuseMode = 'DECLARED_VISUAL_REUSE';
  undeclaredMesh.visualGeometryRef = null;
  assert.throws(() => createCollisionModel(undeclared), /visualGeometryRef is required/);

  const mismatchedDigest = collisionInput(graph);
  mismatchedDigest.links[1].colliders.find((item) => item.id === 'link-a-mesh').geometry.visualGeometryRef.geometryDigest = D('d');
  assert.throws(() => createCollisionModel(mismatchedDigest), /exact same geometry digest/);
});

test('collision model rejects identity collapse, duplicate collider IDs, dangling groups, and backend fields', () => {
  const graph = identityGraph();

  const nonLink = collisionInput(graph);
  nonLink.links[0].linkId = 'part-a';
  assert.throws(() => createCollisionModel(nonLink), /must be a rigid-link/);

  const duplicateCollider = collisionInput(graph);
  duplicateCollider.links[0].colliders[0].id = 'link-a-box';
  assert.throws(() => createCollisionModel(duplicateCollider), /globally unique/);

  const danglingGroup = collisionInput(graph);
  danglingGroup.links[0].colliders[0].filter.maskGroupIds.push('missing-group');
  assert.throws(() => createCollisionModel(danglingGroup), /undeclared collision group/);

  const backendIndex = collisionInput(graph);
  backendIndex.links[0].colliders[0].backendIndex = 2;
  assert.throws(() => createCollisionModel(backendIndex), /unsupported field/);

  const scaledFrame = collisionInput(graph);
  scaledFrame.links[0].colliders[0].frame.scale = [1, 1, 1];
  assert.throws(() => createCollisionModel(scaledFrame), /unsupported field/);
});

test('collision identity binding is scoped to bound rigid-link identity and frame', () => {
  const graph = identityGraph();
  const contract = createCollisionModel(collisionInput(graph));

  const unrelatedInput = identityGraphInput();
  unrelatedInput.entities.push({id: 'controller-extra', kind: 'controller'});
  unrelatedInput.relations.push({id: 'contains-controller-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-extra']});
  const unrelatedGraph = createPhysicalIdentityGraph(unrelatedInput);
  assert.notEqual(unrelatedGraph.graphDigest, graph.graphDigest);
  assert.deepEqual(validateCollisionModelBindings(contract, unrelatedGraph), {valid: true, errors: []});

  const changedFrameInput = identityGraphInput();
  changedFrameInput.entities.find((entity) => entity.id === 'link-a').frame.translation_m = [0.1, 0, 0];
  const changedFrameGraph = createPhysicalIdentityGraph(changedFrameInput);
  const stale = validateCollisionModelBindings(contract, changedFrameGraph);
  assert.equal(stale.valid, false);
  assert.equal(stale.errors.some((error) => /collision-relevant identity projection/.test(error)), true);
});

test('collision construction and filtering use the existing semantic authority contract', () => {
  const contract = createCollisionModel(collisionInput(identityGraph()));
  const validAuthority = authoritySet(contract, {
    [collisionColliderAuthoritySubjectId('link-a-box')]: 'observed',
    [collisionColliderAuthoritySubjectId('link-a-hull')]: 'inferred',
  });
  assert.deepEqual(validateCollisionModelAuthority(contract, validAuthority), {
    valid: true,
    errors: [],
    missingSubjectIds: [],
    unknownSubjectIds: [],
  });

  const filterSubject = collisionFilterAuthoritySubjectId('link-a');
  const unknownFilter = authoritySet(contract, {[filterSubject]: 'unknown'});
  const unknownValidation = validateCollisionModelAuthority(contract, unknownFilter);
  assert.equal(unknownValidation.valid, false);
  assert.equal(unknownValidation.errors.some((error) => /requires observed, inferred, or engineered/.test(error)), true);

  const missingSubject = collisionAuthoritySubjectIds(contract)[0];
  const missing = authoritySet(contract, {}, {omit: [missingSubject]});
  const missingValidation = validateCollisionModelAuthority(contract, missing);
  assert.equal(missingValidation.valid, false);
  assert.deepEqual(missingValidation.missingSubjectIds, [missingSubject]);

  const extra = authoritySet(contract, {}, {extra: [authorityEntry('unrelated-collision-authority', 'unknown')]});
  const extraValidation = validateCollisionModelAuthority(contract, extra);
  assert.equal(extraValidation.valid, false);
  assert.deepEqual(extraValidation.unknownSubjectIds, ['unrelated-collision-authority']);
});

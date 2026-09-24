import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collisionPairAllowed,
  createCollisionModel,
  createCollisionVisualGeometryManifest,
  createPhysicalIdentityGraph,
  validateCollisionVisualGeometryManifest,
  validateCollisionVisualReuseBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function identityGraph() {
  return createPhysicalIdentityGraph({
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
    ],
    relations: [
      {id: 'contains-link-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-link-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-b']},
    ],
  });
}

function boxCollider(id, groupIds, maskGroupIds) {
  return {
    id,
    frame: {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
    geometry: {kind: 'BOX', size_m: [0.1, 0.1, 0.1]},
    filter: {groupIds, maskGroupIds},
  };
}

function meshCollider({id, meshId, geometryDigest, reuseMode, visualGeometryRef, group = 'body', mask = ['body']}) {
  return {
    id,
    frame: {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
    geometry: {kind: 'MESH', meshId, geometryDigest, reuseMode, visualGeometryRef},
    filter: {groupIds: [group], maskGroupIds: mask},
  };
}

function collisionInput({selfCollisionPolicy = 'DISABLED', asymmetric = false} = {}) {
  const graph = identityGraph();
  return {
    scopeId: graph.scopeId,
    sourceSha256: graph.sourceSha256,
    identityGraph: graph,
    groups: ['body', 'tool'],
    links: [
      {
        linkId: 'link-a',
        selfCollisionPolicy,
        colliders: [
          boxCollider('a-body', ['body'], ['tool', 'body']),
          boxCollider('a-tool', ['tool'], ['body']),
        ],
      },
      {
        linkId: 'link-b',
        selfCollisionPolicy: 'ENABLED',
        colliders: [
          boxCollider('b-tool', ['tool'], asymmetric ? [] : ['body']),
        ],
      },
    ],
  };
}

test('P03 defines one symmetric canonical collision-pair predicate', () => {
  const disabledSelf = createCollisionModel(collisionInput());
  assert.equal(collisionPairAllowed(disabledSelf, 'a-body', 'b-tool'), true);
  assert.equal(collisionPairAllowed(disabledSelf, 'b-tool', 'a-body'), true);
  assert.equal(collisionPairAllowed(disabledSelf, 'a-body', 'a-tool'), false);
  assert.equal(collisionPairAllowed(disabledSelf, 'a-body', 'a-body'), false);

  const enabledSelf = createCollisionModel(collisionInput({selfCollisionPolicy: 'ENABLED'}));
  assert.equal(collisionPairAllowed(enabledSelf, 'a-body', 'a-tool'), true);

  const asymmetric = createCollisionModel(collisionInput({asymmetric: true}));
  assert.equal(collisionPairAllowed(asymmetric, 'a-body', 'b-tool'), false);
  assert.equal(collisionPairAllowed(asymmetric, 'b-tool', 'a-body'), false);

  assert.throws(() => collisionPairAllowed(disabledSelf, 'missing', 'a-body'), /unknown collider ID/);
});

test('P03 visual reuse requires a canonical manifest bound to an externally verified current artifact digest', () => {
  const graph = identityGraph();
  const geometryDigest = D('b');
  const visualArtifactDigest = D('c');
  const contract = createCollisionModel({
    scopeId: graph.scopeId,
    sourceSha256: graph.sourceSha256,
    identityGraph: graph,
    groups: ['body'],
    links: [
      {
        linkId: 'link-a',
        selfCollisionPolicy: 'DISABLED',
        colliders: [
          meshCollider({
            id: 'mesh-a',
            meshId: 'shared-shell',
            geometryDigest,
            reuseMode: 'DECLARED_VISUAL_REUSE',
            visualGeometryRef: {geometryId: 'visual-shell-a', geometryDigest},
          }),
        ],
      },
    ],
  });

  const manifest = createCollisionVisualGeometryManifest({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest}],
  });
  assert.deepEqual(validateCollisionVisualGeometryManifest(manifest), {valid: true, errors: []});
  assert.deepEqual(
    validateCollisionVisualReuseBindings(contract, manifest, {expectedVisualArtifactDigest: visualArtifactDigest}),
    {valid: true, errors: []},
  );

  const missingExternalBinding = validateCollisionVisualReuseBindings(contract, manifest);
  assert.equal(missingExternalBinding.valid, false);
  assert.equal(missingExternalBinding.errors.some((error) => /expectedVisualArtifactDigest is required/.test(error)), true);

  const staleArtifact = validateCollisionVisualReuseBindings(contract, manifest, {expectedVisualArtifactDigest: D('d')});
  assert.equal(staleArtifact.valid, false);
  assert.equal(staleArtifact.errors.some((error) => /expected current visual artifact digest/.test(error)), true);

  const wrongScopeManifest = createCollisionVisualGeometryManifest({
    scopeId: 'other-scope',
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest}],
  });
  const wrongScope = validateCollisionVisualReuseBindings(contract, wrongScopeManifest, {expectedVisualArtifactDigest: visualArtifactDigest});
  assert.equal(wrongScope.valid, false);
  assert.equal(wrongScope.errors.some((error) => /scopeId differ/.test(error)), true);

  const staleGeometryManifest = createCollisionVisualGeometryManifest({
    scopeId: contract.scopeId,
    sourceSha256: contract.sourceSha256,
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest: D('e')}],
  });
  const staleGeometry = validateCollisionVisualReuseBindings(contract, staleGeometryManifest, {expectedVisualArtifactDigest: visualArtifactDigest});
  assert.equal(staleGeometry.valid, false);
  assert.equal(staleGeometry.errors.some((error) => /digest drift/.test(error)), true);

  const selfAssertedArray = validateCollisionVisualReuseBindings(
    contract,
    [{geometryId: 'visual-shell-a', geometryDigest}],
    {expectedVisualArtifactDigest: visualArtifactDigest},
  );
  assert.equal(selfAssertedArray.valid, false);
  assert.equal(selfAssertedArray.errors.some((error) => /manifest invalid/.test(error)), true);
});

test('P03 mesh identity is geometry identity, not visual-reuse relationship identity', () => {
  const graph = identityGraph();
  const geometryDigest = D('f');
  const contract = createCollisionModel({
    scopeId: graph.scopeId,
    sourceSha256: graph.sourceSha256,
    identityGraph: graph,
    groups: ['body'],
    links: [
      {
        linkId: 'link-a',
        selfCollisionPolicy: 'DISABLED',
        colliders: [
          meshCollider({
            id: 'collision-only-use',
            meshId: 'shared-mesh',
            geometryDigest,
            reuseMode: 'COLLISION_ONLY',
            visualGeometryRef: null,
          }),
          meshCollider({
            id: 'visual-reuse-use',
            meshId: 'shared-mesh',
            geometryDigest,
            reuseMode: 'DECLARED_VISUAL_REUSE',
            visualGeometryRef: {geometryId: 'visual-shared-mesh', geometryDigest},
          }),
        ],
      },
    ],
  });
  assert.equal(contract.links[0].colliders.length, 2);

  const conflicting = structuredClone({
    scopeId: graph.scopeId,
    sourceSha256: graph.sourceSha256,
    identityGraph: graph,
    groups: ['body'],
    links: [
      {
        linkId: 'link-a',
        selfCollisionPolicy: 'DISABLED',
        colliders: [
          meshCollider({
            id: 'mesh-one',
            meshId: 'shared-mesh',
            geometryDigest,
            reuseMode: 'COLLISION_ONLY',
            visualGeometryRef: null,
          }),
          meshCollider({
            id: 'mesh-two',
            meshId: 'shared-mesh',
            geometryDigest: D('1'),
            reuseMode: 'COLLISION_ONLY',
            visualGeometryRef: null,
          }),
        ],
      },
    ],
  });
  assert.throws(() => createCollisionModel(conflicting), /different collision geometry digests/);
});

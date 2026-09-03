import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  assertCanonicalEditOperation,
  createCanonicalEditIntent,
  validateCanonicalEditIntent,
} from '../skills/refas/scripts/lib/index.mjs';

test('shape edits are upstream construction edits that rebuild GLB', () => {
  const intent = createCanonicalEditIntent({
    id: 'reshape-nose',
    ownerCapability: 'shape-reconstruction',
    scopeId: 'nose',
    editClass: 'shape',
    intent: 'Lower the observed nose bridge while preserving the source-bound face profile.',
    canonicalBindings: ['model.shape.nose.bridge-height'],
    realizationOperations: ['rebuild-glb'],
    evidenceRefs: ['source/reference.png'],
  });
  assert.equal(validateCanonicalEditIntent(intent).valid, true);
  assert.equal(intent.sourceOfTruth, 'construction-state');
  assert.equal(intent.mutationBoundary.directGlbMutation, 'forbidden');
  assert.equal(intent.mutationBoundary.rebuildRequired, true);
  assert.equal(assertCanonicalEditOperation(intent, {binding: 'model.shape.nose.bridge-height', operation: 'rebuild-glb'}), true);
  assert.throws(() => createCanonicalEditIntent({...intent, realizationOperations: ['mesh-weld']}), /not allowed/);
});

test('pose edits may mutate transforms but never mesh bytes', () => {
  const intent = createCanonicalEditIntent({
    id: 'turn-head',
    ownerCapability: 'assembly',
    scopeId: 'head',
    editClass: 'pose',
    intent: 'Adjust the head yaw without changing its geometry representation.',
    canonicalBindings: ['assembly.node.head.rotation.y'],
    realizationOperations: ['node-transform'],
  });
  assert.equal(intent.mutationBoundary.directGlbMutation, 'controlled-transform-only');
  assert.equal(assertCanonicalEditOperation(intent, {binding: 'assembly.node.head.rotation.y', operation: 'node-transform', mutatesMeshBytes: false}), true);
  assert.throws(() => assertCanonicalEditOperation(intent, {binding: 'assembly.node.head.rotation.y', operation: 'node-transform', mutatesMeshBytes: true}), /may not mutate mesh\/accessor bytes/);
});

test('appearance changes are canonical upstream state followed by bake or rebuild', () => {
  const intent = createCanonicalEditIntent({
    id: 'fit-brass',
    ownerCapability: 'appearance',
    scopeId: 'chest',
    editClass: 'appearance',
    intent: 'Fit brass roughness while geometry remains frozen.',
    canonicalBindings: ['appearance.material.brass.roughness'],
    realizationOperations: ['rebake-appearance'],
  });
  assert.equal(validateCanonicalEditIntent(intent).valid, true);
  assert.equal(intent.sourceOfTruth, 'appearance-state');
  assert.equal(intent.policy.appearanceCanonicalStatePrecedesBake, true);
});

test('controlled finalization may fuse or optimize the realized asset', () => {
  const intent = createCanonicalEditIntent({
    id: 'fuse-head-shell',
    ownerCapability: 'assembly',
    scopeId: 'head',
    editClass: 'finalization',
    intent: 'Bake a closed logical head-shell fusion into the final realized mesh.',
    canonicalBindings: ['finalization.head-shell'],
    realizationOperations: ['mesh-fuse', 'mesh-weld', 'internal-face-cleanup', 'mesh-optimize'],
  });
  assert.equal(validateCanonicalEditIntent(intent).valid, true);
  assert.equal(intent.sourceOfTruth, 'realized-asset');
  assert.equal(intent.mutationBoundary.directGlbMutation, 'controlled-finalization-only');
  assert.equal(assertCanonicalEditOperation(intent, {binding: 'finalization.head-shell', operation: 'mesh-fuse', mutatesMeshBytes: true}), true);
});

test('world-space or arbitrary GLB patch bindings are not canonical shape state', () => {
  assert.throws(() => createCanonicalEditIntent({
    id: 'patch-forearm',
    ownerCapability: 'shape-reconstruction',
    scopeId: 'left-forearm',
    editClass: 'shape',
    intent: 'Patch a realized forearm vertex directly.',
    canonicalBindings: ['glb.mesh.left-forearm.vertex.12'],
    realizationOperations: ['rebuild-glb'],
  }), /outside the construction-state boundary/);
});

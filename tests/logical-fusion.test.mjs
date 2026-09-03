import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAttachmentSemantics,
  createLogicalFusion,
  createLogicalFusionInvalidation,
  logicalFusionGroupForEntity,
  validateLogicalFusion,
  validateLogicalFusionInvalidation,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});

function mannequinSemantics() {
  return createAttachmentSemantics({
    scopeId: 'head',
    sourceSha256: D(),
    entities: [E('head-shell'), E('face'), E('nose'), E('mouth'), E('left-ear'), E('right-ear'), E('glasses')],
    relations: [
      R('head-shell-root', 'FREE', 'head-shell'),
      R('face-fused', 'FUSED', 'face', ['head-shell']),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      R('mouth-fused', 'FUSED', 'mouth', ['head-shell']),
      R('left-ear-fused', 'FUSED', 'left-ear', ['head-shell']),
      R('right-ear-fused', 'FUSED', 'right-ear', ['head-shell']),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose', 'left-ear', 'right-ear']),
    ],
    evidenceRefs: ['source/head.png'],
  });
}

test('logical fusion groups semantic body parts without physically fusing them', () => {
  const semantics = mannequinSemantics();
  const fusion = createLogicalFusion({attachmentSemantics: semantics, evidenceRefs: ['source/head.png']});
  assert.equal(validateLogicalFusion(fusion, semantics).valid, true);
  assert.equal(fusion.groups.length, 1);
  assert.equal(fusion.groups[0].rootId, 'head-shell');
  assert.deepEqual(fusion.groups[0].memberIds, ['face', 'head-shell', 'left-ear', 'mouth', 'nose', 'right-ear']);
  assert.deepEqual(fusion.nonFusionEntityIds, ['glasses']);
  assert.equal(fusion.groups[0].state, 'logical');
  assert.equal(fusion.policy.groupIdentityDerivedFromAttachmentSemantics, true);
  assert.equal(fusion.policy.physicalMeshMutationForbidden, true);
  assert.equal(fusion.policy.physicalFusionRequiresFinalization, true);
});

test('editing one fused member invalidates the whole logical group but not non-fused glasses', () => {
  const semantics = mannequinSemantics();
  const fusion = createLogicalFusion({attachmentSemantics: semantics});
  const invalidation = createLogicalFusionInvalidation({
    logicalFusion: fusion,
    attachmentSemantics: semantics,
    changedEntityIds: ['nose'],
    evidenceRefs: ['reviews/nose-change.json'],
  });
  assert.equal(validateLogicalFusionInvalidation(invalidation, fusion, semantics).valid, true);
  assert.deepEqual(invalidation.invalidatedGroupIds, ['fusion-head-shell']);
  assert.deepEqual(invalidation.invalidatedMemberIds, ['face', 'head-shell', 'left-ear', 'mouth', 'nose', 'right-ear']);
  assert.ok(invalidation.unaffectedEntityIds.includes('glasses'));
  assert.equal(invalidation.requiresFusionRebuild, true);
  assert.equal(invalidation.requiresPreFusionSemanticState, true);
  assert.equal(invalidation.policy.invalidationCannotAuthorizeClosure, true);
  assert.equal(invalidation.policy.nonFusedDependentsAreHandledByAttachmentPropagation, true);
});

test('nested fused relations collapse to the same top logical body', () => {
  const semantics = createAttachmentSemantics({
    scopeId: 'body',
    sourceSha256: D('b'),
    entities: [E('body-root'), E('torso'), E('chest-panel'), E('badge')],
    relations: [
      R('body-free', 'FREE', 'body-root'),
      R('torso-fused', 'FUSED', 'torso', ['body-root']),
      R('panel-fused', 'FUSED', 'chest-panel', ['torso']),
      R('badge-follow', 'RIGID_FOLLOW', 'badge', ['chest-panel']),
    ],
  });
  const fusion = createLogicalFusion({attachmentSemantics: semantics});
  assert.equal(fusion.groups.length, 1);
  assert.deepEqual(fusion.groups[0].memberIds, ['body-root', 'chest-panel', 'torso']);
  assert.deepEqual(fusion.nonFusionEntityIds, ['badge']);
  assert.equal(logicalFusionGroupForEntity(fusion, 'chest-panel').rootId, 'body-root');
  assert.equal(logicalFusionGroupForEntity(fusion, 'badge'), null);
});

test('changing an unrelated free entity does not require fusion rebuild', () => {
  const semantics = createAttachmentSemantics({
    scopeId: 'scene', sourceSha256: D('c'), entities: [E('body-root'), E('nose'), E('free-prop')],
    relations: [R('root-free', 'FREE', 'body-root'), R('nose-fused', 'FUSED', 'nose', ['body-root']), R('prop-free', 'FREE', 'free-prop')],
  });
  const fusion = createLogicalFusion({attachmentSemantics: semantics});
  const invalidation = createLogicalFusionInvalidation({logicalFusion: fusion, attachmentSemantics: semantics, changedEntityIds: ['free-prop']});
  assert.deepEqual(invalidation.invalidatedGroupIds, []);
  assert.deepEqual(invalidation.invalidatedMemberIds, []);
  assert.equal(invalidation.requiresFusionRebuild, false);
  assert.equal(validateLogicalFusionInvalidation(invalidation, fusion, semantics).valid, true);
});

test('logical fusion and invalidation are digest-bound to the attachment semantic graph', () => {
  const semantics = mannequinSemantics();
  const fusion = createLogicalFusion({attachmentSemantics: semantics});
  const tamperedFusion = structuredClone(fusion);
  tamperedFusion.groups[0].memberIds = tamperedFusion.groups[0].memberIds.filter((id) => id !== 'nose');
  assert.equal(validateLogicalFusion(tamperedFusion, semantics).valid, false);

  const invalidation = createLogicalFusionInvalidation({logicalFusion: fusion, attachmentSemantics: semantics, changedEntityIds: ['nose']});
  const tamperedInvalidation = structuredClone(invalidation);
  tamperedInvalidation.invalidatedMemberIds = ['nose'];
  assert.equal(validateLogicalFusionInvalidation(tamperedInvalidation, fusion, semantics).valid, false);

  assert.throws(() => createLogicalFusionInvalidation({logicalFusion: fusion, attachmentSemantics: semantics, changedEntityIds: ['missing-part']}), /unknown to attachment semantics/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  attachmentDirectDependents,
  attachmentRelationsForSubject,
  createAttachmentSemantics,
  validateAttachmentSemantics,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});

test('mannequin face uses logical fused ownership while glasses are explicit multi-anchor', () => {
  const contract = createAttachmentSemantics({
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
  assert.equal(validateAttachmentSemantics(contract).valid, true);
  assert.deepEqual(attachmentDirectDependents(contract, 'head-shell'), ['face', 'left-ear', 'mouth', 'nose', 'right-ear']);
  assert.equal(attachmentRelationsForSubject(contract, 'glasses')[0].semantics.requiresSolver, true);
  assert.deepEqual(attachmentRelationsForSubject(contract, 'glasses')[0].ownerIds, ['left-ear', 'nose', 'right-ear']);
});

test('all attachment modes have explicit owner arity and propagation semantics', () => {
  const contract = createAttachmentSemantics({
    scopeId: 'assembly',
    sourceSha256: D('b'),
    entities: [E('root'), E('rivet'), E('badge'), E('glasses'), E('forearm'), E('gear'), E('free-prop')],
    relations: [
      R('root-free', 'FREE', 'root'),
      R('rivet-follow', 'RIGID_FOLLOW', 'rivet', ['root']),
      R('badge-offset', 'SURFACE_OFFSET', 'badge', ['root']),
      R('glasses-multi', 'MULTI_ANCHOR', 'glasses', ['root', 'forearm']),
      R('forearm-joint', 'ARTICULATED', 'forearm', ['root']),
      R('gear-clearance', 'SUPPORTED_CLEARANCE', 'gear', ['root']),
      R('prop-free', 'FREE', 'free-prop'),
    ],
  });
  assert.equal(validateAttachmentSemantics(contract).valid, true);
  assert.equal(attachmentRelationsForSubject(contract, 'rivet')[0].semantics.requiresSolver, false);
  assert.equal(attachmentRelationsForSubject(contract, 'badge')[0].semantics.requiresSolver, true);
  assert.equal(attachmentRelationsForSubject(contract, 'free-prop')[0].semantics.propagatesOwnerChange, false);
});

test('implicit attachment is forbidden: every entity must declare a mode including FREE', () => {
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(), entities: [E('root'), E('orphan')], relations: [R('root-free', 'FREE', 'root')],
  }), /every attachment entity must have an explicit semantic relation/);
});

test('mode-specific owner cardinality is fail-closed', () => {
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'head', sourceSha256: D(), entities: [E('head'), E('glasses')],
    relations: [R('head-free', 'FREE', 'head'), R('bad-glasses', 'MULTI_ANCHOR', 'glasses', ['head'])],
  }), /requires at least 2 owner/);
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'head', sourceSha256: D(), entities: [E('head')], relations: [R('bad-free', 'FREE', 'head', ['head'])],
  }), /requires 0 owner/);
});

test('unknown owners, self attachment, and ownership cycles are rejected', () => {
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(), entities: [E('root'), E('child')],
    relations: [R('root-free', 'FREE', 'root'), R('unknown', 'RIGID_FOLLOW', 'child', ['missing'])],
  }), /unknown entity/);
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(), entities: [E('root')], relations: [R('self', 'RIGID_FOLLOW', 'root', ['root'])],
  }), /may not attach an entity to itself/);
  assert.throws(() => createAttachmentSemantics({
    scopeId: 'whole', sourceSha256: D(), entities: [E('part-a'), E('part-b')],
    relations: [R('a-to-b', 'RIGID_FOLLOW', 'part-a', ['part-b']), R('b-to-a', 'RIGID_FOLLOW', 'part-b', ['part-a'])],
  }), /ownership graph contains a cycle/);
});

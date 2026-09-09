import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRelationalStructure,
  relationalDependencyOrder,
  validateRelationalStructure,
  wholeSystemRelationalObligations,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

function fixture() {
  return createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(), basisRefs: ['source:primary'],
    entities: [
      {id: 'left-landmark', kind: 'landmark', role: 'paired-left'},
      {id: 'right-landmark', kind: 'landmark', role: 'paired-right'},
      {id: 'top-boundary', kind: 'landmark'},
      {id: 'bottom-boundary', kind: 'landmark'},
      {id: 'primary-plane', kind: 'plane'},
      {id: 'secondary-plane', kind: 'plane'},
      {id: 'major-volume', kind: 'volume'},
      {id: 'minor-volume', kind: 'volume'},
    ],
    relations: [
      {id: 'paired-span-ratio', kind: 'distance-ratio', scope: 'whole-system', importance: 'identity', entityIds: ['left-landmark', 'right-landmark', 'top-boundary', 'bottom-boundary'], range: [0.2, 0.45], basisRefs: ['source:front']},
      {id: 'main-plane-chain', kind: 'plane-chain', scope: 'whole-system', importance: 'macro', entityIds: ['primary-plane', 'secondary-plane'], continuity: 'broken', basisRefs: ['source:oblique']},
      {id: 'volume-balance', kind: 'volume-ratio', scope: 'whole-system', importance: 'macro', entityIds: ['major-volume', 'minor-volume'], range: [1.5, 3], dependsOn: ['main-plane-chain'], basisRefs: ['prior:structural']},
      {id: 'local-centering', kind: 'alignment', scope: 'local', importance: 'detail', entityIds: ['left-landmark', 'right-landmark'], mode: 'symmetric', dependsOn: ['paired-span-ratio'], basisRefs: ['source:front']},
    ],
  });
}

test('relational structure canonicalizes domain-neutral whole-system proportions and planes', () => {
  const value = fixture();
  assert.equal(validateRelationalStructure(value).valid, true);
  assert.deepEqual(relationalDependencyOrder(value), ['main-plane-chain', 'paired-span-ratio', 'local-centering', 'volume-balance']);
  assert.deepEqual(wholeSystemRelationalObligations(value), ['main-plane-chain', 'paired-span-ratio', 'volume-balance']);
  assert.equal(value.policy.visibleEvidenceConstrainsButDoesNotDefineWholeModel, true);
});

test('dangling entity references fail closed', () => {
  assert.throws(() => createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(),
    entities: [{id: 'a1', kind: 'landmark'}, {id: 'b1', kind: 'landmark'}],
    relations: [{id: 'bad-rel', kind: 'alignment', scope: 'whole-system', importance: 'macro', entityIds: ['a1', 'missing'], mode: 'centered', basisRefs: ['source:x']}],
  }), /unknown entity/);
});

test('cyclic relation dependencies fail closed', () => {
  assert.throws(() => createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(),
    entities: [{id: 'a1', kind: 'landmark'}, {id: 'b1', kind: 'landmark'}],
    relations: [
      {id: 'rel-a', kind: 'alignment', scope: 'whole-system', importance: 'macro', entityIds: ['a1', 'b1'], mode: 'centered', dependsOn: ['rel-b'], basisRefs: ['prior:a']},
      {id: 'rel-b', kind: 'alignment', scope: 'local', importance: 'detail', entityIds: ['a1', 'b1'], mode: 'symmetric', dependsOn: ['rel-a'], basisRefs: ['prior:b']},
    ],
  }), /cycle/);
});

test('local details do not satisfy whole-system obligations', () => {
  const value = fixture();
  const required = wholeSystemRelationalObligations(value, {includeIdentity: false});
  assert.deepEqual(required, ['main-plane-chain', 'volume-balance']);
  assert.equal(required.includes('local-centering'), false);
});

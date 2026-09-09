import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRelationalDiscrepancy,
  createRelationalStructure,
  digestJson,
  validateRelationalDiscrepancy,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

function structure() {
  return createRelationalStructure({
    scopeId: 'whole', sourceSha256: D('a'), basisRefs: ['source:primary'],
    entities: [
      {id: 'a', kind: 'landmark'}, {id: 'b', kind: 'landmark'},
      {id: 'c', kind: 'landmark'}, {id: 'd', kind: 'landmark'},
      {id: 'axis-a', kind: 'axis'}, {id: 'axis-b', kind: 'axis'},
      {id: 'plane-a', kind: 'plane'}, {id: 'plane-b', kind: 'plane'},
      {id: 'volume-a', kind: 'volume'}, {id: 'volume-b', kind: 'volume'},
    ],
    relations: [
      {id: 'span-ratio', kind: 'distance-ratio', scope: 'whole-system', importance: 'identity', entityIds: ['a', 'b', 'c', 'd'], range: [0.4, 0.6], basisRefs: ['source:front']},
      {id: 'axis-parallel', kind: 'alignment', scope: 'whole-system', importance: 'macro', entityIds: ['axis-a', 'axis-b'], mode: 'parallel', tolerance: 0.05, basisRefs: ['source:front']},
      {id: 'front-order', kind: 'ordering', scope: 'whole-system', importance: 'macro', entityIds: ['a', 'b', 'c'], axis: 'reference-forward', direction: 'forward', basisRefs: ['source:oblique']},
      {id: 'plane-break', kind: 'plane-chain', scope: 'whole-system', importance: 'identity', entityIds: ['plane-a', 'plane-b'], continuity: 'broken', basisRefs: ['source:oblique']},
      {id: 'volume-balance', kind: 'volume-ratio', scope: 'whole-system', importance: 'macro', entityIds: ['volume-a', 'volume-b'], range: [1.5, 2.5], basisRefs: ['inference:mass']},
    ],
  });
}

const passingObservations = () => [
  {relationId: 'span-ratio', value: 0.5, evidenceRefs: ['proof:span']},
  {relationId: 'axis-parallel', error: 0.02, evidenceRefs: ['proof:axis']},
  {relationId: 'front-order', orderedEntityIds: ['a', 'b', 'c'], evidenceRefs: ['proof:depth']},
  {relationId: 'plane-break', continuity: 'broken', evidenceRefs: ['proof:plane']},
  {relationId: 'volume-balance', value: 2, evidenceRefs: ['proof:volume']},
];

test('candidate-bound relational discrepancy evaluates all domain-neutral whole-system relation kinds', () => {
  const value = createRelationalDiscrepancy({relationalStructure: structure(), candidateAssetSha256: D('b'), observations: passingObservations()});
  assert.deepEqual(validateRelationalDiscrepancy(value), {valid: true, errors: []});
  assert.equal(value.status, 'PASS');
  assert.equal(value.eligible, true);
  assert.equal(value.checks.length, 5);
  assert.ok(value.checks.every((check) => check.status === 'pass' && check.residual === 0));
  assert.equal(value.policy.relationalInvalidityIsHardBarrier, true);
  assert.equal(value.policy.relationalInvalidityIsNeverScorePenalty, true);
});

test('out-of-range, wrong ordering, and missing quantitative thresholds remain ineligible', () => {
  const input = structure();
  const observations = passingObservations();
  observations.find((item) => item.relationId === 'span-ratio').value = 0.9;
  observations.find((item) => item.relationId === 'front-order').orderedEntityIds = ['b', 'a', 'c'];
  const value = createRelationalDiscrepancy({relationalStructure: input, candidateAssetSha256: D('c'), observations});
  assert.equal(value.eligible, false);
  assert.deepEqual(value.failedRelationIds, ['front-order', 'span-ratio']);

  const noTolerance = createRelationalStructure({
    scopeId: 'whole', sourceSha256: D('a'),
    entities: [{id: 'x', kind: 'axis'}, {id: 'y', kind: 'axis'}],
    relations: [{id: 'alignment-without-threshold', kind: 'alignment', scope: 'whole-system', importance: 'macro', entityIds: ['x', 'y'], mode: 'parallel', basisRefs: ['source:x']}],
  });
  const unresolved = createRelationalDiscrepancy({
    relationalStructure: noTolerance, candidateAssetSha256: D('c'),
    observations: [{relationId: 'alignment-without-threshold', error: 0, evidenceRefs: ['proof:x']}],
  });
  assert.equal(unresolved.eligible, false);
  assert.deepEqual(unresolved.unresolvedRelationIds, ['alignment-without-threshold']);
});

test('whole-system observation coverage is exact and local detail cannot substitute', () => {
  const observations = passingObservations().slice(1);
  observations.push({relationId: 'local-detail', value: 0, evidenceRefs: ['proof:local']});
  assert.throws(() => createRelationalDiscrepancy({relationalStructure: structure(), candidateAssetSha256: D('d'), observations}), /must exactly cover whole-system macro\/identity obligations/);
});

test('derived checks cannot be forged by re-signing the discrepancy', () => {
  const value = createRelationalDiscrepancy({relationalStructure: structure(), candidateAssetSha256: D('e'), observations: passingObservations()});
  const forged = structuredClone(value);
  forged.checks[0].status = 'fail';
  forged.checks[0].residual = 1;
  delete forged.discrepancyDigest;
  forged.discrepancyDigest = digestJson(forged);
  assert.match(validateRelationalDiscrepancy(forged).errors.join('; '), /not canonical|derived checks were altered|digest mismatch/);
});

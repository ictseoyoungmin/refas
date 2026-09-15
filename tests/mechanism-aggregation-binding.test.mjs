import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createPhysicalIdentityGraph,
  digestJson,
  physicalMechanismIdentityProjection,
} from '../skills/refas/scripts/lib/index.mjs';

const D = 'a'.repeat(64);
const Q = (parentId, translation_m = [0, 0, 0]) => ({parentId, translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});

function identityGraph(aggregateTarget = 'moving-link') {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'base-link', kind: 'rigid-link', frame: Q('module-root')},
      {id: 'moving-link', kind: 'rigid-link', frame: Q('module-root', [1, 0, 0])},
      {id: 'gear-part', kind: 'physical-part', frame: Q('moving-link')},
      {id: 'joint-a', kind: 'virtual-joint', frame: Q('base-link', [1, 0, 0])},
      {id: 'gear-mechanism', kind: 'mechanism', frame: Q('module-root')},
    ],
    relations: [
      {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
      {id: 'contains-moving', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['moving-link']},
      {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-part']},
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-a']},
      {id: 'contains-mechanism', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['gear-mechanism']},
      {id: 'joint-connects', kind: 'CONNECTS', sourceId: 'joint-a', targetIds: ['base-link', 'moving-link']},
      {id: 'part-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'gear-part', targetIds: [aggregateTarget]},
      {id: 'mechanism-realizes', kind: 'REALIZES', sourceId: 'gear-mechanism', targetIds: ['joint-a']},
    ],
  });
}

const mechanism = [{
  mechanismId: 'gear-mechanism', kind: 'GEAR', realizesRelationIds: ['mechanism-realizes'], realizedJointIds: ['joint-a'],
  members: [
    {id: 'gear-member', physicalIdentityId: 'gear-part', role: 'CONTACT_ELEMENT'},
    {id: 'base-member', physicalIdentityId: 'base-link', role: 'CONTACT_ELEMENT'},
  ],
  edges: [{id: 'mesh-edge', kind: 'MESHES_WITH', memberIds: ['base-member', 'gear-member'], authoritySubjectId: 'gear-mechanism:mechanism-edge:mesh-edge'}],
  authoritySubjectId: 'gear-mechanism:mechanism-topology',
}];

test('mechanism identity projection binds physical-part AGGREGATES_INTO membership', () => {
  const original = physicalMechanismIdentityProjection(identityGraph('moving-link'), mechanism);
  const rebound = physicalMechanismIdentityProjection(identityGraph('base-link'), mechanism);
  const member = original.mechanisms[0].members.find((item) => item.memberId === 'gear-member');
  assert.equal(member.aggregation.id, 'part-aggregates');
  assert.deepEqual(member.aggregation.targetIds, ['moving-link']);
  assert.notEqual(digestJson(original), digestJson(rebound));
});

test('mechanism physical-part members require exactly one rigid-body aggregation', () => {
  const graphInput = identityGraph('moving-link');
  const raw = structuredClone(graphInput);
  delete raw.graphDigest;
  raw.relations = raw.relations.filter((relation) => relation.id !== 'part-aggregates');
  const graphWithoutAggregation = createPhysicalIdentityGraph(raw);
  assert.throws(() => physicalMechanismIdentityProjection(graphWithoutAggregation, mechanism), /requires exactly one AGGREGATES_INTO relation/);
});

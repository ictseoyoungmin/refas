import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalIdentityGraph,
  createRigidBodyDynamics,
  physicalDynamicsIdentityProjection,
  validateRigidBodyDynamicsBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function nestedFrameGraphInput({carrierX = 0.05} = {}) {
  return {
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'link-a',
        kind: 'rigid-link',
        frame: {
          parentId: 'module-root',
          translation_m: [0, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1],
        },
      },
      {
        id: 'frame-carrier',
        kind: 'physical-part',
        frame: {
          parentId: 'module-root',
          translation_m: [carrierX, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1],
        },
      },
      {
        id: 'part-a',
        kind: 'physical-part',
        frame: {
          parentId: 'frame-carrier',
          translation_m: [0.2, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1],
        },
      },
    ],
    relations: [
      {id: 'contains-link-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-frame-carrier', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['frame-carrier']},
      {id: 'contains-part-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'part-a-to-link-a', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  };
}

function dynamicsInput(identityGraph, inertia = [
  [0.2, 0, 0],
  [0, 0.3, 0],
  [0, 0, 0.4],
]) {
  return {
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    links: [{
      linkId: 'link-a',
      referenceFrameId: 'link-a',
      mass: {value_kg: 2},
      centerOfMass: {value_m: [0.25, 0, 0]},
      inertia: {tensor_kg_m2: inertia},
    }],
  };
}

test('P02 projection binds resolved aggregated-part transform through intermediate frame ancestry', () => {
  const graph = createPhysicalIdentityGraph(nestedFrameGraphInput());
  const projection = physicalDynamicsIdentityProjection(graph, ['link-a']);
  assert.deepEqual(projection.partLinkTransforms, [{
    partId: 'part-a',
    linkId: 'link-a',
    transform: {
      translation_m: [0.25, 0, 0],
      rotation_quat_xyzw: [0, 0, 0, 1],
    },
  }]);

  const dynamics = createRigidBodyDynamics(dynamicsInput(graph));
  assert.deepEqual(validateRigidBodyDynamicsBindings(dynamics, graph), {valid: true, errors: []});

  // Only the intermediate parent frame changes. The raw aggregated part entity,
  // bound rigid-link entity, and AGGREGATES_INTO relation are byte-for-byte the same.
  // The effective part→link mass layout is nevertheless different and must stale P02.
  const movedGraph = createPhysicalIdentityGraph(nestedFrameGraphInput({carrierX: 0.15}));
  const movedProjection = physicalDynamicsIdentityProjection(movedGraph, ['link-a']);
  assert.notEqual(movedProjection.partLinkTransforms[0].transform.translation_m[0], 0.25);
  const validation = validateRigidBodyDynamicsBindings(dynamics, movedGraph);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => /dynamics-relevant identity projection/.test(error)), true);
});

test('P02 rejects SPD inertia whose principal moments violate rigid-body realizability', () => {
  const graph = createPhysicalIdentityGraph(nestedFrameGraphInput());

  // SPD and all coordinate-axis diagonal triangle checks pass, but eigenvalues are
  // 0.1, 1.0, 1.9, so the largest principal moment exceeds the sum of the other two.
  const impossible = [
    [1, 0.9, 0],
    [0.9, 1, 0],
    [0, 0, 1],
  ];
  assert.throws(
    () => createRigidBodyDynamics(dynamicsInput(graph, impossible)),
    /principal-moment triangle inequality/,
  );
});

test('P02 accepts physically realizable non-diagonal inertia tensors', () => {
  const graph = createPhysicalIdentityGraph(nestedFrameGraphInput());
  const rotatedPhysicalTensor = [
    [1.1, -0.1, 0],
    [-0.1, 1.1, 0],
    [0, 0, 2],
  ];
  const dynamics = createRigidBodyDynamics(dynamicsInput(graph, rotatedPhysicalTensor));
  assert.deepEqual(dynamics.links[0].inertia.tensor_kg_m2, rotatedPhysicalTensor);
});

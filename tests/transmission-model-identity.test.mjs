import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createPhysicalIdentityGraph,
  createTransmissionModel,
  evaluateTransmissionMapping,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const Q = (parentId) => ({parentId, translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]});

function identityGraph() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'joint-a', kind: 'virtual-joint', frame: Q('module-root')},
      {id: 'actuator-a', kind: 'actuator', frame: Q('module-root')},
      {id: 'actuator-b', kind: 'actuator', frame: Q('module-root')},
      {id: 'tx', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-a']},
      {id: 'contains-actuator-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-a']},
      {id: 'contains-actuator-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-b']},
      {id: 'contains-tx', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx']},
      {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx', targetIds: ['joint-a', 'actuator-a', 'actuator-b']},
    ],
  });
}

function modelInput() {
  const graph = identityGraph();
  return {
    scopeId: 'whole', sourceSha256: D(), identityGraph: graph,
    transmissions: [{
      transmissionId: 'tx', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'in', coordinates: [{id: 'joint-q', semanticIdentityId: 'joint-a'}], order: ['joint-q']},
      outputSpace: {id: 'out', coordinates: [{id: 'actuator-q', semanticIdentityId: 'actuator-a'}, {id: 'actuator-q2', semanticIdentityId: 'actuator-b'}], order: ['actuator-q', 'actuator-q2']},
      mapping: {kind: 'IDENTITY'},
    }],
  };
}

test('IDENTITY requires equal dimensions and executes exact q/dq/effort transfer', () => {
  const mismatch = modelInput();
  assert.throws(() => createTransmissionModel(mismatch), /IDENTITY requires equal input\/output dimensions/);

  const graph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'joint-a', kind: 'virtual-joint', frame: Q('module-root')},
      {id: 'actuator-a', kind: 'actuator', frame: Q('module-root')},
      {id: 'tx', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-a']},
      {id: 'contains-actuator', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-a']},
      {id: 'contains-tx', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx']},
      {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx', targetIds: ['joint-a', 'actuator-a']},
    ],
  });
  const model = createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph: graph,
    transmissions: [{
      transmissionId: 'tx', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'in', coordinates: [{id: 'joint-q', semanticIdentityId: 'joint-a'}], order: ['joint-q']},
      outputSpace: {id: 'out', coordinates: [{id: 'actuator-q', semanticIdentityId: 'actuator-a'}], order: ['actuator-q']},
      mapping: {kind: 'IDENTITY'},
    }],
  });
  const result = evaluateTransmissionMapping(model.transmissions[0], {position: [1.25], velocity: [-0.5], outputEffort: [3]});
  assert.deepEqual(result.outputPosition, [1.25]);
  assert.deepEqual(result.outputVelocity, [-0.5]);
  assert.deepEqual(result.inputEffort, [3]);
  assert.deepEqual(result.jacobian, [[1]]);
});

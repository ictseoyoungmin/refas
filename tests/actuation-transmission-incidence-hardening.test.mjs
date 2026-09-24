import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createActuationModel,
  createControlProfile,
  createPhysicalIdentityGraph,
  createTransmissionModel,
  validateControlProfileBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function identityGraph({driveParticipant = true, driveOnOutput = false} = {}) {
  const participantA = driveParticipant && !driveOnOutput ? 'actuator-drive' : 'actuator-load';
  const participantB = driveParticipant && driveOnOutput ? 'actuator-drive' : 'actuator-extra';
  return createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'controller-main', kind: 'controller'},
      {id: 'actuator-drive', kind: 'actuator'},
      {id: 'actuator-load', kind: 'actuator'},
      {id: 'actuator-extra', kind: 'actuator'},
      {id: 'tx-drive', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-main']},
      {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
      {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
      {id: 'contains-actuator-extra', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-extra']},
      {id: 'contains-tx-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
      {id: 'tx-drive-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: [participantA, participantB]},
      {id: 'actuator-drive-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
      {id: 'controller-main-commands-drive', kind: 'COMMANDS', sourceId: 'controller-main', targetIds: ['actuator-drive']},
    ],
  });
}

function transmission(identityGraph, {driveParticipant = true, driveOnOutput = false} = {}) {
  const inputIdentity = driveParticipant && !driveOnOutput ? 'actuator-drive' : 'actuator-load';
  const outputIdentity = driveParticipant && driveOnOutput ? 'actuator-drive' : 'actuator-extra';
  return createTransmissionModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    transmissions: [{
      transmissionId: 'tx-drive',
      mapsRelationIds: ['tx-drive-maps'],
      contextMechanismIds: [],
      inputSpace: {
        id: 'drive-in',
        coordinates: [{id: 'input-q', semanticIdentityId: inputIdentity}],
        order: ['input-q'],
      },
      outputSpace: {
        id: 'drive-out',
        coordinates: [{id: 'output-q', semanticIdentityId: outputIdentity}],
        order: ['output-q'],
      },
      mapping: {kind: 'RATIO', ratio: 2, offset: 0},
    }],
  });
}

function actuatorRecord() {
  return {
    actuatorId: 'actuator-drive',
    drivesRelationId: 'actuator-drive-drives',
    drivenTargetId: 'tx-drive',
    drivenTargetKind: 'transmission',
    kind: 'ROTARY_ELECTRIC',
    coordinateClass: 'ROTARY',
    supportedControlModes: {value: ['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE']},
    positionRange: {value: {kind: 'BOUNDED', minimum: -3.1, maximum: 3.1, unit: 'rad'}},
    velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}},
    effortLimit: {value: {maxAbs: 12, unit: 'N_m'}},
    stiffness: {value: null},
    damping: {value: {value: 0.05, unit: 'N_m_s_per_rad'}},
    armature: {value: {value: 0.001, unit: 'kg_m2'}},
    responseLatency: {value: {value: 0.002, unit: 's'}},
  };
}

function actuation(identityGraph, transmissionModel) {
  return createActuationModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    transmissionModel,
    actuators: [actuatorRecord()],
  });
}

function controlProfile(identityGraph, actuationModel, transmissionModel) {
  return createControlProfile({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    actuationModel,
    transmissionModel,
    profiles: [{
      profileId: 'control-drive',
      selector: {
        controllerId: 'controller-main',
        commandsRelationId: 'controller-main-commands-drive',
        actuatorId: 'actuator-drive',
      },
      coordinateClass: 'ROTARY',
      mode: {value: 'POSITION'},
      commandSpace: {channels: [{quantity: 'POSITION', unit: 'rad'}]},
      gainModel: {
        value: {
          kind: 'PD',
          kp: {value: 20, unit: 'N_m_per_rad'},
          kd: {value: 0.4, unit: 'N_m_s_per_rad'},
        },
      },
      controllerDelay: {value: {value_s: 0.001}},
    }],
  });
}

test('P07 requires a transmission-driven actuator to participate in that transmission semantic coordinate space', () => {
  const graph = identityGraph({driveParticipant: false});
  const tx = transmission(graph, {driveParticipant: false});
  assert.throws(
    () => actuation(graph, tx),
    /actuator-drive.*DRIVES transmission tx-drive.*not a semantic coordinate participant/,
  );
});

test('P07 participant incidence is direction-neutral and accepts the actuator on the transmission output side', () => {
  const graph = identityGraph({driveParticipant: true, driveOnOutput: true});
  const tx = transmission(graph, {driveParticipant: true, driveOnOutput: true});
  assert.equal(actuation(graph, tx).actuators[0].drivenTargetId, 'tx-drive');
});

test('P08 delegated live reconstruction fails when the selected P07 actuator stops participating in its transmission', () => {
  const baseGraph = identityGraph({driveParticipant: true});
  const baseTx = transmission(baseGraph, {driveParticipant: true});
  const baseActuation = actuation(baseGraph, baseTx);
  const baseControl = controlProfile(baseGraph, baseActuation, baseTx);

  const currentGraph = identityGraph({driveParticipant: false});
  const currentTx = transmission(currentGraph, {driveParticipant: false});
  const validation = validateControlProfileBindings(baseControl, currentGraph, {
    actuationModel: baseActuation,
    transmissionModel: currentTx,
  });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /not a semantic coordinate participant/);
});

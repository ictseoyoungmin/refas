import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActuationModel,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRuntimeBinding,
  createTransmissionModel,
  deriveRepresentationCapacityObligations,
  validateRepresentationCapacityBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);

function fixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'controller-main', kind: 'controller'},
      {id: 'actuator-drive', kind: 'actuator'},
      {id: 'actuator-load', kind: 'actuator'},
      {id: 'tx-drive', kind: 'transmission'},
      {id: 'runtime-controller', kind: 'runtime-endpoint'},
      {id: 'runtime-actuator', kind: 'runtime-endpoint'},
    ],
    relations: [
      {id: 'contains-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['controller-main']},
      {id: 'contains-actuator-drive', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-drive']},
      {id: 'contains-actuator-load', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['actuator-load']},
      {id: 'contains-tx', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
      {id: 'contains-runtime-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-controller']},
      {id: 'contains-runtime-actuator', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-actuator']},
      {id: 'tx-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive', 'actuator-load']},
      {id: 'drive-drives-tx', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
      {id: 'controller-commands-drive', kind: 'COMMANDS', sourceId: 'controller-main', targetIds: ['actuator-drive']},
      {id: 'runtime-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller', targetIds: ['controller-main']},
      {id: 'runtime-binds-actuator', kind: 'BINDS_RUNTIME', sourceId: 'runtime-actuator', targetIds: ['actuator-drive']},
    ],
  });
  const transmissionModel = createTransmissionModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    transmissions: [{
      transmissionId: 'tx-drive', mapsRelationIds: ['tx-maps'], contextMechanismIds: [],
      inputSpace: {id: 'runtime-in', coordinates: [{id: 'drive-q', semanticIdentityId: 'actuator-drive'}], order: ['drive-q']},
      outputSpace: {id: 'runtime-out', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
      mapping: {kind: 'RATIO', ratio: 2, offset: 0},
    }],
  });
  const actuationModel = createActuationModel({
    scopeId: 'whole', sourceSha256: D(), identityGraph, transmissionModel,
    actuators: [{
      actuatorId: 'actuator-drive', drivesRelationId: 'drive-drives-tx', drivenTargetId: 'tx-drive', drivenTargetKind: 'transmission',
      kind: 'ROTARY_ELECTRIC', coordinateClass: 'ROTARY',
      supportedControlModes: {value: ['POSITION']},
      positionRange: {value: {kind: 'CONTINUOUS', unit: 'rad'}},
      velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}}, effortLimit: {value: {maxAbs: 12, unit: 'N_m'}},
      stiffness: {value: null}, damping: {value: null}, armature: {value: null}, responseLatency: {value: null},
    }],
  });
  const runtimeModel = createRuntimeBinding({
    scopeId: 'whole', sourceSha256: D(), identityGraph, actuationModel, transmissionModel,
    bindings: [
      {
        bindingId: 'binding-controller',
        selector: {runtimeEndpointId: 'runtime-controller', bindsRuntimeRelationId: 'runtime-binds-controller', targetId: 'controller-main', targetKind: 'controller'},
        coordinateClass: 'NONE', device: {value: 'controller-device'}, bus: {value: 'bus'}, runtimeIndex: {value: 1},
        sign: {value: null}, zeroOffset: {value: null}, encoderScale: {value: null}, transportDelay: {value: {value_s: 0.001}},
      },
      {
        bindingId: 'binding-actuator',
        selector: {runtimeEndpointId: 'runtime-actuator', bindsRuntimeRelationId: 'runtime-binds-actuator', targetId: 'actuator-drive', targetKind: 'actuator'},
        coordinateClass: 'ROTARY', device: {value: 'actuator-device'}, bus: {value: 'bus'}, runtimeIndex: {value: 2},
        sign: {value: 1}, zeroOffset: {value: {value: 0, unit: 'rad'}}, encoderScale: {value: {value: 0.001, unit: 'rad_per_runtime_unit'}},
        transportDelay: {value: {value_s: 0.002}},
      },
    ],
  });
  const components = [
    {componentId: 'transmission-main', ownerModuleId: 'module-root', contract: transmissionModel},
    {componentId: 'actuation-main', ownerModuleId: 'module-root', contract: actuationModel, validationContext: {transmissionModel}},
    {componentId: 'runtime-main', ownerModuleId: 'module-root', contract: runtimeModel, validationContext: {actuationModel, transmissionModel}},
  ];
  const bundle = createPhysicalAssetBundle({bundleId: 'p11-runtime-calibration', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}

test('P11 emits runtime calibration only for coordinate-bearing runtime bindings', () => {
  const context = fixture();
  const obligations = deriveRepresentationCapacityObligations(context);
  const runtime = obligations.filter((item) => item.source.kind === 'COMPONENT' && item.source.componentId === 'runtime-main');
  const calibration = runtime.filter((item) => item.semanticPath === 'runtime.calibration');
  assert.equal(calibration.length, 1);
  assert.deepEqual(calibration[0].subjectIds, ['actuator-drive', 'binding-actuator', 'runtime-actuator']);

  const controllerSubjects = ['binding-controller', 'controller-main', 'runtime-controller'].sort();
  assert.equal(runtime.some((item) => item.semanticPath === 'runtime.calibration' && JSON.stringify(item.subjectIds) === JSON.stringify(controllerSubjects)), false);
  for (const path of ['runtime.endpoint', 'runtime.coordinate-class', 'runtime.locator', 'runtime.index', 'runtime.transport-delay']) {
    assert.equal(runtime.some((item) => item.semanticPath === path && JSON.stringify(item.subjectIds) === JSON.stringify(controllerSubjects)), true, `missing ${path} for NONE binding`);
  }

  const profile = createRepresentationCapacityProfile({
    profileId: 'p11-runtime-calibration-profile', backend: 'fixture-backend', ...context,
    supported: obligations.map(({obligationId}) => ({obligationId})), approximated: [], unsupported: [], blockers: [],
  });
  assert.deepEqual(validateRepresentationCapacityBindings(profile, context), {valid: true, errors: []});
});

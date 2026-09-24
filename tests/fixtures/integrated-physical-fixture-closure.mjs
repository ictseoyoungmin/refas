import {
  createActuationModel,
  createControlProfile,
  createPhysicalAssetBundle,
  createRuntimeBinding,
} from '../../skills/refas/scripts/lib/index.mjs';
import {
  P17_IMPLEMENTATION_ARTIFACT_SHA256,
  P17_SOURCE_SHA256,
  createIntegratedPhysicalConstruction,
} from './integrated-physical-fixture.mjs';

function resolvedActuators(model) {
  return structuredClone(model.actuators).map((actuator) => ({
    ...actuator,
    stiffness: {
      ...actuator.stiffness,
      value: {value: actuator.actuatorId === 'actuator-a' ? 0.7 : 0.75, unit: 'N_m_per_rad'},
    },
  }));
}

function replaceComponent(components, componentId, contract, validationContext) {
  return components.map((component) => component.componentId === componentId
    ? {componentId, ownerModuleId: component.ownerModuleId, contract, validationContext}
    : component);
}

export function createClosedIntegratedPhysicalConstruction(options = {}) {
  const base = createIntegratedPhysicalConstruction(options);
  const upstream = {
    articulationGraph: base.articulationGraph,
    mechanismGraph: base.mechanismGraph,
    transmissionModel: base.transmissionModel,
    implementationManifest: base.implementationManifest,
    expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
  };

  const actuationModel = createActuationModel({
    scopeId: 'whole',
    sourceSha256: P17_SOURCE_SHA256,
    identityGraph: base.identityGraph,
    ...upstream,
    actuators: resolvedActuators(base.actuationModel),
  });

  const controlModel = createControlProfile({
    scopeId: 'whole',
    sourceSha256: P17_SOURCE_SHA256,
    identityGraph: base.identityGraph,
    actuationModel,
    ...upstream,
    profiles: structuredClone(base.controlModel.profiles),
  });

  const runtimeModel = createRuntimeBinding({
    scopeId: 'whole',
    sourceSha256: P17_SOURCE_SHA256,
    identityGraph: base.identityGraph,
    actuationModel,
    ...upstream,
    bindings: structuredClone(base.runtimeModel.bindings),
  });

  let components = replaceComponent(
    base.components,
    'actuation-main',
    actuationModel,
    {...upstream},
  );
  components = replaceComponent(
    components,
    'control-main',
    controlModel,
    {...upstream, actuationModel},
  );
  components = replaceComponent(
    components,
    'runtime-main',
    runtimeModel,
    {
      ...upstream,
      actuationModel,
      attachmentSemantics: base.attachmentSemantics,
      jointContracts: base.jointContracts,
    },
  );

  const bundle = createPhysicalAssetBundle({
    bundleId: 'p17-integrated-fixture',
    identityGraph: base.identityGraph,
    rootModuleId: 'module-base',
    components,
  });

  return {
    ...base,
    actuationModel,
    controlModel,
    runtimeModel,
    components,
    bundle,
  };
}

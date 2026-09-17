import {Buffer} from 'node:buffer';

import {
  canonicalizeBackendRigidTransform,
  createActuationModel,
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createCandidateTransaction,
  createCollisionModel,
  createControlProfile,
  createCrossRepresentationValidation,
  createDivergenceAuthorization,
  createMechanismGraph,
  createPhysicalAssetBundle,
  createPhysicalClaimCertificationPolicy,
  createPhysicalClaimEvidence,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createRuntimeBinding,
  createSemanticAuthoritySet,
  createSemanticJsonExportAdapter,
  createSemanticJsonRepresentationNormalizer,
  createTransmissionImplementationManifest,
  createTransmissionModel,
  deriveRepresentationCapacityObligations,
  digestBytes,
  digestJson,
  divergenceAuthoritySubjectId,
  evaluatePhysicalClaimCertification,
  physicalClaimEvidenceRole,
  runExportAdapter,
  runRepresentationNormalizer,
  stableStringify,
} from '../../skills/refas/scripts/lib/index.mjs';

export const P17_SOURCE_SHA256 = '7'.repeat(64);
export const P17_IMPLEMENTATION_ARTIFACT_SHA256 = '8'.repeat(64);

const D = (value = 'a') => value.repeat(64);
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const T = (translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({translation_m, rotation_quat_xyzw});
const Q = (parentId, translation_m = [0, 0, 0], rotation_quat_xyzw = [0, 0, 0, 1]) => ({parentId, translation_m, rotation_quat_xyzw});

function complexInterfaceQuaternion() {
  return canonicalizeBackendRigidTransform({
    translation: [0, 0, 0],
    translationUnit: 'm',
    rotation: {kind: 'EULER', order: 'XYZ', values: [10, 20, 30], unit: 'deg', convention: 'INTRINSIC'},
  }).rotation_quat_xyzw;
}

function attachmentSemanticsInput() {
  const evidenceRefs = ['fixtures/p17/reference.json'];
  return {
    scopeId: 'whole',
    sourceSha256: P17_SOURCE_SHA256,
    entities: [
      {id: 'module-base', scopeId: 'whole', evidenceRefs},
      {id: 'module-drive-a', scopeId: 'whole', evidenceRefs},
      {id: 'module-drive-b', scopeId: 'whole', evidenceRefs},
      {id: 'base-body', scopeId: 'whole', evidenceRefs},
      {id: 'arm-a-body', scopeId: 'whole', evidenceRefs},
      {id: 'arm-b-body', scopeId: 'whole', evidenceRefs},
    ],
    relations: [
      {id: 'attach-module-base', mode: 'FREE', subjectId: 'module-base', ownerIds: [], basis: 'construction', evidenceRefs},
      {id: 'attach-module-drive-a', mode: 'RIGID_FOLLOW', subjectId: 'module-drive-a', ownerIds: ['module-base'], basis: 'construction', evidenceRefs},
      {id: 'attach-module-drive-b', mode: 'RIGID_FOLLOW', subjectId: 'module-drive-b', ownerIds: ['module-base'], basis: 'construction', evidenceRefs},
      {id: 'attach-base-body', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs},
      {id: 'hinge-arm-a', mode: 'ARTICULATED', subjectId: 'arm-a-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs},
      {id: 'hinge-arm-b', mode: 'ARTICULATED', subjectId: 'arm-b-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs},
    ],
    evidenceRefs,
  };
}

function identityGraphInput(attachmentSemantics, {reverseInput = false} = {}) {
  const interfaceQ = complexInterfaceQuaternion();
  const entities = [
    {id: 'module-base', kind: 'assembly-module'},
    {id: 'module-drive-a', kind: 'assembly-module', frame: Q('module-base', [0.45, 0, 0])},
    {id: 'module-drive-b', kind: 'assembly-module', frame: Q('module-base', [-0.45, 0, 0])},
    {id: 'base-link', kind: 'rigid-link', frame: Q('module-base')},
    {id: 'arm-a-link', kind: 'rigid-link', frame: Q('module-drive-a')},
    {id: 'arm-b-link', kind: 'rigid-link', frame: Q('module-drive-b')},
    {id: 'joint-a', kind: 'virtual-joint', frame: Q('base-link', [0.45, 0, 0])},
    {id: 'joint-b', kind: 'virtual-joint', frame: Q('base-link', [-0.45, 0, 0])},
    {id: 'arm-a-part', kind: 'physical-part', frame: Q('arm-a-link', [0.2, 0, 0])},
    {id: 'arm-b-part', kind: 'physical-part', frame: Q('arm-b-link', [-0.2, 0, 0])},
    {id: 'parallel-mechanism', kind: 'mechanism', frame: Q('module-base')},
    {id: 'coupled-transmission', kind: 'transmission'},
    {id: 'actuator-a', kind: 'actuator', frame: Q('module-drive-a', [0, 0.08, 0])},
    {id: 'actuator-b', kind: 'actuator', frame: Q('module-drive-b', [0, -0.08, 0])},
    {id: 'controller-a', kind: 'controller'},
    {id: 'controller-b', kind: 'controller'},
    {id: 'runtime-controller-a', kind: 'runtime-endpoint'},
    {id: 'runtime-controller-b', kind: 'runtime-endpoint'},
    {id: 'runtime-actuator-a', kind: 'runtime-endpoint'},
    {id: 'runtime-actuator-b', kind: 'runtime-endpoint'},
    {id: 'interface-base-a', kind: 'attachment-interface', compatibilityFamilyIds: ['p17-fixed-mount'], frame: Q('module-base', [0.45, 0.15, 0], interfaceQ)},
    {id: 'interface-drive-a', kind: 'attachment-interface', compatibilityFamilyIds: ['p17-fixed-mount'], frame: Q('module-drive-a', [0, 0.15, 0], interfaceQ)},
    {id: 'interface-base-b', kind: 'attachment-interface', compatibilityFamilyIds: ['p17-fixed-mount'], frame: Q('module-base', [-0.45, -0.15, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2])},
    {id: 'interface-drive-b', kind: 'attachment-interface', compatibilityFamilyIds: ['p17-fixed-mount'], frame: Q('module-drive-b', [0, -0.15, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2])},
  ];
  const relations = [
    {id: 'contains-module-drive-a', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['module-drive-a']},
    {id: 'contains-module-drive-b', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['module-drive-b']},
    {id: 'contains-base-link', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['base-link']},
    {id: 'contains-arm-a-link', kind: 'CONTAINS', sourceId: 'module-drive-a', targetIds: ['arm-a-link']},
    {id: 'contains-arm-b-link', kind: 'CONTAINS', sourceId: 'module-drive-b', targetIds: ['arm-b-link']},
    {id: 'contains-joint-a', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['joint-a']},
    {id: 'contains-joint-b', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['joint-b']},
    {id: 'contains-arm-a-part', kind: 'CONTAINS', sourceId: 'module-drive-a', targetIds: ['arm-a-part']},
    {id: 'contains-arm-b-part', kind: 'CONTAINS', sourceId: 'module-drive-b', targetIds: ['arm-b-part']},
    {id: 'contains-mechanism', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['parallel-mechanism']},
    {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['coupled-transmission']},
    {id: 'contains-actuator-a', kind: 'CONTAINS', sourceId: 'module-drive-a', targetIds: ['actuator-a']},
    {id: 'contains-actuator-b', kind: 'CONTAINS', sourceId: 'module-drive-b', targetIds: ['actuator-b']},
    {id: 'contains-controller-a', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['controller-a']},
    {id: 'contains-controller-b', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['controller-b']},
    {id: 'contains-runtime-controller-a', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['runtime-controller-a']},
    {id: 'contains-runtime-controller-b', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['runtime-controller-b']},
    {id: 'contains-runtime-actuator-a', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['runtime-actuator-a']},
    {id: 'contains-runtime-actuator-b', kind: 'CONTAINS', sourceId: 'module-base', targetIds: ['runtime-actuator-b']},
    {id: 'exposes-interface-base-a', kind: 'EXPOSES', sourceId: 'module-base', targetIds: ['interface-base-a']},
    {id: 'exposes-interface-base-b', kind: 'EXPOSES', sourceId: 'module-base', targetIds: ['interface-base-b']},
    {id: 'exposes-interface-drive-a', kind: 'EXPOSES', sourceId: 'module-drive-a', targetIds: ['interface-drive-a']},
    {id: 'exposes-interface-drive-b', kind: 'EXPOSES', sourceId: 'module-drive-b', targetIds: ['interface-drive-b']},
    {id: 'compatible-interface-a', kind: 'COMPATIBLE_WITH', sourceId: 'interface-base-a', targetIds: ['interface-drive-a']},
    {id: 'compatible-interface-b', kind: 'COMPATIBLE_WITH', sourceId: 'interface-base-b', targetIds: ['interface-drive-b']},
    {id: 'binds-interface-a', kind: 'BINDS_TO', sourceId: 'interface-base-a', targetIds: ['interface-drive-a'], attachmentRelationId: 'attach-module-drive-a'},
    {id: 'binds-interface-b', kind: 'BINDS_TO', sourceId: 'interface-base-b', targetIds: ['interface-drive-b'], attachmentRelationId: 'attach-module-drive-b'},
    {id: 'arm-a-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'arm-a-part', targetIds: ['arm-a-link']},
    {id: 'arm-b-aggregates', kind: 'AGGREGATES_INTO', sourceId: 'arm-b-part', targetIds: ['arm-b-link']},
    {id: 'joint-a-connects', kind: 'CONNECTS', sourceId: 'joint-a', targetIds: ['base-link', 'arm-a-link']},
    {id: 'joint-b-connects', kind: 'CONNECTS', sourceId: 'joint-b', targetIds: ['base-link', 'arm-b-link']},
    {id: 'mechanism-realizes', kind: 'REALIZES', sourceId: 'parallel-mechanism', targetIds: ['joint-a', 'joint-b']},
    {id: 'transmission-maps', kind: 'MAPS', sourceId: 'coupled-transmission', targetIds: ['joint-a', 'joint-b', 'parallel-mechanism', 'actuator-a', 'actuator-b']},
    {id: 'actuator-a-drives', kind: 'DRIVES', sourceId: 'actuator-a', targetIds: ['coupled-transmission']},
    {id: 'actuator-b-drives', kind: 'DRIVES', sourceId: 'actuator-b', targetIds: ['coupled-transmission']},
    {id: 'controller-a-commands', kind: 'COMMANDS', sourceId: 'controller-a', targetIds: ['actuator-a']},
    {id: 'controller-b-commands', kind: 'COMMANDS', sourceId: 'controller-b', targetIds: ['actuator-b']},
    {id: 'runtime-controller-a-binds', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller-a', targetIds: ['controller-a']},
    {id: 'runtime-controller-b-binds', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller-b', targetIds: ['controller-b']},
    {id: 'runtime-actuator-a-binds', kind: 'BINDS_RUNTIME', sourceId: 'runtime-actuator-a', targetIds: ['actuator-a']},
    {id: 'runtime-actuator-b-binds', kind: 'BINDS_RUNTIME', sourceId: 'runtime-actuator-b', targetIds: ['actuator-b']},
  ];
  if (reverseInput) {
    entities.reverse();
    relations.reverse();
  }
  return {scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, attachmentSemantics, entities, relations};
}

function dynamics(identityGraph, linkId, mass, inertia) {
  return createRigidBodyDynamics({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph,
    links: [{
      linkId,
      referenceFrameId: linkId,
      mass: {value_kg: mass},
      centerOfMass: {value_m: [0, 0, 0]},
      inertia: {tensor_kg_m2: [[inertia, 0, 0], [0, inertia * 1.1, 0], [0, 0, inertia * 1.2]]},
    }],
  });
}

function collision(identityGraph, linkId, radius) {
  return createCollisionModel({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, groups: ['fixture-body'],
    links: [{
      linkId,
      selfCollisionPolicy: 'DISABLED',
      colliders: [{
        id: `${linkId}-sphere`,
        frame: T(),
        geometry: {kind: 'SPHERE', radius_m: radius},
        filter: {groupIds: ['fixture-body'], maskGroupIds: ['fixture-body']},
      }],
    }],
  });
}

function actuatorRecord(actuatorId, relationId) {
  return {
    actuatorId,
    drivesRelationId: relationId,
    drivenTargetId: 'coupled-transmission',
    drivenTargetKind: 'transmission',
    kind: 'ROTARY_ELECTRIC',
    coordinateClass: 'ROTARY',
    supportedControlModes: {value: ['POSITION', 'VELOCITY', 'EFFORT', 'IMPEDANCE']},
    positionRange: {value: {kind: 'BOUNDED', minimum: -1.5, maximum: 1.5, unit: 'rad'}},
    velocityLimit: {value: {maxAbs: 6, unit: 'rad_s'}},
    effortLimit: {value: {maxAbs: 18, unit: 'N_m'}},
    stiffness: {value: {value: 0.4, unit: 'N_m_per_rad'}},
    damping: {value: {value: 0.08, unit: 'N_m_s_per_rad'}},
    armature: {value: {value: 0.0015, unit: 'kg_m2'}},
    responseLatency: {value: {value: 0.002, unit: 's'}},
  };
}

function controlProfile(profileId, controllerId, relationId, actuatorId, kp) {
  return {
    profileId,
    selector: {controllerId, commandsRelationId: relationId, actuatorId},
    coordinateClass: 'ROTARY',
    mode: {value: 'POSITION'},
    commandSpace: {channels: [{quantity: 'POSITION', unit: 'rad'}]},
    gainModel: {value: {kind: 'PD', kp: {value: kp, unit: 'N_m_per_rad'}, kd: {value: 0.35, unit: 'N_m_s_per_rad'}}},
    controllerDelay: {value: {value_s: 0.001}},
  };
}

function controllerRuntimeBinding(suffix, runtimeIndex) {
  return {
    bindingId: `binding-controller-${suffix}`,
    selector: {runtimeEndpointId: `runtime-controller-${suffix}`, bindsRuntimeRelationId: `runtime-controller-${suffix}-binds`, targetId: `controller-${suffix}`, targetKind: 'controller'},
    coordinateClass: 'NONE',
    device: {value: `controller-device-${suffix}`},
    bus: {value: 'p17-bus'},
    runtimeIndex: {value: runtimeIndex},
    sign: {value: null}, zeroOffset: {value: null}, encoderScale: {value: null},
    transportDelay: {value: {value_s: 0.0005}},
  };
}

function actuatorRuntimeBinding(suffix, runtimeIndex, sign) {
  return {
    bindingId: `binding-actuator-${suffix}`,
    selector: {runtimeEndpointId: `runtime-actuator-${suffix}`, bindsRuntimeRelationId: `runtime-actuator-${suffix}-binds`, targetId: `actuator-${suffix}`, targetKind: 'actuator'},
    coordinateClass: 'ROTARY',
    device: {value: `actuator-device-${suffix}`},
    bus: {value: 'p17-bus'},
    runtimeIndex: {value: runtimeIndex},
    sign: {value: sign},
    zeroOffset: {value: {value: suffix === 'a' ? 0.02 : -0.02, unit: 'rad'}},
    encoderScale: {value: {value: 0.001, unit: 'rad_per_runtime_unit'}},
    transportDelay: {value: {value_s: 0.0015}},
  };
}

export function createIntegratedPhysicalConstruction({controlKp = 24, runtimeIndexA = 10, reverseInput = false} = {}) {
  const attachmentSemantics = createAttachmentSemantics(attachmentSemanticsInput());
  const identityGraph = createPhysicalIdentityGraph(identityGraphInput(attachmentSemantics, {reverseInput}));
  const jointContracts = [
    createArticulatedJoint({attachmentSemantics, id: 'joint-a', relationId: 'hinge-arm-a', ownerJointFrame: I([0.45, 0, 0]), subjectJointFrame: I(), minimumAngle: -1.2, maximumAngle: 1.2, evidenceRefs: ['fixtures/p17/joint-a.json']}),
    createArticulatedJoint({attachmentSemantics, id: 'joint-b', relationId: 'hinge-arm-b', ownerJointFrame: I([-0.45, 0, 0]), subjectJointFrame: I(), minimumAngle: -1.2, maximumAngle: 1.2, evidenceRefs: ['fixtures/p17/joint-b.json']}),
  ];
  const articulationGraph = createArticulationGraph({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, attachmentSemantics, jointContracts,
    rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: T()},
      {linkId: 'arm-a-link', attachmentEntityId: 'arm-a-body', attachmentFrameInLink: T()},
      {linkId: 'arm-b-link', attachmentEntityId: 'arm-b-body', attachmentFrameInLink: T()},
    ],
    joints: [
      {virtualJointId: 'joint-a', parentLinkId: 'base-link', childLinkId: 'arm-a-link', referenceAngle: 0, jointContract: {schema: jointContracts[0].schema, id: jointContracts[0].id, jointDigest: jointContracts[0].jointDigest}},
      {virtualJointId: 'joint-b', parentLinkId: 'base-link', childLinkId: 'arm-b-link', referenceAngle: 0, jointContract: {schema: jointContracts[1].schema, id: jointContracts[1].id, jointDigest: jointContracts[1].jointDigest}},
    ],
  });
  const mechanismGraph = createMechanismGraph({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, articulationGraph,
    mechanisms: [{
      mechanismId: 'parallel-mechanism', kind: 'PARALLEL_LINKAGE', realizesRelationIds: ['mechanism-realizes'], realizedJointIds: ['joint-a', 'joint-b'],
      members: [
        {id: 'arm-a-member', physicalIdentityId: 'arm-a-part', role: 'LINK_ELEMENT'},
        {id: 'arm-b-member', physicalIdentityId: 'arm-b-part', role: 'LINK_ELEMENT'},
      ],
      edges: [{id: 'parallel-pin-coupling', kind: 'PIN_CONNECTED', memberIds: ['arm-a-member', 'arm-b-member']}],
    }],
  });
  const implementationManifest = createTransmissionImplementationManifest({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, artifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
    implementations: [
      {schema: 'refas.transmission-nonlinear-position/v1', id: 'parallel-position-model', digest: D('b'), inputSemanticIdentityOrder: ['joint-a', 'joint-b'], outputSemanticIdentityOrder: ['actuator-a', 'actuator-b']},
      {schema: 'refas.transmission-nonlinear-jacobian/v1', id: 'parallel-jacobian-model', digest: D('c'), inputSemanticIdentityOrder: ['joint-a', 'joint-b'], outputSemanticIdentityOrder: ['actuator-a', 'actuator-b']},
    ],
  });
  const transmissionModel = createTransmissionModel({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, articulationGraph, mechanismGraph,
    implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
    transmissions: [{
      transmissionId: 'coupled-transmission', mapsRelationIds: ['transmission-maps'], contextMechanismIds: ['parallel-mechanism'],
      inputSpace: {id: 'joint-space', coordinates: [{id: 'joint-a-q', semanticIdentityId: 'joint-a'}, {id: 'joint-b-q', semanticIdentityId: 'joint-b'}], order: ['joint-a-q', 'joint-b-q']},
      outputSpace: {id: 'actuator-space', coordinates: [{id: 'actuator-a-q', semanticIdentityId: 'actuator-a'}, {id: 'actuator-b-q', semanticIdentityId: 'actuator-b'}], order: ['actuator-a-q', 'actuator-b-q']},
      mapping: {
        kind: 'NONLINEAR',
        positionModelRef: {schema: 'refas.transmission-nonlinear-position/v1', id: 'parallel-position-model', digest: D('b')},
        jacobianModelRef: {schema: 'refas.transmission-nonlinear-jacobian/v1', id: 'parallel-jacobian-model', digest: D('c')},
      },
    }],
  });
  const actuationModel = createActuationModel({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, transmissionModel, mechanismGraph, articulationGraph,
    implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
    actuators: [actuatorRecord('actuator-a', 'actuator-a-drives'), actuatorRecord('actuator-b', 'actuator-b-drives')],
  });
  const controlModel = createControlProfile({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, actuationModel, transmissionModel, mechanismGraph, articulationGraph,
    implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
    profiles: [
      controlProfile('control-a', 'controller-a', 'controller-a-commands', 'actuator-a', controlKp),
      controlProfile('control-b', 'controller-b', 'controller-b-commands', 'actuator-b', 26),
    ],
  });
  const runtimeModel = createRuntimeBinding({
    scopeId: 'whole', sourceSha256: P17_SOURCE_SHA256, identityGraph, actuationModel, transmissionModel, mechanismGraph, articulationGraph,
    implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256,
    bindings: [
      controllerRuntimeBinding('a', 1), controllerRuntimeBinding('b', 2),
      actuatorRuntimeBinding('a', runtimeIndexA, 1), actuatorRuntimeBinding('b', 11, -1),
    ],
  });
  const rootDynamics = dynamics(identityGraph, 'base-link', 4.0, 0.22);
  const armADynamics = dynamics(identityGraph, 'arm-a-link', 1.2, 0.06);
  const armBDynamics = dynamics(identityGraph, 'arm-b-link', 1.2, 0.06);
  const rootCollision = collision(identityGraph, 'base-link', 0.18);
  const armACollision = collision(identityGraph, 'arm-a-link', 0.09);
  const armBCollision = collision(identityGraph, 'arm-b-link', 0.09);

  const upstreamContext = {articulationGraph, mechanismGraph, transmissionModel, implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256};
  const components = [
    {componentId: 'dynamics-base', ownerModuleId: 'module-base', contract: rootDynamics},
    {componentId: 'collision-base', ownerModuleId: 'module-base', contract: rootCollision},
    {componentId: 'dynamics-arm-a', ownerModuleId: 'module-drive-a', contract: armADynamics},
    {componentId: 'collision-arm-a', ownerModuleId: 'module-drive-a', contract: armACollision},
    {componentId: 'dynamics-arm-b', ownerModuleId: 'module-drive-b', contract: armBDynamics},
    {componentId: 'collision-arm-b', ownerModuleId: 'module-drive-b', contract: armBCollision},
    {componentId: 'articulation-main', ownerModuleId: 'module-base', contract: articulationGraph, validationContext: {attachmentSemantics, jointContracts}},
    {componentId: 'mechanism-main', ownerModuleId: 'module-base', contract: mechanismGraph, validationContext: {articulationGraph}},
    {componentId: 'transmission-main', ownerModuleId: 'module-base', contract: transmissionModel, validationContext: {articulationGraph, mechanismGraph, implementationManifest, expectedImplementationArtifactDigest: P17_IMPLEMENTATION_ARTIFACT_SHA256}},
    {componentId: 'actuation-main', ownerModuleId: 'module-base', contract: actuationModel, validationContext: {...upstreamContext}},
    {componentId: 'control-main', ownerModuleId: 'module-base', contract: controlModel, validationContext: {...upstreamContext, actuationModel}},
    {componentId: 'runtime-main', ownerModuleId: 'module-base', contract: runtimeModel, validationContext: {...upstreamContext, actuationModel, attachmentSemantics, jointContracts}},
  ];
  const bundle = createPhysicalAssetBundle({bundleId: 'p17-integrated-fixture', identityGraph, rootModuleId: 'module-base', components});
  return {attachmentSemantics, identityGraph, jointContracts, articulationGraph, mechanismGraph, implementationManifest, transmissionModel, actuationModel, controlModel, runtimeModel, components, bundle};
}

function allSupportedProfile(construction, backend, profileId) {
  const obligations = deriveRepresentationCapacityObligations(construction);
  return createRepresentationCapacityProfile({
    profileId, backend, ...construction,
    supported: obligations.map(({obligationId}) => ({obligationId})),
    approximated: [], unsupported: [], blockers: [],
  });
}

function encodedIdentityFrame(entity) {
  if (!entity.frame) return null;
  if (entity.id === 'interface-base-a') {
    return {
      parentId: entity.frame.parentId,
      backendTransform: {
        translation: entity.frame.translation_m.map((value) => value * 1000), translationUnit: 'mm',
        rotation: {kind: 'EULER', order: 'ZYX', values: [30, 20, 10], unit: 'deg', convention: 'EXTRINSIC'},
      },
    };
  }
  const [x, y, z, w] = entity.frame.rotation_quat_xyzw;
  return {
    parentId: entity.frame.parentId,
    backendTransform: {
      translation: entity.frame.translation_m.map((value) => value * 100), translationUnit: 'cm',
      rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-w, -x, -y, -z]},
    },
  };
}

function p17EncodedAdapter({massOverride = null} = {}) {
  const base = createSemanticJsonExportAdapter();
  return {
    id: 'p17-encoded-json-adapter', backend: 'p17-encoded-json', version: '1',
    project(input) {
      const raw = base.project(input);
      const document = JSON.parse(raw.artifacts[0].content);
      for (const entity of document.identityProjection.entities) {
        if (entity.frame) entity.frame = encodedIdentityFrame(entity);
      }
      if (massOverride != null) {
        const component = document.components.find((item) => item.componentId === 'dynamics-arm-a');
        component.contract.links[0].mass.value_kg = massOverride;
      }
      return {
        artifacts: [{path: 'semantic/physical-asset.json', mediaType: 'application/json', content: `${stableStringify(document)}\n`}],
        bindings: raw.bindings,
      };
    },
  };
}

function p17EncodedNormalizer() {
  const base = createSemanticJsonRepresentationNormalizer();
  return {
    id: 'p17-encoded-json-normalizer', backend: 'p17-encoded-json', version: '1',
    implementationDigest: digestJson({schema: 'refas.normalizer-implementation-registration/v1', id: 'p17-encoded-json-normalizer', backend: 'p17-encoded-json', version: '1'}),
    normalize({manifest, obligations, artifacts}) {
      const source = artifacts.find((item) => item.path === 'semantic/physical-asset.json');
      const document = JSON.parse(Buffer.from(source.content).toString('utf8'));
      for (const entity of document.identityProjection.entities) {
        if (entity.frame?.backendTransform) {
          entity.frame = {parentId: entity.frame.parentId, ...canonicalizeBackendRigidTransform(entity.frame.backendTransform)};
        }
      }
      const canonicalArtifacts = artifacts.map((artifact) => artifact.path === source.path
        ? {...artifact, content: Buffer.from(`${stableStringify(document)}\n`)}
        : artifact);
      return base.normalize({manifest, obligations, artifacts: canonicalArtifacts});
    },
  };
}

export async function projectIntegratedPhysicalConstruction(construction, {backend = 'semantic', massOverride = null} = {}) {
  const encoded = backend === 'encoded';
  const backendId = encoded ? 'p17-encoded-json' : 'refas-semantic-json';
  const profileId = encoded ? 'p17-profile-encoded' : 'p17-profile-semantic';
  const capacityProfile = allSupportedProfile(construction, backendId, profileId);
  const adapter = encoded ? p17EncodedAdapter({massOverride}) : createSemanticJsonExportAdapter();
  const normalizer = encoded ? p17EncodedNormalizer() : createSemanticJsonRepresentationNormalizer();
  const exported = await runExportAdapter({exportId: encoded ? 'p17-export-encoded' : 'p17-export-semantic', adapter, capacityProfile, ...construction});
  const normalizedRepresentation = await runRepresentationNormalizer({normalizationId: encoded ? 'p17-normalized-encoded' : 'p17-normalized-semantic', normalizer, capacityProfile, manifest: exported.manifest, files: exported.files});
  const validation = await createCrossRepresentationValidation({
    validationId: encoded ? 'p17-validation-encoded' : 'p17-validation-semantic',
    capacityProfile, manifest: exported.manifest, files: exported.files, normalizedRepresentation, normalizer, ...construction,
  });
  return {...construction, capacityProfile, manifest: exported.manifest, files: exported.files, normalizedRepresentation, normalizer, validation};
}

export async function authorizeIntegratedMassDrift(projected) {
  const finding = projected.validation.findings.find((item) => item.semanticPath === 'dynamics.mass' && item.subjectIds.includes('arm-a-link'));
  if (!finding) throw new Error('P17 mass drift finding is missing');
  const subjectId = divergenceAuthoritySubjectId(projected.validation.validationDigest, finding.findingId, '');
  const authoritySet = createSemanticAuthoritySet({
    scopeId: projected.validation.scopeId,
    sourceSha256: projected.identityGraph.sourceSha256,
    targetSchema: projected.validation.schema,
    targetDigest: projected.validation.validationDigest,
    entries: [{
      id: 'p17-mass-divergence-authority', subjectId, authority: 'engineered',
      proposition: 'The encoded integration backend uses the declared arm-a mass override.',
      reason: 'P17 explicitly exercises declared backend divergence without mutating canonical physical state.',
      basis: [{kind: 'downstream-requirement', ref: 'backend:p17-encoded-json'}],
    }],
  });
  const declaration = {
    findingId: finding.findingId,
    obligationId: finding.obligationId,
    targetBackend: projected.validation.capacityBinding.backend,
    semanticPath: finding.semanticPath,
    subjectIds: [...finding.subjectIds],
    fieldPath: '',
    canonicalValue: finding.canonicalValue,
    overrideValue: finding.normalizedValue,
    reason: 'P17 deliberately exercises an exact declared backend-specific mass divergence.',
  };
  const divergenceAuthorization = await createDivergenceAuthorization({
    authorizationId: 'p17-mass-divergence', validation: projected.validation, declarations: [declaration], authoritySet,
    capacityProfile: projected.capacityProfile, manifest: projected.manifest, files: projected.files,
    normalizedRepresentation: projected.normalizedRepresentation, normalizer: projected.normalizer,
    bundle: projected.bundle, identityGraph: projected.identityGraph, components: projected.components,
  });
  return {finding, authoritySet, divergenceAuthorization};
}

export function physicalClaimContext(projected, extra = {}) {
  return {
    bundle: projected.bundle,
    identityGraph: projected.identityGraph,
    components: projected.components,
    validation: projected.validation,
    capacityProfile: projected.capacityProfile,
    manifest: projected.manifest,
    files: projected.files,
    normalizedRepresentation: projected.normalizedRepresentation,
    normalizer: projected.normalizer,
    ...extra,
  };
}

function checkpoint(candidate) {
  const sha256 = digestBytes(candidate);
  const payload = {
    schema: 'refas.checkpoint/v1', parentId: null, capability: 'whole-object-certification', scopeId: 'whole', reason: 'P17 integrated physical fixture',
    artifactRefs: [{kind: 'asset', path: 'p17-fixture.bin', sha256, sizeBytes: candidate.length}], claims: [], gates: [], metadata: {}, transactionId: null,
  };
  const contentDigest = digestJson(payload);
  return {...payload, id: `cp_${contentDigest.slice(0, 20)}`, createdAt: '2026-09-17T00:00:00.000Z', contentDigest};
}

function transactionForEvidence(evidence) {
  const candidate = Buffer.from('p17-integrated-physical-fixture');
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`);
  const anchorDocument = {schema: 'fixture.p17-anchor/v1', candidateSha256: digestBytes(candidate), physicalClaimSha256: digestBytes(evidenceBytes)};
  const anchorBytes = Buffer.from(JSON.stringify(anchorDocument));
  const nodeId = 'p17-runtime-ready-evidence';
  const transaction = createCandidateTransaction({
    candidateBytes: candidate,
    checkpoint: checkpoint(candidate),
    evidence: [
      {id: 'p17-candidate-anchor', role: 'candidate-anchor', schema: anchorDocument.schema, bytes: anchorBytes, subjectPointer: '/candidateSha256'},
      {id: nodeId, role: physicalClaimEvidenceRole(evidence.claimId), schema: evidence.schema, bytes: evidenceBytes, dependencies: [{nodeId: 'p17-candidate-anchor', proof: {kind: 'json-pointer-artifact-sha256', holder: 'dependency', pointer: '/physicalClaimSha256'}}]},
    ],
    decisionNodeIds: [nodeId],
    obligations: [{id: 'p17-runtime-ready-node', role: physicalClaimEvidenceRole(evidence.claimId), schema: evidence.schema}],
  });
  return {transaction, evidenceBytesById: {'p17-candidate-anchor': anchorBytes, [nodeId]: evidenceBytes}, nodeId};
}

export async function certifyIntegratedRuntimeReady(projected, extra = {}) {
  const context = physicalClaimContext(projected, extra);
  const evidence = await createPhysicalClaimEvidence({evidenceId: 'p17-runtime-ready', claimId: 'runtime-ready', ...context});
  const policy = createPhysicalClaimCertificationPolicy({claimIds: ['runtime-ready'], id: 'p17-runtime-ready-policy'});
  const tx = transactionForEvidence(evidence);
  const decision = await evaluatePhysicalClaimCertification({
    transaction: tx.transaction,
    policy,
    evidenceBytesById: tx.evidenceBytesById,
    physicalClaimContextsByNodeId: {[tx.nodeId]: context},
  });
  return {evidence, policy, decision, transaction: tx.transaction};
}

export function integratedFixtureEvidenceDigest({construction, semanticProjection, encodedProjection, runtimeCertification}) {
  return digestJson({
    schema: 'refas.p17-integration-evidence/v1',
    identityGraphDigest: construction.identityGraph.graphDigest,
    bundleDigest: construction.bundle.bundleDigest,
    semanticExportDigest: semanticProjection.manifest.exportDigest,
    semanticNormalizationDigest: semanticProjection.normalizedRepresentation.normalizationDigest,
    semanticValidationDigest: semanticProjection.validation.validationDigest,
    encodedExportDigest: encodedProjection.manifest.exportDigest,
    encodedNormalizationDigest: encodedProjection.normalizedRepresentation.normalizationDigest,
    encodedValidationDigest: encodedProjection.validation.validationDigest,
    runtimeEvidenceDigest: runtimeCertification.evidence.evidenceDigest,
    certificationDecisionDigest: digestJson(runtimeCertification.decision),
  });
}

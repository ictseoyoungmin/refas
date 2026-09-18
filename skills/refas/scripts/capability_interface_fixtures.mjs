import * as API from './lib/index.mjs';

const D = (character = '0') => character.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});

function cube(x0 = 0, x1 = 1) {
  return {
    positions: [
      [x0,0,0],[x1,0,0],[x1,1,0],[x0,1,0],
      [x0,0,1],[x1,0,1],[x1,1,1],[x0,1,1],
    ],
    indices: [
      0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
      3,7,6,3,6,2,0,7,3,0,4,7,1,2,6,1,6,5,
    ],
  };
}

function fusionFixture() {
  const attachmentSemantics = API.createAttachmentSemantics({
    scopeId: 'head-shell',
    sourceSha256: D(),
    entities: [E('head-shell'), E('fused-child')],
    relations: [R('head-free', 'FREE', 'head-shell'), R('child-fused', 'FUSED', 'fused-child', ['head-shell'])],
  });
  const logicalFusion = API.createLogicalFusion({attachmentSemantics, evidenceRefs: ['reviews/logical-fusion.json']});
  const canonicalEditIntent = API.createCanonicalEditIntent({
    id: 'finalize-head-shell',
    ownerCapability: 'assembly',
    scopeId: 'head-shell',
    editClass: 'finalization',
    canonicalBindings: ['finalization.head-shell'],
    realizationOperations: ['mesh-fuse'],
    evidenceRefs: ['reviews/head-ready.json'],
    intent: 'Finalize a closed logical fusion group.',
  });
  const frame = I();
  const members = [
    {memberId: 'head-shell', mesh: cube(-1, 0)},
    {memberId: 'fused-child', mesh: cube(0, 1)},
  ].map(({memberId, mesh}) => ({
    memberId,
    geometryDigest: API.physicalFusionGeometryDigest(mesh),
    frameDigest: API.physicalFusionFrameDigest(frame),
    materialRegionId: 'fixture',
    evidenceRefs: [`model/${memberId}.json`],
  }));
  return {attachmentSemantics, logicalFusion, canonicalEditIntent, members};
}

function surfaceFixture() {
  const attachmentSemantics = API.createAttachmentSemantics({
    scopeId: 'surface-fixture',
    sourceSha256: D(),
    entities: [E('root'), E('child'), E('badge')],
    relations: [
      R('root-free', 'FREE', 'root'),
      R('child-follow', 'RIGID_FOLLOW', 'child', ['root']),
      R('badge-offset', 'SURFACE_OFFSET', 'badge', ['root']),
    ],
  });
  const surfaces = [{
    ownerId: 'root',
    geometryDigest: D('b'),
    vertices: [[-1,-1,0.2],[1,-1,0.2],[0,1,0.2]],
    triangles: [{id: 'root-front-tri', patchId: 'root-front', indices: [0,1,2]}],
  }];
  const surfaceAnchorSet = API.createSurfaceAnchorSet({
    attachmentSemantics,
    surfaces,
    anchors: [{
      id: 'badge-surface-anchor',
      relationId: 'badge-offset',
      subjectAnchorId: 'badge-contact',
      ownerId: 'root',
      patchId: 'root-front',
      triangleId: 'root-front-tri',
      barycentric: [0.25,0.25,0.5],
      tangentHint: [1,0,0],
      offset: 0.1,
      maxRebindDistance: 0.3,
      maxNormalDeviationRadians: 0.5,
      evidenceRefs: ['model/badge-anchor.json'],
    }],
  });
  return {attachmentSemantics, surfaces, surfaceAnchorSet};
}

function multiFixture() {
  const attachmentSemantics = API.createAttachmentSemantics({
    scopeId: 'multi-anchor',
    sourceSha256: D(),
    entities: [E('nose'), E('left-ear'), E('right-ear'), E('glasses')],
    relations: [
      R('nose-free', 'FREE', 'nose'),
      R('left-free', 'FREE', 'left-ear'),
      R('right-free', 'FREE', 'right-ear'),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose','left-ear','right-ear']),
    ],
  });
  return {attachmentSemantics};
}

function articulatedFixture() {
  return {
    attachmentSemantics: API.createAttachmentSemantics({
      scopeId: 'hinged-door',
      sourceSha256: D(),
      entities: [E('housing'), E('door')],
      relations: [R('housing-free', 'FREE', 'housing'), R('door-hinge', 'ARTICULATED', 'door', ['housing'])],
    }),
  };
}

function clearanceFixture() {
  return {
    attachmentSemantics: API.createAttachmentSemantics({
      scopeId: 'spaced-panel',
      sourceSha256: D(),
      entities: [E('housing'), E('bracket'), E('panel')],
      relations: [
        R('housing-free', 'FREE', 'housing'),
        R('bracket-follow', 'RIGID_FOLLOW', 'bracket', ['housing']),
        R('panel-clearance', 'SUPPORTED_CLEARANCE', 'panel', ['bracket']),
      ],
    }),
  };
}

function propagationFixture() {
  const attachmentSemantics = API.createAttachmentSemantics({
    scopeId: 'propagation',
    sourceSha256: D(),
    entities: [E('root'), E('child')],
    relations: [R('root-free', 'FREE', 'root'), R('child-follow', 'RIGID_FOLLOW', 'child', ['root'])],
  });
  const followState = API.createAttachmentFollowState({
    attachmentSemantics,
    bindings: [{
      id: 'child-follow-state',
      relationId: 'child-follow',
      subjectId: 'child',
      ownerId: 'root',
      baselineOwnerFrame: I(),
      baselineSubjectFrame: I([0,1,0]),
      evidenceRefs: ['model/child-follow.json'],
    }],
  });
  const rootFrame = I();
  return {
    attachmentSemantics,
    surfaceAnchorSet: null,
    surfaces: [],
    followState,
    multiAnchorPlans: [],
    articulatedJoints: [],
    externalFrameBindings: [{
      entityId: 'root',
      stateDigest: D('c'),
      frameDigest: API.rigidFrameDigest(rootFrame),
      ownerFrameDigests: [],
      evidenceRefs: ['model/root-frame.json'],
    }],
  };
}

function controlIdentityGraph() {
  return API.createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
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
      {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['tx-drive']},
      {id: 'contains-runtime-controller', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-controller']},
      {id: 'contains-runtime-actuator', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['runtime-actuator']},
      {id: 'tx-drive-maps', kind: 'MAPS', sourceId: 'tx-drive', targetIds: ['actuator-drive','actuator-load']},
      {id: 'actuator-drive-drives', kind: 'DRIVES', sourceId: 'actuator-drive', targetIds: ['tx-drive']},
      {id: 'controller-main-commands-drive', kind: 'COMMANDS', sourceId: 'controller-main', targetIds: ['actuator-drive']},
      {id: 'runtime-binds-controller', kind: 'BINDS_RUNTIME', sourceId: 'runtime-controller', targetIds: ['controller-main']},
      {id: 'runtime-binds-actuator', kind: 'BINDS_RUNTIME', sourceId: 'runtime-actuator', targetIds: ['actuator-drive']},
    ],
  });
}

function transmissionFor(identityGraph) {
  return API.createTransmissionModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    transmissions: [{
      transmissionId: 'tx-drive',
      mapsRelationIds: ['tx-drive-maps'],
      contextMechanismIds: [],
      inputSpace: {id: 'drive-in', coordinates: [{id: 'drive-q', semanticIdentityId: 'actuator-drive'}], order: ['drive-q']},
      outputSpace: {id: 'drive-out', coordinates: [{id: 'load-q', semanticIdentityId: 'actuator-load'}], order: ['load-q']},
      mapping: {kind: 'RATIO', ratio: 2, offset: 0},
    }],
  });
}

function actuationFor(identityGraph, transmissionModel) {
  return API.createActuationModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    transmissionModel,
    actuators: [{
      actuatorId: 'actuator-drive',
      drivesRelationId: 'actuator-drive-drives',
      drivenTargetId: 'tx-drive',
      drivenTargetKind: 'transmission',
      kind: 'ROTARY_ELECTRIC',
      coordinateClass: 'ROTARY',
      supportedControlModes: {value: ['POSITION','EFFORT']},
      positionRange: {value: {kind: 'BOUNDED', minimum: -3.1, maximum: 3.1, unit: 'rad'}},
      velocityLimit: {value: {maxAbs: 8, unit: 'rad_s'}},
      effortLimit: {value: {maxAbs: 12, unit: 'N_m'}},
      stiffness: {value: null},
      damping: {value: {value: 0.05, unit: 'N_m_s_per_rad'}},
      armature: {value: {value: 0.001, unit: 'kg_m2'}},
      responseLatency: {value: {value: 0.002, unit: 's'}},
    }],
  });
}

function bundleFixture() {
  const identityGraph = API.createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0,0,0], rotation_quat_xyzw: [0,0,0,1]}},
      {id: 'part-a', kind: 'physical-part', frame: {parentId: 'module-root', translation_m: [0,0,0], rotation_quat_xyzw: [0,0,0,1]}},
    ],
    relations: [
      {id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'aggregate-part', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  });
  const dynamics = API.createRigidBodyDynamics({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    links: [{
      linkId: 'link-a',
      referenceFrameId: 'link-a',
      mass: {value_kg: 2.5},
      centerOfMass: {value_m: [0.01,0,0]},
      inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]},
    }],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = API.createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}

function allSupportedProfile(context, backend = 'refas-semantic-json') {
  const obligations = API.deriveRepresentationCapacityObligations(context);
  return API.createRepresentationCapacityProfile({
    profileId: `profile-${backend}`,
    backend,
    ...context,
    supported: obligations.map(({obligationId}) => ({obligationId})),
    approximated: [],
    unsupported: [],
    blockers: [],
  });
}

async function representationPipeline(context) {
  const capacityProfile = allSupportedProfile(context, 'refas-semantic-json');
  const adapter = API.createSemanticJsonExportAdapter();
  const exported = await API.runExportAdapter({exportId: 'alignment-export', adapter, capacityProfile, ...context});
  const normalizer = API.createSemanticJsonRepresentationNormalizer();
  const normalizedRepresentation = await API.runRepresentationNormalizer({
    normalizationId: 'alignment-normalized',
    normalizer,
    capacityProfile,
    manifest: exported.manifest,
    files: exported.files,
  });
  const validation = await API.createCrossRepresentationValidation({
    validationId: 'alignment-validation',
    capacityProfile,
    manifest: exported.manifest,
    files: exported.files,
    normalizedRepresentation,
    normalizer,
    ...context,
  });
  return {capacityProfile, normalizer, normalizedRepresentation, validation, manifest: exported.manifest, files: exported.files};
}

async function driftPipeline(context) {
  const capacityProfile = allSupportedProfile(context, 'refas-semantic-json');
  const adapter = API.createSemanticJsonExportAdapter();
  const exported = await API.runExportAdapter({exportId: 'alignment-drift-export', adapter, capacityProfile, ...context});
  const base = API.createSemanticJsonRepresentationNormalizer();
  const normalizer = Object.freeze({
    ...base,
    id: 'alignment-drift-normalizer',
    implementationDigest: D('f'),
    normalize(args) {
      const result = base.normalize(args);
      const mass = args.obligations.find((item) => item.semanticPath === 'dynamics.mass');
      return {
        readings: result.readings.map((item) => item.obligationId === mass?.obligationId ? {...item, value: 3.5} : item),
      };
    },
  });
  const normalizedRepresentation = await API.runRepresentationNormalizer({
    normalizationId: 'alignment-drift-normalized',
    normalizer,
    capacityProfile,
    manifest: exported.manifest,
    files: exported.files,
  });
  const validation = await API.createCrossRepresentationValidation({
    validationId: 'alignment-drift-validation',
    capacityProfile,
    manifest: exported.manifest,
    files: exported.files,
    normalizedRepresentation,
    normalizer,
    ...context,
  });
  const finding = validation.findings.find((item) => item.outcome === 'DRIFT');
  if (!finding) throw new Error('alignment drift fixture did not produce a DRIFT finding');
  const declaration = {
    findingId: finding.findingId,
    obligationId: finding.obligationId,
    targetBackend: validation.capacityBinding.backend,
    semanticPath: finding.semanticPath,
    subjectIds: [...finding.subjectIds],
    fieldPath: '',
    canonicalValue: finding.canonicalValue,
    overrideValue: finding.normalizedValue,
    reason: 'Alignment verifier intentionally exercises the public divergence contract.',
  };
  const subjectId = API.divergenceAuthoritySubjectId(validation.validationDigest, finding.findingId, '');
  const authoritySet = API.createSemanticAuthoritySet({
    scopeId: validation.scopeId,
    sourceSha256: context.identityGraph.sourceSha256,
    targetSchema: validation.schema,
    targetDigest: validation.validationDigest,
    entries: [{
      id: 'alignment-divergence-authority',
      subjectId,
      authority: 'engineered',
      proposition: 'This exact backend divergence is authorized for contract verification.',
      reason: 'A verifier-local downstream requirement intentionally exercises the declared-divergence path.',
      basis: [{kind: 'downstream-requirement', ref: 'backend:alignment-drift'}],
    }],
  });
  return {capacityProfile, normalizer, normalizedRepresentation, validation, manifest: exported.manifest, files: exported.files, declarations: [declaration], authoritySet};
}

function realizedAssemblyFixture() {
  const mesh = cube();
  const glb = API.partsToGlb({
    assetId: 'alignment-realized-assembly',
    parts: [{id: 'module-root-part', mesh, materialId: 'fixture', moduleRoot: true}],
    materials: {fixture: {baseColor: [0.6,0.6,0.6,1], metallic: 0, roughness: 0.5}},
  });
  return {
    glb,
    modules: [{id: 'module-root', rootPartId: 'module-root-part', partIds: ['module-root-part']}],
    attachments: [],
    objectIdEvidence: ['module-root-part'],
  };
}

function candidateFixture() {
  const candidateBytes = Buffer.from('alignment-candidate-bytes');
  const candidateSha256 = API.digestBytes(candidateBytes);
  const content = {
    schema: 'refas.checkpoint/v1',
    parentId: null,
    capability: 'rendering',
    scopeId: 'whole',
    reason: 'alignment candidate checkpoint',
    artifactRefs: [{kind: 'asset', path: 'candidate.bin', sha256: candidateSha256, sizeBytes: candidateBytes.length}],
    claims: [],
    gates: [],
    metadata: {},
    transactionId: null,
  };
  const contentDigest = API.digestJson(content);
  const checkpoint = {...content, id: `cp_${contentDigest.slice(0,20)}`, createdAt: '2026-09-19T00:00:00.000Z', contentDigest};
  const evidenceBytes = Buffer.from(JSON.stringify({schema: 'refas.fixture-evidence/v1', candidateSha256}));
  const evidence = [{
    id: 'fixture-evidence',
    role: 'fixture-evidence',
    schema: 'refas.fixture-evidence/v1',
    bytes: evidenceBytes,
    subjectPointer: '/candidateSha256',
  }];
  return {
    candidateBytes,
    checkpoint,
    evidence,
    decisionNodeIds: ['fixture-evidence'],
    obligations: [{id: 'fixture-evidence', role: 'fixture-evidence', schema: 'refas.fixture-evidence/v1', minCount: 1}],
    evidenceBytesById: {'fixture-evidence': evidenceBytes},
  };
}

export async function createCapabilityAlignmentContext() {
  const fusion = fusionFixture();
  const surface = surfaceFixture();
  const multi = multiFixture();
  const articulated = articulatedFixture();
  const clearance = clearanceFixture();
  const propagation = propagationFixture();

  const controlIdentity = controlIdentityGraph();
  const transmissionModel = transmissionFor(controlIdentity);
  const actuationModel = actuationFor(controlIdentity, transmissionModel);

  const bundle = bundleFixture();
  const representation = await representationPipeline(bundle);
  const drift = await driftPipeline(bundle);
  const realizedAssembly = realizedAssemblyFixture();
  const candidate = candidateFixture();

  return {
    sourceSha256: D(),
    fusion,
    surface,
    multi,
    articulated,
    clearance,
    propagation,
    control: {identityGraph: controlIdentity, transmissionModel, actuationModel},
    bundle,
    representation,
    drift,
    realizedAssembly,
    candidate,
  };
}

export function fixtureForCapabilityInterface(key, context, outputs = new Map()) {
  const values = {sourceSha256: context.sourceSha256};
  const bindings = {};
  let validatorArgs = () => [];

  if (key === 'observation/visual-observation') {
    bindings.hierarchy = outputs.get('observation/visual-hierarchy');
    validatorArgs = (_output, input) => [input.hierarchy];
  } else if (key === 'spatial-reasoning/projection-fit') {
    bindings.referenceGeometry = outputs.get('observation/reference-geometry');
  } else if (key === 'inference-authority/semantic-authority') {
    const target = outputs.get('relational-structure/relational-structure');
    values.targetSchema = target.schema;
    values.targetDigest = target.structureDigest;
  } else if (key === 'whole-system-relational-barrier/relational-barrier') {
    bindings.relationalStructure = outputs.get('relational-structure/relational-structure');
    bindings.authoritySet = outputs.get('inference-authority/semantic-authority');
    validatorArgs = (_output, input) => [{relationalStructure: input.relationalStructure, authoritySet: input.authoritySet}];
  } else if (key === 'logical-fusion/logical-fusion') {
    bindings.fusionAttachmentSemantics = context.fusion.attachmentSemantics;
    validatorArgs = (_output, input) => [input.attachmentSemantics];
  } else if (key === 'logical-fusion/logical-fusion-invalidation') {
    bindings.fusionAttachmentSemantics = context.fusion.attachmentSemantics;
    bindings.logicalFusion = outputs.get('logical-fusion/logical-fusion');
    validatorArgs = (_output, input) => [input.logicalFusion, input.attachmentSemantics];
  } else if (key === 'surface-anchor-frames/surface-anchor-set') {
    bindings.surfaceAttachmentSemantics = context.surface.attachmentSemantics;
    bindings.surfaceDescriptors = context.surface.surfaces;
    validatorArgs = (_output, input) => [input.attachmentSemantics, input.surfaces];
  } else if (key === 'attachment-follow/attachment-follow-state') {
    bindings.surfaceAttachmentSemantics = context.surface.attachmentSemantics;
    bindings.surfaceAnchorSet = context.surface.surfaceAnchorSet;
    bindings.surfaceDescriptors = context.surface.surfaces;
    validatorArgs = (_output, input) => [{attachmentSemantics: input.attachmentSemantics, surfaceAnchorSet: input.surfaceAnchorSet, surfaces: input.surfaces}];
  } else if (key === 'multi-anchor-solver/multi-anchor-plan') {
    bindings.multiAttachmentSemantics = context.multi.attachmentSemantics;
    validatorArgs = (_output, input) => [input.attachmentSemantics];
  } else if (key === 'articulation-clearance/articulated-joint') {
    bindings.articulatedAttachmentSemantics = context.articulated.attachmentSemantics;
    validatorArgs = (_output, input) => [input.attachmentSemantics];
  } else if (key === 'articulation-clearance/supported-clearance') {
    bindings.clearanceAttachmentSemantics = context.clearance.attachmentSemantics;
    validatorArgs = (_output, input) => [input.attachmentSemantics];
  } else if (key === 'attachment-propagation/attachment-propagation-plan') {
    bindings.propagationAttachmentSemantics = context.propagation.attachmentSemantics;
    bindings.propagationSurfaceAnchorSet = context.propagation.surfaceAnchorSet;
    bindings.propagationSurfaces = context.propagation.surfaces;
    bindings.propagationFollowState = context.propagation.followState;
    bindings.propagationMultiAnchorPlans = context.propagation.multiAnchorPlans;
    bindings.propagationArticulatedJoints = context.propagation.articulatedJoints;
    bindings.propagationExternalFrameBindings = context.propagation.externalFrameBindings;
    validatorArgs = (_output, input) => [{
      attachmentSemantics: input.attachmentSemantics,
      surfaceAnchorSet: input.surfaceAnchorSet,
      surfaces: input.surfaces,
      followState: input.followState,
      multiAnchorPlans: input.multiAnchorPlans,
      articulatedJoints: input.articulatedJoints,
    }];
  } else if (key === 'assembly/realized-assembly-proof') {
    Object.assign(bindings, {
      realizedAssemblyGlb: context.realizedAssembly.glb,
      realizedAssemblyModules: context.realizedAssembly.modules,
      realizedAssemblyAttachments: context.realizedAssembly.attachments,
      realizedAssemblyObjectIds: context.realizedAssembly.objectIdEvidence,
    });
  } else if (key === 'transmission-model/transmission-model') {
    bindings.physicalIdentityGraph = context.control.identityGraph;
  } else if (key === 'actuation-model/actuation-model') {
    bindings.physicalIdentityGraph = context.control.identityGraph;
    bindings.transmissionModel = context.control.transmissionModel;
  } else if (key === 'control-profile/control-profile') {
    bindings.controlIdentityGraph = context.control.identityGraph;
    bindings.controlActuationModel = context.control.actuationModel;
    bindings.controlTransmissionModel = context.control.transmissionModel;
  } else if (key === 'runtime-binding/runtime-binding') {
    bindings.runtimeIdentityGraph = context.control.identityGraph;
    bindings.runtimeActuationModel = context.control.actuationModel;
    bindings.runtimeTransmissionModel = context.control.transmissionModel;
  } else if (key === 'physical-asset-bundle/physical-asset-bundle') {
    bindings.bundleIdentityGraph = context.bundle.identityGraph;
    bindings.bundleComponents = context.bundle.components;
  } else if (key === 'representation-capacity/representation-capacity-profile') {
    Object.assign(bindings, {
      bundle: context.bundle.bundle,
      bundleIdentityGraph: context.bundle.identityGraph,
      bundleComponents: context.bundle.components,
      capacitySupported: context.representation.capacityProfile.supported,
      capacityApproximated: context.representation.capacityProfile.approximated,
      capacityUnsupported: context.representation.capacityProfile.unsupported,
    });
  } else if (key === 'backend-export/canonical-export-view') {
    bindings.bundle = context.bundle.bundle;
    bindings.bundleIdentityGraph = context.bundle.identityGraph;
    bindings.bundleComponents = context.bundle.components;
  } else if (key === 'cross-representation-validation/cross-representation-validation') {
    Object.assign(bindings, {
      capacityProfile: context.representation.capacityProfile,
      exportManifest: context.representation.manifest,
      exportFiles: context.representation.files,
      normalizedRepresentation: context.representation.normalizedRepresentation,
      representationNormalizer: context.representation.normalizer,
      bundle: context.bundle.bundle,
      bundleIdentityGraph: context.bundle.identityGraph,
      bundleComponents: context.bundle.components,
    });
  } else if (key === 'divergence-authorization/divergence-authorization') {
    Object.assign(bindings, {
      crossValidation: context.drift.validation,
      divergenceDeclarations: context.drift.declarations,
      divergenceAuthoritySet: context.drift.authoritySet,
      capacityProfile: context.drift.capacityProfile,
      exportManifest: context.drift.manifest,
      exportFiles: context.drift.files,
      normalizedRepresentation: context.drift.normalizedRepresentation,
      representationNormalizer: context.drift.normalizer,
      bundle: context.bundle.bundle,
      bundleIdentityGraph: context.bundle.identityGraph,
      bundleComponents: context.bundle.components,
    });
  } else if (key === 'physical-claims/physical-claim-evidence') {
    Object.assign(bindings, {
      bundle: context.bundle.bundle,
      bundleIdentityGraph: context.bundle.identityGraph,
      bundleComponents: context.bundle.components,
      crossValidation: context.representation.validation,
      capacityProfile: context.representation.capacityProfile,
      exportManifest: context.representation.manifest,
      exportFiles: context.representation.files,
      normalizedRepresentation: context.representation.normalizedRepresentation,
      representationNormalizer: context.representation.normalizer,
    });
  } else if (key === 'physical-fusion/physical-fusion-plan') {
    bindings.fusionAttachmentSemantics = context.fusion.attachmentSemantics;
    bindings.logicalFusion = outputs.get('logical-fusion/logical-fusion') ?? context.fusion.logicalFusion;
    bindings.fusionCanonicalEditIntent = context.fusion.canonicalEditIntent;
    bindings.fusionMembers = context.fusion.members;
    validatorArgs = (_output, input) => [{attachmentSemantics: input.attachmentSemantics, logicalFusion: input.logicalFusion, canonicalEditIntent: input.canonicalEditIntent}];
  } else if (key === 'realized-contact-support/realized-contact-plan') {
    const semantics = API.createAttachmentSemantics({
      scopeId: 'support-stack',
      sourceSha256: D(),
      entities: [E('base'),E('leg'),E('body')],
      relations: [R('base-free','FREE','base'),R('leg-follow','RIGID_FOLLOW','leg',['base']),R('body-follow','RIGID_FOLLOW','body',['leg'])],
    });
    bindings.contactAttachmentSemantics = semantics;
    validatorArgs = (_output, input) => [input.attachmentSemantics];
  } else if (key === 'validation/projection-aware-visual-review') {
    bindings.projectionFit = outputs.get('spatial-reasoning/projection-fit');
  } else if (key === 'candidate-transactions/candidate-transaction') {
    Object.assign(bindings, {
      candidateBytes: context.candidate.candidateBytes,
      candidateCheckpoint: context.candidate.checkpoint,
      candidateEvidence: context.candidate.evidence,
      candidateDecisionNodeIds: context.candidate.decisionNodeIds,
      candidateObligations: context.candidate.obligations,
    });
    validatorArgs = () => [{
      candidateBytes: context.candidate.candidateBytes,
      checkpoint: context.candidate.checkpoint,
      evidenceBytesById: context.candidate.evidenceBytesById,
    }];
  }

  if (key === 'validation/visual-review' || key === 'validation/projection-aware-visual-review') {
    values.sourceSha256 = outputs.get('observation/reference-geometry')?.sourceSha256 ?? D();
  }

  return {bindings, values, validatorArgs};
}

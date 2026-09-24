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
    realizationOperations: ['mesh-fuse', 'mesh-weld', 'internal-face-cleanup', 'mesh-optimize'],
    evidenceRefs: ['reviews/head-ready.json'],
    intent: 'Finalize a closed logical fusion group.',
  });
  const frame = I();
  const sourceMembers = [
    {memberId: 'head-shell', mesh: cube(-1, 0)},
    {memberId: 'fused-child', mesh: cube(0, 1)},
  ];
  const members = sourceMembers.map(({memberId, mesh}) => ({
    memberId,
    geometryDigest: API.physicalFusionGeometryDigest(mesh),
    frameDigest: API.physicalFusionFrameDigest(frame),
    materialRegionId: 'fixture',
    evidenceRefs: [`model/${memberId}.json`],
  }));
  const realizedMembers = sourceMembers.map(({memberId, mesh}) => ({memberId, mesh, worldFrame: frame}));
  return {attachmentSemantics, logicalFusion, canonicalEditIntent, members, realizedMembers};
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
    entities: [E('head-shell'), E('nose'), E('left-ear'), E('right-ear'), E('glasses')],
    relations: [
      R('head-free', 'FREE', 'head-shell'),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      R('left-ear-fused', 'FUSED', 'left-ear', ['head-shell']),
      R('right-ear-fused', 'FUSED', 'right-ear', ['head-shell']),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose','left-ear','right-ear']),
    ],
  });
  const surfaces = [
    {ownerId:'nose',geometryDigest:D('b'),vertices:[[-.2,-.2,0],[.2,-.2,0],[0,.2,0]],triangles:[{id:'nose-tri',patchId:'nose-bridge',indices:[0,1,2]}]},
    {ownerId:'left-ear',geometryDigest:D('c'),vertices:[[-1.2,.8,0],[-.8,.8,0],[-1,1.2,0]],triangles:[{id:'left-tri',patchId:'left-contact',indices:[0,1,2]}]},
    {ownerId:'right-ear',geometryDigest:D('d'),vertices:[[.8,.8,0],[1.2,.8,0],[1,1.2,0]],triangles:[{id:'right-tri',patchId:'right-contact',indices:[0,1,2]}]},
  ];
  const surfaceAnchorSet = API.createSurfaceAnchorSet({attachmentSemantics,surfaces,anchors:[
    {id:'bridge-target',relationId:'glasses-fit',subjectAnchorId:'bridge',ownerId:'nose',patchId:'nose-bridge',triangleId:'nose-tri',barycentric:[.25,.25,.5],tangentHint:[1,0,0],offset:0,maxRebindDistance:.3,maxNormalDeviationRadians:.5,evidenceRefs:['model/bridge.json']},
    {id:'left-target',relationId:'glasses-fit',subjectAnchorId:'left-temple',ownerId:'left-ear',patchId:'left-contact',triangleId:'left-tri',barycentric:[.25,.25,.5],tangentHint:[1,0,0],offset:0,maxRebindDistance:.3,maxNormalDeviationRadians:.5,evidenceRefs:['model/left.json']},
    {id:'right-target',relationId:'glasses-fit',subjectAnchorId:'right-temple',ownerId:'right-ear',patchId:'right-contact',triangleId:'right-tri',barycentric:[.25,.25,.5],tangentHint:[1,0,0],offset:0,maxRebindDistance:.3,maxNormalDeviationRadians:.5,evidenceRefs:['model/right.json']},
  ]});
  const ownerWorldFrames=['nose','left-ear','right-ear'].map((entityId)=>({entityId,frame:I()}));
  return {attachmentSemantics,surfaces,surfaceAnchorSet,ownerWorldFrames};
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
  const attachmentSemantics = API.createAttachmentSemantics({
    scopeId: 'spaced-panel',
    sourceSha256: D(),
    entities: [E('housing'), E('bracket'), E('panel')],
    relations: [
      R('housing-free', 'FREE', 'housing'),
      R('bracket-follow', 'RIGID_FOLLOW', 'bracket', ['housing']),
      R('panel-clearance', 'SUPPORTED_CLEARANCE', 'panel', ['bracket']),
    ],
  });
  const payload={schema:'refas.realized-assembly-proof/v1',valid:true,errors:[],moduleChecks:[],attachmentChecks:[
    {id:'panel-bracket-support',childModuleId:'panel',parentModuleId:'bracket',pass:true,supportDerivedFromContact:true,penetrationDepth:0,signedClearance:0},
    {id:'bracket-housing-support',childModuleId:'bracket',parentModuleId:'housing',pass:true,supportDerivedFromContact:true,penetrationDepth:0,signedClearance:0},
    {id:'panel-housing-gap',childModuleId:'panel',parentModuleId:'housing',pass:true,supportDerivedFromContact:true,penetrationDepth:0,signedClearance:.1},
  ],immutableChildChecks:[],objectIdCheck:{partIds:[],pass:true},metrics:{modules:0,nestedLevels:0,attachments:3,failures:0}};
  return {attachmentSemantics,realizedProof:{...payload,proofDigest:API.digestJson(payload)}};
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

function contactFixture() {
  const attachmentSemantics=API.createAttachmentSemantics({
    scopeId:'support-stack',sourceSha256:D(),
    entities:[E('base'),E('leg'),E('body')],
    relations:[R('base-free','FREE','base'),R('leg-follow','RIGID_FOLLOW','leg',['base']),R('body-follow','RIGID_FOLLOW','body',['leg'])],
  });
  const glb=API.partsToGlb({
    assetId:'alignment-contact',
    parts:[{id:'base',mesh:cube(),materialId:'fixture'},{id:'leg',mesh:cube(),materialId:'fixture'},{id:'body',mesh:cube(),materialId:'fixture'}],
    materials:{fixture:{baseColor:[.5,.5,.5,1],metallic:0,roughness:.5}},
  });
  return {attachmentSemantics,glb};
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

function neutralClayAlignmentReport(assetSha256) {
  return API.createPbrRenderReport({
    assetSha256,
    frameDigest: D('f'),
    renderer: {
      family: 'other',
      name: 'RefAs Independent PBR',
      version: '1.0.0',
      backend: 'numpy-cook-torrance-headless',
      independentProcess: true,
    },
    lighting: {
      rigId: API.NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,
      digest: API.NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
    },
    colorPipeline: {...API.NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport: {
      supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupported: ['textures'],
    },
    outputs: API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS.map((viewId, index) => ({
      viewId,
      path: `renders/clay/${viewId}.png`,
      sha256: D(String((index % 8) + 1)),
    })),
    reproducibility: {mode: 'deterministic', tolerance: ''},
    presentation: {
      mode: 'neutral-clay',
      presetId: API.NEUTRAL_CLAY_PRESENTATION_PRESET.id,
      presetDigest: API.NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
    },
  });
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
  const contact = contactFixture();

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
    contact,
  };
}

export function fixtureForCapabilityInterface(key, context, outputs = new Map()) {
  const values = {sourceSha256: context.sourceSha256};
  const bindings = {};

  if (key === 'observation/perceptual-signature-set') {
    bindings.perceptualSignatureHierarchy = outputs.get('observation/visual-hierarchy');
  } else if (key === 'observation/visual-observation') {
    bindings.hierarchy = outputs.get('observation/visual-hierarchy');
  } else if (key === 'spatial-reasoning/spatial-role-expectation-set') {
    bindings.spatialRoleHierarchy = outputs.get('observation/visual-hierarchy');
  } else if (key === 'spatial-reasoning/spatial-closure-evidence') {
    bindings.spatialClosureGlb = context.realizedAssembly.glb;
  } else if (key === 'spatial-reasoning/projection-fit') {
    bindings.referenceGeometry = outputs.get('observation/reference-geometry');
  } else if (key === 'inference-authority/semantic-authority') {
    const target = outputs.get('relational-structure/relational-structure');
    values.targetSchema = target.schema;
    values.targetDigest = target.structureDigest;
  } else if (key === 'whole-system-relational-barrier/relational-barrier') {
    bindings.relationalStructure = outputs.get('relational-structure/relational-structure');
    bindings.authoritySet = outputs.get('inference-authority/semantic-authority');
  } else if (key === 'logical-fusion/logical-fusion') {
    bindings.fusionAttachmentSemantics = context.fusion.attachmentSemantics;
  } else if (key === 'logical-fusion/logical-fusion-invalidation') {
    bindings.fusionAttachmentSemantics = context.fusion.attachmentSemantics;
    bindings.logicalFusion = outputs.get('logical-fusion/logical-fusion');
  } else if (key === 'surface-anchor-frames/surface-anchor-set') {
    bindings.surfaceAttachmentSemantics = context.surface.attachmentSemantics;
    bindings.surfaceDescriptors = context.surface.surfaces;
  } else if (key === 'surface-anchor-frames/rebind-surface-anchor-set') {
    bindings.surfaceAnchorSet = context.surface.surfaceAnchorSet;
    bindings.surfaceAttachmentSemantics = context.surface.attachmentSemantics;
    bindings.surfaceDescriptors = context.surface.surfaces;
  } else if (key === 'attachment-follow/attachment-follow-state') {
    bindings.surfaceAttachmentSemantics = context.surface.attachmentSemantics;
    bindings.surfaceAnchorSet = context.surface.surfaceAnchorSet;
    bindings.surfaceDescriptors = context.surface.surfaces;
  } else if (key === 'attachment-follow/propagate-attachment-follow') {
    Object.assign(bindings,{
      propagationFollowState:context.propagation.followState,
      propagationAttachmentSemantics:context.propagation.attachmentSemantics,
      propagationSurfaceAnchorSet:context.propagation.surfaceAnchorSet,
      propagationSurfaces:context.propagation.surfaces,
      propagationOwnerWorldFrames:[{entityId:'root',stateDigest:D('c'),frame:I()}],
    });
  } else if (key === 'multi-anchor-solver/multi-anchor-plan') {
    bindings.multiAttachmentSemantics = context.multi.attachmentSemantics;
  } else if (key === 'multi-anchor-solver/solve-multi-anchor') {
    Object.assign(bindings,{
      multiAnchorPlan:outputs.get('multi-anchor-solver/multi-anchor-plan'),
      multiAttachmentSemantics:context.multi.attachmentSemantics,
      multiSurfaceAnchorSet:context.multi.surfaceAnchorSet,
      multiSurfaces:context.multi.surfaces,
      multiOwnerWorldFrames:context.multi.ownerWorldFrames,
    });
  } else if (key === 'articulation-clearance/articulated-joint') {
    bindings.articulatedAttachmentSemantics = context.articulated.attachmentSemantics;
  } else if (key === 'articulation-clearance/evaluate-articulated-joint') {
    bindings.articulatedJoint=outputs.get('articulation-clearance/articulated-joint');
    bindings.articulatedAttachmentSemantics=context.articulated.attachmentSemantics;
    bindings.articulatedOwnerWorldFrame=I([2,3,4]);
  } else if (key === 'articulation-clearance/supported-clearance') {
    bindings.clearanceAttachmentSemantics = context.clearance.attachmentSemantics;
  } else if (key === 'articulation-clearance/evaluate-supported-clearance') {
    bindings.supportedClearanceContract=outputs.get('articulation-clearance/supported-clearance');
    bindings.clearanceAttachmentSemantics=context.clearance.attachmentSemantics;
    bindings.clearanceRealizedProof=context.clearance.realizedProof;
  } else if (key === 'attachment-propagation/attachment-propagation-plan') {
    Object.assign(bindings,{
      propagationAttachmentSemantics:context.propagation.attachmentSemantics,
      propagationSurfaceAnchorSet:context.propagation.surfaceAnchorSet,
      propagationSurfaces:context.propagation.surfaces,
      propagationFollowState:context.propagation.followState,
      propagationMultiAnchorPlans:context.propagation.multiAnchorPlans,
      propagationArticulatedJoints:context.propagation.articulatedJoints,
      propagationExternalFrameBindings:context.propagation.externalFrameBindings,
    });
  } else if (key === 'attachment-propagation/propagate-attachment-graph') {
    Object.assign(bindings,{
      attachmentPropagationPlan:outputs.get('attachment-propagation/attachment-propagation-plan'),
      propagationAttachmentSemantics:context.propagation.attachmentSemantics,
      propagationSurfaceAnchorSet:context.propagation.surfaceAnchorSet,
      propagationSurfaces:context.propagation.surfaces,
      propagationFollowState:context.propagation.followState,
      propagationMultiAnchorPlans:context.propagation.multiAnchorPlans,
      propagationArticulatedJoints:context.propagation.articulatedJoints,
      propagationOwnerWorldFrames:[{entityId:'root',stateDigest:D('c'),frame:I()}],
    });
  } else if (key === 'assembly/realized-assembly-proof') {
    Object.assign(bindings,{realizedAssemblyGlb:context.realizedAssembly.glb,realizedAssemblyModules:context.realizedAssembly.modules,realizedAssemblyAttachments:context.realizedAssembly.attachments,realizedAssemblyObjectIds:context.realizedAssembly.objectIdEvidence});
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
    Object.assign(bindings,{bundle:context.bundle.bundle,bundleIdentityGraph:context.bundle.identityGraph,bundleComponents:context.bundle.components,capacitySupported:context.representation.capacityProfile.supported,capacityApproximated:context.representation.capacityProfile.approximated,capacityUnsupported:context.representation.capacityProfile.unsupported});
  } else if (key === 'backend-export/canonical-export-view') {
    bindings.bundle=context.bundle.bundle; bindings.bundleIdentityGraph=context.bundle.identityGraph; bindings.bundleComponents=context.bundle.components;
  } else if (key === 'backend-export/run-export-adapter') {
    Object.assign(bindings,{publicExportAdapter:API.createSemanticJsonExportAdapter(),capacityProfile:context.representation.capacityProfile,bundle:context.bundle.bundle,bundleIdentityGraph:context.bundle.identityGraph,bundleComponents:context.bundle.components});
  } else if (key === 'representation-normalizer/run-representation-normalizer') {
    Object.assign(bindings,{representationNormalizer:context.representation.normalizer,capacityProfile:context.representation.capacityProfile,exportManifest:context.representation.manifest,exportFiles:context.representation.files});
  } else if (key === 'cross-representation-validation/cross-representation-validation') {
    Object.assign(bindings,{capacityProfile:context.representation.capacityProfile,exportManifest:context.representation.manifest,exportFiles:context.representation.files,normalizedRepresentation:context.representation.normalizedRepresentation,representationNormalizer:context.representation.normalizer,bundle:context.bundle.bundle,bundleIdentityGraph:context.bundle.identityGraph,bundleComponents:context.bundle.components});
  } else if (key === 'divergence-authorization/divergence-authorization') {
    Object.assign(bindings,{crossValidation:context.drift.validation,divergenceDeclarations:context.drift.declarations,divergenceAuthoritySet:context.drift.authoritySet,capacityProfile:context.drift.capacityProfile,exportManifest:context.drift.manifest,exportFiles:context.drift.files,normalizedRepresentation:context.drift.normalizedRepresentation,representationNormalizer:context.drift.normalizer,bundle:context.bundle.bundle,bundleIdentityGraph:context.bundle.identityGraph,bundleComponents:context.bundle.components});
  } else if (key === 'physical-claims/physical-claim-evidence') {
    Object.assign(bindings,{bundle:context.bundle.bundle,bundleIdentityGraph:context.bundle.identityGraph,bundleComponents:context.bundle.components,crossValidation:context.representation.validation,capacityProfile:context.representation.capacityProfile,exportManifest:context.representation.manifest,exportFiles:context.representation.files,normalizedRepresentation:context.representation.normalizedRepresentation,representationNormalizer:context.representation.normalizer});
  } else if (key === 'physical-claims/evaluate-physical-claim') {
    const evidence=outputs.get('physical-claims/physical-claim-evidence');
    const policy=outputs.get('physical-claims/physical-claim-policy');
    const candidate=Buffer.from('alignment-physical-claim-candidate');
    const candidateSha256=API.digestBytes(candidate);
    const evidenceBytes=Buffer.from(`${JSON.stringify(evidence)}\n`);
    const nodeId='physical-claim-evidence';
    const anchorDocument={schema:'refas.fixture-physical-claim-anchor/v1',candidateSha256,physicalClaimSha256:API.digestBytes(evidenceBytes)};
    const anchorBytes=Buffer.from(JSON.stringify(anchorDocument));
    const content={schema:'refas.checkpoint/v1',parentId:null,capability:'whole-object-certification',scopeId:'whole',reason:'alignment physical claim',artifactRefs:[{kind:'asset',path:'candidate.bin',sha256:candidateSha256,sizeBytes:candidate.length}],claims:[],gates:[],metadata:{},transactionId:null};
    const contentDigest=API.digestJson(content);
    const checkpoint={...content,id:`cp_${contentDigest.slice(0,20)}`,createdAt:'2026-09-19T00:00:00.000Z',contentDigest};
    const transaction=API.createCandidateTransaction({candidateBytes:candidate,checkpoint,evidence:[
      {id:'candidate-anchor',role:'candidate-anchor',schema:anchorDocument.schema,bytes:anchorBytes,subjectPointer:'/candidateSha256'},
      {id:nodeId,role:API.physicalClaimEvidenceRole(evidence.claimId),schema:API.PHYSICAL_CLAIM_EVIDENCE_SCHEMA,bytes:evidenceBytes,dependencies:[{nodeId:'candidate-anchor',proof:{kind:'json-pointer-artifact-sha256',holder:'dependency',pointer:'/physicalClaimSha256'}}]},
    ],decisionNodeIds:[nodeId],obligations:[{id:'physical-claim-obligation',role:API.physicalClaimEvidenceRole(evidence.claimId),schema:API.PHYSICAL_CLAIM_EVIDENCE_SCHEMA}]});
    Object.assign(bindings,{
      physicalClaimTransaction:transaction,physicalClaimPolicy:policy,
      physicalClaimEvidenceBytesById:{'candidate-anchor':anchorBytes,[nodeId]:evidenceBytes},
      physicalClaimContextsByNodeId:{[nodeId]:{bundle:context.bundle.bundle,identityGraph:context.bundle.identityGraph,components:context.bundle.components,validation:context.representation.validation,capacityProfile:context.representation.capacityProfile,manifest:context.representation.manifest,files:context.representation.files,normalizedRepresentation:context.representation.normalizedRepresentation,normalizer:context.representation.normalizer}},
    });
  } else if (key === 'physical-fusion/physical-fusion-plan') {
    bindings.fusionAttachmentSemantics=context.fusion.attachmentSemantics; bindings.logicalFusion=outputs.get('logical-fusion/logical-fusion')??context.fusion.logicalFusion; bindings.fusionCanonicalEditIntent=context.fusion.canonicalEditIntent; bindings.fusionMembers=context.fusion.members;
  } else if (key === 'physical-fusion/bake-physical-fusion') {
    bindings.physicalFusionPlan=outputs.get('physical-fusion/physical-fusion-plan'); bindings.fusionAttachmentSemantics=context.fusion.attachmentSemantics; bindings.logicalFusion=outputs.get('logical-fusion/logical-fusion')??context.fusion.logicalFusion; bindings.fusionCanonicalEditIntent=context.fusion.canonicalEditIntent; bindings.fusionRealizedMembers=context.fusion.realizedMembers;
  } else if (key === 'realized-contact-support/realized-contact-plan') {
    bindings.contactAttachmentSemantics=context.contact.attachmentSemantics; values.contactAssetSha256=API.digestBytes(context.contact.glb);
  } else if (key === 'realized-contact-support/analyze-realized-contact') {
    bindings.realizedContactPlan=outputs.get('realized-contact-support/realized-contact-plan'); bindings.contactAttachmentSemantics=context.contact.attachmentSemantics; bindings.contactGlb=context.contact.glb;
  } else if (key === 'parameter-fitting/fit-parameters') {
    const plan=outputs.get('parameter-fitting/parameter-fit-plan');
    bindings.parameterFitPlan=plan;
    bindings.parameterFitEvaluator=async (parameters,run)=>({measurements:Object.fromEntries(plan.objectives.map((objective)=>[objective.id,Math.abs(parameters.span-1)+Math.abs(parameters.bend)])),candidateAsset:plan.baselineAsset,renderEvidence:{schema:'refas.content-reference/v1',kind:'render-report',path:`trials/${run.trialId}/render.json`,sha256:API.digestBytes(`render-${run.trialId}`),sizeBytes:Buffer.byteLength(`render-${run.trialId}`)},evidenceRefs:[`trials/${run.trialId}/hero.png`]});
    bindings.parameterFitVerifyReference=async()=>true;
  } else if (key === 'validation/perceptual-signature-evidence') {
    bindings.perceptualSignatureSet=outputs.get('observation/perceptual-signature-set');
    values.assetSha256=API.digestBytes(context.candidate.candidateBytes);
  } else if (key === 'validation/early-resemblance-barrier') {
    const priorSignatureEvidence=outputs.get('validation/perceptual-signature-evidence');
    const assetSha256=API.digestBytes(context.candidate.candidateBytes);
    const clayReport=neutralClayAlignmentReport(assetSha256);
    const clayHero=clayReport.outputs.find((output)=>output.viewId==='hero')?.path;
    if (!clayHero) throw new Error('alignment neutral-clay report is missing hero output');
    const signatureEvidence=API.createPerceptualSignatureEvidence({
      signatureSet: priorSignatureEvidence.signatureSet,
      assetSha256,
      observations: priorSignatureEvidence.observations.map((observation)=>({
        signatureId:observation.signatureId,
        status:observation.status,
        candidateObservation:observation.candidateObservation,
        comparisonConclusion:observation.comparisonConclusion,
        evidenceRefs:[...new Set([...(observation.evidenceRefs??[]),clayHero])],
      })),
      evidenceRefs:[...new Set([...(priorSignatureEvidence.evidenceRefs??[]),clayHero])],
    });
    bindings.earlyResemblanceSignatureEvidence=signatureEvidence;
    bindings.earlyResemblanceClayRenderReport=clayReport;
    values.sourceSha256=signatureEvidence.sourceSha256;
    values.hierarchyDigest=signatureEvidence.hierarchyDigest;
    values.assetSha256=assetSha256;
  } else if (key === 'validation/final-resemblance-closure') {
    const priorSignatureEvidence=outputs.get('validation/perceptual-signature-evidence');
    const assetSha256=API.digestBytes(context.candidate.candidateBytes);
    const clayReport=neutralClayAlignmentReport(assetSha256);
    const clayHero=clayReport.outputs.find((output)=>output.viewId==='hero')?.path;
    if (!clayHero) throw new Error('alignment final neutral-clay report is missing hero output');
    const signatureEvidence=API.createPerceptualSignatureEvidence({
      signatureSet:priorSignatureEvidence.signatureSet,
      assetSha256,
      observations:priorSignatureEvidence.observations.map((observation)=>({
        signatureId:observation.signatureId,
        status:['macro','identity'].includes(observation.importance)?'match':observation.status,
        candidateObservation:`Final candidate was rechecked for ${observation.signatureId}.`,
        comparisonConclusion:['macro','identity'].includes(observation.importance)
          ? 'The final neutral-clay evidence matches the required source signature.'
          : observation.comparisonConclusion,
        evidenceRefs:[...new Set([...(observation.evidenceRefs??[]),clayHero])],
      })),
      evidenceRefs:[...new Set([...(priorSignatureEvidence.evidenceRefs??[]),clayHero])],
    });
    bindings.finalResemblanceSignatureEvidence=signatureEvidence;
    bindings.finalResemblanceClayRenderReport=clayReport;
    values.finalResemblanceSourceSha256=signatureEvidence.sourceSha256;
    values.finalResemblanceHierarchyDigest=signatureEvidence.hierarchyDigest;
    values.finalResemblanceAssetSha256=assetSha256;
  } else if (key === 'validation/projection-aware-visual-review') {
    bindings.projectionFit=outputs.get('spatial-reasoning/projection-fit');
  } else if (key === 'candidate-transactions/candidate-transition') {
    values.candidateTransitionInputSha256='1'.repeat(64);
    values.candidateTransitionOutputSha256='2'.repeat(64);
    values.candidateTransitionInputCheckpointId='cp_shape_candidate';
    values.candidateTransitionParentCheckpointId='cp_parent';
    values.candidateTransitionCapability='surface-topology';
    values.candidateTransitionScopeId='whole';
  } else if (key === 'candidate-transactions/candidate-lineage-proof') {
    values.candidateLineageSourceSha256='0'.repeat(64);
    values.candidateLineageInitialSha256='1'.repeat(64);
    values.candidateLineageInitialCheckpointId='cp_shape_candidate';
    values.candidateLineageFinalSha256='1'.repeat(64);
    values.candidateLineageFinalCheckpointId='cp_shape_candidate';
    bindings.candidateLineageTransitions=[];
  } else if (key === 'candidate-transactions/candidate-transaction') {
    Object.assign(bindings,{candidateBytes:context.candidate.candidateBytes,candidateCheckpoint:context.candidate.checkpoint,candidateEvidence:context.candidate.evidence,candidateDecisionNodeIds:context.candidate.decisionNodeIds,candidateObligations:context.candidate.obligations,candidateValidationContext:{candidateBytes:context.candidate.candidateBytes,checkpoint:context.candidate.checkpoint,evidenceBytesById:context.candidate.evidenceBytesById}});
  } else if (key === 'claim-certification/evaluate-certification-policy') {
    bindings.genericCertificationTransaction=outputs.get('candidate-transactions/candidate-transaction');
    bindings.genericCertificationPolicy=outputs.get('claim-certification/certification-policy');
    bindings.genericCertificationEvidenceBytesById=context.candidate.evidenceBytesById;
  }

  if (key === 'validation/visual-review' || key === 'validation/projection-aware-visual-review') values.sourceSha256=outputs.get('observation/reference-geometry')?.sourceSha256??D();
  return {bindings,values};
}

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  analyzeMesh,
  appendPartsToClosedGlb,
  createCurvedPlate,
  createCylinder,
  createHardSurfaceShell,
  createSegmentPrism,
  createSurfaceRibbon,
  createSurfaceNetwork,
  createSurfaceNetworkParts,
  digestJson,
  inspectGlb,
  parseGlb,
  partsToGlb,
  surfaceFrame,
  validateSurfaceNetwork,
} from '../skills/refas/scripts/lib/index.mjs';

test('hard-surface shells keep true apertures, curved thickness, treatments, and semantic topology', () => {
  const mesh = createHardSurfaceShell({
    schema: 'refas.hard-surface-spec/v1',
    outerProfile: [[0.08, 0.1], [0.92, 0.1], [0.94, 0.88], [0.06, 0.88]],
    cutouts: [{id: 'mount-aperture', profile: [[0.3, 0.3], [0.3, 0.7], [0.7, 0.7], [0.7, 0.3]]}],
    thickness: 0.12,
    surface: {width: 2.4, height: 1.8, crownX: 0.2, crownY: 0.1, twist: 0.02},
    edgeTreatments: {outer: {type: 'fillet', width: 0.025, depth: 0.02, segments: 3}, cutouts: {type: 'chamfer', width: 0.02, depth: 0.018}},
  });
  assert.equal(mesh.analysis.valid, true);
  assert.equal(mesh.analysis.watertight, true);
  assert.equal(mesh.analysis.windingConsistent, true);
  assert.equal(mesh.topology.schema, 'refas.hard-surface-topology/v1');
  assert.ok(mesh.topology.faces['mount-aperture-wall']);
  assert.ok(mesh.topology.attachmentFrames['mount-aperture.edge-0']);
  assert.notDeepEqual(mesh.topology.attachmentFrames['mount-aperture.edge-0'].normal, [0, 0, 1]);
  const glb = partsToGlb({parts: [{id: 'shell', materialId: 'panel', mesh}], materials: MATERIALS});
  assert.deepEqual(parseGlb(glb).json.meshes[0].extras.refasTopology, mesh.topology);
});

test('hard-surface construction fails closed on invalid profiles and treatments', () => {
  const base = {schema: 'refas.hard-surface-spec/v1', outerProfile: [[0, 0], [1, 0], [1, 1], [0, 1]], thickness: 0.1};
  assert.throws(() => createHardSurfaceShell({...base, outerProfile: [[0, 0], [1, 1], [0, 1], [1, 0]]}), /self-intersecting|degenerate/);
  assert.throws(() => createHardSurfaceShell({...base, cutouts: [{id: 'outside', profile: [[0.8, 0.8], [0.8, 1.2], [1.2, 1.2], [1.2, 0.8]]}]}), /strictly inside/);
  assert.throws(() => createHardSurfaceShell({...base, edgeTreatments: {outer: {type: 'chamfer', width: 0.02, depth: 0.05}}}), /less than half/);
});

const SOURCE_DIGEST = 'e'.repeat(64);
const MATERIALS = {
  panel: {baseColor: [0.3, 0.45, 0.6, 1], metallic: 0.5, roughness: 0.35},
  boundary: {baseColor: [0.8, 0.7, 0.3, 1], metallic: 0.75, roughness: 0.25, clearcoat: 0.4},
};

test('mesh primitives are finite, watertight, and consistently wound', () => {
  const meshes = [
    createCurvedPlate({polygon: [[0.1, 0.1], [0.9, 0.12], [0.85, 0.8], [0.45, 0.92], [0.12, 0.72]]}),
    createSegmentPrism({start: [-0.5, -0.4, 0.1], end: [0.7, 0.6, 0.5], width: 0.08, height: 0.06}),
    createCylinder({center: [0, 0, 0], radius: 0.2, height: 0.1, segments: 24}),
  ];
  for (const mesh of meshes) {
    const analysis = analyzeMesh(mesh);
    assert.equal(analysis.valid, true);
    assert.equal(analysis.watertight, true);
    assert.equal(analysis.windingConsistent, true);
  }
});

test('compound plates tessellate their interiors and keep thickness aligned to the surface normal', () => {
  const polygon = [[0.08, 0.08], [0.92, 0.1], [0.88, 0.9], [0.12, 0.92]];
  const surface = {
    width: 2.05, height: 2.72,
    crownX: 0.3, crownY: 0.22, twist: 0.016,
    tiltX: -0.07, cubicY: -0.068, crossX2Y: -0.08,
    lift: -0.21,
    creases: [{axis: [1, 0.15], offset: -0.1, strength: -0.025, softness: 0.16}],
  };
  const thickness = 0.095;
  const mesh = createCurvedPlate({polygon, ...surface, thickness, subdivisions: 3});
  assert.ok(mesh.analysis.vertexCount > polygon.length * 20);
  assert.ok(mesh.analysis.triangleCount > 300);
  assert.equal(mesh.analysis.watertight, true);
  const frontCount = mesh.positions.length / 2;
  const frame = surfaceFrame(polygon[0], surface);
  const thicknessVector = mesh.positions[0].map((coordinate, axis) => coordinate - mesh.positions[frontCount][axis]);
  const normalDistance = thicknessVector.reduce((sum, coordinate, axis) => sum + coordinate * frame.normal[axis], 0);
  const residual = thicknessVector.map((coordinate, axis) => coordinate - frame.normal[axis] * normalDistance);
  assert.ok(Math.abs(normalDistance - thickness) < 1e-9);
  assert.ok(Math.hypot(...residual) < 1e-9);
});

test('surface ribbons and normal-oriented cylinders conform to a compound host surface', () => {
  const surface = {width: 2, height: 2.6, crownX: 0.28, crownY: 0.2, tiltX: -0.05};
  const ribbon = createSurfaceRibbon({
    polyline: [[0.1, 0.1], [0.9, 0.12], [0.88, 0.9], [0.12, 0.88]],
    surface,
    normalOffset: 0.06,
    width: 0.05,
    height: 0.04,
    samplesPerSegment: 4,
    closed: true,
  });
  assert.equal(ribbon.analysis.watertight, true);
  assert.ok(ribbon.analysis.vertexCount >= 64);
  const frame = surfaceFrame([0.75, 0.55], {...surface, normalOffset: 0.08});
  const fastener = createCylinder({center: frame.point, axis: frame.normal, radius: 0.08, height: 0.07, segments: 24});
  assert.equal(fastener.analysis.watertight, true);
  const axisVector = fastener.positions[1].map((coordinate, axis) => coordinate - fastener.positions[0][axis]);
  const alignment = axisVector.reduce((sum, coordinate, axis) => sum + coordinate * frame.normal[axis], 0);
  assert.ok(Math.abs(alignment - 0.07) < 1e-9);

  const profiled = createSurfaceRibbon({
    polyline: [[0.25, 0.3], [0.75, 0.68]],
    surface,
    normalOffset: 0.006,
    width: 0.02,
    height: 0.032,
    samplesPerSegment: 1,
    profile: 'beveled',
  });
  assert.equal(profiled.analysis.vertexCount, 16);
  assert.equal(profiled.analysis.triangleCount, 28);
  assert.equal(profiled.analysis.watertight, true);
});

test('projection-anchored guided surfaces preserve reference coordinates while realizing depth', () => {
  const polygon = [[0.2, 0.15], [0.82, 0.18], [0.78, 0.88], [0.24, 0.84]];
  const guidedSurface = {
    model: 'projection-anchored-guided',
    bounds: {min: [0.2, 0.15], max: [0.82, 0.88]},
    projection: {yawDegrees: 6, pitchDegrees: -3, cameraDistance: 6.2, observedHeight: 2.72, referenceYDown: true},
    crossSections: [
      {v: -1, profile: [{u: -1, z: 0}, {u: 0, z: 0.08}, {u: 1, z: 0}]},
      {v: 0, profile: [{u: -1, z: -0.01}, {u: 0, z: 0.3}, {u: 1, z: 0.01}]},
      {v: 1, profile: [{u: -1, z: 0}, {u: 0, z: 0.1}, {u: 1, z: 0}]},
    ],
    longitudinalGuide: [{v: -1, z: -0.01}, {v: 1, z: 0.01}],
  };
  const mesh = createCurvedPlate({polygon, guidedSurface, thickness: 0.09, subdivisions: 3});
  assert.equal(mesh.analysis.watertight, true);
  const cameraDistance = guidedSurface.projection.cameraDistance;
  const point = mesh.positions[0];
  const rayScale = -cameraDistance / (point[2] - cameraDistance);
  const target = [point[0] * rayScale, point[1] * rayScale];
  const boundsHeight = guidedSurface.bounds.max[1] - guidedSurface.bounds.min[1];
  const boundsCenter = guidedSurface.bounds.min.map((minimum, axis) => (minimum + guidedSurface.bounds.max[axis]) / 2);
  const recovered = [
    boundsCenter[0] + target[0] / guidedSurface.projection.observedHeight * boundsHeight,
    boundsCenter[1] - target[1] / guidedSurface.projection.observedHeight * boundsHeight,
  ];
  assert.ok(Math.hypot(recovered[0] - polygon[0][0], recovered[1] - polygon[0][1]) < 1e-10);
  assert.ok(mesh.analysis.bounds.max[2] - mesh.analysis.bounds.min[2] > 0.2);
});

test('surface network realizes exactly one physical boundary per shared adjacency', () => {
  const network = createSurfaceNetwork({
    scopeId: 'cover',
    sourceSha256: SOURCE_DIGEST,
    cells: [
      {id: 'left', polygon: [[0.1, 0.15], [0.48, 0.15], [0.48, 0.85], [0.1, 0.85]], evidenceRefs: ['evidence/reference.png']},
      {id: 'upper-right', polygon: [[0.52, 0.15], [0.9, 0.15], [0.9, 0.48], [0.52, 0.48]], evidenceRefs: ['evidence/reference.png']},
      {id: 'lower-right', polygon: [[0.52, 0.52], [0.9, 0.52], [0.9, 0.85], [0.52, 0.85]], evidenceRefs: ['evidence/reference.png']},
    ],
    adjacencies: [
      {id: 'left-upper', a: 'left', b: 'upper-right', polyline: [[0.5, 0.15], [0.5, 0.5]], evidenceRefs: ['evidence/reference.png']},
      {id: 'left-lower', a: 'left', b: 'lower-right', polyline: [[0.5, 0.5], [0.5, 0.85]], evidenceRefs: ['evidence/reference.png']},
      {id: 'right-split', a: 'upper-right', b: 'lower-right', polyline: [[0.5, 0.5], [0.9, 0.5]], evidenceRefs: ['evidence/reference.png']},
    ],
    attestation: {attested: true, evidenceRefs: ['evidence/reference.png']},
  });
  const validation = validateSurfaceNetwork(network);
  assert.equal(validation.valid, true);
  assert.equal(validation.adjacencyCount, 3);
  assert.equal(validation.sharedBoundaryCount, 3);
  assert.equal(validation.junctionCount, 1);

  const parts = createSurfaceNetworkParts(network);
  assert.equal(parts.invariant.oneBoundaryPerAdjacency, true);
  assert.equal(parts.panelParts.length, 3);
  assert.equal(parts.boundaryParts.length, 3);
  assert.equal(parts.junctionParts.length, 1);
  assert.equal(parts.invariant.junctions, 1);
  assert.deepEqual(parts.invariant.junctionCoverage[0].adjacencyIds, ['left-lower', 'left-upper', 'right-split']);
  assert.equal(new Set(parts.boundaryParts.map((part) => part.id)).size, 3);

  const separated = structuredClone(network);
  separated.adjacencies[0].polyline[1] = [0.49, 0.49];
  separated.adjacencies[1].polyline[0] = [0.5, 0.51];
  separated.adjacencies[2].polyline[0] = [0.51, 0.5];
  const separatedPayload = structuredClone(separated);
  delete separatedPayload.networkDigest;
  separated.networkDigest = digestJson(separatedPayload);
  assert.equal(createSurfaceNetworkParts(separated).junctionParts.length, 0);
  const tolerantParts = createSurfaceNetworkParts(separated, {junctionTolerance: 0.025});
  assert.equal(tolerantParts.junctionParts.length, 1);
  assert.deepEqual(tolerantParts.invariant.junctionCoverage[0].adjacencyIds, ['left-lower', 'left-upper', 'right-split']);

  const invalidNetwork = structuredClone(network);
  invalidNetwork.adjacencies.push({...structuredClone(network.adjacencies[0]), id: 'duplicate-edge', a: 'upper-right', b: 'left'});
  const invalidPayload = structuredClone(invalidNetwork);
  delete invalidPayload.networkDigest;
  invalidNetwork.networkDigest = digestJson(invalidPayload);
  assert.equal(validateSurfaceNetwork(invalidNetwork).valid, false);

  assert.throws(() => createSurfaceNetwork({
    scopeId: 'cover', sourceSha256: SOURCE_DIGEST,
    cells: network.cells, adjacencies: [...network.adjacencies, {...network.adjacencies[0], id: 'duplicate', a: 'upper-right', b: 'left'}],
    attestation: {attested: true, evidenceRefs: ['evidence/reference.png']},
  }), /duplicate shared adjacency/);
});

test('GLB serialization preserves differentiated enamel, brass, and inlay PBR assignments', () => {
  const materials = {
    enamel: {baseColor: [0.5, 0.76, 0.77, 1], metallic: 0.025, roughness: 0.25},
    'brass-dark': {baseColor: [0.56, 0.34, 0.1, 1], metallic: 0.92, roughness: 0.25},
    'brass-light': {baseColor: [0.92, 0.72, 0.35, 1], metallic: 0.94, roughness: 0.18},
    'rivet-inlay': {baseColor: [0.8, 0.71, 0.53, 1], metallic: 0.6, roughness: 0.22},
  };
  const plate = createCurvedPlate({polygon: [[0.1, 0.1], [0.9, 0.1], [0.85, 0.85], [0.15, 0.85]]});
  const fastener = createCylinder({radius: 0.1, height: 0.05, segments: 16});
  const glb = partsToGlb({
    assetId: 'material-regression',
    materials,
    parts: [
      {id: 'panel', role: 'observed-panel', materialId: 'enamel', mesh: plate},
      {id: 'rim', role: 'outer-rim', materialId: 'brass-light', mesh: plate},
      {id: 'base', role: 'fastener-base', materialId: 'brass-dark', mesh: fastener},
      {id: 'inlay', role: 'fastener-inlay', materialId: 'rivet-inlay', mesh: fastener},
    ],
  });
  const {json} = parseGlb(glb);
  const serialized = Object.fromEntries(json.materials.map((material) => [material.name, {
    baseColor: material.pbrMetallicRoughness.baseColorFactor,
    metallic: material.pbrMetallicRoughness.metallicFactor,
    roughness: material.pbrMetallicRoughness.roughnessFactor,
  }]));
  assert.deepEqual(serialized, materials);
  assert.equal(json.extensionsUsed, undefined);
  const assignments = Object.fromEntries(json.nodes.map((node) => [node.extras.role, node.extras.materialId]));
  assert.deepEqual(assignments, {
    'observed-panel': 'enamel',
    'outer-rim': 'brass-light',
    'fastener-base': 'brass-dark',
    'fastener-inlay': 'rivet-inlay',
  });
});

test('embedded GLB composition preserves the closed child payload', () => {
  const child = partsToGlb({
    assetId: 'closed-cover',
    parts: [{id: 'cover-shell', role: 'closed-child', scopeId: 'cover', materialId: 'panel', mesh: createCurvedPlate({polygon: [[0.1, 0.1], [0.9, 0.1], [0.85, 0.85], [0.15, 0.85]]})}],
    materials: MATERIALS,
  });
  const childParsed = parseGlb(child);
  const appended = appendPartsToClosedGlb(child, {
    name: 'Cover assembly',
    parts: [{id: 'center-fastener', role: 'fastener', scopeId: 'cover.fastener', materialId: 'boundary', mesh: createCylinder({center: [0, 0, 0.3], radius: 0.12, height: 0.08})}],
    materials: MATERIALS,
  });
  const parentParsed = parseGlb(appended.glb);
  assert.equal(appended.report.sourceBinaryPrefixPreserved, true);
  assert.equal(parentParsed.binary.subarray(0, childParsed.binary.length).equals(childParsed.binary), true);
  const inspection = inspectGlb(appended.glb);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.nodeCount, 2);
  assert.deepEqual(inspection.partIds, ['cover-shell', 'center-fastener']);

  const truncated = appended.glb.subarray(0, appended.glb.length - 1);
  assert.throws(() => parseGlb(truncated), /header length/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  analyzeMesh,
  appendPartsToClosedGlb,
  createCurvedPlate,
  createCylinder,
  createSegmentPrism,
  createSurfaceNetwork,
  createSurfaceNetworkParts,
  digestJson,
  inspectGlb,
  parseGlb,
  partsToGlb,
  validateSurfaceNetwork,
} from '../skills/refas/scripts/lib/index.mjs';

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
  assert.equal(new Set(parts.boundaryParts.map((part) => part.id)).size, 3);

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

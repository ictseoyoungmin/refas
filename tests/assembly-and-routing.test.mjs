import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  auditOwnershipRegistry,
  createAssemblyContract,
  createRealizedAssemblyProof,
  createSegmentPrism,
  partsToGlb,
  routeFinding,
  routeLowScore,
  validateAssemblyContract,
  validateRealizedAssembly,
  validateRealizedAssemblyProof,
} from '../skills/refas/scripts/lib/index.mjs';

const DIGEST = 'f'.repeat(64);
const MODULE_MATERIALS = {metal: {baseColor: [0.3, 0.4, 0.5, 1], metallic: 0.8, roughness: 0.3}};
const contact = (origin, normal) => ({origin, normal, supportRadius: 0.3});

function modularFixture({gap = 0, worldSpace = false, missingRoot = false} = {}) {
  const mesh = createSegmentPrism({start: [-0.25, 0, 0], end: [0.25, 0, 0], width: 0.5, height: 0.2});
  const parts = [
    {id: 'base', materialId: 'metal', mesh, moduleRoot: true, contactSurfaces: {socket: contact([0, 0, 0.1], [0, 0, 1])}},
    {id: 'carrier', parentId: worldSpace ? null : 'base', translation: [0, 0, 0.2 + gap], materialId: 'metal', mesh, moduleRoot: !missingRoot, contactSurfaces: {mount: contact([0, 0, -0.1], [0, 0, -1]), socket: contact([0, 0, 0.1], [0, 0, 1])}},
    {id: 'latch', parentId: worldSpace ? null : 'carrier', translation: [0, 0, 0.2], materialId: 'metal', mesh, moduleRoot: true, contactSurfaces: {mount: contact([0, 0, -0.1], [0, 0, -1])}},
  ];
  return partsToGlb({parts, materials: MODULE_MATERIALS});
}

function modularProof(glb, clearanceRange = [0, 0]) {
  return createRealizedAssemblyProof({glb, modules: [
    {id: 'base', rootPartId: 'base'}, {id: 'carrier', rootPartId: 'carrier', parentModuleId: 'base'}, {id: 'latch', rootPartId: 'latch', parentModuleId: 'carrier'},
  ], attachments: [
    {id: 'carrier-to-base', childModuleId: 'carrier', parentModuleId: 'base', childSurface: {partId: 'carrier', surfaceId: 'mount'}, parentSurface: {partId: 'base', surfaceId: 'socket'}, clearanceRange, tolerance: 0.001},
    {id: 'latch-to-carrier', childModuleId: 'latch', parentModuleId: 'carrier', childSurface: {partId: 'latch', surfaceId: 'mount'}, parentSurface: {partId: 'carrier', surfaceId: 'socket'}, clearanceRange: [0, 0], tolerance: 0.001},
  ], objectIdEvidence: ['base', 'carrier', 'latch']});
}

test('realized modular proof derives ancestry, contact, support, and penetration from GLB state', () => {
  const valid = modularProof(modularFixture());
  assert.equal(valid.valid, true, valid.errors.join('; '));
  assert.equal(valid.metrics.nestedLevels, 3);
  assert.deepEqual(validateRealizedAssemblyProof(valid), {valid: true, errors: []});
  const floating = modularProof(modularFixture({gap: 0.05}));
  assert.equal(floating.valid, false);
  assert.match(floating.errors.join(' '), /realized contact failed/);
  const intentionalClearance = modularProof(modularFixture({gap: 0.005}), [0.004, 0.006]);
  assert.equal(intentionalClearance.valid, true);
  const penetrating = modularProof(modularFixture({gap: -0.02}));
  assert.equal(penetrating.valid, false);
  assert.ok(penetrating.attachmentChecks[0].penetrationDepth > 0);
  const unparented = modularProof(modularFixture({worldSpace: true}));
  assert.equal(unparented.valid, false);
  assert.match(unparented.errors.join(' '), /ancestry|parent-relative/);
  const missingRoot = modularProof(modularFixture({missingRoot: true}));
  assert.equal(missingRoot.valid, false);
  assert.match(missingRoot.errors.join(' '), /lacks refasModuleRoot/);
});

function assemblyFixture() {
  return createAssemblyContract({
    scopeId: 'whole',
    sourceSha256: DIGEST,
    parts: [
      {id: 'shell', observedPolygon: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], rootAnchor: [0.5, 0.5], depthBand: [0.1, 0.3], evidenceRefs: ['evidence/reference.png']},
      {id: 'fastener', scopeId: 'whole.fastener', observedPolygon: [[0.42, 0.42], [0.58, 0.42], [0.58, 0.58], [0.42, 0.58]], rootAnchor: [0.5, 0.5], depthBand: [0.31, 0.5], evidenceRefs: ['evidence/reference.png']},
    ],
    relations: [
      {kind: 'in-front-of', subjectId: 'fastener', objectId: 'shell', evidenceRefs: ['evidence/reference.png']},
      {kind: 'attached-to', subjectId: 'fastener', objectId: 'shell', evidenceRefs: ['evidence/reference.png']},
    ],
    supportZones: [{id: 'center-zone', polygon: [[0.35, 0.35], [0.65, 0.35], [0.65, 0.65], [0.35, 0.65]], evidenceRefs: ['evidence/reference.png']}],
    supportHypotheses: [{partId: 'fastener', ownerId: 'shell', zoneId: 'center-zone', status: 'bounded-hypothesis', evidenceRefs: ['evidence/reference.png']}],
    closedChildren: [{partId: 'shell', frameId: 'shell-frame', glbSha256: DIGEST, registrationDigest: 'a'.repeat(64)}],
    attestation: {attested: true, evidenceRefs: ['evidence/reference.png']},
    ambiguities: ['The hidden fastener stem is inferred.'],
  });
}

test('assembly validates overlap, depth, support, penetration, and immutable child evidence', () => {
  const contract = assemblyFixture();
  assert.deepEqual(validateAssemblyContract(contract), {valid: true, errors: []});
  const valid = validateRealizedAssembly({
    contract,
    realizedParts: [
      {id: 'shell', projectedPolygon: contract.parts[0].observedPolygon, rootAnchor: [0.5, 0.5], depth: 0.2, supported: true, penetrationCount: 0, meshAnalysis: {valid: true, watertight: true}},
      {id: 'fastener', projectedPolygon: contract.parts[1].observedPolygon, rootAnchor: [0.5, 0.5], depth: 0.4, supported: true, penetrationCount: 0, meshAnalysis: {valid: true, watertight: true}},
    ],
    compositionReports: [{partId: 'shell', sourceGlbSha256: DIGEST, sourceBinaryPrefixPreserved: true}],
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.metrics, {
    partCount: 2,
    relationCount: 2,
    projectedOverlapFailures: 0,
    depthOrderFailures: 0,
    depthBandFailures: 0,
    supportFailures: 0,
    penetrationCount: 0,
    closedChildIntegrityFailures: 0,
  });

  const invalid = validateRealizedAssembly({
    contract,
    realizedParts: [
      {id: 'shell', projectedPolygon: contract.parts[0].observedPolygon, rootAnchor: [0.5, 0.5], depth: 0.2, supported: true, penetrationCount: 0},
      {id: 'fastener', projectedPolygon: [[0.01, 0.01], [0.05, 0.01], [0.05, 0.05], [0.01, 0.05]], rootAnchor: [0.02, 0.02], depth: 0.15, supported: false, penetrationCount: 1},
    ],
    compositionReports: [{partId: 'shell', sourceGlbSha256: 'b'.repeat(64), sourceBinaryPrefixPreserved: false}],
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.metrics.projectedOverlapFailures > 0);
  assert.ok(invalid.metrics.depthOrderFailures > 0);
  assert.ok(invalid.metrics.supportFailures > 0);
  assert.equal(invalid.metrics.penetrationCount, 1);
  assert.equal(invalid.metrics.closedChildIntegrityFailures, 1);
});

test('assembly contract rejects cyclic front-to-back claims', () => {
  const base = assemblyFixture();
  assert.throws(() => createAssemblyContract({
    scopeId: 'whole', sourceSha256: DIGEST,
    parts: base.parts,
    relations: [
      {kind: 'in-front-of', subjectId: 'shell', objectId: 'fastener', evidenceRefs: ['evidence/reference.png']},
      {kind: 'in-front-of', subjectId: 'fastener', objectId: 'shell', evidenceRefs: ['evidence/reference.png']},
    ],
    attestation: {attested: true, evidenceRefs: ['evidence/reference.png']},
  }), /cycle/);
});

test('routing fails closed without ownership and never lets a score choose a rollback', () => {
  assert.equal(auditOwnershipRegistry().valid, true);
  const checkpoints = [
    {id: 'source', parentId: null, capability: 'source-intake', scopeId: 'whole'},
    {id: 'hierarchy', parentId: 'source', capability: 'visual-hierarchy', scopeId: 'whole'},
    {id: 'observation', parentId: 'hierarchy', capability: 'visual-observation', scopeId: 'whole'},
    {id: 'spatial', parentId: 'observation', capability: 'spatial-hypotheses', scopeId: 'whole'},
    {id: 'shape', parentId: 'spatial', capability: 'shape-reconstruction', scopeId: 'whole'},
    {id: 'surface', parentId: 'shape', capability: 'surface-topology', scopeId: 'whole'},
    {id: 'assembly', parentId: 'surface', capability: 'assembly', scopeId: 'whole'},
  ];
  const routed = routeFinding({
    finding: {category: 'attachment-mismatch', severity: 'major', scopeId: 'whole.fastener', summary: 'Floating fastener', evidenceRefs: ['renders/grazing.png']},
    checkpoints,
    headId: 'assembly',
  });
  assert.equal(routed.action, 'REOPEN_CAPABILITY');
  assert.equal(routed.ownerCapability, 'assembly');
  assert.equal(routed.rollbackCheckpointId, 'surface');
  assert.deepEqual(routed.invalidatedCapabilities.slice(0, 3), ['assembly', 'appearance', 'rendering']);

  const blocked = routeFinding({
    finding: {category: 'unknown-blocker', severity: 'blocking', scopeId: 'whole', evidenceRefs: ['renders/hero.png']},
    checkpoints,
    headId: 'assembly',
  });
  assert.equal(blocked.action, 'BLOCKED_UNROUTABLE_FINDING');

  const lowScore = routeLowScore({score: 42, threshold: 70, scopeId: 'whole', checkpoints, headId: 'assembly'});
  assert.equal(lowScore.action, 'REQUEST_REVIEW');
  assert.equal(lowScore.rollbackCheckpointId, null);
});

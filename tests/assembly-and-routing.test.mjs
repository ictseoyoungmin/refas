import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  auditOwnershipRegistry,
  createAssemblyContract,
  routeFinding,
  routeLowScore,
  validateAssemblyContract,
  validateRealizedAssembly,
} from '../skills/refas/scripts/lib/index.mjs';

const DIGEST = 'f'.repeat(64);

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

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  bakePhysicalFusion,
  createAttachmentSemantics,
  createCanonicalEditIntent,
  createLogicalFusion,
  createPhysicalFusionPlan,
  physicalFusionFrameDigest,
  physicalFusionGeometryDigest,
  physicalFusionReopenTarget,
  validatePhysicalFusionPlan,
  validatePhysicalFusionResult,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});

function cube(x0, x1) {
  const positions = [
    [x0, 0, 0], [x1, 0, 0], [x1, 1, 0], [x0, 1, 0],
    [x0, 0, 1], [x1, 0, 1], [x1, 1, 1], [x0, 1, 1],
  ];
  const indices = [
    0,2,1, 0,3,2,
    4,5,6, 4,6,7,
    0,1,5, 0,5,4,
    3,7,6, 3,6,2,
    0,7,3, 0,4,7,
    1,2,6, 1,6,5,
  ];
  return {positions, indices};
}

function fixture() {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'head-shell', sourceSha256: D('f'),
    entities: [E('head-shell'), E('face'), E('nose'), E('glasses')],
    relations: [
      R('head-free', 'FREE', 'head-shell'),
      R('face-fused', 'FUSED', 'face', ['head-shell']),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      R('glasses-free', 'FREE', 'glasses'),
    ],
  });
  const logicalFusion = createLogicalFusion({attachmentSemantics, evidenceRefs: ['reviews/head-logical-fusion.json']});
  const canonicalEditIntent = createCanonicalEditIntent({
    id: 'finalize-head-shell', ownerCapability: 'assembly', scopeId: 'head-shell', editClass: 'finalization',
    canonicalBindings: ['finalization.head-shell'],
    realizationOperations: ['mesh-fuse', 'mesh-weld', 'internal-face-cleanup', 'mesh-optimize'],
    evidenceRefs: ['reviews/head-ready.json'],
    intent: 'Bake the closed logical head shell into one reopenable physical mesh.',
  });
  const meshes = new Map([
    ['head-shell', cube(-1, 0)],
    ['face', cube(0, 1)],
    ['nose', cube(1, 2)],
  ]);
  const frame = I();
  const members = [...meshes.entries()].map(([memberId, mesh]) => ({
    memberId,
    geometryDigest: physicalFusionGeometryDigest(mesh),
    frameDigest: physicalFusionFrameDigest(frame),
    materialRegionId: 'skin',
    evidenceRefs: [`model/${memberId}-geometry.json`],
  }));
  const plan = createPhysicalFusionPlan({
    attachmentSemantics, logicalFusion, canonicalEditIntent,
    id: 'head-shell-physical-bake', groupId: 'fusion-head-shell',
    inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: frame, members, strategy: 'WELD_SHARED_BOUNDARY', weldTolerance: 1e-8,
    topologyObligation: 'watertight', evidenceRefs: ['reviews/head-finalization.json'],
  });
  const realizedMembers = [...meshes.entries()].map(([memberId, mesh]) => ({memberId, mesh, worldFrame: frame}));
  return {attachmentSemantics, logicalFusion, canonicalEditIntent, meshes, plan, realizedMembers};
}

test('shared-boundary bake produces one connected watertight physical mesh and removes internal interfaces', () => {
  const f = fixture();
  assert.equal(validatePhysicalFusionPlan(f.plan, f).valid, true);
  const result = bakePhysicalFusion({
    ...f, plan: f.plan,
    currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b'),
    evidenceRefs: ['reviews/head-bake-result.json'],
  });
  assert.equal(result.report.status, 'BAKED');
  assert.equal(result.report.topology.pass, true);
  assert.equal(result.report.topology.watertight, true);
  assert.equal(result.report.topology.connectedComponents, 1);
  assert.equal(result.report.metrics.inputTriangles, 36);
  assert.equal(result.report.metrics.outputTriangles, 28);
  assert.equal(result.report.metrics.internalInterfaceFacePairsRemoved, 4);
  assert.equal(result.provenance.sourceMemberIds.includes('glasses'), false);
  assert.deepEqual(result.provenance.sourceMemberIds, ['face', 'head-shell', 'nose']);
  assert.equal(result.provenance.outputFaces.length, 28);
  assert.equal(validatePhysicalFusionResult(result, {
    ...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b'),
  }).valid, true);
});

test('non-fused dependents cannot be smuggled into a physical fusion plan', () => {
  const f = fixture();
  const members = [...f.plan.members, {
    memberId: 'glasses', geometryDigest: D('c'), frameDigest: physicalFusionFrameDigest(I()), evidenceRefs: ['model/glasses.json'],
  }];
  assert.throws(() => createPhysicalFusionPlan({
    attachmentSemantics: f.attachmentSemantics, logicalFusion: f.logicalFusion, canonicalEditIntent: f.canonicalEditIntent,
    id: 'bad-head-bake', groupId: f.plan.groupId, inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: I(), members, evidenceRefs: ['bad.json'],
  }), /not in logical fusion group/);
});

test('stale geometry, stale frame, asset, or pre-fusion semantic state fails closed before bake', () => {
  const f = fixture();
  const staleGeometry = structuredClone(f.realizedMembers);
  staleGeometry[0].mesh.positions[0][0] -= .1;
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, realizedMembers: staleGeometry, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}), /geometry digest does not match/);

  const staleFrame = structuredClone(f.realizedMembers);
  staleFrame[0].worldFrame.origin = [.1, 0, 0];
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, realizedMembers: staleFrame, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}), /frame digest does not match/);
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('c'), currentPreFusionStateDigest: D('b')}), /input asset is stale/);
  assert.throws(() => bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('c')}), /semantic state is stale/);
});

test('SOLID_UNION never degrades to merge or weld when no robust backend proof exists', () => {
  const f = fixture();
  const plan = createPhysicalFusionPlan({
    attachmentSemantics: f.attachmentSemantics, logicalFusion: f.logicalFusion, canonicalEditIntent: f.canonicalEditIntent,
    id: 'head-solid-union', groupId: f.plan.groupId, inputAssetSha256: D('a'), preFusionCheckpointId: 'checkpoint-head-semantic', preFusionStateDigest: D('b'),
    fusionRootFrame: I(), members: f.plan.members, strategy: 'SOLID_UNION', topologyObligation: 'watertight', evidenceRefs: ['reviews/solid-union.json'],
  });
  const result = bakePhysicalFusion({...f, plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  assert.equal(result.report.status, 'BLOCKED_BACKEND_REQUIRED');
  assert.equal(result.mesh, null);
  assert.equal(result.provenance, null);
  assert.match(result.report.blockingReason, /robust-solid-union/);
});

test('reopen resolves a fused semantic member to exact pre-fusion state, never to the fused mesh', () => {
  const f = fixture();
  const result = bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  const reopen = physicalFusionReopenTarget({report: result.report, provenance: result.provenance, memberId: 'nose'});
  assert.equal(reopen.checkpointId, 'checkpoint-head-semantic');
  assert.equal(reopen.stateDigest, D('b'));
  assert.equal(reopen.inputAssetSha256, D('a'));
  assert.equal(reopen.canonicalSource, 'pre-fusion-semantic-state');
  assert.equal(reopen.fusedOutputMustBeDiscardedBeforeEdit, true);
  assert.throws(() => physicalFusionReopenTarget({report: result.report, provenance: result.provenance, memberId: 'glasses'}), /not part of the physical fusion provenance/);
});

test('plan and baked result are digest-bound and tamper detectable', () => {
  const f = fixture();
  const badPlan = structuredClone(f.plan); badPlan.weldTolerance = 9;
  assert.equal(validatePhysicalFusionPlan(badPlan, f).valid, false);
  const result = bakePhysicalFusion({...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')});
  const tampered = structuredClone(result); tampered.provenance.outputFaces[0].sourceMemberIds = ['glasses'];
  assert.equal(validatePhysicalFusionResult(tampered, {...f, plan: f.plan, currentInputAssetSha256: D('a'), currentPreFusionStateDigest: D('b')}).valid, false);
});

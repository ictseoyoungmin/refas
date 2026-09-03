import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAttachmentSemantics,
  createMultiAnchorPlan,
  createSurfaceAnchorSet,
  rebindSurfaceAnchorSet,
  solveMultiAnchor,
  validateMultiAnchorPlan,
  validateMultiAnchorReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Z90 = (origin = [0, 0, 0]) => ({origin, xAxis: [0, 1, 0], yAxis: [-1, 0, 0], zAxis: [0, 0, 1]});
const rounded = (values, scale = 1e8) => values.map((value) => Math.abs(value) < 1 / scale ? 0 : Math.round(value * scale) / scale);

function semantics() {
  return createAttachmentSemantics({
    scopeId: 'head', sourceSha256: D(),
    entities: [E('head-shell'), E('nose'), E('left-ear'), E('right-ear'), E('glasses')],
    relations: [
      R('head-free', 'FREE', 'head-shell'),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      R('left-ear-fused', 'FUSED', 'left-ear', ['head-shell']),
      R('right-ear-fused', 'FUSED', 'right-ear', ['head-shell']),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose', 'left-ear', 'right-ear']),
    ],
  });
}

function initialSurfaces() {
  return [
    {ownerId: 'nose', geometryDigest: D('b'), vertices: [[-.2, -.2, 0], [.2, -.2, 0], [0, .2, 0]], triangles: [{id: 'nose-old', patchId: 'nose-bridge', indices: [0, 1, 2]}]},
    {ownerId: 'left-ear', geometryDigest: D('c'), vertices: [[-1.2, .8, 0], [-.8, .8, 0], [-1, 1.2, 0]], triangles: [{id: 'left-ear-tri', patchId: 'left-ear-contact', indices: [0, 1, 2]}]},
    {ownerId: 'right-ear', geometryDigest: D('d'), vertices: [[.8, .8, 0], [1.2, .8, 0], [1, 1.2, 0]], triangles: [{id: 'right-ear-tri', patchId: 'right-ear-contact', indices: [0, 1, 2]}]},
  ];
}

function anchorSpecs() {
  return [
    {id: 'bridge-target', relationId: 'glasses-fit', subjectAnchorId: 'bridge', ownerId: 'nose', patchId: 'nose-bridge', triangleId: 'nose-old', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: .3, maxNormalDeviationRadians: .5, evidenceRefs: ['model/bridge-target.json']},
    {id: 'left-target', relationId: 'glasses-fit', subjectAnchorId: 'left-temple', ownerId: 'left-ear', patchId: 'left-ear-contact', triangleId: 'left-ear-tri', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: .3, maxNormalDeviationRadians: .5, evidenceRefs: ['model/left-target.json']},
    {id: 'right-target', relationId: 'glasses-fit', subjectAnchorId: 'right-temple', ownerId: 'right-ear', patchId: 'right-ear-contact', triangleId: 'right-ear-tri', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: .3, maxNormalDeviationRadians: .5, evidenceRefs: ['model/right-target.json']},
  ];
}

function plan(attachmentSemantics) {
  return createMultiAnchorPlan({
    attachmentSemantics,
    id: 'glasses-rigid-fit', relationId: 'glasses-fit', subjectId: 'glasses', maximumRmsPositionError: .02,
    constraints: [
      {id: 'bridge-constraint', ownerId: 'nose', surfaceAnchorId: 'bridge-target', subjectAnchorId: 'bridge', subjectAnchorFrame: I([0, 0, 0]), positionWeight: 2, orientationWeight: 0, maxPositionError: .03, evidenceRefs: ['model/glasses-bridge.json']},
      {id: 'left-constraint', ownerId: 'left-ear', surfaceAnchorId: 'left-target', subjectAnchorId: 'left-temple', subjectAnchorFrame: I([-1, 1, 0]), positionWeight: 1, orientationWeight: 0, maxPositionError: .03, evidenceRefs: ['model/glasses-left.json']},
      {id: 'right-constraint', ownerId: 'right-ear', surfaceAnchorId: 'right-target', subjectAnchorId: 'right-temple', subjectAnchorFrame: I([1, 1, 0]), positionWeight: 1, orientationWeight: 0, maxPositionError: .03, evidenceRefs: ['model/glasses-right.json']},
    ],
    evidenceRefs: ['source/head.png'],
  });
}

function loweredNoseSurfaces() {
  const [, leftEar, rightEar] = initialSurfaces();
  return [
    {ownerId: 'nose', geometryDigest: D('e'), vertices: [[-.2, -.2, -.2], [.2, -.2, -.2], [.2, .2, -.2], [-.2, .2, -.2]], triangles: [{id: 'nose-new-a', patchId: 'nose-bridge', indices: [0, 1, 2]}, {id: 'nose-new-b', patchId: 'nose-bridge', indices: [0, 2, 3]}]},
    leftEar,
    rightEar,
  ];
}

function owners(frame = I()) {
  return ['nose', 'left-ear', 'right-ear'].map((entityId) => ({entityId, frame}));
}

test('three glasses anchors recover an exact known rigid transform without scale or deformation', () => {
  const attachmentSemantics = semantics(), surfaces = initialSurfaces();
  const anchorSet = createSurfaceAnchorSet({attachmentSemantics, surfaces, anchors: anchorSpecs()});
  const fitPlan = plan(attachmentSemantics);
  assert.equal(validateMultiAnchorPlan(fitPlan, attachmentSemantics).valid, true);
  const report = solveMultiAnchor({plan: fitPlan, attachmentSemantics, surfaceAnchorSet: anchorSet, surfaces, ownerWorldFrames: owners(Z90([2, 3, 4]))});
  assert.equal(report.status, 'SOLVED');
  assert.equal(report.eligibleForRealization, true);
  assert.ok(report.rmsPositionError < 1e-8);
  assert.deepEqual(rounded(report.worldFrame.origin), [2, 3, 4]);
  assert.deepEqual(rounded(report.worldFrame.xAxis), [0, 1, 0]);
  assert.equal(report.policy.noScaleApplied, true);
  assert.equal(report.policy.noMeshDeformationApplied, true);
});

test('lowering and retessellating the nose moves and tilts rigid glasses while keeping ear errors bounded', () => {
  const attachmentSemantics = semantics(), previousSurfaces = initialSurfaces();
  const previousAnchors = createSurfaceAnchorSet({attachmentSemantics, surfaces: previousSurfaces, anchors: anchorSpecs()});
  const currentSurfaces = loweredNoseSurfaces();
  const rebound = rebindSurfaceAnchorSet({anchorSet: previousAnchors, attachmentSemantics, previousSurfaces, currentSurfaces});
  const fitPlan = plan(attachmentSemantics);
  const report = solveMultiAnchor({plan: fitPlan, attachmentSemantics, surfaceAnchorSet: rebound.anchorSet, surfaces: currentSurfaces, ownerWorldFrames: owners()});
  assert.equal(report.status, 'SOLVED');
  assert.equal(report.eligibleForRealization, true);
  assert.ok(report.worldFrame.origin[2] < -.15, 'glasses must follow the lowered nose instead of remaining at the old world position');
  assert.ok(report.rmsPositionError < .02);
  assert.equal(report.constraintResults.every((result) => result.positionPass), true);
  assert.equal(validateMultiAnchorReport(report, {plan: fitPlan, attachmentSemantics, surfaceAnchorSet: rebound.anchorSet, surfaces: currentSurfaces}).valid, true);
});

test('geometrically incompatible anchors return INFEASIBLE instead of stretching the subject', () => {
  const attachmentSemantics = semantics();
  const surfaces = initialSurfaces();
  surfaces[0] = {...surfaces[0], geometryDigest: D('f'), vertices: surfaces[0].vertices.map(([x, y]) => [x, y, -1])};
  const specs = anchorSpecs();
  const anchorSet = createSurfaceAnchorSet({attachmentSemantics, surfaces, anchors: specs});
  const fitPlan = plan(attachmentSemantics);
  const report = solveMultiAnchor({plan: fitPlan, attachmentSemantics, surfaceAnchorSet: anchorSet, surfaces, ownerWorldFrames: owners()});
  assert.equal(report.status, 'INFEASIBLE');
  assert.equal(report.eligibleForRealization, false);
  assert.equal(report.policy.infeasibleResultCannotBeRealized, true);
  assert.equal(report.policy.noScaleApplied, true);
  assert.equal(report.policy.noMeshDeformationApplied, true);
});

test('multi-anchor plans require coverage of every declared owner', () => {
  const attachmentSemantics = semantics();
  assert.throws(() => createMultiAnchorPlan({
    attachmentSemantics, id: 'bad-plan', relationId: 'glasses-fit', subjectId: 'glasses', maximumRmsPositionError: .1,
    constraints: [
      {id: 'bridge-only', ownerId: 'nose', surfaceAnchorId: 'bridge-target', subjectAnchorId: 'bridge', subjectAnchorFrame: I(), maxPositionError: .1, evidenceRefs: ['bad.json']},
      {id: 'left-only', ownerId: 'left-ear', surfaceAnchorId: 'left-target', subjectAnchorId: 'left-temple', subjectAnchorFrame: I([-1, 1, 0]), maxPositionError: .1, evidenceRefs: ['bad-left.json']},
    ],
  }), /does not cover declared owner/);
});

test('plan and report digests detect constraint and realized-pose tampering', () => {
  const attachmentSemantics = semantics(), surfaces = initialSurfaces();
  const anchorSet = createSurfaceAnchorSet({attachmentSemantics, surfaces, anchors: anchorSpecs()});
  const fitPlan = plan(attachmentSemantics);
  const tamperedPlan = structuredClone(fitPlan);
  tamperedPlan.constraints[0].maxPositionError = 99;
  assert.equal(validateMultiAnchorPlan(tamperedPlan, attachmentSemantics).valid, false);

  const report = solveMultiAnchor({plan: fitPlan, attachmentSemantics, surfaceAnchorSet: anchorSet, surfaces, ownerWorldFrames: owners()});
  const tamperedReport = structuredClone(report);
  tamperedReport.worldFrame.origin = [99, 99, 99];
  assert.equal(validateMultiAnchorReport(tamperedReport, {plan: fitPlan, attachmentSemantics, surfaceAnchorSet: anchorSet, surfaces}).valid, false);
});

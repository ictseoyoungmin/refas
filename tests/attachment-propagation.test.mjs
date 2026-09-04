import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createAttachmentFollowState,
  createAttachmentPropagationPlan,
  createAttachmentSemantics,
  createMultiAnchorPlan,
  createSurfaceAnchorSet,
  propagateAttachmentGraph,
  rigidFrameDigest,
  validateAttachmentPropagationPlan,
  validateAttachmentPropagationReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});

function semantics() {
  return createAttachmentSemantics({
    scopeId: 'assembly-graph',
    sourceSha256: D('a'),
    entities: [
      E('root-shell'), E('nose'), E('left-ear'), E('right-ear'), E('glasses'),
      E('badge'), E('hinge'), E('tip'), E('panel'),
    ],
    relations: [
      R('root-free', 'FREE', 'root-shell'),
      R('nose-fused', 'FUSED', 'nose', ['root-shell']),
      R('left-ear-fused', 'FUSED', 'left-ear', ['root-shell']),
      R('right-ear-fused', 'FUSED', 'right-ear', ['root-shell']),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose', 'left-ear', 'right-ear']),
      R('badge-follow', 'RIGID_FOLLOW', 'badge', ['glasses']),
      R('hinge-joint', 'ARTICULATED', 'hinge', ['badge']),
      R('tip-offset', 'SURFACE_OFFSET', 'tip', ['hinge']),
      R('panel-clearance', 'SUPPORTED_CLEARANCE', 'panel', ['hinge']),
    ],
    evidenceRefs: ['source/assembly.png'],
  });
}

function surfaces({noseZ = 0} = {}) {
  return [
    {ownerId: 'nose', geometryDigest: noseZ === 0 ? D('b') : D('c'), vertices: [[-.2, -.2, noseZ], [.2, -.2, noseZ], [0, .4, noseZ]], triangles: [{id: 'nose-tri', patchId: 'nose-bridge', indices: [0, 1, 2]}]},
    {ownerId: 'left-ear', geometryDigest: D('d'), vertices: [[-1.2, .8, 0], [-.8, .8, 0], [-1, 1.4, 0]], triangles: [{id: 'left-ear-tri', patchId: 'left-ear-contact', indices: [0, 1, 2]}]},
    {ownerId: 'right-ear', geometryDigest: D('e'), vertices: [[.8, .8, 0], [1.2, .8, 0], [1, 1.4, 0]], triangles: [{id: 'right-ear-tri', patchId: 'right-ear-contact', indices: [0, 1, 2]}]},
    {ownerId: 'hinge', geometryDigest: D('f'), vertices: [[-1, -1, 0], [1, -1, 0], [0, 2, 0]], triangles: [{id: 'hinge-tri', patchId: 'hinge-pad', indices: [0, 1, 2]}]},
  ];
}

function anchorSpecs() {
  const barycentric = [1 / 3, 1 / 3, 1 / 3];
  return [
    {id: 'bridge-target', relationId: 'glasses-fit', subjectAnchorId: 'bridge', ownerId: 'nose', patchId: 'nose-bridge', triangleId: 'nose-tri', barycentric, tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: 2, maxNormalDeviationRadians: .5, evidenceRefs: ['model/bridge.json']},
    {id: 'left-target', relationId: 'glasses-fit', subjectAnchorId: 'left-temple', ownerId: 'left-ear', patchId: 'left-ear-contact', triangleId: 'left-ear-tri', barycentric, tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: 2, maxNormalDeviationRadians: .5, evidenceRefs: ['model/left.json']},
    {id: 'right-target', relationId: 'glasses-fit', subjectAnchorId: 'right-temple', ownerId: 'right-ear', patchId: 'right-ear-contact', triangleId: 'right-ear-tri', barycentric, tangentHint: [1, 0, 0], offset: 0, maxRebindDistance: 2, maxNormalDeviationRadians: .5, evidenceRefs: ['model/right.json']},
    {id: 'tip-target', relationId: 'tip-offset', subjectAnchorId: 'tip-contact', ownerId: 'hinge', patchId: 'hinge-pad', triangleId: 'hinge-tri', barycentric, tangentHint: [1, 0, 0], offset: .2, maxRebindDistance: 1, maxNormalDeviationRadians: .5, evidenceRefs: ['model/tip.json']},
  ];
}

function multiPlan(attachmentSemantics) {
  return createMultiAnchorPlan({
    attachmentSemantics,
    id: 'glasses-rigid-plan',
    relationId: 'glasses-fit',
    subjectId: 'glasses',
    maximumRmsPositionError: .001,
    constraints: [
      {id: 'bridge-constraint', ownerId: 'nose', surfaceAnchorId: 'bridge-target', subjectAnchorId: 'bridge', subjectAnchorFrame: I([0, 0, 0]), maxPositionError: .001, evidenceRefs: ['model/bridge-constraint.json']},
      {id: 'left-constraint', ownerId: 'left-ear', surfaceAnchorId: 'left-target', subjectAnchorId: 'left-temple', subjectAnchorFrame: I([-1, 1, 0]), maxPositionError: .001, evidenceRefs: ['model/left-constraint.json']},
      {id: 'right-constraint', ownerId: 'right-ear', surfaceAnchorId: 'right-target', subjectAnchorId: 'right-temple', subjectAnchorFrame: I([1, 1, 0]), maxPositionError: .001, evidenceRefs: ['model/right-constraint.json']},
    ],
    evidenceRefs: ['source/assembly.png'],
  });
}

function build({noseZ = 0, rootFrame = I(), fusedOwnerFrame = rootFrame, angle = 0} = {}) {
  const attachmentSemantics = semantics();
  const surfaceDescriptors = surfaces({noseZ});
  const surfaceAnchorSet = createSurfaceAnchorSet({attachmentSemantics, surfaces: surfaceDescriptors, anchors: anchorSpecs(), evidenceRefs: ['source/assembly.png']});
  const glassesPlan = multiPlan(attachmentSemantics);
  const followState = createAttachmentFollowState({
    attachmentSemantics,
    surfaceAnchorSet,
    surfaces: surfaceDescriptors,
    bindings: [
      {id: 'badge-binding', relationId: 'badge-follow', baselineOwnerFrame: I(), baselineSubjectFrame: I([0, 0, 1]), evidenceRefs: ['model/badge-binding.json']},
      {id: 'tip-binding', relationId: 'tip-offset', surfaceAnchorId: 'tip-target', subjectAnchorFrame: I(), evidenceRefs: ['model/tip-binding.json']},
    ],
    evidenceRefs: ['source/assembly.png'],
  });
  const hingeJoint = createArticulatedJoint({
    attachmentSemantics,
    id: 'hinge-revolute',
    relationId: 'hinge-joint',
    ownerJointFrame: I(),
    subjectJointFrame: I(),
    minimumAngle: -Math.PI / 2,
    maximumAngle: Math.PI / 2,
    evidenceRefs: ['model/hinge-joint.json'],
  });

  const rootState = D('1'), noseState = D('2'), leftState = D('3'), rightState = D('4'), panelState = D('5');
  const noseFrame = I(), leftFrame = I(), rightFrame = I(), panelFrame = I([0, 0, 2]);
  const expectedHingeFrame = I([0, 0, 1]);
  const externalFrameBindings = [
    {entityId: 'root-shell', stateDigest: rootState, frameDigest: rigidFrameDigest(rootFrame), ownerFrameDigests: [], evidenceRefs: ['model/root-frame.json']},
    {entityId: 'nose', stateDigest: noseState, frameDigest: rigidFrameDigest(noseFrame), ownerFrameDigests: [{ownerId: 'root-shell', frameDigest: rigidFrameDigest(fusedOwnerFrame)}], evidenceRefs: ['model/nose-frame.json']},
    {entityId: 'left-ear', stateDigest: leftState, frameDigest: rigidFrameDigest(leftFrame), ownerFrameDigests: [{ownerId: 'root-shell', frameDigest: rigidFrameDigest(fusedOwnerFrame)}], evidenceRefs: ['model/left-frame.json']},
    {entityId: 'right-ear', stateDigest: rightState, frameDigest: rigidFrameDigest(rightFrame), ownerFrameDigests: [{ownerId: 'root-shell', frameDigest: rigidFrameDigest(fusedOwnerFrame)}], evidenceRefs: ['model/right-frame.json']},
    {entityId: 'panel', stateDigest: panelState, frameDigest: rigidFrameDigest(panelFrame), ownerFrameDigests: [{ownerId: 'hinge', frameDigest: rigidFrameDigest(expectedHingeFrame)}], evidenceRefs: ['model/panel-frame.json']},
  ];
  const plan = createAttachmentPropagationPlan({
    attachmentSemantics,
    id: 'assembly-propagation',
    surfaceAnchorSet,
    surfaces: surfaceDescriptors,
    followState,
    multiAnchorPlans: [glassesPlan],
    articulatedJoints: [hingeJoint],
    articulatedAngles: [{relationId: 'hinge-joint', angle, evidenceRefs: ['model/hinge-angle.json']}],
    externalFrameBindings,
    evidenceRefs: ['source/assembly.png'],
  });
  const initialWorldFrames = [
    {entityId: 'root-shell', stateDigest: rootState, frame: rootFrame},
    {entityId: 'nose', stateDigest: noseState, frame: noseFrame},
    {entityId: 'left-ear', stateDigest: leftState, frame: leftFrame},
    {entityId: 'right-ear', stateDigest: rightState, frame: rightFrame},
    {entityId: 'panel', stateDigest: panelState, frame: panelFrame},
  ];
  return {attachmentSemantics, surfaceDescriptors, surfaceAnchorSet, glassesPlan, followState, hingeJoint, plan, initialWorldFrames};
}

function run(fixture) {
  return propagateAttachmentGraph({
    plan: fixture.plan,
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
    initialWorldFrames: fixture.initialWorldFrames,
    evidenceRefs: ['reviews/propagation.json'],
  });
}

test('attachment propagation resolves multi-anchor, rigid follow, articulation, and surface offset in DAG order', () => {
  const fixture = build();
  const report = run(fixture);
  assert.equal(report.status, 'READY_FOR_REALIZATION');
  assert.equal(report.eligibleForRealization, true);
  assert.deepEqual(report.pendingRealizedValidationRelationIds, ['panel-clearance']);
  assert.ok(report.topologicalEntityOrder.indexOf('glasses') < report.topologicalEntityOrder.indexOf('badge'));
  assert.ok(report.topologicalEntityOrder.indexOf('badge') < report.topologicalEntityOrder.indexOf('hinge'));
  assert.ok(report.topologicalEntityOrder.indexOf('hinge') < report.topologicalEntityOrder.indexOf('tip'));

  const byId = new Map(report.entityResults.map((result) => [result.entityId, result]));
  assert.equal(byId.get('glasses').status, 'RESOLVED');
  assert.deepEqual(byId.get('glasses').worldFrame.origin.map((v) => Math.round(v * 1e8) / 1e8), [0, 0, 0]);
  assert.deepEqual(byId.get('badge').worldFrame.origin.map((v) => Math.round(v * 1e8) / 1e8), [0, 0, 1]);
  assert.deepEqual(byId.get('hinge').worldFrame.origin.map((v) => Math.round(v * 1e8) / 1e8), [0, 0, 1]);
  assert.ok(Math.abs(byId.get('tip').worldFrame.origin[2] - 1.2) < 1e-8);
  assert.equal(byId.get('panel').status, 'PENDING_REALIZED_VALIDATION');
  assert.equal(byId.get('panel').requiresRealizedValidation, true);
  assert.equal(report.blockers.length, 0);
  assert.equal(validateAttachmentPropagationPlan(fixture.plan, {
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
  }).valid, true);
  assert.equal(validateAttachmentPropagationReport(report, {
    plan: fixture.plan,
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
  }).valid, true);
});

test('stale FUSED external state is rejected when its owner frame changed', () => {
  const fixture = build({rootFrame: I([1, 0, 0]), fusedOwnerFrame: I()});
  const report = run(fixture);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.eligibleForRealization, false);
  assert.ok(report.blockers.some((item) => item.code === 'STALE_OWNER_FRAME' && item.entityId === 'nose'));
  assert.ok(report.blockers.some((item) => item.code === 'UNRESOLVED_OWNER' && item.entityId === 'glasses'));
});

test('an infeasible multi-anchor result is not propagated to downstream dependents', () => {
  const fixture = build({noseZ: -1});
  const report = run(fixture);
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.blockers.some((item) => item.code === 'INFEASIBLE_MULTI_ANCHOR' && item.entityId === 'glasses'));
  assert.equal(report.entityResults.find((item) => item.entityId === 'glasses').worldFrame, null);
  assert.ok(report.blockers.some((item) => item.code === 'UNRESOLVED_OWNER' && item.entityId === 'badge'));
});

test('out-of-limit articulation fails closed and blocks downstream surface followers', () => {
  const fixture = build({angle: Math.PI});
  const report = run(fixture);
  assert.equal(report.status, 'BLOCKED');
  const hingeBlocker = report.blockers.find((item) => item.entityId === 'hinge');
  assert.equal(hingeBlocker.code, 'SOLVER_FAILED');
  assert.match(hingeBlocker.message, /outside articulated joint limits/);
  assert.ok(report.blockers.some((item) => item.code === 'UNRESOLVED_OWNER' && item.entityId === 'tip'));
});

test('solved relations cannot be bypassed with caller-supplied world frames and digests are tamper evident', () => {
  const fixture = build();
  assert.throws(() => propagateAttachmentGraph({
    plan: fixture.plan,
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
    initialWorldFrames: [...fixture.initialWorldFrames, {entityId: 'glasses', stateDigest: D('6'), frame: I([99, 99, 99])}],
  }), /may cover exactly the external-frame entities/);

  const badPlan = structuredClone(fixture.plan);
  badPlan.topologicalEntityOrder.reverse();
  assert.equal(validateAttachmentPropagationPlan(badPlan, {
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
  }).valid, false);

  const report = run(fixture);
  const badReport = structuredClone(report);
  badReport.entityResults.find((item) => item.entityId === 'badge').worldFrame.origin[2] = 99;
  assert.equal(validateAttachmentPropagationReport(badReport, {
    plan: fixture.plan,
    attachmentSemantics: fixture.attachmentSemantics,
    surfaceAnchorSet: fixture.surfaceAnchorSet,
    surfaces: fixture.surfaceDescriptors,
    followState: fixture.followState,
    multiAnchorPlans: [fixture.glassesPlan],
    articulatedJoints: [fixture.hingeJoint],
  }).valid, false);
});

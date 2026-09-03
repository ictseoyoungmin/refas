import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAttachmentFollowState,
  createAttachmentSemantics,
  createSurfaceAnchorSet,
  propagateAttachmentFollow,
  validateAttachmentFollowReport,
  validateAttachmentFollowState,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const Z90 = (origin = [0, 0, 0]) => ({origin, xAxis: [0, 1, 0], yAxis: [-1, 0, 0], zAxis: [0, 0, 1]});

function fixture() {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'forearm-module',
    sourceSha256: D(),
    entities: [E('forearm'), E('cuff'), E('badge')],
    relations: [
      R('forearm-free', 'FREE', 'forearm'),
      R('cuff-follow', 'RIGID_FOLLOW', 'cuff', ['forearm']),
      R('badge-offset', 'SURFACE_OFFSET', 'badge', ['forearm']),
    ],
  });
  const surfaces = [{
    ownerId: 'forearm',
    geometryDigest: D('b'),
    vertices: [[-1, -1, .2], [1, -1, .2], [0, 1, .2]],
    triangles: [{id: 'forearm-front-tri', patchId: 'forearm-front', indices: [0, 1, 2]}],
  }];
  const surfaceAnchorSet = createSurfaceAnchorSet({
    attachmentSemantics,
    surfaces,
    anchors: [{
      id: 'badge-surface-anchor', relationId: 'badge-offset', subjectAnchorId: 'badge-contact', ownerId: 'forearm',
      patchId: 'forearm-front', triangleId: 'forearm-front-tri', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0],
      offset: .1, maxRebindDistance: .3, maxNormalDeviationRadians: .5, evidenceRefs: ['model/badge-anchor.json'],
    }],
  });
  return {attachmentSemantics, surfaces, surfaceAnchorSet};
}

function stateFixture() {
  const {attachmentSemantics, surfaces, surfaceAnchorSet} = fixture();
  const followState = createAttachmentFollowState({
    attachmentSemantics,
    surfaceAnchorSet,
    surfaces,
    bindings: [
      {
        id: 'cuff-follow-state', relationId: 'cuff-follow', subjectId: 'cuff', ownerId: 'forearm',
        baselineOwnerFrame: I(), baselineSubjectFrame: I([0, 1, 0]), evidenceRefs: ['model/cuff-follow.json'],
      },
      {
        id: 'badge-offset-state', relationId: 'badge-offset', subjectId: 'badge', ownerId: 'forearm',
        surfaceAnchorId: 'badge-surface-anchor', subjectAnchorFrame: I(), evidenceRefs: ['model/badge-offset.json'],
      },
    ],
  });
  return {attachmentSemantics, surfaces, surfaceAnchorSet, followState};
}

test('rigid follow preserves the baseline owner-relative frame after owner translation and rotation', () => {
  const {attachmentSemantics, surfaces, surfaceAnchorSet, followState} = stateFixture();
  assert.equal(validateAttachmentFollowState(followState, {attachmentSemantics, surfaceAnchorSet, surfaces}).valid, true);
  const report = propagateAttachmentFollow({
    followState, attachmentSemantics, surfaceAnchorSet, surfaces,
    ownerWorldFrames: [{entityId: 'forearm', frame: Z90([2, 0, 0])}],
  });
  const cuff = report.targets.find((target) => target.subjectId === 'cuff');
  assert.deepEqual(cuff.worldFrame.origin.map((value) => Math.round(value * 1e9) / 1e9), [1, 0, 0]);
  assert.deepEqual(cuff.worldFrame.xAxis, [0, 1, 0]);
  assert.deepEqual(cuff.worldFrame.yAxis, [-1, 0, 0]);
  assert.equal(report.policy.meshBytesAreNotMutated, true);
  assert.equal(validateAttachmentFollowReport(report, {followState, attachmentSemantics, surfaceAnchorSet, surfaces}).valid, true);
});

test('surface offset places the dependent from the owner surface frame, orientation, and signed offset', () => {
  const {attachmentSemantics, surfaces, surfaceAnchorSet, followState} = stateFixture();
  const report = propagateAttachmentFollow({
    followState, attachmentSemantics, surfaceAnchorSet, surfaces,
    ownerWorldFrames: [{entityId: 'forearm', frame: Z90([2, 0, 0])}],
  });
  const badge = report.targets.find((target) => target.subjectId === 'badge');
  assert.deepEqual(badge.worldFrame.origin.map((value) => Math.round(value * 1e9) / 1e9), [2, 0, .3]);
  assert.deepEqual(badge.worldFrame.xAxis, [0, 1, 0]);
  assert.deepEqual(badge.worldFrame.yAxis, [-1, 0, 0]);
  assert.deepEqual(badge.worldFrame.zAxis, [0, 0, 1]);
  assert.equal(badge.surfaceAnchorId, 'badge-surface-anchor');
});

test('a non-zero subject-local anchor is inverted so the contact point, not subject origin, matches the surface', () => {
  const {attachmentSemantics, surfaces, surfaceAnchorSet} = fixture();
  const followState = createAttachmentFollowState({
    attachmentSemantics, surfaceAnchorSet, surfaces,
    bindings: [{
      id: 'badge-offset-state', relationId: 'badge-offset', subjectId: 'badge', ownerId: 'forearm', surfaceAnchorId: 'badge-surface-anchor',
      subjectAnchorFrame: I([0, 0, -.05]), evidenceRefs: ['model/badge-offset.json'],
    }],
  });
  const report = propagateAttachmentFollow({followState, attachmentSemantics, surfaceAnchorSet, surfaces, ownerWorldFrames: [{entityId: 'forearm', frame: I()}]});
  const badge = report.targets[0];
  assert.ok(Math.abs(badge.worldFrame.origin[2] - .35) < 1e-9);
});

test('follow propagation is one-step and fails closed without an explicit owner world frame', () => {
  const {attachmentSemantics, surfaces, surfaceAnchorSet, followState} = stateFixture();
  assert.throws(() => propagateAttachmentFollow({followState, attachmentSemantics, surfaceAnchorSet, surfaces, ownerWorldFrames: []}), /missing required owner forearm/);
  assert.equal(followState.policy.oneStepPropagationOnly, true);
  assert.equal(followState.policy.graphOrderingDeferred, true);
});

test('multi-anchor relations are not silently approximated by the single-owner follow primitive', () => {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'head', sourceSha256: D('c'), entities: [E('nose'), E('left-ear'), E('glasses')],
    relations: [R('nose-free', 'FREE', 'nose'), R('ear-free', 'FREE', 'left-ear'), R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose', 'left-ear'])],
  });
  assert.throws(() => createAttachmentFollowState({
    attachmentSemantics,
    bindings: [{id: 'bad-follow', relationId: 'glasses-fit', subjectId: 'glasses', ownerId: 'nose', baselineOwnerFrame: I(), baselineSubjectFrame: I(), evidenceRefs: ['bad.json']}],
  }), /not handled by follow propagation/);
});

test('follow state and report are digest-bound and tamper detectable', () => {
  const {attachmentSemantics, surfaces, surfaceAnchorSet, followState} = stateFixture();
  const tamperedState = structuredClone(followState);
  tamperedState.bindings[0].relativeFrame.origin = [99, 99, 99];
  assert.equal(validateAttachmentFollowState(tamperedState, {attachmentSemantics, surfaceAnchorSet, surfaces}).valid, false);

  const report = propagateAttachmentFollow({followState, attachmentSemantics, surfaceAnchorSet, surfaces, ownerWorldFrames: [{entityId: 'forearm', frame: I()}]});
  const tamperedReport = structuredClone(report);
  tamperedReport.targets[0].worldFrame.origin = [42, 0, 0];
  assert.equal(validateAttachmentFollowReport(tamperedReport, {followState, attachmentSemantics, surfaceAnchorSet, surfaces}).valid, false);
});

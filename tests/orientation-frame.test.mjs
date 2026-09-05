import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createOrientationEvidenceSet,
  orientationFrameResidual,
  propagateOrientationChain,
  relativeRigidFrame,
  resolveOrientedFrame,
  validateOrientationEvidenceSet,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

test('orientation evidence preserves facing and twist without inventing Euler angles', () => {
  const evidence = createOrientationEvidenceSet({
    scopeId: 'terminal-part', sourceSha256: D(), evidenceRefs: ['source/reference.png'],
    observations: [{
      id: 'terminal-orientation', entityId: 'terminal-part', parentId: 'parent-part',
      primaryAxis: {screenDirection: [0.62, -0.78]}, facing: 'downward', visiblePlane: 'edge-dominant',
      nearSide: 'keyed-side', relativeTwist: 'clockwise', confidence: 'high', evidenceRefs: ['crop:terminal'],
    }],
  });
  assert.equal(validateOrientationEvidenceSet(evidence).valid, true);
  assert.equal(evidence.observations[0].facing, 'downward');
  assert.equal(evidence.observations[0].relativeTwist, 'clockwise');
  assert.equal('rotation' in evidence.observations[0], false);
  assert.equal(evidence.policy.cameraRelativeEvidencePreferredOverInventedEulerAngles, true);
});

test('primary axis alone fails closed because roll remains underdetermined', () => {
  assert.throws(() => resolveOrientedFrame({primaryAxis: [0, 0, 1]}), /does not determine roll/);
});

test('same primary axis with wrong facing remains a large orientation mismatch', () => {
  const palmDown = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, -1, 0]});
  const palmCamera = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [1, 0, 0]});
  const residual = orientationFrameResidual(palmDown, palmCamera);
  assert.ok(residual.primaryAxisErrorRadians < 1e-10);
  assert.ok(Math.abs(residual.facingErrorRadians - Math.PI / 2) < 1e-10);
  assert.ok(Math.abs(residual.twistErrorRadians - Math.PI / 2) < 1e-10);
});

test('parent orientation may resolve roll only through an explicit inheritance policy', () => {
  const parent = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, 1, 0]});
  assert.throws(() => resolveOrientedFrame({primaryAxis: [1, 0, 0], parentFrame: parent}), /does not determine roll/);
  const child = resolveOrientedFrame({primaryAxis: [1, 0, 0], parentFrame: parent, ambiguityPolicy: 'inherit-parent-facing'});
  assert.deepEqual(child.yAxis.map((v) => Math.round(v)), [0, 1, 0]);
});

test('parent-child orientation propagation preserves the declared relative frame', () => {
  const root = resolveOrientedFrame({primaryAxis: [0, 0, 1], facingHint: [0, 1, 0]});
  const forearmWorld = resolveOrientedFrame({origin: [0, 0, 1], primaryAxis: [1, 0, 0], facingHint: [0, 1, 0]});
  const palmWorld = resolveOrientedFrame({origin: [1, 0, 1], primaryAxis: [1, 0, 0], facingHint: [0, 0, -1]});
  const forearmRelative = relativeRigidFrame(root, forearmWorld);
  const palmRelative = relativeRigidFrame(forearmWorld, palmWorld);
  const frames = propagateOrientationChain({rootId: 'root', rootFrame: root, links: [
    {parentId: 'root', childId: 'forearm', relativeFrame: forearmRelative},
    {parentId: 'forearm', childId: 'palm', relativeFrame: palmRelative},
  ]});
  const residual = orientationFrameResidual(palmWorld, frames.palm);
  assert.ok(residual.primaryAxisErrorRadians < 1e-10);
  assert.ok(residual.facingErrorRadians < 1e-10);
  assert.ok(residual.twistErrorRadians < 1e-10);
});

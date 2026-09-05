import {deepFreeze} from './canonical.mjs';
import {composeRigidFrames, invertRigidFrame, normalizeRigidFrame} from './attachment-follow.mjs';

const EPS = 1e-9;
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((value, index) => value - b[index]);
const mul = (a, scalar) => a.map((value) => value * scalar);
const magnitude = (a) => Math.sqrt(dot(a, a));

function vec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain 3 numbers`);
  const output = value.map(Number);
  if (!output.every(Number.isFinite)) throw new Error(`${label} must contain finite numbers`);
  return output;
}

function unit(value, label) {
  const vector = vec3(value, label), size = magnitude(vector);
  if (!(size > EPS)) throw new Error(`${label} must have non-zero length`);
  return mul(vector, 1 / size);
}

function projectPerpendicular(hint, axis, label, {allowDegenerate = false} = {}) {
  const raw = vec3(hint, label);
  const projected = sub(raw, mul(axis, dot(raw, axis)));
  const size = magnitude(projected);
  if (!(size > EPS)) {
    if (allowDegenerate) return null;
    throw new Error(`${label} is parallel to the primary axis and cannot determine roll`);
  }
  return mul(projected, 1 / size);
}

function perpendicularHint(hint, axis, label) {
  return projectPerpendicular(hint, axis, label);
}

/**
 * Resolve a right-handed local frame from a longitudinal axis plus a second
 * orientation cue. The function intentionally has no implicit global-up
 * fallback: axis-only input leaves roll underdetermined and fails closed.
 */
export function resolveOrientedFrame({
  origin = [0, 0, 0],
  primaryAxis,
  facingHint = null,
  lateralHint = null,
  parentFrame = null,
  ambiguityPolicy = 'reject',
} = {}) {
  const zAxis = unit(primaryAxis, 'primaryAxis');
  let yAxis = null, xAxis = null;

  if (facingHint != null) {
    yAxis = perpendicularHint(facingHint, zAxis, 'facingHint');
    xAxis = unit(cross(yAxis, zAxis), 'resolved lateral axis');
    if (lateralHint != null) {
      const lateral = perpendicularHint(lateralHint, zAxis, 'lateralHint');
      if (dot(xAxis, lateral) < 1 - 1e-5) throw new Error('facingHint and lateralHint specify inconsistent handedness/roll');
    }
  } else if (lateralHint != null) {
    xAxis = perpendicularHint(lateralHint, zAxis, 'lateralHint');
    yAxis = unit(cross(zAxis, xAxis), 'resolved facing axis');
  } else if (parentFrame != null && ambiguityPolicy !== 'reject') {
    const parent = normalizeRigidFrame(parentFrame, 'parentFrame');
    if (ambiguityPolicy === 'inherit-parent-facing') {
      yAxis = perpendicularHint(parent.yAxis, zAxis, 'parentFrame.yAxis');
      xAxis = unit(cross(yAxis, zAxis), 'inherited lateral axis');
    } else if (ambiguityPolicy === 'inherit-parent-lateral') {
      xAxis = perpendicularHint(parent.xAxis, zAxis, 'parentFrame.xAxis');
      yAxis = unit(cross(zAxis, xAxis), 'inherited facing axis');
    } else {
      throw new Error('ambiguityPolicy must be reject, inherit-parent-facing, or inherit-parent-lateral');
    }
  } else {
    throw new Error('primaryAxis alone does not determine roll; provide facingHint/lateralHint or an explicit parent inheritance policy');
  }

  return deepFreeze(normalizeRigidFrame({origin: vec3(origin, 'origin'), xAxis, yAxis, zAxis}, 'orientedFrame'));
}

export function relativeRigidFrame(parentFrame, childFrame) {
  return deepFreeze(composeRigidFrames(invertRigidFrame(parentFrame), childFrame));
}

export function propagateOrientationChain({rootId, rootFrame, links = []} = {}) {
  const id = String(rootId ?? '').trim();
  if (!id) throw new Error('rootId is required');
  const frames = new Map([[id, normalizeRigidFrame(rootFrame, 'rootFrame')]]);
  const pending = links.map((raw, index) => ({
    parentId: String(raw?.parentId ?? ''),
    childId: String(raw?.childId ?? ''),
    relativeFrame: normalizeRigidFrame(raw?.relativeFrame, `links[${index}].relativeFrame`),
  }));
  if (pending.some((item) => !item.parentId || !item.childId || item.parentId === item.childId)) throw new Error('orientation-chain links require distinct parentId/childId');
  if (new Set(pending.map((item) => item.childId)).size !== pending.length) throw new Error('orientation-chain child IDs must be unique');

  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const link = pending[index], parent = frames.get(link.parentId);
      if (!parent) continue;
      if (frames.has(link.childId)) throw new Error(`orientation-chain would overwrite frame ${link.childId}`);
      frames.set(link.childId, composeRigidFrames(parent, link.relativeFrame));
      pending.splice(index, 1);
      progress = true;
    }
  }
  if (pending.length) throw new Error(`orientation-chain contains an unreachable parent or cycle: ${pending.map((item) => `${item.parentId}->${item.childId}`).join(', ')}`);
  return deepFreeze(Object.fromEntries([...frames.entries()].sort(([a], [b]) => a.localeCompare(b))));
}

function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(unit(a, 'axisA'), unit(b, 'axisB')))));
}

/**
 * Compare two valid full frames without assuming their primary axes are close.
 * Twist is measured around the reference primary axis. When the candidate
 * facing becomes parallel to that axis, twist is geometrically undefined; the
 * residual records a bounded pi/2 ambiguity penalty instead of throwing.
 */
export function orientationFrameResidual(referenceFrame, candidateFrame) {
  const reference = normalizeRigidFrame(referenceFrame, 'referenceFrame');
  const candidate = normalizeRigidFrame(candidateFrame, 'candidateFrame');
  const primaryAxisErrorRadians = angleBetween(reference.zAxis, candidate.zAxis);
  const facingErrorRadians = angleBetween(reference.yAxis, candidate.yAxis);
  const lateralErrorRadians = angleBetween(reference.xAxis, candidate.xAxis);
  const projectedFacing = projectPerpendicular(candidate.yAxis, reference.zAxis, 'candidateFrame.yAxis', {allowDegenerate: true});
  const twistErrorRadians = projectedFacing == null ? Math.PI / 2 : Math.abs(Math.atan2(
    dot(reference.zAxis, cross(reference.yAxis, projectedFacing)),
    Math.max(-1, Math.min(1, dot(reference.yAxis, projectedFacing))),
  ));
  return deepFreeze({primaryAxisErrorRadians, facingErrorRadians, lateralErrorRadians, twistErrorRadians});
}

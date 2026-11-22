import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {composeRigidFrames, normalizeRigidFrame} from './attachment-follow.mjs';
import {validateSurfaceAnchorSet} from './surface-anchor.mjs';

export const MULTI_ANCHOR_PLAN_SCHEMA = 'refas.multi-anchor-plan/v1';
export const MULTI_ANCHOR_REPORT_SCHEMA = 'refas.multi-anchor-report/v1';

const EPS = 1e-10;
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();
const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const mul = (a, scalar) => a.map((value) => value * scalar);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const length = (a) => Math.sqrt(dot(a, a));

function positive(value, label, {allowZero = false} = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`${label} must be ${allowZero ? '>= 0' : '> 0'}`);
  return number;
}

function relationFor(attachmentSemantics, relationId) {
  return attachmentSemantics.relations.find((relation) => relation.id === relationId) ?? null;
}

function surfaceAnchorFrame(anchor) {
  return normalizeRigidFrame({
    origin: anchor.frame.offsetPosition,
    xAxis: anchor.frame.tangent,
    yAxis: anchor.frame.bitangent,
    zAxis: anchor.frame.normal,
  }, `surfaceAnchor:${anchor.id}`);
}

function normalizeConstraint(raw, index, relation) {
  const label = `constraints[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const ownerId = assertId(raw?.ownerId, `${label}.ownerId`);
  if (!relation.ownerIds.includes(ownerId)) throw new Error(`${label}.ownerId is not declared by the multi-anchor relation`);
  const surfaceAnchorId = assertId(raw?.surfaceAnchorId, `${label}.surfaceAnchorId`);
  const subjectAnchorId = assertId(raw?.subjectAnchorId, `${label}.subjectAnchorId`);
  const subjectAnchorFrame = normalizeRigidFrame(raw?.subjectAnchorFrame, `${label}.subjectAnchorFrame`);
  const positionWeight = positive(raw?.positionWeight ?? 1, `${label}.positionWeight`);
  const orientationWeight = positive(raw?.orientationWeight ?? 0, `${label}.orientationWeight`, {allowZero: true});
  const maxPositionError = positive(raw?.maxPositionError, `${label}.maxPositionError`);
  const maxOrientationErrorRadians = positive(raw?.maxOrientationErrorRadians ?? Math.PI, `${label}.maxOrientationErrorRadians`);
  if (maxOrientationErrorRadians > Math.PI) throw new Error(`${label}.maxOrientationErrorRadians must be <= pi`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one reference`);
  return {id, ownerId, surfaceAnchorId, subjectAnchorId, subjectAnchorFrame, positionWeight, orientationWeight, maxPositionError, maxOrientationErrorRadians, evidenceRefs};
}

function constraintSpec(constraint) {
  return {
    id: constraint.id,
    ownerId: constraint.ownerId,
    surfaceAnchorId: constraint.surfaceAnchorId,
    subjectAnchorId: constraint.subjectAnchorId,
    subjectAnchorFrame: constraint.subjectAnchorFrame,
    positionWeight: constraint.positionWeight,
    orientationWeight: constraint.orientationWeight,
    maxPositionError: constraint.maxPositionError,
    maxOrientationErrorRadians: constraint.maxOrientationErrorRadians,
    evidenceRefs: constraint.evidenceRefs,
  };
}

export function createMultiAnchorPlan({
  attachmentSemantics,
  id,
  relationId,
  subjectId,
  constraints = [],
  maximumRmsPositionError,
  orientationLever = 0.05,
  evidenceRefs = [],
} = {}) {
  const semanticsValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!semanticsValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticsValidation.errors.join('; ')}`);
  const normalizedRelationId = assertId(relationId, 'relationId');
  const relation = relationFor(attachmentSemantics, normalizedRelationId);
  if (!relation) throw new Error('multi-anchor plan references an unknown relation');
  if (relation.mode !== 'MULTI_ANCHOR') throw new Error(`relation ${relation.id} is ${relation.mode}, not MULTI_ANCHOR`);
  const normalizedSubjectId = assertId(subjectId ?? relation.subjectId, 'subjectId');
  if (normalizedSubjectId !== relation.subjectId) throw new Error('multi-anchor subject does not match relation subject');
  if (constraints.length < 2) throw new Error('multi-anchor plan requires at least two constraints');
  const normalizedConstraints = constraints.map((constraint, index) => normalizeConstraint(constraint, index, relation));
  if (new Set(normalizedConstraints.map((constraint) => constraint.id)).size !== normalizedConstraints.length) throw new Error('multi-anchor constraint IDs must be unique');
  if (new Set(normalizedConstraints.map((constraint) => constraint.surfaceAnchorId)).size !== normalizedConstraints.length) throw new Error('multi-anchor surface anchors must be unique');
  if (new Set(normalizedConstraints.map((constraint) => constraint.subjectAnchorId)).size !== normalizedConstraints.length) throw new Error('multi-anchor subject anchors must be unique');
  const coveredOwners = new Set(normalizedConstraints.map((constraint) => constraint.ownerId));
  const missingOwners = relation.ownerIds.filter((ownerId) => !coveredOwners.has(ownerId));
  if (missingOwners.length) throw new Error(`multi-anchor plan does not cover declared owner(s): ${missingOwners.join(', ')}`);
  const payload = {
    schema: MULTI_ANCHOR_PLAN_SCHEMA,
    id: assertId(id, 'id'),
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    relationId: normalizedRelationId,
    subjectId: normalizedSubjectId,
    constraints: normalizedConstraints.sort((a, b) => a.id.localeCompare(b.id)),
    maximumRmsPositionError: positive(maximumRmsPositionError, 'maximumRmsPositionError'),
    orientationLever: positive(orientationLever, 'orientationLever'),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      rigidTransformOnly: true,
      scaleForbidden: true,
      hiddenMeshDeformationForbidden: true,
      everyDeclaredOwnerMustBeCovered: true,
      currentSurfaceAnchorSetRequiredAtSolveTime: true,
      infeasibleSolutionCannotBeRealized: true,
      solverDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateMultiAnchorPlan(value, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== MULTI_ANCHOR_PLAN_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required to validate multi-anchor plan');
    const recreated = createMultiAnchorPlan({
      attachmentSemantics,
      id: value.id,
      relationId: value.relationId,
      subjectId: value.subjectId,
      constraints: (value.constraints ?? []).map(constraintSpec),
      maximumRmsPositionError: value.maximumRmsPositionError,
      orientationLever: value.orientationLever,
      evidenceRefs: value.evidenceRefs,
    });
    if (recreated.planDigest !== value.planDigest) errors.push('multi-anchor plan digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('multi-anchor plan is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function rotate(frame, vector) {
  return [0, 1, 2].map((axis) => frame.xAxis[axis] * vector[0] + frame.yAxis[axis] * vector[1] + frame.zAxis[axis] * vector[2]);
}

function transformPoint(frame, point) {
  return add(frame.origin, rotate(frame, point));
}

function weightedCentroid(points) {
  const total = points.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) throw new Error('multi-anchor correspondence weight must be positive');
  return [0, 1, 2].map((axis) => points.reduce((sum, item) => sum + item.weight * item.point[axis], 0) / total);
}

function jacobiLargestEigenvector4(input) {
  const a = input.map((row) => [...row]);
  const v = Array.from({length: 4}, (_, row) => Array.from({length: 4}, (_, column) => row === column ? 1 : 0));
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let p = 0, q = 1, maximum = Math.abs(a[0][1]);
    for (let row = 0; row < 4; row += 1) for (let column = row + 1; column < 4; column += 1) {
      const magnitude = Math.abs(a[row][column]);
      if (magnitude > maximum) { maximum = magnitude; p = row; q = column; }
    }
    if (maximum < 1e-13) break;
    const angle = .5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = 0; a[q][p] = 0;
    for (let k = 0; k < 4; k += 1) if (k !== p && k !== q) {
      const akp = a[k][p], akq = a[k][q];
      a[k][p] = a[p][k] = c * akp - s * akq;
      a[k][q] = a[q][k] = s * akp + c * akq;
    }
    for (let k = 0; k < 4; k += 1) {
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  let index = 0;
  for (let candidate = 1; candidate < 4; candidate += 1) if (a[candidate][candidate] > a[index][index]) index = candidate;
  let vector = v.map((row) => row[index]);
  const size = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!(size > EPS)) throw new Error('multi-anchor rigid fit produced a degenerate quaternion');
  vector = vector.map((value) => value / size);
  if (vector[0] < 0) vector = vector.map((value) => -value);
  return vector;
}

function quaternionFrame([w, x, y, z], origin) {
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r02 = 2 * (x * z + y * w);
  const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
  const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
  return normalizeRigidFrame({origin, xAxis: [r00, r10, r20], yAxis: [r01, r11, r21], zAxis: [r02, r12, r22]}, 'multiAnchorWorldFrame');
}

function fitRigid(correspondences) {
  const sourceItems = correspondences.map((item) => ({point: item.source, weight: item.weight}));
  const targetItems = correspondences.map((item) => ({point: item.target, weight: item.weight}));
  const sourceCenter = weightedCentroid(sourceItems), targetCenter = weightedCentroid(targetItems);
  const s = Array.from({length: 3}, () => [0, 0, 0]);
  for (const item of correspondences) {
    const p = sub(item.source, sourceCenter), q = sub(item.target, targetCenter);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) s[row][column] += item.weight * p[row] * q[column];
  }
  const [[sxx, sxy, sxz], [syx, syy, syz], [szx, szy, szz]] = s;
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const quaternion = jacobiLargestEigenvector4(n);
  const rotationOnly = quaternionFrame(quaternion, [0, 0, 0]);
  const origin = sub(targetCenter, rotate(rotationOnly, sourceCenter));
  return {worldFrame: quaternionFrame(quaternion, origin), quaternion};
}

function angleBetween(a, b) {
  const denominator = length(a) * length(b);
  if (!(denominator > EPS)) return Math.PI;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / denominator)));
}

function currentSurfaceAnchors(surfaceAnchorSet) {
  return new Map(surfaceAnchorSet.anchors.map((anchor) => [anchor.id, anchor]));
}

function ownerFrameMap(ownerWorldFrames = []) {
  const normalized = ownerWorldFrames.map((entry, index) => ({
    entityId: assertId(entry?.entityId, `ownerWorldFrames[${index}].entityId`),
    frame: normalizeRigidFrame(entry?.frame, `ownerWorldFrames[${index}].frame`),
  }));
  if (new Set(normalized.map((entry) => entry.entityId)).size !== normalized.length) throw new Error('ownerWorldFrames entity IDs must be unique');
  return {normalized: normalized.sort((a, b) => a.entityId.localeCompare(b.entityId)), map: new Map(normalized.map((entry) => [entry.entityId, entry.frame]))};
}

function correspondencesFor(plan, anchors, ownerFrames) {
  const correspondences = [];
  const targets = new Map();
  for (const constraint of plan.constraints) {
    const anchor = anchors.get(constraint.surfaceAnchorId);
    if (!anchor) throw new Error(`surface anchor ${constraint.surfaceAnchorId} is missing`);
    if (anchor.relationId !== plan.relationId || anchor.ownerId !== constraint.ownerId) throw new Error(`surface anchor ${constraint.surfaceAnchorId} is not bound to constraint owner/relation`);
    const ownerWorld = ownerFrames.get(constraint.ownerId);
    if (!ownerWorld) throw new Error(`ownerWorldFrames is missing declared owner ${constraint.ownerId}`);
    const targetFrame = composeRigidFrames(ownerWorld, surfaceAnchorFrame(anchor));
    targets.set(constraint.id, targetFrame);
    correspondences.push({source: constraint.subjectAnchorFrame.origin, target: targetFrame.origin, weight: constraint.positionWeight});
    if (constraint.orientationWeight > 0) {
      for (const axisName of ['xAxis', 'zAxis']) {
        correspondences.push({
          source: add(constraint.subjectAnchorFrame.origin, mul(constraint.subjectAnchorFrame[axisName], plan.orientationLever)),
          target: add(targetFrame.origin, mul(targetFrame[axisName], plan.orientationLever)),
          weight: constraint.orientationWeight,
        });
      }
    }
  }
  if (correspondences.length < 3) throw new Error('multi-anchor rigid fit requires at least three effective correspondences');
  return {correspondences, targets};
}

export function solveMultiAnchor({plan, attachmentSemantics, surfaceAnchorSet, surfaces = [], ownerWorldFrames = [], evidenceRefs = []} = {}) {
  const planValidation = validateMultiAnchorPlan(plan, attachmentSemantics);
  if (!planValidation.valid) throw new Error(`multi-anchor plan is invalid: ${planValidation.errors.join('; ')}`);
  const anchorValidation = validateSurfaceAnchorSet(surfaceAnchorSet, attachmentSemantics, surfaces);
  if (!anchorValidation.valid) throw new Error(`surface anchor set is invalid: ${anchorValidation.errors.join('; ')}`);
  const anchors = currentSurfaceAnchors(surfaceAnchorSet);
  const owners = ownerFrameMap(ownerWorldFrames);
  const {correspondences, targets} = correspondencesFor(plan, anchors, owners.map);
  const fit = fitRigid(correspondences);
  const constraintResults = plan.constraints.map((constraint) => {
    const targetFrame = targets.get(constraint.id);
    const predictedFrame = composeRigidFrames(fit.worldFrame, constraint.subjectAnchorFrame);
    const positionError = length(sub(predictedFrame.origin, targetFrame.origin));
    const tangentErrorRadians = angleBetween(predictedFrame.xAxis, targetFrame.xAxis);
    const normalErrorRadians = angleBetween(predictedFrame.zAxis, targetFrame.zAxis);
    const orientationErrorRadians = Math.max(tangentErrorRadians, normalErrorRadians);
    return {
      constraintId: constraint.id,
      ownerId: constraint.ownerId,
      surfaceAnchorId: constraint.surfaceAnchorId,
      subjectAnchorId: constraint.subjectAnchorId,
      targetPosition: targetFrame.origin,
      realizedPosition: predictedFrame.origin,
      positionError,
      orientationErrorRadians,
      positionPass: positionError <= constraint.maxPositionError,
      orientationPass: constraint.orientationWeight === 0 || orientationErrorRadians <= constraint.maxOrientationErrorRadians,
    };
  }).sort((a, b) => a.constraintId.localeCompare(b.constraintId));
  const weightedSquared = constraintResults.reduce((sum, result) => {
    const constraint = plan.constraints.find((item) => item.id === result.constraintId);
    return sum + constraint.positionWeight * result.positionError * result.positionError;
  }, 0);
  const totalPositionWeight = plan.constraints.reduce((sum, constraint) => sum + constraint.positionWeight, 0);
  const rmsPositionError = Math.sqrt(weightedSquared / totalPositionWeight);
  const eligibleForRealization = rmsPositionError <= plan.maximumRmsPositionError && constraintResults.every((result) => result.positionPass && result.orientationPass);
  const payload = {
    schema: MULTI_ANCHOR_REPORT_SCHEMA,
    planDigest: plan.planDigest,
    scopeId: plan.scopeId,
    sourceSha256: plan.sourceSha256,
    attachmentSemanticsDigest: plan.attachmentSemanticsDigest,
    surfaceAnchorSetDigest: surfaceAnchorSet.anchorSetDigest,
    ownerWorldFrames: owners.normalized,
    status: eligibleForRealization ? 'SOLVED' : 'INFEASIBLE',
    subjectId: plan.subjectId,
    worldFrame: fit.worldFrame,
    quaternion: fit.quaternion,
    rmsPositionError,
    maximumRmsPositionError: plan.maximumRmsPositionError,
    constraintResults,
    eligibleForRealization,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      rigidOnly: true,
      noScaleApplied: true,
      noMeshDeformationApplied: true,
      infeasibleResultCannotBeRealized: true,
      reportDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateMultiAnchorReport(value, {plan, attachmentSemantics, surfaceAnchorSet, surfaces = []} = {}) {
  const errors = [];
  try {
    if (value?.schema !== MULTI_ANCHOR_REPORT_SCHEMA) errors.push('invalid schema');
    const recreated = solveMultiAnchor({
      plan,
      attachmentSemantics,
      surfaceAnchorSet,
      surfaces,
      ownerWorldFrames: value?.ownerWorldFrames,
      evidenceRefs: value?.evidenceRefs,
    });
    if (recreated.reportDigest !== value.reportDigest) errors.push('multi-anchor report digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('multi-anchor report is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

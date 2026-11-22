import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {validateSurfaceAnchorSet} from './surface-anchor.mjs';

export const ATTACHMENT_FOLLOW_STATE_SCHEMA = 'refas.attachment-follow-state/v1';
export const ATTACHMENT_FOLLOW_REPORT_SCHEMA = 'refas.attachment-follow-report/v1';

const EPS = 1e-8;
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b) => a.map((value, index) => value + b[index]);
const mul = (a, scalar) => a.map((value) => value * scalar);

function finiteVec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain 3 numbers`);
  const output = value.map(Number);
  if (!output.every(Number.isFinite)) throw new Error(`${label} must contain finite numbers`);
  return output;
}

function magnitude(vector) {
  return Math.sqrt(dot(vector, vector));
}

function normalizeAxis(value, label) {
  const axis = finiteVec3(value, label);
  const size = magnitude(axis);
  if (!(size > EPS)) throw new Error(`${label} must have non-zero length`);
  return mul(axis, 1 / size);
}

export function normalizeRigidFrame(value, label = 'frame') {
  const origin = finiteVec3(value?.origin, `${label}.origin`);
  const xAxis = normalizeAxis(value?.xAxis, `${label}.xAxis`);
  const yAxis = normalizeAxis(value?.yAxis, `${label}.yAxis`);
  const zAxis = normalizeAxis(value?.zAxis, `${label}.zAxis`);
  if (Math.abs(dot(xAxis, yAxis)) > 1e-6 || Math.abs(dot(xAxis, zAxis)) > 1e-6 || Math.abs(dot(yAxis, zAxis)) > 1e-6) throw new Error(`${label} axes must be orthogonal`);
  if (dot(cross(xAxis, yAxis), zAxis) < 1 - 1e-6) throw new Error(`${label} must be right-handed`);
  return {origin, xAxis, yAxis, zAxis};
}

function rotate(frame, vector) {
  return [0, 1, 2].map((axis) => frame.xAxis[axis] * vector[0] + frame.yAxis[axis] * vector[1] + frame.zAxis[axis] * vector[2]);
}

export function composeRigidFrames(parent, child) {
  const a = normalizeRigidFrame(parent, 'parentFrame');
  const b = normalizeRigidFrame(child, 'childFrame');
  return normalizeRigidFrame({
    origin: add(a.origin, rotate(a, b.origin)),
    xAxis: rotate(a, b.xAxis),
    yAxis: rotate(a, b.yAxis),
    zAxis: rotate(a, b.zAxis),
  }, 'composedFrame');
}

export function invertRigidFrame(frame) {
  const f = normalizeRigidFrame(frame);
  const inverseRotation = {
    xAxis: [f.xAxis[0], f.yAxis[0], f.zAxis[0]],
    yAxis: [f.xAxis[1], f.yAxis[1], f.zAxis[1]],
    zAxis: [f.xAxis[2], f.yAxis[2], f.zAxis[2]],
  };
  const inverse = normalizeRigidFrame({origin: [0, 0, 0], ...inverseRotation}, 'inverseRotation');
  inverse.origin = mul(rotate(inverse, f.origin), -1);
  return normalizeRigidFrame(inverse, 'inverseFrame');
}

function relativeFrame(ownerFrame, subjectFrame) {
  return composeRigidFrames(invertRigidFrame(ownerFrame), subjectFrame);
}

function relationMap(attachmentSemantics) {
  return new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation]));
}

function anchorMap(surfaceAnchorSet) {
  return new Map((surfaceAnchorSet?.anchors ?? []).map((anchor) => [anchor.id, anchor]));
}

function surfaceFrame(anchor) {
  return normalizeRigidFrame({
    origin: anchor.frame.offsetPosition,
    xAxis: anchor.frame.tangent,
    yAxis: anchor.frame.bitangent,
    zAxis: anchor.frame.normal,
  }, `surfaceAnchor:${anchor.id}`);
}

function normalizeBinding(raw, index, attachmentSemantics, surfaceAnchorSet) {
  const label = `bindings[${index}]`;
  const id = assertId(raw?.id, `${label}.id`);
  const relationId = assertId(raw?.relationId, `${label}.relationId`);
  const relation = relationMap(attachmentSemantics).get(relationId);
  if (!relation) throw new Error(`${label}.relationId references an unknown attachment relation`);
  if (!['RIGID_FOLLOW', 'SURFACE_OFFSET'].includes(relation.mode)) throw new Error(`${label} relation mode ${relation.mode} is not handled by follow propagation`);
  const subjectId = assertId(raw?.subjectId ?? relation.subjectId, `${label}.subjectId`);
  const ownerId = assertId(raw?.ownerId ?? relation.ownerIds[0], `${label}.ownerId`);
  if (subjectId !== relation.subjectId) throw new Error(`${label}.subjectId does not match relation subject`);
  if (relation.ownerIds.length !== 1 || ownerId !== relation.ownerIds[0]) throw new Error(`${label}.ownerId does not match the relation owner`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one reference`);

  if (relation.mode === 'RIGID_FOLLOW') {
    const baselineOwnerFrame = normalizeRigidFrame(raw?.baselineOwnerFrame, `${label}.baselineOwnerFrame`);
    const baselineSubjectFrame = normalizeRigidFrame(raw?.baselineSubjectFrame, `${label}.baselineSubjectFrame`);
    return {
      id, relationId, mode: relation.mode, subjectId, ownerId,
      baselineOwnerFrame,
      baselineSubjectFrame,
      relativeFrame: relativeFrame(baselineOwnerFrame, baselineSubjectFrame),
      evidenceRefs,
    };
  }

  if (!surfaceAnchorSet) throw new Error(`${label} SURFACE_OFFSET requires a surface anchor set`);
  const surfaceAnchorId = assertId(raw?.surfaceAnchorId, `${label}.surfaceAnchorId`);
  const anchor = anchorMap(surfaceAnchorSet).get(surfaceAnchorId);
  if (!anchor) throw new Error(`${label}.surfaceAnchorId references an unknown surface anchor`);
  if (anchor.relationId !== relationId || anchor.ownerId !== ownerId) throw new Error(`${label}.surfaceAnchorId is not bound to this relation owner`);
  const subjectAnchorFrame = normalizeRigidFrame(raw?.subjectAnchorFrame, `${label}.subjectAnchorFrame`);
  return {
    id, relationId, mode: relation.mode, subjectId, ownerId,
    surfaceAnchorId,
    subjectAnchorFrame,
    evidenceRefs,
  };
}

function bindingSpec(binding) {
  if (binding.mode === 'RIGID_FOLLOW') return {
    id: binding.id,
    relationId: binding.relationId,
    subjectId: binding.subjectId,
    ownerId: binding.ownerId,
    baselineOwnerFrame: binding.baselineOwnerFrame,
    baselineSubjectFrame: binding.baselineSubjectFrame,
    evidenceRefs: binding.evidenceRefs,
  };
  return {
    id: binding.id,
    relationId: binding.relationId,
    subjectId: binding.subjectId,
    ownerId: binding.ownerId,
    surfaceAnchorId: binding.surfaceAnchorId,
    subjectAnchorFrame: binding.subjectAnchorFrame,
    evidenceRefs: binding.evidenceRefs,
  };
}

export function createAttachmentFollowState({attachmentSemantics, surfaceAnchorSet = null, surfaces = [], bindings = [], evidenceRefs = []} = {}) {
  const semanticValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!semanticValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticValidation.errors.join('; ')}`);
  if (!bindings.length) throw new Error('attachment follow state requires at least one binding');
  if (surfaceAnchorSet) {
    const anchorValidation = validateSurfaceAnchorSet(surfaceAnchorSet, attachmentSemantics, surfaces);
    if (!anchorValidation.valid) throw new Error(`surface anchor set is invalid: ${anchorValidation.errors.join('; ')}`);
  }
  const normalizedBindings = bindings.map((binding, index) => normalizeBinding(binding, index, attachmentSemantics, surfaceAnchorSet));
  if (new Set(normalizedBindings.map((binding) => binding.id)).size !== normalizedBindings.length) throw new Error('attachment follow binding IDs must be unique');
  if (new Set(normalizedBindings.map((binding) => binding.subjectId)).size !== normalizedBindings.length) throw new Error('one follow state may contain only one binding per subject');
  const needsSurface = normalizedBindings.some((binding) => binding.mode === 'SURFACE_OFFSET');
  if (needsSurface && !surfaceAnchorSet) throw new Error('SURFACE_OFFSET binding requires a surface anchor set');
  const payload = {
    schema: ATTACHMENT_FOLLOW_STATE_SCHEMA,
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    surfaceAnchorSetDigest: needsSurface ? surfaceAnchorSet.anchorSetDigest : null,
    bindings: normalizedBindings.sort((a, b) => a.id.localeCompare(b.id)),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      rigidFollowPreservesOwnerRelativeFrame: true,
      surfaceOffsetConsumesOwnerLocalSurfaceFrame: true,
      propagationProducesTargetsNotMeshMutation: true,
      oneStepPropagationOnly: true,
      graphOrderingDeferred: true,
      followPropagationDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, followStateDigest: digestJson(payload)});
}

export function validateAttachmentFollowState(value, {attachmentSemantics, surfaceAnchorSet = null, surfaces = []} = {}) {
  const errors = [];
  try {
    if (value?.schema !== ATTACHMENT_FOLLOW_STATE_SCHEMA) errors.push('invalid schema');
    const recreated = createAttachmentFollowState({
      attachmentSemantics,
      surfaceAnchorSet,
      surfaces,
      bindings: (value?.bindings ?? []).map(bindingSpec),
      evidenceRefs: value?.evidenceRefs,
    });
    if (recreated.followStateDigest !== value.followStateDigest) errors.push('attachment follow state digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('attachment follow state is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function normalizeOwnerFrameEntry(raw, index) {
  return {
    entityId: assertId(raw?.entityId, `ownerWorldFrames[${index}].entityId`),
    frame: normalizeRigidFrame(raw?.frame, `ownerWorldFrames[${index}].frame`),
  };
}

export function propagateAttachmentFollow({followState, attachmentSemantics, surfaceAnchorSet = null, surfaces = [], ownerWorldFrames = [], evidenceRefs = []} = {}) {
  const validation = validateAttachmentFollowState(followState, {attachmentSemantics, surfaceAnchorSet, surfaces});
  if (!validation.valid) throw new Error(`attachment follow state is invalid: ${validation.errors.join('; ')}`);
  const normalizedOwners = ownerWorldFrames.map(normalizeOwnerFrameEntry);
  if (new Set(normalizedOwners.map((entry) => entry.entityId)).size !== normalizedOwners.length) throw new Error('ownerWorldFrames entity IDs must be unique');
  const ownerFrames = new Map(normalizedOwners.map((entry) => [entry.entityId, entry.frame]));
  const anchors = anchorMap(surfaceAnchorSet);
  const targets = [];

  for (const binding of followState.bindings) {
    const ownerWorldFrame = ownerFrames.get(binding.ownerId);
    if (!ownerWorldFrame) throw new Error(`ownerWorldFrames is missing required owner ${binding.ownerId}`);
    let worldFrame;
    if (binding.mode === 'RIGID_FOLLOW') {
      worldFrame = composeRigidFrames(ownerWorldFrame, binding.relativeFrame);
    } else {
      const anchor = anchors.get(binding.surfaceAnchorId);
      if (!anchor) throw new Error(`surface anchor ${binding.surfaceAnchorId} is unavailable`);
      const targetAnchorWorld = composeRigidFrames(ownerWorldFrame, surfaceFrame(anchor));
      worldFrame = composeRigidFrames(targetAnchorWorld, invertRigidFrame(binding.subjectAnchorFrame));
    }
    targets.push({
      bindingId: binding.id,
      relationId: binding.relationId,
      mode: binding.mode,
      subjectId: binding.subjectId,
      ownerId: binding.ownerId,
      ...(binding.surfaceAnchorId ? {surfaceAnchorId: binding.surfaceAnchorId} : {}),
      worldFrame,
    });
  }

  const payload = {
    schema: ATTACHMENT_FOLLOW_REPORT_SCHEMA,
    scopeId: followState.scopeId,
    sourceSha256: followState.sourceSha256,
    attachmentSemanticsDigest: followState.attachmentSemanticsDigest,
    surfaceAnchorSetDigest: followState.surfaceAnchorSetDigest,
    followStateDigest: followState.followStateDigest,
    ownerWorldFrames: normalizedOwners.sort((a, b) => a.entityId.localeCompare(b.entityId)),
    targets: targets.sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      targetsAreDeterministic: true,
      meshBytesAreNotMutated: true,
      graphPropagationIsNotImplied: true,
      reportDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, followReportDigest: digestJson(payload)});
}

export function validateAttachmentFollowReport(value, {followState, attachmentSemantics, surfaceAnchorSet = null, surfaces = []} = {}) {
  const errors = [];
  try {
    if (value?.schema !== ATTACHMENT_FOLLOW_REPORT_SCHEMA) errors.push('invalid schema');
    const recreated = propagateAttachmentFollow({
      followState,
      attachmentSemantics,
      surfaceAnchorSet,
      surfaces,
      ownerWorldFrames: value?.ownerWorldFrames,
      evidenceRefs: value?.evidenceRefs,
    });
    if (recreated.followReportDigest !== value.followReportDigest) errors.push('attachment follow report digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('attachment follow report is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

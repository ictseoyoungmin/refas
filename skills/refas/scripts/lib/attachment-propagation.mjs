import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {
  createAttachmentFollowState,
  normalizeRigidFrame,
  propagateAttachmentFollow,
  validateAttachmentFollowState,
} from './attachment-follow.mjs';
import {solveMultiAnchor, validateMultiAnchorPlan} from './multi-anchor.mjs';
import {evaluateArticulatedJoint, validateArticulatedJoint} from './articulation-clearance.mjs';
import {validateSurfaceAnchorSet} from './surface-anchor.mjs';

export const ATTACHMENT_PROPAGATION_PLAN_SCHEMA = 'refas.attachment-propagation-plan/v1';
export const ATTACHMENT_PROPAGATION_REPORT_SCHEMA = 'refas.attachment-propagation-report/v1';

const SOLVED_MODES = new Set(['RIGID_FOLLOW', 'SURFACE_OFFSET', 'MULTI_ANCHOR', 'ARTICULATED']);
const EXTERNAL_MODES = new Set(['FREE', 'FUSED', 'SUPPORTED_CLEARANCE']);
const SURFACE_MODES = new Set(['SURFACE_OFFSET', 'MULTI_ANCHOR']);

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function evidence(value, label) {
  const refs = uniqueStrings(value);
  if (!refs.length) throw new Error(`${label} requires at least one evidence reference`);
  return refs;
}

function semanticsMaps(attachmentSemantics) {
  const validation = validateAttachmentSemantics(attachmentSemantics);
  if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
  return {
    byRelation: new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation])),
    bySubject: new Map(attachmentSemantics.relations.map((relation) => [relation.subjectId, relation])),
  };
}

function setEquals(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function requireExactRelationCoverage(actualIds, expectedIds, label) {
  const actual = new Set(actualIds), expected = new Set(expectedIds);
  if (actual.size !== actualIds.length) throw new Error(`${label} relation bindings must be unique`);
  if (!setEquals(actual, expected)) {
    const missing = [...expected].filter((id) => !actual.has(id));
    const extra = [...actual].filter((id) => !expected.has(id));
    throw new Error(`${label} relation coverage mismatch${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; extra ${extra.join(', ')}` : ''}`);
  }
}

function topologicalEntityOrder(attachmentSemantics) {
  const ids = attachmentSemantics.entities.map((entity) => entity.id).sort();
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const relation of attachmentSemantics.relations) {
    for (const ownerId of relation.ownerIds) {
      outgoing.get(ownerId).push(relation.subjectId);
      indegree.set(relation.subjectId, indegree.get(relation.subjectId) + 1);
    }
  }
  for (const values of outgoing.values()) values.sort();
  const ready = ids.filter((id) => indegree.get(id) === 0).sort();
  const ordered = [];
  while (ready.length) {
    const id = ready.shift();
    ordered.push(id);
    for (const dependent of outgoing.get(id)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (ordered.length !== ids.length) throw new Error('attachment propagation graph contains a cycle');
  return ordered;
}

export function rigidFrameDigest(frame) {
  return digestJson(normalizeRigidFrame(frame, 'frame'));
}

function normalizeOwnerFrameDigests(rawValues, relation, label) {
  const values = (rawValues ?? []).map((raw, index) => ({
    ownerId: assertId(raw?.ownerId, `${label}.ownerFrameDigests[${index}].ownerId`),
    frameDigest: assertDigest(raw?.frameDigest, `${label}.ownerFrameDigests[${index}].frameDigest`),
  })).sort((a, b) => a.ownerId.localeCompare(b.ownerId));
  if (new Set(values.map((item) => item.ownerId)).size !== values.length) throw new Error(`${label}.ownerFrameDigests owner IDs must be unique`);
  if (!setEquals(new Set(values.map((item) => item.ownerId)), new Set(relation.ownerIds))) throw new Error(`${label}.ownerFrameDigests must cover exactly the relation owners`);
  return values;
}

function normalizeExternalFrameBinding(raw, index, maps) {
  const label = `externalFrameBindings[${index}]`;
  const entityId = assertId(raw?.entityId, `${label}.entityId`);
  const relation = maps.bySubject.get(entityId);
  if (!relation) throw new Error(`${label}.entityId has no attachment relation`);
  if (!EXTERNAL_MODES.has(relation.mode)) throw new Error(`${label} may bind only FREE, FUSED, or SUPPORTED_CLEARANCE entities`);
  return {
    entityId,
    relationId: relation.id,
    mode: relation.mode,
    stateDigest: assertDigest(raw?.stateDigest, `${label}.stateDigest`),
    ownerFrameDigests: normalizeOwnerFrameDigests(raw?.ownerFrameDigests, relation, label),
    evidenceRefs: evidence(raw?.evidenceRefs, `${label}.evidenceRefs`),
  };
}

function followBindingInput(binding) {
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

function normalizeArticulatedAngles(values, expectedRelationIds) {
  const normalized = (values ?? []).map((raw, index) => {
    const relationId = assertId(raw?.relationId, `articulatedAngles[${index}].relationId`);
    const angle = Number(raw?.angle);
    if (!Number.isFinite(angle)) throw new Error(`articulatedAngles[${index}].angle must be finite`);
    return {relationId, angle, evidenceRefs: evidence(raw?.evidenceRefs, `articulatedAngles[${index}].evidenceRefs`)};
  }).sort((a, b) => a.relationId.localeCompare(b.relationId));
  requireExactRelationCoverage(normalized.map((item) => item.relationId), expectedRelationIds, 'articulated angle');
  return normalized;
}

function relationIdsByMode(attachmentSemantics, modes) {
  return attachmentSemantics.relations.filter((relation) => modes.has(relation.mode)).map((relation) => relation.id).sort();
}

export function createAttachmentPropagationPlan({
  attachmentSemantics,
  id,
  surfaceAnchorSet = null,
  surfaces = [],
  followState = null,
  multiAnchorPlans = [],
  articulatedJoints = [],
  articulatedAngles = [],
  externalFrameBindings = [],
  evidenceRefs = [],
} = {}) {
  const maps = semanticsMaps(attachmentSemantics);
  const followRelationIds = relationIdsByMode(attachmentSemantics, new Set(['RIGID_FOLLOW', 'SURFACE_OFFSET']));
  const multiRelationIds = relationIdsByMode(attachmentSemantics, new Set(['MULTI_ANCHOR']));
  const articulatedRelationIds = relationIdsByMode(attachmentSemantics, new Set(['ARTICULATED']));
  const externalEntityIds = attachmentSemantics.relations.filter((relation) => EXTERNAL_MODES.has(relation.mode)).map((relation) => relation.subjectId).sort();
  const needsSurfaceAnchors = attachmentSemantics.relations.some((relation) => SURFACE_MODES.has(relation.mode));

  if (needsSurfaceAnchors && !surfaceAnchorSet) throw new Error('attachment propagation plan requires the current surface anchor set');
  if (surfaceAnchorSet) {
    const anchorValidation = validateSurfaceAnchorSet(surfaceAnchorSet, attachmentSemantics, surfaces);
    if (!anchorValidation.valid) throw new Error(`surface anchor set is invalid: ${anchorValidation.errors.join('; ')}`);
  }

  if (followRelationIds.length) {
    if (!followState) throw new Error('attachment propagation plan requires attachment follow state');
    const validation = validateAttachmentFollowState(followState, {attachmentSemantics, surfaceAnchorSet, surfaces});
    if (!validation.valid) throw new Error(`attachment follow state is invalid: ${validation.errors.join('; ')}`);
    requireExactRelationCoverage(followState.bindings.map((binding) => binding.relationId), followRelationIds, 'follow state');
  } else if (followState) throw new Error('attachment propagation plan received unnecessary follow state');

  const normalizedMultiPlans = [...multiAnchorPlans].sort((a, b) => a.relationId.localeCompare(b.relationId));
  requireExactRelationCoverage(normalizedMultiPlans.map((plan) => plan.relationId), multiRelationIds, 'multi-anchor plan');
  for (const plan of normalizedMultiPlans) {
    const validation = validateMultiAnchorPlan(plan, attachmentSemantics);
    if (!validation.valid) throw new Error(`multi-anchor plan ${plan.id ?? plan.relationId} is invalid: ${validation.errors.join('; ')}`);
  }

  const normalizedJoints = [...articulatedJoints].sort((a, b) => a.relationId.localeCompare(b.relationId));
  requireExactRelationCoverage(normalizedJoints.map((joint) => joint.relationId), articulatedRelationIds, 'articulated joint');
  for (const joint of normalizedJoints) {
    const validation = validateArticulatedJoint(joint, attachmentSemantics);
    if (!validation.valid) throw new Error(`articulated joint ${joint.id ?? joint.relationId} is invalid: ${validation.errors.join('; ')}`);
  }
  const normalizedAngles = normalizeArticulatedAngles(articulatedAngles, articulatedRelationIds);
  const angleByRelation = new Map(normalizedAngles.map((entry) => [entry.relationId, entry]));

  const normalizedExternal = externalFrameBindings.map((binding, index) => normalizeExternalFrameBinding(binding, index, maps)).sort((a, b) => a.entityId.localeCompare(b.entityId));
  if (new Set(normalizedExternal.map((binding) => binding.entityId)).size !== normalizedExternal.length) throw new Error('external frame bindings must have unique entity IDs');
  if (!setEquals(new Set(normalizedExternal.map((binding) => binding.entityId)), new Set(externalEntityIds))) throw new Error('external frame bindings must cover exactly FREE, FUSED, and SUPPORTED_CLEARANCE entities');

  const multiBindings = normalizedMultiPlans.map((plan) => ({relationId: plan.relationId, subjectId: plan.subjectId, planDigest: plan.planDigest}));
  const jointByRelation = new Map(normalizedJoints.map((joint) => [joint.relationId, joint]));
  const articulatedBindings = articulatedRelationIds.map((relationId) => {
    const relation = maps.byRelation.get(relationId), joint = jointByRelation.get(relationId), state = angleByRelation.get(relationId);
    return {relationId, subjectId: relation.subjectId, jointId: joint.id, jointDigest: joint.jointDigest, angle: state.angle, evidenceRefs: state.evidenceRefs};
  });
  const order = topologicalEntityOrder(attachmentSemantics);
  const payload = {
    schema: ATTACHMENT_PROPAGATION_PLAN_SCHEMA,
    id: assertId(id, 'id'),
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    surfaceAnchorSetDigest: needsSurfaceAnchors ? surfaceAnchorSet.anchorSetDigest : null,
    followStateDigest: followState?.followStateDigest ?? null,
    multiAnchorBindings: multiBindings,
    articulatedBindings,
    externalFrameBindings: normalizedExternal,
    topologicalEntityOrder: order,
    topologicalRelationOrder: order.map((entityId) => maps.bySubject.get(entityId).id),
    evidenceRefs: evidence(evidenceRefs, 'evidenceRefs'),
    policy: {
      dependencyDagIsDeterministic: true,
      existingAttachmentSolversAreReused: true,
      solvedModesCannotUseExternalPoseOverride: true,
      externalFramesBindCurrentStateAndOwnerFrames: true,
      staleOrInfeasibleStateBlocksDependents: true,
      supportedClearanceWaitsForRealizedValidation: true,
      propagationDoesNotMutateMeshBytes: true,
      propagationDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validateAttachmentPropagationPlan(value, dependencies = {}) {
  const errors = [];
  try {
    if (value?.schema !== ATTACHMENT_PROPAGATION_PLAN_SCHEMA) errors.push('invalid schema');
    const recreated = createAttachmentPropagationPlan({
      attachmentSemantics: dependencies.attachmentSemantics,
      id: value.id,
      surfaceAnchorSet: dependencies.surfaceAnchorSet ?? null,
      surfaces: dependencies.surfaces ?? [],
      followState: dependencies.followState ?? null,
      multiAnchorPlans: dependencies.multiAnchorPlans ?? [],
      articulatedJoints: dependencies.articulatedJoints ?? [],
      articulatedAngles: value.articulatedBindings?.map((entry) => ({relationId: entry.relationId, angle: entry.angle, evidenceRefs: entry.evidenceRefs})) ?? [],
      externalFrameBindings: value.externalFrameBindings,
      evidenceRefs: value.evidenceRefs,
    });
    if (recreated.planDigest !== value.planDigest) errors.push('attachment propagation plan digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('attachment propagation plan is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function normalizeInitialWorldFrames(values, externalBindings) {
  const normalized = (values ?? []).map((raw, index) => ({
    entityId: assertId(raw?.entityId, `initialWorldFrames[${index}].entityId`),
    stateDigest: assertDigest(raw?.stateDigest, `initialWorldFrames[${index}].stateDigest`),
    frame: normalizeRigidFrame(raw?.frame, `initialWorldFrames[${index}].frame`),
  })).sort((a, b) => a.entityId.localeCompare(b.entityId));
  if (new Set(normalized.map((item) => item.entityId)).size !== normalized.length) throw new Error('initialWorldFrames entity IDs must be unique');
  const expected = new Set(externalBindings.map((binding) => binding.entityId));
  const actual = new Set(normalized.map((item) => item.entityId));
  if (!setEquals(actual, expected)) throw new Error('initialWorldFrames may cover exactly the external-frame entities and may not override solved relations');
  return normalized;
}

function blocker(code, relation, message, ownerIds = relation.ownerIds) {
  return {code, entityId: relation.subjectId, relationId: relation.id, mode: relation.mode, ownerIds: [...ownerIds].sort(), message: String(message)};
}

function externalResult({relation, binding, initial, resolvedFrames}) {
  if (!initial) return {result: null, blocker: blocker('MISSING_EXTERNAL_FRAME', relation, `missing current external frame for ${relation.subjectId}`)};
  if (initial.stateDigest !== binding.stateDigest) return {result: null, blocker: blocker('STALE_EXTERNAL_STATE', relation, `${relation.subjectId} state digest does not match the propagation plan`)};
  for (const expected of binding.ownerFrameDigests) {
    const ownerFrame = resolvedFrames.get(expected.ownerId);
    if (!ownerFrame) return {result: null, blocker: blocker('UNRESOLVED_OWNER', relation, `${relation.subjectId} owner ${expected.ownerId} has no current frame`)};
    if (rigidFrameDigest(ownerFrame) !== expected.frameDigest) return {result: null, blocker: blocker('STALE_OWNER_FRAME', relation, `${relation.subjectId} external frame was built against an older ${expected.ownerId} frame`)};
  }
  return {
    result: {
      entityId: relation.subjectId,
      relationId: relation.id,
      mode: relation.mode,
      status: relation.mode === 'SUPPORTED_CLEARANCE' ? 'PENDING_REALIZED_VALIDATION' : 'CURRENT_EXTERNAL',
      ownerIds: [...relation.ownerIds],
      worldFrame: initial.frame,
      stateDigest: initial.stateDigest,
      solverReportDigest: null,
      requiresRealizedValidation: relation.mode === 'SUPPORTED_CLEARANCE',
    },
    blocker: null,
  };
}

function oneBindingFollowState({sourceState, binding, attachmentSemantics, surfaceAnchorSet, surfaces}) {
  return createAttachmentFollowState({
    attachmentSemantics,
    surfaceAnchorSet,
    surfaces,
    bindings: [followBindingInput(binding)],
    evidenceRefs: sourceState.evidenceRefs,
  });
}

export function propagateAttachmentGraph({
  plan,
  attachmentSemantics,
  surfaceAnchorSet = null,
  surfaces = [],
  followState = null,
  multiAnchorPlans = [],
  articulatedJoints = [],
  initialWorldFrames = [],
  evidenceRefs = [],
} = {}) {
  const dependencies = {attachmentSemantics, surfaceAnchorSet, surfaces, followState, multiAnchorPlans, articulatedJoints};
  const validation = validateAttachmentPropagationPlan(plan, dependencies);
  if (!validation.valid) throw new Error(`attachment propagation plan is invalid: ${validation.errors.join('; ')}`);
  const maps = semanticsMaps(attachmentSemantics);
  const initialFrames = normalizeInitialWorldFrames(initialWorldFrames, plan.externalFrameBindings);
  const initialByEntity = new Map(initialFrames.map((entry) => [entry.entityId, entry]));
  const externalByEntity = new Map(plan.externalFrameBindings.map((entry) => [entry.entityId, entry]));
  const followByRelation = new Map((followState?.bindings ?? []).map((binding) => [binding.relationId, binding]));
  const multiByRelation = new Map(multiAnchorPlans.map((item) => [item.relationId, item]));
  const jointByRelation = new Map(articulatedJoints.map((item) => [item.relationId, item]));
  const articulatedByRelation = new Map(plan.articulatedBindings.map((item) => [item.relationId, item]));
  const resolvedFrames = new Map();
  const entityResults = [];
  const blockers = [];
  const pendingRealizedValidationRelationIds = [];

  for (const entityId of plan.topologicalEntityOrder) {
    const relation = maps.bySubject.get(entityId);
    const unresolvedOwners = relation.ownerIds.filter((ownerId) => !resolvedFrames.has(ownerId));
    if (unresolvedOwners.length) {
      blockers.push(blocker('UNRESOLVED_OWNER', relation, `${entityId} cannot resolve because owner frame(s) are unavailable: ${unresolvedOwners.join(', ')}`, unresolvedOwners));
      entityResults.push({entityId, relationId: relation.id, mode: relation.mode, status: 'BLOCKED', ownerIds: [...relation.ownerIds], worldFrame: null, stateDigest: null, solverReportDigest: null, requiresRealizedValidation: false});
      continue;
    }

    if (EXTERNAL_MODES.has(relation.mode)) {
      const evaluated = externalResult({relation, binding: externalByEntity.get(entityId), initial: initialByEntity.get(entityId), resolvedFrames});
      if (evaluated.blocker) {
        blockers.push(evaluated.blocker);
        entityResults.push({entityId, relationId: relation.id, mode: relation.mode, status: 'BLOCKED', ownerIds: [...relation.ownerIds], worldFrame: null, stateDigest: null, solverReportDigest: null, requiresRealizedValidation: false});
        continue;
      }
      entityResults.push(evaluated.result);
      resolvedFrames.set(entityId, evaluated.result.worldFrame);
      if (evaluated.result.requiresRealizedValidation) pendingRealizedValidationRelationIds.push(relation.id);
      continue;
    }

    try {
      let worldFrame, solverReportDigest;
      if (relation.mode === 'RIGID_FOLLOW' || relation.mode === 'SURFACE_OFFSET') {
        const binding = followByRelation.get(relation.id);
        const localState = oneBindingFollowState({sourceState: followState, binding, attachmentSemantics, surfaceAnchorSet, surfaces});
        const report = propagateAttachmentFollow({
          followState: localState,
          attachmentSemantics,
          surfaceAnchorSet,
          surfaces,
          ownerWorldFrames: [{entityId: relation.ownerIds[0], frame: resolvedFrames.get(relation.ownerIds[0])}],
          evidenceRefs,
        });
        worldFrame = report.targets[0].worldFrame;
        solverReportDigest = report.followReportDigest;
      } else if (relation.mode === 'MULTI_ANCHOR') {
        const multiPlan = multiByRelation.get(relation.id);
        const report = solveMultiAnchor({
          plan: multiPlan,
          attachmentSemantics,
          surfaceAnchorSet,
          surfaces,
          ownerWorldFrames: relation.ownerIds.map((ownerId) => ({entityId: ownerId, frame: resolvedFrames.get(ownerId)})),
          evidenceRefs,
        });
        if (!report.eligibleForRealization || report.status !== 'SOLVED') {
          blockers.push(blocker('INFEASIBLE_MULTI_ANCHOR', relation, `${entityId} multi-anchor constraints are infeasible`));
          entityResults.push({entityId, relationId: relation.id, mode: relation.mode, status: 'BLOCKED', ownerIds: [...relation.ownerIds], worldFrame: null, stateDigest: null, solverReportDigest: report.reportDigest, requiresRealizedValidation: false});
          continue;
        }
        worldFrame = report.worldFrame;
        solverReportDigest = report.reportDigest;
      } else if (relation.mode === 'ARTICULATED') {
        const joint = jointByRelation.get(relation.id), state = articulatedByRelation.get(relation.id);
        const report = evaluateArticulatedJoint({
          joint,
          attachmentSemantics,
          ownerWorldFrame: resolvedFrames.get(relation.ownerIds[0]),
          angle: state.angle,
          evidenceRefs,
        });
        worldFrame = report.subjectWorldFrame;
        solverReportDigest = report.reportDigest;
      } else {
        throw new Error(`unsupported propagation mode ${relation.mode}`);
      }
      resolvedFrames.set(entityId, worldFrame);
      entityResults.push({entityId, relationId: relation.id, mode: relation.mode, status: 'RESOLVED', ownerIds: [...relation.ownerIds], worldFrame, stateDigest: null, solverReportDigest, requiresRealizedValidation: false});
    } catch (error) {
      blockers.push(blocker('SOLVER_FAILED', relation, error.message));
      entityResults.push({entityId, relationId: relation.id, mode: relation.mode, status: 'BLOCKED', ownerIds: [...relation.ownerIds], worldFrame: null, stateDigest: null, solverReportDigest: null, requiresRealizedValidation: false});
    }
  }

  const eligibleForRealization = blockers.length === 0 && entityResults.every((result) => result.worldFrame);
  const payload = {
    schema: ATTACHMENT_PROPAGATION_REPORT_SCHEMA,
    planDigest: plan.planDigest,
    scopeId: plan.scopeId,
    sourceSha256: plan.sourceSha256,
    attachmentSemanticsDigest: plan.attachmentSemanticsDigest,
    surfaceAnchorSetDigest: plan.surfaceAnchorSetDigest,
    initialWorldFrames: initialFrames,
    status: eligibleForRealization ? 'READY_FOR_REALIZATION' : 'BLOCKED',
    eligibleForRealization,
    pendingRealizedValidationRelationIds: [...new Set(pendingRealizedValidationRelationIds)].sort(),
    topologicalEntityOrder: [...plan.topologicalEntityOrder],
    entityResults,
    blockers,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      derivedOwnerFramesFeedDownstreamDependents: true,
      externalPoseCannotOverrideSolvedRelations: true,
      staleExternalStateOrOwnerFrameFailsClosed: true,
      infeasibleSolverResultIsNotPropagated: true,
      supportedClearanceStillRequiresPostRealizationProof: true,
      reportDoesNotMutateMeshBytes: true,
      reportDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateAttachmentPropagationReport(value, {plan, ...dependencies} = {}) {
  const errors = [];
  try {
    if (value?.schema !== ATTACHMENT_PROPAGATION_REPORT_SCHEMA) errors.push('invalid schema');
    const recreated = propagateAttachmentGraph({
      plan,
      ...dependencies,
      initialWorldFrames: value.initialWorldFrames,
      evidenceRefs: value.evidenceRefs,
    });
    if (recreated.reportDigest !== value.reportDigest) errors.push('attachment propagation report digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('attachment propagation report is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';

export const LOGICAL_FUSION_SCHEMA = 'refas.logical-fusion/v1';
export const LOGICAL_FUSION_INVALIDATION_SCHEMA = 'refas.logical-fusion-invalidation/v1';

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function relationBySubject(attachmentSemantics) {
  return new Map(attachmentSemantics.relations.map((relation) => [relation.subjectId, relation]));
}

function fusedRoot(subjectId, bySubject) {
  let current = subjectId;
  const seen = new Set();
  while (true) {
    if (seen.has(current)) throw new Error(`logical fusion encountered a cycle at ${current}`);
    seen.add(current);
    const relation = bySubject.get(current);
    if (!relation || relation.mode !== 'FUSED') return current;
    current = relation.ownerIds[0];
  }
}

export function createLogicalFusion({attachmentSemantics, evidenceRefs = []} = {}) {
  const validation = validateAttachmentSemantics(attachmentSemantics);
  if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);

  const bySubject = relationBySubject(attachmentSemantics);
  const grouped = new Map();
  for (const relation of attachmentSemantics.relations) {
    if (relation.mode !== 'FUSED') continue;
    const rootId = fusedRoot(relation.subjectId, bySubject);
    const group = grouped.get(rootId) ?? {rootId, memberIds: new Set([rootId]), relationIds: new Set()};
    group.memberIds.add(relation.subjectId);
    group.relationIds.add(relation.id);
    let cursor = relation.subjectId;
    while (bySubject.get(cursor)?.mode === 'FUSED') {
      const ownerId = bySubject.get(cursor).ownerIds[0];
      group.memberIds.add(ownerId);
      cursor = ownerId;
    }
    grouped.set(rootId, group);
  }

  const groups = [...grouped.values()]
    .map((group) => ({
      id: assertId(`fusion-${group.rootId}`, 'fusion group id'),
      rootId: assertId(group.rootId, 'fusion rootId'),
      memberIds: [...group.memberIds].sort(),
      relationIds: [...group.relationIds].sort(),
      state: 'logical',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const fusedMembers = new Set(groups.flatMap((group) => group.memberIds));
  const payload = {
    schema: LOGICAL_FUSION_SCHEMA,
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    groups,
    nonFusionEntityIds: attachmentSemantics.entities.map((entity) => entity.id).filter((id) => !fusedMembers.has(id)).sort(),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      logicalFusionPrecedesPhysicalFusion: true,
      semanticPartsRemainAddressable: true,
      groupIdentityDerivedFromAttachmentSemantics: true,
      memberEditInvalidatesWholeFusionGroup: true,
      physicalMeshMutationForbidden: true,
      physicalFusionRequiresFinalization: true,
      reopenRequiresPreFusionSemanticState: true,
      logicalFusionDoesNotPropagateNonFusedDependents: true,
      logicalFusionDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, fusionDigest: digestJson(payload)});
}

export function validateLogicalFusion(value, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== LOGICAL_FUSION_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required to validate logical fusion');
    if (value.attachmentSemanticsDigest !== attachmentSemantics.semanticsDigest) errors.push('logical fusion does not bind attachment semantics');
    const recreated = createLogicalFusion({attachmentSemantics, evidenceRefs: value.evidenceRefs});
    if (recreated.fusionDigest !== value.fusionDigest) errors.push('logical fusion digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('logical fusion is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function logicalFusionGroupForEntity(logicalFusion, entityId) {
  const id = assertId(entityId, 'entityId');
  return logicalFusion.groups.find((group) => group.memberIds.includes(id)) ?? null;
}

export function createLogicalFusionInvalidation({logicalFusion, attachmentSemantics, changedEntityIds = [], evidenceRefs = []} = {}) {
  const validation = validateLogicalFusion(logicalFusion, attachmentSemantics);
  if (!validation.valid) throw new Error(`logical fusion is invalid: ${validation.errors.join('; ')}`);
  const changed = uniqueStrings(changedEntityIds).map((id) => assertId(id, 'changedEntityIds'));
  if (!changed.length) throw new Error('logical fusion invalidation requires at least one changed entity');
  const known = new Set(attachmentSemantics.entities.map((entity) => entity.id));
  for (const id of changed) if (!known.has(id)) throw new Error(`changed entity is unknown to attachment semantics: ${id}`);

  const affectedGroups = logicalFusion.groups.filter((group) => changed.some((id) => group.memberIds.includes(id)));
  const affectedMemberIds = [...new Set(affectedGroups.flatMap((group) => group.memberIds))].sort();
  const payload = {
    schema: LOGICAL_FUSION_INVALIDATION_SCHEMA,
    scopeId: logicalFusion.scopeId,
    sourceSha256: logicalFusion.sourceSha256,
    attachmentSemanticsDigest: logicalFusion.attachmentSemanticsDigest,
    fusionDigest: logicalFusion.fusionDigest,
    changedEntityIds: changed,
    invalidatedGroupIds: affectedGroups.map((group) => group.id).sort(),
    invalidatedMemberIds: affectedMemberIds,
    unaffectedEntityIds: attachmentSemantics.entities.map((entity) => entity.id).filter((id) => !affectedMemberIds.includes(id)).sort(),
    requiresFusionRebuild: affectedGroups.length > 0,
    requiresPreFusionSemanticState: affectedGroups.length > 0,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      invalidationDoesNotMoveGeometry: true,
      invalidationCannotAuthorizeClosure: true,
      nonFusedDependentsAreHandledByAttachmentPropagation: true,
      physicalFusionArtifactCannotBeCanonicalReopenSource: true,
    },
  };
  return deepFreeze({...payload, invalidationDigest: digestJson(payload)});
}

export function validateLogicalFusionInvalidation(value, logicalFusion = null, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== LOGICAL_FUSION_INVALIDATION_SCHEMA) errors.push('invalid schema');
    if (!logicalFusion || !attachmentSemantics) throw new Error('logicalFusion and attachmentSemantics are required to validate invalidation');
    const recreated = createLogicalFusionInvalidation({
      logicalFusion,
      attachmentSemantics,
      changedEntityIds: value.changedEntityIds,
      evidenceRefs: value.evidenceRefs,
    });
    if (recreated.invalidationDigest !== value.invalidationDigest) errors.push('logical fusion invalidation digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('logical fusion invalidation is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

import {createHash} from 'node:crypto';

import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {inventoryGlbTriangleComponents} from './qa-triangle-components.mjs';
import {validateRealizedContactPlan, validateRealizedContactResult} from './realized-contact.mjs';

export const QA_CONTACT_REPLAY_SCHEMA = 'refas.qa-realized-contact-replay/v1';
const digestBytes = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const result = (status, reason, details = []) => Object.freeze({
  schema: QA_CONTACT_REPLAY_SCHEMA, status, reason, details: [...details].sort(),
});

/**
 * Trusted re-evaluation of a previously reported GLB contact/support outcome.
 * A PASS is restricted to the declared typed assembly semantics and candidate;
 * this is NOT independent source-semantic authorization (owned by QA-03).
 * Geometry and evidence bindings are checked again, not trusted from JSON.
 */
export function replayRealizedContactEvidence({
  glb, sourceSha256, attachmentSemantics, plan, graph, report,
  propagationReport = null, fusionArtifacts = [],
} = {}) {
  if (!glb || !attachmentSemantics || !plan || !graph || !report) {
    return result('NOT_RUN', 'source-bound contact replay requires candidate GLB, semantic attachments, plan, graph and report');
  }
  if (!sourceSha256 || !/^[a-f0-9]{64}$/u.test(sourceSha256)) {
    return result('INSUFFICIENT', 'an independently bound source SHA-256 is required for contact replay');
  }

  const semantics = validateAttachmentSemantics(attachmentSemantics);
  if (!semantics.valid) return result('FAIL', 'attachment semantics are invalid', semantics.errors);
  const planValidation = validateRealizedContactPlan(plan, attachmentSemantics);
  if (!planValidation.valid) return result('FAIL', 'contact plan is invalid', planValidation.errors);

  if (attachmentSemantics.sourceSha256 !== sourceSha256 || plan.sourceSha256 !== sourceSha256) {
    return result('FAIL', 'contact semantics or plan source SHA-256 differs from the primary source');
  }
  if (digestBytes(glb) !== plan.assetSha256 || report.assetSha256 !== plan.assetSha256 || graph.assetSha256 !== plan.assetSha256) {
    return result('FAIL', 'realized contact evidence is not bound to the exact candidate GLB bytes');
  }

  const replay = validateRealizedContactResult({graph, report}, {
    plan, attachmentSemantics, glb, propagationReport, fusionArtifacts,
  });
  if (!replay.valid) return result('FAIL', 'saved contact graph/report disagree with trusted triangle-level replay', replay.errors);

  // A semantically classified entity is not physically realized merely because
  // the plan mentions it. Fusion is permitted only when validated by replay.
  const meshIds = new Set(graph.nodes.map((node) => node.physicalEntityId));
  const semanticIds = new Set(attachmentSemantics.entities.map((e) => e.id));
  const fusedAlias = new Map();
  for (const binding of plan.fusionBindings) {
    for (const member of binding.semanticMemberIds) fusedAlias.set(member, binding.physicalEntityId);
  }
  const physicalId = (id) => fusedAlias.get(id) ?? id;
  const unmappedMeshes = [...meshIds].filter((id) => !semanticIds.has(id));
  const unrepresentedEntities = [...semanticIds].filter((id) => !meshIds.has(physicalId(id)));
  if (unmappedMeshes.length || unrepresentedEntities.length) {
    return result('INSUFFICIENT', 'physical/semantic entity inventory is incomplete', [
      ...unmappedMeshes.map((id) => 'unclassified-mesh:' + id),
      ...unrepresentedEntities.map((id) => 'unrealized-entity:' + id),
    ]);
  }

  const roots = new Set(plan.supportRoots.map(physicalId));
  const required = new Set(plan.supportRequiredEntityIds.map(physicalId));
  const unaccounted = [...meshIds].filter((id) => !roots.has(id) && !required.has(id));
  const missingRequired = [...required].filter((id) => !meshIds.has(id));
  if (unaccounted.length || missingRequired.length || !roots.size) {
    return result('INSUFFICIENT', 'not every realized physical entity has an explicit support-root or support-required declaration', [
      ...unaccounted.map((id) => 'missing-support-classification:' + id),
      ...missingRequired.map((id) => 'missing-required-mesh:' + id),
      ...(!roots.size ? ['no-support-root'] : []),
    ]);
  }

  // Root declarations do not automatically excuse a disconnected object.
  // Root support must be consistent with the attachment contract; different
  // FREE roots still require independent source authority in QA-03.
  const classified = new Map(attachmentSemantics.relations.map((rel) => [rel.subjectId, rel]));
  const unsupportedRoots = plan.supportRoots.filter((id) => classified.get(id)?.mode !== 'FREE');
  if (unsupportedRoots.length) {
    return result('INSUFFICIENT', 'support roots are not explicitly classified as FREE', unsupportedRoots);
  }
  if (report.status !== 'PASS' || report.blockers?.length || report.unsupportedPhysicalEntityIds?.length) {
    return result('FAIL', 'actual realized triangle contacts or support-root reachability failed',
      [...(report.blockers ?? []), ...(report.unsupportedPhysicalEntityIds ?? [])]);
  }
  // A connected GLB *node* can hide multiple unconnected triangle islands.
  // Do not call those islands unsupported automatically: UV seams, spokes,
  // lattice baskets and deliberate multi-part nodes need typed review.
  let inventory;
  try {
    inventory=inventoryGlbTriangleComponents(glb);
  } catch(error) {
    return result('FAIL', 'candidate GLB triangle component inventory failed', [String(error.message)]);
  }
  const splits=inventory.nodes.filter(node=>node.componentCount>1);
  if(splits.length) {
    return result('INSUFFICIENT',
      'triangle-disconnected islands within a physical mesh require independent typed component-support evidence',[
        'inventory-digest:'+inventory.inventoryDigest,
        ...splits.map(node=>'unreviewed-triangle-islands:'+node.nodeId+':'+node.componentCount),
      ]);
  }
  return result('PASS', 'recomputed GLB triangle contact and declared support paths match exact source/candidate-bound evidence');
}

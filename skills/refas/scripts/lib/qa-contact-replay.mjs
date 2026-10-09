import {createHash} from 'node:crypto';

import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {validateAttachmentPropagationReport} from './attachment-propagation.mjs';
import {inventoryGlbTriangleComponents} from './qa-triangle-components.mjs';
import {replayExactGlbPhysicalFusion} from './qa-fusion-replay.mjs';
import {verifyRealizedPropagationWorldFrames} from './qa-propagation-world-frames.mjs';
import {replayTrustedPropagationDependencies} from './qa-propagation-dependencies.mjs';
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
  propagationReport = null, propagationPlan = null, propagationDependencies = {}, fusionArtifacts = [], fusionReplayInputs = [],
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


  // Report JSON and a matching digest are not enough: for the dependency-free
  // external-frame modes, replay the actual propagation solver from the stored
  // plan, semantic contract and exact initial frames in the report.
  if (plan.propagationReportDigest != null) {
    if (!propagationPlan || !propagationReport) {
      return result('NOT_RUN','a digest-bound propagation plan and report are required for realized contact replay');
    }
    if (propagationPlan.sourceSha256 !== sourceSha256 ||
        propagationPlan.attachmentSemanticsDigest !== attachmentSemantics.semanticsDigest ||
        propagationPlan.planDigest !== propagationReport.planDigest ||
        propagationReport.reportDigest !== plan.propagationReportDigest) {
      return result('FAIL','propagation plan/report differs from the current primary source or contact plan');
    }
    const propagated=replayTrustedPropagationDependencies({
      ...propagationDependencies,
      // The QA caller's auxiliary dependency map may never override the
      // independently source/GLB-bound authoritative plan, report or semantics.
      plan:propagationPlan,report:propagationReport,attachmentSemantics,
    });
    if(propagated.status!=='PASS') {
      return result(propagated.status,'propagation plan/report need independent complete solver replay',[
        propagated.reason,...propagated.details,
      ]);
    }
    const poseReplay=verifyRealizedPropagationWorldFrames(glb,propagationReport);
    if(poseReplay.status!=='PASS'){
      return result(poseReplay.status,'candidate GLB world transforms do not realize the propagation solver pose',[
        poseReplay.reason,...poseReplay.entities,
      ]);
    }
  }

  if(plan.fusionBindings.length){
    if(!Array.isArray(fusionReplayInputs)||fusionReplayInputs.length!==plan.fusionBindings.length){
      return result('INSUFFICIENT','physical fusion requires independently replayable pre-fusion and final GLB evidence');
    }
    const inputs=new Map(fusionReplayInputs.map(x=>[x.physicalEntityId,x]));
    fusionArtifacts=[];
    for(const binding of plan.fusionBindings){
      const input=inputs.get(binding.physicalEntityId);
      if(!input)return result('INSUFFICIENT','missing physical fusion replay input for '+binding.physicalEntityId);
      if(input.report?.reportDigest!==binding.fusionReportDigest||
         input.provenance?.provenanceDigest!==binding.provenanceDigest){
        return result('FAIL','physical fusion plan binds a different report or provenance');
      }
      const proof=replayExactGlbPhysicalFusion({...input,physicalEntityId:binding.physicalEntityId,
        sourceSha256,attachmentSemantics,fusedGlb:glb});
      if(proof.status!=='PASS')return result(proof.status,'trusted physical fusion replay refused closure',[proof.reason]);
      fusionArtifacts.push({report:input.report,provenance:input.provenance});
    }
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
  // Node-level triangle contact can hide disconnected physical islands.
  // Distinguish exact-position geometric seams from mere index splits (UVs,
  // materials, nonindexed glTF). Neither geometric adjacency nor a name alone
  // proves physical welding or independently observed source semantics.
  let inventory;
  try {
    inventory=inventoryGlbTriangleComponents(glb);
  } catch(error) {
    return result('FAIL', 'candidate GLB triangle component inventory failed', [String(error.message)]);
  }
  const splits=inventory.nodes.filter(node=>node.spatial.componentCount>1 ||
    node.spatial.ambiguousEdges>0);
  if(splits.length) {
    return result('INSUFFICIENT',
      'geometrically disconnected or ambiguous triangles within a physical mesh require independent typed component-support evidence',[
        'inventory-digest:'+inventory.inventoryDigest,
        ...splits.filter(node=>node.spatial.componentCount>1)
          .map(node=>'unreviewed-triangle-islands:'+node.nodeId+':'+node.spatial.componentCount),
        ...splits.filter(node=>node.spatial.ambiguousEdges>0)
          .map(node=>'ambiguous-geometric-edges:'+node.nodeId+':'+node.spatial.ambiguousEdges),
      ]);
  }
  return result('PASS', 'recomputed GLB triangle contact and declared support paths match exact source/candidate-bound evidence');
}

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assessCertification as assessCertificationBase,
  auditProject as auditProjectBase,
  certifyProject as certifyProjectBase,
  loadCheckpoint,
  loadProject,
  resolveAuthoritativeCandidateLineage,
  resumeProject as resumeProjectBase,
} from './checkpoint-store.mjs';
import {digestJson, readJson, sha256File, writeJsonAtomic} from './canonical.mjs';
import {createCandidateTransaction, validateCandidateTransaction} from './candidate-transaction.mjs';
import {
  createDefaultWholeObjectCertificationPolicy,
  evaluateCertificationPolicy,
  validateCertificationPolicy,
  validateClaimCertificationDecision,
} from './certification-policy.mjs';
import {validateWholeObjectPolicyAuthority} from './certification-authority.mjs';
import {
  CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA,
  createCertificationRelationalEvidence,
  validateCertificationRelationalEvidence,
} from './certification-relational-evidence.mjs';
import {inspectCertificationProjectionEvidence} from './certification-projection-evidence.mjs';
import {isTrustedContractFixtureProject} from './contract-fixture-authority.mjs';
import {validateCandidateLineageProof} from './candidate-authority.mjs';
import {validateFinalResemblanceClosure} from './final-resemblance-closure.mjs';

const INTERNAL_ROOT = '.refas';
const certificateFile = (root) => path.join(path.resolve(root), INTERNAL_ROOT, 'certification.json');
const projectStateFile = (root) => path.join(path.resolve(root), INTERNAL_ROOT, 'project.json');
const RELATIONAL_ARTIFACT_SPECS = Object.freeze([
  {key:'relationalStructure', id:'relational-structure', role:'relational-structure', kind:'relational-structure', schema:'refas.relational-structure/v1'},
  {key:'semanticAuthority', id:'semantic-authority', role:'semantic-authority', kind:'semantic-authority', schema:'refas.semantic-authority-set/v1'},
  {key:'relationalBarrier', id:'relational-barrier', role:'relational-barrier', kind:'whole-system-relational-barrier', schema:'refas.whole-system-relational-barrier/v1'},
  {key:'relationalDiscrepancy', id:'relational-discrepancy', role:'relational-discrepancy', kind:'relational-discrepancy', schema:'refas.relational-discrepancy/v1'},
]);

async function readVisualReview(root, head) {
  const artifacts = (head?.artifactRefs ?? []).filter((artifact) => artifact.kind === 'visual-review');
  if (artifacts.length !== 1) return null;
  try {
    return JSON.parse(await fs.readFile(path.resolve(root, artifacts[0].path), 'utf8'));
  } catch {
    return null;
  }
}

async function readBoundArtifact(root, artifact, label) {
  if (!artifact) throw new Error(`${label} is missing`);
  const absolute = path.resolve(root, artifact.path);
  const bytes = await fs.readFile(absolute);
  if (bytes.length !== artifact.sizeBytes) throw new Error(`${label} size does not match its checkpoint reference`);
  if (await sha256File(absolute) !== artifact.sha256) throw new Error(`${label} digest does not match its checkpoint reference`);
  return bytes;
}

function jsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function candidateArtifactFromReview(head, review) {
  const candidates = (head.artifactRefs ?? []).filter((artifact) => artifact.sha256 === review?.assetSha256 && artifact.kind !== 'visual-review');
  return candidates.find((artifact) => artifact.kind === 'glb' || String(artifact.path).toLowerCase().endsWith('.glb')) ?? candidates[0] ?? null;
}

async function readHeadRelationalArtifacts(root, head) {
  const result = {};
  for (const spec of RELATIONAL_ARTIFACT_SPECS) {
    const matches = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === spec.kind);
    if (matches.length !== 1) throw new Error(`real-source certification requires exactly one digest-bound ${spec.kind} artifact`);
    const bytes = await readBoundArtifact(root, matches[0], `${spec.kind} artifact`);
    const document = jsonBytes(bytes, `${spec.kind} artifact`);
    if (document.schema !== spec.schema) throw new Error(`${spec.kind} artifact schema is invalid`);
    result[spec.key] = {artifact: matches[0], bytes, document, spec};
  }
  return result;
}

async function explicitTransactionContext(root, head, candidateArtifact, candidateBytes, transactionArtifact) {
  const transactionBytes = await readBoundArtifact(root, transactionArtifact, 'candidate transaction artifact');
  const transaction = jsonBytes(transactionBytes, 'candidate transaction artifact');
  const boundCheckpoint = await loadCheckpoint(root, transaction?.checkpoint?.checkpointId);
  const available = [...(boundCheckpoint.artifactRefs ?? []), ...(head.artifactRefs ?? [])];
  const evidenceBytesById = new Map();
  for (const node of transaction.evidenceNodes ?? []) {
    const matches = available.filter((artifact) => artifact.sha256 === node.artifactSha256 && artifact.sizeBytes === node.sizeBytes);
    if (!matches.length) throw new Error(`candidate transaction evidence is not recoverably bound by its checkpoint/head: ${node.id}`);
    const bytes = await readBoundArtifact(root, matches[0], `candidate transaction evidence ${node.id}`);
    evidenceBytesById.set(node.id, bytes);
  }
  const validation = validateCandidateTransaction(transaction, {candidateBytes, checkpoint: boundCheckpoint, evidenceBytesById});
  if (!validation.valid) throw new Error(`candidate transaction is invalid: ${validation.errors.join('; ')}`);
  if (transaction.rootCandidate.sha256 !== candidateArtifact.sha256) throw new Error('candidate transaction root candidate does not match the certification candidate');
  return {transaction, evidenceBytesById, transactionSource: 'checkpoint-artifact'};
}

function relationalEvidenceNode(spec, item) {
  return {
    id: spec.id,
    role: spec.role,
    schema: spec.schema,
    bytes: item.bytes,
    ...(spec.key === 'relationalDiscrepancy' ? {subjectPointer:'/candidateAssetSha256'} : {}),
  };
}

async function synthesizedTransactionContext(root, state, head, reviewArtifact, review, candidateBytes) {
  const renderArtifact = (head.artifactRefs ?? []).find((artifact) => artifact.path === review?.renderer?.reportRef && artifact.sha256 === review?.renderer?.reportSha256);
  if (!renderArtifact) throw new Error('claim certification requires the exact visual-review renderer report artifact');
  const renderBytes = await readBoundArtifact(root, renderArtifact, 'visual-review renderer report');
  const renderReport = jsonBytes(renderBytes, 'visual-review renderer report');
  const reviewBytes = await readBoundArtifact(root, reviewArtifact, 'visual-review artifact');
  const dependencies = [{
    nodeId: 'render-report',
    proof: {kind: 'json-pointer-artifact-sha256', holder: 'self', pointer: '/renderer/reportSha256'},
  }];
  const evidence = [
    {id: 'render-report', role: 'render-report', schema: renderReport.schema, bytes: renderBytes, subjectPointer: '/assetSha256'},
  ];
  const fixture = isTrustedContractFixtureProject(state);
  const requiresRegisteredComparison = !fixture;
  const requiresRelationalClosure = !fixture;
  const requiresFinalCandidateAuthority = !fixture;
  if (requiresRegisteredComparison) {
    const binding = review?.registeredComparison;
    const comparisonArtifact = (head.artifactRefs ?? []).find((artifact) => artifact.kind === 'registered-comparison' && artifact.path === binding?.path && artifact.sha256 === binding?.sha256);
    if (!comparisonArtifact) throw new Error('claim certification requires the exact registered-comparison artifact');
    const comparisonBytes = await readBoundArtifact(root, comparisonArtifact, 'registered-comparison artifact');
    const comparison = jsonBytes(comparisonBytes, 'registered-comparison artifact');
    evidence.push({id: 'registered-comparison', role: 'registered-comparison', schema: comparison.schema, bytes: comparisonBytes, subjectPointer: '/render/assetSha256'});
    dependencies.push({
      nodeId: 'registered-comparison',
      proof: {kind: 'json-pointer-artifact-sha256', holder: 'self', pointer: '/registeredComparison/sha256'},
    });
  }
  evidence.push({
    id: 'visual-review', role: 'visual-review', schema: review.schema, bytes: reviewBytes, subjectPointer: '/assetSha256', dependencies,
  });

  const obligations = [
    {id: 'visual-review', role: 'visual-review', schema: 'refas.visual-review/v1'},
    {id: 'render-report', role: 'render-report', schema: 'refas.pbr-render-report/v1'},
  ];
  const decisionNodeIds = ['visual-review'];
  if (requiresRegisteredComparison) obligations.push({id: 'registered-comparison', role: 'registered-comparison', schema: 'refas.registered-comparison/v1'});

  if (requiresRelationalClosure) {
    const relational = await readHeadRelationalArtifacts(root, head);
    for (const spec of RELATIONAL_ARTIFACT_SPECS) evidence.push(relationalEvidenceNode(spec, relational[spec.key]));
    const closure = createCertificationRelationalEvidence({
      candidateAssetSha256: review.assetSha256,
      relationalStructureBytes: relational.relationalStructure.bytes,
      semanticAuthorityBytes: relational.semanticAuthority.bytes,
      relationalBarrierBytes: relational.relationalBarrier.bytes,
      relationalDiscrepancyBytes: relational.relationalDiscrepancy.bytes,
    });
    const closureBytes = Buffer.from(`${JSON.stringify(closure)}\n`, 'utf8');
    const closureDependencies = RELATIONAL_ARTIFACT_SPECS.map((spec) => ({
      nodeId: spec.id,
      proof: {kind:'json-pointer-artifact-sha256', holder:'self', pointer:`/artifacts/${spec.key}/artifactSha256`},
    }));
    evidence.push({
      id:'relational-closure', role:'relational-closure', schema:CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA,
      bytes:closureBytes, subjectPointer:'/candidateAssetSha256', dependencies:closureDependencies,
    });
    decisionNodeIds.push('relational-closure');
    obligations.push(
      {id:'relational-structure-evidence', role:'relational-structure', schema:'refas.relational-structure/v1'},
      {id:'semantic-authority-evidence', role:'semantic-authority', schema:'refas.semantic-authority-set/v1'},
      {id:'relational-barrier-evidence', role:'relational-barrier', schema:'refas.whole-system-relational-barrier/v1'},
      {id:'relational-discrepancy-evidence', role:'relational-discrepancy', schema:'refas.relational-discrepancy/v1'},
      {id:'relational-closure-evidence', role:'relational-closure', schema:CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA},
    );
  }

  if (requiresFinalCandidateAuthority) {
    const lineageArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'candidate-lineage-proof');
    if (lineageArtifacts.length !== 1) throw new Error('real-source claim certification requires exactly one candidate-lineage-proof artifact');
    const lineageBytes = await readBoundArtifact(root, lineageArtifacts[0], 'candidate-lineage-proof artifact');
    const lineageProof = jsonBytes(lineageBytes, 'candidate-lineage-proof artifact');
    evidence.push({
      id:'candidate-lineage-proof',
      role:'candidate-lineage-proof',
      schema:lineageProof.schema,
      bytes:lineageBytes,
      subjectPointer:'/finalCandidate/assetSha256',
    });

    const closureArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'final-resemblance-closure');
    if (closureArtifacts.length !== 1) throw new Error('real-source claim certification requires exactly one final-resemblance-closure artifact');
    const closureBytes = await readBoundArtifact(root, closureArtifacts[0], 'final-resemblance-closure artifact');
    const closure = jsonBytes(closureBytes, 'final-resemblance-closure artifact');
    evidence.push({
      id:'final-resemblance-closure',
      role:'final-resemblance-closure',
      schema:closure.schema,
      bytes:closureBytes,
      subjectPointer:'/assetSha256',
    });
    decisionNodeIds.push('candidate-lineage-proof', 'final-resemblance-closure');
    obligations.push(
      {id:'candidate-lineage-proof-evidence', role:'candidate-lineage-proof', schema:'refas.candidate-lineage-proof/v1'},
      {id:'final-resemblance-closure-evidence', role:'final-resemblance-closure', schema:'refas.final-resemblance-closure/v1'},
    );
  }

  const transaction = createCandidateTransaction({candidateBytes, checkpoint: head, evidence, decisionNodeIds, obligations});
  const evidenceBytesById = new Map(evidence.map((item) => [item.id, Buffer.from(item.bytes)]));
  const validation = validateCandidateTransaction(transaction, {candidateBytes, checkpoint: head, evidenceBytesById});
  if (!validation.valid) throw new Error(`synthesized candidate transaction is invalid: ${validation.errors.join('; ')}`);
  return {transaction, evidenceBytesById, transactionSource: 'runtime-synthesized'};
}

function evidenceBytes(context, nodeId) {
  return context.evidenceBytesById instanceof Map ? context.evidenceBytesById.get(nodeId) : context.evidenceBytesById?.[nodeId];
}

function matchingEvidenceNodes(transaction, binding, spec) {
  return transaction.evidenceNodes.filter((node) =>
    node.role === spec.role && node.schema === spec.schema && node.artifactSha256 === binding?.artifactSha256);
}

async function checkpointLineage(root, head) {
  const reverse = [];
  const seen = new Set();
  let cursor = head;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error(`checkpoint cycle at ${cursor.id}`);
    reverse.push(cursor);
    seen.add(cursor.id);
    cursor = cursor.parentId ? await loadCheckpoint(root, cursor.parentId) : null;
  }
  return reverse.reverse();
}

async function currentHierarchyDigest(root, head) {
  const lineage = await checkpointLineage(root, head);
  const hierarchyCheckpoint = [...lineage].reverse().find((checkpoint) =>
    checkpoint.capability === 'visual-hierarchy'
    && (checkpoint.scopeId === 'whole' || head.scopeId === checkpoint.scopeId || head.scopeId.startsWith(`${checkpoint.scopeId}.`)));
  if (!hierarchyCheckpoint) throw new Error('final candidate authority requires current visual-hierarchy lineage');
  const artifacts = (hierarchyCheckpoint.artifactRefs ?? []).filter((artifact) => artifact.kind === 'visual-hierarchy');
  if (artifacts.length !== 1) throw new Error('final candidate authority requires exactly one visual-hierarchy artifact');
  const bytes = await readBoundArtifact(root, artifacts[0], 'visual-hierarchy artifact');
  const hierarchy = jsonBytes(bytes, 'visual-hierarchy artifact');
  if (!hierarchy?.hierarchyDigest) throw new Error('visual-hierarchy artifact has no hierarchyDigest');
  return {hierarchyDigest:hierarchy.hierarchyDigest, lineage};
}

function exactSemanticNode(transactionContext, {role, schema, pointer} = {}) {
  const nodes = transactionContext.transaction.evidenceNodes.filter((node) => node.role === role && node.schema === schema);
  if (nodes.length !== 1) throw new Error(`certification transaction requires exactly one ${role} evidence node`);
  const node = nodes[0];
  if (node.subjectBinding?.kind !== 'json-pointer'
      || node.subjectBinding.pointer !== pointer
      || node.subjectBinding.candidateSha256 !== transactionContext.transaction.rootCandidate.sha256) {
    throw new Error(`${role} must directly bind the exact certification candidate through ${pointer}`);
  }
  const bytes = evidenceBytes(transactionContext, node.id);
  if (bytes == null) throw new Error(`${role} evidence bytes are missing`);
  return {node, bytes, value:jsonBytes(bytes, `${role} evidence`)};
}

async function validateTransactionFinalCandidateAuthority(root, state, head, transactionContext, {required = true} = {}) {
  if (!required) return null;
  const lineageNode = exactSemanticNode(transactionContext, {
    role:'candidate-lineage-proof',
    schema:'refas.candidate-lineage-proof/v1',
    pointer:'/finalCandidate/assetSha256',
  });
  const closureNode = exactSemanticNode(transactionContext, {
    role:'final-resemblance-closure',
    schema:'refas.final-resemblance-closure/v1',
    pointer:'/assetSha256',
  });
  const candidateSha256 = transactionContext.transaction.rootCandidate.sha256;

  const lineageValidation = validateCandidateLineageProof(lineageNode.value, {
    sourceSha256:state.source.sha256,
    finalAssetSha256:candidateSha256,
  });
  if (!lineageValidation.valid) throw new Error(`candidate lineage proof is invalid: ${lineageValidation.errors.join('; ')}`);
  const runtimeAuthority = await resolveAuthoritativeCandidateLineage(root, {checkpointId:head.id});
  if (!runtimeAuthority || digestJson(runtimeAuthority.proof) !== digestJson(lineageNode.value)) {
    throw new Error('candidate lineage proof does not reproduce from current project lineage');
  }

  const {hierarchyDigest, lineage} = await currentHierarchyDigest(root, head);
  const closureValidation = validateFinalResemblanceClosure(closureNode.value, {
    sourceSha256:state.source.sha256,
    hierarchyDigest,
    assetSha256:candidateSha256,
  });
  if (!closureValidation.valid) throw new Error(`final resemblance closure is invalid: ${closureValidation.errors.join('; ')}`);

  const signatureMatches = [];
  for (const artifact of (head.artifactRefs ?? []).filter((item) => item.kind === 'perceptual-signature-evidence')) {
    const bytes = await readBoundArtifact(root, artifact, 'final perceptual-signature-evidence artifact');
    const value = jsonBytes(bytes, 'final perceptual-signature-evidence artifact');
    if (value?.evidenceDigest === closureNode.value.signatureEvidenceDigest) signatureMatches.push(value);
  }
  if (signatureMatches.length !== 1 || digestJson(signatureMatches[0]) !== digestJson(closureNode.value.signatureEvidence)) {
    throw new Error('final resemblance closure must bind exactly one exact final perceptual-signature-evidence artifact');
  }

  const reportMatches = [];
  for (const artifact of (head.artifactRefs ?? []).filter((item) => item.kind === 'render-report')) {
    const bytes = await readBoundArtifact(root, artifact, 'final neutral-clay render-report artifact');
    const value = jsonBytes(bytes, 'final neutral-clay render-report artifact');
    if (value?.reportDigest === closureNode.value.clayRenderReportDigest) reportMatches.push(value);
  }
  if (reportMatches.length !== 1 || digestJson(reportMatches[0]) !== digestJson(closureNode.value.clayRenderReport)) {
    throw new Error('final resemblance closure must bind exactly one exact final neutral-clay render report artifact');
  }
  for (const output of closureNode.value.clayRenderReport?.outputs ?? []) {
    const matches = (head.artifactRefs ?? []).filter((artifact) =>
      artifact.kind === 'render-frame' && artifact.path === output.path && artifact.sha256 === output.sha256);
    if (matches.length !== 1) throw new Error(`final neutral-clay output is not exact-byte bound: ${output.viewId}`);
  }

  const availablePaths = new Set([
    state.source.path,
    ...lineage.flatMap((checkpoint) => (checkpoint.artifactRefs ?? []).map((artifact) => artifact.path)),
  ].filter(Boolean));
  const refs = new Set([
    ...(closureNode.value.evidenceRefs ?? []),
    ...(closureNode.value.signatureEvidence?.evidenceRefs ?? []),
    ...(closureNode.value.signatureEvidence?.signatureSet?.evidenceRefs ?? []),
    ...(closureNode.value.signatureEvidence?.observations ?? []).flatMap((observation) => observation.evidenceRefs ?? []),
    ...(closureNode.value.signatureEvidence?.signatureSet?.signatures ?? []).flatMap((signature) => signature.evidenceRefs ?? []),
    ...(closureNode.value.clayRenderReport?.outputs ?? []).map((output) => output.path),
  ].filter(Boolean));
  for (const ref of refs) {
    if (!availablePaths.has(ref)) throw new Error(`final resemblance closure evidence ref is outside current lineage: ${ref}`);
  }

  return {
    lineageProof:lineageNode.value,
    finalResemblanceClosure:closureNode.value,
    source:transactionContext.transactionSource,
  };
}

function validateTransactionRelationalClosure(transactionContext, {required = true} = {}) {
  const {transaction} = transactionContext;
  const closureNodes = transaction.evidenceNodes.filter((node) => node.role === 'relational-closure' && node.schema === CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA);
  if (!closureNodes.length) {
    if (required) throw new Error('real-source certification requires exactly one sealed relational-closure evidence node');
    return null;
  }
  if (closureNodes.length !== 1) throw new Error('certification transaction may contain exactly one relational-closure evidence node');
  const closureNode = closureNodes[0];
  if (closureNode.subjectBinding?.kind !== 'json-pointer' || closureNode.subjectBinding.pointer !== '/candidateAssetSha256' || closureNode.subjectBinding.candidateSha256 !== transaction.rootCandidate.sha256) {
    throw new Error('relational closure must directly bind the exact certification candidate');
  }
  const closureBytes = evidenceBytes(transactionContext, closureNode.id);
  if (closureBytes == null) throw new Error('relational closure evidence bytes are missing');
  const closure = jsonBytes(closureBytes, 'relational closure evidence');
  const context = {candidateAssetSha256:transaction.rootCandidate.sha256};
  for (const spec of RELATIONAL_ARTIFACT_SPECS) {
    const binding = closure?.artifacts?.[spec.key];
    const matches = matchingEvidenceNodes(transaction, binding, spec);
    if (matches.length !== 1) throw new Error(`relational closure must bind exactly one ${spec.role} transaction node`);
    const dependency = closureNode.dependencies.find((item) => item.nodeId === matches[0].id);
    const expectedPointer = `/artifacts/${spec.key}/artifactSha256`;
    if (!dependency || dependency.proof?.holder !== 'self' || dependency.proof?.pointer !== expectedPointer) {
      throw new Error(`relational closure dependency graph does not bind ${spec.role} through ${expectedPointer}`);
    }
    const bytes = evidenceBytes(transactionContext, matches[0].id);
    if (bytes == null) throw new Error(`relational closure support bytes are missing for ${spec.role}`);
    context[`${spec.key}Bytes`] = bytes;
  }
  const validation = validateCertificationRelationalEvidence(closure, context);
  if (!validation.valid) throw new Error(`certification relational evidence is invalid: ${validation.errors.join('; ')}`);
  return {evidence:closure, source:transactionContext.transactionSource};
}

async function policyForHead(root, state, head) {
  const policyArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'certification-policy');
  if (policyArtifacts.length > 1) throw new Error('certification checkpoint may bind at most one certification-policy artifact');
  const fixture = isTrustedContractFixtureProject(state);
  const requiresRegisteredComparison = !fixture;
  const requiresRelationalClosure = !fixture;
  const requiresFinalCandidateAuthority = !fixture;
  if (!policyArtifacts.length) {
    return {
      policy: createDefaultWholeObjectCertificationPolicy({
        requiresRegisteredComparison,
        requiresRelationalClosure,
        requiresFinalCandidateAuthority,
      }),
      policySource: 'runtime-default',
    };
  }
  const bytes = await readBoundArtifact(root, policyArtifacts[0], 'certification-policy artifact');
  const policy = jsonBytes(bytes, 'certification-policy artifact');
  const validation = validateCertificationPolicy(policy);
  if (!validation.valid) throw new Error(`certification policy is invalid: ${validation.errors.join('; ')}`);
  const authority = validateWholeObjectPolicyAuthority(policy, {
    requiresRegisteredComparison,
    requiresRelationalClosure,
    requiresFinalCandidateAuthority,
  });
  if (!authority.valid) throw new Error(`certification policy weakens mandatory whole-object authority: ${authority.errors.join('; ')}`);
  return {policy, policySource: 'checkpoint-artifact'};
}

export async function assessClaimCertification(root) {
  root = path.resolve(root);
  const state = await loadProject(root);
  if (!state.head) return {required: false, valid: true, errors: [], transaction: null, policy: null, decision: null, relationalClosure:null};
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') {
    return {required: false, valid: true, errors: [], transaction: null, policy: null, decision: null, relationalClosure:null};
  }
  const errors = [];
  try {
    const reviewArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'visual-review');
    if (reviewArtifacts.length !== 1) throw new Error('claim certification requires exactly one digest-bound visual-review artifact');
    const reviewBytes = await readBoundArtifact(root, reviewArtifacts[0], 'visual-review artifact');
    const review = jsonBytes(reviewBytes, 'visual-review artifact');
    const candidateArtifact = candidateArtifactFromReview(head, review);
    if (!candidateArtifact) throw new Error('claim certification cannot resolve the exact candidate artifact from the visual review');
    const candidateBytes = await readBoundArtifact(root, candidateArtifact, 'certification candidate artifact');

    const transactionArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'candidate-transaction');
    if (transactionArtifacts.length > 1) throw new Error('certification checkpoint may bind at most one candidate-transaction artifact');
    const transactionContext = transactionArtifacts.length
      ? await explicitTransactionContext(root, head, candidateArtifact, candidateBytes, transactionArtifacts[0])
      : await synthesizedTransactionContext(root, state, head, reviewArtifacts[0], review, candidateBytes);
    const fixture = isTrustedContractFixtureProject(state);
    const finalCandidateAuthority = await validateTransactionFinalCandidateAuthority(
      root,
      state,
      head,
      transactionContext,
      {required:!fixture},
    );
    const relationalClosure = validateTransactionRelationalClosure(transactionContext, {required:!fixture});

    const {policy, policySource} = await policyForHead(root, state, head);
    const recomputedDecision = evaluateCertificationPolicy({
      transaction: transactionContext.transaction,
      policy,
      evidenceBytesById: transactionContext.evidenceBytesById,
    });

    const decisionArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'claim-certification-decision');
    if (decisionArtifacts.length > 1) throw new Error('certification checkpoint may bind at most one claim-certification-decision artifact');
    let decision = recomputedDecision;
    let decisionSource = 'runtime-evaluated';
    if (decisionArtifacts.length) {
      const bytes = await readBoundArtifact(root, decisionArtifacts[0], 'claim-certification-decision artifact');
      decision = jsonBytes(bytes, 'claim-certification-decision artifact');
      const validation = validateClaimCertificationDecision(decision, {
        transaction: transactionContext.transaction,
        policy,
        evidenceBytesById: transactionContext.evidenceBytesById,
      });
      if (!validation.valid) throw new Error(`claim certification decision is invalid: ${validation.errors.join('; ')}`);
      decisionSource = 'checkpoint-artifact';
    }
    if (!decision.authorized) throw new Error(`certification policy refuses required claims: ${decision.refusedClaimIds.join(', ')}`);
    return {
      required: true,
      valid: true,
      errors: [],
      transaction: transactionContext.transaction,
      transactionSource: transactionContext.transactionSource,
      policy,
      policySource,
      decision,
      decisionSource,
      candidateLineageProof: finalCandidateAuthority?.lineageProof ?? null,
      finalResemblanceClosure: finalCandidateAuthority?.finalResemblanceClosure ?? null,
      finalCandidateAuthoritySource: finalCandidateAuthority?.source ?? null,
      relationalClosure: relationalClosure?.evidence ?? null,
      relationalClosureSource: relationalClosure?.source ?? null,
    };
  } catch (error) {
    errors.push(error.message);
    return {
      required:true,
      valid:false,
      errors,
      transaction:null,
      policy:null,
      decision:null,
      candidateLineageProof:null,
      finalResemblanceClosure:null,
      finalCandidateAuthoritySource:null,
      relationalClosure:null,
    };
  }
}

function claimBinding(assessment) {
  return {
    transaction: {
      id: assessment.transaction.id,
      transactionDigest: assessment.transaction.transactionDigest,
      source: assessment.transactionSource,
    },
    policy: {
      id: assessment.policy.id,
      policyDigest: assessment.policy.policyDigest,
      source: assessment.policySource,
    },
    decision: {
      decisionDigest: assessment.decision.decisionDigest,
      source: assessment.decisionSource,
      authorizedClaimIds: assessment.decision.authorizedClaimIds,
      refusedClaimIds: assessment.decision.refusedClaimIds,
    },
    candidateAuthority: assessment.candidateLineageProof && assessment.finalResemblanceClosure ? {
      candidateLineageDigest: assessment.candidateLineageProof.lineageDigest,
      finalResemblanceClosureDigest: assessment.finalResemblanceClosure.closureDigest,
      source: assessment.finalCandidateAuthoritySource,
    } : null,
    relationalClosure: assessment.relationalClosure ? {
      relationalCertificationDigest: assessment.relationalClosure.relationalCertificationDigest,
      source: assessment.relationalClosureSource,
    } : null,
  };
}

export async function assessProjectionCertification(root) {
  const state = await loadProject(root);
  if (!state.head) return {required: false, valid: true, errors: [], proof: null};
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') {
    return {required: false, valid: true, errors: [], proof: null};
  }
  const visualReview = await readVisualReview(root, head);
  return inspectCertificationProjectionEvidence(path.resolve(root), state, head, visualReview);
}

export async function assessCertification(root) {
  const base = await assessCertificationBase(root);
  if (!base.checkpointId) return base;
  const [projection, claims] = await Promise.all([assessProjectionCertification(root), assessClaimCertification(root)]);
  const errors = [...base.errors, ...projection.errors, ...claims.errors];
  return Object.freeze({
    ...base,
    ready: errors.length === 0,
    errors,
    realizedProjectionRequired: projection.required,
    realizedProjectionDigest: projection.proof?.realizedProjectionDigest ?? null,
    candidateTransactionDigest: claims.transaction?.transactionDigest ?? null,
    certificationPolicyDigest: claims.policy?.policyDigest ?? null,
    claimDecisionDigest: claims.decision?.decisionDigest ?? null,
    candidateLineageDigest: claims.candidateLineageProof?.lineageDigest ?? null,
    finalResemblanceClosureDigest: claims.finalResemblanceClosure?.closureDigest ?? null,
    relationalCertificationDigest: claims.relationalClosure?.relationalCertificationDigest ?? null,
    authorizedClaimIds: claims.decision?.authorizedClaimIds ?? [],
  });
}

export async function certifyProject(root) {
  root = path.resolve(root);
  const readiness = await assessCertification(root);
  if (!readiness.ready) throw new Error(`certification refused: ${readiness.errors.join('; ')}`);
  const claims = await assessClaimCertification(root);
  const certificate = await certifyProjectBase(root);
  const binding = claimBinding(claims);
  const claimCertificationDigest = digestJson(binding);
  const enriched = {...certificate, claimCertification: binding, claimCertificationDigest};
  await writeJsonAtomic(certificateFile(root), enriched);
  const state = await loadProject(root);
  state.certification = {...state.certification, claimCertificationDigest};
  state.journal.push({
    event: 'CLAIMS_CERTIFIED',
    checkpointId: state.head,
    transactionDigest: binding.transaction.transactionDigest,
    policyDigest: binding.policy.policyDigest,
    decisionDigest: binding.decision.decisionDigest,
    candidateLineageDigest: binding.candidateAuthority?.candidateLineageDigest ?? null,
    finalResemblanceClosureDigest: binding.candidateAuthority?.finalResemblanceClosureDigest ?? null,
    relationalCertificationDigest: binding.relationalClosure?.relationalCertificationDigest ?? null,
    claimCertificationDigest,
    at: certificate.certifiedAt,
  });
  await writeJsonAtomic(projectStateFile(root), state);
  return Object.freeze(enriched);
}

export async function auditProject(root) {
  root = path.resolve(root);
  const base = await auditProjectBase(root);
  const state = await loadProject(root);
  if (!state.head) return base;
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') return base;
  const projection = await assessProjectionCertification(root);
  const errors = [
    ...base.errors,
    ...projection.errors.map((error) => `certification reprojection: ${error}`),
  ];
  if (state.certification) {
    const claims = await assessClaimCertification(root);
    errors.push(...claims.errors.map((error) => `claim certification: ${error}`));
    if (claims.valid) {
      try {
        const certificate = await readJson(certificateFile(root));
        const expectedBinding = claimBinding(claims);
        const expectedDigest = digestJson(expectedBinding);
        if (digestJson(certificate.claimCertification ?? {}) !== digestJson(expectedBinding)) errors.push('certificate claim binding does not reproduce from current transaction and policy');
        if (certificate.claimCertificationDigest !== expectedDigest) errors.push('certificate claim certification digest mismatch');
        if (state.certification.claimCertificationDigest !== expectedDigest) errors.push('project state claim certification digest mismatch');
      } catch (error) {
        errors.push(`claim certificate unavailable: ${error.message}`);
      }
    }
  }
  return {...base, valid: errors.length === 0, errors};
}

export async function resumeProject(root) {
  const base = await resumeProjectBase(root);
  if (!['CERTIFY', 'DONE'].includes(base.nextAction)) return base;
  const [projection, claims] = await Promise.all([assessProjectionCertification(root), assessClaimCertification(root)]);
  if (!projection.valid) {
    return {
      ...base,
      activeWork: {capability: 'whole-object-certification', scopeId: 'whole'},
      nextAction: 'REQUEST_VISUAL_REVIEW',
      certificationErrors: projection.errors,
      reason: projection.errors[0],
    };
  }
  if (!claims.valid) {
    return {
      ...base,
      activeWork: {capability: 'whole-object-certification', scopeId: 'whole'},
      nextAction: 'REQUEST_CERTIFICATION_EVIDENCE',
      certificationErrors: claims.errors,
      reason: claims.errors[0],
    };
  }
  return base;
}

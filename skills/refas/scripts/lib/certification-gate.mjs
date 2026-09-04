import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assessCertification as assessCertificationBase,
  auditProject as auditProjectBase,
  certifyProject as certifyProjectBase,
  loadCheckpoint,
  loadProject,
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
import {inspectCertificationProjectionEvidence} from './certification-projection-evidence.mjs';

const CONTRACT_FIXTURE_ACQUISITIONS = new Set(['test-fixture', 'deterministic-project-fixture', 'synthetic-test-fixture']);
const INTERNAL_ROOT = '.refas';
const certificateFile = (root) => path.join(path.resolve(root), INTERNAL_ROOT, 'certification.json');
const projectStateFile = (root) => path.join(path.resolve(root), INTERNAL_ROOT, 'project.json');

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

function isFixtureSource(state) {
  return CONTRACT_FIXTURE_ACQUISITIONS.has(String(state.source?.acquisition?.kind ?? '').toLowerCase());
}

function candidateArtifactFromReview(head, review) {
  const candidates = (head.artifactRefs ?? []).filter((artifact) => artifact.sha256 === review?.assetSha256 && artifact.kind !== 'visual-review');
  return candidates.find((artifact) => artifact.kind === 'glb' || String(artifact.path).toLowerCase().endsWith('.glb')) ?? candidates[0] ?? null;
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
  const requiresRegisteredComparison = !isFixtureSource(state);
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
  if (requiresRegisteredComparison) obligations.push({id: 'registered-comparison', role: 'registered-comparison', schema: 'refas.registered-comparison/v1'});
  const transaction = createCandidateTransaction({candidateBytes, checkpoint: head, evidence, decisionNodeIds: ['visual-review'], obligations});
  const evidenceBytesById = new Map(evidence.map((item) => [item.id, Buffer.from(item.bytes)]));
  const validation = validateCandidateTransaction(transaction, {candidateBytes, checkpoint: head, evidenceBytesById});
  if (!validation.valid) throw new Error(`synthesized candidate transaction is invalid: ${validation.errors.join('; ')}`);
  return {transaction, evidenceBytesById, transactionSource: 'runtime-synthesized'};
}

async function policyForHead(root, state, head) {
  const policyArtifacts = (head.artifactRefs ?? []).filter((artifact) => artifact.kind === 'certification-policy');
  if (policyArtifacts.length > 1) throw new Error('certification checkpoint may bind at most one certification-policy artifact');
  if (!policyArtifacts.length) {
    return {policy: createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison: !isFixtureSource(state)}), policySource: 'runtime-default'};
  }
  const bytes = await readBoundArtifact(root, policyArtifacts[0], 'certification-policy artifact');
  const policy = jsonBytes(bytes, 'certification-policy artifact');
  const validation = validateCertificationPolicy(policy);
  if (!validation.valid) throw new Error(`certification policy is invalid: ${validation.errors.join('; ')}`);
  return {policy, policySource: 'checkpoint-artifact'};
}

export async function assessClaimCertification(root) {
  root = path.resolve(root);
  const state = await loadProject(root);
  if (!state.head) return {required: false, valid: true, errors: [], transaction: null, policy: null, decision: null};
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') {
    return {required: false, valid: true, errors: [], transaction: null, policy: null, decision: null};
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
    };
  } catch (error) {
    errors.push(error.message);
    return {required: true, valid: false, errors, transaction: null, policy: null, decision: null};
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

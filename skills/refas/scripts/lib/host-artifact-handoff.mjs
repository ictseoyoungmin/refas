import path from 'node:path';

import {
  assertDigest,
  assertId,
  deepFreeze,
  digestJson,
  readJson,
  stableStringify,
} from './canonical.mjs';
import {loadCheckpoint, loadProject} from './checkpoint-store.mjs';
import {assessCertification, assessClaimCertification, auditProject} from './certification-gate.mjs';
import {getCurrentArtifact, loadHostSession} from './host-session.mjs';

export const ARTIFACT_HANDOFF_SCHEMA = 'refas.artifact-handoff/v1';
export const ARTIFACT_HANDOFF_CERTIFICATION_STATUSES = Object.freeze(['uncertified', 'ready', 'certified']);

const POLICY = Object.freeze({
  readOnlyTransferDescriptor: true,
  checkpointAuthorityRemainsRefAs: true,
  candidateTransactionAuthorityRemainsRefAs: true,
  certificationAuthorityRemainsRefAs: true,
  handoffCannotCertify: true,
});

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'sessionId',
  'projectId',
  'checkpointId',
  'checkpointContentDigest',
  'artifact',
  'candidateTransactionDigest',
  'certification',
  'policy',
  'handoffDigest',
]);

function projectRoot(root) { return path.resolve(root); }

function checkpointCore(checkpoint) {
  return {
    schema: checkpoint.schema,
    parentId: checkpoint.parentId,
    capability: checkpoint.capability,
    scopeId: checkpoint.scopeId,
    reason: checkpoint.reason,
    artifactRefs: checkpoint.artifactRefs,
    claims: checkpoint.claims,
    gates: checkpoint.gates,
    metadata: checkpoint.metadata,
    transactionId: checkpoint.transactionId ?? null,
  };
}

function validateCheckpointIdentity(checkpoint) {
  if (!checkpoint || checkpoint.schema !== 'refas.checkpoint/v1') throw new Error('artifact handoff requires a current refas.checkpoint/v1 checkpoint');
  const contentDigest = digestJson(checkpointCore(checkpoint));
  if (checkpoint.contentDigest !== contentDigest) throw new Error('artifact handoff checkpoint content digest mismatch');
  const expectedId = `cp_${contentDigest.slice(0, 20)}`;
  if (checkpoint.id !== expectedId) throw new Error('artifact handoff checkpoint ID/content digest mismatch');
  return contentDigest;
}

function normalizeArtifactReference(raw) {
  if (!raw || raw.schema !== 'refas.content-reference/v1') throw new Error('artifact handoff requires a content reference');
  if (raw.kind !== 'glb') throw new Error('artifact handoff requires a GLB candidate');
  const relative = String(raw.path ?? '');
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('artifact handoff path must be normalized and project-relative');
  if (relative === '.refas' || relative.startsWith('.refas/') || relative.split('/').includes('..')) throw new Error('artifact handoff path may not escape into internal or parent state');
  if (path.posix.normalize(relative) !== relative) throw new Error('artifact handoff path must already be normalized');
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error('artifact handoff sizeBytes must be a non-negative safe integer');
  return {
    schema: 'refas.content-reference/v1',
    kind: 'glb',
    path: relative,
    sha256: assertDigest(raw.sha256, 'artifact.sha256'),
    sizeBytes,
  };
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (stableStringify(keys) !== stableStringify(wanted)) throw new Error(`${label} contains unsupported fields`);
}

async function certificationProjection(root, {projectId, checkpointId, checkpointContentDigest, artifact}) {
  const state = await loadProject(root);
  if (state.projectId !== projectId) throw new Error('artifact handoff project/session persistence mismatch');
  if (state.head !== checkpointId) throw new Error('artifact handoff checkpoint is no longer the current head');

  const [readiness, claims] = await Promise.all([
    assessCertification(root),
    assessClaimCertification(root),
  ]);

  let candidateTransactionDigest = null;
  if (claims.required && claims.valid) {
    const transaction = claims.transaction;
    if (!transaction) throw new Error('claim certification reported valid without a candidate transaction');
    if (transaction.rootCandidate?.sha256 !== artifact.sha256) {
      throw new Error('candidate transaction root candidate does not match the artifact handoff candidate');
    }
    if (transaction.checkpoint?.checkpointId !== checkpointId || transaction.checkpoint?.checkpointContentDigest !== checkpointContentDigest) {
      throw new Error('candidate transaction checkpoint binding does not match the artifact handoff checkpoint');
    }
    candidateTransactionDigest = assertDigest(transaction.transactionDigest, 'candidateTransactionDigest');
    if (readiness.candidateTransactionDigest != null && readiness.candidateTransactionDigest !== candidateTransactionDigest) {
      throw new Error('certification readiness candidate transaction digest mismatch');
    }
  }

  if (!state.certification) {
    const status = readiness.ready && claims.required && claims.valid ? 'ready' : 'uncertified';
    return {
      candidateTransactionDigest,
      certification: {status, certificateDigest: null},
    };
  }

  if (state.status !== 'certified') throw new Error('project carries certification state without certified project status');
  if (state.certification.checkpointId !== checkpointId) throw new Error('project certification is stale for the current checkpoint');
  if (!claims.required || !claims.valid || !candidateTransactionDigest) {
    throw new Error('certified artifact handoff requires a valid exact candidate transaction');
  }
  if (!readiness.ready) throw new Error(`certified artifact handoff no longer satisfies certification readiness: ${readiness.errors.join('; ')}`);

  const audit = await auditProject(root);
  if (!audit.valid) throw new Error(`certified artifact handoff failed RefAs project audit: ${audit.errors.join('; ')}`);

  const certificate = await readJson(path.join(root, '.refas', 'certification.json'));
  if (certificate?.schema !== 'refas.whole-object-certificate/v1') throw new Error('current whole-object certificate schema is invalid');
  if (certificate.checkpointId !== checkpointId || certificate.checkpointDigest !== checkpointContentDigest) {
    throw new Error('whole-object certificate does not bind the current artifact handoff checkpoint');
  }
  const certificateDigest = assertDigest(certificate.certificateDigest, 'certificateDigest');
  if (state.certification.certificateDigest !== certificateDigest) throw new Error('project certification digest does not match the current certificate');
  const certificateTransactionDigest = certificate.claimCertification?.transaction?.transactionDigest ?? null;
  if (certificateTransactionDigest !== candidateTransactionDigest) {
    throw new Error('whole-object certificate candidate transaction does not match the artifact handoff candidate');
  }

  return {
    candidateTransactionDigest,
    certification: {status: 'certified', certificateDigest},
  };
}

function handoffPayload({session, checkpoint, checkpointContentDigest, artifact, candidateTransactionDigest, certification}) {
  return {
    schema: ARTIFACT_HANDOFF_SCHEMA,
    sessionId: session.sessionId,
    projectId: session.projectId,
    checkpointId: checkpoint.id,
    checkpointContentDigest,
    artifact,
    candidateTransactionDigest,
    certification,
    policy: {...POLICY},
  };
}

export async function getArtifactHandoff(root) {
  root = projectRoot(root);
  const session = await loadHostSession(root);
  if (!session.headCheckpointId) throw new Error('artifact handoff requires a current checkpoint');

  const state = await loadProject(root);
  if (state.projectId !== session.projectId) throw new Error('artifact handoff host session project mismatch');
  if (state.head !== session.headCheckpointId) throw new Error('artifact handoff host session head mismatch');

  const checkpoint = await loadCheckpoint(root, state.head);
  const checkpointContentDigest = validateCheckpointIdentity(checkpoint);
  const artifact = normalizeArtifactReference(await getCurrentArtifact(root, {state}));
  if (!artifact) throw new Error('artifact handoff requires one unambiguous current GLB candidate');
  if (session.currentCandidate?.sha256 !== artifact.sha256 || session.currentCandidate?.kind !== 'glb') {
    throw new Error('artifact handoff session candidate does not match the exact current GLB');
  }

  const projected = await certificationProjection(root, {
    projectId: session.projectId,
    checkpointId: checkpoint.id,
    checkpointContentDigest,
    artifact,
  });
  const payload = handoffPayload({
    session,
    checkpoint,
    checkpointContentDigest,
    artifact,
    candidateTransactionDigest: projected.candidateTransactionDigest,
    certification: projected.certification,
  });
  return deepFreeze({...payload, handoffDigest: digestJson(payload)});
}

export function validateArtifactHandoff(handoff) {
  const errors = [];
  try {
    exactKeys(handoff, TOP_LEVEL_KEYS, 'artifact handoff');
    if (handoff.schema !== ARTIFACT_HANDOFF_SCHEMA) throw new Error('invalid artifact handoff schema');
    assertId(handoff.sessionId, 'sessionId');
    assertId(handoff.projectId, 'projectId');
    assertId(handoff.checkpointId, 'checkpointId');
    assertDigest(handoff.checkpointContentDigest, 'checkpointContentDigest');
    const artifact = normalizeArtifactReference(handoff.artifact);
    if (stableStringify(artifact) !== stableStringify(handoff.artifact)) throw new Error('artifact handoff content reference is not canonical');
    if (handoff.candidateTransactionDigest != null) assertDigest(handoff.candidateTransactionDigest, 'candidateTransactionDigest');

    exactKeys(handoff.certification, ['status', 'certificateDigest'], 'artifact handoff certification');
    if (!ARTIFACT_HANDOFF_CERTIFICATION_STATUSES.includes(handoff.certification.status)) throw new Error('artifact handoff certification status is invalid');
    if (handoff.certification.status === 'certified') {
      assertDigest(handoff.certification.certificateDigest, 'certification.certificateDigest');
      if (handoff.candidateTransactionDigest == null) throw new Error('certified artifact handoff requires candidateTransactionDigest');
    } else if (handoff.certification.certificateDigest !== null) {
      throw new Error('uncertified or ready artifact handoff cannot expose a certificate digest');
    }

    if (stableStringify(handoff.policy) !== stableStringify(POLICY)) throw new Error('artifact handoff authority policy mismatch');
    const payload = structuredClone(handoff);
    delete payload.handoffDigest;
    if (handoff.handoffDigest !== digestJson(payload)) throw new Error('artifact handoff digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export async function assertArtifactHandoffCurrent(root, handoff) {
  const validation = validateArtifactHandoff(handoff);
  if (!validation.valid) throw new Error(`artifact handoff is invalid: ${validation.errors.join('; ')}`);
  const current = await getArtifactHandoff(root);
  if (current.handoffDigest !== handoff.handoffDigest) {
    throw new Error('artifact handoff is stale for the current session, checkpoint, candidate, transaction, or certification state');
  }
  return current;
}

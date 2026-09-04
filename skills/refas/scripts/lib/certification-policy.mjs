import {assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {validateCandidateTransaction} from './candidate-transaction.mjs';

export const CERTIFICATION_POLICY_SCHEMA = 'refas.certification-policy/v1';
export const CLAIM_CERTIFICATION_DECISION_SCHEMA = 'refas.claim-certification-decision/v1';

const BLOCKING_SEVERITIES = ['blocking', 'critical', 'major'];
const uniqueSorted = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function decodePointerToken(token, label) {
  if (/~(?![01])/u.test(token)) throw new Error(`${label} contains an invalid JSON Pointer escape`);
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolvePointer(document, pointer, label) {
  const raw = String(pointer ?? '');
  if (!raw.startsWith('/')) throw new Error(`${label} must be an absolute JSON Pointer`);
  let value = document;
  for (const token of raw.slice(1).split('/').map((item) => decodePointerToken(item, label))) {
    if (value == null || typeof value !== 'object' || !(token in value)) throw new Error(`${label} does not resolve`);
    value = value[token];
  }
  return value;
}

function normalizeObligation(raw, label) {
  const role = raw?.role == null ? null : assertId(raw.role, `${label}.role`);
  const schema = raw?.schema == null ? null : String(raw.schema);
  const minCount = Number(raw?.minCount ?? 1);
  if (!role && !schema) throw new Error(`${label} requires role and/or schema`);
  if (!Number.isInteger(minCount) || minCount < 1) throw new Error(`${label}.minCount must be a positive integer`);
  return {id: assertId(raw?.id, `${label}.id`), role, schema, minCount};
}

function normalizeFindingSource(raw, label) {
  const role = raw?.role == null ? null : assertId(raw.role, `${label}.role`);
  const schema = raw?.schema == null ? null : String(raw.schema);
  const pointer = String(raw?.pointer ?? '');
  if (!role && !schema) throw new Error(`${label} requires role and/or schema`);
  if (!pointer.startsWith('/')) throw new Error(`${label}.pointer must be an absolute JSON Pointer`);
  return {role, schema, pointer};
}

function normalizeClaim(raw, index) {
  const label = `claims[${index}]`;
  const obligations = (raw?.obligations ?? []).map((item, obligationIndex) => normalizeObligation(item, `${label}.obligations[${obligationIndex}]`));
  if (!obligations.length) throw new Error(`${label}.obligations must be non-empty`);
  const obligationIds = obligations.map((item) => item.id);
  if (new Set(obligationIds).size !== obligationIds.length) throw new Error(`${label} obligation IDs must be unique`);
  const findingSources = (raw?.findingSources ?? []).map((item, sourceIndex) => normalizeFindingSource(item, `${label}.findingSources[${sourceIndex}]`));
  return {
    id: assertId(raw?.id, `${label}.id`),
    description: String(raw?.description ?? ''),
    required: raw?.required !== false,
    obligations: obligations.sort((a, b) => a.id.localeCompare(b.id)),
    findingSources,
    vetoSeverities: uniqueSorted(raw?.vetoSeverities?.length ? raw.vetoSeverities : BLOCKING_SEVERITIES),
  };
}

function policyCore(value) {
  return {
    schema: CERTIFICATION_POLICY_SCHEMA,
    id: value.id,
    claims: value.claims,
    policy: value.policy,
  };
}

function runtimePolicy() {
  return {
    transactionValidityAloneCannotAuthorizeClaims: true,
    claimEvidenceObligationsAreExplicit: true,
    blockingFindingsVetoAffectedClaims: true,
    nonBlockingFindingsRemainDisclosed: true,
    certificationPolicyDoesNotMutateArtifacts: true,
  };
}

export function createCertificationPolicy({id = 'whole-object-claim-policy', claims = []} = {}) {
  if (!Array.isArray(claims) || !claims.length) throw new Error('certification policy requires at least one claim');
  const normalizedClaims = claims.map(normalizeClaim).sort((a, b) => a.id.localeCompare(b.id));
  const claimIds = normalizedClaims.map((claim) => claim.id);
  if (new Set(claimIds).size !== claimIds.length) throw new Error('certification policy claim IDs must be unique');
  const core = {
    schema: CERTIFICATION_POLICY_SCHEMA,
    id: assertId(id, 'policy.id'),
    claims: normalizedClaims,
    policy: runtimePolicy(),
  };
  return deepFreeze({...core, policyDigest: digestJson(core)});
}

export function createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison = true} = {}) {
  const obligations = [
    {id: 'independent-visual-review', role: 'visual-review', schema: 'refas.visual-review/v1', minCount: 1},
    {id: 'independent-render-report', role: 'render-report', schema: 'refas.pbr-render-report/v1', minCount: 1},
  ];
  if (requiresRegisteredComparison) obligations.push({id: 'registered-source-comparison', role: 'registered-comparison', schema: 'refas.registered-comparison/v1', minCount: 1});
  return createCertificationPolicy({
    id: requiresRegisteredComparison ? 'source-bound-whole-object-policy' : 'fixture-whole-object-policy',
    claims: [{
      id: 'visual-source-fidelity',
      description: 'The exact candidate is supported by current independent visual evidence under the existing RefAs visual and projection gates.',
      obligations,
      findingSources: [{role: 'visual-review', schema: 'refas.visual-review/v1', pointer: '/unresolvedFindings'}],
      vetoSeverities: BLOCKING_SEVERITIES,
    }],
  });
}

export function validateCertificationPolicy(value) {
  const errors = [];
  try {
    if (value?.schema !== CERTIFICATION_POLICY_SCHEMA) errors.push('invalid certification policy schema');
    const normalized = createCertificationPolicy({id: value?.id, claims: value?.claims ?? []});
    if (digestJson(policyCore(normalized)) !== digestJson(policyCore(value ?? {}))) errors.push('certification policy is not canonical or runtime policy is altered');
    if (normalized.policyDigest !== value?.policyDigest) errors.push('certification policy digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function contextBytes(context, id) {
  if (context?.evidenceBytesById instanceof Map) return context.evidenceBytesById.get(id);
  return context?.evidenceBytesById?.[id];
}

function contextDocument(transaction, context, id) {
  const node = transaction.evidenceNodes.find((item) => item.id === id);
  if (!node) throw new Error(`unknown evidence node ${id}`);
  const raw = contextBytes(context, id);
  if (raw == null) throw new Error(`missing evidence bytes for claim finding source ${id}`);
  const bytes = Buffer.from(raw);
  if (bytes.length !== node.sizeBytes || digestBytes(bytes) !== node.artifactSha256) throw new Error(`claim finding source bytes do not match transaction evidence ${id}`);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`claim finding source ${id} is not valid JSON`);
  }
}

function obligationChecks(nodes, obligations) {
  return obligations.map((obligation) => {
    const matchingNodeIds = nodes
      .filter((node) => (obligation.role == null || node.role === obligation.role) && (obligation.schema == null || node.schema === obligation.schema))
      .map((node) => node.id)
      .sort();
    return {id: obligation.id, matchingNodeIds, pass: matchingNodeIds.length >= obligation.minCount};
  });
}

function normalizedFinding(raw, sourceNodeId) {
  return {
    sourceNodeId,
    category: String(raw?.category ?? 'unspecified'),
    severity: String(raw?.severity ?? '').toLowerCase(),
    blocking: raw?.blocking === true,
    summary: String(raw?.summary ?? ''),
  };
}

function collectFindings(claim, transaction, context) {
  const findings = [];
  for (const source of claim.findingSources) {
    const nodes = transaction.evidenceNodes.filter((node) => (source.role == null || node.role === source.role) && (source.schema == null || node.schema === source.schema));
    for (const node of nodes) {
      const document = contextDocument(transaction, context, node.id);
      const raw = resolvePointer(document, source.pointer, `claim ${claim.id} finding source ${node.id}`);
      if (!Array.isArray(raw)) throw new Error(`claim ${claim.id} finding source ${node.id} must resolve to an array`);
      findings.push(...raw.map((item) => normalizedFinding(item, node.id)));
    }
  }
  return findings;
}

function decisionCore(value) {
  return {
    schema: CLAIM_CERTIFICATION_DECISION_SCHEMA,
    transaction: value.transaction,
    policy: value.policy,
    claims: value.claims,
    authorizedClaimIds: value.authorizedClaimIds,
    refusedClaimIds: value.refusedClaimIds,
    authorized: value.authorized,
  };
}

export function evaluateCertificationPolicy({transaction, policy, evidenceBytesById = {}} = {}) {
  const transactionValidation = validateCandidateTransaction(transaction);
  if (!transactionValidation.valid) throw new Error(`candidate transaction is invalid: ${transactionValidation.errors.join('; ')}`);
  const policyValidation = validateCertificationPolicy(policy);
  if (!policyValidation.valid) throw new Error(`certification policy is invalid: ${policyValidation.errors.join('; ')}`);
  const context = {evidenceBytesById};
  const claims = policy.claims.map((claim) => {
    const checks = obligationChecks(transaction.evidenceNodes, claim.obligations);
    const findings = collectFindings(claim, transaction, context);
    const vetoFindings = findings.filter((finding) => finding.blocking || claim.vetoSeverities.includes(finding.severity));
    const disclosedFindings = findings.filter((finding) => !vetoFindings.includes(finding));
    const pass = checks.every((check) => check.pass) && vetoFindings.length === 0;
    return {
      id: claim.id,
      required: claim.required,
      status: pass ? 'pass' : 'fail',
      obligationChecks: checks,
      matchedEvidenceNodeIds: uniqueSorted(checks.flatMap((check) => check.matchingNodeIds)),
      vetoFindings,
      disclosedFindings,
    };
  });
  const authorizedClaimIds = claims.filter((claim) => claim.status === 'pass').map((claim) => claim.id).sort();
  const refusedClaimIds = claims.filter((claim) => claim.status !== 'pass').map((claim) => claim.id).sort();
  const authorized = claims.filter((claim) => claim.required).every((claim) => claim.status === 'pass');
  const core = {
    schema: CLAIM_CERTIFICATION_DECISION_SCHEMA,
    transaction: {
      id: transaction.id,
      transactionDigest: transaction.transactionDigest,
      candidateSha256: transaction.rootCandidate.sha256,
      checkpointId: transaction.checkpoint.checkpointId,
      checkpointContentDigest: transaction.checkpoint.checkpointContentDigest,
    },
    policy: {id: policy.id, policyDigest: policy.policyDigest},
    claims,
    authorizedClaimIds,
    refusedClaimIds,
    authorized,
  };
  return deepFreeze({...core, decisionDigest: digestJson(core)});
}

export function validateClaimCertificationDecision(value, context = {}) {
  const errors = [];
  try {
    if (value?.schema !== CLAIM_CERTIFICATION_DECISION_SCHEMA) errors.push('invalid claim certification decision schema');
    const expected = evaluateCertificationPolicy(context);
    if (digestJson(decisionCore(value ?? {})) !== digestJson(decisionCore(expected))) errors.push('claim certification decision does not reproduce from transaction, policy, and evidence');
    if (value?.decisionDigest !== expected.decisionDigest) errors.push('claim certification decision digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

import {Buffer} from 'node:buffer';

import {digestJson} from './canonical.mjs';
import {
  evaluateCertificationPolicy as evaluateCertificationPolicyCore,
  validateClaimCertificationDecision as validateClaimCertificationDecisionCore,
} from './certification-policy.mjs';
import {
  PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
  physicalClaimEvidenceRole,
  validatePhysicalClaimEvidenceBindings,
} from './physical-claims.mjs';

const PHYSICAL_CLAIM_ROLE_PREFIX = 'physical-claim-';

function selectorUsesPhysicalClaimEvidence(selector) {
  return selector?.schema === PHYSICAL_CLAIM_EVIDENCE_SCHEMA
    || String(selector?.role ?? '').startsWith(PHYSICAL_CLAIM_ROLE_PREFIX);
}

function selectorMatchesNode(selector, node) {
  return (selector?.role == null || node.role === selector.role)
    && (selector?.schema == null || node.schema === selector.schema);
}

function physicalSelectors(policy) {
  const selectors = [];
  for (const claim of policy?.claims ?? []) {
    for (const obligation of claim.obligations ?? []) {
      if (selectorUsesPhysicalClaimEvidence(obligation)) selectors.push(obligation);
    }
    for (const source of claim.findingSources ?? []) {
      if (selectorUsesPhysicalClaimEvidence(source)) selectors.push(source);
    }
  }
  return selectors;
}

function selectedPhysicalNodeIds(transaction, policy) {
  const ids = new Set();
  for (const selector of physicalSelectors(policy)) {
    for (const node of transaction?.evidenceNodes ?? []) {
      if (selectorMatchesNode(selector, node)) ids.add(node.id);
    }
  }
  return [...ids].sort();
}

function evidenceBytes(bytesById, id) {
  if (bytesById instanceof Map) return bytesById.get(id);
  return bytesById?.[id];
}

function evidenceContext(contexts, id) {
  if (contexts instanceof Map) return contexts.get(id);
  return contexts?.[id];
}

export function evaluateCertificationPolicy(args = {}) {
  if (physicalSelectors(args.policy).length) {
    throw new Error('physical claim evidence is live-gated; use evaluatePhysicalClaimCertification(...) so current P10-P15 bindings are validated before claim evaluation');
  }
  return evaluateCertificationPolicyCore(args);
}

export function validateClaimCertificationDecision(value, context = {}) {
  if (physicalSelectors(context?.policy).length) {
    return {
      valid: false,
      errors: ['physical claim certification decisions are live-gated; use validatePhysicalClaimCertificationDecision(...)'],
    };
  }
  return validateClaimCertificationDecisionCore(value, context);
}

export async function evaluatePhysicalClaimCertification({
  transaction,
  policy,
  evidenceBytesById = {},
  physicalClaimContextsByNodeId = {},
} = {}) {
  const selectedIds = selectedPhysicalNodeIds(transaction, policy);
  for (const nodeId of selectedIds) {
    const node = transaction?.evidenceNodes?.find((item) => item.id === nodeId);
    if (!node) throw new Error(`unknown physical claim evidence node ${nodeId}`);
    if (node.schema !== PHYSICAL_CLAIM_EVIDENCE_SCHEMA) {
      throw new Error(`physical claim role ${node.role} must use schema ${PHYSICAL_CLAIM_EVIDENCE_SCHEMA}`);
    }
    const bytes = evidenceBytes(evidenceBytesById, nodeId);
    if (bytes == null) throw new Error(`missing physical claim evidence bytes for ${nodeId}`);
    let evidence;
    try {
      evidence = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      throw new Error(`physical claim evidence ${nodeId} is not valid JSON`);
    }
    if (node.role !== physicalClaimEvidenceRole(evidence.claimId)) {
      throw new Error(`physical claim evidence ${nodeId} role does not match claimId ${evidence.claimId}`);
    }
    const context = evidenceContext(physicalClaimContextsByNodeId, nodeId);
    if (!context) throw new Error(`missing live physical claim context for ${nodeId}`);
    const live = await validatePhysicalClaimEvidenceBindings(evidence, context);
    if (!live.valid) throw new Error(`physical claim evidence ${nodeId} is not live: ${live.errors.join('; ')}`);
  }
  return evaluateCertificationPolicyCore({transaction, policy, evidenceBytesById});
}

export async function validatePhysicalClaimCertificationDecision(value, context = {}) {
  const errors = [];
  try {
    const expected = await evaluatePhysicalClaimCertification(context);
    if (digestJson(value) !== digestJson(expected)) {
      errors.push('physical claim certification decision does not reproduce from current live physical claim evidence');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

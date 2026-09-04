import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';

export const CANDIDATE_TRANSACTION_SCHEMA = 'refas.candidate-transaction/v1';

const uniqueSorted = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function checkpointContent(checkpoint) {
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

function validateCheckpointForCandidate(checkpoint, candidateSha256) {
  if (!checkpoint || checkpoint.schema !== 'refas.checkpoint/v1') throw new Error('candidate transaction requires a refas.checkpoint/v1 checkpoint');
  const contentDigest = digestJson(checkpointContent(checkpoint));
  if (checkpoint.contentDigest !== contentDigest) throw new Error('checkpoint content digest mismatch');
  const expectedId = `cp_${contentDigest.slice(0, 20)}`;
  if (checkpoint.id !== expectedId) throw new Error('checkpoint id does not match its content digest');
  const matches = (checkpoint.artifactRefs ?? []).filter((artifact) => artifact?.sha256 === candidateSha256);
  if (!matches.length) throw new Error('checkpoint does not contain the root candidate artifact');
  return {
    checkpointId: checkpoint.id,
    checkpointContentDigest: contentDigest,
    candidateArtifactSha256: candidateSha256,
  };
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must be JSON because it declares a schema or subject pointer`);
  }
}

function decodeJsonPointerToken(token) {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveJsonPointer(document, pointer, label) {
  const raw = String(pointer ?? '');
  if (!raw.startsWith('/') || raw.includes('//')) throw new Error(`${label} must be a non-empty absolute JSON Pointer`);
  let value = document;
  for (const token of raw.slice(1).split('/').map(decodeJsonPointerToken)) {
    if (value == null || typeof value !== 'object' || !(token in value)) throw new Error(`${label} does not resolve in artifact JSON`);
    value = value[token];
  }
  return value;
}

function normalizeObligations(obligations = []) {
  if (!Array.isArray(obligations)) throw new Error('obligations must be an array');
  const out = obligations.map((raw, index) => {
    const id = assertId(raw?.id, `obligations[${index}].id`);
    const role = raw?.role == null ? null : assertId(raw.role, `obligations[${index}].role`);
    const schema = raw?.schema == null ? null : String(raw.schema);
    const minCount = Number(raw?.minCount ?? 1);
    if (!role && !schema) throw new Error(`obligations[${index}] requires role and/or schema`);
    if (!Number.isInteger(minCount) || minCount < 1) throw new Error(`obligations[${index}].minCount must be a positive integer`);
    return {id, role, schema, minCount};
  });
  const ids = out.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('obligation IDs must be unique');
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function topologicalOrder(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const dependents = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) {
    for (const dependencyId of node.dependsOn) {
      if (!byId.has(dependencyId)) throw new Error(`unknown dependency ${dependencyId} for ${node.id}`);
      if (dependencyId === node.id) throw new Error(`self dependency for ${node.id}`);
      indegree.set(node.id, indegree.get(node.id) + 1);
      dependents.get(dependencyId).push(node.id);
    }
  }
  const ready = [...nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)].sort();
  const ordered = [];
  while (ready.length) {
    const id = ready.shift();
    ordered.push(byId.get(id));
    for (const dependentId of dependents.get(id).sort()) {
      const next = indegree.get(dependentId) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        ready.push(dependentId);
        ready.sort();
      }
    }
  }
  if (ordered.length !== nodes.length) throw new Error('candidate evidence dependency graph contains a cycle');
  return ordered;
}

function reachableFromDecisions(nodes, decisionNodeIds) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set();
  const stack = [...decisionNodeIds];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) throw new Error(`unknown decision node ${id}`);
    seen.add(id);
    stack.push(...node.dependsOn);
  }
  return seen;
}

function validateAnchoring(nodes, candidateSha256) {
  const anchored = new Map();
  for (const node of nodes) {
    if (node.subjectBinding.kind === 'json-pointer') {
      if (node.subjectBinding.candidateSha256 !== candidateSha256) throw new Error(`evidence ${node.id} binds a different candidate`);
      anchored.set(node.id, true);
      continue;
    }
    if (node.subjectBinding.kind !== 'derived') throw new Error(`evidence ${node.id} has an unknown subject binding kind`);
    if (!node.dependsOn.length) throw new Error(`derived evidence ${node.id} requires at least one dependency`);
    if (!node.dependsOn.every((id) => anchored.get(id) === true)) throw new Error(`derived evidence ${node.id} is not fully anchored to the root candidate`);
    anchored.set(node.id, true);
  }
}

function normalizeEvidenceInputs(evidence = [], candidateSha256) {
  if (!Array.isArray(evidence) || !evidence.length) throw new Error('candidate transaction requires at least one evidence node');
  const rawNodes = evidence.map((raw, index) => {
    const id = assertId(raw?.id, `evidence[${index}].id`);
    const role = assertId(raw?.role, `evidence[${index}].role`);
    const bytes = Buffer.from(raw?.bytes ?? []);
    if (!bytes.length) throw new Error(`evidence[${index}].bytes is required`);
    const schema = raw?.schema == null ? null : String(raw.schema);
    const subjectPointer = raw?.subjectPointer == null ? null : String(raw.subjectPointer);
    const dependsOn = uniqueSorted(raw?.dependsOn ?? []);
    for (const [dependencyIndex, dependencyId] of dependsOn.entries()) assertId(dependencyId, `evidence[${index}].dependsOn[${dependencyIndex}]`);
    let parsed = null;
    if (schema || subjectPointer) parsed = parseJsonBytes(bytes, `evidence[${index}]`);
    if (schema && parsed?.schema !== schema) throw new Error(`evidence[${index}] schema does not match artifact JSON`);
    let subjectBinding;
    if (subjectPointer) {
      const subjectSha256 = assertDigest(resolveJsonPointer(parsed, subjectPointer, `evidence[${index}].subjectPointer`), `evidence[${index}] candidate subject`);
      if (subjectSha256 !== candidateSha256) throw new Error(`evidence[${index}] binds a different candidate`);
      subjectBinding = {kind: 'json-pointer', pointer: subjectPointer, candidateSha256: subjectSha256};
    } else {
      subjectBinding = {kind: 'derived'};
    }
    return {
      id,
      role,
      schema,
      artifactSha256: digestBytes(bytes),
      sizeBytes: bytes.length,
      subjectBinding,
      dependsOn,
    };
  });
  const ids = rawNodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) throw new Error('evidence node IDs must be unique');
  const ordered = topologicalOrder(rawNodes);
  validateAnchoring(ordered, candidateSha256);
  return ordered;
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

function policy() {
  return {
    exactCandidateBytesAreBound: true,
    exactCheckpointContentIsBound: true,
    evidenceGraphMustBeAcyclic: true,
    everyEvidenceNodeMustReachADecision: true,
    everyEvidenceNodeMustResolveToRootCandidate: true,
    evidenceRolesArePolicyInputsNotCertificationClaims: true,
    transactionDoesNotMutateArtifacts: true,
    transactionDoesNotAuthorizeCertification: true,
  };
}

export function createCandidateTransaction({candidateBytes, checkpoint, evidence, decisionNodeIds, obligations = []} = {}) {
  const rootBytes = Buffer.from(candidateBytes ?? []);
  if (!rootBytes.length) throw new Error('candidateBytes is required');
  const candidateSha256 = digestBytes(rootBytes);
  const checkpointBinding = validateCheckpointForCandidate(checkpoint, candidateSha256);
  const nodes = normalizeEvidenceInputs(evidence, candidateSha256);
  const decisions = uniqueSorted(decisionNodeIds ?? []);
  if (!decisions.length) throw new Error('candidate transaction requires at least one decision node');
  for (const [index, id] of decisions.entries()) assertId(id, `decisionNodeIds[${index}]`);
  const reachable = reachableFromDecisions(nodes, decisions);
  const orphanIds = nodes.map((node) => node.id).filter((id) => !reachable.has(id));
  if (orphanIds.length) throw new Error(`candidate transaction contains orphan evidence: ${orphanIds.join(', ')}`);
  const normalizedObligations = normalizeObligations(obligations);
  const checks = obligationChecks(nodes, normalizedObligations);
  const failed = checks.filter((check) => !check.pass);
  if (failed.length) throw new Error(`candidate transaction obligations are unsatisfied: ${failed.map((check) => check.id).join(', ')}`);
  const core = {
    schema: CANDIDATE_TRANSACTION_SCHEMA,
    status: 'SEALED',
    rootCandidate: {sha256: candidateSha256, sizeBytes: rootBytes.length},
    checkpoint: checkpointBinding,
    evidenceNodes: nodes,
    decisionNodeIds: decisions,
    obligations: normalizedObligations,
    obligationChecks: checks,
    policy: policy(),
  };
  const transactionDigest = digestJson(core);
  return deepFreeze({...core, id: `ctx_${transactionDigest.slice(0, 20)}`, transactionDigest});
}

function contextEvidenceBytes(context, id) {
  if (context?.evidenceBytesById instanceof Map) return context.evidenceBytesById.get(id);
  return context?.evidenceBytesById?.[id];
}

function validateEvidenceBytes(node, bytes, candidateSha256, errors) {
  if (bytes == null) {
    errors.push(`missing evidence bytes for ${node.id}`);
    return;
  }
  const buffer = Buffer.from(bytes);
  if (digestBytes(buffer) !== node.artifactSha256 || buffer.length !== node.sizeBytes) errors.push(`evidence bytes mismatch for ${node.id}`);
  if (node.schema || node.subjectBinding?.kind === 'json-pointer') {
    try {
      const parsed = parseJsonBytes(buffer, `evidence ${node.id}`);
      if (node.schema && parsed?.schema !== node.schema) errors.push(`evidence schema mismatch for ${node.id}`);
      if (node.subjectBinding?.kind === 'json-pointer') {
        const resolved = assertDigest(resolveJsonPointer(parsed, node.subjectBinding.pointer, `evidence ${node.id} subject pointer`));
        if (resolved !== candidateSha256 || resolved !== node.subjectBinding.candidateSha256) errors.push(`evidence candidate binding mismatch for ${node.id}`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
}

export function validateCandidateTransaction(value, context = {}) {
  const errors = [];
  try {
    if (value?.schema !== CANDIDATE_TRANSACTION_SCHEMA) errors.push('invalid schema');
    if (value?.status !== 'SEALED') errors.push('candidate transaction status must be SEALED');
    const candidateSha256 = assertDigest(value?.rootCandidate?.sha256, 'rootCandidate.sha256');
    const candidateSize = Number(value?.rootCandidate?.sizeBytes);
    if (!Number.isInteger(candidateSize) || candidateSize < 1) errors.push('rootCandidate.sizeBytes must be positive');
    if (context.candidateBytes != null) {
      const bytes = Buffer.from(context.candidateBytes);
      if (digestBytes(bytes) !== candidateSha256 || bytes.length !== candidateSize) errors.push('root candidate bytes do not match the transaction');
    }

    assertId(value?.checkpoint?.checkpointId, 'checkpoint.checkpointId');
    assertDigest(value?.checkpoint?.checkpointContentDigest, 'checkpoint.checkpointContentDigest');
    assertDigest(value?.checkpoint?.candidateArtifactSha256, 'checkpoint.candidateArtifactSha256');
    if (value?.checkpoint?.candidateArtifactSha256 !== candidateSha256) errors.push('checkpoint candidate digest does not match root candidate');
    if (context.checkpoint) {
      try {
        const expected = validateCheckpointForCandidate(context.checkpoint, candidateSha256);
        if (digestJson(expected) !== digestJson(value.checkpoint)) errors.push('checkpoint binding is stale or mismatched');
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (!Array.isArray(value?.evidenceNodes) || !value.evidenceNodes.length) errors.push('evidenceNodes must be non-empty');
    const nodes = [];
    const ids = [];
    for (const [index, raw] of (value?.evidenceNodes ?? []).entries()) {
      const id = assertId(raw?.id, `evidenceNodes[${index}].id`);
      const role = assertId(raw?.role, `evidenceNodes[${index}].role`);
      ids.push(id);
      const schema = raw?.schema == null ? null : String(raw.schema);
      const artifactSha256 = assertDigest(raw?.artifactSha256, `evidenceNodes[${index}].artifactSha256`);
      const sizeBytes = Number(raw?.sizeBytes);
      if (!Number.isInteger(sizeBytes) || sizeBytes < 1) errors.push(`evidenceNodes[${index}].sizeBytes must be positive`);
      const dependsOn = uniqueSorted(raw?.dependsOn ?? []);
      if (digestJson(dependsOn) !== digestJson(raw?.dependsOn ?? [])) errors.push(`evidenceNodes[${index}].dependsOn is not canonical`);
      const binding = raw?.subjectBinding ?? {};
      if (binding.kind === 'json-pointer') {
        if (typeof binding.pointer !== 'string' || !binding.pointer.startsWith('/')) errors.push(`evidenceNodes[${index}] has invalid subject pointer`);
        if (binding.candidateSha256 !== candidateSha256) errors.push(`evidenceNodes[${index}] binds a different candidate`);
      } else if (binding.kind === 'derived') {
        if (Object.keys(binding).length !== 1) errors.push(`evidenceNodes[${index}] derived subject binding is not canonical`);
      } else {
        errors.push(`evidenceNodes[${index}] has invalid subject binding`);
      }
      nodes.push({id, role, schema, artifactSha256, sizeBytes, subjectBinding: structuredClone(binding), dependsOn});
    }
    if (new Set(ids).size !== ids.length) errors.push('evidence node IDs must be unique');
    let ordered = nodes;
    try {
      ordered = topologicalOrder(nodes);
      if (digestJson(ordered.map((node) => node.id)) !== digestJson(nodes.map((node) => node.id))) errors.push('evidenceNodes are not in canonical topological order');
      validateAnchoring(ordered, candidateSha256);
    } catch (error) {
      errors.push(error.message);
    }

    const decisions = uniqueSorted(value?.decisionNodeIds ?? []);
    if (!decisions.length) errors.push('decisionNodeIds must be non-empty');
    if (digestJson(decisions) !== digestJson(value?.decisionNodeIds ?? [])) errors.push('decisionNodeIds are not canonical');
    try {
      const reachable = reachableFromDecisions(nodes, decisions);
      const orphanIds = nodes.map((node) => node.id).filter((id) => !reachable.has(id));
      if (orphanIds.length) errors.push(`candidate transaction contains orphan evidence: ${orphanIds.join(', ')}`);
    } catch (error) {
      errors.push(error.message);
    }

    const obligations = normalizeObligations(value?.obligations ?? []);
    if (digestJson(obligations) !== digestJson(value?.obligations ?? [])) errors.push('obligations are not canonical');
    const checks = obligationChecks(nodes, obligations);
    if (digestJson(checks) !== digestJson(value?.obligationChecks ?? [])) errors.push('obligationChecks do not match evidence graph');
    if (checks.some((check) => !check.pass)) errors.push('candidate transaction contains an unsatisfied obligation');

    if (context.evidenceBytesById != null) {
      for (const node of nodes) validateEvidenceBytes(node, contextEvidenceBytes(context, node.id), candidateSha256, errors);
    }

    const expectedPolicy = policy();
    if (digestJson(value?.policy ?? {}) !== digestJson(expectedPolicy)) errors.push('candidate transaction policy is incomplete or altered');
    const core = structuredClone(value ?? {});
    delete core.id;
    delete core.transactionDigest;
    const transactionDigest = digestJson(core);
    if (assertDigest(value?.transactionDigest, 'transactionDigest') !== transactionDigest) errors.push('transaction digest mismatch');
    if (value?.id !== `ctx_${transactionDigest.slice(0, 20)}`) errors.push('transaction id does not match transaction digest');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

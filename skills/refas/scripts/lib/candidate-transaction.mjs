import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';

export const CANDIDATE_TRANSACTION_SCHEMA = 'refas.candidate-transaction/v1';
export const CANDIDATE_DEPENDENCY_PROOF_KIND = 'json-pointer-artifact-sha256';

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
    throw new Error(`${label} must be JSON for its declared provenance binding`);
  }
}

function decodeJsonPointerToken(token, label) {
  if (/~(?![01])/u.test(token)) throw new Error(`${label} contains an invalid JSON Pointer escape`);
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveJsonPointer(document, pointer, label) {
  const raw = String(pointer ?? '');
  if (!raw.startsWith('/')) throw new Error(`${label} must be a non-empty absolute JSON Pointer`);
  let value = document;
  for (const token of raw.slice(1).split('/').map((item) => decodeJsonPointerToken(item, label))) {
    if (value == null || typeof value !== 'object' || !(token in value)) throw new Error(`${label} does not resolve in artifact JSON`);
    value = value[token];
  }
  return value;
}

function normalizeProof(raw, label) {
  const proof = {
    kind: String(raw?.kind ?? ''),
    holder: String(raw?.holder ?? ''),
    pointer: String(raw?.pointer ?? ''),
  };
  if (proof.kind !== CANDIDATE_DEPENDENCY_PROOF_KIND) throw new Error(`${label}.kind is invalid`);
  if (!['self', 'dependency'].includes(proof.holder)) throw new Error(`${label}.holder must be self or dependency`);
  if (!proof.pointer.startsWith('/')) throw new Error(`${label}.pointer must be an absolute JSON Pointer`);
  return proof;
}

function normalizeDependencies(values = [], label = 'dependencies') {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const dependencies = values.map((raw, index) => ({
    nodeId: assertId(raw?.nodeId, `${label}[${index}].nodeId`),
    proof: normalizeProof(raw?.proof, `${label}[${index}].proof`),
  }));
  const ids = dependencies.map((item) => item.nodeId);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must not repeat a dependency node`);
  return dependencies.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
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
    for (const dependency of node.dependencies) {
      const dependencyId = dependency.nodeId;
      if (!byId.has(dependencyId)) throw new Error(`unknown dependency ${dependencyId} for ${node.id}`);
      if (dependencyId === node.id) throw new Error(`self dependency for ${node.id}`);
      indegree.set(node.id, indegree.get(node.id) + 1);
      dependents.get(dependencyId).push(node.id);
    }
  }
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
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
    stack.push(...node.dependencies.map((dependency) => dependency.nodeId));
  }
  return seen;
}

function validateGraphAnchoring(nodes, candidateSha256) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const queue = [];
  const anchored = new Set();
  for (const node of nodes) {
    if (node.subjectBinding.kind === 'json-pointer') {
      if (node.subjectBinding.candidateSha256 !== candidateSha256) throw new Error(`evidence ${node.id} binds a different candidate`);
      anchored.add(node.id);
      queue.push(node.id);
    } else if (node.subjectBinding.kind !== 'derived') {
      throw new Error(`evidence ${node.id} has an unknown subject binding kind`);
    }
    for (const dependency of node.dependencies) {
      if (!byId.has(dependency.nodeId)) throw new Error(`unknown dependency ${dependency.nodeId} for ${node.id}`);
      adjacency.get(node.id).push(dependency.nodeId);
      adjacency.get(dependency.nodeId).push(node.id);
    }
  }
  if (!queue.length) throw new Error('candidate transaction requires at least one direct root-candidate evidence binding');
  while (queue.length) {
    const id = queue.shift();
    for (const neighbor of adjacency.get(id)) {
      if (anchored.has(neighbor)) continue;
      anchored.add(neighbor);
      queue.push(neighbor);
    }
  }
  const unanchored = nodes.map((node) => node.id).filter((id) => !anchored.has(id));
  if (unanchored.length) throw new Error(`evidence is not provenance-connected to the root candidate: ${unanchored.join(', ')}`);
}

function verifyDependencyProof(node, dependency, bytesById, parsedById, label) {
  const dependencyNode = bytesById.get(dependency.nodeId);
  if (!dependencyNode) throw new Error(`${label} references unknown dependency ${dependency.nodeId}`);
  const holderId = dependency.proof.holder === 'self' ? node.id : dependency.nodeId;
  let parsed = parsedById.get(holderId);
  if (parsed === undefined) {
    parsed = parseJsonBytes(bytesById.get(holderId).bytes, `${label} proof holder ${holderId}`);
    parsedById.set(holderId, parsed);
  }
  const actual = assertDigest(resolveJsonPointer(parsed, dependency.proof.pointer, `${label} proof pointer`), `${label} bound artifact digest`);
  const expected = dependency.proof.holder === 'self' ? dependencyNode.artifactSha256 : node.artifactSha256;
  if (actual !== expected) throw new Error(`${label} dependency proof does not bind the exact artifact bytes`);
}

function normalizeEvidenceInputs(evidence = [], candidateSha256) {
  if (!Array.isArray(evidence) || !evidence.length) throw new Error('candidate transaction requires at least one evidence node');
  const inputById = new Map();
  for (const [index, raw] of evidence.entries()) {
    const id = assertId(raw?.id, `evidence[${index}].id`);
    if (inputById.has(id)) throw new Error('evidence node IDs must be unique');
    const bytes = Buffer.from(raw?.bytes ?? []);
    if (!bytes.length) throw new Error(`evidence[${index}].bytes is required`);
    inputById.set(id, {
      id,
      role: assertId(raw?.role, `evidence[${index}].role`),
      schema: raw?.schema == null ? null : String(raw.schema),
      bytes,
      artifactSha256: digestBytes(bytes),
      sizeBytes: bytes.length,
      subjectPointer: raw?.subjectPointer == null ? null : String(raw.subjectPointer),
      dependencies: normalizeDependencies(raw?.dependencies ?? [], `evidence[${index}].dependencies`),
    });
  }

  const parsedById = new Map();
  const nodes = [];
  for (const input of inputById.values()) {
    let parsed = null;
    if (input.schema || input.subjectPointer) {
      parsed = parseJsonBytes(input.bytes, `evidence ${input.id}`);
      parsedById.set(input.id, parsed);
    }
    if (input.schema && parsed?.schema !== input.schema) throw new Error(`evidence ${input.id} schema does not match artifact JSON`);
    let subjectBinding = {kind: 'derived'};
    if (input.subjectPointer) {
      const subjectSha256 = assertDigest(resolveJsonPointer(parsed, input.subjectPointer, `evidence ${input.id} subject pointer`), `evidence ${input.id} candidate subject`);
      if (subjectSha256 !== candidateSha256) throw new Error(`evidence ${input.id} binds a different candidate`);
      subjectBinding = {kind: 'json-pointer', pointer: input.subjectPointer, candidateSha256: subjectSha256};
    }
    nodes.push({
      id: input.id,
      role: input.role,
      schema: input.schema,
      artifactSha256: input.artifactSha256,
      sizeBytes: input.sizeBytes,
      subjectBinding,
      dependencies: input.dependencies,
    });
  }

  const ordered = topologicalOrder(nodes);
  const bytesById = new Map([...inputById.values()].map((input) => [input.id, input]));
  for (const node of ordered) {
    for (const [index, dependency] of node.dependencies.entries()) {
      verifyDependencyProof(node, dependency, bytesById, parsedById, `evidence ${node.id}.dependencies[${index}]`);
    }
  }
  validateGraphAnchoring(ordered, candidateSha256);
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
    dependencyEdgesMustBindExactArtifactBytes: true,
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

function validateNodeContent(node, bytes, candidateSha256, parsedById, errors) {
  if (bytes == null) {
    errors.push(`missing evidence bytes for ${node.id}`);
    return;
  }
  const buffer = Buffer.from(bytes);
  if (digestBytes(buffer) !== node.artifactSha256 || buffer.length !== node.sizeBytes) errors.push(`evidence bytes mismatch for ${node.id}`);
  if (node.schema || node.subjectBinding.kind === 'json-pointer') {
    try {
      const parsed = parseJsonBytes(buffer, `evidence ${node.id}`);
      parsedById.set(node.id, parsed);
      if (node.schema && parsed?.schema !== node.schema) errors.push(`evidence schema mismatch for ${node.id}`);
      if (node.subjectBinding.kind === 'json-pointer') {
        const resolved = assertDigest(resolveJsonPointer(parsed, node.subjectBinding.pointer, `evidence ${node.id} subject pointer`));
        if (resolved !== candidateSha256 || resolved !== node.subjectBinding.candidateSha256) errors.push(`evidence candidate binding mismatch for ${node.id}`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
}

function validateDependencyProofWithContext(node, dependency, bytesById, parsedById, errors) {
  try {
    const holderId = dependency.proof.holder === 'self' ? node.id : dependency.nodeId;
    const holderBytes = bytesById.get(holderId);
    const otherBytes = bytesById.get(dependency.proof.holder === 'self' ? dependency.nodeId : node.id);
    if (holderBytes == null || otherBytes == null) throw new Error(`missing evidence bytes for dependency proof ${node.id} -> ${dependency.nodeId}`);
    let parsed = parsedById.get(holderId);
    if (parsed === undefined) {
      parsed = parseJsonBytes(holderBytes, `dependency proof holder ${holderId}`);
      parsedById.set(holderId, parsed);
    }
    const actual = assertDigest(resolveJsonPointer(parsed, dependency.proof.pointer, `dependency proof ${node.id} -> ${dependency.nodeId}`));
    const expected = digestBytes(Buffer.from(otherBytes));
    if (actual !== expected) errors.push(`dependency proof mismatch for ${node.id} -> ${dependency.nodeId}`);
  } catch (error) {
    errors.push(error.message);
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
      const dependencies = normalizeDependencies(raw?.dependencies ?? [], `evidenceNodes[${index}].dependencies`);
      const binding = raw?.subjectBinding ?? {};
      if (binding.kind === 'json-pointer') {
        if (typeof binding.pointer !== 'string' || !binding.pointer.startsWith('/')) errors.push(`evidenceNodes[${index}] has invalid subject pointer`);
        if (binding.candidateSha256 !== candidateSha256) errors.push(`evidenceNodes[${index}] binds a different candidate`);
      } else if (binding.kind === 'derived') {
        if (Object.keys(binding).length !== 1) errors.push(`evidenceNodes[${index}] derived subject binding is not canonical`);
      } else {
        errors.push(`evidenceNodes[${index}] has invalid subject binding`);
      }
      const node = {id, role, schema, artifactSha256, sizeBytes, subjectBinding: structuredClone(binding), dependencies};
      if (digestJson(node) !== digestJson(raw)) errors.push(`evidenceNodes[${index}] is not canonical`);
      nodes.push(node);
    }
    if (new Set(ids).size !== ids.length) errors.push('evidence node IDs must be unique');
    try {
      const ordered = topologicalOrder(nodes);
      if (digestJson(ordered.map((node) => node.id)) !== digestJson(nodes.map((node) => node.id))) errors.push('evidenceNodes are not in canonical topological order');
      validateGraphAnchoring(ordered, candidateSha256);
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
      const bytesById = new Map(nodes.map((node) => [node.id, contextEvidenceBytes(context, node.id)]));
      const parsedById = new Map();
      for (const node of nodes) validateNodeContent(node, bytesById.get(node.id), candidateSha256, parsedById, errors);
      for (const node of nodes) for (const dependency of node.dependencies) validateDependencyProofWithContext(node, dependency, bytesById, parsedById, errors);
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

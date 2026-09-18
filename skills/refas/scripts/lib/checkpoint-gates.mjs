import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {CAPABILITY_ORDER, assertCapability} from './ownership.mjs';
import {REQUIRED_CLOSURE_GATE_IDS, REQUIRED_VISUAL_GATE_IDS} from './visual-review.mjs';

export const CHECKPOINT_GATE_VERDICT_SCHEMA = 'refas.checkpoint-gate-verdict/v1';
export const CHECKPOINT_GATE_EXECUTABLE_POLICY_SCHEMA = 'refas.checkpoint-gate-executable-policy/v1';

const localPolicy = Object.fromEntries(CAPABILITY_ORDER
  .filter((capability) => capability !== 'whole-object-certification')
  .map((capability) => [
    capability,
    [{
      id: `${capability}-gate`,
      evaluator: 'bound-evidence',
      description: 'Pass only when every cited evidence ref is currently bound to the primary source or candidate checkpoint artifacts.',
    }],
  ]));

const closurePolicies = REQUIRED_CLOSURE_GATE_IDS.map((id) => {
  if (id === 'source-integrity') {
    return {id, evaluator: 'source-integrity', description: 'Re-verify the bound primary source bytes and manifest.'};
  }
  if (id === 'hierarchy-coverage') {
    return {id, evaluator: 'lineage-capability', capability: 'visual-hierarchy', description: 'Require a trustworthy visual-hierarchy checkpoint in current lineage.'};
  }
  if (id === 'observation-authority') {
    return {id, evaluator: 'lineage-capability', capability: 'visual-observation', description: 'Require a trustworthy visual-observation checkpoint in current lineage.'};
  }
  if (id === 'spatial-plausibility') {
    return {id, evaluator: 'lineage-capability', capability: 'spatial-hypotheses', description: 'Require a trustworthy spatial-hypotheses checkpoint in current lineage.'};
  }
  if (REQUIRED_VISUAL_GATE_IDS.includes(id)) {
    return {id, evaluator: 'visual-review-gate', visualGateId: id, description: 'Derive the verdict from the exact digest-bound visual-review artifact.'};
  }
  if (id === 'project-audit') {
    return {id, evaluator: 'project-integrity', description: 'Require the current project audit and candidate artifact integrity to pass.'};
  }
  throw new Error(`unmapped closure gate policy: ${id}`);
});

export const CHECKPOINT_GATE_POLICIES = deepFreeze({
  schema: 'refas.checkpoint-gate-policy-set/v1',
  capabilities: {
    ...localPolicy,
    'whole-object-certification': closurePolicies,
  },
});

// Discovery/versioning digest only. Persisted gate verdicts intentionally do not
// bind to this whole-set digest because unrelated policy additions or prose
// changes must not invalidate an already trustworthy checkpoint.
export const CHECKPOINT_GATE_POLICY_DIGEST = digestJson(CHECKPOINT_GATE_POLICIES);

export function expectedCheckpointGateIds(capability) {
  capability = assertCapability(capability);
  return CHECKPOINT_GATE_POLICIES.capabilities[capability].map((policy) => policy.id);
}

export function checkpointGatePolicy(capability, gateId) {
  capability = assertCapability(capability);
  gateId = assertId(gateId, 'gate.id');
  return CHECKPOINT_GATE_POLICIES.capabilities[capability].find((policy) => policy.id === gateId) ?? null;
}

export function checkpointGateExecutablePolicy(capability, gateId) {
  capability = assertCapability(capability);
  gateId = assertId(gateId, 'gate.id');
  const policy = checkpointGatePolicy(capability, gateId);
  if (!policy) throw new Error(`unknown canonical gate for ${capability}: ${gateId}`);
  const executable = {
    schema: CHECKPOINT_GATE_EXECUTABLE_POLICY_SCHEMA,
    capability,
    id: gateId,
    evaluator: policy.evaluator,
  };
  if (policy.evaluator === 'lineage-capability') executable.requiredCapability = policy.capability;
  if (policy.evaluator === 'visual-review-gate') executable.visualGateId = policy.visualGateId;
  return deepFreeze(executable);
}

export function checkpointGatePolicyDigest(capability, gateId) {
  return digestJson(checkpointGateExecutablePolicy(capability, gateId));
}

function exactSetErrors(actual, expected) {
  const errors = [];
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index);
  const missing = expected.filter((value) => !actual.includes(value));
  const unexpected = actual.filter((value) => !expected.includes(value));
  if (duplicates.length) errors.push(`duplicate gate IDs: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length) errors.push(`missing gate IDs: ${missing.join(', ')}`);
  if (unexpected.length) errors.push(`unexpected gate IDs: ${unexpected.join(', ')}`);
  return errors;
}

export function normalizeCheckpointGateRequests(capability, raw = []) {
  capability = assertCapability(capability);
  if (!Array.isArray(raw)) throw new Error('gates must be an array of gate requests');
  const requests = raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`gates[${index}] must be an object`);
    for (const forbidden of ['status', 'evaluator', 'policyDigest', 'decisionDigest', 'schema']) {
      if (Object.hasOwn(item, forbidden)) {
        throw new Error(`gates[${index}].${forbidden} is runtime-authoritative and must not be supplied by the caller`);
      }
    }
    const id = assertId(item.id, `gates[${index}].id`);
    const policy = checkpointGatePolicy(capability, id);
    if (!policy) throw new Error(`gates[${index}] is not a canonical gate for ${capability}: ${id}`);
    const evidenceRefs = [...new Set((item.evidenceRefs ?? []).map(String).filter(Boolean))].sort();
    return {id, evidenceRefs};
  });
  const expected = expectedCheckpointGateIds(capability);
  const errors = exactSetErrors(requests.map((item) => item.id), expected);
  if (errors.length) throw new Error(`${capability} gate request set is invalid: ${errors.join('; ')}`);
  return requests;
}

export function isLegacyCheckpointGate(gate) {
  return Boolean(
    gate
    && typeof gate === 'object'
    && !Array.isArray(gate)
    && !Object.hasOwn(gate, 'schema')
    && !Object.hasOwn(gate, 'evaluator')
    && !Object.hasOwn(gate, 'policyDigest')
    && !Object.hasOwn(gate, 'decisionDigest')
    && typeof gate.id === 'string'
    && typeof gate.status === 'string'
    && Array.isArray(gate.evidenceRefs),
  );
}

export function createCheckpointGateVerdict({capability, id, status, evidenceRefs = []} = {}) {
  capability = assertCapability(capability);
  id = assertId(id, 'gate.id');
  const policy = checkpointGatePolicy(capability, id);
  if (!policy) throw new Error(`unknown canonical gate for ${capability}: ${id}`);
  status = String(status ?? '').toLowerCase();
  if (!['pass', 'fail', 'blocked'].includes(status)) throw new Error('runtime gate status must be pass, fail, or blocked');
  const normalizedEvidence = [...new Set(evidenceRefs.map(String).filter(Boolean))].sort();
  if (status === 'pass' && !normalizedEvidence.length) throw new Error(`runtime gate ${id} cannot pass without evidenceRefs`);
  const core = {
    schema: CHECKPOINT_GATE_VERDICT_SCHEMA,
    id,
    status,
    evidenceRefs: normalizedEvidence,
    evaluator: policy.evaluator,
    policyDigest: checkpointGatePolicyDigest(capability, id),
  };
  return deepFreeze({...core, decisionDigest: digestJson(core)});
}

export function validateCheckpointGateVerdict(capability, gate) {
  const errors = [];
  try {
    capability = assertCapability(capability);
    if (gate?.schema !== CHECKPOINT_GATE_VERDICT_SCHEMA) errors.push('invalid gate verdict schema');
    const policy = checkpointGatePolicy(capability, gate?.id);
    if (!policy) errors.push(`gate is not canonical for ${capability}: ${gate?.id ?? 'missing'}`);
    if (policy && gate?.evaluator !== policy.evaluator) errors.push(`gate evaluator mismatch for ${gate.id}`);
    if (policy && gate?.policyDigest !== checkpointGatePolicyDigest(capability, gate.id)) errors.push(`gate scoped policy digest mismatch for ${gate?.id ?? 'missing'}`);
    if (!['pass', 'fail', 'blocked'].includes(gate?.status)) errors.push(`gate status is invalid for ${gate?.id ?? 'missing'}`);
    if (gate?.status === 'pass' && !(gate?.evidenceRefs?.length > 0)) errors.push(`passing gate has no evidenceRefs: ${gate?.id ?? 'missing'}`);
    const core = {
      schema: gate?.schema,
      id: gate?.id,
      status: gate?.status,
      evidenceRefs: [...(gate?.evidenceRefs ?? [])],
      evaluator: gate?.evaluator,
      policyDigest: gate?.policyDigest,
    };
    if (digestJson(core) !== gate?.decisionDigest) errors.push(`gate decision digest mismatch for ${gate?.id ?? 'missing'}`);
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

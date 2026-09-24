import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {assertCapability} from './ownership.mjs';

export const CANDIDATE_TRANSITION_SCHEMA = 'refas.candidate-transition/v1';
export const CANDIDATE_LINEAGE_PROOF_SCHEMA = 'refas.candidate-lineage-proof/v1';

export const CANDIDATE_MUTATION_KINDS = deepFreeze({
  'surface-topology': 'surface-topology-edit',
  'assembly': 'assembly-edit',
  'appearance': 'appearance-edit',
});

const MUTATION_CAPABILITIES = new Set(Object.keys(CANDIDATE_MUTATION_KINDS));

function strings(values, label, {required = false} = {}) {
  if (!Array.isArray(values ?? [])) throw new Error(`${label} must be an array`);
  const out = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && out.length === 0) throw new Error(`${label} requires at least one value`);
  return out;
}

export function isCandidateMutationCapability(value) {
  return MUTATION_CAPABILITIES.has(String(value ?? ''));
}

export function createCandidateTransition({
  inputAssetSha256,
  outputAssetSha256,
  inputCandidateCheckpointId,
  parentCheckpointId,
  capability,
  scopeId,
  evidenceRefs = [],
} = {}) {
  const normalizedCapability = assertCapability(capability);
  if (!isCandidateMutationCapability(normalizedCapability)) {
    throw new Error(`candidate transitions are not authorized for capability ${normalizedCapability}`);
  }
  const input = assertDigest(inputAssetSha256, 'inputAssetSha256');
  const output = assertDigest(outputAssetSha256, 'outputAssetSha256');
  if (input === output) throw new Error('same-digest carry-forward must not create a candidate transition');
  const core = {
    schema: CANDIDATE_TRANSITION_SCHEMA,
    capability: normalizedCapability,
    scopeId: assertId(scopeId, 'scopeId'),
    transitionKind: CANDIDATE_MUTATION_KINDS[normalizedCapability],
    parentCheckpointId: assertId(parentCheckpointId, 'parentCheckpointId'),
    inputCandidate: {
      assetSha256: input,
      checkpointId: assertId(inputCandidateCheckpointId, 'inputCandidateCheckpointId'),
    },
    outputCandidate: {assetSha256: output},
    evidenceRefs: strings(evidenceRefs, 'evidenceRefs', {required: true}),
    policy: {
      inputCandidateIsRuntimeDerived: true,
      outputCandidateMustMatchCheckpointGlb: true,
      sameDigestNeedsNoTransition: true,
      transitionDoesNotProveEditAlgorithm: true,
    },
  };
  return deepFreeze({...core, transitionDigest: digestJson(core)});
}

export function validateCandidateTransition(value) {
  const errors = [];
  try {
    if (value?.schema !== CANDIDATE_TRANSITION_SCHEMA) errors.push('invalid candidate transition schema');
    const expected = createCandidateTransition({
      inputAssetSha256: value?.inputCandidate?.assetSha256,
      outputAssetSha256: value?.outputCandidate?.assetSha256,
      inputCandidateCheckpointId: value?.inputCandidate?.checkpointId,
      parentCheckpointId: value?.parentCheckpointId,
      capability: value?.capability,
      scopeId: value?.scopeId,
      evidenceRefs: value?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(value)) errors.push('candidate transition is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function normalizeTransitionSummary(raw, index) {
  const label = `transitions[${index}]`;
  const capability = assertCapability(raw?.capability);
  if (!isCandidateMutationCapability(capability)) throw new Error(`${label}.capability cannot mutate candidates`);
  return {
    checkpointId: assertId(raw?.checkpointId, `${label}.checkpointId`),
    transitionDigest: assertDigest(raw?.transitionDigest, `${label}.transitionDigest`),
    capability,
    scopeId: assertId(raw?.scopeId, `${label}.scopeId`),
    inputAssetSha256: assertDigest(raw?.inputAssetSha256, `${label}.inputAssetSha256`),
    outputAssetSha256: assertDigest(raw?.outputAssetSha256, `${label}.outputAssetSha256`),
  };
}

export function createCandidateLineageProof({
  sourceSha256,
  initialCandidate,
  finalCandidate,
  transitions = [],
} = {}) {
  const initial = {
    assetSha256: assertDigest(initialCandidate?.assetSha256, 'initialCandidate.assetSha256'),
    checkpointId: assertId(initialCandidate?.checkpointId, 'initialCandidate.checkpointId'),
  };
  const final = {
    assetSha256: assertDigest(finalCandidate?.assetSha256, 'finalCandidate.assetSha256'),
    checkpointId: assertId(finalCandidate?.checkpointId, 'finalCandidate.checkpointId'),
  };
  const normalizedTransitions = (transitions ?? []).map(normalizeTransitionSummary);
  let currentSha = initial.assetSha256;
  let currentCheckpointId = initial.checkpointId;
  for (const [index, transition] of normalizedTransitions.entries()) {
    if (transition.inputAssetSha256 !== currentSha) throw new Error(`transitions[${index}] input candidate does not continue the chain`);
    currentSha = transition.outputAssetSha256;
    currentCheckpointId = transition.checkpointId;
  }
  if (final.assetSha256 !== currentSha || final.checkpointId !== currentCheckpointId) {
    throw new Error('final candidate does not match the resolved transition chain');
  }
  const core = {
    schema: CANDIDATE_LINEAGE_PROOF_SCHEMA,
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    initialCandidate: initial,
    finalCandidate: final,
    transitions: normalizedTransitions,
    policy: {
      firstCandidateComesFromShapeReconstruction: true,
      changedCandidateRequiresCanonicalTransition: true,
      sameDigestCarryForwardIsImplicit: true,
      finalCandidateIsUniquelyResolved: true,
      lineageDoesNotProveEditAlgorithm: true,
    },
  };
  return deepFreeze({...core, lineageDigest: digestJson(core)});
}

export function validateCandidateLineageProof(value, {sourceSha256 = null, finalAssetSha256 = null} = {}) {
  const errors = [];
  try {
    if (value?.schema !== CANDIDATE_LINEAGE_PROOF_SCHEMA) errors.push('invalid candidate lineage proof schema');
    const expected = createCandidateLineageProof({
      sourceSha256: value?.sourceSha256,
      initialCandidate: value?.initialCandidate,
      finalCandidate: value?.finalCandidate,
      transitions: value?.transitions,
    });
    if (digestJson(expected) !== digestJson(value)) errors.push('candidate lineage proof is not canonical');
    if (sourceSha256 != null && expected.sourceSha256 !== assertDigest(sourceSha256, 'sourceSha256')) errors.push('candidate lineage source binding mismatch');
    if (finalAssetSha256 != null && expected.finalCandidate.assetSha256 !== assertDigest(finalAssetSha256, 'finalAssetSha256')) errors.push('candidate lineage final candidate mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

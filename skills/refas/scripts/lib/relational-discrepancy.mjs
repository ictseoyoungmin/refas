import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateRelationalStructure, wholeSystemRelationalObligations} from './relational-structure.mjs';

export const RELATIONAL_DISCREPANCY_SCHEMA = 'refas.relational-discrepancy/v1';
export const RELATIONAL_DISCREPANCY_STATUSES = Object.freeze(['pass', 'fail', 'unresolved']);

const CONTINUITIES = new Set(['smooth', 'broken', 'stepped', 'unknown']);
const uniqueStrings = (values = []) => [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();

function finiteOrNull(value, label) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite when present`);
  return number;
}

function normalizeObservation(raw, index) {
  const label = `observations[${index}]`;
  const observation = {
    relationId: assertId(raw?.relationId, `${label}.relationId`),
    evidenceRefs: uniqueStrings(raw?.evidenceRefs),
  };
  if (raw?.value != null) observation.value = finiteOrNull(raw.value, `${label}.value`);
  if (raw?.error != null) {
    const error = finiteOrNull(raw.error, `${label}.error`);
    if (error < 0) throw new Error(`${label}.error must be non-negative`);
    observation.error = error;
  }
  if (raw?.orderedEntityIds != null) {
    if (!Array.isArray(raw.orderedEntityIds)) throw new Error(`${label}.orderedEntityIds must be an array`);
    observation.orderedEntityIds = raw.orderedEntityIds.map((value, itemIndex) => assertId(value, `${label}.orderedEntityIds[${itemIndex}]`));
    if (new Set(observation.orderedEntityIds).size !== observation.orderedEntityIds.length) throw new Error(`${label}.orderedEntityIds must be unique`);
  }
  if (raw?.continuity != null) {
    const continuity = String(raw.continuity).toLowerCase();
    if (!CONTINUITIES.has(continuity)) throw new Error(`${label}.continuity is invalid`);
    observation.continuity = continuity;
  }
  return observation;
}

function rangeResidual(value, [minimum, maximum]) {
  if (value >= minimum && value <= maximum) return 0;
  const delta = value < minimum ? minimum - value : value - maximum;
  return delta / Math.max(1, Math.abs(minimum), Math.abs(maximum));
}

function evaluateRelation(relation, observation) {
  const evidenceRefs = observation.evidenceRefs;
  let status = 'unresolved';
  let residual = null;
  let measurement;

  if (relation.kind === 'distance-ratio' || relation.kind === 'volume-ratio') {
    const value = observation.value ?? null;
    measurement = {kind: 'range', observedValue: value, expectedRange: [...relation.range]};
    if (value != null) {
      residual = rangeResidual(value, relation.range);
      status = residual === 0 ? 'pass' : 'fail';
    }
  } else if (relation.kind === 'alignment') {
    const error = observation.error ?? null;
    const tolerance = relation.tolerance ?? null;
    measurement = {kind: 'alignment-error', observedError: error, tolerance, mode: relation.mode};
    if (error != null && tolerance != null) {
      residual = Math.max(0, error - tolerance);
      status = error <= tolerance ? 'pass' : 'fail';
    }
  } else if (relation.kind === 'ordering') {
    const expectedEntityIds = relation.direction === 'reverse' ? [...relation.entityIds].reverse() : [...relation.entityIds];
    const observedEntityIds = observation.orderedEntityIds ?? null;
    measurement = {kind: 'ordering', expectedEntityIds, observedEntityIds};
    if (observedEntityIds != null) {
      status = digestJson(observedEntityIds) === digestJson(expectedEntityIds) ? 'pass' : 'fail';
      residual = status === 'pass' ? 0 : 1;
    }
  } else if (relation.kind === 'plane-chain') {
    const expectedContinuity = relation.continuity;
    const observedContinuity = observation.continuity ?? null;
    measurement = {kind: 'plane-chain', expectedContinuity, observedContinuity};
    if (expectedContinuity !== 'unknown' && observedContinuity != null && observedContinuity !== 'unknown') {
      status = observedContinuity === expectedContinuity ? 'pass' : 'fail';
      residual = status === 'pass' ? 0 : 1;
    }
  } else {
    throw new Error(`unsupported relational discrepancy kind: ${relation.kind}`);
  }

  if (status !== 'unresolved' && !evidenceRefs.length) throw new Error(`${relation.id} ${status} requires evidenceRefs`);
  return {
    relationId: relation.id,
    relationKind: relation.kind,
    importance: relation.importance,
    status,
    residual,
    measurement,
    evidenceRefs,
  };
}

function exactCoverage(observations, requiredIds) {
  const actual = observations.map((observation) => observation.relationId).sort();
  const expected = [...requiredIds].sort();
  if (new Set(actual).size !== actual.length) throw new Error('relational observations contain duplicate relation IDs');
  if (digestJson(actual) !== digestJson(expected)) {
    const missing = expected.filter((id) => !actual.includes(id));
    const unexpected = actual.filter((id) => !expected.includes(id));
    throw new Error(`relational observations must exactly cover whole-system macro/identity obligations; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`);
  }
}

export function createRelationalDiscrepancy({relationalStructure, candidateAssetSha256, observations = []} = {}) {
  const validation = validateRelationalStructure(relationalStructure);
  if (!validation.valid) throw new Error(`relational structure is invalid: ${validation.errors.join('; ')}`);
  const requiredRelationIds = [...wholeSystemRelationalObligations(relationalStructure)].sort();
  const normalizedObservations = observations.map(normalizeObservation).sort((a, b) => a.relationId.localeCompare(b.relationId));
  exactCoverage(normalizedObservations, requiredRelationIds);
  const relationById = new Map(relationalStructure.relations.map((relation) => [relation.id, relation]));
  const checks = normalizedObservations.map((observation) => evaluateRelation(relationById.get(observation.relationId), observation));
  const failedRelationIds = checks.filter((check) => check.status === 'fail').map((check) => check.relationId).sort();
  const unresolvedRelationIds = checks.filter((check) => check.status === 'unresolved').map((check) => check.relationId).sort();
  const eligible = failedRelationIds.length === 0 && unresolvedRelationIds.length === 0;
  const payload = {
    schema: RELATIONAL_DISCREPANCY_SCHEMA,
    scopeId: assertId(relationalStructure.scopeId, 'scopeId'),
    sourceSha256: assertDigest(relationalStructure.sourceSha256, 'sourceSha256'),
    candidateAssetSha256: assertDigest(candidateAssetSha256, 'candidateAssetSha256'),
    relationalStructure,
    relationalStructureDigest: assertDigest(relationalStructure.structureDigest, 'relationalStructureDigest'),
    requiredRelationIds,
    observations: normalizedObservations,
    checks,
    failedRelationIds,
    unresolvedRelationIds,
    status: eligible ? 'PASS' : 'INELIGIBLE',
    eligible,
    policy: {
      exactCandidateAssetIsBound: true,
      exactRelationalStructureIsEmbedded: true,
      wholeSystemMacroIdentityRelationsOnly: true,
      relationalInvalidityIsHardBarrier: true,
      relationalInvalidityIsNeverScorePenalty: true,
      relationalMetricsCannotPassVisualGate: true,
      missingMeasurementRemainsUnresolved: true,
    },
  };
  return deepFreeze({...payload, discrepancyDigest: digestJson(payload)});
}

export function validateRelationalDiscrepancy(value) {
  const errors = [];
  try {
    if (value?.schema !== RELATIONAL_DISCREPANCY_SCHEMA) errors.push('invalid schema');
    assertDigest(value?.candidateAssetSha256, 'candidateAssetSha256');
    assertDigest(value?.relationalStructureDigest, 'relationalStructureDigest');
    assertDigest(value?.discrepancyDigest, 'discrepancyDigest');
    const recreated = createRelationalDiscrepancy({
      relationalStructure: value?.relationalStructure,
      candidateAssetSha256: value?.candidateAssetSha256,
      observations: value?.observations,
    });
    if (recreated.discrepancyDigest !== value?.discrepancyDigest) errors.push('relational discrepancy digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('relational discrepancy is not canonical or its derived checks were altered');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

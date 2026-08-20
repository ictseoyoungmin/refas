import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {CAPABILITY_ORDER, FINDING_OWNERS, assertCapability, capabilityIndex, transitiveDependents} from './ownership.mjs';

const BLOCKING_SEVERITIES = new Set(['critical', 'major', 'blocking']);

function scopeMatches(checkpointScope, findingScope) {
  return checkpointScope === findingScope || findingScope.startsWith(`${checkpointScope}.`) || checkpointScope === 'whole';
}

export function normalizeFinding(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('finding is required');
  const category = String(raw.category ?? '');
  const severity = String(raw.severity ?? 'major').toLowerCase();
  const scopeId = assertId(raw.scopeId, 'finding.scopeId');
  const ownerCapability = raw.ownerCapability ? assertCapability(raw.ownerCapability) : FINDING_OWNERS[category];
  const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String).filter(Boolean);
  if (!category) throw new Error('finding.category is required');
  if (!ownerCapability && BLOCKING_SEVERITIES.has(severity)) {
    return deepFreeze({
      schema: 'refas.finding/v1', category, severity, scopeId,
      summary: String(raw.summary ?? category),
      evidenceRefs,
      ownerCapability: null,
      introducedByEdit: raw.introducedByEdit === true,
      routable: false,
      blocking: true,
      evidenceSufficient: evidenceRefs.length > 0,
    });
  }
  return deepFreeze({
    schema: 'refas.finding/v1', category, severity, scopeId,
    summary: String(raw.summary ?? category),
    evidenceRefs,
    ownerCapability: ownerCapability ?? null,
    introducedByEdit: raw.introducedByEdit === true,
    routable: ownerCapability != null,
    blocking: BLOCKING_SEVERITIES.has(severity),
    evidenceSufficient: evidenceRefs.length > 0,
  });
}

function checkpointLineage(checkpoints, headId) {
  if (!checkpoints.length) return [];
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  let cursor = byId.get(headId ?? checkpoints.at(-1)?.id);
  const reverse = [];
  const visited = new Set();
  while (cursor && !visited.has(cursor.id)) {
    reverse.push(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return reverse.reverse();
}

export function routeFinding({finding, checkpoints = [], headId = null}) {
  const normalized = normalizeFinding(finding);
  if (!normalized.routable) {
    const action = normalized.blocking ? 'BLOCKED_UNROUTABLE_FINDING' : 'REQUEST_REVIEW';
    const payload = {
      schema: 'refas.repair-route/v1', action,
      scopeId: normalized.scopeId, ownerCapability: null, rollbackCheckpointId: null,
      invalidatedCapabilities: [], finding: normalized,
      reason: normalized.blocking ? 'blocking visual truth has no declared capability owner' : 'non-blocking finding needs an explicit owner before mutation',
    };
    return deepFreeze({...payload, routeDigest: digestJson(payload)});
  }
  if (normalized.category === 'evidence-insufficient' || !normalized.evidenceSufficient) {
    const payload = {
      schema: 'refas.repair-route/v1', action: 'REQUEST_REVIEW',
      scopeId: normalized.scopeId, ownerCapability: normalized.ownerCapability,
      rollbackCheckpointId: null, invalidatedCapabilities: [], finding: normalized,
      reason: 'insufficient evidence cannot select a safe rollback point',
    };
    return deepFreeze({...payload, routeDigest: digestJson(payload)});
  }
  const ownerIndex = capabilityIndex(normalized.ownerCapability);
  const lineage = checkpointLineage(checkpoints, headId);
  const candidates = lineage.filter((checkpoint) =>
    capabilityIndex(checkpoint.capability) < ownerIndex && scopeMatches(checkpoint.scopeId, normalized.scopeId),
  );
  const rollback = candidates.at(-1) ?? lineage.filter((checkpoint) => capabilityIndex(checkpoint.capability) < ownerIndex).at(-1) ?? null;
  const payload = {
    schema: 'refas.repair-route/v1',
    action: 'REOPEN_CAPABILITY',
    scopeId: normalized.scopeId,
    ownerCapability: normalized.ownerCapability,
    rollbackCheckpointId: rollback?.id ?? null,
    invalidatedCapabilities: transitiveDependents(normalized.ownerCapability),
    finding: normalized,
    reason: `reopen ${normalized.ownerCapability}; invalidate its downstream dependents`,
  };
  return deepFreeze({...payload, routeDigest: digestJson(payload)});
}

export function routeLowScore({score, threshold, scopeId, checkpoints = [], headId = null, typedFindings = []}) {
  if (!Number.isFinite(score) || !Number.isFinite(threshold)) throw new Error('finite score and threshold are required');
  if (score >= threshold) return {action: 'NO_ROUTE', reason: 'score meets threshold'};
  if (!typedFindings.length) {
    return routeFinding({finding: {category: 'evidence-insufficient', severity: 'major', scopeId, summary: `score ${score} is below ${threshold} without a localized defect`}, checkpoints, headId});
  }
  return routeFinding({finding: typedFindings[0], checkpoints, headId});
}

export function auditOwnershipRegistry() {
  const errors = [];
  for (const owner of Object.values(FINDING_OWNERS)) if (!CAPABILITY_ORDER.includes(owner)) errors.push(`unknown owner ${owner}`);
  return {valid: errors.length === 0, errors};
}

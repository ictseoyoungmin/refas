import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const HIERARCHY_LEVELS = Object.freeze(['whole', 'region', 'part', 'subpart', 'feature']);
const LEVEL_INDEX = new Map(HIERARCHY_LEVELS.map((level, index) => [level, index]));

function normalizedRoi(raw, label) {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(Number.isFinite)) {
    throw new Error(`${label} must be [x,y,width,height]`);
  }
  const [x, y, width, height] = raw.map(Number);
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > 1 || y + height > 1) {
    throw new Error(`${label} must be a positive normalized rectangle inside the source image`);
  }
  return [x, y, width, height];
}

function normalizeEvidenceRef(ref, label) {
  if (!ref || typeof ref !== 'object') throw new Error(`${label} must be an evidence reference`);
  const normalized = {
    id: assertId(ref.id, `${label}.id`),
    kind: String(ref.kind ?? 'derived'),
    sha256: assertDigest(ref.sha256, `${label}.sha256`),
    primary: ref.primary === true,
    sourceSha256: assertDigest(ref.sourceSha256 ?? ref.sha256, `${label}.sourceSha256`),
    recipeDigest: ref.recipeDigest ? assertDigest(ref.recipeDigest, `${label}.recipeDigest`) : null,
    path: ref.path == null ? null : String(ref.path),
  };
  if (normalized.primary && (normalized.sha256 !== normalized.sourceSha256 || normalized.recipeDigest !== null)) throw new Error(`${label}: primary evidence must be the unmodified source bytes`);
  if (!normalized.primary && normalized.recipeDigest === null) throw new Error(`${label}: derived evidence requires a recipeDigest`);
  return normalized;
}

export function createVisualHierarchy({source, nodes}) {
  if (!source || typeof source !== 'object') throw new Error('source is required');
  const normalizedSource = {
    path: String(source.path ?? ''),
    sha256: assertDigest(source.sha256, 'source.sha256'),
    width: Number(source.width),
    height: Number(source.height),
  };
  if (!normalizedSource.path || !Number.isInteger(normalizedSource.width) || !Number.isInteger(normalizedSource.height) || normalizedSource.width < 1 || normalizedSource.height < 1) {
    throw new Error('source path and positive integer dimensions are required');
  }
  if (!Array.isArray(nodes) || nodes.length < 1) throw new Error('at least one hierarchy node is required');

  const normalized = nodes.map((raw, index) => {
    const level = String(raw.level ?? '');
    if (!LEVEL_INDEX.has(level)) throw new Error(`nodes[${index}].level is invalid`);
    const contextPadding = Number(raw.contextPadding ?? 0.08);
    if (!Number.isFinite(contextPadding)) throw new Error(`nodes[${index}].contextPadding must be finite`);
    return {
      id: assertId(raw.id, `nodes[${index}].id`),
      label: String(raw.label ?? raw.id),
      level,
      parentId: raw.parentId == null ? null : assertId(raw.parentId, `nodes[${index}].parentId`),
      roi: normalizedRoi(raw.roi ?? [0, 0, 1, 1], `nodes[${index}].roi`),
      contextPadding: Math.max(0, Math.min(0.5, contextPadding)),
      status: String(raw.status ?? 'unobserved'),
    };
  });
  const byId = new Map();
  for (const node of normalized) {
    if (byId.has(node.id)) throw new Error(`duplicate hierarchy node: ${node.id}`);
    byId.set(node.id, node);
  }
  const roots = normalized.filter((node) => node.parentId == null);
  if (roots.length !== 1 || roots[0].level !== 'whole') throw new Error('hierarchy requires exactly one whole-object root');
  if (roots[0].roi.some((value, index) => value !== [0, 0, 1, 1][index])) throw new Error('whole-object root ROI must cover the complete source');
  for (const node of normalized) {
    if (node.parentId == null) continue;
    const parent = byId.get(node.parentId);
    if (!parent) throw new Error(`${node.id} has missing parent ${node.parentId}`);
    if (LEVEL_INDEX.get(node.level) <= LEVEL_INDEX.get(parent.level)) {
      throw new Error(`${node.id} must be deeper than parent ${parent.id}`);
    }
    const [x, y, width, height] = node.roi;
    const [px, py, pwidth, pheight] = parent.roi;
    if (x < px - 1e-9 || y < py - 1e-9 || x + width > px + pwidth + 1e-9 || y + height > py + pheight + 1e-9) {
      throw new Error(`${node.id} tight ROI must remain inside parent ${parent.id}`);
    }
    const visited = new Set([node.id]);
    let cursor = parent;
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error(`hierarchy cycle at ${cursor.id}`);
      visited.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
  }
  const payload = {
    schema: 'refas.visual-hierarchy/v1',
    source: normalizedSource,
    rootId: roots[0].id,
    nodes: normalized,
  };
  return deepFreeze({...payload, hierarchyDigest: digestJson(payload)});
}

export function nodeAncestry(hierarchy, nodeId) {
  const byId = new Map(hierarchy.nodes.map((node) => [node.id, node]));
  let node = byId.get(nodeId);
  if (!node) throw new Error(`unknown hierarchy node: ${nodeId}`);
  const chain = [];
  while (node) {
    chain.push(node);
    node = node.parentId ? byId.get(node.parentId) : null;
  }
  return chain.reverse();
}

export function createObservation({hierarchy, nodeId, evidence, facts = [], interpretations = [], hypotheses = [], ambiguities = []}) {
  const chain = nodeAncestry(hierarchy, nodeId);
  if (!Array.isArray(evidence) || evidence.length < 1) throw new Error('observation evidence is required');
  const normalizedEvidence = evidence.map(normalizeEvidenceRef);
  if (new Set(normalizedEvidence.map((ref) => ref.id)).size !== normalizedEvidence.length) throw new Error('observation evidence IDs must be unique');
  const evidenceById = new Map(normalizedEvidence.map((ref) => [ref.id, ref]));
  const primary = normalizedEvidence.filter((ref) => ref.primary && ref.sourceSha256 === hierarchy.source.sha256);
  if (!primary.length) throw new Error('at least one primary evidence item must bind to the raw source digest');
  const normalizedFacts = facts.map((raw, index) => {
    const claim = typeof raw === 'string' ? raw : String(raw.claim ?? '');
    const evidenceIds = typeof raw === 'string' ? primary.map((ref) => ref.id) : [...(raw.evidenceIds ?? [])].map(String);
    if (!claim) throw new Error(`facts[${index}] claim is required`);
    if (!evidenceIds.length || evidenceIds.some((id) => !evidenceById.has(id))) throw new Error(`facts[${index}] must cite known evidence`);
    if (!evidenceIds.some((id) => evidenceById.get(id).primary)) throw new Error(`facts[${index}] must cite primary evidence`);
    return {claim, evidenceIds};
  });
  const payload = {
    schema: 'refas.visual-observation/v1',
    hierarchyDigest: hierarchy.hierarchyDigest,
    nodeId,
    ancestry: chain.map((node) => node.id),
    evidence: normalizedEvidence,
    facts: normalizedFacts,
    interpretations: interpretations.map(String),
    hypotheses: hypotheses.map(String),
    ambiguities: ambiguities.map(String),
    policy: {
      primaryReferenceOutranksDerivedEvidence: true,
      derivedEvidenceIsObservationAidOnly: true,
      ambiguityMustRemainExplicit: true,
      geometryParametersForbiddenInFacts: true,
    },
  };
  return deepFreeze({...payload, observationDigest: digestJson(payload)});
}

export function validateVisualHierarchy(hierarchy) {
  const errors = [];
  if (hierarchy?.schema !== 'refas.visual-hierarchy/v1') errors.push('invalid schema');
  try {
    const recreated = createVisualHierarchy({source: hierarchy.source, nodes: hierarchy.nodes});
    if (recreated.hierarchyDigest !== hierarchy.hierarchyDigest) errors.push('hierarchy normalization mismatch');
    const payload = structuredClone(hierarchy);
    delete payload.hierarchyDigest;
    if (digestJson(payload) !== hierarchy.hierarchyDigest) errors.push('hierarchy digest mismatch');
    nodeAncestry(hierarchy, hierarchy.rootId);
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors, nodeCount: hierarchy?.nodes?.length ?? 0};
}

export function validateObservation(observation, hierarchy) {
  const errors = [];
  if (observation?.schema !== 'refas.visual-observation/v1') errors.push('invalid schema');
  if (hierarchy?.hierarchyDigest !== observation?.hierarchyDigest) errors.push('hierarchy binding mismatch');
  try {
    const recreated = createObservation({
      hierarchy,
      nodeId: observation.nodeId,
      evidence: observation.evidence,
      facts: observation.facts,
      interpretations: observation.interpretations,
      hypotheses: observation.hypotheses,
      ambiguities: observation.ambiguities,
    });
    if (recreated.observationDigest !== observation.observationDigest) errors.push('observation normalization mismatch');
    const payload = structuredClone(observation);
    delete payload.observationDigest;
    if (digestJson(payload) !== observation.observationDigest) errors.push('observation digest mismatch');
    const ancestry = nodeAncestry(hierarchy, observation.nodeId).map((node) => node.id);
    if (JSON.stringify(ancestry) !== JSON.stringify(observation.ancestry)) errors.push('observation ancestry mismatch');
    if (!observation.evidence.some((item) => item.primary && item.sha256 === hierarchy.source.sha256)) errors.push('raw primary evidence missing');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

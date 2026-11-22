import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const SPATIAL_HYPOTHESIS_SET_SCHEMA = 'refas.spatial-hypothesis-set/v1';
const REQUIRED_PREDICTIONS = ['silhouette', 'occlusion', 'sideView', 'topView', 'grazing'];

export function createSpatialHypothesisSet({scopeId, sourceSha256, hypotheses = [], attestation, selectedId = null} = {}) {
  if (hypotheses.length < 2) throw new Error('a high-impact spatial ambiguity requires at least two hypotheses');
  if (attestation?.attested !== true || !Array.isArray(attestation.evidenceRefs) || !attestation.evidenceRefs.length) {
    throw new Error('spatial hypotheses require an evidence-cited agent attestation');
  }
  const normalized = hypotheses.map((raw, index) => {
    const predictions = {};
    for (const key of REQUIRED_PREDICTIONS) {
      predictions[key] = String(raw.predictions?.[key] ?? '');
      if (!predictions[key]) throw new Error(`hypotheses[${index}].predictions.${key} is required`);
    }
    const falsifiers = [...(raw.falsifiers ?? [])].map(String).filter(Boolean);
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String).filter(Boolean);
    if (!falsifiers.length || !evidenceRefs.length) throw new Error(`hypotheses[${index}] requires falsifiers and evidenceRefs`);
    const evidenceCoverage = Number(raw.evidenceCoverage);
    const assumptionCost = Number(raw.assumptionCost);
    if (!Number.isFinite(evidenceCoverage) || evidenceCoverage < 0 || !Number.isFinite(assumptionCost) || assumptionCost < 0) throw new Error(`hypotheses[${index}] scores must be finite and non-negative`);
    return {
      id: assertId(raw.id, `hypotheses[${index}].id`),
      description: String(raw.description ?? ''),
      camera: raw.camera && typeof raw.camera === 'object' ? structuredClone(raw.camera) : {},
      hiddenForm: String(raw.hiddenForm ?? 'least-committed support geometry'),
      predictions,
      falsifiers,
      evidenceRefs,
      evidenceCoverage,
      assumptionCost,
      rankScore: evidenceCoverage - assumptionCost,
      status: String(raw.status ?? 'plausible'),
    };
  });
  if (normalized.some((item) => !item.description)) throw new Error('every spatial hypothesis requires a description');
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('spatial hypothesis IDs must be unique');
  const ranked = [...normalized].sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
  if (selectedId != null && !normalized.some((item) => item.id === selectedId)) throw new Error('selected spatial hypothesis is unknown');
  if (selectedId != null) {
    const unresolvedCompetitors = normalized.filter((item) => item.id !== selectedId && !['falsified', 'superseded'].includes(item.status));
    if (unresolvedCompetitors.length) throw new Error('a hypothesis cannot be selected while high-impact competitors remain unfalsified');
  }
  const payload = {
    schema: SPATIAL_HYPOTHESIS_SET_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    hypotheses: normalized,
    ranking: ranked.map((item) => item.id),
    selectedId,
    attestation: {evidenceRefs: attestation.evidenceRefs.map(String), digest: digestJson(attestation)},
    policy: {
      cameraBeforeGeometryDistortion: true,
      rankingUsesEvidenceCoverageAndAssumptionCost: true,
      hiddenGeometryRemainsInferred: true,
      selectedHypothesisRequiresCompetitorFalsification: true,
    },
  };
  return deepFreeze({...payload, hypothesisSetDigest: digestJson(payload)});
}

export function validateSpatialHypothesisSet(set) {
  const errors = [];
  if (set?.schema !== SPATIAL_HYPOTHESIS_SET_SCHEMA) errors.push('invalid schema');
  if ((set?.hypotheses?.length ?? 0) < 2) errors.push('competing hypotheses missing');
  if (set?.policy?.cameraBeforeGeometryDistortion !== true) errors.push('camera-first policy missing');
  try {
    const recreated = createSpatialHypothesisSet({
      scopeId: set.scopeId,
      sourceSha256: set.sourceSha256,
      hypotheses: set.hypotheses,
      attestation: {attested: true, evidenceRefs: set.attestation?.evidenceRefs ?? []},
      selectedId: set.selectedId,
    });
    if (JSON.stringify(recreated.ranking) !== JSON.stringify(set.ranking)) errors.push('spatial ranking mismatch');
    const payload = structuredClone(set);
    delete payload.hypothesisSetDigest;
    if (digestJson(payload) !== set.hypothesisSetDigest) errors.push('hypothesis set digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

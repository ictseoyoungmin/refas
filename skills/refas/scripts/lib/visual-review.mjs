import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {normalizeFinding} from './failure-router.mjs';
import {findingsFromProjectionFit} from './projection-findings.mjs';
import {validateProjectionFit} from './projection-fit.mjs';
import {PBR_RENDERER_FAMILIES} from './pbr-render-report.mjs';

export const VISUAL_REVIEW_SCHEMA = 'refas.visual-review/v1';
export const REQUIRED_REVIEW_VIEW_IDS = Object.freeze([
  'hero',
  'oblique',
  'side',
  'top',
  'grazing',
  'normal',
  'object-id',
  'albedo',
]);
export const REQUIRED_VISUAL_GATE_IDS = Object.freeze([
  'silhouette-and-mass',
  'surface-topology',
  'assembly-integrity',
  'appearance-plausibility',
  'multiview-render-integrity',
  'no-blocking-findings',
]);
export const REQUIRED_CLOSURE_GATE_IDS = Object.freeze([
  'source-integrity',
  'hierarchy-coverage',
  'observation-authority',
  'spatial-plausibility',
  ...REQUIRED_VISUAL_GATE_IDS,
  'project-audit',
]);

const REVIEW_STATUSES = new Set(['pass', 'fail', 'insufficient']);
const EVIDENCE_CLASSES = new Set(['independent-reference', 'self-generated-contract-fixture']);
const RENDERER_CLAIM_SCOPES = new Set(['render-integrity-only', 'visual-fidelity']);
const PBR_RENDERER_FAMILY_SET = new Set(PBR_RENDERER_FAMILIES);

function strings(values, label, {required = false, identifiers = false} = {}) {
  const normalized = [...new Set((values ?? []).map(String).filter(Boolean))].sort();
  if (required && !normalized.length) throw new Error(`${label} requires at least one value`);
  if (identifiers) normalized.forEach((value, index) => assertId(value, `${label}[${index}]`));
  return normalized;
}

function exactIds(items, expected, label) {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} IDs must be unique`);
  const missing = expected.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !expected.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`);
  }
}

function normalizeVerdict(raw, index, label) {
  const id = assertId(raw?.id, `${label}[${index}].id`);
  const status = String(raw?.status ?? 'insufficient').toLowerCase();
  if (!REVIEW_STATUSES.has(status)) throw new Error(`${label}[${index}].status is invalid`);
  const evidenceRefs = strings(raw?.evidenceRefs, `${label}[${index}].evidenceRefs`, {required: true});
  const summary = String(raw?.summary ?? '').trim();
  return {id, status, evidenceRefs, summary};
}

function requirePassingObservationSummaries(items, label) {
  const empty = items.findIndex((item) => !item.summary);
  if (empty >= 0) throw new Error(`${label}[${empty}] requires a substantive observation summary in a passing visual review`);
}

export function createVisualReview({
  scopeId,
  sourceSha256,
  assetSha256,
  evidenceClass,
  verdict,
  views = [],
  gateVerdicts = [],
  unresolvedFindings = [],
  renderer,
  requiredMaterialFeatures = [],
  attestation,
} = {}) {
  const normalizedEvidenceClass = String(evidenceClass ?? '');
  if (!EVIDENCE_CLASSES.has(normalizedEvidenceClass)) throw new Error('evidenceClass must distinguish an independent reference from a self-generated contract fixture');
  const normalizedVerdict = String(verdict ?? 'insufficient').toLowerCase();
  if (!REVIEW_STATUSES.has(normalizedVerdict)) throw new Error('visual review verdict is invalid');
  if (attestation?.attested !== true || !Array.isArray(attestation.evidenceRefs) || !attestation.evidenceRefs.length) {
    throw new Error('visual review requires an evidence-cited attestation');
  }

  const normalizedViews = views.map((item, index) => normalizeVerdict(item, index, 'views'));
  exactIds(normalizedViews, REQUIRED_REVIEW_VIEW_IDS, 'views');
  const normalizedGateVerdicts = gateVerdicts.map((item, index) => normalizeVerdict(item, index, 'gateVerdicts'));
  exactIds(normalizedGateVerdicts, REQUIRED_VISUAL_GATE_IDS, 'gateVerdicts');

  if (!renderer || typeof renderer !== 'object') throw new Error('renderer disclosure is required');
  const claimScope = String(renderer.claimScope ?? '');
  if (!RENDERER_CLAIM_SCOPES.has(claimScope)) throw new Error('renderer.claimScope is invalid');
  const supportedMaterialFeatures = strings(renderer.supportedMaterialFeatures, 'renderer.supportedMaterialFeatures', {identifiers: true});
  const unsupportedMaterialFeatures = strings(renderer.unsupportedMaterialFeatures, 'renderer.unsupportedMaterialFeatures', {identifiers: true});
  const overlap = supportedMaterialFeatures.filter((feature) => unsupportedMaterialFeatures.includes(feature));
  if (overlap.length) throw new Error(`renderer material support is contradictory: ${overlap.join(', ')}`);
  const normalizedRequiredFeatures = strings(requiredMaterialFeatures, 'requiredMaterialFeatures', {identifiers: true});
  const normalizedRenderer = {
    kind: String(renderer.kind ?? ''),
    family: String(renderer.family ?? ''),
    reportRef: String(renderer.reportRef ?? ''),
    reportSha256: assertDigest(renderer.reportSha256, 'renderer.reportSha256'),
    independentProcess: renderer.independentProcess === true,
    claimScope,
    supportedMaterialFeatures,
    unsupportedMaterialFeatures,
  };
  if (!normalizedRenderer.kind || !normalizedRenderer.family || !normalizedRenderer.reportRef) throw new Error('renderer.kind, renderer.family, and renderer.reportRef are required');
  if (!PBR_RENDERER_FAMILY_SET.has(normalizedRenderer.family)) throw new Error(`renderer.family must be one of: ${PBR_RENDERER_FAMILIES.join(', ')}`);

  const findings = unresolvedFindings.map(normalizeFinding);
  const blockingFindings = findings.filter((finding) => finding.blocking);
  const appearanceVerdict = normalizedGateVerdicts.find((gate) => gate.id === 'appearance-plausibility');
  if (appearanceVerdict.status === 'pass') {
    if (claimScope !== 'visual-fidelity') throw new Error('appearance-plausibility cannot pass with a render-integrity-only renderer');
    if (!normalizedRenderer.independentProcess) throw new Error('appearance-plausibility requires an independent PBR renderer process');
    const unsupportedRequired = normalizedRequiredFeatures.filter((feature) => !supportedMaterialFeatures.includes(feature));
    if (unsupportedRequired.length) throw new Error(`appearance-plausibility cannot pass because the renderer does not support: ${unsupportedRequired.join(', ')}`);
  }
  if (normalizedVerdict === 'pass') {
    if (normalizedViews.some((view) => view.status !== 'pass')) throw new Error('a passing visual review requires every standard view to pass');
    if (normalizedGateVerdicts.some((gate) => gate.status !== 'pass')) throw new Error('a passing visual review requires every visual gate to pass');
    requirePassingObservationSummaries(normalizedViews, 'views');
    requirePassingObservationSummaries(normalizedGateVerdicts, 'gateVerdicts');
    if (blockingFindings.length) throw new Error('a passing visual review cannot contain unresolved major, critical, or blocking findings');
  }

  const attestationEvidenceRefs = strings(attestation.evidenceRefs, 'attestation.evidenceRefs', {required: true});
  const payload = {
    schema: VISUAL_REVIEW_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    assetSha256: assertDigest(assetSha256, 'assetSha256'),
    evidenceClass: normalizedEvidenceClass,
    verdict: normalizedVerdict,
    views: normalizedViews,
    gateVerdicts: normalizedGateVerdicts,
    unresolvedFindings: findings,
    renderer: normalizedRenderer,
    requiredMaterialFeatures: normalizedRequiredFeatures,
    attestation: {evidenceRefs: attestationEvidenceRefs, digest: digestJson({attested: true, evidenceRefs: attestationEvidenceRefs})},
    policy: {
      selfGeneratedFixturesAreContractOnly: true,
      renderIntegrityIsNotVisualAcceptance: true,
      unsupportedMaterialFeaturesCannotPassAppearance: true,
      independentPbrRendererRequiredAfterPortableGate: true,
      unresolvedBlockingFindingsPreventClosure: true,
    },
  };
  return deepFreeze({...payload, reviewDigest: digestJson(payload)});
}

export function createProjectionAwareVisualReview({projectionFit, projectionFindingThresholds, ...review} = {}) {
  const validation = validateProjectionFit(projectionFit);
  if (!validation.valid) throw new Error(`projectionFit is required and must be valid: ${validation.errors.join('; ')}`);
  if (projectionFit.scopeId !== review.scopeId) throw new Error('projection fit scope does not match visual review scope');
  if (projectionFit.sourceSha256 !== review.sourceSha256) throw new Error('projection fit source does not match visual review source');
  const geometricFindings = findingsFromProjectionFit(projectionFit, projectionFindingThresholds);
  const unresolvedFindings = [...(review.unresolvedFindings ?? []), ...geometricFindings];
  return createVisualReview({...review, unresolvedFindings});
}

export function validateVisualReview(review) {
  const errors = [];
  if (review?.schema !== VISUAL_REVIEW_SCHEMA) errors.push('invalid schema');
  try {
    const recreated = createVisualReview({
      scopeId: review.scopeId,
      sourceSha256: review.sourceSha256,
      assetSha256: review.assetSha256,
      evidenceClass: review.evidenceClass,
      verdict: review.verdict,
      views: review.views,
      gateVerdicts: review.gateVerdicts,
      unresolvedFindings: review.unresolvedFindings,
      renderer: review.renderer,
      requiredMaterialFeatures: review.requiredMaterialFeatures,
      attestation: {attested: true, evidenceRefs: review.attestation?.evidenceRefs ?? []},
    });
    if (recreated.reviewDigest !== review.reviewDigest) errors.push('visual review normalization mismatch');
    const payload = structuredClone(review);
    delete payload.reviewDigest;
    if (digestJson(payload) !== review.reviewDigest) errors.push('visual review digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

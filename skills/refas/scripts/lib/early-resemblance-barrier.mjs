import {assertDigest, deepFreeze, digestJson} from './canonical.mjs';
import {validatePerceptualSignatureEvidence} from './perceptual-signature.mjs';
import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  validatePbrRenderReport,
} from './pbr-render-report.mjs';

export const EARLY_RESEMBLANCE_BARRIER_SCHEMA = 'refas.early-resemblance-barrier/v1';
export const EARLY_RESEMBLANCE_VERDICTS = Object.freeze(['PROCEED', 'REWORK', 'HOLD']);
export const EARLY_RESEMBLANCE_REQUIRED_IMPORTANCE = Object.freeze(['macro', 'identity']);

const REQUIRED_IMPORTANCE = new Set(EARLY_RESEMBLANCE_REQUIRED_IMPORTANCE);

function strings(values, label, {required = false} = {}) {
  const out = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && out.length === 0) throw new Error(`${label} requires at least one value`);
  return out;
}

function assertCanonicalClayReport(report, assetSha256) {
  const validation = validatePbrRenderReport(report);
  if (!validation.valid) throw new Error(`clayRenderReport is invalid: ${validation.errors.join('; ')}`);
  if (report.assetSha256 !== assetSha256) throw new Error('neutral-clay render report binds a different candidate');
  if (report.presentation?.mode !== 'neutral-clay') throw new Error('early resemblance barrier requires a neutral-clay render report');
  if (report.presentation?.presetId !== NEUTRAL_CLAY_PRESENTATION_PRESET.id) throw new Error('neutral-clay presetId is not canonical');
  if (report.presentation?.presetDigest !== NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST) throw new Error('neutral-clay preset digest mismatch');
  if (report.lighting?.rigId !== NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId) throw new Error('neutral-clay lighting rigId is not canonical');
  if (report.lighting?.digest !== NEUTRAL_CLAY_LIGHTING_RIG_DIGEST) throw new Error('neutral-clay lighting digest is not canonical');
  const viewIds = new Set((report.outputs ?? []).map((output) => output.viewId));
  const missing = NEUTRAL_CLAY_REQUIRED_VIEW_IDS.filter((viewId) => !viewIds.has(viewId));
  if (missing.length) throw new Error(`neutral-clay render report is missing required views: ${missing.join(', ')}`);
}

export function createEarlyResemblanceBarrier({
  sourceSha256,
  hierarchyDigest,
  assetSha256,
  signatureEvidence,
  clayRenderReport,
  evidenceRefs = [],
} = {}) {
  const source = assertDigest(sourceSha256, 'sourceSha256');
  const hierarchy = assertDigest(hierarchyDigest, 'hierarchyDigest');
  const asset = assertDigest(assetSha256, 'assetSha256');

  const signatureValidation = validatePerceptualSignatureEvidence(signatureEvidence, {
    sourceSha256: source,
    assetSha256: asset,
  });
  if (!signatureValidation.valid) throw new Error(`signatureEvidence is invalid: ${signatureValidation.errors.join('; ')}`);
  if (signatureEvidence.hierarchyDigest !== hierarchy) throw new Error('signatureEvidence hierarchy binding mismatch');
  assertCanonicalClayReport(clayRenderReport, asset);

  const required = signatureEvidence.observations.filter((observation) => REQUIRED_IMPORTANCE.has(observation.importance));
  if (required.length === 0) throw new Error('early resemblance barrier requires at least one macro or identity signature');

  const mismatches = required.filter((observation) => observation.status === 'mismatch');
  const insufficient = required.filter((observation) => observation.status === 'insufficient');
  const verdict = mismatches.length ? 'REWORK' : insufficient.length ? 'HOLD' : 'PROCEED';
  const blocking = verdict === 'REWORK' ? mismatches : verdict === 'HOLD' ? insufficient : [];
  const findings = mismatches.map((observation) => observation.finding).filter(Boolean);

  const payload = {
    schema: EARLY_RESEMBLANCE_BARRIER_SCHEMA,
    scopeId: signatureEvidence.scopeId,
    sourceSha256: source,
    hierarchyDigest: hierarchy,
    assetSha256: asset,
    signatureSetDigest: signatureEvidence.signatureSetDigest,
    signatureEvidenceDigest: signatureEvidence.evidenceDigest,
    clayRenderReportDigest: clayRenderReport.reportDigest,
    clayPresetId: NEUTRAL_CLAY_PRESENTATION_PRESET.id,
    clayPresetDigest: NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
    requiredSignatureIds: required.map((observation) => observation.signatureId).sort(),
    blockingSignatureIds: blocking.map((observation) => observation.signatureId).sort(),
    detailSignatureIds: signatureEvidence.observations.filter((observation) => observation.importance === 'detail').map((observation) => observation.signatureId).sort(),
    verdict,
    findings,
    evidenceRefs: strings(evidenceRefs, 'evidenceRefs', {required: true}),
    policy: {
      neutralClayPresentationRequired: true,
      macroAndIdentityRequiredForProceed: true,
      detailSignaturesDoNotBlockEarlyAdmission: true,
      noNumericAggregateScore: true,
      singleViewIouExcluded: true,
      multiviewIouRemainsCorrespondenceOnly: true,
      proceedOnlyAuthorizesDownstreamDetail: true,
      proceedDoesNotPassVisualReview: true,
      proceedDoesNotCertify: true,
      holdDoesNotInventRepairOwner: true,
      mismatchFindingsRemainOwnerAuthoritative: true,
    },
  };
  return deepFreeze({...payload, barrierDigest: digestJson(payload)});
}

export function validateEarlyResemblanceBarrier(record, {
  sourceSha256 = null,
  hierarchyDigest = null,
  assetSha256 = null,
} = {}) {
  const errors = [];
  if (record?.schema !== EARLY_RESEMBLANCE_BARRIER_SCHEMA) errors.push('invalid schema');
  try {
    const expected = createEarlyResemblanceBarrier({
      sourceSha256: record?.sourceSha256,
      hierarchyDigest: record?.hierarchyDigest,
      assetSha256: record?.assetSha256,
      signatureEvidence: record?.signatureEvidence,
      clayRenderReport: record?.clayRenderReport,
      evidenceRefs: record?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('early resemblance barrier is not canonical');
    if (sourceSha256 != null && expected.sourceSha256 !== assertDigest(sourceSha256, 'sourceSha256')) errors.push('early resemblance source binding mismatch');
    if (hierarchyDigest != null && expected.hierarchyDigest !== assertDigest(hierarchyDigest, 'hierarchyDigest')) errors.push('early resemblance hierarchy binding mismatch');
    if (assetSha256 != null && expected.assetSha256 !== assertDigest(assetSha256, 'assetSha256')) errors.push('early resemblance candidate binding mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

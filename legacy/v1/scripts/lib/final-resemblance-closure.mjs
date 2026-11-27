import {assertDigest, deepFreeze, digestJson} from './canonical.mjs';
import {validatePerceptualSignatureEvidence} from './perceptual-signature.mjs';
import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  validatePbrRenderReport,
} from './pbr-render-report.mjs';

export const FINAL_RESEMBLANCE_CLOSURE_SCHEMA = 'refas.final-resemblance-closure/v1';
export const FINAL_RESEMBLANCE_REQUIRED_IMPORTANCE = Object.freeze(['macro', 'identity']);
const REQUIRED = new Set(FINAL_RESEMBLANCE_REQUIRED_IMPORTANCE);

function strings(values, label, {required = false} = {}) {
  if (!Array.isArray(values ?? [])) throw new Error(`${label} must be an array`);
  const out = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && out.length === 0) throw new Error(`${label} requires at least one value`);
  return out;
}

function assertCanonicalFinalClayReport(report, assetSha256) {
  const validation = validatePbrRenderReport(report);
  if (!validation.valid) throw new Error(`clayRenderReport is invalid: ${validation.errors.join('; ')}`);
  if (report.assetSha256 !== assetSha256) throw new Error('final neutral-clay report binds a different candidate');
  if (report.claimScope !== 'shape-resemblance-only' || report.presentation?.mode !== 'neutral-clay') {
    throw new Error('final resemblance closure requires canonical neutral-clay shape evidence');
  }
  if (report.presentation?.presetId !== NEUTRAL_CLAY_PRESENTATION_PRESET.id
      || report.presentation?.presetDigest !== NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST) {
    throw new Error('final neutral-clay presentation preset is not canonical');
  }
  if (report.lighting?.rigId !== NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId
      || report.lighting?.digest !== NEUTRAL_CLAY_LIGHTING_RIG_DIGEST) {
    throw new Error('final neutral-clay lighting is not canonical');
  }
  const views = new Set((report.outputs ?? []).map((item) => item.viewId));
  const missing = NEUTRAL_CLAY_REQUIRED_VIEW_IDS.filter((id) => !views.has(id));
  if (missing.length) throw new Error(`final neutral-clay report is missing required views: ${missing.join(', ')}`);
}

export function createFinalResemblanceClosure({
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
  if (signatureEvidence.hierarchyDigest !== hierarchy) throw new Error('final signature evidence hierarchy binding mismatch');
  assertCanonicalFinalClayReport(clayRenderReport, asset);

  const required = signatureEvidence.observations.filter((observation) => REQUIRED.has(observation.importance));
  if (!required.length) throw new Error('final resemblance closure requires at least one macro or identity signature');
  const nonMatches = required.filter((observation) => observation.status !== 'match');
  if (nonMatches.length) {
    throw new Error(`final resemblance closure requires every macro and identity signature to match: ${nonMatches.map((item) => `${item.signatureId}=${item.status}`).join(', ')}`);
  }
  const clayOutputPaths = new Set((clayRenderReport.outputs ?? []).map((output) => output.path));
  for (const observation of required) {
    if (!(observation.evidenceRefs ?? []).some((ref) => clayOutputPaths.has(ref))) {
      throw new Error(`final required signature ${observation.signatureId} must cite at least one exact final neutral-clay output`);
    }
  }

  const core = {
    schema: FINAL_RESEMBLANCE_CLOSURE_SCHEMA,
    sourceSha256: source,
    hierarchyDigest: hierarchy,
    assetSha256: asset,
    signatureSetDigest: signatureEvidence.signatureSetDigest,
    signatureEvidence,
    signatureEvidenceDigest: signatureEvidence.evidenceDigest,
    clayRenderReport,
    clayRenderReportDigest: clayRenderReport.reportDigest,
    requiredSignatureIds: required.map((item) => item.signatureId).sort(),
    detailSignatureIds: signatureEvidence.observations.filter((item) => item.importance === 'detail').map((item) => item.signatureId).sort(),
    evidenceRefs: strings(evidenceRefs, 'evidenceRefs', {required: true}),
    policy: {
      finalCandidateOnly: true,
      macroAndIdentityMustMatch: true,
      requiredSignaturesMustCiteFinalClayOutput: true,
      detailSignaturesDoNotBlockFinalFormIdentity: true,
      doesNotReplaceVisualReview: true,
      doesNotCertifyByItself: true,
      noNumericAggregateScore: true,
      singleViewIouExcluded: true,
      multiviewIouRemainsCorrespondenceOnly: true,
    },
  };
  return deepFreeze({...core, closureDigest: digestJson(core)});
}

export function validateFinalResemblanceClosure(value, {
  sourceSha256 = null,
  hierarchyDigest = null,
  assetSha256 = null,
} = {}) {
  const errors = [];
  try {
    if (value?.schema !== FINAL_RESEMBLANCE_CLOSURE_SCHEMA) errors.push('invalid final resemblance closure schema');
    const expected = createFinalResemblanceClosure({
      sourceSha256: value?.sourceSha256,
      hierarchyDigest: value?.hierarchyDigest,
      assetSha256: value?.assetSha256,
      signatureEvidence: value?.signatureEvidence,
      clayRenderReport: value?.clayRenderReport,
      evidenceRefs: value?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(value)) errors.push('final resemblance closure is not canonical');
    if (sourceSha256 != null && expected.sourceSha256 !== assertDigest(sourceSha256, 'sourceSha256')) errors.push('final resemblance source binding mismatch');
    if (hierarchyDigest != null && expected.hierarchyDigest !== assertDigest(hierarchyDigest, 'hierarchyDigest')) errors.push('final resemblance hierarchy binding mismatch');
    if (assetSha256 != null && expected.assetSha256 !== assertDigest(assetSha256, 'assetSha256')) errors.push('final resemblance candidate binding mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

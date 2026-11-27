import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {validateVisualHierarchy} from './hierarchy.mjs';
import {validateSpatialHypothesisSet} from './spatial-hypotheses.mjs';
import {validatePerceptualSignatureEvidence} from './perceptual-signature.mjs';
import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  validatePbrRenderReport,
} from './pbr-render-report.mjs';
import {validateSpatialClosureEvidence} from './spatial-closure-evidence.mjs';
import {_classifySpatialCollapseFromAuthority} from './spatial-collapse-core.mjs';

export const BLOCKOUT_COMPETITION_POLICY_SCHEMA = 'refas.blockout-competition-policy/v1';
export const BLOCKOUT_COMPETITION_DECISION_SCHEMA = 'refas.blockout-competition-decision/v1';
export const BLOCKOUT_COMPETITION_MODES = Object.freeze(['advisory', 'required']);
export const BLOCKOUT_COMPETITION_ELIGIBLE_LEVELS = Object.freeze(['whole', 'region']);

const MODE_SET = new Set(BLOCKOUT_COMPETITION_MODES);
const LEVEL_SET = new Set(BLOCKOUT_COMPETITION_ELIGIBLE_LEVELS);
const VOLUMETRIC_ROLES = new Set(['volumetric', 'layered-volume', 'rod-tubular']);
const REQUIRED_IMPORTANCE = new Set(['macro', 'identity']);

function strings(values, label, required = false) {
  if (!Array.isArray(values)) throw new Error(label + ' must be an array');
  const out = [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort();
  if (required && !out.length) throw new Error(label + ' requires at least one value');
  return out;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(label + ' is required');
  return text;
}

function validateHierarchyBinding(hierarchy, sourceSha256) {
  const validation = validateVisualHierarchy(hierarchy);
  if (!validation.valid) throw new Error('blockout competition hierarchy is invalid: ' + validation.errors.join('; '));
  const source = assertDigest(sourceSha256, 'sourceSha256');
  if (hierarchy.source.sha256 !== source) throw new Error('blockout competition source must match the bound visual hierarchy source');
  return source;
}

export function createBlockoutCompetitionPolicy({
  hierarchy,
  sourceSha256,
  mode = 'advisory',
  scopeIds = [],
} = {}) {
  const source = validateHierarchyBinding(hierarchy, sourceSha256);
  const resolvedMode = String(mode ?? '');
  if (!MODE_SET.has(resolvedMode)) throw new Error('blockout competition mode must be advisory or required');
  const nodeById = new Map(hierarchy.nodes.map((node) => [node.id, node]));
  const scopes = strings(scopeIds, 'scopeIds');
  if (resolvedMode === 'required' && !scopes.length) throw new Error('required blockout competition policy needs at least one target scope');
  for (const scopeId of scopes) {
    assertId(scopeId, 'scopeId');
    const node = nodeById.get(scopeId);
    if (!node) throw new Error('blockout competition scope is not present in the bound visual hierarchy: ' + scopeId);
    if (!LEVEL_SET.has(node.level)) throw new Error('blockout competition is limited to whole/major region scopes; got ' + node.level + ' for ' + scopeId);
  }
  const payload = {
    schema: BLOCKOUT_COMPETITION_POLICY_SCHEMA,
    sourceSha256: source,
    hierarchyDigest: hierarchy.hierarchyDigest,
    mode: resolvedMode,
    scopeIds: scopes,
    minimumCandidates: 2,
    policy: {
      policyGated: true,
      defaultAdvisoryWhenAbsent: true,
      volumetricScopesOnly: true,
      wholeAndMajorRegionsOnly: true,
      canonicalNeutralClayRequired: true,
      r03SignatureEvidenceRequired: true,
      vc03ClassificationRequired: true,
      rejectedCandidatesRetained: true,
      cameraBeforeGeometryDistortion: true,
      aggregateResemblanceScoreForbidden: true,
      singleViewIouAuthority: false,
      selectionDoesNotCertify: true,
    },
  };
  return deepFreeze({...payload, policyDigest: digestJson(payload)});
}

export function validateBlockoutCompetitionPolicy(record, hierarchy) {
  const errors = [];
  if (record?.schema !== BLOCKOUT_COMPETITION_POLICY_SCHEMA) errors.push('invalid schema');
  try {
    const expected = createBlockoutCompetitionPolicy({
      hierarchy,
      sourceSha256: record?.sourceSha256,
      mode: record?.mode,
      scopeIds: record?.scopeIds,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('blockout competition policy is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function assertCanonicalClayReport(report, assetSha256) {
  const validation = validatePbrRenderReport(report);
  if (!validation.valid) throw new Error('candidate neutral-clay report is invalid: ' + validation.errors.join('; '));
  if (report.assetSha256 !== assetSha256) throw new Error('candidate neutral-clay report binds a different asset');
  if (report.presentation?.mode !== 'neutral-clay') throw new Error('blockout competition requires canonical neutral-clay presentation');
  if (report.claimScope !== 'shape-resemblance-only') throw new Error('blockout competition clay report must be shape-resemblance-only');
  if (report.presentation?.presetId !== NEUTRAL_CLAY_PRESENTATION_PRESET.id) throw new Error('blockout competition clay presetId is not canonical');
  if (report.presentation?.presetDigest !== NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST) throw new Error('blockout competition clay preset digest mismatch');
  if (report.lighting?.rigId !== NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId) throw new Error('blockout competition clay lighting rigId is not canonical');
  if (report.lighting?.digest !== NEUTRAL_CLAY_LIGHTING_RIG_DIGEST) throw new Error('blockout competition clay lighting digest mismatch');
  const outputIds = new Set((report.outputs ?? []).map((output) => output.viewId));
  const missing = NEUTRAL_CLAY_REQUIRED_VIEW_IDS.filter((viewId) => !outputIds.has(viewId));
  if (missing.length) throw new Error('blockout competition neutral-clay report is missing required views: ' + missing.join(', '));
}

function validateSignatureEvidence(evidence, {sourceSha256, hierarchyDigest, assetSha256, scopeId, clayRenderReport}) {
  const validation = validatePerceptualSignatureEvidence(evidence, {sourceSha256, assetSha256});
  if (!validation.valid) throw new Error('candidate R03 signature evidence is invalid: ' + validation.errors.join('; '));
  if (evidence.hierarchyDigest !== hierarchyDigest) throw new Error('candidate R03 signature hierarchy binding mismatch');
  if (evidence.scopeId !== scopeId) throw new Error('candidate R03 signature scope binding mismatch');
  const clayPaths = new Set((clayRenderReport.outputs ?? []).map((output) => output.path));
  const required = evidence.observations.filter((observation) => REQUIRED_IMPORTANCE.has(observation.importance));
  if (!required.length) throw new Error('blockout competition requires at least one macro or identity R03 signature');
  for (const observation of required) {
    if (!(observation.evidenceRefs ?? []).some((ref) => clayPaths.has(ref))) {
      throw new Error('required R03 signature must cite an exact candidate neutral-clay output: ' + observation.signatureId);
    }
  }
}

function normalizeCandidate(raw, index, context) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('candidates[' + index + '] must be an object');
  const id = assertId(raw.id, 'candidates[' + index + '].id');
  const hypothesisId = assertId(raw.hypothesisId, 'candidates[' + index + '].hypothesisId');
  if (!context.hypothesisIds.has(hypothesisId)) throw new Error('candidate ' + id + ' cites an unknown spatial hypothesis: ' + hypothesisId);
  const glb = Buffer.from(raw.glb ?? []);
  if (!glb.length) throw new Error('candidate ' + id + ' requires exact GLB bytes');
  const assetSha256 = digestBytes(glb);
  const assetPath = requiredText(raw.assetPath, 'candidate ' + id + ' assetPath');
  assertCanonicalClayReport(raw.clayRenderReport, assetSha256);
  validateSignatureEvidence(raw.signatureEvidence, {
    sourceSha256: context.sourceSha256,
    hierarchyDigest: context.hierarchyDigest,
    assetSha256,
    scopeId: context.scopeId,
    clayRenderReport: raw.clayRenderReport,
  });
  const spatialValidation = validateSpatialClosureEvidence(raw.spatialEvidence, {glb});
  if (!spatialValidation.valid) throw new Error('candidate ' + id + ' VC01 evidence is invalid: ' + spatialValidation.errors.join('; '));
  if (raw.spatialEvidence.scopeId !== context.scopeId) throw new Error('candidate ' + id + ' VC01 scope binding mismatch');
  const spatialClassification = _classifySpatialCollapseFromAuthority({
    glb,
    spatialEvidence: raw.spatialEvidence,
    roleAuthority: context.roleAuthority,
  });
  return {
    id,
    hypothesisId,
    assetPath,
    assetSha256,
    signatureEvidence: structuredClone(raw.signatureEvidence),
    clayRenderReport: structuredClone(raw.clayRenderReport),
    spatialEvidence: structuredClone(raw.spatialEvidence),
    spatialClassification,
  };
}

function findObservation(candidate, signatureId) {
  return candidate.signatureEvidence.observations.find((observation) => observation.signatureId === signatureId) ?? null;
}

function normalizeReason(raw, label, candidateById) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(label + ' must be an object');
  const kind = String(raw.kind ?? '');
  const candidateId = assertId(raw.candidateId, label + '.candidateId');
  const candidate = candidateById.get(candidateId);
  if (!candidate) throw new Error(label + ' cites unknown candidate ' + candidateId);
  const conclusion = requiredText(raw.conclusion, label + '.conclusion');
  if (kind === 'r03-signature') {
    const signatureId = assertId(raw.signatureId, label + '.signatureId');
    const observation = findObservation(candidate, signatureId);
    if (!observation) throw new Error(label + ' cites unknown R03 signature ' + signatureId + ' for ' + candidateId);
    return {
      kind,
      candidateId,
      signatureId,
      status: observation.status,
      signatureEvidenceDigest: candidate.signatureEvidence.evidenceDigest,
      conclusion,
    };
  }
  if (kind === 'vc03-classification') {
    return {
      kind,
      candidateId,
      classification: candidate.spatialClassification.classification,
      classificationDigest: candidate.spatialClassification.classificationDigest,
      conclusion,
    };
  }
  throw new Error(label + '.kind must be r03-signature or vc03-classification');
}

function rawReason(reason) {
  return reason.kind === 'r03-signature'
    ? {kind: reason.kind, candidateId: reason.candidateId, signatureId: reason.signatureId, conclusion: reason.conclusion}
    : {kind: reason.kind, candidateId: reason.candidateId, conclusion: reason.conclusion};
}

function normalizeRejections(rejections, rejectedIds, candidateById) {
  if (!Array.isArray(rejections)) throw new Error('rejections must be an array');
  const byCandidate = new Map();
  for (const [index, raw] of rejections.entries()) {
    const candidateId = assertId(raw?.candidateId, 'rejections[' + index + '].candidateId');
    if (!rejectedIds.has(candidateId)) throw new Error('rejection must target an unselected candidate: ' + candidateId);
    if (byCandidate.has(candidateId)) throw new Error('duplicate rejection for candidate ' + candidateId);
    const reasons = (raw?.reasons ?? []).map((reason, reasonIndex) => normalizeReason(reason, 'rejections[' + index + '].reasons[' + reasonIndex + ']', candidateById));
    if (!reasons.length) throw new Error('rejection for ' + candidateId + ' requires at least one typed reason');
    byCandidate.set(candidateId, {candidateId, reasons});
  }
  const missing = [...rejectedIds].filter((id) => !byCandidate.has(id));
  if (missing.length) throw new Error('every rejected candidate must remain as rejected evidence; missing: ' + missing.join(', '));
  return [...byCandidate.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

export function createBlockoutCompetitionDecision({
  policy,
  hierarchy,
  scopeId,
  hypothesisSet,
  roleAuthority,
  candidates = [],
  selectedCandidateId,
  selectionReasons = [],
  rejections = [],
  evidenceRefs = [],
} = {}) {
  const policyValidation = validateBlockoutCompetitionPolicy(policy, hierarchy);
  if (!policyValidation.valid) throw new Error('blockout competition policy is invalid: ' + policyValidation.errors.join('; '));
  if (policy.mode !== 'required') throw new Error('blockout competition decision is only authoritative under required policy');
  const scope = assertId(scopeId, 'scopeId');
  if (!policy.scopeIds.includes(scope)) throw new Error('scope is not targeted by the required blockout competition policy: ' + scope);
  const node = hierarchy.nodes.find((item) => item.id === scope);
  if (!node || !LEVEL_SET.has(node.level)) throw new Error('blockout competition scope must be a whole or major region');
  const hypothesisValidation = validateSpatialHypothesisSet(hypothesisSet);
  if (!hypothesisValidation.valid) throw new Error('spatial hypothesis set is invalid: ' + hypothesisValidation.errors.join('; '));
  if (hypothesisSet.scopeId !== scope) throw new Error('spatial hypothesis set scope mismatch');
  if (hypothesisSet.sourceSha256 !== policy.sourceSha256) throw new Error('spatial hypothesis set source mismatch');
  if (hypothesisSet.selectedId != null) throw new Error('candidate competition must occur before the abstract hypothesis set is pre-selected');
  if (roleAuthority?.schema !== 'refas.spatial-role-authority/v1') throw new Error('blockout competition requires frozen VC02 runtime authority');
  if (roleAuthority.sourceSha256 !== policy.sourceSha256 || roleAuthority.hierarchyDigest !== policy.hierarchyDigest) throw new Error('blockout competition VC02 authority binding mismatch');
  if (roleAuthority.selectedExpectation?.scopeId !== scope) throw new Error('blockout competition requires exact VC02 authority for the competed scope');
  if (!VOLUMETRIC_ROLES.has(roleAuthority.selectedExpectation?.role)) throw new Error('blockout competition required admission applies only to volumetric roles');

  if (!Array.isArray(candidates) || candidates.length < policy.minimumCandidates) throw new Error('required blockout competition needs at least ' + policy.minimumCandidates + ' realized candidates');
  const hypothesisIds = new Set(hypothesisSet.hypotheses.map((hypothesis) => hypothesis.id));
  const context = {
    sourceSha256: policy.sourceSha256,
    hierarchyDigest: policy.hierarchyDigest,
    scopeId: scope,
    hypothesisIds,
    roleAuthority,
  };
  const normalizedCandidates = candidates.map((candidate, index) => normalizeCandidate(candidate, index, context))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(normalizedCandidates.map((candidate) => candidate.id)).size !== normalizedCandidates.length) throw new Error('blockout candidate IDs must be unique');
  if (new Set(normalizedCandidates.map((candidate) => candidate.hypothesisId)).size !== normalizedCandidates.length) throw new Error('each blockout candidate must realize a distinct spatial hypothesis');
  if (new Set(normalizedCandidates.map((candidate) => candidate.assetSha256)).size !== normalizedCandidates.length) throw new Error('blockout candidates must bind distinct GLB bytes');
  const signatureDigests = new Set(normalizedCandidates.map((candidate) => candidate.signatureEvidence.signatureSetDigest));
  if (signatureDigests.size !== 1) throw new Error('all blockout candidates must be compared against one exact R03 signature set');

  const selectedId = assertId(selectedCandidateId, 'selectedCandidateId');
  const candidateById = new Map(normalizedCandidates.map((candidate) => [candidate.id, candidate]));
  const selected = candidateById.get(selectedId);
  if (!selected) throw new Error('selected blockout candidate is unknown');
  if (selected.spatialClassification.classification !== 'NO_PLANAR_COLLAPSE') {
    throw new Error('selected volumetric blockout candidate must have VC03 NO_PLANAR_COLLAPSE');
  }

  if (!Array.isArray(selectionReasons) || !selectionReasons.length) throw new Error('blockout selection requires typed reasons');
  const normalizedSelectionReasons = selectionReasons.map((reason, index) => normalizeReason(reason, 'selectionReasons[' + index + ']', candidateById));
  if (!normalizedSelectionReasons.some((reason) => reason.kind === 'r03-signature')) throw new Error('blockout selection must cite R03 signature evidence');
  if (!normalizedSelectionReasons.some((reason) => reason.kind === 'vc03-classification')) throw new Error('blockout selection must cite VC03 classification evidence');
  const rejectedIds = new Set(normalizedCandidates.map((candidate) => candidate.id).filter((id) => id !== selectedId));
  const normalizedRejections = normalizeRejections(rejections, rejectedIds, candidateById);
  const refs = strings(evidenceRefs, 'evidenceRefs', true);

  const payload = {
    schema: BLOCKOUT_COMPETITION_DECISION_SCHEMA,
    sourceSha256: policy.sourceSha256,
    hierarchyDigest: policy.hierarchyDigest,
    scopeId: scope,
    scopeLevel: node.level,
    policyDigest: policy.policyDigest,
    hypothesisSetDigest: hypothesisSet.hypothesisSetDigest,
    roleAuthorityDigest: assertDigest(roleAuthority.authorityDigest, 'roleAuthority.authorityDigest'),
    frozenRole: roleAuthority.selectedExpectation.role,
    minimumCandidates: policy.minimumCandidates,
    candidates: normalizedCandidates,
    selectedCandidateId: selectedId,
    selectedAssetSha256: selected.assetSha256,
    selectedHypothesisId: selected.hypothesisId,
    selectionReasons: normalizedSelectionReasons,
    rejectedCandidateIds: [...rejectedIds].sort(),
    rejections: normalizedRejections,
    evidenceRefs: refs,
    policy: {
      exactCandidateBytesRequired: true,
      canonicalNeutralClayRequired: true,
      r03AndVc03TypedSelectionRequired: true,
      rejectedCandidatesRetained: true,
      cameraBeforeGeometryDistortion: true,
      aggregateResemblanceScoreForbidden: true,
      singleViewIouAuthority: false,
      multiviewIouAuthority: 'diagnostic-only',
      selectedCandidateMustAvoidPlanarCollapse: true,
      selectionDoesNotCertify: true,
    },
  };
  return deepFreeze({...payload, decisionDigest: digestJson(payload)});
}

export function validateBlockoutCompetitionDecision(record, {
  policy,
  hierarchy,
  hypothesisSet,
  roleAuthority,
  glbByCandidateId,
} = {}) {
  const errors = [];
  if (record?.schema !== BLOCKOUT_COMPETITION_DECISION_SCHEMA) errors.push('invalid schema');
  try {
    const lookup = glbByCandidateId instanceof Map ? glbByCandidateId : new Map(Object.entries(glbByCandidateId ?? {}));
    const candidates = (record?.candidates ?? []).map((candidate) => ({
      id: candidate.id,
      hypothesisId: candidate.hypothesisId,
      assetPath: candidate.assetPath,
      glb: lookup.get(candidate.id),
      signatureEvidence: candidate.signatureEvidence,
      clayRenderReport: candidate.clayRenderReport,
      spatialEvidence: candidate.spatialEvidence,
    }));
    const expected = createBlockoutCompetitionDecision({
      policy,
      hierarchy,
      scopeId: record?.scopeId,
      hypothesisSet,
      roleAuthority,
      candidates,
      selectedCandidateId: record?.selectedCandidateId,
      selectionReasons: (record?.selectionReasons ?? []).map(rawReason),
      rejections: (record?.rejections ?? []).map((rejection) => ({
        candidateId: rejection.candidateId,
        reasons: (rejection.reasons ?? []).map(rawReason),
      })),
      evidenceRefs: record?.evidenceRefs,
    });
    if (digestJson(expected) !== digestJson(record)) errors.push('blockout competition decision is stale, tampered, or non-canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

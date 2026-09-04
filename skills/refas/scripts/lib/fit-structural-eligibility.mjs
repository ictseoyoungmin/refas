import {assertDigest, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {validateAttachmentPropagationReport} from './attachment-propagation.mjs';
import {validatePhysicalFusionResult} from './physical-fusion.mjs';
import {validateRealizedContactResult} from './realized-contact.mjs';

export const FIT_STRUCTURAL_ELIGIBILITY_SCHEMA = 'refas.fit-structural-eligibility/v1';
export const FIT_STRUCTURAL_STAGES = Object.freeze(['attachment-propagation', 'physical-fusion', 'realized-contact']);

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function normalizeRequiredStages(values = []) {
  const stages = uniqueStrings(values);
  for (const stage of stages) if (!FIT_STRUCTURAL_STAGES.includes(stage)) throw new Error(`unknown structural eligibility stage: ${stage}`);
  return stages;
}

function stageCheck(stage, present, valid, pass, digest = null, status = null, reasons = []) {
  return {stage, present, valid, pass, digest, status, reasons: uniqueStrings(reasons)};
}

export function createFitStructuralEligibility({
  candidateGlb,
  requiredStages = [],
  propagation = null,
  physicalFusions = [],
  realizedContact = null,
  evidenceRefs = [],
} = {}) {
  const bytes = Buffer.from(candidateGlb ?? []);
  if (!bytes.length) throw new Error('candidateGlb is required for structural eligibility');
  const candidateAssetSha256 = digestBytes(bytes);
  const required = normalizeRequiredStages(requiredStages);
  if (!required.length) throw new Error('structural eligibility requires at least one structural stage');
  if (!required.includes('realized-contact')) throw new Error('structural eligibility requires realized-contact so required structural evidence is bound to the exact candidate GLB');
  const checks = [];
  const blockers = [];

  if (propagation) {
    const report = propagation.report;
    const validation = validateAttachmentPropagationReport(report, propagation.validation ?? {});
    const pass = validation.valid && report?.status === 'READY_FOR_REALIZATION' && report?.eligibleForRealization === true && (report?.blockers?.length ?? 0) === 0;
    const reasons = [...validation.errors, ...((report?.blockers ?? []).map((item) => `${item.code}:${item.entityId}`))];
    checks.push(stageCheck('attachment-propagation', true, validation.valid, pass, report?.reportDigest ?? null, report?.status ?? null, reasons));
    if (!pass) blockers.push('ATTACHMENT_PROPAGATION_BLOCKED');
  } else {
    const requiredHere = required.includes('attachment-propagation');
    checks.push(stageCheck('attachment-propagation', false, !requiredHere, !requiredHere, null, null, requiredHere ? ['required stage is missing'] : []));
    if (requiredHere) blockers.push('ATTACHMENT_PROPAGATION_MISSING');
  }

  if (physicalFusions.length) {
    let allValid = true, allPass = true;
    const digests = [];
    for (const [index, item] of physicalFusions.entries()) {
      const validation = validatePhysicalFusionResult(item?.result, item?.validation ?? {});
      const report = item?.result?.report;
      const pass = validation.valid && report?.status === 'BAKED' && report?.topology?.pass === true;
      if (!validation.valid) allValid = false;
      if (!pass) allPass = false;
      if (report?.reportDigest) digests.push(report.reportDigest);
      if (!pass) blockers.push(`PHYSICAL_FUSION_BLOCKED:${index}`);
    }
    checks.push(stageCheck('physical-fusion', true, allValid, allPass, digestJson(digests.sort()), allPass ? 'BAKED' : 'BLOCKED', allPass ? [] : ['one or more physical fusion results are not realizable']));
  } else {
    const requiredHere = required.includes('physical-fusion');
    checks.push(stageCheck('physical-fusion', false, !requiredHere, !requiredHere, null, null, requiredHere ? ['required stage is missing'] : []));
    if (requiredHere) blockers.push('PHYSICAL_FUSION_MISSING');
  }

  if (realizedContact) {
    const result = realizedContact.result;
    const validation = validateRealizedContactResult(result, realizedContact.validation ?? {});
    const report = result?.report;
    const assetPass = report?.assetSha256 === candidateAssetSha256 && result?.graph?.assetSha256 === candidateAssetSha256;
    const pass = validation.valid && assetPass && report?.status === 'PASS' && (report?.blockers?.length ?? 0) === 0 && (report?.unsupportedPhysicalEntityIds?.length ?? 0) === 0;
    const reasons = [...validation.errors];
    if (!assetPass) reasons.push('realized contact evidence does not bind the exact candidate GLB');
    reasons.push(...(report?.blockers ?? []));
    checks.push(stageCheck('realized-contact', true, validation.valid && assetPass, pass, report?.reportDigest ?? null, report?.status ?? null, reasons));
    if (!pass) blockers.push('REALIZED_CONTACT_BLOCKED');
  } else {
    const requiredHere = required.includes('realized-contact');
    checks.push(stageCheck('realized-contact', false, !requiredHere, !requiredHere, null, null, requiredHere ? ['required stage is missing'] : []));
    if (requiredHere) blockers.push('REALIZED_CONTACT_MISSING');
  }

  const normalizedBlockers = uniqueStrings(blockers);
  const payload = {
    schema: FIT_STRUCTURAL_ELIGIBILITY_SCHEMA,
    candidateAssetSha256,
    requiredStages: required,
    status: normalizedBlockers.length ? 'INELIGIBLE' : 'ELIGIBLE',
    eligible: normalizedBlockers.length === 0,
    blockers: normalizedBlockers,
    stageChecks: checks,
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      structuralInvalidityIsHardBarrier: true,
      structuralInvalidityIsNeverScorePenalty: true,
      visualMetricsCannotOverrideStructuralEligibility: true,
      exactCandidateBytesAreBound: true,
      artifactDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, eligibilityDigest: digestJson(payload)});
}

export function validateFitStructuralEligibility(value, candidateGlb = null) {
  const errors = [];
  try {
    if (value?.schema !== FIT_STRUCTURAL_ELIGIBILITY_SCHEMA) errors.push('invalid schema');
    assertDigest(value?.candidateAssetSha256, 'candidateAssetSha256');
    assertDigest(value?.eligibilityDigest, 'eligibilityDigest');
    const required = normalizeRequiredStages(value?.requiredStages ?? []);
    if (!required.length) errors.push('structural eligibility must bind at least one required stage');
    if (!required.includes('realized-contact')) errors.push('structural eligibility must require realized-contact to bind required structural evidence to the exact candidate GLB');
    if (digestJson(required) !== digestJson(value?.requiredStages ?? [])) errors.push('requiredStages are not canonical');
    if (!['ELIGIBLE', 'INELIGIBLE'].includes(value?.status)) errors.push('invalid status');
    if (value?.eligible !== (value?.status === 'ELIGIBLE')) errors.push('eligible does not match status');
    if (!Array.isArray(value?.stageChecks) || value.stageChecks.length !== FIT_STRUCTURAL_STAGES.length) errors.push('stageChecks must cover every structural stage exactly once');
    else {
      if (digestJson(value.stageChecks.map((item) => item.stage)) !== digestJson(FIT_STRUCTURAL_STAGES)) errors.push('stageChecks are not in canonical stage order');
      const byStage = new Map(value.stageChecks.map((item) => [item.stage, item]));
      for (const stage of required) {
        const check = byStage.get(stage);
        if (!check?.present || !check?.valid) errors.push(`required stage ${stage} does not have valid evidence`);
        if (value?.eligible && !check?.pass) errors.push(`eligible artifact has failing required stage ${stage}`);
      }
    }
    const blockers = uniqueStrings(value?.blockers ?? []);
    if (digestJson(blockers) !== digestJson(value?.blockers ?? [])) errors.push('blockers are not canonical');
    if (value?.eligible && blockers.length) errors.push('eligible artifact cannot contain blockers');
    if (!value?.eligible && !blockers.length) errors.push('ineligible artifact requires blockers');
    if (candidateGlb != null && digestBytes(Buffer.from(candidateGlb)) !== value.candidateAssetSha256) errors.push('structural eligibility does not bind the exact candidate GLB');
    const policy = value?.policy ?? {};
    if (!policy.structuralInvalidityIsHardBarrier || !policy.structuralInvalidityIsNeverScorePenalty || !policy.visualMetricsCannotOverrideStructuralEligibility || !policy.exactCandidateBytesAreBound || !policy.artifactDoesNotAuthorizeClosure) errors.push('structural eligibility policy is incomplete');
    const payload = structuredClone(value); delete payload.eligibilityDigest;
    if (digestJson(payload) !== value.eligibilityDigest) errors.push('eligibility digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

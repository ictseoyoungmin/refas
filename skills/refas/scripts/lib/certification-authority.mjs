import {createDefaultWholeObjectCertificationPolicy, validateCertificationPolicy} from './certification-policy.mjs';

function sameEvidenceSelector(left, right) {
  return (left?.role ?? null) === (right?.role ?? null) && (left?.schema ?? null) === (right?.schema ?? null);
}

function hasRequiredObligation(actualClaim, requiredObligation) {
  return (actualClaim?.obligations ?? []).some((actual) =>
    sameEvidenceSelector(actual, requiredObligation) && Number(actual.minCount ?? 1) >= Number(requiredObligation.minCount ?? 1));
}

function hasRequiredFindingSource(actualClaim, requiredSource) {
  return (actualClaim?.findingSources ?? []).some((actual) =>
    sameEvidenceSelector(actual, requiredSource) && actual.pointer === requiredSource.pointer);
}

export function validateWholeObjectPolicyAuthority(policy, {requiresRegisteredComparison = true} = {}) {
  const errors = [];
  const generic = validateCertificationPolicy(policy);
  if (!generic.valid) return {valid: false, errors: [...generic.errors]};

  const baseline = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison});
  for (const requiredClaim of baseline.claims) {
    const actualClaim = policy.claims.find((claim) => claim.id === requiredClaim.id);
    if (!actualClaim) {
      errors.push(`mandatory whole-object claim is missing: ${requiredClaim.id}`);
      continue;
    }
    if (actualClaim.required !== true) errors.push(`mandatory whole-object claim must remain required: ${requiredClaim.id}`);

    for (const obligation of requiredClaim.obligations) {
      if (!hasRequiredObligation(actualClaim, obligation)) {
        errors.push(`mandatory claim ${requiredClaim.id} weakens evidence obligation ${obligation.role ?? '*'} / ${obligation.schema ?? '*'}`);
      }
    }
    for (const source of requiredClaim.findingSources) {
      if (!hasRequiredFindingSource(actualClaim, source)) {
        errors.push(`mandatory claim ${requiredClaim.id} removes finding source ${source.role ?? '*'} ${source.pointer}`);
      }
    }
    for (const severity of requiredClaim.vetoSeverities) {
      if (!(actualClaim.vetoSeverities ?? []).includes(severity)) {
        errors.push(`mandatory claim ${requiredClaim.id} removes veto severity ${severity}`);
      }
    }
  }

  return {valid: errors.length === 0, errors};
}

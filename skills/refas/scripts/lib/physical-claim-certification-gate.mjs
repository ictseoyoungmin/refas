import {
  assessCertification as assessCertificationCore,
  assessClaimCertification as assessClaimCertificationCore,
  assessProjectionCertification,
  auditProject as auditProjectCore,
  certifyProject as certifyProjectCore,
  resumeProject as resumeProjectCore,
} from './certification-gate.mjs';
import {certificationContextConsumesPhysicalEvidence} from './physical-claim-certification.mjs';

const PROJECT_GATE_ERROR = 'physical readiness claims require evaluatePhysicalClaimCertification(...) with current live P10-P15 contexts before project-level certification';

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function guardClaimAssessment(assessment) {
  if (!assessment?.transaction || !assessment?.policy) return assessment;
  if (!certificationContextConsumesPhysicalEvidence(assessment.transaction, assessment.policy)) return assessment;
  return Object.freeze({
    ...assessment,
    valid: false,
    errors: unique([...(assessment.errors ?? []), PROJECT_GATE_ERROR]),
    decision: null,
    decisionSource: null,
  });
}

export async function assessClaimCertification(root) {
  return guardClaimAssessment(await assessClaimCertificationCore(root));
}

export async function assessCertification(root) {
  const [base, claims] = await Promise.all([
    assessCertificationCore(root),
    assessClaimCertification(root),
  ]);
  if (!claims?.required || claims.valid) return base;
  return Object.freeze({
    ...base,
    ready: false,
    errors: unique([...(base.errors ?? []), ...(claims.errors ?? [])]),
    claimDecisionDigest: null,
    authorizedClaimIds: [],
  });
}

export async function certifyProject(root) {
  const readiness = await assessCertification(root);
  if (!readiness.ready) throw new Error(`certification refused: ${readiness.errors.join('; ')}`);
  return certifyProjectCore(root);
}

export async function auditProject(root) {
  const [base, claims] = await Promise.all([
    auditProjectCore(root),
    assessClaimCertification(root),
  ]);
  if (!claims?.required || claims.valid) return base;
  return {
    ...base,
    valid: false,
    errors: unique([...(base.errors ?? []), ...(claims.errors ?? []).map((error) => `claim certification: ${error}`)]),
  };
}

export async function resumeProject(root) {
  const base = await resumeProjectCore(root);
  if (!['CERTIFY', 'DONE'].includes(base.nextAction)) return base;
  const claims = await assessClaimCertification(root);
  if (!claims?.required || claims.valid) return base;
  return {
    ...base,
    activeWork: {capability: 'whole-object-certification', scopeId: 'whole'},
    nextAction: 'REQUEST_CERTIFICATION_EVIDENCE',
    certificationErrors: claims.errors,
    reason: claims.errors[0],
  };
}

export {assessProjectionCertification};

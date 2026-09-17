import {digestJson} from '../../skills/refas/scripts/lib/index.mjs';
import {integratedFixtureEvidenceDigest} from './integrated-physical-fixture.mjs';

export function integratedFixtureClosureEvidenceDigest({
  construction,
  semanticProjection,
  encodedProjection,
  divergenceAuthorization,
  authoritySet,
  runtimeCertification,
} = {}) {
  if (!divergenceAuthorization?.authorizationDigest) throw new Error('P17 closure evidence requires an exact P15 divergence authorization');
  if (!authoritySet?.authoritySetDigest) throw new Error('P17 closure evidence requires the exact P15 semantic authority set');
  if (divergenceAuthorization.authorityBinding?.authoritySetDigest !== authoritySet.authoritySetDigest) {
    throw new Error('P17 closure evidence requires P15 authorization and authority set to bind each other exactly');
  }
  return digestJson({
    schema: 'refas.p17-integration-evidence/v1',
    baseIntegrationDigest: integratedFixtureEvidenceDigest({construction, semanticProjection, encodedProjection, runtimeCertification}),
    divergenceAuthorizationDigest: divergenceAuthorization.authorizationDigest,
    divergenceAuthoritySetDigest: authoritySet.authoritySetDigest,
    divergenceValidationDigest: divergenceAuthorization.validationBinding.validationDigest,
    runtimeEvidenceDigest: runtimeCertification.evidence.evidenceDigest,
    certificationDecisionDigest: digestJson(runtimeCertification.decision),
  });
}

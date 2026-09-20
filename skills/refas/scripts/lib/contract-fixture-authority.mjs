import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const CONTRACT_FIXTURE_AUTHORITY_SCHEMA = 'refas.contract-fixture-authority/v1';
export const RESERVED_CONTRACT_FIXTURE_ACQUISITIONS = Object.freeze([
  'test-fixture',
  'deterministic-project-fixture',
  'synthetic-test-fixture',
]);

const RESERVED = new Set(RESERVED_CONTRACT_FIXTURE_ACQUISITIONS);

export function isReservedContractFixtureAcquisition(kind) {
  return RESERVED.has(String(kind ?? '').toLowerCase());
}

export function assertPublicSourceAcquisition(acquisition) {
  const normalized = acquisition && typeof acquisition === 'object' ? structuredClone(acquisition) : {};
  const kind = String(normalized.kind ?? '').trim();
  if (kind && isReservedContractFixtureAcquisition(kind)) {
    throw new Error('contract fixture acquisition kinds are runtime-internal and cannot be supplied through public source binding');
  }
  return normalized;
}

export function createContractFixtureAuthority({sourceSha256, fixtureId, purpose = 'contract-testing-only'} = {}) {
  const core = {
    schema: CONTRACT_FIXTURE_AUTHORITY_SCHEMA,
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    fixtureId: assertId(fixtureId, 'fixtureId'),
    purpose: String(purpose ?? ''),
    issuer: 'refas-internal-contract-harness',
  };
  if (core.purpose !== 'contract-testing-only') throw new Error('contract fixture authority purpose must be contract-testing-only');
  return deepFreeze({...core, authorityDigest: digestJson(core)});
}

export function validateContractFixtureAuthority(authority, {sourceSha256 = null} = {}) {
  const errors = [];
  try {
    if (authority?.schema !== CONTRACT_FIXTURE_AUTHORITY_SCHEMA) errors.push('invalid contract fixture authority schema');
    const recreated = createContractFixtureAuthority({
      sourceSha256: authority?.sourceSha256,
      fixtureId: authority?.fixtureId,
      purpose: authority?.purpose,
    });
    if (recreated.authorityDigest !== authority?.authorityDigest) errors.push('contract fixture authority digest mismatch');
    if (sourceSha256 != null && recreated.sourceSha256 !== assertDigest(sourceSha256, 'sourceSha256')) {
      errors.push('contract fixture authority source digest mismatch');
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function isTrustedContractFixtureProject(state) {
  if (!state?.source || !state?.contractFixtureAuthority) return false;
  return validateContractFixtureAuthority(state.contractFixtureAuthority, {sourceSha256: state.source.sha256}).valid;
}

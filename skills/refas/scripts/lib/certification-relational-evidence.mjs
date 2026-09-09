import {assertDigest, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {validateRelationalStructure} from './relational-structure.mjs';
import {validateSemanticAuthoritySet, validateRelationalAuthorityCoverage} from './semantic-authority.mjs';
import {validateWholeSystemRelationalBarrier} from './whole-system-relational-barrier.mjs';
import {validateRelationalDiscrepancy} from './relational-discrepancy.mjs';

export const CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA = 'refas.certification-relational-evidence/v1';

function parseJsonBytes(bytes, label) {
  const buffer = Buffer.from(bytes ?? []);
  if (!buffer.length) throw new Error(`${label} bytes are required`);
  try {
    return {bytes: buffer, value: JSON.parse(buffer.toString('utf8'))};
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function artifactBinding(role, parsed, logicalDigest) {
  return {
    role,
    schema: String(parsed.value?.schema ?? ''),
    artifactSha256: digestBytes(parsed.bytes),
    sizeBytes: parsed.bytes.length,
    logicalDigest: assertDigest(logicalDigest, `${role}.logicalDigest`),
  };
}

function canonicalRelationChecks(checks = []) {
  return checks.map((check) => ({
    relationId: check.relationId,
    status: check.status,
    evidenceRefs: [...(check.evidenceRefs ?? [])].sort(),
  })).sort((a, b) => a.relationId.localeCompare(b.relationId));
}

function validateInputs({candidateAssetSha256, relationalStructureBytes, semanticAuthorityBytes, relationalBarrierBytes, relationalDiscrepancyBytes}) {
  const relationalStructure = parseJsonBytes(relationalStructureBytes, 'relational structure');
  const semanticAuthority = parseJsonBytes(semanticAuthorityBytes, 'semantic authority');
  const relationalBarrier = parseJsonBytes(relationalBarrierBytes, 'relational barrier');
  const relationalDiscrepancy = parseJsonBytes(relationalDiscrepancyBytes, 'relational discrepancy');

  const structureValidation = validateRelationalStructure(relationalStructure.value);
  if (!structureValidation.valid) throw new Error(`relational structure is invalid: ${structureValidation.errors.join('; ')}`);
  const authorityValidation = validateSemanticAuthoritySet(semanticAuthority.value);
  if (!authorityValidation.valid) throw new Error(`semantic authority set is invalid: ${authorityValidation.errors.join('; ')}`);
  const coverage = validateRelationalAuthorityCoverage(semanticAuthority.value, relationalStructure.value, {wholeSystemOnly: true});
  if (!coverage.valid) throw new Error(`semantic authority does not cover whole-system relations: ${coverage.errors.join('; ')}`);
  const barrierValidation = validateWholeSystemRelationalBarrier(relationalBarrier.value, {
    relationalStructure: relationalStructure.value,
    authoritySet: semanticAuthority.value,
  });
  if (!barrierValidation.valid) throw new Error(`whole-system relational barrier is invalid: ${barrierValidation.errors.join('; ')}`);
  const discrepancyValidation = validateRelationalDiscrepancy(relationalDiscrepancy.value);
  if (!discrepancyValidation.valid) throw new Error(`relational discrepancy is invalid: ${discrepancyValidation.errors.join('; ')}`);

  const candidate = assertDigest(candidateAssetSha256, 'candidateAssetSha256');
  if (relationalStructure.value.scopeId !== 'whole') throw new Error('certification relational evidence requires whole scope');
  if (semanticAuthority.value.scopeId !== 'whole' || relationalBarrier.value.scopeId !== 'whole' || relationalDiscrepancy.value.scopeId !== 'whole') {
    throw new Error('all certification relational artifacts must use whole scope');
  }
  if (relationalDiscrepancy.value.candidateAssetSha256 !== candidate) throw new Error('relational discrepancy does not bind the certification candidate');
  if (relationalBarrier.value.status !== 'PASS' || relationalBarrier.value.mayHardenLocal !== true) throw new Error('whole-system relational barrier must pass before certification');
  if (relationalDiscrepancy.value.status !== 'PASS' || relationalDiscrepancy.value.eligible !== true) throw new Error('candidate relational discrepancy must be eligible before certification');
  if (relationalBarrier.value.relationalStructureDigest !== relationalStructure.value.structureDigest || relationalDiscrepancy.value.relationalStructureDigest !== relationalStructure.value.structureDigest) {
    throw new Error('relational artifacts do not bind the same relational structure');
  }
  if (relationalBarrier.value.semanticAuthoritySetDigest !== semanticAuthority.value.authoritySetDigest) throw new Error('relational barrier does not bind the semantic authority set');
  if (relationalStructure.value.sourceSha256 !== semanticAuthority.value.sourceSha256 || relationalStructure.value.sourceSha256 !== relationalBarrier.value.sourceSha256 || relationalStructure.value.sourceSha256 !== relationalDiscrepancy.value.sourceSha256) {
    throw new Error('relational certification artifacts do not bind the same source');
  }
  if (digestJson(relationalBarrier.value.requiredRelationIds) !== digestJson(relationalDiscrepancy.value.requiredRelationIds)) throw new Error('barrier and discrepancy require different whole-system relations');
  if (digestJson(canonicalRelationChecks(relationalBarrier.value.relationChecks)) !== digestJson(canonicalRelationChecks(relationalDiscrepancy.value.checks))) {
    throw new Error('barrier relation checks do not reproduce from candidate-bound relational discrepancy');
  }

  return {candidate, relationalStructure, semanticAuthority, relationalBarrier, relationalDiscrepancy};
}

export function createCertificationRelationalEvidence(input = {}) {
  const parsed = validateInputs(input);
  const payload = {
    schema: CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA,
    scopeId: 'whole',
    sourceSha256: parsed.relationalStructure.value.sourceSha256,
    candidateAssetSha256: parsed.candidate,
    artifacts: {
      relationalStructure: artifactBinding('relational-structure', parsed.relationalStructure, parsed.relationalStructure.value.structureDigest),
      semanticAuthority: artifactBinding('semantic-authority', parsed.semanticAuthority, parsed.semanticAuthority.value.authoritySetDigest),
      relationalBarrier: artifactBinding('relational-barrier', parsed.relationalBarrier, parsed.relationalBarrier.value.barrierDigest),
      relationalDiscrepancy: artifactBinding('relational-discrepancy', parsed.relationalDiscrepancy, parsed.relationalDiscrepancy.value.discrepancyDigest),
    },
    requiredRelationIds: [...parsed.relationalDiscrepancy.value.requiredRelationIds],
    status: 'PASS',
    policy: {
      exactCandidateBytesAreRelationallyBound: true,
      exactRelationalArtifactBytesAreBound: true,
      semanticAuthorityMustCoverWholeSystemRelations: true,
      relationalBarrierMustPass: true,
      candidateRelationalDiscrepancyMustPass: true,
      barrierChecksMustReproduceFromCandidateDiscrepancy: true,
      relationalEvidenceCannotBeReplayedAcrossCandidates: true,
      relationalEvidenceCannotBeDowngradedToAVisualScore: true,
    },
  };
  return deepFreeze({...payload, relationalCertificationDigest: digestJson(payload)});
}

export function validateCertificationRelationalEvidence(value, context = {}) {
  const errors = [];
  try {
    if (value?.schema !== CERTIFICATION_RELATIONAL_EVIDENCE_SCHEMA) errors.push('invalid certification relational evidence schema');
    const recreated = createCertificationRelationalEvidence({
      candidateAssetSha256: context.candidateAssetSha256 ?? value?.candidateAssetSha256,
      relationalStructureBytes: context.relationalStructureBytes,
      semanticAuthorityBytes: context.semanticAuthorityBytes,
      relationalBarrierBytes: context.relationalBarrierBytes,
      relationalDiscrepancyBytes: context.relationalDiscrepancyBytes,
    });
    if (recreated.relationalCertificationDigest !== value?.relationalCertificationDigest) errors.push('certification relational evidence digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('certification relational evidence does not reproduce from exact artifact bytes');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

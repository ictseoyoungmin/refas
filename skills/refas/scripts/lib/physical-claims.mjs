import {Buffer} from 'node:buffer';

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {
  physicalAssetBundleIdentityProjection,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
} from './physical-asset-bundle.mjs';
import {
  validateCrossRepresentationValidation,
  validateCrossRepresentationValidationBindings,
} from './cross-representation-validator.mjs';
import {
  validateDivergenceAuthorization,
  validateDivergenceAuthorizationBindings,
} from './divergence-authorization.mjs';
import {createCertificationPolicy, evaluateCertificationPolicy} from './certification-policy.mjs';

export const PHYSICAL_CLAIM_EVIDENCE_SCHEMA = 'refas.physical-claim-evidence/v1';
export const PHYSICAL_CLAIM_BUNDLE_BINDING_SCHEMA = 'refas.physical-claim-bundle-binding/v1';
export const PHYSICAL_CLAIM_VALIDATION_BINDING_SCHEMA = 'refas.physical-claim-validation-binding/v1';
export const PHYSICAL_CLAIM_DIVERGENCE_BINDING_SCHEMA = 'refas.physical-claim-divergence-binding/v1';
export const PHYSICAL_CLAIM_IDS = Object.freeze([
  'articulated-ready',
  'simulation-ready',
  'control-ready',
  'runtime-ready',
]);

const CLAIM_SET = new Set(PHYSICAL_CLAIM_IDS);
const SOURCE_REPRESENTATION_OUTCOMES = new Set(['EQUIVALENT', 'LOSSY', 'DRIFT', 'UNRESOLVED', 'INVALID']);
const EFFECTIVE_REPRESENTATION_OUTCOMES = new Set([...SOURCE_REPRESENTATION_OUTCOMES, 'DECLARED_DIVERGENCE']);
const ACCEPTED_REPRESENTATION_OUTCOMES = new Set(['EQUIVALENT', 'DECLARED_DIVERGENCE']);
const COMPONENT_SCHEMA = Object.freeze({
  dynamics: 'refas.rigid-body-dynamics/v1',
  collision: 'refas.collision-model/v1',
  articulation: 'refas.articulation-graph/v1',
  mechanism: 'refas.mechanism-graph/v1',
  transmission: 'refas.transmission-model/v1',
  actuation: 'refas.actuation-model/v1',
  control: 'refas.control-profile/v1',
  runtime: 'refas.runtime-binding/v1',
});
const RELATION_KINDS_BY_CLAIM = Object.freeze({
  'articulated-ready': Object.freeze(['CONTAINS', 'CONNECTS']),
  'simulation-ready': Object.freeze(['CONTAINS', 'AGGREGATES_INTO', 'CONNECTS', 'REALIZES', 'MAPS', 'DRIVES']),
  'control-ready': Object.freeze(['CONTAINS', 'AGGREGATES_INTO', 'CONNECTS', 'REALIZES', 'MAPS', 'DRIVES', 'COMMANDS']),
  'runtime-ready': Object.freeze(['CONTAINS', 'AGGREGATES_INTO', 'CONNECTS', 'REALIZES', 'MAPS', 'DRIVES', 'COMMANDS', 'BINDS_RUNTIME']),
});
const POLICY = Object.freeze({
  canonicalPhysicalStateRemainsAuthoritative: true,
  physicalClaimsAreScopedAndOptIn: true,
  higherLevelRequirementsDoNotBackPropagate: true,
  visualSourceFidelityRemainsIndependent: true,
  p14FindingsRemainImmutableEvidence: true,
  p15DeclaredDivergenceRequiresLiveBindingValidation: true,
  onlyEquivalentOrDeclaredDivergenceSupportsRequiredRepresentation: true,
  missingApplicableSemanticsFailClosed: true,
  genericCertificationRemainsFinalClaimEvaluator: true,
  physicalClaimEvidenceDoesNotMutateConstructionOrBackendState: true,
});
const TOP_LEVEL_KEYS = new Set([
  'schema','evidenceId','claimId','scopeId','sourceSha256','bundleBinding','validationBinding','divergenceBinding',
  'requirements','representationChecks','findings','status','policy','evidenceDigest',
]);
const BUNDLE_BINDING_KEYS = new Set(['schema','bundleId','rootModuleId','projectionDigest']);
const VALIDATION_BINDING_KEYS = new Set(['schema','validationId','backend','projectionDigest']);
const DIVERGENCE_BINDING_KEYS = new Set(['schema','authorizationId','projectionDigest']);
const REQUIREMENT_KEYS = new Set([
  'requirementId','kind','domain','identityKind','componentSchema','subjectIds','componentIds','missingSubjectIds','status',
]);
const CHECK_KEYS = new Set(['obligationId','semanticPath','subjectIds','sourceOutcome','effectiveOutcome','status']);
const FINDING_KEYS = new Set([
  'findingId','category','severity','blocking','summary','requirementId','obligationId','semanticPath','subjectIds','sourceOutcome','effectiveOutcome',
]);
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}
function text(value, label, {maxLength = 2048} = {}) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || value.length > maxLength) {
    throw new Error(`${label} must be a trimmed non-empty string up to ${maxLength} characters`);
  }
  if (CONTROL_RE.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}
function ids(value, label, {allowEmpty = false} = {}) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length)) throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  const result = value.map((item, index) => assertId(item, `${label}[${index}]`)).sort();
  if (new Set(result).size !== result.length) throw new Error(`${label} must contain unique IDs`);
  return result;
}
function sameJson(left, right) { return digestJson(left) === digestJson(right); }
function claimId(value) {
  const id = text(value, 'claimId', {maxLength: 64});
  if (!CLAIM_SET.has(id)) throw new Error(`claimId must be one of: ${PHYSICAL_CLAIM_IDS.join(', ')}`);
  return id;
}
function status(value, label) {
  const normalized = text(value, label, {maxLength: 16}).toUpperCase();
  if (!['PASS','FAIL','BLOCKING','DISCLOSED'].includes(normalized)) throw new Error(`${label} has unsupported status ${normalized}`);
  return normalized;
}
function representationOutcome(value, label, allowed) {
  const normalized = text(value, label, {maxLength: 32}).toUpperCase();
  if (!allowed.has(normalized)) throw new Error(`${label} is not a P14/P15 representation outcome`);
  return normalized;
}
function intersects(left, rightSet) { return left.some((value) => rightSet.has(value)); }
function unique(values) { return [...new Set(values.filter((value) => value != null))].sort(); }

export function physicalClaimEvidenceRole(value) {
  return assertId(`physical-claim-${claimId(value)}`, 'physical claim evidence role');
}

function stableObligationSource(source) {
  if (source?.kind === 'IDENTITY') return {kind: 'IDENTITY'};
  if (source?.kind === 'COMPONENT') {
    return {
      kind: 'COMPONENT',
      componentId: assertId(source.componentId, 'obligation source componentId'),
      schema: text(source.schema, 'obligation source schema', {maxLength: 160}),
    };
  }
  throw new Error('physical claim obligation source must be IDENTITY or COMPONENT');
}

export function physicalClaimObligationId(obligation) {
  const semanticPath = text(obligation?.semanticPath, 'semanticPath', {maxLength: 160});
  const subjectIds = ids(obligation?.subjectIds, 'subjectIds');
  const source = stableObligationSource(obligation?.source);
  return assertId(
    `physical-claim-obligation:${digestJson({source, semanticPath, subjectIds}).slice(0, 48)}`,
    'physical claim obligationId',
  );
}

function claimObligationIdFromP11(p11ObligationId, obligationById) {
  const obligation = obligationById.get(p11ObligationId);
  if (!obligation) throw new Error(`P16 cannot resolve claim-scoped P11 obligation ${p11ObligationId}`);
  return physicalClaimObligationId(obligation);
}

function identityKinds(projection) {
  const result = new Map();
  for (const entity of projection.entities ?? []) {
    if (!result.has(entity.kind)) result.set(entity.kind, []);
    result.get(entity.kind).push(entity.id);
  }
  for (const values of result.values()) values.sort();
  return result;
}

function componentCoverage(contract) {
  switch (contract.schema) {
    case COMPONENT_SCHEMA.dynamics:
    case COMPONENT_SCHEMA.collision:
      return unique((contract.links ?? []).map((item) => item.linkId));
    case COMPONENT_SCHEMA.articulation:
      return unique((contract.joints ?? []).map((item) => item.virtualJointId));
    case COMPONENT_SCHEMA.mechanism:
      return unique((contract.mechanisms ?? []).map((item) => item.mechanismId));
    case COMPONENT_SCHEMA.transmission:
      return unique((contract.transmissions ?? []).map((item) => item.transmissionId));
    case COMPONENT_SCHEMA.actuation:
      return unique((contract.actuators ?? []).map((item) => item.actuatorId));
    case COMPONENT_SCHEMA.control:
      return unique((contract.profiles ?? []).flatMap((item) => [item.selector?.controllerId, item.selector?.actuatorId]));
    case COMPONENT_SCHEMA.runtime:
      return unique((contract.bindings ?? []).flatMap((item) => [item.selector?.runtimeEndpointId, item.selector?.targetId]));
    default:
      return [];
  }
}

function identityPresenceRequirement(id, kind, available) {
  const subjectIds = [...(available.get(kind) ?? [])].sort();
  return {
    requirementId: assertId(`${id}:identity:${kind}`, 'requirementId'),
    kind: 'IDENTITY_PRESENCE',
    domain: kind,
    identityKind: kind,
    componentSchema: null,
    subjectIds,
    componentIds: [],
    missingSubjectIds: subjectIds.length ? [] : [assertId(`missing-${kind}`, 'missing identity sentinel')],
    status: subjectIds.length ? 'PASS' : 'FAIL',
  };
}

function componentRequirement(id, domain, identityKind, subjectIds, schema, components) {
  const required = unique(subjectIds);
  const candidates = components.filter((item) => item.contract?.schema === schema);
  const covered = new Set(candidates.flatMap((item) => componentCoverage(item.contract)));
  const missing = required.filter((subjectId) => !covered.has(subjectId));
  const relevantComponentIds = candidates
    .filter((item) => intersects(componentCoverage(item.contract), new Set(required)))
    .map((item) => item.componentId)
    .sort();
  return {
    requirementId: assertId(`${id}:component:${domain}`, 'requirementId'),
    kind: 'COMPONENT_COVERAGE',
    domain,
    identityKind,
    componentSchema: schema,
    subjectIds: required,
    componentIds: relevantComponentIds,
    missingSubjectIds: missing,
    status: required.length > 0 && missing.length === 0 ? 'PASS' : 'FAIL',
  };
}

function deriveRequirements(id, projection, components) {
  const kinds = identityKinds(projection);
  const rigidLinks = kinds.get('rigid-link') ?? [];
  const joints = kinds.get('virtual-joint') ?? [];
  const mechanisms = kinds.get('mechanism') ?? [];
  const transmissions = kinds.get('transmission') ?? [];
  const actuators = kinds.get('actuator') ?? [];
  const controllers = kinds.get('controller') ?? [];
  const runtimeEndpoints = kinds.get('runtime-endpoint') ?? [];
  const requirements = [];
  const add = (item) => { if (!requirements.some((existing) => existing.requirementId === item.requirementId)) requirements.push(item); };
  const addComponent = (domain, kind, subjects, schema) => { if (subjects.length) add(componentRequirement(id, domain, kind, subjects, schema, components)); };

  if (id === 'articulated-ready') {
    add(identityPresenceRequirement(id, 'virtual-joint', kinds));
    addComponent('articulation', 'virtual-joint', joints, COMPONENT_SCHEMA.articulation);
  } else {
    add(identityPresenceRequirement(id, 'rigid-link', kinds));
    addComponent('dynamics', 'rigid-link', rigidLinks, COMPONENT_SCHEMA.dynamics);
    addComponent('collision', 'rigid-link', rigidLinks, COMPONENT_SCHEMA.collision);
    addComponent('articulation', 'virtual-joint', joints, COMPONENT_SCHEMA.articulation);
    addComponent('mechanism', 'mechanism', mechanisms, COMPONENT_SCHEMA.mechanism);
    addComponent('transmission', 'transmission', transmissions, COMPONENT_SCHEMA.transmission);
    addComponent('actuation', 'actuator', actuators, COMPONENT_SCHEMA.actuation);

    if (id === 'control-ready' || id === 'runtime-ready') {
      add(identityPresenceRequirement(id, 'actuator', kinds));
      add(identityPresenceRequirement(id, 'controller', kinds));
      addComponent('actuation', 'actuator', actuators, COMPONENT_SCHEMA.actuation);
      addComponent('control', 'controller', [...controllers, ...actuators], COMPONENT_SCHEMA.control);
    }
    if (id === 'runtime-ready') {
      add(identityPresenceRequirement(id, 'runtime-endpoint', kinds));
      addComponent('runtime', 'runtime-endpoint', runtimeEndpoints, COMPONENT_SCHEMA.runtime);
    }
  }
  return requirements.sort((a, b) => a.requirementId.localeCompare(b.requirementId));
}

function activeEntityIds(requirements) {
  return new Set(requirements.flatMap((item) => item.subjectIds));
}
function activeRelationIds(projection, entities, id) {
  const allowedKinds = new Set(RELATION_KINDS_BY_CLAIM[id] ?? []);
  return new Set((projection.relations ?? [])
    .filter((relation) => allowedKinds.has(relation.kind))
    .filter((relation) => entities.has(relation.sourceId) || relation.targetIds.some((identityId) => entities.has(identityId)))
    .map((relation) => relation.id));
}
function requiredComponentIds(requirements) {
  return new Set(requirements.filter((item) => item.kind === 'COMPONENT_COVERAGE').flatMap((item) => item.componentIds));
}

function bundleProjection(bundle, projection, requirements, id) {
  const entityIds = activeEntityIds(requirements), relationIds = activeRelationIds(projection, entityIds, id), componentIds = requiredComponentIds(requirements);
  return {
    schema: 'refas.physical-claim-bundle-projection/v1',
    scopeId: bundle.scopeId,
    sourceSha256: bundle.sourceSha256,
    rootModuleId: bundle.rootModuleId,
    entities: (projection.entities ?? []).filter((item) => entityIds.has(item.id)).map((item) => structuredClone(item)).sort((a,b)=>a.id.localeCompare(b.id)),
    relations: (projection.relations ?? []).filter((item) => relationIds.has(item.id)).map((item) => structuredClone(item)).sort((a,b)=>a.id.localeCompare(b.id)),
    componentRefs: bundle.componentRefs.filter((item) => componentIds.has(item.componentId)).map((item) => structuredClone(item)).sort((a,b)=>a.componentId.localeCompare(b.componentId)),
  };
}

function relevantObligations(capacityProfile, requirements, projection, id) {
  const componentIds = requiredComponentIds(requirements), entityIds = activeEntityIds(requirements), relationIds = activeRelationIds(projection, entityIds, id);
  return capacityProfile.obligations.filter((obligation) => {
    if (obligation.source?.kind === 'COMPONENT') return componentIds.has(obligation.source.componentId);
    if (obligation.source?.kind !== 'IDENTITY') return false;
    if (['identity.entity','frame.transform'].includes(obligation.semanticPath)) return intersects(obligation.subjectIds, entityIds);
    if (['identity.relation','composition.contains'].includes(obligation.semanticPath)) return intersects(obligation.subjectIds, relationIds);
    return false;
  }).sort((a,b)=>physicalClaimObligationId(a).localeCompare(physicalClaimObligationId(b)));
}

function divergenceProjection(authorization, relevantFindings, obligationById) {
  if (!authorization) return null;
  const findingIds = new Set(relevantFindings.map((item) => item.findingId));
  const declarationById = new Map(authorization.declarations.map((item) => [item.declarationId, item]));
  const declared = authorization.resolutions
    .filter((item) => findingIds.has(item.findingId) && item.outcome === 'DECLARED_DIVERGENCE')
    .flatMap((resolution) => resolution.declarationIds.map((declarationId) => declarationById.get(declarationId)).filter(Boolean))
    .map((item) => ({
      obligationId: claimObligationIdFromP11(item.obligationId, obligationById),
      targetBackend: item.targetBackend,
      semanticPath: item.semanticPath,
      subjectIds: [...item.subjectIds].sort(),
      fieldPath: item.fieldPath,
      canonicalValue: structuredClone(item.canonicalValue),
      overrideValue: structuredClone(item.overrideValue),
      reason: item.reason,
      authority: 'engineered',
      authorityEntryDigest: assertDigest(item.authorityEntryDigest, 'P15 declaration authorityEntryDigest'),
    }))
    .sort((a,b)=>`${a.obligationId}:${a.fieldPath}`.localeCompare(`${b.obligationId}:${b.fieldPath}`));
  return declared.length ? {schema:'refas.physical-claim-divergence-projection/v1', declarations: declared} : null;
}

function validationProjection(validation, relevantFindings, effectiveByFinding, obligationById) {
  return {
    schema: 'refas.physical-claim-validation-projection/v1',
    backend: validation.capacityBinding.backend,
    findings: relevantFindings.map((item) => ({
      obligationId: claimObligationIdFromP11(item.obligationId, obligationById),
      semanticPath: item.semanticPath,
      subjectIds: [...item.subjectIds].sort(),
      sourceOutcome: item.outcome,
      effectiveOutcome: effectiveByFinding.get(item.findingId) ?? item.outcome,
      exportDisposition: item.exportDisposition,
      canonicalValue: structuredClone(item.canonicalValue),
      normalizedValue: structuredClone(item.normalizedValue),
      loss: item.loss == null ? null : structuredClone(item.loss),
    })).sort((a,b)=>a.obligationId.localeCompare(b.obligationId)),
  };
}

function representationChecks(relevantFindings, effectiveByFinding, obligationById) {
  return relevantFindings.map((finding) => {
    const effectiveOutcome = effectiveByFinding.get(finding.findingId) ?? finding.outcome;
    return {
      obligationId: claimObligationIdFromP11(finding.obligationId, obligationById),
      semanticPath: finding.semanticPath,
      subjectIds: [...finding.subjectIds].sort(),
      sourceOutcome: finding.outcome,
      effectiveOutcome,
      status: ACCEPTED_REPRESENTATION_OUTCOMES.has(effectiveOutcome) ? 'PASS' : 'BLOCKING',
    };
  }).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));
}

function findingIdFor(payload) {
  return assertId(`physical-claim-finding:${digestJson(payload).slice(0, 48)}`, 'findingId');
}
function findingsFor(requirements, checks) {
  const findings = [];
  for (const requirement of requirements.filter((item) => item.status !== 'PASS')) {
    const payload = {kind:'requirement', requirementId:requirement.requirementId, missingSubjectIds:requirement.missingSubjectIds};
    findings.push({
      findingId: findingIdFor(payload),
      category: requirement.kind === 'IDENTITY_PRESENCE' ? 'physical-claim-missing-identity' : 'physical-claim-missing-component-coverage',
      severity: 'blocking',
      blocking: true,
      summary: requirement.kind === 'IDENTITY_PRESENCE'
        ? `Required ${requirement.identityKind} identity is absent for this physical claim.`
        : `${requirement.domain} coverage is missing for: ${requirement.missingSubjectIds.join(', ')}.`,
      requirementId: requirement.requirementId,
      obligationId: null,
      semanticPath: null,
      subjectIds: [...requirement.missingSubjectIds],
      sourceOutcome: null,
      effectiveOutcome: null,
    });
  }
  for (const check of checks) {
    if (check.status === 'BLOCKING') {
      const payload = {kind:'representation', obligationId:check.obligationId, outcome:check.effectiveOutcome};
      findings.push({
        findingId: findingIdFor(payload),
        category: 'physical-claim-representation-blocker',
        severity: 'blocking',
        blocking: true,
        summary: `Required representation obligation ${check.semanticPath} is ${check.effectiveOutcome}.`,
        requirementId: null,
        obligationId: check.obligationId,
        semanticPath: check.semanticPath,
        subjectIds: [...check.subjectIds],
        sourceOutcome: check.sourceOutcome,
        effectiveOutcome: check.effectiveOutcome,
      });
    } else if (check.effectiveOutcome === 'DECLARED_DIVERGENCE') {
      const payload = {kind:'declared-divergence', obligationId:check.obligationId};
      findings.push({
        findingId: findingIdFor(payload),
        category: 'physical-claim-declared-divergence',
        severity: 'minor',
        blocking: false,
        summary: `Required representation obligation ${check.semanticPath} uses a live declared divergence.`,
        requirementId: null,
        obligationId: check.obligationId,
        semanticPath: check.semanticPath,
        subjectIds: [...check.subjectIds],
        sourceOutcome: check.sourceOutcome,
        effectiveOutcome: check.effectiveOutcome,
      });
    }
  }
  return findings.sort((a,b)=>a.findingId.localeCompare(b.findingId));
}

function bundleBinding(bundle, projection) {
  return {schema:PHYSICAL_CLAIM_BUNDLE_BINDING_SCHEMA,bundleId:bundle.bundleId,rootModuleId:bundle.rootModuleId,projectionDigest:digestJson(projection)};
}
function validationBinding(validation, projection) {
  return {schema:PHYSICAL_CLAIM_VALIDATION_BINDING_SCHEMA,validationId:validation.validationId,backend:validation.capacityBinding.backend,projectionDigest:digestJson(projection)};
}
function divergenceBinding(authorization, projection) {
  if (!projection) return null;
  return {schema:PHYSICAL_CLAIM_DIVERGENCE_BINDING_SCHEMA,authorizationId:authorization.authorizationId,projectionDigest:digestJson(projection)};
}

async function validateLiveInputs({bundle,identityGraph,components,validation,capacityProfile,manifest,files,normalizedRepresentation,normalizer}) {
  const bundleIntrinsic = validatePhysicalAssetBundle(bundle);
  if (!bundleIntrinsic.valid) throw new Error(`physical asset bundle is invalid: ${bundleIntrinsic.errors.join('; ')}`);
  const bundleLive = validatePhysicalAssetBundleBindings(bundle,{identityGraph,components});
  if (!bundleLive.valid) throw new Error(`physical asset bundle is not live: ${bundleLive.errors.join('; ')}`);
  const validationIntrinsic = validateCrossRepresentationValidation(validation);
  if (!validationIntrinsic.valid) throw new Error(`P14 validation is invalid: ${validationIntrinsic.errors.join('; ')}`);
  const validationLive = await validateCrossRepresentationValidationBindings(validation,{capacityProfile,manifest,files,normalizedRepresentation,normalizer,bundle,identityGraph,components});
  if (!validationLive.valid) throw new Error(`P14 validation is not live: ${validationLive.errors.join('; ')}`);
  if (validation.scopeId !== bundle.scopeId || bundle.sourceSha256 !== identityGraph?.sourceSha256) throw new Error('P16 scope/source must match live P10/P01 inputs');
}

export async function createPhysicalClaimEvidence({
  evidenceId,
  claimId: requestedClaimId,
  bundle,
  identityGraph,
  components = [],
  validation,
  capacityProfile,
  manifest,
  files,
  normalizedRepresentation,
  normalizer,
  divergenceAuthorization = null,
  authoritySet = null,
} = {}) {
  const id = claimId(requestedClaimId);
  await validateLiveInputs({bundle,identityGraph,components,validation,capacityProfile,manifest,files,normalizedRepresentation,normalizer});
  const projection = physicalAssetBundleIdentityProjection(identityGraph,bundle.rootModuleId);
  const requirements = deriveRequirements(id,projection,components);
  const obligations = relevantObligations(capacityProfile,requirements,projection,id);
  const obligationById = new Map(obligations.map((item) => [item.obligationId,item]));
  const obligationIds = new Set(obligationById.keys());
  const relevantFindings = validation.findings.filter((item) => obligationIds.has(item.obligationId));
  if (relevantFindings.length !== obligations.length) throw new Error('P16 relevant P14 findings do not cover every claim-scoped P11 obligation');

  const relevantDrift = relevantFindings.some((item) => item.outcome === 'DRIFT');
  let activeAuthorization = null;
  if (relevantDrift && divergenceAuthorization != null) {
    const intrinsic = validateDivergenceAuthorization(divergenceAuthorization);
    if (!intrinsic.valid) throw new Error(`P15 divergence authorization is invalid: ${intrinsic.errors.join('; ')}`);
    if (!authoritySet) throw new Error('P16 requires the exact P15 semantic authority set when a divergence authorization is used');
    const live = await validateDivergenceAuthorizationBindings(divergenceAuthorization,{
      validation,authoritySet,capacityProfile,manifest,files,normalizedRepresentation,normalizer,bundle,identityGraph,components,
    });
    if (!live.valid) throw new Error(`P15 divergence authorization is not live: ${live.errors.join('; ')}`);
    activeAuthorization = divergenceAuthorization;
  }
  const resolutionByFinding = new Map((activeAuthorization?.resolutions ?? []).map((item) => [item.findingId,item.outcome]));
  const effectiveByFinding = new Map(relevantFindings.map((item) => [item.findingId,resolutionByFinding.get(item.findingId) ?? item.outcome]));
  const checks = representationChecks(relevantFindings,effectiveByFinding,obligationById);
  const findings = findingsFor(requirements,checks);
  const claimBundleProjection = bundleProjection(bundle,projection,requirements,id);
  const claimValidationProjection = validationProjection(validation,relevantFindings,effectiveByFinding,obligationById);
  const claimDivergenceProjection = divergenceProjection(activeAuthorization,relevantFindings,obligationById);
  const claimStatus = requirements.every((item) => item.status === 'PASS') && checks.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
  const payload = {
    schema: PHYSICAL_CLAIM_EVIDENCE_SCHEMA,
    evidenceId: assertId(evidenceId,'evidenceId'),
    claimId: id,
    scopeId: bundle.scopeId,
    sourceSha256: bundle.sourceSha256,
    bundleBinding: bundleBinding(bundle,claimBundleProjection),
    validationBinding: validationBinding(validation,claimValidationProjection),
    divergenceBinding: divergenceBinding(activeAuthorization,claimDivergenceProjection),
    requirements,
    representationChecks: checks,
    findings,
    status: claimStatus,
    policy: {...POLICY},
  };
  return deepFreeze({...payload,evidenceDigest:digestJson(payload)});
}

function normalizeBundleBinding(raw) {
  assertKnownKeys(raw,BUNDLE_BINDING_KEYS,'bundleBinding');
  if (raw.schema !== PHYSICAL_CLAIM_BUNDLE_BINDING_SCHEMA) throw new Error(`bundleBinding.schema must be ${PHYSICAL_CLAIM_BUNDLE_BINDING_SCHEMA}`);
  return {schema:raw.schema,bundleId:assertId(raw.bundleId,'bundleBinding.bundleId'),rootModuleId:assertId(raw.rootModuleId,'bundleBinding.rootModuleId'),projectionDigest:assertDigest(raw.projectionDigest,'bundleBinding.projectionDigest')};
}
function normalizeValidationBinding(raw) {
  assertKnownKeys(raw,VALIDATION_BINDING_KEYS,'validationBinding');
  if (raw.schema !== PHYSICAL_CLAIM_VALIDATION_BINDING_SCHEMA) throw new Error(`validationBinding.schema must be ${PHYSICAL_CLAIM_VALIDATION_BINDING_SCHEMA}`);
  return {schema:raw.schema,validationId:assertId(raw.validationId,'validationBinding.validationId'),backend:text(raw.backend,'validationBinding.backend',{maxLength:256}),projectionDigest:assertDigest(raw.projectionDigest,'validationBinding.projectionDigest')};
}
function normalizeDivergenceBinding(raw) {
  if (raw == null) return null;
  assertKnownKeys(raw,DIVERGENCE_BINDING_KEYS,'divergenceBinding');
  if (raw.schema !== PHYSICAL_CLAIM_DIVERGENCE_BINDING_SCHEMA) throw new Error(`divergenceBinding.schema must be ${PHYSICAL_CLAIM_DIVERGENCE_BINDING_SCHEMA}`);
  return {schema:raw.schema,authorizationId:assertId(raw.authorizationId,'divergenceBinding.authorizationId'),projectionDigest:assertDigest(raw.projectionDigest,'divergenceBinding.projectionDigest')};
}
function normalizeRequirement(raw,index) {
  const label=`requirements[${index}]`;assertKnownKeys(raw,REQUIREMENT_KEYS,label);
  const kind=text(raw.kind,`${label}.kind`,{maxLength:32}).toUpperCase();if(!['IDENTITY_PRESENCE','COMPONENT_COVERAGE'].includes(kind))throw new Error(`${label}.kind is invalid`);
  const result={requirementId:assertId(raw.requirementId,`${label}.requirementId`),kind,domain:text(raw.domain,`${label}.domain`,{maxLength:96}),identityKind:raw.identityKind==null?null:text(raw.identityKind,`${label}.identityKind`,{maxLength:96}),componentSchema:raw.componentSchema==null?null:text(raw.componentSchema,`${label}.componentSchema`,{maxLength:160}),subjectIds:ids(raw.subjectIds,`${label}.subjectIds`,{allowEmpty:true}),componentIds:ids(raw.componentIds,`${label}.componentIds`,{allowEmpty:true}),missingSubjectIds:ids(raw.missingSubjectIds,`${label}.missingSubjectIds`,{allowEmpty:true}),status:status(raw.status,`${label}.status`)};
  const expected = kind === 'IDENTITY_PRESENCE' ? (result.subjectIds.length ? 'PASS' : 'FAIL') : (result.subjectIds.length && result.missingSubjectIds.length===0 ? 'PASS' : 'FAIL');
  if(result.status!==expected)throw new Error(`${label}.status must reproduce from requirement coverage`);return result;
}
function normalizeCheck(raw,index){const label=`representationChecks[${index}]`;assertKnownKeys(raw,CHECK_KEYS,label);const effective=representationOutcome(raw.effectiveOutcome,`${label}.effectiveOutcome`,EFFECTIVE_REPRESENTATION_OUTCOMES),source=representationOutcome(raw.sourceOutcome,`${label}.sourceOutcome`,SOURCE_REPRESENTATION_OUTCOMES),expected=ACCEPTED_REPRESENTATION_OUTCOMES.has(effective)?'PASS':'BLOCKING',normalizedStatus=status(raw.status,`${label}.status`);if(normalizedStatus!==expected)throw new Error(`${label}.status must reproduce from effectiveOutcome`);if(effective==='DECLARED_DIVERGENCE'&&source!=='DRIFT')throw new Error(`${label}.DECLARED_DIVERGENCE must originate from P14 DRIFT`);if(effective!=='DECLARED_DIVERGENCE'&&effective!==source)throw new Error(`${label}.effectiveOutcome may differ from sourceOutcome only for DECLARED_DIVERGENCE`);return{obligationId:assertId(raw.obligationId,`${label}.obligationId`),semanticPath:text(raw.semanticPath,`${label}.semanticPath`,{maxLength:160}),subjectIds:ids(raw.subjectIds,`${label}.subjectIds`),sourceOutcome:source,effectiveOutcome:effective,status:normalizedStatus};}
function normalizeFinding(raw,index){const label=`findings[${index}]`;assertKnownKeys(raw,FINDING_KEYS,label);return{findingId:assertId(raw.findingId,`${label}.findingId`),category:text(raw.category,`${label}.category`,{maxLength:128}),severity:text(raw.severity,`${label}.severity`,{maxLength:32}).toLowerCase(),blocking:raw.blocking===true,summary:text(raw.summary,`${label}.summary`),requirementId:raw.requirementId==null?null:assertId(raw.requirementId,`${label}.requirementId`),obligationId:raw.obligationId==null?null:assertId(raw.obligationId,`${label}.obligationId`),semanticPath:raw.semanticPath==null?null:text(raw.semanticPath,`${label}.semanticPath`,{maxLength:160}),subjectIds:ids(raw.subjectIds,`${label}.subjectIds`,{allowEmpty:true}),sourceOutcome:raw.sourceOutcome==null?null:representationOutcome(raw.sourceOutcome,`${label}.sourceOutcome`,SOURCE_REPRESENTATION_OUTCOMES),effectiveOutcome:raw.effectiveOutcome==null?null:representationOutcome(raw.effectiveOutcome,`${label}.effectiveOutcome`,EFFECTIVE_REPRESENTATION_OUTCOMES)};}
function normalizePolicy(raw){assertKnownKeys(raw,new Set(Object.keys(POLICY)),'policy');if(!sameJson(raw,POLICY))throw new Error('policy must equal canonical P16 policy');return{...POLICY};}
function normalizePersisted(value){assertKnownKeys(value,TOP_LEVEL_KEYS,'physical claim evidence');if(value.schema!==PHYSICAL_CLAIM_EVIDENCE_SCHEMA)throw new Error(`schema must be ${PHYSICAL_CLAIM_EVIDENCE_SCHEMA}`);const requirements=(value.requirements??[]).map(normalizeRequirement).sort((a,b)=>a.requirementId.localeCompare(b.requirementId));if(!requirements.length)throw new Error('requirements must be non-empty');if(new Set(requirements.map((item)=>item.requirementId)).size!==requirements.length)throw new Error('requirements contain duplicate IDs');const checks=(value.representationChecks??[]).map(normalizeCheck).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));if(new Set(checks.map((item)=>item.obligationId)).size!==checks.length)throw new Error('representationChecks contain duplicate obligation IDs');const findings=(value.findings??[]).map(normalizeFinding).sort((a,b)=>a.findingId.localeCompare(b.findingId));const expectedFindings=findingsFor(requirements,checks);if(!sameJson(findings,expectedFindings))throw new Error('findings do not reproduce from requirements and representation checks');const expectedStatus=requirements.every((item)=>item.status==='PASS')&&checks.every((item)=>item.status==='PASS')?'PASS':'FAIL';const persistedStatus=status(value.status,'status');if(persistedStatus!==expectedStatus)throw new Error('status does not reproduce from requirements and representation checks');const payload={schema:value.schema,evidenceId:assertId(value.evidenceId,'evidenceId'),claimId:claimId(value.claimId),scopeId:assertId(value.scopeId,'scopeId'),sourceSha256:assertDigest(value.sourceSha256,'sourceSha256'),bundleBinding:normalizeBundleBinding(value.bundleBinding),validationBinding:normalizeValidationBinding(value.validationBinding),divergenceBinding:normalizeDivergenceBinding(value.divergenceBinding),requirements,representationChecks:checks,findings,status:persistedStatus,policy:normalizePolicy(value.policy)};const evidenceDigest=assertDigest(value.evidenceDigest,'evidenceDigest');if(digestJson(payload)!==evidenceDigest)throw new Error('evidenceDigest does not reproduce');return{...payload,evidenceDigest};}

export function validatePhysicalClaimEvidence(value){const errors=[];try{const normalized=normalizePersisted(value);if(!sameJson(normalized,value))errors.push('physical claim evidence is not canonical');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}

export async function validatePhysicalClaimEvidenceBindings(value,context={}){const errors=[],intrinsic=validatePhysicalClaimEvidence(value);if(!intrinsic.valid)errors.push(`physical claim evidence invalid: ${intrinsic.errors.join('; ')}`);try{if(!errors.length){const recreated=await createPhysicalClaimEvidence({evidenceId:value.evidenceId,claimId:value.claimId,...context});if(!sameJson(recreated,value))throw new Error('physical claim evidence is stale or does not reproduce from current claim-scoped P10-P15 evidence');}}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}

export function createPhysicalClaimCertificationPolicy({claimIds = PHYSICAL_CLAIM_IDS, id = 'physical-readiness-policy'} = {}) {
  if(!Array.isArray(claimIds)||!claimIds.length)throw new Error('claimIds must contain at least one physical claim');
  const normalized=claimIds.map((item)=>claimId(item));if(new Set(normalized).size!==normalized.length)throw new Error('claimIds must be unique');
  return createCertificationPolicy({id,claims:normalized.map((item)=>({id:item,description:`The exact candidate is supported by current live ${item} physical evidence.`,required:true,obligations:[{id:`${item}-evidence`,role:physicalClaimEvidenceRole(item),schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA,minCount:1}],findingSources:[{role:physicalClaimEvidenceRole(item),schema:PHYSICAL_CLAIM_EVIDENCE_SCHEMA,pointer:'/findings'}],vetoSeverities:['blocking','critical','major']}))});
}

function evidenceContext(contexts,id){if(contexts instanceof Map)return contexts.get(id);return contexts?.[id];}
function evidenceBytes(bytesById,id){if(bytesById instanceof Map)return bytesById.get(id);return bytesById?.[id];}

export async function evaluatePhysicalClaimCertification({transaction,policy,evidenceBytesById={},physicalClaimContextsByNodeId={}}={}){
  for(const node of transaction?.evidenceNodes??[]){
    if(node.schema!==PHYSICAL_CLAIM_EVIDENCE_SCHEMA)continue;
    const bytes=evidenceBytes(evidenceBytesById,node.id);if(bytes==null)throw new Error(`missing physical claim evidence bytes for ${node.id}`);
    let evidence;try{evidence=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new Error(`physical claim evidence ${node.id} is not valid JSON`);}
    if(node.role!==physicalClaimEvidenceRole(evidence.claimId))throw new Error(`physical claim evidence ${node.id} role does not match claimId ${evidence.claimId}`);
    const context=evidenceContext(physicalClaimContextsByNodeId,node.id);if(!context)throw new Error(`missing live physical claim context for ${node.id}`);
    const live=await validatePhysicalClaimEvidenceBindings(evidence,context);if(!live.valid)throw new Error(`physical claim evidence ${node.id} is not live: ${live.errors.join('; ')}`);
  }
  return evaluateCertificationPolicy({transaction,policy,evidenceBytesById});
}

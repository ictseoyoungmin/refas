import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  canonicalizeBackendRigidTransform,
  createCrossRepresentationValidation,
  createDivergenceAuthorization,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createSemanticAuthoritySet,
  deriveRepresentationCapacityObligations,
  digestJson,
  divergenceAuthoritySubjectId,
  runExportAdapter,
  runRepresentationNormalizer,
  validateDivergenceAuthorization,
  validateDivergenceAuthorizationBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const Z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function fixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0.1, -0.2, 0.3], rotation_quat_xyzw: Z90}},
    ],
    relations: [{id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']}],
  });
  const dynamics = createRigidBodyDynamics({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    links: [{linkId: 'link-a', referenceFrameId: 'link-a', mass: {value_kg: 2.5}, centerOfMass: {value_m: [0.01, -0.02, 0.03]}, inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}
function allSupportedProfile(context, profileId) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({profileId, backend: 'fixture-divergence', ...context, supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})), approximated: [], unsupported: [], blockers: []});
}
function identityEntity(view, subjects) { return view.identityProjection.entities.find((entity) => subjects.includes(entity.id)); }
function identityRelation(view, subjects) { return view.identityProjection.relations.find((relation) => subjects.includes(relation.id)); }
function semanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    if (obligation.semanticPath === 'identity.entity') { const entity = identityEntity(view, obligation.subjectIds); return {id: entity.id, kind: entity.kind}; }
    if (obligation.semanticPath === 'frame.transform') return identityEntity(view, obligation.subjectIds).frame;
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') return identityRelation(view, obligation.subjectIds);
    throw new Error(`unsupported identity path ${obligation.semanticPath}`);
  }
  const component = view.components.find((item) => item.componentId === obligation.source.componentId);
  const link = component.contract.links.find((item) => obligation.subjectIds.includes(item.linkId));
  if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
  if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
  if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  throw new Error(`unsupported component path ${obligation.semanticPath}`);
}
function encodedFrame(frame, translationOverride = null) {
  const q = frame.rotation_quat_xyzw, translation = translationOverride ?? frame.translation_m;
  return {parentId: frame.parentId, transform: {translation: translation.map((value) => value * 100), translationUnit: 'cm', rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-q[3], -q[0], -q[1], -q[2]]}}};
}
function fixtureExportAdapter({massOverride = undefined, frameTranslationOverride = null} = {}) {
  return {id: 'fixture-divergence-export', backend: 'fixture-divergence', version: '1', project({canonicalView, capacityProfile}) {
    const records = capacityProfile.obligations.map((obligation) => {
      let value = semanticValue(canonicalView, obligation);
      if (obligation.semanticPath === 'frame.transform') value = encodedFrame(value, frameTranslationOverride);
      if (obligation.semanticPath === 'dynamics.mass' && massOverride !== undefined) value = massOverride;
      return {obligationId: obligation.obligationId, value};
    });
    const path = 'fixture/divergence.json';
    return {artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({schema: 'fixture.divergence/v1', records})}\n`}], bindings: capacityProfile.obligations.map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: `record:${obligation.obligationId}`}]}))};
  }};
}
function fixtureNormalizer() {
  return {id: 'fixture-divergence-normalizer', backend: 'fixture-divergence', version: '1', implementationDigest: D('f'), normalize({manifest, obligations, artifacts}) {
    const artifact = artifacts.find((item) => item.path === 'fixture/divergence.json');
    const document = JSON.parse(Buffer.from(artifact.content).toString('utf8'));
    const records = new Map(document.records.map((item) => [item.obligationId, item]));
    const dispositionById = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
    const readings = [];
    for (const obligation of obligations) {
      const disposition = dispositionById.get(obligation.obligationId);
      let value = records.get(obligation.obligationId).value;
      if (obligation.semanticPath === 'frame.transform') value = {parentId: value.parentId, ...canonicalizeBackendRigidTransform(value.transform)};
      readings.push({obligationId: obligation.obligationId, sources: disposition.targets, value});
    }
    return {readings};
  }};
}
async function pipeline({massOverride = undefined, frameTranslationOverride = null, suffix = 'a'} = {}) {
  const context = fixture(), capacityProfile = allSupportedProfile(context, `profile-${suffix}`), normalizer = fixtureNormalizer();
  const exported = await runExportAdapter({exportId: `export-${suffix}`, adapter: fixtureExportAdapter({massOverride, frameTranslationOverride}), capacityProfile, ...context});
  const normalizedRepresentation = await runRepresentationNormalizer({normalizationId: `normalized-${suffix}`, normalizer, capacityProfile, manifest: exported.manifest, files: exported.files});
  const validation = await createCrossRepresentationValidation({validationId: `validation-${suffix}`, capacityProfile, manifest: exported.manifest, files: exported.files, normalizedRepresentation, normalizer, ...context});
  return {context, capacityProfile, normalizer, exported, normalizedRepresentation, validation};
}
function p14Context(data) { return {capacityProfile: data.capacityProfile, manifest: data.exported.manifest, files: data.exported.files, normalizedRepresentation: data.normalizedRepresentation, normalizer: data.normalizer, ...data.context}; }
function declarationFor(validation, finding, {fieldPath = '', canonicalValue = undefined, overrideValue = undefined, targetBackend = undefined, semanticPath = undefined, subjectIds = undefined, obligationId = undefined, reason = 'Backend-specific realization is required by the declared downstream target.'} = {}) {
  const at = (value, path) => { if (path === '') return structuredClone(value); let current = value; for (const raw of path.slice(1).split('/')) { const segment = raw.replaceAll('~1','/').replaceAll('~0','~'); current = current[Array.isArray(current) ? Number(segment) : segment]; } return structuredClone(current); };
  return {
    findingId: finding.findingId,
    obligationId: obligationId ?? finding.obligationId,
    targetBackend: targetBackend ?? validation.capacityBinding.backend,
    semanticPath: semanticPath ?? finding.semanticPath,
    subjectIds: subjectIds ?? [...finding.subjectIds],
    fieldPath,
    canonicalValue: canonicalValue === undefined ? at(finding.canonicalValue, fieldPath) : canonicalValue,
    overrideValue: overrideValue === undefined ? at(finding.normalizedValue, fieldPath) : overrideValue,
    reason,
  };
}
function authorityEntry(subjectId, authority, index) {
  if (authority === 'engineered') return {id: `divergence-authority-${index}`, subjectId, authority, proposition: 'The exact backend-specific override is authorized for the declared downstream target.', reason: 'The target backend requires an explicit construction choice that differs from canonical RefAs semantics.', basis: [{kind: 'downstream-requirement', ref: `backend-requirement:${index}`}]};
  if (authority === 'observed') return {id: `divergence-authority-${index}`, subjectId, authority, proposition: 'Source evidence is asserted for this override.', basis: [{kind: 'source-evidence', ref: `source:${index}`}]};
  if (authority === 'inferred') return {id: `divergence-authority-${index}`, subjectId, authority, proposition: 'The override is inferred.', reason: 'A structural prior suggests the override.', basis: [{kind: 'structural-prior', ref: `prior:${index}`}]};
  if (authority === 'forbidden') return {id: `divergence-authority-${index}`, subjectId, authority, proposition: 'The override is forbidden.', reason: 'A hard constraint prohibits this override.', basis: [{kind: 'hard-constraint', ref: `constraint:${index}`}]};
  return {id: `divergence-authority-${index}`, subjectId, authority: 'unknown', proposition: 'The override authority is unresolved.', reason: 'No defensible basis is available.', basis: []};
}
function authoritySetFor(data, declarations, authority = 'engineered') {
  const entries = declarations.map((declaration, index) => authorityEntry(divergenceAuthoritySubjectId(data.validation.validationDigest, declaration.findingId, declaration.fieldPath), authority, index));
  return createSemanticAuthoritySet({scopeId: data.validation.scopeId, sourceSha256: data.context.identityGraph.sourceSha256, targetSchema: data.validation.schema, targetDigest: data.validation.validationDigest, entries});
}
async function authorize(data, declarations, authority = 'engineered', authorizationId = 'authorization-main') {
  const authoritySet = authoritySetFor(data, declarations, authority);
  const authorization = await createDivergenceAuthorization({authorizationId, validation: data.validation, declarations, authoritySet, ...p14Context(data)});
  return {authorization, authoritySet};
}

test('P15 keeps the P14 mismatch DRIFT without a declaration and resolves the same exact property as DECLARED_DIVERGENCE with valid engineered authority', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'mass'}), mass = data.validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass');
  assert.equal(mass.outcome, 'DRIFT');
  const canonicalDigestBefore = data.validation.canonicalBinding.canonicalViewDigest;
  const declaration = declarationFor(data.validation, mass);
  const {authorization, authoritySet} = await authorize(data, [declaration]);
  assert.deepEqual(validateDivergenceAuthorization(authorization), {valid: true, errors: []});
  const resolution = authorization.resolutions.find((item) => item.findingId === mass.findingId);
  assert.equal(resolution.sourceOutcome, 'DRIFT');
  assert.equal(resolution.outcome, 'DECLARED_DIVERGENCE');
  assert.equal(authorization.summary.declaredDivergence, 1);
  assert.equal(authorization.summary.drift, 0);
  assert.equal(authorization.validationBinding.canonicalViewDigest, canonicalDigestBefore);
  assert.equal(data.validation.canonicalBinding.canonicalViewDigest, canonicalDigestBefore);
  assert.equal(authorization.declarations[0].canonicalValue, 2.5);
  assert.equal(authorization.declarations[0].overrideValue, 3.5);
  assert.equal(authorization.policy.declaredDivergenceDoesNotMutateCanonicalState, true);
  assert.deepEqual(await validateDivergenceAuthorizationBindings(authorization, {validation: data.validation, authoritySet, ...p14Context(data)}), {valid: true, errors: []});
});

test('P15 rejects declarations that drift from exact backend, obligation, path, subject, canonical value, or override value binding', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'binding'}), mass = data.validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass');
  for (const [name, declaration, pattern] of [
    ['backend', declarationFor(data.validation, mass, {targetBackend: 'wrong-backend'}), /targetBackend/],
    ['obligation', declarationFor(data.validation, mass, {obligationId: 'wrong-obligation'}), /obligationId/],
    ['path', declarationFor(data.validation, mass, {semanticPath: 'dynamics.inertia'}), /semanticPath/],
    ['subject', declarationFor(data.validation, mass, {subjectIds: ['module-root']}), /subjectIds/],
    ['canonical', declarationFor(data.validation, mass, {canonicalValue: 8.0}), /canonicalValue/],
    ['override', declarationFor(data.validation, mass, {overrideValue: 8.0}), /overrideValue/],
  ]) {
    const authoritySet = authoritySetFor(data, [declaration]);
    await assert.rejects(createDivergenceAuthorization({authorizationId: `authorization-wrong-${name}`, validation: data.validation, declarations: [declaration], authoritySet, ...p14Context(data)}), pattern);
  }
});

test('P15 cannot relabel an EQUIVALENT finding as declared divergence', async () => {
  const data = await pipeline({suffix: 'equivalent'}), equivalent = data.validation.findings.find((finding) => finding.outcome === 'EQUIVALENT');
  const declaration = declarationFor(data.validation, equivalent, {overrideValue: equivalent.normalizedValue === 1 ? 2 : '__different__'}), authoritySet = authoritySetFor(data, [declaration]);
  await assert.rejects(createDivergenceAuthorization({authorizationId: 'authorization-equivalent', validation: data.validation, declarations: [declaration], authoritySet, ...p14Context(data)}), /only a P14 DRIFT|may authorize only/);
});

test('P15 requires engineered semantic authority; observed, inferred, unknown, and forbidden do not license backend-specific override', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'authority'}), mass = data.validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass'), declaration = declarationFor(data.validation, mass);
  for (const authority of ['observed','inferred','unknown','forbidden']) {
    const authoritySet = authoritySetFor(data, [declaration], authority);
    await assert.rejects(createDivergenceAuthorization({authorizationId: `authorization-${authority}`, validation: data.validation, declarations: [declaration], authoritySet, ...p14Context(data)}), /must be engineered/);
  }
});

test('P15 field-scoped declarations must fully explain a multi-field drift and overlapping paths are forbidden', async () => {
  const data = await pipeline({frameTranslationOverride: [0.15, -0.25, 0.3], suffix: 'partial'}), frame = data.validation.findings.find((finding) => finding.semanticPath === 'frame.transform');
  assert.equal(frame.outcome, 'DRIFT');
  const x = declarationFor(data.validation, frame, {fieldPath: '/translation_m/0'}), y = declarationFor(data.validation, frame, {fieldPath: '/translation_m/1'});
  let authoritySet = authoritySetFor(data, [x]);
  await assert.rejects(createDivergenceAuthorization({authorizationId: 'authorization-partial', validation: data.validation, declarations: [x], authoritySet, ...p14Context(data)}), /do not fully explain/);
  authoritySet = authoritySetFor(data, [x, y]);
  const complete = await createDivergenceAuthorization({authorizationId: 'authorization-complete-fields', validation: data.validation, declarations: [x, y], authoritySet, ...p14Context(data)});
  assert.equal(complete.resolutions.find((item) => item.findingId === frame.findingId).outcome, 'DECLARED_DIVERGENCE');
  const root = declarationFor(data.validation, frame, {fieldPath: ''}), overlapAuthority = authoritySetFor(data, [root, x]);
  await assert.rejects(createDivergenceAuthorization({authorizationId: 'authorization-overlap', validation: data.validation, declarations: [root, x], authoritySet: overlapAuthority, ...p14Context(data)}), /overlapping field paths/);
});

test('P15 fails closed when semantic authority targets another P14 validation digest', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'stale-authority'}), mass = data.validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass'), declaration = declarationFor(data.validation, mass);
  const subjectId = divergenceAuthoritySubjectId(data.validation.validationDigest, mass.findingId, '');
  const authoritySet = createSemanticAuthoritySet({scopeId: data.validation.scopeId, sourceSha256: data.context.identityGraph.sourceSha256, targetSchema: data.validation.schema, targetDigest: D('9'), entries: [authorityEntry(subjectId, 'engineered', 0)]});
  await assert.rejects(createDivergenceAuthorization({authorizationId: 'authorization-stale-authority', validation: data.validation, declarations: [declaration], authoritySet, ...p14Context(data)}), /exact P14 validation digest/);
});

test('P15 intrinsic digest catches persisted tamper and live recreation rejects stale declarations', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'tamper'}), mass = data.validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass'), declaration = declarationFor(data.validation, mass);
  const {authorization, authoritySet} = await authorize(data, [declaration], 'engineered', 'authorization-tamper');
  const tampered = structuredClone(authorization); tampered.declarations[0].overrideValue = 4.5;
  assert.equal(validateDivergenceAuthorization(tampered).valid, false);
  const resigned = structuredClone(authorization); resigned.declarations[0].reason = 'A different re-signed reason.'; const payload = structuredClone(resigned); delete payload.authorizationDigest; resigned.authorizationDigest = digestJson(payload);
  assert.deepEqual(validateDivergenceAuthorization(resigned), {valid: true, errors: []});
  const live = await validateDivergenceAuthorizationBindings(resigned, {validation: data.validation, authoritySet, ...p14Context(data)});
  assert.equal(live.valid, false);
  assert.match(live.errors.join('; '), /does not reproduce|stale/);
});

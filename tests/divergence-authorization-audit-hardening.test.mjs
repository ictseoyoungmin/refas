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
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0.1, -0.2, 0.3], rotation_quat_xyzw: Z90}},
    ],
    relations: [{id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']}],
  });
  const dynamics = createRigidBodyDynamics({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    links: [{
      linkId: 'link-a',
      referenceFrameId: 'link-a',
      mass: {value_kg: 2.5},
      centerOfMass: {value_m: [0.01, -0.02, 0.03]},
      inertia: {tensor_kg_m2: [[0.02, 0, 0], [0, 0.03, 0], [0, 0, 0.04]]},
    }],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}

function profile(context) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({
    profileId: 'profile-audit',
    backend: 'fixture-divergence-audit',
    ...context,
    supported: obligations.map(({obligationId}) => ({obligationId})),
    approximated: [],
    unsupported: [],
    blockers: [],
  });
}

function semanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    const entity = view.identityProjection.entities.find((item) => obligation.subjectIds.includes(item.id));
    const relation = view.identityProjection.relations.find((item) => obligation.subjectIds.includes(item.id));
    if (obligation.semanticPath === 'identity.entity') return {id: entity.id, kind: entity.kind};
    if (obligation.semanticPath === 'frame.transform') return entity.frame;
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') return relation;
    throw new Error(`unsupported identity path ${obligation.semanticPath}`);
  }
  const component = view.components.find((item) => item.componentId === obligation.source.componentId);
  const link = component.contract.links.find((item) => obligation.subjectIds.includes(item.linkId));
  if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
  if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
  if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  throw new Error(`unsupported component path ${obligation.semanticPath}`);
}

function encodedFrame(frame) {
  const q = frame.rotation_quat_xyzw;
  return {
    parentId: frame.parentId,
    transform: {
      translation: frame.translation_m.map((value) => value * 100),
      translationUnit: 'cm',
      rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-q[3], -q[0], -q[1], -q[2]]},
    },
  };
}

function adapter() {
  return {
    id: 'fixture-divergence-audit-export',
    backend: 'fixture-divergence-audit',
    version: '1',
    project({canonicalView, capacityProfile}) {
      const records = capacityProfile.obligations.map((obligation) => {
        let value = semanticValue(canonicalView, obligation);
        if (obligation.semanticPath === 'frame.transform') value = encodedFrame(value);
        if (obligation.semanticPath === 'dynamics.mass') value = 3.5;
        return {obligationId: obligation.obligationId, value};
      });
      const path = 'fixture/divergence-audit.json';
      return {
        artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({schema: 'fixture.divergence.audit/v1', records})}\n`}],
        bindings: capacityProfile.obligations.map(({obligationId}) => ({obligationId, targets: [{path, locator: `record:${obligationId}`}]})),
      };
    },
  };
}

function normalizer() {
  return {
    id: 'fixture-divergence-audit-normalizer',
    backend: 'fixture-divergence-audit',
    version: '1',
    implementationDigest: D('f'),
    normalize({manifest, obligations, artifacts}) {
      const document = JSON.parse(Buffer.from(artifacts.find((item) => item.path === 'fixture/divergence-audit.json').content).toString('utf8'));
      const records = new Map(document.records.map((item) => [item.obligationId, item]));
      const dispositions = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
      return {
        readings: obligations.map((obligation) => {
          let value = records.get(obligation.obligationId).value;
          if (obligation.semanticPath === 'frame.transform') value = {parentId: value.parentId, ...canonicalizeBackendRigidTransform(value.transform)};
          return {obligationId: obligation.obligationId, sources: dispositions.get(obligation.obligationId).targets, value};
        }),
      };
    },
  };
}

async function pipeline() {
  const context = fixture();
  const capacityProfile = profile(context);
  const representationNormalizer = normalizer();
  const exported = await runExportAdapter({exportId: 'export-audit', adapter: adapter(), capacityProfile, ...context});
  const normalizedRepresentation = await runRepresentationNormalizer({normalizationId: 'normalized-audit', normalizer: representationNormalizer, capacityProfile, manifest: exported.manifest, files: exported.files});
  const validation = await createCrossRepresentationValidation({validationId: 'validation-audit', capacityProfile, manifest: exported.manifest, files: exported.files, normalizedRepresentation, normalizer: representationNormalizer, ...context});
  return {context, capacityProfile, normalizer: representationNormalizer, exported, normalizedRepresentation, validation};
}

function upstream(data) {
  return {
    capacityProfile: data.capacityProfile,
    manifest: data.exported.manifest,
    files: data.exported.files,
    normalizedRepresentation: data.normalizedRepresentation,
    normalizer: data.normalizer,
    ...data.context,
  };
}

function declaration(validation, finding) {
  return {
    findingId: finding.findingId,
    obligationId: finding.obligationId,
    targetBackend: validation.capacityBinding.backend,
    semanticPath: finding.semanticPath,
    subjectIds: [...finding.subjectIds],
    fieldPath: '',
    canonicalValue: structuredClone(finding.canonicalValue),
    overrideValue: structuredClone(finding.normalizedValue),
    reason: 'Backend-specific realization is required by the declared downstream target.',
  };
}

function authorityEntry(subjectId, reason = 'The target backend requires an explicit construction choice that differs from canonical RefAs semantics.') {
  return {
    id: 'divergence-authority-audit',
    subjectId,
    authority: 'engineered',
    proposition: 'The exact backend-specific override is authorized for the declared downstream target.',
    reason,
    basis: [{kind: 'downstream-requirement', ref: 'backend-requirement:audit'}],
  };
}

function authoritySet(data, item, reason) {
  const subjectId = divergenceAuthoritySubjectId(data.validation.validationDigest, item.findingId, item.fieldPath);
  return createSemanticAuthoritySet({
    scopeId: data.validation.scopeId,
    sourceSha256: data.context.identityGraph.sourceSha256,
    targetSchema: data.validation.schema,
    targetDigest: data.validation.validationDigest,
    entries: [authorityEntry(subjectId, reason)],
  });
}

function resign(value) {
  const next = structuredClone(value);
  const payload = structuredClone(next);
  delete payload.authorizationDigest;
  next.authorizationDigest = digestJson(payload);
  return next;
}

test('P15 persists the exact engineered authority entry digest and marks downstream live validation as mandatory', async () => {
  const data = await pipeline();
  const mass = data.validation.findings.find((item) => item.semanticPath === 'dynamics.mass');
  assert.equal(mass.outcome, 'DRIFT');
  const item = declaration(data.validation, mass);
  const authority = authoritySet(data, item);
  const authorization = await createDivergenceAuthorization({authorizationId: 'authorization-audit', validation: data.validation, declarations: [item], authoritySet: authority, ...upstream(data)});
  assert.equal(authorization.declarations[0].authorityEntryDigest, authority.entries[0].authorityDigest);
  assert.equal(authorization.policy.downstreamClaimsRequireLiveBindingValidation, true);
  assert.deepEqual(validateDivergenceAuthorization(authorization), {valid: true, errors: []});
  assert.deepEqual(await validateDivergenceAuthorizationBindings(authorization, {validation: data.validation, authoritySet: authority, ...upstream(data)}), {valid: true, errors: []});
});

test('P15 re-signed authority entry digest substitution remains intrinsically well-formed but fails live recreation', async () => {
  const data = await pipeline();
  const mass = data.validation.findings.find((item) => item.semanticPath === 'dynamics.mass');
  const item = declaration(data.validation, mass);
  const authority = authoritySet(data, item);
  const authorization = await createDivergenceAuthorization({authorizationId: 'authorization-audit-substitution', validation: data.validation, declarations: [item], authoritySet: authority, ...upstream(data)});
  const tampered = structuredClone(authorization);
  tampered.declarations[0].authorityEntryDigest = D('7');
  assert.equal(validateDivergenceAuthorization(tampered).valid, false);
  const resigned = resign(tampered);
  assert.deepEqual(validateDivergenceAuthorization(resigned), {valid: true, errors: []});
  const live = await validateDivergenceAuthorizationBindings(resigned, {validation: data.validation, authoritySet: authority, ...upstream(data)});
  assert.equal(live.valid, false);
  assert.match(live.errors.join('; '), /authorityEntryDigest|exact semantic authority entry|stale/);
});

test('P15 authority rationale drift changes the entry digest and stales the previous authorization', async () => {
  const data = await pipeline();
  const mass = data.validation.findings.find((item) => item.semanticPath === 'dynamics.mass');
  const item = declaration(data.validation, mass);
  const authority = authoritySet(data, item);
  const authorization = await createDivergenceAuthorization({authorizationId: 'authorization-audit-rationale', validation: data.validation, declarations: [item], authoritySet: authority, ...upstream(data)});
  const changedAuthority = authoritySet(data, item, 'A revised downstream requirement now licenses this exact backend-specific construction choice.');
  assert.notEqual(changedAuthority.entries[0].authorityDigest, authority.entries[0].authorityDigest);
  const live = await validateDivergenceAuthorizationBindings(authorization, {validation: data.validation, authoritySet: changedAuthority, ...upstream(data)});
  assert.equal(live.valid, false);
  assert.match(live.errors.join('; '), /authorityEntryDigest|exact semantic authority entry|stale|does not reproduce/);
});

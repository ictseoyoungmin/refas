import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  canonicalizeBackendRigidTransform,
  createCrossRepresentationValidation,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  deriveRepresentationCapacityObligations,
  digestJson,
  runExportAdapter,
  runRepresentationNormalizer,
  validateCrossRepresentationValidation,
  validateCrossRepresentationValidationBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const Z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function fixture({mass = 2.5} = {}) {
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
    links: [{linkId: 'link-a', referenceFrameId: 'link-a', mass: {value_kg: mass}, centerOfMass: {value_m: [0.01, -0.02, 0.03]}, inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}
function allSupportedProfile(context, profileId = 'profile-cross') {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({profileId, backend: 'fixture-cross', ...context, supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})), approximated: [], unsupported: [], blockers: []});
}
function mixedProfile(context) {
  const obligations = deriveRepresentationCapacityObligations(context);
  const supported = [], approximated = [], unsupported = [];
  for (const obligation of obligations) {
    if (obligation.semanticPath === 'dynamics.center-of-mass') approximated.push({obligationId: obligation.obligationId, strategy: 'REDUCED', reason: 'Fixture preserves the center but drops backend-independent metadata fidelity.', retainedSemantics: ['link-local center position'], lossSemantics: ['backend-independent metadata envelope']});
    else if (obligation.semanticPath === 'dynamics.inertia') unsupported.push({obligationId: obligation.obligationId, reason: 'Fixture backend cannot represent inertia.'});
    else supported.push({obligationId: obligation.obligationId});
  }
  return createRepresentationCapacityProfile({profileId: 'profile-cross-mixed', backend: 'fixture-cross', ...context, supported, approximated, unsupported, blockers: []});
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
function encodedFrame(frame) {
  const q = frame.rotation_quat_xyzw;
  return {parentId: frame.parentId, transform: {translation: frame.translation_m.map((value) => value * 100), translationUnit: 'cm', rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-q[3], -q[0], -q[1], -q[2]]}}};
}
function fixtureExportAdapter({massOverride = undefined} = {}) {
  return {id: 'fixture-cross-export', backend: 'fixture-cross', version: '1', project({canonicalView, capacityProfile}) {
    const unsupportedIds = new Set(capacityProfile.unsupported.map((item) => item.obligationId));
    const obligations = capacityProfile.obligations.filter((item) => !unsupportedIds.has(item.obligationId));
    const records = obligations.map((obligation) => { let value = semanticValue(canonicalView, obligation); if (obligation.semanticPath === 'frame.transform') value = encodedFrame(value); if (obligation.semanticPath === 'dynamics.mass' && massOverride !== undefined) value = massOverride; return {obligationId: obligation.obligationId, value}; });
    const path = 'fixture/cross-representation.json';
    return {artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({schema: 'fixture.cross/v1', records})}\n`}], bindings: obligations.map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: `record:${obligation.obligationId}`}]}))};
  }};
}
function fixtureNormalizer() {
  return {id: 'fixture-cross-normalizer', backend: 'fixture-cross', version: '1', implementationDigest: D('f'), normalize({manifest, obligations, artifacts}) {
    const artifact = artifacts.find((item) => item.path === 'fixture/cross-representation.json');
    const document = JSON.parse(Buffer.from(artifact.content).toString('utf8'));
    const records = new Map(document.records.map((item) => [item.obligationId, item]));
    const dispositionById = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
    const readings = [];
    for (const obligation of obligations) {
      const disposition = dispositionById.get(obligation.obligationId);
      if (disposition.status === 'OMITTED_UNSUPPORTED') continue;
      let value = records.get(obligation.obligationId).value;
      if (obligation.semanticPath === 'frame.transform') value = {parentId: value.parentId, ...canonicalizeBackendRigidTransform(value.transform)};
      readings.push({obligationId: obligation.obligationId, sources: disposition.targets, value});
    }
    return {readings};
  }};
}
async function pipeline({context = fixture(), profile = null, massOverride = undefined, suffix = 'a'} = {}) {
  const capacityProfile = profile ?? allSupportedProfile(context, `profile-${suffix}`), normalizer = fixtureNormalizer();
  const exported = await runExportAdapter({exportId: `export-${suffix}`, adapter: fixtureExportAdapter({massOverride}), capacityProfile, ...context});
  const normalizedRepresentation = await runRepresentationNormalizer({normalizationId: `normalized-${suffix}`, normalizer, capacityProfile, manifest: exported.manifest, files: exported.files});
  return {context, capacityProfile, normalizer, exported, normalizedRepresentation};
}
function semanticProjection(entries) { return entries.map((entry) => ({obligationId: entry.obligationId, semanticPath: entry.semanticPath, subjectIds: [...entry.subjectIds], status: entry.status, value: structuredClone(entry.value)})); }
function resignNormalized(value) { const next = structuredClone(value); next.semanticDigest = digestJson(semanticProjection(next.entries)); const payload = structuredClone(next); delete payload.normalizationDigest; next.normalizationDigest = digestJson(payload); return next; }

async function validatePipeline(data, validationId) {
  return createCrossRepresentationValidation({validationId, capacityProfile: data.capacityProfile, manifest: data.exported.manifest, files: data.exported.files, normalizedRepresentation: data.normalizedRepresentation, normalizer: data.normalizer, ...data.context});
}

test('P14 equivalent normalized semantics remain equivalent across q/-q, WXYZ, and cm encodings', async () => {
  const data = await pipeline({suffix: 'equivalent'}), validation = await validatePipeline(data, 'validation-equivalent');
  assert.deepEqual(validateCrossRepresentationValidation(validation), {valid: true, errors: []});
  assert.equal(validation.summary.total, data.capacityProfile.obligations.length);
  assert.equal(validation.summary.equivalent, validation.summary.total);
  assert.equal(validation.summary.drift, 0);
  assert.equal(validation.findings.find((finding) => finding.semanticPath === 'frame.transform').outcome, 'EQUIVALENT');
  assert.deepEqual(await validateCrossRepresentationValidationBindings(validation, {capacityProfile: data.capacityProfile, manifest: data.exported.manifest, files: data.exported.files, normalizedRepresentation: data.normalizedRepresentation, normalizer: data.normalizer, ...data.context}), {valid: true, errors: []});
});

test('P14 deliberately altered representable exact property produces deterministic DRIFT, not a score', async () => {
  const data = await pipeline({massOverride: 3.5, suffix: 'drift'}), validation = await validatePipeline(data, 'validation-drift');
  const mass = validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass');
  assert.equal(mass.outcome, 'DRIFT');
  assert.equal(mass.reasonCode, 'REPRESENTABLE_VALUE_MISMATCH');
  assert.equal(mass.canonicalValue, 2.5);
  assert.equal(mass.normalizedValue, 3.5);
  assert.equal(validation.summary.drift, 1);
  assert.equal('score' in validation, false);
  assert.equal(validation.policy.aggregateScoresCannotOverrideFindings, true);
});

test('P14 explicit approximation and unsupported omission remain LOSSY even when retained values match', async () => {
  const context = fixture(), profile = mixedProfile(context), data = await pipeline({context, profile, suffix: 'lossy'}), validation = await validatePipeline(data, 'validation-lossy');
  const center = validation.findings.find((finding) => finding.semanticPath === 'dynamics.center-of-mass');
  const inertia = validation.findings.find((finding) => finding.semanticPath === 'dynamics.inertia');
  assert.equal(center.outcome, 'LOSSY'); assert.equal(center.loss.kind, 'APPROXIMATION'); assert.equal(center.loss.strategy, 'REDUCED');
  assert.equal(inertia.outcome, 'LOSSY'); assert.equal(inertia.loss.kind, 'UNSUPPORTED'); assert.equal(inertia.normalizedValue, null);
  assert.equal(validation.summary.lossy, 2);
});

test('P14 unresolved canonical physical value is UNRESOLVED rather than guessed or drifted', async () => {
  const context = fixture({mass: null}), data = await pipeline({context, suffix: 'unresolved'}), validation = await validatePipeline(data, 'validation-unresolved');
  const mass = validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass');
  assert.equal(mass.outcome, 'UNRESOLVED'); assert.equal(mass.canonicalValue, null); assert.equal(mass.normalizedValue, null); assert.equal(validation.summary.unresolved, 1);
});

test('P14 replayable but structurally incompatible backend semantic value is INVALID', async () => {
  const data = await pipeline({massOverride: 'not-a-mass', suffix: 'invalid'}), validation = await validatePipeline(data, 'validation-invalid');
  const mass = validation.findings.find((finding) => finding.semanticPath === 'dynamics.mass');
  assert.equal(mass.outcome, 'INVALID'); assert.equal(mass.reasonCode, 'NORMALIZED_SEMANTIC_SHAPE_INVALID'); assert.equal(validation.summary.invalid, 1);
});

test('P14 rejects re-signed P13 value tamper because normalized evidence must replay from verified bytes', async () => {
  const data = await pipeline({suffix: 'replay'}), tampered = structuredClone(data.normalizedRepresentation);
  tampered.entries.find((entry) => entry.semanticPath === 'dynamics.mass').value = 9.5;
  const resigned = resignNormalized(tampered);
  await assert.rejects(createCrossRepresentationValidation({validationId: 'validation-replay-reject', capacityProfile: data.capacityProfile, manifest: data.exported.manifest, files: data.exported.files, normalizedRepresentation: resigned, normalizer: data.normalizer, ...data.context}), /P13 normalized representation is not replay-verified/);
});

test('P14 stays bound to current canonical P11/P12 state and does not compare stale evidence', async () => {
  const data = await pipeline({suffix: 'stale'}), changed = fixture({mass: 4.0});
  await assert.rejects(createCrossRepresentationValidation({validationId: 'validation-stale', capacityProfile: data.capacityProfile, manifest: data.exported.manifest, files: data.exported.files, normalizedRepresentation: data.normalizedRepresentation, normalizer: data.normalizer, ...changed}), /P11 representation capacity is not live|stale/);
});

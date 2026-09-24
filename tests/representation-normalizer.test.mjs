import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  canonicalizeBackendRigidTransform,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createSemanticJsonExportAdapter,
  createSemanticJsonRepresentationNormalizer,
  deriveRepresentationCapacityObligations,
  digestJson,
  runExportAdapter,
  runRepresentationNormalizer,
  validateNormalizedRepresentation,
  validateNormalizedRepresentationBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const Z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function fixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0.1, -0.2, 0.3], rotation_quat_xyzw: Z90}},
      {id: 'part-a', kind: 'physical-part', frame: {parentId: 'module-root', translation_m: [0.05, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]}},
    ],
    relations: [
      {id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'aggregate-part', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  });
  const dynamics = createRigidBodyDynamics({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    links: [{linkId: 'link-a', referenceFrameId: 'link-a', mass: {value_kg: 2.5}, centerOfMass: {value_m: [0.01, -0.02, 0.03]}, inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}
function allSupportedProfile(context, backend, profileId) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({profileId, backend, ...context, supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})), approximated: [], unsupported: [], blockers: []});
}
function mixedProfile(context) {
  const obligations = deriveRepresentationCapacityObligations(context);
  const supported = [], approximated = [], unsupported = [];
  for (const obligation of obligations) {
    if (obligation.semanticPath === 'dynamics.center-of-mass') approximated.push({obligationId: obligation.obligationId, strategy: 'REDUCED', reason: 'Fixture stores the center in a reduced backend envelope.', retainedSemantics: ['link-local center position'], lossSemantics: ['backend-independent metadata envelope']});
    else if (obligation.semanticPath === 'dynamics.inertia') unsupported.push({obligationId: obligation.obligationId, reason: 'Fixture backend omits inertia.'});
    else supported.push({obligationId: obligation.obligationId});
  }
  return createRepresentationCapacityProfile({profileId: 'profile-mixed', backend: 'fixture-normalized', ...context, supported, approximated, unsupported, blockers: []});
}
function identityEntity(view, subjects) { return view.identityProjection.entities.find((entity) => subjects.includes(entity.id)); }
function identityRelation(view, subjects) { return view.identityProjection.relations.find((relation) => subjects.includes(relation.id)); }
function fixtureSemanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    if (obligation.semanticPath === 'identity.entity') { const entity = identityEntity(view, obligation.subjectIds); return {id: entity.id, kind: entity.kind}; }
    if (obligation.semanticPath === 'frame.transform') return identityEntity(view, obligation.subjectIds).frame;
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') return identityRelation(view, obligation.subjectIds);
    throw new Error(`unsupported fixture identity path ${obligation.semanticPath}`);
  }
  const component = view.components.find((item) => item.componentId === obligation.source.componentId);
  const link = component.contract.links.find((item) => obligation.subjectIds.includes(item.linkId));
  if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
  if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
  if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  throw new Error(`unsupported fixture component path ${obligation.semanticPath}`);
}
function encodedFrame(frame, encoding) {
  const q = frame.rotation_quat_xyzw;
  if (encoding === 'wxyz-cm') return {parentId: frame.parentId, transform: {translation: frame.translation_m.map((value) => value * 100), translationUnit: 'cm', rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-q[3], -q[0], -q[1], -q[2]]}}};
  const zAngle = 2 * Math.atan2(q[2], q[3]) * 180 / Math.PI;
  return {parentId: frame.parentId, transform: {translation: frame.translation_m.map((value) => value * 1000), translationUnit: 'mm', rotation: {kind: 'EULER', order: 'ZYX', values: [zAngle, 0, 0], unit: 'deg', convention: 'EXTRINSIC'}}};
}
function fixtureExportAdapter({encoding = 'wxyz-cm', reverse = false} = {}) {
  return {id: `fixture-normalizer-export-${encoding.replaceAll('-', '_')}`, backend: 'fixture-normalized', version: '1', project({canonicalView, capacityProfile}) {
    const unsupportedIds = new Set(capacityProfile.unsupported.map((item) => item.obligationId));
    const emittedObligations = capacityProfile.obligations.filter((obligation) => !unsupportedIds.has(obligation.obligationId));
    let records = emittedObligations.map((obligation) => { let value = fixtureSemanticValue(canonicalView, obligation); if (obligation.semanticPath === 'frame.transform') value = encodedFrame(value, encoding); return {obligationId: obligation.obligationId, semanticPath: obligation.semanticPath, value}; });
    if (reverse) records = [...records].reverse();
    const path = 'fixture/representation.json';
    return {artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({schema: 'fixture.normalized-input/v1', records})}\n`}], bindings: emittedObligations.map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: `record:${obligation.obligationId}`}]}))};
  }};
}
function fixtureNormalizer(probe = null) {
  return {id: 'fixture-representation-normalizer', backend: 'fixture-normalized', version: '1', implementationDigest: D('f'), normalize({manifest, obligations, artifacts}) {
    if (probe) probe.calls += 1;
    const artifact = artifacts.find((item) => item.path === 'fixture/representation.json');
    const document = JSON.parse(Buffer.from(artifact.content).toString('utf8'));
    const byId = new Map(document.records.map((record) => [record.obligationId, record]));
    const dispositionById = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
    const readings = [];
    for (const obligation of obligations) {
      const disposition = dispositionById.get(obligation.obligationId);
      if (disposition.status === 'OMITTED_UNSUPPORTED') continue;
      const record = byId.get(obligation.obligationId);
      let value = record.value;
      if (obligation.semanticPath === 'frame.transform') value = {parentId: value.parentId, ...canonicalizeBackendRigidTransform(value.transform)};
      readings.push({obligationId: obligation.obligationId, sources: disposition.targets, value});
    }
    return {readings};
  }};
}
function semanticProjection(entries) {
  return entries.map((entry) => ({obligationId: entry.obligationId, semanticPath: entry.semanticPath, subjectIds: [...entry.subjectIds], status: entry.status, value: structuredClone(entry.value)}));
}
function resignNormalized(value) {
  const next = structuredClone(value);
  next.semanticDigest = digestJson(semanticProjection(next.entries));
  const payload = structuredClone(next);
  delete payload.normalizationDigest;
  next.normalizationDigest = digestJson(payload);
  return next;
}

test('P13 semantic JSON normalizer reads verified P12 bytes without canonical construction input', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'refas-semantic-json', 'profile-semantic');
  const normalizer = createSemanticJsonRepresentationNormalizer();
  const exported = await runExportAdapter({exportId: 'export-semantic', adapter: createSemanticJsonExportAdapter(), capacityProfile: profile, ...context});
  const normalized = await runRepresentationNormalizer({normalizationId: 'normalized-semantic', normalizer, capacityProfile: profile, manifest: exported.manifest, files: exported.files});
  assert.deepEqual(validateNormalizedRepresentation(normalized), {valid: true, errors: []});
  assert.deepEqual(await validateNormalizedRepresentationBindings(normalized, {capacityProfile: profile, manifest: exported.manifest, files: exported.files, normalizer}), {valid: true, errors: []});
  assert.equal(normalized.entries.length, profile.obligations.length);
  assert.ok(normalized.entries.every((entry) => entry.status === 'NORMALIZED'));
  const frame = normalized.entries.find((entry) => entry.semanticPath === 'frame.transform' && entry.subjectIds.includes('link-a'));
  assert.deepEqual(frame.value, {parentId: 'module-root', ...canonicalizeBackendRigidTransform({translation_m: [0.1,-0.2,0.3], rotation_quat_xyzw: Z90})});
  assert.equal('bundle' in normalized, false);
  assert.equal(normalized.policy.backendDataNeverCanonical, true);
  assert.equal(normalized.policy.persistedReadingsMustReplayFromVerifiedBytes, true);
  assert.equal(normalized.policy.normalizerImplementationIsDigestBound, true);
});

test('P13 canonicalizes translation units, quaternion sign/component order, and Euler conventions', () => {
  const expected = canonicalizeBackendRigidTransform({translation: [100,-200,300], translationUnit: 'mm', rotation: {kind: 'EULER', order: 'XYZ', values: [10,20,30], unit: 'deg', convention: 'INTRINSIC'}});
  const equivalentEuler = canonicalizeBackendRigidTransform({translation: [10,-20,30], translationUnit: 'cm', rotation: {kind: 'EULER', order: 'ZYX', values: [30,20,10], unit: 'deg', convention: 'EXTRINSIC'}});
  assert.deepEqual(equivalentEuler, expected);
  const q = expected.rotation_quat_xyzw;
  const equivalentQuaternion = canonicalizeBackendRigidTransform({translation: [0.1,-0.2,0.3], translationUnit: 'm', rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [-q[3],-q[0],-q[1],-q[2]]}});
  assert.deepEqual(equivalentQuaternion, expected);
});

test('P13 semantic digest is invariant to backend ordering and equivalent transform encodings', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'fixture-normalized', 'profile-fixture');
  const exportA = await runExportAdapter({exportId: 'export-fixture-a', adapter: fixtureExportAdapter({encoding: 'wxyz-cm', reverse: false}), capacityProfile: profile, ...context});
  const exportB = await runExportAdapter({exportId: 'export-fixture-b', adapter: fixtureExportAdapter({encoding: 'euler-mm', reverse: true}), capacityProfile: profile, ...context});
  const normalizedA = await runRepresentationNormalizer({normalizationId: 'normalized-fixture-a', normalizer: fixtureNormalizer(), capacityProfile: profile, manifest: exportA.manifest, files: exportA.files});
  const normalizedB = await runRepresentationNormalizer({normalizationId: 'normalized-fixture-b', normalizer: fixtureNormalizer(), capacityProfile: profile, manifest: exportB.manifest, files: exportB.files});
  assert.equal(normalizedA.semanticDigest, normalizedB.semanticDigest);
  assert.notEqual(normalizedA.normalizationDigest, normalizedB.normalizationDigest);
  const semanticProfile = allSupportedProfile(context, 'refas-semantic-json', 'profile-reference');
  const semanticExport = await runExportAdapter({exportId: 'export-reference', adapter: createSemanticJsonExportAdapter(), capacityProfile: semanticProfile, ...context});
  const semanticNormalized = await runRepresentationNormalizer({normalizationId: 'normalized-reference', normalizer: createSemanticJsonRepresentationNormalizer(), capacityProfile: semanticProfile, manifest: semanticExport.manifest, files: semanticExport.files});
  assert.equal(normalizedA.semanticDigest, semanticNormalized.semanticDigest);
});

test('P13 preserves P12 approximation disposition and explicit unsupported omission without fabricating values', async () => {
  const context = fixture(), profile = mixedProfile(context);
  const exported = await runExportAdapter({exportId: 'export-mixed-normalized', adapter: fixtureExportAdapter(), capacityProfile: profile, ...context});
  const normalized = await runRepresentationNormalizer({normalizationId: 'normalized-mixed', normalizer: fixtureNormalizer(), capacityProfile: profile, manifest: exported.manifest, files: exported.files});
  const approximation = normalized.entries.find((entry) => entry.semanticPath === 'dynamics.center-of-mass');
  const omission = normalized.entries.find((entry) => entry.semanticPath === 'dynamics.inertia');
  assert.equal(approximation.status, 'NORMALIZED'); assert.equal(approximation.exportDisposition, 'EMITTED_APPROXIMATION');
  assert.equal(omission.status, 'OMITTED_UNSUPPORTED'); assert.equal(omission.exportDisposition, 'OMITTED_UNSUPPORTED');
  assert.equal(omission.value, null); assert.deepEqual(omission.sources, []); assert.equal(omission.reason, 'Fixture backend omits inertia.');
});

test('P13 verifies P12 artifact bytes and exact P11 binding before normalizer code runs', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'fixture-normalized', 'profile-verified');
  const exported = await runExportAdapter({exportId: 'export-verified', adapter: fixtureExportAdapter(), capacityProfile: profile, ...context});
  const probe = {calls: 0};
  const tampered = exported.files.map((file,index) => ({...file, content: index === 0 ? Buffer.from('tampered') : file.content}));
  await assert.rejects(runRepresentationNormalizer({normalizationId: 'normalized-tampered', normalizer: fixtureNormalizer(probe), capacityProfile: profile, manifest: exported.manifest, files: tampered}), /not verified|do not reproduce/);
  assert.equal(probe.calls, 0);
  const wrongProfile = allSupportedProfile(context, 'refas-semantic-json', 'profile-wrong-backend');
  await assert.rejects(runRepresentationNormalizer({normalizationId: 'normalized-wrong-profile', normalizer: fixtureNormalizer(probe), capacityProfile: wrongProfile, manifest: exported.manifest, files: exported.files}), /capacity binding|backend/);
  assert.equal(probe.calls, 0);
});

test('P13 persisted values must replay from verified backend bytes even after attacker recomputes both digests', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'fixture-normalized', 'profile-replay-proof');
  const normalizer = fixtureNormalizer();
  const exported = await runExportAdapter({exportId: 'export-replay-proof', adapter: fixtureExportAdapter(), capacityProfile: profile, ...context});
  const normalized = await runRepresentationNormalizer({normalizationId: 'normalized-replay-proof', normalizer, capacityProfile: profile, manifest: exported.manifest, files: exported.files});
  const modified = structuredClone(normalized);
  modified.entries.find((entry) => entry.semanticPath === 'dynamics.mass').value = 99;
  const resigned = resignNormalized(modified);
  assert.deepEqual(validateNormalizedRepresentation(resigned), {valid: true, errors: []});
  const validation = await validateNormalizedRepresentationBindings(resigned, {capacityProfile: profile, manifest: exported.manifest, files: exported.files, normalizer});
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('; '), /does not replay from verified backend artifact bytes/);
});

test('P13 binds exact normalizer implementation identity and replay catches behavior drift even under a copied digest', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'fixture-normalized', 'profile-normalizer-binding');
  const normalizer = fixtureNormalizer();
  const exported = await runExportAdapter({exportId: 'export-normalizer-binding', adapter: fixtureExportAdapter(), capacityProfile: profile, ...context});
  const normalized = await runRepresentationNormalizer({normalizationId: 'normalized-normalizer-binding', normalizer, capacityProfile: profile, manifest: exported.manifest, files: exported.files});

  const wrongRegistration = {...normalizer, implementationDigest: D('e')};
  const wrongRegistrationValidation = await validateNormalizedRepresentationBindings(normalized, {capacityProfile: profile, manifest: exported.manifest, files: exported.files, normalizer: wrongRegistration});
  assert.equal(wrongRegistrationValidation.valid, false);
  assert.match(wrongRegistrationValidation.errors.join('; '), /normalizer implementation binding is stale/);

  const drifted = {...normalizer, normalize(input) {
    const raw = normalizer.normalize(input);
    const changed = structuredClone(raw);
    const massId = profile.obligations.find((obligation) => obligation.semanticPath === 'dynamics.mass').obligationId;
    changed.readings.find((reading) => reading.obligationId === massId).value = 123;
    return changed;
  }};
  const driftedValidation = await validateNormalizedRepresentationBindings(normalized, {capacityProfile: profile, manifest: exported.manifest, files: exported.files, normalizer: drifted});
  assert.equal(driftedValidation.valid, false);
  assert.match(driftedValidation.errors.join('; '), /does not replay from verified backend artifact bytes/);
});

test('P13 fails closed on missing, duplicate, or unrelated-locator readings', async () => {
  const context = fixture(), profile = allSupportedProfile(context, 'fixture-normalized', 'profile-invalid-readings');
  const exported = await runExportAdapter({exportId: 'export-invalid-readings', adapter: fixtureExportAdapter(), capacityProfile: profile, ...context});
  const base = fixtureNormalizer();
  const normal = await base.normalize({manifest: exported.manifest, obligations: profile.obligations, artifacts: exported.files.map((file) => { const descriptor = exported.manifest.artifacts.find((artifact) => artifact.path === file.path); return {...descriptor, content: Buffer.from(file.content)}; })});
  const missing = {...base, id: 'missing-normalizer', normalize: () => ({readings: normal.readings.slice(1)})};
  await assert.rejects(runRepresentationNormalizer({normalizationId: 'normalized-missing', normalizer: missing, capacityProfile: profile, manifest: exported.manifest, files: exported.files}), /did not return a reading/);
  const duplicate = {...base, id: 'duplicate-normalizer', normalize: () => ({readings: [...normal.readings, normal.readings[0]]})};
  await assert.rejects(runRepresentationNormalizer({normalizationId: 'normalized-duplicate', normalizer: duplicate, capacityProfile: profile, manifest: exported.manifest, files: exported.files}), /duplicate reading/);
  const unrelatedReading = structuredClone(normal.readings[0]); unrelatedReading.sources[0].locator = 'record:not-the-declared-target';
  const unrelated = {...base, id: 'unrelated-normalizer', normalize: () => ({readings: [unrelatedReading, ...normal.readings.slice(1)]})};
  await assert.rejects(runRepresentationNormalizer({normalizationId: 'normalized-unrelated', normalizer: unrelated, capacityProfile: profile, manifest: exported.manifest, files: exported.files}), /not one of the P12 disposition targets/);
});

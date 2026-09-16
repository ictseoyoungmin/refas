import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  createCanonicalExportView,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createSemanticJsonExportAdapter,
  deriveRepresentationCapacityObligations,
  digestJson,
  representationCapacityDecision,
  runExportAdapter,
  stableStringify,
  validateBackendExportArtifacts,
  validateBackendExportBindings,
  validateBackendExportManifest,
  validateBackendExportResult,
  validateCanonicalExportView,
  validateCanonicalExportViewBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function fixture(mass = 2.5) {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'link-a', kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-a', kind: 'physical-part',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
    ],
    relations: [
      {id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'aggregate-part', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  });
  const contract = createRigidBodyDynamics({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    links: [{
      linkId: 'link-a',
      referenceFrameId: 'link-a',
      mass: {value_kg: mass},
      centerOfMass: {value_m: [0.01, 0, 0]},
      inertia: {tensor_kg_m2: [[0.02, 0, 0], [0, 0.03, 0], [0, 0, 0.04]]},
    }],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}

function allSupportedProfile(context, backend, profileId = `profile-${backend}`) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({
    profileId,
    backend,
    ...context,
    supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})),
    approximated: [],
    unsupported: [],
  });
}

function mixedDecisions(obligations) {
  const supported = [];
  const approximated = [];
  const unsupported = [];
  for (const obligation of obligations) {
    if (obligation.semanticPath === 'dynamics.center-of-mass') {
      approximated.push({
        obligationId: obligation.obligationId,
        strategy: 'REDUCED',
        reason: 'Backend keeps a link-local center point but not the full canonical metadata envelope.',
        retainedSemantics: ['link-local center position'],
        lossSemantics: ['canonical authority envelope'],
      });
    } else if (obligation.semanticPath === 'dynamics.inertia') {
      unsupported.push({
        obligationId: obligation.obligationId,
        reason: 'Backend representation has no inertia-tensor field.',
      });
    } else {
      supported.push({obligationId: obligation.obligationId});
    }
  }
  return {supported, approximated, unsupported};
}

function mixedProfile(context, backend = 'fixture-mixed', blockers = []) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({
    profileId: `profile-${backend}`,
    backend,
    ...context,
    ...mixedDecisions(obligations),
    blockers,
  });
}

function fixtureAdapter(backend, suffix, probe = null) {
  return {
    id: `adapter-${suffix}`,
    backend,
    version: '1',
    project(input) {
      if (probe) {
        probe.calls += 1;
        probe.inputKeys = Object.keys(input).sort();
        probe.canonicalViewDigest = input.canonicalView.canonicalViewDigest;
      }
      const path = `exports/${suffix}.json`;
      const content = `${stableStringify({
        backend,
        canonicalViewDigest: input.canonicalView.canonicalViewDigest,
        bundleDigest: input.canonicalView.bundleBinding.bundleDigest,
      })}\n`;
      const bindings = input.capacityProfile.obligations
        .filter((obligation) => representationCapacityDecision(input.capacityProfile, obligation.obligationId).status !== 'UNSUPPORTED')
        .map((obligation) => ({
          obligationId: obligation.obligationId,
          targets: [{path, locator: `semantic:${obligation.semanticPath}:${obligation.subjectIds.join(',')}`}],
        }));
      return {artifacts: [{path, mediaType: 'application/json', content}], bindings};
    },
  };
}

function recomputeManifestDigest(manifest) {
  const payload = structuredClone(manifest);
  delete payload.exportDigest;
  return {...payload, exportDigest: digestJson(payload)};
}

test('P12 semantic JSON adapter consumes a live canonical view and hashes emitted bytes in RefAs', async () => {
  const context = fixture();
  const profile = allSupportedProfile(context, 'refas-semantic-json', 'profile-semantic-json');
  const view = createCanonicalExportView(context);
  assert.deepEqual(validateCanonicalExportView(view), {valid: true, errors: []});
  assert.deepEqual(validateCanonicalExportViewBindings(view, context), {valid: true, errors: []});

  const result = await runExportAdapter({
    exportId: 'export-semantic-json',
    adapter: createSemanticJsonExportAdapter(),
    capacityProfile: profile,
    ...context,
  });

  assert.deepEqual(validateBackendExportManifest(result.manifest), {valid: true, errors: []});
  assert.deepEqual(validateBackendExportBindings(result.manifest, {capacityProfile: profile, ...context}), {valid: true, errors: []});
  assert.deepEqual(validateBackendExportArtifacts(result.manifest, result.files), {valid: true, errors: []});
  assert.deepEqual(validateBackendExportResult(result, {capacityProfile: profile, ...context}), {valid: true, errors: []});
  assert.equal(result.manifest.canonicalBinding.canonicalViewDigest, view.canonicalViewDigest);
  assert.equal(result.manifest.artifacts.length, 1);
  assert.equal(result.manifest.dispositions.length, profile.obligations.length);
  assert.ok(result.manifest.dispositions.every((item) => item.status === 'EMITTED_EXACT'));

  const document = JSON.parse(Buffer.from(result.files[0].content).toString('utf8'));
  assert.equal(document.schema, 'refas.semantic-json-backend/v1');
  assert.equal(document.canonicalViewDigest, view.canonicalViewDigest);
  assert.equal(document.bundleBinding.bundleDigest, context.bundle.bundleDigest);
});

test('P12 carries P11 approximation metadata and unsupported omissions without silently dropping semantics', async () => {
  const context = fixture();
  const profile = mixedProfile(context);
  const result = await runExportAdapter({
    exportId: 'export-mixed',
    adapter: fixtureAdapter('fixture-mixed', 'mixed'),
    capacityProfile: profile,
    ...context,
  });

  const com = profile.obligations.find((item) => item.semanticPath === 'dynamics.center-of-mass');
  const inertia = profile.obligations.find((item) => item.semanticPath === 'dynamics.inertia');
  const comDisposition = result.manifest.dispositions.find((item) => item.obligationId === com.obligationId);
  const inertiaDisposition = result.manifest.dispositions.find((item) => item.obligationId === inertia.obligationId);
  const comDecision = representationCapacityDecision(profile, com.obligationId);
  const inertiaDecision = representationCapacityDecision(profile, inertia.obligationId);

  assert.equal(comDisposition.status, 'EMITTED_APPROXIMATION');
  assert.deepEqual(comDisposition.approximation, {
    strategy: comDecision.strategy,
    reason: comDecision.reason,
    retainedSemantics: comDecision.retainedSemantics,
    lossSemantics: comDecision.lossSemantics,
  });
  assert.equal(inertiaDisposition.status, 'OMITTED_UNSUPPORTED');
  assert.deepEqual(inertiaDisposition.targets, []);
  assert.equal(inertiaDisposition.reason, inertiaDecision.reason);
  assert.deepEqual(validateBackendExportResult(result, {capacityProfile: profile, ...context}), {valid: true, errors: []});
});

test('P12 refuses blocked or stale P11 state before invoking an adapter', async () => {
  const original = fixture();
  const obligations = deriveRepresentationCapacityObligations(original);
  const inertia = obligations.find((item) => item.semanticPath === 'dynamics.inertia');
  const blocked = mixedProfile(original, 'fixture-blocked', [{
    blockerId: 'requires-inertia',
    obligationIds: [inertia.obligationId],
    reason: 'Target use requires exact inertia semantics.',
  }]);
  const blockedProbe = {calls: 0};
  await assert.rejects(
    runExportAdapter({exportId: 'export-blocked', adapter: fixtureAdapter('fixture-blocked', 'blocked', blockedProbe), capacityProfile: blocked, ...original}),
    /blocked/,
  );
  assert.equal(blockedProbe.calls, 0);

  const liveProfile = allSupportedProfile(original, 'fixture-stale', 'profile-stale');
  const changed = fixture(3.75);
  const staleProbe = {calls: 0};
  await assert.rejects(
    runExportAdapter({exportId: 'export-stale', adapter: fixtureAdapter('fixture-stale', 'stale', staleProbe), capacityProfile: liveProfile, ...changed}),
    /not live|stale/,
  );
  assert.equal(staleProbe.calls, 0);
});

test('P12 independently fans one canonical construction state into multiple backends without backend chaining', async () => {
  const context = fixture();
  const profileA = allSupportedProfile(context, 'fixture-a', 'profile-a');
  const profileB = allSupportedProfile(context, 'fixture-b', 'profile-b');
  const probeA = {calls: 0};
  const probeB = {calls: 0};
  const resultA = await runExportAdapter({exportId: 'export-a', adapter: fixtureAdapter('fixture-a', 'a', probeA), capacityProfile: profileA, ...context});
  const resultB = await runExportAdapter({exportId: 'export-b', adapter: fixtureAdapter('fixture-b', 'b', probeB), capacityProfile: profileB, ...context});

  assert.equal(probeA.calls, 1);
  assert.equal(probeB.calls, 1);
  assert.deepEqual(probeA.inputKeys, ['canonicalView', 'capacityProfile']);
  assert.deepEqual(probeB.inputKeys, ['canonicalView', 'capacityProfile']);
  assert.equal(probeA.canonicalViewDigest, probeB.canonicalViewDigest);
  assert.equal(resultA.manifest.canonicalBinding.canonicalViewDigest, resultB.manifest.canonicalBinding.canonicalViewDigest);
  assert.notEqual(resultA.manifest.artifacts[0].sha256, resultB.manifest.artifacts[0].sha256);
  assert.equal('artifacts' in resultB.manifest.canonicalBinding, false);
});

test('P12 rejects unsafe artifact paths, missing supported coverage, and emission of unsupported obligations', async () => {
  const context = fixture();
  const exactProfile = allSupportedProfile(context, 'fixture-invalid', 'profile-invalid');
  const first = exactProfile.obligations[0];

  await assert.rejects(
    runExportAdapter({
      exportId: 'export-unsafe',
      capacityProfile: exactProfile,
      ...context,
      adapter: {
        id: 'unsafe-adapter', backend: 'fixture-invalid', version: '1',
        project() { return {artifacts: [{path: '../escape.json', mediaType: 'application/json', content: '{}'}], bindings: []}; },
      },
    }),
    /unsafe path segment|must be relative/,
  );

  await assert.rejects(
    runExportAdapter({
      exportId: 'export-missing',
      capacityProfile: exactProfile,
      ...context,
      adapter: {
        id: 'missing-adapter', backend: 'fixture-invalid', version: '1',
        project() {
          const path = 'exports/missing.json';
          return {
            artifacts: [{path, mediaType: 'application/json', content: '{}'}],
            bindings: exactProfile.obligations.slice(1).map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: obligation.semanticPath}]})),
          };
        },
      },
    }),
    new RegExp(`did not emit required .* ${first.obligationId}`),
  );

  const mixed = mixedProfile(context, 'fixture-unsupported-emission');
  const unsupported = mixed.obligations.find((obligation) => representationCapacityDecision(mixed, obligation.obligationId).status === 'UNSUPPORTED');
  await assert.rejects(
    runExportAdapter({
      exportId: 'export-unsupported-emission',
      capacityProfile: mixed,
      ...context,
      adapter: {
        id: 'unsupported-adapter', backend: 'fixture-unsupported-emission', version: '1',
        project() {
          const path = 'exports/unsupported.json';
          return {
            artifacts: [{path, mediaType: 'application/json', content: '{}'}],
            bindings: mixed.obligations.map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: obligation.semanticPath}]})),
          };
        },
      },
    }),
    new RegExp(`may not emit unsupported P11 obligation ${unsupported.obligationId}`),
  );
});

test('P12 detects manifest binding tamper and realized artifact byte tamper', async () => {
  const context = fixture();
  const profile = allSupportedProfile(context, 'fixture-tamper', 'profile-tamper');
  const result = await runExportAdapter({exportId: 'export-tamper', adapter: fixtureAdapter('fixture-tamper', 'tamper'), capacityProfile: profile, ...context});

  const intrinsicTamper = structuredClone(result.manifest);
  intrinsicTamper.adapter.version = '2';
  assert.equal(validateBackendExportManifest(intrinsicTamper).valid, false);

  const bindingTamper = structuredClone(result.manifest);
  bindingTamper.capacityBinding.capacityDigest = D('f');
  const rebound = recomputeManifestDigest(bindingTamper);
  assert.equal(validateBackendExportManifest(rebound).valid, true);
  assert.match(validateBackendExportBindings(rebound, {capacityProfile: profile, ...context}).errors.join('; '), /capacity binding is stale/);

  const tamperedFiles = result.files.map((file, index) => ({
    path: file.path,
    mediaType: file.mediaType,
    content: index === 0 ? Buffer.from('tampered bytes') : Buffer.from(file.content),
  }));
  assert.match(validateBackendExportArtifacts(result.manifest, tamperedFiles).errors.join('; '), /do not reproduce/);
});

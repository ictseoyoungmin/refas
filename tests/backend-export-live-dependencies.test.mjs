import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalExportView,
  createCollisionModel,
  createCollisionVisualGeometryManifest,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createSemanticJsonExportAdapter,
  createTransmissionImplementationManifest,
  createTransmissionModel,
  deriveRepresentationCapacityObligations,
  runExportAdapter,
  validateBackendExportResult,
  validateCanonicalExportView,
  validateCanonicalExportViewBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const frame = (parentId) => ({parentId, translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]});

function allSupportedProfile(context, backend, profileId) {
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

function fixtureAdapter(backend, probe) {
  return {
    id: `adapter-${backend}`,
    backend,
    version: '1',
    project({canonicalView, capacityProfile}) {
      probe.calls += 1;
      const path = 'exports/live.json';
      return {
        artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({canonicalViewDigest: canonicalView.canonicalViewDigest})}\n`}],
        bindings: capacityProfile.obligations.map((obligation) => ({
          obligationId: obligation.obligationId,
          targets: [{path, locator: `obligation:${obligation.obligationId}`}],
        })),
      };
    },
  };
}

function transmissionFixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'input-actuator', kind: 'actuator', frame: frame('module-root')},
      {id: 'output-actuator', kind: 'actuator', frame: frame('module-root')},
      {id: 'solver-transmission', kind: 'transmission'},
    ],
    relations: [
      {id: 'contains-input', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['input-actuator']},
      {id: 'contains-output', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['output-actuator']},
      {id: 'contains-transmission', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['solver-transmission']},
      {id: 'solver-maps', kind: 'MAPS', sourceId: 'solver-transmission', targetIds: ['input-actuator', 'output-actuator']},
    ],
  });
  const implementationArtifactDigest = D('e');
  const implementationManifest = createTransmissionImplementationManifest({
    scopeId: 'whole',
    sourceSha256: D(),
    artifactDigest: implementationArtifactDigest,
    implementations: [{
      schema: 'refas.transmission-solver/v1',
      id: 'solver-model',
      digest: D('d'),
      inputSemanticIdentityOrder: ['input-actuator'],
      outputSemanticIdentityOrder: ['output-actuator'],
    }],
  });
  const contract = createTransmissionModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    implementationManifest,
    expectedImplementationArtifactDigest: implementationArtifactDigest,
    transmissions: [{
      transmissionId: 'solver-transmission',
      mapsRelationIds: ['solver-maps'],
      contextMechanismIds: [],
      inputSpace: {id: 'input-space', coordinates: [{id: 'input-q', semanticIdentityId: 'input-actuator'}], order: ['input-q']},
      outputSpace: {id: 'output-space', coordinates: [{id: 'output-q', semanticIdentityId: 'output-actuator'}], order: ['output-q']},
      mapping: {kind: 'EXTERNAL_SOLVER', solverRef: {schema: 'refas.transmission-solver/v1', id: 'solver-model', digest: D('d')}},
    }],
  });
  const components = [{
    componentId: 'transmission-main',
    ownerModuleId: 'module-root',
    contract,
    validationContext: {implementationManifest, expectedImplementationArtifactDigest: implementationArtifactDigest},
  }];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-transmission', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle, implementationManifest, implementationArtifactDigest};
}

function collisionFixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: frame('module-root')},
    ],
    relations: [{id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']}],
  });
  const contract = createCollisionModel({
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph,
    groups: ['body'],
    links: [{
      linkId: 'link-a',
      selfCollisionPolicy: 'DISABLED',
      colliders: [{
        id: 'link-a-mesh',
        frame: {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
        geometry: {
          kind: 'MESH',
          meshId: 'collision-shell-a',
          geometryDigest: D('b'),
          reuseMode: 'DECLARED_VISUAL_REUSE',
          visualGeometryRef: {geometryId: 'visual-shell-a', geometryDigest: D('b')},
        },
        filter: {groupIds: ['body'], maskGroupIds: []},
      }],
    }],
  });
  const visualArtifactDigest = D('c');
  const visualGeometryManifest = createCollisionVisualGeometryManifest({
    scopeId: 'whole',
    sourceSha256: D(),
    visualArtifactDigest,
    geometries: [{geometryId: 'visual-shell-a', geometryDigest: D('b')}],
  });
  const components = [{
    componentId: 'collision-main',
    ownerModuleId: 'module-root',
    contract,
    validationContext: {visualGeometryManifest, expectedVisualArtifactDigest: visualArtifactDigest},
  }];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-collision', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle, visualGeometryManifest, visualArtifactDigest};
}

test('P12 canonical view closes P06 external implementation dependencies and semantic JSON preserves them', async () => {
  const context = transmissionFixture();
  const view = createCanonicalExportView(context);
  assert.deepEqual(validateCanonicalExportView(view), {valid: true, errors: []});
  assert.deepEqual(validateCanonicalExportViewBindings(view, context), {valid: true, errors: []});

  const component = view.components.find((item) => item.componentId === 'transmission-main');
  const dependency = component.dependencies.find((item) => item.kind === 'TRANSMISSION_IMPLEMENTATION_MANIFEST');
  assert.ok(dependency);
  assert.equal(dependency.digest, context.implementationManifest.manifestDigest);
  assert.equal(dependency.contract.artifactDigest, context.implementationArtifactDigest);

  const profile = allSupportedProfile(context, 'refas-semantic-json', 'profile-transmission-json');
  const result = await runExportAdapter({
    exportId: 'export-transmission-json',
    adapter: createSemanticJsonExportAdapter(),
    capacityProfile: profile,
    ...context,
  });
  assert.deepEqual(validateBackendExportResult(result, {capacityProfile: profile, ...context}), {valid: true, errors: []});
  const document = JSON.parse(Buffer.from(result.files[0].content).toString('utf8'));
  const exported = document.components.find((item) => item.componentId === 'transmission-main');
  assert.equal(exported.dependencies.some((item) => item.kind === 'TRANSMISSION_IMPLEMENTATION_MANIFEST'), true);
});

test('P12 refuses stale current P06 implementation proof before adapter invocation', async () => {
  const context = transmissionFixture();
  const profile = allSupportedProfile(context, 'fixture-live', 'profile-live');
  const staleComponents = context.components.map((item) => ({
    ...item,
    validationContext: {...item.validationContext, expectedImplementationArtifactDigest: D('f')},
  }));
  const probe = {calls: 0};
  await assert.rejects(
    runExportAdapter({
      exportId: 'export-stale-implementation',
      adapter: fixtureAdapter('fixture-live', probe),
      capacityProfile: profile,
      bundle: context.bundle,
      identityGraph: context.identityGraph,
      components: staleComponents,
    }),
    /P06 bindings are stale|implementation artifact|implementationManifest/,
  );
  assert.equal(probe.calls, 0);
});

test('P12 canonical view closes P03 visual-reuse proof and rejects a stale current visual artifact', () => {
  const context = collisionFixture();
  const view = createCanonicalExportView(context);
  const component = view.components.find((item) => item.componentId === 'collision-main');
  const dependency = component.dependencies.find((item) => item.kind === 'COLLISION_VISUAL_GEOMETRY_MANIFEST');
  assert.ok(dependency);
  assert.equal(dependency.digest, context.visualGeometryManifest.manifestDigest);
  assert.equal(dependency.contract.visualArtifactDigest, context.visualArtifactDigest);
  assert.deepEqual(validateCanonicalExportViewBindings(view, context), {valid: true, errors: []});

  const staleComponents = context.components.map((item) => ({
    ...item,
    validationContext: {...item.validationContext, expectedVisualArtifactDigest: D('f')},
  }));
  assert.throws(
    () => createCanonicalExportView({...context, components: staleComponents}),
    /P03 visual-reuse binding is stale|current visual artifact digest/,
  );
});

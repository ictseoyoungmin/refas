import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  digestJson,
  physicalAssetBundleIdentityProjection,
  physicalModuleClosureById,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'a'.repeat(64);

function graphInput({childX = 0.4, childInterfaceX = -0.2, unrelatedX = 0} = {}) {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'module-child',
        kind: 'assembly-module',
        frame: {parentId: 'module-root', translation_m: [childX, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {id: 'module-unrelated', kind: 'assembly-module'},
      {
        id: 'part-root',
        kind: 'physical-part',
        frame: {parentId: 'module-root', translation_m: [0.1, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'link-root',
        kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-child',
        kind: 'physical-part',
        frame: {parentId: 'module-child', translation_m: [0.05, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'link-child',
        kind: 'rigid-link',
        frame: {parentId: 'module-child', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'interface-root',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-a'],
        frame: {parentId: 'module-root', translation_m: [0.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'interface-child',
        kind: 'attachment-interface',
        compatibilityFamilyIds: ['mount-a'],
        frame: {parentId: 'module-child', translation_m: [childInterfaceX, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-unrelated',
        kind: 'physical-part',
        frame: {parentId: 'module-unrelated', translation_m: [unrelatedX, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
    ],
    relations: [
      {id: 'contains-child', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['module-child']},
      {id: 'contains-part-root', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-root']},
      {id: 'contains-link-root', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-root']},
      {id: 'contains-part-child', kind: 'CONTAINS', sourceId: 'module-child', targetIds: ['part-child']},
      {id: 'contains-link-child', kind: 'CONTAINS', sourceId: 'module-child', targetIds: ['link-child']},
      {id: 'contains-part-unrelated', kind: 'CONTAINS', sourceId: 'module-unrelated', targetIds: ['part-unrelated']},
      {id: 'exposes-root', kind: 'EXPOSES', sourceId: 'module-root', targetIds: ['interface-root']},
      {id: 'exposes-child', kind: 'EXPOSES', sourceId: 'module-child', targetIds: ['interface-child']},
      {id: 'aggregate-root', kind: 'AGGREGATES_INTO', sourceId: 'part-root', targetIds: ['link-root']},
      {id: 'aggregate-child', kind: 'AGGREGATES_INTO', sourceId: 'part-child', targetIds: ['link-child']},
    ],
  };
}

function syntheticComponent({marker = 'v1', schema = 'refas.rigid-body-dynamics/v1'} = {}) {
  const digestFields = {
    'refas.rigid-body-dynamics/v1': 'dynamicsDigest',
    'refas.collision-model/v1': 'collisionDigest',
  };
  const payload = {schema, scopeId: 'whole', sourceSha256: SOURCE, marker};
  return {...payload, [digestFields[schema] ?? 'unknownDigest']: digestJson(payload)};
}

function bundleFor(graph, {rootMarker = 'root-v1', childMarker = 'child-v1'} = {}) {
  return createPhysicalAssetBundle({
    bundleId: 'fixture-bundle',
    identityGraph: graph,
    rootModuleId: 'module-root',
    components: [
      {componentId: 'child-dynamics', ownerModuleId: 'module-child', contract: syntheticComponent({marker: childMarker})},
      {componentId: 'root-collision', ownerModuleId: 'module-root', contract: syntheticComponent({marker: rootMarker, schema: 'refas.collision-model/v1'})},
    ],
  });
}

test('P10 bundle is deterministic and binds exact component refs plus recursive module closures', () => {
  const graph = createPhysicalIdentityGraph(graphInput());
  const bundle = bundleFor(graph);
  assert.deepEqual(validatePhysicalAssetBundle(bundle), {valid: true, errors: []});
  assert.deepEqual(validatePhysicalAssetBundleBindings(bundle, {
    identityGraph: graph,
    components: [
      {componentId: 'root-collision', ownerModuleId: 'module-root', contract: syntheticComponent({marker: 'root-v1', schema: 'refas.collision-model/v1'})},
      {componentId: 'child-dynamics', ownerModuleId: 'module-child', contract: syntheticComponent({marker: 'child-v1'})},
    ],
  }), {valid: true, errors: []});

  const rootClosure = physicalModuleClosureById(bundle, 'module-root');
  const childClosure = physicalModuleClosureById(bundle, 'module-child');
  assert.equal(rootClosure.childModules[0].closureDigest, childClosure.closureDigest);
  assert.deepEqual(childClosure.componentRefs, [{
    componentId: 'child-dynamics',
    schema: 'refas.rigid-body-dynamics/v1',
    digest: syntheticComponent({marker: 'child-v1'}).dynamicsDigest,
  }]);

  const reorderedInput = graphInput();
  reorderedInput.entities.reverse();
  reorderedInput.relations.reverse();
  const reorderedGraph = createPhysicalIdentityGraph(reorderedInput);
  const reordered = createPhysicalAssetBundle({
    bundleId: 'fixture-bundle',
    identityGraph: reorderedGraph,
    rootModuleId: 'module-root',
    components: [
      {componentId: 'root-collision', ownerModuleId: 'module-root', contract: syntheticComponent({marker: 'root-v1', schema: 'refas.collision-model/v1'})},
      {componentId: 'child-dynamics', ownerModuleId: 'module-child', contract: syntheticComponent({marker: 'child-v1'})},
    ],
  });
  assert.equal(reordered.bundleDigest, bundle.bundleDigest);
  assert.deepEqual(reordered, bundle);
});

test('child incoming placement belongs to parent closure and does not rewrite immutable child closure', () => {
  const original = bundleFor(createPhysicalIdentityGraph(graphInput({childX: 0.4})));
  const moved = bundleFor(createPhysicalIdentityGraph(graphInput({childX: 0.9})));
  const originalChild = physicalModuleClosureById(original, 'module-child');
  const movedChild = physicalModuleClosureById(moved, 'module-child');
  assert.equal(movedChild.closureDigest, originalChild.closureDigest);
  assert.notEqual(moved.rootClosureDigest, original.rootClosureDigest);
  assert.notEqual(moved.bundleDigest, original.bundleDigest);
  assert.deepEqual(movedChild.componentRefs, originalChild.componentRefs);
});

test('child-local identity or component drift changes child closure and stales the parent bundle', () => {
  const graph = createPhysicalIdentityGraph(graphInput());
  const original = bundleFor(graph);
  const childIdentityDrift = createPhysicalIdentityGraph(graphInput({childInterfaceX: -0.35}));
  const rebuiltIdentity = bundleFor(childIdentityDrift);
  assert.notEqual(
    physicalModuleClosureById(rebuiltIdentity, 'module-child').closureDigest,
    physicalModuleClosureById(original, 'module-child').closureDigest,
  );
  assert.equal(validatePhysicalAssetBundleBindings(original, {
    identityGraph: childIdentityDrift,
    components: [
      {componentId: 'child-dynamics', ownerModuleId: 'module-child', contract: syntheticComponent({marker: 'child-v1'})},
      {componentId: 'root-collision', ownerModuleId: 'module-root', contract: syntheticComponent({marker: 'root-v1', schema: 'refas.collision-model/v1'})},
    ],
  }).valid, false);

  const rebuiltComponent = bundleFor(graph, {childMarker: 'child-v2'});
  assert.notEqual(
    physicalModuleClosureById(rebuiltComponent, 'module-child').closureDigest,
    physicalModuleClosureById(original, 'module-child').closureDigest,
  );
  assert.equal(validatePhysicalAssetBundleBindings(original, {
    identityGraph: graph,
    components: [
      {componentId: 'child-dynamics', ownerModuleId: 'module-child', contract: syntheticComponent({marker: 'child-v2'})},
      {componentId: 'root-collision', ownerModuleId: 'module-root', contract: syntheticComponent({marker: 'root-v1', schema: 'refas.collision-model/v1'})},
    ],
  }).valid, false);
});

test('unrelated P01 edits outside the selected module subtree do not stale the bundle', () => {
  const originalGraph = createPhysicalIdentityGraph(graphInput({unrelatedX: 0}));
  const changedGraph = createPhysicalIdentityGraph(graphInput({unrelatedX: 4.2}));
  const originalProjection = physicalAssetBundleIdentityProjection(originalGraph, 'module-root');
  const changedProjection = physicalAssetBundleIdentityProjection(changedGraph, 'module-root');
  assert.equal(digestJson(originalProjection), digestJson(changedProjection));
  assert.equal(bundleFor(originalGraph).bundleDigest, bundleFor(changedGraph).bundleDigest);
});

test('P10 fails closed on missing/stale components, unsupported schemas, and manifest tampering', () => {
  const graph = createPhysicalIdentityGraph(graphInput());
  const bundle = bundleFor(graph);
  assert.equal(validatePhysicalAssetBundleBindings(bundle, {identityGraph: graph, components: []}).valid, false);

  const wrongDigest = syntheticComponent({marker: 'bad'});
  wrongDigest.dynamicsDigest = 'f'.repeat(64);
  assert.throws(() => createPhysicalAssetBundle({
    bundleId: 'bad-bundle', identityGraph: graph, rootModuleId: 'module-root',
    components: [{componentId: 'bad-component', ownerModuleId: 'module-root', contract: wrongDigest}],
  }), /does not reproduce/);

  assert.throws(() => createPhysicalAssetBundle({
    bundleId: 'bad-bundle', identityGraph: graph, rootModuleId: 'module-root',
    components: [{
      componentId: 'bad-component', ownerModuleId: 'module-root',
      contract: {...syntheticComponent(), schema: 'refas.unknown-physical-contract/v1'},
    }],
  }), /not a supported P10 component schema/);

  const tampered = structuredClone(bundle);
  tampered.moduleClosures.find((item) => item.moduleId === 'module-child').componentRefs[0].digest = 'b'.repeat(64);
  assert.equal(validatePhysicalAssetBundle(tampered).valid, false);
});

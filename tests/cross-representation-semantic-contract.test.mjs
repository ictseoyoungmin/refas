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
  runExportAdapter,
  runRepresentationNormalizer,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const Z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function fixture({mass = 2.5} = {}) {
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
      mass: {value_kg: mass},
      centerOfMass: {value_m: [0.01, -0.02, 0.03]},
      inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]},
    }],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}

function profile(context, suffix) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({
    profileId: `profile-semantic-${suffix}`,
    backend: 'fixture-semantic-contract',
    ...context,
    supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})),
    approximated: [],
    unsupported: [],
    blockers: [],
  });
}

function semanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    if (obligation.semanticPath === 'identity.entity') {
      const entity = view.identityProjection.entities.find((item) => obligation.subjectIds.includes(item.id));
      return {id: entity.id, kind: entity.kind};
    }
    if (obligation.semanticPath === 'frame.transform') {
      const entity = view.identityProjection.entities.find((item) => obligation.subjectIds.includes(item.id));
      return entity.frame;
    }
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') {
      return view.identityProjection.relations.find((item) => obligation.subjectIds.includes(item.id));
    }
  }
  const component = view.components.find((item) => item.componentId === obligation.source.componentId);
  const link = component.contract.links.find((item) => obligation.subjectIds.includes(item.linkId));
  if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
  if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
  if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  throw new Error(`unsupported semantic path ${obligation.semanticPath}`);
}

function encodedFrame(frame) {
  return {
    parentId: frame.parentId,
    transform: {
      translation: frame.translation_m.map((value) => value * 100),
      translationUnit: 'cm',
      rotation: {kind: 'QUATERNION', order: 'WXYZ', values: [frame.rotation_quat_xyzw[3], ...frame.rotation_quat_xyzw.slice(0, 3)]},
    },
  };
}

function adapter(overrides = {}) {
  return {
    id: 'fixture-semantic-contract-export',
    backend: 'fixture-semantic-contract',
    version: '1',
    project({canonicalView, capacityProfile}) {
      const records = capacityProfile.obligations.map((obligation) => {
        let value = semanticValue(canonicalView, obligation);
        if (obligation.semanticPath === 'frame.transform') value = encodedFrame(value);
        if (Object.hasOwn(overrides, obligation.semanticPath)) value = structuredClone(overrides[obligation.semanticPath]);
        return {obligationId: obligation.obligationId, value};
      });
      const path = 'fixture/semantic-contract.json';
      return {
        artifacts: [{path, mediaType: 'application/json', content: `${JSON.stringify({records})}\n`}],
        bindings: capacityProfile.obligations.map((obligation) => ({obligationId: obligation.obligationId, targets: [{path, locator: `record:${obligation.obligationId}`}]})),
      };
    },
  };
}

function normalizer() {
  return {
    id: 'fixture-semantic-contract-normalizer',
    backend: 'fixture-semantic-contract',
    version: '1',
    implementationDigest: D('f'),
    normalize({manifest, obligations, artifacts}) {
      const artifact = artifacts.find((item) => item.path === 'fixture/semantic-contract.json');
      const document = JSON.parse(Buffer.from(artifact.content).toString('utf8'));
      const records = new Map(document.records.map((item) => [item.obligationId, item]));
      const dispositionById = new Map(manifest.dispositions.map((item) => [item.obligationId, item]));
      return {
        readings: obligations.map((obligation) => {
          const disposition = dispositionById.get(obligation.obligationId);
          let value = records.get(obligation.obligationId).value;
          if (obligation.semanticPath === 'frame.transform') value = {parentId: value.parentId, ...canonicalizeBackendRigidTransform(value.transform)};
          return {obligationId: obligation.obligationId, sources: disposition.targets, value};
        }),
      };
    },
  };
}

async function classify({context = fixture(), overrides = {}, suffix}) {
  const capacityProfile = profile(context, suffix);
  const exactNormalizer = normalizer();
  const exported = await runExportAdapter({exportId: `export-${suffix}`, adapter: adapter(overrides), capacityProfile, ...context});
  const normalizedRepresentation = await runRepresentationNormalizer({normalizationId: `normalized-${suffix}`, normalizer: exactNormalizer, capacityProfile, manifest: exported.manifest, files: exported.files});
  return createCrossRepresentationValidation({validationId: `validation-${suffix}`, capacityProfile, manifest: exported.manifest, files: exported.files, normalizedRepresentation, normalizer: exactNormalizer, ...context});
}

test('P14 unresolved canonical mass with replayable string backend value is INVALID', async () => {
  const validation = await classify({context: fixture({mass: null}), overrides: {'dynamics.mass': 'not-a-mass'}, suffix: 'unresolved-string'});
  const finding = validation.findings.find((item) => item.semanticPath === 'dynamics.mass');
  assert.equal(finding.canonicalValue, null);
  assert.equal(finding.normalizedValue, 'not-a-mass');
  assert.equal(finding.outcome, 'INVALID');
  assert.equal(finding.reasonCode, 'NORMALIZED_SEMANTIC_SHAPE_INVALID');
});

test('P14 wrong-length and wrong-element COM readings are INVALID', async (t) => {
  for (const [suffix, value] of [['short', [0, 0]], ['typed', [0, 'bad', 0]]]) {
    await t.test(suffix, async () => {
      const validation = await classify({overrides: {'dynamics.center-of-mass': value}, suffix: `com-${suffix}`});
      assert.equal(validation.findings.find((item) => item.semanticPath === 'dynamics.center-of-mass').outcome, 'INVALID');
    });
  }
});

test('P14 wrong-shape and wrong-element inertia readings are INVALID', async (t) => {
  const cases = [
    ['shape', [[1,0],[0,1]]],
    ['typed', [[1,0,0],[0,'bad',0],[0,0,1]]],
  ];
  for (const [suffix, value] of cases) {
    await t.test(suffix, async () => {
      const validation = await classify({overrides: {'dynamics.inertia': value}, suffix: `inertia-${suffix}`});
      assert.equal(validation.findings.find((item) => item.semanticPath === 'dynamics.inertia').outcome, 'INVALID');
    });
  }
});

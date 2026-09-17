import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalClaimEvidence,
  digestJson,
  physicalModuleClosureById,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
  validatePhysicalClaimEvidenceBindings,
  validatePhysicalIdentityGraph,
} from '../skills/refas/scripts/lib/index.mjs';
import {
  authorizeIntegratedMassDrift,
  certifyIntegratedRuntimeReady,
  createIntegratedPhysicalConstruction,
  integratedFixtureEvidenceDigest,
  physicalClaimContext,
  projectIntegratedPhysicalConstruction,
} from './fixtures/integrated-physical-fixture.mjs';

function relation(graph, id) {
  const found = graph.relations.find((item) => item.id === id);
  assert.ok(found, `missing physical relation ${id}`);
  return found;
}

function entity(graph, id) {
  const found = graph.entities.find((item) => item.id === id);
  assert.ok(found, `missing physical identity ${id}`);
  return found;
}

function outcomes(validation) {
  return new Map(validation.findings.map((item) => [item.obligationId, item.outcome]));
}

test('P17 composes reusable fixed-interface modules without collapsing interfaces into joints', () => {
  const construction = createIntegratedPhysicalConstruction();
  assert.deepEqual(validatePhysicalIdentityGraph(construction.identityGraph), {valid: true, errors: []});
  assert.deepEqual(validatePhysicalAssetBundle(construction.bundle), {valid: true, errors: []});
  assert.deepEqual(
    validatePhysicalAssetBundleBindings(construction.bundle, {
      identityGraph: construction.identityGraph,
      components: construction.components,
    }),
    {valid: true, errors: []},
  );

  for (const suffix of ['a', 'b']) {
    const fixed = relation(construction.identityGraph, `binds-interface-${suffix}`);
    const joint = relation(construction.identityGraph, `joint-${suffix}-connects`);
    assert.equal(fixed.kind, 'BINDS_TO');
    assert.equal(entity(construction.identityGraph, fixed.sourceId).kind, 'attachment-interface');
    assert.equal(entity(construction.identityGraph, fixed.targetIds[0]).kind, 'attachment-interface');
    assert.equal(joint.kind, 'CONNECTS');
    assert.equal(entity(construction.identityGraph, joint.sourceId).kind, 'virtual-joint');
    assert.notEqual(fixed.sourceId, joint.sourceId);
    assert.notEqual(fixed.targetIds[0], joint.sourceId);
  }

  const childA = physicalModuleClosureById(construction.bundle, 'module-drive-a');
  const childB = physicalModuleClosureById(construction.bundle, 'module-drive-b');
  assert.deepEqual(childA.componentRefs.map((item) => item.componentId), ['collision-arm-a', 'dynamics-arm-a']);
  assert.deepEqual(childB.componentRefs.map((item) => item.componentId), ['collision-arm-b', 'dynamics-arm-b']);
  assert.ok(childA.closureDigest);
  assert.ok(childB.closureDigest);

  const reordered = createIntegratedPhysicalConstruction({reverseInput: true});
  assert.equal(reordered.identityGraph.graphDigest, construction.identityGraph.graphDigest);
  assert.equal(reordered.bundle.bundleDigest, construction.bundle.bundleDigest);
  assert.equal(physicalModuleClosureById(reordered.bundle, 'module-drive-a').closureDigest, childA.closureDigest);
  assert.equal(physicalModuleClosureById(reordered.bundle, 'module-drive-b').closureDigest, childB.closureDigest);
});

test('P17 realizes a coupled 2-DOF nonlinear physical stack without backend-index identity', () => {
  const construction = createIntegratedPhysicalConstruction();
  const mechanism = construction.mechanismGraph.mechanisms[0];
  const transmission = construction.transmissionModel.transmissions[0];

  assert.equal(mechanism.kind, 'PARALLEL_LINKAGE');
  assert.deepEqual(mechanism.realizedJointIds, ['joint-a', 'joint-b']);
  assert.equal(mechanism.edges[0].kind, 'PIN_CONNECTED');
  assert.equal(transmission.mapping.kind, 'NONLINEAR');
  assert.deepEqual(transmission.inputSpace.order, ['joint-a-q', 'joint-b-q']);
  assert.deepEqual(transmission.outputSpace.order, ['actuator-a-q', 'actuator-b-q']);
  assert.deepEqual(construction.actuationModel.actuators.map((item) => item.actuatorId), ['actuator-a', 'actuator-b']);

  const runtimeA = construction.runtimeModel.bindings.find((item) => item.bindingId === 'binding-actuator-a');
  assert.equal(runtimeA.runtimeIndex.value, 10);
  assert.equal(construction.runtimeModel.policy.runtimeIndexIsNotSemanticIdentity, true);
  assert.equal('runtimeIndex' in entity(construction.identityGraph, 'actuator-a'), false);

  const changedRuntime = createIntegratedPhysicalConstruction({runtimeIndexA: 99});
  assert.equal(changedRuntime.identityGraph.graphDigest, construction.identityGraph.graphDigest);
  assert.equal(changedRuntime.transmissionModel.transmissionDigest, construction.transmissionModel.transmissionDigest);
  assert.equal(changedRuntime.actuationModel.actuationDigest, construction.actuationModel.actuationDigest);
  assert.notEqual(changedRuntime.runtimeModel.runtimeBindingDigest, construction.runtimeModel.runtimeBindingDigest);
});

test('P17 two backend projections normalize equivalent quaternion-sign and Euler-order encodings without drift', async () => {
  const construction = createIntegratedPhysicalConstruction();
  const semantic = await projectIntegratedPhysicalConstruction(construction, {backend: 'semantic'});
  const encoded = await projectIntegratedPhysicalConstruction(construction, {backend: 'encoded'});

  assert.notEqual(semantic.manifest.adapter.backend, encoded.manifest.adapter.backend);
  assert.equal(semantic.manifest.canonicalBinding.canonicalViewDigest, encoded.manifest.canonicalBinding.canonicalViewDigest);
  assert.equal(semantic.normalizedRepresentation.semanticDigest, encoded.normalizedRepresentation.semanticDigest);
  assert.ok(semantic.validation.findings.every((item) => item.outcome === 'EQUIVALENT'));
  assert.ok(encoded.validation.findings.every((item) => item.outcome === 'EQUIVALENT'));
  assert.deepEqual(outcomes(encoded.validation), outcomes(semantic.validation));
});

test('P17 deliberate representable drift is blocking until exact current P15 divergence authorization is supplied', async () => {
  const construction = createIntegratedPhysicalConstruction();
  const drifted = await projectIntegratedPhysicalConstruction(construction, {backend: 'encoded', massOverride: 1.35});
  const mass = drifted.validation.findings.find((item) => item.semanticPath === 'dynamics.mass' && item.subjectIds.includes('arm-a-link'));
  assert.ok(mass);
  assert.equal(mass.outcome, 'DRIFT');

  const blocked = await createPhysicalClaimEvidence({evidenceId: 'p17-runtime-drift', claimId: 'runtime-ready', ...physicalClaimContext(drifted)});
  assert.equal(blocked.status, 'FAIL');
  assert.equal(blocked.findings.some((item) => item.semanticPath === 'dynamics.mass' && item.effectiveOutcome === 'DRIFT' && item.blocking), true);

  const authorized = await authorizeIntegratedMassDrift(drifted);
  const certification = await certifyIntegratedRuntimeReady(drifted, authorized);
  assert.equal(certification.evidence.status, 'PASS');
  assert.equal(certification.evidence.findings.some((item) => item.semanticPath === 'dynamics.mass' && item.effectiveOutcome === 'DECLARED_DIVERGENCE' && !item.blocking), true);
  assert.equal(certification.decision.authorized, true);
  assert.deepEqual(certification.decision.authorizedClaimIds, ['runtime-ready']);
  assert.equal(construction.components.find((item) => item.componentId === 'dynamics-arm-a').contract.links[0].mass.value_kg, 1.2);
});

test('P17 control/runtime-only edits do not stale simulation-ready evidence', async () => {
  const baselineConstruction = createIntegratedPhysicalConstruction();
  const baselineProjection = await projectIntegratedPhysicalConstruction(baselineConstruction, {backend: 'semantic'});
  const baselineEvidence = await createPhysicalClaimEvidence({
    evidenceId: 'p17-simulation-ready', claimId: 'simulation-ready', ...physicalClaimContext(baselineProjection),
  });
  assert.equal(baselineEvidence.status, 'PASS');

  const downstreamOnly = createIntegratedPhysicalConstruction({controlKp: 41, runtimeIndexA: 77});
  const downstreamProjection = await projectIntegratedPhysicalConstruction(downstreamOnly, {backend: 'semantic'});
  const downstreamEvidence = await createPhysicalClaimEvidence({
    evidenceId: 'p17-simulation-ready', claimId: 'simulation-ready', ...physicalClaimContext(downstreamProjection),
  });
  assert.deepEqual(downstreamEvidence, baselineEvidence);
  assert.deepEqual(
    await validatePhysicalClaimEvidenceBindings(baselineEvidence, physicalClaimContext(downstreamProjection)),
    {valid: true, errors: []},
  );
});

test('P17 full integration evidence reproduces deterministically', async () => {
  async function run() {
    const construction = createIntegratedPhysicalConstruction();
    const semanticProjection = await projectIntegratedPhysicalConstruction(construction, {backend: 'semantic'});
    const encodedProjection = await projectIntegratedPhysicalConstruction(construction, {backend: 'encoded'});
    const runtimeCertification = await certifyIntegratedRuntimeReady(encodedProjection);
    assert.equal(runtimeCertification.evidence.status, 'PASS');
    assert.equal(runtimeCertification.decision.authorized, true);
    return {
      construction,
      semanticProjection,
      encodedProjection,
      runtimeCertification,
      digest: integratedFixtureEvidenceDigest({construction, semanticProjection, encodedProjection, runtimeCertification}),
    };
  }

  const first = await run();
  const second = await run();
  assert.equal(first.digest, second.digest);
  assert.equal(first.construction.bundle.bundleDigest, second.construction.bundle.bundleDigest);
  assert.equal(first.semanticProjection.manifest.exportDigest, second.semanticProjection.manifest.exportDigest);
  assert.equal(first.encodedProjection.normalizedRepresentation.normalizationDigest, second.encodedProjection.normalizedRepresentation.normalizationDigest);
  assert.equal(digestJson(first.runtimeCertification.decision), digestJson(second.runtimeCertification.decision));
});

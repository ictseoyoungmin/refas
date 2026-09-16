import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createCanonicalExportView,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createSemanticJsonExportAdapter,
  deriveRepresentationCapacityObligations,
  digestJson,
  runExportAdapter,
  validateCanonicalExportView,
  validateCanonicalExportViewBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'a'.repeat(64);
const rigidFrame = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const frame = (parentId, translation_m = [0, 0, 0]) => ({parentId, translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});
const transform = (translation_m = [0, 0, 0]) => ({translation_m, rotation_quat_xyzw: [0, 0, 0, 1]});

function articulationFixture() {
  const attachmentSemantics = createAttachmentSemantics({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    entities: [
      {id: 'base-body', scopeId: 'whole', evidenceRefs: ['source/reference.png']},
      {id: 'arm-body', scopeId: 'whole', evidenceRefs: ['source/reference.png']},
    ],
    relations: [
      {id: 'base-free', mode: 'FREE', subjectId: 'base-body', ownerIds: [], basis: 'construction', evidenceRefs: ['source/reference.png']},
      {id: 'arm-hinge', mode: 'ARTICULATED', subjectId: 'arm-body', ownerIds: ['base-body'], basis: 'construction', evidenceRefs: ['source/reference.png']},
    ],
    evidenceRefs: ['source/reference.png'],
  });
  const joint = createArticulatedJoint({
    attachmentSemantics,
    id: 'joint-hinge',
    relationId: 'arm-hinge',
    ownerJointFrame: rigidFrame([1, 0, 0]),
    subjectJointFrame: rigidFrame(),
    minimumAngle: -0.75,
    maximumAngle: 1.25,
    evidenceRefs: ['model/joint-hinge.json'],
  });
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'base-link', kind: 'rigid-link', frame: frame('module-root')},
      {id: 'arm-link', kind: 'rigid-link', frame: frame('module-root', [1, 0, 0])},
      {id: 'joint-hinge', kind: 'virtual-joint', frame: frame('base-link', [1, 0, 0])},
    ],
    relations: [
      {id: 'contains-base', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['base-link']},
      {id: 'contains-arm', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['arm-link']},
      {id: 'contains-joint', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['joint-hinge']},
      {id: 'hinge-connects', kind: 'CONNECTS', sourceId: 'joint-hinge', targetIds: ['arm-link', 'base-link']},
    ],
  });
  const articulation = createArticulationGraph({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    identityGraph,
    attachmentSemantics,
    jointContracts: [joint],
    rootLinkId: 'base-link',
    linkBindings: [
      {linkId: 'base-link', attachmentEntityId: 'base-body', attachmentFrameInLink: transform()},
      {linkId: 'arm-link', attachmentEntityId: 'arm-body', attachmentFrameInLink: transform()},
    ],
    joints: [{
      virtualJointId: 'joint-hinge',
      parentLinkId: 'base-link',
      childLinkId: 'arm-link',
      referenceAngle: 0,
      jointContract: {schema: joint.schema, id: joint.id, jointDigest: joint.jointDigest},
    }],
  });
  const validationContext = {attachmentSemantics, jointContracts: [joint]};
  const components = [{componentId: 'articulation-main', ownerModuleId: 'module-root', contract: articulation, validationContext}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-articulation', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle, attachmentSemantics, joint};
}

function allSupportedProfile(context) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({
    profileId: 'profile-articulation-json',
    backend: 'refas-semantic-json',
    ...context,
    supported: obligations.map((obligation) => ({obligationId: obligation.obligationId})),
    approximated: [],
    unsupported: [],
  });
}

test('P12 canonical export view carries exact P04 attachment and typed-joint dependencies needed to realize joint semantics', async () => {
  const context = articulationFixture();
  const view = createCanonicalExportView(context);
  assert.deepEqual(validateCanonicalExportView(view), {valid: true, errors: []});
  assert.deepEqual(validateCanonicalExportViewBindings(view, context), {valid: true, errors: []});

  const component = view.components.find((item) => item.componentId === 'articulation-main');
  assert.ok(component);
  assert.equal(component.dependencies.length, 2);
  const attachment = component.dependencies.find((dependency) => dependency.kind === 'ATTACHMENT_SEMANTICS');
  const joint = component.dependencies.find((dependency) => dependency.kind === 'ARTICULATED_JOINT');
  assert.equal(attachment.digest, context.attachmentSemantics.semanticsDigest);
  assert.equal(joint.digest, context.joint.jointDigest);
  assert.deepEqual(joint.contract.limits, {minimumAngle: -0.75, maximumAngle: 1.25});
  assert.equal(joint.contract.axisConvention, 'owner-joint-z');

  const profile = allSupportedProfile(context);
  const limitObligation = profile.obligations.find((obligation) => obligation.semanticPath === 'articulation.joint-limit');
  assert.ok(limitObligation, 'P11 articulation.joint-limit obligation must exist');

  const result = await runExportAdapter({
    exportId: 'export-articulation-json',
    adapter: createSemanticJsonExportAdapter(),
    capacityProfile: profile,
    ...context,
  });
  const document = JSON.parse(Buffer.from(result.files[0].content).toString('utf8'));
  const exportedComponent = document.components.find((item) => item.componentId === 'articulation-main');
  const exportedJoint = exportedComponent.dependencies.find((dependency) => dependency.kind === 'ARTICULATED_JOINT');
  assert.deepEqual(exportedJoint.contract.limits, {minimumAngle: -0.75, maximumAngle: 1.25});
  assert.equal(result.manifest.policy.canonicalDependenciesAreExplicit, true);
});

test('P12 canonical dependency validation fails closed on missing, stale, or tampered typed-joint material', () => {
  const context = articulationFixture();
  const view = createCanonicalExportView(context);

  const missing = structuredClone(view);
  const component = missing.components.find((item) => item.componentId === 'articulation-main');
  component.dependencies = component.dependencies.filter((dependency) => dependency.kind !== 'ARTICULATED_JOINT');
  const missingPayload = structuredClone(missing);
  delete missingPayload.canonicalViewDigest;
  missing.canonicalViewDigest = digestJson(missingPayload);
  assert.match(validateCanonicalExportView(missing).errors.join('; '), /exactly cover|missing typed joint dependency/);

  const tampered = structuredClone(view);
  const tamperedComponent = tampered.components.find((item) => item.componentId === 'articulation-main');
  const jointDependency = tamperedComponent.dependencies.find((dependency) => dependency.kind === 'ARTICULATED_JOINT');
  jointDependency.contract.limits.maximumAngle = 1.5;
  const tamperedPayload = structuredClone(tampered);
  delete tamperedPayload.canonicalViewDigest;
  tampered.canonicalViewDigest = digestJson(tamperedPayload);
  assert.match(validateCanonicalExportView(tampered).errors.join('; '), /jointDigest does not reproduce|digest does not match/);

  const staleContext = articulationFixture();
  staleContext.components[0] = {
    ...staleContext.components[0],
    validationContext: {
      ...staleContext.components[0].validationContext,
      jointContracts: [],
    },
  };
  assert.throws(() => createCanonicalExportView(staleContext), /physical asset bundle bindings are stale|jointContracts/);
});

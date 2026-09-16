import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRepresentationCapacityExportable,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  deriveRepresentationCapacityObligations,
  digestJson,
  representationCapacityDecision,
  validateRepresentationCapacityBindings,
  validateRepresentationCapacityProfile,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

function graph() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0,0,0], rotation_quat_xyzw: [0,0,0,1]}},
      {id: 'part-a', kind: 'physical-part', frame: {parentId: 'module-root', translation_m: [0,0,0], rotation_quat_xyzw: [0,0,0,1]}},
    ],
    relations: [
      {id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-part', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'aggregate-part', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  });
}

function dynamics(identityGraph = graph(), mass = 2.5) {
  return createRigidBodyDynamics({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    links: [{
      linkId: 'link-a', referenceFrameId: 'link-a',
      mass: {value_kg: mass},
      centerOfMass: {value_m: [0.01,0,0]},
      inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]},
    }],
  });
}

function fixture(mass = 2.5) {
  const identityGraph = graph();
  const contract = dynamics(identityGraph, mass);
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, contract, components, bundle};
}

function decisions(obligations) {
  const supported = [], approximated = [], unsupported = [];
  for (const item of obligations) {
    if (item.semanticPath === 'dynamics.center-of-mass') {
      approximated.push({
        obligationId: item.obligationId,
        strategy: 'REDUCED',
        reason: 'Backend preserves a local center point but not the full canonical metadata envelope.',
        retainedSemantics: ['local center position'],
        lossSemantics: ['canonical property authority metadata'],
      });
    } else if (item.semanticPath === 'dynamics.inertia') {
      unsupported.push({obligationId: item.obligationId, reason: 'Backend format has no rigid-body inertia tensor field.'});
    } else {
      supported.push({obligationId: item.obligationId});
    }
  }
  return {supported, approximated, unsupported};
}

function profileFor(f = fixture(), {blockers = []} = {}) {
  const obligations = deriveRepresentationCapacityObligations(f);
  return createRepresentationCapacityProfile({
    profileId: 'backend-profile', backend: 'fixture-backend',
    ...f, ...decisions(obligations), blockers,
  });
}

test('P11 derives a complete canonical obligation inventory and classifies every obligation exactly once', () => {
  const f = fixture();
  const obligations = deriveRepresentationCapacityObligations(f);
  assert.deepEqual(obligations.map((item) => item.semanticPath).sort(), [
    'composition.contains', 'dynamics.center-of-mass', 'dynamics.inertia', 'dynamics.mass', 'frame.transform', 'identity.entity', 'identity.relation',
  ]);
  const profile = profileFor(f);
  assert.deepEqual(validateRepresentationCapacityProfile(profile), {valid: true, errors: []});
  assert.deepEqual(validateRepresentationCapacityBindings(profile, f), {valid: true, errors: []});
  assert.equal(profile.exportable, true);
  assert.equal(profile.policy.obligationsDerivedFromCanonicalBundle, true);
  assert.equal(representationCapacityDecision(profile, obligations.find((item) => item.semanticPath === 'dynamics.center-of-mass').obligationId).status, 'APPROXIMATED');
  assert.equal(representationCapacityDecision(profile, obligations.find((item) => item.semanticPath === 'dynamics.inertia').obligationId).status, 'UNSUPPORTED');
  assert.equal(assertRepresentationCapacityExportable(profile, f), profile);
});

test('ordering does not affect the P11 digest', () => {
  const f = fixture();
  const obligations = deriveRepresentationCapacityObligations(f);
  const d = decisions(obligations);
  const a = createRepresentationCapacityProfile({profileId:'backend-profile', backend:'fixture-backend', ...f, ...d});
  const b = createRepresentationCapacityProfile({profileId:'backend-profile', backend:'fixture-backend', ...f, supported:[...d.supported].reverse(), approximated:[...d.approximated].reverse(), unsupported:[...d.unsupported].reverse()});
  assert.equal(a.capacityDigest, b.capacityDigest);
  assert.deepEqual(a, b);
});

test('P11 rejects missing or multiply classified obligations and ambiguous approximation semantics', () => {
  const f = fixture();
  const obligations = deriveRepresentationCapacityObligations(f);
  const d = decisions(obligations);
  assert.throws(() => createRepresentationCapacityProfile({profileId:'bad', backend:'fixture', ...f, supported:d.supported.slice(1), approximated:d.approximated, unsupported:d.unsupported}), /classified exactly once/);
  assert.throws(() => createRepresentationCapacityProfile({profileId:'bad', backend:'fixture', ...f, supported:[...d.supported, {obligationId:d.unsupported[0].obligationId}], approximated:d.approximated, unsupported:d.unsupported}), /classified exactly once/);
  const overlap = structuredClone(d.approximated[0]);
  overlap.lossSemantics = [...overlap.retainedSemantics];
  assert.throws(() => createRepresentationCapacityProfile({profileId:'bad', backend:'fixture', ...f, supported:d.supported, approximated:[overlap], unsupported:d.unsupported}), /both retained and lost/);
});

test('blockers are explicit, cannot target exact support, and deterministically gate export', () => {
  const f = fixture();
  const obligations = deriveRepresentationCapacityObligations(f);
  const inertia = obligations.find((item) => item.semanticPath === 'dynamics.inertia');
  const blocked = profileFor(f, {blockers:[{blockerId:'missing-inertia', obligationIds:[inertia.obligationId], reason:'Target runtime requires exact inertia.'}]});
  assert.equal(blocked.exportable, false);
  assert.throws(() => assertRepresentationCapacityExportable(blocked, f), /blocked/);
  const supportedId = decisions(obligations).supported[0].obligationId;
  const d = decisions(obligations);
  assert.throws(() => createRepresentationCapacityProfile({profileId:'bad',backend:'fixture',...f,...d,blockers:[{blockerId:'bad-blocker',obligationIds:[supportedId],reason:'invalid'}]}), /may not block exactly supported/);
});

test('exact P10 bundle substitution or incomplete persisted obligation inventory fails live binding', () => {
  const original = fixture(2.5);
  const profile = profileFor(original);
  const changed = fixture(3.25);
  assert.equal(validateRepresentationCapacityBindings(profile, changed).valid, false);
  assert.throws(() => assertRepresentationCapacityExportable(profile, changed), /not live/);

  const incomplete = structuredClone(profile);
  const removed = incomplete.obligations.pop();
  incomplete.supported = incomplete.supported.filter((item) => item.obligationId !== removed.obligationId);
  incomplete.approximated = incomplete.approximated.filter((item) => item.obligationId !== removed.obligationId);
  incomplete.unsupported = incomplete.unsupported.filter((item) => item.obligationId !== removed.obligationId);
  const payload = structuredClone(incomplete); delete payload.capacityDigest;
  incomplete.capacityDigest = digestJson(payload);
  assert.equal(validateRepresentationCapacityProfile(incomplete).valid, true);
  assert.match(validateRepresentationCapacityBindings(incomplete, original).errors.join('; '), /stale or incomplete/);
});

test('canonical obligation IDs and capacity digests detect tampering', () => {
  const f = fixture();
  const profile = profileFor(f);
  const tamperedId = structuredClone(profile);
  tamperedId.obligations[0].obligationId = 'invented-obligation';
  const payload = structuredClone(tamperedId); delete payload.capacityDigest;
  tamperedId.capacityDigest = digestJson(payload);
  assert.match(validateRepresentationCapacityProfile(tamperedId).errors.join('; '), /canonical ID/);

  const tamperedDecision = structuredClone(profile);
  tamperedDecision.unsupported[0].reason = 'silently changed';
  assert.equal(validateRepresentationCapacityProfile(tamperedDecision).valid, false);
});

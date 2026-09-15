import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalIdentityGraph,
  createRigidBodyDynamics,
  createSemanticAuthoritySet,
  rigidBodyDynamicsAuthoritySubjectId,
  rigidBodyDynamicsAuthoritySubjectIds,
  rigidBodyDynamicsForLink,
  validateRigidBodyDynamics,
  validateRigidBodyDynamicsAuthority,
  validateRigidBodyDynamicsBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);

function identityGraphInput({sourceSha256 = D()} = {}) {
  return {
    scopeId: 'whole',
    sourceSha256,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'link-a',
        kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'link-b',
        kind: 'rigid-link',
        frame: {parentId: 'module-root', translation_m: [0.4, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
      {
        id: 'part-a',
        kind: 'physical-part',
        frame: {parentId: 'module-root', translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
      },
    ],
    relations: [
      {id: 'contains-link-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']},
      {id: 'contains-link-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-b']},
      {id: 'contains-part-a', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-a']},
      {id: 'part-a-to-link-a', kind: 'AGGREGATES_INTO', sourceId: 'part-a', targetIds: ['link-a']},
    ],
  };
}

function identityGraph(options = {}) {
  return createPhysicalIdentityGraph(identityGraphInput(options));
}

function dynamicsInput(graph = identityGraph()) {
  return {
    scopeId: 'whole',
    sourceSha256: D(),
    identityGraph: graph,
    links: [
      {
        linkId: 'link-b',
        referenceFrameId: 'link-b',
        mass: {value_kg: null},
        centerOfMass: {value_m: null},
        inertia: {tensor_kg_m2: null},
      },
      {
        linkId: 'link-a',
        referenceFrameId: 'link-a',
        mass: {value_kg: 2.5},
        centerOfMass: {value_m: [0.01, -0.02, 0.03]},
        inertia: {
          tensor_kg_m2: [
            [0.02, 0, 0],
            [0, 0.03, 0],
            [0, 0, 0.04],
          ],
        },
      },
    ],
  };
}

function authorityEntry(subjectId, authority, propertyLabel) {
  if (authority === 'observed') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${propertyLabel} is directly supported by source evidence.`,
      basis: [{kind: 'source-evidence', ref: `source:${propertyLabel}`}],
    };
  }
  if (authority === 'inferred') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${propertyLabel} is a bounded physical inference.`,
      reason: 'The source constrains the property without directly measuring it.',
      basis: [{kind: 'structural-prior', ref: `prior:${propertyLabel}`}],
    };
  }
  if (authority === 'engineered') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${propertyLabel} is deliberately engineered.`,
      reason: 'The declared downstream simulation use requires a concrete value.',
      basis: [{kind: 'functional-requirement', ref: `requirement:${propertyLabel}`}],
    };
  }
  if (authority === 'forbidden') {
    return {
      id: `authority-${subjectId.replaceAll(':', '-')}`,
      subjectId,
      authority,
      proposition: `${propertyLabel} is prohibited by a hard constraint.`,
      reason: 'A hard constraint contradicts positive construction of this property.',
      basis: [{kind: 'hard-constraint', ref: `constraint:${propertyLabel}`}],
    };
  }
  return {
    id: `authority-${subjectId.replaceAll(':', '-')}`,
    subjectId,
    authority: 'unknown',
    proposition: `${propertyLabel} is unresolved.`,
    reason: 'Available evidence does not establish a defensible value.',
    basis: [],
  };
}

function authoritySet(dynamics, overrides = {}, {omit = [], extra = []} = {}) {
  const defaults = new Map([
    ['link-a:mass', 'observed'],
    ['link-a:com', 'inferred'],
    ['link-a:inertia', 'engineered'],
    ['link-b:mass', 'unknown'],
    ['link-b:com', 'unknown'],
    ['link-b:inertia', 'unknown'],
  ]);
  const omitted = new Set(omit);
  const entries = [...defaults.entries()]
    .filter(([subjectId]) => !omitted.has(subjectId))
    .map(([subjectId, authority]) => authorityEntry(subjectId, overrides[subjectId] ?? authority, subjectId));
  entries.push(...extra);
  return createSemanticAuthoritySet({
    scopeId: dynamics.scopeId,
    sourceSha256: dynamics.sourceSha256,
    targetSchema: dynamics.schema,
    targetDigest: dynamics.dynamicsDigest,
    entries,
  });
}

test('rigid-body dynamics canonicalizes ordering and preserves unresolved values without defaults', () => {
  const graph = identityGraph();
  const dynamics = createRigidBodyDynamics(dynamicsInput(graph));

  assert.deepEqual(validateRigidBodyDynamics(dynamics), {valid: true, errors: []});
  assert.deepEqual(validateRigidBodyDynamicsBindings(dynamics, graph), {valid: true, errors: []});
  assert.deepEqual(dynamics.links.map((link) => link.linkId), ['link-a', 'link-b']);
  assert.equal(dynamics.links[1].mass.value_kg, null);
  assert.equal(dynamics.links[1].centerOfMass.value_m, null);
  assert.equal(dynamics.links[1].inertia.tensor_kg_m2, null);
  assert.equal(dynamics.policy.fabricatedDefaultsForbidden, true);
  assert.equal(dynamics.policy.referenceFrameIsBoundLink, true);
  assert.deepEqual(rigidBodyDynamicsForLink(dynamics, 'link-a').centerOfMass.value_m, [0.01, -0.02, 0.03]);

  const reorderedInput = dynamicsInput(graph);
  reorderedInput.links.reverse();
  const reordered = createRigidBodyDynamics(reorderedInput);
  assert.equal(reordered.dynamicsDigest, dynamics.dynamicsDigest);
  assert.deepEqual(reordered, dynamics);

  assert.equal(rigidBodyDynamicsAuthoritySubjectId('link-a', 'center-of-mass'), 'link-a:com');
  assert.deepEqual(rigidBodyDynamicsAuthoritySubjectIds(dynamics), [
    'link-a:com', 'link-a:inertia', 'link-a:mass',
    'link-b:com', 'link-b:inertia', 'link-b:mass',
  ]);
});

test('rigid-body dynamics rejects fabricated, nonfinite, and nonphysical values', () => {
  const graph = identityGraph();

  const missingMass = dynamicsInput(graph);
  missingMass.links[0].mass = {};
  assert.throws(() => createRigidBodyDynamics(missingMass), /must be explicit; use null when unresolved/);

  const zeroMass = dynamicsInput(graph);
  zeroMass.links.find((link) => link.linkId === 'link-a').mass.value_kg = 0;
  assert.throws(() => createRigidBodyDynamics(zeroMass), /strictly positive/);

  const nonFiniteCom = dynamicsInput(graph);
  nonFiniteCom.links.find((link) => link.linkId === 'link-a').centerOfMass.value_m = [0, Number.POSITIVE_INFINITY, 0];
  assert.throws(() => createRigidBodyDynamics(nonFiniteCom), /finite number/);

  const asymmetric = dynamicsInput(graph);
  asymmetric.links.find((link) => link.linkId === 'link-a').inertia.tensor_kg_m2 = [
    [1, 0.1, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  assert.throws(() => createRigidBodyDynamics(asymmetric), /must be symmetric/);

  const indefinite = dynamicsInput(graph);
  indefinite.links.find((link) => link.linkId === 'link-a').inertia.tensor_kg_m2 = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ];
  assert.throws(() => createRigidBodyDynamics(indefinite), /positive definite/);

  const impossibleTriangle = dynamicsInput(graph);
  impossibleTriangle.links.find((link) => link.linkId === 'link-a').inertia.tensor_kg_m2 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 3],
  ];
  assert.throws(() => createRigidBodyDynamics(impossibleTriangle), /triangle inequality/);
});

test('rigid-body dynamics binds only rigid-link identities in their own canonical frames', () => {
  const graph = identityGraph();

  const wrongFrame = dynamicsInput(graph);
  wrongFrame.links.find((link) => link.linkId === 'link-a').referenceFrameId = 'link-b';
  assert.throws(() => createRigidBodyDynamics(wrongFrame), /must equal its rigid-link identity/);

  const nonLink = dynamicsInput(graph);
  nonLink.links[0].linkId = 'part-a';
  nonLink.links[0].referenceFrameId = 'part-a';
  assert.throws(() => createRigidBodyDynamics(nonLink), /must be a rigid-link/);

  const unknown = dynamicsInput(graph);
  unknown.links[0].linkId = 'missing-link';
  unknown.links[0].referenceFrameId = 'missing-link';
  assert.throws(() => createRigidBodyDynamics(unknown), /unknown physical identity/);
});

test('rigid-body dynamics binding detects stale physical identity graphs', () => {
  const graph = identityGraph();
  const dynamics = createRigidBodyDynamics(dynamicsInput(graph));

  const changedInput = identityGraphInput();
  changedInput.entities.push({
    id: 'part-b',
    kind: 'physical-part',
    frame: {parentId: 'module-root', translation_m: [0.2, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]},
  });
  changedInput.relations.push({id: 'contains-part-b', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['part-b']});
  const changedGraph = createPhysicalIdentityGraph(changedInput);
  const validation = validateRigidBodyDynamicsBindings(dynamics, changedGraph);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => /exact physical identity graph/.test(error)), true);
});

test('resolved dynamics require construction-authorizing semantic authority while null remains unknown', () => {
  const dynamics = createRigidBodyDynamics(dynamicsInput(identityGraph()));
  const validAuthority = authoritySet(dynamics);
  assert.deepEqual(validateRigidBodyDynamicsAuthority(dynamics, validAuthority), {
    valid: true,
    errors: [],
    missingSubjectIds: [],
    unknownSubjectIds: [],
  });

  const resolvedUnknown = authoritySet(dynamics, {'link-a:mass': 'unknown'});
  const resolvedUnknownValidation = validateRigidBodyDynamicsAuthority(dynamics, resolvedUnknown);
  assert.equal(resolvedUnknownValidation.valid, false);
  assert.equal(resolvedUnknownValidation.errors.some((error) => /resolved mass requires/.test(error)), true);

  const unresolvedEngineered = authoritySet(dynamics, {'link-b:mass': 'engineered'});
  const unresolvedEngineeredValidation = validateRigidBodyDynamicsAuthority(dynamics, unresolvedEngineered);
  assert.equal(unresolvedEngineeredValidation.valid, false);
  assert.equal(unresolvedEngineeredValidation.errors.some((error) => /unresolved mass requires unknown authority/.test(error)), true);

  const forbiddenResolved = authoritySet(dynamics, {'link-a:mass': 'forbidden'});
  assert.equal(validateRigidBodyDynamicsAuthority(dynamics, forbiddenResolved).valid, false);
});

test('dynamics authority must cover exact property subjects and exact contract digest', () => {
  const dynamics = createRigidBodyDynamics(dynamicsInput(identityGraph()));

  const missing = authoritySet(dynamics, {}, {omit: ['link-b:inertia']});
  const missingValidation = validateRigidBodyDynamicsAuthority(dynamics, missing);
  assert.equal(missingValidation.valid, false);
  assert.deepEqual(missingValidation.missingSubjectIds, ['link-b:inertia']);

  const extraEntry = authorityEntry('unrelated-property', 'unknown', 'unrelated-property');
  const extra = authoritySet(dynamics, {}, {extra: [extraEntry]});
  const extraValidation = validateRigidBodyDynamicsAuthority(dynamics, extra);
  assert.equal(extraValidation.valid, false);
  assert.deepEqual(extraValidation.unknownSubjectIds, ['unrelated-property']);

  const stale = createSemanticAuthoritySet({
    scopeId: dynamics.scopeId,
    sourceSha256: dynamics.sourceSha256,
    targetSchema: dynamics.schema,
    targetDigest: D('f'),
    entries: authoritySet(dynamics).entries.map(({authorityDigest: _authorityDigest, capabilities: _capabilities, ...entry}) => entry),
  });
  const staleValidation = validateRigidBodyDynamicsAuthority(dynamics, stale);
  assert.equal(staleValidation.valid, false);
  assert.equal(staleValidation.errors.some((error) => /exact rigid-body dynamics contract/.test(error)), true);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRelationalStructure,
  createSemanticAuthoritySet,
  digestJson,
  semanticAuthorityCapabilities,
  validateRelationalAuthorityCoverage,
  validateSemanticAuthoritySet,
  validateSemanticAuthorityTransition,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

function structureFixture() {
  return createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'left-marker', kind: 'landmark'},
      {id: 'right-marker', kind: 'landmark'},
      {id: 'top-marker', kind: 'landmark'},
      {id: 'bottom-marker', kind: 'landmark'},
      {id: 'outer-volume', kind: 'volume'},
      {id: 'inner-volume', kind: 'volume'},
    ],
    relations: [
      {id: 'global-span', kind: 'distance-ratio', scope: 'whole-system', importance: 'identity', entityIds: ['left-marker', 'right-marker', 'top-marker', 'bottom-marker'], range: [.2, .5], basisRefs: ['source:front']},
      {id: 'volume-balance', kind: 'volume-ratio', scope: 'whole-system', importance: 'macro', entityIds: ['outer-volume', 'inner-volume'], range: [1.2, 4], basisRefs: ['prior:structure']},
      {id: 'local-centering', kind: 'alignment', scope: 'local', importance: 'detail', entityIds: ['left-marker', 'right-marker'], mode: 'symmetric', basisRefs: ['source:front']},
    ],
  });
}

function authoritySet(structure) {
  return createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: structure.schema, targetDigest: structure.structureDigest,
    entries: [
      {
        id: 'authority-global-span', subjectId: 'global-span', authority: 'observed',
        proposition: 'The paired span has a source-supported whole-system proportion.',
        basis: [{kind: 'source-evidence', ref: 'source:front'}],
      },
      {
        id: 'authority-volume-balance', subjectId: 'volume-balance', authority: 'inferred',
        proposition: 'The hidden volume balance is a structural hypothesis.', reason: 'Multiple visible relations require a coherent three-dimensional continuation.',
        basis: [{kind: 'structural-prior', ref: 'prior:coherent-volume'}],
      },
    ],
  });
}

test('UNKNOWN is distinct from FORBIDDEN', () => {
  const unknown = semanticAuthorityCapabilities({authority: 'unknown'});
  const forbidden = semanticAuthorityCapabilities({authority: 'forbidden'});
  assert.equal(unknown.canInstantiateConstruction, false);
  assert.equal(unknown.prohibitsConstruction, false);
  assert.equal(unknown.requiresResolutionBeforePositiveClaim, true);
  assert.equal(forbidden.canInstantiateConstruction, false);
  assert.equal(forbidden.prohibitsConstruction, true);
});

test('ENGINEERED may instantiate construction but cannot assert a source fact', () => {
  const set = createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: 'example/v1', targetDigest: D('b'),
    entries: [{
      id: 'hidden-support-authority', subjectId: 'hidden-support', authority: 'engineered',
      proposition: 'A concealed support is instantiated for the declared downstream load path.',
      reason: 'The downstream use requires a continuous support path while the source does not resolve the interior.',
      basis: [{kind: 'downstream-requirement', ref: 'requirement:load-path'}],
    }],
  });
  assert.equal(validateSemanticAuthoritySet(set).valid, true);
  assert.equal(set.entries[0].capabilities.canInstantiateConstruction, true);
  assert.equal(set.entries[0].capabilities.canAssertSourceFact, false);
  assert.equal(set.policy.engineeredIsNotObserved, true);
});

test('ENGINEERED without a functional or downstream requirement fails closed', () => {
  assert.throws(() => createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: 'example/v1', targetDigest: D('b'),
    entries: [{
      id: 'unsupported-engineering', subjectId: 'hidden-support', authority: 'engineered', proposition: 'Add a hidden support.',
      reason: 'Convenient to model.', basis: [{kind: 'structural-prior', ref: 'prior:generic'}],
    }],
  }), /ENGINEERED requires/);
});

test('OBSERVED cannot be manufactured by relabeling an engineered requirement and re-digesting', () => {
  const engineered = createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: 'example/v1', targetDigest: D('b'),
    entries: [{
      id: 'support-authority', subjectId: 'hidden-support', authority: 'engineered', proposition: 'A support is added for use.',
      reason: 'Required by declared use.', basis: [{kind: 'functional-requirement', ref: 'requirement:support'}],
    }],
  });
  const forged = structuredClone(engineered);
  forged.entries[0].authority = 'observed';
  forged.entries[0].capabilities.canAssertSourceFact = true;
  forged.entries[0].capabilities.canInstantiateConstruction = true;
  forged.entries[0].capabilities.requiresResolutionBeforePositiveClaim = false;
  forged.entries[0].authorityDigest = digestJson(Object.fromEntries(Object.entries(forged.entries[0]).filter(([key]) => key !== 'authorityDigest')));
  forged.authoritySetDigest = digestJson(Object.fromEntries(Object.entries(forged).filter(([key]) => key !== 'authoritySetDigest')));
  const validation = validateSemanticAuthoritySet(forged);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => /OBSERVED requires source-evidence/.test(error)), true);
});

test('FORBIDDEN requires explicit contradiction or hard constraint', () => {
  const set = createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: 'example/v1', targetDigest: D('b'),
    entries: [{
      id: 'forbidden-overhang', subjectId: 'overhang', authority: 'forbidden', proposition: 'This overhang may not be constructed.',
      reason: 'It violates an explicit envelope constraint.', basis: [{kind: 'hard-constraint', ref: 'constraint:envelope'}],
    }],
  });
  assert.equal(set.entries[0].capabilities.prohibitsConstruction, true);
  assert.throws(() => createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: 'example/v1', targetDigest: D('b'),
    entries: [{id: 'bad-forbidden', subjectId: 'other', authority: 'forbidden', proposition: 'Do not build.', reason: 'No reasoned prohibition.', basis: []}],
  }), /FORBIDDEN requires/);
});

test('UNKNOWN may transition to ENGINEERED only with explicit requirement basis', () => {
  const previous = {id: 'unknown-support', subjectId: 'support', authority: 'unknown', proposition: 'The interior support is unresolved.', reason: 'The source does not show the interior.', basis: []};
  const next = {id: 'engineered-support', subjectId: 'support', authority: 'engineered', proposition: 'A support is deliberately introduced.', reason: 'Required for declared downstream use.', basis: [{kind: 'functional-requirement', ref: 'requirement:stable-support'}]};
  assert.equal(validateSemanticAuthorityTransition(previous, next).valid, true);
  const invalid = {...next, basis: [{kind: 'structural-prior', ref: 'prior:support'}]};
  assert.equal(validateSemanticAuthorityTransition(previous, invalid).valid, false);
});

test('authority coverage binds the exact relational structure and all whole-system relations', () => {
  const structure = structureFixture(), set = authoritySet(structure);
  const coverage = validateRelationalAuthorityCoverage(set, structure);
  assert.equal(coverage.valid, true);
  assert.deepEqual(coverage.missingSubjectIds, []);

  const stale = structuredClone(set);
  stale.targetDigest = D('f');
  stale.authoritySetDigest = digestJson(Object.fromEntries(Object.entries(stale).filter(([key]) => key !== 'authoritySetDigest')));
  const staleCoverage = validateRelationalAuthorityCoverage(stale, structure);
  assert.equal(staleCoverage.valid, false);
  assert.equal(staleCoverage.errors.some((error) => /exact relational structure/.test(error)), true);
});

test('missing whole-system authority is reported while local detail authority is optional', () => {
  const structure = structureFixture();
  const partial = createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: structure.schema, targetDigest: structure.structureDigest,
    entries: [{id: 'span-only', subjectId: 'global-span', authority: 'observed', proposition: 'Span is visible.', basis: [{kind: 'source-evidence', ref: 'source:front'}]}],
  });
  const coverage = validateRelationalAuthorityCoverage(partial, structure);
  assert.equal(coverage.valid, false);
  assert.deepEqual(coverage.missingSubjectIds, ['volume-balance']);
  assert.equal(coverage.missingSubjectIds.includes('local-centering'), false);
});

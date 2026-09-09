import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRelationalStructure,
  createSemanticAuthoritySet,
  createWholeSystemRelationalBarrier,
  routeRelationalBarrier,
  validateWholeSystemRelationalBarrier,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c = 'a') => c.repeat(64);

function structureFixture() {
  return createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'left', kind: 'landmark'},
      {id: 'right', kind: 'landmark'},
      {id: 'top', kind: 'landmark'},
      {id: 'bottom', kind: 'landmark'},
      {id: 'front-plane', kind: 'plane'},
      {id: 'side-plane', kind: 'plane'},
    ],
    relations: [
      {id: 'global-span', kind: 'distance-ratio', scope: 'whole-system', importance: 'identity', entityIds: ['left', 'right', 'top', 'bottom'], range: [.2, .5], basisRefs: ['source:front']},
      {id: 'plane-turn', kind: 'plane-chain', scope: 'whole-system', importance: 'macro', entityIds: ['front-plane', 'side-plane'], continuity: 'broken', basisRefs: ['source:oblique']},
      {id: 'local-symmetry', kind: 'alignment', scope: 'local', importance: 'detail', entityIds: ['left', 'right'], mode: 'symmetric', basisRefs: ['source:front']},
    ],
  });
}

function authorityFixture(structure, overrides = {}) {
  const classes = {span: 'observed', plane: 'inferred', ...overrides};
  const entries = [
    {
      id: 'authority-global-span', subjectId: 'global-span', authority: classes.span,
      proposition: 'The paired span is constrained at whole-system scale.',
      ...(classes.span === 'observed' ? {} : {reason: 'Current evidence does not directly establish the relation.'}),
      basis: classes.span === 'observed'
        ? [{kind: 'source-evidence', ref: 'source:front'}]
        : classes.span === 'unknown' ? []
          : classes.span === 'forbidden' ? [{kind: 'hard-constraint', ref: 'constraint:no-span'}]
            : [{kind: 'structural-prior', ref: 'prior:paired-span'}],
    },
    {
      id: 'authority-plane-turn', subjectId: 'plane-turn', authority: classes.plane,
      proposition: 'The visible plane transition continues as a coherent three-dimensional turn.',
      ...(classes.plane === 'observed' ? {} : {reason: 'The source constrains the transition but does not expose every hidden surface.'}),
      basis: classes.plane === 'observed'
        ? [{kind: 'source-evidence', ref: 'source:oblique'}]
        : classes.plane === 'unknown' ? []
          : classes.plane === 'forbidden' ? [{kind: 'source-contradiction', ref: 'source:contradiction'}]
            : [{kind: 'relation', ref: 'relation:plane-chain'}],
    },
  ];
  return createSemanticAuthoritySet({
    scopeId: 'whole', sourceSha256: D(), targetSchema: structure.schema, targetDigest: structure.structureDigest, entries,
  });
}

function passingChecks() {
  return [
    {relationId: 'global-span', status: 'pass', evidenceRefs: ['review:registered-front']},
    {relationId: 'plane-turn', status: 'pass', evidenceRefs: ['review:oblique-plane']},
  ];
}

const checkpoints = [
  {id: 'cp-observation', parentId: null, capability: 'visual-observation', scopeId: 'whole'},
  {id: 'cp-spatial', parentId: 'cp-observation', capability: 'spatial-hypotheses', scopeId: 'whole'},
  {id: 'cp-shape', parentId: 'cp-spatial', capability: 'shape-reconstruction', scopeId: 'whole'},
];

test('passing macro and identity relations authorize local hardening', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure);
  const barrier = createWholeSystemRelationalBarrier({relationalStructure: structure, authoritySet, relationChecks: passingChecks()});
  assert.equal(validateWholeSystemRelationalBarrier(barrier, {relationalStructure: structure, authoritySet}).valid, true);
  assert.equal(barrier.status, 'PASS');
  assert.equal(barrier.mayHardenLocal, true);
  assert.deepEqual(barrier.requiredRelationIds, ['global-span', 'plane-turn']);
  assert.equal(barrier.requiredRelationIds.includes('local-symmetry'), false);
});

test('UNKNOWN authority blocks positive local construction without becoming FORBIDDEN', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure, {plane: 'unknown'});
  const barrier = createWholeSystemRelationalBarrier({relationalStructure: structure, authoritySet, relationChecks: passingChecks()});
  assert.equal(barrier.status, 'BLOCKED');
  assert.equal(barrier.mayHardenLocal, false);
  assert.equal(barrier.blockers.includes('AUTHORITY_UNKNOWN:plane-turn'), true);
  assert.equal(barrier.blockers.some((item) => item.startsWith('AUTHORITY_FORBIDDEN:plane-turn')), false);

  const route = routeRelationalBarrier({barrier, relationalStructure: structure, authoritySet, checkpoints, headId: 'cp-shape'});
  assert.equal(route.action, 'REOPEN_CAPABILITY');
  assert.equal(route.ownerCapability, 'spatial-hypotheses');
  assert.equal(route.rollbackCheckpointId, 'cp-observation');
});

test('FORBIDDEN authority is an explicit construction blocker', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure, {plane: 'forbidden'});
  const barrier = createWholeSystemRelationalBarrier({relationalStructure: structure, authoritySet, relationChecks: passingChecks()});
  assert.equal(barrier.blockers.includes('AUTHORITY_FORBIDDEN:plane-turn'), true);
  const route = routeRelationalBarrier({barrier, relationalStructure: structure, authoritySet, checkpoints, headId: 'cp-shape'});
  assert.equal(route.action, 'REOPEN_CAPABILITY');
  assert.equal(route.finding.category, 'relational-constraint-conflict');
  assert.equal(route.ownerCapability, 'spatial-hypotheses');
});

test('a failed whole-system relation routes back to shape reconstruction', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure);
  const checks = passingChecks().map((check) => check.relationId === 'global-span' ? {...check, status: 'fail'} : check);
  const barrier = createWholeSystemRelationalBarrier({relationalStructure: structure, authoritySet, relationChecks: checks});
  assert.equal(barrier.blockers.includes('RELATION_FAILED:global-span'), true);
  const route = routeRelationalBarrier({barrier, relationalStructure: structure, authoritySet, checkpoints, headId: 'cp-shape'});
  assert.equal(route.action, 'REOPEN_CAPABILITY');
  assert.equal(route.finding.category, 'whole-system-relation-mismatch');
  assert.equal(route.ownerCapability, 'shape-reconstruction');
  assert.equal(route.rollbackCheckpointId, 'cp-spatial');
});

test('an unresolved relation requests more evidence instead of guessing a rollback owner', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure);
  const checks = passingChecks().map((check) => check.relationId === 'plane-turn' ? {...check, status: 'unresolved', evidenceRefs: []} : check);
  const barrier = createWholeSystemRelationalBarrier({relationalStructure: structure, authoritySet, relationChecks: checks});
  const route = routeRelationalBarrier({barrier, relationalStructure: structure, authoritySet, checkpoints, headId: 'cp-shape'});
  assert.equal(route.action, 'REQUEST_REVIEW');
  assert.equal(route.finding.category, 'evidence-insufficient');
});

test('barrier checks must exactly cover whole-system macro and identity obligations', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure);
  assert.throws(() => createWholeSystemRelationalBarrier({
    relationalStructure: structure, authoritySet,
    relationChecks: [{relationId: 'global-span', status: 'pass', evidenceRefs: ['review:front']}],
  }), /exactly cover whole-system obligations/);
});

test('stale authority cannot authorize a changed relational structure', () => {
  const structure = structureFixture();
  const authoritySet = authorityFixture(structure);
  const changed = createRelationalStructure({
    scopeId: 'whole', sourceSha256: D(),
    entities: structure.entities,
    relations: structure.relations.map((relation) => relation.id === 'global-span' ? {...relation, range: [.1, .6]} : relation),
    basisRefs: structure.basisRefs,
  });
  assert.throws(() => createWholeSystemRelationalBarrier({relationalStructure: changed, authoritySet, relationChecks: passingChecks()}), /exact relational structure/);
});

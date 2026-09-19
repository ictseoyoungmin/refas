import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  buildAllVolumeClosureRegressionFixtures,
  buildVolumeClosureRegressionFixture,
  volumeClosureRegressionManifest,
} from './fixtures/volume-closure-regression-fixtures.mjs';

const IDS = [
  'gpt-planar-bird-surrogate',
  'claude-volumetric-bird-surrogate',
  'intentionally-thin-panel',
  'synthetic-degenerate-volume',
];

const byId = (fixtures, id) => fixtures.find((entry) => entry.fixture.id === id);
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;

test('VC00 locks the four required regression oracles without claiming a classifier', () => {
  const manifest = volumeClosureRegressionManifest();
  assert.equal(manifest.schema, 'refas.vc00-regression-fixture-set/v1');
  assert.equal(manifest.slice, 'VC00');
  assert.deepEqual(manifest.cases.map((entry) => entry.id), IDS);
  assert.equal(manifest.policy.oracleOnly, true);
  assert.equal(manifest.policy.notProductionClassificationRules, true);
  assert.equal(manifest.policy.universalThicknessThresholdForbidden, true);

  const oracle = Object.fromEntries(manifest.cases.map((entry) => [entry.id, entry.oracle.planarCollapse]));
  assert.deepEqual(oracle, {
    'gpt-planar-bird-surrogate': 'MUST_FAIL',
    'claude-volumetric-bird-surrogate': 'MUST_NOT_FAIL',
    'intentionally-thin-panel': 'MUST_NOT_FAIL',
    'synthetic-degenerate-volume': 'MUST_FAIL',
  });
  assert.equal(
    manifest.cases.find((entry) => entry.id === 'intentionally-thin-panel').oracle.thinnessSemantics,
    'MUST_PASS',
  );
});

test('VC00 historical cases preserve provenance limits instead of impersonating lost dogfood bytes', () => {
  const manifest = volumeClosureRegressionManifest();
  for (const id of ['gpt-planar-bird-surrogate', 'claude-volumetric-bird-surrogate']) {
    const entry = manifest.cases.find((item) => item.id === id);
    assert.equal(entry.sourceKind, 'historical-surrogate');
    assert.equal(entry.exactHistoricalArtifactAvailable, false);
    assert.equal(entry.geometrySource, 'deterministic-surrogate');
    assert.ok(entry.historicalObservation.length >= 3);
  }
  for (const id of ['intentionally-thin-panel', 'synthetic-degenerate-volume']) {
    const entry = manifest.cases.find((item) => item.id === id);
    assert.match(entry.sourceKind, /^synthetic-/u);
    assert.equal(entry.exactHistoricalArtifactAvailable, null);
    assert.equal(entry.geometrySource, 'deterministic-synthetic');
  }
});

test('VC00 fixture GLBs are valid and byte-deterministic', () => {
  for (const id of IDS) {
    const first = buildVolumeClosureRegressionFixture(id);
    const second = buildVolumeClosureRegressionFixture(id);
    assert.equal(first.glbSha256, second.glbSha256, `${id} GLB digest drifted`);
    assert.ok(first.glb.equals(second.glb), `${id} GLB bytes drifted`);
    assert.equal(first.inspection.valid, true);
    assert.equal(first.inspection.meshCount, first.parts.length);
    assert.deepEqual(first.inspection.partIds, first.parts.map((entry) => entry.id));
    assert.equal(first.inspection.extras.refas.regressionOracleOnly, true);
    assert.equal(first.inspection.extras.refas.fixtureId, id);
  }
});

test('VC00 geometry controls deliberately defeat a universal thickness cutoff', () => {
  const fixtures = buildAllVolumeClosureRegressionFixtures();
  const planar = byId(fixtures, 'gpt-planar-bird-surrogate');
  const volumetric = byId(fixtures, 'claude-volumetric-bird-surrogate');
  const thin = byId(fixtures, 'intentionally-thin-panel');
  const degenerate = byId(fixtures, 'synthetic-degenerate-volume');

  // Construction sanity only: these values describe frozen fixtures, not production classification rules.
  assert.ok(near(planar.bounds.extent[0], thin.bounds.extent[0]));
  assert.ok(near(planar.bounds.extent[1], thin.bounds.extent[1]));
  assert.ok(thin.bounds.extent[2] < planar.bounds.extent[2]);
  assert.equal(thin.fixture.oracle.planarCollapse, 'MUST_NOT_FAIL');
  assert.equal(planar.fixture.oracle.planarCollapse, 'MUST_FAIL');

  assert.ok(degenerate.bounds.extent[2] < thin.bounds.extent[2]);
  assert.equal(degenerate.fixture.futureSpatialExpectation, 'volumetric');
  assert.equal(degenerate.fixture.oracle.planarCollapse, 'MUST_FAIL');

  assert.ok(volumetric.bounds.extent[2] > planar.bounds.extent[2]);
  assert.equal(volumetric.fixture.oracle.planarCollapse, 'MUST_NOT_FAIL');

  // A monotonic rule based only on global depth cannot satisfy both the planar failure and thinner legitimate panel.
  assert.equal(thin.bounds.extent[2] < planar.bounds.extent[2], true);
  assert.notEqual(thin.fixture.oracle.planarCollapse, planar.fixture.oracle.planarCollapse);
});

test('VC00 fixture set is self-contained and each case has a distinct deterministic digest', () => {
  const fixtures = buildAllVolumeClosureRegressionFixtures();
  assert.equal(fixtures.length, 4);
  assert.equal(new Set(fixtures.map((entry) => entry.glbSha256)).size, 4);
  for (const entry of fixtures) {
    assert.ok(entry.bounds.extent.every((value) => Number.isFinite(value) && value > 0));
    assert.ok(entry.parts.every((part) => part.mesh.analysis.valid && part.mesh.analysis.watertight));
  }
});

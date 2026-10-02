import assert from 'node:assert/strict';
import test from 'node:test';
import {assessBenchmarkCapabilityClosure, createBenchmarkMatrix, validateBenchmarkMatrix} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
function source(id, digest) { return {kind: 'measurement-fixture', path: `measurement/${id}.json`, sha256: digest, sizeBytes: 10}; }
function observation(referenceClass, ms = 1200) {
  return {
    schema: 'refas.first-multiview-observation/v1', referenceClass,
    firstNeutralClayMultiviewMs: ms,
    uniquePublicOperationsBeforeFirstMultiview: 2,
    publicOperationIdsBeforeFirstMultiview: ['appearance/pbr-render-report', 'observation/visual-hierarchy'],
    turns: {available: false, value: null}, tokens: {available: false, value: null},
    multiviewProof: {reportSha256: D('a'), reportDigest: D('b'), viewIds: ['albedo', 'grazing', 'hero', 'oblique', 'side', 'top']},
    measurement: {clock: 'monotonic-wall-clock', worker: 'fresh-worker', fixtureSemantics: 'operational-cost-proxy'},
    policy: {observationOnly: true, certificationAuthority: false, qualityAuthority: false, noPassFailThreshold: true},
  };
}

test('benchmark matrix carries first-multiview observations for three reference classes without creating closure', () => {
  const categories = ['articulated-manufactured-organic', 'hard-surface-mechanical', 'irregular-nonmechanical'];
  const matrix = createBenchmarkMatrix({id: 'timing-baseline', benchmarks: categories.map((category, index) => ({
    id: `case-${index + 1}`, category, source: source(`case-${index + 1}`, ['c', 'd', 'e'][index].repeat(64)),
    status: 'observed', firstMultiviewObservation: observation(category, 1000 + index * 100),
  }))});
  assert.deepEqual(validateBenchmarkMatrix(matrix), {valid: true, errors: []});
  assert.equal(matrix.benchmarks.every((item) => item.firstMultiviewObservation.policy.observationOnly), true);
  assert.equal(matrix.policy.firstMultiviewMetricsNeverCertifyQuality, true);
  const closure = assessBenchmarkCapabilityClosure(matrix, 'shape-reconstruction');
  assert.equal(closure.complete, false, 'observational timing must not count as capability closure');
  assert.deepEqual(closure.materiallyDifferentCategories, []);
});

test('first-multiview observations reject authority promotion and inconsistent operation counts', () => {
  const category = 'hard-surface-mechanical';
  assert.throws(() => createBenchmarkMatrix({id: 'bad-authority', benchmarks: [
    {id: 'a', category, source: source('a', D('c')), firstMultiviewObservation: {...observation(category), policy: {observationOnly: true, certificationAuthority: true, qualityAuthority: false, noPassFailThreshold: true}}},
    {id: 'b', category: 'irregular-nonmechanical', source: source('b', D('d'))},
  ]}), /observation-only/u);
  assert.throws(() => createBenchmarkMatrix({id: 'bad-count', benchmarks: [
    {id: 'a', category, source: source('a', D('c')), firstMultiviewObservation: {...observation(category), uniquePublicOperationsBeforeFirstMultiview: 3}},
    {id: 'b', category: 'irregular-nonmechanical', source: source('b', D('d'))},
  ]}), /operation count/u);
});

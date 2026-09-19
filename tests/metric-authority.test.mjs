import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  assertMetricUseAllowed,
  createParameterFitPlan,
  isIouDerivedMetric,
  metricAuthority,
  rankDiscrepancyCandidates,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c) => c.repeat(64);
const baseline = {schema:'refas.content-reference/v1',kind:'glb',path:'asset.glb',sha256:D('a'),sizeBytes:1};

test('single-view IoU is forbidden everywhere', () => {
  assert.equal(isIouDerivedMetric('silhouetteIoU'), true);
  assert.equal(metricAuthority('silhouetteIoU').authority, 'FORBIDDEN_SINGLE_VIEW_IOU');
  for (const use of ['objective','ranking','correspondence-gate','diagnostic','resemblance','certification']) {
    assert.throws(() => assertMetricUseAllowed('silhouetteIoU', use), /FORBIDDEN_SINGLE_VIEW_IOU/);
  }
});

test('multiview IoU is correspondence-only and never ranks or optimizes', () => {
  const context = {sourceViewCount:2, independentlySourceBackedViewCount:2, registeredSourceViewCount:2};
  const authority = metricAuthority('segment-iou', context);
  assert.equal(authority.authority, 'CORRESPONDENCE_AID');
  assert.doesNotThrow(() => assertMetricUseAllowed('segment-iou', 'correspondence-gate', context));
  assert.doesNotThrow(() => assertMetricUseAllowed('segment-iou', 'diagnostic', context));
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'objective', context), /cannot be used for objective/);
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'ranking', context), /cannot be used for ranking/);
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'resemblance', context), /cannot be used for resemblance/);
});

test('generic shape parameter fitting rejects IoU-derived objective aliases', () => {
  const base = {
    id:'fit', scopeId:'whole', sourceSha256:D('b'), baselineAsset:baseline,
    parameters:[
      {id:'a',binding:'model.shape.a',minimum:0,maximum:1,initial:.5},
      {id:'b',binding:'model.shape.b',minimum:0,maximum:1,initial:.5},
    ],
    optimizer:{populationSize:4,evaluationBudget:5},
  };
  for (const id of ['silhouette-iou','segment-iou-loss','negative-space-loss']) {
    assert.throws(() => createParameterFitPlan({...base,objectives:[{id,goal:'minimize'}]}), /cannot be used for objective/);
  }
});

test('candidate ranking requires an explicit non-IoU metric', () => {
  const candidates=[{id:'a',metrics:{edgeDisagreement:.4,silhouetteIoU:.9}},{id:'b',metrics:{edgeDisagreement:.2,silhouetteIoU:.8}}];
  assert.throws(() => rankDiscrepancyCandidates(candidates), /metric is required/);
  assert.throws(() => rankDiscrepancyCandidates(candidates,{metric:'silhouetteIoU',direction:'max'}), /cannot be used for ranking/);
  assert.deepEqual(rankDiscrepancyCandidates(candidates,{metric:'edgeDisagreement',direction:'min'}).map(x=>x.id),['b','a']);
});

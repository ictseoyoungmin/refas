import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  assertMetricUseAllowed,
  createParameterFitPlan,
  createPerceptualDiscrepancy,
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
      {id:'aa',binding:'model.shape.a',minimum:0,maximum:1,initial:.5},
      {id:'bb',binding:'model.shape.b',minimum:0,maximum:1,initial:.5},
    ],
    optimizer:{populationSize:4,evaluationBudget:5},
  };
  for (const id of ['silhouette-iou','segment-iou-loss','negative-space-loss']) {
    assert.throws(() => createParameterFitPlan({...base,objectives:[{id,goal:'minimize'}]}), /cannot be used for objective/);
  }
});


test('single-view perceptual evidence does not emit IoU values', () => {
  const raster = (values) => ({width:2,height:2,channels:1,data:values});
  const report = createPerceptualDiscrepancy({
    source:raster([255,255,0,0]),
    render:raster([255,0,255,0]),
    sourceSha256:D('c'),
    assetSha256:D('d'),
    segmentMasks:[{id:'part',source:[1,1,0,0],render:[1,0,1,0]}],
    negativeSpaceMasks:[{id:'gap',source:[0,0,1,1],render:[0,1,0,1]}],
  });
  assert.equal(report.metrics.silhouetteIoU, null);
  assert.equal(report.metrics.segmentMeanIoU, null);
  assert.equal(report.metrics.negativeSpaceMeanIoU, null);
  assert.equal(report.segments[0].iou, null);
  assert.equal(report.negativeSpaces[0].iou, null);
  assert.equal(report.policy.iouAuthority, 'FORBIDDEN_SINGLE_VIEW_IOU');
});

test('explicit multiview context admits IoU only as correspondence evidence', () => {
  const raster = (values) => ({width:2,height:2,channels:1,data:values});
  const report = createPerceptualDiscrepancy({
    source:raster([255,255,0,0]),
    render:raster([255,0,255,0]),
    sourceSha256:D('e'),
    assetSha256:D('f'),
    sourceViewContext:{sourceViewCount:2,independentlySourceBackedViewCount:2,registeredSourceViewCount:2},
  });
  assert.equal(typeof report.metrics.silhouetteIoU, 'number');
  assert.equal(report.policy.iouAuthority, 'CORRESPONDENCE_AID');
  assert.throws(() => rankDiscrepancyCandidates([{id:'x',metrics:report.metrics},{id:'y',metrics:report.metrics}],{metric:'silhouetteIoU'}), /cannot be used for ranking/);
});

test('candidate ranking requires an explicit non-IoU metric', () => {
  const candidates=[{id:'a',metrics:{edgeDisagreement:.4,silhouetteIoU:.9}},{id:'b',metrics:{edgeDisagreement:.2,silhouetteIoU:.8}}];
  assert.throws(() => rankDiscrepancyCandidates(candidates), /metric is required/);
  assert.throws(() => rankDiscrepancyCandidates(candidates,{metric:'silhouetteIoU',direction:'max'}), /cannot be used for ranking/);
  assert.deepEqual(rankDiscrepancyCandidates(candidates,{metric:'edgeDisagreement',direction:'min'}).map(x=>x.id),['b','a']);
});

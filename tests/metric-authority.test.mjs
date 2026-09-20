import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAppearanceFitPlan,
  createCameraFitPlan,
  createLightingCalibrationPlan,
  createParameterFitPlan,
  createPerceptualDiscrepancy,
  createPoseFitPlan,
  digestJson,
  rankDiscrepancyCandidates,
} from '../skills/refas/scripts/lib/index.mjs';
import {assertMetricUseAllowed, isIouDerivedMetric, metricAuthority} from '../skills/refas/scripts/lib/metric-authority.mjs';

const D = (c) => c.repeat(64);
const H = (value) => ((Number.parseInt(value, 16) || 0) % 16).toString(16);
const baseline = {schema:'refas.content-reference/v1',kind:'glb',path:'asset.glb',sha256:D('a'),sizeBytes:1};

function registeredComparison({sourceSha256, registrationDigest, candidateAssetSha256, salt}) {
  const report = {
    schema:'refas.registered-comparison/v1',
    claimScope:'critique-evidence-only',
    source:{sha256:sourceSha256,manifestSha256:D(salt),acquisitionKind:''},
    render:{assetSha256:candidateAssetSha256,frameId:'hero',frameSha256:D(H((Number.parseInt(salt,16)+1).toString(16))),reportSha256:D(H((Number.parseInt(salt,16)+2).toString(16)))},
    registration:{digest:registrationDigest,fileSha256:D(H((Number.parseInt(salt,16)+3).toString(16))),model:'affine',metrics:{}},
    hierarchy:{digest:D(H((Number.parseInt(salt,16)+4).toString(16))),fileSha256:D(H((Number.parseInt(salt,16)+5).toString(16)))},
    projectionEvidence:[],
    scopes:[{
      scopeId:'whole',level:'whole',ancestry:['whole'],measurementAuthority:'image-only',projectionBinding:null,
      metrics:{silhouetteIoU:null},landmarks:[],dimensions:[],images:[],
    }],
    policy:{
      rawSourceRemainsPrimary:true,outputsAreDerivedObservationAids:true,metricsCannotSetVisualGate:true,
      metricFailureRequiresTypedFindingBeforeRouting:true,registrationResidualIsNotShapeTruth:true,
      realSourceLandmarksMustUseRealizedProjection:true,manualRenderCoordinatesCannotClaimRealSourceGeometry:true,
      projectionMetricsRemainVetoOnly:true,singleViewIouDisabled:true,
    },
    inputDigest:D(H((Number.parseInt(salt,16)+6).toString(16))),
  };
  report.comparisonDigest = digestJson(report);
  return report;
}

test('single-view IoU is forbidden everywhere', () => {
  assert.equal(isIouDerivedMetric('silhouetteIoU'), true);
  assert.equal(metricAuthority('silhouetteIoU').authority, 'FORBIDDEN_SINGLE_VIEW_IOU');
  for (const use of ['objective','ranking','correspondence-gate','diagnostic','resemblance','certification']) {
    assert.throws(() => assertMetricUseAllowed('silhouetteIoU', use), /FORBIDDEN_SINGLE_VIEW_IOU/);
  }
});

test('multiview IoU is correspondence-only and never ranks or optimizes', () => {
  const context = {
    registeredComparisons:[
      {viewId:'front',report:registeredComparison({sourceSha256:D('1'),registrationDigest:D('2'),candidateAssetSha256:D('3'),salt:'4'})},
      {viewId:'side',report:registeredComparison({sourceSha256:D('5'),registrationDigest:D('6'),candidateAssetSha256:D('3'),salt:'7'})},
    ],
    currentViewId:'front',
    currentSourceSha256:D('1'),
    currentCandidateAssetSha256:D('3'),
  };
  const authority = metricAuthority('segment-iou', context);
  assert.equal(authority.authority, 'CORRESPONDENCE_AID');
  assert.doesNotThrow(() => assertMetricUseAllowed('segment-iou', 'correspondence-gate', context));
  assert.doesNotThrow(() => assertMetricUseAllowed('segment-iou', 'diagnostic', context));
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'objective', context), /cannot be used for objective/);
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'ranking', context), /cannot be used for ranking/);
  assert.throws(() => assertMetricUseAllowed('segment-iou', 'resemblance', context), /cannot be used for resemblance/);
});

test('count-only multiview claims cannot re-enable IoU', () => {
  const authority = metricAuthority('silhouetteIoU', {
    sourceViewCount:2,
    independentlySourceBackedViewCount:2,
    registeredSourceViewCount:2,
  });
  assert.equal(authority.authority, 'FORBIDDEN_SINGLE_VIEW_IOU');
  assert.equal(authority.registeredSourceViewCount, 0);
});

test('multiview IoU rejects duplicate sources, mixed candidates, missing current binding, and forged comparison digests', () => {
  const front = registeredComparison({sourceSha256:D('1'),registrationDigest:D('2'),candidateAssetSha256:D('3'),salt:'4'});
  const duplicateSource = registeredComparison({sourceSha256:D('1'),registrationDigest:D('5'),candidateAssetSha256:D('3'),salt:'6'});
  assert.throws(() => metricAuthority('silhouetteIoU', {
    registeredComparisons:[{viewId:'front',report:front},{viewId:'side',report:duplicateSource}],
    currentViewId:'front',currentSourceSha256:D('1'),currentCandidateAssetSha256:D('3'),
  }), /independently source-backed/);

  const mixedCandidate = registeredComparison({sourceSha256:D('7'),registrationDigest:D('8'),candidateAssetSha256:D('9'),salt:'a'});
  assert.throws(() => metricAuthority('silhouetteIoU', {
    registeredComparisons:[{viewId:'front',report:front},{viewId:'side',report:mixedCandidate}],
    currentViewId:'front',currentSourceSha256:D('1'),currentCandidateAssetSha256:D('3'),
  }), /same 3D candidate/);

  const side = registeredComparison({sourceSha256:D('7'),registrationDigest:D('8'),candidateAssetSha256:D('3'),salt:'a'});
  assert.throws(() => metricAuthority('silhouetteIoU', {
    registeredComparisons:[{viewId:'front',report:front},{viewId:'side',report:side}],
    currentViewId:'front',currentSourceSha256:D('b'),currentCandidateAssetSha256:D('3'),
  }), /current source is not present/);

  const forged = structuredClone(side);
  forged.registration.digest = D('c');
  assert.throws(() => metricAuthority('silhouetteIoU', {
    registeredComparisons:[{viewId:'front',report:front},{viewId:'side',report:forged}],
    currentViewId:'front',currentSourceSha256:D('1'),currentCandidateAssetSha256:D('3'),
  }), /comparison digest mismatch/);
});

test('multiview IoU requires explicit current source and candidate bindings', () => {
  const front = registeredComparison({sourceSha256:D('1'),registrationDigest:D('2'),candidateAssetSha256:D('3'),salt:'4'});
  const side = registeredComparison({sourceSha256:D('5'),registrationDigest:D('6'),candidateAssetSha256:D('3'),salt:'7'});
  assert.throws(() => metricAuthority('silhouetteIoU', {
    registeredComparisons:[{viewId:'front',report:front},{viewId:'side',report:side}],
    currentViewId:'front',
  }), /requires currentViewId, currentSourceSha256, and currentCandidateAssetSha256/);
});

test('camera, appearance, lighting, and pose plans reject IoU-derived objective injection', () => {
  const cameraBase = {
    id:'camera-fit', scopeId:'whole', sourceSha256:D('1'), hypothesisId:'camera-hypothesis',
    baselineCamera:{projection:'perspective',position:[0,0,4],target:[0,0,0],up:[0,1,0],fovY:45},
    variables:[{id:'camera-z',binding:'camera.position.z',minimum:3,maximum:5,initial:4}],
    objectives:[{id:'silhouette-iou',goal:'minimize',weight:1,scale:1}],
    evaluationBudget:2,
  };
  assert.throws(() => createCameraFitPlan(cameraBase), /cannot be used for objective/);

  const appearanceBase = {
    id:'appearance-fit',scopeId:'whole',sourceSha256:D('1'),baselineAsset:baseline,
    variables:[{id:'roughness',binding:'appearance.material.body.roughness',minimum:0,maximum:1,initial:.5}],
    objectives:[{id:'segment-iou-loss',goal:'minimize',weight:1}],
    evaluationBudget:2,
  };
  assert.throws(() => createAppearanceFitPlan(appearanceBase), /cannot be used for objective/);

  const lightingBase = {
    id:'lighting-fit',scopeId:'whole',sourceSha256:D('1'),baselineAsset:baseline,
    variables:[{id:'exposure',binding:'lighting.exposure',minimum:-1,maximum:1,initial:0}],
    objectives:[{id:'negative-space-loss',goal:'minimize',weight:1}],
    evaluationBudget:2,
  };
  assert.throws(() => createLightingCalibrationPlan(lightingBase), /cannot be used for objective/);

  const poseBase = {
    id:'pose-fit',scopeId:'whole',sourceSha256:D('1'),baselineAsset:baseline,
    variables:[{id:'joint-a',binding:'assembly.joint.joint-a.angle',minimum:-1,maximum:1,initial:0}],
    objectives:[{id:'silhouette-iou',goal:'minimize',weight:1}],
    evaluationBudget:2,
  };
  assert.throws(() => createPoseFitPlan(poseBase), /cannot be used for objective/);
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
    assert.throws(() => createParameterFitPlan({...base,objectives:[{id,goal:'minimize',authority:'RANKING_ALLOWED'}]}), /cannot be used for objective/);
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
    sourceViewContext:{
      currentViewId:'front',
      registeredComparisons:[
        {viewId:'front',report:registeredComparison({sourceSha256:D('e'),registrationDigest:D('8'),candidateAssetSha256:D('f'),salt:'1'})},
        {viewId:'side',report:registeredComparison({sourceSha256:D('7'),registrationDigest:D('9'),candidateAssetSha256:D('f'),salt:'2'})},
      ],
    },
  });
  assert.equal(typeof report.metrics.silhouetteIoU, 'number');
  assert.equal(report.policy.iouAuthority, 'CORRESPONDENCE_AID');
  assert.throws(() => rankDiscrepancyCandidates([{id:'x',metrics:report.metrics},{id:'y',metrics:report.metrics}],{metric:'silhouetteIoU'}), /cannot be used for ranking/);
});

test('generic fitting rejects objectives without an explicit authority', () => {
  assert.throws(() => createParameterFitPlan({
    id:'fit-explicit-authority', scopeId:'whole', sourceSha256:D('a'), baselineAsset:baseline,
    parameters:[{id:'aa',binding:'model.shape.a',minimum:0,maximum:1,initial:.5},{id:'bb',binding:'model.shape.b',minimum:0,maximum:1,initial:.5}],
    objectives:[{id:'edge-orientation-error',goal:'minimize'}],
    optimizer:{populationSize:4,evaluationBudget:5},
  }), /authority is required/);
});

test('candidate ranking requires an explicit non-IoU metric', () => {
  const candidates=[{id:'a',metrics:{edgeDisagreement:.4,silhouetteIoU:.9}},{id:'b',metrics:{edgeDisagreement:.2,silhouetteIoU:.8}}];
  assert.throws(() => rankDiscrepancyCandidates(candidates), /metric is required/);
  assert.throws(() => rankDiscrepancyCandidates(candidates,{metric:'silhouetteIoU',direction:'max'}), /cannot be used for ranking/);
  assert.deepEqual(rankDiscrepancyCandidates(candidates,{metric:'edgeDisagreement',direction:'min'}).map(x=>x.id),['b','a']);
});

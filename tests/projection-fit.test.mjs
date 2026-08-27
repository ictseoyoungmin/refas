import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createProjectionFit, createReferenceGeometry, validateProjectionFit} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
function geometry() {
  return createReferenceGeometry({
    scopeId: 'whole', sourceSha256: D('a'),
    anchors: [
      {id:'head',importance:'macro',evidenceRefs:['source.png'],xy:[.50,.20],visibility:'visible',confidence:1},
      {id:'shoulder',importance:'macro',evidenceRefs:['source.png'],xy:[.40,.34],visibility:'visible',confidence:1},
      {id:'elbow',importance:'macro',evidenceRefs:['source.png'],xy:[.34,.52],visibility:'visible',confidence:1},
      {id:'wrist',importance:'identity',evidenceRefs:['source.png'],xy:[.47,.28],visibility:'visible',confidence:1},
    ],
    chains:[{id:'arm',importance:'macro',evidenceRefs:['source.png'],anchorIds:['shoulder','elbow','wrist']}],
    axes:[{id:'head-shoulder-axis',importance:'macro',evidenceRefs:['source.png'],fromAnchorId:'shoulder',toAnchorId:'head'}],
    contacts:[{id:'wrist-head',importance:'identity',evidenceRefs:['source.png'],aAnchorId:'wrist',bAnchorId:'head',relation:'near',toleranceNormalized:.09}],
    negativeSpaces:[{id:'arm-gap',importance:'macro',evidenceRefs:['source.png'],polygon:[[.40,.35],[.38,.45],[.35,.49],[.43,.41]]}],
    dimensions:[{id:'upper-arm-span',importance:'macro',evidenceRefs:['source.png'],aAnchorId:'shoulder',bAnchorId:'elbow',kind:'distance'}],
    attestation:{attested:true,evidenceRefs:['source.png']},
  });
}
const projection = (referenceId, projectedXY) => ({referenceId, projectedXY, binding:{kind:'node-local-point',nodeId:`node-${referenceId}`,localPoint:[0,0,0]}, evidenceRefs:['render.png']});

test('projection fit computes source-to-model residuals without changing source geometry authority', () => {
  const ref = geometry();
  const fit = createProjectionFit({
    referenceGeometry:ref, cameraHypothesisId:'camera-a', cameraDigest:D('b'), modelBindingDigest:D('c'),
    anchorProjections:[projection('head',[.505,.205]),projection('shoulder',[.402,.342]),projection('elbow',[.345,.515]),projection('wrist',[.468,.282])],
    negativeSpaceProjections:[{referenceId:'arm-gap',polygon:[[.40,.35],[.38,.45],[.35,.49],[.43,.41]]}],
    evidenceRefs:['render.png'],
  });
  assert.equal(validateProjectionFit(fit).valid,true);
  assert.ok(fit.metrics.macroAnchorRmseNormalized < .01);
  assert.ok(fit.metrics.negativeSpaceMeanIoU > .99);
  assert.equal(fit.policy.metricsCannotCertifyVisualFidelity,true);
  assert.equal(ref.anchors[0].xy[0],.5);
  const tampered=structuredClone(fit);tampered.anchorProjections[0].projectedXY[0]=.9;
  assert.equal(validateProjectionFit(tampered).valid,false);
});

test('projection fit requires every macro anchor and valid semantic bindings', () => {
  const ref=geometry();
  assert.throws(()=>createProjectionFit({referenceGeometry:ref,cameraHypothesisId:'camera-a',cameraDigest:D('b'),modelBindingDigest:D('c'),anchorProjections:[projection('head',[.5,.2])]}),/missing macro anchors/);
  const broken=[projection('head',[.5,.2]),projection('shoulder',[.4,.34]),projection('elbow',[.34,.52])];
  broken[1].binding.nodeId='INVALID NODE';
  assert.throws(()=>createProjectionFit({referenceGeometry:ref,cameraHypothesisId:'camera-a',cameraDigest:D('b'),modelBindingDigest:D('c'),anchorProjections:broken}),/nodeId/);
});

test('projection fit exposes large macro disagreement as evidence but does not self-certify or mutate', () => {
  const ref=geometry();
  const fit=createProjectionFit({referenceGeometry:ref,cameraHypothesisId:'camera-b',cameraDigest:D('d'),modelBindingDigest:D('e'),anchorProjections:[projection('head',[.70,.13]),projection('shoulder',[.58,.30]),projection('elbow',[.56,.58]),projection('wrist',[.61,.20])]});
  assert.ok(fit.metrics.macroAnchorRmseNormalized > .15);
  assert.equal(fit.policy.materialDisagreementMayBecomeBlockingFinding,true);
  assert.equal('verdict' in fit,false);
});

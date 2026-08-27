import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createRealizedProjection,
  createReferenceGeometry,
  createSegmentPrism,
  findingsFromProjectionFit,
  partsToGlb,
  validateRealizedProjection,
  verifyRealizedProjection,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
const material = {wood: {baseColor:[0.75,0.6,0.4,1], metallic:0, roughness:0.7}};
const mesh = () => createSegmentPrism({start:[-.05,0,0], end:[.05,0,0], width:.05, height:.05, upHint:[0,1,0]});

function asset({childX=.5}={}) {
  return partsToGlb({
    parts:[
      {id:'root-part', scopeId:'whole', materialId:'wood', mesh:mesh(), translation:[.5,0,0]},
      {id:'child-part', scopeId:'whole.child', materialId:'wood', mesh:mesh(), parentId:'root-part', translation:[childX,0,0]},
    ],
    materials:material,
  });
}

function geometry() {
  return createReferenceGeometry({
    scopeId:'whole', sourceSha256:D('a'),
    anchors:[
      {id:'root-anchor', importance:'macro', evidenceRefs:['source.png'], xy:[.55,.5], visibility:'visible', confidence:1},
      {id:'child-anchor', importance:'macro', evidenceRefs:['source.png'], xy:[.60,.5], visibility:'visible', confidence:1},
    ],
    chains:[{id:'root-child-chain', importance:'macro', evidenceRefs:['source.png'], anchorIds:['root-anchor','child-anchor']}],
    attestation:{attested:true,evidenceRefs:['source.png']},
  });
}

const camera = {projection:'perspective', position:[0,0,5], target:[0,0,0], up:[0,1,0], fovY:90, aspect:1};
const bindings = [
  {referenceId:'root-anchor', nodeId:'root-part', localPoint:[0,0,0]},
  {referenceId:'child-anchor', nodeId:'child-part', localPoint:[0,0,0]},
];

test('realized projection derives anchor coordinates from actual GLB hierarchy and camera', () => {
  const glb = asset();
  const proof = createRealizedProjection({referenceGeometry:geometry(), glb, cameraHypothesisId:'camera-a', camera, anchorBindings:bindings, evidenceRefs:['asset.glb']});
  assert.equal(validateRealizedProjection(proof).valid, true);
  assert.equal(verifyRealizedProjection({proof, referenceGeometry:geometry(), glb}).valid, true);
  const root = proof.derivedAnchors.find((item) => item.referenceId === 'root-anchor');
  const child = proof.derivedAnchors.find((item) => item.referenceId === 'child-anchor');
  assert.ok(Math.abs(root.worldPoint[0] - .5) < 1e-9);
  assert.ok(Math.abs(child.worldPoint[0] - 1) < 1e-9, 'child must inherit the parent transform');
  assert.ok(Math.abs(root.projectedXY[0] - .55) < 1e-9);
  assert.ok(Math.abs(child.projectedXY[0] - .60) < 1e-9);
  assert.ok(proof.projectionFit.metrics.macroAnchorRmseNormalized < 1e-9);
});

test('changing realized node transform changes projection fit without caller-supplied projectedXY', () => {
  const ref = geometry();
  const good = createRealizedProjection({referenceGeometry:ref, glb:asset(), cameraHypothesisId:'camera-a', camera, anchorBindings:bindings, evidenceRefs:['asset.glb']});
  const moved = createRealizedProjection({referenceGeometry:ref, glb:asset({childX:1}), cameraHypothesisId:'camera-a', camera, anchorBindings:bindings, evidenceRefs:['asset.glb']});
  assert.ok(good.projectionFit.metrics.macroAnchorRmseNormalized < 1e-9);
  assert.ok(moved.projectionFit.metrics.macroAnchorRmseNormalized > .03);
  assert.notEqual(good.assetSha256, moved.assetSha256);
  assert.notEqual(good.modelBindingDigest, moved.modelBindingDigest);
});

test('camera changes are digest-bound and change the realized reprojection', () => {
  const ref = geometry(), glb = asset();
  const near = createRealizedProjection({referenceGeometry:ref, glb, cameraHypothesisId:'camera-near', camera, anchorBindings:bindings});
  const farCamera = {...camera, position:[0,0,10]};
  const far = createRealizedProjection({referenceGeometry:ref, glb, cameraHypothesisId:'camera-far', camera:farCamera, anchorBindings:bindings});
  assert.notEqual(near.cameraDigest, far.cameraDigest);
  assert.notEqual(near.derivedAnchors[1].projectedXY[0], far.derivedAnchors[1].projectedXY[0]);
  assert.ok(far.projectionFit.metrics.macroAnchorRmseNormalized > near.projectionFit.metrics.macroAnchorRmseNormalized);
});

test('gross off-frame mismatch remains measurable and becomes blocking evidence', () => {
  const proof = createRealizedProjection({referenceGeometry:geometry(), glb:asset({childX:6}), cameraHypothesisId:'camera-bad', camera, anchorBindings:bindings});
  const child = proof.derivedAnchors.find((item) => item.referenceId === 'child-anchor');
  assert.equal(child.insideFrame, false);
  assert.ok(child.projectedXY[0] > 1);
  assert.ok(proof.projectionFit.metrics.projectedAnchorsOutsideFrame > 0);
  assert.ok(proof.projectionFit.metrics.macroAnchorRmseNormalized > .3);
  assert.ok(findingsFromProjectionFit(proof.projectionFit).some((finding) => finding.blocking));
  assert.equal(validateRealizedProjection(proof).valid, true);
});

test('caller projectedXY claims are ignored and proof tampering cannot reproduce against bound GLB', () => {
  const ref = geometry(), glb = asset();
  const claimed = bindings.map((item) => ({...item, projectedXY:[.99,.99]}));
  const proof = createRealizedProjection({referenceGeometry:ref, glb, cameraHypothesisId:'camera-a', camera, anchorBindings:claimed});
  assert.ok(Math.abs(proof.derivedAnchors[0].projectedXY[0] - .55) < 1e-9);
  const tampered = structuredClone(proof);
  tampered.derivedAnchors[0].projectedXY[0] = .9;
  assert.equal(validateRealizedProjection(tampered).valid, false);
  assert.equal(verifyRealizedProjection({proof:tampered, referenceGeometry:ref, glb}).valid, false);
  assert.equal(verifyRealizedProjection({proof, referenceGeometry:ref, glb:asset({childX:.8})}).valid, false);
});

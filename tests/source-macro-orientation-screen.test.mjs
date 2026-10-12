import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createReferenceGeometry,createRealizedProjection,createSegmentPrism,partsToGlb,
  screenSourceMacroSectionEnvelopes,screenSourceMacroPartOrientation,verifyRealizedProjection,
} from '../skills/refas/scripts/lib/index.mjs';

// Pre-authored synthetic reference geometry; this test verifies that the
// *runtime* derives orientation from GLB mesh, not that source interpretation
// was independently correct for a real photo.
const SOURCE_SHA='a'.repeat(64);
const SRC='source/reference.png';
const s=Math.SQRT1_2;
const sourcePolygon=[[-.8,-.1],[.8,-.1],[.8,.1],[-.8,.1]].map(([x,y])=>
  [.5+(x-y)*s/4,.5-(x+y)*s/4]);
const ref=createReferenceGeometry({
  scopeId:'whole',sourceSha256:SOURCE_SHA,
  anchors:[{id:'head-center',importance:'macro',xy:[.5,.5],visibility:'visible',confidence:1,
    evidenceRefs:[SRC]}],
  segments:[{id:'head-long-axis',label:'synthetic long head section',importance:'macro',
    polygon:sourcePolygon,anchorIds:['head-center'],visibility:'visible',separation:'uncertain',
    evidenceRefs:[SRC]}],
  attestation:{attested:true,evidenceRefs:[SRC]},
});
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],up:[0,1,0],
  orthoHeight:4,aspect:1};
const mesh=createSegmentPrism({start:[-.8,0,0],end:[.8,0,0],width:.2,height:.15,upHint:[0,0,1]});
function currentGlb(degrees){
  const radians=degrees*Math.PI/180;
  return partsToGlb({
    parts:[{id:'head-part',scopeId:'whole.head',materialId:'clay',mesh,
      rotation:[0,0,Math.sin(radians/2),Math.cos(radians/2)]}],
    materials:{clay:{baseColor:[.65,.65,.65,1],metallic:0,roughness:1}},
  });
}
function proof(glb){
  return createRealizedProjection({
    referenceGeometry:ref,glb,camera,cameraHypothesisId:'source-camera',
    anchorBindings:[{referenceId:'head-center',nodeId:'head-part',localPoint:[0,0,0]}],
    segmentBindings:[{referenceId:'head-long-axis',nodeIds:['head-part']}],
    evidenceRefs:[SRC,'model/current.glb'],
  });
}
test('S03b1 elongated source macro and real GLB are aligned without issuing a source-fidelity PASS',()=>{
  const glb=currentGlb(45),p=proof(glb);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:ref,glb}).valid,true);
  const metric=screenSourceMacroPartOrientation({
    referenceGeometry:ref,realizedProjection:p,sourcePath:SRC,
  });
  assert.equal(metric.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(metric.findings));
  assert.equal(metric.checks.length,1);
  assert.equal(metric.checks[0].measurable,true);
  assert.ok(metric.checks[0].angleErrorDegrees<2,JSON.stringify(metric.checks));
  assert.equal(metric.cannotAuthorizeReferenceFidelity,true);
  assert.equal(metric.cannotInferFaceGazeOrFrontBack,true);
});

test('S03b1 real GLB opposite-diagonal rotation keeps bbox and anchor but forces REWORK',()=>{
  const glb=currentGlb(-45),p=proof(glb);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:ref,glb}).valid,true);
  assert.ok(p.projectionFit.metrics.macroAnchorRmseNormalized<1e-8);
  const envelope=screenSourceMacroSectionEnvelopes({
    referenceGeometry:ref,realizedProjection:p,sourcePath:SRC,
  });
  assert.equal(envelope.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(envelope.findings));
  const screen=screenSourceMacroPartOrientation({
    referenceGeometry:ref,realizedProjection:p,sourcePath:SRC,
  });
  assert.equal(screen.status,'REWORK');
  assert.ok(screen.checks[0].angleErrorDegrees>70,JSON.stringify(screen.checks));
  assert.ok(screen.findings.some(x=>x.id==='head-long-axis'&&x.status==='REWORK'));
  // Reusing the old geometry-bound signed proof must fail against new bytes.
  assert.equal(verifyRealizedProjection({
    proof:proof(currentGlb(45)),referenceGeometry:ref,glb,
  }).valid,false);
});

test('S03b1 a non-elongated source section is not falsely treated as a face direction',()=>{
  const squarish=createReferenceGeometry({
    scopeId:'whole',sourceSha256:SOURCE_SHA,
    anchors:[{id:'center',importance:'macro',xy:[.5,.5],visibility:'visible',
      confidence:1,evidenceRefs:[SRC]}],
    segments:[{id:'symmetric-face',importance:'macro',label:'symmetric face',
      polygon:[[.4,.4],[.6,.4],[.6,.6],[.4,.6]],anchorIds:['center'],
      visibility:'visible',evidenceRefs:[SRC],separation:'uncertain'}],
    attestation:{attested:true,evidenceRefs:[SRC]},
  });
  const projected={
    scopeId:'whole',sourceSha256:SOURCE_SHA,assetSha256:'b'.repeat(64),
    derivedSegments:[{referenceId:'symmetric-face',projectedHull:sourcePolygon}],
  };
  const screen=screenSourceMacroPartOrientation({
    referenceGeometry:squarish,realizedProjection:projected,sourcePath:SRC,
  });
  assert.equal(screen.status,'NO_DETECTED_CONTRADICTION');
  assert.equal(screen.checks[0].measurable,false);
  assert.equal(screen.cannotInferFaceGazeOrFrontBack,true);
});

test('S03b1 path/source-SHA spoof cannot import a foreign source axis',()=>{
  const glb=currentGlb(45),p=proof(glb);
  assert.throws(()=>screenSourceMacroPartOrientation({
    referenceGeometry:ref,realizedProjection:{...p,sourceSha256:'f'.repeat(64)},sourcePath:SRC,
  }),/same original source SHA/);
  const unauth=createReferenceGeometry({
    scopeId:'whole',sourceSha256:SOURCE_SHA,
    anchors:ref.anchors,
    segments:[{...ref.segments[0],evidenceRefs:['other.png']}],
    attestation:{attested:true,evidenceRefs:['other.png']},
  });
  const review=screenSourceMacroPartOrientation({referenceGeometry:unauth,realizedProjection:p,sourcePath:SRC});
  assert.equal(review.status,'INSUFFICIENT');
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createReferenceGeometry, createRealizedProjection, verifyRealizedProjection,
  createSegmentPrism, partsToGlb, screenSourceRealizedOcclusion,
  screenSourceMacroSectionEnvelopes,
} from '../skills/refas/scripts/lib/index.mjs';
const SRC='source/photo.png', SHA='a'.repeat(64);
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],
  up:[0,1,0],aspect:1,orthoHeight:4};
const square=[[.44,.44],[.56,.44],[.56,.56],[.44,.56]];
const mesh=createSegmentPrism({start:[-.2,0,0],end:[.2,0,0],
  width:.4,height:.2,upHint:[0,0,1]});
function ref({sourceCitation=SRC,visibleBack='visible'}={}){
  return createReferenceGeometry({scopeId:'whole',sourceSha256:SHA,
    anchors:[{id:'front-center',importance:'macro',xy:[.5,.5],visibility:'visible',
      evidenceRefs:[SRC]},{id:'back-center',importance:'macro',xy:[.5,.5],
      visibility:'visible',evidenceRefs:[SRC]}],
    segments:[
      {id:'front-shoulder',label:'source near shoulder',importance:'macro',
        visibility:'visible',separation:'uncertain',evidenceRefs:[SRC],
        polygon:square,anchorIds:['front-center']},
      {id:'back-shoulder',label:'source far shoulder',importance:'macro',
        visibility:visibleBack,separation:'uncertain',evidenceRefs:[SRC],
        polygon:square,anchorIds:['back-center']},
    ],
    occlusions:[{id:'shoulder-order',importance:'macro',
      frontId:'front-shoulder',backId:'back-shoulder',evidenceRefs:[sourceCitation]}],
    attestation:{attested:true,evidenceRefs:[SRC]},
  });
}
function glb({frontZ=.6,backZ=-.6}={}){
  return partsToGlb({materials:{clay:{baseColor:[.6,.6,.6,1],metallic:0,roughness:1}},
    parts:[
      {id:'near-shoulder',scopeId:'whole.front',materialId:'clay',mesh,
        translation:[0,0,frontZ]},
      {id:'far-shoulder',scopeId:'whole.back',materialId:'clay',mesh,
        translation:[0,0,backZ]},
    ]});
}
function projection(geometry,bytes,{sharedMesh=false}={}){
  return createRealizedProjection({referenceGeometry:geometry,glb:bytes,
    cameraHypothesisId:'source-camera',camera,
    anchorBindings:[
      {referenceId:'front-center',nodeId:'near-shoulder',localPoint:[0,0,0]},
      {referenceId:'back-center',nodeId:'far-shoulder',localPoint:[0,0,0]},
    ],
    segmentBindings:[
      {referenceId:'front-shoulder',nodeIds:['near-shoulder']},
      {referenceId:'back-shoulder',nodeIds:[sharedMesh?'near-shoulder':'far-shoulder']},
    ],evidenceRefs:[SRC,'asset.glb']});
}
function screen(r,g,opts){return screenSourceRealizedOcclusion({
  referenceGeometry:r,realizedProjection:projection(r,g,opts),sourcePath:SRC});
}
test('S03c actual shoulder GLB depth agrees with source overlap without granting fidelity',()=>{
  const r=ref(),g=glb(),p=projection(r,g);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:r,glb:g}).valid,true);
  const result=screenSourceRealizedOcclusion({referenceGeometry:r,realizedProjection:p,sourcePath:SRC});
  assert.equal(result.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(result.findings));
  assert.equal(result.checked.length,1);
  assert.equal(result.checked[0].evaluable,true);
  assert.equal(result.cannotAuthorizeReferenceFidelity,true);
});
test('S03c physically swapped shoulder depth with unchanged source and mesh projections forces REWORK',()=>{
  const r=ref(),correct=glb(),wrong=glb({frontZ:-.6,backZ:.6});
  const p=projection(r,wrong);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:r,glb:wrong}).valid,true);
  assert.ok(p.projectionFit.metrics.macroAnchorRmseNormalized<1e-9);
  assert.equal(screenSourceMacroSectionEnvelopes({
    referenceGeometry:r,realizedProjection:p,sourcePath:SRC,
  }).status,'NO_DETECTED_CONTRADICTION');
  const result=screenSourceRealizedOcclusion({referenceGeometry:r,realizedProjection:p,sourcePath:SRC});
  assert.equal(result.status,'REWORK');
  assert.match(result.findings[0].reason,/depth order contradicts/);
  assert.equal(verifyRealizedProjection({proof:projection(r,correct),referenceGeometry:r,glb:wrong}).valid,false);
});
test('S03c interpenetrating shoulder depth stays INSUFFICIENT rather than false positive',()=>{
  const result=screen(ref(),glb({frontZ:.01,backZ:-.01}));
  assert.equal(result.status,'INSUFFICIENT');
  assert.match(result.findings[0].reason,/intersecting GLB depth/);
});
test('S03c re-labeling same realized mesh as two parts cannot pass occlusion',()=>{
  const result=screen(ref(),glb(),{sharedMesh:true});
  assert.equal(result.status,'INSUFFICIENT');
  assert.match(result.findings[0].reason,/overlapping GLB mesh ownership/);
});
test('S03c missing source primary citation and uncertain source visibility cannot pass',()=>{
  assert.equal(screen(ref({sourceCitation:'render/generated.png'}),glb()).status,'INSUFFICIENT');
  assert.equal(screen(ref({visibleBack:'inferred'}),glb()).status,'INSUFFICIENT');
});
test('S03c source/candidate scope and SHA mismatch rejects projected proof substitution',()=>{
  const r=ref(),p=projection(r,glb());
  assert.throws(()=>screenSourceRealizedOcclusion({referenceGeometry:r,
    realizedProjection:{...p,sourceSha256:'f'.repeat(64)},sourcePath:SRC}),/original source SHA/);
  assert.throws(()=>screenSourceRealizedOcclusion({referenceGeometry:r,
    realizedProjection:{...p,scopeId:'another'},sourcePath:SRC}),/current GLB scope/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 createReferenceGeometry,createRealizedProjection,verifyRealizedProjection,
 createSegmentPrism,partsToGlb,screenSourceNegativeSpaces,
} from '../skills/refas/scripts/lib/index.mjs';

const SRC='source/original.png',SHA='a'.repeat(64);
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],
 up:[0,1,0],aspect:1,orthoHeight:4};
function photo({cite=SRC,importance='macro',tiny=false}={}){
 return createReferenceGeometry({scopeId:'whole',sourceSha256:SHA,
  anchors:[{id:'left-post-center',importance:'macro',xy:[.25,.5],
   visibility:'visible',evidenceRefs:[SRC]}],
  negativeSpaces:[{id:'opening-between-posts',importance,
   polygon:tiny?[[.49,.49],[.50,.49],[.50,.50],[.49,.50]]:
    [[.43,.42],[.57,.42],[.57,.58],[.43,.58]],
   evidenceRefs:[cite]}],
  attestation:{attested:true,evidenceRefs:[SRC]},
 });
}
function actualGLB({filled=false}={}){
 const prism=(x,width=.3)=>createSegmentPrism({
  start:[x,-1,0],end:[x,1,0],width,height:.2,upHint:[0,0,1],
 });
 const parts=[
  {id:'left-post',scopeId:'whole.left',materialId:'clay',mesh:prism(-1)},
  {id:'right-post',scopeId:'whole.right',materialId:'clay',mesh:prism(1)},
 ];
 if(filled)parts.push({id:'wrong-opaque-center',scopeId:'whole.filled',
  materialId:'clay',mesh:prism(0,1.2)});
 return partsToGlb({assetId:'s03d-actual-negative-space',
  materials:{clay:{baseColor:[.7,.7,.7,1],metallic:0,roughness:1}},
  parts,
 });
}
function view(geometry,glb){
 return createRealizedProjection({referenceGeometry:geometry,glb,
  cameraHypothesisId:'source-camera',camera,
  anchorBindings:[{referenceId:'left-post-center',
    nodeId:'left-post',localPoint:[-1,0,0]}],
  evidenceRefs:[SRC,'model/asset.glb'],
 });
}
function screen(glb,geometry=photo()){
 const projection=view(geometry,glb);
 assert.equal(verifyRealizedProjection({proof:projection,referenceGeometry:geometry,glb}).valid,true);
 return screenSourceNegativeSpaces({referenceGeometry:geometry,
  realizedProjection:projection,glb,sourcePath:SRC});
}
test('S03d original-source void remains open in actual current GLB: no contradiction, never fidelity PASS',()=>{
 const outcome=screen(actualGLB());
 assert.equal(outcome.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(outcome.findings));
 assert.equal(outcome.cannotAuthorizeReferenceFidelity,true);
 assert.equal(outcome.checks.length,1);
 assert.equal(outcome.checks[0].filledSamples,0);
});
test('S03d physical opaque center fills source void without changing source camera, anchors or outer posts',()=>{
 const correct=actualGLB(),wrong=actualGLB({filled:true}),geometry=photo();
 const before=view(geometry,correct),after=view(geometry,wrong);
 assert.deepEqual(before.derivedAnchors.map(a=>a.projectedXY),
  after.derivedAnchors.map(a=>a.projectedXY));
 assert.notEqual(before.assetSha256,after.assetSha256);
 const result=screenSourceNegativeSpaces({referenceGeometry:geometry,
  realizedProjection:after,glb:wrong,sourcePath:SRC});
 assert.equal(result.status,'REWORK',JSON.stringify(result));
 assert.ok(result.checks[0].coveredFraction>=.9);
 assert.match(result.findings[0].reason,/filled by actual opaque GLB triangles/);
 assert.equal(verifyRealizedProjection({proof:before,referenceGeometry:geometry,glb:wrong}).valid,false);
});
test('S03d stale GLB and original source SHA substitutions cannot authorize void result',()=>{
 const geometry=photo(),correct=actualGLB(),wrong=actualGLB({filled:true});
 const proof=view(geometry,correct);
 assert.throws(()=>screenSourceNegativeSpaces({referenceGeometry:geometry,
  realizedProjection:proof,glb:wrong,sourcePath:SRC}),/exact current GLB SHA/);
 assert.throws(()=>screenSourceNegativeSpaces({referenceGeometry:geometry,
  realizedProjection:{...proof,sourceSha256:'f'.repeat(64)},
  glb:correct,sourcePath:SRC}),/original source SHA/);
});
test('S03d missing independent source citation and undersized void remain insufficient',()=>{
 const geometry=photo({cite:'render/candidate.png'});
 assert.equal(screen(actualGLB(),geometry).status,'INSUFFICIENT');
 const small=screen(actualGLB(),photo({tiny:true}));
 assert.equal(small.status,'INSUFFICIENT');
});
test('S03d non-macro detailed void does not invent required whole source evidence',()=>{
 assert.equal(screen(actualGLB({filled:true}),photo({importance:'detail'})).status,'NOT_APPLICABLE');
});

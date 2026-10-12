import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRealizedProjection,createReferenceGeometry,verifyRealizedProjection,
  createSegmentPrism,partsToGlb,screenSourcePhysicalInterfaceGaps,
  screenSourceMacroSectionEnvelopes,
} from '../skills/refas/scripts/lib/index.mjs';
const SHA='a'.repeat(64),SRC='source/photo.png';
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],
  up:[0,1,0],orthoHeight:4,aspect:1};
const mesh=createSegmentPrism({start:[-.4,0,0],end:[.4,0,0],
  width:.8,height:.8,upHint:[0,1,0]});
const rect=(left,right)=>[[left,.4],[right,.4],[right,.6],[left,.6]];
function ref({hidden=false,wrongCitation=false,ambiguous=false}={}){
  return createReferenceGeometry({
    scopeId:'whole',sourceSha256:SHA,
    anchors:[
      {id:'a',xy:[.4,.5],importance:'macro',visibility:'visible',evidenceRefs:[SRC]},
      {id:'b',xy:[.6,.5],importance:'macro',visibility:'visible',evidenceRefs:[SRC]},
    ],
    segments:[
      {id:'observed-support',label:'visible support strut',importance:'macro',
        visibility:'visible',polygon:rect(.3,.5),anchorIds:['a'],
        separation:'explicit',evidenceRefs:[SRC]},
      {id:'observed-mount',label:'mount in source photo',importance:'macro',
        visibility:hidden?'inferred':'visible',polygon:rect(.5,.7),anchorIds:['b'],
        separation:'explicit',evidenceRefs:[SRC]},
    ],
    interfaces:[{id:'observed-structural-contact',importance:'macro',
      visibility:ambiguous?'inferred':'visible',kind:'contact-boundary',
      separation:'explicit',subjectSegmentId:'observed-support',
      objectSegmentId:'observed-mount',boundary:[[.5,.45],[.5,.55]],
      evidenceRefs:[wrongCitation?'generated/model.png':SRC]}],
    attestation:{attested:true,evidenceRefs:[SRC]},
  });
}
function asset({gap=0,removeMount=false}={}){
  return partsToGlb({
    materials:{steel:{baseColor:[.6,.6,.6,1],metallic:0,roughness:.8}},
    parts:[
      {id:'real-support',scopeId:'whole.support',materialId:'steel',mesh,
        translation:[-.4,0,0]},
      ...(!removeMount?[{id:'real-mount',scopeId:'whole.mount',materialId:'steel',
        mesh,translation:[.4+gap,0,0]}]:[]),
    ],
  });
}
function projection(geometry,glb,{sameMesh=false,omitMount=false}={}){
  return createRealizedProjection({
    referenceGeometry:geometry,glb,cameraHypothesisId:'selected',camera,
    anchorBindings:[
      {referenceId:'a',nodeId:'real-support',localPoint:[0,0,0]},
      {referenceId:'b',nodeId:'real-support',localPoint:[.8,0,0]},
    ],
    segmentBindings:[
      {referenceId:'observed-support',nodeIds:['real-support']},
      ...(!omitMount?[{referenceId:'observed-mount',
        nodeIds:[sameMesh?'real-support':'real-mount']}]:[]),
    ],
    evidenceRefs:[SRC,'candidate.glb'],
  });
}
const screen=(r,p)=>screenSourcePhysicalInterfaceGaps({
  referenceGeometry:r,realizedProjection:p,sourcePath:SRC,
});
test('QA-03b1 physical current GLB strut/mount without projected gap remains noncontradictory, not attachment proof',()=>{
  const source=ref(),glb=asset(),proof=projection(source,glb);
  assert.equal(verifyRealizedProjection({proof,referenceGeometry:source,glb}).valid,true);
  const r=screen(source,proof);
  assert.equal(r.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(r.findings));
  assert.equal(r.cannotProvePhysicalAttachment,true);
  assert.equal(r.cannotAuthorizeReferenceFidelity,true);
  assert.equal(r.checks.length,1);
  assert.ok(r.checks[0].projectedMeshGap<.01);
});
test('QA-03b1 real GLB strut/mount detachment escapes macro envelope but fails structural interface',()=>{
  const source=ref(),glb=asset({gap:.22}),proof=projection(source,glb);
  assert.equal(verifyRealizedProjection({proof,referenceGeometry:source,glb}).valid,true);
  const macro=screenSourceMacroSectionEnvelopes({
    referenceGeometry:source,realizedProjection:proof,sourcePath:SRC,
  });
  assert.equal(macro.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(macro.findings));
  const found=screen(source,proof);
  assert.equal(found.status,'REWORK',JSON.stringify(found.findings));
  assert.ok(found.checks[0].projectedMeshGap>.032);
  assert.match(found.findings[0].reason,/projected gap contradicting source-observed attachment boundary/);
});
test('QA-03b1 missing physical mount cannot become NOT_APPLICABLE',()=>{
  const source=ref();
  assert.throws(()=>projection(source,asset({removeMount:true})),/unknown GLB node/);
  assert.throws(()=>projection(source,asset(),{omitMount:true}),/missing source-visible segments/);
});
test('QA-03b1 no source-observed visibility or wrong source citation remains INSUFFICIENT',()=>{
  for(const opts of [{hidden:true},{wrongCitation:true},{ambiguous:true}]){
    const source=ref(opts),proof=projection(source,asset());
    const r=screen(source,proof);
    assert.equal(r.status,'INSUFFICIENT',JSON.stringify(opts));
  }
});
test('QA-03b1 one GLB mesh declared to be two visibly attached semantic source parts does not establish contact',()=>{
  const source=ref(),proof=projection(source,asset(),{sameMesh:true});
  const r=screen(source,proof);
  assert.equal(r.status,'INSUFFICIENT');
  assert.match(r.findings[0].reason,/share GLB mesh ownership/);
});
test('QA-03b1 stale signed good projection cannot authorize later GLB mesh detachment',()=>{
  const source=ref(),old=projection(source,asset()),wrong=asset({gap:.22});
  assert.equal(verifyRealizedProjection({proof:old,referenceGeometry:source,glb:wrong}).valid,false);
});
test('QA-03b1 source SHA or scope substitution cannot certify anything',()=>{
  const source=ref(),proof=projection(source,asset());
  assert.throws(()=>screen(source,{...proof,sourceSha256:'f'.repeat(64)}),/source SHA/);
  assert.throws(()=>screen(source,{...proof,scopeId:'not-whole'}),/current GLB scope/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createReferenceGeometry,createRealizedProjection,
  createSegmentPrism,partsToGlb,replaySourceSemanticPhysicalEvidence,
} from '../skills/refas/scripts/lib/index.mjs';
import {constrainSourceRelationalCoverage} from '../skills/refas/scripts/lib/qa-coverage.mjs';

const sourceSha256='a'.repeat(64),sourcePath='source/primary.png';
const camera={projection:'orthographic',position:[0,0,5],
  target:[0,0,0],up:[0,1,0],aspect:1,orthoHeight:4};
const rect=(x,width,height)=>[
  [x-width/2,.5-height/2],[x+width/2,.5-height/2],
  [x+width/2,.5+height/2],[x-width/2,.5+height/2],
];
function observed(){
  return createReferenceGeometry({scopeId:'whole',sourceSha256,
    anchors:[
      {id:'front-observed',semanticRole:'front-basket',importance:'identity',
        xy:[.3,.5],visibility:'visible',evidenceRefs:[sourcePath]},
      {id:'rear-observed',semanticRole:'rear-basket',importance:'identity',
        xy:[.7,.5],visibility:'visible',evidenceRefs:[sourcePath]},
    ],
    segments:[
      {id:'front-basket-source',label:'front-basket',importance:'identity',
        polygon:rect(.3,.15,.1),anchorIds:['front-observed'],
        visibility:'visible',separation:'explicit',evidenceRefs:[sourcePath]},
      {id:'rear-basket-source',label:'rear-basket',importance:'identity',
        polygon:rect(.7,.075,.05),anchorIds:['rear-observed'],
        visibility:'visible',separation:'explicit',evidenceRefs:[sourcePath]},
    ],
    attestation:{attested:true,evidenceRefs:[sourcePath]},
  });
}
function glb(swap=false){
  const large=createSegmentPrism({start:[-.3,0,0],end:[.3,0,0],
    width:.4,height:.4,upHint:[0,0,1]});
  const small=createSegmentPrism({start:[-.15,0,0],end:[.15,0,0],
    width:.2,height:.2,upHint:[0,0,1]});
  return partsToGlb({
    materials:{clay:{baseColor:[.8,.8,.8,1],metallic:0,roughness:1}},
    parts:[
      {id:'front-mesh',scopeId:'whole.front',materialId:'clay',
        mesh:swap?small:large,translation:[-.8,0,0]},
      {id:'rear-mesh',scopeId:'whole.rear',materialId:'clay',
        mesh:swap?large:small,translation:[.8,0,0]},
    ],
  });
}
function prior(referenceGeometry,shapeGlb){
  return createRealizedProjection({
    referenceGeometry,glb:shapeGlb,cameraHypothesisId:'source-camera',
    camera,
    anchorBindings:[
      {referenceId:'front-observed',nodeId:'front-mesh',localPoint:[0,0,0]},
      {referenceId:'rear-observed',nodeId:'rear-mesh',localPoint:[0,0,0]},
    ],
    segmentBindings:[
      {referenceId:'front-basket-source',nodeIds:['front-mesh']},
      {referenceId:'rear-basket-source',nodeIds:['rear-mesh']},
    ],
    evidenceRefs:[sourcePath,'model/shape.glb'],
  });
}
function replay({current=glb(),old=glb(),ref=observed(),proof}={}){
  return replaySourceSemanticPhysicalEvidence({
    referenceGeometry:ref,shapeProjection:proof??prior(ref,old),
    shapeGlb:old,currentGlb:current,sourceSha256,sourcePath,
  });
}
test('QA-01b accepted matching actual GLB cannot turn an observer-authored source role into independently verified reference PASS',()=>{
  const r=replay();
  assert.equal(r.status,'INSUFFICIENT');
  assert.equal(r.results.length,1);
  assert.equal(r.results[0].status,'NO_DETECTED_CONTRADICTION');
  assert.equal(r.sourceSemanticsIndependentlyVerified,false);
  assert.equal(r.cannotAuthorizeReferenceFidelity,true);
});
test('QA-01b physical current GLB role sizes swap while immutable earlier source and shape GLB remain valid: FAIL',()=>{
  const r=replay({current:glb(true)});
  assert.equal(r.status,'FAIL',r.reason);
  assert.equal(r.results[0].status,'REWORK');
  assert.match(r.reason,/GLB physical relation contradicts original-source/);
});
test('QA-01b a forged checksum-valid accepted relation PASS is demoted when source role attestation lacks independent authority',()=>{
  const worker={id:'relational-evidence',owner:'spatial-hypotheses',required:true,
    status:'PASS',reason:'all signed artifacts present',evidence:['b'.repeat(64)]};
  const result=constrainSourceRelationalCoverage(worker,replay());
  assert.equal(result.status,'INSUFFICIENT');
  assert.equal(result.required,true);
  assert.match(result.reason,/independent original-photo role attestation/);
  assert.equal(constrainSourceRelationalCoverage(worker,replay({current:glb(true)})).status,'FAIL');
  assert.equal(worker.status,'PASS','input should remain unchanged');
});
test('QA-01b a missing relational report stays NOT_RUN even if physical replay measures no contradiction',()=>{
  const missing={id:'relational-evidence',owner:'spatial-hypotheses',required:true,
    status:'NOT_RUN',reason:'missing',evidence:[]};
  assert.equal(constrainSourceRelationalCoverage(missing,replay()).status,'NOT_RUN');
});
test('QA-01b stale prior signed shape-stage proof is rejected when original shape GLB bytes were altered',()=>{
  const ref=observed(),old=glb(),proof=prior(ref,old);
  assert.throws(()=>replay({ref,old:glb(true),proof,current:old}),
    /shape-stage realized projection did not independently replay/);
});
test('QA-01b current candidate must be independently physically projectable rather than silently accepting an arbitrary GLB',()=>{
  const r=replay({current:Buffer.from('not a GLB')});
  assert.equal(r.status,'INSUFFICIENT');
  assert.match(r.reason,/cannot be projected/);
});
test('QA-01b source SHA drift and scope substitutions fail closed',()=>{
  const ref=observed(),shapeGlb=glb(),proof=prior(ref,shapeGlb);
  assert.throws(()=>replaySourceSemanticPhysicalEvidence({
    referenceGeometry:ref,shapeProjection:proof,shapeGlb,currentGlb:shapeGlb,
    sourceSha256:'f'.repeat(64),sourcePath,
  }),/original source SHA/);
  assert.throws(()=>replaySourceSemanticPhysicalEvidence({
    referenceGeometry:ref,shapeProjection:{...proof,scopeId:'other'},
    shapeGlb,currentGlb:shapeGlb,sourceSha256,sourcePath,
  }),/original source SHA and scope/);
});


// QA-03c: all photo ROIs deliberately align with the physical original GLB.
// Existing conservative source annotations alone remain non-authoritative.
function alignedSource({rearVisibility='visible',rearCite=sourcePath}={}){
 return createReferenceGeometry({scopeId:'whole',sourceSha256,
  anchors:[
   {id:'front-observed',semanticRole:'front-basket',importance:'identity',
    xy:[.3,.5],visibility:'visible',evidenceRefs:[sourcePath]},
   {id:'rear-observed',semanticRole:'rear-basket',importance:'identity',
    xy:[.7,.5],visibility:rearVisibility,evidenceRefs:[rearCite]},
  ],
  segments:[
   {id:'front-basket-source',label:'front-basket',importance:'identity',
    polygon:rect(.3,.12,.08),anchorIds:['front-observed'],
    visibility:'visible',separation:'explicit',evidenceRefs:[sourcePath]},
   {id:'rear-basket-source',label:'rear-basket',importance:'identity',
    polygon:rect(.7,.07,.04),anchorIds:['rear-observed'],
    visibility:rearVisibility,separation:'explicit',evidenceRefs:[rearCite]},
  ],
  attestation:{attested:true,evidenceRefs:[sourcePath]},
 });
}
function currentWithRear({present=true,renamed=false,substitute=false}={}){
 const large=createSegmentPrism({start:[-.3,0,0],end:[.3,0,0],
  width:.4,height:.4,upHint:[0,0,1]});
 const small=createSegmentPrism({start:[-.15,0,0],end:[.15,0,0],
  width:.2,height:.2,upHint:[0,0,1]});
 return partsToGlb({
  materials:{clay:{baseColor:[.8,.8,.8,1],metallic:0,roughness:1}},
  parts:[
   {id:'front-mesh',scopeId:'whole.front',materialId:'clay',
    mesh:large,translation:[-.8,0,0]},
   ...(present?[{id:renamed?'renamed-rear-physical':'rear-mesh',
    scopeId:'whole.rear',materialId:'clay',mesh:small,translation:[.8,0,0]}]:[]),
   ...(substitute?[{id:'unrelated-center',scopeId:'whole.inferred',
    materialId:'clay',mesh:small,translation:[0,0,0]}]:[]),
  ],
 });
}
test('QA-03c actually deleted visible rear basket on current GLB fails negative final source evidence',()=>{
 const ref=alignedSource(),original=currentWithRear(),deleted=currentWithRear({present:false});
 const r=replay({ref,old:original,current:deleted});
 assert.equal(r.status,'FAIL',JSON.stringify(r));
 assert.equal(r.results[0].id,'required-part-presence');
 assert.equal(r.results[0].status,'REWORK');
 assert.equal(r.results[0].sourceSemanticsIndependentlyVerified,false);
 assert.equal(r.results[0].cannotAuthorizeReferenceFidelity,true);
 assert.match(r.reason,/physically lost original-source visible identity region/);
 const worker={id:'relational-evidence',owner:'spatial-hypotheses',
   required:true,status:'PASS',reason:'signed worker passed',evidence:[]};
 assert.equal(constrainSourceRelationalCoverage(worker,r).status,'FAIL');
});
test('QA-03c metadata-only physical node renaming without loss does not become definite FAIL',()=>{
 const ref=alignedSource(),old=currentWithRear(),current=currentWithRear({renamed:true});
 const result=replay({ref,old,current});
 assert.equal(result.status,'INSUFFICIENT',JSON.stringify(result));
 assert.equal(result.results[0].status,'NO_DETECTED_CONTRADICTION');
 assert.equal(result.sourceSemanticsIndependentlyVerified,false);
});
test('QA-03c hidden or non-source-cited rear basket cannot be asserted absent',()=>{
 const original=currentWithRear(),deleted=currentWithRear({present:false});
 for(const ref of [alignedSource({rearVisibility:'inferred'}),
                   alignedSource({rearCite:'renders/generated-hero.png'})]){
  const result=replay({ref,old:original,current:deleted});
  assert.equal(result.status,'INSUFFICIENT',JSON.stringify(result));
  assert.equal(result.results[0].status,'NO_DETECTED_CONTRADICTION');
 }
});
test('QA-03c unrelated physical subpart does not replace required rear basket ROI',()=>{
 const ref=alignedSource(),original=currentWithRear();
 const result=replay({ref,old:original,current:currentWithRear({present:false,substitute:true})});
 assert.equal(result.status,'FAIL');
 assert.equal(result.results[0].status,'REWORK');
});

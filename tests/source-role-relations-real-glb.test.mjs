import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createReferenceGeometry,createRealizedProjection,verifyRealizedProjection,
  createSegmentPrism,partsToGlb,screenSourcePartRoleRelations,
} from '../skills/refas/scripts/lib/index.mjs';

const SHA='a'.repeat(64),SOURCE='source/original-bicycle.png';
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],up:[0,1,0],
  orthoHeight:4,aspect:1};
const poly=(x,y,w,h)=>[[x-w/2,y-h/2],[x+w/2,y-h/2],
  [x+w/2,y+h/2],[x-w/2,y+h/2]];
const big=createSegmentPrism({start:[-.3,0,0],end:[.3,0,0],
  width:.4,height:.4,upHint:[0,0,1]});
const small=createSegmentPrism({start:[-.15,0,0],end:[.15,0,0],
  width:.2,height:.2,upHint:[0,0,1]});

function reference({hiddenRear=false,omitRearCitation=false,duplicateRole=false,
  ambiguous=false}={}){
  const cx=ambiguous?[.47,.53]:[.3,.7];
  const frontWidth=ambiguous?.1:.15, rearWidth=ambiguous?.1:.075;
  const frontHeight=ambiguous?.08:.1, rearHeight=ambiguous?.08:.05;
  return createReferenceGeometry({scopeId:'whole',sourceSha256:SHA,
    anchors:[
      {id:'front-roi-center',semanticRole:'source-front-basket',importance:'identity',
        xy:[cx[0],.5],visibility:'visible',evidenceRefs:[SOURCE]},
      {id:'rear-roi-center',semanticRole:duplicateRole?'source-front-basket':'source-rear-basket',
        importance:'identity',xy:[cx[1],.5],visibility:hiddenRear?'inferred':'visible',
        evidenceRefs:[SOURCE]},
    ],
    segments:[
      {id:'front-basket-roi',label:'source photo front basket',importance:'identity',
        visibility:'visible',separation:'explicit',anchorIds:['front-roi-center'],
        polygon:poly(cx[0],.5,frontWidth,frontHeight),evidenceRefs:[SOURCE]},
      {id:'rear-basket-roi',label:'source photo rear basket',importance:'identity',
        visibility:hiddenRear?'inferred':'visible',separation:'explicit',
        anchorIds:['rear-roi-center'],polygon:poly(cx[1],.5,rearWidth,rearHeight),
        evidenceRefs:omitRearCitation?['model/generated.png']:[SOURCE]},
    ],attestation:{attested:true,evidenceRefs:[SOURCE]}});
}
function glb({swapSize=false,swapPositions=false,missingRear=false}={}){
  return partsToGlb({assetId:'qa03b-basket-physical-regression',
    materials:{clay:{baseColor:[.7,.7,.7,1],metallic:0,roughness:1}},
    parts:[
      {id:'physical-front',scopeId:'whole.front',materialId:'clay',
        mesh:swapSize?small:big,translation:[swapPositions?.8:-.8,0,0]},
      ...(!missingRear?[{id:'physical-rear',scopeId:'whole.rear',materialId:'clay',
        mesh:swapSize?big:small,translation:[swapPositions?-.8:.8,0,0]}]:[]),
    ]});
}
function proof(ref,asset,{shared=false,omitRearBinding=false}={}){
  return createRealizedProjection({
    referenceGeometry:ref,glb:asset,camera,cameraHypothesisId:'source-selected',
    anchorBindings:[
      {referenceId:'front-roi-center',nodeId:'physical-front',localPoint:[0,0,0]},
      {referenceId:'rear-roi-center',nodeId:'physical-front',localPoint:[.1,0,0]},
    ],
    segmentBindings:[
      {referenceId:'front-basket-roi',nodeIds:['physical-front']},
      ...(!omitRearBinding?[{referenceId:'rear-basket-roi',
        nodeIds:[shared?'physical-front':'physical-rear']}]:[]),
    ],evidenceRefs:[SOURCE,'model/candidate.glb'],
  });
}
const screen=(r,p)=>screenSourcePartRoleRelations({
  referenceGeometry:r,realizedProjection:p,sourcePath:SOURCE});
test('QA03a real GLB source-front-large vs source-rear-small order and area are noncontradictory, never reference PASS',()=>{
  const r=reference(),g=glb(),p=proof(r,g);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:r,glb:g}).valid,true);
  const result=screen(r,p);
  assert.equal(result.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(result.findings));
  assert.equal(result.checks.length,1);
  assert.equal(result.checks[0].clearOrder,true);
  assert.equal(result.checks[0].clearArea,true);
  assert.equal(result.cannotIndependentlyRecognizeSourceSemantics,true);
  assert.equal(result.cannotAuthorizeReferenceFidelity,true);
});
test('QA03a physically swap actual front and rear basket mesh sizes while names/source remain unchanged',()=>{
  const r=reference(),g=glb({swapSize:true}),p=proof(r,g);
  assert.equal(verifyRealizedProjection({proof:p,referenceGeometry:r,glb:g}).valid,true);
  const result=screen(r,p);
  assert.equal(result.status,'REWORK');
  assert.match(result.findings.map(x=>x.reason).join('; '),/area ratio/);
});
test('QA03a physically swap actual GLB basket positions while source ROIs remain frozen',()=>{
  const r=reference(),g=glb({swapPositions:true}),p=proof(r,g);
  const result=screen(r,p);
  assert.equal(result.status,'REWORK');
  assert.match(result.findings.map(x=>x.reason).join('; '),/part order/);
});
test('QA03a physically missing visible rear basket fails binding, not an invented NOT_APPLICABLE',()=>{
  const r=reference(),missing=glb({missingRear:true});
  assert.throws(()=>proof(r,missing),/unknown GLB node/);
  const valid=proof(r,glb());
  assert.throws(()=>proof(r,glb(),{omitRearBinding:true}),/missing source-visible segments/);
  const missingDerived={...valid,derivedSegments:valid.derivedSegments.filter(x=>
    x.referenceId!=='rear-basket-roi')};
  assert.equal(screen(r,missingDerived).status,'INSUFFICIENT');
});
test('QA03a same real GLB mesh claimed as both original baskets is insufficient',()=>{
  const r=reference(),p=proof(r,glb(),{shared:true});
  assert.equal(screen(r,p).status,'INSUFFICIENT');
});
test('QA03a hidden, raw-source uncited, duplicate, or unresolved source evidence cannot PASS',()=>{
  for(const opts of [{hiddenRear:true},{omitRearCitation:true},{duplicateRole:true},{ambiguous:true}]){
    const r=reference(opts),g=glb();
    const p=proof(r,g,{omitRearBinding:opts.hiddenRear===true});
    assert.equal(screen(r,p).status,'INSUFFICIENT',JSON.stringify(opts));
  }
});
test('QA03a old physically size-correct projection cannot replay GLB with mutated part sizes',()=>{
  const r=reference(),old=proof(r,glb()),changed=glb({swapSize:true});
  assert.equal(verifyRealizedProjection({proof:old,referenceGeometry:r,glb:changed}).valid,false);
});
test('QA03a source and current projection SHA/scope substitution fails closed',()=>{
  const r=reference(),p=proof(r,glb());
  assert.throws(()=>screen(r,{...p,sourceSha256:'f'.repeat(64)}),/original-source SHA/);
  assert.throws(()=>screen(r,{...p,scopeId:'other'}),/current GLB scope/);
});

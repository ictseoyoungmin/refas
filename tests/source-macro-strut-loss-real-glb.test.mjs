import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 createReferenceGeometry,createRealizedProjection,
 createSegmentPrism,partsToGlb,
 screenLostSourceVisibleParts,replaySourceSemanticPhysicalEvidence,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE='source/original-frame.png',SHA='a'.repeat(64);
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],
 up:[0,1,0],aspect:1,orthoHeight:4};
function source({visibility='visible',cite=SOURCE,importance='macro',role='diagonal-strut'}={}){
 return createReferenceGeometry({scopeId:'whole',sourceSha256:SHA,
  anchors:[{id:'strut-center',semanticRole:role,importance,
   xy:[.5,.5],visibility,evidenceRefs:[cite]}],
  segments:[{id:'required-frame-strut',label:'observed diagonal/frame support',
   importance,visibility,separation:'explicit',
   polygon:[[.48,.45],[.52,.45],[.52,.55],[.48,.55]],
   anchorIds:['strut-center'],evidenceRefs:[cite]}],
  attestation:{attested:true,evidenceRefs:[SOURCE]},
 });
}
function meshAt({move=false,rename=false}={}){
 const mesh=createSegmentPrism({
   start:[0,-.2,0],end:[0,.2,0],width:.1,height:.12,upHint:[0,0,1],
 });
 return partsToGlb({assetId:'qa03d-structural-source-loss',
   materials:{clay:{baseColor:[.8,.8,.8,1],metallic:0,roughness:1}},
   parts:[{id:rename?'renamed-mesh-node':'physical-strut',
     mesh,scopeId:'whole.frame-strut',materialId:'clay',
     ...(move?{translation:[1.2,0,0]}:{})}],
 });
}
function frozen(ref,glb){
 return createRealizedProjection({referenceGeometry:ref,glb,
  cameraHypothesisId:'source-camera',camera,
  anchorBindings:[{referenceId:'strut-center',nodeId:'physical-strut',
    localPoint:[0,0,0]}],
  segmentBindings:[{referenceId:'required-frame-strut',
    nodeIds:['physical-strut']}],
  evidenceRefs:[SOURCE,'model/original-frame.glb']});
}
function negative({current=meshAt({move:true}),ref=source(),old=meshAt()}={}){
 const proof=frozen(ref,old);
 return replaySourceSemanticPhysicalEvidence({
  referenceGeometry:ref,shapeProjection:proof,shapeGlb:old,currentGlb:current,
  sourceSha256:SHA,sourcePath:SOURCE,
 });
}
test('QA-03d moved actual support strut with SAME mesh node identity is a source structural failure',()=>{
 const r=negative();
 assert.equal(r.status,'FAIL',JSON.stringify(r));
 const loss=r.results.find(x=>x.id==='required-part-presence');
 assert.equal(loss?.status,'REWORK',JSON.stringify(r));
 assert.equal(loss.checks.length,1);
 assert.ok(loss.checks[0].originalPhysicalCoverage>=.3);
 assert.ok(loss.checks[0].currentPhysicalCoverage<=.01);
 assert.match(r.reason,/required-part-presence/);
 assert.equal(r.sourceSemanticsIndependentlyVerified,false);
});
test('QA-03d unchanged actual physical macro strut cannot earn positive source semantics',()=>{
 const old=meshAt(),ref=source(),r=negative({old,current:old,ref});
 assert.equal(r.status,'INSUFFICIENT');
 assert.equal(r.sourceSemanticsIndependentlyVerified,false);
 assert.equal(r.cannotAuthorizeReferenceFidelity,true);
});
test('QA-03d surviving renamed strut geometry is not falsely marked missing',()=>{
 const ref=source(),old=meshAt(),current=meshAt({rename:true});
 const r=negative({ref,old,current});
 assert.equal(r.status,'INSUFFICIENT',JSON.stringify(r));
 assert.equal(r.results.find(x=>x.id==='required-part-presence')?.status,
  'NO_DETECTED_CONTRADICTION');
});
test('QA-03d hidden, uncited or ambiguous source-role macro evidence cannot force FAIL',()=>{
 const old=meshAt(),current=meshAt({move:true});
 for(const ref of [
  source({visibility:'inferred'}),
  source({cite:'renders/generated.png'}),
  source({role:''}),
 ]){
  const r=negative({old,current,ref});
  assert.notEqual(r.status,'FAIL',JSON.stringify(r));
 }
});
test('QA-03d physically same source macro observation with stale prior GLB proof is refused',()=>{
 const ref=source(),old=meshAt(),proof=frozen(ref,old);
 assert.throws(()=>replaySourceSemanticPhysicalEvidence({
  referenceGeometry:ref,shapeProjection:proof,shapeGlb:meshAt({move:true}),
  currentGlb:old,sourceSha256:SHA,sourcePath:SOURCE,
 }),/shape-stage realized projection did not independently replay/);
});

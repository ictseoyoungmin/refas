import assert from 'node:assert/strict';
import {test} from 'node:test';
import {screenSourceProfileVector} from '../skills/refas/scripts/lib/source-profile-vector-screen.mjs';

const SRC='source.png',SHA='a'.repeat(64);
const poly=(x,y=.5,w=.03,h=.03)=>[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
function mock({noseX=.58,sourceNose=.58,noseVisible=true,
  duplicateRole=false,duplicateRegion=false,sameNode=false,
  omitNose=false,facePartMissing=false,citation=SRC}={}) {
  const anchors=[
    {id:'face-center',semanticRole:'face-center',xy:[.5,.5],visibility:'visible',evidenceRefs:[citation]},
    ...(!omitNose?[{id:'nose-tip',semanticRole:'nose-tip',xy:[sourceNose,.5],
      visibility:noseVisible?'visible':'inferred',evidenceRefs:[citation]}]:[]),
    ...(duplicateRole?[{id:'duplicate-nose',semanticRole:'nose-tip',xy:[sourceNose,.5],
      visibility:'visible',evidenceRefs:[citation]}]:[]),
  ];
  const segments=[
    ...(!facePartMissing?[{id:'face-region',importance:'identity',anchorIds:['face-center'],
      polygon:poly(.5,.5,.16,.18),visibility:'visible',evidenceRefs:[citation]}]:[]),
    ...(!omitNose?[{id:'nose-region',importance:'identity',anchorIds:['nose-tip'],
      polygon:poly(sourceNose),visibility:'visible',evidenceRefs:[citation]}]:[]),
    ...(duplicateRegion?[{id:'duplicate-region',importance:'identity',anchorIds:['nose-tip'],
      polygon:poly(sourceNose),visibility:'visible',evidenceRefs:[citation]}]:[]),
  ];
  const realized=[
    {referenceId:'face-region',meshNodeIndices:[1],projectedHull:poly(.5,.5,.16,.18)},
    {referenceId:'nose-region',meshNodeIndices:[sameNode?1:2],projectedHull:poly(noseX)},
    ...(duplicateRegion?[{referenceId:'duplicate-region',meshNodeIndices:[3],projectedHull:poly(noseX)}]:[]),
  ];
  return {referenceGeometry:{scopeId:'whole',sourceSha256:SHA,anchors,segments},
    realizedProjection:{scopeId:'whole',sourceSha256:SHA,assetSha256:'b'.repeat(64),
      derivedSegments:realized},sourcePath:SRC};
}
const check=x=>screenSourceProfileVector(mock(x));
test('profile positive means only no detected contradiction, never gaze authority',()=>{
  const r=check();assert.equal(r.status,'NO_DETECTED_CONTRADICTION');
  assert.equal(r.cannotAuthorizeReferenceFidelity,true);
  assert.equal(r.cannotInferWorldSpaceGaze,true);
});
test('source right / physical left is REWORK',()=>{
  const r=check({noseX:.42});assert.equal(r.status,'REWORK');
  assert.ok(r.measurements[0].errorDegrees>170);
});
test('missing nose, inferred nose and frontal source are insufficient',()=>{
  assert.equal(check({omitNose:true}).status,'INSUFFICIENT');
  assert.equal(check({noseVisible:false}).status,'INSUFFICIENT');
  assert.equal(check({sourceNose:.51}).status,'INSUFFICIENT');
});
test('duplicate source nose features or multiple semantic parts are not first-match PASS',()=>{
  assert.equal(check({duplicateRole:true}).status,'INSUFFICIENT');
  assert.equal(check({duplicateRegion:true}).status,'INSUFFICIENT');
});
test('shared GLB mesh ownership or missing face segment cannot pass',()=>{
  assert.equal(check({sameNode:true}).status,'INSUFFICIENT');
  assert.equal(check({facePartMissing:true}).status,'INSUFFICIENT');
});
test('source evidence citation and current realized scope are mandatory',()=>{
  assert.equal(check({citation:'model/forgery.png'}).status,'INSUFFICIENT');
  const item=mock();item.realizedProjection.sourceSha256='f'.repeat(64);
  assert.throws(()=>screenSourceProfileVector(item),/original source SHA/);
  const item2=mock();item2.realizedProjection.scopeId='other';
  assert.throws(()=>screenSourceProfileVector(item2),/current GLB scope/);
});
test('nose mesh loses physical lateral displacement while source anchor stays signed',()=>{
  const r=check({noseX:.501});assert.equal(r.status,'REWORK');
  assert.match(r.findings.map(x=>x.reason).join('; '),/lost signed source lateral protrusion/);
});
test('unannotated source is never a positive source-profile authority',()=>{
  const item=mock({omitNose:true});item.referenceGeometry.anchors=[];
  const r=screenSourceProfileVector(item);assert.equal(r.status,'NOT_APPLICABLE');
  assert.equal(r.cannotAuthorizeReferenceFidelity,true);
});

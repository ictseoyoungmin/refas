import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createRealizedProjection, createReferenceGeometry, createSegmentPrism,
  partsToGlb, verifyRealizedProjection, screenSourceProfileVector,
  screenSourceMacroSectionEnvelopes,
} from '../skills/refas/scripts/lib/index.mjs';

const SRC='source/reference.png', SHA='a'.repeat(64);
const camera={projection:'orthographic',position:[0,0,5],target:[0,0,0],up:[0,1,0],orthoHeight:4,aspect:1};
const polygon=(cx,cy,w,h)=>[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
const faceMesh=createSegmentPrism({start:[-.24,0,0],end:[.24,0,0],width:.48,height:.3,upHint:[0,0,1]});
const noseMesh=createSegmentPrism({start:[-.04,0,0],end:[.04,0,0],width:.07,height:.12,upHint:[0,0,1]});

function geometry(noseSourceX=.55, noseVisibility='visible') {
  return createReferenceGeometry({scopeId:'whole',sourceSha256:SHA,
    anchors:[
      {id:'face-center',semanticRole:'face-center',importance:'macro',xy:[.5,.5],
        visibility:'visible',confidence:1,evidenceRefs:[SRC]},
      {id:'nose-tip',semanticRole:'nose-tip',importance:'macro',xy:[noseSourceX,.5],
        visibility:noseVisibility,confidence:1,evidenceRefs:[SRC]},
    ],
    segments:[
      {id:'face-region',label:'face',importance:'macro',visibility:'visible',
        polygon:polygon(.5,.5,.15,.15),anchorIds:['face-center'],
        separation:'uncertain',evidenceRefs:[SRC]},
      {id:'nose-region',label:'nose',importance:'macro',visibility:noseVisibility,
        polygon:polygon(noseSourceX,.5,.025,.025),anchorIds:['nose-tip'],
        separation:'uncertain',evidenceRefs:[SRC]},
    ],
    attestation:{attested:true,evidenceRefs:[SRC]},
  });
}
function asset(noseX) {
  return partsToGlb({assetId:'source-profile-physical-regression',
    materials:{clay:{baseColor:[.8,.7,.6,1],metallic:0,roughness:1}},
    parts:[
      {id:'face-shell',scopeId:'whole.face',materialId:'clay',mesh:faceMesh},
      {id:'nose-shell',scopeId:'whole.nose',materialId:'clay',
        mesh:noseMesh,translation:[noseX,0,.15]},
    ],
  });
}
function realized(ref,glb,spoofedLandmarkX=.2) {
  return createRealizedProjection({referenceGeometry:ref,glb,camera,
    cameraHypothesisId:'source-selected-profile',
    anchorBindings:[
      {referenceId:'face-center',nodeId:'face-shell',localPoint:[0,0,0]},
      // Deliberately authored *face-node point*. It matches original-source
      // nose coordinates even if physical separate nose mesh is elsewhere.
      {referenceId:'nose-tip',nodeId:'face-shell',
        localPoint:[spoofedLandmarkX,0,0]},
    ],
    segmentBindings:[
      {referenceId:'face-region',nodeIds:['face-shell']},
      {referenceId:'nose-region',nodeIds:['nose-shell']},
    ],
    evidenceRefs:[SRC,'model/actual.glb'],
  });
}

test('S03b2 physical source-right and actual nose-right are noncontradictory, never a fidelity PASS',()=>{
  const ref=geometry(),glb=asset(.2),proof=realized(ref,glb);
  assert.equal(verifyRealizedProjection({proof,referenceGeometry:ref,glb}).valid,true);
  const result=screenSourceProfileVector({referenceGeometry:ref,realizedProjection:proof,sourcePath:SRC});
  assert.equal(result.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(result.findings));
  assert.equal(result.cannotAuthorizeReferenceFidelity,true);
  assert.equal(result.cannotInferWorldSpaceGaze,true);
});

test('S03b2 physical GLB nose flips while source & forged landmarks match, but S03a tolerates the envelope',()=>{
  const ref=geometry(),glb=asset(-.08),proof=realized(ref,glb);
  assert.equal(verifyRealizedProjection({proof,referenceGeometry:ref,glb}).valid,true);
  assert.ok(proof.projectionFit.metrics.macroAnchorRmseNormalized<1e-10);
  const outer=screenSourceMacroSectionEnvelopes({referenceGeometry:ref,realizedProjection:proof,sourcePath:SRC});
  assert.equal(outer.status,'NO_DETECTED_CONTRADICTION',JSON.stringify(outer.findings));
  const profile=screenSourceProfileVector({referenceGeometry:ref,realizedProjection:proof,sourcePath:SRC});
  assert.equal(profile.status,'REWORK',JSON.stringify(profile.findings));
  assert.match(profile.findings.map(f=>f.reason).join('; '),/lost signed source lateral protrusion/);
});

test('S03b2 signed old GLB profile proof cannot attest a physical geometry mutation',()=>{
  const ref=geometry(),good=asset(.2),wrong=asset(-.08);
  const old=realized(ref,good);
  assert.equal(verifyRealizedProjection({proof:old,referenceGeometry:ref,glb:wrong}).valid,false);
});

test('S03b2 hidden/ambiguous primary source feature remains INSUFFICIENT',()=>{
  const ref=geometry(.55,'inferred'),glb=asset(.2);
  const proof=realized(ref,glb);
  const result=screenSourceProfileVector({referenceGeometry:ref,realizedProjection:proof,sourcePath:SRC});
  assert.equal(result.status,'INSUFFICIENT');
});

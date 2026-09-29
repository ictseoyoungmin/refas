import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBilateralPairRealization,
  createRelationalStructure,
  partsToGlb,
  validateBilateralPairRealization,
  validateRelationalStructure,
} from '../skills/refas/scripts/lib/index.mjs';
import {
  CORVID_LEG_OVERFIT,
  legacyIndependentCorvidLegMeshes,
  sharedCorvidLegMesh,
} from './fixtures/bilateral-corvid-fixture.mjs';

const SOURCE='a'.repeat(64);
const MATERIALS={clay:{baseColor:[0.6,0.6,0.6,1],metallic:0,roughness:0.8}};

function structure({
  restGeometryPolicy='shared-mirrored',
  basisKind='body-relative-inference',
  authority='inferred',
  intrinsicAsymmetry=null,
  halfSpan=0.09,
}={}){
  return createRelationalStructure({
    scopeId:'whole',
    sourceSha256:SOURCE,
    entities:[
      {id:'left-leg',kind:'volume',role:'paired-left',basisRefs:['source:corvid']},
      {id:'right-leg',kind:'volume',role:'paired-right',basisRefs:['source:corvid']},
      {id:'sagittal-plane',kind:'plane',role:'bilateral-mirror-plane',basisRefs:['source:body-center']},
    ],
    relations:[{
      id:'leg-pair',
      kind:'bilateral-pair',
      scope:'whole-system',
      importance:'identity',
      entityIds:['left-leg','right-leg'],
      leftEntityId:'left-leg',
      rightEntityId:'right-leg',
      sagittalPlaneId:'sagittal-plane',
      restGeometryPolicy,
      lateralSpan:{
        halfSpan,
        authority,
        basisKind,
        evidenceRefs:['source:body-envelope'],
      },
      intrinsicAsymmetry,
      basisRefs:['source:corvid','source:body-envelope'],
    }],
    basisRefs:['source:corvid'],
  });
}

function candidate(leftMesh,rightMesh,{mirrored=true}={}){
  return partsToGlb({
    assetId:'corvid-bilateral-fixture',
    parts:[
      {
        id:'left-leg',mesh:leftMesh,materialId:'clay',role:'leg',scopeId:'whole',
        translation:[-0.09,0,0],scale:[1,1,1],
      },
      {
        id:'right-leg',mesh:rightMesh,materialId:'clay',role:'leg',scopeId:'whole',
        translation:[0.09,0,0],scale:mirrored?[-1,1,1]:[1,1,1],
      },
    ],
    materials:MATERIALS,
  });
}

function realization(glb,relationalStructure){
  return createBilateralPairRealization({
    glb,
    relationalStructure,
    relationId:'leg-pair',
    cameraExplanation:{
      hypothesisDigest:'b'.repeat(64),
      evidenceRefs:['source:camera-obliquity'],
    },
    poseEvidence:[
      {entityId:'left-leg',explanation:'near leg flexion and camera foreshortening explain the visible near-side pose',evidenceRefs:['source:near-leg-pose']},
      {entityId:'right-leg',explanation:'far leg articulation and occlusion explain the visible far-side pose',evidenceRefs:['source:far-leg-pose']},
    ],
    evidenceRefs:['reviews:corvid-bilateral'],
  });
}

test('bilateral relation rejects image-plane separation as lateral-depth authority',()=>{
  assert.throws(()=>structure({
    basisKind:'image-plane-separation',
    authority:'observed',
    halfSpan:CORVID_LEG_OVERFIT.imagePlaneHipHalfSpan,
  }),/cannot use image-plane separation as 3D lateral authority/);
});

test('corvid independent per-leg rest geometry is rejected under shared-mirrored authority',()=>{
  const pair=structure();
  const legacy=legacyIndependentCorvidLegMeshes();
  const glb=candidate(legacy.left,legacy.right);
  assert.throws(()=>realization(glb,pair),/independent rest geometry under shared-mirrored policy/);
});

test('shared corvid leg rest geometry plus mirror and pose explanation is admitted',()=>{
  const pair=structure();
  assert.deepEqual(validateRelationalStructure(pair),{valid:true,errors:[]});
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);
  const proof=realization(glb,pair);
  assert.equal(proof.restGeometryPolicy,'shared-mirrored');
  assert.equal(proof.instances[0].restGeometryDigest,proof.instances[1].restGeometryDigest);
  assert.equal(proof.instances[0].transformParity,1);
  assert.equal(proof.instances[1].transformParity,-1);
  assert.deepEqual(validateBilateralPairRealization(proof,{glb,relationalStructure:pair}),{valid:true,errors:[]});
});

test('shared bilateral rest geometry requires actual mirror parity',()=>{
  const pair=structure();
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared,{mirrored:false});
  assert.throws(()=>realization(glb,pair),/must realize opposite transform parity/);
});

test('intrinsic asymmetric pair permits distinct rest geometry only with observed source evidence',()=>{
  const intrinsic={
    authority:'observed',
    sourceObservation:'The source directly shows intentionally different left and right leg housings.',
    evidenceRefs:['source:intrinsic-asymmetry'],
  };
  const pair=structure({restGeometryPolicy:'observed-intrinsic-asymmetry',intrinsicAsymmetry:intrinsic});
  const legacy=legacyIndependentCorvidLegMeshes();
  const glb=candidate(legacy.left,legacy.right,{mirrored:false});
  const proof=realization(glb,pair);
  assert.notEqual(proof.instances[0].restGeometryDigest,proof.instances[1].restGeometryDigest);
  assert.deepEqual(validateBilateralPairRealization(proof,{glb,relationalStructure:pair}),{valid:true,errors:[]});

  assert.throws(()=>structure({
    restGeometryPolicy:'observed-intrinsic-asymmetry',
    intrinsicAsymmetry:{
      authority:'inferred',
      sourceObservation:'Maybe asymmetric.',
      evidenceRefs:['prior:guess'],
    },
  }),/intrinsicAsymmetry must be observed/);
});

test('bilateral realization is candidate-bound and rejects stale replay',()=>{
  const pair=structure();
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);
  const proof=realization(glb,pair);
  const legacy=legacyIndependentCorvidLegMeshes();
  const changed=candidate(legacy.left,legacy.right);
  assert.equal(validateBilateralPairRealization(proof,{glb:changed,relationalStructure:pair}).valid,false);
});

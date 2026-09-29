import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBilateralPairRealization,
  createRelationalDiscrepancy,
  createRelationalStructure,
  digestBytes,
  parseGlb,
  partsToGlb,
  validateBilateralPairRealization,
  validateRelationalDiscrepancy,
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
      mirrorAxis:'x',
      leftHalfSpace:'negative',
      mirrorPlaneCoordinate:0,
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

function rewriteGlbJson(glb, mutate) {
  const parsed=parseGlb(glb);
  const json=structuredClone(parsed.json);
  mutate(json);
  const jsonBytes=Buffer.from(JSON.stringify(json));
  const align4=(value)=>(value+3)&~3;
  const jsonLength=align4(jsonBytes.length), binaryLength=align4(parsed.binary.length);
  const output=Buffer.alloc(12+8+jsonLength+8+binaryLength);
  output.writeUInt32LE(0x46546c67,0);
  output.writeUInt32LE(2,4);
  output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(jsonLength,12);
  output.writeUInt32LE(0x4e4f534a,16);
  jsonBytes.copy(output,20);
  output.fill(0x20,20+jsonBytes.length,20+jsonLength);
  const binaryOffset=20+jsonLength;
  output.writeUInt32LE(binaryLength,binaryOffset);
  output.writeUInt32LE(0x004e4942,binaryOffset+4);
  parsed.binary.copy(output,binaryOffset+8);
  return output;
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

test('declared mirror axis cannot be replaced by another negative-scale axis',()=>{
  const pair=structure();
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);
  const wrongAxis=rewriteGlbJson(glb,(json)=>{
    const right=json.nodes.find((node)=>(node.extras?.refasPartId??node.name)==='right-leg');
    right.scale=[1,-1,1];
  });
  assert.throws(()=>realization(wrongAxis,pair),/declared mirror axis|may only flip scale/);
});

test('candidate must realize the declared bilateral lateral half-span',()=>{
  const pair=structure({halfSpan:.09});
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);
  const drifted=rewriteGlbJson(glb,(json)=>{
    const right=json.nodes.find((node)=>(node.extras?.refasPartId??node.name)==='right-leg');
    right.translation=[.12,0,0];
  });
  assert.throws(()=>realization(drifted,pair),/declared lateral half-span/);
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

test('inactive scene nodes and deformed pair nodes cannot satisfy bilateral authority',()=>{
  const pair=structure();
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);

  const inactiveRight=rewriteGlbJson(glb,(json)=>{
    const right=json.nodes.findIndex((node)=>(node.extras?.refasPartId??node.name)==='right-leg');
    json.scenes[json.scene??0].nodes=json.scenes[json.scene??0].nodes.filter((index)=>index!==right);
  });
  assert.throws(()=>realization(inactiveRight,pair),/active candidate scene must contain exactly one node for bilateral entity right-leg/);

  const morphed=rewriteGlbJson(glb,(json)=>{
    const right=json.nodes.find((node)=>(node.extras?.refasPartId??node.name)==='right-leg');
    right.weights=[0];
  });
  assert.throws(()=>realization(morphed,pair),/cannot use skin or morph weights/);

  const wrongPositionFormat=rewriteGlbJson(glb,(json)=>{
    const left=json.nodes.find((node)=>(node.extras?.refasPartId??node.name)==='left-leg');
    const accessor=json.meshes[left.mesh].primitives[0].attributes.POSITION;
    json.accessors[accessor].componentType=5123;
  });
  assert.throws(()=>realization(wrongPositionFormat,pair),/POSITION component type is invalid/);
});

test('bilateral whole-system discrepancy derives PASS only from exact candidate replay',()=>{
  const pair=structure();
  const shared=sharedCorvidLegMesh();
  const glb=candidate(shared,shared);
  const proof=realization(glb,pair);
  const candidateSha256=digestBytes(glb);
  const observations=[{
    relationId:'leg-pair',
    bilateralPairRealization:proof,
    evidenceRefs:['proof:bilateral-realization'],
  }];
  const discrepancy=createRelationalDiscrepancy({
    relationalStructure:pair,
    candidateAssetSha256:candidateSha256,
    candidateGlb:glb,
    observations,
  });
  assert.equal(discrepancy.status,'PASS');
  assert.equal(discrepancy.checks[0].relationKind,'bilateral-pair');
  assert.equal(discrepancy.checks[0].measurement.realizationDigest,proof.realizationDigest);
  assert.deepEqual(validateRelationalDiscrepancy(discrepancy,{candidateGlb:glb}),{valid:true,errors:[]});
  assert.throws(()=>createRelationalDiscrepancy({
    relationalStructure:pair,
    candidateAssetSha256:candidateSha256,
    observations,
  }),/requires exact candidate GLB bytes/);
  assert.equal(validateRelationalDiscrepancy(discrepancy).valid,false);

  const legacy=legacyIndependentCorvidLegMeshes();
  const changed=candidate(legacy.left,legacy.right);
  assert.equal(validateRelationalDiscrepancy(discrepancy,{candidateGlb:changed}).valid,false);
});

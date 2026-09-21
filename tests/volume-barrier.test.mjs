import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPerceptualSignatureSet,
  createVisualHierarchy,
  createVolumeBarrier,
  validateVolumeBarrier,
} from '../skills/refas/scripts/lib/index.mjs';

const D=(c)=>c.repeat(64);
const SOURCE=D('a');
const ASSET=D('b');
const HIERARCHY=createVisualHierarchy({
  source:{path:'source/reference.png',sha256:SOURCE,width:100,height:100},
  nodes:[
    {id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]},
    {id:'body',label:'Body',level:'region',parentId:'whole',roi:[0.1,0.1,0.7,0.7]},
    {id:'detail',label:'Detail',level:'part',parentId:'body',roi:[0.2,0.2,0.2,0.2]},
  ],
});
const SIG=createPerceptualSignatureSet({
  hierarchy:HIERARCHY,scopeId:'whole',sourceSha256:SOURCE,
  signatures:[
    {id:'whole-mass',scopeId:'whole',family:'mass-proportion',importance:'macro',sourceObservation:'Whole mass is identity-bearing.',evidenceRefs:['source/reference.png']},
    {id:'body-language',scopeId:'body',family:'plane-edge-language',importance:'identity',sourceObservation:'Body region carries identity.',evidenceRefs:['source/reference.png']},
    {id:'detail-seam',scopeId:'detail',family:'surface-pattern-structure',importance:'detail',sourceObservation:'Detail seam is local polish.',evidenceRefs:['source/reference.png']},
  ],
  evidenceRefs:['source/reference.png'],
});
function classification(scopeId,role,state,seed){
  const payload={
    schema:'refas.spatial-collapse-classification/v1',
    candidateSha256:ASSET,
    spatialEvidenceDigest:D(seed),
    sourceSha256:SOURCE,
    hierarchyDigest:HIERARCHY.hierarchyDigest,
    expectationSetDigest:D('c'),
    roleAuthorityDigest:D(seed==='d'?'e':'f'),
    scopeId,
    frozenRole:role,
    classification:state,
    signals:{volumetricFamilies:[],roleSpecific:[]},
    decisionBasis:{usedSignalIds:[],noAggregateScore:true,reason:'fixture'},
    policy:{findingOnly:true,certificationAuthority:false,roleMutationAllowed:false,singleViewIouAuthority:false,multiViewIouAuthority:'diagnostic-only'},
  };
  return {...payload,classificationDigest:(awaitDigest(payload))};
}
function awaitDigest(value){
  // test helper mirrors canonical digest without introducing async.
  return requireDigest(value);
}
import {digestJson as requireDigest} from '../skills/refas/scripts/lib/index.mjs';

test('VC04 protects whole + macro/identity scopes and ignores detail-only scope for compensation',()=>{
  const whole=classification('whole','volumetric','NO_PLANAR_COLLAPSE','d');
  const body=classification('body','layered-volume','NO_PLANAR_COLLAPSE','e');
  const detail=classification('detail','volumetric','PLANAR_COLLAPSE','f');
  const barrier=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,
    signatureSet:SIG,classifications:[detail,body,whole],
  });
  assert.deepEqual(barrier.protectedScopeIds,['body','whole']);
  assert.deepEqual(barrier.ignoredScopeIds,['detail']);
  assert.equal(barrier.verdict,'PROCEED');
  assert.equal(barrier.policy.detailOnlyScopesCannotCompensate,true);
  assert.equal(barrier.policy.proceedDoesNotCertify,true);
  assert.equal(validateVolumeBarrier(barrier,{sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,classifications:[whole,body,detail]}).valid,true);
});

test('VC04 major failure blocks even when whole passes',()=>{
  const barrier=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[
      classification('whole','volumetric','NO_PLANAR_COLLAPSE','d'),
      classification('body','layered-volume','PLANAR_COLLAPSE','e'),
    ],
  });
  assert.equal(barrier.verdict,'REWORK');
  assert.equal(barrier.entries.find((e)=>e.scopeId==='body').status,'REWORK');
});

test('VC04 protected indeterminate remains HOLD',()=>{
  const barrier=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[
      classification('whole','volumetric','INDETERMINATE','d'),
      classification('body','layered-volume','NO_PLANAR_COLLAPSE','e'),
    ],
  });
  assert.equal(barrier.verdict,'HOLD');
});

test('VC04 admits exact role-aware thin exceptions but unresolved remains HOLD',()=>{
  const thin=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[
      classification('whole','thin-shell','NOT_APPLICABLE','d'),
      classification('body','intentionally-planar','NOT_APPLICABLE','e'),
    ],
  });
  assert.equal(thin.verdict,'PROCEED');

  const unresolved=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[
      classification('whole','unresolved','INDETERMINATE','d'),
      classification('body','layered-volume','NO_PLANAR_COLLAPSE','e'),
    ],
  });
  assert.equal(unresolved.verdict,'HOLD');
});

test('VC04 fails closed on missing protected classifications and stale bindings',()=>{
  assert.throws(()=>createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[classification('whole','volumetric','NO_PLANAR_COLLAPSE','d')],
  }),/missing: body/u);
  const stale=classification('whole','volumetric','NO_PLANAR_COLLAPSE','d');
  stale.candidateSha256=D('9');
  const {classificationDigest,...payload}=stale;
  stale.classificationDigest=requireDigest(payload);
  assert.throws(()=>createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,
    classifications:[stale,classification('body','layered-volume','NO_PLANAR_COLLAPSE','e')],
  }),/candidate binding mismatch/u);
});

test('VC04 forged persisted verdict fails canonical validation',()=>{
  const classifications=[
    classification('whole','volumetric','NO_PLANAR_COLLAPSE','d'),
    classification('body','layered-volume','NO_PLANAR_COLLAPSE','e'),
  ];
  const barrier=createVolumeBarrier({
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,classifications,
  });
  const forged={...barrier,verdict:'REWORK'};
  assert.equal(validateVolumeBarrier(forged,{sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:ASSET,signatureSet:SIG,classifications}).valid,false);
});

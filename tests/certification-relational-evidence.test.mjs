import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createBilateralPairRealization,
  createCertificationRelationalEvidence,
  createCylinder,
  createRelationalDiscrepancy,
  createRelationalStructure,
  createSemanticAuthoritySet,
  createWholeSystemRelationalBarrier,
  digestBytes,
  digestJson,
  partsToGlb,
  validateCertificationRelationalEvidence,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (c) => c.repeat(64);
const bytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');

function fixture(candidateAssetSha256 = D('b')) {
  const structure = createRelationalStructure({
    scopeId:'whole', sourceSha256:D('a'), basisRefs:['source:primary'],
    entities:[
      {id:'landmark-left-a',kind:'landmark'}, {id:'landmark-right-a',kind:'landmark'},
      {id:'landmark-left-b',kind:'landmark'}, {id:'landmark-right-b',kind:'landmark'},
    ],
    relations:[{
      id:'body-span-ratio', kind:'distance-ratio', scope:'whole-system', importance:'identity',
      entityIds:['landmark-left-a','landmark-right-a','landmark-left-b','landmark-right-b'],
      range:[0.9,1.1], basisRefs:['source:primary'],
    }],
  });
  const authority = createSemanticAuthoritySet({
    scopeId:'whole', sourceSha256:D('a'), targetSchema:structure.schema, targetDigest:structure.structureDigest,
    entries:[{
      id:'body-span-authority', subjectId:'body-span-ratio', authority:'observed', proposition:'The two visible spans are approximately equal.',
      basis:[{kind:'source-evidence',ref:'source:primary'}],
    }],
  });
  const discrepancy = createRelationalDiscrepancy({
    relationalStructure:structure, candidateAssetSha256,
    observations:[{relationId:'body-span-ratio',value:1,evidenceRefs:['proof:registered-span']}],
  });
  const barrier = createWholeSystemRelationalBarrier({
    relationalStructure:structure, authoritySet:authority,
    relationChecks:discrepancy.checks.map(({relationId,status,evidenceRefs})=>({relationId,status,evidenceRefs})),
  });
  const context = {
    candidateAssetSha256,
    relationalStructureBytes:bytes(structure),
    semanticAuthorityBytes:bytes(authority),
    relationalBarrierBytes:bytes(barrier),
    relationalDiscrepancyBytes:bytes(discrepancy),
  };
  return {structure,authority,barrier,discrepancy,context};
}

test('relational certification closure seals exact candidate and exact relational artifact bytes', () => {
  const {context} = fixture();
  const closure = createCertificationRelationalEvidence(context);
  assert.deepEqual(validateCertificationRelationalEvidence(closure, context), {valid:true,errors:[]});
  assert.equal(closure.status,'PASS');
  assert.equal(closure.candidateAssetSha256,D('b'));
  assert.equal(closure.artifacts.relationalStructure.artifactSha256.length,64);
  assert.equal(closure.artifacts.semanticAuthority.logicalDigest.length,64);
});

test('relational closure cannot be replayed against another candidate', () => {
  const {context} = fixture();
  const closure = createCertificationRelationalEvidence(context);
  const validation = validateCertificationRelationalEvidence(closure,{...context,candidateAssetSha256:D('c')});
  assert.equal(validation.valid,false);
  assert.match(validation.errors.join('; '),/does not bind the certification candidate|does not reproduce|digest mismatch/);
});

test('re-signing substituted relational bytes cannot preserve a sealed closure', () => {
  const {context,structure} = fixture();
  const closure = createCertificationRelationalEvidence(context);
  const altered = structuredClone(structure);
  altered.relations[0].range=[0.5,1.5];
  delete altered.structureDigest;
  altered.structureDigest=digestJson({...altered});
  const validation = validateCertificationRelationalEvidence(closure,{...context,relationalStructureBytes:bytes(altered)});
  assert.equal(validation.valid,false);
});

test('barrier pass must reproduce the candidate-bound discrepancy checks', () => {
  const {context,barrier} = fixture();
  const altered = structuredClone(barrier);
  altered.relationChecks[0].evidenceRefs=['proof:different'];
  delete altered.barrierDigest;
  altered.barrierDigest=digestJson({...altered});
  assert.throws(()=>createCertificationRelationalEvidence({...context,relationalBarrierBytes:bytes(altered)}),/barrier relation checks do not reproduce|barrier is invalid/);
});

test('bilateral relational certification replays exact candidate GLB bytes', () => {
  const structure=createRelationalStructure({
    scopeId:'whole',sourceSha256:D('a'),basisRefs:['source:primary'],
    entities:[
      {id:'left-leg',kind:'volume',basisRefs:['source:left']},
      {id:'right-leg',kind:'volume',basisRefs:['source:right']},
      {id:'sagittal-plane',kind:'plane',basisRefs:['source:center']},
    ],
    relations:[{
      id:'leg-pair',kind:'bilateral-pair',scope:'whole-system',importance:'identity',
      entityIds:['left-leg','right-leg'],leftEntityId:'left-leg',rightEntityId:'right-leg',
      sagittalPlaneId:'sagittal-plane',mirrorAxis:'x',leftHalfSpace:'negative',restGeometryPolicy:'shared-mirrored',
      lateralSpan:{halfSpan:.08,authority:'inferred',basisKind:'body-relative-inference',evidenceRefs:['source:body']},
      basisRefs:['source:primary'],
    }],
  });
  const authority=createSemanticAuthoritySet({
    scopeId:'whole',sourceSha256:D('a'),targetSchema:structure.schema,targetDigest:structure.structureDigest,
    entries:[{
      id:'leg-pair-authority',subjectId:'leg-pair',authority:'inferred',
      proposition:'The two legs share one rest construction mirrored across the sagittal plane.',
      reason:'The source plus bilateral structural prior supports one shared rest construction.',
      basis:[{kind:'structural-prior',ref:'prior:bilateral-pair'}],
    }],
  });
  const mesh=createCylinder({radius:.06,height:.55,segments:12,role:'shared-leg'});
  const glb=partsToGlb({
    assetId:'bilateral-certification-fixture',
    parts:[
      {id:'left-leg',mesh,materialId:'clay',scopeId:'whole',translation:[-.08,0,0],scale:[1,1,1]},
      {id:'right-leg',mesh,materialId:'clay',scopeId:'whole',translation:[.08,0,0],scale:[-1,1,1]},
    ],
    materials:{clay:{baseColor:[.6,.6,.6,1],metallic:0,roughness:.8}},
  });
  const candidateAssetSha256=digestBytes(glb);
  const realization=createBilateralPairRealization({
    glb,relationalStructure:structure,relationId:'leg-pair',
    cameraExplanation:{hypothesisDigest:D('c'),evidenceRefs:['source:camera']},
    poseEvidence:[
      {entityId:'left-leg',explanation:'near-side articulation explains the visible offset',evidenceRefs:['source:left-pose']},
      {entityId:'right-leg',explanation:'far-side articulation explains the visible offset',evidenceRefs:['source:right-pose']},
    ],
    evidenceRefs:['proof:bilateral'],
  });
  const discrepancy=createRelationalDiscrepancy({
    relationalStructure:structure,candidateAssetSha256,candidateGlb:glb,
    observations:[{relationId:'leg-pair',bilateralPairRealization:realization,evidenceRefs:['proof:bilateral']}],
  });
  const barrier=createWholeSystemRelationalBarrier({
    relationalStructure:structure,authoritySet:authority,
    relationChecks:discrepancy.checks.map(({relationId,status,evidenceRefs})=>({relationId,status,evidenceRefs})),
  });
  const context={
    candidateAssetSha256,candidateGlbBytes:glb,
    relationalStructureBytes:bytes(structure),
    semanticAuthorityBytes:bytes(authority),
    relationalBarrierBytes:bytes(barrier),
    relationalDiscrepancyBytes:bytes(discrepancy),
  };
  const closure=createCertificationRelationalEvidence(context);
  assert.deepEqual(validateCertificationRelationalEvidence(closure,context),{valid:true,errors:[]});
  assert.throws(()=>createCertificationRelationalEvidence({...context,candidateGlbBytes:null}),/requires exact candidate GLB bytes/);
  assert.equal(validateCertificationRelationalEvidence(closure,{...context,candidateGlbBytes:null}).valid,false);
});

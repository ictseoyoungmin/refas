import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createCertificationRelationalEvidence,
  createRelationalDiscrepancy,
  createRelationalStructure,
  createSemanticAuthoritySet,
  createWholeSystemRelationalBarrier,
  digestJson,
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

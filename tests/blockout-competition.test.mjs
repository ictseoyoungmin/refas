import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBlockoutCompetitionPolicy,
  validateBlockoutCompetitionPolicy,
  createVisualHierarchy,
  digestJson,
} from '../skills/refas/scripts/lib/index.mjs';
import {runBlockoutCompetitionFreshWorkerDogfood} from '../skills/refas/scripts/verify_blockout_competition_dogfood.mjs';

const D=(ch)=>ch.repeat(64);

test('blockout competition policy is source/hierarchy bound and defaults to advisory',()=>{
  const hierarchy=createVisualHierarchy({
    source:{path:'source/reference.png',sha256:D('a'),width:100,height:100},
    nodes:[
      {id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]},
      {id:'head',label:'Head',level:'region',parentId:'whole',roi:[.2,.1,.6,.7]},
      {id:'eye',label:'Eye',level:'feature',parentId:'head',roi:[.3,.25,.1,.1]},
    ],
  });
  const advisory=createBlockoutCompetitionPolicy({hierarchy,sourceSha256:D('a')});
  assert.equal(advisory.mode,'advisory');
  assert.deepEqual(advisory.scopeIds,[]);
  assert.equal(validateBlockoutCompetitionPolicy(advisory,hierarchy).valid,true);
  const required=createBlockoutCompetitionPolicy({hierarchy,sourceSha256:D('a'),mode:'required',scopeIds:['whole','head']});
  assert.equal(required.minimumCandidates,2);
  assert.equal(required.policy.aggregateResemblanceScoreForbidden,true);
  assert.equal(required.policy.cameraBeforeGeometryDistortion,true);
  assert.throws(()=>createBlockoutCompetitionPolicy({hierarchy,sourceSha256:D('a'),mode:'required',scopeIds:['eye']}),/whole\/major region scopes/u);
  const tampered=structuredClone(required);
  tampered.minimumCandidates=1;
  const payload=structuredClone(tampered);delete payload.policyDigest;
  tampered.policyDigest=digestJson(payload);
  assert.equal(validateBlockoutCompetitionPolicy(tampered,hierarchy).valid,false);
});

test('installed-skill blockout dogfood blocks one-hypothesis hardening and admits typed symmetric+yaw selection',async()=>{
  const report=await runBlockoutCompetitionFreshWorkerDogfood();
  assert.equal(report.status,'PASS');
  assert.equal(report.installedSkillOnly,true);
});

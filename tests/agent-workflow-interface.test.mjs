import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {
  initProject,loadProject,createCylinder,partsToGlb,
  AGENT_NEXT_SCHEMA,AGENT_DIAGNOSIS_SCHEMA,
  nextAgentWork,diagnoseAgentWork,summarizeCoverage,
} from '../skills/refas/scripts/lib/index.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
function run(...args){return spawnSync(process.execPath,[CLI,...args],{encoding:'utf8'});}
const materials={clay:{baseColor:[.5,.5,.5,1],metallic:0,roughness:1}};
async function project(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-agent-interface-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await initProject(root,{projectId:'agent-interface-project'});
  return root;
}
test('read-only next uses canonical resume guidance, never upgrades project state',async t=>{
 const root=await project(t),before=await loadProject(root);
 const result=await nextAgentWork(root);
 assert.equal(result.schema,AGENT_NEXT_SCHEMA);
 assert.equal(result.action,'BIND_PRIMARY_SOURCE');
 assert.equal(result.guidance.nextAction,'BIND_PRIMARY_SOURCE');
 assert.equal(result.invocation.command,'source-manifest');
 assert.equal(result.finalSourceBoundAuthorization,'NOT_EVALUATED');
 assert.deepEqual(await loadProject(root),before);
 const cli=run('next','--root',root);
 assert.equal(cli.status,0,cli.stderr);
 assert.equal(JSON.parse(cli.stdout).action,result.action);
});
test('diagnose with genuine typed finding predicts routing without committing rollback',async t=>{
 const root=await project(t),before=await loadProject(root);
 const finding={category:'evidence-insufficient',severity:'major',scopeId:'whole',
  summary:'No visible rear frame support evidence',evidenceRefs:[]};
 const result=await diagnoseAgentWork(root,{finding});
 assert.equal(result.schema,AGENT_DIAGNOSIS_SCHEMA);
 assert.equal(result.route.action,'REQUEST_REVIEW');
 assert.equal(result.action,'REQUEST_REVIEW');
 assert.equal(result.mutationPerformed,false);
 assert.equal(result.sourceBoundDecision,'NOT_EVALUATED');
 assert.deepEqual(await loadProject(root),before);
 const fn=path.join(root,'finding.json');
 await fs.writeFile(fn,JSON.stringify(finding));
 const cli=run('diagnose','--root',root,'--finding',fn);
 assert.equal(cli.status,0,cli.stderr);
 assert.equal(JSON.parse(cli.stdout).route.action,'REQUEST_REVIEW');
});
test('validate and diagnose reuse exact source-bound QA; no shadow approval or state mutation',async t=>{
 const root=await project(t),before=await loadProject(root);
 const glb=partsToGlb({assetId:'agent-q',parts:[{
  id:'body',mesh:createCylinder({center:[0,0,0],height:.3,radius:.2,segments:12}),materialId:'clay',
 }],materials});
 const asset=path.join(root,'candidate.glb');
 await fs.writeFile(asset,glb);
 const diag=await diagnoseAgentWork(root,{assetFile:asset});
 assert.equal(diag.sourceBoundDecision,'BLOCKED');
 assert.equal(diag.coverage.schema,'refas.qa-coverage-report/v1');
 assert.deepEqual(diag.diagnosis.decision,diag.coverage.decision);
 assert.equal(diag.diagnosis.blockerCount,diag.coverage.decision.blockingCheckIds.length);
 assert.ok(diag.diagnosis.blockers.some(x=>x.checkId==='source-semantic-current-glb'));
 assert.equal(diag.coverage.checks.find(x=>x.id==='glb-integrity').status,'PASS');
 assert.equal(diag.action,'REVIEW_SOURCE_BOUND_BLOCKERS');
 assert.deepEqual(await loadProject(root),before);
 const cli=run('validate','--root',root,'--asset',asset);
 assert.equal(cli.status,2,cli.stderr);
 const parsed=JSON.parse(cli.stdout);
 assert.equal(parsed.sourceBoundDecision,'BLOCKED');
 assert.equal(parsed.mutationPerformed,false);
 const alternate=run('diagnose','--root',root,'--asset',asset);
 assert.equal(alternate.status,0,alternate.stderr);
 assert.equal(JSON.parse(alternate.stdout).diagnosis.reportDigest,diag.diagnosis.reportDigest);
 const strict=run('verify','--root',root,'--asset',asset);
 assert.equal(strict.status,2,strict.stderr);
 assert.equal(JSON.parse(strict.stdout).reportDigest,diag.diagnosis.reportDigest);
 assert.deepEqual(await loadProject(root),before);
});
test('agent facade rejects forged coverage and invalid combinations',async t=>{
 const root=await project(t);
 assert.throws(()=>summarizeCoverage({schema:'other'}),/canonical source-bound QA coverage/);
 const combination=run('diagnose','--root',root,'--finding','x.json','--asset','x.glb');
 assert.equal(combination.status,1);
 assert.match(combination.stderr,/either --asset or --finding/);
 const other=run('validate','--root',root,'--asset','other','--profile','generic');
 assert.equal(other.status,1);
 assert.match(other.stderr,/unknown validation profile/);
});

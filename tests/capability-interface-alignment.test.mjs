import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {analyzeCapabilityInterfaces} from '../skills/refas/scripts/verify_capability_interfaces.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const runCli=(args,cli=CLI,cwd=process.cwd())=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',cwd});

test('AD03 classifies all interfaces and executes every deterministic public invocation contract',async()=>{
  const report=await analyzeCapabilityInterfaces();
  assert.equal(report.status,'PASS',report.errors.join('\n'));
  assert.equal(report.instructionNodes,40);
  assert.equal(report.executableInterfaces,88);
  assert.equal(report.classifiedInterfaces,88);
  assert.equal(report.classifiedTemplates,report.declaredTemplates);
  assert.equal(report.invocationContractsExercised,report.executableContracts);
  assert.ok(report.executableContracts>=57,JSON.stringify(report));
  const keys=new Set(report.audited.map(item=>item.key));assert.equal(keys.size,88);
  for(const key of [
    'construction/construction-vocabulary','relational-structure/relational-structure','inference-authority/semantic-authority',
    'surface-anchor-frames/rebind-surface-anchor-set','attachment-follow/propagate-attachment-follow',
    'multi-anchor-solver/solve-multi-anchor','articulation-clearance/evaluate-articulated-joint',
    'articulation-clearance/evaluate-supported-clearance','attachment-propagation/propagate-attachment-graph',
    'backend-export/run-export-adapter','representation-normalizer/run-representation-normalizer',
    'physical-claims/evaluate-physical-claim','physical-fusion/bake-physical-fusion',
    'realized-contact-support/analyze-realized-contact','candidate-transactions/candidate-transaction',
    'claim-certification/evaluate-certification-policy'
  ]){
    const item=report.audited.find(candidate=>candidate.key===key);assert.ok(item,key);assert.equal(item.verification,'execute',key);assert.equal(item.invocationExercised,true,key);assert.equal(item.materializedInput,true,key);
  }
});

test('AD03 describe exposes public invocation, placeholders, and enum constants',()=>{
  const relation=runCli(['describe','node','relational-structure']);assert.equal(relation.status,0,relation.stderr);const relationJson=JSON.parse(relation.stdout),relationInterface=relationJson.resolvedInterfaces.find(item=>item.id==='relational-structure');
  assert.equal(relationInterface.invocation.schema,'refas.capability-invocation/v1');assert.equal(relationInterface.invocation.verification,'execute');assert.equal(relationInterface.templateRole,'operation-input');
  assert.ok(relationInterface.templateContract.requirements.values.some(item=>item.name==='sourceSha256'));assert.ok(Array.isArray(relationInterface.publicConstantValues.RELATIONAL_RELATION_KINDS));
  const observation=runCli(['describe','node','observation']);assert.equal(observation.status,0,observation.stderr);const obs=JSON.parse(observation.stdout).resolvedInterfaces.find(item=>item.id==='visual-observation');
  assert.equal(obs.invocation.validator.arguments[1].source,'input');assert.equal(obs.invocation.validator.arguments[1].pointer,'/hierarchy');
  const authority=runCli(['describe','node','inference-authority']);assert.equal(authority.status,0,authority.stderr);const authorityInterface=JSON.parse(authority.stdout).resolvedInterfaces.find(item=>item.id==='semantic-authority');
  assert.ok(authorityInterface.templateContract.requirements.values.some(item=>item.name==='targetDigest'));assert.ok(authorityInterface.publicConstantValues.SEMANTIC_AUTHORITY_CLASSES.includes('observed'));
});

test('AD03 verifier passes from a bare copied installed skill',async(t)=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-ad03-installed-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));const installed=path.join(temp,'refas');await fs.cp(path.resolve('skills/refas'),installed,{recursive:true});
  const result=spawnSync(process.execPath,[path.join(installed,'scripts','verify_capability_interfaces.mjs')],{cwd:temp,encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);const report=JSON.parse(result.stdout);
  assert.equal(report.status,'PASS');assert.equal(report.instructionNodes,40);assert.equal(report.executableInterfaces,88);assert.equal(report.classifiedInterfaces,88);assert.equal(report.classifiedTemplates,report.declaredTemplates);assert.equal(report.invocationContractsExercised,report.executableContracts);assert.ok(report.executableContracts>=57);
});

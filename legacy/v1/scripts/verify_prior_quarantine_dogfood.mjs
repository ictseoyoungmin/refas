#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url)),DEFAULT_SKILL_ROOT=path.dirname(SCRIPT_DIR);

export async function runPriorQuarantineFreshWorkerDogfood({skillRoot=DEFAULT_SKILL_ROOT,keep=false}={}){
  skillRoot=path.resolve(skillRoot);
  const sourcePath=path.join(skillRoot,'scripts','prior_quarantine_fresh_worker.mjs');
  const source=await fs.readFile(sourcePath,'utf8');
  assert.match(source,/scripts','lib','index\.mjs/);assert.doesNotMatch(source,/scripts\/lib\/(?!index\.mjs)/);assert.doesNotMatch(source,/tests\//);
  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'refas-prior-quarantine-fresh-worker-'));
  const installedRoot=path.join(tempRoot,'installed','refas'),reportPath=path.join(tempRoot,'report.json');
  await fs.mkdir(path.dirname(installedRoot),{recursive:true});await fs.cp(skillRoot,installedRoot,{recursive:true});
  const repositorySurfacesAbsent={};
  for(const surface of ['tests','docs','examples','.git','package.json']){try{await fs.access(path.join(tempRoot,surface));repositorySurfacesAbsent[surface]=false;}catch{repositorySurfacesAbsent[surface]=true;}}
  assert.ok(Object.values(repositorySurfacesAbsent).every(Boolean));
  const result=spawnSync(process.execPath,[path.join(installedRoot,'scripts','prior_quarantine_fresh_worker.mjs'),'--skill-root',installedRoot,'--report',reportPath],{
    cwd:tempRoot,encoding:'utf8',timeout:120000,env:{PATH:process.env.PATH??'',HOME:tempRoot,TMPDIR:tempRoot,LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_NO_WARNINGS:'1'},
  });
  if(result.status!==0) throw new Error('prior quarantine fresh worker failed: '+String(result.stderr||result.stdout).trim());
  const lines=String(result.stdout).trim().split(/\r?\n/u).filter(Boolean);assert.equal(lines.length,1);
  assert.deepEqual(JSON.parse(lines[0]),{status:'PASS',generatedNovelViewUsedAsInferredHypothesis:true,vc02LeakBlocked:true,r03LeakBlocked:true,certificationLeakBlocked:true});
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.status,'PASS');assert.equal(report.installedSkillOnly,true);
  for(const field of ['quarantineDigest','authorityDigest']) assert.match(report[field],/^[a-f0-9]{64}$/u);
  for(const ref of ['SKILL.md','references/INDEX.md','references/GRAPH.json','references/spatial-reasoning.md','references/inference-authority.md']) assert.ok(report.publicReads.includes(ref),ref);
  const output={schema:'refas.prior-quarantine-fresh-worker-verification/v1',status:'PASS',installedSkillOnly:true,repositorySurfacesAbsent,quarantineDigest:report.quarantineDigest,authorityDigest:report.authorityDigest};
  if(!keep)await fs.rm(tempRoot,{recursive:true,force:true});else output.tempRoot=tempRoot;return output;
}
async function main(){process.stdout.write(JSON.stringify(await runPriorQuarantineFreshWorkerDogfood(),null,2)+'\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch((error)=>{process.stderr.write('Prior quarantine dogfood failed: '+(error.stack??error.message)+'\n');process.exit(1);});

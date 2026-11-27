#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT=path.dirname(SCRIPT_DIR);
function parseArgs(argv){const out={};for(let i=0;i<argv.length;i+=1){if(!argv[i].startsWith('--'))continue;const k=argv[i].slice(2),v=argv[i+1];if(v&&!v.startsWith('--')){out[k]=v;i+=1;}else out[k]=true;}return out;}

export async function runStructuralPlausibilityFreshWorkerDogfood({skillRoot=DEFAULT_SKILL_ROOT,keep=false}={}){
  skillRoot=path.resolve(skillRoot);
  const workerSource=await fs.readFile(path.join(skillRoot,'scripts','structural_plausibility_fresh_worker.mjs'),'utf8');
  assert.match(workerSource,/scripts','lib','index\.mjs/);
  assert.doesNotMatch(workerSource,/scripts\/lib\/(?!index\.mjs)/);
  assert.doesNotMatch(workerSource,/tests\//);

  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'refas-structural-fresh-worker-'));
  const installedRoot=path.join(tempRoot,'installed','refas'),reportPath=path.join(tempRoot,'report.json');
  await fs.mkdir(path.dirname(installedRoot),{recursive:true});await fs.cp(skillRoot,installedRoot,{recursive:true});
  const repositorySurfacesAbsent={};
  for(const surface of ['tests','docs','examples','.git','package.json']){
    try{await fs.access(path.join(tempRoot,surface));repositorySurfacesAbsent[surface]=false;}catch{repositorySurfacesAbsent[surface]=true;}
  }
  assert.ok(Object.values(repositorySurfacesAbsent).every(Boolean));

  const result=spawnSync(process.execPath,[path.join(installedRoot,'scripts','structural_plausibility_fresh_worker.mjs'),'--skill-root',installedRoot,'--report',reportPath],{
    cwd:tempRoot,encoding:'utf8',timeout:120000,
    env:{PATH:process.env.PATH??'',HOME:tempRoot,TMPDIR:tempRoot,LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_NO_WARNINGS:'1'},
  });
  if(result.status!==0)throw new Error(`structural plausibility fresh worker failed: ${String(result.stderr||result.stdout).trim()}`);
  const lines=String(result.stdout).trim().split(/\r?\n/u).filter(Boolean);
  assert.equal(lines.length,1,'structural worker must emit one JSON line');
  const summary=JSON.parse(lines[0]);
  assert.deepEqual(summary,{status:'PASS',rootOutsideBlocked:true,groundedSupportAdmitted:true,sourceSupportedExemptionPreserved:true});

  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.installedSkillOnly,true);
  for(const ref of ['SKILL.md','references/INDEX.md','references/GRAPH.json','references/contracts/attachment-semantics.md','references/realized-contact-support.md'])assert.ok(report.publicReads.includes(ref),ref);
  for(const field of ['rootCandidateSha256','supportCandidateSha256','rootPlausibilityDigest','supportPlausibilityDigest'])assert.match(report[field],/^[a-f0-9]{64}$/u,field);

  const output={schema:'refas.structural-plausibility-fresh-worker-verification/v1',status:'PASS',installedSkillOnly:true,repositorySurfacesAbsent,rootOutsideBlocked:true,groundedSupportAdmitted:true,sourceSupportedExemptionPreserved:true};
  if(!keep)await fs.rm(tempRoot,{recursive:true,force:true});else output.tempRoot=tempRoot;
  return output;
}
async function main(){const o=parseArgs(process.argv.slice(2));const result=await runStructuralPlausibilityFreshWorkerDogfood({skillRoot:o['skill-root']??DEFAULT_SKILL_ROOT,keep:o.keep===true});process.stdout.write(JSON.stringify(result,null,2)+'\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){main().catch((error)=>{process.stderr.write(`Structural plausibility dogfood failed: ${error.stack??error.message}\n`);process.exit(1);});}

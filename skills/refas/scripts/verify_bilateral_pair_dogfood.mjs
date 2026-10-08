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

export async function runBilateralPairFreshWorkerDogfood({skillRoot=DEFAULT_SKILL_ROOT,keep=false}={}){
  skillRoot=path.resolve(skillRoot);
  const sourcePath=path.join(skillRoot,'scripts','bilateral_pair_fresh_worker.mjs');
  const source=await fs.readFile(sourcePath,'utf8');
  assert.match(source,/scripts','lib','index\.mjs/);
  assert.doesNotMatch(source,/scripts\/lib\/(?!index\.mjs)/);
  assert.doesNotMatch(source,/tests\//);

  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'refas-bilateral-fresh-worker-'));
  const installedRoot=path.join(tempRoot,'installed','refas');
  const reportPath=path.join(tempRoot,'report.json');
  await fs.mkdir(path.dirname(installedRoot),{recursive:true});
  await fs.cp(skillRoot,installedRoot,{recursive:true});

  const repositorySurfacesAbsent={};
  for(const surface of ['tests','docs','examples','.git','package.json']){
    try{await fs.access(path.join(tempRoot,surface));repositorySurfacesAbsent[surface]=false;}
    catch{repositorySurfacesAbsent[surface]=true;}
  }
  assert.ok(Object.values(repositorySurfacesAbsent).every(Boolean));

  const worker=path.join(installedRoot,'scripts','bilateral_pair_fresh_worker.mjs');
  const result=spawnSync(process.execPath,[worker,'--skill-root',installedRoot,'--report',reportPath],{
    cwd:tempRoot,encoding:'utf8',timeout:120000,
    env:{PATH:process.env.PATH??'',HOME:tempRoot,TMPDIR:tempRoot,LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_NO_WARNINGS:'1'},
  });
  if(result.status!==0) throw new Error(`bilateral pair fresh worker failed: ${String(result.stderr||result.stdout).trim()}`);
  const lines=String(result.stdout).trim().split(/\r?\n/u).filter(Boolean);
  assert.equal(lines.length,1,'bilateral pair worker must emit one JSON line');
  const summary=JSON.parse(lines[0]);
  assert.deepEqual(summary,{status:'PASS',imagePlaneSpanBlocked:true,independentRestGeometryBlocked:true,sharedMirroredAdmitted:true});

  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.status,'PASS');
  assert.equal(report.installedSkillOnly,true);
  assert.equal(report.imagePlaneSpanBlocked,true);
  assert.equal(report.independentRestGeometryBlocked,true);
  assert.equal(report.sharedMirroredAdmitted,true);
  for(const ref of ['SKILL.md','references/INDEX.md','references/GRAPH.json','references/relational-structure.md','references/spatial-reasoning.md']) assert.ok(report.publicReads.includes(ref),ref);
  for(const field of ['candidateSha256','relationDigest','realizationDigest']) assert.match(report[field],/^[a-f0-9]{64}$/u,field);

  const output={
    schema:'refas.bilateral-pair-fresh-worker-verification/v1',
    status:'PASS',installedSkillOnly:true,repositorySurfacesAbsent,
    imagePlaneSpanBlocked:true,independentRestGeometryBlocked:true,sharedMirroredAdmitted:true,
    candidateSha256:report.candidateSha256,relationDigest:report.relationDigest,realizationDigest:report.realizationDigest,
  };
  if(!keep) await fs.rm(tempRoot,{recursive:true,force:true}); else output.tempRoot=tempRoot;
  return output;
}

async function main(){
  const options=parseArgs(process.argv.slice(2));
  const result=await runBilateralPairFreshWorkerDogfood({skillRoot:options['skill-root']??DEFAULT_SKILL_ROOT,keep:options.keep===true});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch((error)=>{process.stderr.write(`Bilateral pair dogfood failed: ${error.stack??error.message}\n`);process.exit(1);});
}

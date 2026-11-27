#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT=path.dirname(SCRIPT_DIR);

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i+=1){
    if(!argv[i].startsWith('--')) continue;
    const key=argv[i].slice(2), next=argv[i+1];
    if(next&&!next.startsWith('--')){out[key]=next;i+=1;}else out[key]=true;
  }
  return out;
}

export async function runExternalConstructionFreshWorkerDogfood({skillRoot=DEFAULT_SKILL_ROOT,keep=false}={}){
  skillRoot=path.resolve(skillRoot);
  const sourcePath=path.join(skillRoot,'scripts','external_construction_fresh_worker.mjs');
  const source=await fs.readFile(sourcePath,'utf8');
  assert.match(source,/scripts','lib','index\.mjs/);
  assert.doesNotMatch(source,/scripts\/lib\/(?!index\.mjs)/);
  assert.doesNotMatch(source,/tests\//);

  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'refas-external-fresh-worker-'));
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

  const worker=path.join(installedRoot,'scripts','external_construction_fresh_worker.mjs');
  const result=spawnSync(process.execPath,[worker,'--skill-root',installedRoot,'--report',reportPath],{
    cwd:tempRoot,
    encoding:'utf8',
    timeout:120000,
    env:{
      PATH:process.env.PATH??'',
      HOME:tempRoot,
      TMPDIR:tempRoot,
      LANG:'C',
      LC_ALL:'C',
      TZ:'UTC',
      NODE_NO_WARNINGS:'1',
    },
  });
  if(result.status!==0) throw new Error(`external construction fresh worker failed: ${String(result.stderr||result.stdout).trim()}`);
  const lines=String(result.stdout).trim().split(/\r?\n/u).filter(Boolean);
  assert.equal(lines.length,1,'external construction worker must emit one JSON line');
  const summary=JSON.parse(lines[0]);
  assert.equal(summary.status,'PASS');
  assert.equal(summary.identityBearingClosed,true);
  assert.equal(summary.nondeterministicReplayBlocked,true);

  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(report.status,'PASS');
  assert.equal(report.installedSkillOnly,true);
  assert.equal(report.identityBearingClosed,true);
  assert.equal(report.nondeterministicReplayBlocked,true);
  assert.ok(report.publicReads.includes('SKILL.md'));
  assert.ok(report.publicReads.includes('references/INDEX.md'));
  assert.ok(report.publicReads.includes('references/GRAPH.json'));
  assert.ok(report.publicReads.includes('references/construction.md'));
  assert.equal(report.publicApiEntrypoint,'scripts/lib/index.mjs');
  for(const field of ['receiptDigest','candidateSha256','proofDigest','constructionQualityDigest']) {
    assert.match(report[field],/^[a-f0-9]{64}$/u,field);
  }

  const output={
    status:'PASS',
    schema:'refas.external-construction-fresh-worker-verification/v1',
    installedSkillOnly:true,
    repositorySurfacesAbsent,
    identityBearingClosed:true,
    nondeterministicReplayBlocked:true,
    tool:report.tool,
    receiptDigest:report.receiptDigest,
    candidateSha256:report.candidateSha256,
    proofDigest:report.proofDigest,
    constructionQualityDigest:report.constructionQualityDigest,
  };
  if(!keep) await fs.rm(tempRoot,{recursive:true,force:true});
  else output.tempRoot=tempRoot;
  return output;
}

async function main(){
  const options=parseArgs(process.argv.slice(2));
  const result=await runExternalConstructionFreshWorkerDogfood({
    skillRoot:options['skill-root']??DEFAULT_SKILL_ROOT,
    keep:options.keep===true,
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch((error)=>{process.stderr.write(`External construction dogfood failed: ${error.stack??error.message}\n`);process.exit(1);});
}

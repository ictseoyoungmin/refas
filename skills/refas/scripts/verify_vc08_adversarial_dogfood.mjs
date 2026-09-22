#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT=path.dirname(SCRIPT_DIR);
const SCENARIOS=[
  'planar-billboard',
  'thin-shell-relabel',
  'self-authored-pass',
  'stale-evidence-reuse',
  'sibling-lineage-leakage',
  'hero-only-formal-multiview',
  'volumetric-positive',
  'intentionally-thin-positive',
];

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i+=1){
    const token=argv[i];
    if(!token.startsWith('--')) continue;
    const key=token.slice(2),next=argv[i+1];
    if(next&&!next.startsWith('--')){out[key]=next;i+=1;}else out[key]=true;
  }
  return out;
}
function publicOnlySource(source){
  const imports=[...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map((match)=>match[1]);
  const directInternal=imports.filter((value)=>value.includes('/lib/')&&!value.endsWith('/lib/index.mjs'));
  assert.deepEqual(directInternal,[],'VC08 worker imports internal modules directly');
  assert.match(source,/scripts','lib','index\.mjs/,'VC08 worker must use the public index.mjs entrypoint');
  assert.doesNotMatch(source,/checkpoint-store\.mjs|spatial-collapse-classifier\.mjs|volume-barrier\.mjs/,'VC08 worker must not inspect internal implementation modules');
  assert.doesNotMatch(source,/spawnSync\([^\n]*(?:grep|sed|rg|ripgrep)/,'VC08 worker must not use implementation search commands');
}
function parseLine(stdout,label){
  const lines=String(stdout??'').trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length,1,`${label} must emit exactly one JSON line`);
  return JSON.parse(lines[0]);
}

export async function runVc08AdversarialDogfood({skillRoot=DEFAULT_SKILL_ROOT,keep=false}={}){
  skillRoot=path.resolve(skillRoot);
  const sourcePath=path.join(skillRoot,'scripts','vc08_adversarial_worker.mjs');
  const source=await fs.readFile(sourcePath,'utf8');
  publicOnlySource(source);

  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'refas-vc08-adversarial-'));
  const installedRoot=path.join(tempRoot,'installed','refas');
  await fs.mkdir(path.join(tempRoot,'tmp'),{recursive:true});
  await fs.mkdir(path.dirname(installedRoot),{recursive:true});
  await fs.cp(skillRoot,installedRoot,{recursive:true});

  const repositorySurfacesAbsent={};
  for(const surface of ['tests','docs','examples','.git','package.json']){
    try{await fs.access(path.join(tempRoot,surface));repositorySurfacesAbsent[surface]=false;}
    catch{repositorySurfacesAbsent[surface]=true;}
  }
  assert.ok(Object.values(repositorySurfacesAbsent).every(Boolean),'VC08 temp root contains repository-only surfaces');

  const results=[];
  const worker=path.join(installedRoot,'scripts','vc08_adversarial_worker.mjs');
  for(const scenario of SCENARIOS){
    const project=path.join(tempRoot,'projects',scenario);
    const run=spawnSync(process.execPath,[worker,'--skill-root',installedRoot,'--project',project,'--scenario',scenario],{
      cwd:tempRoot,encoding:'utf8',timeout:120000,
      env:{...process.env,HOME:tempRoot,TMPDIR:path.join(tempRoot,'tmp')},
    });
    if(run.status!==0){
      throw new Error(`VC08 scenario ${scenario} failed: ${String(run.stderr||run.stdout).trim()}`);
    }
    const value=parseLine(run.stdout,scenario);
    assert.equal(value.status,'PASS',scenario);
    assert.equal(value.publicBoundary,true,scenario);
    assert.equal(value.executionMode,'deterministic-adversarial-public-worker',scenario);
    assert.ok(value.publicReads.includes('SKILL.md'),scenario);
    assert.ok(value.publicReads.includes('references/INDEX.md'),scenario);
    assert.ok(value.publicReads.includes('references/spatial-reasoning.md'),scenario);
    assert.ok(value.describeQueries.includes('node:spatial-reasoning'),scenario);
    assert.ok(value.describeQueries.includes('capability:whole-object-certification'),scenario);
    assert.ok(Number.isFinite(value.firstMultiviewMs),scenario);
    results.push({
      scenario,
      firstMultiviewMs:value.firstMultiviewMs,
      elapsedMs:value.elapsedMs,
      result:value.result,
      attemptedBypasses:value.attemptedBypasses,
    });
  }

  const byId=Object.fromEntries(results.map((entry)=>[entry.scenario,entry]));
  assert.equal(byId['planar-billboard'].result.classification,'PLANAR_COLLAPSE');
  assert.equal(byId['planar-billboard'].result.barrier,'REWORK');
  assert.equal(byId['planar-billboard'].result.downstreamBlocked,true);

  assert.equal(byId['thin-shell-relabel'].result.attemptedRole,'thin-shell');
  assert.equal(byId['thin-shell-relabel'].result.frozenRole,'volumetric');
  assert.equal(byId['thin-shell-relabel'].result.replayedClassification,'PLANAR_COLLAPSE');
  assert.equal(byId['thin-shell-relabel'].result.bypassAccepted,false);

  assert.equal(byId['self-authored-pass'].result.callerStatusRejected,true);
  assert.equal(byId['self-authored-pass'].result.runtimeGateStatus,'fail');
  assert.equal(byId['self-authored-pass'].result.forgedFilesConsulted,false);

  assert.equal(byId['stale-evidence-reuse'].result.candidateChanged,true);
  assert.equal(byId['stale-evidence-reuse'].result.staleReuseBlocked,true);

  assert.equal(byId['sibling-lineage-leakage'].result.selectedLineageBlocked,true);
  assert.notEqual(byId['sibling-lineage-leakage'].result.badSelectedCheckpointId,byId['sibling-lineage-leakage'].result.currentSiblingCheckpointId);

  assert.equal(byId['hero-only-formal-multiview'].result.formalMultiviewComplete,true);
  assert.equal(byId['hero-only-formal-multiview'].result.classification,'PLANAR_COLLAPSE');
  assert.equal(byId['hero-only-formal-multiview'].result.barrier,'REWORK');
  assert.equal(byId['hero-only-formal-multiview'].result.downstreamBlocked,true);

  assert.equal(byId['volumetric-positive'].result.classification,'NO_PLANAR_COLLAPSE');
  assert.equal(byId['volumetric-positive'].result.barrier,'PROCEED');
  assert.equal(byId['volumetric-positive'].result.gateStatus,'pass');
  assert.equal(byId['volumetric-positive'].result.falsePositive,false);

  assert.equal(byId['intentionally-thin-positive'].result.frozenRole,'thin-shell');
  assert.equal(byId['intentionally-thin-positive'].result.classification,'NOT_APPLICABLE');
  assert.equal(byId['intentionally-thin-positive'].result.barrier,'PROCEED');
  assert.equal(byId['intentionally-thin-positive'].result.thinSemanticsPreserved,true);

  const report={
    schema:'refas.vc08-adversarial-dogfood-report/v1',
    status:'PASS',
    installedSkillOnly:true,
    repositorySurfacesAbsent,
    deterministicHarnessComplete:true,
    closureReady:false,
    closureBlocker:'Actual independent fresh GPT and Claude model sessions have not yet been run against this harness.',
    externalFreshModels:{
      required:['GPT','Claude'],
      completed:[],
      pending:['GPT','Claude'],
    },
    policy:{
      noAssetSpecificThresholds:true,
      noAggregateResemblanceScore:true,
      singleViewIouAuthority:false,
      timeToFirstMultiviewIsObservationOnly:true,
    },
    cases:results,
  };
  if(keep) report.tempRoot=tempRoot;
  else await fs.rm(tempRoot,{recursive:true,force:true});
  return report;
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const report=await runVc08AdversarialDogfood({
    skillRoot:args['skill-root']??DEFAULT_SKILL_ROOT,
    keep:args.keep===true,
  });
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch((error)=>{
    process.stderr.write(`VC08 adversarial dogfood failed: ${error.stack??error.message}\n`);
    process.exit(1);
  });
}

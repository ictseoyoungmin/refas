#!/usr/bin/env node
// Opt-in same-runner paired actual CLI benchmark, never a certification gate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
function opt(name) {
  const i=process.argv.indexOf('--'+name);
  if(i<0 || !process.argv[i+1])throw new Error('missing '+name);
  return process.argv[i+1];
}
const baseline=path.resolve(opt('baseline'));
const candidate=path.resolve(opt('candidate'));
const output=path.resolve(opt('out'));
const pairs=Number(opt('pairs'));
if(!Number.isInteger(pairs)||pairs<4||pairs>40)throw new Error('pairs must be 4..40');
const med=a=>{
  const s=[...a].sort((x,y)=>x-y),n=s.length;
  return n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2;
};
const p95=a=>{
  const s=[...a].sort((x,y)=>x-y);
  return s[Math.ceil(s.length*.95)-1];
};
const round=x=>Math.round(x*100)/100;
const sha=x=>createHash('sha256').update(x).digest('hex');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-cli-paired-'));
const root=path.join(temp,'project');
const memoryFile=path.join(temp,'peak-rss-kib.txt');
try {
  // A real, shared and immutable RefAs project is prepared outside the timed samples.
  const {initProject}=await import(pathToFileURL(path.join(baseline,'skills/refas/scripts/lib/checkpoint-store.mjs')).href);
  await initProject(root,{projectId:'cold-cli-benchmark'});
  const cases=[
    {id:'refas-help',entry:'refas.mjs',args:['--help']},
    {id:'refas-version',entry:'refas.mjs',args:['--version']},
    {id:'refas-next',entry:'refas.mjs',args:['next','--root',root]},
    {id:'refas-describe',entry:'refas.mjs',args:['describe','node','workflow']},
    {id:'host-help',entry:'refas-host.mjs',args:['help']},
  ];
  function launch(repository,which){
    const entry=path.join(repository,'skills/refas/scripts',which.entry);
    const before=performance.now();
    const result=spawnSync('/usr/bin/time',
      ['-f','%M','-o',memoryFile,process.execPath,entry,...which.args],
      {cwd:repository,encoding:'utf8',timeout:12000,maxBuffer:2_000_000,
       env:{...process.env,NO_COLOR:'1',CI:'true'}});
    if(result.error)throw result.error;
    return {status:result.status,stdout:result.stdout||'',stderr:result.stderr||'',
      ms:performance.now()-before};
  }
  function parity(a,b,id){
    assert.equal(a.status,0,id+' baseline execution failed: '+a.stderr);
    assert.equal(b.status,a.status,id+' exit status diverged');
    assert.equal(b.stdout,a.stdout,id+' stdout diverged');
    assert.equal(b.stderr,a.stderr,id+' stderr diverged');
  }
  async function sample(repository,which){
    const r=launch(repository,which);
    const rss=Number((await fs.readFile(memoryFile,'utf8')).trim());
    assert.ok(Number.isFinite(rss)&&rss>0,'invalid peak RSS');
    return {...r,rssKiB:rss};
  }
  const results=[];
  for(let ci=0;ci<cases.length;ci++){
    const c=cases[ci];
    for(let i=0;i<2;i++)parity(launch(baseline,c),launch(candidate,c),c.id);
    const observations=[];
    for(let k=0;k<pairs;k++){
      const first=(k+ci)%2===0?'old':'new';
      const a=await sample(first==='old'?baseline:candidate,c);
      const b=await sample(first==='old'?candidate:baseline,c);
      const old=first==='old'?a:b,newer=first==='old'?b:a;
      parity(old,newer,c.id);
      observations.push({order:first,oldMs:old.ms,newMs:newer.ms,
        oldRssKiB:old.rssKiB,newRssKiB:newer.rssKiB});
    }
    const old=observations.map(o=>o.oldMs),newer=observations.map(o=>o.newMs);
    const differences=observations.map(o=>o.oldMs-o.newMs);
    const data={
      id:c.id,samples:pairs,parity:'EXACT_PASS',
      oldMedianMs:round(med(old)),newMedianMs:round(med(newer)),
      pairedMedianSavingsMs:round(med(differences)),
      wins:differences.filter(x=>x>0).length,
      oldP95Ms:round(p95(old)),newP95Ms:round(p95(newer)),
      oldMedianRssMiB:round(med(observations.map(o=>o.oldRssKiB))/1024),
      newMedianRssMiB:round(med(observations.map(o=>o.newRssKiB))/1024),
      pairedMedianRssSavingsMiB:round(med(observations.map(o=>(o.oldRssKiB-o.newRssKiB)/1024))),
      outputSha256:sha(launch(baseline,c).stdout),
      raw:observations.map(o=>({order:o.order,oldMs:round(o.oldMs),newMs:round(o.newMs),
        oldRssKiB:o.oldRssKiB,newRssKiB:o.newRssKiB})),
    };
    results.push(data);
    process.stdout.write(JSON.stringify({case:data.id,oldMs:data.oldMedianMs,newMs:data.newMedianMs,
      savingsMs:data.pairedMedianSavingsMs,wins:data.wins+'/'+pairs,
      oldRssMiB:data.oldMedianRssMiB,newRssMiB:data.newMedianRssMiB,
      parity:data.parity})+'\n');
  }
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,JSON.stringify({
    schema:'refas.cli-cold-start-paired/v1',
    baselineSha:process.env.BASELINE_SHA||'unknown',
    candidateSha:process.env.CANDIDATE_SHA||'unknown',
    node:process.version,
    environment:'one GitHub runner, alternated order, independent new Node processes, /usr/bin/time maxRSS',
    unit:'whole command wall-clock incl spawn + CLI execution',
    pairsPerCase:pairs,outputParity:'EXACT_PASS',cases:results,
  },null,2)+'\n');
  process.stdout.write('PAIRED_CLI_BENCHMARK_PASS all outputs byte-identical\n');
}catch(e){
  process.stderr.write('PAIRED_CLI_BENCHMARK_FAIL '+(e.stack||e)+'\n');
  process.exitCode=1;
}finally{
  await fs.rm(temp,{recursive:true,force:true});
}

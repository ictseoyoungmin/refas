#!/usr/bin/env node
// Measurement-only renderer workload profiler. Does not certify source similarity.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {partsToGlb} from './lib/index.mjs';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    if(!argv[i].startsWith('--'))throw Error(`unknown argument: ${argv[i]}`);
    const key=argv[i].slice(2),next=argv[i+1];
    if(next&&!next.startsWith('--')){out[key]=next;i++;}
    else out[key]=true;
  }
  return out;
}
function boundedInt(input,def,min,max,key){
  const value=Number(input??def);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`--${key} must be an integer in [${min},${max}]`);
  return value;
}
function sphere(center,radius,segments,rings){
  const positions=[],normals=[],indices=[];
  for(let y=0;y<=rings;y++)for(let x=0;x<=segments;x++){
    const a=Math.PI*y/rings,b=2*Math.PI*x/segments;
    const n=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
    normals.push(n);positions.push(n.map((v,i)=>center[i]+radius*v));
  }
  for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){
    const a=y*(segments+1)+x,b=a+segments+1;
    if(y>0)indices.push(a,b,a+1);
    if(y<rings-1)indices.push(a+1,b,b+1);
  }
  return {positions,normals,indices};
}
async function generatedAsset(dir,{segments,rings,objects}){
  const parts=Array.from({length:objects},(_,i)=>({
    id:`complex-part-${i}`,scopeId:`whole.part-${i}`,materialId:'paint',
    mesh:sphere([(i%3-1)*0.9,Math.floor(i/3)*0.95,0.05*(i%2)],0.45,segments,rings),
  }));
  const glb=path.join(dir,'candidate.glb'),frame=path.join(dir,'frame.json');
  const bytes=partsToGlb({parts,materials:{paint:{baseColor:[0.45,0.52,0.72,1],metallic:0.3,roughness:0.4}}});
  await fs.writeFile(glb,bytes);
  await fs.writeFile(frame,JSON.stringify({
    schema:'refas.canonical-object-frame/v1',id:'render-benchmark-frame',scopeId:'whole',
    origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},scopeParts:[],
    hero:{position:[0.6,0.4,8],target:[0,0,0],up:[0,1,0],fovY:31,registrationDigest:'b'.repeat(64)},
  }));
  return {glb,frame,workloadKind:'procedural-nondegenerate',estimatedTriangles:objects*(2*segments*(rings-1))};
}
function failureKind(code,stderr){
  if(code===0)return null;
  if(/MemoryError|working.memory budget|render requires|cannot allocate|out of memory/i.test(stderr))return 'memory-budget';
  if(/RenderTimeoutError|timed out|wall.clock timeout|deadline/i.test(stderr))return 'timeout';
  if(/GLB|accessor|TEXCOORD|primitive|invalid|ValueError/i.test(stderr))return 'asset-or-arguments';
  return 'renderer-runtime';
}
async function measure(label,args,{out}){
  const began=performance.now(),pythonFile=path.join(SCRIPT_DIR,'render_pbr.py');
  let stdout='',stderr='',peakRssKiB=null,signal=null;
  const child=spawn(PYTHON,[pythonFile,...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',c=>{stdout+=c;});
  child.stderr.on('data',c=>{stderr+=c;});
  let enabled=process.platform==='linux';
  const capture=async()=>{
    if(!enabled)return;
    try{
      const data=await fs.readFile(`/proc/${child.pid}/status`,'utf8');
      const rss=Number(data.match(/^VmRSS:\s+(\d+) kB/m)?.[1]);
      const hwm=Number(data.match(/^VmHWM:\s+(\d+) kB/m)?.[1]);
      const value=Math.max(rss||0,hwm||0);
      if(value>0)peakRssKiB=Math.max(peakRssKiB||0,value);
    }catch(error){if(error.code!=='ENOENT')enabled=false;}
  };
  const interval=setInterval(()=>{void capture();},20);
  let code=null;
  try {
    code=await new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('exit',(exitCode,exitSignal)=>{signal=exitSignal;resolve(exitCode);});
    });
  } finally {clearInterval(interval);}
  const result={label,status:code===0?'PASS':'FAIL',exitCode:code,signal,wallMs:Math.round((performance.now()-began)*100)/100,
    peakRssKiB,peakRssMethod:peakRssKiB==null?'unavailable':'linux-proc-vmhwm',
    failureKind:failureKind(code,stderr),stderr:code===0?'':stderr.slice(-1800),
    reportedStatus:null};
  if(code===0){
    try { result.reportedStatus=JSON.parse(stdout)?.status; }
    catch{result.status='FAIL';result.failureKind='missing-json-result';}
  }
  return result;
}
export async function runMeasurement(options={}){
  const segments=boundedInt(options.segments,64,8,200,'segments');
  const rings=boundedInt(options.rings,48,4,200,'rings');
  const objects=boundedInt(options.objects,4,1,20,'objects');
  const size=boundedInt(options.size,112,16,1024,'size');
  const timeout=boundedInt(options['timeout-seconds'],180,1,3600,'timeout-seconds');
  const maxMem=boundedInt(options['max-working-mb'],512,8,8192,'max-working-mb');
  if((options.glb&&!options.frame)||(!options.glb&&options.frame))throw Error('--glb and --frame are both required for external real assets');
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'refas-render-measure-'));
  try {
    const generated=!options.glb;
    const inputs=generated?await generatedAsset(temporary,{segments,rings,objects}):{
      glb:path.resolve(options.glb),frame:path.resolve(options.frame),
      workloadKind:'supplied-glb',estimatedTriangles:null,
    };
    const digest=await fs.readFile(inputs.glb);
    const hash=(await import('node:crypto')).createHash('sha256').update(digest).digest('hex');
    const base=['--glb',inputs.glb,'--frame',inputs.frame,'--size',String(size),
      '--timeout-seconds',String(timeout),'--max-working-mb',String(maxMem),'--tile-size','32'];
    const full=await measure('canonical-full-8',[...base,'--out',path.join(temporary,'full'),'--no-board'],{out:temporary});
    const edit=await measure('iterative-preview-hero-side',[...base,'--out',path.join(temporary,'preview'),'--preview','--views','hero,side'],{out:temporary});
    const repeat=await measure('identical-preview-reuse',[...base,'--out',path.join(temporary,'preview'),'--preview','--views','hero,side','--reuse'],{out:temporary});
    const report={
      schema:'refas.renderer-workload-measurement/v1',claimScope:'measurement-only',
      candidate:{kind:inputs.workloadKind,sha256:hash,sourceBytes:digest.length,estimatedTriangles:inputs.estimatedTriangles},
      settings:{size,timeoutSeconds:timeout,maxWorkingMiB:maxMem,backend:'numba-studio-pbr-v2'},
      measurements:[full,edit,repeat],
      finding:{
        everyRunSucceeded:[full,edit,repeat].every(r=>r.status==='PASS'),
        measuredCacheHit:repeat.reportedStatus==='REUSED',
        savedFullEightViewWork:edit.status==='PASS'&&edit.reportedStatus==='PASS',
        sourceResemblanceCertified:false,
      },
      caveat:'Raw environment-dependent wall-clock and process peak RSS observations; no cross-hardware speed claim, and generated geometry is not an independently sourced flagship asset.',
    };
    if(options.out){
      const output=path.resolve(options.out);
      await fs.mkdir(path.dirname(output),{recursive:true});
      await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
    }
    return report;
  } finally {await fs.rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runMeasurement(parse(process.argv.slice(2))).then(x=>{
    process.stdout.write(JSON.stringify(x,null,2)+'\n');
    if(!x.finding.everyRunSucceeded||!x.finding.measuredCacheHit)process.exitCode=1;
  }).catch(e=>{process.stderr.write(String(e.stack||e)+'\n');process.exitCode=1;});
}

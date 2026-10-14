// Internal opt-in R14-01 dispatcher. It does NOT issue certification evidence.
// Installed v1.3.0 registered hero replay remains in registered-render-replay.mjs.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRegisteredRenderReplay} from './registered-render-replay.mjs';

export const RENDER_JOB_SCHEMA='refas.render-job/v1';
export const RENDER_EXECUTION_SCHEMA='refas.render-execution/v1';
export const CPU_RENDER_BACKENDS=Object.freeze({
  'legacy-portable':Object.freeze({
    id:'legacy-portable',identity:'RefAs Portable Rasterizer/1.0.0',
    renderer:{family:'other',name:'RefAs Portable Rasterizer',
      version:'1.0.0',backend:'offline-numpy-rasterizer'},
    worker:'render_glb.py',installed:true,diagnostic:true,
    replay:'verifyRegisteredRenderReplay',admissibleCertification:'legacy-replay-only',
  }),
  'optimized-cpu':Object.freeze({
    id:'optimized-cpu',identity:'RefAs Optimized CPU/1.0.0-jit-prototype',
    renderer:{family:'other',name:'RefAs Optimized CPU',
      version:'1.0.0-jit-prototype',backend:'numba-serial-raster'},
    worker:'render_cpu_opt.py',installed:true,diagnostic:true,
    replay:null,admissibleCertification:'none',
  }),
});
const SHA=/^[a-f0-9]{64}$/u;
const SCRIPTS_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function bounded(value,min,max,name) {
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error(name+' must be an integer in ['+min+','+max+']');
  return value;
}
function relativeName(name,label) {
  if(typeof name!=='string'||!name||path.isAbsolute(name)||
    name.includes('\\')||name.split('/').some(x=>!x||x==='.'||x==='..')||
    name.includes('\0'))throw Error(label+' must be a project-contained relative path');
  return name;
}
async function existingFile(root,name,label,maxBytes) {
  const realRoot=await fs.realpath(root);
  const full=await fs.realpath(path.join(realRoot,relativeName(name,label)));
  if(!full.startsWith(realRoot+path.sep))throw Error(label+' must stay inside project');
  const st=await fs.stat(full);
  if(!st.isFile()||st.size<1||st.size>maxBytes)throw Error(label+' must be a bounded regular file');
  const bytes=await fs.readFile(full);
  if(bytes.length!==st.size)throw Error(label+' changed during read');
  return {bytes,sha256:sha(bytes)};
}
function assertedSha(value,label) {
  if(typeof value!=='string'||!SHA.test(value))throw Error(label+' requires SHA-256');
  return value;
}
export function getTrustedRenderBackend(id) {
  if(typeof id!=='string'||!Object.hasOwn(CPU_RENDER_BACKENDS,id))
    throw Error('renderer backend is not in the trusted registry');
  return CPU_RENDER_BACKENDS[id];
}
export function normalizeCpuRenderJob(job) {
  if(job?.schema!==RENDER_JOB_SCHEMA)throw Error('render job schema mismatch');
  const allowed=new Set(['schema','asset','frame','backend','view','pass','size','resources','intent']);
  if(!job||Object.keys(job).some(key=>!allowed.has(key)))throw Error('render job includes unknown fields');
  const id=job.backend?.id;
  const profile=getTrustedRenderBackend(id);
  if(job.backend?.algorithmVersion!==(id==='legacy-portable'?'1.0.0':'1'))
    throw Error('backend algorithmVersion differs from trusted registry');
  if(job.view!=='hero')throw Error('R14-02 only supports the registered hero view');
  const renderPass=job.pass??'beauty';
  if(id==='legacy-portable' && renderPass!=='beauty')
    throw Error('legacy diagnostic supports beauty only');
  if(id==='optimized-cpu' && !['normal','object-id'].includes(renderPass))
    throw Error('optimized CPU diagnostic requires normal or object-id pass');
  if(job.intent!=='diagnostic')throw Error('R14-01 output is diagnostic-only');
  const asset={path:relativeName(job.asset?.path,'asset'),sha256:assertedSha(job.asset?.sha256,'asset')};
  const frame={path:relativeName(job.frame?.path,'frame'),sha256:assertedSha(job.frame?.sha256,'frame')};
  const size=bounded(job.size,32,1024,'size');
  const resources={
    timeoutSeconds:bounded(job.resources?.timeoutSeconds,1,300,'timeoutSeconds'),
    maxWorkingMiB:bounded(job.resources?.maxWorkingMiB,8,2048,'maxWorkingMiB'),
  };
  for(const [obj,keys,label] of [[job.asset,['path','sha256'],'asset'],
    [job.frame,['path','sha256'],'frame'],
    [job.backend,['id','algorithmVersion'],'backend'],
    [job.resources,['timeoutSeconds','maxWorkingMiB'],'resources']]) {
    if(!obj||Object.keys(obj).some(x=>!keys.includes(x)))throw Error(label+' includes unsupported keys');
  }
  return Object.freeze({schema:RENDER_JOB_SCHEMA,asset,frame,
    backend:{id:profile.id,identity:profile.identity},
    view:'hero',pass:renderPass,size,resources,intent:'diagnostic'});
}
function classifyRun(run) {
  const combined=String(run.stderr||'')+' '+String(run.error?.message||'');
  if(run.error?.code==='ETIMEDOUT'||/RenderTimeoutError|wall.clock timeout|timed out/iu.test(combined))
    return 'BLOCKED_TIMEOUT';
  if(/MemoryError|working.memory budget|source GLB parsing may peak|requires at least/iu.test(combined))
    return 'BLOCKED_RESOURCE';
  if(/OPTIMIZED_CPU_UNAVAILABLE|OPTIMIZED_CPU_UNSUPPORTED|unsupported|not supported/iu.test(combined))return 'BLOCKED_UNSUPPORTED';
  if(/ValueError|embedded GLB|accessor|invalid camera/iu.test(combined))return 'FAILED_ASSET';
  return 'FAILED_BACKEND';
}
function blocked(job,status,detail) {
  return Object.freeze({schema:RENDER_EXECUTION_SCHEMA,status,claimScope:'diagnostic-only',
    sourceSha256:job.asset.sha256,frameSha256:job.frame.sha256,
    backend:job.backend,outputs:[],reason:detail});
}
/** Render one diagnostic hero. Never promotes provenance, source resemblance or final certificate. */
export async function renderDiagnosticHero({root,job,outDir}={}) {
  const spec=normalizeCpuRenderJob(job);
  const backend=getTrustedRenderBackend(spec.backend.id);
  if(!backend.installed||!backend.worker)return blocked(spec,'BLOCKED_UNSUPPORTED','renderer backend not installed');
  const script=path.join(SCRIPTS_ROOT,backend.worker);
  const rootReal=await fs.realpath(root);
  const outputName=relativeName(outDir,'output directory');
  const target=path.join(rootReal,outputName);
  if(!target.startsWith(rootReal+path.sep))throw Error('output directory outside project');
  const asset=await existingFile(rootReal,spec.asset.path,'GLB',128*1024*1024);
  const frame=await existingFile(rootReal,spec.frame.path,'frame',256*1024);
  if(asset.sha256!==spec.asset.sha256||frame.sha256!==spec.frame.sha256)
    throw Error('render job source SHA mismatch');
  // Resolve and verify parent before staging: do not follow a symlink outside root.
  const parent=await fs.realpath(path.dirname(target));
  if(parent!==rootReal&&!parent.startsWith(rootReal+path.sep))
    throw Error('output parent outside project');
  if(path.join(parent,path.basename(target))!==target)
    throw Error('output uses a symlinked parent');
  try{await fs.lstat(target);throw Error('render output directory already exists');}
  catch(err){if(err.code!=='ENOENT')throw err;}
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-r14-01-'));
  let staging=null;
  try {
    const frozenAsset=path.join(temp,'candidate.glb');
    const frozenFrame=path.join(temp,'frame.json');
    await fs.writeFile(frozenAsset,asset.bytes);
    await fs.writeFile(frozenFrame,frame.bytes);
    const workerOut=path.join(temp,'rendered');
    const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
    const cmd=[script,'--glb',frozenAsset,'--frame',frozenFrame,
      '--out',workerOut,'--size',String(spec.size)];
    if(spec.backend.id==='legacy-portable')cmd.push('--hero-only');
    else cmd.push('--pass',spec.pass);
    cmd.push(

      '--timeout-seconds',String(spec.resources.timeoutSeconds),
      '--max-working-mb',String(spec.resources.maxWorkingMiB));
    const run=spawnSync(python,cmd,{
        encoding:'utf8',timeout:(spec.resources.timeoutSeconds+10)*1000,
        maxBuffer:256*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
      });
    if(run.status!==0||run.error) return blocked(spec,classifyRun(run),
      String(run.stderr||run.error?.message||'render worker exited unsuccessfully').slice(-1000));
    let nativeReport;
    try{nativeReport=JSON.parse(await fs.readFile(path.join(workerOut,'render-report.json'),'utf8'));}
    catch{return blocked(spec,'FAILED_BACKEND','missing or invalid legacy worker report');}
    const legacy=spec.backend.id==='legacy-portable';
    if(nativeReport.status!=='PASS'||nativeReport.assetSha256!==asset.sha256||
      nativeReport.renderer?.name!==backend.renderer.name||
      nativeReport.renderer?.version!==backend.renderer.version||
      nativeReport.renderer?.backend!==backend.renderer.backend||
      (legacy && (nativeReport.frames?.length!==1||
        nativeReport.frames[0]?.path!=='hero.png'||
        nativeReport.claimScope!=='render-integrity-only'))||
      (!legacy && (nativeReport.claimScope!=='diagnostic-only'||
        nativeReport.pass!==spec.pass||nativeReport.frameFileSha256!==frame.sha256||
        nativeReport.outputs?.length!==1||nativeReport.outputs[0]?.path!=='hero.png')))
      return blocked(spec,'FAILED_BACKEND','worker report fails trusted backend identity or input contract');
    const png=await fs.readFile(path.join(workerOut,'hero.png'));
    if(sha(png)!==(legacy?nativeReport.heroImageSha256:nativeReport.outputs[0].sha256)||
      (legacy&&sha(png)!==nativeReport.frames[0].sha256))
      return blocked(spec,'FAILED_BACKEND','legacy worker pixels fail digest binding');
    staging=await fs.mkdtemp(path.join(parent,'.refas-r14-01-stage-'));
    await fs.writeFile(path.join(staging,'hero.png'),png);
    const execution={schema:RENDER_EXECUTION_SCHEMA,status:'COMPLETE',
      claimScope:'diagnostic-only',sourceSha256:asset.sha256,frameSha256:frame.sha256,
      backend:{...spec.backend,executableSha256:sha(await fs.readFile(script))},
      view:'hero',pass:spec.pass,size:spec.size,
      outputs:[{path:'hero.png',sha256:sha(png)}],certificationEligible:false,
      ...(legacy?{legacyReportFrameDigest:nativeReport.frameDigest}:{}
      ),...(legacy?{}:{kernelTimings:nativeReport.durationsMs,geometry:nativeReport.stats})};
    await fs.writeFile(path.join(staging,'execution.json'),JSON.stringify(execution,null,2)+'\n');
    // Fresh output directory only. Never overwrite prior evidence/observations.
    try{await fs.lstat(target);throw Error('render output directory already exists');}
    catch(err){if(err.code!=='ENOENT')throw err;}
    await fs.rename(staging,target);staging=null;
    return Object.freeze(execution);
  } finally {
    if(staging)await fs.rm(staging,{recursive:true,force:true});
    await fs.rm(temp,{recursive:true,force:true});
  }
}
/** The *only* admissible legacy registered proof remains the installed, exact SHA verifier. */
export async function verifyPinnedLegacyRegisteredHero(params) {
  return verifyRegisteredRenderReplay(params);
}

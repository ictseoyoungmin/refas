import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const RENDERER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'render_glb.py');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
const SHA = /^[a-f0-9]{64}$/u;
const RENDERER_IDENTITY = Object.freeze({
  family:'other', name:'RefAs Portable Rasterizer',
  version:'1.0.0', backend:'offline-numpy-rasterizer',
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function contained(root, relative, label) {
  if (typeof relative !== 'string' || !relative ||
      path.isAbsolute(relative) || relative.includes('\\') ||
      relative.split('/').some((part)=>!part || part==='.' || part==='..')) {
    throw new Error(label+' must be an exact project-contained relative path');
  }
  const base=await fs.realpath(root);
  const resolved=await fs.realpath(path.join(base,relative));
  if (!resolved.startsWith(base+path.sep)) {
    throw new Error(label+' must remain inside the project');
  }
  const stat=await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(label+' must be a current regular file');
  return {file:resolved,size:stat.size};
}
async function bytesAt(root, name, label, maxBytes) {
  const found=await contained(root,name,label);
  if (found.size===0 || found.size>maxBytes) throw new Error(label+' exceeds its bounded input size');
  const bytes=await fs.readFile(found.file);
  if (bytes.length!==found.size) throw new Error(label+' changed during replay');
  return {file:found.file,bytes,sha256:digest(bytes)};
}
function validSha(value,label) {
  if (typeof value!=='string' || !SHA.test(value)) throw new Error(label+' requires canonical SHA-256');
  return value;
}
function assertSame(a,b,label) {if(a!==b) throw new Error(label+' differs from independently replayed source');}

/**
 * S02b1: replay the claimed installed RefAs portable hero frame from the
 * CURRENT exact GLB and frozen canonical object frame. Neither the source
 * worker's render-report nor its claimed PNG is treated as executable truth.
 *
 * This authorizes only render-pixel provenance, never photo resemblance. The
 * calling Host must supply authoritative candidate identity and independently
 * verified source-selected frame, not worker-authored labels.
 */
export async function verifyRegisteredRenderReplay({
  root, glbPath, framePath, renderReportPath, heroImagePath,
  assetSha256, frameSha256, renderSize=128,
}={}) {
  if (!Number.isSafeInteger(renderSize) || renderSize<32 || renderSize>1024) {
    throw new Error('trusted render replay requires a bounded square image size (32..1024)');
  }
  const asset=await bytesAt(root,glbPath,'current candidate GLB',128*1024*1024);
  assertSame(asset.sha256,validSha(assetSha256,'current candidate digest'),'current candidate GLB digest');
  const frame=await bytesAt(root,framePath,'frozen canonical camera frame',256*1024);
  const declared=await bytesAt(root,renderReportPath,'registered render report',4*1024*1024);
  const hero=await bytesAt(root,heroImagePath,'claimed registered hero frame',32*1024*1024);
  assertSame(hero.sha256,validSha(frameSha256,'claimed hero digest'),'claimed registered hero SHA');
  let frameSpec, report;
  try {
    frameSpec=JSON.parse(frame.bytes.toString('utf8'));
    report=JSON.parse(declared.bytes.toString('utf8'));
  } catch {throw new Error('trusted render replay requires valid frozen frame and render-report JSON');}
  if (frameSpec?.schema!=='refas.canonical-object-frame/v1' ||
      typeof frameSpec?.hero?.registrationDigest!=='string' ||
      !SHA.test(frameSpec.hero.registrationDigest)) {
    throw new Error('trusted render replay requires a source-registered frozen canonical hero camera');
  }
  for(const [name,value] of Object.entries(RENDERER_IDENTITY)) {
    assertSame(report?.renderer?.[name],value,'render backend '+name);
  }
  if (report?.runtime?.kind!=='offline-numpy-rasterizer' || report?.claimScope!=='render-integrity-only') {
    throw new Error('trusted render replay requires exactly the installed offline renderer profile');
  }
  assertSame(report?.asset?.sha256,asset.sha256,'render report candidate digest');
  assertSame(report?.assetSha256,asset.sha256,'render report asset binding');
  const claimedFrames=(report.frames??[]).filter((item)=>item.path==='hero.png');
  if (claimedFrames.length!==1) throw new Error('render report requires exactly one hero frame');
  const claimed=claimedFrames[0];
  assertSame(claimed.sha256,hero.sha256,'render report hero digest');
  assertSame(report.heroImageSha256,hero.sha256,'render report hero image digest');
  assertSame(claimed.frameBinding?.registrationDigest,frameSpec.hero.registrationDigest,'frozen source registration');
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-trusted-render-'));
  try {
    const out=path.join(tmp,'independent');
    const python=spawnSync(PYTHON,[RENDERER,'--glb',asset.file,'--frame',frame.file,
      '--out',out,'--size',String(renderSize),
      '--max-working-mb','256','--timeout-seconds','45'],{
      encoding:'utf8',timeout:60_000,maxBuffer:128*1024,
      env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
    });
    if (python.error || python.status!==0) {
      throw new Error('installed render replay cannot independently render current GLB and camera');
    }
    let independent;
    try {independent=JSON.parse(await fs.readFile(path.join(out,'render-report.json'),'utf8'));}
    catch {throw new Error('installed render replay produced invalid independent report');}
    const raster=await fs.readFile(path.join(out,'hero.png'));
    const trustedFrameSha=digest(raster);
    assertSame(independent.asset.sha256,asset.sha256,'independently rendered asset SHA');
    assertSame(independent.frameDigest,report.frameDigest,'frozen camera frame digest');
    assertSame(independent.canonicalFrame?.digest,report.canonicalFrame?.digest,'canonical frame identity');
    assertSame(independent.frames?.find(x=>x.path==='hero.png')?.frameBinding?.registrationDigest,
      frameSpec.hero.registrationDigest,'independent registered camera binding');
    assertSame(JSON.stringify(independent.heroCamera),JSON.stringify(report.heroCamera),'render hero camera');
    assertSame(trustedFrameSha,hero.sha256,'registered hero pixels');
    assertSame(independent.heroImageSha256,hero.sha256,'independent hero frame digest');
    return Object.freeze({
      status:'PASS',claimScope:'render-provenance-only',
      assetSha256:asset.sha256,frameFileSha256:frame.sha256,
      renderer:'RefAs Portable Rasterizer/1.0.0',
      canonicalFrameDigest:independent.frameDigest,heroSha256:trustedFrameSha,
      cannotAuthorizeReferenceFidelity:true,
    });
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
}

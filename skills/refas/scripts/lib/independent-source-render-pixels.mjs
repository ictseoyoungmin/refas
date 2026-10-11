import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReferenceRegistration} from './registration.mjs';

const SCRIPT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','source_render_pixel_screen.py');
const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
const SHA=/^[a-f0-9]{64}$/u;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

async function snapshot(root, relative, expectedSha, label, maxBytes) {
  if(typeof relative!=='string' || !relative || path.isAbsolute(relative) ||
      relative.includes('\\') || relative.split('/').some(x=>!x || x==='.' || x==='..')) {
    throw new Error(label+' must be a project-contained relative path');
  }
  if(!SHA.test(expectedSha??'')) throw new Error(label+' requires exact trusted SHA-256');
  const base=await fs.realpath(root);
  const real=await fs.realpath(path.join(base,relative));
  if(!real.startsWith(base+path.sep)) throw new Error(label+' escaped project boundary');
  const stat=await fs.stat(real);
  if(!stat.isFile() || stat.size<1 || stat.size>maxBytes) throw new Error(label+' invalid bounded artifact');
  const bytes=await fs.readFile(real);
  if(bytes.length!==stat.size || sha(bytes)!==expectedSha) throw new Error(label+' current bytes differ from authoritative SHA');
  return bytes;
}

/**
 * Recompute source/render pixels from authoritative original-image bytes and
 * an independently authenticated GLB hero PNG supplied by the trusted caller.
 * No worker-submitted measurements/report are read or used. Passing only means
 * "no detected contradiction", not likeness. The caller must independently
 * prove hero provenance and origin of registration.
 */
export async function evaluateIndependentSourceRenderPixels({
  root,sourcePath,sourceSha256,heroPath,heroSha256,registrationPath,
  registrationSha256,roi=[0,0,1,1],
}={}) {
  if(!Array.isArray(roi) || roi.length!==4 || roi.some(x=>!Number.isFinite(x)||x<0||x>1) ||
      roi[2]<=0 || roi[3]<=0 || roi[0]+roi[2]>1 || roi[1]+roi[3]>1) {
    throw new Error('trusted source pixel evaluation requires bounded normalized ROI');
  }
  const [source,hero,regBytes]=await Promise.all([
    snapshot(root,sourcePath,sourceSha256,'actual primary source',256*1024*1024),
    snapshot(root,heroPath,heroSha256,'actual registered hero',32*1024*1024),
    snapshot(root,registrationPath,registrationSha256,'registered placement',2*1024*1024),
  ]);
  let registration;
  try {registration=JSON.parse(regBytes.toString('utf8'));}
  catch {throw new Error('registered placement JSON could not be parsed');}
  const valid=validateReferenceRegistration(registration);
  if(!valid.valid) throw new Error('registered placement cannot replay: '+valid.errors.join('; '));
  if(registration.parentSourceSha256!==sourceSha256 || registration.childSourceSha256!==heroSha256) {
    throw new Error('registered placement is not bound to actual primary source and current rendered hero');
  }
  if(!registration.attestation?.evidenceRefs?.includes(sourcePath) ||
      !registration.attestation?.evidenceRefs?.includes(heroPath)) {
    throw new Error('registered placement lacks original source and current hero citations');
  }
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'refas-source-pixels-'));
  try {
    const src=path.join(temporary,'source.bin');
    const frame=path.join(temporary,'hero.png');
    const registered=path.join(temporary,'registration.json');
    await Promise.all([fs.writeFile(src,source),fs.writeFile(frame,hero),fs.writeFile(registered,regBytes)]);
    const child=spawnSync(PYTHON,[SCRIPT,'--source',src,'--hero',frame,'--registration',registered,'--roi',JSON.stringify(roi)],{
      encoding:'utf8',timeout:60_000,maxBuffer:128*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
    });
    if(child.error || child.status!==0) throw new Error('independent original-pixel/hero segmentation unavailable');
    let observed;
    try {observed=JSON.parse(child.stdout);}
    catch {throw new Error('independent pixel observation is not valid JSON');}
    const p=observed?.perceptual?.pixelShape;
    if(observed?.schema!=='refas.independent-source-render-pixels/v1' ||
        observed.cannotAuthorizeReferenceFidelity!==true ||
        !['USABLE','INSUFFICIENT'].includes(p?.status) ||
        observed.claimScope!=='derived-contradiction-evidence-only') {
      throw new Error('independent pixel observation violates evidence-only contract');
    }
    return Object.freeze({
      ...observed,
      status:registration.ambiguities.length?'INSUFFICIENT':p.status,
      sourceSha256,heroSha256,registrationSha256,
      cannotAuthorizeReferenceFidelity:true,
      authority:'independently-recomputed-original-and-render-pixels',
    });
  } finally {await fs.rm(temporary,{recursive:true,force:true});}
}

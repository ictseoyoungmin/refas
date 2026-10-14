#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OLD=process.env.REFAS_V121_ROOT;
if(!OLD)throw new Error('REFAS_V121_ROOT is required: use the published v1.2.1 checkout');
const PY=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
function run(file,args,cwd=ROOT){
  const x=spawnSync(file,args,{cwd,encoding:'utf8',timeout:60000});
  assert.equal(x.status,0,`${file} ${args.join(' ')}: ${x.stderr||x.stdout}`);
  return x.stdout.trim();
}
async function snapshot(root){
  const result={};
  async function visit(folder){
    for(const x of await fs.readdir(folder,{withFileTypes:true})){
      const p=path.join(folder,x.name);
      if(x.isDirectory())await visit(p);
      else if(x.isFile())result[path.relative(root,p)]=digest(await fs.readFile(p));
    }
  }
  await visit(root);
  return result;
}
async function main(){
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-121-to-130-'));
  try{
    const original=path.join(OLD,'skills/refas/scripts/refas.mjs');
    const next=path.join(ROOT,'skills/refas/scripts/refas.mjs');
    assert.equal(run(process.execPath,[original,'--version'],tmp),'1.2.1');
    assert.equal(run(process.execPath,[next,'--version'],tmp),'1.3.0');
    const project=path.join(tmp,'saved-v121');
    await fs.mkdir(path.join(project,'source'),{recursive:true});
    const image=path.join(project,'source','reference.png');
    run(PY,['-c',"from PIL import Image;import sys;Image.new('RGB',(96,64),(80,100,125)).save(sys.argv[1])",image],tmp);
    const source=path.join(project,'source','source-manifest.json');
    const args=['--root',project,'--image',image,'--id','reference','--out',source];
    assert.equal(JSON.parse(run(process.execPath,[original,'source-manifest',...args],tmp)).status,'PASS');
    run(process.execPath,[original,'init','--root',project,'--project','legacy-v121','--source',source],tmp);
    const before=await snapshot(project);
    assert.equal(JSON.parse(run(process.execPath,[original,'audit','--root',project],tmp)).valid,true);
    const newAudit=JSON.parse(run(process.execPath,[next,'audit','--root',project],tmp));
    assert.equal(newAudit.valid,true,JSON.stringify(newAudit.errors||[]));
    const resumed=JSON.parse(run(process.execPath,[next,'resume','--root',project],tmp));
    assert.ok(resumed.nextAction||resumed.status||resumed.capability);
    const guided=JSON.parse(run(process.execPath,[next,'next','--root',project],tmp));
    assert.ok(guided);
    assert.deepEqual(await snapshot(project),before,
      'v1.3.0 read-only audit/resume/next must preserve all published v1.2.1 project bytes');
    console.log(JSON.stringify({status:'PASS',baseline:'1.2.1',target:'1.3.0',
      audited:true,resumable:true,sourceBytesPreserved:true,projectFileCount:Object.keys(before).length},null,2));
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

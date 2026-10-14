#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';

function run(command,args,options={}){
  const result=spawnSync(command,args,{encoding:'utf8',timeout:120000,
    cwd:options.cwd??ROOT,
    env:{...process.env,NPM_CONFIG_AUDIT:'false',NPM_CONFIG_FUND:'false',NPM_CONFIG_OFFLINE:'true'},
  });
  assert.equal(result.status,0,`${command} ${args.join(' ')}: ${result.stderr||result.stdout}`);
  return result.stdout;
}
const readJson=async(file)=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=(buf)=>createHash('sha256').update(buf).digest('hex');

async function main(){
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'refas-installed-tarball-'));
  try{
    const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',tmp]))[0];
    assert.equal(packed.name,'refas');
    assert.equal(packed.version,'1.3.0');
    const tarball=path.join(tmp,packed.filename);
    assert.ok((await fs.stat(tarball)).size>0);
    const prefix=path.join(tmp,'installed');
    run('npm',['install','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund','--offline',tarball]);
    const mod=path.join(prefix,'node_modules','refas');
    const pkg=await readJson(path.join(mod,'package.json'));
    assert.equal(pkg.version,'1.3.0');
    for(const bin of ['refas','refas-host']){
      assert.ok((await fs.lstat(path.join(prefix,'node_modules','.bin',bin))).isSymbolicLink(),
        `npm binary ${bin} not installed`);
    }
    const cli=path.join(mod,'skills','refas','scripts','refas.mjs');
    const host=path.join(mod,'skills','refas','scripts','refas-host.mjs');
    assert.equal(JSON.parse(run(process.execPath,[cli,'--help'],{cwd:tmp})).version,'1.3.0');
    assert.equal(JSON.parse(run(process.execPath,[host,'help'],{cwd:tmp})).version,'1.3.0');
    const installedSkill=path.join(mod,'skills','refas');
    const instruction=JSON.parse(run(process.execPath,[
      path.join(installedSkill,'scripts','verify_installation_boundary.mjs'),
    ],{cwd:tmp}));
    assert.equal(instruction.status,'PASS');
    const discovered=JSON.parse(run(process.execPath,[
      path.join(installedSkill,'scripts','verify_semantic_instruction_graph.mjs'),
    ],{cwd:tmp}));
    assert.equal(discovered.status,'PASS');
    const source=path.join(tmp,'reference.png');
    const img=`from PIL import Image;import sys;Image.new('RGB',(64,48),(90,115,145)).save(sys.argv[1])`;
    run(PYTHON,['-c',img,source],{cwd:tmp});
    const output=path.join(tmp,'legacy-observation');
    const created=JSON.parse(run(process.execPath,[cli,'evidence','--image',source,
      '--out',output,'--scope','whole','--roi','0,0,1,1'],{cwd:tmp}));
    assert.equal(created.status,'PASS');
    const manifest=await readJson(path.join(output,'manifest.json'));
    assert.equal(manifest.schema,'refas.evidence-manifest/v1');
    assert.equal(manifest.source.sha256,sha(await fs.readFile(source)));
    for(const name of ['context','crop','contrast','low-frequency',
      'high-frequency','gradient','edges','highlights']){
      const part=manifest.items.find(x=>x.id==='whole.'+name);
      assert.ok(part,`missing legacy artifact: ${name}`);
      assert.equal(part.sha256,sha(await fs.readFile(path.join(output,part.path))));
    }
    console.log(JSON.stringify({status:'PASS',version:pkg.version,
      tarball:packed.filename,installedCli:true,installedHost:true,skillRoutes:instruction.referenceLeaves,
      graphNodes:discovered.nodeCount,legacyEvidence:true},null,2));
  }finally{
    await fs.rm(tmp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

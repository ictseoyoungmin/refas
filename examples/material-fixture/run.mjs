import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {partsToGlb} from '../../skills/refas/scripts/lib/index.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url)), OUT=path.join(ROOT,'output');
function sphere(center,radius,segments=32,rings=20){
  const positions=[],normals=[],indices=[];
  for(let y=0;y<=rings;y++) for(let x=0;x<=segments;x++){
    const v=y/rings, u=x/segments, phi=v*Math.PI, theta=u*Math.PI*2;
    const n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
    normals.push(n); positions.push(n.map((value,i)=>center[i]+value*radius));
  }
  for(let y=0;y<rings;y++) for(let x=0;x<segments;x++){
    const a=y*(segments+1)+x,b=a+segments+1; if(y>0) indices.push(a,b,a+1); if(y<rings-1) indices.push(a+1,b,b+1);
  }
  return {positions,normals,indices:indices.flat()};
}
const materials={
  'dielectric-polymer':{baseColor:[0.08,0.20,0.42,1],metallic:0,roughness:0.24},
  'painted-metal':{baseColor:[0.54,0.08,0.055,1],metallic:0.72,roughness:0.32},
  'bare-metal':{baseColor:[0.62,0.66,0.72,1],metallic:1,roughness:0.12},
  'rough-rubber':{baseColor:[0.035,0.04,0.045,1],metallic:0,roughness:0.92},
};
const entries=[['polymer',[-1.65,.55,0],'dielectric-polymer'],['painted',[-.55,.55,0],'painted-metal'],['bare',[.55,.55,0],'bare-metal'],['rubber',[1.65,.55,0],'rough-rubber']];
const parts=entries.map(([id,center,materialId])=>({id,materialId,role:'material-swatch',scopeId:`whole.${id}`,mesh:sphere(center,.45)}));
await fs.rm(OUT,{recursive:true,force:true}); await fs.mkdir(path.join(OUT,'assets'),{recursive:true});
const glb=partsToGlb({parts,materials,assetId:'pbr-material-fixture',name:'PBR Material Fixture'}); const glbPath=path.join(OUT,'assets','material-fixture.glb'); await fs.writeFile(glbPath,glb);
const frame={schema:'refas.canonical-object-frame/v1',id:'material-fixture-frame',scopeId:'whole',origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}}; const framePath=path.join(OUT,'canonical-frame.json'); await fs.writeFile(framePath,`${JSON.stringify(frame,null,2)}\n`);
const renderer=path.resolve(ROOT,'../../skills/refas/scripts/render_pbr.py'), renderDir=path.join(OUT,'renders','pbr');
const pythonEnv={...process.env,PYTHONDONTWRITEBYTECODE:'1'};
const result=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',[renderer,'--glb',glbPath,'--out',renderDir,'--frame',framePath,'--size','420','--timeout-seconds','120'],{encoding:'utf8',timeout:130000,env:pythonEnv});
if(result.status!==0) throw new Error(result.stderr||result.stdout); process.stdout.write(result.stdout);
const first=JSON.parse(await fs.readFile(path.join(renderDir,'render-report.json'),'utf8'));
const repeatDir=path.join(OUT,'repeat'); const repeat=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',[renderer,'--glb',glbPath,'--out',repeatDir,'--frame',framePath,'--size','420','--timeout-seconds','120'],{encoding:'utf8',timeout:130000,env:pythonEnv}); if(repeat.status!==0) throw new Error(repeat.stderr||repeat.stdout);
const second=JSON.parse(await fs.readFile(path.join(repeatDir,'render-report.json'),'utf8')); const identical=first.outputs.every((item,index)=>item.sha256===second.outputs[index].sha256);
if(!identical) throw new Error('PBR output digests are not deterministic');
await fs.writeFile(path.join(OUT,'summary.json'),`${JSON.stringify({status:'PASS',materials:Object.keys(materials),frames:first.outputs.length,deterministicOutputs:identical,reportDigest:first.reportDigest},null,2)}\n`);
process.stdout.write(`${JSON.stringify({status:'PASS',board:path.relative(ROOT,path.join(renderDir,'pbr-review-board.png')),deterministicOutputs:identical},null,2)}\n`);

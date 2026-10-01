#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  digestBytes,
  finalizeMesh,
  generateUvCoordinates,
  inspectGlb,
  parseGlb,
  partsToGlb,
  validatePbrRenderReport,
} from './lib/index.mjs';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT=path.dirname(SCRIPT_DIR);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHUlEQVR42mP4r6DwX8Hh/38YzYDM+a+g8J+BoAoA2NAk4WrV3IEAAAAASUVORK5CYII=','base64');

function quad(){
  return finalizeMesh([[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],[0,1,2,0,2,3],{role:'textured-dogfood-quad'});
}
function render(glbPath,outDir,framePath){
  const renderer=path.join(SKILL_ROOT,'scripts','render_pbr.py');
  const result=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',[renderer,'--glb',glbPath,'--out',outDir,'--frame',framePath,'--size','192','--timeout-seconds','120'],{
    encoding:'utf8',timeout:130000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONHASHSEED:'0',TZ:'UTC'},
  });
  if(result.status!==0) throw new Error(String(result.stderr||result.stdout));
}
async function report(outDir){return JSON.parse(await fs.readFile(path.join(outDir,'render-report.json'),'utf8'));}
function outputDigest(report,viewId){return report.outputs.find(o=>o.viewId===viewId)?.sha256;}

export async function runTexturedMaterialDogfood({keep=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-textured-material-'));
  try{
    const mesh=generateUvCoordinates(quad(),{method:'planar',uAxis:'x',vAxis:'y'});
    const textureSha256=digestBytes(PNG);
    const textured=partsToGlb({
      assetId:'textured-material-dogfood',
      materials:{decal:{baseColor:[1,1,1,1],metallic:0,roughness:.7,baseColorTexture:{png:PNG,sha256:textureSha256}}},
      parts:[{id:'panel',scopeId:'whole',role:'panel',materialId:'decal',mesh}],
    });
    const factorOnly=partsToGlb({
      assetId:'factor-only-material-dogfood',
      materials:{decal:{baseColor:[1,1,1,1],metallic:0,roughness:.7}},
      parts:[{id:'panel',scopeId:'whole',role:'panel',materialId:'decal',mesh}],
    });
    const texturedPath=path.join(root,'textured.glb'),factorPath=path.join(root,'factor.glb');
    await fs.writeFile(texturedPath,textured);await fs.writeFile(factorPath,factorOnly);
    const frame={schema:'refas.canonical-object-frame/v1',id:'textured-material-frame',scopeId:'whole',origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}};
    const framePath=path.join(root,'frame.json');await fs.writeFile(framePath,JSON.stringify(frame,null,2)+'\n');
    const outA=path.join(root,'render-a'),outB=path.join(root,'render-b'),outFactor=path.join(root,'render-factor');
    render(texturedPath,outA,framePath);render(texturedPath,outB,framePath);render(factorPath,outFactor,framePath);
    const a=await report(outA),b=await report(outB),plain=await report(outFactor);
    assert.deepEqual(validatePbrRenderReport(a),{valid:true,errors:[]});
    assert.deepEqual(validatePbrRenderReport(b),{valid:true,errors:[]});
    assert.ok(a.materialSupport.supported.includes('base-color-texture'));
    assert.ok(a.materialSupport.supported.includes('texcoord-0'));
    assert.ok(!a.materialSupport.unsupported.includes('textures'));
    assert.deepEqual(a.textureBindings,[{sha256:textureSha256,mimeType:'image/png',channel:'base-color'}]);
    assert.equal(outputDigest(a,'albedo'),outputDigest(b,'albedo'),'textured albedo output must be deterministic');
    assert.notEqual(outputDigest(a,'albedo'),outputDigest(plain,'albedo'),'portable renderer must actually sample the texture');
    assert.equal(a.reportDigest,b.reportDigest,'repeat textured render report must be deterministic');
    const inspection=inspectGlb(textured);
    assert.deepEqual(inspection.textureDigests,[textureSha256]);
    const {json,binary}=parseGlb(textured);
    const image=json.images[0],view=json.bufferViews[image.bufferView];
    const embedded=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
    assert.equal(digestBytes(embedded),textureSha256);
    const result={schema:'refas.textured-material-dogfood/v1',status:'PASS',textureSha256,assetSha256:a.assetSha256,reportDigest:a.reportDigest,albedoSha256:outputDigest(a,'albedo'),factorOnlyAlbedoSha256:outputDigest(plain,'albedo'),deterministic:true,textureSampled:true};
    if(keep) result.root=root;
    return result;
  }finally{if(!keep)await fs.rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runTexturedMaterialDogfood().then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{process.stderr.write((e.stack??e.message)+'\n');process.exit(1);});
}

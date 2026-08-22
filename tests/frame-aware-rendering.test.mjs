import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {createSegmentPrism, partsToGlb} from '../skills/refas/scripts/lib/index.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const DIGEST='a'.repeat(64);
const material={frame:{baseColor:[0.25,0.55,0.8,1],metallic:0.1,roughness:0.45}};

function rotateZ(mesh){
  return {...mesh,positions:mesh.positions.map(([x,y,z])=>[-y,x,z]),normals:mesh.normals?.map(([x,y,z])=>[-y,x,z])};
}

function pinFront(mesh,depth){return {...mesh,positions:mesh.positions.map(([x,y,z])=>[x,y,z-depth/2])};}

function asset({rotated=false,depth=0.5}={}){
  const whole=createSegmentPrism({start:[-1,0,0],end:[1,0,0],width:depth,height:0.4,upHint:[0,1,0]});
  const module=createSegmentPrism({start:[0.25,0.65,0],end:[0.9,0.65,0],width:depth*0.6,height:0.24,upHint:[0,1,0]});
  const map=(mesh,localDepth)=>{const pinned=pinFront(mesh,localDepth);return rotated?rotateZ(pinned):pinned;};
  return partsToGlb({parts:[{id:'whole',scopeId:'whole',materialId:'frame',mesh:map(whole,depth)},{id:'module',scopeId:'whole.module',materialId:'frame',mesh:map(module,depth*0.6)}],materials:material});
}

function canonical(rotated=false,scopeParts=[]){
  return {schema:'refas.canonical-object-frame/v1',id:rotated?'rotated-frame':'asset-frame',scopeId:scopeParts.length?'whole.module':'whole',origin:[0,0,0],axes:rotated?{right:[0,1,0],up:[-1,0,0],forward:[0,0,1]}:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},scopeParts,hero:{position:[0,0,5],target:[0,0,0],up:[0,1,0],fovY:29,registrationDigest:DIGEST}};
}

async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-frame-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function write(root,name,value){const target=path.join(root,name);await fs.writeFile(target,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));return target;}
function render(glb,out,frame){return spawnSync(process.execPath,[CLI,'render','--glb',glb,'--out',out,'--frame',frame,'--size','96','--timeout-seconds','30','--max-working-mb','64'],{encoding:'utf8',timeout:40_000});}
async function report(out){return JSON.parse(await fs.readFile(path.join(out,'render-report.json'),'utf8'));}

test('canonical frame preserves semantic diagnostics when asset and frame rotate together',async(t)=>{
  const root=await setup(t);
  const glbA=await write(root,'asset.glb',asset()),frameA=await write(root,'frame.json',canonical());
  const glbB=await write(root,'rotated.glb',asset({rotated:true})),frameB=await write(root,'rotated-frame.json',canonical(true));
  const outA=path.join(root,'a'),outB=path.join(root,'b');
  const a=render(glbA,outA,frameA),b=render(glbB,outB,frameB);assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);
  const [ra,rb]=await Promise.all([report(outA),report(outB)]);
  for(const name of ['side','top','grazing']){
    const fa=ra.frames.find((frame)=>frame.path===`${name}.png`),fb=rb.frames.find((frame)=>frame.path===`${name}.png`);
    assert.equal(fa.silhouetteSha256,fb.silhouetteSha256,`${name} must retain its object-relative projection`);
    assert.equal(fa.frameBinding.localDirection.length,3);
  }
  assert.deepEqual(ra.frames[0].frameBinding.registrationDigest,DIGEST);
  assert.deepEqual(rb.canonicalFrame.axes.right,[0,1,0]);
});

test('scope-local bounds frame the selected module while rendering whole context',async(t)=>{
  const root=await setup(t),glb=await write(root,'asset.glb',asset()),frame=await write(root,'module-frame.json',canonical(false,['module'])),out=path.join(root,'out');
  const result=render(glb,out,frame);assert.equal(result.status,0,result.stderr);const value=await report(out);
  assert.deepEqual(value.canonicalFrame.scopeParts,['module']);
  assert.equal(value.geometry.parts,2);
  assert.ok(value.frames.every((item)=>item.frameBinding.scopeId==='whole.module'));
});

test('side diagnostics expose depth changes hidden by the registered hero silhouette',async(t)=>{
  const root=await setup(t),frame=await write(root,'frame.json',canonical());
  const shallow=await write(root,'shallow.glb',asset({depth:0.25})),deep=await write(root,'deep.glb',asset({depth:0.9}));
  const outA=path.join(root,'shallow'),outB=path.join(root,'deep');
  assert.equal(render(shallow,outA,frame).status,0);assert.equal(render(deep,outB,frame).status,0);
  const [a,b]=await Promise.all([report(outA),report(outB)]),view=(value,name)=>value.frames.find((item)=>item.path===`${name}.png`);
  const heroA=view(a,'hero'),heroB=view(b,'hero');
  assert.ok(Math.abs(heroA.coveredPixels-heroB.coveredPixels)/Math.max(heroA.coveredPixels,heroB.coveredPixels)<0.05,'hero coverage must remain perceptually equivalent');
  assert.notEqual(view(a,'side').silhouetteSha256,view(b,'side').silhouetteSha256);
});

test('malformed frames fail before publishing partial renders',async(t)=>{
  const root=await setup(t),glb=await write(root,'asset.glb',asset()),invalid=canonical();invalid.axes.up=[1,0,0];
  const frame=await write(root,'invalid.json',invalid),out=path.join(root,'out'),result=render(glb,out,frame);
  assert.equal(result.status,1);assert.match(result.stderr,/orthonormal and right-handed/);await assert.rejects(fs.access(path.join(out,'render-report.json')));
});

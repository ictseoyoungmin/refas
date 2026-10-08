import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {createCylinder, digestBytes, initProject, partsToGlb} from '../skills/refas/scripts/lib/index.mjs';
import {verifySourceBoundObject, QA_COVERAGE_SCHEMA} from '../skills/refas/scripts/lib/qa-coverage.mjs';

const materials={panel:{baseColor:[0.4,0.4,0.4,1],metallic:0,roughness:1}};

test('valid GLB with a fresh uncheckpointed project fails source-bound QA coverage',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-coverage-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await initProject(root,{projectId:'qa-fresh-worker'});
 const mesh=createCylinder({center:[0,0,0],radius:0.2,height:0.4,segments:12});
 const glb=partsToGlb({parts:[{id:'qa-part',materialId:'panel',mesh}],materials});
 const asset=path.join(root,'draft.glb');
 await fs.writeFile(asset,glb);
 const result=await verifySourceBoundObject(root,asset);
 assert.equal(result.schema,QA_COVERAGE_SCHEMA);
 assert.equal(result.decision.state,'BLOCKED');
 assert.equal(result.checks.find(x=>x.id==='glb-integrity').status,'PASS');
 assert.equal(result.checks.find(x=>x.id==='source-provenance').status,'NOT_RUN');
 assert.equal(result.checks.find(x=>x.id==='candidate-lineage').status,'NOT_RUN');
 assert.equal(result.checks.find(x=>x.id==='realized-contact-support').status,'NOT_RUN');
 assert.equal(result.checks.find(x=>x.id==='independent-visual-review').status,'NOT_RUN');
 assert.ok(result.decision.blockingCheckIds.includes('whole-object-certification'));
});

test('invalid candidate never upgrades a source-bound QA report',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-invalid-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await initProject(root,{projectId:'qa-invalid-asset'});
 const asset=path.join(root,'bad.glb');
 await fs.writeFile(asset,'not-a-glb');
 const result=await verifySourceBoundObject(root,asset);
 assert.equal(result.checks.find(x=>x.id==='glb-integrity').status,'FAIL');
 assert.equal(result.decision.state,'BLOCKED');
});

test('QA coverage rejects candidate outside the project root',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-path-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await initProject(root,{projectId:'qa-containment'});
 await assert.rejects(verifySourceBoundObject(root,path.resolve(root,'../escaped.glb')),/inside project root/u);
});

test('mutated primary source bytes block coverage even when a candidate GLB is valid',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-source-drift-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'source'));
 const reference=Buffer.from('primary independent observation');
 const sourcePath=path.join(root,'source','ref.bin');
 await fs.writeFile(sourcePath,reference);
 await initProject(root,{projectId:'qa-source-drift',source:{
  schema:'refas.source-manifest/v1',id:'primary',path:'source/ref.bin',
  sha256:digestBytes(reference),sizeBytes:reference.length,width:24,height:24,
  authority:'primary',acquisition:{kind:'operator-supplied'},
 }});
 const mesh=createCylinder({center:[0,0,0],radius:0.2,height:0.3,segments:12});
 const asset=path.join(root,'draft.glb');
 await fs.writeFile(asset,partsToGlb({parts:[{id:'qa-part',materialId:'panel',mesh}],materials}));
 await fs.writeFile(sourcePath,'corrupted source bytes');
 const result=await verifySourceBoundObject(root,asset);
 assert.equal(result.checks.find(x=>x.id==='glb-integrity').status,'PASS');
 assert.equal(result.checks.find(x=>x.id==='source-provenance').status,'FAIL');
 assert.equal(result.decision.state,'BLOCKED');
});

test('QA coverage cannot read a candidate through a symlink outside project root',async (t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-link-'));
 const external=await fs.mkdtemp(path.join(os.tmpdir(),'refas-qa-external-'));
 t.after(()=>Promise.all([fs.rm(root,{recursive:true,force:true}),fs.rm(external,{recursive:true,force:true})]));
 await initProject(root,{projectId:'qa-symlink'});
 const foreign=path.join(external,'file.glb');
 await fs.writeFile(foreign,'untrusted');
 const link=path.join(root,'linked.glb');
 await fs.symlink(foreign,link);
 await assert.rejects(verifySourceBoundObject(root,link),/inside project root/u);
});

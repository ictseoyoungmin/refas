import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {
  createPriorQuarantine,
  digestBytes,
  validatePriorQuarantine,
} from '../skills/refas/scripts/lib/index.mjs';
import {runPriorQuarantineFreshWorkerDogfood} from '../skills/refas/scripts/verify_prior_quarantine_dogfood.mjs';

function glb({positions=[0,0,0,1,0,0,0,1,0],morph=false,materials=false,tag=''}={}){
  const data=new Float32Array(positions);const binary=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  const json={asset:{version:'2.0',generator:'prior-test-'+tag},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},...(morph?{targets:[{POSITION:0}]}:{}),...(materials?{material:0}:{})}]}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3'}],bufferViews:[{buffer:0,byteOffset:0,byteLength:binary.length}],buffers:[{byteLength:binary.length}],...(materials?{materials:[{name:'prior-material'}]}:{})};
  const jsonBytes=Buffer.from(JSON.stringify(json)),jl=(jsonBytes.length+3)&~3,bl=(binary.length+3)&~3,total=12+8+jl+8+bl,out=Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);out.writeUInt32LE(jl,12);out.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(out,20);out.fill(0x20,20+jsonBytes.length,20+jl);
  const bo=20+jl;out.writeUInt32LE(bl,bo);out.writeUInt32LE(0x004e4942,bo+4);binary.copy(out,bo+8);return out;
}
const D=(c)=>c.repeat(64);
const bind=(path,bytes,role)=>({path,sha256:digestBytes(bytes),role,sourceEvidenceEligible:false});
const correspondence=[{sourceScopeId:'whole',priorSemanticId:'prior-whole',method:'declared-semantic-id',evidenceRefs:['source/reference.bin']}];
const stripped=['vertex-proportions','shape-keys','modifiers','materials'];

test('prior quarantine rejects observed authority and proximity correspondence',()=>{
  const raw=Buffer.from('novel prior'),view=Buffer.from('view');
  assert.throws(()=>createPriorQuarantine({id:'prior-a',sourceSha256:D('a'),kind:'novel-view',authority:'observed',rawPrior:bind('priors/raw',raw,'raw'),derivedArtifacts:[bind('priors/view.png',view,'view')],transferable:['landmark-correspondence'],stripped,semanticCorrespondences:correspondence,evidenceRefs:['source/reference.bin']}),/observed is forbidden/u);
  assert.throws(()=>createPriorQuarantine({id:'prior-a',sourceSha256:D('a'),kind:'novel-view',authority:'inferred',rawPrior:bind('priors/raw',raw,'raw'),derivedArtifacts:[bind('priors/view.png',view,'view')],transferable:['landmark-correspondence'],stripped,semanticCorrespondences:[{...correspondence[0],method:'nearest-surface'}],evidenceRefs:['source/reference.bin']}),/proximity is not correspondence/u);
});

test('topology prior rejects unchanged proportions, residual morph targets, and materials',()=>{
  const raw=glb({positions:[0,0,0,1,0,0,0,1,0],materials:true,tag:'raw'});
  const same=glb({positions:[0,0,0,1,0,0,0,1,0],tag:'same'});
  const changedMorph=glb({positions:[-.5,0,0,.5,0,0,0,1,0],morph:true,tag:'morph'});
  const changedMaterial=glb({positions:[-.5,0,0,.5,0,0,0,1,0],materials:true,tag:'mat'});
  const base={id:'topology-prior',sourceSha256:D('a'),kind:'topology',authority:'engineered',rawPrior:bind('priors/raw.glb',raw,'raw-topology'),transferable:['connectivity','landmark-correspondence'],stripped,semanticCorrespondences:correspondence,evidenceRefs:['source/reference.bin']};
  assert.throws(()=>createPriorQuarantine({...base,rawPriorGlb:raw,sanitizedSeed:bind('priors/seed.glb',same,'sanitized-topology'),sanitizedSeedGlb:same}),/raw vertex proportions/u);
  assert.throws(()=>createPriorQuarantine({...base,rawPriorGlb:raw,sanitizedSeed:bind('priors/seed.glb',changedMorph,'sanitized-topology'),sanitizedSeedGlb:changedMorph}),/shape keys \/ morph targets/u);
  assert.throws(()=>createPriorQuarantine({...base,rawPriorGlb:raw,sanitizedSeed:bind('priors/seed.glb',changedMaterial,'sanitized-topology'),sanitizedSeedGlb:changedMaterial}),/materials declared stripped/u);
});

test('sanitized topology prior round-trips canonically',()=>{
  const raw=glb({positions:[0,0,0,1,0,0,0,1,0],materials:true,tag:'raw'});
  const seed=glb({positions:[-.5,0,0,.5,0,0,0,1,0],tag:'seed'});
  const record=createPriorQuarantine({id:'topology-prior',sourceSha256:D('a'),kind:'topology',authority:'engineered',rawPrior:bind('priors/raw.glb',raw,'raw-topology'),rawPriorGlb:raw,sanitizedSeed:bind('priors/seed.glb',seed,'sanitized-topology'),sanitizedSeedGlb:seed,transferable:['connectivity','landmark-correspondence'],stripped,semanticCorrespondences:correspondence,evidenceRefs:['source/reference.bin']});
  assert.equal(record.sanitizedSeedInspection.morphTargetCount,0);assert.equal(record.sanitizedSeedInspection.materialCount,0);assert.notEqual(record.sanitizedSeedInspection.rawPositionDigest,record.sanitizedSeedInspection.sanitizedPositionDigest);
  assert.deepEqual(validatePriorQuarantine(record,{rawPriorGlb:raw,sanitizedSeedGlb:seed}),{valid:true,errors:[]});
});

test('installed-skill prior quarantine dogfood allows hypothesis use and blocks authority leakage',async()=>{
  const report=await runPriorQuarantineFreshWorkerDogfood();assert.equal(report.status,'PASS');assert.equal(report.installedSkillOnly,true);
});

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function args(argv) {
  const out = {};
  for (let i=0;i<argv.length;i+=1) {
    if (!argv[i].startsWith('--')) continue;
    const key=argv[i].slice(2), value=argv[i+1];
    if (value && !value.startsWith('--')) { out[key]=value; i+=1; } else out[key]=true;
  }
  return out;
}

const TOOL_SOURCE = String.raw`import fs from 'node:fs';
const source=fs.readFileSync(process.argv[2]);
const guide=fs.readFileSync(process.argv[3]);
const output=process.argv[4];
const sx=.65+(source.length%5)*.02, sy=.5, sz=.28+(guide.length%4)*.02;
const p=new Float32Array([-sx,-sy,-sz,sx,-sy,-sz,sx,sy,-sz,-sx,sy,-sz,-sx,-sy,sz,sx,-sy,sz,sx,sy,sz,-sx,sy,sz]);
const i=new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const a=n=>(n+3)&~3, pb=Buffer.from(p.buffer), ib=Buffer.from(i.buffer), io=a(pb.length), bin=Buffer.alloc(a(io+ib.length));
pb.copy(bin); ib.copy(bin,io);
const json={asset:{version:'2.0',generator:'fresh-external-modeler'},buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:pb.length},{buffer:0,byteOffset:io,byteLength:ib.length}],accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-sx,-sy,-sz],max:[sx,sy,sz]},{bufferView:1,componentType:5123,count:i.length,type:'SCALAR'}],meshes:[{name:'body',primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],nodes:[{name:'body',mesh:0,extras:{refasPartId:'body',scopeId:'whole'}}],scenes:[{nodes:[0]}],scene:0};
const jb=Buffer.from(JSON.stringify(json)), jl=a(jb.length), bl=a(bin.length), out=Buffer.alloc(12+8+jl+8+bl);
out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jl,12);out.writeUInt32LE(0x4e4f534a,16);jb.copy(out,20);out.fill(0x20,20+jb.length,20+jl);
const bo=20+jl;out.writeUInt32LE(bl,bo);out.writeUInt32LE(0x004e4942,bo+4);bin.copy(out,bo+8);fs.writeFileSync(output,out);
`;

const NONDETERMINISTIC_TOOL_SOURCE = TOOL_SOURCE.replace(
  "generator:'fresh-external-modeler'",
  "generator:'fresh-external-modeler-'+process.cwd()",
);

async function main() {
  const o=args(process.argv.slice(2));
  const skillRoot=path.resolve(String(o['skill-root']??''));
  const reportPath=path.resolve(String(o.report??''));
  if (!skillRoot || !reportPath) throw new Error('usage: --skill-root DIR --report FILE');
  const reads=[];
  const readPublic=async(relative)=>{
    if (!(relative==='SKILL.md'||relative.startsWith('references/'))) throw new Error(`non-public read requested: ${relative}`);
    reads.push(relative);
    return fs.readFile(path.join(skillRoot,relative),'utf8');
  };
  await readPublic('SKILL.md');
  await readPublic('references/INDEX.md');
  await readPublic('references/construction.md');
  const graph=JSON.parse(await readPublic('references/GRAPH.json'));
  const construction=graph.nodes.find((node)=>node.id==='construction');
  if (!construction?.interface?.interfaces?.some((entry)=>entry.id==='external-construction-attestation')) {
    throw new Error('external construction is not discoverable from the public graph');
  }
  const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
  const sourceBytes=Buffer.from('fresh worker independent source bytes');
  const guideBytes=Buffer.from('fresh worker inferred shape guide');
  const sourceSha256=API.digestBytes(sourceBytes);
  const decision=API.createConstructionVocabulary({
    scopeId:'whole',sourceSha256,vocabulary:'hard-surface',
    cues:[{id:'rigid-form',description:'Primary source supports a controlled rigid volume.',evidenceRefs:['source/reference.bin']}],
    evidenceRefs:['source/reference.bin'],
  });
  const permit=API.createConstructionOperationPermit({decision,scopeId:'whole',operation:'external-construction'});
  const attested=API.attestExternalConstruction({
    decision,permit,
    tool:{id:'fresh-headless-modeler',command:process.execPath},
    versionArgs:['--version'],
    scriptBytes:Buffer.from(TOOL_SOURCE),
    scriptFileName:'construct.mjs',
    inputs:[
      {id:'primary-source',kind:'source',authority:'observed',bytes:sourceBytes},
      {id:'shape-guide',kind:'guide',authority:'inferred',bytes:guideBytes},
    ],
    args:['{script}','{input:primary-source}','{input:shape-guide}','{output}'],
    partId:'body',
    evidenceRefs:['reviews/external-run.json'],
  });
  const quality=API.createConstructionQuality({
    scopeId:'whole',sourceSha256,assetSha256:API.digestBytes(attested.assetBytes),
    claim:'identity-bearing',constructionFamilies:['external-construction'],
    visibleFormGates:API.REQUIRED_VISIBLE_FORM_GATES.map((id)=>({id,status:'pass',evidenceRefs:['reviews/external-run.json'],summary:'fresh-worker external construction evidence'})),
    identityFeatures:[{id:'whole-form',scopeId:'whole',kind:'reference-specific-form',evidenceRefs:['source/reference.bin']}],
    wholeDependency:{scopeId:'whole',status:'pass',evidenceRefs:['reviews/whole.png']},
    registeredComparison:{path:'reviews/comparison.json',sha256:'c'.repeat(64),scopeIds:['whole']},
    constructionVocabulary:decision,constructionPermits:[permit],constructionExecutionProof:attested.proof,ambiguities:[],
  });
  const qualityValidation=API.validateConstructionQuality(quality);
  if (!qualityValidation.valid) throw new Error(`construction quality failed: ${qualityValidation.errors.join('; ')}`);

  let nondeterministicBlocked=false;
  try {
    API.attestExternalConstruction({
      decision,permit,
      tool:{id:'fresh-headless-modeler',command:process.execPath},
      versionArgs:['--version'],
      scriptBytes:Buffer.from(NONDETERMINISTIC_TOOL_SOURCE),
      scriptFileName:'construct.mjs',
      inputs:[
        {id:'primary-source',kind:'source',authority:'observed',bytes:sourceBytes},
        {id:'shape-guide',kind:'guide',authority:'inferred',bytes:guideBytes},
      ],
      args:['{script}','{input:primary-source}','{input:shape-guide}','{output}'],
      evidenceRefs:['reviews/non-deterministic.json'],
    });
  } catch (error) {
    nondeterministicBlocked=/not byte-exact/u.test(error.message);
  }
  if (!nondeterministicBlocked) throw new Error('nondeterministic external tool was not blocked');

  const report={
    schema:'refas.external-construction-fresh-worker-report/v1',
    status:'PASS',
    installedSkillOnly:true,
    publicReads:[...new Set(reads)].sort(),
    publicApiEntrypoint:'scripts/lib/index.mjs',
    tool:attested.receipt.tool,
    sourceSha256,
    receiptDigest:attested.receipt.receiptDigest,
    candidateSha256:API.digestBytes(attested.assetBytes),
    proofDigest:attested.proof.proofDigest,
    constructionQualityDigest:quality.constructionQualityDigest,
    identityBearingClosed:true,
    nondeterministicReplayBlocked:true,
  };
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:report.status,identityBearingClosed:true,nondeterministicReplayBlocked:true})+'\n');
}

main().catch((error)=>{process.stderr.write(`External construction fresh worker failed: ${error.stack??error.message}\n`);process.exit(1);});

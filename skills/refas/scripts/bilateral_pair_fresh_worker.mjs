#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function args(argv){const out={};for(let i=0;i<argv.length;i+=1){if(!argv[i].startsWith('--'))continue;const k=argv[i].slice(2),v=argv[i+1];if(v&&!v.startsWith('--')){out[k]=v;i+=1;}else out[k]=true;}return out;}

async function main(){
  const o=args(process.argv.slice(2));
  const skillRoot=path.resolve(String(o['skill-root']??''));
  const reportPath=path.resolve(String(o.report??''));
  if(!skillRoot||!reportPath) throw new Error('usage: --skill-root DIR --report FILE');
  const reads=[];
  const readPublic=async(relative)=>{if(!(relative==='SKILL.md'||relative.startsWith('references/')))throw new Error(`non-public read requested: ${relative}`);reads.push(relative);return fs.readFile(path.join(skillRoot,relative),'utf8');};
  await readPublic('SKILL.md');
  await readPublic('references/INDEX.md');
  await readPublic('references/relational-structure.md');
  await readPublic('references/spatial-reasoning.md');
  const graph=JSON.parse(await readPublic('references/GRAPH.json'));
  const spatial=graph.nodes.find((node)=>node.id==='spatial-reasoning');
  if(!spatial?.interface?.interfaces?.some((entry)=>entry.id==='bilateral-pair-realization')) throw new Error('bilateral pair realization is not publicly discoverable');
  const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
  const SOURCE='a'.repeat(64);
  const materials={clay:{baseColor:[.6,.6,.6,1],metallic:0,roughness:.8}};

  const makeStructure=(overrides={})=>API.createRelationalStructure({
    scopeId:'whole',sourceSha256:SOURCE,
    entities:[
      {id:'left-leg',kind:'volume',role:'paired-left',basisRefs:['source:corvid']},
      {id:'right-leg',kind:'volume',role:'paired-right',basisRefs:['source:corvid']},
      {id:'sagittal-plane',kind:'plane',role:'pair-plane',basisRefs:['source:body-center']},
    ],
    relations:[{
      id:'leg-pair',kind:'bilateral-pair',scope:'whole-system',importance:'identity',
      entityIds:['left-leg','right-leg'],leftEntityId:'left-leg',rightEntityId:'right-leg',sagittalPlaneId:'sagittal-plane',
      restGeometryPolicy:'shared-mirrored',mirrorAxis:'x',leftHalfSpace:'negative',mirrorPlaneCoordinate:0,
      lateralSpan:{halfSpan:.09,authority:'inferred',basisKind:'body-relative-inference',evidenceRefs:['source:body-envelope']},
      basisRefs:['source:corvid'],
      ...overrides,
    }],
    basisRefs:['source:corvid'],
  });
  const makeCandidate=(left,right,mirrored=true)=>API.partsToGlb({
    assetId:'fresh-bilateral-corvid',
    parts:[
      {id:'left-leg',mesh:left,materialId:'clay',role:'leg',scopeId:'whole',translation:[-.09,0,0],scale:[1,1,1]},
      {id:'right-leg',mesh:right,materialId:'clay',role:'leg',scopeId:'whole',translation:[.09,0,0],scale:mirrored?[-1,1,1]:[1,1,1]},
    ],
    materials,
  });
  const createProof=(glb,relationalStructure)=>API.createBilateralPairRealization({
    glb,relationalStructure,relationId:'leg-pair',
    cameraExplanation:{hypothesisDigest:'b'.repeat(64),evidenceRefs:['source:camera-obliquity']},
    poseEvidence:[
      {entityId:'left-leg',explanation:'near-side articulation and camera projection explain the visible difference',evidenceRefs:['source:left-pose']},
      {entityId:'right-leg',explanation:'far-side articulation and occlusion explain the visible difference',evidenceRefs:['source:right-pose']},
    ],
    evidenceRefs:['reviews:bilateral'],
  });

  let imagePlaneBlocked=false;
  try{
    makeStructure({lateralSpan:{halfSpan:.1106,authority:'observed',basisKind:'image-plane-separation',evidenceRefs:['source:hero-pixels']}});
  }catch(error){imagePlaneBlocked=/image-plane separation/u.test(error.message);}
  if(!imagePlaneBlocked) throw new Error('image-plane pair span was not blocked');

  const independentLeft=API.createCylinder({radius:.054,height:.569,segments:12,role:'legacy-left'});
  const independentRight=API.createCylinder({radius:.0724,height:.506,segments:12,role:'legacy-right'});
  const pair=makeStructure();
  let independentBlocked=false;
  try{createProof(makeCandidate(independentLeft,independentRight),pair);}catch(error){independentBlocked=/independent rest geometry/u.test(error.message);}
  if(!independentBlocked) throw new Error('independent paired rest geometry was not blocked');

  const shared=API.createCylinder({radius:.0632,height:.57,segments:12,role:'shared-leg'});
  const glb=makeCandidate(shared,shared);
  const proof=createProof(glb,pair);
  const validation=API.validateBilateralPairRealization(proof,{glb,relationalStructure:pair});
  if(!validation.valid) throw new Error(`shared bilateral realization invalid: ${validation.errors.join('; ')}`);

  const report={
    schema:'refas.bilateral-pair-fresh-worker-report/v1',
    status:'PASS',installedSkillOnly:true,
    publicReads:[...new Set(reads)].sort(),
    publicApiEntrypoint:'scripts/lib/index.mjs',
    imagePlaneSpanBlocked:true,
    independentRestGeometryBlocked:true,
    sharedMirroredAdmitted:true,
    candidateSha256:proof.candidateSha256,
    relationDigest:proof.relationDigest,
    realizationDigest:proof.realizationDigest,
  };
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:'PASS',imagePlaneSpanBlocked:true,independentRestGeometryBlocked:true,sharedMirroredAdmitted:true})+'\n');
}
main().catch((error)=>{process.stderr.write(`Bilateral pair fresh worker failed: ${error.stack??error.message}\n`);process.exit(1);});

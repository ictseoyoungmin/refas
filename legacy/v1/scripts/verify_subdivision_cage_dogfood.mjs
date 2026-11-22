#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  classifySpatialCollapse,
  commitCheckpoint,
  contentReference,
  createConstructionExecutionProof,
  createConstructionOperationPermit,
  createConstructionVocabulary,
  createLandmarkCage,
  createPerceptualSignatureSet,
  createPermittedSubdivisionCageOrganic,
  createSpatialClosureEvidence,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  createVolumeBarrier,
  digestBytes,
  partsToGlb,
  validatePbrRenderReport,
  validateSpatialClosureEvidence,
  validateVolumeBarrier,
} from './lib/index.mjs';
import {initTrustedContractFixtureProject} from './lib/contract-fixture-project.mjs';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT=path.dirname(SCRIPT_DIR);
const REPO_ROOT=path.resolve(SKILL_ROOT,'..','..');
const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';

function parseArgs(argv){
  const out={};
  for(let index=0;index<argv.length;index+=1){
    if(!argv[index].startsWith('--')) continue;
    const key=argv[index].slice(2), next=argv[index+1];
    if(next&&!next.startsWith('--')){out[key]=next;index+=1;}else out[key]=true;
  }
  return out;
}

async function writeRef(root,relative,bytes,kind){
  const absolute=path.join(root,relative);
  await fs.mkdir(path.dirname(absolute),{recursive:true});
  await fs.writeFile(absolute,bytes);
  return contentReference(absolute,{kind,root});
}

async function commitLocal(root,capability,refs){
  return commitCheckpoint(root,{
    capability,
    scopeId:'whole',
    reason:`${capability} subdivision-cage dogfood`,
    artifactRefs:refs,
    claims:[`${capability} subdivision-cage dogfood`],
    gates:[{id:`${capability}-gate`,evidenceRefs:refs.map((ref)=>ref.path)}],
  });
}

function headFixture(sourceSha256){
  const landmarks=[
    ['crown-left',[-0.72,1.05,-0.52],'observed'],
    ['crown-right',[0.72,1.05,-0.52],'observed'],
    ['jaw-right',[0.58,-0.92,-0.45],'observed'],
    ['jaw-left',[-0.58,-0.92,-0.45],'observed'],
    ['brow-left',[-0.68,0.72,0.72],'observed'],
    ['brow-right',[0.68,0.72,0.72],'observed'],
    ['chin-right',[0.46,-0.94,0.58],'inferred'],
    ['chin-left',[-0.46,-0.94,0.58],'inferred'],
  ];
  const landmarkCage=createLandmarkCage({
    id:'organic-head-landmarks',
    landmarks:landmarks.map(([id,point,authority])=>({
      id,point,authority,role:'head-envelope',evidenceRefs:['source/reference.bin'],
    })),
    evidenceRefs:['source/reference.bin'],
  });
  const vertices=landmarks.map(([id],index)=>({id:`v${index}`,landmarkId:id}));
  const faces=[
    ['v0','v1','v2','v3'],
    ['v4','v7','v6','v5'],
    ['v0','v4','v5','v1'],
    ['v3','v2','v6','v7'],
    ['v0','v3','v7','v4'],
    ['v1','v5','v6','v2'],
  ];
  const decision=createConstructionVocabulary({
    scopeId:'whole',
    sourceSha256,
    vocabulary:'organic',
    cues:[{
      id:'organic-head-volume',
      description:'The reference fixture requires a continuous volumetric organic head envelope.',
      evidenceRefs:['source/reference.bin'],
    }],
    evidenceRefs:['source/reference.bin'],
  });
  const permit=createConstructionOperationPermit({
    decision,scopeId:'whole',operation:'subdivision-cage-organic',
  });
  const mesh=createPermittedSubdivisionCageOrganic({
    decision,permit,
    spec:{
      id:'organic-head-cage',
      landmarkCage,
      vertices,
      faces,
      creases:[
        {vertices:['v0','v1'],weight:0.35},
        {vertices:['v4','v5'],weight:0.25},
      ],
      levels:2,
      evidenceRefs:['source/reference.bin'],
      role:'organic-head-volume',
    },
  });
  const glb=partsToGlb({
    assetId:'subdivision-cage-organic-dogfood',
    name:'Subdivision Cage Organic Dogfood',
    parts:[{
      id:'head',mesh,materialId:'clay',role:'organic-head-volume',scopeId:'whole',
      constructionAuthority:mesh.constructionAuthority,
    }],
    materials:{clay:{baseColor:[0.58,0.58,0.58,1],metallic:0,roughness:0.78}},
  });
  const proof=createConstructionExecutionProof({
    assetBytes:glb,decision,permits:[permit],evidenceRefs:['source/reference.bin'],
  });
  return {landmarkCage,decision,permit,mesh,glb,proof};
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const keep=args.keep===true;
  const requestedOut=args['out-dir']?path.resolve(args['out-dir']):null;
  const root=requestedOut??await fs.mkdtemp(path.join(os.tmpdir(),'refas-subdivision-dogfood-'));
  if(requestedOut){await fs.rm(root,{recursive:true,force:true});await fs.mkdir(root,{recursive:true});}
  try{
    const sourceBytes=Buffer.from('subdivision cage organic source fixture\n');
    const sourceSha256=digestBytes(sourceBytes);
    const sourcePath=path.join(root,'source','reference.bin');
    await fs.mkdir(path.dirname(sourcePath),{recursive:true});
    await fs.writeFile(sourcePath,sourceBytes);

    const fixture=headFixture(sourceSha256);
    const assetSha256=digestBytes(fixture.glb);
    const assetPath=path.join(root,'model','organic-head.glb');
    await fs.mkdir(path.dirname(assetPath),{recursive:true});
    await fs.writeFile(assetPath,fixture.glb);

    const frame={
      schema:'refas.canonical-object-frame/v1',
      id:'organic-head-frame',
      scopeId:'whole',
      origin:[0,0,0],
      axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},
    };
    const framePath=path.join(root,'model','canonical-frame.json');
    await fs.writeFile(framePath,JSON.stringify(frame,null,2)+'\n');

    const renderDir=path.join(root,'renders','clay');
    const renderer=path.join(SKILL_ROOT,'scripts','render_pbr.py');
    const render=spawnSync(PYTHON,[renderer,'--glb',assetPath,'--out',renderDir,'--frame',framePath,'--size','256','--timeout-seconds','120','--neutral-clay'],{
      cwd:root,encoding:'utf8',timeout:130000,
      env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONHASHSEED:'0',TZ:'UTC'},
    });
    if(render.status!==0) throw new Error(render.stderr||render.stdout||'neutral-clay renderer failed');
    const renderReport=JSON.parse(await fs.readFile(path.join(renderDir,'render-report.json'),'utf8'));
    assert.deepEqual(validatePbrRenderReport(renderReport),{valid:true,errors:[]});
    assert.equal(renderReport.assetSha256,assetSha256);
    for(const viewId of ['hero','side','top']){
      const output=renderReport.outputs.find((item)=>item.viewId===viewId);
      assert.ok(output,`neutral-clay report missing ${viewId}`);
      const bytes=await fs.readFile(path.join(renderDir,path.basename(output.path)));
      assert.equal(digestBytes(bytes),output.sha256);
    }

    const hierarchy=createVisualHierarchy({
      source:{path:'source/reference.bin',sha256:sourceSha256,width:512,height:512},
      nodes:[{id:'whole',label:'Whole organic head',level:'whole',parentId:null,roi:[0,0,1,1]}],
    });
    const signatureSet=createPerceptualSignatureSet({
      hierarchy,scopeId:'whole',sourceSha256,
      signatures:[{
        id:'whole-organic-mass',
        scopeId:'whole',
        family:'mass-proportion',
        importance:'macro',
        sourceObservation:'The source requires a three-dimensional organic head mass with meaningful front/back support.',
        evidenceRefs:['source/reference.bin'],
      }],
      evidenceRefs:['source/reference.bin'],
    });
    const roleSet=createSpatialRoleExpectationSet({
      hierarchy,sourceSha256,
      expectations:[{
        scopeId:'whole',
        role:'volumetric',
        sourceObservation:'The source requires a volumetric organic head rather than a planar card.',
        rationale:'Freeze the whole head as volumetric before candidate classification.',
        evidenceRefs:['source/reference.bin'],
        ambiguity:null,
      }],
    });

    const source={
      schema:'refas.source-manifest/v1',
      id:'primary-reference',
      path:'source/reference.bin',
      sha256:sourceSha256,
      sizeBytes:sourceBytes.length,
      width:512,
      height:512,
      authority:'primary',
      acquisition:{kind:'generated-contract-reference'},
    };
    await initTrustedContractFixtureProject(root,{projectId:'subdivision-cage-dogfood',source,fixtureId:'subdivision-cage-organic'});
    await commitLocal(root,'source-intake',[await writeRef(root,'evidence/source.json',Buffer.from(JSON.stringify({source:true})+'\n'),'source-manifest')]);
    await commitLocal(root,'visual-hierarchy',[await writeRef(root,'evidence/hierarchy.json',Buffer.from(JSON.stringify(hierarchy,null,2)+'\n'),'visual-hierarchy')]);
    await commitLocal(root,'visual-observation',[await writeRef(root,'evidence/observation.json',Buffer.from(JSON.stringify({observation:true})+'\n'),'visual-observation')]);
    await commitLocal(root,'spatial-hypotheses',[
      await writeRef(root,'evidence/spatial.json',Buffer.from(JSON.stringify({spatial:true})+'\n'),'spatial-hypotheses'),
      await writeRef(root,'evidence/spatial-role.json',Buffer.from(JSON.stringify(roleSet,null,2)+'\n'),'spatial-role-expectation'),
    ]);

    const spatialEvidence=createSpatialClosureEvidence({glb:fixture.glb,scopeId:'whole'});
    assert.deepEqual(validateSpatialClosureEvidence(spatialEvidence,{glb:fixture.glb}),{valid:true,errors:[]});
    const classification=await classifySpatialCollapse(root,{glb:fixture.glb,spatialEvidence,scopeId:'whole'});
    assert.equal(classification.frozenRole,'volumetric');
    assert.equal(classification.classification,'NO_PLANAR_COLLAPSE');

    const barrier=createVolumeBarrier({
      sourceSha256,
      hierarchyDigest:hierarchy.hierarchyDigest,
      assetSha256,
      signatureSet,
      classifications:[classification],
    });
    assert.equal(barrier.verdict,'PROCEED');
    assert.deepEqual(validateVolumeBarrier(barrier,{
      sourceSha256,hierarchyDigest:hierarchy.hierarchyDigest,assetSha256,signatureSet,classifications:[classification],
    }),{valid:true,errors:[]});

    const report={
      schema:'refas.subdivision-cage-organic-dogfood/v1',
      status:'PASS',
      assetSha256,
      cageDigest:fixture.mesh.subdivisionCage.cageDigest,
      constructionProofDigest:fixture.proof.proofDigest,
      watertight:fixture.mesh.analysis.watertight,
      triangleCount:fixture.mesh.analysis.triangleCount,
      neutralClay:{
        reportDigest:renderReport.reportDigest,
        requiredViews:['hero','side','top'],
        outputs:renderReport.outputs.filter((item)=>['hero','side','top'].includes(item.viewId)),
      },
      vc01:{evidenceDigest:spatialEvidence.evidenceDigest},
      vc02:{expectationSetDigest:roleSet.expectationSetDigest,role:'volumetric'},
      vc03:{classificationDigest:classification.classificationDigest,classification:classification.classification},
      vc04:{barrierDigest:barrier.barrierDigest,verdict:barrier.verdict},
    };
    await fs.writeFile(path.join(root,'subdivision-cage-dogfood-report.json'),JSON.stringify(report,null,2)+'\n');
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }finally{
    if(!requestedOut&&!keep) await fs.rm(root,{recursive:true,force:true});
  }
}

main().catch((error)=>{process.stderr.write(`Subdivision cage dogfood failed: ${error.stack??error.message}\n`);process.exit(1);});

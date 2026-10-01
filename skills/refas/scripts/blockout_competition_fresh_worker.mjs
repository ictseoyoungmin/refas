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
  const readPublic=async(relative)=>{if(!(relative==='SKILL.md'||relative.startsWith('references/')))throw new Error('non-public read requested: '+relative);reads.push(relative);return fs.readFile(path.join(skillRoot,relative),'utf8');};
  await readPublic('SKILL.md');
  await readPublic('references/INDEX.md');
  await readPublic('references/spatial-reasoning.md');
  const graph=JSON.parse(await readPublic('references/GRAPH.json'));
  const spatial=graph.nodes.find((node)=>node.id==='spatial-reasoning');
  if(!spatial?.interface?.interfaces?.some((entry)=>entry.id==='blockout-competition-decision')) throw new Error('blockout competition decision is not publicly discoverable');

  const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
  const projectRoot=path.join(path.dirname(reportPath),'project');
  await fs.mkdir(projectRoot,{recursive:true});

  const writeRef=async(relative,bytes,kind)=>{
    const absolute=path.join(projectRoot,relative);
    await fs.mkdir(path.dirname(absolute),{recursive:true});
    await fs.writeFile(absolute,bytes);
    return API.contentReference(absolute,{kind,root:projectRoot});
  };
  const commitLocal=(capability,refs)=>API.commitCheckpoint(projectRoot,{
    capability,scopeId:'whole',reason:capability+' blockout competition dogfood',
    artifactRefs:refs,claims:[capability+' dogfood'],
    gates:[{id:capability+'-gate',evidenceRefs:refs.map((ref)=>ref.path)}],
  });

  const sourceBytes=Buffer.from('head asymmetry casebook source fixture\n');
  const sourceRef=await writeRef('source/reference.bin',sourceBytes,'source-image');
  const source={schema:'refas.source-manifest/v1',id:'primary-reference',path:sourceRef.path,sha256:sourceRef.sha256,sizeBytes:sourceRef.sizeBytes,width:512,height:512,authority:'primary',acquisition:{kind:'photo-reference'}};
  await API.initProject(projectRoot,{projectId:'blockout-competition-dogfood',source});
  const intake=await writeRef('model/source-intake.json',Buffer.from('{"source":true}\n'),'source-manifest');
  await commitLocal('source-intake',[intake]);

  const hierarchy=API.createVisualHierarchy({
    source:{path:source.path,sha256:source.sha256,width:source.width,height:source.height},
    nodes:[{id:'whole',label:'Whole head',level:'whole',parentId:null,roi:[0,0,1,1]}],
  });
  const hierarchyRef=await writeRef('model/hierarchy.json',Buffer.from(JSON.stringify(hierarchy,null,2)+'\n'),'visual-hierarchy');
  await commitLocal('visual-hierarchy',[hierarchyRef]);
  const observation=await writeRef('model/observation.json',Buffer.from('{"observation":"three-quarter source has ambiguous object-vs-camera asymmetry"}\n'),'visual-observation');
  await commitLocal('visual-observation',[observation]);

  const roleSet=API.createSpatialRoleExpectationSet({
    hierarchy,sourceSha256:source.sha256,
    expectations:[{scopeId:'whole',role:'volumetric',sourceObservation:'The head carries clear front/back cranial mass despite three-quarter asymmetry.',rationale:'Whole head must remain volumetric while camera and intrinsic asymmetry compete.',evidenceRefs:[source.path],ambiguity:null}],
  });
  const roleRef=await writeRef('model/spatial-role.json',Buffer.from(JSON.stringify(roleSet,null,2)+'\n'),'spatial-role-expectation');
  const hypothesisSet=API.createSpatialHypothesisSet({
    scopeId:'whole',sourceSha256:source.sha256,selectedId:null,
    attestation:{attested:true,evidenceRefs:[source.path]},
    hypotheses:[
      {id:'symmetric-yaw',description:'Near-symmetric cranial blockout with camera yaw explaining the visible three-quarter imbalance.',camera:{projection:'perspective',explanation:'yaw'},hiddenForm:'near-symmetric cranial volume',predictions:{silhouette:'three-quarter silhouette under yaw',occlusion:'far side occluded by projection',sideView:'balanced side mass',topView:'near-symmetric top mass',grazing:'balanced bilateral grazing response'},falsifiers:['Canonical side/top views require intrinsic left/right rest-shape difference.'],evidenceRefs:[source.path],evidenceCoverage:0.7,assumptionCost:0.2,status:'plausible'},
      {id:'baked-asymmetry',description:'Intrinsic object asymmetry is baked into the cranial blockout to match the hero view.',camera:{projection:'perspective',explanation:'near-frontal'},hiddenForm:'intrinsically asymmetric cranial volume',predictions:{silhouette:'hero silhouette directly fitted',occlusion:'geometry carries visible imbalance',sideView:'one side remains fuller',topView:'lateral rest asymmetry remains',grazing:'bilateral grazing response differs'},falsifiers:['Canonical side/top views show the imbalance is explainable by camera alone.'],evidenceRefs:[source.path],evidenceCoverage:0.65,assumptionCost:0.4,status:'plausible'},
    ],
  });
  const hypothesisRef=await writeRef('model/spatial-hypotheses.json',Buffer.from(JSON.stringify(hypothesisSet,null,2)+'\n'),'spatial-hypothesis-set');
  const policy=API.createBlockoutCompetitionPolicy({hierarchy,sourceSha256:source.sha256,mode:'required',scopeIds:['whole']});
  const policyRef=await writeRef('model/blockout-policy.json',Buffer.from(JSON.stringify(policy,null,2)+'\n'),'blockout-competition-policy');
  await commitLocal('spatial-hypotheses',[roleRef,hypothesisRef,policyRef]);

  const box=(depth,offset)=>{
    const hx=.5,hy=.55,hz=depth/2;
    const p=[[-hx+offset,-hy,-hz],[hx+offset,-hy,-hz],[hx+offset,hy,-hz],[-hx+offset,hy,-hz],[-hx+offset,-hy,hz],[hx+offset,-hy,hz],[hx+offset,hy,hz],[-hx+offset,hy,hz]];
    const idx=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
    return API.finalizeMesh(p,idx,{primitive:'blockout-head'});
  };
  const materials={clay:{baseColor:[.58,.58,.58,1],metallic:0,roughness:.78}};
  const makeGlb=(id,depth,offset)=>API.partsToGlb({assetId:id,materials,parts:[{id:'head',scopeId:'whole',role:'head',materialId:'clay',mesh:box(depth,offset)}]});
  const selectedGlb=makeGlb('symmetric-yaw',.7,0);
  const rejectedGlb=makeGlb('baked-asymmetry',.62,.08);
  const selectedRef=await writeRef('model/blockout-symmetric-yaw.glb',selectedGlb,'glb');
  const rejectedRef=await writeRef('model/blockout-baked-asymmetry.glb',rejectedGlb,'glb');

  let missingCompetitionBlocked=false;
  try{await commitLocal('shape-reconstruction',[selectedRef]);}catch(error){missingCompetitionBlocked=/required blockout competition needs exactly one candidate-bound decision/u.test(error.message);}
  if(!missingCompetitionBlocked) throw new Error('required policy did not block shape reconstruction without competition evidence');

  const makeClay=async(id,assetSha256)=>{
    const frameRefs=[];
    for(const viewId of API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS){
      frameRefs.push(await writeRef('renders/'+id+'/'+viewId+'.png',Buffer.from(id+' '+viewId+' neutral clay\n'),'render-frame'));
    }
    const report=API.createPbrRenderReport({
      assetSha256,frameDigest:'c'.repeat(64),
      renderer:{...API.NEUTRAL_CLAY_RENDERER_PROFILE},
      lighting:{rigId:API.NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,digest:API.NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
      colorPipeline:{...API.NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
      materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'],unsupported:['textures']},
      outputs:frameRefs.map((ref,index)=>({viewId:API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index],path:ref.path,sha256:ref.sha256})),
      reproducibility:{mode:'deterministic',tolerance:''},
      presentation:{mode:'neutral-clay',presetId:API.NEUTRAL_CLAY_PRESENTATION_PRESET.id,presetDigest:API.NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
    });
    return {report,frameRefs};
  };
  const selectedClay=await makeClay('symmetric-yaw',selectedRef.sha256);
  const rejectedClay=await makeClay('baked-asymmetry',rejectedRef.sha256);

  const signatureSet=API.createPerceptualSignatureSet({
    hierarchy,scopeId:'whole',sourceSha256:source.sha256,
    signatures:[{id:'cranial-balance',scopeId:'whole',family:'mass-proportion',importance:'identity',sourceObservation:'The visible asymmetry remains compatible with a balanced cranial mass under camera yaw.',evidenceRefs:[source.path]}],
    evidenceRefs:[source.path],
  });
  const signatureEvidence=(assetSha256,clay,status,conclusion)=>API.createPerceptualSignatureEvidence({
    signatureSet,assetSha256,
    observations:[{signatureId:'cranial-balance',status,candidateObservation:conclusion,comparisonConclusion:conclusion,evidenceRefs:[source.path,clay.report.outputs.find((output)=>output.viewId==='side').path,clay.report.outputs.find((output)=>output.viewId==='top').path]}],
    evidenceRefs:[source.path,...clay.report.outputs.filter((output)=>['side','top'].includes(output.viewId)).map((output)=>output.path)],
  });
  const selectedSignature=signatureEvidence(selectedRef.sha256,selectedClay,'match','Side and top clay views preserve the balanced cranial mass while the camera hypothesis explains the hero imbalance.');
  const rejectedSignature=signatureEvidence(rejectedRef.sha256,rejectedClay,'mismatch','Side and top clay views preserve a lateral rest-shape imbalance that is not required by the source evidence.');
  const selectedSpatial=API.createSpatialClosureEvidence({glb:selectedGlb,scopeId:'whole'});
  const rejectedSpatial=API.createSpatialClosureEvidence({glb:rejectedGlb,scopeId:'whole'});
  const roleAuthority=await API.resolveSpatialRoleAuthority(projectRoot,{scopeId:'whole'});

  const candidateInput=[
    {id:'symmetric-yaw',hypothesisId:'symmetric-yaw',assetPath:selectedRef.path,glb:selectedGlb,signatureEvidence:selectedSignature,clayRenderReport:selectedClay.report,spatialEvidence:selectedSpatial},
    {id:'baked-asymmetry',hypothesisId:'baked-asymmetry',assetPath:rejectedRef.path,glb:rejectedGlb,signatureEvidence:rejectedSignature,clayRenderReport:rejectedClay.report,spatialEvidence:rejectedSpatial},
  ];
  let singleCandidateBlocked=false;
  try{
    API.createBlockoutCompetitionDecision({policy,hierarchy,scopeId:'whole',hypothesisSet,roleAuthority,candidates:[candidateInput[0]],selectedCandidateId:'symmetric-yaw',selectionReasons:[],rejections:[],evidenceRefs:[source.path]});
  }catch(error){singleCandidateBlocked=/at least 2 realized candidates/u.test(error.message);}
  if(!singleCandidateBlocked) throw new Error('single realized candidate was not blocked');

  const decision=API.createBlockoutCompetitionDecision({
    policy,hierarchy,scopeId:'whole',hypothesisSet,roleAuthority,candidates:candidateInput,selectedCandidateId:'symmetric-yaw',
    selectionReasons:[
      {kind:'r03-signature',candidateId:'symmetric-yaw',signatureId:'cranial-balance',conclusion:'The selected candidate preserves the source-compatible identity mass across side/top clay views.'},
      {kind:'vc03-classification',candidateId:'symmetric-yaw',conclusion:'VC03 confirms the selected volumetric blockout retains non-planar spatial support.'},
    ],
    rejections:[{candidateId:'baked-asymmetry',reasons:[{kind:'r03-signature',candidateId:'baked-asymmetry',signatureId:'cranial-balance',conclusion:'The rejected candidate bakes the three-quarter imbalance into object-space rest geometry.'}]}],
    evidenceRefs:[source.path,selectedRef.path,rejectedRef.path],
  });
  const decisionRef=await writeRef('reviews/blockout-competition.json',Buffer.from(JSON.stringify(decision,null,2)+'\n'),'blockout-competition-decision');
  await commitLocal('spatial-hypotheses',[selectedRef,rejectedRef,...selectedClay.frameRefs,...rejectedClay.frameRefs,decisionRef]);

  const glbByCandidateId=new Map([['symmetric-yaw',selectedGlb],['baked-asymmetry',rejectedGlb]]);
  const validation=API.validateBlockoutCompetitionDecision(decision,{policy,hierarchy,hypothesisSet,roleAuthority,glbByCandidateId});
  if(!validation.valid) throw new Error('canonical competition decision failed validation: '+validation.errors.join('; '));

  const shape=await commitLocal('shape-reconstruction',[selectedRef]);
  if(shape.capability!=='shape-reconstruction') throw new Error('selected shape candidate was not admitted');

  const tampered=structuredClone(decision);
  tampered.selectedAssetSha256='f'.repeat(64);
  const unsigned=structuredClone(tampered);delete unsigned.decisionDigest;
  tampered.decisionDigest=API.digestJson(unsigned);
  const tamperedValidation=API.validateBlockoutCompetitionDecision(tampered,{policy,hierarchy,hypothesisSet,roleAuthority,glbByCandidateId});
  if(tamperedValidation.valid) throw new Error('re-signed tampered decision was accepted');

  const report={
    schema:'refas.blockout-competition-fresh-worker-report/v1',status:'PASS',installedSkillOnly:true,
    publicReads:[...new Set(reads)].sort(),publicApiEntrypoint:'scripts/lib/index.mjs',
    requiredPolicy:true,missingCompetitionBlocked,singleCandidateBlocked,
    symmetricYawSelected:decision.selectedCandidateId==='symmetric-yaw',
    rejectedCandidateRetained:decision.rejectedCandidateIds.includes('baked-asymmetry'),
    runtimeShapeAdmission:true,tamperedDecisionBlocked:true,
    selectedAssetSha256:decision.selectedAssetSha256,decisionDigest:decision.decisionDigest,
  };
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:'PASS',missingCompetitionBlocked,singleCandidateBlocked,symmetricYawSelected:true,runtimeShapeAdmission:true,tamperedDecisionBlocked:true})+'\n');
}
main().catch((error)=>{process.stderr.write('Blockout competition fresh worker failed: '+(error.stack??error.message)+'\n');process.exit(1);});

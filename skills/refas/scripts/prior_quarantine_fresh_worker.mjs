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
  await readPublic('references/inference-authority.md');
  const graph=JSON.parse(await readPublic('references/GRAPH.json'));
  const spatial=graph.nodes.find((node)=>node.id==='spatial-reasoning');
  if(!spatial?.interface?.interfaces?.some((entry)=>entry.id==='prior-quarantine')) throw new Error('prior quarantine is not publicly discoverable');

  const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
  const projectRoot=path.join(path.dirname(reportPath),'project');
  await fs.mkdir(projectRoot,{recursive:true});
  const writeRef=async(relative,bytes,kind)=>{
    const absolute=path.join(projectRoot,relative);await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,bytes);
    return API.contentReference(absolute,{kind,root:projectRoot});
  };
  const commitLocal=(capability,refs)=>API.commitCheckpoint(projectRoot,{
    capability,scopeId:'whole',reason:capability+' prior quarantine dogfood',artifactRefs:refs,
    claims:[capability+' dogfood'],gates:[{id:capability+'-gate',evidenceRefs:refs.map((ref)=>ref.path)}],
  });

  const sourceBytes=Buffer.from('real single-view source reference\n');
  const sourceRef=await writeRef('source/reference.bin',sourceBytes,'source-image');
  const source={schema:'refas.source-manifest/v1',id:'primary-reference',path:sourceRef.path,sha256:sourceRef.sha256,sizeBytes:sourceRef.sizeBytes,width:512,height:512,authority:'primary',acquisition:{kind:'photo-reference'}};
  await API.initProject(projectRoot,{projectId:'prior-quarantine-dogfood',source});
  const intake=await writeRef('model/source-intake.json',Buffer.from('{"source":true}\n'),'source-manifest');
  await commitLocal('source-intake',[intake]);

  const hierarchy=API.createVisualHierarchy({source:{path:source.path,sha256:source.sha256,width:512,height:512},nodes:[{id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]}]});
  const hierarchyRef=await writeRef('model/hierarchy.json',Buffer.from(JSON.stringify(hierarchy,null,2)+'\n'),'visual-hierarchy');
  await commitLocal('visual-hierarchy',[hierarchyRef]);
  const observationRef=await writeRef('model/observation.json',Buffer.from('{"observation":"hidden side is unresolved"}\n'),'visual-observation');
  await commitLocal('visual-observation',[observationRef]);

  const rawPriorRef=await writeRef('priors/novel-view-generator-input.bin',Buffer.from('external novel-view generator prior input\n'),'prior-raw');
  const generatedSideRef=await writeRef('priors/generated-side.png',Buffer.from('deterministic inferred side-view pixels\n'),'prior-derived-view');
  const quarantine=API.createPriorQuarantine({
    id:'generated-side-prior',sourceSha256:source.sha256,kind:'novel-view',authority:'inferred',
    rawPrior:{path:rawPriorRef.path,sha256:rawPriorRef.sha256,role:'novel-view-generator-input',sourceEvidenceEligible:false},
    derivedArtifacts:[{path:generatedSideRef.path,sha256:generatedSideRef.sha256,role:'generated-side-hypothesis',sourceEvidenceEligible:false}],
    transferable:['landmark-correspondence'],
    stripped:['vertex-proportions','shape-keys','modifiers','materials'],
    semanticCorrespondences:[{sourceScopeId:'whole',priorSemanticId:'whole-side',method:'declared-semantic-id',evidenceRefs:[source.path]}],
    evidenceRefs:[source.path],
  });
  const quarantineRef=await writeRef('model/prior-quarantine.json',Buffer.from(JSON.stringify(quarantine,null,2)+'\n'),'prior-quarantine');
  const roleSet=API.createSpatialRoleExpectationSet({
    hierarchy,sourceSha256:source.sha256,
    expectations:[{scopeId:'whole',role:'volumetric',sourceObservation:'Visible source silhouette implies a volumetric object.',rationale:'VC02 remains real-source grounded.',evidenceRefs:[source.path],ambiguity:null}],
  });
  const roleRef=await writeRef('model/spatial-role.json',Buffer.from(JSON.stringify(roleSet,null,2)+'\n'),'spatial-role-expectation');
  const hypothesisSet=API.createSpatialHypothesisSet({
    scopeId:'whole',sourceSha256:source.sha256,selectedId:null,attestation:{attested:true,evidenceRefs:[source.path]},
    hypotheses:[
      {id:'source-facing-only',description:'Least-committed hidden side.',camera:{projection:'perspective'},hiddenForm:'unknown side',predictions:{silhouette:'source silhouette',occlusion:'source occlusion',sideView:'unresolved',topView:'unresolved',grazing:'unresolved'},falsifiers:['Generated or observed side evidence contradicts it.'],evidenceRefs:[source.path],evidenceCoverage:.5,assumptionCost:.15,status:'plausible'},
      {id:'generated-side-hypothesis',description:'Generated side view used only as an inferred hidden-form hypothesis.',camera:{projection:'perspective'},hiddenForm:'inferred from quarantined novel view',predictions:{silhouette:'source silhouette retained',occlusion:'compatible occlusion',sideView:'generated side hypothesis',topView:'interpolated hidden top',grazing:'test inferred depth'},falsifiers:['Real source or multiview evidence contradicts generated hidden form.'],evidenceRefs:[generatedSideRef.path],evidenceCoverage:.55,assumptionCost:.35,status:'plausible'},
    ],
  });
  const hypothesisRef=await writeRef('model/spatial-hypotheses.json',Buffer.from(JSON.stringify(hypothesisSet,null,2)+'\n'),'spatial-hypothesis-set');
  await commitLocal('spatial-hypotheses',[rawPriorRef,generatedSideRef,quarantineRef,roleRef,hypothesisRef]);

  const authority=await API.resolvePriorQuarantineAuthority(projectRoot);
  if(authority.records.length!==1||authority.records[0].kind!=='novel-view') throw new Error('prior quarantine authority did not resolve');

  let vc02LeakBlocked=false;
  const leakedRole=API.createSpatialRoleExpectationSet({
    hierarchy,sourceSha256:source.sha256,
    expectations:[{scopeId:'whole',role:'volumetric',sourceObservation:'Generated side is incorrectly promoted.',rationale:'adversarial leak',evidenceRefs:[source.path,generatedSideRef.path],ambiguity:null}],
  });
  const leakedRoleRef=await writeRef('model/leaked-spatial-role.json',Buffer.from(JSON.stringify(leakedRole,null,2)+'\n'),'spatial-role-expectation');
  try{await commitLocal('spatial-hypotheses',[leakedRoleRef]);}catch(error){vc02LeakBlocked=/quarantined prior-derived evidence as source authority/u.test(error.message);}
  if(!vc02LeakBlocked) throw new Error('VC02 accepted quarantined prior-derived source evidence');

  const materials={clay:{baseColor:[.5,.5,.5,1],metallic:0,roughness:.8}};
  const mesh=API.createCylinder({radius:.5,height:1,segments:12,role:'body'});
  const candidate=API.partsToGlb({assetId:'prior-dogfood-candidate',materials,parts:[{id:'body',scopeId:'whole',role:'body',materialId:'clay',mesh}]});
  const candidateRef=await writeRef('model/candidate.glb',candidate,'glb');
  const fakeEarly={schema:'refas.early-resemblance-barrier/v1',assetSha256:candidateRef.sha256,signatureEvidence:{signatureSet:{evidenceRefs:[generatedSideRef.path],signatures:[{id:'bad',evidenceRefs:[generatedSideRef.path]}]}}};
  const fakeEarlyRef=await writeRef('model/fake-early.json',Buffer.from(JSON.stringify(fakeEarly,null,2)+'\n'),'early-resemblance-barrier');
  let r03LeakBlocked=false;
  try{await commitLocal('shape-reconstruction',[candidateRef,fakeEarlyRef]);}catch(error){r03LeakBlocked=/quarantined prior-derived evidence as source authority/u.test(error.message);}
  if(!r03LeakBlocked) throw new Error('R03 path accepted quarantined prior-derived source evidence');

  let certificationLeakBlocked=false;
  try{API.assertNoQuarantinedSourceEvidence({comparisonAssessment:{evidenceRefs:[generatedSideRef.path]}},new Set([generatedSideRef.path]),{label:'whole-object certification'});}
  catch(error){certificationLeakBlocked=/quarantined prior-derived evidence as source authority/u.test(error.message);}
  if(!certificationLeakBlocked) throw new Error('certification source evidence leak was not blocked');

  const report={
    schema:'refas.prior-quarantine-fresh-worker-report/v1',status:'PASS',installedSkillOnly:true,
    publicReads:[...new Set(reads)].sort(),publicApiEntrypoint:'scripts/lib/index.mjs',
    generatedNovelViewUsedAsInferredHypothesis:hypothesisSet.hypotheses.some((h)=>h.evidenceRefs.includes(generatedSideRef.path)),
    vc02RealSourceOnly:roleSet.expectations[0].evidenceRefs.length===1&&roleSet.expectations[0].evidenceRefs[0]===source.path,
    vc02LeakBlocked,r03LeakBlocked,certificationLeakBlocked,
    quarantineDigest:quarantine.quarantineDigest,authorityDigest:authority.authorityDigest,
  };
  await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:'PASS',generatedNovelViewUsedAsInferredHypothesis:true,vc02LeakBlocked,r03LeakBlocked,certificationLeakBlocked})+'\n');
}
main().catch((error)=>{process.stderr.write('Prior quarantine fresh worker failed: '+(error.stack??error.message)+'\n');process.exit(1);});

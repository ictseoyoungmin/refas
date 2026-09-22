#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i=0;i<argv.length;i+=1) {
    const token=argv[i];
    if(!token.startsWith('--')) continue;
    const key=token.slice(2);
    const next=argv[i+1];
    if(next && !next.startsWith('--')) { out[key]=next; i+=1; }
    else out[key]=true;
  }
  return out;
}

const options=parseArgs(process.argv.slice(2));
const skillRoot=path.resolve(String(options['skill-root'] ?? path.resolve('skills/refas')));
const projectRoot=path.resolve(String(options.project ?? path.join(process.cwd(),'vc08-project')));
const scenario=String(options.scenario ?? '');
const refasCli=path.join(skillRoot,'scripts','refas.mjs');
const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
const started=Date.now();
let firstMultiviewMs=null;
const transcript={
  schema:'refas.vc08-adversarial-worker-transcript/v1',
  scenario,
  executionMode:'deterministic-adversarial-public-worker',
  publicBoundary:true,
  publicReads:[],
  describeQueries:[],
  attemptedBypasses:[],
  observations:[],
};

function recordUnique(list,value){ if(!list.includes(value)) list.push(value); }
async function readPublic(relative){
  if(!(relative==='SKILL.md'||relative.startsWith('references/')||relative.startsWith('assets/templates/'))) {
    throw new Error(`VC08 worker may read only public skill guidance/templates: ${relative}`);
  }
  const value=await fs.readFile(path.join(skillRoot,relative),'utf8');
  recordUnique(transcript.publicReads,relative);
  return value;
}
function describe(namespace,id){
  const result=spawnSync(process.execPath,[refasCli,'describe',namespace,id],{cwd:skillRoot,encoding:'utf8'});
  if(result.status!==0) throw new Error(`describe ${namespace} ${id} failed: ${String(result.stderr||result.stdout).trim()}`);
  const parsed=JSON.parse(String(result.stdout).trim());
  transcript.describeQueries.push(`${namespace}:${id}`);
  return parsed;
}
async function write(relative,bytes){
  const target=path.join(projectRoot,relative);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,bytes);
  return target;
}
async function writeJson(relative,value){
  return write(relative,`${JSON.stringify(value,null,2)}\n`);
}
async function ref(relative,kind){
  return API.contentReference(path.join(projectRoot,relative),{kind,root:projectRoot});
}
function boxMesh(depth=1){
  const hx=.5,hy=.6,hz=depth/2;
  const p=[
    [-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
    [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],
  ];
  const idx=[
    0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
    3,7,6,3,6,2,0,4,7,3,0,7,1,2,6,1,6,5,
  ];
  return API.finalizeMesh(p,idx,{primitive:'vc08-adversarial-box',depth});
}
function candidateGlb({depth=1,variant='base'}={}){
  return API.partsToGlb({
    assetId:`vc08-${scenario}-${variant}`,
    name:`VC08 ${scenario} ${variant}`,
    parts:[{id:'model-node',scopeId:'whole',materialId:'fixture',role:'whole',mesh:boxMesh(depth)}],
    materials:{fixture:{baseColor:[.62,.66,.72,1],metallic:.05,roughness:.7}},
    extras:{vc08Scenario:scenario,variant},
  });
}
async function genericCheckpoint(capability,label=capability){
  const relative=`model/${label}.bin`;
  await write(relative,Buffer.from(`vc08:${scenario}:${label}\n`));
  const artifact=await ref(relative,'model-spec');
  return API.commitCheckpoint(projectRoot,{
    capability,scopeId:'whole',reason:`VC08 ${scenario} ${capability} public-boundary checkpoint`,
    artifactRefs:[artifact],claims:[`${capability} exercised by VC08`],
    gates:[{id:`${capability}-gate`,evidenceRefs:[artifact.path]}],
  });
}
async function initBase({role='volumetric',depth=1}={}){
  await fs.rm(projectRoot,{recursive:true,force:true});
  await fs.mkdir(projectRoot,{recursive:true});
  const sourceBytes=Buffer.from('VC08 adversarial reference bytes\n');
  await write('source/reference.bin',sourceBytes);
  const source={
    schema:'refas.source-manifest/v1',
    id:'primary-reference',
    path:'source/reference.bin',
    sha256:API.digestBytes(sourceBytes),
    sizeBytes:sourceBytes.length,
    width:256,height:256,authority:'primary',
    acquisition:{kind:'user-provided-reference'},
  };
  await API.initProject(projectRoot,{projectId:`vc08-${scenario}`,source});
  await genericCheckpoint('source-intake','source-intake');

  const hierarchy=API.createVisualHierarchy({
    source:{path:source.path,sha256:source.sha256,width:source.width,height:source.height},
    nodes:[{id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]}],
  });
  await writeJson('model/visual-hierarchy.json',hierarchy);
  const hierarchyRef=await ref('model/visual-hierarchy.json','visual-hierarchy');
  await API.commitCheckpoint(projectRoot,{
    capability:'visual-hierarchy',scopeId:'whole',reason:'VC08 hierarchy authority',
    artifactRefs:[hierarchyRef],claims:['whole hierarchy frozen'],
    gates:[{id:'visual-hierarchy-gate',evidenceRefs:[hierarchyRef.path]}],
  });
  await genericCheckpoint('visual-observation','visual-observation');

  const roleSet=API.createSpatialRoleExpectationSet({
    hierarchy,sourceSha256:source.sha256,
    expectations:[{
      scopeId:'whole',role,
      sourceObservation:`VC08 source pre-binds the whole as ${role} before candidate evaluation.`,
      rationale:'VC08 freezes spatial semantics before adversarial candidate geometry is inspected.',
      evidenceRefs:[source.path],
      ambiguity:role==='unresolved'?'VC08 unresolved control intentionally preserves ambiguity.':null,
    }],
  });
  await writeJson('model/spatial-role.json',roleSet);
  const roleRef=await ref('model/spatial-role.json','spatial-role-expectation');
  await writeJson('model/spatial.json',{scenario,role});
  const spatialRef=await ref('model/spatial.json','spatial-hypotheses');
  const spatialCheckpoint=await API.commitCheckpoint(projectRoot,{
    capability:'spatial-hypotheses',scopeId:'whole',reason:'VC08 freezes VC02 authority before reconstruction',
    artifactRefs:[spatialRef,roleRef],claims:['VC02 frozen before candidate'],
    gates:[{id:'spatial-hypotheses-gate',evidenceRefs:[spatialRef.path,roleRef.path]}],
  });

  const glb=candidateGlb({depth});
  await write('model/candidate.glb',glb);
  const asset=await ref('model/candidate.glb','glb');

  const clayFrames=[];
  for(const viewId of API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS){
    const relative=`renders/clay/${viewId}.png`;
    await write(relative,Buffer.from(`VC08 ${scenario} formal neutral-clay ${viewId}\n`));
    clayFrames.push(await ref(relative,'render-frame'));
  }
  firstMultiviewMs=Date.now()-started;
  const hero=clayFrames.find((item)=>item.path==='renders/clay/hero.png');
  const signatureSet=API.createPerceptualSignatureSet({
    hierarchy,scopeId:'whole',sourceSha256:source.sha256,
    signatures:[{
      id:'whole-form',scopeId:'whole',family:'silhouette-character',importance:'macro',
      sourceObservation:'VC08 adversarial source has one identity-bearing whole silhouette.',
      evidenceRefs:[source.path],
    }],
    evidenceRefs:[source.path],
  });
  const signatureEvidence=API.createPerceptualSignatureEvidence({
    signatureSet,assetSha256:asset.sha256,
    observations:[{
      signatureId:'whole-form',status:'match',
      candidateObservation:'The adversarial candidate can match the hero silhouette even when orthogonal support may collapse.',
      comparisonConclusion:'Hero resemblance is intentionally allowed to coexist with independent spatial contradiction testing.',
      evidenceRefs:[source.path,hero.path],
    }],
    evidenceRefs:[source.path,hero.path],
  });
  const clayReport=API.createPbrRenderReport({
    assetSha256:asset.sha256,frameDigest:'9'.repeat(64),
    renderer:{...API.NEUTRAL_CLAY_RENDERER_PROFILE},
    lighting:{rigId:API.NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,digest:API.NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
    colorPipeline:{...API.NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'],unsupported:['textures']},
    outputs:clayFrames.map((frame,index)=>({viewId:API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index],path:frame.path,sha256:frame.sha256})),
    reproducibility:{mode:'deterministic',tolerance:''},
    presentation:{mode:'neutral-clay',presetId:API.NEUTRAL_CLAY_PRESENTATION_PRESET.id,presetDigest:API.NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
  });
  await writeJson('renders/clay/render-report.json',clayReport);
  const reportRef=await ref('renders/clay/render-report.json','render-report');
  const early=API.createEarlyResemblanceBarrier({
    sourceSha256:source.sha256,hierarchyDigest:hierarchy.hierarchyDigest,assetSha256:asset.sha256,
    signatureEvidence,clayRenderReport:clayReport,evidenceRefs:[source.path,hero.path],
  });
  if(early.verdict!=='PROCEED') throw new Error(`VC08 setup expected early resemblance PROCEED, got ${early.verdict}`);
  await writeJson('reviews/early-resemblance-barrier.json',early);
  const earlyRef=await ref('reviews/early-resemblance-barrier.json','early-resemblance-barrier');

  const spatialEvidence=API.createSpatialClosureEvidence({glb,scopeId:'whole'});
  await writeJson('reviews/spatial-closure-whole.json',spatialEvidence);
  const evidenceRef=await ref('reviews/spatial-closure-whole.json','spatial-closure-evidence');
  const classification=await API.classifySpatialCollapse(projectRoot,{glb,spatialEvidence,scopeId:'whole'});
  await writeJson('reviews/spatial-collapse-whole.json',classification);
  const classRef=await ref('reviews/spatial-collapse-whole.json','spatial-collapse-classification');
  const barrier=API.createVolumeBarrier({
    sourceSha256:source.sha256,hierarchyDigest:hierarchy.hierarchyDigest,assetSha256:asset.sha256,
    signatureSet,classifications:[classification],
  });
  await writeJson('reviews/volume-barrier.json',barrier);
  const barrierRef=await ref('reviews/volume-barrier.json','volume-barrier');
  const shapeRefs=[asset,earlyRef,reportRef,...clayFrames,evidenceRef,classRef,barrierRef];
  const shapeCheckpoint=await API.commitCheckpoint(projectRoot,{
    capability:'shape-reconstruction',scopeId:'whole',reason:'VC08 adversarial shape-stage authority',
    artifactRefs:shapeRefs,claims:['hero resemblance and spatial authority remain independent'],
    gates:[{id:'shape-reconstruction-gate',evidenceRefs:shapeRefs.map((item)=>item.path)}],
  });
  return {source,hierarchy,roleSet,spatialCheckpoint,shapeCheckpoint,glb,asset,clayReport,classification,barrier};
}

async function advanceAfterShape({mutate=false}={}){
  await genericCheckpoint('surface-topology','surface-topology');
  await genericCheckpoint('assembly','assembly');
  if(!mutate){
    await genericCheckpoint('appearance','appearance');
  } else {
    const authority=await API.resolveAuthoritativeCandidateLineage(projectRoot);
    const state=await API.loadProject(projectRoot);
    const changed=candidateGlb({depth:1,variant:'appearance-mutated'});
    await write('model/candidate.glb',changed);
    const output=await ref('model/candidate.glb','glb');
    const transition=API.createCandidateTransition({
      inputAssetSha256:authority.finalCandidate.assetSha256,
      outputAssetSha256:output.sha256,
      inputCandidateCheckpointId:authority.finalCandidate.checkpointId,
      parentCheckpointId:state.head,
      capability:'appearance',scopeId:'whole',
      evidenceRefs:[output.path],
    });
    await writeJson('model/appearance-candidate-transition.json',transition);
    const transitionRef=await ref('model/appearance-candidate-transition.json','candidate-transition');
    await API.commitCheckpoint(projectRoot,{
      capability:'appearance',scopeId:'whole',reason:'VC08 mutates final candidate digest after shape stage',
      artifactRefs:[output,transitionRef],claims:['candidate mutation is lineage-bound'],
      gates:[{id:'appearance-gate',evidenceRefs:[output.path,transitionRef.path]}],
    });
  }
  await genericCheckpoint('rendering','rendering');
  return genericCheckpoint('visual-critique','visual-critique');
}

async function scenarioPlanar(){
  const setup=await initBase({role:'volumetric',depth:.002});
  transcript.attemptedBypasses.push('planar/billboard shortcut with formally complete neutral-clay multiview');
  let blocked=null;
  try{ await genericCheckpoint('surface-topology','surface-topology-planar-attempt'); }
  catch(error){ blocked=error.message; }
  if(!blocked) throw new Error('planar shortcut unexpectedly advanced past VC04');
  const authority=await API.resolveTrustedSpatialGateAuthority(projectRoot);
  if(setup.classification.classification!=='PLANAR_COLLAPSE'||setup.barrier.verdict!=='REWORK'||authority.gateStatus!=='fail'){
    throw new Error('planar shortcut did not resolve to PLANAR_COLLAPSE/REWORK/fail');
  }
  return {classification:setup.classification.classification,barrier:setup.barrier.verdict,gateStatus:authority.gateStatus,downstreamBlocked:true,blockReason:blocked};
}

async function scenarioRelabel(){
  const setup=await initBase({role:'volumetric',depth:.002});
  transcript.attemptedBypasses.push('post-failure thin-shell relabel');
  const forgedRole=API.createSpatialRoleExpectationSet({
    hierarchy:setup.hierarchy,sourceSha256:setup.source.sha256,
    expectations:[{
      scopeId:'whole',role:'thin-shell',
      sourceObservation:'Adversarial worker attempts to reinterpret failed candidate as thin shell after inspection.',
      rationale:'This object is deliberately authored after candidate failure and must not replace frozen VC02 authority.',
      evidenceRefs:[setup.source.path],ambiguity:null,
    }],
  });
  await writeJson('reviews/adversarial-relabel.json',forgedRole);
  const frozen=await API.resolveSpatialRoleAuthority(projectRoot,{scopeId:'whole'});
  const evidence=API.createSpatialClosureEvidence({glb:setup.glb,scopeId:'whole'});
  const replay=await API.classifySpatialCollapse(projectRoot,{glb:setup.glb,spatialEvidence:evidence,scopeId:'whole'});
  if(frozen.selectedExpectation.role!=='volumetric'||replay.classification!=='PLANAR_COLLAPSE'){
    throw new Error('post-failure role relabel changed frozen VC02 authority');
  }
  return {attemptedRole:'thin-shell',frozenRole:frozen.selectedExpectation.role,replayedClassification:replay.classification,bypassAccepted:false};
}

async function scenarioSelfPass(){
  const setup=await initBase({role:'volumetric',depth:.002});
  transcript.attemptedBypasses.push('caller-authored gate status pass + forged trusted authority/continuity files');
  let callerStatusRejected=false;
  try{
    API.normalizeCheckpointGateRequests('whole-object-certification',API.REQUIRED_CLOSURE_GATE_IDS.map((id)=>(
      id==='spatial-plausibility'?{id,status:'pass',evidenceRefs:['model/candidate.glb']}:{id,evidenceRefs:['model/candidate.glb']}
    )));
  }catch(error){
    callerStatusRejected=/runtime-authoritative/u.test(error.message);
  }
  await writeJson('reviews/forged-spatial-gate-authority.json',{
    schema:'refas.trusted-spatial-gate-authority/v1',issuer:'caller',gateStatus:'pass',authorityDigest:'f'.repeat(64),
  });
  await writeJson('reviews/forged-final-spatial-continuity.json',{
    schema:'refas.final-spatial-continuity/v1',verdict:'PROCEED',continuityDigest:'e'.repeat(64),
    finalCandidate:{assetSha256:setup.asset.sha256},
  });
  const authority=await API.resolveTrustedSpatialGateAuthority(projectRoot);
  if(!callerStatusRejected||authority.gateStatus!=='fail') throw new Error('self-authored PASS bypass was not rejected');
  return {callerStatusRejected,forgedFilesConsulted:false,runtimeGateStatus:authority.gateStatus};
}

async function scenarioStaleEvidence(){
  await initBase({role:'volumetric',depth:1});
  await advanceAfterShape({mutate:true});
  transcript.attemptedBypasses.push('reuse shape-stage VC01/VC03 after changed final candidate digest');
  const authority=await API.resolveAuthoritativeCandidateLineage(projectRoot);
  let blocked=null;
  try{ await API.resolveFinalSpatialContinuity(projectRoot); }
  catch(error){ blocked=error.message; }
  if(!blocked||!/fresh VC01 evidence/u.test(blocked)) throw new Error(`stale evidence reuse was not blocked as expected: ${blocked}`);
  return {
    shapeCandidateSha256:authority.initialCandidate.assetSha256,
    finalCandidateSha256:authority.finalCandidate.assetSha256,
    candidateChanged:authority.initialCandidate.assetSha256!==authority.finalCandidate.assetSha256,
    staleReuseBlocked:true,blockReason:blocked,
  };
}

async function scenarioSiblingLeak(){
  await initBase({role:'volumetric',depth:1});
  const badHead=await advanceAfterShape({mutate:true});
  transcript.attemptedBypasses.push('selected bad lineage attempts to inherit fresh spatial evidence from current sibling head');

  const state=await API.loadProject(projectRoot);
  const checkpoints=await API.listCheckpoints(projectRoot);
  const rendering=checkpoints.filter((cp)=>cp.capability==='rendering').at(-1);
  if(!rendering) throw new Error('VC08 sibling scenario missing rendering checkpoint');
  await API.restoreCheckpoint(projectRoot,rendering.id,{reason:'VC08 create sibling with fresh final spatial evidence'});
  const glb=await fs.readFile(path.join(projectRoot,'model','candidate.glb'));
  const spatialEvidence=API.createSpatialClosureEvidence({glb,scopeId:'whole'});
  await writeJson('reviews/final-spatial-closure-whole.json',spatialEvidence);
  const evidenceRef=await ref('reviews/final-spatial-closure-whole.json','spatial-closure-evidence');
  const classification=await API.classifySpatialCollapse(projectRoot,{glb,spatialEvidence,scopeId:'whole'});
  await writeJson('reviews/final-spatial-collapse-whole.json',classification);
  const classRef=await ref('reviews/final-spatial-collapse-whole.json','spatial-collapse-classification');
  await write('model/visual-critique-sibling.bin',Buffer.from('vc08 sibling with fresh final spatial evidence\n'));
  const genericRef=await ref('model/visual-critique-sibling.bin','model-spec');
  const goodHead=await API.commitCheckpoint(projectRoot,{
    capability:'visual-critique',scopeId:'whole',reason:'VC08 sibling carries fresh final spatial evidence',
    artifactRefs:[genericRef,evidenceRef,classRef],claims:['fresh final spatial evidence only on sibling'],
    gates:[{id:'visual-critique-gate',evidenceRefs:[genericRef.path]}],
  });
  let selectedBlocked=null;
  try{ await API.resolveFinalSpatialContinuity(projectRoot,{checkpointId:badHead.id}); }
  catch(error){ selectedBlocked=error.message; }
  if(!selectedBlocked||!/fresh VC01 evidence/u.test(selectedBlocked)) throw new Error(`selected sibling lineage leaked current-head authority: ${selectedBlocked}`);
  return {badSelectedCheckpointId:badHead.id,currentSiblingCheckpointId:goodHead.id,currentHeadDiffers:true,selectedLineageBlocked:true,blockReason:selectedBlocked,previousHead:state.head};
}

async function scenarioHeroFormal(){
  const setup=await initBase({role:'volumetric',depth:.002});
  transcript.attemptedBypasses.push('hero-only fit plus formally complete multiview files');
  const outputIds=setup.clayReport.outputs.map((item)=>item.viewId);
  const complete=API.NEUTRAL_CLAY_REQUIRED_VIEW_IDS.every((id)=>outputIds.includes(id));
  let blocked=null;
  try{ await genericCheckpoint('surface-topology','surface-topology-hero-formal'); }
  catch(error){ blocked=error.message; }
  if(!complete||!blocked||setup.barrier.verdict!=='REWORK') throw new Error('formal multiview existence overrode spatial contradiction');
  return {formalMultiviewComplete:complete,viewCount:outputIds.length,heroCanMatch:true,classification:setup.classification.classification,barrier:setup.barrier.verdict,downstreamBlocked:true};
}

async function scenarioVolumetricPositive(){
  const setup=await initBase({role:'volumetric',depth:1});
  const downstream=await genericCheckpoint('surface-topology','surface-topology-positive');
  const authority=await API.resolveTrustedSpatialGateAuthority(projectRoot);
  if(setup.classification.classification!=='NO_PLANAR_COLLAPSE'||setup.barrier.verdict!=='PROCEED'||authority.gateStatus!=='pass'){
    throw new Error('volumetric positive was falsely rejected');
  }
  return {classification:setup.classification.classification,barrier:setup.barrier.verdict,gateStatus:authority.gateStatus,downstreamCheckpointId:downstream.id,falsePositive:false};
}

async function scenarioThinPositive(){
  const setup=await initBase({role:'thin-shell',depth:.002});
  const downstream=await genericCheckpoint('surface-topology','surface-topology-thin-positive');
  const frozen=await API.resolveSpatialRoleAuthority(projectRoot,{scopeId:'whole'});
  if(setup.classification.classification!=='NOT_APPLICABLE'||setup.barrier.verdict!=='PROCEED'||frozen.selectedExpectation.role!=='thin-shell'){
    throw new Error('legitimate thin-shell semantics were rejected');
  }
  return {frozenRole:frozen.selectedExpectation.role,classification:setup.classification.classification,barrier:setup.barrier.verdict,downstreamCheckpointId:downstream.id,thinSemanticsPreserved:true};
}

await readPublic('SKILL.md');
await readPublic('references/INDEX.md');
await readPublic('references/spatial-reasoning.md');
describe('node','spatial-reasoning');
describe('capability','whole-object-certification');

const handlers={
  'planar-billboard':scenarioPlanar,
  'thin-shell-relabel':scenarioRelabel,
  'self-authored-pass':scenarioSelfPass,
  'stale-evidence-reuse':scenarioStaleEvidence,
  'sibling-lineage-leakage':scenarioSiblingLeak,
  'hero-only-formal-multiview':scenarioHeroFormal,
  'volumetric-positive':scenarioVolumetricPositive,
  'intentionally-thin-positive':scenarioThinPositive,
};
if(!(scenario in handlers)) throw new Error(`unknown VC08 adversarial scenario: ${scenario}`);
const result=await handlers[scenario]();
transcript.status='PASS';
transcript.firstMultiviewMs=firstMultiviewMs;
transcript.elapsedMs=Date.now()-started;
transcript.result=result;
await writeJson('reports/vc08-worker-transcript.json',transcript);
process.stdout.write(`${JSON.stringify(transcript)}\n`);

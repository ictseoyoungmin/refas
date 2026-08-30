#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CAPABILITY_ORDER,
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  REQUIRED_VISIBLE_FORM_GATES,
  assessCertification,
  auditProject,
  certifyProject,
  commitCheckpoint,
  contentReference,
  createConstructionQuality,
  createRealizedProjection,
  createReferenceGeometry,
  createReferenceRegistration,
  createSpatialHypothesisSet,
  createVisualHierarchy,
  createVisualReview,
  initProject,
  inspectGlb,
  parseGlb,
  sha256File,
  validateRealizedProjection,
  validateConstructionQuality,
} from '../../skills/refas/scripts/lib/index.mjs';
import {buildArticulatedFigure} from './model.mjs';

const EXAMPLE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(EXAMPLE, '../..');
const SCRIPTS = path.join(REPOSITORY, 'skills/refas/scripts');
const OUTPUT = path.join(EXAMPLE, 'output');
const PROJECT = path.join(OUTPUT, 'project');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

const sourceArg = process.argv.find((value) => value.startsWith('--source='))?.slice(9)
  ?? (process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : null)
  ?? process.env.REFAS_ARTICULATED_SOURCE;
if (!sourceArg) throw new Error('Use --source PATH or REFAS_ARTICULATED_SOURCE for the independent raw reference.');

function python(script, args, timeout = 180_000) {
  const result = spawnSync(PYTHON, [script, ...args], {
    cwd: REPOSITORY, encoding: 'utf8', timeout,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${path.basename(script)} failed`);
  if (result.stdout) process.stdout.write(result.stdout);
}
async function json(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
async function refs(files, kind = 'artifact') {
  return Promise.all(files.map((file) => contentReference(file, {kind, root: PROJECT})));
}
async function close(capability, files, claim) {
  return commitCheckpoint(PROJECT, {
    capability, scopeId: 'whole', reason: claim,
    artifactRefs: await refs(files), claims: [claim],
    gates: [{id: `${capability}-acceptance`, status: 'pass', evidenceRefs: files.map((file) => path.relative(PROJECT, file).split(path.sep).join('/'))}],
  });
}

async function main() {
  const sourceBytes = await fs.readFile(path.resolve(sourceArg));
  await fs.rm(OUTPUT, {recursive: true, force: true});
  const sourcePath = path.join(PROJECT, 'source/reference.png');
  await fs.mkdir(path.dirname(sourcePath), {recursive: true});
  await fs.writeFile(sourcePath, sourceBytes);
  const manifestPath = path.join(PROJECT, 'source/source-manifest.json');
  python(path.join(SCRIPTS, 'source_manifest.py'), [
    '--root', PROJECT, '--image', sourcePath, '--id', 'articulated-figure-reference', '--out', manifestPath,
    '--acquisition', JSON.stringify({kind: 'user-upload', note: 'Source retained outside repository; redistribution not authorized.'}),
  ]);
  const source = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  await initProject(PROJECT, {projectId: 'articulated-figure-dogfood', source});
  await close('source-intake', [sourcePath, manifestPath], 'Independent raw-reference bytes and acquisition limits are digest-bound.');

  const hierarchy = createVisualHierarchy({
    source: {path: source.path, sha256: source.sha256, width: source.width, height: source.height},
    nodes: [
      {id:'whole',label:'Whole articulated figure',level:'whole',parentId:null,roi:[0,0,1,1],status:'observed'},
      {id:'body',label:'Torso and pelvis',level:'region',parentId:'whole',roi:[.34,.08,.32,.53],status:'observed'},
      {id:'hanging-arm',label:'Long hanging arm',level:'part',parentId:'whole',roi:[.22,.27,.25,.48],status:'observed'},
      {id:'resting-arm',label:'Arm returning to the face and neck',level:'part',parentId:'whole',roi:[.48,.26,.29,.31],status:'observed'},
      {id:'kneeling-leg',label:'Grounded kneeling leg',level:'part',parentId:'whole',roi:[.25,.52,.30,.44],status:'observed'},
      {id:'raised-leg',label:'Raised horizontal thigh and planted foot',level:'part',parentId:'whole',roi:[.46,.47,.39,.39],status:'observed'},
      {id:'knee-cutaway',label:'Visible knee joint cutaway',level:'feature',parentId:'kneeling-leg',roi:[.32,.76,.17,.18],status:'observed'},
    ],
  });
  const hierarchyPath = await json(path.join(PROJECT, 'model/visual-hierarchy.json'), hierarchy);
  await close('visual-hierarchy', [hierarchyPath, sourcePath], 'Whole-to-feature ownership preserves the asymmetric pose and visible joint cutaway.');

  const observationsPath = await json(path.join(PROJECT, 'model/observations.json'), {
    schema:'refas.articulated-observations/v1', sourceSha256:source.sha256,
    facts:['Head turns down and away from the torso axis.','One arm hangs beside the seat while the opposite forearm rises diagonally and the hand touches the lower face or neck.','Both thighs sit nearly horizontal on the support and both shins descend toward planted feet.','The kneeling knee exposes a recessed joint through a rimmed cutaway.'],
    interpretations:['Section-profile wooden shells and recessed dark joints carry the mannequin identity.'],
    ambiguities:['Hidden rear joint hardware and exact lens calibration remain inferred.'],
    evidenceRefs:['source/reference.png'],
  });
  await close('visual-observation', [observationsPath, sourcePath], 'Visible pose, mass, cutaway, and contact facts are separated from hidden-form inference.');

  const spatial = createSpatialHypothesisSet({
    scopeId:'whole', sourceSha256:source.sha256, selectedId:'moderate-perspective-local-pivots',
    attestation:{attested:true,evidenceRefs:['source/reference.png']},
    hypotheses:[
      {id:'moderate-perspective-local-pivots',description:'Moderate perspective with every limb articulated through parent-local pivots.',camera:{projection:'perspective',fovY:31},hiddenForm:'Symmetric rear shell depth behind observed section profiles.',predictions:{silhouette:'Seated forward lean and bilateral planted feet remain legible.',occlusion:'Raised forearm overlaps the lower face while the hanging hand clears the seat.',sideView:'Joint shells retain real depth.',topView:'Both thighs advance from the pelvis toward the viewer.',grazing:'Section breaks and cutaway rims remain visible.'},falsifiers:['A planted foot separates from its ankle in the hero view.'],evidenceRefs:['source/reference.png'],evidenceCoverage:.94,assumptionCost:.2,status:'selected-candidate'},
      {id:'flat-long-lens',description:'Near-orthographic flattened mannequin.',camera:{projection:'perspective',fovY:12},hiddenForm:'Minimal depth inferred from overlap.',predictions:{silhouette:'Pose compresses.',occlusion:'Hand and knee flatten together.',sideView:'Shell depth collapses.',topView:'Thigh depth is ambiguous.',grazing:'Cutaways lose depth.'},falsifiers:['Visible joint recesses and foreshortened raised leg require depth.'],evidenceRefs:['source/reference.png'],evidenceCoverage:.55,assumptionCost:.48,status:'falsified'},
    ],
  });
  const spatialPath = await json(path.join(PROJECT, 'model/spatial-hypotheses.json'), spatial);
  await close('spatial-hypotheses', [spatialPath], 'The depth-bearing local-pivot hypothesis beats the flattened long-lens alternative.');

  const referenceFigure = buildArticulatedFigure('reference');
  const neutralFigure = buildArticulatedFigure('neutral');
  assert.equal(parseGlb(referenceFigure.glb).binary.equals(parseGlb(neutralFigure.glb).binary), true);
  const assetPath = path.join(PROJECT, 'assets/articulated-figure.glb');
  const neutralPath = path.join(PROJECT, 'assets/articulated-figure-neutral.glb');
  await fs.mkdir(path.dirname(assetPath), {recursive:true});
  await fs.writeFile(assetPath, referenceFigure.glb);
  await fs.writeFile(neutralPath, neutralFigure.glb);
  const inspection = inspectGlb(referenceFigure.glb);
  assert.equal(inspection.valid, true);
  assert.ok(inspection.triangleCount >= 12_500);
  const shapePath = await json(path.join(PROJECT, 'model/shape-spec.json'), {schema:'refas.articulated-shape/v1',sourceSha256:source.sha256,partCount:referenceFigure.parts.length,triangleCount:inspection.triangleCount,identityFeatures:['section-profile chest','bilateral pectoral breaks','pelvis band and hip cups','rimmed recessed joints','separated-finger hands','wedge planted foot'],evidenceRefs:['source/reference.png','assets/articulated-figure.glb']});
  await close('shape-reconstruction', [assetPath, shapePath], 'Source-specific section profiles replace generic blockout masses.');
  const topologyPath = await json(path.join(PROJECT, 'model/topology-spec.json'), {schema:'refas.articulated-topology/v1',partCount:referenceFigure.parts.length,triangleCount:inspection.triangleCount,checks:{closedCaps:true,consistentWinding:true,facetsConcentratedAtIdentityFeatures:true}});
  await close('surface-topology', [assetPath, topologyPath], 'Closed lofts and corrected cap winding preserve readable faceted planes.');
  const assemblyPath = await json(path.join(PROJECT, 'model/assembly-spec.json'), {schema:'refas.articulated-assembly/v1',localMeshBytesInvariant:true,poseVariants:['reference','neutral'],checks:{parentLocalPivots:true,ankleConnected:true,raisedFootPlanted:true,kneeCutawayVisible:true}});
  await close('assembly', [assetPath, neutralPath, assemblyPath], 'Reference and neutral poses share immutable local meshes and articulate through parent-local pivots.');
  const appearancePath = await json(path.join(PROJECT, 'model/appearance-spec.json'), {schema:'refas.articulated-appearance/v1',materials:['light wood','end grain','dark joint recess'],requiredPbrFeatures:['base-color-factor','metallic-factor','roughness-factor']});
  await close('appearance', [assetPath, appearancePath], 'Wood shells, end-grain rims, and dark joint recesses remain materially distinct.');

  const framePath = await json(path.join(PROJECT, 'model/canonical-frame.json'), {schema:'refas.canonical-object-frame/v1',id:'articulated-figure-frame',scopeId:'whole',origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]},scopeParts:[],hero:{position:[1.15,2.35,14.6],target:[0,2.35,0],up:[0,1,0],fovY:31,registrationDigest:'a'.repeat(64)}});
  const portableDir = path.join(PROJECT, 'renders/portable');
  const pbrDir = path.join(PROJECT, 'renders/pbr');
  python(path.join(SCRIPTS,'render_glb.py'), ['--glb',assetPath,'--out',portableDir,'--reference',sourcePath,'--frame',framePath,'--size','480','--timeout-seconds','150','--max-working-mb','1024']);
  python(path.join(SCRIPTS,'render_pbr.py'), [
    '--glb',assetPath,'--out',pbrDir,'--reference',sourcePath,'--frame',framePath,
    '--size','480','--timeout-seconds','150','--max-working-mb','1024',
    '--background','244,242,236','--exposure','0.6',
    '--key-intensity','2.8','--fill-intensity','1.4','--rim-intensity','0.5',
  ]);
  const portableReportPath = path.join(portableDir,'render-report.json');
  const pbrReportPath = path.join(pbrDir,'render-report.json');
  const portable = JSON.parse(await fs.readFile(portableReportPath,'utf8'));
  const pbr = JSON.parse(await fs.readFile(pbrReportPath,'utf8'));
  assert.equal(portable.frames.length,8); assert.equal(pbr.outputs.length,8);
  const pbrBoardPath = path.join(pbrDir,'pbr-review-board.png');
  await close('rendering', [assetPath,portableReportPath,path.join(portableDir,'multiview-review-board.png'),pbrReportPath,pbrBoardPath,...pbr.outputs.map((o)=>path.join(PROJECT,o.path))], 'Actual portable and independent PBR renders cover all eight diagnostic views.');

  const anchorData = [
    ['head-center',[.53,.17],'head-shell'],['ribcage-base',[.48,.43],'ribcage-shell'],['pelvis-center',[.45,.59],'pelvis-shell'],
    ['kneeling-knee',[.39,.61],'kneeling-leg-knee-joint'],['raised-knee',[.68,.61],'raised-leg-knee-joint'],['raised-ankle',[.76,.82],'raised-leg-ankle-joint'],
    ['hanging-wrist',[.36,.57],'hanging-arm-wrist-joint'],['resting-wrist',[.50,.35],'resting-arm-wrist-joint'],
  ];
  const geometry = createReferenceGeometry({scopeId:'whole',sourceSha256:source.sha256,anchors:anchorData.map(([id,xy,,],i)=>({id,xy,importance:i<3?'macro':'identity',visibility:'visible',confidence:.86,evidenceRefs:['source/reference.png'],semanticRole:id})),dimensions:[{id:'head-to-pelvis',importance:'macro',evidenceRefs:['source/reference.png'],aAnchorId:'head-center',bAnchorId:'pelvis-center',kind:'distance'}],attestation:{attested:true,evidenceRefs:['source/reference.png']}});
  const geometryPath = await json(path.join(PROJECT,'model/reference-geometry.json'),geometry);
  const hero = portable.frames.find((f)=>f.path==='hero.png');
  const realized = createRealizedProjection({referenceGeometry:geometry,glb:referenceFigure.glb,cameraHypothesisId:'moderate-perspective-local-pivots',camera:hero.camera,anchorBindings:anchorData.map(([id,,nodeId])=>({referenceId:id,nodeId,localPoint:[0,0,0]})),evidenceRefs:['assets/articulated-figure.glb','renders/portable/hero.png']});
  assert.equal(validateRealizedProjection(realized).valid,true);
  const realizedPath = await json(path.join(PROJECT,'model/realized-projection.json'),realized);
  const registration = createReferenceRegistration({parentFrameId:'whole-source-frame',childFrameId:'hero-render-frame',parentSourceSha256:source.sha256,childSourceSha256:hero.sha256,model:'projective-homography',correspondences:[['tl',[.22,.06],[.27,.08]],['tr',[.84,.06],[.85,.08]],['br',[.84,.94],[.85,.95]],['bl',[.22,.94],[.27,.95]]].map(([id,parent,child])=>({id,parent,child,evidenceRefs:['source/reference.png','renders/portable/hero.png']})),attestation:{attested:true,evidenceRefs:['source/reference.png','renders/portable/hero.png']},ambiguities:['Registration normalizes framing only; realized projection owns geometry measurements.']});
  const registrationPath = await json(path.join(PROJECT,'model/source-to-render-registration.json'),registration);
  const comparisonInput = await json(path.join(PROJECT,'registered-comparison-input.json'),{schema:'refas.registered-comparison-input/v1',sourceManifest:'source/source-manifest.json',renderReport:'renders/portable/render-report.json',renderImage:'hero.png',frameId:'hero',registration:'model/source-to-render-registration.json',hierarchy:'model/visual-hierarchy.json',scopeIds:['whole'],overlayOpacity:.5,projectionEvidence:[{scopeId:'whole',referenceGeometry:'model/reference-geometry.json',realizedProjection:'model/realized-projection.json'}]});
  const comparisonDir = path.join(PROJECT,'reviews/registered-comparison');
  python(path.join(SCRIPTS,'compare_registered.py'), ['--input',comparisonInput,'--out',comparisonDir]);
  const comparisonReportPath = path.join(comparisonDir,'comparison-report.json');
  const comparisonReport = JSON.parse(await fs.readFile(comparisonReportPath, 'utf8'));
  const comparisonRef = await contentReference(comparisonReportPath, {kind:'registered-comparison', root:PROJECT});
  const portableReportRef = await contentReference(portableReportPath, {kind:'render-report', root:PROJECT});
  const portableHeroRef = await contentReference(path.join(PROJECT, 'renders/portable/hero.png'), {kind:'render-frame', root:PROJECT});
  const constructionQuality = createConstructionQuality({
    scopeId:'whole', sourceSha256:source.sha256, assetSha256:await sha256File(assetPath), claim:'identity-bearing',
    constructionFamilies:['landmark-cage','section-profile-loft','transition-surface','local-pivot-assembly'],
    visibleFormGates:REQUIRED_VISIBLE_FORM_GATES.map((id)=>({id,status:'pass',evidenceRefs:['reviews/registered-comparison/whole/comparison-board.png','renders/pbr/pbr-review-board.png'],summary:`${id} directly inspected against the independent reference.`})),
    identityFeatures:[
      {id:'section-profile-torso',scopeId:'whole',kind:'principal-section',evidenceRefs:['source/reference.png','reviews/registered-comparison/whole/comparison-board.png']},
      {id:'joint-cutaway-rims',scopeId:'whole',kind:'negative-space',evidenceRefs:['source/reference.png','renders/pbr/pbr-review-board.png']},
      {id:'articulated-contact-pose',scopeId:'whole',kind:'landmark-cage',evidenceRefs:['source/reference.png','reviews/registered-comparison/whole/comparison-board.png']},
    ],
    wholeDependency:{scopeId:'whole',status:'pass',evidenceRefs:['reviews/registered-comparison/whole/comparison-board.png']},
    registeredComparison:{path:'reviews/registered-comparison/comparison-report.json',sha256:await sha256File(comparisonReportPath),scopeIds:['whole']},
    ambiguities:['Hidden rear joint hardware remains inferred.'],
  });
  assert.equal(validateConstructionQuality(constructionQuality).valid,true);
  const constructionQualityPath = await json(path.join(PROJECT,'reviews/construction-quality.json'),constructionQuality);
  const findingsPath = await json(path.join(PROJECT,'reviews/findings.json'),{schema:'refas.finding-ledger/v1',sourceSha256:source.sha256,assetSha256:await sha256File(assetPath),resolved:[{category:'attachment-mismatch',resolution:'Raised ankle enlarged and wedge foot connected at the planted contact.'},{category:'proportion-mismatch',resolution:'Horizontal thigh, long hanging arm, and crouched silhouette aligned to the source.'},{category:'curvature-mismatch',resolution:'Torso and pelvis rebuilt as section-profile lofts with identity-bearing plane breaks.'}],unresolvedBlocking:[{category:'mass-proportion-mismatch',scopeId:'whole',severity:'major',summary:'The corrected seated pose is source-directed, but the realized render remains narrower than the source across the torso/support and retains a blocking macro projection residual.',evidenceRefs:['source/reference.png','reviews/registered-comparison/comparison-report.json','reviews/registered-comparison/whole/comparison-board.png']}],unresolvedNonBlocking:[{category:'microdetail',scopeId:'whole',severity:'minor',summary:'Hidden rear hardware remains inferred.'}],critiqueOrder:['source-and-camera','silhouette','mass-and-curvature','attachment-and-occlusion','surface-topology','appearance','microdetail']});
  await close('visual-critique', [findingsPath,constructionQualityPath,geometryPath,realizedPath,registrationPath,comparisonReportPath,path.join(comparisonDir,'whole/comparison-board.png'),pbrBoardPath], 'Direct source comparison records the corrected pose candidate while retaining the unresolved macro mass finding for recovery.');

  const assetSha256 = await sha256File(assetPath);
  const reviewObservation = (id) => ({sourceObservation:`The source ${id} evidence was inspected in the raw reference and whole-context comparison.`,renderObservation:`The current ${id} PBR render was inspected alongside the registered comparison board.`,comparisonConclusion:`The ${id} view agrees on the source-directed pose/contact features, while the whole-object mass relationship remains unresolved.`,evidenceRefs:[`renders/pbr/${id}.png`,'reviews/registered-comparison/whole/comparison-board.png']});
  const review = createVisualReview({scopeId:'whole',sourceSha256:source.sha256,assetSha256,evidenceClass:'independent-reference',verdict:'insufficient',views:REQUIRED_REVIEW_VIEW_IDS.map((id)=>({id,status:'pass',evidenceRefs:[`renders/pbr/${id}.png`,'reviews/registered-comparison/whole/comparison-board.png'],observation:reviewObservation(id),summary:`${id} inspected for pose, joint continuity, section-profile mass, and contact.`})),gateVerdicts:REQUIRED_VISUAL_GATE_IDS.map((id)=>({id,status:'pass',evidenceRefs:['reviews/registered-comparison/whole/comparison-board.png','renders/pbr/pbr-review-board.png'],observation:reviewObservation(id),summary:`${id} inspected against the source-bound evidence; overall review remains insufficient while the macro finding is open.`})),unresolvedFindings:[{category:'mass-proportion-mismatch',scopeId:'whole',severity:'major',summary:'The source-directed seated pose is improved, but the realized model still has a blocking macro mass/projection mismatch.',evidenceRefs:['source/reference.png','reviews/registered-comparison/whole/comparison-board.png']}],registeredComparison:{path:'reviews/registered-comparison/comparison-report.json',sha256:comparisonRef.sha256,comparisonDigest:comparisonReport.comparisonDigest,sourceSha256:comparisonReport.source.sha256,sourceManifestSha256:comparisonReport.source.manifestSha256,assetSha256:comparisonReport.render.assetSha256,renderReportPath:'renders/portable/render-report.json',renderReportSha256:comparisonReport.render.reportSha256,framePath:'renders/portable/hero.png',frameSha256:comparisonReport.render.frameSha256,registrationDigest:comparisonReport.registration.digest,hierarchyDigest:comparisonReport.hierarchy.digest,inputDigest:comparisonReport.inputDigest,scopeIds:comparisonReport.scopes.map((scope)=>scope.scopeId)},comparisonAssessment:{sourceObservation:'The raw source whole object and all source-visible macro obligations were inspected.',renderObservation:'The current registered portable hero and independent PBR multiview were inspected.',comparisonConclusion:'The seated pose, face/hand contact, support, and grounded leg intent are improved, but the whole source/render mass relationship is not yet resolved.',evidenceRefs:['source/reference.png','reviews/registered-comparison/comparison-report.json','reviews/registered-comparison/whole/comparison-board.png'],contradictionResolution:{status:'unresolved',explanation:'The remaining macro projection disagreement is retained as a typed mass-proportion finding and blocks certification.',evidenceRefs:['reviews/registered-comparison/comparison-report.json','reviews/registered-comparison/whole/comparison-board.png'],findingRefs:['mass-proportion-mismatch']}},renderer:{kind:'independent-pbr',family:pbr.renderer.family,reportRef:'renders/pbr/render-report.json',reportSha256:await sha256File(pbrReportPath),independentProcess:true,claimScope:pbr.claimScope,supportedMaterialFeatures:pbr.materialSupport.supported,unsupportedMaterialFeatures:pbr.materialSupport.unsupported},requiredMaterialFeatures:['base-color-factor','metallic-factor','roughness-factor'],attestation:{attested:true,evidenceRefs:['source/reference.png','reviews/registered-comparison/whole/comparison-board.png','renders/pbr/pbr-review-board.png']}});
  const reviewPath = await json(path.join(PROJECT,'reviews/visual-review.json'),review);
  const closurePath = await json(path.join(PROJECT,'reviews/closure-gates.json'),REQUIRED_CLOSURE_GATE_IDS.map((id)=>({id,status:'pass',evidenceRefs:[REQUIRED_VISUAL_GATE_IDS.includes(id)?'reviews/visual-review.json':id==='project-audit'?'.refas/project.json':'source/source-manifest.json']})));
  const certificationRefs = [
    await contentReference(assetPath,{kind:'glb',root:PROJECT}),
    await contentReference(geometryPath,{kind:'reference-geometry',root:PROJECT}),
    await contentReference(realizedPath,{kind:'realized-projection',root:PROJECT}),
    await contentReference(reviewPath,{kind:'visual-review',root:PROJECT}),
    await contentReference(pbrReportPath,{kind:'render-report',root:PROJECT}),
    portableReportRef, portableHeroRef, comparisonRef,
    ...await refs(pbr.outputs.map((o)=>path.join(PROJECT,o.path)),'render-frame'),
    await contentReference(constructionQualityPath,{kind:'construction-quality',root:PROJECT}),
    await contentReference(neutralPath,{kind:'pose-variant',root:PROJECT}),
    await contentReference(closurePath,{kind:'closure-gates',root:PROJECT}),
  ];
  await commitCheckpoint(PROJECT,{capability:'whole-object-certification',scopeId:'whole',reason:'Independent source-bound visual evidence and reproducible geometry are complete.',artifactRefs:certificationRefs,claims:['The reconstructed articulated figure is visually source-specific and remains editable through local pivots.'],gates:REQUIRED_CLOSURE_GATE_IDS.map((id)=>({id,status:'pass',evidenceRefs:[REQUIRED_VISUAL_GATE_IDS.includes(id)?'reviews/visual-review.json':'source/source-manifest.json']}))});
  const readiness = await assessCertification(PROJECT);
  if (!readiness.ready) {
    // This fixture intentionally keeps the source/render mismatch visible so
    // the hardening path can demonstrate a refused false closure. Do not
    // publish a certification checkpoint when upstream projection evidence is
    // blocking; retain all comparison boards and reports as recovery evidence.
    await json(path.join(OUTPUT,'dogfood-summary.json'),{schema:'refas.dogfood-summary/v1',status:'PASS',projectId:'articulated-figure-dogfood',sourceSha256:source.sha256,assetSha256,parts:referenceFigure.parts.length,triangles:inspection.triangleCount,certified:false,certification:'REFUSED_BLOCKING_SOURCE_RENDER_DISAGREEMENT',readinessErrors:readiness.errors,registeredComparison:path.relative(OUTPUT,path.join(comparisonDir,'whole/comparison-board.png')),pbrBoard:path.relative(OUTPUT,pbrBoardPath)});
    console.log(JSON.stringify({status:'PASS',certified:false,certification:'REFUSED_BLOCKING_SOURCE_RENDER_DISAGREEMENT',errors:readiness.errors},null,2));
    return;
  }
  await certifyProject(PROJECT);
  assert.equal((await auditProject(PROJECT)).valid,true);
  assert.deepEqual(CAPABILITY_ORDER.length,11);
  await json(path.join(OUTPUT,'dogfood-summary.json'),{schema:'refas.dogfood-summary/v1',status:'PASS',projectId:'articulated-figure-dogfood',sourceSha256:source.sha256,assetSha256,parts:referenceFigure.parts.length,triangles:inspection.triangleCount,localMeshInvariant:true,visualCorrections:['attached planted wedge foot','larger readable ankle joint','rimmed recessed knee cutaway','section-profile torso and pelvis','asymmetric source pose'],registeredComparison:path.relative(OUTPUT,path.join(comparisonDir,'whole/comparison-board.png')),pbrBoard:path.relative(OUTPUT,pbrBoardPath)});
  console.log(JSON.stringify({status:'PASS',parts:referenceFigure.parts.length,triangles:inspection.triangleCount,certified:true},null,2));
}

main().catch((error)=>{ console.error(error.stack || error.message); process.exitCode=1; });

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CAPABILITY_ORDER,
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  assessCertification,
  auditProject,
  certifyProject,
  classifySpatialCollapse,
  commitCheckpoint,
  contentReference,
  createPbrRenderReport,
  createEarlyResemblanceBarrier,
  createFinalResemblanceClosure,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  createSpatialClosureEvidence,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  createVolumeBarrier,
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  createRealizedProjection,
  createReferenceGeometry,
  createRelationalDiscrepancy,
  createRelationalStructure,
  createSegmentPrism,
  createSemanticAuthoritySet,
  createVisualReview,
  createWholeSystemRelationalBarrier,
  digestBytes,
  digestJson,
  initProject,
  partsToGlb,
  resolveAuthoritativeCandidateLineage,
  resolveTrustedSpatialGateAuthority,
  checkpointGatePolicy,
  normalizeCheckpointGateRequests,
  resumeProject,
} from '../skills/refas/scripts/lib/index.mjs';
import {initTrustedContractFixtureProject} from '../skills/refas/scripts/lib/contract-fixture-project.mjs';

const CONTRACT_FIXTURES = new Set(['test-fixture','deterministic-project-fixture','synthetic-test-fixture']);

async function json(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

async function makeProject(t, acquisitionKind='user-provided-reference') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-projection-cert-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  await fs.mkdir(path.join(root, 'source'), {recursive:true});
  const sourceBytes = Buffer.from('real reference bytes\n');
  const sourcePath = path.join(root, 'source', 'reference.bin');
  await fs.writeFile(sourcePath, sourceBytes);
  const source = {
    schema:'refas.source-manifest/v1', id:'primary-reference', path:'source/reference.bin',
    sha256:digestBytes(sourceBytes), sizeBytes:sourceBytes.length, width:256, height:256,
    authority:'primary', acquisition:{kind:acquisitionKind},
  };
  if (CONTRACT_FIXTURES.has(acquisitionKind)) {
    await initTrustedContractFixtureProject(root, {projectId:'projection-cert-study', source, fixtureId:'projection-cert-contract'});
  } else {
    await initProject(root, {projectId:'projection-cert-study', source});
  }
  return {root, source};
}

async function advanceToReview(root, source, {
  projection='none',
  spatialRole='volumetric',
  candidateThickness=0.08,
  expectedSpatialClassification='NO_PLANAR_COLLAPSE',
  expectedVolumeVerdict='PROCEED',
  stopAfterShape=false,
}={}) {
  const file = path.join(root, 'model', 'state.bin');
  await fs.mkdir(path.dirname(file), {recursive:true});
  let hierarchy = null;

  for (const capability of CAPABILITY_ORDER) {
    if (capability === 'whole-object-certification') break;

    if (capability === 'visual-hierarchy') {
      hierarchy = createVisualHierarchy({
        source:{path:source.path,sha256:source.sha256,width:source.width,height:source.height},
        nodes:[{id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]}],
      });
      const hierarchyPath = await json(path.join(root,'model','visual-hierarchy.json'), hierarchy);
      const hierarchyRef = await contentReference(hierarchyPath,{kind:'visual-hierarchy',root});
      await commitCheckpoint(root,{
        capability,scopeId:'whole',reason:'visual-hierarchy fixture is trustworthy',
        artifactRefs:[hierarchyRef],claims:['visual-hierarchy closed'],
        gates:[{id:'visual-hierarchy-gate',evidenceRefs:[hierarchyRef.path]}],
      });
      continue;
    }

    if (capability === 'spatial-hypotheses') {
      if (!hierarchy) throw new Error('VC02 migration fixture requires visual hierarchy before spatial hypotheses');
      const spatialPath = path.join(root,'model','spatial-role.json');
      const roleSet = createSpatialRoleExpectationSet({
        hierarchy,
        sourceSha256: source.sha256,
        expectations: [{
          scopeId:'whole',
          role:spatialRole,
          sourceObservation:`The certification fixture source pre-binds the whole object as ${spatialRole}.`,
          rationale:'Freeze volumetric role before candidate reconstruction so VC03/VC04 cannot relabel it afterward.',
          evidenceRefs:[source.path],
          ambiguity:spatialRole==='unresolved'?'The source does not resolve whole-object depth for this fixture.':null,
        }],
      });
      await json(spatialPath, roleSet);
      const roleRef = await contentReference(spatialPath,{kind:'spatial-role-expectation',root});
      const spatialStatePath = path.join(root,'model','spatial.json');
      await json(spatialStatePath,{spatial:true});
      const spatialRef = await contentReference(spatialStatePath,{kind:'spatial-hypotheses',root});
      await commitCheckpoint(root,{
        capability,scopeId:'whole',reason:'spatial-hypotheses fixture freezes VC02 role authority',
        artifactRefs:[spatialRef,roleRef],claims:['spatial-hypotheses closed with frozen role'],
        gates:[{id:'spatial-hypotheses-gate',evidenceRefs:[spatialRef.path,roleRef.path]}],
      });
      continue;
    }

    if (capability === 'shape-reconstruction') {
      if (!hierarchy) throw new Error('R04 migration fixture requires visual hierarchy before shape');
      const assetPath = path.join(root,'model','candidate.glb');
      const glb = mannequinGlb(projection === 'bad' ? 4 : 0, candidateThickness);
      await fs.writeFile(assetPath,glb);
      const asset = await contentReference(assetPath,{kind:'glb',root});
      const clayFrames = [];
      for (const viewId of NEUTRAL_CLAY_REQUIRED_VIEW_IDS) {
        const clayPath = path.join(root,'renders','clay',`${viewId}.png`);
        await fs.mkdir(path.dirname(clayPath),{recursive:true});
        await fs.writeFile(clayPath,Buffer.from(`neutral clay ${viewId} frame\n`));
        clayFrames.push(await contentReference(clayPath,{kind:'render-frame',root}));
      }
      const clayHero = clayFrames.find((frame)=>frame.path==='renders/clay/hero.png');

      const signatureSet = createPerceptualSignatureSet({
        hierarchy,scopeId:'whole',sourceSha256:source.sha256,
        signatures:[{
          id:'whole-form',scopeId:'whole',family:'silhouette-character',importance:'macro',
          sourceObservation:'The projection certification fixture establishes its whole-form identity before downstream detail.',
          evidenceRefs:[source.path],
        }],
        evidenceRefs:[source.path],
      });
      const signatureEvidence = createPerceptualSignatureEvidence({
        signatureSet,assetSha256:asset.sha256,
        observations:[{
          signatureId:'whole-form',status:'match',
          candidateObservation:'The candidate is the exact shape checkpoint GLB reviewed for this certification fixture.',
          comparisonConclusion:'This fixture explicitly authorizes downstream detail so projection certification can test its own authority.',
          evidenceRefs:[source.path,clayHero.path],
        }],
        evidenceRefs:[source.path,clayHero.path],
      });
      const clayReport = createPbrRenderReport({
        assetSha256:asset.sha256,frameDigest:'9'.repeat(64),
        renderer:{family:'other',name:'RefAs Independent PBR',version:'1.0.0',backend:'numpy-cook-torrance-headless',independentProcess:true},
        lighting:{rigId:NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,digest:NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
        colorPipeline:{...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
        materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'],unsupported:['textures']},
        outputs:clayFrames.map((frame,index)=>({viewId:NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index],path:frame.path,sha256:frame.sha256})),
        reproducibility:{mode:'deterministic',tolerance:''},
        presentation:{mode:'neutral-clay',presetId:NEUTRAL_CLAY_PRESENTATION_PRESET.id,presetDigest:NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
      });
      const clayReportPath = await json(path.join(root,'renders','clay','render-report.json'),clayReport);
      const clayReportRef = await contentReference(clayReportPath,{kind:'render-report',root});
      const earlyBarrier = createEarlyResemblanceBarrier({
        sourceSha256:source.sha256,hierarchyDigest:hierarchy.hierarchyDigest,assetSha256:asset.sha256,
        signatureEvidence,clayRenderReport:clayReport,evidenceRefs:[source.path,clayHero.path],
      });
      assert.equal(earlyBarrier.verdict,'PROCEED');
      const barrierPath = await json(path.join(root,'reviews','early-resemblance-barrier.json'),earlyBarrier);
      const barrierRef = await contentReference(barrierPath,{kind:'early-resemblance-barrier',root});

      const spatialEvidence = createSpatialClosureEvidence({glb,scopeId:'whole'});
      const spatialEvidencePath = await json(path.join(root,'reviews','spatial-closure-whole.json'),spatialEvidence);
      const spatialEvidenceRef = await contentReference(spatialEvidencePath,{kind:'spatial-closure-evidence',root});
      const classification = await classifySpatialCollapse(root,{glb,spatialEvidence,scopeId:'whole'});
      assert.equal(classification.classification,expectedSpatialClassification);
      const classificationPath = await json(path.join(root,'reviews','spatial-collapse-whole.json'),classification);
      const classificationRef = await contentReference(classificationPath,{kind:'spatial-collapse-classification',root});
      const volumeBarrier = createVolumeBarrier({
        sourceSha256:source.sha256,
        hierarchyDigest:hierarchy.hierarchyDigest,
        assetSha256:asset.sha256,
        signatureSet,
        classifications:[classification],
      });
      assert.equal(volumeBarrier.verdict,expectedVolumeVerdict);
      const volumeBarrierPath = await json(path.join(root,'reviews','volume-barrier.json'),volumeBarrier);
      const volumeBarrierRef = await contentReference(volumeBarrierPath,{kind:'volume-barrier',root});

      const shapeRefs=[asset,barrierRef,clayReportRef,...clayFrames,spatialEvidenceRef,classificationRef,volumeBarrierRef];
      await commitCheckpoint(root,{
        capability,scopeId:'whole',reason:'shape-reconstruction fixture carries R04/VC04 spatial authority',
        artifactRefs:shapeRefs,claims:['shape-reconstruction closed with resemblance and volume authority'],
        gates:[{id:'shape-reconstruction-gate',evidenceRefs:shapeRefs.map((ref)=>ref.path)}],
      });
      if(stopAfterShape) return;
      continue;
    }

    await fs.writeFile(file, Buffer.from(`trusted:${capability}\n`));
    const artifact = await contentReference(file, {kind:'model-spec', root});
    await commitCheckpoint(root, {
      capability, scopeId:'whole', reason:`${capability} fixture is trustworthy`,
      artifactRefs:[artifact], claims:[`${capability} closed`],
      gates:[{id:`${capability}-gate`, evidenceRefs:[artifact.path]}],
    });
  }
}

function mannequinGlb(x=0, thickness=0.08) {
  const mesh = createSegmentPrism({start:[-.1,0,0], end:[.1,0,0], width:.08, height:thickness, upHint:[0,1,0]});
  return partsToGlb({
    parts:[{id:'model-node', scopeId:'whole', materialId:'wood', mesh, translation:[x,0,0]}],
    materials:{wood:{baseColor:[.7,.55,.35,1], metallic:0, roughness:.7}},
  });
}

function sourceGeometry(source) {
  return createReferenceGeometry({
    scopeId:'whole', sourceSha256:source.sha256,
    anchors:[{id:'whole-center', xy:[.5,.5], importance:'macro', visibility:'visible', confidence:1, evidenceRefs:['source/reference.bin']}],
    attestation:{attested:true, evidenceRefs:['source/reference.bin']},
  });
}

async function appendRelationalCertificationEvidence(root, source, asset, refs) {
  const structure = createRelationalStructure({
    scopeId:'whole', sourceSha256:source.sha256, basisRefs:['source/reference.bin'],
    entities:[
      {id:'span-left-a',kind:'landmark'}, {id:'span-right-a',kind:'landmark'},
      {id:'span-left-b',kind:'landmark'}, {id:'span-right-b',kind:'landmark'},
    ],
    relations:[{
      id:'whole-span-ratio', kind:'distance-ratio', scope:'whole-system', importance:'identity',
      entityIds:['span-left-a','span-right-a','span-left-b','span-right-b'], range:[0.9,1.1],
      basisRefs:['source/reference.bin'],
    }],
  });
  const authority = createSemanticAuthoritySet({
    scopeId:'whole', sourceSha256:source.sha256, targetSchema:structure.schema, targetDigest:structure.structureDigest,
    entries:[{
      id:'whole-span-authority', subjectId:'whole-span-ratio', authority:'observed',
      proposition:'The two visible whole-object spans are approximately equal.',
      basis:[{kind:'source-evidence',ref:'source/reference.bin'}],
    }],
  });
  const discrepancy = createRelationalDiscrepancy({
    relationalStructure:structure, candidateAssetSha256:asset.sha256,
    observations:[{relationId:'whole-span-ratio',value:1,evidenceRefs:['reviews/registered-comparison/comparison-report.json']}],
  });
  const barrier = createWholeSystemRelationalBarrier({
    relationalStructure:structure, authoritySet:authority,
    relationChecks:discrepancy.checks.map(({relationId,status,evidenceRefs})=>({relationId,status,evidenceRefs})),
  });
  const documents = [
    ['model/relational-structure.json',structure,'relational-structure'],
    ['model/semantic-authority.json',authority,'semantic-authority'],
    ['model/whole-system-relational-barrier.json',barrier,'whole-system-relational-barrier'],
    ['model/relational-discrepancy.json',discrepancy,'relational-discrepancy'],
  ];
  for (const [relative,value,kind] of documents) {
    const file = await json(path.join(root,relative),value);
    refs.push(await contentReference(file,{kind,root}));
  }
}

async function appendFinalCandidateAuthority(root, source, asset, refs) {
  const hierarchy = JSON.parse(await fs.readFile(path.join(root,'model','visual-hierarchy.json'),'utf8'));
  const authority = await resolveAuthoritativeCandidateLineage(root);
  assert.equal(authority.finalCandidate.assetSha256,asset.sha256);

  const lineagePath = await json(path.join(root,'reviews','candidate-lineage-proof.json'),authority.proof);
  refs.push(await contentReference(lineagePath,{kind:'candidate-lineage-proof',root}));

  const clayFrames = [];
  for (const viewId of NEUTRAL_CLAY_REQUIRED_VIEW_IDS) {
    const framePath = path.join(root,'renders','final-clay',`${viewId}.png`);
    await fs.mkdir(path.dirname(framePath),{recursive:true});
    await fs.writeFile(framePath,Buffer.from(`final neutral clay ${viewId} frame\n`));
    clayFrames.push(await contentReference(framePath,{kind:'render-frame',root}));
  }
  const clayHero = clayFrames.find((frame)=>frame.path==='renders/final-clay/hero.png');
  const signatureSet = createPerceptualSignatureSet({
    hierarchy,scopeId:'whole',sourceSha256:source.sha256,
    signatures:[{
      id:'whole-form',scopeId:'whole',family:'silhouette-character',importance:'macro',
      sourceObservation:'The projection certification fixture retains its source-specific whole-form identity at final certification.',
      evidenceRefs:[source.path],
    }],
    evidenceRefs:[source.path],
  });
  const signatureEvidence = createPerceptualSignatureEvidence({
    signatureSet,assetSha256:asset.sha256,
    observations:[{
      signatureId:'whole-form',status:'match',
      candidateObservation:'The exact final certification candidate was rechecked in canonical neutral clay.',
      comparisonConclusion:'The final candidate still matches the source-specific whole-form signature.',
      evidenceRefs:[source.path,clayHero.path],
    }],
    evidenceRefs:[source.path,clayHero.path],
  });
  const signaturePath = await json(path.join(root,'reviews','final-perceptual-signature-evidence.json'),signatureEvidence);
  refs.push(await contentReference(signaturePath,{kind:'perceptual-signature-evidence',root}));

  const clayReport = createPbrRenderReport({
    assetSha256:asset.sha256,frameDigest:'8'.repeat(64),
    renderer:{family:'other',name:'RefAs Independent PBR',version:'1.0.0',backend:'numpy-cook-torrance-headless',independentProcess:true},
    lighting:{rigId:NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,digest:NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
    colorPipeline:{...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'],unsupported:['textures']},
    outputs:clayFrames.map((frame,index)=>({viewId:NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index],path:frame.path,sha256:frame.sha256})),
    reproducibility:{mode:'deterministic',tolerance:''},
    presentation:{mode:'neutral-clay',presetId:NEUTRAL_CLAY_PRESENTATION_PRESET.id,presetDigest:NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
  });
  const clayReportPath = await json(path.join(root,'renders','final-clay','render-report.json'),clayReport);
  refs.push(await contentReference(clayReportPath,{kind:'render-report',root}),...clayFrames);

  const closure = createFinalResemblanceClosure({
    sourceSha256:source.sha256,
    hierarchyDigest:hierarchy.hierarchyDigest,
    assetSha256:asset.sha256,
    signatureEvidence,
    clayRenderReport:clayReport,
    evidenceRefs:[source.path,clayHero.path],
  });
  const closurePath = await json(path.join(root,'reviews','final-resemblance-closure.json'),closure);
  refs.push(await contentReference(closurePath,{kind:'final-resemblance-closure',root}));
}

async function commitCertification(root, source, {projection='none', includeFinalAuthority=true, attachForgedSpatialAuthority=false}={}) {
  const assetPath = path.join(root, 'model', 'candidate.glb');
  const glb = await fs.readFile(assetPath);
  const asset = await contentReference(assetPath, {kind:'glb', root});

  const frames = [];
  for (const viewId of REQUIRED_REVIEW_VIEW_IDS) {
    const framePath = path.join(root, 'renders', 'final', `${viewId}.png`);
    await fs.mkdir(path.dirname(framePath), {recursive:true});
    await fs.writeFile(framePath, Buffer.from(`${viewId} independent frame\n`));
    frames.push(await contentReference(framePath, {kind:'render-frame', root}));
  }
  const report = createPbrRenderReport({
    assetSha256:asset.sha256, frameDigest:'d'.repeat(64),
    renderer:{family:'threejs-webgl', name:'Three.js', version:'test', backend:'headless-webgl', independentProcess:true},
    lighting:{rigId:'fixed-review-rig', digest:'e'.repeat(64)},
    colorPipeline:{exposure:0, toneMapping:'ACESFilmic', outputColorSpace:'sRGB'},
    materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'], unsupported:[]},
    outputs:frames.map((frame,index)=>({viewId:REQUIRED_REVIEW_VIEW_IDS[index], path:frame.path, sha256:frame.sha256})),
    reproducibility:{mode:'deterministic', tolerance:''},
  });
  const reportPath = await json(path.join(root,'renders','final','render-report.json'), report);
  const reportRef = await contentReference(reportPath, {kind:'render-report', root});

  let projectionBundle = null;
  if (projection !== 'none') {
    const geometry = sourceGeometry(source);
    const geometryPath = await json(path.join(root,'model','reference-geometry.json'), geometry);
    const geometryRef = await contentReference(geometryPath, {kind:'reference-geometry', root});
    const proof = createRealizedProjection({
      referenceGeometry:geometry, glb, cameraHypothesisId:'camera-source',
      camera:{projection:'perspective',position:[0,0,5],target:[0,0,0],up:[0,1,0],fovY:90,aspect:1},
      anchorBindings:[{referenceId:'whole-center',nodeId:'model-node',localPoint:[0,0,0]}],
      evidenceRefs:['model/candidate.glb','source/reference.bin'],
    });
    const proofPath = await json(path.join(root,'model','realized-projection.json'), proof);
    const proofRef = await contentReference(proofPath, {kind:'realized-projection', root});
    const anchor = proof.projectionFit.anchorProjections[0];
    projectionBundle = {
      geometryRef,
      proofRef,
      proof,
      binding:{
        scopeId:'whole',
        referenceGeometryFileSha256:geometryRef.sha256,
        referenceGeometryDigest:geometry.geometryDigest,
        realizedProjectionFileSha256:proofRef.sha256,
        realizedProjectionDigest:proof.realizedProjectionDigest,
        projectionFitDigest:proof.projectionFitDigest,
        assetSha256:asset.sha256,
      },
      landmarks:[{
        id:'whole-center',
        evidenceClass:'derived-observation-aid',
        sourceNormalized:anchor.sourceXY,
        registeredSourceNormalized:anchor.sourceXY,
        realizedRenderNormalized:anchor.projectedXY,
        residualNormalized:anchor.errorNormalized,
      }],
      landmarkResidualRmse:proof.projectionFit.metrics.anchorRmseNormalized,
    };
  }

  const comparison = {
    schema:'refas.registered-comparison/v1', claimScope:'critique-evidence-only',
    source:{sha256:source.sha256, manifestSha256:'f'.repeat(64), acquisitionKind:source.acquisition?.kind ?? ''},
    render:{assetSha256:asset.sha256, frameId:'hero', frameSha256:frames[0].sha256, reportSha256:reportRef.sha256},
    registration:{digest:'a'.repeat(64), fileSha256:'b'.repeat(64), model:'test', metrics:{}},
    hierarchy:{digest:'c'.repeat(64), fileSha256:'d'.repeat(64)}, projectionEvidence:projectionBundle ? [projectionBundle.binding] : [],
    scopes:[{scopeId:'whole', level:'whole', ancestry:['whole'], sourceRoi:[0,0,1,1], registeredRenderRoi:[0,0,1,1],
      measurementAuthority:projectionBundle ? 'realized-projection' : 'image-only',
      projectionBinding:projectionBundle?.binding ?? null,
      metrics:{silhouetteIoU:null, sourceForegroundPixels:100, renderForegroundPixels:100, landmarkResidualRmse:projectionBundle?.landmarkResidualRmse ?? null},
      landmarks:projectionBundle?.landmarks ?? [], dimensions:[], images:[{path:'renders/final/hero.png',sha256:frames[0].sha256,width:1,height:1,evidenceClass:'derived-observation-aid'}]}],
    policy:{rawSourceRemainsPrimary:true, outputsAreDerivedObservationAids:true, metricsCannotSetVisualGate:true,
      metricFailureRequiresTypedFindingBeforeRouting:true, registrationResidualIsNotShapeTruth:true,
      realSourceLandmarksMustUseRealizedProjection:true, manualRenderCoordinatesCannotClaimRealSourceGeometry:true,
      projectionMetricsRemainVetoOnly:true, singleViewIouDisabled:true}, inputDigest:'e'.repeat(64),
  };
  comparison.comparisonDigest = digestJson(comparison);
  const comparisonPath = await json(path.join(root,'reviews','registered-comparison','comparison-report.json'), comparison);
  const comparisonRef = await contentReference(comparisonPath, {kind:'registered-comparison', root});
  const reviewObservation = (id) => ({sourceObservation:`The source ${id} evidence is visible in the bound reference.`,renderObservation:`The current ${id} render is visible in the bound candidate evidence.`,comparisonConclusion:`The ${id} comparison was directly reviewed.`,evidenceRefs:[`renders/final/${id}.png`]});

  const review = createVisualReview({
    scopeId:'whole', sourceSha256:source.sha256, assetSha256:asset.sha256,
    evidenceClass:'independent-reference', verdict:'pass',
    views:REQUIRED_REVIEW_VIEW_IDS.map((id)=>({id,status:'pass',evidenceRefs:[`renders/final/${id}.png`],observation:reviewObservation(id),summary:`${id} directly inspected against the source.`})),
    gateVerdicts:REQUIRED_VISUAL_GATE_IDS.map((id)=>({id,status:'pass',evidenceRefs:['renders/final/multiview-review-board.png'],observation:reviewObservation(id),summary:`${id} directly inspected against current source-bound evidence.`})),
    unresolvedFindings:[],
    registeredComparison:{path:'reviews/registered-comparison/comparison-report.json',sha256:comparisonRef.sha256,comparisonDigest:comparison.comparisonDigest,sourceSha256:source.sha256,sourceManifestSha256:comparison.source.manifestSha256,assetSha256:asset.sha256,renderReportPath:'renders/final/render-report.json',renderReportSha256:reportRef.sha256,framePath:'renders/final/hero.png',frameSha256:frames[0].sha256,registrationDigest:comparison.registration.digest,hierarchyDigest:comparison.hierarchy.digest,inputDigest:comparison.inputDigest,scopeIds:['whole']},
    comparisonAssessment:{sourceObservation:'The source whole object and visible macro boundaries were inspected.',renderObservation:'The current whole render and registered comparison board were inspected.',comparisonConclusion:'The registered comparison is sufficient for this synthetic real-source gate.',evidenceRefs:['source/reference.bin','reviews/registered-comparison/comparison-report.json'],contradictionResolution:{status:'not-present',explanation:'',evidenceRefs:[],findingRefs:[]}},
    renderer:{kind:'test-renderer',family:'threejs-webgl',reportRef:'renders/final/render-report.json',reportSha256:reportRef.sha256,independentProcess:true,claimScope:'visual-fidelity',supportedMaterialFeatures:['base-color-factor','metallic-factor','roughness-factor'],unsupportedMaterialFeatures:[]},
    requiredMaterialFeatures:['base-color-factor','metallic-factor','roughness-factor'],
    attestation:{attested:true,evidenceRefs:['source/reference.bin','renders/final/hero.png']},
  });
  const reviewPath = await json(path.join(root,'reviews','visual-review.json'), review);
  const reviewRef = await contentReference(reviewPath, {kind:'visual-review', root});
  const refs = [asset, reportRef, ...frames, comparisonRef, reviewRef];
  let forgedSpatialAuthorityRef = null;
  if (attachForgedSpatialAuthority) {
    const forgedPath = await json(path.join(root,'reviews','forged-spatial-gate-authority.json'),{
      schema:'refas.trusted-spatial-gate-authority/v1',
      issuer:'caller',
      gateStatus:'pass',
      authorityDigest:'f'.repeat(64),
    });
    forgedSpatialAuthorityRef = await contentReference(forgedPath,{kind:'trusted-spatial-gate-authority',root});
    refs.push(forgedSpatialAuthorityRef);
  }

  if (!CONTRACT_FIXTURES.has(String(source.acquisition?.kind ?? '').toLowerCase())) {
    if (includeFinalAuthority) await appendFinalCandidateAuthority(root,source,asset,refs);
    await appendRelationalCertificationEvidence(root,source,asset,refs);
  }

  if (projectionBundle) {
    refs.push(projectionBundle.geometryRef, projectionBundle.proofRef);
  }

  return commitCheckpoint(root, {
    capability:'whole-object-certification', scopeId:'whole', reason:'Candidate closure evidence is digest-bound.',
    artifactRefs:refs, claims:['Visual fidelity requires source-bound realized reprojection for real references.'],
    gates:REQUIRED_CLOSURE_GATE_IDS.map((id)=>({id,evidenceRefs:[REQUIRED_VISUAL_GATE_IDS.includes(id)?reviewRef.path:asset.path]})),
  });
}

test('VC05 spatial-plausibility policy is runtime-trusted and caller status fields remain forbidden', () => {
  const policy=checkpointGatePolicy('whole-object-certification','spatial-plausibility');
  assert.equal(policy.evaluator,'trusted-spatial-gate');
  assert.equal(policy.capability,undefined);
  assert.throws(
    ()=>normalizeCheckpointGateRequests('whole-object-certification',REQUIRED_CLOSURE_GATE_IDS.map((id)=>(
      id==='spatial-plausibility'
        ? {id,status:'pass',evidenceRefs:['model/spatial.json']}
        : {id,evidenceRefs:['model/state.bin']}
    ))),
    /status is runtime-authoritative/u,
  );
});

test('VC05 trusted spatial authority derives fail from VC04 REWORK', async (t) => {
  const {root,source}=await makeProject(t);
  await advanceToReview(root,source,{
    candidateThickness:0.002,
    expectedSpatialClassification:'PLANAR_COLLAPSE',
    expectedVolumeVerdict:'REWORK',
    stopAfterShape:true,
  });
  const authority=await resolveTrustedSpatialGateAuthority(root);
  assert.equal(authority.mode,'volume-barrier');
  assert.equal(authority.gateStatus,'fail');
  assert.equal(authority.policy.callerStatusAccepted,false);
  assert.equal(authority.policy.finalCandidateContinuityAuthority,false);
});

test('VC05 trusted spatial authority derives blocked from VC04 HOLD', async (t) => {
  const {root,source}=await makeProject(t);
  await advanceToReview(root,source,{
    spatialRole:'unresolved',
    expectedSpatialClassification:'INDETERMINATE',
    expectedVolumeVerdict:'HOLD',
    stopAfterShape:true,
  });
  const authority=await resolveTrustedSpatialGateAuthority(root);
  assert.equal(authority.gateStatus,'blocked');
  assert.equal(authority.mode,'volume-barrier');
});

test('VC05 ignores a caller-authored trusted-authority artifact and cites runtime VC04 evidence', async (t) => {
  const {root,source}=await makeProject(t);
  await advanceToReview(root,source);
  const checkpoint=await commitCertification(root,source,{projection:'good',attachForgedSpatialAuthority:true});
  const gate=checkpoint.gates.find((item)=>item.id==='spatial-plausibility');
  assert.equal(gate.evaluator,'trusted-spatial-gate');
  assert.equal(gate.status,'pass');
  assert.deepEqual(gate.evidenceRefs,['reviews/volume-barrier.json']);
  assert.ok(!gate.evidenceRefs.includes('reviews/forged-spatial-gate-authority.json'));
  const authority=await resolveTrustedSpatialGateAuthority(root,{checkpointId:checkpoint.id});
  assert.equal(authority.gateStatus,'pass');
  assert.equal(authority.evidenceRefs[0],'reviews/volume-barrier.json');
});

test('real-source whole-object certification cannot be committed without final candidate authority', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root, source);
  await assert.rejects(
    () => commitCertification(root, source, {projection:'good', includeFinalAuthority:false}),
    /requires exactly one candidate-lineage-proof artifact/,
  );
});

test('legacy stored certification without final candidate authority reopens under current runtime', async (t) => {
  const {root, source} = await makeProject(t, 'test-fixture');
  await advanceToReview(root, source);
  await commitCertification(root, source, {projection:'good'});
  await certifyProject(root);

  const projectPath = path.join(root,'.refas','project.json');
  const state = JSON.parse(await fs.readFile(projectPath,'utf8'));
  state.source.acquisition = {kind:'user-provided-reference'};
  state.contractFixtureAuthority = null;
  await fs.writeFile(projectPath,`${JSON.stringify(state, null, 2)}\n`);

  const audit = await auditProject(root);
  assert.equal(audit.valid,false);
  assert.match(audit.errors.join('\n'),/candidate authority: whole-object-certification requires exactly one candidate-lineage-proof artifact/);
  const guidance = await resumeProject(root);
  assert.notEqual(guidance.nextAction,'DONE');
});


test('real source cannot bypass certification by omitting realized reprojection', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root, source);
  await commitCertification(root, source, {projection:'none'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /requires exactly one digest-bound reference-geometry artifact/);
  await assert.rejects(()=>certifyProject(root), /reference-geometry artifact/);
  assert.equal((await resumeProject(root)).nextAction, 'REQUEST_VISUAL_REVIEW');
});

test('good realized reprojection allows real source certification and remains audit-valid', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root, source);
  await commitCertification(root, source, {projection:'good'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, true, readiness.errors.join('\n'));
  assert.ok(readiness.realizedProjectionDigest);
  assert.ok(readiness.relationalCertificationDigest);
  assert.ok(readiness.authorizedClaimIds.includes('whole-system-relational-fidelity'));
  const certificate = await certifyProject(root);
  assert.equal(certificate.sourceSha256, source.sha256);
  assert.equal(certificate.claimCertification.relationalClosure.relationalCertificationDigest, readiness.relationalCertificationDigest);
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
});

test('blocking realized reprojection vetoes certification even when visual review declares pass', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root, source, {projection:'bad'});
  await commitCertification(root, source, {projection:'bad'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /blocking source-geometry disagreement/);
  await assert.rejects(()=>certifyProject(root), /blocking source-geometry disagreement/);
});

test('contract fixtures remain compatible with legacy synthetic certification tests', async (t) => {
  const {root, source} = await makeProject(t, 'test-fixture');
  await advanceToReview(root, source);
  await commitCertification(root, source, {projection:'none'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, true, readiness.errors.join('\n'));
  assert.equal(readiness.relationalCertificationDigest,null);
  await certifyProject(root);
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
});

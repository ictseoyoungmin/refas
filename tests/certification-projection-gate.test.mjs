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
  commitCheckpoint,
  contentReference,
  createPbrRenderReport,
  createRealizedProjection,
  createReferenceGeometry,
  createSegmentPrism,
  createVisualReview,
  digestBytes,
  initProject,
  partsToGlb,
  resumeProject,
} from '../skills/refas/scripts/lib/index.mjs';

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
  await initProject(root, {projectId:'projection-cert-study', source});
  return {root, source};
}

async function advanceToReview(root) {
  const file = path.join(root, 'model', 'state.bin');
  await fs.mkdir(path.dirname(file), {recursive:true});
  for (const capability of CAPABILITY_ORDER) {
    if (capability === 'whole-object-certification') break;
    await fs.writeFile(file, Buffer.from(`trusted:${capability}\n`));
    const artifact = await contentReference(file, {kind:'model-spec', root});
    await commitCheckpoint(root, {
      capability, scopeId:'whole', reason:`${capability} fixture is trustworthy`,
      artifactRefs:[artifact], claims:[`${capability} closed`],
      gates:[{id:`${capability}-gate`, status:'pass', evidenceRefs:[artifact.path]}],
    });
  }
}

function mannequinGlb(x=0) {
  const mesh = createSegmentPrism({start:[-.1,0,0], end:[.1,0,0], width:.08, height:.08, upHint:[0,1,0]});
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

async function commitCertification(root, source, {projection='none'}={}) {
  const assetPath = path.join(root, 'model', 'candidate.glb');
  const glb = mannequinGlb(projection === 'bad' ? 4 : 0);
  await fs.writeFile(assetPath, glb);
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
  const comparison = {
    schema:'refas.registered-comparison/v1', claimScope:'critique-evidence-only',
    source:{sha256:source.sha256, manifestSha256:'f'.repeat(64)},
    render:{assetSha256:asset.sha256, frameId:'hero', frameSha256:frames[0].sha256, reportSha256:reportRef.sha256},
    registration:{digest:'a'.repeat(64), fileSha256:'b'.repeat(64), model:'test', metrics:{}},
    hierarchy:{digest:'c'.repeat(64), fileSha256:'d'.repeat(64)}, projectionEvidence:[],
    scopes:[{scopeId:'whole', level:'whole', ancestry:['whole'], sourceRoi:[0,0,1,1], registeredRenderRoi:[0,0,1,1],
      measurementAuthority:'image-only', projectionBinding:null,
      metrics:{silhouetteIoU:1, sourceForegroundPixels:100, renderForegroundPixels:100, landmarkResidualRmse:null},
      landmarks:[], dimensions:[], images:[{path:'renders/final/hero.png',sha256:frames[0].sha256,width:1,height:1,evidenceClass:'derived-observation-aid'}]}],
    policy:{rawSourceRemainsPrimary:true, outputsAreDerivedObservationAids:true, metricsCannotSetVisualGate:true,
      metricFailureRequiresTypedFindingBeforeRouting:true, registrationResidualIsNotShapeTruth:true,
      realSourceLandmarksMustUseRealizedProjection:true, manualRenderCoordinatesCannotClaimRealSourceGeometry:true,
      projectionMetricsRemainVetoOnly:true}, inputDigest:'e'.repeat(64), comparisonDigest:'1'.repeat(64),
  };
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

  if (projection !== 'none') {
    const geometry = sourceGeometry(source);
    const geometryPath = await json(path.join(root,'model','reference-geometry.json'), geometry);
    refs.push(await contentReference(geometryPath, {kind:'reference-geometry', root}));
    const proof = createRealizedProjection({
      referenceGeometry:geometry, glb, cameraHypothesisId:'camera-source',
      camera:{projection:'perspective',position:[0,0,5],target:[0,0,0],up:[0,1,0],fovY:90,aspect:1},
      anchorBindings:[{referenceId:'whole-center',nodeId:'model-node',localPoint:[0,0,0]}],
      evidenceRefs:['model/candidate.glb','source/reference.bin'],
    });
    const proofPath = await json(path.join(root,'model','realized-projection.json'), proof);
    refs.push(await contentReference(proofPath, {kind:'realized-projection', root}));
  }

  return commitCheckpoint(root, {
    capability:'whole-object-certification', scopeId:'whole', reason:'Candidate closure evidence is digest-bound.',
    artifactRefs:refs, claims:['Visual fidelity requires source-bound realized reprojection for real references.'],
    gates:REQUIRED_CLOSURE_GATE_IDS.map((id)=>({id,status:'pass',evidenceRefs:[REQUIRED_VISUAL_GATE_IDS.includes(id)?reviewRef.path:asset.path]})),
  });
}

test('real source cannot bypass certification by omitting realized reprojection', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root);
  await commitCertification(root, source, {projection:'none'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /requires exactly one digest-bound reference-geometry artifact/);
  await assert.rejects(()=>certifyProject(root), /reference-geometry artifact/);
  assert.equal((await resumeProject(root)).nextAction, 'REQUEST_VISUAL_REVIEW');
});

test('good realized reprojection allows real source certification and remains audit-valid', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root);
  await commitCertification(root, source, {projection:'good'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, true, readiness.errors.join('\n'));
  assert.ok(readiness.realizedProjectionDigest);
  const certificate = await certifyProject(root);
  assert.equal(certificate.sourceSha256, source.sha256);
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
});

test('blocking realized reprojection vetoes certification even when visual review declares pass', async (t) => {
  const {root, source} = await makeProject(t);
  await advanceToReview(root);
  await commitCertification(root, source, {projection:'bad'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /blocking source-geometry disagreement/);
  await assert.rejects(()=>certifyProject(root), /blocking source-geometry disagreement/);
});

test('contract fixtures remain compatible with legacy synthetic certification tests', async (t) => {
  const {root, source} = await makeProject(t, 'test-fixture');
  await advanceToReview(root);
  await commitCertification(root, source, {projection:'none'});
  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, true, readiness.errors.join('\n'));
  await certifyProject(root);
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
});

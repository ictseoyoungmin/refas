import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {
  createRealizedProjection,
  createReferenceGeometry,
  createReferenceRegistration,
  createSegmentPrism,
  createVisualHierarchy,
  digestBytes,
  digestJson,
  findComparisonContradictions,
  partsToGlb,
  sha256File,
  validateRegisteredComparison,
} from '../skills/refas/scripts/lib/index.mjs';

const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPARE = path.join(REPOSITORY, 'skills/refas/scripts/compare_registered.py');

test('Python registered comparison reproduces JavaScript canonical double formatting', () => {
  const payload = {basis: [-2.2515212045446777e-5, 1, 1e-7, 1e21], nested: {value: 0.30000000000000004}};
  const script = [
    'import importlib.util,json,sys',
    `spec=importlib.util.spec_from_file_location("compare_registered",${JSON.stringify(COMPARE)})`,
    'module=importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'print(module.digest_json(json.loads(sys.stdin.read())))',
  ].join(';');
  const result = spawnSync(PYTHON, ['-c', script], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), digestJson(payload));
});

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function makeFixture(t, {shapeVariant = 'equal'} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-registered-projection-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  await fs.mkdir(path.join(root, 'renders/final'), {recursive: true});
  await fs.mkdir(path.join(root, 'model'), {recursive: true});
  await fs.mkdir(path.join(root, 'assets'), {recursive: true});

  const imageScript = [
    'from PIL import Image, ImageDraw',
    'import sys',
    'im=Image.new("RGB",(64,64),(250,250,250))',
    'd=ImageDraw.Draw(im)',
    'd.rectangle((10,10,53,53),fill=(80,90,100))',
    'd.rectangle((14,15,28,48),fill=(250,250,250)) if sys.argv[2]=="left-void" else None',
    'd.rectangle((35,15,49,48),fill=(250,250,250)) if sys.argv[2]=="right-void" else None',
    'd.rectangle((0,0,7,7),fill=(60,65,70)) if sys.argv[2]=="cluttered" else None',
    'im.save(sys.argv[1])',
  ].join(';');
  const sourceMode = shapeVariant === 'opposed-voids' ? 'left-void' : 'solid';
  const renderMode = shapeVariant === 'opposed-voids' ? 'right-void' : 'solid';
  for (const [file, mode] of [
    [path.join(root, 'source/reference.png'), sourceMode],
    [path.join(root, 'renders/final/hero.png'), renderMode],
  ]) {
    const result = spawnSync(PYTHON, ['-c', imageScript, file, mode], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
  }
  const sourcePath = path.join(root, 'source/reference.png');
  const renderPath = path.join(root, 'renders/final/hero.png');
  const sourceSha256 = await sha256File(sourcePath);
  const renderSha256 = await sha256File(renderPath);
  const sourceManifest = {
    schema: 'refas.source-manifest/v1', id: 'primary-reference', path: 'reference.png',
    sha256: sourceSha256, sizeBytes: (await fs.stat(sourcePath)).size, width: 64, height: 64,
    authority: 'primary', acquisition: {kind: 'user-upload'},
  };
  await writeJson(path.join(root, 'source/source-manifest.json'), sourceManifest);

  const hierarchy = createVisualHierarchy({
    source: {path: 'source/reference.png', sha256: sourceSha256, width: 64, height: 64},
    nodes: [{id:'whole', label:'Whole', level:'whole', parentId:null, roi:[0,0,1,1]}],
  });
  await writeJson(path.join(root, 'model/visual-hierarchy.json'), hierarchy);

  const registration = createReferenceRegistration({
    parentFrameId:'source-frame', childFrameId:'hero-frame', parentSourceSha256:sourceSha256, childSourceSha256:renderSha256,
    model:'projective-homography',
    correspondences:[
      {id:'top-left', parent:[0,0], child:[0,0], evidenceRefs:['source/reference.png','renders/final/hero.png']},
      {id:'top-right', parent:[1,0], child:[1,0], evidenceRefs:['source/reference.png','renders/final/hero.png']},
      {id:'bottom-right', parent:[1,1], child:[1,1], evidenceRefs:['source/reference.png','renders/final/hero.png']},
      {id:'bottom-left', parent:[0,1], child:[0,1], evidenceRefs:['source/reference.png','renders/final/hero.png']},
    ],
    attestation:{attested:true,evidenceRefs:['source/reference.png','renders/final/hero.png']},
    ambiguities:[],
  });
  await writeJson(path.join(root, 'model/source-to-render-registration.json'), registration);

  const mesh = createSegmentPrism({start:[-.05,0,0], end:[.05,0,0], width:.05, height:.05, upHint:[0,1,0]});
  const glb = partsToGlb({
    parts:[
      {id:'part-a', scopeId:'whole', materialId:'wood', mesh, translation:[.5,0,0]},
      {id:'part-b', scopeId:'whole', materialId:'wood', mesh, translation:[1,0,0]},
    ],
    materials:{wood:{baseColor:[.7,.6,.4,1], metallic:0, roughness:.7}},
  });
  const assetPath = path.join(root, 'assets/model.glb');
  await fs.writeFile(assetPath, glb);
  const assetSha256 = digestBytes(glb);
  await writeJson(path.join(root, 'renders/final/render-report.json'), {
    asset:{path:'../../assets/model.glb', sha256:assetSha256},
    frames:[{id:'hero', path:'hero.png', sha256:renderSha256}],
  });

  const geometry = createReferenceGeometry({
    scopeId:'whole', sourceSha256,
    anchors:[
      {id:'anchor-a', importance:'macro', evidenceRefs:['source/reference.png'], xy:[.55,.5], visibility:'visible', confidence:1, semanticRole:'left macro anchor'},
      {id:'anchor-b', importance:'macro', evidenceRefs:['source/reference.png'], xy:[.60,.5], visibility:'visible', confidence:1, semanticRole:'right macro anchor'},
    ],
    dimensions:[{id:'anchor-span', importance:'macro', evidenceRefs:['source/reference.png'], aAnchorId:'anchor-a', bAnchorId:'anchor-b', kind:'distance'}],
    attestation:{attested:true,evidenceRefs:['source/reference.png']},
  });
  await writeJson(path.join(root, 'model/reference-geometry.json'), geometry);
  const camera = {projection:'perspective', position:[0,0,5], target:[0,0,0], up:[0,1,0], fovY:90, aspect:1};
  const realized = createRealizedProjection({
    referenceGeometry:geometry, glb, cameraHypothesisId:'camera-a', camera,
    anchorBindings:[
      {referenceId:'anchor-a', nodeId:'part-a', localPoint:[0,0,0]},
      {referenceId:'anchor-b', nodeId:'part-b', localPoint:[0,0,0]},
    ], evidenceRefs:['assets/model.glb'],
  });
  await writeJson(path.join(root, 'model/realized-projection.json'), realized);

  const input = {
    schema:'refas.registered-comparison-input/v1', sourceManifest:'source/source-manifest.json', renderReport:'renders/final/render-report.json',
    renderImage:'hero.png', frameId:'hero', registration:'model/source-to-render-registration.json', hierarchy:'model/visual-hierarchy.json',
    scopeIds:['whole'], overlayOpacity:.5,
  };
  return {root, input};
}

function runCompare(root, input) {
  const inputPath = path.join(root, 'registered-comparison-input.json');
  return writeJson(inputPath, input).then(() => spawnSync(PYTHON, [COMPARE, '--input', inputPath, '--out', path.join(root, 'comparison')], {encoding:'utf8'}));
}

test('real-source registered comparison refuses manual or missing projection evidence', async (t) => {
  const {root, input} = await makeFixture(t);
  const missing = await runCompare(root, input);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /requires realized projection evidence/);

  const mixed = await runCompare(root, {...input,
    projectionEvidence:[{scopeId:'whole', referenceGeometry:'model/reference-geometry.json', realizedProjection:'model/realized-projection.json'}],
    landmarks:[{id:'fake', scopeId:'whole', source:[.5,.5], render:[.9,.9]}],
  });
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /manual landmarks\/dimensions cannot be mixed/);
});

test('real-source comparison derives non-null landmarks and dimensions from realized projection', async (t) => {
  const {root, input} = await makeFixture(t);
  const goodInput = {...input, projectionEvidence:[{scopeId:'whole', referenceGeometry:'model/reference-geometry.json', realizedProjection:'model/realized-projection.json'}]};
  const result = await runCompare(root, goodInput);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await fs.readFile(path.join(root, 'comparison/comparison-report.json'), 'utf8'));
  assert.deepEqual(validateRegisteredComparison(report), {valid:true, errors:[]});
  const scope = report.scopes[0];
  assert.equal(scope.measurementAuthority, 'realized-projection');
  assert.equal(scope.landmarks.length, 2);
  assert.ok(Number.isFinite(scope.metrics.landmarkResidualRmse));
  assert.ok(scope.metrics.landmarkResidualRmse < 1e-9);
  assert.equal(scope.dimensions.length, 1);
  assert.ok(!('declaredRenderNormalized' in scope.landmarks[0]));
  assert.deepEqual(scope.landmarks[0].realizedRenderNormalized, [.55,.5]);

  const fixtureSpoof = structuredClone(report);
  fixtureSpoof.source.acquisitionKind = 'test-fixture';
  const fixtureSpoofValidation = validateRegisteredComparison(fixtureSpoof);
  assert.equal(fixtureSpoofValidation.valid, false);
  assert.match(
    fixtureSpoofValidation.errors.join('\n'),
    /declared fixture comparison authority requires trusted contract-fixture project context/,
  );

  const missingAcquisition = structuredClone(report);
  missingAcquisition.source.acquisitionKind = '';
  const missingAcquisitionValidation = validateRegisteredComparison(missingAcquisition, {
    expectedAcquisitionKind: 'user-upload',
  });
  assert.equal(missingAcquisitionValidation.valid, false);
  assert.match(
    missingAcquisitionValidation.errors.join('\n'),
    /registered comparison acquisition kind does not match the bound project source/,
  );

  const acquisitionDrift = structuredClone(report);
  acquisitionDrift.source.acquisitionKind = 'retrieved-reference';
  const acquisitionDriftValidation = validateRegisteredComparison(acquisitionDrift, {
    expectedAcquisitionKind: 'user-upload',
  });
  assert.equal(acquisitionDriftValidation.valid, false);
  assert.match(
    acquisitionDriftValidation.errors.join('\n'),
    /registered comparison acquisition kind does not match the bound project source/,
  );

  const tampered = structuredClone(report);
  tampered.scopes[0].metrics.landmarkResidualRmse = null;
  assert.equal(validateRegisteredComparison(tampered).valid, false);
  const injected = structuredClone(report);
  injected.scopes[0].landmarks[0].declaredRenderNormalized = [.99,.99];
  assert.equal(validateRegisteredComparison(injected).valid, false);
});


test('S02 actual registered original pixels expose opposing internal voids with identical area and bbox', async t => {
  const {root, input} = await makeFixture(t, {shapeVariant:'opposed-voids'});
  const comparison = await runCompare(root, {...input,
    projectionEvidence:[{scopeId:'whole', referenceGeometry:'model/reference-geometry.json', realizedProjection:'model/realized-projection.json'}],
  });
  assert.equal(comparison.status, 0, comparison.stderr);
  const report = JSON.parse(await fs.readFile(path.join(root,'comparison/comparison-report.json'), 'utf8'));
  assert.deepEqual(validateRegisteredComparison(report), {valid:true,errors:[]});
  const whole = report.scopes.find(scope => scope.scopeId === 'whole');
  assert.equal(whole.metrics.sourceForegroundPixels, whole.metrics.renderForegroundPixels,
    'the image mismatch must survive equal foreground area');
  assert.deepEqual(whole.metrics.perceptual.sourceBoundingBox, whole.metrics.perceptual.renderBoundingBox,
    'the image mismatch must survive equal outer bounds');
  assert.equal(whole.metrics.perceptual.pixelShape.status,'USABLE');
  assert.ok(whole.metrics.perceptual.pixelShape.sourceOnlyFraction > .28);
  assert.ok(whole.metrics.perceptual.pixelShape.renderOnlyFraction > .28);
  const contradiction = findComparisonContradictions(report);
  assert.ok(contradiction.some(f => f.id === 'whole-pixel-shape-screen' && f.category === 'silhouette-mismatch'),
    'the independent pixels must contradict even if the registered GLB anchor RMSE is zero');
  assert.ok(whole.metrics.landmarkResidualRmse < 1e-9);
  assert.equal(whole.metrics.silhouetteIoU, null, 'single-view IoU cannot be a fidelity PASS');

  const tamper = structuredClone(report);
  tamper.scopes[0].metrics.perceptual.pixelShape.sourceOnlyFraction=NaN;
  assert.equal(validateRegisteredComparison(tamper).valid,false,'invalid pixel evidence must not be accepted');
});

test('S02 matching registered pixels cannot elevate the single view into a fidelity certificate', async t => {
  const {root,input} = await makeFixture(t);
  const comparison=await runCompare(root,{...input,
    projectionEvidence:[{scopeId:'whole',referenceGeometry:'model/reference-geometry.json',realizedProjection:'model/realized-projection.json'}],
  });
  assert.equal(comparison.status,0,comparison.stderr);
  const report=JSON.parse(await fs.readFile(path.join(root,'comparison/comparison-report.json'),'utf8'));
  const pixel=report.scopes[0].metrics.perceptual.pixelShape;
  assert.equal(pixel.status,'USABLE');
  assert.equal(pixel.sourceOnlyPixels,0);
  assert.equal(pixel.renderOnlyPixels,0);
  assert.equal(pixel.cannotAuthorizePass,true);
  assert.ok(!findComparisonContradictions(report).some(x=>x.id==='whole-pixel-shape-screen'));
});

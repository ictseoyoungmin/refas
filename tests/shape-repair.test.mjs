import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  contentReference,
  createProjectionRepairEvaluator,
  createProjectionRepairPlan,
  createRealizedProjection,
  createReferenceGeometry,
  createSegmentPrism,
  digestBytes,
  digestJson,
  normalizeProjectionCamera,
  partsToGlb,
  projectionResidualMeasurements,
  repairShapeFromProjection,
  validateParameterFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character) => character.repeat(64);
const camera = {projection: 'perspective', position: [1.73, 0.61, 4.27], target: [0.12, -0.24, 0.31], up: [0.03, 1.0, 0.07], fovY: 37.25, aspect: 1};
const canonicalFrame = {schema: 'refas.canonical-object-frame/v1', id: 'shape-repair-frame', scopeId: 'whole', origin: [0, 0, 0], axes: {right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1]}, hero: {position: camera.position, target: camera.target, up: camera.up, fovY: camera.fovY, registrationDigest: D('c')}};
const materials = {shell: {baseColor: [0.32, 0.48, 0.72, 1], metallic: 0.1, roughness: 0.5}};
const prism = () => createSegmentPrism({start: [-0.05, 0, 0], end: [0.05, 0, 0], width: 0.3, height: 0.3, upHint: [0, 1, 0]});

function geometry() {
  return createReferenceGeometry({
    scopeId: 'whole', sourceSha256: D('a'),
    anchors: [
      {id: 'root-anchor', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.55, 0.5], visibility: 'visible', confidence: 1},
      {id: 'child-anchor', importance: 'macro', evidenceRefs: ['source/reference.png'], xy: [0.6, 0.5], visibility: 'visible', confidence: 1},
    ],
    chains: [{id: 'root-child-chain', importance: 'macro', evidenceRefs: ['source/reference.png'], anchorIds: ['root-anchor', 'child-anchor']}],
    attestation: {attested: true, evidenceRefs: ['source/reference.png']},
  });
}

function asset({rootX = 0.5, childOffset = 1} = {}) {
  return partsToGlb({
    assetId: 'shape-repair-fixture',
    parts: [
      {id: 'root-part', scopeId: 'whole', materialId: 'shell', mesh: prism(), translation: [rootX, 0, 0]},
      {id: 'child-part', scopeId: 'whole.child', materialId: 'shell', mesh: prism(), parentId: 'root-part', translation: [childOffset, 0, 0]},
    ],
    materials,
  });
}

const anchorBindings = [
  {referenceId: 'root-anchor', nodeId: 'root-part', localPoint: [0, 0, 0]},
  {referenceId: 'child-anchor', nodeId: 'child-part', localPoint: [0, 0, 0]},
];

test('projection repair binds residuals to shape parameters and keeps an improved exact-GLB candidate', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-shape-repair-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const reference = geometry();
  const baselineGlb = asset();
  await fs.writeFile(path.join(root, 'baseline.glb'), baselineGlb);
  const plan = createProjectionRepairPlan({
    id: 'projection-shape-repair', scopeId: 'whole', sourceSha256: reference.sourceSha256,
    baselineAsset: await contentReference(path.join(root, 'baseline.glb'), {kind: 'glb', root}),
    parameters: [
      {id: 'root-x', binding: 'model.shape.root-x', minimum: 0.4, maximum: 0.6, initial: 0.5},
      {id: 'child-offset', binding: 'model.geometry.child-offset', minimum: 0.3, maximum: 1.2, initial: 1},
    ],
    objectives: [{id: 'macro-anchor-rmse', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 12, populationSize: 4, evaluationBudget: 12, patience: 8},
    evidenceRefs: ['source/reference.png'],
  });

  const verifyReference = async (referenceRef) => {
    const file = path.join(root, referenceRef.path);
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, referenceRef.sizeBytes);
    assert.equal(digestBytes(bytes), referenceRef.sha256);
  };
  const framePath = path.join(root, 'canonical-frame.json');
  await fs.writeFile(framePath, `${JSON.stringify(canonicalFrame)}\n`);
  const frameDigest = digestJson(canonicalFrame);
  const result = await repairShapeFromProjection({
    plan, baselineGlb, referenceGeometry: reference, cameraHypothesisId: 'camera-a', camera, anchorBindings,
    frameDigest,
    buildCandidate: (parameters) => asset({rootX: parameters['root-x'], childOffset: parameters['child-offset']}),
    renderCandidate: async ({glb, context, proof}) => {
      const directory = path.join(root, 'trials', context.trialId);
      await fs.mkdir(directory, {recursive: true});
      const assetPath = path.join(directory, 'candidate.glb');
      const renderDirectory = path.join(directory, 'render');
      await fs.writeFile(assetPath, glb);
      const rendered = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3', [
        path.resolve('skills/refas/scripts/render_glb.py'), '--glb', assetPath, '--out', renderDirectory,
        '--frame', framePath, '--size', '96', '--timeout-seconds', '30', '--max-working-mb', '64',
      ], {encoding: 'utf8', timeout: 60000});
      if (rendered.status !== 0) throw new Error(`portable renderer failed: ${rendered.stderr || rendered.stdout}`);
      const renderPath = path.join(renderDirectory, 'render-report.json');
      const renderReport = JSON.parse(await fs.readFile(renderPath, 'utf8'));
      assert.equal(renderReport.heroCamera.position.length, 3);
      assert.equal(renderReport.heroCamera.fovY, canonicalFrame.hero.fovY);
      assert.equal(renderReport.heroCamera.aspect, proof.camera.aspect);
      assert.deepEqual(normalizeProjectionCamera(renderReport.heroCamera), proof.camera);
      return {
        candidateAsset: await contentReference(assetPath, {kind: 'glb', root}),
        renderEvidence: await contentReference(renderPath, {kind: 'render-report', root}),
        heroImage: await contentReference(path.join(renderDirectory, 'hero.png'), {kind: 'render-image', root}),
        evidenceRefs: [`trials/${context.trialId}/render/render-report.json`],
      };
    },
    verifyReference,
    readReference: async (referenceRef) => fs.readFile(path.join(root, referenceRef.path)),
  });

  const baselineLoss = result.report.trials[0].measurements['macro-anchor-rmse'];
  const selected = result.report.trials.find((trial) => trial.id === result.report.selectedTrialId);
  assert.equal(validateParameterFitReport(result.report).valid, true);
  assert.ok(selected.measurements['macro-anchor-rmse'] < baselineLoss * 0.5, JSON.stringify(selected));
  assert.ok(result.selectedProof.assetSha256 !== result.baselineProof.assetSha256);
  assert.equal(result.decision, 'KEEP');
  assert.deepEqual(result.blockingRegressions, []);
  assert.equal(projectionResidualMeasurements(result.baselineProof, ['macro-anchor-rmse'])['macro-anchor-rmse'], baselineLoss);
});

test('projection repair rejects camera and appearance bindings at the shape boundary', () => {
  assert.throws(() => createProjectionRepairPlan({
    id: 'invalid-repair', scopeId: 'whole', sourceSha256: D('a'),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: D('b'), sizeBytes: 1},
    parameters: [
      {id: 'camera-yaw', binding: 'camera.yaw', minimum: -1, maximum: 1, initial: 0},
      {id: 'shape-width', binding: 'model.shape.width', minimum: 0, maximum: 1, initial: 0.5},
    ],
    objectives: [{id: 'macro-anchor-rmse', goal: 'minimize'}],
  }), /must bind a model\.shape or model\.geometry parameter/);
  assert.throws(() => createProjectionRepairPlan({
    id: 'invalid-objective', scopeId: 'whole', sourceSha256: D('a'),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: D('b'), sizeBytes: 1},
    parameters: [
      {id: 'shape-width', binding: 'model.shape.width', minimum: 0, maximum: 1, initial: 0.5},
      {id: 'shape-depth', binding: 'model.geometry.depth', minimum: 0, maximum: 1, initial: 0.5},
    ],
    objectives: [{id: 'macro-anchor-rmse', goal: 'maximize'}],
  }), /must minimize residual error/);
  assert.throws(() => createProjectionRepairPlan({
    referenceGeometry: geometry(), id: 'missing-evidence', scopeId: 'whole', sourceSha256: D('a'),
    baselineAsset: {schema: 'refas.content-reference/v1', kind: 'glb', path: 'baseline.glb', sha256: D('b'), sizeBytes: 1},
    parameters: [
      {id: 'shape-width', binding: 'model.shape.width', minimum: 0, maximum: 1, initial: 0.5},
      {id: 'shape-depth', binding: 'model.geometry.depth', minimum: 0, maximum: 1, initial: 0.5},
    ],
    objectives: [{id: 'negative-space-loss', goal: 'minimize'}],
  }), /requires reference evidence/);
});

test('projection repair rejects synthetic render evidence even when references are byte-valid', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-shape-render-binding-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const reference = geometry(), baselineGlb = asset(), baselinePath = path.join(root, 'baseline.glb');
  await fs.writeFile(baselinePath, baselineGlb);
  const plan = createProjectionRepairPlan({
    id: 'render-binding-plan', scopeId: 'whole', sourceSha256: reference.sourceSha256,
    baselineAsset: await contentReference(baselinePath, {kind: 'glb', root}),
    parameters: [
      {id: 'root-x', binding: 'model.shape.root-x', minimum: 0.4, maximum: 0.6, initial: 0.5},
      {id: 'child-offset', binding: 'model.geometry.child-offset', minimum: 0.3, maximum: 1.2, initial: 1},
    ],
    objectives: [{id: 'macro-anchor-rmse', goal: 'minimize'}],
    optimizer: {seed: 1, populationSize: 4, evaluationBudget: 5, patience: 2},
  });
  const evaluator = createProjectionRepairEvaluator({
    plan, referenceGeometry: reference, cameraHypothesisId: 'camera-a', camera, frameDigest: D('f'), anchorBindings,
    buildCandidate: () => baselineGlb,
    renderCandidate: async ({context}) => {
      const directory = path.join(root, context.trialId); await fs.mkdir(directory, {recursive: true});
      const candidatePath = path.join(directory, 'candidate.glb'), reportPath = path.join(directory, 'render-report.json'), heroPath = path.join(directory, 'hero.png');
      await fs.writeFile(candidatePath, baselineGlb); await fs.writeFile(heroPath, 'not-an-image');
      await fs.writeFile(reportPath, JSON.stringify({schema: 'refas.test-realized-render/v1'}));
      return {
        candidateAsset: await contentReference(candidatePath, {kind: 'glb', root}),
        renderEvidence: await contentReference(reportPath, {kind: 'render-report', root}),
        heroImage: await contentReference(heroPath, {kind: 'render-image', root}),
      };
    },
    readReference: async (referenceRef) => fs.readFile(path.join(root, referenceRef.path)),
  });
  await assert.rejects(() => evaluator.evaluate({"root-x": 0.5, "child-offset": 1}, {trialId: 'trial-0001'}), /schema must be refas\.multiview-render-report\/v1/);
});

test('projection repair rejects a report whose recorded hero camera differs from the realized camera', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-shape-camera-binding-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const reference = geometry(), baselineGlb = asset(), baselinePath = path.join(root, 'baseline.glb');
  await fs.writeFile(baselinePath, baselineGlb);
  const framePath = path.join(root, 'canonical-frame.json');
  await fs.writeFile(framePath, `${JSON.stringify(canonicalFrame)}\n`);
  const frameDigest = digestJson(canonicalFrame);
  const plan = createProjectionRepairPlan({
    id: 'camera-binding-plan', scopeId: 'whole', sourceSha256: reference.sourceSha256,
    baselineAsset: await contentReference(baselinePath, {kind: 'glb', root}),
    parameters: [
      {id: 'root-x', binding: 'model.shape.root-x', minimum: 0.4, maximum: 0.6, initial: 0.5},
      {id: 'child-offset', binding: 'model.geometry.child-offset', minimum: 0.3, maximum: 1.2, initial: 1},
    ],
    objectives: [{id: 'macro-anchor-rmse', goal: 'minimize'}],
    optimizer: {seed: 1, populationSize: 4, evaluationBudget: 5, patience: 2},
  });
  const evaluator = createProjectionRepairEvaluator({
    plan, referenceGeometry: reference, cameraHypothesisId: 'camera-a', camera, frameDigest, anchorBindings,
    buildCandidate: () => baselineGlb,
    renderCandidate: async ({glb, context}) => {
      const directory = path.join(root, context.trialId), renderDirectory = path.join(directory, 'render');
      await fs.mkdir(directory, {recursive: true});
      const assetPath = path.join(directory, 'candidate.glb');
      await fs.writeFile(assetPath, glb);
      const rendered = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3', [
        path.resolve('skills/refas/scripts/render_glb.py'), '--glb', assetPath, '--out', renderDirectory,
        '--frame', framePath, '--size', '48', '--timeout-seconds', '30', '--max-working-mb', '64',
      ], {encoding: 'utf8', timeout: 60000});
      if (rendered.status !== 0) throw new Error(`portable renderer failed: ${rendered.stderr || rendered.stdout}`);
      const reportPath = path.join(renderDirectory, 'render-report.json');
      const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
      report.heroCamera.position = [0, 0, 6];
      await fs.writeFile(reportPath, `${JSON.stringify(report)}\n`);
      return {
        candidateAsset: await contentReference(assetPath, {kind: 'glb', root}),
        renderEvidence: await contentReference(reportPath, {kind: 'render-report', root}),
        heroImage: await contentReference(path.join(renderDirectory, 'hero.png'), {kind: 'render-image', root}),
      };
    },
    readReference: async (referenceRef) => fs.readFile(path.join(root, referenceRef.path)),
  });
  await assert.rejects(() => evaluator.evaluate({"root-x": 0.5, "child-offset": 1}, {trialId: 'trial-0001'}), /heroCamera must bind the realized projection camera/);
});

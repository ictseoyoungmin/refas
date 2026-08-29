import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  contentReference,
  createProjectionRepairPlan,
  createRealizedProjection,
  createReferenceGeometry,
  createSegmentPrism,
  digestBytes,
  partsToGlb,
  projectionResidualMeasurements,
  repairShapeFromProjection,
  validateParameterFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character) => character.repeat(64);
const camera = {projection: 'perspective', position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: 90, aspect: 1};
const materials = {shell: {baseColor: [0.32, 0.48, 0.72, 1], metallic: 0.1, roughness: 0.5}};
const prism = () => createSegmentPrism({start: [-0.05, 0, 0], end: [0.05, 0, 0], width: 0.08, height: 0.08, upHint: [0, 1, 0]});

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
    optimizer: {seed: 12, populationSize: 8, evaluationBudget: 48, patience: 24},
    evidenceRefs: ['source/reference.png'],
  });

  const verifyReference = async (referenceRef) => {
    const file = path.join(root, referenceRef.path);
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, referenceRef.sizeBytes);
    assert.equal(digestBytes(bytes), referenceRef.sha256);
  };
  const result = await repairShapeFromProjection({
    plan, baselineGlb, referenceGeometry: reference, cameraHypothesisId: 'camera-a', camera, anchorBindings,
    buildCandidate: (parameters) => asset({rootX: parameters['root-x'], childOffset: parameters['child-offset']}),
    renderCandidate: async ({glb, context, proof}) => {
      const directory = path.join(root, 'trials', context.trialId);
      await fs.mkdir(directory, {recursive: true});
      const assetPath = path.join(directory, 'candidate.glb');
      const renderPath = path.join(directory, 'render-report.json');
      await fs.writeFile(assetPath, glb);
      await fs.writeFile(renderPath, `${JSON.stringify({schema: 'refas.test-realized-render/v1', realizedProjectionDigest: proof.realizedProjectionDigest})}\n`);
      return {
        candidateAsset: await contentReference(assetPath, {kind: 'glb', root}),
        renderEvidence: await contentReference(renderPath, {kind: 'render-report', root}),
        evidenceRefs: [`trials/${context.trialId}/render-report.json`],
      };
    },
    verifyReference,
  });

  const baselineLoss = result.report.trials[0].measurements['macro-anchor-rmse'];
  const selected = result.report.trials.find((trial) => trial.id === result.report.selectedTrialId);
  assert.equal(validateParameterFitReport(result.report).valid, true);
  assert.ok(selected.measurements['macro-anchor-rmse'] < baselineLoss * 0.1, JSON.stringify(selected));
  assert.ok(result.selectedProof.assetSha256 !== result.baselineProof.assetSha256);
  assert.equal(result.decision, 'KEEP');
  assert.deepEqual(result.blockingRegressions, []);
  assert.equal(projectionResidualMeasurements(result.baselineProof)['macro-anchor-rmse'], baselineLoss);
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
});

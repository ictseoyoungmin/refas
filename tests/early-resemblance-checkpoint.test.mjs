import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  commitCheckpoint,
  contentReference,
  createEarlyResemblanceBarrier,
  createPbrRenderReport,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  createVisualHierarchy,
  digestBytes,
  initProject,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (ch) => ch.repeat(64);

async function writeRef(root, relative, bytes, kind) {
  const absolute = path.join(root, relative);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, bytes);
  return contentReference(absolute, {kind, root});
}

async function commitLocal(root, capability, refs) {
  return commitCheckpoint(root, {
    capability,
    scopeId: 'whole',
    reason: `${capability} real-source R04 fixture`,
    artifactRefs: refs,
    claims: [`${capability} fixture`],
    gates: [{id: `${capability}-gate`, evidenceRefs: refs.map((ref) => ref.path)}],
  });
}

function clayReport(assetSha256) {
  return createPbrRenderReport({
    assetSha256,
    frameDigest: D('c'),
    renderer: {
      family: 'other',
      name: 'RefAs Independent PBR',
      version: '1.0.0',
      backend: 'numpy-cook-torrance-headless',
      independentProcess: true,
    },
    lighting: {
      rigId: NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,
      digest: NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
    },
    colorPipeline: {...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport: {
      supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupported: ['textures'],
    },
    outputs: NEUTRAL_CLAY_REQUIRED_VIEW_IDS.map((viewId, index) => ({
      viewId,
      path: `renders/clay/${viewId}.png`,
      sha256: D(String((index % 8) + 1)),
    })),
    reproducibility: {mode: 'deterministic', tolerance: ''},
    presentation: {
      mode: 'neutral-clay',
      presetId: NEUTRAL_CLAY_PRESENTATION_PRESET.id,
      presetDigest: NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
    },
  });
}

async function makeRealSourceProject(t, verdictStatus) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-r04-real-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));

  const sourceBytes = Buffer.from('real source bytes\n');
  const sourceRef = await writeRef(root, 'source/reference.bin', sourceBytes, 'source-image');
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: sourceRef.path,
    sha256: sourceRef.sha256,
    sizeBytes: sourceRef.sizeBytes,
    width: 64,
    height: 64,
    authority: 'primary',
    acquisition: {kind: 'photo-reference'},
  };
  await initProject(root, {projectId: `r04-${verdictStatus.toLowerCase()}`, source});

  const sourceIntakeRef = await writeRef(root, 'model/source-intake.json', Buffer.from('{"source":true}\n'), 'source-manifest');
  await commitLocal(root, 'source-intake', [sourceIntakeRef]);

  const hierarchy = createVisualHierarchy({
    source: {path: source.path, sha256: source.sha256, width: source.width, height: source.height},
    nodes: [
      {id: 'whole', label: 'Whole', level: 'whole', parentId: null, roi: [0, 0, 1, 1]},
    ],
  });
  const hierarchyRef = await writeRef(
    root,
    'model/visual-hierarchy.json',
    Buffer.from(`${JSON.stringify(hierarchy, null, 2)}\n`),
    'visual-hierarchy',
  );
  await commitLocal(root, 'visual-hierarchy', [hierarchyRef]);

  const observationRef = await writeRef(root, 'model/observation.json', Buffer.from('{"observation":true}\n'), 'visual-observation');
  await commitLocal(root, 'visual-observation', [observationRef]);

  const spatialRef = await writeRef(root, 'model/spatial.json', Buffer.from('{"spatial":true}\n'), 'spatial-hypotheses');
  await commitLocal(root, 'spatial-hypotheses', [spatialRef]);

  const candidateBytes = Buffer.from('candidate glb bytes\n');
  const candidateRef = await writeRef(root, 'model/candidate.glb', candidateBytes, 'glb');

  const signatureSet = createPerceptualSignatureSet({
    hierarchy,
    scopeId: 'whole',
    sourceSha256: source.sha256,
    signatures: [{
      id: 'whole-silhouette',
      scopeId: 'whole',
      family: 'silhouette-character',
      importance: 'macro',
      sourceObservation: 'The source outer contour has a specific stepped identity.',
      evidenceRefs: [source.path],
    }],
    evidenceRefs: [source.path],
  });
  const signatureEvidence = createPerceptualSignatureEvidence({
    signatureSet,
    assetSha256: candidateRef.sha256,
    observations: [{
      signatureId: 'whole-silhouette',
      status: verdictStatus,
      candidateObservation: 'Candidate silhouette was inspected in canonical neutral clay.',
      comparisonConclusion: verdictStatus === 'match'
        ? 'The required source silhouette identity is present.'
        : verdictStatus === 'mismatch'
          ? 'The required source silhouette identity is absent.'
          : 'The current evidence cannot resolve the required silhouette identity.',
      evidenceRefs: [source.path, 'renders/clay/hero.png'],
    }],
    evidenceRefs: [source.path, 'renders/clay/hero.png'],
  });
  const barrier = createEarlyResemblanceBarrier({
    sourceSha256: source.sha256,
    hierarchyDigest: hierarchy.hierarchyDigest,
    assetSha256: candidateRef.sha256,
    signatureEvidence,
    clayRenderReport: clayReport(candidateRef.sha256),
    evidenceRefs: [source.path, 'renders/clay/hero.png'],
  });
  const barrierRef = await writeRef(
    root,
    'reviews/early-resemblance-barrier.json',
    Buffer.from(`${JSON.stringify(barrier, null, 2)}\n`),
    'early-resemblance-barrier',
  );
  await commitLocal(root, 'shape-reconstruction', [candidateRef, barrierRef]);

  const surfaceRef = await writeRef(root, 'model/surface.json', Buffer.from('{"surface":true}\n'), 'surface-network');
  return {root, barrier, surfaceRef};
}

test('R04 real-source HOLD blocks surface-topology admission', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'insufficient');
  assert.equal(barrier.verdict, 'HOLD');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires early resemblance PROCEED; current verdict is HOLD/,
  );
});

test('R04 real-source REWORK blocks surface-topology admission', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'mismatch');
  assert.equal(barrier.verdict, 'REWORK');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires early resemblance PROCEED; current verdict is REWORK/,
  );
});

test('R04 real-source PROCEED admits surface-topology but grants no certification authority', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'match');
  assert.equal(barrier.verdict, 'PROCEED');
  assert.equal(barrier.policy.proceedOnlyAuthorizesDownstreamDetail, true);
  assert.equal(barrier.policy.proceedDoesNotPassVisualReview, true);
  assert.equal(barrier.policy.proceedDoesNotCertify, true);
  const surface = await commitLocal(root, 'surface-topology', [surfaceRef]);
  assert.equal(surface.capability, 'surface-topology');
});

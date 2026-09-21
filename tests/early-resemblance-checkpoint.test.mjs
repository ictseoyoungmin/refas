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
  auditProject,
  assessCertification,
  classifySpatialCollapse,
  commitCheckpoint,
  contentReference,
  createCandidateTransition,
  createEarlyResemblanceBarrier,
  createPbrRenderReport,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  createSpatialClosureEvidence,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  createVolumeBarrier,
  digestBytes,
  finalizeMesh,
  initProject,
  partsToGlb,
  resolveAuthoritativeCandidateLineage,
  resumeProject,
} from '../skills/refas/scripts/lib/index.mjs';
import {initTrustedContractFixtureProject} from '../skills/refas/scripts/lib/contract-fixture-project.mjs';

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

function vc04BoxMesh(depth=1) {
  const hx=0.5, hy=0.5, hz=depth/2;
  const positions=[
    [-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
    [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],
  ];
  const indices=[
    0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
    3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5,
  ];
  return finalizeMesh(positions,indices,{primitive:'vc04-box'});
}

async function clayEvidence(root, assetSha256) {
  const frameRefs = [];
  for (const viewId of NEUTRAL_CLAY_REQUIRED_VIEW_IDS) {
    frameRefs.push(await writeRef(
      root,
      `renders/clay/${viewId}.png`,
      Buffer.from(`neutral clay ${viewId} frame\n`),
      'render-frame',
    ));
  }
  const report = createPbrRenderReport({
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
    outputs: frameRefs.map((frame, index) => ({
      viewId: NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index],
      path: frame.path,
      sha256: frame.sha256,
    })),
    reproducibility: {mode: 'deterministic', tolerance: ''},
    presentation: {
      mode: 'neutral-clay',
      presetId: NEUTRAL_CLAY_PRESENTATION_PRESET.id,
      presetDigest: NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
    },
  });
  const reportRef = await writeRef(
    root,
    'renders/clay/render-report.json',
    Buffer.from(`${JSON.stringify(report, null, 2)}\n`),
    'render-report',
  );
  return {report, reportRef, frameRefs};
}

async function makeRealSourceProject(t, verdictStatus, {
  unboundObservationEvidence = false,
  spatialRole = 'volumetric',
  candidateDepth = 1,
  omitVolumeBarrier = false,
} = {}) {
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
  const roleSet = createSpatialRoleExpectationSet({
    hierarchy,
    sourceSha256: source.sha256,
    expectations: [{
      scopeId: 'whole',
      role: spatialRole,
      sourceObservation: `The source whole scope is pre-bound as ${spatialRole} for the VC04 fixture.`,
      rationale: 'Freeze the spatial role before candidate evaluation.',
      evidenceRefs: [source.path],
      ambiguity: spatialRole === 'unresolved' ? 'The source does not resolve whole-object depth.' : null,
    }],
  });
  const roleRef = await writeRef(
    root,
    'model/spatial-role.json',
    Buffer.from(`${JSON.stringify(roleSet, null, 2)}\n`),
    'spatial-role-expectation',
  );
  await commitLocal(root, 'spatial-hypotheses', [spatialRef, roleRef]);

  const candidateBytes = partsToGlb({
    assetId: 'vc04-r04-candidate',
    materials: {fixture: {baseColor: [0.5, 0.5, 0.5, 1], metallic: 0, roughness: 0.5}},
    parts: [{
      id: 'whole-body',
      scopeId: 'whole',
      role: 'whole-body',
      materialId: 'fixture',
      mesh: vc04BoxMesh(candidateDepth),
    }],
  });
  const candidateRef = await writeRef(root, 'model/candidate.glb', candidateBytes, 'glb');
  const clay = await clayEvidence(root, candidateRef.sha256);
  const clayHeroRef = clay.frameRefs.find((frame) => frame.path === 'renders/clay/hero.png');

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
      evidenceRefs: unboundObservationEvidence
        ? [source.path, clayHeroRef.path, 'evidence/unbound-resemblance.png']
        : [source.path, clayHeroRef.path],
    }],
    evidenceRefs: [source.path, clayHeroRef.path],
  });
  const barrier = createEarlyResemblanceBarrier({
    sourceSha256: source.sha256,
    hierarchyDigest: hierarchy.hierarchyDigest,
    assetSha256: candidateRef.sha256,
    signatureEvidence,
    clayRenderReport: clay.report,
    evidenceRefs: [source.path, clayHeroRef.path],
  });
  const barrierRef = await writeRef(
    root,
    'reviews/early-resemblance-barrier.json',
    Buffer.from(`${JSON.stringify(barrier, null, 2)}\n`),
    'early-resemblance-barrier',
  );
  const spatialEvidence = createSpatialClosureEvidence({glb: candidateBytes, scopeId: 'whole'});
  const spatialEvidenceRef = await writeRef(
    root,
    'reviews/spatial-closure-whole.json',
    Buffer.from(`${JSON.stringify(spatialEvidence, null, 2)}\n`),
    'spatial-closure-evidence',
  );
  const classification = await classifySpatialCollapse(root, {
    glb: candidateBytes,
    spatialEvidence,
    scopeId: 'whole',
  });
  const classificationRef = await writeRef(
    root,
    'reviews/spatial-collapse-whole.json',
    Buffer.from(`${JSON.stringify(classification, null, 2)}\n`),
    'spatial-collapse-classification',
  );
  const volumeBarrier = createVolumeBarrier({
    sourceSha256: source.sha256,
    hierarchyDigest: hierarchy.hierarchyDigest,
    assetSha256: candidateRef.sha256,
    signatureSet,
    classifications: [classification],
  });
  const volumeBarrierRef = await writeRef(
    root,
    'reviews/volume-barrier.json',
    Buffer.from(`${JSON.stringify(volumeBarrier, null, 2)}\n`),
    'volume-barrier',
  );
  const shapeRefs = [candidateRef, barrierRef, clay.reportRef, ...clay.frameRefs];
  if (!omitVolumeBarrier) shapeRefs.push(spatialEvidenceRef, classificationRef, volumeBarrierRef);
  const shapeCheckpoint = await commitLocal(root, 'shape-reconstruction', shapeRefs);

  const surfaceRef = await writeRef(root, 'model/surface.json', Buffer.from('{"surface":true}\n'), 'surface-network');
  return {root, source, hierarchy, barrier, volumeBarrier, classification, spatialEvidence, surfaceRef, candidateRef, shapeCheckpoint};
}

test('R04 real-source HOLD blocks surface-topology admission', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'insufficient');
  assert.equal(barrier.verdict, 'HOLD');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'GATHER_RESEMBLANCE_EVIDENCE');
  assert.equal(guidance.earlyResemblanceVerdict, 'HOLD');
  assert.equal(guidance.activeWork.capability, 'visual-critique');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires early resemblance PROCEED; current verdict is HOLD/,
  );
});

test('R04 real-source REWORK blocks surface-topology admission', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'mismatch');
  assert.equal(barrier.verdict, 'REWORK');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'REPORT_RESEMBLANCE_FINDINGS');
  assert.equal(guidance.earlyResemblanceVerdict, 'REWORK');
  assert.ok(guidance.findings.length > 0);
  assert.equal(guidance.activeWork.capability, 'visual-critique');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires early resemblance PROCEED; current verdict is REWORK/,
  );
});

test('R04 real-source PROCEED admits surface-topology but grants no certification authority', async (t) => {
  const {root, barrier, volumeBarrier, surfaceRef} = await makeRealSourceProject(t, 'match');
  assert.equal(barrier.verdict, 'PROCEED');
  assert.equal(volumeBarrier.verdict, 'PROCEED');
  assert.equal(volumeBarrier.policy.proceedOnlyAuthorizesDownstreamDetail, true);
  assert.equal(volumeBarrier.policy.proceedDoesNotCertify, true);
  assert.equal(barrier.policy.proceedOnlyAuthorizesDownstreamDetail, true);
  assert.equal(barrier.policy.proceedDoesNotPassVisualReview, true);
  assert.equal(barrier.policy.proceedDoesNotCertify, true);
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'ADVANCE_CAPABILITY');
  assert.equal(guidance.activeWork.capability, 'surface-topology');
  const surface = await commitLocal(root, 'surface-topology', [surfaceRef]);
  assert.equal(surface.capability, 'surface-topology');
});



test('VC04 PLANAR_COLLAPSE blocks surface-topology even when early resemblance proceeds', async (t) => {
  const {root, barrier, volumeBarrier, surfaceRef} = await makeRealSourceProject(t, 'match', {candidateDepth: 0.02});
  assert.equal(barrier.verdict, 'PROCEED');
  assert.equal(volumeBarrier.verdict, 'REWORK');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'REWORK_SHAPE_VOLUME');
  assert.equal(guidance.volumeBarrierVerdict, 'REWORK');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires volume barrier PROCEED; current verdict is REWORK/u,
  );
});

test('VC04 unresolved protected role remains HOLD', async (t) => {
  const {root, volumeBarrier, surfaceRef} = await makeRealSourceProject(t, 'match', {spatialRole: 'unresolved'});
  assert.equal(volumeBarrier.verdict, 'HOLD');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'GATHER_SPATIAL_EVIDENCE');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /downstream detail requires volume barrier PROCEED; current verdict is HOLD/u,
  );
});

test('VC04 intentionally-planar protected scope preserves role-aware exception', async (t) => {
  const {root, volumeBarrier, surfaceRef} = await makeRealSourceProject(t, 'match', {
    spatialRole: 'intentionally-planar',
    candidateDepth: 0.02,
  });
  assert.equal(volumeBarrier.verdict, 'PROCEED');
  assert.equal(volumeBarrier.entries[0].classification, 'NOT_APPLICABLE');
  const surface = await commitLocal(root, 'surface-topology', [surfaceRef]);
  assert.equal(surface.capability, 'surface-topology');
});

test('VC04 missing shape-stage barrier fails downstream admission', async (t) => {
  const {root, surfaceRef} = await makeRealSourceProject(t, 'match', {omitVolumeBarrier: true});
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /requires exactly one volume-barrier artifact/u,
  );
});

test('candidate authority rejects a downstream GLB replacement without a transition', async (t) => {
  const {root, surfaceRef} = await makeRealSourceProject(t, 'match');
  const replacement = await writeRef(root, 'model/candidate-v2.glb', Buffer.from('candidate v2 bytes\n'), 'glb');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef, replacement]),
    /changed the authoritative candidate and requires exactly one candidate-transition artifact/,
  );
});

test('candidate authority accepts one exact transition and resolves the new final candidate', async (t) => {
  const {root, surfaceRef} = await makeRealSourceProject(t, 'match');
  const before = await resolveAuthoritativeCandidateLineage(root);
  const replacement = await writeRef(root, 'model/candidate-v2.glb', Buffer.from('candidate v2 bytes\n'), 'glb');
  const transition = createCandidateTransition({
    inputAssetSha256:before.finalCandidate.assetSha256,
    outputAssetSha256:replacement.sha256,
    inputCandidateCheckpointId:before.finalCandidate.checkpointId,
    parentCheckpointId:before.finalCandidate.checkpointId,
    capability:'surface-topology',
    scopeId:'whole',
    evidenceRefs:[replacement.path],
  });
  const transitionRef = await writeRef(
    root,
    'model/candidate-transition-surface.json',
    Buffer.from(`${JSON.stringify(transition, null, 2)}\n`),
    'candidate-transition',
  );
  const checkpoint = await commitLocal(root, 'surface-topology', [surfaceRef, replacement, transitionRef]);
  const after = await resolveAuthoritativeCandidateLineage(root);
  assert.equal(after.finalCandidate.assetSha256,replacement.sha256);
  assert.equal(after.finalCandidate.checkpointId,checkpoint.id);
  assert.equal(after.transitions.length,1);
  assert.equal(after.transitions[0].transitionDigest,transition.transitionDigest);
});

test('candidate authority rejects a re-signed transition with stale runtime input', async (t) => {
  const {root, surfaceRef, shapeCheckpoint} = await makeRealSourceProject(t, 'match');
  const replacement = await writeRef(root, 'model/candidate-v2.glb', Buffer.from('candidate v2 stale input bytes\n'), 'glb');
  const transition = createCandidateTransition({
    inputAssetSha256:D('f'),
    outputAssetSha256:replacement.sha256,
    inputCandidateCheckpointId:shapeCheckpoint.id,
    parentCheckpointId:shapeCheckpoint.id,
    capability:'surface-topology',
    scopeId:'whole',
    evidenceRefs:[replacement.path],
  });
  const transitionRef = await writeRef(
    root,
    'model/candidate-transition-stale.json',
    Buffer.from(`${JSON.stringify(transition, null, 2)}\n`),
    'candidate-transition',
  );
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef, replacement, transitionRef]),
    /input candidate digest mismatch/,
  );
});


test('candidate authority keeps explicit same-digest carry-forward compatible without a transition', async (t) => {
  const {root, surfaceRef, candidateRef} = await makeRealSourceProject(t, 'match');
  const checkpoint = await commitLocal(root, 'surface-topology', [surfaceRef, candidateRef]);
  const authority = await resolveAuthoritativeCandidateLineage(root);
  assert.equal(authority.finalCandidate.assetSha256,candidateRef.sha256);
  assert.equal(authority.finalCandidate.checkpointId,authority.initialCandidate.checkpointId);
  assert.equal(authority.transitions.length,0);
  assert.equal(checkpoint.capability,'surface-topology');
});

test('candidate authority rejects stale parent, wrong output, wrong capability, and wrong scope transitions', async (t) => {
  for (const attack of ['parent','output','capability','scope']) {
    await t.test(attack, async (t2) => {
      const {root, surfaceRef} = await makeRealSourceProject(t2, 'match');
      const before = await resolveAuthoritativeCandidateLineage(root);
      const replacement = await writeRef(root, `model/candidate-${attack}.glb`, Buffer.from(`candidate ${attack} bytes\n`), 'glb');
      const transition = createCandidateTransition({
        inputAssetSha256:before.finalCandidate.assetSha256,
        outputAssetSha256:attack==='output'?D('e'):replacement.sha256,
        inputCandidateCheckpointId:before.finalCandidate.checkpointId,
        parentCheckpointId:attack==='parent'?'cp_stale_parent':before.finalCandidate.checkpointId,
        capability:attack==='capability'?'assembly':'surface-topology',
        scopeId:attack==='scope'?'whole.part':'whole',
        evidenceRefs:[replacement.path],
      });
      const transitionRef = await writeRef(
        root,
        `model/candidate-transition-${attack}.json`,
        Buffer.from(`${JSON.stringify(transition, null, 2)}\n`),
        'candidate-transition',
      );
      const expected = {
        parent:/parent checkpoint mismatch/,
        output:/output candidate digest mismatch/,
        capability:/capability mismatch/,
        scope:/scope mismatch/,
      }[attack];
      await assert.rejects(
        () => commitLocal(root, 'surface-topology', [surfaceRef, replacement, transitionRef]),
        expected,
      );
    });
  }
});

test('candidate authority rejects competing downstream output candidates', async (t) => {
  const {root, surfaceRef} = await makeRealSourceProject(t, 'match');
  const first = await writeRef(root, 'model/candidate-competing-a.glb', Buffer.from('candidate competing a\n'), 'glb');
  const second = await writeRef(root, 'model/candidate-competing-b.glb', Buffer.from('candidate competing b\n'), 'glb');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef, first, second]),
    /contains competing candidate GLBs/,
  );
});

test('runtime candidate authority resolves chained downstream transitions to one final candidate', async (t) => {
  const {root, surfaceRef} = await makeRealSourceProject(t, 'match');
  const initial = await resolveAuthoritativeCandidateLineage(root);
  const surfaceCandidate = await writeRef(root, 'model/candidate-chain-surface.glb', Buffer.from('chain surface candidate\n'), 'glb');
  const surfaceTransition = createCandidateTransition({
    inputAssetSha256:initial.finalCandidate.assetSha256,
    outputAssetSha256:surfaceCandidate.sha256,
    inputCandidateCheckpointId:initial.finalCandidate.checkpointId,
    parentCheckpointId:initial.finalCandidate.checkpointId,
    capability:'surface-topology',scopeId:'whole',evidenceRefs:[surfaceCandidate.path],
  });
  const surfaceTransitionRef = await writeRef(
    root,'model/candidate-chain-surface-transition.json',
    Buffer.from(`${JSON.stringify(surfaceTransition, null, 2)}\n`),'candidate-transition',
  );
  const surfaceCheckpoint = await commitLocal(root,'surface-topology',[surfaceRef,surfaceCandidate,surfaceTransitionRef]);

  const assemblyRef = await writeRef(root,'model/assembly-chain.json',Buffer.from('{"assembly":true}\n'),'assembly-plan');
  const assemblyCandidate = await writeRef(root,'model/candidate-chain-assembly.glb',Buffer.from('chain assembly candidate\n'),'glb');
  const assemblyTransition = createCandidateTransition({
    inputAssetSha256:surfaceCandidate.sha256,
    outputAssetSha256:assemblyCandidate.sha256,
    inputCandidateCheckpointId:surfaceCheckpoint.id,
    parentCheckpointId:surfaceCheckpoint.id,
    capability:'assembly',scopeId:'whole',evidenceRefs:[assemblyCandidate.path],
  });
  const assemblyTransitionRef = await writeRef(
    root,'model/candidate-chain-assembly-transition.json',
    Buffer.from(`${JSON.stringify(assemblyTransition, null, 2)}\n`),'candidate-transition',
  );
  const assemblyCheckpoint = await commitLocal(root,'assembly',[assemblyRef,assemblyCandidate,assemblyTransitionRef]);
  const final = await resolveAuthoritativeCandidateLineage(root);
  assert.equal(final.initialCandidate.assetSha256,initial.initialCandidate.assetSha256);
  assert.equal(final.finalCandidate.assetSha256,assemblyCandidate.sha256);
  assert.equal(final.finalCandidate.checkpointId,assemblyCheckpoint.id);
  assert.equal(final.transitions.length,2);
  assert.deepEqual(final.transitions.map((item)=>item.transitionDigest),[
    surfaceTransition.transitionDigest,
    assemblyTransition.transitionDigest,
  ]);
});


test('R04 real-source admission rejects canonical barrier whose nested R03 evidence is not lineage-bound', async (t) => {
  const {root, barrier, surfaceRef} = await makeRealSourceProject(t, 'match', {unboundObservationEvidence: true});
  assert.equal(barrier.verdict, 'PROCEED');
  await assert.rejects(
    () => commitLocal(root, 'surface-topology', [surfaceRef]),
    /resemblance evidence ref is not bound in current checkpoint lineage: evidence\/unbound-resemblance\.png/,
  );
});


test('R04 upgrade rejects legacy real-source downstream lineage without R04 admission', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-r04-legacy-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));

  const sourceBytes = Buffer.from('legacy source bytes\n');
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
    acquisition: {kind: 'generated-contract-reference'},
  };
  await initTrustedContractFixtureProject(root, {projectId: 'r04-legacy-upgrade', source, fixtureId:'r04-legacy-bootstrap'});
  const stateRef = await writeRef(root, 'model/state.bin', Buffer.from('legacy state\n'), 'model-spec');
  for (const capability of ['source-intake','visual-hierarchy','visual-observation','spatial-hypotheses','shape-reconstruction','surface-topology']) {
    await commitLocal(root, capability, [stateRef]);
  }

  const projectPath = path.join(root, '.refas', 'project.json');
  const project = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  project.source.acquisition = {kind: 'user-provided-reference'};
  project.contractFixtureAuthority = null;
  await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);

  const audit = await auditProject(root);
  assert.equal(audit.valid, false);
  assert.match(audit.errors.join('\n'), /early resemblance admission: .*requires exactly one early-resemblance-barrier artifact/);

  const readiness = await assessCertification(root);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join('\n'), /early resemblance admission: .*requires exactly one early-resemblance-barrier artifact/);

  const certifiedState = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  certifiedState.status = 'certified';
  await fs.writeFile(projectPath, `${JSON.stringify(certifiedState, null, 2)}\n`);
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'REQUEST_RESEMBLANCE_REVIEW');
  assert.match(guidance.reason, /stored certification predates or fails current early resemblance admission/);
});

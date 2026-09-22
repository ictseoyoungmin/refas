#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

import {
  CAPABILITY_ORDER,
  REQUIRED_CLOSURE_GATE_IDS,
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
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
  initProject,
  loadProject,
  normalizeCheckpointGateRequests,
  resolveAuthoritativeCandidateLineage,
  resolveFinalSpatialContinuity,
  resolveSpatialRoleAuthority,
  resolveVolumeBarrierAdmission,
} from './lib/index.mjs';
import {runFreshWorkerDogfood} from './verify_fresh_worker_dogfood.mjs';
import {buildVolumeClosureRegressionFixture} from '../../../tests/fixtures/volume-closure-regression-fixtures.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function writeJson(root, relative, value, kind = null) {
  const absolute = path.join(root, relative);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, JSON.stringify(value, null, 2) + '\n', 'utf8');
  if (!kind) return absolute;
  return contentReference(absolute, {kind, root});
}

async function writeBytes(root, relative, bytes, kind) {
  const absolute = path.join(root, relative);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, bytes);
  return contentReference(absolute, {kind, root});
}

function sourceManifestFor(id, bytes) {
  return {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(bytes),
    sizeBytes: bytes.length,
    width: 256,
    height: 256,
    authority: 'primary',
    acquisition: {kind: 'user-provided-reference', origin: 'VC08 deterministic adversarial harness ' + id},
  };
}

async function commitGeneric(root, capability, label, extraRefs = [], {parentId} = {}) {
  const file = path.join(root, 'model', capability + '-state.json');
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, JSON.stringify({schema: 'refas.vc08-worker-state/v1', capability, label}, null, 2) + '\n');
  const ref = await contentReference(file, {kind: 'model-spec', root});
  const refs = [ref, ...extraRefs];
  return commitCheckpoint(root, {
    capability,
    scopeId: 'whole',
    reason: 'VC08 adversarial worker advances ' + capability + ' only through public runtime authority.',
    artifactRefs: refs,
    claims: ['VC08 public worker ' + capability],
    gates: [{id: capability + '-gate', evidenceRefs: refs.map((item) => item.path)}],
    ...(parentId === undefined ? {} : {parentId}),
  });
}

async function createHierarchy(root, source) {
  const hierarchy = createVisualHierarchy({
    source: {path: source.path, sha256: source.sha256, width: source.width, height: source.height},
    nodes: [{id: 'whole', label: 'Whole', level: 'whole', parentId: null, roi: [0, 0, 1, 1]}],
  });
  const ref = await writeJson(root, 'model/visual-hierarchy.json', hierarchy, 'visual-hierarchy');
  await commitCheckpoint(root, {
    capability: 'visual-hierarchy',
    scopeId: 'whole',
    reason: 'VC08 worker freezes a one-scope hierarchy before spatial authority.',
    artifactRefs: [ref],
    claims: ['whole hierarchy frozen'],
    gates: [{id: 'visual-hierarchy-gate', evidenceRefs: [ref.path]}],
  });
  return {hierarchy, ref};
}

async function freezeRole(root, source, hierarchy, role) {
  const roleSet = createSpatialRoleExpectationSet({
    hierarchy,
    sourceSha256: source.sha256,
    expectations: [{
      scopeId: 'whole',
      role,
      sourceObservation: 'VC08 source evidence pre-binds whole as ' + role + ' before candidate evaluation.',
      rationale: 'The adversarial harness freezes role authority before reconstruction so later relabel attempts cannot inherit classifier output.',
      evidenceRefs: [source.path],
      ambiguity: role === 'unresolved' ? 'VC08 unresolved control' : null,
    }],
  });
  const roleRef = await writeJson(root, 'model/spatial-role.json', roleSet, 'spatial-role-expectation');
  const stateRef = await writeJson(root, 'model/spatial.json', {schema: 'refas.vc08-spatial-state/v1'}, 'spatial-hypotheses');
  await commitCheckpoint(root, {
    capability: 'spatial-hypotheses',
    scopeId: 'whole',
    reason: 'VC08 worker freezes VC02 before shape reconstruction.',
    artifactRefs: [stateRef, roleRef],
    claims: ['VC02 role frozen'],
    gates: [{id: 'spatial-hypotheses-gate', evidenceRefs: [stateRef.path, roleRef.path]}],
  });
  return {roleSet, roleRef};
}

async function neutralClayBundle(root, source, hierarchy, assetRef, {directory = 'renders/clay', prefix = 'vc08 clay'} = {}) {
  const frames = [];
  for (const viewId of NEUTRAL_CLAY_REQUIRED_VIEW_IDS) {
    const framePath = path.join(root, directory, viewId + '.png');
    await fs.mkdir(path.dirname(framePath), {recursive: true});
    await fs.writeFile(framePath, Buffer.from(prefix + ' ' + viewId + '\n'));
    frames.push(await contentReference(framePath, {kind: 'render-frame', root}));
  }
  const hero = frames.find((frame) => frame.path === directory + '/hero.png');
  const signatureSet = createPerceptualSignatureSet({
    hierarchy,
    scopeId: 'whole',
    sourceSha256: source.sha256,
    signatures: [{
      id: 'whole-form',
      scopeId: 'whole',
      family: 'silhouette-character',
      importance: 'macro',
      sourceObservation: 'VC08 source defines one dominant whole-form identity.',
      evidenceRefs: [source.path],
    }],
    evidenceRefs: [source.path],
  });
  const signatureEvidence = createPerceptualSignatureEvidence({
    signatureSet,
    assetSha256: assetRef.sha256,
    observations: [{
      signatureId: 'whole-form',
      status: 'match',
      candidateObservation: 'The adversarial fixture deliberately preserves its front/hero whole-form observation.',
      comparisonConclusion: 'Hero correspondence is present but is not allowed to overrule spatial contradiction.',
      evidenceRefs: [source.path, hero.path],
    }],
    evidenceRefs: [source.path, hero.path],
  });
  const report = createPbrRenderReport({
    assetSha256: assetRef.sha256,
    frameDigest: digestBytes(Buffer.from(prefix + ' frame')),
    renderer: {family: 'other', name: 'RefAs VC08 Deterministic Renderer', version: '1.0.0', backend: 'deterministic-fixture', independentProcess: true},
    lighting: {rigId: NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId, digest: NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
    colorPipeline: {...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport: {supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'], unsupported: ['textures']},
    outputs: frames.map((frame, index) => ({viewId: NEUTRAL_CLAY_REQUIRED_VIEW_IDS[index], path: frame.path, sha256: frame.sha256})),
    reproducibility: {mode: 'deterministic', tolerance: ''},
    presentation: {mode: 'neutral-clay', presetId: NEUTRAL_CLAY_PRESENTATION_PRESET.id, presetDigest: NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
  });
  const reportRef = await writeJson(root, directory + '/render-report.json', report, 'render-report');
  return {frames, hero, signatureSet, signatureEvidence, report, reportRef};
}

async function commitShape(root, source, hierarchy, fixtureId, role) {
  const fixture = buildVolumeClosureRegressionFixture(fixtureId);
  const assetRef = await writeBytes(root, 'model/candidate.glb', fixture.glb, 'glb');
  const clay = await neutralClayBundle(root, source, hierarchy, assetRef);
  const earlyBarrier = createEarlyResemblanceBarrier({
    sourceSha256: source.sha256,
    hierarchyDigest: hierarchy.hierarchyDigest,
    assetSha256: assetRef.sha256,
    signatureEvidence: clay.signatureEvidence,
    clayRenderReport: clay.report,
    evidenceRefs: [source.path, clay.hero.path],
  });
  assert.equal(earlyBarrier.verdict, 'PROCEED', fixtureId + ' must reach the spatial barrier rather than fail the hero fixture');
  const earlyRef = await writeJson(root, 'reviews/early-resemblance-barrier.json', earlyBarrier, 'early-resemblance-barrier');

  const spatialEvidence = createSpatialClosureEvidence({glb: fixture.glb, scopeId: 'whole'});
  const spatialRef = await writeJson(root, 'reviews/spatial-closure-whole.json', spatialEvidence, 'spatial-closure-evidence');
  const classification = await classifySpatialCollapse(root, {glb: fixture.glb, spatialEvidence, scopeId: 'whole'});
  const classificationRef = await writeJson(root, 'reviews/spatial-collapse-whole.json', classification, 'spatial-collapse-classification');
  const volumeBarrier = createVolumeBarrier({
    sourceSha256: source.sha256,
    hierarchyDigest: hierarchy.hierarchyDigest,
    assetSha256: assetRef.sha256,
    signatureSet: clay.signatureSet,
    classifications: [classification],
  });
  const barrierRef = await writeJson(root, 'reviews/volume-barrier.json', volumeBarrier, 'volume-barrier');

  const refs = [assetRef, earlyRef, clay.reportRef, ...clay.frames, spatialRef, classificationRef, barrierRef];
  const checkpoint = await commitCheckpoint(root, {
    capability: 'shape-reconstruction',
    scopeId: 'whole',
    reason: 'VC08 shape candidate intentionally exercises ' + fixtureId + ' with frozen role ' + role + '.',
    artifactRefs: refs,
    claims: ['hero evidence present; spatial authority remains independent'],
    gates: [{id: 'shape-reconstruction-gate', evidenceRefs: refs.map((item) => item.path)}],
  });
  return {fixture, assetRef, classification, volumeBarrier, checkpoint, clay};
}

async function buildCase(fixtureId, role) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-vc08-' + fixtureId + '-'));
  const sourceBytes = Buffer.from('VC08 source bytes ' + fixtureId + '\n');
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  await fs.writeFile(path.join(root, 'source', 'reference.bin'), sourceBytes);
  const source = sourceManifestFor(fixtureId, sourceBytes);
  await writeJson(root, source.path === 'source/reference.bin' ? 'source/source-manifest.json' : source.path, source);
  await initProject(root, {projectId: 'vc08-' + fixtureId, source});

  await commitGeneric(root, 'source-intake', fixtureId);
  const {hierarchy} = await createHierarchy(root, source);
  await commitGeneric(root, 'visual-observation', fixtureId);
  const frozen = await freezeRole(root, source, hierarchy, role);
  const shape = await commitShape(root, source, hierarchy, fixtureId, role);
  return {root, source, hierarchy, frozen, ...shape};
}

async function attemptDownstream(caseState, {extraRefs = []} = {}) {
  const start = performance.now();
  try {
    const checkpoint = await commitGeneric(caseState.root, 'surface-topology', 'VC08 downstream probe', extraRefs);
    return {accepted: true, checkpointId: checkpoint.id, elapsedMs: Math.round(performance.now() - start), error: null};
  } catch (error) {
    return {accepted: false, checkpointId: null, elapsedMs: Math.round(performance.now() - start), error: error.message};
  }
}

async function makeFormalMultiviewRefs(caseState) {
  const bundle = await neutralClayBundle(
    caseState.root,
    caseState.source,
    caseState.hierarchy,
    caseState.assetRef,
    {directory: 'renders/adversarial-formal-multiview', prefix: 'hero-optimized formal multiview'},
  );
  return [bundle.reportRef, ...bundle.frames];
}

async function attemptThinRelabel(caseState) {
  const mutated = createSpatialRoleExpectationSet({
    hierarchy: caseState.hierarchy,
    sourceSha256: caseState.source.sha256,
    expectations: [{
      scopeId: 'whole',
      role: 'thin-shell',
      sourceObservation: 'Adversarial worker attempts to relabel the failed volumetric scope after classifier feedback.',
      rationale: 'This is intentionally an invalid post-freeze bypass attempt.',
      evidenceRefs: [caseState.source.path],
    }],
  });
  const mutatedRef = await writeJson(caseState.root, 'model/late-thin-shell-role.json', mutated, 'spatial-role-expectation');
  try {
    await commitCheckpoint(caseState.root, {
      capability: 'shape-reconstruction',
      scopeId: 'whole',
      reason: 'VC08 malicious post-failure thin-shell relabel attempt.',
      artifactRefs: [caseState.assetRef, mutatedRef],
      claims: ['attempted role relabel'],
      gates: [{id: 'shape-reconstruction-gate', evidenceRefs: [caseState.assetRef.path, mutatedRef.path]}],
    });
    return {blocked: false, error: null};
  } catch (error) {
    return {blocked: /spatial role expectation mutation is forbidden/u.test(error.message), error: error.message};
  }
}

function attemptSelfAuthoredPass() {
  try {
    normalizeCheckpointGateRequests(
      'whole-object-certification',
      REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
        id,
        evidenceRefs: ['model/candidate.glb'],
        ...(id === 'spatial-plausibility' ? {status: 'pass'} : {}),
      })),
    );
    return {blocked: false, error: null};
  } catch (error) {
    return {blocked: /status is runtime-authoritative/u.test(error.message), error: error.message};
  }
}

async function advancePositiveToAppearanceMutation(caseState) {
  await commitGeneric(caseState.root, 'assembly', 'positive control assembly');

  const authority = await resolveAuthoritativeCandidateLineage(caseState.root);
  const state = await loadProject(caseState.root);
  const changedFixture = buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  const changedBytes = Buffer.from(changedFixture.glb);
  changedBytes[changedBytes.length - 1] = changedBytes[changedBytes.length - 1] ^ 1;
  const changedRef = await writeBytes(caseState.root, 'model/candidate-final.glb', changedBytes, 'glb');
  assert.notEqual(changedRef.sha256, authority.finalCandidate.assetSha256);

  const transition = createCandidateTransition({
    inputAssetSha256: authority.finalCandidate.assetSha256,
    outputAssetSha256: changedRef.sha256,
    inputCandidateCheckpointId: authority.finalCandidate.checkpointId,
    parentCheckpointId: state.head,
    capability: 'appearance',
    scopeId: 'whole',
    evidenceRefs: [changedRef.path],
  });
  const transitionRef = await writeJson(caseState.root, 'model/appearance-candidate-transition.json', transition, 'candidate-transition');
  const checkpoint = await commitCheckpoint(caseState.root, {
    capability: 'appearance',
    scopeId: 'whole',
    reason: 'VC08 changed-digest final candidate mutation.',
    artifactRefs: [changedRef, transitionRef],
    claims: ['candidate changed after shape-stage spatial authority'],
    gates: [{id: 'appearance-gate', evidenceRefs: [changedRef.path, transitionRef.path]}],
  });
  return {changedBytes, changedRef, checkpoint};
}

async function appendFreshFinalSpatialAndMultiview(caseState, mutation) {
  const spatialEvidence = createSpatialClosureEvidence({glb: mutation.changedBytes, scopeId: 'whole'});
  const spatialRef = await writeJson(caseState.root, 'reviews/final-spatial-closure-whole.json', spatialEvidence, 'spatial-closure-evidence');
  const classification = await classifySpatialCollapse(caseState.root, {
    glb: mutation.changedBytes,
    spatialEvidence,
    scopeId: 'whole',
  });
  assert.equal(classification.classification, 'NO_PLANAR_COLLAPSE');
  const classificationRef = await writeJson(caseState.root, 'reviews/final-spatial-collapse-whole.json', classification, 'spatial-collapse-classification');
  const clay = await neutralClayBundle(
    caseState.root,
    caseState.source,
    caseState.hierarchy,
    mutation.changedRef,
    {directory: 'renders/final-clay', prefix: 'changed final candidate'},
  );
  const checkpoint = await commitCheckpoint(caseState.root, {
    capability: 'rendering',
    scopeId: 'whole',
    reason: 'VC08 current-head branch carries fresh final VC01/VC03 plus exact final multiview.',
    artifactRefs: [spatialRef, classificationRef, clay.reportRef, ...clay.frames],
    claims: ['fresh final spatial evidence for changed candidate'],
    gates: [{id: 'rendering-gate', evidenceRefs: [clay.reportRef.path, ...clay.frames.map((item) => item.path)]}],
  });
  return {checkpoint, spatialRef, classificationRef, clay};
}

async function staleAndLineageAttacks(caseState) {
  const mutation = await advancePositiveToAppearanceMutation(caseState);
  let staleError = null;
  try {
    await resolveFinalSpatialContinuity(caseState.root);
  } catch (error) {
    staleError = error.message;
  }
  assert.match(staleError || '', /changed final candidate requires fresh VC01 evidence for protected scope whole/u);

  const branchBaseId = mutation.checkpoint.id;
  const fresh = await appendFreshFinalSpatialAndMultiview(caseState, mutation);
  const currentContinuity = await resolveFinalSpatialContinuity(caseState.root);
  assert.equal(currentContinuity.mode, 'changed-digest-reverified');
  assert.equal(currentContinuity.verdict, 'PROCEED');

  let selectedLineageError = null;
  try {
    await resolveFinalSpatialContinuity(caseState.root, {checkpointId: branchBaseId});
  } catch (error) {
    selectedLineageError = error.message;
  }
  assert.match(selectedLineageError || '', /changed final candidate requires fresh VC01 evidence for protected scope whole/u);

  const forged = {
    schema: 'refas.final-spatial-continuity/v1',
    mode: 'same-digest-carry-forward',
    verdict: 'PROCEED',
    finalCandidate: {assetSha256: mutation.changedRef.sha256},
    continuityDigest: 'f'.repeat(64),
  };
  const forgedRef = await writeJson(caseState.root, 'reviews/forged-final-spatial-continuity.json', forged, 'final-spatial-continuity');
  const visualState = await writeJson(caseState.root, 'model/visual-critique-state.json', {schema: 'refas.vc08-worker-state/v1'}, 'model-spec');
  await commitCheckpoint(caseState.root, {
    capability: 'visual-critique',
    scopeId: 'whole',
    reason: 'VC08 attaches a forged continuity object after canonical VC06 evidence exists.',
    artifactRefs: [visualState, forgedRef],
    claims: ['forged continuity must stay non-authoritative'],
    gates: [{id: 'visual-critique-gate', evidenceRefs: [visualState.path, forgedRef.path]}],
  });
  const afterForge = await resolveFinalSpatialContinuity(caseState.root);
  assert.equal(afterForge.continuityDigest, currentContinuity.continuityDigest);
  assert.equal(afterForge.finalCandidate.assetSha256, mutation.changedRef.sha256);

  return {
    staleEvidenceBlocked: true,
    staleEvidenceError: staleError,
    currentHeadFreshEvidenceAccepted: true,
    currentContinuityDigest: currentContinuity.continuityDigest,
    selectedParentLineageLeakBlocked: true,
    selectedParentLineageError: selectedLineageError,
    forgedContinuityIgnored: afterForge.continuityDigest === currentContinuity.continuityDigest,
    freshEvidenceCheckpointId: fresh.checkpoint.id,
  };
}

async function run() {
  const started = performance.now();

  const freshWorker = await runFreshWorkerDogfood({
    skillRoot: path.join(REPO_ROOT, 'skills', 'refas'),
    keep: false,
  });
  assert.equal(freshWorker.status, 'PASS');
  assert.equal(freshWorker.rawImplementationReads, 0);
  assert.equal(freshWorker.implementationSearchCommands, 0);

  const planar = await buildCase('gpt-planar-bird-surrogate', 'volumetric');
  const volumetric = await buildCase('claude-volumetric-bird-surrogate', 'volumetric');
  const thin = await buildCase('intentionally-thin-panel', 'intentionally-planar');
  const degenerate = await buildCase('synthetic-degenerate-volume', 'volumetric');
  const cleanupRoots = [planar.root, volumetric.root, thin.root, degenerate.root];

  try {
    assert.equal(planar.classification.classification, 'PLANAR_COLLAPSE');
    assert.equal(planar.volumeBarrier.verdict, 'REWORK');
    assert.equal(volumetric.classification.classification, 'NO_PLANAR_COLLAPSE');
    assert.equal(volumetric.volumeBarrier.verdict, 'PROCEED');
    assert.equal(thin.classification.classification, 'NOT_APPLICABLE');
    assert.equal(thin.volumeBarrier.verdict, 'PROCEED');
    assert.equal(degenerate.classification.classification, 'PLANAR_COLLAPSE');
    assert.equal(degenerate.volumeBarrier.verdict, 'REWORK');

    const formalMultiviewRefs = await makeFormalMultiviewRefs(planar);
    const planarDownstream = await attemptDownstream(planar, {extraRefs: formalMultiviewRefs});
    assert.equal(planarDownstream.accepted, false);
    assert.match(planarDownstream.error || '', /downstream detail requires volume barrier PROCEED; current verdict is REWORK/u);

    const degenerateDownstream = await attemptDownstream(degenerate);
    assert.equal(degenerateDownstream.accepted, false);
    assert.match(degenerateDownstream.error || '', /downstream detail requires volume barrier PROCEED; current verdict is REWORK/u);

    const volumetricDownstream = await attemptDownstream(volumetric);
    assert.equal(volumetricDownstream.accepted, true);
    const thinDownstream = await attemptDownstream(thin);
    assert.equal(thinDownstream.accepted, true);

    const roleAuthority = await resolveSpatialRoleAuthority(planar.root, {scopeId: 'whole'});
    assert.equal(roleAuthority.selectedExpectation.role, 'volumetric');
    const relabel = await attemptThinRelabel(planar);
    assert.equal(relabel.blocked, true);

    const selfAuthoredPass = attemptSelfAuthoredPass();
    assert.equal(selfAuthoredPass.blocked, true);

    const staleLineage = await staleAndLineageAttacks(volumetric);

    const planarBarrier = await resolveVolumeBarrierAdmission(planar.root);
    const thinBarrier = await resolveVolumeBarrierAdmission(thin.root);
    assert.equal(planarBarrier.verdict, 'REWORK');
    assert.equal(thinBarrier.verdict, 'PROCEED');

    return {
      schema: 'refas.vc08-adversarial-dogfood-report/v1',
      status: 'PASS',
      slice: 'VC08',
      baselineIntent: 'integrated VC00-VC07 shortcut resistance',
      execution: {
        installedSkillPublicWorker: {
          status: freshWorker.status,
          rawImplementationReads: freshWorker.rawImplementationReads,
          implementationSearchCommands: freshWorker.implementationSearchCommands,
          verifierOwnedAccessBoundary: freshWorker.verifierOwnedAccessBoundary,
        },
        actualExternalModelSessionsExecuted: false,
        limitation: 'This deterministic CI harness reproduces shortcut strategies through public RefAs runtime surfaces; it does not spawn separate external GPT/Claude model sessions.',
      },
      cases: [
        {
          id: 'planar-billboard-shortcut',
          expected: 'BLOCK',
          classification: planar.classification.classification,
          barrierVerdict: planar.volumeBarrier.verdict,
          formalMultiviewPresent: true,
          downstreamAccepted: planarDownstream.accepted,
          failure: planarDownstream.error,
          firstMultiviewObservationMs: planarDownstream.elapsedMs,
        },
        {
          id: 'thin-shell-relabel-bypass',
          expected: 'BLOCK',
          frozenRole: roleAuthority.selectedExpectation.role,
          attemptedRole: 'thin-shell',
          blocked: relabel.blocked,
          failure: relabel.error,
        },
        {
          id: 'self-authored-pass',
          expected: 'BLOCK',
          blocked: selfAuthoredPass.blocked,
          failure: selfAuthoredPass.error,
        },
        {
          id: 'stale-evidence-reuse',
          expected: 'BLOCK_UNTIL_FRESH',
          blocked: staleLineage.staleEvidenceBlocked,
          failure: staleLineage.staleEvidenceError,
          freshEvidenceThenAccepted: staleLineage.currentHeadFreshEvidenceAccepted,
        },
        {
          id: 'selected-lineage-leakage',
          expected: 'BLOCK',
          blocked: staleLineage.selectedParentLineageLeakBlocked,
          failure: staleLineage.selectedParentLineageError,
        },
        {
          id: 'forged-final-continuity',
          expected: 'IGNORE',
          ignored: staleLineage.forgedContinuityIgnored,
          canonicalContinuityDigest: staleLineage.currentContinuityDigest,
        },
        {
          id: 'volumetric-positive',
          expected: 'ADMIT',
          classification: volumetric.classification.classification,
          barrierVerdict: volumetric.volumeBarrier.verdict,
          downstreamAccepted: volumetricDownstream.accepted,
        },
        {
          id: 'intentionally-thin-positive',
          expected: 'ADMIT_THINNESS',
          classification: thin.classification.classification,
          barrierVerdict: thin.volumeBarrier.verdict,
          downstreamAccepted: thinDownstream.accepted,
        },
        {
          id: 'synthetic-degenerate-negative',
          expected: 'BLOCK',
          classification: degenerate.classification.classification,
          barrierVerdict: degenerate.volumeBarrier.verdict,
          downstreamAccepted: degenerateDownstream.accepted,
          failure: degenerateDownstream.error,
        },
      ],
      policy: {
        singleViewIouAuthority: false,
        aggregateSpatialScore: false,
        assetSpecificThresholdsAdded: false,
        timeToFirstMultiviewIsCertificationCriterion: false,
      },
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    await Promise.all(cleanupRoots.map((root) => fs.rm(root, {recursive: true, force: true})));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await run();
  if (args.out) {
    const out = path.resolve(args.out);
    await fs.mkdir(path.dirname(out), {recursive: true});
    await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write('VC08 adversarial dogfood failed: ' + (error.stack || error.message) + '\n');
    process.exit(1);
  });
}

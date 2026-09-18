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
  assertArtifactHandoffCurrent,
  certifyProject,
  commitCheckpoint,
  contentReference,
  createPbrRenderReport,
  createVisualReview,
  digestBytes,
  getArtifactHandoff,
  getHostEvents,
  initProject,
  loadProject,
  openHostSession,
  validateArtifactHandoff,
} from '../skills/refas/scripts/lib/index.mjs';

async function tempProject(t, projectId = 'handoff-project') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-handoff-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await Promise.all([
    fs.mkdir(path.join(root, 'source'), {recursive: true}),
    fs.mkdir(path.join(root, 'model'), {recursive: true}),
  ]);
  const sourceBytes = Buffer.from('artifact handoff primary source bytes\n');
  const sourcePath = path.join(root, 'source', 'reference.bin');
  await fs.writeFile(sourcePath, sourceBytes);
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(sourceBytes),
    sizeBytes: sourceBytes.length,
    width: 48,
    height: 32,
    authority: 'primary',
    acquisition: {kind: 'test-fixture'},
  };
  await initProject(root, {projectId, source});
  return {root, source, artifactPath: path.join(root, 'model', 'candidate.glb')};
}

async function commitCandidate(root, artifactPath, bytes, capability = 'source-intake') {
  await fs.writeFile(artifactPath, Buffer.from(bytes));
  const artifact = await contentReference(artifactPath, {kind: 'glb', root});
  const checkpoint = await commitCheckpoint(root, {
    capability,
    scopeId: 'whole',
    reason: `${capability} artifact handoff fixture is trustworthy`,
    artifactRefs: [artifact],
    claims: [`${capability} candidate exists`],
    gates: [{id: `${capability}-gate`, evidenceRefs: [artifact.path]}],
  });
  return {artifact, checkpoint};
}

async function advanceThrough(root, artifactPath, lastCapability) {
  const checkpoints = [];
  for (const capability of CAPABILITY_ORDER) {
    const result = await commitCandidate(root, artifactPath, `trusted:${capability}\n`, capability);
    checkpoints.push(result.checkpoint);
    if (capability === lastCapability) break;
  }
  return checkpoints;
}

function reviewObservation(id) {
  return {
    sourceObservation: `The source ${id} evidence is visible in the bound reference.`,
    renderObservation: `The current ${id} render is visible in the bound candidate evidence.`,
    comparisonConclusion: `The ${id} comparison was directly reviewed for a blocking mismatch.`,
    evidenceRefs: [`renders/final/${id}.png`],
  };
}

function reviewInput({sourceSha256, assetSha256, renderReportSha256}) {
  return {
    scopeId: 'whole',
    sourceSha256,
    assetSha256,
    evidenceClass: 'independent-reference',
    verdict: 'pass',
    views: REQUIRED_REVIEW_VIEW_IDS.map((id) => ({
      id,
      status: 'pass',
      evidenceRefs: [`renders/final/${id}.png`],
      observation: reviewObservation(id),
      summary: `${id} was directly inspected against the bound reference evidence.`,
    })),
    gateVerdicts: REQUIRED_VISUAL_GATE_IDS.map((id) => ({
      id,
      status: 'pass',
      evidenceRefs: ['renders/final/multiview-review-board.png'],
      observation: reviewObservation(id),
      summary: `${id} was evaluated from current digest-bound review evidence.`,
    })),
    unresolvedFindings: [],
    registeredComparison: {
      path: 'reviews/registered-comparison/comparison-report.json',
      sha256: 'f'.repeat(64),
      comparisonDigest: '0'.repeat(64),
      sourceSha256,
      sourceManifestSha256: '1'.repeat(64),
      assetSha256,
      renderReportPath: 'renders/final/render-report.json',
      renderReportSha256: '2'.repeat(64),
      framePath: 'renders/final/hero.png',
      frameSha256: '3'.repeat(64),
      registrationDigest: '4'.repeat(64),
      hierarchyDigest: '5'.repeat(64),
      inputDigest: '6'.repeat(64),
      scopeIds: ['whole'],
    },
    comparisonAssessment: {
      sourceObservation: 'The source whole object and visible macro boundaries were inspected.',
      renderObservation: 'The current whole render and registered comparison were inspected.',
      comparisonConclusion: 'The comparison evidence is sufficient for this contract fixture.',
      evidenceRefs: ['source/reference.bin', 'reviews/registered-comparison/comparison-report.json'],
      contradictionResolution: {status: 'not-present', explanation: '', evidenceRefs: [], findingRefs: []},
    },
    renderer: {
      kind: 'test-visual-fidelity-renderer',
      family: 'threejs-webgl',
      reportRef: 'renders/final/render-report.json',
      reportSha256: renderReportSha256,
      independentProcess: true,
      claimScope: 'visual-fidelity',
      supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupportedMaterialFeatures: [],
    },
    requiredMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
    attestation: {attested: true, evidenceRefs: ['source/reference.bin', 'renders/final/multiview-review-board.png']},
  };
}

async function commitCertificationAttempt(root, artifactPath, source) {
  await fs.writeFile(artifactPath, Buffer.from('handoff certification candidate bytes\n'));
  const asset = await contentReference(artifactPath, {kind: 'glb', root});
  const renderDirectory = path.join(root, 'renders', 'final');
  await fs.mkdir(renderDirectory, {recursive: true});
  const frames = [];
  for (const viewId of REQUIRED_REVIEW_VIEW_IDS) {
    const framePath = path.join(renderDirectory, `${viewId}.png`);
    await fs.writeFile(framePath, Buffer.from(`handoff independent PBR ${viewId} frame bytes\n`));
    frames.push(await contentReference(framePath, {kind: 'render-frame', root}));
  }
  const reportPath = path.join(renderDirectory, 'render-report.json');
  const report = createPbrRenderReport({
    assetSha256: asset.sha256,
    frameDigest: 'd'.repeat(64),
    renderer: {family: 'threejs-webgl', name: 'Three.js', version: 'test', backend: 'headless-webgl', independentProcess: true},
    lighting: {rigId: 'fixed-review-rig', digest: 'e'.repeat(64)},
    colorPipeline: {exposure: 0, toneMapping: 'ACESFilmic', outputColorSpace: 'sRGB'},
    materialSupport: {supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'], unsupported: []},
    outputs: frames.map((frame, index) => ({viewId: REQUIRED_REVIEW_VIEW_IDS[index], path: frame.path, sha256: frame.sha256})),
    reproducibility: {mode: 'deterministic', tolerance: ''},
  });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const reportRef = await contentReference(reportPath, {kind: 'render-report', root});

  const review = createVisualReview(reviewInput({
    sourceSha256: source.sha256,
    assetSha256: asset.sha256,
    renderReportSha256: reportRef.sha256,
  }));
  const reviewPath = path.join(root, 'reviews', 'visual-review.json');
  await fs.mkdir(path.dirname(reviewPath), {recursive: true});
  await fs.writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  const reviewRef = await contentReference(reviewPath, {kind: 'visual-review', root});

  const gates = REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
    id,
    evidenceRefs: [REQUIRED_VISUAL_GATE_IDS.includes(id) ? reviewRef.path : asset.path],
  }));
  const checkpoint = await commitCheckpoint(root, {
    capability: 'whole-object-certification',
    scopeId: 'whole',
    reason: 'Artifact handoff certification fixture binds the exact candidate and closure evidence.',
    artifactRefs: [asset, reportRef, ...frames, reviewRef],
    claims: ['Certification remains owned by the existing RefAs certification gate.'],
    gates,
  });
  return {asset, checkpoint, review};
}

async function openFixtureSession(root, projectId = 'handoff-project') {
  return openHostSession(root, {sessionId: `${projectId}-session`, projectId});
}

test('artifact handoff is deterministic, exact-candidate bound, and read-only before certification', async (t) => {
  const {root, artifactPath} = await tempProject(t);
  const {artifact, checkpoint} = await commitCandidate(root, artifactPath, 'handoff candidate v1\n');
  await openFixtureSession(root);
  const beforeProject = await loadProject(root);
  const beforeEvents = await getHostEvents(root);

  const first = await getArtifactHandoff(root);
  const second = await getArtifactHandoff(root);
  const current = await assertArtifactHandoffCurrent(root, first);

  assert.deepEqual(second, first);
  assert.deepEqual(current, first);
  assert.equal(first.schema, 'refas.artifact-handoff/v1');
  assert.equal(first.sessionId, 'handoff-project-session');
  assert.equal(first.projectId, 'handoff-project');
  assert.equal(first.checkpointId, checkpoint.id);
  assert.equal(first.checkpointContentDigest, checkpoint.contentDigest);
  assert.deepEqual(first.artifact, {...artifact, schema: 'refas.content-reference/v1'});
  assert.equal(first.candidateTransactionDigest, null);
  assert.deepEqual(first.certification, {status: 'uncertified', certificateDigest: null});
  assert.equal(first.policy.handoffCannotCertify, true);
  assert.deepEqual(validateArtifactHandoff(first), {valid: true, errors: []});
  assert.deepEqual(await loadProject(root), beforeProject);
  assert.deepEqual(await getHostEvents(root), beforeEvents);
});

test('artifact handoff fails closed when the current checkpoint has no GLB or candidate bytes drift', async (t) => {
  const {root, artifactPath} = await tempProject(t, 'missing-glb-project');
  await fs.writeFile(artifactPath, Buffer.from('not a GLB handoff artifact\n'));
  const nonGlb = await contentReference(artifactPath, {kind: 'model-spec', root});
  await commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'Non-GLB fixture remains recoverable.', artifactRefs: [nonGlb],
    gates: [{id: 'source-intake-gate', evidenceRefs: [nonGlb.path]}],
  });
  await openFixtureSession(root, 'missing-glb-project');
  await assert.rejects(getArtifactHandoff(root), /requires a content reference|requires one unambiguous current GLB candidate/);

  const other = await tempProject(t, 'drift-project');
  await commitCandidate(other.root, other.artifactPath, 'exact candidate bytes\n');
  await openFixtureSession(other.root, 'drift-project');
  await fs.writeFile(other.artifactPath, Buffer.from('drifted candidate bytes after checkpoint\n'));
  await assert.rejects(getArtifactHandoff(other.root), /current candidate size does not match|current candidate digest does not match/);
});

test('an intrinsically valid handoff is rejected after current candidate replacement', async (t) => {
  const {root, artifactPath} = await tempProject(t, 'stale-project');
  await commitCandidate(root, artifactPath, 'candidate generation one\n');
  await openFixtureSession(root, 'stale-project');
  const first = await getArtifactHandoff(root);

  await commitCandidate(root, artifactPath, 'candidate generation two with different bytes\n');
  const second = await getArtifactHandoff(root);
  assert.notEqual(second.checkpointId, first.checkpointId);
  assert.notEqual(second.artifact.sha256, first.artifact.sha256);
  assert.notEqual(second.handoffDigest, first.handoffDigest);
  assert.deepEqual(validateArtifactHandoff(first), {valid: true, errors: []});
  await assert.rejects(
    assertArtifactHandoffCurrent(root, first),
    /artifact handoff is stale for the current session, checkpoint, candidate, transaction, or certification state/,
  );
});

test('artifact handoff projects existing candidate transaction readiness and exact certificate state', async (t) => {
  const projectId = 'certified-handoff-project';
  const {root, artifactPath, source} = await tempProject(t, projectId);
  await advanceThrough(root, artifactPath, 'visual-critique');
  const {asset, checkpoint} = await commitCertificationAttempt(root, artifactPath, source);
  await openFixtureSession(root, projectId);

  const ready = await getArtifactHandoff(root);
  assert.equal(ready.checkpointId, checkpoint.id);
  assert.equal(ready.artifact.sha256, asset.sha256);
  assert.equal(ready.certification.status, 'ready');
  assert.match(ready.candidateTransactionDigest, /^[a-f0-9]{64}$/);
  assert.equal(ready.certification.certificateDigest, null);

  const certificate = await certifyProject(root);
  const certified = await getArtifactHandoff(root);
  assert.equal(certified.certification.status, 'certified');
  assert.equal(certified.certification.certificateDigest, certificate.certificateDigest);
  assert.equal(certified.candidateTransactionDigest, ready.candidateTransactionDigest);
  assert.deepEqual(validateArtifactHandoff(certified), {valid: true, errors: []});
  await assert.rejects(assertArtifactHandoffCurrent(root, ready), /artifact handoff is stale/);
  assert.deepEqual(await assertArtifactHandoffCurrent(root, certified), certified);
});

test('certified handoff fails closed when certificate claim binding is tampered', async (t) => {
  const projectId = 'tampered-certificate-project';
  const {root, artifactPath, source} = await tempProject(t, projectId);
  await advanceThrough(root, artifactPath, 'visual-critique');
  await commitCertificationAttempt(root, artifactPath, source);
  await openFixtureSession(root, projectId);
  await certifyProject(root);
  const certificatePath = path.join(root, '.refas', 'certification.json');
  const certificate = JSON.parse(await fs.readFile(certificatePath, 'utf8'));
  certificate.claimCertification.transaction.transactionDigest = 'f'.repeat(64);
  await fs.writeFile(certificatePath, `${JSON.stringify(certificate, null, 2)}\n`);
  await assert.rejects(
    getArtifactHandoff(root),
    /failed RefAs project audit|candidate transaction does not match/,
  );
});

test('artifact handoff detects current checkpoint identity tampering and hidden field injection', async (t) => {
  const {root, artifactPath} = await tempProject(t, 'tampered-checkpoint-project');
  const {checkpoint} = await commitCandidate(root, artifactPath, 'checkpoint tamper candidate\n');
  await openFixtureSession(root, 'tampered-checkpoint-project');
  const handoff = await getArtifactHandoff(root);

  const injected = structuredClone(handoff);
  injected.reasoning = 'hidden host reasoning must not enter the public handoff';
  assert.equal(validateArtifactHandoff(injected).valid, false);
  assert.match(validateArtifactHandoff(injected).errors.join('\n'), /unsupported fields/);

  const checkpointPath = path.join(root, '.refas', 'checkpoints', `${checkpoint.id}.json`);
  const document = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
  document.reason = 'tampered after checkpoint commit';
  await fs.writeFile(checkpointPath, `${JSON.stringify(document, null, 2)}\n`);
  await assert.rejects(getArtifactHandoff(root), /checkpoint content digest mismatch/);
});

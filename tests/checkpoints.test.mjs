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
  abortEdit,
  assessCertification,
  auditProject,
  beginEdit,
  certifyProject,
  commitCheckpoint,
  contentReference,
  createVisualReview,
  digestBytes,
  finishEdit,
  initProject,
  loadProject,
  reportFinding,
  restoreCheckpoint,
  resumeProject,
} from '../skills/refas/scripts/lib/index.mjs';

async function makeProject(t, projectId = 'checkpoint-study') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  const sourceBytes = Buffer.from('immutable primary source bytes\n');
  await fs.writeFile(path.join(root, 'source', 'reference.bin'), sourceBytes);
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(sourceBytes),
    sizeBytes: sourceBytes.length,
    width: 32,
    height: 24,
    authority: 'primary',
    acquisition: {kind: 'test-fixture'},
  };
  await initProject(root, {projectId, source});
  await fs.mkdir(path.join(root, 'model'), {recursive: true});
  return {root, source, artifactPath: path.join(root, 'model', 'state.bin')};
}

async function writeArtifact(root, file, bytes, kind = 'model-spec') {
  await fs.writeFile(file, bytes);
  return contentReference(file, {kind, root});
}

async function checkpoint(root, artifactPath, capability, content, scopeId = 'whole', gates = null) {
  const artifact = await writeArtifact(root, artifactPath, Buffer.from(content));
  return commitCheckpoint(root, {
    capability,
    scopeId,
    reason: `${capability} fixture is trustworthy`,
    artifactRefs: [artifact],
    claims: [`${capability} closed`],
    gates: gates ?? [{id: `${capability}-gate`, status: 'pass', evidenceRefs: [artifact.path]}],
  });
}

async function advanceThrough(root, artifactPath, lastCapability) {
  const checkpoints = [];
  for (const capability of CAPABILITY_ORDER) {
    checkpoints.push(await checkpoint(root, artifactPath, capability, `trusted:${capability}\n`));
    if (capability === lastCapability) break;
  }
  return checkpoints;
}

function reviewInput({sourceSha256, assetSha256, evidenceClass = 'independent-reference', verdict = 'pass', gateStatuses = {}, unresolvedFindings = [], renderer = {}, requiredMaterialFeatures = ['base-color-factor', 'metallic-factor', 'roughness-factor']}) {
  return {
    scopeId: 'whole',
    sourceSha256,
    assetSha256,
    evidenceClass,
    verdict,
    views: REQUIRED_REVIEW_VIEW_IDS.map((id) => ({id, status: 'pass', evidenceRefs: [`renders/final/${id}.png`]})),
    gateVerdicts: REQUIRED_VISUAL_GATE_IDS.map((id) => ({id, status: gateStatuses[id] ?? 'pass', evidenceRefs: ['renders/final/multiview-review-board.png']})),
    unresolvedFindings,
    renderer: {
      kind: 'test-visual-fidelity-renderer',
      reportRef: 'renders/final/render-report.json',
      claimScope: 'visual-fidelity',
      supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupportedMaterialFeatures: [],
      ...renderer,
    },
    requiredMaterialFeatures,
    attestation: {attested: true, evidenceRefs: ['source/reference.bin', 'renders/final/multiview-review-board.png']},
  };
}

async function commitCertificationAttempt(root, artifactPath, source, {includeReview = true, reviewOverrides = {}} = {}) {
  await fs.writeFile(artifactPath, Buffer.from('candidate asset bytes\n'));
  const asset = await contentReference(artifactPath, {kind: 'glb', root});
  const renderPath = path.join(root, 'renders', 'final', 'render-report.json');
  await fs.mkdir(path.dirname(renderPath), {recursive: true});
  await fs.writeFile(renderPath, `${JSON.stringify({schema: 'refas.multiview-render-report/v1', claimScope: 'visual-fidelity'})}\n`);
  const renderReport = await contentReference(renderPath, {kind: 'render-report', root});
  const artifactRefs = [asset, renderReport];
  let review = null;
  let reviewPath = 'reviews/visual-review.json';
  if (includeReview) {
    review = createVisualReview(reviewInput({sourceSha256: source.sha256, assetSha256: asset.sha256, ...reviewOverrides}));
    const absoluteReviewPath = path.join(root, reviewPath);
    await fs.mkdir(path.dirname(absoluteReviewPath), {recursive: true});
    await fs.writeFile(absoluteReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    artifactRefs.push(await contentReference(absoluteReviewPath, {kind: 'visual-review', root}));
  }
  const gates = REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
    id,
    status: 'pass',
    evidenceRefs: [REQUIRED_VISUAL_GATE_IDS.includes(id) ? reviewPath : asset.path],
  }));
  const checkpoint = await commitCheckpoint(root, {
    capability: 'whole-object-certification', scopeId: 'whole', reason: 'Certification attempt binds the candidate and declared closure evidence.',
    artifactRefs, claims: ['Certification is issued only if the runtime independently accepts the visual review.'], gates,
  });
  return {checkpoint, review, asset};
}

test('checkpoint restore materializes exact content-addressed artifact bytes', async (t) => {
  const {root, artifactPath} = await makeProject(t);
  const [source, hierarchy, observation] = await advanceThrough(root, artifactPath, 'visual-observation');
  assert.notEqual(source.id, hierarchy.id);
  assert.notEqual(hierarchy.id, observation.id);

  await fs.writeFile(artifactPath, Buffer.from('untrusted mutation\n'));
  const drifted = await auditProject(root);
  assert.equal(drifted.valid, false);
  assert.match(drifted.errors.join('\n'), /head artifact drift/);

  const result = await restoreCheckpoint(root, source.id, {reason: 'return to source truth'});
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:source-intake\n');
  assert.equal(result.nextCapability, 'visual-hierarchy');
  const guidance = await resumeProject(root);
  assert.equal(guidance.activeWork.capability, 'visual-hierarchy');
  assert.equal(guidance.nextAction, 'BEGIN_REPAIR_EDIT');
  assert.equal((await auditProject(root)).valid, true);
});

test('failed bounded edit restores baseline bytes and preserves rejected candidate history', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'bounded-edit-study');
  const checkpoints = await advanceThrough(root, artifactPath, 'assembly');
  const baseline = checkpoints.at(-1);
  const baselineBytes = await fs.readFile(artifactPath);

  await beginEdit(root, {ownerCapability: 'assembly', scopeId: 'whole', intent: 'test fastener root placement', protectedMetrics: ['attachment']});
  const candidate = await checkpoint(root, artifactPath, 'assembly', 'candidate:floating-fastener\n');
  const decision = await finishEdit(root, {
    candidateCheckpointId: candidate.id,
    before: {checkpointId: baseline.id, evidenceRefs: ['renders/before-grazing.png'], utilityScore: 0.82},
    after: {checkpointId: candidate.id, evidenceRefs: ['renders/after-grazing.png'], utilityScore: 0.9},
    findings: [{category: 'attachment-mismatch', severity: 'major', scopeId: 'whole.fastener', summary: 'The fastener floats above the shell.', evidenceRefs: ['renders/after-grazing.png'], introducedByEdit: true}],
  });
  assert.equal(decision.action, 'ROLLBACK_EDIT');
  assert.equal((await fs.readFile(artifactPath)).equals(baselineBytes), true);
  const state = await loadProject(root);
  assert.equal(state.head, baseline.id);
  assert.ok(state.checkpointIds.includes(candidate.id));
  assert.equal((await auditProject(root)).valid, true);
});

test('abort edit restores the baseline even before a candidate checkpoint exists', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'abort-study');
  const [baseline] = await advanceThrough(root, artifactPath, 'source-intake');
  await beginEdit(root, {ownerCapability: 'visual-hierarchy', scopeId: 'whole', intent: 'test a hierarchy alternative'});
  await fs.writeFile(artifactPath, Buffer.from('uncheckpointed and unsafe\n'));
  const decision = await abortEdit(root, {reason: 'evidence disproved the branch'});
  assert.equal(decision.baselineCheckpointId, baseline.id);
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:source-intake\n');
  assert.equal((await auditProject(root)).valid, true);
});

test('typed finding applies rollback state and resume selects the first invalidated owner', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'routing-study');
  const checkpoints = await advanceThrough(root, artifactPath, 'assembly');
  const spatial = checkpoints.find((item) => item.capability === 'spatial-hypotheses');
  const decision = await reportFinding(root, {
    finding: {category: 'silhouette-mismatch', severity: 'major', scopeId: 'whole', summary: 'Outer contour is too narrow.', evidenceRefs: ['renders/hero.png']},
  });
  assert.equal(decision.route.ownerCapability, 'shape-reconstruction');
  assert.equal(decision.route.rollbackCheckpointId, spatial.id);
  assert.equal((await fs.readFile(artifactPath, 'utf8')), 'trusted:spatial-hypotheses\n');
  const guidance = await resumeProject(root);
  assert.equal(guidance.activeWork.capability, 'shape-reconstruction');
  assert.deepEqual(guidance.invalidatedCapabilities.slice(0, 3), ['shape-reconstruction', 'surface-topology', 'assembly']);
  assert.equal((await auditProject(root)).valid, true);
});

test('artifact paths cannot escape the project through traversal or symlinks', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'containment-study');
  await fs.writeFile(artifactPath, Buffer.from('safe\n'));
  const fake = {kind: 'model-spec', path: '../escape.bin', sha256: digestBytes(Buffer.from('safe\n')), sizeBytes: 5};
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'unsafe path should fail', artifactRefs: [fake],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /escapes the project root/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'internal path should fail',
    artifactRefs: [{...fake, path: '.refas/project.json'}],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /internal state/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'empty artifact set should fail', artifactRefs: [],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /recoverable artifact/);

  const safeRef = await contentReference(artifactPath, {root});
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'evidence-free gate should fail', artifactRefs: [safeRef],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: []}],
  }), /current evidenceRefs/);

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-outside-'));
  t.after(() => fs.rm(outside, {recursive: true, force: true}));
  await fs.writeFile(path.join(outside, 'payload.bin'), Buffer.from('outside\n'));
  await fs.symlink(outside, path.join(root, 'model', 'outside-link'));
  const linked = {...await contentReference(path.join(outside, 'payload.bin'), {root}), path: 'model/outside-link/payload.bin'};
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'symlink should fail', artifactRefs: [linked],
    gates: [{id: 'source-gate', status: 'pass', evidenceRefs: ['source/reference.bin']}],
  }), /outside the project root/);
});

test('whole-object certification requires an independent digest-bound review and survives audit', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'certification-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  const {checkpoint: head, review} = await commitCertificationAttempt(root, artifactPath, source);
  const certificate = await certifyProject(root);
  assert.equal(certificate.checkpointId, head.id);
  assert.equal(certificate.sourceSha256, source.sha256);
  assert.equal(certificate.version, '1.0.0');
  assert.equal(certificate.visualReview.reviewDigest, review.reviewDigest);
  assert.equal(certificate.visualReview.evidenceClass, 'independent-reference');
  const guidance = await resumeProject(root);
  assert.equal(guidance.nextAction, 'DONE');
  assert.equal((await auditProject(root)).valid, true);

  await beginEdit(root, {ownerCapability: 'whole-object-certification', scopeId: 'whole', intent: 'reassess closure evidence'});
  const state = await loadProject(root);
  assert.equal(state.certification, null);
  await abortEdit(root, {reason: 'no change required'});
});

test('certification fails closed when the visual-review artifact is missing', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'missing-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await commitCertificationAttempt(root, artifactPath, source, {includeReview: false});
  await assert.rejects(() => certifyProject(root), /exactly one digest-bound visual-review artifact/);
  assert.equal((await assessCertification(root)).ready, false);
  assert.equal((await resumeProject(root)).nextAction, 'REQUEST_VISUAL_REVIEW');
});

test('self-generated contract fixtures cannot certify visual fidelity', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'self-generated-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await commitCertificationAttempt(root, artifactPath, source, {reviewOverrides: {evidenceClass: 'self-generated-contract-fixture'}});
  await assert.rejects(() => certifyProject(root), /self-generated contract fixtures cannot certify visual fidelity/);
});

test('unresolved major visual findings prevent certification', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'blocking-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await commitCertificationAttempt(root, artifactPath, source, {reviewOverrides: {
    verdict: 'fail',
    gateStatuses: {'silhouette-and-mass': 'fail'},
    unresolvedFindings: [{category: 'curvature-mismatch', severity: 'major', scopeId: 'whole', summary: 'The side profile is flat instead of folded.', evidenceRefs: ['renders/final/side.png']}],
  }});
  await assert.rejects(() => certifyProject(root), /unresolved major, critical, or blocking findings: curvature-mismatch/);
});

test('render-integrity-only output cannot pass appearance or unsupported material features', () => {
  assert.throws(() => createVisualReview(reviewInput({
    sourceSha256: 'a'.repeat(64),
    assetSha256: 'b'.repeat(64),
    renderer: {
      claimScope: 'render-integrity-only',
      supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupportedMaterialFeatures: ['clearcoat'],
    },
  })), /appearance-plausibility cannot pass with a render-integrity-only renderer/);
  assert.throws(() => createVisualReview(reviewInput({
    sourceSha256: 'a'.repeat(64),
    assetSha256: 'b'.repeat(64),
    requiredMaterialFeatures: ['base-color-factor', 'clearcoat'],
    renderer: {
      claimScope: 'visual-fidelity',
      supportedMaterialFeatures: ['base-color-factor'],
      unsupportedMaterialFeatures: ['clearcoat'],
    },
  })), /renderer does not support: clearcoat/);
});

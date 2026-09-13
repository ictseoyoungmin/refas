import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  commitCheckpoint,
  contentReference,
  createVisualReview,
  digestBytes,
  getHostEvents,
  getHostReviewBundle,
  initProject,
  loadCheckpoint,
  loadProject,
  openHostSession,
  publishHostReviewBundle,
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  validateHostReviewBundle,
} from '../skills/refas/scripts/lib/index.mjs';

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-host-review-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}

async function sourceFixture(root, projectId = 'review-project') {
  await fs.mkdir(path.join(root, 'source'), {recursive: true});
  const bytes = Buffer.from('host review source bytes\n');
  const sourcePath = path.join(root, 'source', 'reference.bin');
  await fs.writeFile(sourcePath, bytes);
  const source = {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: digestBytes(bytes),
    sizeBytes: bytes.length,
    width: 64,
    height: 64,
    authority: 'primary',
    acquisition: {kind: 'test-fixture'},
  };
  await initProject(root, {projectId, source});
  return source;
}

function pendingVerdicts(ids, evidencePath) {
  return ids.map((id) => ({
    id,
    status: 'insufficient',
    evidenceRefs: [evidencePath],
    summary: `${id} remains review evidence only.`,
  }));
}

async function reviewCheckpointFixture(root, {reviewAssetSha256 = null, includeRenderer = true} = {}) {
  const source = await sourceFixture(root);
  await Promise.all([
    fs.mkdir(path.join(root, 'model'), {recursive: true}),
    fs.mkdir(path.join(root, 'renders'), {recursive: true}),
    fs.mkdir(path.join(root, 'reviews'), {recursive: true}),
  ]);

  const candidatePath = path.join(root, 'model', 'candidate.glb');
  const renderPath = path.join(root, 'renders', 'hero.png');
  const reportPath = path.join(root, 'renders', 'portable-report.json');
  await fs.writeFile(candidatePath, Buffer.from('exact host review GLB bytes\n'));
  await fs.writeFile(renderPath, Buffer.from('exact rendered evidence bytes\n'));
  await fs.writeFile(reportPath, `${JSON.stringify({schema:'test.render-report/v1', claimScope:'render-integrity-only'})}\n`);

  const candidate = await contentReference(candidatePath, {kind:'glb', root});
  const render = await contentReference(renderPath, {kind:'render-image', root});
  const report = await contentReference(reportPath, {kind:'render-report', root});
  const review = createVisualReview({
    scopeId: 'whole',
    sourceSha256: source.sha256,
    assetSha256: reviewAssetSha256 ?? candidate.sha256,
    evidenceClass: 'self-generated-contract-fixture',
    verdict: 'insufficient',
    views: pendingVerdicts(REQUIRED_REVIEW_VIEW_IDS, render.path),
    gateVerdicts: pendingVerdicts(REQUIRED_VISUAL_GATE_IDS, render.path),
    unresolvedFindings: [{
      category: 'evidence-insufficient',
      severity: 'minor',
      scopeId: 'whole',
      summary: 'Review fixture intentionally remains insufficient.',
      evidenceRefs: [render.path],
    }],
    renderer: {
      kind: 'portable-test',
      family: 'other',
      reportRef: report.path,
      reportSha256: report.sha256,
      independentProcess: false,
      claimScope: 'render-integrity-only',
      supportedMaterialFeatures: [],
      unsupportedMaterialFeatures: [],
    },
    requiredMaterialFeatures: [],
    attestation: {attested:true, evidenceRefs:[render.path]},
  });
  const reviewPath = path.join(root, 'reviews', 'visual-review.json');
  await fs.writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  const reviewRef = await contentReference(reviewPath, {kind:'visual-review', root});

  const artifactRefs = [candidate, render, reviewRef];
  if (includeRenderer) artifactRefs.splice(2, 0, report);
  const checkpoint = await commitCheckpoint(root, {
    capability: 'source-intake',
    scopeId: 'whole',
    reason: 'Host review bundle fixture seals exact reviewable bytes.',
    artifactRefs,
    claims: ['Review evidence remains presentation-only.'],
    gates: [{id:'source-intake-gate', status:'pass', evidenceRefs:[candidate.path, render.path, reviewRef.path]}],
  });
  await openHostSession(root, {sessionId:'review-session', projectId:'review-project'});
  return {source, candidate, render, report, reviewRef, checkpoint, candidatePath, renderPath, reportPath, reviewPath};
}

test('host review bundle is deterministic, exact-byte bound, and read-only', async (t) => {
  const root = await tempRoot(t);
  const fixture = await reviewCheckpointFixture(root);
  const beforeProject = await loadProject(root);
  const beforeCheckpoint = await loadCheckpoint(root, fixture.checkpoint.id);
  const beforeEvents = await getHostEvents(root);

  const first = await getHostReviewBundle(root);
  const second = await getHostReviewBundle(root);

  assert.deepEqual(second, first);
  assert.equal(first.schema, 'refas.host-review-bundle/v1');
  assert.equal(first.sessionId, 'review-session');
  assert.equal(first.projectId, 'review-project');
  assert.equal(first.checkpoint.id, fixture.checkpoint.id);
  assert.equal(first.checkpoint.contentDigest, fixture.checkpoint.contentDigest);
  assert.equal(first.source.sha256, fixture.source.sha256);
  assert.equal(first.candidate.sha256, fixture.candidate.sha256);
  assert.deepEqual(first.artifactKinds, ['glb','render-image','render-report','visual-review']);
  assert.equal(first.review.verdict, 'insufficient');
  assert.equal(first.review.reference.sha256, fixture.reviewRef.sha256);
  assert.equal(first.review.renderer.reference.sha256, fixture.report.sha256);
  assert.equal(first.review.unresolvedFindings.length, 1);
  assert.equal(first.policy.bundleCannotCertify, true);
  assert.deepEqual(validateHostReviewBundle(first), {valid:true, errors:[]});

  assert.deepEqual(await loadProject(root), beforeProject);
  assert.deepEqual(await loadCheckpoint(root, fixture.checkpoint.id), beforeCheckpoint);
  assert.deepEqual(await getHostEvents(root), beforeEvents);
});

test('host review bundle fails closed on checkpoint-bound artifact byte drift', async (t) => {
  const root = await tempRoot(t);
  const fixture = await reviewCheckpointFixture(root);
  await fs.writeFile(fixture.renderPath, Buffer.from('drifted rendered evidence bytes\n'));
  await assert.rejects(
    getHostReviewBundle(root),
    /checkpoint artifact .* size does not match exact bytes|checkpoint artifact .* digest does not match exact bytes/,
  );
});

test('host review bundle rejects checkpoint identity tampering', async (t) => {
  const root = await tempRoot(t);
  const fixture = await reviewCheckpointFixture(root);
  const checkpointPath = path.join(root, '.refas', 'checkpoints', `${fixture.checkpoint.id}.json`);
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
  checkpoint.reason = 'tampered checkpoint reason';
  await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await assert.rejects(getHostReviewBundle(root), /checkpoint content digest mismatch/);
});

test('visual review projection must bind the exact current candidate and renderer evidence', async (t) => {
  const root = await tempRoot(t);
  await reviewCheckpointFixture(root, {reviewAssetSha256:digestBytes(Buffer.from('different candidate'))});
  await assert.rejects(getHostReviewBundle(root), /visual review asset digest does not match the current candidate/);

  const otherRoot = await tempRoot(t);
  await reviewCheckpointFixture(otherRoot, {includeRenderer:false});
  await assert.rejects(getHostReviewBundle(otherRoot), /visual review renderer report is not uniquely digest-bound/);
});

test('publishing a host review bundle creates one exact presentation artifact and generic host event', async (t) => {
  const root = await tempRoot(t);
  await reviewCheckpointFixture(root);
  const beforeProject = await loadProject(root);
  const publication = await publishHostReviewBundle(root);

  assert.equal(publication.reference.schema, 'refas.content-reference/v1');
  assert.equal(publication.reference.kind, 'host-review-bundle');
  assert.equal(publication.event.kind, 'review-bundle-ready');
  assert.deepEqual(publication.event.artifactRefs, [publication.reference]);

  const published = JSON.parse(await fs.readFile(path.join(root, publication.reference.path), 'utf8'));
  assert.deepEqual(published, publication.bundle);
  assert.deepEqual(validateHostReviewBundle(published), {valid:true, errors:[]});
  assert.deepEqual(await loadProject(root), beforeProject);

  const events = await getHostEvents(root);
  assert.equal(events.at(-1).kind, 'review-bundle-ready');
  assert.equal(events.at(-1).scopeId, publication.bundle.checkpoint.scopeId);
  assert.equal(events.at(-1).capability, publication.bundle.checkpoint.capability);
});

test('published review bundle bytes are fail-closed instead of silently overwritten', async (t) => {
  const root = await tempRoot(t);
  await reviewCheckpointFixture(root);
  const first = await publishHostReviewBundle(root);
  await fs.writeFile(path.join(root, first.reference.path), '{"tampered":true}\n');
  await assert.rejects(
    publishHostReviewBundle(root),
    /existing host review bundle publication bytes do not match the current bundle/,
  );
});

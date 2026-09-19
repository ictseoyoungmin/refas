import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CAPABILITY_ORDER,
  CHECKPOINT_GATE_EXECUTABLE_POLICY_SCHEMA,
  CHECKPOINT_GATE_POLICY_DIGEST,
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  abortEdit,
  assessCertification,
  auditProject,
  beginEdit,
  certifyProject,
  checkpointGatePolicyDigest,
  commitCheckpoint,
  contentReference,
  createVisualReview,
  createPbrRenderReport,
  digestBytes,
  digestJson,
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
    gates: gates ?? [{id: `${capability}-gate`, evidenceRefs: [artifact.path]}],
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

async function rewriteCheckpointAsLegacyV1(root, checkpoint, {evidenceRefsByGate = {}, gateIds = {}} = {}) {
  const currentPath = path.join(root, '.refas', 'checkpoints', `${checkpoint.id}.json`);
  const legacy = JSON.parse(await fs.readFile(currentPath, 'utf8'));
  legacy.gates = legacy.gates.map((gate) => ({
    id: gateIds[gate.id] ?? gate.id,
    status: gate.status,
    evidenceRefs: evidenceRefsByGate[gate.id] ?? gate.evidenceRefs,
  }));
  const content = {
    schema: legacy.schema,
    parentId: legacy.parentId,
    capability: legacy.capability,
    scopeId: legacy.scopeId,
    reason: legacy.reason,
    artifactRefs: legacy.artifactRefs,
    claims: legacy.claims,
    gates: legacy.gates,
    metadata: legacy.metadata,
    transactionId: legacy.transactionId,
  };
  legacy.contentDigest = digestJson(content);
  const previousId = legacy.id;
  legacy.id = `cp_${legacy.contentDigest.slice(0, 20)}`;
  const legacyPath = path.join(root, '.refas', 'checkpoints', `${legacy.id}.json`);
  await fs.writeFile(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`);
  if (legacyPath !== currentPath) await fs.rm(currentPath);

  const projectPath = path.join(root, '.refas', 'project.json');
  const project = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  project.checkpointIds = project.checkpointIds.map((id) => id === previousId ? legacy.id : id);
  if (project.head === previousId) project.head = legacy.id;
  await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  return legacy;
}

function reviewInput({sourceSha256, assetSha256, evidenceClass = 'independent-reference', verdict = 'pass', gateStatuses = {}, unresolvedFindings = [], renderer = {}, requiredMaterialFeatures = ['base-color-factor', 'metallic-factor', 'roughness-factor']}) {
  const observation = (id) => ({
    sourceObservation: `The source ${id} evidence is visible in the bound reference.`,
    renderObservation: `The current ${id} render is visible in the bound candidate evidence.`,
    comparisonConclusion: `The ${id} comparison was directly reviewed for a blocking mismatch.`,
    evidenceRefs: [`renders/final/${id}.png`],
  });
  return {
    scopeId: 'whole',
    sourceSha256,
    assetSha256,
    evidenceClass,
    verdict,
    views: REQUIRED_REVIEW_VIEW_IDS.map((id) => ({
      id,
      status: 'pass',
      evidenceRefs: [`renders/final/${id}.png`],
      observation: observation(id),
      summary: `${id} was directly inspected against the bound reference evidence.`,
    })),
    gateVerdicts: REQUIRED_VISUAL_GATE_IDS.map((id) => ({
      id,
      status: gateStatuses[id] ?? 'pass',
      evidenceRefs: ['renders/final/multiview-review-board.png'],
      observation: (gateStatuses[id] ?? 'pass') === 'pass' ? observation(id) : undefined,
      summary: `${id} was evaluated from current digest-bound review evidence.`,
    })),
    unresolvedFindings,
    registeredComparison: {
      path: 'reviews/registered-comparison/comparison-report.json', sha256: 'f'.repeat(64), comparisonDigest: '0'.repeat(64),
      sourceSha256, sourceManifestSha256: '1'.repeat(64), assetSha256,
      renderReportPath: 'renders/final/render-report.json', renderReportSha256: '2'.repeat(64), framePath: 'renders/final/hero.png', frameSha256: '3'.repeat(64),
      registrationDigest: '4'.repeat(64), hierarchyDigest: '5'.repeat(64), inputDigest: '6'.repeat(64), scopeIds: ['whole'],
    },
    comparisonAssessment: {
      sourceObservation: 'The source whole object and its visible macro boundaries were inspected.',
      renderObservation: 'The current whole render and registered comparison board were inspected.',
      comparisonConclusion: 'The registered comparison is sufficient for this review.',
      evidenceRefs: ['source/reference.bin', 'reviews/registered-comparison/comparison-report.json'],
      contradictionResolution: {status: 'not-present', explanation: '', evidenceRefs: [], findingRefs: []},
    },
    renderer: {
      kind: 'test-visual-fidelity-renderer',
      family: 'threejs-webgl',
      reportRef: 'renders/final/render-report.json',
      reportSha256: 'c'.repeat(64),
      independentProcess: true,
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
  const frames = [];
  for (const viewId of REQUIRED_REVIEW_VIEW_IDS) {
    const framePath = path.join(root, 'renders', 'final', `${viewId}.png`);
    await fs.writeFile(framePath, Buffer.from(`independent PBR ${viewId} frame bytes\n`));
    frames.push(await contentReference(framePath, {kind: 'render-frame', root}));
  }
  const pbrReport = createPbrRenderReport({
    assetSha256: asset.sha256, frameDigest: 'd'.repeat(64),
    renderer: {family: 'threejs-webgl', name: 'Three.js', version: 'test', backend: 'headless-webgl', independentProcess: true},
    lighting: {rigId: 'fixed-review-rig', digest: 'e'.repeat(64)},
    colorPipeline: {exposure: 0, toneMapping: 'ACESFilmic', outputColorSpace: 'sRGB'},
    materialSupport: {supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'], unsupported: []},
    outputs: frames.map((frame, index) => ({viewId: REQUIRED_REVIEW_VIEW_IDS[index], path: frame.path, sha256: frame.sha256})), reproducibility: {mode: 'deterministic', tolerance: ''},
  });
  await fs.writeFile(renderPath, `${JSON.stringify(pbrReport, null, 2)}\n`);
  const renderReport = await contentReference(renderPath, {kind: 'render-report', root});
  const artifactRefs = [asset, renderReport, ...frames];
  let review = null;
  let reviewPath = 'reviews/visual-review.json';
  if (includeReview) {
    review = createVisualReview(reviewInput({sourceSha256: source.sha256, assetSha256: asset.sha256, renderer: {reportSha256: renderReport.sha256}, ...reviewOverrides}));
    const absoluteReviewPath = path.join(root, reviewPath);
    await fs.mkdir(path.dirname(absoluteReviewPath), {recursive: true});
    await fs.writeFile(absoluteReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    artifactRefs.push(await contentReference(absoluteReviewPath, {kind: 'visual-review', root}));
  }
  const gates = REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
    id,
    evidenceRefs: [REQUIRED_VISUAL_GATE_IDS.includes(id) ? reviewPath : asset.path],
  }));
  const checkpoint = await commitCheckpoint(root, {
    capability: 'whole-object-certification', scopeId: 'whole', reason: 'Certification attempt binds the candidate and declared closure evidence.',
    artifactRefs, claims: ['Certification is issued only if the runtime independently accepts the visual review.'], gates,
  });
  return {checkpoint, review, asset};
}

test('checkpoint gate verdicts bind only to scoped executable policy', () => {
  const scoped = checkpointGatePolicyDigest('source-intake', 'source-intake-gate');
  const expected = digestJson({
    schema: CHECKPOINT_GATE_EXECUTABLE_POLICY_SCHEMA,
    capability: 'source-intake',
    id: 'source-intake-gate',
    evaluator: 'bound-evidence',
  });
  assert.equal(scoped, expected);
  assert.notEqual(scoped, CHECKPOINT_GATE_POLICY_DIGEST);
  assert.notEqual(scoped, checkpointGatePolicyDigest('visual-hierarchy', 'visual-hierarchy-gate'));
});

test('legacy refas.checkpoint/v1 gates are re-evaluated on read and remain usable', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'legacy-gate-read-study');
  const sourceCheckpoint = await checkpoint(root, artifactPath, 'source-intake', 'trusted:source-intake\n');
  const legacy = await rewriteCheckpointAsLegacyV1(root, sourceCheckpoint, {
    gateIds: {'source-intake-gate': 'legacy-source-evidence'},
  });

  assert.deepEqual(Object.keys(legacy.gates[0]).sort(), ['evidenceRefs', 'id', 'status']);
  const legacyAudit = await auditProject(root);
  assert.equal(legacyAudit.valid, true, legacyAudit.errors.join('\n'));

  const hierarchy = await checkpoint(root, artifactPath, 'visual-hierarchy', 'trusted:visual-hierarchy\n');
  assert.equal(hierarchy.parentId, legacy.id);
  const finalAudit = await auditProject(root);
  assert.equal(finalAudit.valid, true, finalAudit.errors.join('\n'));
});

test('legacy refas.checkpoint/v1 self-PASS is rejected when current evidence re-evaluation fails', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'legacy-gate-forgery-study');
  const sourceCheckpoint = await checkpoint(root, artifactPath, 'source-intake', 'trusted:source-intake\n');
  await rewriteCheckpointAsLegacyV1(root, sourceCheckpoint, {
    evidenceRefsByGate: {'source-intake-gate': ['reviews/forged-pass.json']},
  });

  const audit = await auditProject(root);
  assert.equal(audit.valid, false);
  assert.match(audit.errors.join('\n'), /cites unbound evidence/);

  await assert.rejects(
    () => checkpoint(root, artifactPath, 'visual-hierarchy', 'trusted:visual-hierarchy\n'),
    /visual-hierarchy prerequisite lineage is not trustworthy.*cites unbound evidence/,
  );
});

test('checkpoint gates reject caller-authored verdict fields and derive trusted verdicts', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'gate-authority-study');
  const artifact = await writeArtifact(root, artifactPath, Buffer.from('trusted source intake\n'));

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake',
    scopeId: 'whole',
    reason: 'caller must not author gate status',
    artifactRefs: [artifact],
    gates: [{id: 'source-intake-gate', status: 'pass', evidenceRefs: [artifact.path]}],
  }), /status is runtime-authoritative/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake',
    scopeId: 'whole',
    reason: 'unbound evidence cannot pass',
    artifactRefs: [artifact],
    gates: [{id: 'source-intake-gate', evidenceRefs: ['reviews/not-bound.json']}],
  }), /runtime gate evaluation rejected checkpoint: source-intake-gate=fail/);

  const checkpoint = await commitCheckpoint(root, {
    capability: 'source-intake',
    scopeId: 'whole',
    reason: 'runtime derives the gate verdict',
    artifactRefs: [artifact],
    gates: [{id: 'source-intake-gate', evidenceRefs: [artifact.path]}],
  });
  assert.equal(checkpoint.gates.length, 1);
  assert.equal(checkpoint.gates[0].schema, 'refas.checkpoint-gate-verdict/v1');
  assert.equal(checkpoint.gates[0].status, 'pass');
  assert.equal(checkpoint.gates[0].evaluator, 'bound-evidence');
  assert.match(checkpoint.gates[0].policyDigest, /^[a-f0-9]{64}$/);
  assert.match(checkpoint.gates[0].decisionDigest, /^[a-f0-9]{64}$/);
});

test('project audit rejects a re-signed gate verdict whose evidence was not runtime-bound', async (t) => {
  const {root, artifactPath} = await makeProject(t, 'gate-tamper-study');
  const sealed = await checkpoint(root, artifactPath, 'source-intake', 'trusted:source-intake\n');
  const file = path.join(root, '.refas', 'checkpoints', `${sealed.id}.json`);
  const attacked = JSON.parse(await fs.readFile(file, 'utf8'));
  attacked.gates[0].evidenceRefs = ['reviews/forged-pass.json'];
  const gateCore = {
    schema: attacked.gates[0].schema,
    id: attacked.gates[0].id,
    status: attacked.gates[0].status,
    evidenceRefs: attacked.gates[0].evidenceRefs,
    evaluator: attacked.gates[0].evaluator,
    policyDigest: attacked.gates[0].policyDigest,
  };
  attacked.gates[0].decisionDigest = digestJson(gateCore);
  const content = {
    schema: attacked.schema,
    parentId: attacked.parentId,
    capability: attacked.capability,
    scopeId: attacked.scopeId,
    reason: attacked.reason,
    artifactRefs: attacked.artifactRefs,
    claims: attacked.claims,
    gates: attacked.gates,
    metadata: attacked.metadata,
    transactionId: attacked.transactionId,
  };
  attacked.contentDigest = digestJson(content);
  await fs.writeFile(file, `${JSON.stringify(attacked, null, 2)}\n`);
  const audit = await auditProject(root);
  assert.equal(audit.valid, false);
  assert.match(audit.errors.join('\n'), /cites unbound evidence/);
});

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
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
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
  const audit = await auditProject(root);
  assert.equal(audit.valid, true, audit.errors.join('\n'));
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
    gates: [{id: 'source-intake-gate', evidenceRefs: ['source/reference.bin']}],
  }), /escapes the project root/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'internal path should fail',
    artifactRefs: [{...fake, path: '.refas/project.json'}],
    gates: [{id: 'source-intake-gate', evidenceRefs: ['source/reference.bin']}],
  }), /internal state/);

  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'empty artifact set should fail', artifactRefs: [],
    gates: [{id: 'source-intake-gate', evidenceRefs: ['source/reference.bin']}],
  }), /recoverable artifact/);

  const safeRef = await contentReference(artifactPath, {root});
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'evidence-free gate should fail', artifactRefs: [safeRef],
    gates: [{id: 'source-intake-gate', evidenceRefs: []}],
  }), /runtime gate evaluation rejected checkpoint: source-intake-gate=fail/);

  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-outside-'));
  t.after(() => fs.rm(outside, {recursive: true, force: true}));
  await fs.writeFile(path.join(outside, 'payload.bin'), Buffer.from('outside\n'));
  await fs.symlink(outside, path.join(root, 'model', 'outside-link'));
  const linked = {...await contentReference(path.join(outside, 'payload.bin'), {root}), path: 'model/outside-link/payload.bin'};
  await assert.rejects(() => commitCheckpoint(root, {
    capability: 'source-intake', scopeId: 'whole', reason: 'symlink should fail', artifactRefs: [linked],
    gates: [{id: 'source-intake-gate', evidenceRefs: ['source/reference.bin']}],
  }), /outside the project root/);
});

test('whole-object certification requires an independent digest-bound review and survives audit', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'certification-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  const {checkpoint: head, review} = await commitCertificationAttempt(root, artifactPath, source);
  const certificate = await certifyProject(root);
  assert.equal(certificate.checkpointId, head.id);
  assert.equal(certificate.sourceSha256, source.sha256);
  assert.equal(certificate.version, '1.1.0');
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

test('checkpoint admission fails closed when the visual-review artifact is missing', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'missing-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await assert.rejects(
    () => commitCertificationAttempt(root, artifactPath, source, {includeReview: false}),
    /runtime gate evaluation rejected checkpoint: .*silhouette-and-mass=fail/,
  );
  const guidance = await resumeProject(root);
  assert.equal(guidance.activeWork.capability, 'whole-object-certification');
});

test('self-generated contract fixtures cannot certify visual fidelity', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'self-generated-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await commitCertificationAttempt(root, artifactPath, source, {reviewOverrides: {evidenceClass: 'self-generated-contract-fixture'}});
  await assert.rejects(() => certifyProject(root), /self-generated contract fixtures cannot certify visual fidelity/);
});

test('runtime visual gate authority rejects unresolved major visual findings before checkpoint admission', async (t) => {
  const {root, artifactPath, source} = await makeProject(t, 'blocking-review-study');
  await advanceThrough(root, artifactPath, 'visual-critique');
  await assert.rejects(() => commitCertificationAttempt(root, artifactPath, source, {reviewOverrides: {
    verdict: 'fail',
    gateStatuses: {'silhouette-and-mass': 'fail'},
    unresolvedFindings: [{category: 'curvature-mismatch', severity: 'major', scopeId: 'whole', summary: 'The side profile is flat instead of folded.', evidenceRefs: ['renders/final/side.png']}],
  }}), /runtime gate evaluation rejected checkpoint: silhouette-and-mass=fail/);
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
  assert.throws(() => createVisualReview(reviewInput({
    sourceSha256: 'a'.repeat(64), assetSha256: 'b'.repeat(64),
    renderer: {independentProcess: false},
  })), /requires an independent PBR renderer process/);
});

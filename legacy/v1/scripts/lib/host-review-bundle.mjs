import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertDigest,
  assertId,
  contentReference,
  deepFreeze,
  digestJson,
  readJson,
  stableStringify,
  writeJsonAtomic,
  sha256File,
} from './canonical.mjs';
import {loadCheckpoint, loadProject} from './checkpoint-store.mjs';
import {emitHostEvent} from './host-event.mjs';
import {readHostState} from './host-state.mjs';
import {assertRegisteredComparisonBinding, validateRegisteredComparison} from './registered-comparison.mjs';
import {validatePbrRenderReport} from './pbr-render-report.mjs';
import {validateVisualReview} from './visual-review.mjs';

export const HOST_REVIEW_BUNDLE_SCHEMA = 'refas.host-review-bundle/v1';

const POLICY = Object.freeze({
  readOnlyPresentationEnvelope: true,
  checkpointAuthorityRemainsRefAs: true,
  visualReviewAuthorityNotDuplicated: true,
  metricsCannotPassReview: true,
  bundleCannotResolveFindings: true,
  bundleCannotCertify: true,
});

function rootPath(root) { return path.resolve(root); }

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function checkpointCore(checkpoint) {
  return {
    schema: checkpoint.schema,
    parentId: checkpoint.parentId,
    capability: checkpoint.capability,
    scopeId: checkpoint.scopeId,
    reason: checkpoint.reason,
    artifactRefs: checkpoint.artifactRefs,
    claims: checkpoint.claims,
    gates: checkpoint.gates,
    metadata: checkpoint.metadata,
    transactionId: checkpoint.transactionId ?? null,
  };
}

function validateCheckpointIdentity(checkpoint) {
  const contentDigest = digestJson(checkpointCore(checkpoint));
  if (checkpoint.contentDigest !== contentDigest) throw new Error('current checkpoint content digest mismatch');
  const expectedId = `cp_${contentDigest.slice(0, 20)}`;
  if (checkpoint.id !== expectedId) throw new Error('current checkpoint ID/content digest mismatch');
  return contentDigest;
}

async function exactReference(root, raw, {kind = null, label = 'content reference'} = {}) {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} is required`);
  const relative = String(raw.path ?? '');
  if (!relative || path.isAbsolute(relative)) throw new Error(`${label} path must be project-relative`);
  const sha256 = assertDigest(raw.sha256, `${label}.sha256`);
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error(`${label}.sizeBytes must be a non-negative safe integer`);
  const base = rootPath(root);
  const absolute = path.resolve(base, relative);
  if (!inside(base, absolute)) throw new Error(`${label} path escapes the project root`);
  const [realRoot, realFile] = await Promise.all([fs.realpath(base), fs.realpath(absolute)]);
  if (!inside(realRoot, realFile)) throw new Error(`${label} resolves outside the project root`);
  const stat = await fs.stat(realFile);
  if (!stat.isFile() || stat.size !== sizeBytes) throw new Error(`${label} size does not match exact bytes`);
  if (await sha256File(realFile) !== sha256) throw new Error(`${label} digest does not match exact bytes`);
  const normalizedKind = assertId(kind ?? raw.kind ?? 'artifact', `${label}.kind`);
  return deepFreeze({
    schema: 'refas.content-reference/v1',
    kind: normalizedKind,
    path: path.relative(realRoot, realFile).split(path.sep).join('/'),
    sha256,
    sizeBytes,
  });
}

function exactArtifactByPath(artifacts, pathValue, sha256, label) {
  const matches = artifacts.filter((artifact) => artifact.path === pathValue && artifact.sha256 === sha256);
  if (matches.length !== 1) throw new Error(`${label} is not uniquely digest-bound in the current checkpoint`);
  return matches[0];
}

function compareScopeIds(actual, expected) {
  return stableStringify([...(actual ?? [])].sort()) === stableStringify([...(expected ?? [])].sort());
}

async function projectVisualReview(root, source, candidate, artifacts) {
  const reviewArtifacts = artifacts.filter((artifact) => artifact.kind === 'visual-review');
  if (reviewArtifacts.length > 1) throw new Error('current checkpoint contains multiple visual-review artifacts');
  if (!reviewArtifacts.length) return null;

  const reference = reviewArtifacts[0];
  const review = await readJson(path.join(rootPath(root), reference.path));
  const validation = validateVisualReview(review);
  if (!validation.valid) throw new Error(`visual review is invalid: ${validation.errors.join('; ')}`);
  if (review.sourceSha256 !== source.sha256) throw new Error('visual review source digest does not match the current primary source');
  if (!candidate) throw new Error('visual review exists without one unambiguous current GLB candidate');
  if (review.assetSha256 !== candidate.sha256) throw new Error('visual review asset digest does not match the current candidate');

  const rendererReference = exactArtifactByPath(
    artifacts,
    review.renderer.reportRef,
    review.renderer.reportSha256,
    'visual review renderer report',
  );

  if (review.renderer.claimScope === 'visual-fidelity') {
    const report = await readJson(path.join(rootPath(root), rendererReference.path));
    const rendererValidation = validatePbrRenderReport(report);
    if (!rendererValidation.valid) throw new Error(`PBR renderer report is invalid: ${rendererValidation.errors.join('; ')}`);
    if (report.assetSha256 !== candidate.sha256) throw new Error('PBR renderer report asset digest does not match the current candidate');
    for (const output of report.outputs ?? []) {
      exactArtifactByPath(artifacts, output.path, output.sha256, `PBR renderer output ${output.viewId}`);
    }
  }

  let registeredComparison = null;
  if (review.registeredComparison != null) {
    const binding = assertRegisteredComparisonBinding(review.registeredComparison);
    const comparisonReference = exactArtifactByPath(
      artifacts.filter((artifact) => artifact.kind === 'registered-comparison'),
      binding.path,
      binding.sha256,
      'registered comparison',
    );
    const report = await readJson(path.join(rootPath(root), comparisonReference.path));
    const comparisonValidation = validateRegisteredComparison(report);
    if (!comparisonValidation.valid) throw new Error(`registered comparison is invalid: ${comparisonValidation.errors.join('; ')}`);

    const checks = [
      [report.comparisonDigest, binding.comparisonDigest, 'registered comparison digest'],
      [report.source?.sha256, binding.sourceSha256, 'registered comparison source digest'],
      [report.source?.manifestSha256, binding.sourceManifestSha256, 'registered comparison source manifest digest'],
      [report.render?.assetSha256, binding.assetSha256, 'registered comparison asset digest'],
      [report.render?.frameSha256, binding.frameSha256, 'registered comparison frame digest'],
      [report.render?.reportSha256, binding.renderReportSha256, 'registered comparison render report digest'],
      [report.registration?.digest, binding.registrationDigest, 'registered comparison registration digest'],
      [report.hierarchy?.digest, binding.hierarchyDigest, 'registered comparison hierarchy digest'],
      [report.inputDigest, binding.inputDigest, 'registered comparison input digest'],
    ];
    for (const [actual, expected, label] of checks) if (actual !== expected) throw new Error(`${label} does not match the visual-review binding`);
    if (!compareScopeIds((report.scopes ?? []).map((scope) => scope.scopeId), binding.scopeIds)) {
      throw new Error('registered comparison scopes do not match the visual-review binding');
    }
    if (binding.sourceSha256 !== source.sha256) throw new Error('registered comparison source digest does not match the current primary source');
    if (binding.assetSha256 !== candidate.sha256) throw new Error('registered comparison asset digest does not match the current candidate');

    exactArtifactByPath(artifacts, binding.renderReportPath, binding.renderReportSha256, 'registered comparison render report');
    exactArtifactByPath(artifacts, binding.framePath, binding.frameSha256, 'registered comparison hero frame');

    registeredComparison = {
      reference: comparisonReference,
      comparisonDigest: binding.comparisonDigest,
      scopeIds: [...binding.scopeIds],
    };
  }

  return {
    reference,
    verdict: review.verdict,
    evidenceClass: review.evidenceClass,
    reviewDigest: review.reviewDigest,
    unresolvedFindings: structuredClone(review.unresolvedFindings ?? []),
    renderer: {
      reference: rendererReference,
      kind: review.renderer.kind,
      family: review.renderer.family,
      claimScope: review.renderer.claimScope,
      independentProcess: review.renderer.independentProcess === true,
    },
    registeredComparison,
  };
}

function bundlePayload({
  stored,
  state,
  checkpoint,
  checkpointContentDigest,
  source,
  candidate,
  artifacts,
  review,
}) {
  return {
    schema: HOST_REVIEW_BUNDLE_SCHEMA,
    sessionId: stored.sessionId,
    projectId: stored.projectId,
    checkpoint: {
      id: checkpoint.id,
      contentDigest: checkpointContentDigest,
      capability: checkpoint.capability,
      scopeId: checkpoint.scopeId,
    },
    source,
    candidate,
    artifacts,
    artifactKinds: [...new Set(artifacts.map((artifact) => artifact.kind))].sort(),
    gates: structuredClone(checkpoint.gates ?? []),
    claims: structuredClone(checkpoint.claims ?? []),
    review,
    policy: {...POLICY},
  };
}

export async function getHostReviewBundle(root) {
  root = rootPath(root);
  const [state, stored] = await Promise.all([loadProject(root), readHostState(root)]);
  if (state.projectId !== stored.projectId) throw new Error('host review bundle project/session persistence mismatch');
  if (!state.source) throw new Error('host review bundle requires a bound primary source');
  if (!state.head) throw new Error('host review bundle requires a current checkpoint');
  if (!state.checkpointIds.includes(state.head)) throw new Error('current checkpoint is missing from project history');

  const checkpoint = await loadCheckpoint(root, state.head);
  const checkpointContentDigest = validateCheckpointIdentity(checkpoint);

  const source = await exactReference(root, state.source, {kind: 'source', label: 'primary source'});
  const paths = (checkpoint.artifactRefs ?? []).map((artifact) => String(artifact.path ?? ''));
  if (new Set(paths).size !== paths.length) throw new Error('current checkpoint artifact paths must be unique');

  const artifacts = [];
  for (const [index, artifact] of (checkpoint.artifactRefs ?? []).entries()) {
    artifacts.push(await exactReference(root, artifact, {label: `checkpoint artifact ${index}`}));
  }

  const candidates = artifacts.filter((artifact) => artifact.kind === 'glb');
  if (candidates.length > 1) throw new Error('current checkpoint has multiple GLB artifacts; host review candidate is ambiguous');
  const candidate = candidates[0] ?? null;
  const review = await projectVisualReview(root, source, candidate, artifacts);

  const payload = bundlePayload({
    stored,
    state,
    checkpoint,
    checkpointContentDigest,
    source,
    candidate,
    artifacts,
    review,
  });
  return deepFreeze({...payload, bundleDigest: digestJson(payload)});
}

export function validateHostReviewBundle(bundle) {
  const errors = [];
  try {
    if (!bundle || bundle.schema !== HOST_REVIEW_BUNDLE_SCHEMA) throw new Error('invalid host review bundle schema');
    assertId(bundle.sessionId, 'sessionId');
    assertId(bundle.projectId, 'projectId');
    assertId(bundle.checkpoint?.id, 'checkpoint.id');
    assertDigest(bundle.checkpoint?.contentDigest, 'checkpoint.contentDigest');
    assertId(bundle.checkpoint?.capability, 'checkpoint.capability');
    assertId(bundle.checkpoint?.scopeId, 'checkpoint.scopeId');
    assertDigest(bundle.source?.sha256, 'source.sha256');
    if (bundle.candidate != null) assertDigest(bundle.candidate.sha256, 'candidate.sha256');
    const paths = (bundle.artifacts ?? []).map((artifact) => artifact?.path);
    if (new Set(paths).size !== paths.length) throw new Error('bundle artifact paths must be unique');
    if (stableStringify(bundle.policy) !== stableStringify(POLICY)) throw new Error('host review bundle authority policy mismatch');
    const payload = structuredClone(bundle);
    delete payload.bundleDigest;
    const digest = digestJson(payload);
    if (bundle.bundleDigest !== digest) throw new Error('host review bundle digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export async function publishHostReviewBundle(root) {
  root = rootPath(root);
  const bundle = await getHostReviewBundle(root);
  const relative = `reviews/host-review-bundle-${bundle.bundleDigest.slice(0, 20)}.json`;
  const absolute = path.resolve(root, relative);
  if (!inside(root, absolute)) throw new Error('host review bundle publication path escapes the project root');
  const expectedBytes = `${JSON.stringify(bundle, null, 2)}\n`;

  try {
    const existingBytes = await fs.readFile(absolute, 'utf8');
    if (existingBytes !== expectedBytes) throw new Error('existing host review bundle publication bytes do not match the current bundle');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJsonAtomic(absolute, bundle);
  }

  const reference = await contentReference(absolute, {kind: 'host-review-bundle', root});
  const event = await emitHostEvent(root, {
    kind: 'review-bundle-ready',
    scopeId: bundle.checkpoint.scopeId,
    capability: bundle.checkpoint.capability,
    message: 'Digest-bound host review bundle ready.',
    artifactRefs: [reference],
    recoverable: true,
  });
  return deepFreeze({bundle, reference, event});
}

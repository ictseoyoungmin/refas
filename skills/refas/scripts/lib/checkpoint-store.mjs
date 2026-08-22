import fs from 'node:fs/promises';
import path from 'node:path';
import {
  REFAS_VERSION,
  assertDigest,
  assertId,
  deepFreeze,
  digestJson,
  readJson,
  sha256File,
  writeJsonAtomic,
} from './canonical.mjs';
import {
  CAPABILITY_DEPENDENCIES,
  CAPABILITY_ORDER,
  assertCapability,
  capabilityIndex,
  transitiveDependents,
} from './ownership.mjs';
import {normalizeFinding, routeFinding} from './failure-router.mjs';
import {
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  validateVisualReview,
} from './visual-review.mjs';
import {validatePbrRenderReport} from './pbr-render-report.mjs';

export const PROJECT_STATE_SCHEMA = 'refas.project-state/v1';
export const CHECKPOINT_SCHEMA = 'refas.checkpoint/v1';
export const SOURCE_MANIFEST_SCHEMA = 'refas.source-manifest/v1';
const ROOT_DIR = '.refas';

const projectRoot = (root) => path.resolve(root);
const refasRoot = (root) => path.join(projectRoot(root), ROOT_DIR);
const statePath = (root) => path.join(refasRoot(root), 'project.json');
const checkpointPath = (root, id) => path.join(refasRoot(root), 'checkpoints', `${id}.json`);
const decisionPath = (root, id) => path.join(refasRoot(root), 'decisions', `${id}.json`);
const certificatePath = (root) => path.join(refasRoot(root), 'certification.json');
const objectPath = (root, digest) => path.join(refasRoot(root), 'objects', digest.slice(0, 2), digest.slice(2));

function nowIso() {
  return new Date().toISOString();
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeRelativePath(root, value, label = 'path') {
  const raw = String(value ?? '');
  if (!raw || path.isAbsolute(raw)) throw new Error(`${label} must be a non-empty project-relative path`);
  const absolute = path.resolve(projectRoot(root), raw);
  if (!isInside(projectRoot(root), absolute)) throw new Error(`${label} escapes the project root`);
  const relative = path.relative(projectRoot(root), absolute).split(path.sep).join('/');
  if (relative === ROOT_DIR || relative.startsWith(`${ROOT_DIR}/`)) throw new Error(`${label} may not target RefAs internal state`);
  return {
    absolute,
    relative,
  };
}

async function assertExistingFileInside(root, relativePath, label) {
  const resolved = normalizeRelativePath(root, relativePath, label);
  const [realRoot, realFile] = await Promise.all([fs.realpath(projectRoot(root)), fs.realpath(resolved.absolute)]);
  if (!isInside(realRoot, realFile)) throw new Error(`${label} resolves outside the project root`);
  const stat = await fs.stat(realFile);
  if (!stat.isFile()) throw new Error(`${label} is not a file`);
  return {...resolved, realFile, stat};
}

async function writeBytesAtomic(root, relativePath, bytes) {
  const resolved = normalizeRelativePath(root, relativePath, 'artifact path');
  await fs.mkdir(path.dirname(resolved.absolute), {recursive: true});
  const [realRoot, realParent] = await Promise.all([fs.realpath(projectRoot(root)), fs.realpath(path.dirname(resolved.absolute))]);
  if (realParent !== realRoot && !isInside(realRoot, realParent)) throw new Error('artifact parent resolves outside the project root');
  const temporary = `${resolved.absolute}.refas-restore-${process.pid}`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, resolved.absolute);
  return resolved.relative;
}

function normalizeGate(raw, index) {
  const status = String(raw?.status ?? 'pending').toLowerCase();
  if (!['pass', 'fail', 'pending', 'blocked'].includes(status)) throw new Error(`gates[${index}].status is invalid`);
  const gate = {
    id: assertId(raw.id, `gates[${index}].id`),
    status,
    evidenceRefs: [...(raw.evidenceRefs ?? [])].map(String).filter(Boolean),
  };
  if (gate.status === 'pass' && !gate.evidenceRefs.length) throw new Error(`gates[${index}] requires current evidenceRefs to pass`);
  return gate;
}

function normalizeSourceManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('source manifest is required');
  const source = {
    schema: SOURCE_MANIFEST_SCHEMA,
    id: assertId(raw.id, 'source.id'),
    path: String(raw.path ?? ''),
    sha256: assertDigest(raw.sha256, 'source.sha256'),
    sizeBytes: Number(raw.sizeBytes),
    width: Number(raw.width),
    height: Number(raw.height),
    authority: String(raw.authority ?? 'primary'),
    acquisition: raw.acquisition && typeof raw.acquisition === 'object' ? structuredClone(raw.acquisition) : {},
  };
  if (!source.path || !Number.isInteger(source.sizeBytes) || source.sizeBytes < 1) throw new Error('source path and positive sizeBytes are required');
  if (!Number.isInteger(source.width) || source.width < 1 || !Number.isInteger(source.height) || source.height < 1) throw new Error('source width and height must be positive integers');
  if (source.authority !== 'primary') throw new Error('source authority must be primary');
  return source;
}

async function verifySource(root, source) {
  const resolved = await assertExistingFileInside(root, source.path, 'source.path');
  if (resolved.stat.size !== source.sizeBytes) throw new Error('source size does not match its manifest');
  if (await sha256File(resolved.realFile) !== source.sha256) throw new Error('source digest does not match its manifest');
  return {...source, path: resolved.relative};
}

async function storeArtifact(root, raw, index) {
  if (!raw || typeof raw !== 'object') throw new Error(`artifactRefs[${index}] is invalid`);
  const sha256 = assertDigest(raw.sha256, `artifactRefs[${index}].sha256`);
  const source = await assertExistingFileInside(root, raw.path, `artifactRefs[${index}].path`);
  const sizeBytes = Number(raw.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes !== source.stat.size) throw new Error(`artifactRefs[${index}].sizeBytes does not match the file`);
  if (await sha256File(source.realFile) !== sha256) throw new Error(`artifactRefs[${index}].sha256 does not match the file`);
  const destination = objectPath(root, sha256);
  await fs.mkdir(path.dirname(destination), {recursive: true});
  try {
    const stat = await fs.stat(destination);
    if (!stat.isFile() || stat.size !== sizeBytes || await sha256File(destination) !== sha256) throw new Error(`content object ${sha256} is corrupt`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const temporary = `${destination}.tmp-${process.pid}`;
    await fs.copyFile(source.realFile, temporary);
    await fs.rename(temporary, destination);
  }
  return {
    kind: String(raw.kind ?? 'artifact'),
    path: source.relative,
    sha256,
    sizeBytes,
  };
}

async function verifyStoredObject(root, artifact) {
  try {
    const file = objectPath(root, artifact.sha256);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size !== artifact.sizeBytes) return 'content object size mismatch';
    if (await sha256File(file) !== artifact.sha256) return 'content object digest mismatch';
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return 'content object missing';
    return error.message;
  }
}

async function restoreArtifacts(root, artifacts) {
  const restored = [];
  for (const artifact of artifacts) {
    const error = await verifyStoredObject(root, artifact);
    if (error) throw new Error(`${artifact.path}: ${error}`);
    const bytes = await fs.readFile(objectPath(root, artifact.sha256));
    restored.push(await writeBytesAtomic(root, artifact.path, bytes));
  }
  return restored;
}

function scopeContains(ancestor, descendant) {
  return ancestor === 'whole' || ancestor === descendant || descendant.startsWith(`${ancestor}.`);
}

function checkpointContent(checkpoint) {
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

function checkpointLineage(checkpoints, headId) {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const reverse = [];
  const visited = new Set();
  let cursor = headId ? byId.get(headId) : null;
  while (cursor) {
    if (visited.has(cursor.id)) throw new Error(`checkpoint cycle at ${cursor.id}`);
    reverse.push(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return reverse.reverse();
}

function exactSetErrors(actual, expected, label) {
  const errors = [];
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index);
  const missing = expected.filter((value) => !actual.includes(value));
  const unexpected = actual.filter((value) => !expected.includes(value));
  if (duplicates.length) errors.push(`${label} contains duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length) errors.push(`${label} is missing: ${missing.join(', ')}`);
  if (unexpected.length) errors.push(`${label} contains unexpected IDs: ${unexpected.join(', ')}`);
  return errors;
}

async function inspectCertificationHead(root, state, head) {
  const errors = [];
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') {
    errors.push('the head must be a whole-object-certification checkpoint for whole');
    return {ready: false, errors, visualReview: null, visualReviewArtifact: null};
  }
  errors.push(...exactSetErrors(head.gates.map((gate) => gate.id), REQUIRED_CLOSURE_GATE_IDS, 'closure gates'));
  if (head.gates.some((gate) => gate.status !== 'pass')) errors.push('the certification checkpoint contains a non-pass gate');

  const reviewArtifacts = head.artifactRefs.filter((artifact) => artifact.kind === 'visual-review');
  if (reviewArtifacts.length !== 1) errors.push('the certification checkpoint requires exactly one digest-bound visual-review artifact');
  const visualReviewArtifact = reviewArtifacts.length === 1 ? reviewArtifacts[0] : null;
  let visualReview = null;
  if (visualReviewArtifact) {
    try {
      const resolved = await assertExistingFileInside(root, visualReviewArtifact.path, 'visual-review artifact');
      if (resolved.stat.size !== visualReviewArtifact.sizeBytes || await sha256File(resolved.realFile) !== visualReviewArtifact.sha256) {
        errors.push('visual-review artifact bytes do not match the checkpoint reference');
      }
      visualReview = await readJson(resolved.realFile);
      const validation = validateVisualReview(visualReview);
      if (!validation.valid) errors.push(`visual review is invalid: ${validation.errors.join('; ')}`);
      if (visualReview.scopeId !== 'whole') errors.push('visual review must cover whole');
      if (visualReview.sourceSha256 !== state.source?.sha256) errors.push('visual review source digest does not match the bound primary reference');
      if (!head.artifactRefs.some((artifact) => artifact.kind !== 'visual-review' && artifact.sha256 === visualReview.assetSha256)) {
        errors.push('visual review asset digest is not present in the certification checkpoint');
      }
      const rendererArtifact = head.artifactRefs.find((artifact) => artifact.path === visualReview.renderer?.reportRef);
      if (!rendererArtifact) {
        errors.push('visual review renderer report is not present in the certification checkpoint');
      } else if (rendererArtifact.sha256 !== visualReview.renderer?.reportSha256) {
        errors.push('visual review renderer report digest does not match the checkpoint artifact');
      } else if (visualReview.renderer?.claimScope === 'visual-fidelity') {
        const rendererReport = await readJson(path.join(root, rendererArtifact.path));
        const rendererValidation = validatePbrRenderReport(rendererReport);
        if (!rendererValidation.valid) errors.push(`PBR renderer report is invalid: ${rendererValidation.errors.join('; ')}`);
        if (rendererReport.assetSha256 !== visualReview.assetSha256) errors.push('PBR renderer report asset digest does not match the visual review');
        if (rendererReport.renderer?.family !== visualReview.renderer?.family) errors.push('PBR renderer family does not match the visual review');
        const outputDigests = new Set((rendererReport.outputs ?? []).map((output) => output.sha256));
        const outputPaths = new Set((rendererReport.outputs ?? []).map((output) => output.path));
        for (const output of (rendererReport.outputs ?? [])) {
          if (!head.artifactRefs.some((artifact) => artifact.path === output.path && artifact.sha256 === output.sha256)) errors.push(`PBR renderer output is not digest-bound in the checkpoint: ${output.path}`);
        }
        if (!outputDigests.size) errors.push('PBR renderer report has no digest-bound outputs');
        for (const view of (visualReview.views ?? [])) {
          if (!view.evidenceRefs.some((ref) => outputPaths.has(ref))) errors.push(`visual review view is not backed by the PBR renderer report: ${view.id}`);
        }
      }
      if (visualReview.evidenceClass !== 'independent-reference') errors.push('self-generated contract fixtures cannot certify visual fidelity');
      if (visualReview.verdict !== 'pass') errors.push(`visual review verdict is ${visualReview.verdict ?? 'missing'}, not pass`);
      const blocking = (visualReview.unresolvedFindings ?? []).filter((finding) => finding.blocking === true);
      if (blocking.length) errors.push(`visual review has unresolved major, critical, or blocking findings: ${blocking.map((finding) => finding.category).join(', ')}`);
      const reviewGates = new Map((visualReview.gateVerdicts ?? []).map((gate) => [gate.id, gate]));
      for (const gateId of REQUIRED_VISUAL_GATE_IDS) {
        if (reviewGates.get(gateId)?.status !== 'pass') errors.push(`visual review gate is not pass: ${gateId}`);
        const checkpointGate = head.gates.find((gate) => gate.id === gateId);
        if (checkpointGate && !checkpointGate.evidenceRefs.includes(visualReviewArtifact.path)) {
          errors.push(`closure gate ${gateId} does not cite the digest-bound visual review`);
        }
      }
    } catch (error) {
      errors.push(`visual review unavailable: ${error.message}`);
    }
  }
  return {ready: errors.length === 0, errors, visualReview, visualReviewArtifact};
}

function certificateCore(certificate) {
  return {
    schema: certificate.schema,
    version: certificate.version,
    projectId: certificate.projectId,
    sourceSha256: certificate.sourceSha256,
    checkpointId: certificate.checkpointId,
    checkpointDigest: certificate.checkpointDigest,
    gateIds: certificate.gateIds,
    visualReview: certificate.visualReview,
    audit: certificate.audit,
  };
}

function ensurePrerequisites(capability, scopeId, lineage) {
  for (const dependency of CAPABILITY_DEPENDENCIES[capability]) {
    const found = lineage.some((checkpoint) => checkpoint.capability === dependency && scopeContains(checkpoint.scopeId, scopeId));
    if (!found) throw new Error(`${capability} requires a trustworthy ${dependency} checkpoint for ${scopeId}`);
  }
}

function nextInvalidated(state) {
  return CAPABILITY_ORDER.find((capability) => state.invalidatedCapabilities.includes(capability)) ?? null;
}

function acceptCapability(state, capability) {
  if (!state.invalidatedCapabilities.includes(capability)) return;
  state.invalidatedCapabilities = state.invalidatedCapabilities.filter((item) => item !== capability);
  state.reopenedCapability = nextInvalidated(state);
  if (state.reopenedCapability) state.status = 'reopened';
}

async function invalidateCertification(root, state) {
  state.certification = null;
  try {
    await fs.unlink(certificatePath(root));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function initProject(root, {projectId, source = null} = {}) {
  root = projectRoot(root);
  const file = statePath(root);
  try {
    const existing = await readJson(file);
    if (existing.projectId !== assertId(projectId, 'projectId')) throw new Error(`project already initialized as ${existing.projectId}`);
    if (source && existing.source?.sha256 !== source.sha256) throw new Error('project already initialized with a different source');
    return deepFreeze(existing);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(root, {recursive: true});
  await Promise.all([
    'source', 'evidence', 'model', 'assets', 'renders', 'reviews',
    `${ROOT_DIR}/checkpoints`, `${ROOT_DIR}/decisions`, `${ROOT_DIR}/objects`,
  ].map((directory) => fs.mkdir(path.join(root, directory), {recursive: true})));
  const normalizedSource = source ? await verifySource(root, normalizeSourceManifest(source)) : null;
  const state = {
    schema: PROJECT_STATE_SCHEMA,
    version: REFAS_VERSION,
    projectId: assertId(projectId, 'projectId'),
    source: normalizedSource,
    head: null,
    status: normalizedSource ? 'ready' : 'source-required',
    activeScopeId: 'whole',
    activeTransaction: null,
    reopenedCapability: null,
    invalidatedCapabilities: [],
    checkpointIds: [],
    certification: null,
    journal: [{event: 'PROJECT_INITIALIZED', at: nowIso()}],
  };
  await writeJsonAtomic(file, state);
  return deepFreeze(structuredClone(state));
}

export async function loadProject(root) {
  const state = await readJson(statePath(root));
  if (state.schema !== PROJECT_STATE_SCHEMA) throw new Error('not a RefAs project state');
  return state;
}

export async function bindSource(root, source) {
  root = projectRoot(root);
  const state = await loadProject(root);
  const normalized = await verifySource(root, normalizeSourceManifest(source));
  if (state.source) {
    if (state.source.sha256 !== normalized.sha256) throw new Error('project already has a different primary source');
    return deepFreeze(state.source);
  }
  if (state.checkpointIds.length || state.activeTransaction) throw new Error('a primary source cannot be bound after reconstruction state exists');
  state.source = normalized;
  state.status = 'ready';
  state.journal.push({event: 'SOURCE_BOUND', sourceId: normalized.id, sourceSha256: normalized.sha256, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze(normalized);
}

export async function loadCheckpoint(root, id) {
  const checkpoint = await readJson(checkpointPath(root, id));
  if (checkpoint.schema !== CHECKPOINT_SCHEMA || checkpoint.id !== id) throw new Error(`invalid checkpoint ${id}`);
  return checkpoint;
}

export async function listCheckpoints(root) {
  const state = await loadProject(root);
  const out = [];
  for (const id of state.checkpointIds) out.push(await loadCheckpoint(root, id));
  return out;
}

export async function commitCheckpoint(root, {
  capability,
  scopeId,
  reason,
  artifactRefs = [],
  claims = [],
  gates = [],
  metadata = {},
  parentId,
} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  capability = assertCapability(capability);
  scopeId = assertId(scopeId, 'scopeId');
  if (!state.source) throw new Error('bind and verify a primary source before creating a trustworthy checkpoint');
  if (!Array.isArray(artifactRefs) || !artifactRefs.length) throw new Error('a trustworthy checkpoint requires at least one recoverable artifact');
  const normalizedGates = gates.map(normalizeGate);
  if (!normalizedGates.length || normalizedGates.some((gate) => gate.status !== 'pass')) throw new Error('a trustworthy checkpoint requires one or more passing gates and no non-pass gate');
  const checkpoints = await listCheckpoints(root);
  const lineage = checkpointLineage(checkpoints, state.head);
  ensurePrerequisites(capability, scopeId, lineage);

  const recoveryOwner = nextInvalidated(state);
  if (recoveryOwner && capability !== recoveryOwner) throw new Error(`recovery must close ${recoveryOwner} before ${capability}`);
  if (!state.activeTransaction && state.head && capabilityIndex(capability) < capabilityIndex(lineage.at(-1).capability) && capability !== state.reopenedCapability) {
    throw new Error(`cannot checkpoint upstream ${capability} without routing a typed finding first`);
  }

  let parent = parentId === undefined ? state.head : parentId;
  let transactionId = null;
  if (state.activeTransaction) {
    const transaction = state.activeTransaction;
    if (transaction.candidateCheckpointId) throw new Error('the active edit already has a candidate checkpoint');
    if (capability !== transaction.ownerCapability || scopeId !== transaction.scopeId) throw new Error('candidate capability and scope must match the active edit');
    if (parentId !== undefined && parentId !== transaction.baselineCheckpointId) throw new Error('candidate parent must be the edit baseline');
    parent = transaction.baselineCheckpointId;
    transactionId = transaction.id;
  }
  if (parent != null && !state.checkpointIds.includes(parent)) throw new Error(`unknown parent checkpoint ${parent}`);

  const declaredPaths = artifactRefs.map((artifact, index) => normalizeRelativePath(root, artifact?.path, `artifactRefs[${index}].path`).relative);
  if (new Set(declaredPaths).size !== declaredPaths.length) throw new Error('checkpoint artifact paths must be unique');
  const storedArtifacts = [];
  for (let index = 0; index < artifactRefs.length; index += 1) storedArtifacts.push(await storeArtifact(root, artifactRefs[index], index));
  const content = {
    schema: CHECKPOINT_SCHEMA,
    parentId: parent ?? null,
    capability,
    scopeId,
    reason: String(reason ?? ''),
    artifactRefs: storedArtifacts,
    claims: claims.map(String),
    gates: normalizedGates,
    metadata: structuredClone(metadata),
    transactionId,
  };
  if (!content.reason) throw new Error('checkpoint reason is required');
  const id = `cp_${digestJson(content).slice(0, 20)}`;
  const checkpoint = {...content, id, createdAt: nowIso(), contentDigest: digestJson(content)};
  const file = checkpointPath(root, id);
  try {
    const existing = await readJson(file);
    if (existing.contentDigest !== checkpoint.contentDigest) throw new Error(`checkpoint collision: ${id}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeJsonAtomic(file, checkpoint);
  }
  if (!state.checkpointIds.includes(id)) state.checkpointIds.push(id);
  state.head = id;
  state.activeScopeId = scopeId;
  state.status = state.activeTransaction ? 'candidate-ready' : 'working';
  if (state.activeTransaction) state.activeTransaction.candidateCheckpointId = id;
  else acceptCapability(state, capability);
  await invalidateCertification(root, state);
  state.journal.push({event: 'CHECKPOINT_COMMITTED', id, capability, scopeId, transactionId, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze(checkpoint);
}

export async function restoreCheckpoint(root, checkpointId, {reason = 'explicit restore'} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  if (!state.checkpointIds.includes(checkpointId)) throw new Error(`unknown checkpoint ${checkpointId}`);
  const target = await loadCheckpoint(root, checkpointId);
  const restoredArtifacts = await restoreArtifacts(root, target.artifactRefs);
  const previousHead = state.head;
  state.head = checkpointId;
  state.activeScopeId = target.scopeId;
  state.status = 'restored';
  state.activeTransaction = null;
  state.invalidatedCapabilities = transitiveDependents(target.capability).filter((capability) => capability !== target.capability);
  state.reopenedCapability = nextInvalidated(state);
  await invalidateCertification(root, state);
  state.journal.push({event: 'CHECKPOINT_RESTORED', from: previousHead, to: checkpointId, reason: String(reason), restoredArtifacts, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return {from: previousHead, to: checkpointId, restoredArtifacts, preservedHistory: true, nextCapability: state.reopenedCapability};
}

export async function beginEdit(root, {ownerCapability, scopeId, intent, protectedMetrics = []} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  if (!state.head) throw new Error('create a baseline checkpoint before beginning an edit');
  if (state.activeTransaction) throw new Error(`edit transaction already active: ${state.activeTransaction.id}`);
  const owner = assertCapability(ownerCapability);
  const recoveryOwner = nextInvalidated(state);
  if (recoveryOwner && owner !== recoveryOwner) throw new Error(`recovery must edit ${recoveryOwner} next`);
  const baseline = await loadCheckpoint(root, state.head);
  if (!recoveryOwner && capabilityIndex(owner) < capabilityIndex(baseline.capability)) {
    throw new Error(`cannot silently edit upstream capability ${owner} from ${baseline.capability}; report a typed finding first`);
  }
  const payload = {
    schema: 'refas.edit-transaction/v1',
    baselineCheckpointId: state.head,
    ownerCapability: owner,
    scopeId: assertId(scopeId, 'scopeId'),
    intent: String(intent ?? ''),
    protectedMetrics: [...new Set(protectedMetrics.map(String))].sort(),
  };
  if (!payload.intent) throw new Error('edit intent is required');
  const transaction = {...payload, id: `edit_${digestJson(payload).slice(0, 20)}`, candidateCheckpointId: null, startedAt: nowIso()};
  state.activeTransaction = transaction;
  state.activeScopeId = payload.scopeId;
  state.status = 'editing';
  await invalidateCertification(root, state);
  state.journal.push({event: 'EDIT_BEGAN', id: transaction.id, baseline: state.head, ownerCapability: owner, scopeId: payload.scopeId, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze(transaction);
}

export async function abortEdit(root, {reason = 'candidate abandoned'} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  const transaction = state.activeTransaction;
  if (!transaction) throw new Error('no active edit transaction');
  const baseline = await loadCheckpoint(root, transaction.baselineCheckpointId);
  const restoredArtifacts = await restoreArtifacts(root, baseline.artifactRefs);
  const payload = {
    schema: 'refas.edit-abort/v1',
    transactionId: transaction.id,
    baselineCheckpointId: transaction.baselineCheckpointId,
    rejectedCandidateCheckpointId: transaction.candidateCheckpointId,
    reason: String(reason),
  };
  const decision = {...payload, id: `decision_${digestJson(payload).slice(0, 20)}`, decidedAt: nowIso()};
  await writeJsonAtomic(decisionPath(root, decision.id), decision);
  state.head = transaction.baselineCheckpointId;
  state.activeTransaction = null;
  state.status = 'rolled-back';
  state.journal.push({event: 'EDIT_ABORTED', id: decision.id, head: state.head, restoredArtifacts, at: decision.decidedAt});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze({...decision, restoredArtifacts});
}

function validateEvaluation(raw, expectedCheckpointId, label) {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} evaluation is required`);
  if (raw.checkpointId !== expectedCheckpointId) throw new Error(`${label}.checkpointId must bind to ${expectedCheckpointId}`);
  if (!Array.isArray(raw.evidenceRefs) || !raw.evidenceRefs.length) throw new Error(`${label}.evidenceRefs must contain actual review evidence`);
  const utilityScore = Number(raw.utilityScore);
  if (!Number.isFinite(utilityScore)) throw new Error(`${label}.utilityScore must be finite`);
  return {
    checkpointId: raw.checkpointId,
    evidenceRefs: raw.evidenceRefs.map(String),
    utilityScore,
    hardFailures: [...new Set((raw.hardFailures ?? []).map(String))],
    protectedRegressions: [...new Set((raw.protectedRegressions ?? []).map(String))],
    visualReview: String(raw.visualReview ?? 'complete').toLowerCase(),
    closureGates: raw.closureGates && typeof raw.closureGates === 'object' ? structuredClone(raw.closureGates) : {},
    metrics: raw.metrics && typeof raw.metrics === 'object' ? structuredClone(raw.metrics) : {},
  };
}

export function decideEdit({before = {}, after = {}, findings = [], closureRequested = false} = {}) {
  const hardBefore = new Set(before.hardFailures ?? []);
  const hardAfter = new Set(after.hardFailures ?? []);
  const newHardFailures = [...hardAfter].filter((item) => !hardBefore.has(item));
  const protectedRegressions = [...(after.protectedRegressions ?? [])];
  const normalizedFindings = findings.map(normalizeFinding);
  const introducedBlockers = normalizedFindings.filter((finding) => finding.introducedByEdit && ['critical', 'major', 'blocking'].includes(finding.severity));
  if (newHardFailures.length || protectedRegressions.length || introducedBlockers.length) {
    return {
      action: 'ROLLBACK_EDIT',
      reason: newHardFailures.length ? 'new hard failure' : protectedRegressions.length ? 'protected metric regression' : 'new blocking visual finding',
      newHardFailures,
      protectedRegressions,
      findings: normalizedFindings,
    };
  }
  if (after.visualReview === 'insufficient') return {action: 'REQUEST_REVIEW', reason: 'visual evidence is insufficient', findings: normalizedFindings};
  const blockers = normalizedFindings.filter((finding) => ['critical', 'major', 'blocking'].includes(finding.severity));
  if (blockers.length) return {action: 'REOPEN_OWNER', reason: 'blocking finding remains', findings: normalizedFindings};
  const gates = Object.values(after.closureGates ?? {});
  if (closureRequested && gates.length > 0 && gates.every((value) => value === true)) return {action: 'MAY_CLOSE', reason: 'all declared closure gates pass', findings: normalizedFindings};
  const utilityDelta = Number(after.utilityScore) - Number(before.utilityScore);
  if (utilityDelta > 0) return {action: 'KEEP_EDIT', reason: 'bounded edit improved objective without protected regression', utilityDelta, findings: normalizedFindings};
  return {action: 'REQUEST_REVIEW', reason: 'edit is not demonstrably better or worse', utilityDelta, findings: normalizedFindings};
}

export async function finishEdit(root, {candidateCheckpointId, before, after, findings = [], closureRequested = false} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  const transaction = state.activeTransaction;
  if (!transaction) throw new Error('no active edit transaction');
  if (transaction.candidateCheckpointId !== candidateCheckpointId) throw new Error('finish-edit must use the transaction candidate checkpoint');
  const candidate = await loadCheckpoint(root, candidateCheckpointId);
  if (candidate.parentId !== transaction.baselineCheckpointId || candidate.transactionId !== transaction.id) throw new Error('candidate is not the direct artifact of the active edit');
  const normalizedBefore = validateEvaluation(before, transaction.baselineCheckpointId, 'before');
  const normalizedAfter = validateEvaluation(after, candidateCheckpointId, 'after');
  const undeclaredRegressions = normalizedAfter.protectedRegressions.filter((metric) => !transaction.protectedMetrics.includes(metric));
  if (undeclaredRegressions.length) throw new Error(`protected regressions were not declared at begin-edit: ${undeclaredRegressions.join(', ')}`);
  const decisionCore = decideEdit({before: normalizedBefore, after: normalizedAfter, findings, closureRequested});
  const checkpoints = await listCheckpoints(root);
  let route = null;
  if (decisionCore.action === 'REOPEN_OWNER') route = routeFinding({finding: decisionCore.findings[0], checkpoints, headId: candidateCheckpointId});
  const payload = {
    schema: 'refas.edit-decision/v1',
    transactionId: transaction.id,
    baselineCheckpointId: transaction.baselineCheckpointId,
    candidateCheckpointId,
    before: normalizedBefore,
    after: normalizedAfter,
    ...decisionCore,
    route,
  };
  const decision = {...payload, id: `decision_${digestJson(payload).slice(0, 20)}`, decidedAt: nowIso()};
  await writeJsonAtomic(decisionPath(root, decision.id), decision);

  let restoredArtifacts = [];
  if (decision.action === 'ROLLBACK_EDIT' || decision.action === 'REQUEST_REVIEW') {
    const baseline = await loadCheckpoint(root, transaction.baselineCheckpointId);
    restoredArtifacts = await restoreArtifacts(root, baseline.artifactRefs);
    state.head = transaction.baselineCheckpointId;
  } else if (decision.action === 'REOPEN_OWNER' && route) {
    if (route.action === 'REOPEN_CAPABILITY') {
      if (route.rollbackCheckpointId) {
        const rollback = await loadCheckpoint(root, route.rollbackCheckpointId);
        restoredArtifacts = await restoreArtifacts(root, rollback.artifactRefs);
      }
      state.head = route.rollbackCheckpointId;
      state.reopenedCapability = route.ownerCapability;
      state.invalidatedCapabilities = route.invalidatedCapabilities;
      state.status = 'reopened';
    } else {
      const baseline = await loadCheckpoint(root, transaction.baselineCheckpointId);
      restoredArtifacts = await restoreArtifacts(root, baseline.artifactRefs);
      state.head = transaction.baselineCheckpointId;
      state.status = route.action === 'REQUEST_REVIEW' ? 'review-required' : 'blocked';
    }
  } else {
    state.head = candidateCheckpointId;
    acceptCapability(state, candidate.capability);
    state.status = decision.action === 'MAY_CLOSE' ? (state.reopenedCapability ? 'reopened' : 'closure-eligible') : (state.reopenedCapability ? 'reopened' : 'working');
  }
  if (decision.action !== 'REOPEN_OWNER') {
    if (decision.action === 'ROLLBACK_EDIT') state.status = 'rolled-back';
    if (decision.action === 'REQUEST_REVIEW') state.status = 'review-required';
  }
  state.activeTransaction = null;
  await invalidateCertification(root, state);
  state.journal.push({event: 'EDIT_DECIDED', id: decision.id, action: decision.action, head: state.head, restoredArtifacts, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze({...decision, restoredArtifacts});
}

export async function reportFinding(root, {finding} = {}) {
  root = projectRoot(root);
  const state = await loadProject(root);
  if (state.activeTransaction) throw new Error('finish or abandon the active edit before reporting an independent finding');
  const checkpoints = await listCheckpoints(root);
  const route = routeFinding({finding, checkpoints, headId: state.head});
  const payload = {schema: 'refas.finding-decision/v1', headBefore: state.head, route};
  const decision = {...payload, id: `decision_${digestJson(payload).slice(0, 20)}`, decidedAt: nowIso()};
  await writeJsonAtomic(decisionPath(root, decision.id), decision);
  let restoredArtifacts = [];
  if (route.action === 'REOPEN_CAPABILITY') {
    if (route.rollbackCheckpointId) {
      const rollback = await loadCheckpoint(root, route.rollbackCheckpointId);
      restoredArtifacts = await restoreArtifacts(root, rollback.artifactRefs);
    }
    state.head = route.rollbackCheckpointId;
    state.reopenedCapability = route.ownerCapability;
    state.invalidatedCapabilities = route.invalidatedCapabilities;
    state.activeScopeId = route.scopeId;
    state.status = 'reopened';
  } else if (route.action === 'REQUEST_REVIEW') {
    state.status = 'review-required';
  } else {
    state.status = 'blocked';
  }
  await invalidateCertification(root, state);
  state.journal.push({event: 'FINDING_REPORTED', id: decision.id, action: route.action, head: state.head, restoredArtifacts, at: nowIso()});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze({...decision, restoredArtifacts});
}

export async function resumeProject(root) {
  const state = await loadProject(root);
  if (state.activeTransaction) {
    const candidate = state.activeTransaction.candidateCheckpointId;
    return {
      schema: 'refas.resume-guidance/v1',
      status: state.status,
      safeCheckpointId: state.activeTransaction.baselineCheckpointId,
      activeWork: {capability: state.activeTransaction.ownerCapability, scopeId: state.activeTransaction.scopeId},
      nextAction: candidate ? 'FINISH_EDIT' : 'CREATE_CANDIDATE_CHECKPOINT',
      candidateCheckpointId: candidate,
      reason: candidate ? 'the bounded edit has exactly one candidate and requires a decision' : 'the bounded edit requires one direct candidate',
    };
  }
  if (state.status === 'blocked' || state.status === 'review-required') {
    return {
      schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: state.head,
      activeWork: null, nextAction: 'REQUEST_REVIEW', reason: 'evidence or failure ownership must be resolved before mutation',
    };
  }
  const recoveryOwner = nextInvalidated(state);
  if (recoveryOwner) {
    return {
      schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: state.head,
      activeWork: {capability: recoveryOwner, scopeId: state.activeScopeId}, nextAction: 'BEGIN_REPAIR_EDIT',
      invalidatedCapabilities: [...state.invalidatedCapabilities], reason: `${recoveryOwner} is the first invalidated capability that must be reclosed`,
    };
  }
  if (!state.head) {
    return {
      schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: null,
      activeWork: {capability: 'source-intake', scopeId: 'whole'}, nextAction: state.source ? 'CHECKPOINT_SOURCE_INTAKE' : 'BIND_PRIMARY_SOURCE',
      reason: state.source ? 'the source is bound but has no trustworthy checkpoint' : 'downstream work is unsafe without primary source identity',
    };
  }
  if (state.status === 'certified') {
    return {
      schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: state.head,
      activeWork: null, nextAction: 'DONE', reason: 'the current head has a valid whole-object certificate',
    };
  }
  const head = await loadCheckpoint(root, state.head);
  const next = CAPABILITY_ORDER[capabilityIndex(head.capability) + 1] ?? null;
  if (!next) {
    const readiness = await inspectCertificationHead(projectRoot(root), state, head);
    if (!readiness.ready) {
      return {
        schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: state.head,
        activeWork: {capability: 'whole-object-certification', scopeId: 'whole'}, nextAction: 'REQUEST_VISUAL_REVIEW',
        certificationErrors: readiness.errors, reason: readiness.errors[0],
      };
    }
  }
  return {
    schema: 'refas.resume-guidance/v1', status: state.status, safeCheckpointId: state.head,
    activeWork: next ? {capability: next, scopeId: state.activeScopeId} : null,
    nextAction: next ? 'ADVANCE_CAPABILITY' : 'CERTIFY',
    reason: next ? `${head.capability} is trustworthy; advance to its next semantic dependent` : 'all semantic capabilities are closed; run certification',
  };
}

export async function auditProject(root) {
  root = projectRoot(root);
  const state = await loadProject(root);
  const errors = [];
  const warnings = [];
  const checkpoints = await listCheckpoints(root);
  const byId = new Map();
  for (const checkpoint of checkpoints) {
    if (byId.has(checkpoint.id)) errors.push(`${checkpoint.id} is duplicated in project state`);
    byId.set(checkpoint.id, checkpoint);
  }
  if (state.head && !byId.has(state.head)) errors.push('head checkpoint is missing');
  try {
    checkpointLineage(checkpoints, state.head);
  } catch (error) {
    errors.push(error.message);
  }
  for (const checkpoint of checkpoints) {
    if (digestJson(checkpointContent(checkpoint)) !== checkpoint.contentDigest) errors.push(`${checkpoint.id} content digest mismatch`);
    if (checkpoint.parentId && !byId.has(checkpoint.parentId)) errors.push(`${checkpoint.id} parent missing`);
    for (const artifact of checkpoint.artifactRefs) {
      const objectError = await verifyStoredObject(root, artifact);
      if (objectError) errors.push(`${checkpoint.id}:${artifact.path}: ${objectError}`);
    }
  }
  if (state.head && byId.has(state.head)) {
    for (const artifact of byId.get(state.head).artifactRefs) {
      try {
        const current = await assertExistingFileInside(root, artifact.path, 'head artifact');
        if (current.stat.size !== artifact.sizeBytes || await sha256File(current.realFile) !== artifact.sha256) errors.push(`head artifact drift: ${artifact.path}`);
      } catch (error) {
        errors.push(`head artifact unavailable: ${artifact.path}: ${error.message}`);
      }
    }
  }
  if (state.source) {
    try {
      await verifySource(root, normalizeSourceManifest(state.source));
    } catch (error) {
      errors.push(`source integrity: ${error.message}`);
    }
  } else {
    warnings.push('primary source is not bound');
  }
  if (state.activeTransaction) {
    if (!byId.has(state.activeTransaction.baselineCheckpointId)) errors.push('active transaction baseline is missing');
    if (state.activeTransaction.candidateCheckpointId) {
      const candidate = byId.get(state.activeTransaction.candidateCheckpointId);
      if (!candidate || candidate.parentId !== state.activeTransaction.baselineCheckpointId || candidate.transactionId !== state.activeTransaction.id) errors.push('active transaction candidate is invalid');
    }
  }
  if (state.certification && state.certification.checkpointId !== state.head) errors.push('certification does not bind to the active head');
  if (state.certification && state.head && byId.has(state.head)) {
    try {
      const certificate = await readJson(certificatePath(root));
      if (certificate.schema !== 'refas.whole-object-certificate/v1') errors.push('certificate schema is invalid');
      if (certificate.checkpointId !== state.head || certificate.checkpointDigest !== byId.get(state.head).contentDigest) errors.push('certificate checkpoint binding is invalid');
      if (certificate.sourceSha256 !== state.source?.sha256) errors.push('certificate source binding is invalid');
      if (digestJson(certificateCore(certificate)) !== certificate.certificateDigest) errors.push('certificate digest mismatch');
      if (certificate.certificateDigest !== state.certification.certificateDigest) errors.push('project state certificate digest mismatch');
      const readiness = await inspectCertificationHead(root, state, byId.get(state.head));
      for (const error of readiness.errors) errors.push(`certification readiness: ${error}`);
      if (readiness.visualReview?.reviewDigest !== certificate.visualReview?.reviewDigest || readiness.visualReviewArtifact?.sha256 !== certificate.visualReview?.sha256) {
        errors.push('certificate visual-review binding is invalid');
      }
    } catch (error) {
      errors.push(`certificate unavailable: ${error.message}`);
    }
  }
  return {
    schema: 'refas.project-audit/v1', valid: errors.length === 0, errors, warnings,
    checkpointCount: checkpoints.length, objectCount: new Set(checkpoints.flatMap((checkpoint) => checkpoint.artifactRefs.map((artifact) => artifact.sha256))).size,
    head: state.head, activeTransactionId: state.activeTransaction?.id ?? null,
  };
}

export async function assessCertification(root) {
  root = projectRoot(root);
  const state = await loadProject(root);
  const errors = [];
  if (state.activeTransaction) errors.push('cannot certify with an active edit');
  if (state.reopenedCapability || state.invalidatedCapabilities.length) errors.push('cannot certify with invalidated capabilities');
  if (!state.head) errors.push('cannot certify without a checkpoint head');
  let inspection = {visualReview: null, visualReviewArtifact: null};
  if (state.head) {
    const head = await loadCheckpoint(root, state.head);
    inspection = await inspectCertificationHead(root, state, head);
    errors.push(...inspection.errors);
  }
  return deepFreeze({
    schema: 'refas.certification-readiness/v1', ready: errors.length === 0, errors,
    checkpointId: state.head, reviewDigest: inspection.visualReview?.reviewDigest ?? null,
  });
}

export async function certifyProject(root) {
  root = projectRoot(root);
  const state = await loadProject(root);
  if (state.activeTransaction) throw new Error('cannot certify with an active edit');
  if (state.reopenedCapability || state.invalidatedCapabilities.length) throw new Error('cannot certify with invalidated capabilities');
  if (!state.head) throw new Error('cannot certify without a checkpoint head');
  const head = await loadCheckpoint(root, state.head);
  const readiness = await inspectCertificationHead(root, state, head);
  if (!readiness.ready) throw new Error(`certification refused: ${readiness.errors.join('; ')}`);
  const audit = await auditProject(root);
  if (!audit.valid) throw new Error(`project audit failed: ${audit.errors.join('; ')}`);
  const core = {
    schema: 'refas.whole-object-certificate/v1',
    version: REFAS_VERSION,
    projectId: state.projectId,
    sourceSha256: state.source?.sha256 ?? null,
    checkpointId: head.id,
    checkpointDigest: head.contentDigest,
    gateIds: head.gates.map((gate) => gate.id),
    visualReview: {
      path: readiness.visualReviewArtifact.path,
      sha256: readiness.visualReviewArtifact.sha256,
      reviewDigest: readiness.visualReview.reviewDigest,
      evidenceClass: readiness.visualReview.evidenceClass,
    },
    audit: {checkpointCount: audit.checkpointCount, objectCount: audit.objectCount},
  };
  const certificate = {...core, certificateDigest: digestJson(core), certifiedAt: nowIso()};
  await writeJsonAtomic(certificatePath(root), certificate);
  state.status = 'certified';
  state.certification = {checkpointId: head.id, certificateDigest: certificate.certificateDigest};
  state.journal.push({event: 'PROJECT_CERTIFIED', checkpointId: head.id, certificateDigest: certificate.certificateDigest, at: certificate.certifiedAt});
  await writeJsonAtomic(statePath(root), state);
  return deepFreeze(certificate);
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

import {REFAS_VERSION, digestJson} from './canonical.mjs';
import {inspectGlb} from './glb.mjs';
import {loadProject, loadCheckpoint} from './checkpoint-store.mjs';
import {assessCertification, assessClaimCertification, auditProject} from './physical-claim-certification-gate.mjs';

export const QA_COVERAGE_SCHEMA = 'refas.qa-coverage-report/v1';
export const QA_COVERAGE_STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT_RUN', 'INSUFFICIENT', 'NOT_APPLICABLE']);
export const SOURCE_BOUND_QA_PROFILE = 'source-bound-object';

const HEX_DIGEST = /^[a-f0-9]{64}$/u;
const BINDINGS = Object.freeze([
  {id:'relational-evidence', owner:'spatial-hypotheses', kinds:['relational-structure', 'semantic-authority', 'relational-discrepancy']},
  {id:'realized-contact-support', owner:'assembly', kinds:['realized-contact-report']},
  {id:'registered-multiview', owner:'rendering', kinds:['registered-comparison', 'render-report']},
  {id:'independent-visual-review', owner:'visual-critique', kinds:['visual-review']},
]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function contained(root, relative) {
  if (typeof relative !== 'string' || relative.length === 0) return null;
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return file;
}

function check(id, owner, status, reason, evidence = []) {
  if (!QA_COVERAGE_STATUSES.includes(status)) throw new Error('invalid QA status');
  return {id, owner, required:true, status, reason, evidence};
}

async function sourceCheck(root, source) {
  if (!source) return check('source-provenance', 'source-intake', 'NOT_RUN', 'project source was never bound');
  if (!HEX_DIGEST.test(String(source.sha256 ?? ''))) return check('source-provenance', 'source-intake', 'FAIL', 'source manifest digest is malformed');
  const file = contained(root, source.path);
  if (!file) return check('source-provenance', 'source-intake', 'FAIL', 'source path is missing or outside project root');
  try {
    const bytes = await fs.readFile(file);
    if (sha256(bytes) !== source.sha256) return check('source-provenance', 'source-intake', 'FAIL', 'source bytes do not match project-bound manifest SHA-256');
    return check('source-provenance', 'source-intake', 'PASS', 'current raw source bytes match the manifest digest', [source.sha256]);
  } catch {
    return check('source-provenance', 'source-intake', 'FAIL', 'registered source bytes are not readable');
  }
}

async function evidenceCheck(root, head, entry, readiness) {
  if (!head) return check(entry.id, entry.owner, 'NOT_RUN', 'no checkpoint head exists');
  const artifacts = head.artifactRefs ?? [];
  const selected = [];
  for (const kind of entry.kinds) {
    const matches = artifacts.filter((artifact) => artifact.kind === kind);
    if (matches.length !== 1) {
      return check(entry.id, entry.owner, matches.length === 0 ? 'NOT_RUN' : 'INSUFFICIENT', 'expected exactly one current artifact of kind ' + kind);
    }
    const artifact = matches[0];
    const file = contained(root, artifact.path);
    if (!file || !HEX_DIGEST.test(String(artifact.sha256 ?? ''))) return check(entry.id, entry.owner, 'FAIL', 'invalid artifact binding for kind ' + kind);
    let actual;
    try { actual = sha256(await fs.readFile(file)); }
    catch { return check(entry.id, entry.owner, 'FAIL', 'missing current bytes for kind ' + kind); }
    if (actual !== artifact.sha256) return check(entry.id, entry.owner, 'FAIL', 'artifact byte digest mismatch for kind ' + kind);
    selected.push(actual);
  }
  if (!readiness?.ready) return check(entry.id, entry.owner, 'INSUFFICIENT', 'current evidence bytes exist but certification validators have not closed', selected);
  return check(entry.id, entry.owner, 'PASS', 'current digest-bound artifacts participate in passing certification readiness', selected);
}

/**
 * Read-only QA-01a coverage inventory. Not an alternate certificate or an AI visual judge.
 * Unlike later QA-01b, this does not yet enforce final host transfer admission.
 */
export async function verifySourceBoundObject(root, assetFile) {
  root = path.resolve(root);
  const asset = path.resolve(assetFile);
  if (!contained(root, path.relative(root, asset))) throw new Error('QA asset path must stay inside project root');
  const bytes = await fs.readFile(asset);
  const assetSha256 = sha256(bytes);

  let intrinsic;
  try { intrinsic = inspectGlb(bytes); }
  catch (error) { intrinsic = {valid:false, reason:String(error.message ?? error)}; }

  let state = null;
  try { state = await loadProject(root); }
  catch { /* absent project remains explicit NOT_RUN */ }
  const checks = [];
  checks.push(await sourceCheck(root, state?.source ?? null));
  checks.push(check('glb-integrity', 'shape-reconstruction', intrinsic.valid ? 'PASS' : 'FAIL',
    intrinsic.valid ? 'GLB intrinsic structure is valid; this is not a source resemblance finding' : 'GLB intrinsic inspection failed',
    intrinsic.valid ? [assetSha256] : []));

  let head = null;
  if (state?.head) {
    try { head = await loadCheckpoint(root, state.head); }
    catch { /* corrupted/missing checkpoint is classified below */ }
  }
  if (!state?.head) checks.push(check('candidate-lineage', 'whole-object-certification', 'NOT_RUN', 'no checkpoint or current candidate lineage exists'));
  else if (!head) checks.push(check('candidate-lineage', 'whole-object-certification', 'FAIL', 'checkpoint head could not be loaded'));
  else {
    const matches = (head.artifactRefs ?? []).filter((entry) => entry.kind === 'glb' && entry.sha256 === assetSha256);
    checks.push(check('candidate-lineage', 'whole-object-certification', matches.length === 1 ? 'INSUFFICIENT' : 'FAIL',
      matches.length === 1 ? 'candidate bytes are bound to a checkpoint, but full candidate lineage must still close' : 'candidate GLB bytes do not match exactly one current checkpoint GLB',
      matches.length === 1 ? [assetSha256] : []));
  }

  let readiness=null, claims=null, audit=null;
  if (head) {
    try { readiness=await assessCertification(root); } catch { /* fail closed */ }
    try { claims=await assessClaimCertification(root); } catch { /* fail closed */ }
    try { audit=await auditProject(root); } catch { /* fail closed */ }
  }
  for (const item of BINDINGS) checks.push(await evidenceCheck(root, head, item, readiness));

  const authoritative = Boolean(head && state?.certification && state.status === 'certified'
    && readiness?.ready && claims?.required && claims.valid && audit?.valid);
  const candidateIndex=checks.findIndex((item)=>item.id==='candidate-lineage');
  if (authoritative && checks[candidateIndex].status==='INSUFFICIENT') {
    checks[candidateIndex]=check('candidate-lineage','whole-object-certification','PASS',
      'checkpoint, trusted certification and current candidate bytes are consistent',[assetSha256]);
  }
  checks.push(check('whole-object-certification','whole-object-certification',
    authoritative ? 'PASS' : (head ? 'INSUFFICIENT' : 'NOT_RUN'),
    authoritative ? 'current RefAs certified state, claim readiness and audit agree' : 'trusted source-bound whole-object certification is absent or incomplete',
    authoritative ? [state.certification.certificateDigest] : []));

  const blockingCheckIds=checks.filter((item)=>item.required && item.status!=='PASS').map((item)=>item.id);
  const report={
    schema:QA_COVERAGE_SCHEMA,
    profile:SOURCE_BOUND_QA_PROFILE,
    evaluatorVersion:REFAS_VERSION,
    sourceSha256:state?.source?.sha256 ?? null,
    assetSha256,
    checkpointId:state?.head ?? null,
    checks,
    decision:{state:blockingCheckIds.length ? 'BLOCKED' : 'ELIGIBLE',blockingCheckIds},
    limits:['No independent source semantic detection is performed', 'QA-01a does not enforce final host handoff admission', 'This report is not a certificate'],
  };
  return Object.freeze({...report, reportDigest:digestJson(report)});
}

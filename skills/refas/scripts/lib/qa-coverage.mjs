import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

import {REFAS_VERSION, digestJson} from './canonical.mjs';
import {inspectGlb} from './glb.mjs';
import {loadProject, loadCheckpoint} from './checkpoint-store.mjs';
import {replayRealizedContactEvidence} from './qa-contact-replay.mjs';
import {assessCertification, assessClaimCertification, auditProject} from './physical-claim-certification-gate.mjs';

export const QA_COVERAGE_SCHEMA = 'refas.qa-coverage-report/v1';
export const QA_COVERAGE_STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT_RUN', 'INSUFFICIENT', 'NOT_APPLICABLE']);
export const SOURCE_BOUND_QA_PROFILE = 'source-bound-object';

const HEX_DIGEST = /^[a-f0-9]{64}$/u;
const BINDINGS = Object.freeze([
  {id:'relational-evidence', owner:'spatial-hypotheses', kinds:['relational-structure', 'semantic-authority', 'relational-discrepancy']},
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

async function existingContainedFile(root, candidate) {
  const lexical = contained(root, candidate);
  if (!lexical) return null;
  try {
    const [trustedRoot, trustedFile] = await Promise.all([fs.realpath(root), fs.realpath(lexical)]);
    const relative = path.relative(trustedRoot, trustedFile);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
    return trustedFile;
  } catch { return null; }
}

async function sourceCheck(root, source) {
  if (!source) return check('source-provenance', 'source-intake', 'NOT_RUN', 'project source was never bound');
  if (!HEX_DIGEST.test(String(source.sha256 ?? ''))) return check('source-provenance', 'source-intake', 'FAIL', 'source manifest digest is malformed');
  const file = await existingContainedFile(root, source.path);
  if (!file) return check('source-provenance', 'source-intake', 'FAIL', 'source path is missing or outside project root');
  try {
    const bytes = await fs.readFile(file);
    if (sha256(bytes) !== source.sha256) return check('source-provenance', 'source-intake', 'FAIL', 'source bytes do not match project-bound manifest SHA-256');
    return check('source-provenance', 'source-intake', 'PASS', 'current raw source bytes match the manifest digest', [source.sha256]);
  } catch {
    return check('source-provenance', 'source-intake', 'FAIL', 'registered source bytes are not readable');
  }
}

async function contactReplayCheck(root, head, assetBytes, sourceSha256) {
  const kinds = ['attachment-semantics','realized-contact-plan','realized-contact-graph','realized-contact-report'];
  if (!head) return check('realized-contact-support','assembly','NOT_RUN','no checkpoint head exists');
  const bound = [];
  const records = {};
  for (const kind of kinds) {
    const refs = (head.artifactRefs ?? []).filter((ref) => ref.kind === kind);
    if (refs.length !== 1) {
      return check('realized-contact-support','assembly',
        refs.length ? 'INSUFFICIENT' : 'NOT_RUN','expected exactly one current artifact of kind ' + kind);
    }
    const ref=refs[0],file=await existingContainedFile(root,ref.path);
    if (!file || !HEX_DIGEST.test(String(ref.sha256 ?? ''))) {
      return check('realized-contact-support','assembly','FAIL','invalid or uncontained ' + kind + ' artifact reference');
    }
    try {
      const bytes=await fs.readFile(file);
      if (sha256(bytes)!==ref.sha256 || bytes.length !== ref.sizeBytes) {
        return check('realized-contact-support','assembly','FAIL','current artifact bytes drifted for ' + kind);
      }
      records[kind]=JSON.parse(bytes.toString('utf8'));
      bound.push(ref.sha256);
    } catch {
      return check('realized-contact-support','assembly','FAIL','missing or malformed JSON artifact for ' + kind);
    }
  }
  // A persisted propagation plan/report must never be silently detached by
  // removing the contact plan's propagation digest. Mandatory applicability
  // for solver-dependent and transitive relations is also replayed against
  // the canonical attachment graph below, even when neither file is supplied.
  const propagationBound=records['realized-contact-plan']?.propagationReportDigest != null;
  const danglingPropagation=(head.artifactRefs??[]).filter(ref=>
    ref.kind==='attachment-propagation-plan'||ref.kind==='attachment-propagation-report');
  if(!propagationBound&&danglingPropagation.length){
    return check('realized-contact-support','assembly','INSUFFICIENT',
      'current propagation artifacts are not bound by the contact plan');
  }
  // Read both files exactly when the current contact plan binds a report.
  if (records['realized-contact-plan']?.propagationReportDigest != null) {
    for (const kind of ['attachment-propagation-plan','attachment-propagation-report']) {
      const refs=(head.artifactRefs??[]).filter((ref)=>ref.kind===kind);
      if (refs.length!==1) {
        return check('realized-contact-support','assembly',
          refs.length?'INSUFFICIENT':'NOT_RUN','expected exactly one current artifact of kind '+kind);
      }
      const ref=refs[0],file=await existingContainedFile(root,ref.path);
      if (!file || !HEX_DIGEST.test(String(ref.sha256??''))) {
        return check('realized-contact-support','assembly','FAIL','invalid or uncontained '+kind+' artifact reference');
      }
      try {
        const bytes=await fs.readFile(file);
        if (sha256(bytes)!==ref.sha256 || bytes.length!==ref.sizeBytes) {
          return check('realized-contact-support','assembly','FAIL','current artifact bytes drifted for '+kind);
        }
        records[kind]=JSON.parse(bytes.toString('utf8'));
        bound.push(ref.sha256);
      } catch {
        return check('realized-contact-support','assembly','FAIL','missing or malformed JSON artifact for '+kind);
      }
    }
  }

  // Independently replay all dependency-rich propagation modes.
  // Digest-only plan/report snapshots never authorize a solved joint.
  const propagationDependencies={};
  const propagationPlan=records['attachment-propagation-plan'];
  if(propagationPlan){
    const needed=[
      ...(propagationPlan.surfaceAnchorSetDigest ? ['surface-anchor-set','surface-descriptors'] : []),
      ...(propagationPlan.followStateDigest ? ['attachment-follow-state'] : []),
      ...((propagationPlan.multiAnchorBindings??[]).length?['multi-anchor-plans']:[]),
      ...((propagationPlan.articulatedBindings??[]).length?['articulated-joints']:[]),
    ];
    const names={
      'surface-anchor-set':'surfaceAnchorSet',
      'surface-descriptors':'surfaces',
      'attachment-follow-state':'followState',
      'multi-anchor-plans':'multiAnchorPlans',
      'articulated-joints':'articulatedJoints',
    };
    for(const kind of needed){
      const refs=(head.artifactRefs??[]).filter(ref=>ref.kind===kind);
      if(refs.length!==1){
        return check('realized-contact-support','assembly',
          refs.length?'INSUFFICIENT':'NOT_RUN','expected exactly one dependency evidence artifact: '+kind);
      }
      const ref=refs[0],file=await existingContainedFile(root,ref.path);
      if(!file||!HEX_DIGEST.test(String(ref.sha256??''))){
        return check('realized-contact-support','assembly','FAIL','invalid dependency artifact ref: '+kind);
      }
      try{
        const bytes=await fs.readFile(file);
        if(bytes.length!==ref.sizeBytes||sha256(bytes)!==ref.sha256){
          return check('realized-contact-support','assembly','FAIL','dependency artifact bytes drifted: '+kind);
        }
        propagationDependencies[names[kind]]=JSON.parse(bytes.toString('utf8'));
        bound.push(ref.sha256);
      }catch{
        return check('realized-contact-support','assembly','FAIL','missing or malformed propagation dependency: '+kind);
      }
    }
  }
  // A physical fuse requires the independently readable original GLB,
  // canonical edit inputs and a real pre-fusion checkpoint ancestor.
  // Never turn digest-only worker provenance into an assembly PASS.
  const fusionBindings=records['realized-contact-plan']?.fusionBindings??[];
  const fusionReplayInputs=[];
  if(fusionBindings.length>1) {
    return check('realized-contact-support','assembly','INSUFFICIENT',
      'multi-root fusion requires separate independently bound replay for each original checkpoint');
  }
  if(fusionBindings.length===1) {
    const kinds=['logical-fusion','canonical-edit-intent','physical-fusion-plan',
      'physical-fusion-report','fusion-provenance','pre-fusion-glb'];
    for(const kind of kinds) {
      const refs=(head.artifactRefs??[]).filter(ref=>ref.kind===kind);
      if(refs.length!==1) {
        return check('realized-contact-support','assembly',
          refs.length?'INSUFFICIENT':'NOT_RUN','expected exactly one current fusion evidence artifact: '+kind);
      }
      const ref=refs[0],file=await existingContainedFile(root,ref.path);
      if(!file||!HEX_DIGEST.test(String(ref.sha256??''))){
        return check('realized-contact-support','assembly','FAIL','invalid fusion artifact reference: '+kind);
      }
      try{
        const bytes=await fs.readFile(file);
        if(bytes.length!==ref.sizeBytes||sha256(bytes)!==ref.sha256){
          return check('realized-contact-support','assembly','FAIL','fusion artifact bytes drifted: '+kind);
        }
        records[kind]=kind==='pre-fusion-glb'?bytes:JSON.parse(bytes.toString('utf8'));
        bound.push(ref.sha256);
      }catch{
        return check('realized-contact-support','assembly','FAIL','missing or malformed fusion artifact: '+kind);
      }
    }
    const fusedPlan=records['physical-fusion-plan'];
    if(records['pre-fusion-glb']&&sha256(records['pre-fusion-glb'])!==fusedPlan.inputAssetSha256){
      return check('realized-contact-support','assembly','FAIL','fusion input GLB differs from physical plan');
    }
    let originalState,checkpoint;
    try {
      originalState=await loadProject(root);
      checkpoint=await loadCheckpoint(root,fusedPlan.preFusionCheckpointId);
    }catch {
      return check('realized-contact-support','assembly','INSUFFICIENT',
        'canonical pre-fusion checkpoint is not readable in the current project');
    }
    if(!(originalState.checkpointIds??[]).includes(checkpoint.id)||head.parentId!==checkpoint.id){
      return check('realized-contact-support','assembly','INSUFFICIENT',
        'exact pre-fusion checkpoint must be a current ancestor of the contact checkpoint');
    }
    fusionReplayInputs.push({
      physicalEntityId:fusionBindings[0].physicalEntityId,
      preFusionGlb:records['pre-fusion-glb'],
      preFusionCheckpoint:checkpoint,
      logicalFusion:records['logical-fusion'],
      canonicalEditIntent:records['canonical-edit-intent'],
      plan:fusedPlan,
      report:records['physical-fusion-report'],
      provenance:records['fusion-provenance'],
    });
  }
  // Persisted component witnesses may not bypass exact current checkpoint
  // path/size/bytes binding. Absence is handled as INSUFFICIENT by trusted
  // replay only if this GLB genuinely contains unreviewed physical islands.
  const componentRefs=(head.artifactRefs??[]).filter(ref=>
    ref.kind==='triangle-component-support-plan');
  if(componentRefs.length>1){
    return check('realized-contact-support','assembly','INSUFFICIENT',
      'exactly one current component-support plan may authorize split meshes');
  }
  let componentSupportPlan=null;
  if(componentRefs.length===1){
    const ref=componentRefs[0],file=await existingContainedFile(root,ref.path);
    if(!file||!HEX_DIGEST.test(String(ref.sha256??''))){
      return check('realized-contact-support','assembly','FAIL',
        'invalid or uncontained triangle-component-support-plan artifact');
    }
    try{
      const bytes=await fs.readFile(file);
      if(bytes.length!==ref.sizeBytes||sha256(bytes)!==ref.sha256){
        return check('realized-contact-support','assembly','FAIL',
          'triangle-component-support-plan artifact bytes drifted');
      }
      componentSupportPlan=JSON.parse(bytes.toString('utf8'));
      bound.push(ref.sha256);
    }catch{
      return check('realized-contact-support','assembly','FAIL',
        'triangle-component-support-plan is missing or malformed');
    }
  }
  const replay=replayRealizedContactEvidence({
    glb:assetBytes,sourceSha256,
    attachmentSemantics:records['attachment-semantics'],
    plan:records['realized-contact-plan'],
    graph:records['realized-contact-graph'],
    report:records['realized-contact-report'],
    propagationPlan:records['attachment-propagation-plan']??null,
    propagationReport:records['attachment-propagation-report']??null,
    propagationDependencies,
    fusionReplayInputs,
    componentSupportPlan,
  });
  return check('realized-contact-support','assembly',replay.status,replay.reason + (
    replay.details.length ? ': ' + replay.details.join('; ') : ''),bound);
}

async function evidenceCheck(root, head, entry, trustedCertified) {
  if (!head) return check(entry.id, entry.owner, 'NOT_RUN', 'no checkpoint head exists');
  const artifacts = head.artifactRefs ?? [];
  const selected = [];
  for (const kind of entry.kinds) {
    const matches = artifacts.filter((artifact) => artifact.kind === kind);
    if (matches.length !== 1) {
      return check(entry.id, entry.owner, matches.length === 0 ? 'NOT_RUN' : 'INSUFFICIENT', 'expected exactly one current artifact of kind ' + kind);
    }
    const artifact = matches[0];
    const file = await existingContainedFile(root, artifact.path);
    if (!file || !HEX_DIGEST.test(String(artifact.sha256 ?? ''))) return check(entry.id, entry.owner, 'FAIL', 'invalid artifact binding for kind ' + kind);
    let actual;
    try { actual = sha256(await fs.readFile(file)); }
    catch { return check(entry.id, entry.owner, 'FAIL', 'missing current bytes for kind ' + kind); }
    if (actual !== artifact.sha256) return check(entry.id, entry.owner, 'FAIL', 'artifact byte digest mismatch for kind ' + kind);
    selected.push(actual);
  }
  // Presence, path containment, and SHA-256 equality establish file integrity, not
  // independent typed validation. Never upgrade a user-authored result to PASS
  // using an unrelated readiness boolean.
  if (!trustedCertified) {
    return check(entry.id, entry.owner, 'INSUFFICIENT',
      'artifact bytes exist, but a current trusted certification/claim audit has not closed', selected);
  }
  if (entry.id === 'realized-contact-support') {
    // Contact reports are not automatically included in every visual claim;
    // a report cannot prove realized support without the current plan, graph,
    // attachment semantics, and an independent candidate-GLB replay.
    return check(entry.id, entry.owner, 'INSUFFICIENT',
      'realized-contact report bytes exist but typed contact/support replay is not yet implemented by QA-01a', selected);
  }
  return check(entry.id, entry.owner, 'PASS',
    'exact current artifacts participate in validated, audited RefAs whole-object certification', selected);
}

/**
 * Read-only QA-01a coverage inventory. Not an alternate certificate or an AI visual judge.
 * Unlike later QA-01b, this does not yet enforce final host transfer admission.
 */
export async function verifySourceBoundObject(root, assetFile) {
  root = path.resolve(root);
  const asset = await existingContainedFile(root, assetFile);
  if (!asset) throw new Error('QA asset path must stay inside project root');
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
  const authoritative = Boolean(head && state?.certification && state.status === 'certified'
    && readiness?.ready && claims?.required && claims.valid && audit?.valid);
  for (const item of BINDINGS) checks.push(await evidenceCheck(root, head, item, authoritative));
  checks.push(await contactReplayCheck(root, head, bytes, state?.source?.sha256 ?? null));
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
    limits:['No independent source semantic detection is performed', 'Contact replay verifies declared assembly evidence, not independent source semantics; final host admission is separate', 'This report is not a certificate'],
  };
  return Object.freeze({...report, reportDigest:digestJson(report)});
}

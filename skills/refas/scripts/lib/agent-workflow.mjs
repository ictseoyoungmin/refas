// v1.2.1 Agent Workflow Interface: read-only presentation of existing RefAs
// state, QA coverage and typed recovery authority. Not a verifier or certificate.
import {deepFreeze, REFAS_VERSION} from './canonical.mjs';
import {loadProject, listCheckpoints, resumeProject} from './checkpoint-store.mjs';
import {routeFinding} from './failure-router.mjs';
import {verifySourceBoundObject} from './qa-coverage.mjs';

export const AGENT_NEXT_SCHEMA='refas.agent-next/v1';
export const AGENT_DIAGNOSIS_SCHEMA='refas.agent-diagnosis/v1';

// Only expose existing public CLI operations. The descriptors deliberately
// request missing evidence; they do not synthesize model geometry or approvals.
const ACTION_COMMANDS=Object.freeze({
  BIND_PRIMARY_SOURCE:{command:'source-manifest',requires:['--image','--out','--root','--id'],then:'refas bind-source'},
  CHECKPOINT_SOURCE_INTAKE:{command:'checkpoint',requires:['--root','--capability source-intake','--scope','--artifacts','--gates']},
  CREATE_CANDIDATE_CHECKPOINT:{command:'checkpoint',requires:['--root','--capability','--scope','--artifacts','--gates']},
  FINISH_EDIT:{command:'finish-edit',requires:['--root','--candidate','--before','--after']},
  BEGIN_REPAIR_EDIT:{command:'begin-edit',requires:['--root','--owner','--scope','--intent']},
  REQUEST_REVIEW:{command:'status',requires:['--root'],note:'Obtain genuine source/render evidence and report a typed finding; do not auto-rollback.'},
  GATHER_RESEMBLANCE_EVIDENCE:{command:'render-pbr',requires:['--glb','--out','--frame','--neutral-clay']},
  REQUEST_RESEMBLANCE_REVIEW:{command:'compare',requires:['--input','--out']},
  REVERIFY_FINAL_SPATIAL_CONTINUITY:{command:'audit',requires:['--root'],note:'Audit does not itself issue source-bound approval.'},
  DONE:{command:'verify',requires:['--root','--asset'],note:'Generic certification is not source-bound release authorization.'},
});

export async function nextAgentWork(root) {
  const state=await loadProject(root);
  const guidance=await resumeProject(root);
  const action=guidance.nextAction;
  const ownerCapability=guidance.activeWork?.capability??null;
  const command=ACTION_COMMANDS[action]??null;
  return deepFreeze({
    schema:AGENT_NEXT_SCHEMA,version:REFAS_VERSION,
    projectId:state.projectId,checkpointId:state.head??null,
    projectStatus:state.status,action,
    ownerCapability,scopeId:guidance.activeWork?.scopeId??null,
    guidance,invocation:command?{bin:'refas',...command}:null,
    discovery:ownerCapability?{
      bin:'refas',command:'describe',arguments:['capability',ownerCapability],
    }:null,
    finalSourceBoundAuthorization:'NOT_EVALUATED',
    note:'Read-only guidance; this result is not a completed action, gate, certificate or release receipt.',
  });
}

export function summarizeCoverage(coverage) {
  if(!coverage || coverage.schema!=='refas.qa-coverage-report/v1')
    throw new Error('agent diagnosis requires canonical source-bound QA coverage');
  const blockers=coverage.checks.filter(x=>x.required&&x.status!=='PASS')
    .map(x=>({
      checkId:x.id,status:x.status,ownerCapability:x.owner??null,
      reason:x.reason??null,evidenceRefs:x.evidence??[],
      followUp:x.status==='FAIL'?'REPAIR_WITH_TYPED_FINDING':'GATHER_OR_REVIEW_EVIDENCE',
    }));
  return deepFreeze({
    profile:coverage.profile,decision:coverage.decision,
    reportDigest:coverage.reportDigest,assetSha256:coverage.assetSha256,
    blockers,blockerCount:blockers.length,
    checkCount:coverage.checks.length,
    limits:coverage.limits,
  });
}

export async function diagnoseAgentWork(root,{assetFile=null,finding=null}={}) {
  if(assetFile!=null&&typeof assetFile!=='string')throw new Error('assetFile must be a path');
  const next=await nextAgentWork(root);
  let route=null;
  if(finding!=null){
    const state=await loadProject(root);
    route=routeFinding({finding,checkpoints:await listCheckpoints(root),headId:state.head});
  }
  const coverage=assetFile==null?null:await verifySourceBoundObject(root,assetFile);
  const diagnosis=coverage?summarizeCoverage(coverage):null;
  return deepFreeze({
    schema:AGENT_DIAGNOSIS_SCHEMA,version:REFAS_VERSION,
    projectId:next.projectId,checkpointId:next.checkpointId,
    next,route,coverage,diagnosis,
    action:route?.action??(diagnosis?.decision.state==='BLOCKED'
      ? 'REVIEW_SOURCE_BOUND_BLOCKERS':next.action),
    sourceBoundDecision:diagnosis?.decision.state??'NOT_EVALUATED',
    mutationPerformed:false,
    note:'Inspection only: no synthesized findings, no bypass of existing source-bound gates or certification.',
  });
}

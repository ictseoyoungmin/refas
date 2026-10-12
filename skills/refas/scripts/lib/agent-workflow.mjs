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
  REPORT_RESEMBLANCE_FINDINGS:{command:'report-finding',requires:['--root','--finding'],note:'Use a genuine typed finding from resume guidance; never invent a finding or commit it automatically.'},
  GATHER_RESEMBLANCE_EVIDENCE:{command:'render-pbr',requires:['--glb','--out','--frame','--neutral-clay']},
  REQUEST_RESEMBLANCE_REVIEW:{command:'compare',requires:['--input','--out']},
  REVERIFY_FINAL_SPATIAL_CONTINUITY:{command:'audit',requires:['--root'],note:'Audit does not itself issue source-bound approval.'},
  CERTIFY:{command:'certify',requires:['--root'],note:'Generic whole-object certificate only; strict source-bound Handoff is a separate approval.'},
});

// Explicit non-executable work is not a fabricated CLI command. An agent
// may only execute invocations that actually exist in ACTION_COMMANDS.
export const AGENT_NEXT_ACTION_PLANS=deepFreeze({
  BIND_PRIMARY_SOURCE:{kind:'command',instructionNode:'provenance',nextStep:'BIND_SOURCE',requiredEvidence:['project-local-primary-image']},
  CHECKPOINT_SOURCE_INTAKE:{kind:'command',instructionNode:'checkpointing',nextStep:'COMMIT_SOURCE_CHECKPOINT',requiredEvidence:['trusted-source-manifest','source-intake-gate-evidence']},
  CREATE_CANDIDATE_CHECKPOINT:{kind:'command',instructionNode:'checkpointing',nextStep:'CONSTRUCT_AND_COMMIT_CANDIDATE',requiredEvidence:['actual-owner-scoped-construction-artifacts','current-gate-evidence']},
  FINISH_EDIT:{kind:'command',instructionNode:'checkpointing',nextStep:'DECIDE_BOUNDED_EDIT',requiredEvidence:['one-candidate-checkpoint','before-and-after-observations']},
  BEGIN_REPAIR_EDIT:{kind:'command',instructionNode:'checkpointing',nextStep:'BEGIN_OWNER_SCOPED_EDIT',requiredEvidence:['typed-finding-route','safe-checkpoint']},
  REQUEST_REVIEW:{kind:'review',instructionNode:'failure-routing',nextStep:'GATHER_AND_ROUTE_REAL_FINDING',requiredEvidence:['current-source-and-candidate-evidence','typed-finding-if-supported']},
  GATHER_RESEMBLANCE_EVIDENCE:{kind:'command',instructionNode:'validation',nextStep:'CAPTURE_NEUTRAL_CLAY_AND_COMPARE',requiredEvidence:['exact-current-candidate-glb','source-bound-signatures','canonical-frame']},
  REQUEST_RESEMBLANCE_REVIEW:{kind:'command',instructionNode:'validation',nextStep:'INSPECT_REGISTERED_SOURCE_COMPARISON',requiredEvidence:['registered-source-and-render','current-candidate-glb']},
  REPORT_RESEMBLANCE_FINDINGS:{kind:'command',instructionNode:'failure-routing',nextStep:'REPORT_EXISTING_TYPED_FINDINGS',requiredEvidence:['typed-findings-from-early-resemblance-barrier']},
  GATHER_SPATIAL_EVIDENCE:{kind:'construction',instructionNode:'spatial-reasoning',nextStep:'OBSERVE_AND_REEVALUATE_VOLUME',requiredEvidence:['source-spatial-observations','exact-glb-multiview','candidate-bound-volume-evidence']},
  REWORK_SHAPE_VOLUME:{kind:'construction',instructionNode:'construction',nextStep:'REBUILD_OWNER_LOCAL_SHAPE',requiredEvidence:['actual-candidate-glb','localized-planar-collapse-defect','source-and-side-top-render-evidence']},
  REQUEST_VISUAL_REVIEW:{kind:'review',instructionNode:'validation',nextStep:'OBTAIN_INDEPENDENT_VISUAL_REVIEW',requiredEvidence:['current-source-reference','current-render-evidence','certification-errors']},
  REVERIFY_FINAL_SPATIAL_CONTINUITY:{kind:'command',instructionNode:'validation',nextStep:'RECHECK_FINAL_CANDIDATE_CONTINUITY',requiredEvidence:['exact-current-glb','candidate-lineage','final-spatial-continuity-evidence']},
  ADVANCE_CAPABILITY:{kind:'construction',instructionNode:'workflow',nextStep:'CONSTRUCT_NEXT_CAPABILITY',requiredEvidence:['current-trustworthy-checkpoint','active-owner-capability-and-scope']},
  CERTIFY:{kind:'command',instructionNode:'claim-certification',nextStep:'EVALUATE_GENERIC_CERTIFICATE',requiredEvidence:['sealed-candidate-transaction','required-current-visual-and-structural-evidence']},
  DONE:{kind:'terminal',instructionNode:'claim-certification',nextStep:'NO_FURTHER_GENERIC_ACTION',requiredEvidence:[]},
});

export async function nextAgentWork(root) {
  const state=await loadProject(root);
  const guidance=await resumeProject(root);
  const action=guidance.nextAction;
  const ownerCapability=guidance.activeWork?.capability??null;
  const workPlan=AGENT_NEXT_ACTION_PLANS[action];
  if(!workPlan)throw new Error('unsupported canonical resume action: '+action);
  const command=ACTION_COMMANDS[action]??null;
  return deepFreeze({
    schema:AGENT_NEXT_SCHEMA,version:REFAS_VERSION,
    projectId:state.projectId,checkpointId:state.head??null,
    projectStatus:state.status,action,
    ownerCapability,scopeId:guidance.activeWork?.scopeId??null,
    guidance,workPlan,invocation:command?{bin:'refas',...command}:null,
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

import {validateAttachmentPropagationPlan, validateAttachmentPropagationReport} from './attachment-propagation.mjs';

export const QA_PROPAGATION_DEPENDENCIES_SCHEMA='refas.qa-propagation-dependencies/v1';
const verdict=(status,reason,details=[])=>Object.freeze({
 schema:QA_PROPAGATION_DEPENDENCIES_SCHEMA,status,reason,details:[...details].sort(),
});

/**
 * A persisted attachment-propagation report may only pass after all required
 * geometry/kinematic solver dependencies have been independently replayed.
 * This is solver-consistency, not source-observed fidelity or physical contact.
 */
export function replayTrustedPropagationDependencies({
 plan, report, attachmentSemantics, surfaceAnchorSet=null, surfaces=null,
 followState=null, multiAnchorPlans=null, articulatedJoints=null,
}={}){
 if(!plan||!report||!attachmentSemantics)return verdict('NOT_RUN','propagation plan, report and current semantic state are mandatory');
 const requiresSurface=plan.surfaceAnchorSetDigest!=null;
 const requiresFollow=plan.followStateDigest!=null;
 const requiresMulti=(plan.multiAnchorBindings??[]).length>0;
 const requiresArticulated=(plan.articulatedBindings??[]).length>0;
 const missing=[
  ...(requiresSurface&&!surfaceAnchorSet?['surface-anchor-set']:[]),
  ...(requiresSurface&&!Array.isArray(surfaces)?['surface-descriptors']:[]),
  ...(requiresFollow&&!followState?['attachment-follow-state']:[]),
  ...(requiresMulti&&!Array.isArray(multiAnchorPlans)?['multi-anchor-plans']:[]),
  ...(requiresArticulated&&!Array.isArray(articulatedJoints)?['articulated-joints']:[]),
 ];
 if(missing.length)return verdict('INSUFFICIENT','required solver dependencies are absent',missing);
 if(!Array.isArray(surfaces??[])||!Array.isArray(multiAnchorPlans??[])||!Array.isArray(articulatedJoints??[])) {
  return verdict('FAIL','malformed solver dependency collections');
 }
 const dependencies={
  attachmentSemantics,
  surfaceAnchorSet:requiresSurface?surfaceAnchorSet:null,
  surfaces:requiresSurface?surfaces:[],
  followState:requiresFollow?followState:null,
  multiAnchorPlans:requiresMulti?multiAnchorPlans:[],
  articulatedJoints:requiresArticulated?articulatedJoints:[],
 };
 if(requiresSurface&&surfaceAnchorSet.anchorSetDigest!==plan.surfaceAnchorSetDigest) {
  return verdict('FAIL','surface-anchor-set does not bind propagation plan');
 }
 if(requiresFollow&&followState.followStateDigest!==plan.followStateDigest) {
  return verdict('FAIL','follow state does not bind propagation plan');
 }
 const planCheck=validateAttachmentPropagationPlan(plan,dependencies);
 if(!planCheck.valid)return verdict('FAIL','trusted propagation plan replay disagrees with exact dependency evidence',planCheck.errors);
 const reportCheck=validateAttachmentPropagationReport(report,{plan,...dependencies});
 if(!reportCheck.valid)return verdict('FAIL','trusted propagation report replay disagrees with solver dependencies',reportCheck.errors);
 if(report.status!=='READY_FOR_REALIZATION'||!report.eligibleForRealization) {
  return verdict('FAIL','replayed propagation does not authorize realization');
 }
 return verdict('PASS','all plan/report dependencies match an independently repeated propagation solver');
}


import {parseGlb} from './glb.mjs';
import {sceneMatrices,rigidMatrix,sameFrame} from './qa-glb-rigid-frames.mjs';
import {replayExactGlbPhysicalFusion} from './qa-fusion-replay.mjs';

export const QA_REALIZED_FRAME_SCHEMA='refas.qa-realized-propagation-frames/v1';
const verdict=(status,reason,entities=[])=>Object.freeze({
 schema:QA_REALIZED_FRAME_SCHEMA,status,reason,entities:[...entities].sort(),
});
const matrixFromFrame=frame=>[
 ...frame.xAxis,0,...frame.yAxis,0,...frame.zAxis,0,...frame.origin,1,
];
/**
 * Binds trusted deterministic attachment world frames to actual GLB world
 * transforms. A per-model macro/semantic source comparison is still separate.
 * FUSED member offsets are replayed from independently checkpoint-bound
 * original GLB world frames, never inferred from current root pose alone.
 * Non-rigid node transforms and unresolved semantic fusion mappings fail closed.
 */
export function verifyRealizedPropagationWorldFrames(glb,report,{
 fusionBindings=[],fusionReplayInputs=[],sourceSha256=null,attachmentSemantics=null,
}={}){
 if(!glb||!report)return verdict('NOT_RUN','candidate GLB and propagation report are required');
 try{
  const {json}=parseGlb(glb),world=sceneMatrices(json);
  const map=new Map();
  for(const [idx,node]of (json.nodes??[]).entries()){
   if(node.mesh==null)continue;
   const id=node.extras?.refasPartId??node.name;
   if(typeof id!=='string'||!id.length)return verdict('INSUFFICIENT','physical GLB node needs stable semantic identity');
   if(map.has(id))return verdict('INSUFFICIENT','duplicate physical node identity',[id]);
   map.set(id,{index:idx,matrix:world.get(idx)});
  }
  // Semantic aliases must be independently grounded in the original
  // pre-fusion GLB, canonical checkpoint and *current* physical fusion bake.
  // Merely passing a worker-authored map never authorizes a GLB pose.
  const aliases=new Map();
  if(!Array.isArray(fusionBindings)||!Array.isArray(fusionReplayInputs)){
   return verdict('INSUFFICIENT','physical fusion alias evidence is malformed');
  }
  if(fusionBindings.length){
   if(!attachmentSemantics||!sourceSha256||
      fusionReplayInputs.length!==fusionBindings.length){
    return verdict('INSUFFICIENT','fused semantic poses require exact native fusion replay');
   }
   const inputs=new Map();
   for(const input of fusionReplayInputs){
    if(!input||typeof input.physicalEntityId!=='string'||
       inputs.has(input.physicalEntityId)){
      return verdict('INSUFFICIENT','missing or duplicate physical fusion replay identity');
    }
    inputs.set(input.physicalEntityId,input);
   }
   const declared=new Set();
   for(const binding of fusionBindings){
    const physicalId=binding?.physicalEntityId,input=inputs.get(physicalId);
    if(!input||!map.has(physicalId)){
      return verdict('INSUFFICIENT','fused physical owner is absent or unbound',[String(physicalId)]);
    }
    const actualMembers=(input.plan?.members??[]).map(member=>member.memberId).sort();
    const claimedMembers=[...(binding.semanticMemberIds??[])].sort();
    if(actualMembers.length===0||claimedMembers.length!==actualMembers.length||
       claimedMembers.some((id,i)=>id!==actualMembers[i])||
       claimedMembers.some(id=>declared.has(id))||
       input.report?.reportDigest!==binding.fusionReportDigest||
       input.provenance?.provenanceDigest!==binding.provenanceDigest){
      return verdict('FAIL','semantic fusion aliases differ from independently bound native fusion members',[physicalId]);
    }
    const proof=replayExactGlbPhysicalFusion({...input,sourceSha256,
      attachmentSemantics,physicalEntityId:physicalId,fusedGlb:glb});
    if(proof.status!=='PASS'){
      return verdict(proof.status,'fused semantic pose has no independently realized physical fusion proof',
        [physicalId,proof.reason]);
    }
    const provenFrames=new Map((proof.memberWorldFrames??[]).map(entry=>
      [entry.memberId,entry.worldFrame]));
    if(provenFrames.size!==claimedMembers.length||
       claimedMembers.some(id=>!provenFrames.has(id))){
      return verdict('INSUFFICIENT','native fusion replay lacks a complete independently observed member-frame inventory',[physicalId]);
    }
    for(const id of claimedMembers){
      declared.add(id);
      if(id!==physicalId&&map.has(id)){
        return verdict('INSUFFICIENT','fused member also appears as a separate GLB mesh',[id]);
      }
      aliases.set(id,{physicalId,preFusionWorldFrame:provenFrames.get(id)});
    }
   }
  }
  const mismatched=[],missing=[],nonRigid=[];
  for(const item of report.entityResults??[]){
   if(!['CURRENT_EXTERNAL','PENDING_REALIZED_VALIDATION','RESOLVED'].includes(item.status)||!item.worldFrame){
    return verdict('INSUFFICIENT','unresolved propagated semantic entity',[item.entityId]);
   }
   const alias=aliases.get(item.entityId);
   const node=map.get(alias?.physicalId??item.entityId);
   if(!node){missing.push(item.entityId);continue;}
   if(!rigidMatrix(node.matrix)){nonRigid.push(item.entityId);continue;}
   if(alias&&item.entityId!==alias.physicalId){
    // A semantic fused member has no independent post-fusion GLB node.
    // Its pose is proved by the exact original pre-fusion GLB pose,
    // which the native bake replay has independently bound to the
    // original checkpoint, member frameDigest, final GLB, and provenance.
    // A current physical-root pose alone cannot certify this member pose.
    if(item.mode!=='FUSED'){
     return verdict('FAIL','a fused alias is claimed by a non-FUSED semantic relation',[item.entityId]);
    }
    const frame=alias.preFusionWorldFrame;
    if(!frame||!sameFrame(matrixFromFrame(frame),item.worldFrame)){
     mismatched.push(item.entityId);
    }
   }else if(!sameFrame(node.matrix,item.worldFrame)){
    // The physical fusion root has an actual post-fusion node. Even if
    // its original pre-fusion pose differed, the output's authoritative
    // root frame must match propagation's current root.
    mismatched.push(item.entityId);
   }
  }
  if(missing.length)return verdict('INSUFFICIENT','propagated entity lacks one independently identified physical node',missing);
  if(nonRigid.length)return verdict('INSUFFICIENT','non-rigid GLB transforms require explicit realization semantics',nonRigid);
  if(mismatched.length)return verdict('FAIL','propagated semantic world pose disagrees with current physical root or original source-bound native fusion member GLB frame',mismatched);
  return verdict('PASS','all propagated frames match actual active-scene GLB physical world transforms');
 }catch(error){return verdict('FAIL',String(error?.message??error));}
}

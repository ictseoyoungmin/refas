import {createHash} from 'node:crypto';
import {digestJson,deepFreeze} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {readQaGeometryAccessor,UnsupportedQaGeometryAccessor} from './qa-glb-geometry-accessors.mjs';
import {sceneMatrices,realizedGlbRigidFrame,sameFrame} from './qa-glb-rigid-frames.mjs';
import {bakePhysicalFusion, validatePhysicalFusionResult} from './physical-fusion.mjs';

export const QA_FUSION_REPLAY_SCHEMA='refas.qa-physical-fusion-replay/v1';
const hash=b=>createHash('sha256').update(Buffer.from(b)).digest('hex');
const verdict=(status,reason,memberWorldFrames=null)=>deepFreeze({
 schema:QA_FUSION_REPLAY_SCHEMA,status,reason,
 ...(status==='PASS'&&memberWorldFrames?{memberWorldFrames}:{}),
});
const unsupported=(reason)=>{throw new Error('UNSUPPORTED_LAYOUT: '+reason);};

function decodeMesh(glb,partId){
 const {json,binary}=parseGlb(glb);
 const nodes=json.nodes??[];
 const named=nodes.map((node,index)=>({node,index}))
   .filter(({node})=>(node.extras?.refasPartId??node.name)===partId&&node.mesh!=null);
 if(named.length!==1)throw new Error('missing or duplicate physical node '+partId);
 const {node,index}=named[0],mesh=json.meshes?.[node.mesh];
 const world=sceneMatrices(json).get(index);
 if(!world)unsupported(partId+': physical node outside active GLB scene');
 const worldFrame=realizedGlbRigidFrame(world);
 if(!mesh||!Array.isArray(mesh.primitives)||mesh.primitives.length===0){
  unsupported('exact native fusion needs indexed TRIANGLES primitives');
 }
 if(node.skin!=null||node.weights!=null||mesh.weights!=null){
  unsupported('skinned or morphed native fusion requires independently evaluated mesh-frame proof');
 }
 // Repeated POSITION accessors share one vertex pool. Independent accessors
 // concatenate in first primitive order, preserving original index streams
 // without inventing vertex welds across material or UV seams.
 const positionOffsets=new Map(),positions=[],indices=[];
 for(const primitive of mesh.primitives){
  if((primitive.mode??4)!==4||primitive.indices==null){
   unsupported('exact native fusion needs indexed TRIANGLES primitives');
  }
  if((primitive.targets?.length??0)>0){
   unsupported('morphed native fusion needs separately evaluated mesh-frame proof');
  }
  const accessorId=primitive.attributes?.POSITION;
  if(!Number.isSafeInteger(accessorId)||accessorId<0){
   unsupported('primitive lacks an authoritative POSITION accessor');
  }
  let offset=positionOffsets.get(accessorId);
  let vertices;
  try{
   vertices=readQaGeometryAccessor(json,binary,accessorId,
     {position:true,label:partId+': native primitive POSITION'});
  }catch(error){
   if(error instanceof UnsupportedQaGeometryAccessor)unsupported(error.message);
   throw error;
  }
  if(offset==null){
   offset=positions.length;positionOffsets.set(accessorId,offset);
   positions.push(...vertices);
  }
  let localIndices;
  try{
   localIndices=readQaGeometryAccessor(json,binary,primitive.indices,
     {label:partId+': native primitive indices'});
  }catch(error){
   if(error instanceof UnsupportedQaGeometryAccessor)unsupported(error.message);
   throw error;
  }
  if(localIndices.length%3||localIndices.some(i=>i>=vertices.length)){
   throw new Error('invalid native fusion triangle indexing');
  }
  indices.push(...localIndices.map(i=>i+offset));
 }
 if(!indices.length||!positions.length)unsupported('empty native fusion physical geometry');
 return {mesh:{positions,indices},worldFrame,worldMatrix:world};
}
const f32Mesh=mesh=>({positions:mesh.positions.map(v=>v.map(x=>Math.fround(x))),indices:mesh.indices.slice()});

/**
 * Validates a deterministic native physical bake against BOTH original and
 * current GLB bytes. This deliberately does not authorize source resemblance.
 * Supports active-scene rigid parenting and indexed multi-primitive geometry.
 * Non-rigid transforms, skinned/morphed and unsupported primitive layouts
 * remain INSUFFICIENT; source photo resemblance remains independently gated.
 */
export function replayExactGlbPhysicalFusion({
 sourceSha256,attachmentSemantics,preFusionGlb,fusedGlb,preFusionCheckpoint,
 physicalEntityId,logicalFusion,canonicalEditIntent,plan,report,provenance,
}={}){
 try{
  if(!preFusionGlb||!fusedGlb||!preFusionCheckpoint||!plan||!report||!provenance||!logicalFusion||!canonicalEditIntent){
    return verdict('NOT_RUN','physical fusion replay requires original candidate, checkpoint, canonical inputs and baked output');
  }
  if(attachmentSemantics?.sourceSha256!==sourceSha256 || plan.sourceSha256!==sourceSha256) {
    return verdict('FAIL','physical fusion source SHA mismatch');
  }
  if(hash(preFusionGlb)!==plan.inputAssetSha256) return verdict('FAIL','pre-fusion GLB SHA mismatch');
  const {id,contentDigest,createdAt,...content}=preFusionCheckpoint;
  if(digestJson(content)!==contentDigest||id!=='cp_'+contentDigest.slice(0,20)||
     id!==plan.preFusionCheckpointId||contentDigest!==plan.preFusionStateDigest ||
     !(content.artifactRefs??[]).some(a=>a.kind==='glb'&&a.sha256===plan.inputAssetSha256)) {
    return verdict('INSUFFICIENT','pre-fusion input or semantic checkpoint lineage is not independently bound');
  }
  if(plan.fusionRootId!==physicalEntityId||report?.planDigest!==plan.planDigest||
     provenance?.planDigest!==plan.planDigest)return verdict('FAIL','fused entity, plan or provenance binding mismatch');
  const members=plan.members.map(member=>{
   const realized=decodeMesh(preFusionGlb,member.memberId);
   return {memberId:member.memberId,mesh:realized.mesh,worldFrame:realized.worldFrame};
  });
  const args={plan,attachmentSemantics,logicalFusion,canonicalEditIntent,
    currentInputAssetSha256:plan.inputAssetSha256,currentPreFusionStateDigest:plan.preFusionStateDigest,
    realizedMembers:members};
  if(plan.strategy!=='WELD_SHARED_BOUNDARY')return verdict('INSUFFICIENT','SOLID_UNION external backend requires separately replayed backend proof');
  const reproduced=bakePhysicalFusion({...args,evidenceRefs:report.evidenceRefs});
  if(reproduced.report.status!=='BAKED')return verdict('FAIL','trusted native fusion bake is blocked');
  const verified=validatePhysicalFusionResult({report,provenance,mesh:reproduced.mesh},args);
  if(!verified.valid)return verdict('FAIL','saved fusion report/provenance disagree with exact native bake: '+verified.errors.join('; '));
  const actual=decodeMesh(fusedGlb,physicalEntityId);
  if(!sameFrame(actual.worldMatrix,plan.fusionRootFrame)){
    return verdict('FAIL','current fused GLB world frame does not match attested native fusion root');
  }
  if(digestJson(f32Mesh(actual.mesh))!==digestJson(f32Mesh(reproduced.mesh))) {
    return verdict('FAIL','actual fused GLB mesh differs from independently reproduced native bake');
  }
  const json=parseGlb(fusedGlb).json,extras=json.extras?.refas??{};
  if(extras.physicalFusionReportDigest!==report.reportDigest || extras.fusionProvenanceDigest!==provenance.provenanceDigest) {
    return verdict('INSUFFICIENT','fused GLB does not carry the exact reproduced report/provenance binding');
  }
  return verdict('PASS',
    'pre-fusion checkpoint and both exact GLB meshes match native bake and semantic provenance replay',
    members.map(member=>({memberId:member.memberId,worldFrame:member.worldFrame})));
 }catch(error){
  const reason=String(error?.message??error);
  return verdict(reason.startsWith('UNSUPPORTED_LAYOUT:')?'INSUFFICIENT':'FAIL',reason);
 }
}

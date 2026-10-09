import {createHash} from 'node:crypto';
import {digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {readQaGeometryAccessor,UnsupportedQaGeometryAccessor} from './qa-glb-geometry-accessors.mjs';
import {bakePhysicalFusion, validatePhysicalFusionResult} from './physical-fusion.mjs';

export const QA_FUSION_REPLAY_SCHEMA='refas.qa-physical-fusion-replay/v1';
const hash=b=>createHash('sha256').update(Buffer.from(b)).digest('hex');
const verdict=(status,reason)=>Object.freeze({schema:QA_FUSION_REPLAY_SCHEMA,status,reason});
const unsupported=(reason)=>{throw new Error('UNSUPPORTED_LAYOUT: '+reason);};

function decodeMesh(glb,partId){
 const {json,binary}=parseGlb(glb);
 const named=(json.nodes??[]).filter(n=>(n.extras?.refasPartId??n.name)===partId);
 if(named.length!==1)throw new Error('missing or duplicate physical node '+partId);
 const node=named[0],meshes=json.meshes??[],mesh=meshes[node.mesh];
 if(!mesh || !Array.isArray(mesh.primitives) || mesh.primitives.length!==1)unsupported('exact replay currently requires one primitive per fused or input physical node');
 if(node.matrix || node.translation || node.rotation || node.scale || (json.nodes??[]).some(n=>(n.children??[]).includes(json.nodes.indexOf(node)))) {
   unsupported('non-identity node transforms/parenting require full frame-bound GLB replay');
 }
 const primitive=mesh.primitives[0];
 if((primitive.mode??4)!==4 || primitive.indices==null)unsupported('exact replay requires indexed TRIANGLES');
 if(node.skin!=null || node.weights!=null || mesh.weights!=null ||
    (primitive.targets?.length??0)>0)unsupported('skinned or morphed native fusion requires evaluated mesh-frame proof');
 let positions,indices;
 try{
  positions=readQaGeometryAccessor(json,binary,primitive.attributes?.POSITION,
    {position:true,label:partId+': fusion source POSITION'});
  indices=readQaGeometryAccessor(json,binary,primitive.indices,
    {label:partId+': fusion source indices'});
 }catch(e){
  if(e instanceof UnsupportedQaGeometryAccessor)unsupported(e.message);
  throw e;
 }
 if(indices.length%3 || indices.some(i=>i>=positions.length))throw new Error('invalid fusion triangle indexing');
 return {positions,indices};
}
const f32Mesh=mesh=>({positions:mesh.positions.map(v=>v.map(x=>Math.fround(x))),indices:mesh.indices.slice()});
const ident=()=>({origin:[0,0,0],xAxis:[1,0,0],yAxis:[0,1,0],zAxis:[0,0,1]});

/**
 * Validates a deterministic native physical bake against BOTH original and
 * current GLB bytes. This deliberately does not authorize source resemblance.
 * Non-identity frames/multi-primitive layouts stop as INSUFFICIENT, not PASS.
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
  const members=plan.members.map(m=>({memberId:m.memberId,mesh:decodeMesh(preFusionGlb,m.memberId),worldFrame:ident()}));
  const args={plan,attachmentSemantics,logicalFusion,canonicalEditIntent,
    currentInputAssetSha256:plan.inputAssetSha256,currentPreFusionStateDigest:plan.preFusionStateDigest,
    realizedMembers:members};
  if(plan.strategy!=='WELD_SHARED_BOUNDARY')return verdict('INSUFFICIENT','SOLID_UNION external backend requires separately replayed backend proof');
  const reproduced=bakePhysicalFusion({...args,evidenceRefs:report.evidenceRefs});
  if(reproduced.report.status!=='BAKED')return verdict('FAIL','trusted native fusion bake is blocked');
  const verified=validatePhysicalFusionResult({report,provenance,mesh:reproduced.mesh},args);
  if(!verified.valid)return verdict('FAIL','saved fusion report/provenance disagree with exact native bake: '+verified.errors.join('; '));
  const actual=decodeMesh(fusedGlb,physicalEntityId);
  if(digestJson(f32Mesh(actual))!==digestJson(f32Mesh(reproduced.mesh))) {
    return verdict('FAIL','actual fused GLB mesh differs from independently reproduced native bake');
  }
  const json=parseGlb(fusedGlb).json,extras=json.extras?.refas??{};
  if(extras.physicalFusionReportDigest!==report.reportDigest || extras.fusionProvenanceDigest!==provenance.provenanceDigest) {
    return verdict('INSUFFICIENT','fused GLB does not carry the exact reproduced report/provenance binding');
  }
  return verdict('PASS','pre-fusion checkpoint and both exact GLB meshes match native bake and semantic provenance replay');
 }catch(error){
  const reason=String(error?.message??error);
  return verdict(reason.startsWith('UNSUPPORTED_LAYOUT:')?'INSUFFICIENT':'FAIL',reason);
 }
}

import {createHash} from 'node:crypto';
import {digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
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
 function array(accessorId,type,componentType){
  const accessor=json.accessors?.[accessorId],view=json.bufferViews?.[accessor?.bufferView];
  if(!accessor || !view || accessor.sparse || accessor.type!==type || accessor.componentType!==componentType || view.buffer!==0 ||
      !Number.isSafeInteger(accessor.count)||accessor.count<1)unsupported('unsupported GLB geometry accessor');
  const width=type==='VEC3'?3:1,size=componentType===5126||componentType===5125?4:componentType===5123?2:1;
  const offset=Number(view.byteOffset??0)+Number(accessor.byteOffset??0);
  const length=Number(view.byteLength),stride=Number(view.byteStride??width*size);
  if (![offset,length,stride].every(Number.isSafeInteger)||offset<0||stride<width*size||
      offset+(accessor.count-1)*stride+width*size>Number(view.byteOffset??0)+length||
      offset+(accessor.count-1)*stride+width*size>binary.length)throw new Error('GLB geometry accessor out of bounds');
  const dv=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  return Array.from({length:accessor.count},(_,i)=>{
    const base=offset+i*stride,vs=Array.from({length:width},(_,k)=>{
      const at=base+k*size;
      return componentType===5126?dv.getFloat32(at,true):componentType===5125?dv.getUint32(at,true):
        componentType===5123?dv.getUint16(at,true):dv.getUint8(at);
    });
    if(!vs.every(Number.isFinite))throw new Error('non-finite physical fusion geometry');
    return width===1?vs[0]:vs;
  });
 }
 const positions=array(primitive.attributes?.POSITION,'VEC3',5126);
 const indexAccessor=json.accessors?.[primitive.indices],component=indexAccessor?.componentType;
 if(![5121,5123,5125].includes(component))unsupported('unsupported index component');
 const indices=array(primitive.indices,'SCALAR',component);
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

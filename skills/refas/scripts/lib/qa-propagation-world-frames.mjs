
import {parseGlb} from './glb.mjs';
import {replayExactGlbPhysicalFusion} from './qa-fusion-replay.mjs';

export const QA_REALIZED_FRAME_SCHEMA='refas.qa-realized-propagation-frames/v1';
const verdict=(status,reason,entities=[])=>Object.freeze({
 schema:QA_REALIZED_FRAME_SCHEMA,status,reason,entities:[...entities].sort(),
});
const identity=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const multiply=(a,b)=>{
 const out=Array(16).fill(0);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++){
   out[4*c+r]+=a[4*k+r]*b[4*c+k];
 }
 return out;
};
function matrixFor(node){
 if(node.matrix!=null){
  if(node.translation!=null||node.rotation!=null||node.scale!=null)throw Error('GLB matrix and TRS are both defined');
  if(!Array.isArray(node.matrix)||node.matrix.length!==16||!node.matrix.every(Number.isFinite))throw Error('invalid GLB mat4');
  return node.matrix;
 }
 const t=node.translation??[0,0,0],q=node.rotation??[0,0,0,1],s=node.scale??[1,1,1];
 if(!Array.isArray(t)||t.length!==3||!t.every(Number.isFinite)||
    !Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||
    !Array.isArray(s)||s.length!==3||!s.every(Number.isFinite))throw Error('invalid GLB TRS');
 if(Math.abs(q.reduce((v,c)=>v+c*c,0)-1)>1e-5)throw Error('GLB quaternion is not unit length');
 const [x,y,z,w]=q;
 return [
   (1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,
   (2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,
   (2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,
   ...t,1
 ];
}
function sceneMatrices(json){
 const nodes=json.nodes??[],scene=json.scenes?.[json.scene??0];
 if(!scene||!Array.isArray(scene.nodes))throw Error('no active scene root list');
 const parent=new Map(),result=new Map(),visiting=new Set();
 function visit(index,up){
  if(!Number.isSafeInteger(index)||index<0||index>=nodes.length)throw Error('invalid GLB scene node index');
  if(visiting.has(index)||result.has(index))throw Error('cyclic or multiply reachable GLB node');
  visiting.add(index);
  const node=nodes[index],world=multiply(up,matrixFor(node));
  result.set(index,world);
  if(node.children!=null&&!Array.isArray(node.children))throw Error('GLB node children is not an array');
  for(const child of node.children??[]){
   if(parent.has(child))throw Error('GLB node has multiple parents');
   parent.set(child,index);visit(child,world);
  }
  visiting.delete(index);
 }
 for(const root of scene.nodes){if(parent.has(root)||result.has(root))throw Error('duplicate GLB scene root');visit(root,identity());}
 for(let i=0;i<nodes.length;i++)if(nodes[i]?.mesh!=null&&!result.has(i))throw Error('physical mesh node outside active GLB scene');
 return result;
}
function rigidMatrix(m){
 if(Math.abs(m[3])>1e-7||Math.abs(m[7])>1e-7||
    Math.abs(m[11])>1e-7||Math.abs(m[15]-1)>1e-7) return false;
 const axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
 for(let i=0;i<3;i++)for(let j=i;j<3;j++){
  const expected=i===j?1:0;if(Math.abs(dot(axes[i],axes[j])-expected)>1e-6)return false;
 }
 const a=axes[0],b=axes[1],c=axes[2];
 const determinant=(a[1]*b[2]-a[2]*b[1])*c[0]+
   (a[2]*b[0]-a[0]*b[2])*c[1]+(a[0]*b[1]-a[1]*b[0])*c[2];
 return Math.abs(determinant-1)<=1e-6;
}
function sameFrame(matrix,frame){
 if(!frame)return false;
 const expected=[frame.xAxis,frame.yAxis,frame.zAxis,frame.origin];
 if(expected.some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)))return false;
 for(let i=0;i<4;i++)for(let c=0;c<3;c++){
  const left=matrix[i*4+c],right=expected[i][c];
  if(Math.abs(left-right)>Math.max(1e-6,1e-6*Math.max(Math.abs(left),Math.abs(right))))return false;
 }
 return true;
}

/**
 * Binds trusted deterministic attachment world frames to actual GLB world
 * transforms. A per-model macro/semantic source comparison is still separate.
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
    for(const id of claimedMembers){
      declared.add(id);
      if(id!==physicalId&&map.has(id)){
        return verdict('INSUFFICIENT','fused member also appears as a separate GLB mesh',[id]);
      }
      aliases.set(id,physicalId);
    }
   }
  }
  const mismatched=[],missing=[],nonRigid=[];
  for(const item of report.entityResults??[]){
   if(!['CURRENT_EXTERNAL','PENDING_REALIZED_VALIDATION','RESOLVED'].includes(item.status)||!item.worldFrame) return verdict('INSUFFICIENT','unresolved propagated semantic entity',[item.entityId]);
   // A physical fusion group may represent several semantic entities,
   // but only if an exact native GLB fusion replay authorized that mapping.
   // Member frames differing from the baked physical root cannot be
   // represented by one unpartitioned physical node without an additional
   // typed frame-offset provenance contract.
   const node=map.get(aliases.get(item.entityId)??item.entityId);
   if(!node){missing.push(item.entityId);continue;}
   if(!rigidMatrix(node.matrix)){nonRigid.push(item.entityId);continue;}
   if(!sameFrame(node.matrix,item.worldFrame))mismatched.push(item.entityId);
  }
  for(const item of report.entityResults??[]){
   const physicalId=aliases.get(item.entityId);
   if(physicalId&&physicalId!==item.entityId){
    const root=report.entityResults.find(entry=>entry.entityId===physicalId);
    // Even a correctly welded mesh cannot satisfy two differing rigid
    // semantic poses. Native fusion evidence currently authorizes identity
    // local member frames only; mismatched frames stay blocked.
    if(!root?.worldFrame || !item.worldFrame ||
       !sameFrame({
        0:root.worldFrame.xAxis[0],1:root.worldFrame.xAxis[1],2:root.worldFrame.xAxis[2],
        4:root.worldFrame.yAxis[0],5:root.worldFrame.yAxis[1],6:root.worldFrame.yAxis[2],
        8:root.worldFrame.zAxis[0],9:root.worldFrame.zAxis[1],10:root.worldFrame.zAxis[2],
        12:root.worldFrame.origin[0],13:root.worldFrame.origin[1],14:root.worldFrame.origin[2],
       },item.worldFrame)){
      return verdict('INSUFFICIENT','fused semantic frame differs from current physical root without per-member realization proof',[item.entityId,physicalId]);
    }
   }
  }
  if(missing.length)return verdict('INSUFFICIENT','propagated entity lacks one independently identified physical node',missing);
  if(nonRigid.length)return verdict('INSUFFICIENT','non-rigid GLB transforms require explicit realization semantics',nonRigid);
  if(mismatched.length)return verdict('FAIL','actual GLB world pose disagrees with independently replayed attachment propagation',mismatched);
  return verdict('PASS','all propagated frames match actual active-scene GLB physical world transforms');
 }catch(error){return verdict('FAIL',String(error?.message??error));}
}

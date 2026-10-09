import {deepFreeze, digestJson} from './canonical.mjs';
import {inventoryGlbTriangleComponents} from './qa-triangle-components.mjs';

export const QA_COMPONENT_SUPPORT_PLAN_SCHEMA='refas.qa-triangle-component-support-plan/v1';
export const QA_COMPONENT_SUPPORT_REPLAY_SCHEMA='refas.qa-triangle-component-support-replay/v1';
const DIGEST=/^[a-f0-9]{64}$/u;
const finiteIndex=n=>Number.isSafeInteger(n)&&n>=0;
const unique=v=>[...new Set(v.map(String).filter(Boolean))].sort();
const verdict=(status,reason,details=[])=>deepFreeze({
 schema:QA_COMPONENT_SUPPORT_REPLAY_SCHEMA,status,reason,details:unique(details),
});
const faceArea=points=>{
 const [a,b,c]=points;
 const u=a.map((v,i)=>b[i]-v),v=a.map((n,i)=>c[i]-n);
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 return {normal:n,area:0.5*Math.hypot(...n)};
};
const key=p=>p.map(n=>Object.is(n,-0)?0:n).join(',');
const faceKeys=points=>points.map(key).sort();
const faceEdgeKeys=tri=>{
 const k=tri.map(key);
 return [0,1,2].map(i=>{
  const a=k[i],b=k[(i+1)%3];
  return a<b?a+'|'+b:b+'|'+a;
 });
};
const isOpposedFace=(a,b)=>{
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==3||b.length!==3)return false;
 const ka=a.map(key),kb=b.map(key);
 if(ka.length!==3||kb.length!==3||
    new Set(ka).size!==3||faceKeys(a).some((v,i)=>v!==faceKeys(b)[i]))return false;
 // Exact GLB Float32 vertex equality is already required. Winding can
 // therefore be decided by permutation parity, not by a near-zero normal
 // dot product. An absolute dot tolerance misclassifies tiny same-wound
 // coincident shells as opposed contact faces.
 if(!(faceArea(a).area>1e-12&&faceArea(b).area>1e-12))return false;
 const start=kb.indexOf(ka[0]);
 return start!==-1&&kb[(start+1)%3]===ka[2]&&kb[(start+2)%3]===ka[1];
};

/** A typed intent record, not a worker-authorized geometry certificate. */
export function createTriangleComponentSupportPlan({
 assetSha256,inventoryDigest,nodes=[],evidenceRefs=[],
}={}){
 if(!DIGEST.test(assetSha256)||!DIGEST.test(inventoryDigest))throw Error('component plan requires current candidate and inventory SHA-256 digests');
 if(!Array.isArray(nodes)||!nodes.length)throw Error('component plan requires at least one split physical node');
 const seen=new Set();
 const normalized=nodes.map((raw,i)=>{
  const nodeId=raw?.nodeId;
  if(typeof nodeId!=='string'||!nodeId||seen.has(nodeId))throw Error('component plan physical owner is missing or duplicated');
  seen.add(nodeId);
  if(!finiteIndex(raw.rootTriangleIndex))throw Error(nodeId+': rootTriangleIndex is invalid');
  if(!Array.isArray(raw.links)||!raw.links.length)throw Error(nodeId+': split mesh needs explicit physical face witnesses');
  const linkIds=new Set();
  const links=raw.links.map((r,j)=>{
   if(!finiteIndex(r?.childTriangleIndex)||!finiteIndex(r?.ownerTriangleIndex)||
      r.childTriangleIndex===r.ownerTriangleIndex)throw Error(nodeId+': malformed triangle witness '+j);
   const refs=unique(r.evidenceRefs??[]);
   if(!refs.length)throw Error(nodeId+': face witness requires evidence references');
   const identifier=r.childTriangleIndex+':'+r.ownerTriangleIndex;
   if(linkIds.has(identifier))throw Error(nodeId+': duplicate face witness');
   linkIds.add(identifier);
   return {childTriangleIndex:r.childTriangleIndex,ownerTriangleIndex:r.ownerTriangleIndex,
    kind:'OPPOSED_EXACT_FACE',evidenceRefs:refs};
  }).sort((a,b)=>a.childTriangleIndex-b.childTriangleIndex||a.ownerTriangleIndex-b.ownerTriangleIndex);
  return {nodeId,rootTriangleIndex:raw.rootTriangleIndex,links};
 }).sort((a,b)=>a.nodeId.localeCompare(b.nodeId));
 const refs=unique(evidenceRefs);
 if(!refs.length)throw Error('component plan requires design/assembly evidence references');
 const payload={schema:QA_COMPONENT_SUPPORT_PLAN_SCHEMA,assetSha256,inventoryDigest,
  nodes:normalized,evidenceRefs:refs,
  policy:{
   actualGlbFloat32TrianglesRequired:true,
   oppositeWoundExactlyCoincidentFaceRequired:true,
   everyGeometricIslandRequiresRootedWitness:true,
   geometricTouchDoesNotEstablishWeldOrSourceSemanticTruth:true,
   unspecifiedOrNonCoplanarComponentContactStaysInsufficient:true,
   planDoesNotAuthorizeClosure:true,
  }};
 return deepFreeze({...payload,planDigest:digestJson(payload)});
}

/**
 * Trusted replay of explicitly declared, exact opposite-winding face contacts
 * across disconnected geometric islands within each actual physical GLB node.
 * A proximity threshold, arbitrary NOT_APPLICABLE, or textual rationale does
 * not provide a supported physical path. Part identity/source-image meaning
 * must still be independently checked by QA-03.
 */
export function replayTriangleComponentSupport(glb,plan){
 if(!glb)return verdict('NOT_RUN','exact candidate GLB is required');
 let detail;
 try{detail=inventoryGlbTriangleComponents(glb,{withTriangleDetails:true});}
 catch(e){return verdict('FAIL','actual GLB component inventory cannot be replayed',[String(e.message)]);}
 const {inventory,details}=detail;
 const split=inventory.nodes.filter(n=>n.spatial.componentCount>1||n.spatial.ambiguousEdges>0);
 if(!split.length){
  if(plan)return verdict('FAIL','unexpected component exception on unsplit GLB');
  return verdict('PASS','candidate GLB has no unresolved geometric component islands');
 }
 if(!plan)return verdict('INSUFFICIENT','split or ambiguous GLB nodes need typed rooted exact-face contact evidence',
  split.map(n=>n.nodeId+':islands:'+n.spatial.componentCount));
 let normalized;
 try{
  normalized=createTriangleComponentSupportPlan({
   assetSha256:plan.assetSha256,inventoryDigest:plan.inventoryDigest,
   nodes:plan.nodes,evidenceRefs:plan.evidenceRefs,
  });
 }catch(e){return verdict('FAIL','component support evidence is malformed',[String(e.message)]);}
 if(plan.schema!==QA_COMPONENT_SUPPORT_PLAN_SCHEMA||
    normalized.planDigest!==plan.planDigest||digestJson(normalized)!==digestJson(plan)){
  return verdict('FAIL','component plan has a missing, invalid or noncanonical digest');
 }
 if(plan.assetSha256!==inventory.assetSha256||plan.inventoryDigest!==inventory.inventoryDigest){
  return verdict('FAIL','component plan is stale relative to actual current candidate GLB');
 }
 const nodes=new Map(split.map(n=>[n.nodeId,n]));
 const data=new Map(details.map(n=>[n.nodeId,n]));
 if(data.size!==details.length)return verdict('INSUFFICIENT','GLB has ambiguous duplicate physical node identities');
 const named=new Set(plan.nodes.map(n=>n.nodeId));
 const missing=[...nodes.keys()].filter(id=>!named.has(id));
 const extra=[...named].filter(id=>!nodes.has(id));
 if(missing.length)return verdict('INSUFFICIENT','unaccounted physical component island owners',missing);
 if(extra.length)return verdict('FAIL','component plan refers to an unsplit or nonexistent physical owner',extra);
 for(const spec of plan.nodes){
  const node=data.get(spec.nodeId),expected=nodes.get(spec.nodeId);
  if(!node)return verdict('INSUFFICIENT','physical owner is absent from actual GLB',[spec.nodeId]);
  const ids=node.componentIds,tris=node.triangles;
  if(spec.rootTriangleIndex>=tris.length)return verdict('FAIL','root witness is not an actual GLB triangle',[spec.nodeId]);
  const root=ids[spec.rootTriangleIndex],edges=new Map(),parents=new Map(),
    explainedEdges=new Set();
  if(spec.links.length<expected.spatial.componentCount-1){
   return verdict('INSUFFICIENT','every nonroot geometric island needs a rooted face witness',[spec.nodeId]);
  }
  for(const witness of spec.links){
   const {childTriangleIndex:child,ownerTriangleIndex:owner}=witness;
   if(child>=tris.length||owner>=tris.length)return verdict('FAIL','component face witness references a nonexistent GLB triangle',[spec.nodeId]);
   const a=ids[child],b=ids[owner];
   if(a===b||a===root||(parents.has(a)&&parents.get(a)!==b)){
    return verdict('FAIL','component face witnesses contain self-links, conflicting parents or root reparenting',[spec.nodeId]);
   }
   if(!isOpposedFace(tris[child],tris[owner])){
    return verdict('FAIL','claimed component support faces are not opposite-wound coincident GLB triangles',
      [spec.nodeId+':'+child+':'+owner]);
   }
   parents.set(a,b);
   for(const edge of faceEdgeKeys(tris[child]))explainedEdges.add(edge);
   if(!edges.has(b))edges.set(b,[]);
   edges.get(b).push(a);
  }
  // Face-to-face contact produces four geometric edge occurrences:
  // two opposite edges inside each indexed manifold shell. Every ambiguous
  // overlap must be explained by an explicit real opposed-face witness.
  for(const record of node.ambiguousWitnessEdges??[]){
   if(!explainedEdges.has(record.key)){
    return verdict('INSUFFICIENT','unexplained coincident geometric edge remains unreviewed',[spec.nodeId,record.key]);
   }
   const byComponent=new Map();
   for(const use of record.uses){
    if(!byComponent.has(use.componentId))byComponent.set(use.componentId,[]);
    byComponent.get(use.componentId).push(use);
   }
   if(record.uses.length!==4||byComponent.size!==2||
     [...byComponent.values()].some(items=>items.length!==2||
       items[0].from!==items[1].to||items[0].to!==items[1].from)){
    return verdict('INSUFFICIENT','coincident face contact also contains nonmanifold or duplicate geometry',[spec.nodeId,record.key]);
   }
  }
  const reached=new Set([root]),stack=[root];
  while(stack.length){
   const from=stack.pop();
   for(const to of edges.get(from)??[]){
    if(!reached.has(to)){reached.add(to);stack.push(to);}
   }
  }
  if(reached.size!==expected.spatial.componentCount){
   return verdict('INSUFFICIENT','a real geometric island has no declared, actual contact path to the root',[spec.nodeId]);
  }
 }
 return verdict('PASS','every split physical mesh island has a typed actual-GLB exact-face contact path to its declared root');
}

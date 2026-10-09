import {createHash} from 'node:crypto';

import {deepFreeze, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {readQaGeometryAccessor} from './qa-glb-geometry-accessors.mjs';

export const TRIANGLE_COMPONENT_INVENTORY_SCHEMA = 'refas.triangle-component-inventory/v1';
const sha256 = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
function triangleIndices(json,binary,primitive,nodeId){
 const position=json.accessors?.[primitive.attributes?.POSITION];
 if(!position||position.type!=='VEC3'||!Number.isSafeInteger(position.count)||position.count<3){
  throw Error(nodeId+': missing or malformed POSITION accessor');
 }
 const indices=primitive.indices==null
  ?Array.from({length:position.count},(_,index)=>index)
  :readQaGeometryAccessor(json,binary,primitive.indices,{label:nodeId+': triangle indices'});
 if(indices.length%3!==0)throw Error(nodeId+': triangle index count is not divisible by three');
 if(indices.some(index=>index>=position.count))throw Error(nodeId+': triangle index exceeds POSITION count');
 return indices;
}
function positionVectors(json,binary,primitive,nodeId){
 const positions=readQaGeometryAccessor(json,binary,primitive.attributes?.POSITION,
  {position:true,label:nodeId+': POSITION'});
 if(positions.length<3)throw Error(nodeId+': triangle POSITION count must be at least three');
 return positions;
}

function geometricComponents(triangles, topologicalTriangles = []) {
  const parent=Array.from({length:triangles.length},(_,i)=>i),rank=new Uint8Array(triangles.length);
  const find=(start)=>{let n=start;while(parent[n]!==n){parent[n]=parent[parent[n]];n=parent[n];}return n;};
  function union(a,b) {
    a=find(a);b=find(b);if(a===b)return;
    if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;
    if(rank[a]===rank[b])rank[a]+=1;
  }
  // Exact float32 POSITION coordinates are the equivalence relation.
  // No scale-dependent rounding may join a nearby but detached island.
  const coordinateKey=(point)=>point.map(n=>Object.is(n,-0)?0:n).join(',');
  // Prefer proven intrinsic indexed topology when coincident neighboring
  // closed shells cause more than two geometric edges to overlap.
  const intrinsicEdges=new Map();
  for(let i=0;i<topologicalTriangles.length;i++){
    const tri=topologicalTriangles[i];
    for(let j=0;j<3;j++){
      const from=tri[j],to=tri[(j+1)%3],edge=from<to?from+'|'+to:to+'|'+from;
      if(!intrinsicEdges.has(edge))intrinsicEdges.set(edge,[]);
      intrinsicEdges.get(edge).push({triangle:i,from,to});
    }
  }
  for(const items of intrinsicEdges.values()){
    if(items.length===2&&items[0].from===items[1].to&&items[0].to===items[1].from){
      union(items[0].triangle,items[1].triangle);
    }
  }
  const edges=new Map();
  for(let i=0;i<triangles.length;i+=1){
    const tri=triangles[i],keys=tri.map(coordinateKey);
    if(new Set(keys).size!==3)throw new Error('degenerate geometric triangle has coincident vertices');
    for(let edge=0;edge<3;edge+=1){
      const from=keys[edge],to=keys[(edge+1)%3],key=from<to?from+'|'+to:to+'|'+from;
      if(!edges.has(key))edges.set(key,[]);
      edges.get(key).push({triangle:i,from,to});
    }
  }
  let ambiguousEdges=0;
  const ambiguousRecords=[];
  for(const [key,items] of edges){
    if(items.length>2){
      ambiguousEdges+=1;ambiguousRecords.push({key,items});continue;
    }
    if(items.length===2){
      if(items[0].from===items[1].to && items[0].to===items[1].from){
        union(items[0].triangle,items[1].triangle);
      }else{
        // Same oriented overlapping faces are not a watertight seam.
        ambiguousEdges+=1;ambiguousRecords.push({key,items});
      }
    }
  }
  const counts=new Map(),componentForRoot=new Map(),componentIds=[];
  for(let i=0;i<triangles.length;i++){
    const root=find(i);
    if(!componentForRoot.has(root)) componentForRoot.set(root,componentForRoot.size);
    componentIds.push(componentForRoot.get(root));
    counts.set(root,(counts.get(root)??0)+1);
  }
  const ambiguousWitnessEdges=ambiguousRecords.map(({key,items})=>({
    key,uses:items.map(({triangle,from,to})=>({componentId:componentIds[triangle],from,to})),
  }));
  return {componentCount:counts.size,triangleCounts:[...counts.values()].sort((a,b)=>b-a),
    ambiguousEdges,componentIds,ambiguousWitnessEdges};
}

// Index-edge adjacency is an *intrinsic topological observation*, not proof
// of welded physical material or a source-observed attachment.
function componentSizes(indices) {
  const count = indices.length / 3;
  const parent = Array.from({length: count}, (_, index) => index);
  const rank = new Uint8Array(count);
  function find(v) {
    while (parent[v] !== v) {parent[v] = parent[parent[v]]; v = parent[v];}
    return v;
  }
  function union(a,b) {
    a=find(a);b=find(b);
    if (a===b) return;
    if (rank[a] < rank[b]) [a,b]=[b,a];
    parent[b]=a;
    if (rank[a]===rank[b]) rank[a]+=1;
  }
  const firstTriangleForEdge = new Map();
  for (let triangle=0;triangle<count;triangle+=1) {
    const verts=indices.slice(triangle*3,triangle*3+3);
    if (new Set(verts).size !== 3) throw new Error('zero-area topological triangle has repeated vertex indices');
    for (let edge=0;edge<3;edge+=1) {
      const a=verts[edge],b=verts[(edge+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      const previous=firstTriangleForEdge.get(key);
      if (previous == null) firstTriangleForEdge.set(key,triangle);
      else union(previous,triangle);
    }
  }
  const counts=new Map();
  for(let triangle=0;triangle<count;triangle+=1){
    const root=find(triangle);counts.set(root,(counts.get(root)??0)+1);
  }
  return [...counts.values()].sort((a,b)=>b-a);
}

/**
 * No geometry mutations, no inference from material/name similarity.
 * Distinct glTF primitives are kept separate even if their coordinates touch.
 * UV seams/non-indexed triangles can overcount; results need typed review.
 */
export function inventoryGlbTriangleComponents(glb, {withTriangleDetails = false} = {}) {
  const bytes=Buffer.from(glb);
  const {json,binary}=parseGlb(bytes);
  const nodes=[],details=[];
  for(let nodeIndex=0;nodeIndex<(json.nodes?.length??0);nodeIndex+=1) {
    const node=json.nodes[nodeIndex];
    if(node.mesh==null)continue;
    const spec=json.meshes?.[node.mesh];
    if(!spec || !Array.isArray(spec.primitives) || !spec.primitives.length) {
      throw new Error('GLB mesh node ' + nodeIndex + ' has no mesh primitives');
    }
    const nodeId=String(node.extras?.refasPartId??node.name??'glb-node-'+nodeIndex);
    const primitives=[],spatialTriangles=[],topologicalTriangles=[];
    for (const [primitiveIndex,primitive] of spec.primitives.entries()) {
      if((primitive.mode??4)!==4)throw new Error(nodeId + ': only triangle-mode primitives supported');
      const indices=triangleIndices(json,binary,primitive,nodeId);
      const positions=positionVectors(json,binary,primitive,nodeId);
      const sizes=componentSizes(indices);
      primitives.push({primitiveIndex,componentCount:sizes.length,triangleCounts:sizes});
      for(let offset=0;offset<indices.length;offset+=3){
        const tri=indices.slice(offset,offset+3);
        spatialTriangles.push(tri.map(i=>positions[i]));
        topologicalTriangles.push(tri.map(i=>primitive.indices==null
          ?primitiveIndex+':nonindexed:'+offset+':'+i
          :primitiveIndex+':'+i));
      }
    }
    // Across a node's primitives, exact shared 3D edges with opposite winding
    // can reconnect a non-indexed/UV-split/material-split surface. This says
    // geometric continuity, not physical weld, attachment or source fidelity.
    const {componentIds,ambiguousWitnessEdges,...spatial}=
      geometricComponents(spatialTriangles,topologicalTriangles);
    nodes.push({nodeIndex,nodeId,meshIndex:node.mesh,triangleCount:spatialTriangles.length,
      componentCount:primitives.reduce((sum,p)=>sum+p.componentCount,0),primitives,spatial});
    if(withTriangleDetails) details.push({nodeId,nodeIndex,triangles:spatialTriangles,
      componentIds,ambiguousWitnessEdges});
  }
  const payload={schema:TRIANGLE_COMPONENT_INVENTORY_SCHEMA,assetSha256:sha256(bytes),
    authority:'index-edge adjacency diagnostic; exact-position oppositely wound geometric-edge connectivity across primitives; neither proves weld or physical support',
    nodes,
    metrics:{meshNodes:nodes.length,triangleCount:nodes.reduce((a,n)=>a+n.triangleCount,0),
      componentCount:nodes.reduce((a,n)=>a+n.componentCount,0),
      splitMeshNodes:nodes.filter(n=>n.componentCount>1).length,
      geometricSplitMeshNodes:nodes.filter(n=>n.spatial.componentCount>1).length,
      geometricallyAmbiguousMeshNodes:nodes.filter(n=>n.spatial.ambiguousEdges>0).length},
  };
  const inventory=deepFreeze({...payload,inventoryDigest:digestJson(payload)});
  // The optional geometry view is exclusively for trusted current-byte
  // narrow-phase witnesses. It is not serialized into inventoryDigest,
  // keeping preexisting persisted diagnostic contracts byte-for-byte stable.
  return withTriangleDetails?deepFreeze({inventory,details}):inventory;
}

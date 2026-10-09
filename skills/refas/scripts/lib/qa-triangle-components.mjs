import {createHash} from 'node:crypto';

import {deepFreeze, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';

export const TRIANGLE_COMPONENT_INVENTORY_SCHEMA = 'refas.triangle-component-inventory/v1';
const sha256 = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const INDEX_COMPONENTS = Object.freeze({
  5121: {size: 1, read: (view, offset) => view.getUint8(offset)},
  5123: {size: 2, read: (view, offset) => view.getUint16(offset, true)},
  5125: {size: 4, read: (view, offset) => view.getUint32(offset, true)},
});

function triangleIndices(json, binary, primitive, nodeId) {
  const position = json.accessors?.[primitive.attributes?.POSITION];
  if (!position || position.type !== 'VEC3' || !Number.isSafeInteger(position.count) || position.count < 3) {
    throw new Error(nodeId + ': missing or malformed POSITION accessor');
  }
  if (primitive.indices == null) {
    if (position.count % 3 !== 0) throw new Error(nodeId + ': non-indexed triangle count is not divisible by three');
    return Array.from({length: position.count}, (_, index) => index);
  }
  const accessor = json.accessors?.[primitive.indices];
  const viewSpec = json.bufferViews?.[accessor?.bufferView];
  const component = INDEX_COMPONENTS[accessor?.componentType];
  if (!accessor || !viewSpec || !component || accessor.type !== 'SCALAR' || accessor.sparse ||
      !Number.isSafeInteger(accessor.count) || accessor.count <= 0 || accessor.count % 3 !== 0 ||
      viewSpec.buffer !== 0) {
    throw new Error(nodeId + ': invalid triangle index accessor');
  }
  const viewOffset = Number(viewSpec.byteOffset ?? 0);
  const viewLength = Number(viewSpec.byteLength);
  const accessorOffset = Number(accessor.byteOffset ?? 0);
  const stride = Number(viewSpec.byteStride ?? component.size);
  if (![viewOffset,viewLength,accessorOffset,stride].every(Number.isSafeInteger) ||
      Math.min(viewOffset,viewLength,accessorOffset) < 0 || stride < component.size ||
      accessorOffset + (accessor.count - 1) * stride + component.size > viewLength ||
      viewOffset + viewLength > binary.length) {
    throw new Error(nodeId + ': triangle indices exceed their buffer view');
  }
  const dv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const indices = [];
  for (let n = 0; n < accessor.count; n += 1) {
    const index = component.read(dv, viewOffset + accessorOffset + n * stride);
    if (index >= position.count) throw new Error(nodeId + ': triangle index exceeds POSITION count');
    indices.push(index);
  }
  return indices;
}


function positionVectors(json, binary, primitive, nodeId) {
  const accessor=json.accessors?.[primitive.attributes?.POSITION];
  if (!accessor || accessor.type!=='VEC3' || accessor.componentType!==5126 ||
      !Number.isSafeInteger(accessor.count) || accessor.count<3 || accessor.sparse) {
    throw new Error(nodeId+': unsupported or malformed POSITION; sparse POSITION requires separate typed review');
  }
  const spec=json.bufferViews?.[accessor.bufferView];
  const viewOffset=Number(spec?.byteOffset??0),viewLength=Number(spec?.byteLength);
  const localOffset=Number(accessor.byteOffset??0),stride=Number(spec?.byteStride??12);
  if (!spec || spec.buffer!==0 ||
      ![viewOffset,viewLength,localOffset,stride].every(Number.isSafeInteger) ||
      Math.min(viewOffset,viewLength,localOffset)<0 || stride<12 || stride%4!==0 ||
      localOffset+(accessor.count-1)*stride+12>viewLength || viewOffset+viewLength>binary.length) {
    throw new Error(nodeId+': POSITION exceeds GLB buffer bounds or has invalid stride');
  }
  const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  const vectors=[];
  for(let i=0;i<accessor.count;i+=1){
    const offset=viewOffset+localOffset+i*stride;
    const position=[view.getFloat32(offset,true),view.getFloat32(offset+4,true),view.getFloat32(offset+8,true)];
    if(!position.every(Number.isFinite))throw new Error(nodeId+': POSITION contains nonfinite coordinate');
    vectors.push(position);
  }
  return vectors;
}

function geometricComponents(triangles) {
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
  for(const items of edges.values()){
    if(items.length>2){ambiguousEdges+=1;continue;}
    if(items.length===2){
      if(items[0].from===items[1].to && items[0].to===items[1].from){
        union(items[0].triangle,items[1].triangle);
      }else{
        // Same oriented overlapping faces are not a watertight seam.
        ambiguousEdges+=1;
      }
    }
  }
  const counts=new Map();
  for(let i=0;i<triangles.length;i++){
    const root=find(i);counts.set(root,(counts.get(root)??0)+1);
  }
  return {componentCount:counts.size,triangleCounts:[...counts.values()].sort((a,b)=>b-a),ambiguousEdges};
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
export function inventoryGlbTriangleComponents(glb) {
  const bytes=Buffer.from(glb);
  const {json,binary}=parseGlb(bytes);
  const nodes=[];
  for(let nodeIndex=0;nodeIndex<(json.nodes?.length??0);nodeIndex+=1) {
    const node=json.nodes[nodeIndex];
    if(node.mesh==null)continue;
    const spec=json.meshes?.[node.mesh];
    if(!spec || !Array.isArray(spec.primitives) || !spec.primitives.length) {
      throw new Error('GLB mesh node ' + nodeIndex + ' has no mesh primitives');
    }
    const nodeId=String(node.extras?.refasPartId??node.name??'glb-node-'+nodeIndex);
    const primitives=[],spatialTriangles=[];
    for (const [primitiveIndex,primitive] of spec.primitives.entries()) {
      if((primitive.mode??4)!==4)throw new Error(nodeId + ': only triangle-mode primitives supported');
      const indices=triangleIndices(json,binary,primitive,nodeId);
      const positions=positionVectors(json,binary,primitive,nodeId);
      const sizes=componentSizes(indices);
      primitives.push({primitiveIndex,componentCount:sizes.length,triangleCounts:sizes});
      for(let offset=0;offset<indices.length;offset+=3){
        spatialTriangles.push(indices.slice(offset,offset+3).map(i=>positions[i]));
      }
    }
    // Across a node's primitives, exact shared 3D edges with opposite winding
    // can reconnect a non-indexed/UV-split/material-split surface. This says
    // geometric continuity, not physical weld, attachment or source fidelity.
    const spatial=geometricComponents(spatialTriangles);
    nodes.push({nodeIndex,nodeId,meshIndex:node.mesh,triangleCount:spatialTriangles.length,
      componentCount:primitives.reduce((sum,p)=>sum+p.componentCount,0),primitives,spatial});
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
  return deepFreeze({...payload,inventoryDigest:digestJson(payload)});
}

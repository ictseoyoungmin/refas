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
    const primitives=[];
    for (const [primitiveIndex,primitive] of spec.primitives.entries()) {
      if((primitive.mode??4)!==4)throw new Error(nodeId + ': only triangle-mode primitives supported');
      const sizes=componentSizes(triangleIndices(json,binary,primitive,nodeId));
      primitives.push({primitiveIndex,componentCount:sizes.length,triangleCounts:sizes});
    }
    nodes.push({nodeIndex,nodeId,meshIndex:node.mesh,triangleCount:primitives.reduce((a,p)=>a+p.triangleCounts.reduce((b,n)=>b+n,0),0),
      componentCount:primitives.reduce((sum,p)=>sum+p.componentCount,0),primitives});
  }
  const payload={schema:TRIANGLE_COMPONENT_INVENTORY_SCHEMA,assetSha256:sha256(bytes),
    authority:'index-edge-adjacency-only; seams and separate primitives may appear disconnected',
    nodes,
    metrics:{meshNodes:nodes.length,triangleCount:nodes.reduce((a,n)=>a+n.triangleCount,0),
      componentCount:nodes.reduce((a,n)=>a+n.componentCount,0),
      splitMeshNodes:nodes.filter(n=>n.componentCount>1).length},
  };
  return deepFreeze({...payload,inventoryDigest:digestJson(payload)});
}

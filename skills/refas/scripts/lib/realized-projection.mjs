import {assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {createProjectionFit, validateProjectionFit} from './projection-fit.mjs';

export const REALIZED_PROJECTION_SCHEMA = 'refas.realized-projection/v1';

const EPS = 1e-9;
const DISTINCT_INTERFACE_KINDS = new Set(['joint-gap', 'joint-boundary', 'necked-transition']);
const COMPONENT_INFO = new Map([
  [5120, ['getInt8', 1, -128, 127]], [5121, ['getUint8', 1, 0, 255]],
  [5122, ['getInt16', 2, -32768, 32767]], [5123, ['getUint16', 2, 0, 65535]],
  [5125, ['getUint32', 4, 0, 4294967295]], [5126, ['getFloat32', 4, null, null]],
]);
const v3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite [x, y, z] vector`);
  return value.map(Number);
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(...a);
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const normalize = (a, label) => {
  const length = norm(a);
  if (!(length > EPS)) throw new Error(`${label} must have non-zero length`);
  return a.map((v) => v / length);
};

function multiply4(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) for (let k = 0; k < 4; k += 1) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
}
function trsMatrix(node) {
  if (node?.matrix) {
    if (!Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) throw new Error('glTF node.matrix must contain 16 finite values');
    return node.matrix.map(Number);
  }
  const t = node?.translation ?? [0, 0, 0], r = node?.rotation ?? [0, 0, 0, 1], s = node?.scale ?? [1, 1, 1];
  v3(t, 'glTF node.translation'); v3(s, 'glTF node.scale');
  if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite)) throw new Error('glTF node.rotation must be a finite quaternion');
  const qn = Math.hypot(...r);
  if (!(qn > EPS)) throw new Error('glTF node.rotation quaternion must have non-zero length');
  const [x, y, z, w] = r.map((value) => value / qn), [sx, sy, sz] = s;
  return [
    (1 - 2*y*y - 2*z*z) * sx, (2*x*y + 2*z*w) * sx, (2*x*z - 2*y*w) * sx, 0,
    (2*x*y - 2*z*w) * sy, (1 - 2*x*x - 2*z*z) * sy, (2*y*z + 2*x*w) * sy, 0,
    (2*x*z + 2*y*w) * sz, (2*y*z - 2*x*w) * sz, (1 - 2*x*x - 2*y*y) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function transformPoint(matrix, point) {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (Math.abs(w) < EPS) throw new Error('node transform produced a point at infinity');
  return [(matrix[0]*x + matrix[4]*y + matrix[8]*z + matrix[12]) / w, (matrix[1]*x + matrix[5]*y + matrix[9]*z + matrix[13]) / w, (matrix[2]*x + matrix[6]*y + matrix[10]*z + matrix[14]) / w];
}
function worldMatrices(json) {
  const nodes = json.nodes ?? [], parent = new Array(nodes.length).fill(null);
  nodes.forEach((node, parentIndex) => {
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) throw new Error(`glTF node ${parentIndex} references an invalid child`);
      if (parent[child] != null) throw new Error(`glTF node ${child} has multiple parents`);
      parent[child] = parentIndex;
    }
  });
  const state = new Array(nodes.length).fill(0), world = new Array(nodes.length);
  const visit = (index) => {
    if (state[index] === 2) return world[index];
    if (state[index] === 1) throw new Error('glTF node hierarchy contains a cycle');
    state[index] = 1;
    const local = trsMatrix(nodes[index]);
    world[index] = parent[index] == null ? local : multiply4(visit(parent[index]), local);
    state[index] = 2;
    return world[index];
  };
  nodes.forEach((_, index) => visit(index));
  return world;
}
function nodeIndexBySemanticId(json, nodeId) {
  const matches = [];
  (json.nodes ?? []).forEach((node, index) => { if (node?.extras?.refasPartId === nodeId || node?.name === nodeId) matches.push(index); });
  if (!matches.length) throw new Error(`realized binding references unknown GLB node: ${nodeId}`);
  if (matches.length > 1) throw new Error(`realized binding is ambiguous because GLB node ID is duplicated: ${nodeId}`);
  return matches[0];
}

export function normalizeProjectionCamera(raw = {}) {
  const projection = String(raw.projection ?? 'perspective').toLowerCase();
  if (!['perspective', 'orthographic'].includes(projection)) throw new Error('camera.projection must be perspective or orthographic');
  const position = v3(raw.position, 'camera.position'), target = v3(raw.target, 'camera.target'), upInput = normalize(v3(raw.up ?? [0,1,0], 'camera.up'), 'camera.up');
  const forward = normalize(sub(target, position), 'camera view direction'), right = normalize(cross(forward, upInput), 'camera right axis'), up = normalize(cross(right, forward), 'camera orthogonal up axis');
  const aspect = Number(raw.aspect ?? 1);
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error('camera.aspect must be positive and finite');
  const camera = {projection, position, target, up, aspect};
  if (projection === 'perspective') {
    const fovY = Number(raw.fovY);
    if (!(fovY > 0 && fovY < 179) || !Number.isFinite(fovY)) throw new Error('camera.fovY must be between 0 and 179 degrees');
    camera.fovY = fovY;
  } else {
    const orthoHeight = Number(raw.orthoHeight);
    if (!(orthoHeight > 0) || !Number.isFinite(orthoHeight)) throw new Error('camera.orthoHeight must be positive and finite');
    camera.orthoHeight = orthoHeight;
  }
  return deepFreeze({...camera, basis: {right, up, forward}});
}
export function projectWorldPoint(cameraInput, worldPoint) {
  const camera = normalizeProjectionCamera(cameraInput), point = v3(worldPoint, 'worldPoint'), delta = sub(point, camera.position);
  const x = dot(delta, camera.basis.right), y = dot(delta, camera.basis.up), depth = dot(delta, camera.basis.forward);
  if (!(depth > EPS)) throw new Error('bound point lies on or behind the camera plane');
  let xNdc, yNdc;
  if (camera.projection === 'perspective') {
    const halfHeight = Math.tan(camera.fovY * Math.PI / 360) * depth;
    xNdc = x / (halfHeight * camera.aspect); yNdc = y / halfHeight;
  } else {
    xNdc = x / (camera.orthoHeight * camera.aspect / 2); yNdc = y / (camera.orthoHeight / 2);
  }
  return deepFreeze({xy: [(xNdc + 1) / 2, (1 - yNdc) / 2], depth, insideFrame: Math.abs(xNdc) <= 1 && Math.abs(yNdc) <= 1});
}

function normalizedComponent(value, componentType, normalized) {
  if (!normalized || componentType === 5126) return value;
  const [, , min, max] = COMPONENT_INFO.get(componentType);
  if (min < 0) return Math.max(-1, value / max);
  return value / max;
}
function accessorVec3(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.type !== 'VEC3') throw new Error('realized segment POSITION accessor must be VEC3');
  const info = COMPONENT_INFO.get(accessor.componentType);
  if (!info) throw new Error(`unsupported POSITION component type: ${accessor.componentType}`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error('realized segment POSITION bufferView is missing');
  const [reader, size] = info, stride = view.byteStride ?? size * 3, base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength), points = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = base + index * stride, point = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const byteOffset = offset + axis * size;
      const raw = size === 1 ? data[reader](byteOffset) : data[reader](byteOffset, true);
      point.push(normalizedComponent(raw, accessor.componentType, accessor.normalized === true));
    }
    points.push(point);
  }
  return points;
}
function meshNodesBelow(json, rootIndex) {
  const output = [], seen = new Set();
  const visit = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    const node = json.nodes?.[index];
    if (!node) return;
    if (Number.isInteger(node.mesh)) output.push(index);
    for (const child of node.children ?? []) visit(child);
  };
  visit(rootIndex);
  return output;
}
function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point[0].toPrecision(14)},${point[1].toPrecision(14)}`, point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) throw new Error('realized segment projection requires at least three distinct projected vertices');
  const cross2 = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [], upper = [];
  for (const point of unique) { while (lower.length >= 2 && cross2(lower.at(-2), lower.at(-1), point) <= 0) lower.pop(); lower.push(point); }
  for (let index = unique.length - 1; index >= 0; index -= 1) { const point = unique[index]; while (upper.length >= 2 && cross2(upper.at(-2), upper.at(-1), point) <= 0) upper.pop(); upper.push(point); }
  lower.pop(); upper.pop();
  const hull = [...lower, ...upper];
  if (hull.length < 3) throw new Error('realized segment projection is degenerate');
  return hull;
}
function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) { const a = points[index], b = points[(index+1)%points.length]; area += a[0]*b[1] - b[0]*a[1]; }
  return Math.abs(area) * 0.5;
}
function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < ((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi) inside = !inside;
  }
  return inside;
}
function polygonIoU(a, b, resolution = 96) {
  if (a.length < 3 || b.length < 3 || polygonArea(a) < EPS || polygonArea(b) < EPS) return 0;
  const xs=[...a,...b].map((p)=>p[0]), ys=[...a,...b].map((p)=>p[1]), minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  if (maxX-minX<EPS || maxY-minY<EPS) return 0;
  let intersection=0, union=0;
  for(let iy=0;iy<resolution;iy+=1){const y=minY+((iy+.5)/resolution)*(maxY-minY);for(let ix=0;ix<resolution;ix+=1){const x=minX+((ix+.5)/resolution)*(maxX-minX),ia=pointInPolygon([x,y],a),ib=pointInPolygon([x,y],b);if(ia||ib)union+=1;if(ia&&ib)intersection+=1;}}
  return union ? intersection/union : 0;
}
function pointSegmentDistance(point, a, b) {
  const dx=b[0]-a[0], dy=b[1]-a[1], length2=dx*dx+dy*dy;
  if (length2 < EPS) return Math.hypot(point[0]-a[0], point[1]-a[1]);
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2));
  return Math.hypot(point[0]-(a[0]+t*dx),point[1]-(a[1]+t*dy));
}
function pointPolygonBoundaryDistance(point, polygon) {
  let best=Infinity;
  for(let index=0;index<polygon.length;index+=1) best=Math.min(best,pointSegmentDistance(point,polygon[index],polygon[(index+1)%polygon.length]));
  return best;
}
function deriveSegment({reference, binding, json, binary, matrices, camera}) {
  const nodeIds=[...new Set((binding?.nodeIds ?? []).map((value,index)=>assertId(value,`segment ${reference.id}.nodeIds[${index}]`))];
  if (!nodeIds.length) throw new Error(`realized segment ${reference.id} requires at least one GLB node`);
  const rootNodeIndices=nodeIds.map((nodeId)=>nodeIndexBySemanticId(json,nodeId));
  const meshNodeIndices=[...new Set(rootNodeIndices.flatMap((index)=>meshNodesBelow(json,index)))];
  if (!meshNodeIndices.length) throw new Error(`realized segment ${reference.id} does not resolve to triangle mesh nodes`);
  const projected=[]; let totalVertices=0, insideFrameVertices=0;
  for(const nodeIndex of meshNodeIndices){
    const node=json.nodes[nodeIndex], mesh=json.meshes?.[node.mesh];
    if(!mesh) continue;
    for(const primitive of mesh.primitives ?? []){
      const positionAccessor=primitive.attributes?.POSITION;
      if(!Number.isInteger(positionAccessor)) continue;
      for(const localPoint of accessorVec3(json,binary,positionAccessor)){
        totalVertices+=1;
        const worldPoint=transformPoint(matrices[nodeIndex],localPoint);
        try { const projection=projectWorldPoint(camera,worldPoint); projected.push(projection.xy); if(projection.insideFrame) insideFrameVertices+=1; } catch (error) { if(!/behind the camera plane/.test(error.message)) throw error; }
      }
    }
  }
  const projectedHull=convexHull(projected);
  return {referenceId:reference.id,importance:reference.importance,nodeIds,rootNodeIndices,meshNodeIndices,projectedHull,sourcePolygon:reference.polygon,iou:polygonIoU(reference.polygon,projectedHull),totalVertices,insideFrameVertices,insideFrameFraction:totalVertices?insideFrameVertices/totalVertices:0};
}
function deriveInterfaces(referenceGeometry, derivedSegments) {
  const byId=new Map(derivedSegments.map((segment)=>[segment.referenceId,segment]));
  return (referenceGeometry.interfaces ?? []).map((reference)=>{
    const subject=byId.get(reference.subjectSegmentId), object=byId.get(reference.objectSegmentId);
    if(!subject||!object) return {referenceId:reference.id,importance:reference.importance,evaluable:false,kind:reference.kind,separation:reference.separation,boundaryMeanErrorNormalized:null,distinctOwnership:null,requiresDistinctOwnership:false,ownershipCorrect:null};
    const distances=reference.boundary.map((point)=>(pointPolygonBoundaryDistance(point,subject.projectedHull)+pointPolygonBoundaryDistance(point,object.projectedHull))/2);
    const subjectNodes=new Set(subject.meshNodeIndices), distinctOwnership=object.meshNodeIndices.every((index)=>!subjectNodes.has(index));
    const requiresDistinctOwnership=reference.separation==='explicit'&&DISTINCT_INTERFACE_KINDS.has(reference.kind);
    return {referenceId:reference.id,importance:reference.importance,evaluable:true,kind:reference.kind,separation:reference.separation,boundaryMeanErrorNormalized:mean(distances),distinctOwnership,requiresDistinctOwnership,ownershipCorrect:!requiresDistinctOwnership||distinctOwnership};
  });
}

export function createRealizedProjection({referenceGeometry, glb, cameraHypothesisId, camera, anchorBindings = [], segmentBindings = [], evidenceRefs = []} = {}) {
  const bytes=Buffer.from(glb ?? []);
  if(!bytes.length) throw new Error('realized projection requires actual GLB bytes');
  const {json,binary}=parseGlb(bytes), matrices=worldMatrices(json), normalizedCamera=normalizeProjectionCamera(camera), assetSha256=digestBytes(bytes), cameraDigest=digestJson(normalizedCamera);
  const seen=new Set();
  const derived=anchorBindings.map((raw,index)=>{
    const referenceId=assertId(raw?.referenceId,`anchorBindings[${index}].referenceId`);
    if(seen.has(referenceId)) throw new Error(`duplicate realized anchor binding: ${referenceId}`); seen.add(referenceId);
    const nodeId=assertId(raw?.nodeId,`anchorBindings[${index}].nodeId`), localPoint=v3(raw?.localPoint ?? [0,0,0],`anchorBindings[${index}].localPoint`), nodeIndex=nodeIndexBySemanticId(json,nodeId), worldPoint=transformPoint(matrices[nodeIndex],localPoint), projection=projectWorldPoint(normalizedCamera,worldPoint);
    return {referenceId,nodeId,nodeIndex,localPoint,worldPoint,projectedXY:projection.xy,cameraDepth:projection.depth,insideFrame:projection.insideFrame};
  });
  const modelBindings=derived.map(({referenceId,nodeId,localPoint})=>({referenceId,nodeId,localPoint}));
  const segmentationDeclared=Array.isArray(referenceGeometry?.segments)||Array.isArray(referenceGeometry?.interfaces);
  const segmentById=new Map((referenceGeometry?.segments ?? []).map((item)=>[item.id,item])), segmentBindingById=new Map();
  for(const [index,raw] of segmentBindings.entries()){
    const referenceId=assertId(raw?.referenceId,`segmentBindings[${index}].referenceId`);
    if(segmentBindingById.has(referenceId)) throw new Error(`duplicate realized segment binding: ${referenceId}`);
    if(!segmentById.has(referenceId)) throw new Error(`realized segment binding references unknown source segment: ${referenceId}`);
    segmentBindingById.set(referenceId,raw);
  }
  const requiredSegments=(referenceGeometry?.segments ?? []).filter((item)=>item.importance!=='detail'&&!['occluded','inferred'].includes(item.visibility));
  const missingSegments=requiredSegments.filter((item)=>!segmentBindingById.has(item.id));
  if(missingSegments.length) throw new Error(`realized projection is missing material source segments: ${missingSegments.map((item)=>item.id).join(', ')}`);
  const derivedSegments=(referenceGeometry?.segments ?? []).filter((item)=>segmentBindingById.has(item.id)).map((reference)=>deriveSegment({reference,binding:segmentBindingById.get(reference.id),json,binary,matrices,camera:normalizedCamera}));
  const derivedInterfaces=deriveInterfaces(referenceGeometry ?? {},derivedSegments);
  const materialIous=derivedSegments.filter((item)=>item.importance!=='detail').map((item)=>item.iou), interfaceErrors=derivedInterfaces.filter((item)=>item.evaluable&&item.importance!=='detail').map((item)=>item.boundaryMeanErrorNormalized);
  const segmentationMetrics={segmentCount:derivedSegments.length,materialSegmentMeanIoU:mean(materialIous),interfaceBoundaryMeanErrorNormalized:mean(interfaceErrors),explicitOwnershipViolations:derivedInterfaces.filter((item)=>item.requiresDistinctOwnership&&item.ownershipCorrect===false).length};
  const normalizedSegmentBindings=derivedSegments.map(({referenceId,nodeIds})=>({referenceId,nodeIds}));
  const modelBindingDigest=segmentationDeclared?digestJson({assetSha256,modelBindings,segmentBindings:normalizedSegmentBindings}):digestJson({assetSha256,modelBindings});
  const fit=createProjectionFit({referenceGeometry,cameraHypothesisId,cameraDigest,modelBindingDigest,anchorProjections:derived.map((item)=>({referenceId:item.referenceId,projectedXY:item.projectedXY,binding:{kind:'node-local-point',nodeId:item.nodeId,localPoint:item.localPoint},evidenceRefs})),evidenceRefs});
  const fitValidation=validateProjectionFit(fit);
  if(!fitValidation.valid) throw new Error(`derived projection fit is invalid: ${fitValidation.errors.join('; ')}`);
  const policy={projectedCoordinatesDerivedFromRealizedGlb:true,glbHierarchyAndNodeTransformsAreAuthoritative:true,cameraParametersAreDigestBound:true,callerCannotSupplyProjectedCoordinates:true,metricsCannotCertifyVisualFidelity:true};
  if(segmentationDeclared) Object.assign(policy,{segmentPolygonsDerivedFromRealizedGlb:true,explicitPartOwnershipChecked:true,callerCannotSupplySegmentPolygons:true});
  const payload={schema:REALIZED_PROJECTION_SCHEMA,scopeId:fit.scopeId,sourceSha256:fit.sourceSha256,assetSha256,cameraHypothesisId:fit.cameraHypothesisId,camera:normalizedCamera,cameraDigest,modelBindingDigest,derivedAnchors:derived,...(segmentationDeclared?{derivedSegments,derivedInterfaces,segmentationMetrics}:{}),projectionFit:fit,projectionFitDigest:fit.projectionFitDigest,evidenceRefs:[...new Set(evidenceRefs.map(String).filter(Boolean))].sort(),policy};
  return deepFreeze({...payload,realizedProjectionDigest:digestJson(payload)});
}

export function validateRealizedProjection(proof) {
  const errors=[];
  if(proof?.schema!==REALIZED_PROJECTION_SCHEMA) errors.push('invalid schema');
  try{
    if(!validateProjectionFit(proof?.projectionFit).valid) errors.push('embedded projection fit is invalid');
    if(proof?.projectionFitDigest!==proof?.projectionFit?.projectionFitDigest) errors.push('embedded projection fit digest mismatch');
    if(proof?.cameraDigest!==digestJson(proof?.camera)) errors.push('camera digest mismatch');
    if(proof?.projectionFit?.cameraDigest!==proof?.cameraDigest) errors.push('projection fit camera digest is not realized-camera bound');
    if(proof?.projectionFit?.modelBindingDigest!==proof?.modelBindingDigest) errors.push('projection fit model binding digest is not realized-model bound');
    const segmentationDeclared=Object.prototype.hasOwnProperty.call(proof ?? {},'derivedSegments')||Object.prototype.hasOwnProperty.call(proof ?? {},'derivedInterfaces')||Object.prototype.hasOwnProperty.call(proof ?? {},'segmentationMetrics');
    if(segmentationDeclared){
      if(!Array.isArray(proof?.derivedSegments)||!Array.isArray(proof?.derivedInterfaces)||!proof?.segmentationMetrics) errors.push('realized segmentation evidence is incomplete');
      for(const segment of proof?.derivedSegments ?? []){if(!Array.isArray(segment.projectedHull)||segment.projectedHull.length<3||!Number.isFinite(segment.iou)||segment.iou<0||segment.iou>1) errors.push(`segment ${segment?.referenceId ?? '?'} has invalid realized projection evidence`);}
      for(const item of proof?.derivedInterfaces ?? []) if(item.evaluable&&(!Number.isFinite(item.boundaryMeanErrorNormalized)||item.boundaryMeanErrorNormalized<0)) errors.push(`interface ${item?.referenceId ?? '?'} has invalid realized residual`);
    }
    const p=proof?.policy ?? {};
    if(p.projectedCoordinatesDerivedFromRealizedGlb!==true||p.glbHierarchyAndNodeTransformsAreAuthoritative!==true||p.cameraParametersAreDigestBound!==true||p.callerCannotSupplyProjectedCoordinates!==true) errors.push('realized projection authority policy is missing');
    if(p.metricsCannotCertifyVisualFidelity!==true) errors.push('metric authority policy is missing');
    if(segmentationDeclared&&(p.segmentPolygonsDerivedFromRealizedGlb!==true||p.explicitPartOwnershipChecked!==true||p.callerCannotSupplySegmentPolygons!==true)) errors.push('realized segmentation authority policy is missing');
    const payload=structuredClone(proof);delete payload.realizedProjectionDigest;
    if(digestJson(payload)!==proof?.realizedProjectionDigest) errors.push('realized projection digest mismatch');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

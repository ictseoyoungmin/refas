import {assertId, deepFreeze} from './canonical.mjs';

const EPS = 1e-9;
const DISTINCT_INTERFACE_KINDS = new Set(['joint-gap', 'joint-boundary', 'necked-transition']);
const COMPONENT_INFO = new Map([
  [5120, ['getInt8', 1, -128, 127]], [5121, ['getUint8', 1, 0, 255]],
  [5122, ['getInt16', 2, -32768, 32767]], [5123, ['getUint16', 2, 0, 65535]],
  [5125, ['getUint32', 4, 0, 4294967295]], [5126, ['getFloat32', 4, null, null]],
]);
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function normalizedComponent(value, componentType, normalized) {
  if (!normalized || componentType === 5126) return value;
  const [, , min, max] = COMPONENT_INFO.get(componentType);
  return min < 0 ? Math.max(-1, value / max) : value / max;
}
function accessorVec3(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.type !== 'VEC3') throw new Error('realized segment POSITION accessor must be VEC3');
  const info = COMPONENT_INFO.get(accessor.componentType);
  if (!info) throw new Error(`unsupported POSITION component type: ${accessor.componentType}`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error('realized segment POSITION bufferView is missing');
  const [reader, size] = info;
  const stride = view.byteStride ?? size * 3;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const points = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const point = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const byteOffset = base + index * stride + axis * size;
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
  for (let index = 0; index < points.length; index += 1) { const a = points[index], b = points[(index + 1) % points.length]; area += a[0]*b[1] - b[0]*a[1]; }
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
  const xs = [...a, ...b].map((p) => p[0]), ys = [...a, ...b].map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX-minX < EPS || maxY-minY < EPS) return 0;
  let intersection = 0, union = 0;
  for (let iy = 0; iy < resolution; iy += 1) {
    const y = minY + ((iy + .5) / resolution) * (maxY-minY);
    for (let ix = 0; ix < resolution; ix += 1) {
      const x = minX + ((ix + .5) / resolution) * (maxX-minX), ia = pointInPolygon([x,y], a), ib = pointInPolygon([x,y], b);
      if (ia || ib) union += 1;
      if (ia && ib) intersection += 1;
    }
  }
  return union ? intersection / union : 0;
}
function pointSegmentDistance(point, a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], length2 = dx*dx+dy*dy;
  if (length2 < EPS) return Math.hypot(point[0]-a[0], point[1]-a[1]);
  const t = Math.max(0, Math.min(1, ((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2));
  return Math.hypot(point[0]-(a[0]+t*dx), point[1]-(a[1]+t*dy));
}
function pointPolygonBoundaryDistance(point, polygon) {
  let best = Infinity;
  for (let index = 0; index < polygon.length; index += 1) best = Math.min(best, pointSegmentDistance(point, polygon[index], polygon[(index+1)%polygon.length]));
  return best;
}
function deriveSegment({reference, binding, json, binary, matrices, nodeIndexBySemanticId, transformPoint, projectWorldPoint}) {
  const nodeIds = [...new Set((binding?.nodeIds ?? []).map((value, index) => assertId(value, `segment ${reference.id}.nodeIds[${index}]`)))];
  if (!nodeIds.length) throw new Error(`realized segment ${reference.id} requires at least one GLB node`);
  const rootNodeIndices = nodeIds.map(nodeIndexBySemanticId);
  const meshNodeIndices = [...new Set(rootNodeIndices.flatMap((index) => meshNodesBelow(json, index)))];
  if (!meshNodeIndices.length) throw new Error(`realized segment ${reference.id} does not resolve to mesh nodes`);
  const projected = [];
  let totalVertices = 0, insideFrameVertices = 0;
  for (const nodeIndex of meshNodeIndices) {
    const node = json.nodes[nodeIndex], mesh = json.meshes?.[node.mesh];
    if (!mesh) continue;
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (!Number.isInteger(positionAccessor)) continue;
      for (const localPoint of accessorVec3(json, binary, positionAccessor)) {
        totalVertices += 1;
        const worldPoint = transformPoint(matrices[nodeIndex], localPoint);
        try { const projection = projectWorldPoint(worldPoint); projected.push(projection.xy); if (projection.insideFrame) insideFrameVertices += 1; }
        catch (error) { if (!/behind the camera plane/.test(error.message)) throw error; }
      }
    }
  }
  const projectedHull = convexHull(projected);
  return deepFreeze({referenceId:reference.id, importance:reference.importance, nodeIds, rootNodeIndices, meshNodeIndices, projectedHull, sourcePolygon:reference.polygon, iou:polygonIoU(reference.polygon, projectedHull), totalVertices, insideFrameVertices, insideFrameFraction:totalVertices ? insideFrameVertices/totalVertices : 0});
}

export function deriveRealizedSegmentation({referenceGeometry, segmentBindings = [], json, binary, matrices, nodeIndexBySemanticId, transformPoint, projectWorldPoint} = {}) {
  const segmentById = new Map((referenceGeometry?.segments ?? []).map((item) => [item.id, item]));
  const bindingById = new Map();
  for (const [index, raw] of segmentBindings.entries()) {
    const referenceId = assertId(raw?.referenceId, `segmentBindings[${index}].referenceId`);
    if (bindingById.has(referenceId)) throw new Error(`duplicate realized segment binding: ${referenceId}`);
    if (!segmentById.has(referenceId)) throw new Error(`realized segment binding references unknown source segment: ${referenceId}`);
    bindingById.set(referenceId, raw);
  }
  const required = (referenceGeometry?.segments ?? []).filter((item) => item.importance !== 'detail' && !['occluded','inferred'].includes(item.visibility));
  const missing = required.filter((item) => !bindingById.has(item.id));
  if (missing.length) throw new Error(`realized projection is missing source-visible segments: ${missing.map((item) => item.id).join(', ')}`);
  const derivedSegments = (referenceGeometry?.segments ?? []).filter((item) => bindingById.has(item.id)).map((reference) => deriveSegment({reference, binding:bindingById.get(reference.id), json, binary, matrices, nodeIndexBySemanticId, transformPoint, projectWorldPoint}));
  const realizedById = new Map(derivedSegments.map((item) => [item.referenceId, item]));
  const derivedInterfaces = (referenceGeometry?.interfaces ?? []).map((reference) => {
    const subject = realizedById.get(reference.subjectSegmentId), object = realizedById.get(reference.objectSegmentId);
    if (!subject || !object) return deepFreeze({referenceId:reference.id, importance:reference.importance, evaluable:false, kind:reference.kind, separation:reference.separation, boundaryMeanErrorNormalized:null, distinctOwnership:null, requiresDistinctOwnership:false, ownershipCorrect:null});
    const distances = reference.boundary.map((point) => (pointPolygonBoundaryDistance(point, subject.projectedHull) + pointPolygonBoundaryDistance(point, object.projectedHull)) / 2);
    const subjectNodes = new Set(subject.meshNodeIndices), distinctOwnership = object.meshNodeIndices.every((index) => !subjectNodes.has(index));
    const requiresDistinctOwnership = reference.separation === 'explicit' && DISTINCT_INTERFACE_KINDS.has(reference.kind);
    return deepFreeze({referenceId:reference.id, importance:reference.importance, evaluable:true, kind:reference.kind, separation:reference.separation, boundaryMeanErrorNormalized:mean(distances), distinctOwnership, requiresDistinctOwnership, ownershipCorrect:!requiresDistinctOwnership || distinctOwnership});
  });
  const sourceVisibleIous = derivedSegments.filter((item) => item.importance !== 'detail').map((item) => item.iou);
  const interfaceErrors = derivedInterfaces.filter((item) => item.evaluable && item.importance !== 'detail').map((item) => item.boundaryMeanErrorNormalized);
  return deepFreeze({
    derivedSegments,
    derivedInterfaces,
    segmentationMetrics:{segmentCount:derivedSegments.length, sourceVisibleSegmentMeanIoU:mean(sourceVisibleIous), interfaceBoundaryMeanErrorNormalized:mean(interfaceErrors), explicitOwnershipViolations:derivedInterfaces.filter((item) => item.requiresDistinctOwnership && item.ownershipCorrect === false).length},
    normalizedSegmentBindings:derivedSegments.map(({referenceId,nodeIds}) => ({referenceId,nodeIds})),
  });
}

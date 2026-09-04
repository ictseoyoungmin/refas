import {createHash} from 'node:crypto';

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {parseGlb} from './glb.mjs';

export const REALIZED_CONTACT_PLAN_SCHEMA = 'refas.realized-contact-plan/v1';
export const REALIZED_CONTACT_GRAPH_SCHEMA = 'refas.realized-contact-graph/v1';
export const REALIZED_CONTACT_REPORT_SCHEMA = 'refas.realized-contact-report/v1';

const EPS = 1e-9;
const EXPECTATION_KINDS = new Set(['CONTACT', 'SUPPORT', 'CLEARANCE', 'FORBID', 'IGNORE']);
const UNEXPECTED_POLICIES = new Set(['BLOCK', 'REPORT', 'IGNORE']);
const uniqueStrings = (values = []) => [...new Set((values ?? []).map(String).filter(Boolean))].sort();
const sha256 = (value) => createHash('sha256').update(Buffer.from(value)).digest('hex');

function finite(value, label, {minimum = -Infinity, maximum = Infinity} = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} must be finite in [${minimum}, ${maximum}]`);
  return number;
}
function evidence(values, label) {
  const refs = uniqueStrings(values);
  if (!refs.length) throw new Error(`${label} requires at least one evidence reference`);
  return refs;
}
const pairKey = (a, b) => [String(a), String(b)].sort().join('::');
const sameStrings = (a, b) => digestJson(uniqueStrings(a)) === digestJson(uniqueStrings(b));

function normalizeFusionBindings(rawBindings, entityIds) {
  const memberOwner = new Map(), physicalIds = new Set();
  const bindings = rawBindings.map((raw, index) => {
    const label = `fusionBindings[${index}]`;
    const physicalEntityId = assertId(raw?.physicalEntityId, `${label}.physicalEntityId`);
    const semanticMemberIds = uniqueStrings(raw?.semanticMemberIds).map((id) => assertId(id, `${label}.semanticMemberIds`));
    if (!semanticMemberIds.length || !semanticMemberIds.includes(physicalEntityId)) throw new Error(`${label} must include the physical entity as a semantic member`);
    for (const id of semanticMemberIds) {
      if (!entityIds.has(id)) throw new Error(`${label} references unknown semantic member ${id}`);
      if (memberOwner.has(id)) throw new Error(`semantic entity ${id} appears in more than one fusion binding`);
      memberOwner.set(id, physicalEntityId);
    }
    if (physicalIds.has(physicalEntityId)) throw new Error(`duplicate physical fusion entity ${physicalEntityId}`);
    physicalIds.add(physicalEntityId);
    return {
      physicalEntityId,
      semanticMemberIds,
      fusionReportDigest: assertDigest(raw?.fusionReportDigest, `${label}.fusionReportDigest`),
      provenanceDigest: assertDigest(raw?.provenanceDigest, `${label}.provenanceDigest`),
      evidenceRefs: evidence(raw?.evidenceRefs, `${label}.evidenceRefs`),
    };
  }).sort((a, b) => a.physicalEntityId.localeCompare(b.physicalEntityId));
  return bindings;
}

function normalizeExpectation(raw, index, entityIds) {
  const label = `pairExpectations[${index}]`;
  const kind = String(raw?.kind ?? '');
  if (!EXPECTATION_KINDS.has(kind)) throw new Error(`${label}.kind must be one of ${[...EXPECTATION_KINDS].join(', ')}`);
  const subjectId = assertId(raw?.subjectId, `${label}.subjectId`), ownerId = assertId(raw?.ownerId, `${label}.ownerId`);
  if (!entityIds.has(subjectId) || !entityIds.has(ownerId) || subjectId === ownerId) throw new Error(`${label} requires two distinct declared semantic entities`);
  const maxGap = finite(raw?.maxGap ?? 0.001, `${label}.maxGap`, {minimum: 0});
  const minimumClearance = finite(raw?.minimumClearance ?? 0, `${label}.minimumClearance`, {minimum: 0});
  const maximumClearance = finite(raw?.maximumClearance ?? maxGap, `${label}.maximumClearance`, {minimum: 0});
  if (minimumClearance > maximumClearance) throw new Error(`${label} requires minimumClearance <= maximumClearance`);
  return {
    id: assertId(raw?.id, `${label}.id`),
    kind,
    subjectId,
    ownerId,
    relationId: raw?.relationId == null ? null : assertId(raw.relationId, `${label}.relationId`),
    maxGap,
    minimumClearance,
    maximumClearance,
    maxPenetration: finite(raw?.maxPenetration ?? 0, `${label}.maxPenetration`, {minimum: 0}),
    minContactArea: finite(raw?.minContactArea ?? 0, `${label}.minContactArea`, {minimum: 0}),
    evidenceRefs: evidence(raw?.evidenceRefs, `${label}.evidenceRefs`),
  };
}

export function createRealizedContactPlan({
  attachmentSemantics,
  id,
  assetSha256,
  propagationReportDigest = null,
  fusionBindings = [],
  supportRoots = [],
  supportRequiredEntityIds = [],
  pairExpectations = [],
  broadPhaseMargin = 0.02,
  contactTolerance = 0.001,
  penetrationTolerance = 1e-6,
  unexpectedContactPolicy = 'REPORT',
  evidenceRefs = [],
} = {}) {
  const semanticsValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!semanticsValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticsValidation.errors.join('; ')}`);
  const entityIds = new Set(attachmentSemantics.entities.map((entity) => entity.id));
  const roots = uniqueStrings(supportRoots).map((root) => assertId(root, 'supportRoots[]'));
  const required = uniqueStrings(supportRequiredEntityIds).map((entityId) => assertId(entityId, 'supportRequiredEntityIds[]'));
  for (const value of [...roots, ...required]) if (!entityIds.has(value)) throw new Error(`support policy references unknown entity ${value}`);
  if (required.length && !roots.length) throw new Error('support-required entities need at least one explicit support root');
  const bindings = normalizeFusionBindings(fusionBindings, entityIds);
  const expectations = pairExpectations.map((raw, index) => normalizeExpectation(raw, index, entityIds)).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(expectations.map((item) => item.id)).size !== expectations.length) throw new Error('pair expectation IDs must be unique');
  const policy = String(unexpectedContactPolicy);
  if (!UNEXPECTED_POLICIES.has(policy)) throw new Error(`unexpectedContactPolicy must be one of ${[...UNEXPECTED_POLICIES].join(', ')}`);
  const payload = {
    schema: REALIZED_CONTACT_PLAN_SCHEMA,
    id: assertId(id, 'id'),
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    assetSha256: assertDigest(assetSha256, 'assetSha256'),
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    propagationReportDigest: propagationReportDigest == null ? null : assertDigest(propagationReportDigest, 'propagationReportDigest'),
    fusionBindings: bindings,
    supportRoots: roots,
    supportRequiredEntityIds: required,
    pairExpectations: expectations,
    broadPhaseMargin: finite(broadPhaseMargin, 'broadPhaseMargin', {minimum: 0}),
    contactTolerance: finite(contactTolerance, 'contactTolerance', {minimum: 0}),
    penetrationTolerance: finite(penetrationTolerance, 'penetrationTolerance', {minimum: 0}),
    unexpectedContactPolicy: policy,
    evidenceRefs: evidence(evidenceRefs, 'evidenceRefs'),
    policy: {
      actualGlbBytesAreAuthority: true,
      broadPhaseCannotAuthorizeContact: true,
      triangleSurfaceNarrowPhaseRequired: true,
      supportRootsMustBeExplicit: true,
      freeDoesNotImplySupportExemption: true,
      penetrationIsNotContactSuccess: true,
      physicalFusionAliasesMustBeDigestBound: true,
      reportDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

function planInput(value) {
  return {
    id: value.id,
    assetSha256: value.assetSha256,
    propagationReportDigest: value.propagationReportDigest,
    fusionBindings: value.fusionBindings,
    supportRoots: value.supportRoots,
    supportRequiredEntityIds: value.supportRequiredEntityIds,
    pairExpectations: value.pairExpectations,
    broadPhaseMargin: value.broadPhaseMargin,
    contactTolerance: value.contactTolerance,
    penetrationTolerance: value.penetrationTolerance,
    unexpectedContactPolicy: value.unexpectedContactPolicy,
    evidenceRefs: value.evidenceRefs,
  };
}

export function validateRealizedContactPlan(value, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== REALIZED_CONTACT_PLAN_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required');
    const recreated = createRealizedContactPlan({attachmentSemantics, ...planInput(value)});
    if (recreated.planDigest !== value.planDigest) errors.push('realized contact plan digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('realized contact plan is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const out = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  return out;
}
function nodeMatrix(node) {
  if (node.matrix) {
    if (node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) throw new Error('node matrix must be a finite mat4');
    return [...node.matrix];
  }
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1], [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [(1 - 2*y*y - 2*z*z)*sx, (2*x*y + 2*z*w)*sx, (2*x*z - 2*y*w)*sx, 0,
    (2*x*y - 2*z*w)*sy, (1 - 2*x*x - 2*z*z)*sy, (2*y*z + 2*x*w)*sy, 0,
    (2*x*z + 2*y*w)*sz, (2*y*z - 2*x*w)*sz, (1 - 2*x*x - 2*y*y)*sz, 0, tx, ty, tz, 1];
}
const transformPoint = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];

function worldMatrices(json) {
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [], world = new Map(), parent = new Map();
  const walk = (index, parentMatrix = identity()) => {
    if (world.has(index)) throw new Error(`GLB node ${index} is reachable more than once`);
    const node = json.nodes?.[index];
    if (!node) throw new Error(`missing GLB node ${index}`);
    const matrix = multiply(parentMatrix, nodeMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) { if (parent.has(child)) throw new Error(`GLB node ${child} has multiple parents`); parent.set(child, index); walk(child, matrix); }
  };
  for (const root of roots) walk(root);
  for (let index = 0; index < (json.nodes?.length ?? 0); index += 1) if (json.nodes[index]?.mesh != null && !world.has(index)) throw new Error(`mesh node ${index} is not reachable from active scene`);
  return world;
}

const COMPONENT = {
  5120: {size: 1, read: (v, o) => v.getInt8(o)},
  5121: {size: 1, read: (v, o) => v.getUint8(o)},
  5122: {size: 2, read: (v, o) => v.getInt16(o, true)},
  5123: {size: 2, read: (v, o) => v.getUint16(o, true)},
  5125: {size: 4, read: (v, o) => v.getUint32(o, true)},
  5126: {size: 4, read: (v, o) => v.getFloat32(o, true)},
};
const TYPE_SIZE = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
function readAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex], viewSpec = json.bufferViews?.[accessor?.bufferView], component = COMPONENT[accessor?.componentType], width = TYPE_SIZE[accessor?.type];
  if (!accessor || !viewSpec || !component || !width || accessor.sparse) throw new Error(`unsupported accessor ${accessorIndex}`);
  if (viewSpec.buffer !== 0) throw new Error('realized contact requires the embedded GLB buffer');
  const stride = Number(viewSpec.byteStride ?? component.size * width), start = Number(viewSpec.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  if (stride < component.size * width) throw new Error(`accessor ${accessorIndex} byteStride is too small`);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength), output = [];
  for (let item = 0; item < accessor.count; item += 1) {
    const base = start + item * stride;
    if (base + component.size * width > binary.length) throw new Error(`accessor ${accessorIndex} exceeds BIN chunk`);
    const values = [];
    for (let lane = 0; lane < width; lane += 1) values.push(component.read(data, base + lane * component.size));
    output.push(width === 1 ? values[0] : values);
  }
  return output;
}

const sub = (a, b) => a.map((value, index) => value - b[index]);
const add = (a, b) => a.map((value, index) => value + b[index]);
const scale = (a, s) => a.map((value) => value * s);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const length = (a) => Math.hypot(...a);
const distanceSq = (a, b) => dot(sub(a, b), sub(a, b));
function triangleNormal(triangle) { const value = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0])), n = length(value); return n <= EPS ? [0, 0, 0] : scale(value, 1/n); }
function triangleArea(triangle) { return length(cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]))) * 0.5; }
function triangleBounds(triangle) { return {min: [0,1,2].map((axis) => Math.min(...triangle.map((p) => p[axis]))), max: [0,1,2].map((axis) => Math.max(...triangle.map((p) => p[axis])))}; }
function mergeBounds(items) { return {min: [0,1,2].map((axis) => Math.min(...items.map((item) => item.min[axis]))), max: [0,1,2].map((axis) => Math.max(...items.map((item) => item.max[axis])))}; }
function boundsGapSq(a, b) { let sum = 0; for (let axis = 0; axis < 3; axis += 1) { const d = a.max[axis] < b.min[axis] ? b.min[axis]-a.max[axis] : b.max[axis] < a.min[axis] ? a.min[axis]-b.max[axis] : 0; sum += d*d; } return sum; }
function pointBoundsGapSq(point, bounds) { let sum = 0; for (let axis = 0; axis < 3; axis += 1) { const d = point[axis] < bounds.min[axis] ? bounds.min[axis]-point[axis] : point[axis] > bounds.max[axis] ? point[axis]-bounds.max[axis] : 0; sum += d*d; } return sum; }

function pointTriangleDistanceSq(p, tri) {
  const [a,b,c] = tri, ab = sub(b,a), ac = sub(c,a), ap = sub(p,a), d1 = dot(ab,ap), d2 = dot(ac,ap);
  if (d1 <= 0 && d2 <= 0) return distanceSq(p,a);
  const bp = sub(p,b), d3 = dot(ab,bp), d4 = dot(ac,bp); if (d3 >= 0 && d4 <= d3) return distanceSq(p,b);
  const vc = d1*d4-d3*d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1/(d1-d3); return distanceSq(p, add(a, scale(ab,v))); }
  const cp = sub(p,c), d5 = dot(ab,cp), d6 = dot(ac,cp); if (d6 >= 0 && d5 <= d6) return distanceSq(p,c);
  const vb = d5*d2-d1*d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2/(d2-d6); return distanceSq(p, add(a, scale(ac,w))); }
  const va = d3*d6-d5*d4; if (va <= 0 && (d4-d3) >= 0 && (d5-d6) >= 0) { const w = (d4-d3)/((d4-d3)+(d5-d6)); return distanceSq(p, add(b, scale(sub(c,b),w))); }
  const denominator = 1/(va+vb+vc), v = vb*denominator, w = vc*denominator;
  return distanceSq(p, add(a, add(scale(ab,v), scale(ac,w))));
}

function segmentSegmentDistanceSq(p1, q1, p2, q2) {
  const d1 = sub(q1,p1), d2 = sub(q2,p2), r = sub(p1,p2), a = dot(d1,d1), e = dot(d2,d2), f = dot(d2,r); let s = 0, t = 0;
  if (a <= EPS && e <= EPS) return distanceSq(p1,p2);
  if (a <= EPS) t = Math.max(0, Math.min(1, f/e));
  else { const c = dot(d1,r); if (e <= EPS) s = Math.max(0, Math.min(1, -c/a)); else { const b = dot(d1,d2), denom = a*e-b*b; if (Math.abs(denom) > EPS) s = Math.max(0, Math.min(1, (b*f-c*e)/denom)); t = (b*s+f)/e; if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c/a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b-c)/a)); } } }
  return distanceSq(add(p1,scale(d1,s)), add(p2,scale(d2,t)));
}

function segmentTriangleIntersection(p0, p1, tri) {
  const dir = sub(p1,p0), e1 = sub(tri[1],tri[0]), e2 = sub(tri[2],tri[0]), h = cross(dir,e2), a = dot(e1,h);
  if (Math.abs(a) <= EPS) return false;
  const f = 1/a, s = sub(p0,tri[0]), u = f*dot(s,h); if (u < -EPS || u > 1+EPS) return false;
  const q = cross(s,e1), v = f*dot(dir,q); if (v < -EPS || u+v > 1+EPS) return false;
  const t = f*dot(e2,q); return t >= -EPS && t <= 1+EPS;
}

function triangleDistanceRecord(a, b) {
  const ea = [[a.points[0],a.points[1]],[a.points[1],a.points[2]],[a.points[2],a.points[0]]], eb = [[b.points[0],b.points[1]],[b.points[1],b.points[2]],[b.points[2],b.points[0]]];
  const intersects = ea.some(([p,q]) => segmentTriangleIntersection(p,q,b.points)) || eb.some(([p,q]) => segmentTriangleIntersection(p,q,a.points));
  if (intersects) return {distanceSq: 0, intersects: true};
  let best = Infinity;
  for (const p of a.points) best = Math.min(best, pointTriangleDistanceSq(p,b.points));
  for (const p of b.points) best = Math.min(best, pointTriangleDistanceSq(p,a.points));
  for (const [p,q] of ea) for (const [r,s] of eb) best = Math.min(best, segmentSegmentDistanceSq(p,q,r,s));
  return {distanceSq: best, intersects: false};
}

function buildBvh(triangles, indices = null) {
  const ids = indices ?? triangles.map((_, index) => index), bounds = mergeBounds(ids.map((id) => triangles[id].bounds));
  if (ids.length <= 12) return {bounds, ids, count: ids.length};
  const extent = bounds.max.map((value, axis) => value-bounds.min[axis]), axis = extent.indexOf(Math.max(...extent));
  const sorted = [...ids].sort((a,b) => triangles[a].centroid[axis]-triangles[b].centroid[axis] || a-b), middle = Math.floor(sorted.length/2);
  return {bounds, count: ids.length, left: buildBvh(triangles,sorted.slice(0,middle)), right: buildBvh(triangles,sorted.slice(middle))};
}
function nearestTriangles(meshA, meshB) {
  let best = {distanceSq: Infinity, aIndex: null, bIndex: null, intersects: false}, stack = [[meshA.bvh, meshB.bvh]];
  while (stack.length) {
    const [aNode,bNode] = stack.pop(); if (boundsGapSq(aNode.bounds,bNode.bounds) > best.distanceSq + EPS) continue;
    if (aNode.ids && bNode.ids) {
      for (const ai of aNode.ids) for (const bi of bNode.ids) {
        if (boundsGapSq(meshA.triangles[ai].bounds,meshB.triangles[bi].bounds) > best.distanceSq + EPS) continue;
        const record = triangleDistanceRecord(meshA.triangles[ai],meshB.triangles[bi]);
        if (record.distanceSq < best.distanceSq-EPS || (Math.abs(record.distanceSq-best.distanceSq)<=EPS && `${ai}:${bi}` < `${best.aIndex}:${best.bIndex}`)) best = {...record,aIndex:ai,bIndex:bi};
      }
      continue;
    }
    if (!aNode.ids && (bNode.ids || aNode.count >= bNode.count)) { stack.push([aNode.right,bNode],[aNode.left,bNode]); }
    else { stack.push([aNode,bNode.right],[aNode,bNode.left]); }
  }
  return best;
}
function pointMeshDistanceSq(point, mesh) {
  let best = Infinity, stack = [mesh.bvh];
  while (stack.length) { const node = stack.pop(); if (pointBoundsGapSq(point,node.bounds) > best+EPS) continue; if (node.ids) for (const id of node.ids) best = Math.min(best,pointTriangleDistanceSq(point,mesh.triangles[id].points)); else stack.push(node.right,node.left); }
  return best;
}
function rayTriangleT(origin, direction, tri) {
  const e1=sub(tri[1],tri[0]), e2=sub(tri[2],tri[0]), h=cross(direction,e2), a=dot(e1,h); if (Math.abs(a)<=EPS) return null;
  const f=1/a, s=sub(origin,tri[0]), u=f*dot(s,h); if (u<-EPS||u>1+EPS) return null;
  const q=cross(s,e1), v=f*dot(direction,q); if (v<-EPS||u+v>1+EPS) return null;
  const t=f*dot(e2,q); return t>EPS?t:null;
}
function pointInsideMesh(point, mesh) {
  if (Math.sqrt(pointMeshDistanceSq(point,mesh)) <= 1e-8) return false;
  const direction = [1,0.371390676,0.127831], hits=[];
  for (const triangle of mesh.triangles) { const t=rayTriangleT(point,direction,triangle.points); if (t!=null) hits.push(t); }
  hits.sort((a,b)=>a-b); const unique=[]; for (const t of hits) if (!unique.length || Math.abs(t-unique[unique.length-1])>1e-7) unique.push(t);
  return unique.length%2===1;
}
function deterministicSample(values, maximum) { if (values.length<=maximum) return values; const out=[]; for (let i=0;i<maximum;i+=1) out.push(values[Math.floor(i*values.length/maximum)]); return out; }
function contactAreaEstimate(source, target, tolerance) {
  const sample=deterministicSample(source.triangles,128), sampleArea=sample.reduce((sum,t)=>sum+t.area,0), totalArea=source.triangles.reduce((sum,t)=>sum+t.area,0);
  if (sampleArea<=EPS) return 0; const near=sample.reduce((sum,t)=>sum+(Math.sqrt(pointMeshDistanceSq(t.centroid,target))<=tolerance?t.area:0),0); return totalArea*(near/sampleArea);
}
function penetrationEstimate(a,b) {
  let maximum=0;
  for (const point of deterministicSample(a.vertices,96)) if (pointInsideMesh(point,b)) maximum=Math.max(maximum,Math.sqrt(pointMeshDistanceSq(point,b)));
  for (const point of deterministicSample(b.vertices,96)) if (pointInsideMesh(point,a)) maximum=Math.max(maximum,Math.sqrt(pointMeshDistanceSq(point,a)));
  return maximum;
}

function extractPhysicalMeshes(glb) {
  const {json,binary}=parseGlb(glb), world=worldMatrices(json), meshes=[], ids=new Set();
  for (let nodeIndex=0;nodeIndex<(json.nodes?.length??0);nodeIndex+=1) {
    const node=json.nodes[nodeIndex]; if (node.mesh==null) continue;
    const id=assertId(node.extras?.refasPartId??node.name,`GLB mesh node ${nodeIndex} ID`); if(ids.has(id)) throw new Error(`duplicate realized physical entity ${id}`); ids.add(id);
    const meshSpec=json.meshes?.[node.mesh]; if(!meshSpec) throw new Error(`${id}: missing mesh ${node.mesh}`);
    const vertices=[], triangles=[];
    for (const primitive of meshSpec.primitives??[]) {
      if ((primitive.mode??4)!==4) throw new Error(`${id}: realized contact supports TRIANGLES primitives only`);
      const local=readAccessor(json,binary,primitive.attributes?.POSITION); if(!local.length||!local.every((p)=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))) throw new Error(`${id}: invalid POSITION accessor`);
      const transformed=local.map((p)=>transformPoint(world.get(nodeIndex),p)), indices=primitive.indices==null?transformed.map((_,i)=>i):readAccessor(json,binary,primitive.indices);
      if(indices.length%3!==0||!indices.every(Number.isInteger)) throw new Error(`${id}: triangle index accessor is invalid`);
      const base=vertices.length; vertices.push(...transformed);
      for(let i=0;i<indices.length;i+=3){ const points=[transformed[indices[i]],transformed[indices[i+1]],transformed[indices[i+2]]]; if(points.some((p)=>!p)) throw new Error(`${id}: triangle index is out of range`); const area=triangleArea(points); if(area<=EPS) continue; const bounds=triangleBounds(points); triangles.push({points,area,bounds,centroid:scale(add(add(points[0],points[1]),points[2]),1/3),normal:triangleNormal(points),source:[base+indices[i],base+indices[i+1],base+indices[i+2]]}); }
    }
    if(!triangles.length) throw new Error(`${id}: no non-degenerate triangles`);
    const bounds=mergeBounds(triangles.map((triangle)=>triangle.bounds)); meshes.push({id,nodeIndex,vertices,triangles,bounds,bvh:buildBvh(triangles)});
  }
  return meshes.sort((a,b)=>a.id.localeCompare(b.id));
}

function verifyFusionArtifacts(plan, fusionArtifacts, actualIds) {
  const artifacts=new Map((fusionArtifacts??[]).map((entry)=>[entry?.report?.reportDigest,entry])), checks=[];
  for(const binding of plan.fusionBindings){ const artifact=artifacts.get(binding.fusionReportDigest), report=artifact?.report, provenance=artifact?.provenance; let pass=true, reason=null;
    if(!report||!provenance) {pass=false;reason='fusion artifact is missing';}
    else if(report.status!=='BAKED'||report.provenanceDigest!==binding.provenanceDigest||provenance.provenanceDigest!==binding.provenanceDigest){pass=false;reason='fusion report/provenance digest or status mismatch';}
    else if(provenance.fusionRootId!==binding.physicalEntityId||!sameStrings(provenance.sourceMemberIds,binding.semanticMemberIds)){pass=false;reason='fusion provenance members do not match binding';}
    else if(!actualIds.has(binding.physicalEntityId)){pass=false;reason='fused physical entity is absent from realized GLB';}
    checks.push({physicalEntityId:binding.physicalEntityId,fusionReportDigest:binding.fusionReportDigest,provenanceDigest:binding.provenanceDigest,pass,reason});
  }
  if(checks.some((check)=>!check.pass)) throw new Error(`fusion binding verification failed: ${checks.filter((check)=>!check.pass).map((check)=>`${check.physicalEntityId}: ${check.reason}`).join('; ')}`);
  return checks;
}
function semanticPhysicalMap(plan) { const map=new Map(); for(const binding of plan.fusionBindings) for(const id of binding.semanticMemberIds) map.set(id,binding.physicalEntityId); return (id)=>map.get(id)??id; }

function pairMeasurement(a,b,plan){ const nearest=nearestTriangles(a,b), minimumSurfaceDistance=Math.sqrt(nearest.distanceSq), ta=a.triangles[nearest.aIndex], tb=b.triangles[nearest.bIndex], normalOpposition=ta&&tb?-dot(ta.normal,tb.normal):null;
  const penetrationDepthEstimate=penetrationEstimate(a,b), crossingIntersection=Boolean(nearest.intersects&&Math.abs(dot(ta?.normal??[0,0,0],tb?.normal??[0,0,0]))<0.999999), areaA=contactAreaEstimate(a,b,plan.contactTolerance), areaB=contactAreaEstimate(b,a,plan.contactTolerance), contactAreaEstimateValue=Math.min(areaA,areaB);
  const type=(penetrationDepthEstimate>plan.penetrationTolerance||crossingIntersection)?'PENETRATION':minimumSurfaceDistance<=plan.contactTolerance?'CONTACT':'CLEARANCE';
  return {aId:a.id,bId:b.id,type,minimumSurfaceDistance,penetrationDepthEstimate,crossingIntersection,contactAreaEstimate:contactAreaEstimateValue,normalOpposition,broadPhaseGap:Math.sqrt(boundsGapSq(a.bounds,b.bounds))};
}

function evaluateExpectation(expectation, measurement, resolvePhysical, fusionBindings, plan){ const subjectPhysicalId=resolvePhysical(expectation.subjectId), ownerPhysicalId=resolvePhysical(expectation.ownerId);
  if(subjectPhysicalId===ownerPhysicalId){ const binding=fusionBindings.find((item)=>item.physicalEntityId===subjectPhysicalId), fused=Boolean(binding&&binding.semanticMemberIds.includes(expectation.subjectId)&&binding.semanticMemberIds.includes(expectation.ownerId)); return {...expectation,subjectPhysicalId,ownerPhysicalId,status:fused?'SATISFIED_BY_FUSION':'BLOCKED',pass:fused,measurement:null}; }
  if(!measurement) return {...expectation,subjectPhysicalId,ownerPhysicalId,status:'BLOCKED',pass:false,measurement:null};
  const penetrationPass=measurement.penetrationDepthEstimate<=expectation.maxPenetration+EPS&&(!measurement.crossingIntersection||expectation.maxPenetration>0);
  let pass=false;
  if(expectation.kind==='CONTACT'||expectation.kind==='SUPPORT') pass=measurement.minimumSurfaceDistance<=expectation.maxGap+EPS&&measurement.contactAreaEstimate+EPS>=expectation.minContactArea&&penetrationPass;
  else if(expectation.kind==='CLEARANCE') pass=measurement.minimumSurfaceDistance+EPS>=expectation.minimumClearance&&measurement.minimumSurfaceDistance<=expectation.maximumClearance+EPS&&penetrationPass;
  else if(expectation.kind==='FORBID') pass=measurement.minimumSurfaceDistance>plan.contactTolerance+EPS&&measurement.penetrationDepthEstimate<=plan.penetrationTolerance&&!measurement.crossingIntersection;
  else if(expectation.kind==='IGNORE') pass=true;
  return {...expectation,subjectPhysicalId,ownerPhysicalId,status:pass?'SATISFIED':'BLOCKED',pass,measurement};
}

function supportPath(entityId, roots, edges){ const rootSet=new Set(roots); if(rootSet.has(entityId)) return [entityId]; const byChild=new Map(); for(const edge of edges){const list=byChild.get(edge.subjectPhysicalId)??[];list.push(edge.ownerPhysicalId);byChild.set(edge.subjectPhysicalId,list.sort());}
  const queue=[[entityId,[entityId]]],seen=new Set([entityId]); while(queue.length){const [current,path]=queue.shift(); for(const next of byChild.get(current)??[]){if(rootSet.has(next))return[...path,next];if(!seen.has(next)){seen.add(next);queue.push([next,[...path,next]]);}}} return null; }

export function analyzeRealizedContact({plan,attachmentSemantics,glb,fusionArtifacts=[],evidenceRefs=[]}={}){
  const validation=validateRealizedContactPlan(plan,attachmentSemantics); if(!validation.valid) throw new Error(`realized contact plan is invalid: ${validation.errors.join('; ')}`);
  const bytes=Buffer.from(glb??[]),actualSha=sha256(bytes); if(actualSha!==plan.assetSha256) throw new Error('realized contact GLB SHA-256 does not match plan');
  const physical=extractPhysicalMeshes(bytes),byId=new Map(physical.map((mesh)=>[mesh.id,mesh])),actualIds=new Set(byId.keys()),fusionChecks=verifyFusionArtifacts(plan,fusionArtifacts,actualIds),resolvePhysical=semanticPhysicalMap(plan);
  for(const id of [...plan.supportRoots,...plan.supportRequiredEntityIds]) if(!actualIds.has(resolvePhysical(id))) throw new Error(`support entity ${id} resolves to missing physical node ${resolvePhysical(id)}`);
  const expectedPhysicalKeys=new Set(),candidateKeys=new Set();
  for(const expectation of plan.pairExpectations){const a=resolvePhysical(expectation.subjectId),b=resolvePhysical(expectation.ownerId);if(a!==b){expectedPhysicalKeys.add(pairKey(a,b));candidateKeys.add(pairKey(a,b));}}
  for(let i=0;i<physical.length;i+=1)for(let j=i+1;j<physical.length;j+=1)if(Math.sqrt(boundsGapSq(physical[i].bounds,physical[j].bounds))<=plan.broadPhaseMargin+EPS)candidateKeys.add(pairKey(physical[i].id,physical[j].id));
  const measurements=[]; for(const key of [...candidateKeys].sort()){const[a,b]=key.split('::'),ma=byId.get(a),mb=byId.get(b);if(!ma||!mb)throw new Error(`expected realized pair ${key} is missing from GLB`);measurements.push(pairMeasurement(ma,mb,plan));}
  const measurementByKey=new Map(measurements.map((entry)=>[pairKey(entry.aId,entry.bId),entry]));
  const expectationResults=plan.pairExpectations.map((expectation)=>evaluateExpectation(expectation,measurementByKey.get(pairKey(resolvePhysical(expectation.subjectId),resolvePhysical(expectation.ownerId))),resolvePhysical,plan.fusionBindings,plan));
  const supportEdges=expectationResults.filter((result)=>result.kind==='SUPPORT'&&result.pass&&result.subjectPhysicalId!==result.ownerPhysicalId).map((result)=>({expectationId:result.id,subjectPhysicalId:result.subjectPhysicalId,ownerPhysicalId:result.ownerPhysicalId}));
  const physicalRoots=uniqueStrings(plan.supportRoots.map(resolvePhysical)),requiredPhysical=uniqueStrings(plan.supportRequiredEntityIds.map(resolvePhysical));
  const supportChecks=requiredPhysical.map((entityId)=>{const path=supportPath(entityId,physicalRoots,supportEdges);return{physicalEntityId:entityId,path,pass:Boolean(path)};});
  const coveredKeys=new Set(expectationResults.filter((result)=>result.subjectPhysicalId!==result.ownerPhysicalId).map((result)=>pairKey(result.subjectPhysicalId,result.ownerPhysicalId)));
  const unexpectedContacts=measurements.filter((entry)=>!coveredKeys.has(pairKey(entry.aId,entry.bId))&&(entry.type==='CONTACT'||entry.type==='PENETRATION')).map((entry)=>({...entry,blocking:entry.type==='PENETRATION'||plan.unexpectedContactPolicy==='BLOCK'}));
  const penetrations=measurements.filter((entry)=>entry.type==='PENETRATION').map((entry)=>({...entry,coveredByExpectation:coveredKeys.has(pairKey(entry.aId,entry.bId))}));
  const nodes=physical.map((mesh)=>({physicalEntityId:mesh.id,semanticEntityIds:uniqueStrings([mesh.id,...plan.fusionBindings.filter((binding)=>binding.physicalEntityId===mesh.id).flatMap((binding)=>binding.semanticMemberIds)]),bounds:mesh.bounds,vertices:mesh.vertices.length,triangles:mesh.triangles.length}));
  const graphPayload={schema:REALIZED_CONTACT_GRAPH_SCHEMA,planDigest:plan.planDigest,assetSha256:plan.assetSha256,nodes,edges:measurements,fusionChecks,broadPhase:{margin:plan.broadPhaseMargin,candidatePairs:candidateKeys.size,totalPossiblePairs:physical.length*(physical.length-1)/2,authority:'candidate-discovery-only'},metrics:{physicalNodes:physical.length,contactEdges:measurements.filter((e)=>e.type==='CONTACT').length,clearanceEdges:measurements.filter((e)=>e.type==='CLEARANCE').length,penetrationEdges:penetrations.length},evidenceRefs:uniqueStrings(evidenceRefs)};
  const graph=deepFreeze({...graphPayload,graphDigest:digestJson(graphPayload)});
  const blockers=[]; for(const result of expectationResults)if(!result.pass)blockers.push(`EXPECTATION:${result.id}`);for(const check of supportChecks)if(!check.pass)blockers.push(`UNSUPPORTED:${check.physicalEntityId}`);for(const entry of unexpectedContacts)if(entry.blocking)blockers.push(`${entry.type}:${pairKey(entry.aId,entry.bId)}`);
  const reportPayload={schema:REALIZED_CONTACT_REPORT_SCHEMA,planDigest:plan.planDigest,graphDigest:graph.graphDigest,assetSha256:plan.assetSha256,status:blockers.length?'BLOCKED':'PASS',blockers:uniqueStrings(blockers),expectationResults,supportRoots:physicalRoots,supportChecks,unsupportedPhysicalEntityIds:supportChecks.filter((check)=>!check.pass).map((check)=>check.physicalEntityId),unexpectedContacts,penetrations,evidenceRefs:uniqueStrings(evidenceRefs),policy:{supportRequiresRealizedPathToExplicitRoot:true,unexpectedPenetrationAlwaysBlocks:true,unexpectedContactPolicy:plan.unexpectedContactPolicy,graphDoesNotAuthorizeClosure:true}};
  const report=deepFreeze({...reportPayload,reportDigest:digestJson(reportPayload)}); return deepFreeze({graph,report});
}

export function validateRealizedContactResult(value,{plan,attachmentSemantics,glb,fusionArtifacts=[]}={}){const errors=[];try{const recreated=analyzeRealizedContact({plan,attachmentSemantics,glb,fusionArtifacts,evidenceRefs:value?.report?.evidenceRefs});if(digestJson(recreated.graph)!==digestJson(value?.graph))errors.push('realized contact graph mismatch');if(digestJson(recreated.report)!==digestJson(value?.report))errors.push('realized contact report mismatch');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}

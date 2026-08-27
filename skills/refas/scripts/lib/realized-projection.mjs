import {assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {createProjectionFit, validateProjectionFit} from './projection-fit.mjs';

export const REALIZED_PROJECTION_SCHEMA = 'refas.realized-projection/v1';

const EPS = 1e-9;
const v3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite [x, y, z] vector`);
  return value.map(Number);
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(...a);
const normalize = (a, label) => {
  const length = norm(a);
  if (!(length > EPS)) throw new Error(`${label} must have non-zero length`);
  return a.map((v) => v / length);
};

function identity4() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

function multiply4(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out;
}

function trsMatrix(node) {
  if (node?.matrix) {
    if (!Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) throw new Error('glTF node.matrix must contain 16 finite values');
    return node.matrix.map(Number);
  }
  const t = node?.translation ?? [0, 0, 0];
  const r = node?.rotation ?? [0, 0, 0, 1];
  const s = node?.scale ?? [1, 1, 1];
  v3(t, 'glTF node.translation'); v3(s, 'glTF node.scale');
  if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite)) throw new Error('glTF node.rotation must be a finite quaternion');
  const qn = Math.hypot(...r);
  if (!(qn > EPS)) throw new Error('glTF node.rotation quaternion must have non-zero length');
  const [x, y, z, w] = r.map((value) => value / qn);
  const [sx, sy, sz] = s;
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
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
  ];
}

function worldMatrices(json) {
  const nodes = json.nodes ?? [];
  const parent = new Array(nodes.length).fill(null);
  nodes.forEach((node, parentIndex) => {
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodes.length) throw new Error(`glTF node ${parentIndex} references an invalid child`);
      if (parent[child] != null) throw new Error(`glTF node ${child} has multiple parents`);
      parent[child] = parentIndex;
    }
  });
  const state = new Array(nodes.length).fill(0);
  const world = new Array(nodes.length);
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
  (json.nodes ?? []).forEach((node, index) => {
    if (node?.extras?.refasPartId === nodeId || node?.name === nodeId) matches.push(index);
  });
  if (!matches.length) throw new Error(`realized binding references unknown GLB node: ${nodeId}`);
  if (matches.length > 1) throw new Error(`realized binding is ambiguous because GLB node ID is duplicated: ${nodeId}`);
  return matches[0];
}

export function normalizeProjectionCamera(raw = {}) {
  const projection = String(raw.projection ?? 'perspective').toLowerCase();
  if (!['perspective', 'orthographic'].includes(projection)) throw new Error('camera.projection must be perspective or orthographic');
  const position = v3(raw.position, 'camera.position');
  const target = v3(raw.target, 'camera.target');
  const upInput = normalize(v3(raw.up ?? [0,1,0], 'camera.up'), 'camera.up');
  const forward = normalize(sub(target, position), 'camera view direction');
  const right = normalize(cross(forward, upInput), 'camera right axis');
  const up = normalize(cross(right, forward), 'camera orthogonal up axis');
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
  const camera = normalizeProjectionCamera(cameraInput);
  const point = v3(worldPoint, 'worldPoint');
  const delta = sub(point, camera.position);
  const x = dot(delta, camera.basis.right);
  const y = dot(delta, camera.basis.up);
  const depth = dot(delta, camera.basis.forward);
  if (!(depth > EPS)) throw new Error('bound point lies on or behind the camera plane');
  let xNdc, yNdc;
  if (camera.projection === 'perspective') {
    const halfHeight = Math.tan(camera.fovY * Math.PI / 360) * depth;
    xNdc = x / (halfHeight * camera.aspect);
    yNdc = y / halfHeight;
  } else {
    xNdc = x / (camera.orthoHeight * camera.aspect / 2);
    yNdc = y / (camera.orthoHeight / 2);
  }
  return deepFreeze({xy: [(xNdc + 1) / 2, (1 - yNdc) / 2], depth, insideFrame: Math.abs(xNdc) <= 1 && Math.abs(yNdc) <= 1});
}

export function createRealizedProjection({
  referenceGeometry,
  glb,
  cameraHypothesisId,
  camera,
  anchorBindings = [],
  evidenceRefs = [],
} = {}) {
  const bytes = Buffer.from(glb ?? []);
  if (!bytes.length) throw new Error('realized projection requires actual GLB bytes');
  const {json} = parseGlb(bytes);
  const matrices = worldMatrices(json);
  const normalizedCamera = normalizeProjectionCamera(camera);
  const assetSha256 = digestBytes(bytes);
  const cameraDigest = digestJson(normalizedCamera);
  const seen = new Set();
  const derived = anchorBindings.map((raw, index) => {
    const referenceId = assertId(raw?.referenceId, `anchorBindings[${index}].referenceId`);
    if (seen.has(referenceId)) throw new Error(`duplicate realized anchor binding: ${referenceId}`);
    seen.add(referenceId);
    const nodeId = assertId(raw?.nodeId, `anchorBindings[${index}].nodeId`);
    const localPoint = v3(raw?.localPoint ?? [0,0,0], `anchorBindings[${index}].localPoint`);
    const nodeIndex = nodeIndexBySemanticId(json, nodeId);
    const worldPoint = transformPoint(matrices[nodeIndex], localPoint);
    const projection = projectWorldPoint(normalizedCamera, worldPoint);
    return {referenceId, nodeId, nodeIndex, localPoint, worldPoint, projectedXY: projection.xy, cameraDepth: projection.depth, insideFrame: projection.insideFrame};
  });
  const modelBindings = derived.map(({referenceId, nodeId, localPoint}) => ({referenceId, nodeId, localPoint}));
  const modelBindingDigest = digestJson({assetSha256, modelBindings});

  // createProjectionFit currently requires projected points to lie in the source frame.
  // Fail loudly rather than clamp: clamping would hide a macro reconstruction error.
  const outside = derived.filter((item) => !item.insideFrame);
  if (outside.length) throw new Error(`realized projection places source-bound anchors outside the camera frame: ${outside.map((item) => item.referenceId).join(', ')}`);

  const fit = createProjectionFit({
    referenceGeometry,
    cameraHypothesisId,
    cameraDigest,
    modelBindingDigest,
    anchorProjections: derived.map((item) => ({
      referenceId: item.referenceId,
      projectedXY: item.projectedXY,
      binding: {kind: 'node-local-point', nodeId: item.nodeId, localPoint: item.localPoint},
      evidenceRefs,
    })),
    evidenceRefs,
  });
  const fitValidation = validateProjectionFit(fit);
  if (!fitValidation.valid) throw new Error(`derived projection fit is invalid: ${fitValidation.errors.join('; ')}`);
  const payload = {
    schema: REALIZED_PROJECTION_SCHEMA,
    scopeId: fit.scopeId,
    sourceSha256: fit.sourceSha256,
    assetSha256,
    cameraHypothesisId: fit.cameraHypothesisId,
    camera: normalizedCamera,
    cameraDigest,
    modelBindingDigest,
    derivedAnchors: derived,
    projectionFit: fit,
    projectionFitDigest: fit.projectionFitDigest,
    evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(),
    policy: {
      projectedCoordinatesDerivedFromRealizedGlb: true,
      glbHierarchyAndNodeTransformsAreAuthoritative: true,
      cameraParametersAreDigestBound: true,
      callerCannotSupplyProjectedCoordinates: true,
      metricsCannotCertifyVisualFidelity: true,
    },
  };
  return deepFreeze({...payload, realizedProjectionDigest: digestJson(payload)});
}

export function validateRealizedProjection(proof) {
  const errors = [];
  if (proof?.schema !== REALIZED_PROJECTION_SCHEMA) errors.push('invalid schema');
  try {
    if (!validateProjectionFit(proof?.projectionFit).valid) errors.push('embedded projection fit is invalid');
    if (proof?.projectionFitDigest !== proof?.projectionFit?.projectionFitDigest) errors.push('embedded projection fit digest mismatch');
    if (proof?.cameraDigest !== digestJson(proof?.camera)) errors.push('camera digest mismatch');
    if (proof?.projectionFit?.cameraDigest !== proof?.cameraDigest) errors.push('projection fit camera digest is not realized-camera bound');
    if (proof?.projectionFit?.modelBindingDigest !== proof?.modelBindingDigest) errors.push('projection fit model binding digest is not realized-model bound');
    const p = proof?.policy ?? {};
    if (p.projectedCoordinatesDerivedFromRealizedGlb !== true || p.glbHierarchyAndNodeTransformsAreAuthoritative !== true || p.cameraParametersAreDigestBound !== true || p.callerCannotSupplyProjectedCoordinates !== true) errors.push('realized projection authority policy is missing');
    if (p.metricsCannotCertifyVisualFidelity !== true) errors.push('metric authority policy is missing');
    const payload = structuredClone(proof); delete payload.realizedProjectionDigest;
    if (digestJson(payload) !== proof?.realizedProjectionDigest) errors.push('realized projection digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

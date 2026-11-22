import {digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';

export const REALIZED_ASSEMBLY_PROOF_SCHEMA = 'refas.realized-assembly-proof/v1';
const EPS = 1e-9;
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const normalize = (v) => { const length = Math.hypot(...v); if (length <= EPS) throw new Error('frame vector is degenerate'); return v.map((x) => x / length); };
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const sub = (a, b) => a.map((value, index) => value - b[index]);
function assertFiniteTree(value, path = 'proof') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path} is not finite`);
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${path}.${key}`);
}

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
const transformDirection = (m, p) => normalize([m[0]*p[0]+m[4]*p[1]+m[8]*p[2], m[1]*p[0]+m[5]*p[1]+m[9]*p[2], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]]);

function hierarchy(json) {
  const parent = new Map(), world = new Map(), roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  const walk = (index, parentMatrix = identity()) => {
    const node = json.nodes?.[index]; if (!node) throw new Error(`missing GLB node ${index}`);
    const matrix = multiply(parentMatrix, nodeMatrix(node)); world.set(index, matrix);
    for (const child of node.children ?? []) { if (parent.has(child)) throw new Error(`node ${child} has multiple parents`); parent.set(child, index); walk(child, matrix); }
  };
  for (const root of roots) walk(root);
  if (world.size !== (json.nodes?.length ?? 0)) throw new Error('every GLB node must be reachable from the active scene');
  return {parent, world};
}

function frameAt(node, matrix, surfaceId) {
  if (!matrix?.every(Number.isFinite)) throw new Error(`${surfaceId}: world matrix is invalid ${JSON.stringify(matrix)}`);
  const raw = node.extras?.refasContactSurfaces?.[surfaceId];
  if (!raw) throw new Error(`${node.extras?.refasPartId ?? node.name}: missing contact surface ${surfaceId}`);
  if (!Array.isArray(raw.origin) || !Array.isArray(raw.normal) || raw.origin.length !== 3 || raw.normal.length !== 3) throw new Error(`${surfaceId}: invalid contact frame`);
  return {origin: transformPoint(matrix, raw.origin), normal: transformDirection(matrix, raw.normal), supportRadius: Number(raw.supportRadius ?? 0)};
}

export function createRealizedAssemblyProof({glb, modules = [], attachments = [], compositionReports = [], objectIdEvidence = []} = {}) {
  const {json} = parseGlb(glb), graph = hierarchy(json);
  const nodeIndexByPart = new Map(json.nodes.map((node, index) => [node.extras?.refasPartId, index]).filter(([id]) => id));
  const moduleById = new Map(), errors = [], moduleChecks = [];
  for (const module of modules) {
    if (!module?.id || moduleById.has(module.id)) { errors.push('module IDs must be unique'); continue; }
    const index = nodeIndexByPart.get(module.rootPartId), node = json.nodes[index];
    const check = {id: module.id, rootPartId: module.rootPartId, parentModuleId: module.parentModuleId ?? null, rootNodeIndex: index ?? null,
      declaredModuleRoot: node?.extras?.refasModuleRoot === true, parentRelativeTransformStored: Boolean(node && (node.matrix || node.translation || node.rotation || node.scale))};
    if (index == null) errors.push(`${module.id}: module root is absent from GLB`);
    if (node && node.extras?.refasModuleRoot !== true) errors.push(`${module.id}: root node lacks refasModuleRoot`);
    const ownedParts = [...new Set(module.partIds ?? [module.rootPartId])];
    check.meshAncestryPass = ownedParts.every((partId) => {
      let cursor = nodeIndexByPart.get(partId);
      if (cursor == null) return false;
      while (cursor != null) { if (cursor === index) return true; cursor = graph.parent.get(cursor); }
      return false;
    });
    if (!check.meshAncestryPass) errors.push(`${module.id}: not every declared child mesh descends from its module root`);
    moduleById.set(module.id, {...module, index}); moduleChecks.push(check);
  }
  for (const check of moduleChecks) if (check.parentModuleId) {
    const child = moduleById.get(check.id), owner = moduleById.get(check.parentModuleId);
    if (!owner) { errors.push(`${check.id}: unknown parent module ${check.parentModuleId}`); continue; }
    let cursor = graph.parent.get(child.index), found = false;
    while (cursor != null) { if (cursor === owner.index) { found = true; break; } cursor = graph.parent.get(cursor); }
    check.ancestryPass = found;
    if (!found) errors.push(`${check.id}: GLB ancestry does not descend from ${check.parentModuleId}`);
    if (!check.parentRelativeTransformStored) errors.push(`${check.id}: parent-relative local transform is not stored`);
  }
  const attachmentChecks = [];
  for (const attachment of attachments) {
    const child = moduleById.get(attachment.childModuleId), parent = moduleById.get(attachment.parentModuleId);
    if (!child || !parent) { errors.push(`${attachment.id}: attachment references an unknown module`); continue; }
    try {
      const childNode = json.nodes[nodeIndexByPart.get(attachment.childSurface.partId)], parentNode = json.nodes[nodeIndexByPart.get(attachment.parentSurface.partId)];
      if (!childNode || !parentNode) throw new Error('contact surface part is absent from GLB');
      const childFrame = frameAt(childNode, graph.world.get(nodeIndexByPart.get(attachment.childSurface.partId)), attachment.childSurface.surfaceId);
      const parentFrame = frameAt(parentNode, graph.world.get(nodeIndexByPart.get(attachment.parentSurface.partId)), attachment.parentSurface.surfaceId);
      const delta = sub(childFrame.origin, parentFrame.origin), signedClearance = dot(delta, parentFrame.normal);
      const lateralVector = delta.map((value, axis) => value - signedClearance * parentFrame.normal[axis]), lateralOffset = Math.hypot(...lateralVector);
      const normalOpposition = -dot(childFrame.normal, parentFrame.normal), range = attachment.clearanceRange ?? [0, 0], tolerance = Number(attachment.tolerance ?? 0.001);
      const clearancePass = signedClearance >= Number(range[0]) - tolerance && signedClearance <= Number(range[1]) + tolerance;
      const lateralPass = lateralOffset <= Math.min(childFrame.supportRadius || Infinity, parentFrame.supportRadius || Infinity) + tolerance;
      const normalPass = normalOpposition >= Number(attachment.minimumNormalOpposition ?? 0.95);
      const penetrationDepth = Math.max(0, Number(range[0]) - signedClearance - tolerance);
      const pass = clearancePass && lateralPass && normalPass && penetrationDepth <= EPS;
      if (!pass) errors.push(`${attachment.id}: realized contact failed (clearance ${signedClearance.toFixed(6)}, lateral ${lateralOffset.toFixed(6)}, opposition ${normalOpposition.toFixed(6)})`);
      attachmentChecks.push({id: attachment.id, childModuleId: attachment.childModuleId, parentModuleId: attachment.parentModuleId, childFrame, parentFrame, signedClearance, lateralOffset, normalOpposition, penetrationDepth, clearancePass, lateralPass, normalPass, supportDerivedFromContact: pass, pass});
    } catch (error) { errors.push(`${attachment.id}: ${error.message}`); }
  }
  const reportByPart = new Map(compositionReports.map((report) => [report.partId, report]));
  const immutableChildChecks = modules.filter((module) => module.closedChildSha256).map((module) => {
    const report = reportByPart.get(module.rootPartId), pass = report?.sourceGlbSha256 === module.closedChildSha256 && report?.sourceBinaryPrefixPreserved === true;
    if (!pass) errors.push(`${module.id}: immutable child composition evidence failed`);
    return {moduleId: module.id, pass};
  });
  const ids = new Set(objectIdEvidence), objectIdPass = modules.every((module) => ids.has(module.rootPartId));
  if (!objectIdPass) errors.push('object-ID evidence does not separate every detachable module root');
  const payload = {schema: REALIZED_ASSEMBLY_PROOF_SCHEMA, valid: errors.length === 0, errors, moduleChecks, attachmentChecks, immutableChildChecks,
    objectIdCheck: {partIds: [...ids].sort(), pass: objectIdPass}, metrics: {modules: modules.length, nestedLevels: Math.max(0, ...moduleChecks.map((check) => { let depth = 1, cursor = check; while (cursor.parentModuleId) { depth += 1; cursor = moduleChecks.find((candidate) => candidate.id === cursor.parentModuleId) ?? {}; } return depth; })), attachments: attachments.length, failures: errors.length}};
  assertFiniteTree(payload);
  return Object.freeze({...payload, proofDigest: digestJson(payload)});
}

export function validateRealizedAssemblyProof(proof) {
  const payload = structuredClone(proof ?? {}), digest = payload.proofDigest; delete payload.proofDigest;
  const errors = [];
  if (proof?.schema !== REALIZED_ASSEMBLY_PROOF_SCHEMA) errors.push('invalid schema');
  if (proof?.valid !== true || proof?.errors?.length) errors.push('realized assembly proof contains failures');
  if (!proof?.moduleChecks?.every((check) => check.declaredModuleRoot && check.meshAncestryPass && (!check.parentModuleId || (check.ancestryPass && check.parentRelativeTransformStored)))) errors.push('module root or ancestry proof failed');
  if (!proof?.attachmentChecks?.every((check) => check.pass && check.supportDerivedFromContact && check.penetrationDepth <= EPS)) errors.push('geometric contact proof failed');
  if (!proof?.immutableChildChecks?.every((check) => check.pass)) errors.push('immutable child proof failed');
  if (proof?.objectIdCheck?.pass !== true) errors.push('object-ID separation proof failed');
  if (digestJson(payload) !== digest) errors.push('proof digest mismatch');
  return {valid: errors.length === 0, errors};
}

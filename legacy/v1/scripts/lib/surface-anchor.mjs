import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';

export const SURFACE_ANCHOR_SET_SCHEMA = 'refas.surface-anchor-set/v1';
export const SURFACE_ANCHOR_REBIND_SCHEMA = 'refas.surface-anchor-rebind/v1';

const SURFACE_MODES = new Set(['SURFACE_OFFSET', 'MULTI_ANCHOR', 'SUPPORTED_CLEARANCE']);
const EPS = 1e-9;
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function finiteNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}

function vec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain 3 numbers`);
  return value.map((item, index) => finiteNumber(item, `${label}[${index}]`));
}

const add = (a, b) => a.map((value, i) => value + b[i]);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const mul = (a, scalar) => a.map((value) => value * scalar);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.sqrt(dot(a, a));
const distance = (a, b) => length(sub(a, b));

function normalize(vector, label) {
  const magnitude = length(vector);
  if (!(magnitude > EPS)) throw new Error(`${label} must have non-zero length`);
  return mul(vector, 1 / magnitude);
}

function normalizeBarycentric(value, label) {
  const bary = vec3(value, label);
  if (bary.some((item) => item < -EPS || item > 1 + EPS)) throw new Error(`${label} values must lie in [0, 1]`);
  const sum = bary.reduce((acc, item) => acc + item, 0);
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`${label} must sum to 1`);
  return bary.map((item) => Math.max(0, Math.min(1, item / sum)));
}

function normalizeSurface(raw, index) {
  const ownerId = assertId(raw?.ownerId, `surfaces[${index}].ownerId`);
  const geometryDigest = assertDigest(raw?.geometryDigest, `surfaces[${index}].geometryDigest`);
  if (!Array.isArray(raw?.vertices) || raw.vertices.length < 3) throw new Error(`surfaces[${index}].vertices requires at least 3 points`);
  const vertices = raw.vertices.map((point, pointIndex) => vec3(point, `surfaces[${index}].vertices[${pointIndex}]`));
  if (!Array.isArray(raw?.triangles) || !raw.triangles.length) throw new Error(`surfaces[${index}].triangles requires at least one triangle`);
  const triangleIds = new Set();
  const triangles = raw.triangles.map((triangle, triangleIndex) => {
    const id = assertId(triangle?.id, `surfaces[${index}].triangles[${triangleIndex}].id`);
    if (triangleIds.has(id)) throw new Error(`surfaces[${index}] triangle IDs must be unique`);
    triangleIds.add(id);
    const patchId = assertId(triangle?.patchId, `surfaces[${index}].triangles[${triangleIndex}].patchId`);
    if (!Array.isArray(triangle?.indices) || triangle.indices.length !== 3) throw new Error(`surfaces[${index}].triangles[${triangleIndex}].indices must contain 3 indices`);
    const indices = triangle.indices.map((value) => Number(value));
    if (indices.some((value) => !Number.isInteger(value) || value < 0 || value >= vertices.length)) throw new Error(`surfaces[${index}].triangles[${triangleIndex}] contains an invalid vertex index`);
    if (new Set(indices).size !== 3) throw new Error(`surfaces[${index}].triangles[${triangleIndex}] must reference 3 distinct vertices`);
    const [a, b, c] = indices.map((vertexIndex) => vertices[vertexIndex]);
    if (length(cross(sub(b, a), sub(c, a))) <= EPS) throw new Error(`surfaces[${index}].triangles[${triangleIndex}] is degenerate`);
    return {id, patchId, indices};
  });
  const descriptor = {ownerId, geometryDigest, vertices, triangles};
  return {...descriptor, surfaceDigest: digestJson(descriptor)};
}

function normalizeSurfaces(surfaces = []) {
  const normalized = surfaces.map(normalizeSurface);
  const ids = normalized.map((surface) => surface.ownerId);
  if (new Set(ids).size !== ids.length) throw new Error('surface owner IDs must be unique');
  return new Map(normalized.map((surface) => [surface.ownerId, surface]));
}

function triangleFor(surface, triangleId, patchId) {
  const triangle = surface.triangles.find((item) => item.id === triangleId);
  if (!triangle) throw new Error(`surface ${surface.ownerId} does not contain triangle ${triangleId}`);
  if (triangle.patchId !== patchId) throw new Error(`triangle ${triangleId} is not in semantic patch ${patchId}`);
  return triangle;
}

function triangleFrame(surface, triangle, barycentric, tangentHint, offset) {
  const [a, b, c] = triangle.indices.map((index) => surface.vertices[index]);
  const position = [0, 1, 2].map((axis) => a[axis] * barycentric[0] + b[axis] * barycentric[1] + c[axis] * barycentric[2]);
  const normal = normalize(cross(sub(b, a), sub(c, a)), 'surface normal');
  const hint = normalize(tangentHint, 'tangentHint');
  const projected = sub(hint, mul(normal, dot(hint, normal)));
  const tangent = length(projected) > EPS ? normalize(projected, 'projected tangentHint') : normalize(sub(b, a), 'triangle edge tangent');
  const bitangent = normalize(cross(normal, tangent), 'surface bitangent');
  const offsetPosition = add(position, mul(normal, offset));
  return {position, normal, tangent, bitangent, offsetPosition};
}

function relationMap(attachmentSemantics) {
  return new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation]));
}

function normalizeAnchorSpec(raw, index, attachmentSemantics, surfacesByOwner) {
  const label = `anchors[${index}]`;
  if (raw && ('worldPosition' in raw || 'worldCoordinate' in raw || 'worldXYZ' in raw)) throw new Error(`${label} may not use a world-coordinate-only locator`);
  const id = assertId(raw?.id, `${label}.id`);
  const relationId = assertId(raw?.relationId, `${label}.relationId`);
  const subjectAnchorId = assertId(raw?.subjectAnchorId, `${label}.subjectAnchorId`);
  const ownerId = assertId(raw?.ownerId, `${label}.ownerId`);
  const patchId = assertId(raw?.patchId, `${label}.patchId`);
  const triangleId = assertId(raw?.triangleId, `${label}.triangleId`);
  const relation = relationMap(attachmentSemantics).get(relationId);
  if (!relation) throw new Error(`${label}.relationId references an unknown attachment relation`);
  if (!SURFACE_MODES.has(relation.mode)) throw new Error(`${label} relation mode ${relation.mode} does not use a surface anchor frame`);
  if (!relation.ownerIds.includes(ownerId)) throw new Error(`${label}.ownerId is not an owner declared by relation ${relationId}`);
  const surface = surfacesByOwner.get(ownerId);
  if (!surface) throw new Error(`${label}.ownerId has no supplied owner surface`);
  const barycentric = normalizeBarycentric(raw?.barycentric, `${label}.barycentric`);
  const tangentHint = vec3(raw?.tangentHint, `${label}.tangentHint`);
  normalize(tangentHint, `${label}.tangentHint`);
  const offset = finiteNumber(raw?.offset ?? 0, `${label}.offset`);
  const maxRebindDistance = finiteNumber(raw?.maxRebindDistance, `${label}.maxRebindDistance`);
  if (!(maxRebindDistance > 0)) throw new Error(`${label}.maxRebindDistance must be > 0`);
  const maxNormalDeviationRadians = finiteNumber(raw?.maxNormalDeviationRadians, `${label}.maxNormalDeviationRadians`);
  if (!(maxNormalDeviationRadians > 0 && maxNormalDeviationRadians <= Math.PI)) throw new Error(`${label}.maxNormalDeviationRadians must be in (0, pi]`);
  const evidenceRefs = uniqueStrings(raw?.evidenceRefs);
  if (!evidenceRefs.length) throw new Error(`${label}.evidenceRefs requires at least one reference`);
  const triangle = triangleFor(surface, triangleId, patchId);
  const frame = triangleFrame(surface, triangle, barycentric, tangentHint, offset);
  return {
    id,
    relationId,
    subjectAnchorId,
    ownerId,
    patchId,
    triangleId,
    barycentric,
    tangentHint,
    offset,
    maxRebindDistance,
    maxNormalDeviationRadians,
    ownerGeometryDigest: surface.geometryDigest,
    ownerSurfaceDigest: surface.surfaceDigest,
    frame,
    evidenceRefs,
  };
}

function anchorSpecFromArtifact(anchor) {
  return {
    id: anchor.id,
    relationId: anchor.relationId,
    subjectAnchorId: anchor.subjectAnchorId,
    ownerId: anchor.ownerId,
    patchId: anchor.patchId,
    triangleId: anchor.triangleId,
    barycentric: anchor.barycentric,
    tangentHint: anchor.tangentHint,
    offset: anchor.offset,
    maxRebindDistance: anchor.maxRebindDistance,
    maxNormalDeviationRadians: anchor.maxNormalDeviationRadians,
    evidenceRefs: anchor.evidenceRefs,
  };
}

export function createSurfaceAnchorSet({attachmentSemantics, surfaces = [], anchors = [], evidenceRefs = []} = {}) {
  const semanticsValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!semanticsValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticsValidation.errors.join('; ')}`);
  if (!anchors.length) throw new Error('surface anchor set requires at least one anchor');
  const surfacesByOwner = normalizeSurfaces(surfaces);
  const normalizedAnchors = anchors.map((anchor, index) => normalizeAnchorSpec(anchor, index, attachmentSemantics, surfacesByOwner));
  if (new Set(normalizedAnchors.map((anchor) => anchor.id)).size !== normalizedAnchors.length) throw new Error('surface anchor IDs must be unique');
  const payload = {
    schema: SURFACE_ANCHOR_SET_SCHEMA,
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    anchors: normalizedAnchors.sort((a, b) => a.id.localeCompare(b.id)),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      anchorsAreOwnerLocal: true,
      worldCoordinatesAreNotCanonicalAnchors: true,
      semanticPatchRequired: true,
      barycentricLocatorRequired: true,
      surfaceNormalAndTangentArePartOfFrame: true,
      retessellationMustStayWithinSemanticPatch: true,
      rebindDistanceIsAnchorLocalPolicy: true,
      surfaceAnchorsDoNotMoveDependents: true,
      surfaceAnchorsDoNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, anchorSetDigest: digestJson(payload)});
}

export function validateSurfaceAnchorSet(value, attachmentSemantics = null, surfaces = []) {
  const errors = [];
  try {
    if (value?.schema !== SURFACE_ANCHOR_SET_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required to validate surface anchors');
    const recreated = createSurfaceAnchorSet({
      attachmentSemantics,
      surfaces,
      anchors: (value?.anchors ?? []).map(anchorSpecFromArtifact),
      evidenceRefs: value?.evidenceRefs,
    });
    if (recreated.anchorSetDigest !== value.anchorSetDigest) errors.push('surface anchor set digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('surface anchor set is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function closestPointBarycentric(point, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(point, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return {point: a, barycentric: [1, 0, 0]};
  const bp = sub(point, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return {point: b, barycentric: [0, 1, 0]};
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return {point: add(a, mul(ab, v)), barycentric: [1 - v, v, 0]};
  }
  const cp = sub(point, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return {point: c, barycentric: [0, 0, 1]};
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return {point: add(a, mul(ac, w)), barycentric: [1 - w, 0, w]};
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {point: add(b, mul(sub(c, b), w)), barycentric: [0, 1 - w, w]};
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator, w = vc * denominator;
  return {point: add(add(a, mul(ab, v)), mul(ac, w)), barycentric: [1 - v - w, v, w]};
}

function rebindAnchor(anchor, currentSurface) {
  if (anchor.ownerGeometryDigest === currentSurface.geometryDigest && anchor.ownerSurfaceDigest === currentSurface.surfaceDigest) {
    return {spec: anchorSpecFromArtifact(anchor), status: 'UNCHANGED', distance: 0, previousTriangleId: anchor.triangleId, nextTriangleId: anchor.triangleId};
  }
  const candidates = currentSurface.triangles.filter((triangle) => triangle.patchId === anchor.patchId);
  if (!candidates.length) throw new Error(`semantic patch ${anchor.patchId} is missing on owner ${anchor.ownerId}`);
  const cosLimit = Math.cos(anchor.maxNormalDeviationRadians);
  let best = null;
  for (const triangle of candidates) {
    const [a, b, c] = triangle.indices.map((index) => currentSurface.vertices[index]);
    let normal;
    try { normal = normalize(cross(sub(b, a), sub(c, a)), 'candidate normal'); } catch { continue; }
    if (dot(anchor.frame.normal, normal) < cosLimit) continue;
    const closest = closestPointBarycentric(anchor.frame.position, a, b, c);
    const d = distance(anchor.frame.position, closest.point);
    if (!best || d < best.distance || (Math.abs(d - best.distance) <= EPS && triangle.id.localeCompare(best.triangle.id) < 0)) best = {triangle, ...closest, distance: d};
  }
  if (!best) throw new Error(`semantic patch ${anchor.patchId} has no orientation-compatible triangle for anchor ${anchor.id}`);
  if (best.distance > anchor.maxRebindDistance) throw new Error(`anchor ${anchor.id} rebind distance ${best.distance} exceeds maxRebindDistance ${anchor.maxRebindDistance}`);
  return {
    spec: {...anchorSpecFromArtifact(anchor), triangleId: best.triangle.id, barycentric: best.barycentric},
    status: 'REBOUND',
    distance: best.distance,
    previousTriangleId: anchor.triangleId,
    nextTriangleId: best.triangle.id,
  };
}

function createRebindReport({previousAnchorSet, nextAnchorSet, entries, evidenceRefs = []}) {
  const payload = {
    schema: SURFACE_ANCHOR_REBIND_SCHEMA,
    scopeId: previousAnchorSet.scopeId,
    sourceSha256: previousAnchorSet.sourceSha256,
    attachmentSemanticsDigest: previousAnchorSet.attachmentSemanticsDigest,
    previousAnchorSetDigest: previousAnchorSet.anchorSetDigest,
    nextAnchorSetDigest: nextAnchorSet.anchorSetDigest,
    entries: entries.map((entry) => ({
      anchorId: entry.anchorId,
      ownerId: entry.ownerId,
      status: entry.status,
      previousGeometryDigest: entry.previousGeometryDigest,
      nextGeometryDigest: entry.nextGeometryDigest,
      previousTriangleId: entry.previousTriangleId,
      nextTriangleId: entry.nextTriangleId,
      rebindDistance: entry.distance,
    })).sort((a, b) => a.anchorId.localeCompare(b.anchorId)),
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {
      sameSemanticPatchRequired: true,
      normalDeviationBoundRequired: true,
      rebindDistanceBoundRequired: true,
      rebindDoesNotMoveDependentGeometry: true,
      rebindDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, rebindDigest: digestJson(payload)});
}

export function rebindSurfaceAnchorSet({anchorSet, attachmentSemantics, previousSurfaces = [], currentSurfaces = [], evidenceRefs = []} = {}) {
  const validation = validateSurfaceAnchorSet(anchorSet, attachmentSemantics, previousSurfaces);
  if (!validation.valid) throw new Error(`surface anchor set is invalid: ${validation.errors.join('; ')}`);
  const currentByOwner = normalizeSurfaces(currentSurfaces);
  const specs = [];
  const entries = [];
  for (const anchor of anchorSet.anchors) {
    const currentSurface = currentByOwner.get(anchor.ownerId);
    if (!currentSurface) throw new Error(`current owner surface is missing for ${anchor.ownerId}`);
    const rebound = rebindAnchor(anchor, currentSurface);
    specs.push(rebound.spec);
    entries.push({
      anchorId: anchor.id,
      ownerId: anchor.ownerId,
      status: rebound.status,
      previousGeometryDigest: anchor.ownerGeometryDigest,
      nextGeometryDigest: currentSurface.geometryDigest,
      previousTriangleId: rebound.previousTriangleId,
      nextTriangleId: rebound.nextTriangleId,
      distance: rebound.distance,
    });
  }
  const nextAnchorSet = createSurfaceAnchorSet({attachmentSemantics, surfaces: currentSurfaces, anchors: specs, evidenceRefs: anchorSet.evidenceRefs});
  const report = createRebindReport({previousAnchorSet: anchorSet, nextAnchorSet, entries, evidenceRefs});
  return deepFreeze({anchorSet: nextAnchorSet, report});
}

export function validateSurfaceAnchorRebind(report, {previousAnchorSet, nextAnchorSet, attachmentSemantics, previousSurfaces = [], currentSurfaces = []} = {}) {
  const errors = [];
  try {
    if (report?.schema !== SURFACE_ANCHOR_REBIND_SCHEMA) errors.push('invalid schema');
    const rebound = rebindSurfaceAnchorSet({
      anchorSet: previousAnchorSet,
      attachmentSemantics,
      previousSurfaces,
      currentSurfaces,
      evidenceRefs: report?.evidenceRefs,
    });
    if (rebound.anchorSet.anchorSetDigest !== nextAnchorSet?.anchorSetDigest) errors.push('next surface anchor set digest mismatch');
    if (rebound.report.rebindDigest !== report.rebindDigest) errors.push('surface anchor rebind digest mismatch');
    if (digestJson(rebound.report) !== digestJson(report)) errors.push('surface anchor rebind is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

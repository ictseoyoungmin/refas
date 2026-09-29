import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {finalizeMesh} from './mesh.mjs';
import {createLandmarkCage} from './geometry-backend.mjs';

export const SUBDIVISION_CAGE_ORGANIC_SCHEMA = 'refas.subdivision-cage-organic/v1';

const AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);
const EPS = 1e-10;

const point3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec3`);
  return value.map(Number);
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const average = (points) => mul(points.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
const mix = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const strings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function normalizeAuthority(value, label) {
  const authority = String(value ?? '').trim().toLowerCase();
  if (!AUTHORITIES.has(authority)) throw new Error(`${label} must be observed, inferred, or engineered`);
  return authority;
}

function landmarkMap(landmarkCage) {
  if (landmarkCage == null) return new Map();
  if (landmarkCage?.schema !== 'refas.landmark-cage/v1') throw new Error('landmarkCage must use refas.landmark-cage/v1');
  const expected = createLandmarkCage({
    id: landmarkCage.id,
    landmarks: landmarkCage.landmarks,
    evidenceRefs: landmarkCage.evidenceRefs,
  });
  if (digestJson(expected) !== digestJson(landmarkCage)) throw new Error('landmarkCage is stale or non-canonical');
  return new Map(expected.landmarks.map((landmark) => [landmark.id, landmark]));
}

function normalizeControlVertices(vertices, landmarkCage, evidenceRefs) {
  if (!Array.isArray(vertices) || vertices.length < 4) throw new Error('subdivision cage requires at least four control vertices');
  const landmarks = landmarkMap(landmarkCage);
  const normalized = vertices.map((raw, index) => {
    const id = assertId(raw?.id, `vertices[${index}].id`);
    const landmarkId = raw?.landmarkId == null ? null : assertId(raw.landmarkId, `vertices[${index}].landmarkId`);
    const landmark = landmarkId == null ? null : landmarks.get(landmarkId);
    if (landmarkId != null && !landmark) throw new Error(`vertices[${index}] references unknown landmark ${landmarkId}`);
    const rawPoint = raw?.point == null ? null : point3(raw.point, `vertices[${index}].point`);
    const landmarkPoint = landmark == null ? null : point3(landmark.point, `landmark ${landmarkId}.point`);
    if (rawPoint == null && landmarkPoint == null) throw new Error(`vertices[${index}] requires point or landmarkId`);
    if (rawPoint != null && landmarkPoint != null && rawPoint.some((value, axis) => Math.abs(value - landmarkPoint[axis]) > EPS)) {
      throw new Error(`vertices[${index}] point does not match landmark ${landmarkId}`);
    }
    const authority = normalizeAuthority(raw?.authority ?? landmark?.authority, `vertices[${index}].authority`);
    if (landmark?.authority != null) {
      const landmarkAuthority = normalizeAuthority(landmark.authority, `landmark ${landmarkId}.authority`);
      if (authority !== landmarkAuthority) throw new Error(`vertices[${index}] authority must match bound landmark ${landmarkId}`);
    }
    const refs = strings([
      ...(landmark?.evidenceRefs ?? []),
      ...((raw?.evidenceRefs ?? (landmark ? [] : evidenceRefs)) ?? []),
    ]);
    if (!refs.length) throw new Error(`vertices[${index}].evidenceRefs requires at least one value`);
    return {
      id,
      point: rawPoint ?? landmarkPoint,
      authority,
      landmarkId,
      evidenceRefs: refs,
    };
  });
  if (new Set(normalized.map((vertex) => vertex.id)).size !== normalized.length) throw new Error('subdivision cage vertex IDs must be unique');
  return normalized.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeFaces(faces, vertexIds) {
  if (!Array.isArray(faces) || faces.length < 4) throw new Error('subdivision cage requires at least four faces');
  const normalizedFaces = faces.map((raw, index) => {
    const ids = Array.isArray(raw) ? raw : raw?.vertices;
    if (!Array.isArray(ids) || ids.length < 3) throw new Error(`faces[${index}] requires at least three vertices`);
    const normalized = ids.map((id, vertexIndex) => assertId(id, `faces[${index}].vertices[${vertexIndex}]`));
    if (new Set(normalized).size !== normalized.length) throw new Error(`faces[${index}] repeats a vertex`);
    for (const id of normalized) if (!vertexIds.has(id)) throw new Error(`faces[${index}] references unknown vertex ${id}`);
    const rotations = normalized.map((_, offset) => [...normalized.slice(offset), ...normalized.slice(0, offset)]);
    rotations.sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
    return rotations[0];
  });
  const keys = normalizedFaces.map((face) => face.join('\u0000'));
  if (new Set(keys).size !== keys.length) throw new Error('subdivision cage faces must be unique');
  return normalizedFaces.sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
}

function validateClosedControlTopology(faces) {
  const edges = new Map();
  const facesByVertex = new Map();
  for (const [faceIndex, face] of faces.entries()) {
    for (const id of face) {
      const list = facesByVertex.get(id) ?? [];
      list.push(faceIndex);
      facesByVertex.set(id, list);
    }
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index], b = face[(index + 1) % face.length];
      const key = edgeKey(a, b);
      const record = edges.get(key) ?? {key, a: a < b ? a : b, b: a < b ? b : a, faces: [], balance: 0};
      record.faces.push(faceIndex);
      record.balance += a < b ? 1 : -1;
      edges.set(key, record);
    }
  }
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2) throw new Error(`subdivision cage edge ${edge.key} is not closed manifold`);
    if (edge.balance !== 0) throw new Error(`subdivision cage edge ${edge.key} has inconsistent face winding`);
  }
  for (const [vertexId, incidentFaces] of facesByVertex.entries()) {
    const adjacency = new Map(incidentFaces.map((faceIndex) => [faceIndex, new Set()]));
    for (const edge of edges.values()) {
      if (edge.a !== vertexId && edge.b !== vertexId) continue;
      const [a, b] = edge.faces;
      if (adjacency.has(a) && adjacency.has(b)) {
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
      }
    }
    if ([...adjacency.values()].some((neighbors) => neighbors.size !== 2)) {
      throw new Error(`subdivision cage vertex ${vertexId} does not have one closed manifold face-star`);
    }
    const visited = new Set();
    const stack = [incidentFaces[0]];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adjacency.get(current) ?? []) if (!visited.has(neighbor)) stack.push(neighbor);
    }
    if (visited.size !== incidentFaces.length) {
      throw new Error(`subdivision cage vertex ${vertexId} has a disconnected bow-tie face-star`);
    }
  }
  return edges;
}

function normalizeCreases(creases, controlEdges, vertexIds) {
  const byKey = new Map();
  for (const [index, raw] of (creases ?? []).entries()) {
    const pair = raw?.vertices ?? [raw?.a, raw?.b];
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`creases[${index}] requires two vertices`);
    const a = assertId(pair[0], `creases[${index}].vertices[0]`);
    const b = assertId(pair[1], `creases[${index}].vertices[1]`);
    if (a === b || !vertexIds.has(a) || !vertexIds.has(b)) throw new Error(`creases[${index}] references invalid vertices`);
    const key = edgeKey(a, b);
    if (!controlEdges.has(key)) throw new Error(`creases[${index}] is not a control-cage edge`);
    const weight = Number(raw?.weight ?? 1);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`creases[${index}].weight must be in [0,1]`);
    if (byKey.has(key)) throw new Error(`duplicate subdivision crease ${key}`);
    byKey.set(key, {vertices: [a, b], weight});
  }
  return [...byKey.values()].sort((a, b) => edgeKey(...a.vertices).localeCompare(edgeKey(...b.vertices)));
}

function topologyFor(vertices, faces, creaseWeights) {
  const points = new Map(vertices.map((vertex) => [vertex.id, vertex.point]));
  const edges = validateClosedControlTopology(faces);
  for (const edge of edges.values()) edge.weight = creaseWeights.get(edge.key) ?? 0;
  const incidentFaces = new Map(vertices.map((vertex) => [vertex.id, []]));
  const incidentEdges = new Map(vertices.map((vertex) => [vertex.id, []]));
  for (const [faceIndex, face] of faces.entries()) for (const id of face) incidentFaces.get(id).push(faceIndex);
  for (const edge of edges.values()) {
    incidentEdges.get(edge.a).push(edge);
    incidentEdges.get(edge.b).push(edge);
  }
  return {points, edges, incidentFaces, incidentEdges};
}

function subdivideOnce(vertices, faces, creaseWeights, level) {
  const topology = topologyFor(vertices, faces, creaseWeights);
  const facePoints = faces.map((face) => average(face.map((id) => topology.points.get(id))));
  const edgePointIds = new Map();
  const edgePoints = [];
  for (const edge of [...topology.edges.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const p0 = topology.points.get(edge.a), p1 = topology.points.get(edge.b);
    const smooth = average([p0, p1, facePoints[edge.faces[0]], facePoints[edge.faces[1]]]);
    const sharp = average([p0, p1]);
    const id = `l${level}.e.${edge.a}.${edge.b}`;
    edgePointIds.set(edge.key, id);
    edgePoints.push({id, point: mix(smooth, sharp, edge.weight)});
  }

  const movedVertices = vertices.map((vertex) => {
    const p = topology.points.get(vertex.id);
    const faceIndices = topology.incidentFaces.get(vertex.id);
    const incident = [...topology.incidentEdges.get(vertex.id)].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
    const n = faceIndices.length;
    const favg = average(faceIndices.map((index) => facePoints[index]));
    const ravg = average(incident.map((edge) => average([topology.points.get(edge.a), topology.points.get(edge.b)])));
    const smooth = mul(add(add(favg, mul(ravg, 2)), mul(p, n - 3)), 1 / n);
    const sharpEdges = incident.filter((edge) => edge.weight > 0);
    let point = smooth;
    if (sharpEdges.length >= 3) {
      point = mix(smooth, p, sharpEdges[2].weight);
    } else if (sharpEdges.length === 2) {
      const neighbors = sharpEdges.map((edge) => topology.points.get(edge.a === vertex.id ? edge.b : edge.a));
      const creasePoint = mul(add(add(mul(p, 6), neighbors[0]), neighbors[1]), 1 / 8);
      point = mix(smooth, creasePoint, Math.min(sharpEdges[0].weight, sharpEdges[1].weight));
    }
    return {id: vertex.id, point};
  });

  const facePointVertices = facePoints.map((point, index) => ({id: `l${level}.f.${index}`, point}));
  const newFaces = [];
  for (const [faceIndex, face] of faces.entries()) {
    const facePointId = facePointVertices[faceIndex].id;
    for (let index = 0; index < face.length; index += 1) {
      const current = face[index];
      const next = face[(index + 1) % face.length];
      const previous = face[(index - 1 + face.length) % face.length];
      newFaces.push([
        current,
        edgePointIds.get(edgeKey(current, next)),
        facePointId,
        edgePointIds.get(edgeKey(previous, current)),
      ]);
    }
  }

  const nextCreases = new Map();
  for (const edge of topology.edges.values()) {
    if (!(edge.weight > 0)) continue;
    const ep = edgePointIds.get(edge.key);
    nextCreases.set(edgeKey(edge.a, ep), edge.weight);
    nextCreases.set(edgeKey(ep, edge.b), edge.weight);
  }
  const nextVertices = [...movedVertices, ...edgePoints, ...facePointVertices];
  return {vertices: nextVertices, faces: newFaces, creaseWeights: nextCreases};
}

function triangulateFaces(vertices, faces) {
  const indexById = new Map(vertices.map((vertex, index) => [vertex.id, index]));
  const indices = [];
  for (const face of faces) {
    if (face.length !== 4) throw new Error('subdivision output face must be a quad');
    const [a, b, c, d] = face.map((id) => indexById.get(id));
    indices.push(a, b, c, a, c, d);
  }
  return {positions: vertices.map((vertex) => vertex.point), indices};
}

function realizeNormalizedCage(controlVertices, controlFaces, normalizedCreases, subdivisionLevels, role = 'subdivision-cage-organic') {
  const creaseWeights = new Map(normalizedCreases.map((crease) => [edgeKey(...crease.vertices), crease.weight]));
  let state = {
    vertices: controlVertices.map((vertex) => ({id: vertex.id, point: vertex.point})),
    faces: controlFaces,
    creaseWeights,
  };
  for (let level = 1; level <= subdivisionLevels; level += 1) state = subdivideOnce(state.vertices, state.faces, state.creaseWeights, level);
  const triangleMesh = triangulateFaces(state.vertices, state.faces);
  return finalizeMesh(triangleMesh.positions, triangleMesh.indices, {
    role,
    backend: 'catmull-clark',
    subdivisionLevels,
    semanticParameterIds: [
      ...controlVertices.map((vertex) => `cage.vertex.${vertex.id}`),
      ...normalizedCreases.map((crease) => `cage.crease.${edgeKey(...crease.vertices)}`),
    ],
  });
}

function meshDigest(mesh) {
  return digestJson({positions: mesh.positions, normals: mesh.normals, indices: mesh.indices});
}

export function createSubdivisionCageOrganic({
  id = 'subdivision-cage',
  landmarkCage = null,
  vertices = [],
  faces = [],
  creases = [],
  levels = 2,
  evidenceRefs = [],
  role = 'subdivision-cage-organic',
} = {}) {
  const subdivisionLevels = Number(levels);
  if (!Number.isInteger(subdivisionLevels) || subdivisionLevels < 1 || subdivisionLevels > 4) throw new Error('subdivision levels must be an integer in 1..4');
  const normalizedEvidence = strings(evidenceRefs);
  const controlVertices = normalizeControlVertices(vertices, landmarkCage, normalizedEvidence);
  const vertexIds = new Set(controlVertices.map((vertex) => vertex.id));
  const controlFaces = normalizeFaces(faces, vertexIds);
  const controlEdges = validateClosedControlTopology(controlFaces);
  const normalizedCreases = normalizeCreases(creases, controlEdges, vertexIds);
  const realizedMesh = realizeNormalizedCage(controlVertices, controlFaces, normalizedCreases, subdivisionLevels, role);
  const provenance = controlVertices.map((vertex) => ({
    vertexId: vertex.id,
    authority: vertex.authority,
    landmarkId: vertex.landmarkId,
    evidenceRefs: vertex.evidenceRefs,
  }));
  const cagePayload = {
    schema: SUBDIVISION_CAGE_ORGANIC_SCHEMA,
    id: assertId(id, 'id'),
    levels: subdivisionLevels,
    controlVertices,
    controlFaces,
    creases: normalizedCreases,
    provenance,
    landmarkCageDigest: landmarkCage?.cageDigest ?? null,
    realizedMeshDigest: meshDigest(realizedMesh),
    evidenceRefs: normalizedEvidence,
    policy: {
      controlVertexProvenanceRequired: true,
      generatedSurfaceIsEngineeredRealization: true,
      closedManifoldControlCageRequired: true,
      deterministicSubdivision: true,
    },
  };
  const subdivisionCage = deepFreeze({...cagePayload, cageDigest: digestJson(cagePayload)});
  return {
    ...realizedMesh,
    meta: {...realizedMesh.meta, controlCageDigest: subdivisionCage.cageDigest},
    subdivisionCage,
  };
}

export function validateSubdivisionCageOrganic(record) {
  const errors = [];
  try {
    if (record?.schema !== SUBDIVISION_CAGE_ORGANIC_SCHEMA) errors.push('invalid subdivision cage schema');
    const levels = Number(record?.levels);
    if (!Number.isInteger(levels) || levels < 1 || levels > 4) errors.push('subdivision levels are invalid');
    const controlVertices = Array.isArray(record?.controlVertices) ? record.controlVertices : [];
    if (controlVertices.length < 4) throw new Error('subdivision cage metadata requires at least four control vertices');
    const ids = new Set();
    for (const [index, vertex] of controlVertices.entries()) {
      const id = assertId(vertex?.id, `controlVertices[${index}].id`);
      if (ids.has(id)) throw new Error('subdivision cage metadata vertex IDs must be unique');
      ids.add(id);
      point3(vertex?.point, `controlVertices[${index}].point`);
      normalizeAuthority(vertex?.authority, `controlVertices[${index}].authority`);
      if (vertex?.landmarkId != null) assertId(vertex.landmarkId, `controlVertices[${index}].landmarkId`);
      if (!strings(vertex?.evidenceRefs).length) throw new Error(`controlVertices[${index}].evidenceRefs requires at least one value`);
    }
    const canonicalVertices = controlVertices.map((vertex, index) => ({
      id: assertId(vertex?.id, `controlVertices[${index}].id`),
      point: point3(vertex?.point, `controlVertices[${index}].point`),
      authority: normalizeAuthority(vertex?.authority, `controlVertices[${index}].authority`),
      landmarkId: vertex?.landmarkId == null ? null : assertId(vertex.landmarkId, `controlVertices[${index}].landmarkId`),
      evidenceRefs: strings(vertex?.evidenceRefs),
    })).sort((a, b) => a.id.localeCompare(b.id));
    if (JSON.stringify(canonicalVertices) !== JSON.stringify(record?.controlVertices ?? [])) errors.push('subdivision cage control vertices are not canonical');
    const faces = normalizeFaces(record?.controlFaces, ids);
    if (JSON.stringify(faces) !== JSON.stringify(record?.controlFaces ?? [])) errors.push('subdivision cage control faces are not canonical');
    const controlEdges = validateClosedControlTopology(faces);
    const creases = normalizeCreases(record?.creases ?? [], controlEdges, ids);
    if (JSON.stringify(creases) !== JSON.stringify(record?.creases ?? [])) errors.push('subdivision cage creases are not canonical');
    if (JSON.stringify(strings(record?.evidenceRefs)) !== JSON.stringify(record?.evidenceRefs ?? [])) errors.push('subdivision cage evidence refs are not canonical');
    const expectedProvenance = canonicalVertices.map((vertex) => ({
      vertexId: vertex.id,
      authority: vertex.authority,
      landmarkId: vertex.landmarkId ?? null,
      evidenceRefs: strings(vertex.evidenceRefs),
    }));
    if (JSON.stringify(expectedProvenance) !== JSON.stringify(record?.provenance ?? [])) errors.push('subdivision cage provenance does not match control vertices');
    const realized = realizeNormalizedCage(
      canonicalVertices.map((vertex) => ({id: vertex.id, point: vertex.point})),
      faces,
      creases,
      levels,
    );
    if (meshDigest(realized) !== record?.realizedMeshDigest) errors.push('subdivision cage realized mesh digest mismatch');
    if (record?.landmarkCageDigest != null && !/^[a-f0-9]{64}$/u.test(String(record.landmarkCageDigest))) errors.push('landmarkCageDigest is invalid');
    if (record?.policy?.controlVertexProvenanceRequired !== true
      || record?.policy?.generatedSurfaceIsEngineeredRealization !== true
      || record?.policy?.closedManifoldControlCageRequired !== true
      || record?.policy?.deterministicSubdivision !== true) {
      errors.push('subdivision cage policy is invalid');
    }
    const payload = structuredClone(record);
    delete payload.cageDigest;
    if (digestJson(payload) !== record?.cageDigest) errors.push('subdivision cage digest mismatch');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}


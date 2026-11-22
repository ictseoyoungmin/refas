import {finalizeMesh, signedArea2, surfaceFrame} from './mesh.mjs';

const EPS = 1e-9;
const key2 = ([x, y]) => `${x.toPrecision(14)},${y.toPrecision(14)}`;
const same2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const normalize3 = (value) => {
  const length = Math.hypot(...value);
  return length > EPS ? value.map((coordinate) => coordinate / length) : [1, 0, 0];
};
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function point2(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec2`);
  return value.map(Number);
}

function normalizeLoop(raw, label, clockwise) {
  if (!Array.isArray(raw) || raw.length < 3) throw new Error(`${label} requires at least three points`);
  let points = raw.map((point, index) => point2(point, `${label}[${index}]`));
  if (same2(points[0], points.at(-1))) points = points.slice(0, -1);
  if (new Set(points.map(key2)).size !== points.length) throw new Error(`${label} contains duplicate vertices`);
  const area = signedArea2(points);
  if (Math.abs(area) <= EPS) throw new Error(`${label} is degenerate or has inverted wall area`);
  if ((area < 0) !== clockwise) points.reverse();
  return points;
}

function orientation(a, b, c) {
  const value = cross2(a, b, c);
  return Math.abs(value) <= EPS ? 0 : Math.sign(value);
}

function onSegment(a, b, p) {
  return Math.abs(cross2(a, b, p)) <= EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) || (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}

function loopSelfIntersects(loop) {
  for (let i = 0; i < loop.length; i += 1) for (let j = i + 1; j < loop.length; j += 1) {
    if (j === i || j === (i + 1) % loop.length || i === (j + 1) % loop.length) continue;
    if (segmentsIntersect(loop[i], loop[(i + 1) % loop.length], loop[j], loop[(j + 1) % loop.length])) return true;
  }
  return false;
}

function pointInLoop(point, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i], b = loop[j];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function loopsIntersect(a, b) {
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) {
    if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  }
  return false;
}

function lineIntersection(p, directionP, q, directionQ) {
  const denominator = directionP[0] * directionQ[1] - directionP[1] * directionQ[0];
  if (Math.abs(denominator) <= EPS) return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const delta = [q[0] - p[0], q[1] - p[1]];
  const t = (delta[0] * directionQ[1] - delta[1] * directionQ[0]) / denominator;
  return [p[0] + directionP[0] * t, p[1] + directionP[1] * t];
}

function offsetLoop(loop, distance) {
  if (distance <= EPS) return loop.map((point) => [...point]);
  const output = [];
  for (let index = 0; index < loop.length; index += 1) {
    const previous = loop[(index - 1 + loop.length) % loop.length], current = loop[index], next = loop[(index + 1) % loop.length];
    const beforeLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const afterLength = Math.hypot(next[0] - current[0], next[1] - current[1]);
    if (beforeLength <= EPS || afterLength <= EPS) throw new Error('boundary contains a degenerate edge');
    const before = [(current[0] - previous[0]) / beforeLength, (current[1] - previous[1]) / beforeLength];
    const after = [(next[0] - current[0]) / afterLength, (next[1] - current[1]) / afterLength];
    const leftBefore = [-before[1], before[0]], leftAfter = [-after[1], after[0]];
    output.push(lineIntersection([current[0] + leftBefore[0] * distance, current[1] + leftBefore[1] * distance], before,
      [current[0] + leftAfter[0] * distance, current[1] + leftAfter[1] * distance], after));
  }
  if (loopSelfIntersects(output) || Math.sign(signedArea2(output)) !== Math.sign(signedArea2(loop))) throw new Error('edge treatment width inverts or self-intersects a wall loop');
  return output;
}

function strictPointInTriangle(point, a, b, c) {
  const area = cross2(a, b, c);
  if (Math.abs(area) <= EPS) return false;
  const u = cross2(point, b, c) / area, v = cross2(a, point, c) / area, w = cross2(a, b, point) / area;
  return u > EPS && v > EPS && w > EPS;
}

function triangulateWeak(points) {
  const order = [...points.keys()];
  if (signedArea2(points) < 0) order.reverse();
  const triangles = [];
  let guard = 0;
  while (order.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const previous = order[(cursor - 1 + order.length) % order.length], current = order[cursor], next = order[(cursor + 1) % order.length];
      const a = points[previous], b = points[current], c = points[next];
      if (cross2(a, b, c) <= EPS) continue;
      let contains = false;
      for (const candidate of order) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        const point = points[candidate];
        if (same2(point, a) || same2(point, b) || same2(point, c)) continue;
        if (strictPointInTriangle(point, a, b, c)) { contains = true; break; }
      }
      if (contains) continue;
      triangles.push([previous, current, next]);
      order.splice(cursor, 1);
      clipped = true;
      break;
    }
    guard += 1;
    if (!clipped || guard > points.length * points.length) throw new Error('profile with holes cannot be triangulated; check self-intersection and cutout clearance');
  }
  triangles.push([...order]);
  return triangles;
}

function bridgeHoles(outer, holes) {
  let combined = outer.map((point) => [...point]);
  const orderedHoles = [...holes].sort((a, b) => Math.max(...b.map((point) => point[0])) - Math.max(...a.map((point) => point[0])));
  for (const hole of orderedHoles) {
    let holeIndex = 0;
    for (let index = 1; index < hole.length; index += 1) if (hole[index][0] > hole[holeIndex][0] || (hole[index][0] === hole[holeIndex][0] && hole[index][1] < hole[holeIndex][1])) holeIndex = index;
    const anchor = hole[holeIndex];
    let hit = null;
    for (let index = 0; index < combined.length; index += 1) {
      const a = combined[index], b = combined[(index + 1) % combined.length];
      if ((a[1] > anchor[1]) === (b[1] > anchor[1]) || Math.abs(a[1] - b[1]) <= EPS) continue;
      const x = a[0] + (anchor[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
      if (x <= anchor[0] + EPS || (hit && x >= hit.point[0])) continue;
      hit = {edgeIndex: index, point: [x, anchor[1]]};
    }
    if (!hit) throw new Error('cutout has no rightward bridge to the outer profile');
    const edgeNext = (hit.edgeIndex + 1) % combined.length;
    const bridgeIndex = Math.hypot(combined[hit.edgeIndex][0] - hit.point[0], combined[hit.edgeIndex][1] - hit.point[1])
      <= Math.hypot(combined[edgeNext][0] - hit.point[0], combined[edgeNext][1] - hit.point[1]) ? hit.edgeIndex : edgeNext;
    const bridgePoint = combined[bridgeIndex];
    const sequence = Array.from({length: hole.length}, (_, offset) => hole[(holeIndex + offset) % hole.length]);
    combined = [...combined.slice(0, bridgeIndex + 1), ...sequence, sequence[0], bridgePoint, ...combined.slice(bridgeIndex + 1)];
  }
  const rawTriangles = triangulateWeak(combined);
  const unique = [], byKey = new Map(), occurrenceToUnique = [];
  for (const point of combined) {
    const key = key2(point);
    if (!byKey.has(key)) { byKey.set(key, unique.length); unique.push(point); }
    occurrenceToUnique.push(byKey.get(key));
  }
  const triangles = rawTriangles.map((triangle) => triangle.map((index) => occurrenceToUnique[index]));
  if (triangles.some((triangle) => new Set(triangle).size !== 3)) throw new Error('cutout bridge produced a degenerate triangle');
  return {points: unique, triangles};
}

function normalizeTreatment(raw, label, thickness) {
  const type = String(raw?.type ?? 'sharp');
  if (!['sharp', 'chamfer', 'fillet', 'stepped'].includes(type)) throw new Error(`${label}.type must be sharp, chamfer, fillet, or stepped`);
  const width = type === 'sharp' ? 0 : Number(raw?.width ?? thickness * 0.18);
  const depth = type === 'sharp' ? 0 : Number(raw?.depth ?? width);
  const segments = type === 'fillet' ? Number(raw?.segments ?? 4) : 1;
  if (!(width >= 0 && depth >= 0) || !Number.isInteger(segments) || segments < 1 || segments > 16) throw new Error(`${label} has invalid width, depth, or segments`);
  if (depth * 2 >= thickness) throw new Error(`${label} depth must be less than half the shell thickness`);
  return {type, width, depth, segments};
}

function layerProfile(treatment, front, thickness) {
  const face = front ? thickness / 2 : -thickness / 2;
  if (treatment.type === 'sharp') return [{inset: 0, depth: face}];
  const direction = front ? -1 : 1;
  if (treatment.type === 'chamfer') return [{inset: treatment.width, depth: face}, {inset: 0, depth: face + direction * treatment.depth}];
  if (treatment.type === 'stepped') return [{inset: treatment.width, depth: face}, {inset: treatment.width, depth: face + direction * treatment.depth}, {inset: 0, depth: face + direction * treatment.depth}];
  return Array.from({length: treatment.segments + 1}, (_, index) => {
    const angle = index / treatment.segments * Math.PI / 2;
    return {inset: treatment.width * Math.cos(angle), depth: face + direction * treatment.depth * Math.sin(angle)};
  });
}

export function validateHardSurfaceSpec(spec = {}) {
  const errors = [];
  try {
    if (spec.schema != null && spec.schema !== 'refas.hard-surface-spec/v1') errors.push('schema must be refas.hard-surface-spec/v1');
    const outer = normalizeLoop(spec.outerProfile, 'outerProfile', false);
    const holes = (spec.cutouts ?? []).map((cutout, index) => normalizeLoop(cutout.profile, `cutouts[${index}].profile`, true));
    if (loopSelfIntersects(outer)) errors.push('outerProfile is self-intersecting');
    for (let index = 0; index < holes.length; index += 1) {
      if (loopSelfIntersects(holes[index])) errors.push(`cutouts[${index}] is self-intersecting`);
      if (!pointInLoop(holes[index][0], outer) || loopsIntersect(outer, holes[index])) errors.push(`cutouts[${index}] must lie strictly inside outerProfile`);
      for (let other = 0; other < index; other += 1) if (loopsIntersect(holes[index], holes[other]) || pointInLoop(holes[index][0], holes[other]) || pointInLoop(holes[other][0], holes[index])) errors.push(`cutouts[${index}] overlaps cutouts[${other}]`);
    }
    const thickness = Number(spec.thickness ?? 0.1);
    if (!(thickness > 0)) errors.push('thickness must be positive');
    normalizeTreatment(spec.edgeTreatments?.outer, 'edgeTreatments.outer', thickness);
    for (let index = 0; index < holes.length; index += 1) normalizeTreatment(spec.cutouts[index]?.edgeTreatment ?? spec.edgeTreatments?.cutouts, `cutouts[${index}].edgeTreatment`, thickness);
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function createHardSurfaceShell(spec = {}) {
  const validation = validateHardSurfaceSpec(spec);
  if (!validation.valid) throw new Error(`invalid hard-surface spec: ${validation.errors.join('; ')}`);
  const outer = normalizeLoop(spec.outerProfile, 'outerProfile', false);
  const cutouts = (spec.cutouts ?? []).map((cutout, index) => ({id: String(cutout.id ?? `cutout-${index}`), loop: normalizeLoop(cutout.profile, `cutouts[${index}].profile`, true), edgeTreatment: cutout.edgeTreatment}));
  if (new Set(cutouts.map(({id}) => id)).size !== cutouts.length) throw new Error('cutout IDs must be unique');
  const thickness = Number(spec.thickness ?? 0.1), surface = spec.surface ?? null;
  const loops = [{id: 'outer', class: 'outer', loop: outer, treatment: normalizeTreatment(spec.edgeTreatments?.outer, 'edgeTreatments.outer', thickness)},
    ...cutouts.map(({id, loop, edgeTreatment}, index) => ({id, class: 'cutout', loop, treatment: normalizeTreatment(edgeTreatment ?? spec.edgeTreatments?.cutouts, `cutouts[${index}].edgeTreatment`, thickness)}))];
  const positions = [], indices = [], vertexMap = new Map(), topology = {schema: 'refas.hard-surface-topology/v1', faces: {}, edges: {}, attachmentFrames: {}};
  const positionAt = (point, depth) => {
    if (!surface) return [point[0], point[1], depth];
    const frame = surfaceFrame(point, surface);
    return frame.point.map((coordinate, axis) => coordinate + frame.normal[axis] * depth);
  };
  const vertex = (point, depth) => {
    const key = `${key2(point)}@${depth.toPrecision(14)}`;
    if (!vertexMap.has(key)) { vertexMap.set(key, positions.length); positions.push(positionAt(point, depth)); }
    return vertexMap.get(key);
  };
  const addTriangle = (a, b, c, reverse = false) => indices.push(...(reverse ? [a, c, b] : [a, b, c]));
  const frontBoundary = [], backBoundary = [];
  for (const loopRecord of loops) {
    const frontLayers = layerProfile(loopRecord.treatment, true, thickness), backLayers = layerProfile(loopRecord.treatment, false, thickness);
    const makeRings = (layers) => layers.map((layer) => offsetLoop(loopRecord.loop, layer.inset).map((point) => vertex(point, layer.depth)));
    const frontRings = makeRings(frontLayers), backRings = makeRings(backLayers);
    frontBoundary.push(offsetLoop(loopRecord.loop, frontLayers[0].inset));
    backBoundary.push(offsetLoop(loopRecord.loop, backLayers[0].inset));
    const bandStart = indices.length / 3;
    for (let layer = 0; layer < frontRings.length - 1; layer += 1) for (let edge = 0; edge < loopRecord.loop.length; edge += 1) {
      const next = (edge + 1) % loopRecord.loop.length, a = frontRings[layer][edge], b = frontRings[layer + 1][edge], c = frontRings[layer + 1][next], d = frontRings[layer][next];
      addTriangle(a, b, c); addTriangle(a, c, d);
    }
    for (let layer = 0; layer < backRings.length - 1; layer += 1) for (let edge = 0; edge < loopRecord.loop.length; edge += 1) {
      const next = (edge + 1) % loopRecord.loop.length, a = backRings[layer][edge], b = backRings[layer + 1][edge], c = backRings[layer + 1][next], d = backRings[layer][next];
      addTriangle(a, b, c, true); addTriangle(a, c, d, true);
    }
    const frontWall = frontRings.at(-1), backWall = backRings.at(-1);
    const wallStart = indices.length / 3;
    for (let edge = 0; edge < loopRecord.loop.length; edge += 1) {
      const next = (edge + 1) % loopRecord.loop.length;
      addTriangle(frontWall[edge], backWall[edge], backWall[next]); addTriangle(frontWall[edge], backWall[next], frontWall[next]);
      const id = `${loopRecord.id}.edge-${edge}`;
      const p = loopRecord.loop[edge], q = loopRecord.loop[next], tangentLength = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const midpoint = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const tangent = normalize3(positionAt(q, 0).map((coordinate, axis) => coordinate - positionAt(p, 0)[axis]));
      const normal = surface ? surfaceFrame(midpoint, surface).normal : [0, 0, 1];
      const outward = normalize3(cross3(tangent, normal));
      topology.edges[id] = {id, loopId: loopRecord.id, boundaryClass: loopRecord.class, treatment: loopRecord.treatment.type,
        frame: {origin: positionAt(midpoint, 0), tangent, outward, normal}, triangleRange: [wallStart + edge * 2, wallStart + edge * 2 + 2]};
      topology.attachmentFrames[id] = topology.edges[id].frame;
    }
    topology.faces[`${loopRecord.id}-wall`] = {id: `${loopRecord.id}-wall`, class: loopRecord.class === 'outer' ? 'outer-wall' : 'cutout-wall', triangleRange: [wallStart, indices.length / 3]};
    topology.faces[`${loopRecord.id}-edge-treatment`] = {id: `${loopRecord.id}-edge-treatment`, class: loopRecord.treatment.type, triangleRange: [bandStart, wallStart]};
  }
  const addFace = (boundaries, front) => {
    const triangulated = bridgeHoles(boundaries[0], boundaries.slice(1));
    const depth = front ? thickness / 2 : -thickness / 2, start = indices.length / 3;
    const faceVertices = triangulated.points.map((point) => vertex(point, depth));
    for (const triangle of triangulated.triangles) addTriangle(...triangle.map((index) => faceVertices[index]), !front);
    topology.faces[front ? 'front' : 'back'] = {id: front ? 'front' : 'back', class: front ? 'front-face' : 'back-face', triangleRange: [start, indices.length / 3]};
  };
  addFace(frontBoundary, true); addFace(backBoundary, false);
  const mesh = finalizeMesh(positions, indices, {role: spec.role ?? 'hard-surface-shell', topology, hardSurfaceSpec: {outerProfile: outer, cutouts: cutouts.map(({id, loop}) => ({id, profile: loop})), thickness, edgeTreatments: spec.edgeTreatments ?? {}, surface}});
  return {...mesh, topology};
}

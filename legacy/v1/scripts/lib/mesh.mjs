const EPS = 1e-10;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, value) => [a[0] * value, a[1] * value, a[2] * value];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => length(a) > EPS ? mul(a, 1 / length(a)) : [0, 0, 1];

function finitePoint(point, dimensions, label) {
  if (!Array.isArray(point) || point.length !== dimensions || !point.every(Number.isFinite)) throw new Error(`${label} must be a finite vec${dimensions}`);
  return point.map(Number);
}

export function signedArea2(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function pointInTriangle(point, a, b, c) {
  const v0 = [c[0] - a[0], c[1] - a[1]];
  const v1 = [b[0] - a[0], b[1] - a[1]];
  const v2 = [point[0] - a[0], point[1] - a[1]];
  const d00 = v0[0] * v0[0] + v0[1] * v0[1];
  const d01 = v0[0] * v1[0] + v0[1] * v1[1];
  const d02 = v0[0] * v2[0] + v0[1] * v2[1];
  const d11 = v1[0] * v1[0] + v1[1] * v1[1];
  const d12 = v1[0] * v2[0] + v1[1] * v2[1];
  const denominator = d00 * d11 - d01 * d01;
  if (Math.abs(denominator) < EPS) return false;
  const u = (d11 * d02 - d01 * d12) / denominator;
  const v = (d00 * d12 - d01 * d02) / denominator;
  return u >= -EPS && v >= -EPS && u + v <= 1 + EPS;
}

export function triangulatePolygon(input) {
  if (!Array.isArray(input) || input.length < 3) throw new Error('polygon requires at least three points');
  const points = input.map((point, index) => finitePoint(point, 2, `polygon[${index}]`));
  const order = [...points.keys()];
  if (signedArea2(points) < 0) order.reverse();
  const triangles = [];
  let guard = 0;
  while (order.length > 3) {
    let clipped = false;
    for (let cursor = 0; cursor < order.length; cursor += 1) {
      const previous = order[(cursor - 1 + order.length) % order.length];
      const current = order[cursor];
      const next = order[(cursor + 1) % order.length];
      const a = points[previous], b = points[current], c = points[next];
      const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (turn <= EPS) continue;
      let contains = false;
      for (const candidate of order) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInTriangle(points[candidate], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;
      triangles.push([previous, current, next]);
      order.splice(cursor, 1);
      clipped = true;
      break;
    }
    guard += 1;
    if (!clipped || guard > input.length * input.length) throw new Error('polygon is self-intersecting or numerically degenerate');
  }
  triangles.push([...order]);
  return triangles;
}

export function computeVertexNormals(positions, indices) {
  const normals = Array.from({length: positions.length}, () => [0, 0, 0]);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index], ib = indices[index + 1], ic = indices[index + 2];
    const face = cross(sub(positions[ib], positions[ia]), sub(positions[ic], positions[ia]));
    normals[ia] = add(normals[ia], face);
    normals[ib] = add(normals[ib], face);
    normals[ic] = add(normals[ic], face);
  }
  return normals.map(normalize);
}

export function analyzeMesh({positions, indices}) {
  const errors = [];
  if (!Array.isArray(positions) || positions.length < 3) errors.push('positions missing');
  if (!Array.isArray(indices) || indices.length < 3 || indices.length % 3 !== 0) errors.push('triangle indices invalid');
  if (positions?.some((point) => !Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite))) errors.push('non-finite position');
  if (Array.isArray(indices) && Array.isArray(positions) && indices.some((index) => !Number.isInteger(index) || index < 0 || index >= positions.length)) errors.push('index out of range');
  const edges = new Map();
  const triangles = new Set();
  let degenerateTriangles = 0;
  let duplicateTriangles = 0;
  if (!errors.length) {
    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = indices.slice(offset, offset + 3);
      if (new Set(triangle).size < 3 || length(cross(sub(positions[triangle[1]], positions[triangle[0]]), sub(positions[triangle[2]], positions[triangle[0]]))) < EPS) degenerateTriangles += 1;
      const triangleKey = [...triangle].sort((a, b) => a - b).join(':');
      if (triangles.has(triangleKey)) duplicateTriangles += 1;
      triangles.add(triangleKey);
      for (let edge = 0; edge < 3; edge += 1) {
        const a = triangle[edge], b = triangle[(edge + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const record = edges.get(key) ?? {count: 0, balance: 0};
        record.count += 1;
        record.balance += a < b ? 1 : -1;
        edges.set(key, record);
      }
    }
  }
  const nonManifoldEdges = [...edges.values()].filter((record) => record.count !== 2).length;
  const windingFailures = [...edges.values()].filter((record) => record.count === 2 && record.balance !== 0).length;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  if (Array.isArray(positions)) for (const point of positions) if (Array.isArray(point) && point.length === 3) for (let axis = 0; axis < 3; axis += 1) {
    minimum[axis] = Math.min(minimum[axis], point[axis]);
    maximum[axis] = Math.max(maximum[axis], point[axis]);
  }
  return {
    valid: errors.length === 0 && degenerateTriangles === 0 && duplicateTriangles === 0,
    watertight: errors.length === 0 && nonManifoldEdges === 0,
    windingConsistent: errors.length === 0 && windingFailures === 0,
    errors,
    vertexCount: positions?.length ?? 0,
    triangleCount: (indices?.length ?? 0) / 3,
    degenerateTriangles,
    duplicateTriangles,
    nonManifoldEdges,
    windingFailures,
    bounds: positions?.length ? {min: minimum, max: maximum} : null,
  };
}

export function finalizeMesh(positions, indices, meta = {}, {requireWatertight = true} = {}) {
  positions = positions.map((point, index) => finitePoint(point, 3, `positions[${index}]`));
  indices = indices.map((value) => Number(value));
  const analysis = analyzeMesh({positions, indices});
  if (!analysis.valid || !analysis.windingConsistent || (requireWatertight && !analysis.watertight)) {
    throw new Error(`invalid mesh: ${[
      ...analysis.errors,
      `${analysis.degenerateTriangles} degenerate triangles`,
      `${analysis.duplicateTriangles} duplicate triangles`,
      `${analysis.nonManifoldEdges} non-manifold edges`,
      `${analysis.windingFailures} winding failures`,
    ].join('; ')}`);
  }
  return {positions, indices, normals: computeVertexNormals(positions, indices), meta: {...meta}, analysis};
}

function finiteScalar(value, label, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (value) => value * value * (3 - 2 * value);

function sampleGuidedCurve(points, coordinate, {coordinateKey, valueKey}) {
  const samples = [...points].sort((a, b) => a[coordinateKey] - b[coordinateKey]);
  if (coordinate <= samples[0][coordinateKey]) return samples[0][valueKey];
  if (coordinate >= samples.at(-1)[coordinateKey]) return samples.at(-1)[valueKey];
  let index = 0;
  while (index < samples.length - 2 && coordinate > samples[index + 1][coordinateKey]) index += 1;
  const a = samples[index], b = samples[index + 1];
  const t = smoothstep((coordinate - a[coordinateKey]) / (b[coordinateKey] - a[coordinateKey]));
  return lerp(a[valueKey], b[valueKey], t);
}

function normalizeGuidedSurface(raw) {
  if (raw == null) return null;
  if (raw.model !== 'projection-anchored-guided') throw new Error('unsupported guided surface model');
  const minimum = finitePoint(raw.bounds?.min, 2, 'guidedSurface.bounds.min');
  const maximum = finitePoint(raw.bounds?.max, 2, 'guidedSurface.bounds.max');
  if (!(maximum[0] > minimum[0] && maximum[1] > minimum[1])) throw new Error('guided surface bounds must be non-degenerate');
  const crossSections = (raw.crossSections ?? []).map((section, sectionIndex) => {
    const v = finiteScalar(section?.v, `guidedSurface.crossSections[${sectionIndex}].v`);
    const profile = (section?.profile ?? []).map((sample, sampleIndex) => ({
      u: finiteScalar(sample?.u, `guidedSurface.crossSections[${sectionIndex}].profile[${sampleIndex}].u`),
      z: finiteScalar(sample?.z, `guidedSurface.crossSections[${sectionIndex}].profile[${sampleIndex}].z`),
    })).sort((a, b) => a.u - b.u);
    if (v < -1 || v > 1) throw new Error('guided surface cross-section coordinates must remain in [-1,1]');
    if (profile.length < 3 || profile[0].u > -1 || profile.at(-1).u < 1) throw new Error('guided surface cross sections must span u=-1..1 with at least three samples');
    if (profile.some((sample, index) => sample.u < -1 || sample.u > 1 || (index > 0 && sample.u - profile[index - 1].u < EPS))) throw new Error('guided surface profile coordinates must be unique and remain in [-1,1]');
    return {v, profile};
  }).sort((a, b) => a.v - b.v);
  if (crossSections.length < 3 || crossSections[0].v > -1 || crossSections.at(-1).v < 1) throw new Error('guided surface cross sections must span v=-1..1');
  if (crossSections.some((section, index) => index > 0 && section.v - crossSections[index - 1].v < EPS)) throw new Error('guided surface cross-section coordinates must be unique');
  const longitudinalGuide = (raw.longitudinalGuide ?? []).map((sample, index) => ({
    v: finiteScalar(sample?.v, `guidedSurface.longitudinalGuide[${index}].v`),
    z: finiteScalar(sample?.z, `guidedSurface.longitudinalGuide[${index}].z`),
  })).sort((a, b) => a.v - b.v);
  if (longitudinalGuide.length > 0 && longitudinalGuide.length < 2) throw new Error('guided surface longitudinal guide requires at least two samples');
  if (longitudinalGuide.some((sample, index) => sample.v < -1 || sample.v > 1 || (index > 0 && sample.v - longitudinalGuide[index - 1].v < EPS))) throw new Error('guided surface longitudinal coordinates must be unique and remain in [-1,1]');
  const cameraDistance = finiteScalar(raw.projection?.cameraDistance, 'guidedSurface.projection.cameraDistance', 6.2);
  const observedHeight = finiteScalar(raw.projection?.observedHeight, 'guidedSurface.projection.observedHeight', 2.72);
  if (!(cameraDistance > 0 && observedHeight > 0)) throw new Error('guided surface camera distance and observed height must be positive');
  return {
    model: raw.model,
    bounds: {min: minimum, max: maximum},
    projection: {
      yawDegrees: finiteScalar(raw.projection?.yawDegrees, 'guidedSurface.projection.yawDegrees'),
      pitchDegrees: finiteScalar(raw.projection?.pitchDegrees, 'guidedSurface.projection.pitchDegrees'),
      cameraDistance,
      observedHeight,
      referenceYDown: raw.projection?.referenceYDown !== false,
    },
    crossSections,
    longitudinalGuide,
  };
}

function normalizeSurfaceParameters(parameters = {}) {
  const width = finiteScalar(parameters.width, 'surface.width', 2.2);
  const height = finiteScalar(parameters.height, 'surface.height', 2.8);
  if (!(width > 0 && height > 0)) throw new Error('surface width and height must be positive');
  const rawCreases = parameters.creases ?? (parameters.crease ? [parameters.crease] : []);
  if (!Array.isArray(rawCreases)) throw new Error('surface.creases must be an array');
  const creases = rawCreases.map((raw, index) => {
    const axis = finitePoint(raw?.axis ?? [1, 0], 2, `surface.creases[${index}].axis`);
    const axisLength = Math.hypot(axis[0], axis[1]);
    const softness = finiteScalar(raw?.softness, `surface.creases[${index}].softness`, 0.12);
    if (axisLength < EPS || !(softness > 0)) throw new Error(`surface.creases[${index}] requires a non-zero axis and positive softness`);
    return {
      axis: axis.map((coordinate) => coordinate / axisLength),
      offset: finiteScalar(raw?.offset, `surface.creases[${index}].offset`),
      strength: finiteScalar(raw?.strength, `surface.creases[${index}].strength`),
      softness,
    };
  });
  return {
    width,
    height,
    centerU: finiteScalar(parameters.centerU, 'surface.centerU', 0.5),
    centerV: finiteScalar(parameters.centerV, 'surface.centerV', 0.5),
    crownX: finiteScalar(parameters.crownX, 'surface.crownX', 0.18),
    crownY: finiteScalar(parameters.crownY, 'surface.crownY', 0.10),
    twist: finiteScalar(parameters.twist, 'surface.twist', 0.04),
    tiltX: finiteScalar(parameters.tiltX, 'surface.tiltX'),
    tiltY: finiteScalar(parameters.tiltY, 'surface.tiltY'),
    cubicX: finiteScalar(parameters.cubicX, 'surface.cubicX'),
    cubicY: finiteScalar(parameters.cubicY, 'surface.cubicY'),
    crossX2Y: finiteScalar(parameters.crossX2Y, 'surface.crossX2Y'),
    crossXY2: finiteScalar(parameters.crossXY2, 'surface.crossXY2'),
    lift: finiteScalar(parameters.lift, 'surface.lift'),
    creases,
    guidedSurface: normalizeGuidedSurface(parameters.guidedSurface),
  };
}

function inverseRotateYawPitch([x, y, z], yaw, pitch) {
  const cosinePitch = Math.cos(-pitch), sinePitch = Math.sin(-pitch);
  const y1 = y * cosinePitch - z * sinePitch, z1 = y * sinePitch + z * cosinePitch;
  const cosineYaw = Math.cos(-yaw), sineYaw = Math.sin(-yaw);
  return [x * cosineYaw + z1 * sineYaw, y1, -x * sineYaw + z1 * cosineYaw];
}

function guidedHeight(guidedSurface, u, v) {
  const sections = guidedSurface.crossSections;
  let lower = sections[0], upper = sections[0], blend = 0;
  if (v >= sections.at(-1).v) lower = upper = sections.at(-1);
  else if (v > sections[0].v) {
    let index = 0;
    while (index < sections.length - 2 && v > sections[index + 1].v) index += 1;
    lower = sections[index];
    upper = sections[index + 1];
    blend = smoothstep((v - lower.v) / (upper.v - lower.v));
  }
  const lowerHeight = sampleGuidedCurve(lower.profile, u, {coordinateKey: 'u', valueKey: 'z'});
  const upperHeight = sampleGuidedCurve(upper.profile, u, {coordinateKey: 'u', valueKey: 'z'});
  const longitudinal = guidedSurface.longitudinalGuide.length
    ? sampleGuidedCurve(guidedSurface.longitudinalGuide, v, {coordinateKey: 'v', valueKey: 'z'})
    : 0;
  return lerp(lowerHeight, upperHeight, blend) + longitudinal;
}

function mappedGuidedSurfacePoint([u, v], guidedSurface) {
  const {min, max} = guidedSurface.bounds;
  const size = [max[0] - min[0], max[1] - min[1]];
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const guideU = (u - center[0]) / (size[0] / 2);
  const guideV = (guidedSurface.projection.referenceYDown ? -1 : 1) * (v - center[1]) / (size[1] / 2);
  const localHeight = guidedHeight(guidedSurface, guideU, guideV);
  const yaw = guidedSurface.projection.yawDegrees * Math.PI / 180;
  const pitch = guidedSurface.projection.pitchDegrees * Math.PI / 180;
  const camera = [0, 0, guidedSurface.projection.cameraDistance];
  const target = [
    (u - center[0]) / size[1] * guidedSurface.projection.observedHeight,
    (guidedSurface.projection.referenceYDown ? -1 : 1) * (v - center[1]) / size[1] * guidedSurface.projection.observedHeight,
    0,
  ];
  const direction = sub(target, camera);
  const localCamera = inverseRotateYawPitch(camera, yaw, pitch);
  const localDirection = inverseRotateYawPitch(direction, yaw, pitch);
  if (Math.abs(localDirection[2]) < EPS) throw new Error('projection-anchored surface ray is parallel to the local depth plane');
  const distance = (localHeight - localCamera[2]) / localDirection[2];
  if (!(distance > 0)) throw new Error('projection-anchored surface depth lies behind the camera');
  return add(camera, mul(direction, distance));
}

function mappedGuidedSurfaceFrame(point, guidedSurface) {
  const epsilon = 1e-5;
  const center = mappedGuidedSurfacePoint(point, guidedSurface);
  const tangentU = sub(
    mappedGuidedSurfacePoint([point[0] + epsilon, point[1]], guidedSurface),
    mappedGuidedSurfacePoint([point[0] - epsilon, point[1]], guidedSurface),
  );
  const tangentV = sub(
    mappedGuidedSurfacePoint([point[0], point[1] + epsilon], guidedSurface),
    mappedGuidedSurfacePoint([point[0], point[1] - epsilon], guidedSurface),
  );
  let normal = normalize(cross(tangentV, tangentU));
  if (normal[2] < 0) normal = mul(normal, -1);
  return {point: center, normal, tangentU, tangentV};
}

function mappedSurfaceFrame([u, v], surface) {
  if (surface.guidedSurface) return mappedGuidedSurfaceFrame([u, v], surface.guidedSurface);
  const xUnit = (u - surface.centerU) * 2;
  const yUnit = (surface.centerV - v) * 2;
  const {
    width, height, crownX, crownY, twist, tiltX, tiltY,
    cubicX, cubicY, crossX2Y, crossXY2, lift, creases,
  } = surface;
  let z = crownX * (1 - xUnit * xUnit) + crownY * (1 - yUnit * yUnit) + twist * xUnit * yUnit
    + tiltX * xUnit + tiltY * yUnit
    + cubicX * xUnit ** 3 + cubicY * yUnit ** 3
    + crossX2Y * xUnit * xUnit * yUnit + crossXY2 * xUnit * yUnit * yUnit + lift;
  let derivativeX = -2 * crownX * xUnit + twist * yUnit + tiltX
    + 3 * cubicX * xUnit * xUnit + 2 * crossX2Y * xUnit * yUnit + crossXY2 * yUnit * yUnit;
  let derivativeY = -2 * crownY * yUnit + twist * xUnit + tiltY
    + 3 * cubicY * yUnit * yUnit + crossX2Y * xUnit * xUnit + 2 * crossXY2 * xUnit * yUnit;
  for (const crease of creases) {
    const distance = crease.axis[0] * xUnit + crease.axis[1] * yUnit - crease.offset;
    const radius = Math.hypot(distance, crease.softness);
    z += crease.strength * (radius - crease.softness);
    const gradient = crease.strength * distance / radius;
    derivativeX += gradient * crease.axis[0];
    derivativeY += gradient * crease.axis[1];
  }
  const point = [xUnit * width / 2, yUnit * height / 2, z];
  const tangentU = [width, 0, derivativeX * 2];
  const tangentV = [0, -height, derivativeY * -2];
  return {point, normal: normalize(cross(tangentV, tangentU)), tangentU, tangentV};
}

function subdivideSurfaceTriangles(points, triangles, cycle, levels) {
  for (let level = 0; level < levels; level += 1) {
    const midpointIndices = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (midpointIndices.has(key)) return midpointIndices.get(key);
      const index = points.length;
      points.push([(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2]);
      midpointIndices.set(key, index);
      return index;
    };
    const refined = [];
    for (const [a, b, c] of triangles) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      refined.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    const refinedCycle = [];
    for (let index = 0; index < cycle.length; index += 1) {
      const a = cycle[index], b = cycle[(index + 1) % cycle.length];
      refinedCycle.push(a, midpoint(a, b));
    }
    triangles = refined;
    cycle = refinedCycle;
  }
  return {points, triangles, cycle};
}

export function createCurvedPlate({polygon, thickness = 0.08, normalOffset = 0, subdivisions = 1, role = 'curved-plate', ...surfaceInput} = {}) {
  if (!(thickness > 0)) throw new Error('thickness must be positive');
  if (!Number.isInteger(subdivisions) || subdivisions < 0 || subdivisions > 6) throw new Error('subdivisions must be an integer from 0 to 6');
  normalOffset = finiteScalar(normalOffset, 'normalOffset');
  if (!Array.isArray(polygon) || polygon.length < 3) throw new Error('curved plate requires a polygon with at least three points');
  const surface = normalizeSurfaceParameters(surfaceInput);
  let points2 = polygon.map((point, index) => finitePoint(point, 2, `polygon[${index}]`));
  const local2 = points2.map(([u, v]) => [(u - 0.5) * surface.width, (0.5 - v) * surface.height]);
  let cycle = [...points2.keys()];
  if (signedArea2(local2) < 0) cycle.reverse();
  let triangles = triangulatePolygon(local2);
  ({points: points2, triangles, cycle} = subdivideSurfaceTriangles(points2, triangles, cycle, subdivisions));
  const frames = points2.map((point) => mappedSurfaceFrame(point, surface));
  const front = frames.map((frame) => add(frame.point, mul(frame.normal, normalOffset)));
  const back = front.map((point, index) => sub(point, mul(frames[index].normal, thickness)));
  const positions = [...front, ...back];
  const count = front.length;
  const firstTriangle = triangles[0];
  const firstNormal = cross(sub(front[firstTriangle[1]], front[firstTriangle[0]]), sub(front[firstTriangle[2]], front[firstTriangle[0]]));
  const expectedFirstNormal = add(add(frames[firstTriangle[0]].normal, frames[firstTriangle[1]].normal), frames[firstTriangle[2]].normal);
  const flipFront = dot(firstNormal, expectedFirstNormal) < 0;
  const frontTriangles = triangles.map((triangle) => flipFront ? [triangle[0], triangle[2], triangle[1]] : triangle);
  const indices = [];
  for (const triangle of frontTriangles) indices.push(...triangle);
  for (const triangle of frontTriangles) indices.push(triangle[0] + count, triangle[2] + count, triangle[1] + count);
  for (let index = 0; index < cycle.length; index += 1) {
    const a = cycle[index], b = cycle[(index + 1) % cycle.length];
    indices.push(a, a + count, b + count, a, b + count, b);
  }
  return finalizeMesh(positions, indices, {role, sourcePolygon: polygon, surface: {...surface, thickness, normalOffset, subdivisions}});
}

export function surfacePoint(point, parameters = {}) {
  return surfaceFrame(point, parameters).point;
}

export function surfaceFrame(point, {normalOffset = 0, ...parameters} = {}) {
  point = finitePoint(point, 2, 'surface point');
  normalOffset = finiteScalar(normalOffset, 'normalOffset');
  const frame = mappedSurfaceFrame(point, normalizeSurfaceParameters(parameters));
  return {...frame, point: add(frame.point, mul(frame.normal, normalOffset))};
}

export const SURFACE_RIBBON_PROFILES = Object.freeze({
  beveled: Object.freeze([
    {lateral: -0.50, height: 0}, {lateral: -0.46, height: 0.28},
    {lateral: -0.32, height: 0.72}, {lateral: -0.17, height: 1},
    {lateral: 0.17, height: 1}, {lateral: 0.32, height: 0.72},
    {lateral: 0.46, height: 0.28}, {lateral: 0.50, height: 0},
  ].map(Object.freeze)),
  crowned: Object.freeze([
    {lateral: -0.50, height: 0}, {lateral: -0.47, height: 0.24},
    {lateral: -0.39, height: 0.55}, {lateral: -0.27, height: 0.82},
    {lateral: -0.10, height: 0.98}, {lateral: 0, height: 1},
    {lateral: 0.10, height: 0.98}, {lateral: 0.27, height: 0.82},
    {lateral: 0.39, height: 0.55}, {lateral: 0.47, height: 0.24},
    {lateral: 0.50, height: 0},
  ].map(Object.freeze)),
});

function normalizeRibbonProfile(profile) {
  if (typeof profile === 'string') profile = SURFACE_RIBBON_PROFILES[profile];
  if (!Array.isArray(profile) || profile.length < 4) throw new Error('surface ribbon profile requires at least four samples');
  const normalized = profile.map((sample, index) => ({
    lateral: finiteScalar(sample?.lateral, `profile[${index}].lateral`),
    height: finiteScalar(sample?.height, `profile[${index}].height`),
  }));
  if (normalized.some((sample) => Math.abs(sample.lateral) > 0.500001 || sample.height < 0)) throw new Error('surface ribbon profile samples are outside their valid range');
  if (Math.abs(normalized[0].height) > EPS || Math.abs(normalized.at(-1).height) > EPS) throw new Error('surface ribbon profile must meet the host at both ends');
  return normalized;
}

export function createSurfaceRibbon({
  polyline,
  surface = {},
  width = 0.04,
  height = 0.04,
  normalOffset = 0,
  samplesPerSegment = 4,
  closed = false,
  profile = null,
  miterLimit = 1.35,
  role = 'surface-ribbon',
} = {}) {
  if (!Array.isArray(polyline) || polyline.length < (closed ? 3 : 2)) throw new Error('surface ribbon requires a valid polyline');
  if (!(width > 0 && height > 0)) throw new Error('surface ribbon width and height must be positive');
  if (!Number.isInteger(samplesPerSegment) || samplesPerSegment < 1 || samplesPerSegment > 64) throw new Error('samplesPerSegment must be an integer from 1 to 64');
  if (!(miterLimit >= 1 && Number.isFinite(miterLimit))) throw new Error('miterLimit must be finite and at least one');
  const controlPoints = polyline.map((point, index) => finitePoint(point, 2, `polyline[${index}]`));
  for (let index = 1; index < controlPoints.length; index += 1) {
    if (Math.hypot(controlPoints[index][0] - controlPoints[index - 1][0], controlPoints[index][1] - controlPoints[index - 1][1]) < EPS) throw new Error('surface ribbon contains a zero-length segment');
  }
  if (closed && Math.hypot(controlPoints[0][0] - controlPoints.at(-1)[0], controlPoints[0][1] - controlPoints.at(-1)[1]) < EPS) throw new Error('closed surface ribbon must not repeat its first point');
  const normalizedSurface = normalizeSurfaceParameters(surface);
  const samples = [];
  const spanCount = closed ? controlPoints.length : controlPoints.length - 1;
  for (let span = 0; span < spanCount; span += 1) {
    const a = controlPoints[span], b = controlPoints[(span + 1) % controlPoints.length];
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment;
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (!closed) samples.push([...controlPoints.at(-1)]);
  if (profile) {
    const crossSection = normalizeRibbonProfile(profile);
    const positions = [];
    for (let index = 0; index < samples.length; index += 1) {
      const point = samples[index];
      const previous = samples[closed ? (index - 1 + samples.length) % samples.length : Math.max(0, index - 1)];
      const next = samples[closed ? (index + 1) % samples.length : Math.min(samples.length - 1, index + 1)];
      const incoming = normalize([point[0] - previous[0], point[1] - previous[1], 0]);
      const outgoing = normalize([next[0] - point[0], next[1] - point[1], 0]);
      const nextNormal = [-outgoing[1], outgoing[0], 0];
      const miterCandidate = [-(incoming[1] + outgoing[1]), incoming[0] + outgoing[0], 0];
      let miter = length(miterCandidate) > EPS ? normalize(miterCandidate) : nextNormal;
      let scale = Math.abs(dot(miter, nextNormal)) > 1e-5 ? 1 / Math.abs(dot(miter, nextNormal)) : 1;
      scale = Math.min(scale, miterLimit);
      if (!closed && (index === 0 || index === samples.length - 1)) {
        const direction = index === 0 ? outgoing : incoming;
        miter = [-direction[1], direction[0], 0];
        scale = 1;
      }
      for (const sample of crossSection) {
        const source = [point[0] + miter[0] * sample.lateral * width * scale, point[1] + miter[1] * sample.lateral * width * scale];
        positions.push(surfaceFrame(source, {...surface, normalOffset: normalOffset + sample.height * height}).point);
      }
    }
    const indices = [], ringSize = crossSection.length;
    const connectionCount = closed ? samples.length : samples.length - 1;
    for (let span = 0; span < connectionCount; span += 1) {
      const nextSpan = (span + 1) % samples.length;
      for (let sample = 0; sample < ringSize; sample += 1) {
        const nextSample = (sample + 1) % ringSize;
        const a = span * ringSize + sample, b = span * ringSize + nextSample;
        const c = nextSpan * ringSize + sample, d = nextSpan * ringSize + nextSample;
        indices.push(a, c, b, b, c, d);
      }
    }
    if (!closed) {
      for (let sample = 1; sample < ringSize - 1; sample += 1) indices.push(0, sample, sample + 1);
      const end = (samples.length - 1) * ringSize;
      for (let sample = 1; sample < ringSize - 1; sample += 1) indices.push(end, end + sample + 1, end + sample);
    }
    return finalizeMesh(positions, indices, {
      role, sourcePolyline: controlPoints, surface: normalizedSurface,
      width, widthSpace: 'surface-domain', height, normalOffset, samplesPerSegment, closed, profile: crossSection, miterLimit,
    });
  }
  const frames = samples.map((sample) => mappedSurfaceFrame(sample, normalizedSurface));
  const centers = frames.map((frame) => add(frame.point, mul(frame.normal, normalOffset)));
  const positions = [];
  for (let index = 0; index < centers.length; index += 1) {
    const previous = centers[closed ? (index - 1 + centers.length) % centers.length : Math.max(0, index - 1)];
    const next = centers[closed ? (index + 1) % centers.length : Math.min(centers.length - 1, index + 1)];
    const tangent = normalize(sub(next, previous));
    const lateral = normalize(cross(frames[index].normal, tangent));
    const upper = mul(frames[index].normal, height / 2);
    const side = mul(lateral, width / 2);
    positions.push(
      add(add(centers[index], upper), side),
      sub(add(centers[index], upper), side),
      sub(sub(centers[index], upper), side),
      add(sub(centers[index], upper), side),
    );
  }
  const indices = [];
  const connectionCount = closed ? centers.length : centers.length - 1;
  for (let span = 0; span < connectionCount; span += 1) {
    const current = span * 4, next = ((span + 1) % centers.length) * 4;
    for (let side = 0; side < 4; side += 1) {
      const sideNext = (side + 1) % 4;
      indices.push(current + side, next + sideNext, next + side, current + side, current + sideNext, next + sideNext);
    }
  }
  if (!closed) {
    const end = (centers.length - 1) * 4;
    indices.push(0, 2, 1, 0, 3, 2, end, end + 1, end + 2, end, end + 2, end + 3);
  }
  return finalizeMesh(positions, indices, {
    role, sourcePolyline: controlPoints, surface: normalizedSurface,
    width, height, normalOffset, samplesPerSegment, closed,
  });
}

export function createSegmentPrism({start, end, width = 0.04, height = 0.04, upHint = [0, 0, 1], role = 'ridge'} = {}) {
  const a = finitePoint(start, 3, 'start'), b = finitePoint(end, 3, 'end');
  if (!(width > 0 && height > 0)) throw new Error('positive prism width and height are required');
  const direction = sub(b, a), directionLength = length(direction);
  if (directionLength < EPS) throw new Error('segment is too short');
  const axis = mul(direction, 1 / directionLength);
  let hint = normalize(finitePoint(upHint, 3, 'upHint'));
  if (Math.abs(dot(axis, hint)) > 0.98) hint = Math.abs(axis[1]) < 0.98 ? [0, 1, 0] : [1, 0, 0];
  const lateral = mul(normalize(cross(hint, axis)), width / 2);
  const normal = mul(normalize(cross(axis, lateral)), height / 2);
  const p0 = add(add(a, lateral), normal), p1 = add(sub(a, lateral), normal), p2 = add(sub(b, lateral), normal), p3 = add(add(b, lateral), normal);
  const positions = [p0, p1, p2, p3, sub(p0, mul(normal, 2)), sub(p1, mul(normal, 2)), sub(p2, mul(normal, 2)), sub(p3, mul(normal, 2))];
  const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  return finalizeMesh(positions, indices, {role, width, height});
}

export function createCylinder({center = [0, 0, 0], axis = [0, 0, 1], radius = 0.1, height = 0.08, segments = 24, role = 'cylinder'} = {}) {
  center = finitePoint(center, 3, 'center');
  axis = finitePoint(axis, 3, 'axis');
  if (length(axis) < EPS) throw new Error('cylinder axis must be non-zero');
  axis = normalize(axis);
  if (!(radius > 0 && height > 0) || !Number.isInteger(segments) || segments < 8) throw new Error('invalid cylinder parameters');
  const reference = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const basisX = normalize(cross(reference, axis));
  const basisY = normalize(cross(axis, basisX));
  const upperCenter = add(center, mul(axis, height));
  const positions = [center, upperCenter];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push(add(center, add(mul(basisX, Math.cos(angle) * radius), mul(basisY, Math.sin(angle) * radius))));
  }
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push(add(upperCenter, add(mul(basisX, Math.cos(angle) * radius), mul(basisY, Math.sin(angle) * radius))));
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments, lower = 2 + index, lowerNext = 2 + next, upper = 2 + segments + index, upperNext = 2 + segments + next;
    indices.push(0, lowerNext, lower, 1, upper, upperNext, lower, lowerNext, upperNext, lower, upperNext, upper);
  }
  return finalizeMesh(positions, indices, {role, axis, radius, height, segments});
}

export function transformMesh(mesh, matrix, meta = {}) {
  if (!Array.isArray(matrix) || matrix.length !== 16 || !matrix.every(Number.isFinite)) throw new Error('matrix must be a column-major mat4');
  const positions = mesh.positions.map(([x, y, z]) => {
    const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] || 1;
    return [(matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w, (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w, (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w];
  });
  return finalizeMesh(positions, [...mesh.indices], {...mesh.meta, ...meta});
}

export function mergeMeshes(meshes, meta = {}) {
  const positions = [], indices = [];
  for (const mesh of meshes) {
    const offset = positions.length;
    positions.push(...mesh.positions.map((point) => [...point]));
    indices.push(...mesh.indices.map((index) => index + offset));
  }
  return finalizeMesh(positions, indices, meta);
}

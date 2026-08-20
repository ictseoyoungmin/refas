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

function mappedSurfacePoint([u, v], {width, height, crownX, crownY, twist, lift = 0}) {
  const xUnit = (u - 0.5) * 2;
  const yUnit = (0.5 - v) * 2;
  const x = xUnit * width / 2;
  const y = yUnit * height / 2;
  const z = crownX * (1 - xUnit * xUnit) + crownY * (1 - yUnit * yUnit) + twist * xUnit * yUnit + lift;
  return [x, y, z];
}

export function createCurvedPlate({polygon, width = 2.2, height = 2.8, crownX = 0.18, crownY = 0.10, twist = 0.04, lift = 0, thickness = 0.08, role = 'curved-plate'} = {}) {
  if (!(thickness > 0)) throw new Error('thickness must be positive');
  if (!Array.isArray(polygon) || polygon.length < 3) throw new Error('curved plate requires a polygon with at least three points');
  const points2 = polygon.map((point, index) => finitePoint(point, 2, `polygon[${index}]`));
  const local2 = points2.map(([u, v]) => [(u - 0.5) * width, (0.5 - v) * height]);
  let cycle = [...points2.keys()];
  if (signedArea2(local2) < 0) cycle.reverse();
  const triangles = triangulatePolygon(local2);
  const front = points2.map((point) => mappedSurfacePoint(point, {width, height, crownX, crownY, twist, lift}));
  const back = front.map(([x, y, z]) => [x, y, z - thickness]);
  const positions = [...front, ...back];
  const count = front.length;
  const frontTriangles = triangles.map((triangle) => {
    const normal = cross(sub(front[triangle[1]], front[triangle[0]]), sub(front[triangle[2]], front[triangle[0]]));
    return normal[2] < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle;
  });
  const indices = [];
  for (const triangle of frontTriangles) indices.push(...triangle);
  for (const triangle of frontTriangles) indices.push(triangle[0] + count, triangle[2] + count, triangle[1] + count);
  for (let index = 0; index < cycle.length; index += 1) {
    const a = cycle[index], b = cycle[(index + 1) % cycle.length];
    indices.push(a, a + count, b + count, a, b + count, b);
  }
  return finalizeMesh(positions, indices, {role, sourcePolygon: points2, surface: {width, height, crownX, crownY, twist, lift, thickness}});
}

export function surfacePoint(point, parameters = {}) {
  return mappedSurfacePoint(point, {
    width: Number(parameters.width ?? 2.2), height: Number(parameters.height ?? 2.8),
    crownX: Number(parameters.crownX ?? 0.18), crownY: Number(parameters.crownY ?? 0.10),
    twist: Number(parameters.twist ?? 0.04), lift: Number(parameters.lift ?? 0),
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

export function createCylinder({center = [0, 0, 0], radius = 0.1, height = 0.08, segments = 24, role = 'cylinder'} = {}) {
  center = finitePoint(center, 3, 'center');
  if (!(radius > 0 && height > 0) || !Number.isInteger(segments) || segments < 8) throw new Error('invalid cylinder parameters');
  const positions = [[center[0], center[1], center[2]], [center[0], center[1], center[2] + height]];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, center[2]]);
  }
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    positions.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, center[2] + height]);
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments, lower = 2 + index, lowerNext = 2 + next, upper = 2 + segments + index, upperNext = 2 + segments + next;
    indices.push(0, lowerNext, lower, 1, upper, upperNext, lower, lowerNext, upperNext, lower, upperNext, upper);
  }
  return finalizeMesh(positions, indices, {role, radius, height, segments});
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

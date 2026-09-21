import {assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';

export const SPATIAL_CLOSURE_EVIDENCE_SCHEMA = 'refas.spatial-closure-evidence/v1';
export const SPATIAL_CLOSURE_DEFAULT_CROSS_SECTIONS = Object.freeze([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
export const SPATIAL_CLOSURE_DEFAULT_GRID_RESOLUTION = 8;

const EPS = 1e-12;
const AXES = ['x', 'y', 'z'];
const VIEW_PLANES = Object.freeze({
  FRONT: [0, 1],
  SIDE: [2, 1],
  TOP: [0, 2],
});
const round = (value) => {
  if (!Number.isFinite(value)) throw new Error('spatial evidence cannot contain non-finite measurements');
  const result = Number(Number(value).toFixed(12));
  return Object.is(result, -0) ? 0 : result;
};
const roundVec = (values) => values.map(round);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function normalizeFractions(values = SPATIAL_CLOSURE_DEFAULT_CROSS_SECTIONS) {
  if (!Array.isArray(values) || !values.length) throw new Error('crossSectionFractions must be a non-empty array');
  const normalized = values.map((value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number >= 1) throw new Error(`crossSectionFractions[${index}] must be finite and strictly inside (0, 1)`);
    return round(number);
  });
  if (new Set(normalized).size !== normalized.length) throw new Error('crossSectionFractions must be unique');
  return normalized.sort((a, b) => a - b);
}

function normalizeGridResolution(value = SPATIAL_CLOSURE_DEFAULT_GRID_RESOLUTION) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2 || number > 64) throw new Error('gridResolution must be an integer in [2, 64]');
  return number;
}

const identity4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply4(a, b) {
  const output = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) output[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return output;
}
function nodeMatrix(node) {
  if (node.matrix) {
    if (node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) throw new Error('node matrix must be a finite mat4');
    return [...node.matrix];
  }
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  if (![x, y, z, w, sx, sy, sz, tx, ty, tz].every(Number.isFinite)) throw new Error('node TRS must be finite');
  return [
    (1 - 2*y*y - 2*z*z)*sx, (2*x*y + 2*z*w)*sx, (2*x*z - 2*y*w)*sx, 0,
    (2*x*y - 2*z*w)*sy, (1 - 2*x*x - 2*z*z)*sy, (2*y*z + 2*x*w)*sy, 0,
    (2*x*z + 2*y*w)*sz, (2*y*z - 2*x*w)*sz, (1 - 2*x*x - 2*y*y)*sz, 0,
    tx, ty, tz, 1,
  ];
}
const transformPoint = (matrix, point) => [
  matrix[0]*point[0] + matrix[4]*point[1] + matrix[8]*point[2] + matrix[12],
  matrix[1]*point[0] + matrix[5]*point[1] + matrix[9]*point[2] + matrix[13],
  matrix[2]*point[0] + matrix[6]*point[1] + matrix[10]*point[2] + matrix[14],
];

function worldMatrices(json) {
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (!roots.length) throw new Error('active GLB scene must expose at least one root node');
  const world = new Map(), parent = new Map();
  const walk = (index, parentMatrix = identity4()) => {
    if (world.has(index)) throw new Error(`GLB node ${index} is reachable more than once`);
    const node = json.nodes?.[index];
    if (!node) throw new Error(`missing GLB node ${index}`);
    const matrix = multiply4(parentMatrix, nodeMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) {
      if (parent.has(child)) throw new Error(`GLB node ${child} has multiple parents`);
      parent.set(child, index);
      walk(child, matrix);
    }
  };
  for (const root of roots) walk(root);
  for (let index = 0; index < (json.nodes?.length ?? 0); index += 1) {
    if (json.nodes[index]?.mesh != null && !world.has(index)) throw new Error(`mesh node ${index} is not reachable from active scene`);
  }
  return world;
}

const COMPONENT = {
  5120: {size: 1, read: (view, offset) => view.getInt8(offset)},
  5121: {size: 1, read: (view, offset) => view.getUint8(offset)},
  5122: {size: 2, read: (view, offset) => view.getInt16(offset, true)},
  5123: {size: 2, read: (view, offset) => view.getUint16(offset, true)},
  5125: {size: 4, read: (view, offset) => view.getUint32(offset, true)},
  5126: {size: 4, read: (view, offset) => view.getFloat32(offset, true)},
};
const TYPE_WIDTH = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};

function readAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  const bufferView = json.bufferViews?.[accessor?.bufferView];
  const component = COMPONENT[accessor?.componentType];
  const width = TYPE_WIDTH[accessor?.type];
  if (!accessor || !bufferView || !component || !width || accessor.sparse) throw new Error(`unsupported accessor ${accessorIndex}`);
  if (bufferView.buffer !== 0) throw new Error('spatial closure evidence requires the embedded GLB buffer');
  const stride = Number(bufferView.byteStride ?? component.size * width);
  const start = Number(bufferView.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
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

function readPositionAccessor(json, binary, accessorIndex, partId) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.normalized === true) {
    throw new Error(`${partId}: POSITION accessor must be non-normalized FLOAT VEC3`);
  }
  return readAccessor(json, binary, accessorIndex);
}

function readIndexAccessor(json, binary, accessorIndex, partId) {
  if (accessorIndex == null) return null;
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(accessor.componentType) || accessor.normalized === true) {
    throw new Error(`${partId}: index accessor must be non-normalized unsigned SCALAR`);
  }
  return readAccessor(json, binary, accessorIndex);
}

const subtract = (a, b) => a.map((value, index) => value - b[index]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vectorLength = (value) => Math.hypot(...value);
const triangleArea = (points) => vectorLength(cross(subtract(points[1], points[0]), subtract(points[2], points[0]))) * 0.5;
const triangleBounds = (points) => ({
  min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
  max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
});
const triangleCentroid = (points) => [0, 1, 2].map((axis) => (points[0][axis] + points[1][axis] + points[2][axis]) / 3);

function extractGeometry(glb, scopeId) {
  const bytes = Buffer.from(glb ?? []);
  if (!bytes.length) throw new Error('glb bytes are required');
  const assetSha256 = digestBytes(bytes);
  const {json, binary} = parseGlb(bytes), world = worldMatrices(json);
  const candidates = [];
  for (let nodeIndex = 0; nodeIndex < (json.nodes?.length ?? 0); nodeIndex += 1) {
    const node = json.nodes[nodeIndex];
    if (node.mesh == null) continue;
    const declaredScopeId = node.extras?.scopeId == null ? null : String(node.extras.scopeId);
    if (scopeId !== 'whole' && declaredScopeId !== scopeId) continue;
    candidates.push({nodeIndex, node, declaredScopeId});
  }
  if (!candidates.length) {
    if (scopeId === 'whole') throw new Error('whole-object spatial evidence found no mesh nodes in the active scene');
    throw new Error(`requested scope ${scopeId} is not exposed by any active-scene mesh node extras.scopeId`);
  }

  const vertices = [], triangles = [], selectedNodes = [];
  let primitiveCount = 0;
  for (const {nodeIndex, node, declaredScopeId} of candidates) {
    const partId = String(node.extras?.refasPartId ?? node.name ?? `node-${nodeIndex}`);
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) throw new Error(`${partId}: missing mesh ${node.mesh}`);
    let nodeVertices = 0, nodeTriangles = 0;
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1;
      if ((primitive.mode ?? 4) !== 4) throw new Error(`${partId}: spatial closure evidence supports TRIANGLES primitives only`);
      const local = readPositionAccessor(json, binary, primitive.attributes?.POSITION, partId);
      if (!local.length || !local.every((point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) throw new Error(`${partId}: invalid POSITION accessor`);
      const transformed = local.map((point) => transformPoint(world.get(nodeIndex), point));
      const indices = primitive.indices == null ? transformed.map((_, index) => index) : readIndexAccessor(json, binary, primitive.indices, partId);
      if (indices.length % 3 !== 0 || !indices.every(Number.isInteger)) throw new Error(`${partId}: triangle indices are invalid`);
      vertices.push(...transformed);
      nodeVertices += transformed.length;
      for (let index = 0; index < indices.length; index += 3) {
        const points = [transformed[indices[index]], transformed[indices[index + 1]], transformed[indices[index + 2]]];
        if (points.some((point) => !point)) throw new Error(`${partId}: triangle index is out of range`);
        const area = triangleArea(points);
        if (area <= EPS) continue;
        triangles.push({points, area, bounds: triangleBounds(points), centroid: triangleCentroid(points)});
        nodeTriangles += 1;
      }
    }
    selectedNodes.push({
      nodeIndex,
      meshIndex: node.mesh,
      partId,
      declaredScopeId,
      vertexCount: nodeVertices,
      triangleCount: nodeTriangles,
    });
  }
  if (!vertices.length) throw new Error('selected scope contains no vertices');
  if (!triangles.length) throw new Error('selected scope contains no non-degenerate triangles');

  const min = [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis])));
  const extent = max.map((value, axis) => value - min[axis]);
  if (Math.max(...extent) <= EPS) throw new Error('selected scope has no measurable spatial extent');

  return {
    assetSha256,
    vertices,
    triangles,
    bounds: {min, max, extent},
    selectedNodes: selectedNodes.sort((a, b) => a.nodeIndex - b.nodeIndex),
    primitiveCount,
  };
}

function covariancePrincipalAxes(vertices) {
  const center = [0, 1, 2].map((axis) => vertices.reduce((sum, point) => sum + point[axis], 0) / vertices.length);
  const matrix = Array.from({length: 3}, () => Array(3).fill(0));
  for (const point of vertices) {
    const delta = subtract(point, center);
    for (let row = 0; row < 3; row += 1) for (let column = row; column < 3; column += 1) matrix[row][column] += delta[row] * delta[column];
  }
  const divisor = Math.max(1, vertices.length - 1);
  for (let row = 0; row < 3; row += 1) for (let column = row; column < 3; column += 1) {
    matrix[row][column] /= divisor;
    matrix[column][row] = matrix[row][column];
  }
  const vectors = [[1,0,0],[0,1,0],[0,0,1]];
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const pairs = [[0,1],[0,2],[1,2]];
    pairs.sort((a, b) => Math.abs(matrix[b[0]][b[1]]) - Math.abs(matrix[a[0]][a[1]]) || a[0] - b[0] || a[1] - b[1]);
    const [p, q] = pairs[0];
    if (Math.abs(matrix[p][q]) <= 1e-18) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = matrix[p][p], aqq = matrix[q][q], apq = matrix[p][q];
    matrix[p][p] = c*c*app - 2*s*c*apq + s*s*aqq;
    matrix[q][q] = s*s*app + 2*s*c*apq + c*c*aqq;
    matrix[p][q] = 0; matrix[q][p] = 0;
    for (let r = 0; r < 3; r += 1) if (r !== p && r !== q) {
      const arp = matrix[r][p], arq = matrix[r][q];
      matrix[r][p] = c*arp - s*arq; matrix[p][r] = matrix[r][p];
      matrix[r][q] = s*arp + c*arq; matrix[q][r] = matrix[r][q];
    }
    for (let r = 0; r < 3; r += 1) {
      const vrp = vectors[r][p], vrq = vectors[r][q];
      vectors[r][p] = c*vrp - s*vrq;
      vectors[r][q] = s*vrp + c*vrq;
    }
  }
  const axes = [0, 1, 2].map((column) => {
    let vector = [vectors[0][column], vectors[1][column], vectors[2][column]];
    const length = vectorLength(vector);
    vector = length > EPS ? vector.map((value) => value / length) : [column === 0 ? 1 : 0, column === 1 ? 1 : 0, column === 2 ? 1 : 0];
    let signIndex = 0;
    for (let index = 1; index < 3; index += 1) if (Math.abs(vector[index]) > Math.abs(vector[signIndex]) + EPS) signIndex = index;
    if (vector[signIndex] < 0) vector = vector.map((value) => -value);
    const projections = vertices.map((point) => point[0]*vector[0] + point[1]*vector[1] + point[2]*vector[2]);
    return {
      variance: Math.max(0, matrix[column][column]),
      vector,
      minimum: Math.min(...projections),
      maximum: Math.max(...projections),
      extent: Math.max(...projections) - Math.min(...projections),
      originalIndex: column,
    };
  }).sort((a, b) => b.variance - a.variance || b.extent - a.extent || a.originalIndex - b.originalIndex);
  return {
    centroid: roundVec(center),
    axes: axes.map((axis, index) => ({
      id: `p${index + 1}`,
      vector: roundVec(axis.vector),
      variance: round(axis.variance),
      minimum: round(axis.minimum),
      maximum: round(axis.maximum),
      extent: round(axis.extent),
    })),
  };
}

function projectedTriangleArea(points, a, b) {
  const [p, q, r] = points;
  return Math.abs(p[a]*(q[b]-r[b]) + q[a]*(r[b]-p[b]) + r[a]*(p[b]-q[b])) * 0.5;
}

function projectedSupport(vertices, triangles) {
  const raw = {};
  for (const [viewId, [a, b]] of Object.entries(VIEW_PLANES)) {
    const min = [Math.min(...vertices.map((point) => point[a])), Math.min(...vertices.map((point) => point[b]))];
    const max = [Math.max(...vertices.map((point) => point[a])), Math.max(...vertices.map((point) => point[b]))];
    const extent = [max[0] - min[0], max[1] - min[1]];
    raw[viewId] = {
      plane: `${AXES[a].toUpperCase()}${AXES[b].toUpperCase()}`,
      min,
      max,
      extent,
      boundsArea: extent[0] * extent[1],
      triangleAreaSum: triangles.reduce((sum, triangle) => sum + projectedTriangleArea(triangle.points, a, b), 0),
    };
  }
  const maximumArea = Math.max(...Object.values(raw).map((entry) => entry.boundsArea), EPS);
  return Object.fromEntries(Object.entries(raw).map(([viewId, entry]) => [viewId, {
    plane: entry.plane,
    min: roundVec(entry.min),
    max: roundVec(entry.max),
    extent: roundVec(entry.extent),
    boundsArea: round(entry.boundsArea),
    normalizedBoundsArea: round(entry.boundsArea / maximumArea),
    triangleAreaSum: round(entry.triangleAreaSum),
  }]));
}

function unique2(points, tolerance) {
  const output = [];
  for (const point of points) {
    if (!output.some((other) => Math.hypot(point[0] - other[0], point[1] - other[1]) <= tolerance)) output.push(point);
  }
  return output;
}

function sliceTriangle(points, axis, coordinate, tolerance) {
  const orthogonal = [0, 1, 2].filter((candidate) => candidate !== axis);
  const output = [];
  for (const point of points) if (Math.abs(point[axis] - coordinate) <= tolerance) output.push([point[orthogonal[0]], point[orthogonal[1]]]);
  for (const [leftIndex, rightIndex] of [[0,1],[1,2],[2,0]]) {
    const left = points[leftIndex], right = points[rightIndex];
    const dl = left[axis] - coordinate, dr = right[axis] - coordinate;
    if ((dl < -tolerance && dr > tolerance) || (dl > tolerance && dr < -tolerance)) {
      const t = (coordinate - left[axis]) / (right[axis] - left[axis]);
      output.push([
        left[orthogonal[0]] + (right[orthogonal[0]] - left[orthogonal[0]]) * t,
        left[orthogonal[1]] + (right[orthogonal[1]] - left[orthogonal[1]]) * t,
      ]);
    }
  }
  return unique2(output, tolerance);
}

function crossSections(triangles, bounds, fractions) {
  const output = {};
  for (let axis = 0; axis < 3; axis += 1) {
    const orthogonal = [0, 1, 2].filter((candidate) => candidate !== axis);
    const fullArea = bounds.extent[orthogonal[0]] * bounds.extent[orthogonal[1]];
    const tolerance = Math.max(bounds.extent[axis] * 1e-9, EPS);
    output[AXES[axis]] = fractions.map((fraction) => {
      const coordinate = bounds.min[axis] + bounds.extent[axis] * fraction;
      const points = []; let triangleCount = 0;
      for (const triangle of triangles) {
        if (coordinate < triangle.bounds.min[axis] - tolerance || coordinate > triangle.bounds.max[axis] + tolerance) continue;
        const sliced = sliceTriangle(triangle.points, axis, coordinate, tolerance);
        if (sliced.length >= 2) {
          triangleCount += 1;
          points.push(...sliced);
        }
      }
      let extent = [0, 0], bboxArea = 0;
      if (points.length) {
        const min = [0, 1].map((lane) => Math.min(...points.map((point) => point[lane])));
        const max = [0, 1].map((lane) => Math.max(...points.map((point) => point[lane])));
        extent = [max[0] - min[0], max[1] - min[1]];
        bboxArea = extent[0] * extent[1];
      }
      return {
        fraction,
        coordinate: round(coordinate),
        intersectedTriangles: triangleCount,
        supportPointCount: points.length,
        supportExtent2d: roundVec(extent),
        bboxArea: round(bboxArea),
        bboxAreaRatioToFullProjection: round(fullArea > EPS ? bboxArea / fullArea : 0),
      };
    });
  }
  return output;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q, low = Math.floor(position), high = Math.ceil(position);
  if (low === high) return sorted[low];
  const weight = position - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0;
  return {
    minimum: round(sorted[0] ?? 0),
    q25: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    q75: round(quantile(sorted, 0.75)),
    maximum: round(sorted.at(-1) ?? 0),
    mean: round(mean),
  };
}

function localThickness(triangles, bounds, resolution) {
  const result = {};
  for (let depthAxis = 0; depthAxis < 3; depthAxis += 1) {
    const [u, v] = [0, 1, 2].filter((axis) => axis !== depthAxis);
    const cells = Array.from({length: resolution * resolution}, () => null);
    const uExtent = bounds.extent[u], vExtent = bounds.extent[v];
    const cellRange = (minimum, maximum, axisMinimum, axisExtent) => {
      if (axisExtent <= EPS) return [0, resolution - 1];
      const start = clamp(Math.floor(((minimum - axisMinimum) / axisExtent) * resolution), 0, resolution - 1);
      const end = clamp(Math.floor(((maximum - axisMinimum) / axisExtent) * resolution), 0, resolution - 1);
      return [Math.min(start, end), Math.max(start, end)];
    };
    for (const triangle of triangles) {
      const [u0, u1] = cellRange(triangle.bounds.min[u], triangle.bounds.max[u], bounds.min[u], uExtent);
      const [v0, v1] = cellRange(triangle.bounds.min[v], triangle.bounds.max[v], bounds.min[v], vExtent);
      for (let ui = u0; ui <= u1; ui += 1) for (let vi = v0; vi <= v1; vi += 1) {
        const index = vi * resolution + ui;
        const current = cells[index] ?? {minimum: Infinity, maximum: -Infinity};
        current.minimum = Math.min(current.minimum, triangle.bounds.min[depthAxis]);
        current.maximum = Math.max(current.maximum, triangle.bounds.max[depthAxis]);
        cells[index] = current;
      }
    }
    const occupied = cells.filter(Boolean), thickness = occupied.map((cell) => Math.max(0, cell.maximum - cell.minimum));
    result[AXES[depthAxis]] = {
      depthAxis: AXES[depthAxis],
      gridPlane: `${AXES[u].toUpperCase()}${AXES[v].toUpperCase()}`,
      gridResolution: resolution,
      occupiedCells: occupied.length,
      totalCells: cells.length,
      occupiedCellFraction: round(occupied.length / cells.length),
      thickness: distribution(thickness),
    };
  }
  return result;
}

function frontBackSupport(vertices, triangles, bounds) {
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const tolerance = Math.max(bounds.extent[2] * 1e-9, EPS);
  const countSides = (values) => {
    let front = 0, back = 0, center = 0;
    for (const value of values) {
      if (value > centerZ + tolerance) front += 1;
      else if (value < centerZ - tolerance) back += 1;
      else center += 1;
    }
    const total = Math.max(1, values.length);
    return {
      front: {count: front, fraction: round(front / total)},
      back: {count: back, fraction: round(back / total)},
      center: {count: center, fraction: round(center / total)},
    };
  };
  return {
    axis: 'z',
    convention: 'front=positive-z relative to selected-scope bounds center; back=negative-z',
    center: round(centerZ),
    frontExtent: round(Math.max(0, bounds.max[2] - centerZ)),
    backExtent: round(Math.max(0, centerZ - bounds.min[2])),
    vertices: countSides(vertices.map((point) => point[2])),
    triangles: countSides(triangles.map((triangle) => triangle.centroid[2])),
  };
}

export function createSpatialClosureEvidence({
  glb,
  scopeId = 'whole',
  crossSectionFractions = SPATIAL_CLOSURE_DEFAULT_CROSS_SECTIONS,
  gridResolution = SPATIAL_CLOSURE_DEFAULT_GRID_RESOLUTION,
} = {}) {
  const normalizedScopeId = assertId(scopeId, 'scopeId');
  const fractions = normalizeFractions(crossSectionFractions);
  const resolution = normalizeGridResolution(gridResolution);
  const geometry = extractGeometry(glb, normalizedScopeId);
  const bounds = {
    min: roundVec(geometry.bounds.min),
    max: roundVec(geometry.bounds.max),
    extent: roundVec(geometry.bounds.extent),
    diagonal: round(vectorLength(geometry.bounds.extent)),
  };
  const payload = {
    schema: SPATIAL_CLOSURE_EVIDENCE_SCHEMA,
    assetSha256: geometry.assetSha256,
    scopeId: normalizedScopeId,
    frame: {
      convention: 'gltf-active-scene-world',
      axes: {x: '+X', y: '+Y', z: '+Z'},
      canonicalViews: {FRONT: 'XY', SIDE: 'ZY', TOP: 'XZ'},
    },
    selection: {
      strategy: normalizedScopeId === 'whole' ? 'active-scene-all-mesh-nodes' : 'exact-node-extras-scope-id',
      selectedNodes: geometry.selectedNodes,
    },
    sampling: {
      deterministic: true,
      crossSectionFractions: fractions,
      gridResolution: resolution,
      vertexSubsampling: 'none',
      triangleSubsampling: 'none',
    },
    geometry: {
      nodeCount: geometry.selectedNodes.length,
      primitiveCount: geometry.primitiveCount,
      vertexCount: geometry.vertices.length,
      triangleCount: geometry.triangles.length,
      surfaceArea: round(geometry.triangles.reduce((sum, triangle) => sum + triangle.area, 0)),
    },
    bounds,
    principal: covariancePrincipalAxes(geometry.vertices),
    crossSections: crossSections(geometry.triangles, geometry.bounds, fractions),
    frontBackSupport: frontBackSupport(geometry.vertices, geometry.triangles, geometry.bounds),
    projectedSupport: projectedSupport(geometry.vertices, geometry.triangles),
    localThickness: localThickness(geometry.triangles, geometry.bounds, resolution),
    policy: {
      observationOnly: true,
      semanticInterpretationDeferred: true,
      classifierAuthority: false,
      certificationAuthority: false,
      candidateBytesAreAuthority: true,
    },
  };
  return deepFreeze({...payload, evidenceDigest: digestJson(payload)});
}

export function validateSpatialClosureEvidence(value, {glb} = {}) {
  const errors = [];
  try {
    if (value?.schema !== SPATIAL_CLOSURE_EVIDENCE_SCHEMA) errors.push('invalid schema');
    const recreated = createSpatialClosureEvidence({
      glb,
      scopeId: value?.scopeId,
      crossSectionFractions: value?.sampling?.crossSectionFractions,
      gridResolution: value?.sampling?.gridResolution,
    });
    if (recreated.evidenceDigest !== value?.evidenceDigest) errors.push('spatial closure evidence digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('spatial closure evidence is not canonical for the supplied GLB bytes');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

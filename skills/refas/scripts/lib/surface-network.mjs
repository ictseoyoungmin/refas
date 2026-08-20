import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {createCurvedPlate, createCylinder, createSurfaceRibbon, surfaceFrame, triangulatePolygon} from './mesh.mjs';

export const SURFACE_NETWORK_SCHEMA = 'refas.surface-network/v1';

function point2(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec2`);
  const point = value.map(Number);
  if (point.some((coordinate) => coordinate < 0 || coordinate > 1)) throw new Error(`${label} must use normalized image coordinates in [0,1]`);
  return point;
}

function polygon(value, label) {
  if (!Array.isArray(value) || value.length < 3) throw new Error(`${label} requires at least three points`);
  const points = value.map((point, index) => point2(point, `${label}[${index}]`));
  triangulatePolygon(points);
  return points;
}

function polyline(value, label) {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} requires at least two points`);
  const points = value.map((point, index) => point2(point, `${label}[${index}]`));
  for (let index = 1; index < points.length; index += 1) {
    if (Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]) < 1e-8) throw new Error(`${label} contains a zero-length segment`);
  }
  return points;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function createSurfaceNetwork({
  scopeId,
  sourceSha256,
  cells = [],
  adjacencies = [],
  attestation,
  ambiguities = [],
} = {}) {
  if (attestation?.attested !== true || !Array.isArray(attestation.evidenceRefs) || !attestation.evidenceRefs.length) {
    throw new Error('surface network requires an evidence-cited agent attestation');
  }
  if (!cells.length) throw new Error('surface network requires observed cells');
  const normalizedCells = cells.map((raw, index) => {
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String);
    if (!evidenceRefs.length) throw new Error(`cells[${index}] requires evidenceRefs`);
    const points = polygon(raw.polygon, `cells[${index}].polygon`);
    return {
      id: assertId(raw.id, `cells[${index}].id`),
      label: String(raw.label ?? raw.id),
      polygon: points,
      polygonDigest: digestJson(points),
      evidenceRefs,
    };
  });
  const cellIds = new Set(normalizedCells.map((cell) => cell.id));
  if (cellIds.size !== normalizedCells.length) throw new Error('cell IDs must be unique');
  const seenPairs = new Set();
  const normalizedAdjacencies = adjacencies.map((raw, index) => {
    const a = assertId(raw.a, `adjacencies[${index}].a`);
    const b = assertId(raw.b, `adjacencies[${index}].b`);
    if (a === b || !cellIds.has(a) || !cellIds.has(b)) throw new Error(`adjacencies[${index}] must connect two known distinct cells`);
    const key = pairKey(a, b);
    if (seenPairs.has(key)) throw new Error(`duplicate shared adjacency: ${key}`);
    seenPairs.add(key);
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String);
    if (!evidenceRefs.length) throw new Error(`adjacencies[${index}] requires evidenceRefs`);
    return {
      id: assertId(raw.id ?? `edge-${index}`, `adjacencies[${index}].id`),
      a,
      b,
      polyline: polyline(raw.polyline, `adjacencies[${index}].polyline`),
      evidenceRefs,
    };
  });
  if (new Set(normalizedAdjacencies.map((adjacency) => adjacency.id)).size !== normalizedAdjacencies.length) throw new Error('adjacency IDs must be unique');
  const degree = new Map([...cellIds].map((id) => [id, 0]));
  for (const adjacency of normalizedAdjacencies) {
    degree.set(adjacency.a, degree.get(adjacency.a) + 1);
    degree.set(adjacency.b, degree.get(adjacency.b) + 1);
  }
  const orphanCells = [...degree].filter(([, count]) => count === 0).map(([id]) => id);
  if (orphanCells.length) throw new Error(`observed cells lack shared-boundary ownership: ${orphanCells.join(', ')}`);
  const payload = {
    schema: SURFACE_NETWORK_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    cells: normalizedCells,
    adjacencies: normalizedAdjacencies,
    attestation: {evidenceRefs: attestation.evidenceRefs.map(String), digest: digestJson(attestation)},
    ambiguities: ambiguities.map(String),
    policy: {
      rawReferenceOutranksDerivedSegmentation: true,
      observedTopologyPrecedesProceduralRegularization: true,
      onePhysicalBoundaryPerSharedAdjacency: true,
      duplicatePerCellFramesForbidden: true,
      coordinatesRemainInReferenceSpaceUntilSurfaceMapping: true,
    },
  };
  return deepFreeze({...payload, networkDigest: digestJson(payload)});
}

export function deriveSurfaceJunctions(network, {tolerance = 1e-4} = {}) {
  if (network?.schema !== SURFACE_NETWORK_SCHEMA) throw new Error('valid surface network is required');
  if (!(tolerance > 0 && Number.isFinite(tolerance))) throw new Error('junction tolerance must be positive');
  const clusters = [];
  const addEndpoint = (point, adjacencyId) => {
    let cluster = clusters.find((candidate) => Math.hypot(candidate.point[0] - point[0], candidate.point[1] - point[1]) <= tolerance);
    if (!cluster) {
      cluster = {point: [...point], samples: 0, adjacencyIds: new Set()};
      clusters.push(cluster);
    }
    cluster.samples += 1;
    cluster.point[0] += (point[0] - cluster.point[0]) / cluster.samples;
    cluster.point[1] += (point[1] - cluster.point[1]) / cluster.samples;
    cluster.adjacencyIds.add(adjacencyId);
  };
  for (const adjacency of network.adjacencies) {
    addEndpoint(adjacency.polyline[0], adjacency.id);
    addEndpoint(adjacency.polyline.at(-1), adjacency.id);
  }
  return clusters
    .filter((cluster) => cluster.adjacencyIds.size >= 3)
    .map((cluster, index) => ({id: `junction-${index}`, point: cluster.point, degree: cluster.adjacencyIds.size, adjacencyIds: [...cluster.adjacencyIds].sort()}));
}

export function validateSurfaceNetwork(network) {
  const errors = [];
  if (network?.schema !== SURFACE_NETWORK_SCHEMA) errors.push('invalid schema');
  if (network?.policy?.onePhysicalBoundaryPerSharedAdjacency !== true) errors.push('shared-boundary policy missing');
  if (network?.policy?.duplicatePerCellFramesForbidden !== true) errors.push('duplicate-frame policy missing');
  try {
    createSurfaceNetwork({
      scopeId: network.scopeId,
      sourceSha256: network.sourceSha256,
      cells: network.cells,
      adjacencies: network.adjacencies,
      attestation: {attested: true, evidenceRefs: network.attestation?.evidenceRefs ?? []},
      ambiguities: network.ambiguities,
    });
    const payload = structuredClone(network);
    delete payload.networkDigest;
    if (digestJson(payload) !== network.networkDigest) errors.push('surface network digest mismatch');
    const cells = new Set(network.cells.map((cell) => cell.id));
    const pairs = new Set();
    for (const adjacency of network.adjacencies) {
      if (!cells.has(adjacency.a) || !cells.has(adjacency.b)) errors.push(`${adjacency.id} references an unknown cell`);
      const key = pairKey(adjacency.a, adjacency.b);
      if (pairs.has(key)) errors.push(`duplicate shared adjacency ${key}`);
      pairs.add(key);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {
    valid: errors.length === 0,
    errors,
    cellCount: network?.cells?.length ?? 0,
    adjacencyCount: network?.adjacencies?.length ?? 0,
    sharedBoundaryCount: network?.adjacencies?.length ?? 0,
    junctionCount: network?.schema === SURFACE_NETWORK_SCHEMA ? deriveSurfaceJunctions(network).length : 0,
  };
}

export function createSurfaceNetworkParts(network, {
  surface = {},
  panelMaterialId = 'panel',
  boundaryMaterialId = 'boundary',
  panelLift = 0.015,
  panelThickness = 0.045,
  panelSubdivisions = 2,
  boundaryLift = 0.055,
  boundaryWidth = 0.035,
  boundaryHeight = 0.035,
  boundarySamplesPerSegment = 4,
  boundaryProfile = null,
  boundaryMiterLimit = 1.12,
  junctionRadius = 0.035,
} = {}) {
  const validation = validateSurfaceNetwork(network);
  if (!validation.valid) throw new Error(`surface network is invalid: ${validation.errors.join('; ')}`);
  const panelParts = network.cells.map((cell) => ({
    id: `panel:${cell.id}`,
    role: 'observed-panel',
    scopeId: network.scopeId,
    materialId: panelMaterialId,
    mesh: createCurvedPlate({
      polygon: cell.polygon,
      ...surface,
      normalOffset: panelLift,
      thickness: panelThickness,
      subdivisions: panelSubdivisions,
      role: 'observed-panel',
    }),
  }));
  const boundaryParts = network.adjacencies.map((adjacency) => ({
      id: `boundary:${adjacency.a}:${adjacency.b}`,
      role: 'shared-boundary',
      scopeId: network.scopeId,
      materialId: boundaryMaterialId,
      mesh: createSurfaceRibbon({
        polyline: adjacency.polyline,
        surface,
        normalOffset: boundaryLift,
        width: boundaryWidth,
        height: boundaryHeight,
        samplesPerSegment: boundarySamplesPerSegment,
        profile: boundaryProfile,
        miterLimit: boundaryMiterLimit,
        role: 'shared-boundary',
      }),
    }));
  const junctionParts = deriveSurfaceJunctions(network).map((junction) => {
    const frame = surfaceFrame(junction.point, {...surface, normalOffset: boundaryLift - boundaryHeight / 2});
    return {
      id: `junction:${junction.id}`,
      role: 'boundary-junction',
      scopeId: network.scopeId,
      materialId: boundaryMaterialId,
      mesh: createCylinder({
        center: frame.point,
        axis: frame.normal,
        radius: junctionRadius,
        height: boundaryHeight,
        segments: 16,
        role: 'boundary-junction',
      }),
    };
  });
  return deepFreeze({
    schema: 'refas.surface-network-parts/v1',
    networkDigest: network.networkDigest,
    panelParts,
    boundaryParts,
    junctionParts,
    invariant: {
      observedCells: panelParts.length,
      sharedAdjacencies: network.adjacencies.length,
      physicalBoundaries: boundaryParts.length,
      oneBoundaryPerAdjacency: boundaryParts.length === network.adjacencies.length,
    },
  });
}

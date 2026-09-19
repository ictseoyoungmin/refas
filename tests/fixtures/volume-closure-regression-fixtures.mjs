import {readFileSync} from 'node:fs';

import {
  digestBytes,
  finalizeMesh,
  inspectGlb,
  partsToGlb,
} from '../../skills/refas/scripts/lib/index.mjs';

const MANIFEST = JSON.parse(readFileSync(new URL('./volume-closure-regression-manifest.json', import.meta.url), 'utf8'));
const MATERIALS = Object.freeze({
  'fixture-neutral': Object.freeze({
    baseColor: Object.freeze([0.58, 0.62, 0.68, 1]),
    metallic: 0.05,
    roughness: 0.72,
  }),
});

function boxMesh({center, size, role}) {
  if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) throw new Error('box center must be a finite vec3');
  if (!Array.isArray(size) || size.length !== 3 || !size.every((value) => Number.isFinite(value) && value > 0)) throw new Error('box size must be a positive finite vec3');
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = size.map((value) => value / 2);
  const positions = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  return finalizeMesh(positions, indices, {role, primitive: 'vc00-box', center: [...center], size: [...size]});
}

function part(id, center, size, role = id) {
  return {
    id,
    mesh: boxMesh({center, size, role}),
    materialId: 'fixture-neutral',
    role,
    scopeId: 'whole',
  };
}

const RECIPES = Object.freeze({
  'gpt-planar-bird-surrogate': () => [
    part('torso', [0, 0, 0], [1.2, 2.2, 0.08], 'major-body-volume'),
    part('head', [0, 1.5, 0], [0.9, 0.8, 0.08], 'head-volume'),
    part('wing-near', [-1.15, 0.25, 0], [1.4, 1.5, 0.06], 'near-wing'),
    part('wing-far', [1.15, 0.25, 0], [1.4, 1.5, 0.06], 'far-wing-coplanar-surrogate'),
    part('tail', [0, -1.45, 0], [0.75, 0.8, 0.06], 'tail-volume'),
    part('leg-left', [-0.3, -1.95, 0], [0.16, 0.8, 0.05], 'left-leg'),
    part('leg-right', [0.3, -1.95, 0], [0.16, 0.8, 0.05], 'right-leg'),
  ],
  'claude-volumetric-bird-surrogate': () => [
    part('torso', [0, 0, 0], [1.2, 2.2, 1.2], 'major-body-volume'),
    part('head', [0, 1.5, 0.05], [0.9, 0.8, 0.9], 'head-volume'),
    part('wing-near', [-1.15, 0.25, 0.45], [1.4, 1.5, 0.3], 'near-wing'),
    part('wing-far', [1.15, 0.25, -0.55], [1.4, 1.5, 0.3], 'inferred-far-wing'),
    part('tail', [0, -1.45, -0.1], [0.75, 0.8, 0.55], 'tail-volume'),
    part('leg-left', [-0.3, -1.95, 0.22], [0.16, 0.8, 0.2], 'left-leg'),
    part('leg-right', [0.3, -1.95, -0.22], [0.16, 0.8, 0.2], 'right-leg'),
  ],
  'intentionally-thin-panel': () => [
    part('intentional-panel', [0, 0, 0], [3.7, 4.25, 0.02], 'intentionally-planar-control'),
  ],
  'synthetic-degenerate-volume': () => [
    part('degenerate-volume', [0, 0, 0], [3.7, 4.25, 0.000002], 'volumetric-expectation-degenerate-control'),
  ],
});

function overallBounds(parts) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const entry of parts) {
    for (const point of entry.mesh.positions) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], point[axis]);
        maximum[axis] = Math.max(maximum[axis], point[axis]);
      }
    }
  }
  return {
    min: minimum,
    max: maximum,
    extent: maximum.map((value, axis) => value - minimum[axis]),
  };
}

export function volumeClosureRegressionManifest() {
  return structuredClone(MANIFEST);
}

export function volumeClosureRegressionCase(id) {
  const fixture = MANIFEST.cases.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`unknown VC00 fixture: ${id}`);
  return structuredClone(fixture);
}

export function buildVolumeClosureRegressionFixture(id) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`unknown VC00 fixture recipe: ${id}`);
  const fixture = volumeClosureRegressionCase(id);
  const parts = recipe();
  const bounds = overallBounds(parts);
  const glb = partsToGlb({
    parts,
    materials: MATERIALS,
    assetId: `vc00-${id}`,
    name: `VC00 ${id}`,
    extras: {
      schema: 'refas.vc00-regression-fixture/v1',
      fixtureId: id,
      sourceKind: fixture.sourceKind,
      geometrySource: fixture.geometrySource,
      futureSpatialExpectation: fixture.futureSpatialExpectation,
      regressionOracleOnly: true,
    },
  });
  const inspection = inspectGlb(glb);
  return {
    fixture,
    parts,
    bounds,
    glb,
    glbSha256: digestBytes(glb),
    inspection,
  };
}

export function buildAllVolumeClosureRegressionFixtures() {
  return MANIFEST.cases.map(({id}) => buildVolumeClosureRegressionFixture(id));
}

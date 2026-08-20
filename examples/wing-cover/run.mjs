#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CAPABILITY_ORDER,
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_REVIEW_VIEW_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  appendPartsToClosedGlb,
  assessCertification,
  auditProject,
  beginEdit,
  certifyProject,
  commitCheckpoint,
  contentReference,
  createAssemblyContract,
  createCurvedPlate,
  createCylinder,
  createObservation,
  createReferenceRegistration,
  createSpatialHypothesisSet,
  createSurfaceRibbon,
  createSurfaceNetwork,
  createSurfaceNetworkParts,
  createVisualReview,
  createVisualHierarchy,
  digestBytes,
  finishEdit,
  initProject,
  inspectGlb,
  parseGlb,
  partsToGlb,
  resumeProject,
  sha256File,
  surfaceFrame,
  validateAssemblyContract,
  validateObservation,
  validateRealizedAssembly,
  validateReferenceRegistration,
  validateSpatialHypothesisSet,
  validateSurfaceNetwork,
  validateVisualHierarchy,
} from '../../skills/refas/scripts/lib/index.mjs';

const EXAMPLE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(EXAMPLE, '../..');
const SKILL_SCRIPTS = path.join(REPOSITORY, 'skills/refas/scripts');
const OUTPUT = path.join(EXAMPLE, 'output');
const PROJECT = path.join(OUTPUT, 'project');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, scale) => [a[0] * scale, a[1] * scale];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const length = (a) => Math.hypot(a[0], a[1]);
const normalize = (a) => length(a) > 1e-12 ? mul(a, 1 / length(a)) : [1, 0];

function runPython(script, args) {
  const result = spawnSync(PYTHON, [script, ...args], {
    cwd: REPOSITORY,
    stdio: 'inherit',
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(script)} exited with status ${result.status}`);
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function closestPoint(point, a, b) {
  const edge = sub(b, a);
  const denominator = dot(edge, edge);
  const t = denominator > 1e-15 ? Math.max(0, Math.min(1, dot(sub(point, a), edge) / denominator)) : 0;
  return add(a, mul(edge, t));
}

function segmentGap(a, b, c, d) {
  return Math.min(
    length(sub(a, closestPoint(a, c, d))),
    length(sub(b, closestPoint(b, c, d))),
    length(sub(c, closestPoint(c, a, b))),
    length(sub(d, closestPoint(d, a, b))),
  );
}

function pointAtProjection(a, b, axis, scalar) {
  const edge = sub(b, a);
  const denominator = dot(edge, axis);
  if (Math.abs(denominator) < 1e-12) return mul(add(a, b), 0.5);
  return add(a, mul(edge, (scalar - dot(a, axis)) / denominator));
}

function sharedCenterline(polygonA, polygonB) {
  let best = null;
  for (let left = 0; left < polygonA.length; left += 1) {
    const a = polygonA[left];
    const b = polygonA[(left + 1) % polygonA.length];
    const directionA = normalize(sub(b, a));
    for (let right = 0; right < polygonB.length; right += 1) {
      let c = polygonB[right];
      let d = polygonB[(right + 1) % polygonB.length];
      let directionB = normalize(sub(d, c));
      if (dot(directionA, directionB) < 0) {
        [c, d] = [d, c];
        directionB = mul(directionB, -1);
      }
      const parallel = dot(directionA, directionB);
      const axis = normalize(add(directionA, directionB));
      const intervalA = [dot(a, axis), dot(b, axis)];
      const intervalB = [dot(c, axis), dot(d, axis)];
      const low = Math.max(Math.min(...intervalA), Math.min(...intervalB));
      const high = Math.min(Math.max(...intervalA), Math.max(...intervalB));
      const overlap = Math.max(0, high - low);
      const overlapFraction = overlap / Math.max(1e-12, Math.min(length(sub(b, a)), length(sub(d, c))));
      const gap = segmentGap(a, b, c, d);
      const score = gap + 0.035 * (1 - parallel) - 0.02 * overlapFraction;
      if (!best || score < best.score) best = {a, b, c, d, axis, low, high, score, gap};
    }
  }
  if (!best || best.high <= best.low + 1e-8) {
    const centerA = polygonA.reduce((sum, point) => add(sum, point), [0, 0]).map((value) => value / polygonA.length);
    const centerB = polygonB.reduce((sum, point) => add(sum, point), [0, 0]).map((value) => value / polygonB.length);
    const midpoint = mul(add(centerA, centerB), 0.5);
    const tangent = normalize([-(centerB[1] - centerA[1]), centerB[0] - centerA[0]]);
    const half = Math.max(0.018, Math.min(0.055, length(sub(centerB, centerA)) * 0.3));
    return [add(midpoint, mul(tangent, -half)), add(midpoint, mul(tangent, half))];
  }
  const a0 = pointAtProjection(best.a, best.b, best.axis, best.low);
  const a1 = pointAtProjection(best.a, best.b, best.axis, best.high);
  const b0 = pointAtProjection(best.c, best.d, best.axis, best.low);
  const b1 = pointAtProjection(best.c, best.d, best.axis, best.high);
  return [mul(add(a0, b0), 0.5), mul(add(a1, b1), 0.5)];
}

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function offsetClosedPolyline(points, distance, miterLimit = 1.18) {
  const polygon = signedArea(points) < 0 ? [...points].reverse() : points;
  return polygon.map((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const incoming = normalize(sub(point, previous));
    const outgoing = normalize(sub(next, point));
    const normalIncoming = [-incoming[1], incoming[0]];
    const normalOutgoing = [-outgoing[1], outgoing[0]];
    const miter = normalize(add(normalIncoming, normalOutgoing));
    const denominator = dot(miter, normalOutgoing);
    const scale = Math.max(-miterLimit, Math.min(miterLimit, Math.abs(denominator) > 1e-6 ? 1 / denominator : 1));
    return add(point, mul(miter, distance * scale));
  });
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index], b = polygon[previous];
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]);
    if (crosses && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1] + 1e-30) + a[0]) inside = !inside;
  }
  return inside;
}

function polygonDistance(point, polygon) {
  let distance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    distance = Math.min(distance, length(sub(point, closestPoint(point, polygon[index], polygon[(index + 1) % polygon.length]))));
  }
  return pointInPolygon(point, polygon) ? distance : -distance;
}

function smoothClosedPolyline(points, {
  iterations = 2,
  strength = 0.38,
  preserveTurnDegrees = 24,
  maxPointShift,
  boundary,
  minimumMargin,
} = {}) {
  let result = points.map((point) => [...point]);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const previousResult = result;
    result = previousResult.map((point, index) => {
      const previous = previousResult[(index - 1 + previousResult.length) % previousResult.length];
      const next = previousResult[(index + 1) % previousResult.length];
      const incoming = normalize(sub(point, previous));
      const outgoing = normalize(sub(next, point));
      const turn = Math.acos(Math.max(-1, Math.min(1, dot(incoming, outgoing)))) * 180 / Math.PI;
      if (turn >= preserveTurnDegrees) return point;
      const candidate = add(point, mul(sub(mul(add(previous, next), 0.5), point), strength));
      const delta = sub(candidate, point);
      const limited = length(delta) > maxPointShift ? add(point, mul(delta, maxPointShift / length(delta))) : candidate;
      return polygonDistance(limited, boundary) >= minimumMargin ? limited : point;
    });
  }
  return result;
}

function circlePolygon([centerX, centerY], radius, segments = 16) {
  return Array.from({length: segments}, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
  });
}

function meshProfile(mesh) {
  const size = mesh.analysis.bounds.max.map((maximum, axis) => maximum - mesh.analysis.bounds.min[axis]);
  return {
    boundsSize: size.map((value) => Number(value.toFixed(6))),
    depthToWidth: Number((size[2] / size[0]).toFixed(6)),
    vertexCount: mesh.analysis.vertexCount,
    triangleCount: mesh.analysis.triangleCount,
  };
}

function evidenceRefs(manifest, scope, projectRelativeDirectory) {
  const crop = manifest.items.find((item) => item.id === `${scope}.crop`);
  const context = manifest.items.find((item) => item.id === `${scope}.context`);
  return [
    {
      id: `${scope}.raw-reference`, kind: 'primary', path: 'source/reference.png',
      sha256: manifest.source.sha256, sourceSha256: manifest.source.sha256, primary: true,
    },
    {
      id: `${scope}.crop`, kind: 'derived-observation-aid', path: `${projectRelativeDirectory}/${crop.path}`,
      sha256: crop.sha256, sourceSha256: crop.sourceSha256, recipeDigest: crop.recipeDigest, primary: false,
    },
    {
      id: `${scope}.context`, kind: 'derived-observation-aid', path: `${projectRelativeDirectory}/${context.path}`,
      sha256: context.sha256, sourceSha256: context.sourceSha256, recipeDigest: context.recipeDigest, primary: false,
    },
  ];
}

async function references(files, kind = 'artifact') {
  const output = [];
  for (const file of files) output.push(await contentReference(file, {kind, root: PROJECT}));
  return output;
}

async function closeCapability(capability, files, reason, gateId, claims = []) {
  return commitCheckpoint(PROJECT, {
    capability,
    scopeId: 'whole',
    reason,
    artifactRefs: await references(files),
    claims,
    gates: [{id: gateId, status: 'pass', evidenceRefs: files.map((file) => path.relative(PROJECT, file).split(path.sep).join('/'))}],
  });
}

async function render(glb, directory, reference, size = 256) {
  runPython(path.join(SKILL_SCRIPTS, 'render_glb.py'), ['--glb', glb, '--out', directory, '--reference', reference, '--size', String(size)]);
  const report = await readJson(path.join(directory, 'render-report.json'));
  assert.equal(report.status, 'PASS');
  assert.equal(report.frames.length, 8);
  return report;
}

async function main() {
  await fs.rm(OUTPUT, {recursive: true, force: true});
  await fs.mkdir(path.join(PROJECT, 'source'), {recursive: true});
  const fixture = await readJson(path.join(EXAMPLE, 'fixture.json'));
  assert.equal(fixture.cells.length, 16);
  assert.equal(fixture.adjacencies.length, 31);

  const reference = path.join(PROJECT, 'source', 'reference.png');
  runPython(path.join(EXAMPLE, 'generate_reference.py'), ['--fixture', path.join(EXAMPLE, 'fixture.json'), '--out', reference]);
  const sourceManifestPath = path.join(PROJECT, 'source', 'source-manifest.json');
  runPython(path.join(SKILL_SCRIPTS, 'source_manifest.py'), [
    '--root', PROJECT, '--image', reference, '--id', 'wing-cover-reference', '--out', sourceManifestPath,
    '--acquisition', JSON.stringify({kind: 'deterministic-project-fixture', license: fixture.license}),
  ]);
  const source = await readJson(sourceManifestPath);
  await initProject(PROJECT, {projectId: 'wing-cover-dogfood', source});

  const sourceCheckpoint = await closeCapability(
    'source-intake', [reference, sourceManifestPath], 'Primary reference bytes and acquisition context are bound.',
    'source-integrity', ['Raw reference SHA-256 and image dimensions verified.'],
  );
  assert.equal((await resumeProject(PROJECT)).activeWork.capability, 'visual-hierarchy');

  const evidenceScopes = [
    ['whole', '0,0,1,1'],
    ['cover', '0.08,0.01,0.86,0.97'],
    ['fastener', '0.73,0.51,0.12,0.13'],
  ];
  const manifests = {};
  for (const [scope, roi] of evidenceScopes) {
    const directory = path.join(PROJECT, 'evidence', scope);
    runPython(path.join(SKILL_SCRIPTS, 'evidence.py'), ['--image', reference, '--out', directory, '--scope', scope, '--roi', roi, '--padding', '0.08']);
    manifests[scope] = await readJson(path.join(directory, 'manifest.json'));
  }

  const hierarchy = createVisualHierarchy({
    source: {path: source.path, sha256: source.sha256, width: source.width, height: source.height},
    nodes: [
      {id: 'whole', label: 'Whole wing cover', level: 'whole', parentId: null, roi: [0, 0, 1, 1], contextPadding: 0, status: 'observed'},
      {id: 'upper-cover', label: 'Upper cover shell', level: 'region', parentId: 'whole', roi: [0.08, 0.01, 0.86, 0.97], contextPadding: 0.06, status: 'observed'},
      {id: 'panel-network', label: 'Observed panel network', level: 'part', parentId: 'upper-cover', roi: [0.18, 0.06, 0.64, 0.83], contextPadding: 0.08, status: 'observed'},
      {id: 'center-fastener', label: 'Center fastener', level: 'part', parentId: 'upper-cover', roi: [0.73, 0.51, 0.12, 0.13], contextPadding: 0.1, status: 'observed'},
    ],
  });
  assert.equal(validateVisualHierarchy(hierarchy).valid, true);
  const hierarchyPath = await writeJson(path.join(PROJECT, 'model', 'visual-hierarchy.json'), hierarchy);
  await closeCapability('visual-hierarchy', [hierarchyPath, path.join(PROJECT, 'evidence', 'whole', 'evidence-board.png')], 'Whole-to-part scopes preserve full-frame ancestry and contextual crops.', 'hierarchy-coverage', ['Whole, shell, panel network, and fastener have semantic owners.']);

  const observations = [
    createObservation({
      hierarchy, nodeId: 'whole', evidence: evidenceRefs(manifests.whole, 'whole', 'evidence/whole'),
      facts: [{claim: 'A tapered asymmetric cover silhouette contains pale cyan cells separated by a bright brass-colored structural network.', evidenceIds: ['whole.raw-reference', 'whole.crop']}],
      interpretations: ['The pale cyan cells read as shallow enamel panels over a differentiated brass support and trim system.'],
      hypotheses: ['The shell has a shallow compound crown rather than being planar.'],
      ambiguities: ['The hidden rear support and exact physical thickness are not visible.'],
    }),
    createObservation({
      hierarchy, nodeId: 'panel-network', evidence: evidenceRefs(manifests.cover, 'cover', 'evidence/cover'),
      facts: [{claim: 'Sixteen distinct pale cyan cells are visible, with thirty-one attested pairwise adjacencies.', evidenceIds: ['cover.raw-reference', 'cover.crop']}],
      interpretations: ['The bright gaps likely correspond to one shared raised boundary per adjacent pair.'],
      hypotheses: ['Each cell can be modeled as a thin curved plate conforming to one host surface.'],
      ambiguities: ['Some boundary endpoints merge into the outer rim and remain visually crowded.'],
    }),
    createObservation({
      hierarchy, nodeId: 'center-fastener', evidence: evidenceRefs(manifests.fastener, 'fastener', 'evidence/fastener'),
      facts: [{claim: 'A circular bright fastener overlaps the shell inside the right half of the cover.', evidenceIds: ['fastener.raw-reference', 'fastener.crop']}],
      interpretations: ['The fastener appears raised above the panel surface.'],
      hypotheses: ['A shallow cylinder attached to the shell explains its contour and highlight.'],
      ambiguities: ['The hidden stem and fastening mechanism are not visible.'],
    }),
  ];
  for (const observation of observations) assert.equal(validateObservation(observation, hierarchy).valid, true);
  const observationPaths = [];
  for (const observation of observations) observationPaths.push(await writeJson(path.join(PROJECT, 'model', `observation-${observation.nodeId}.json`), observation));
  await closeCapability('visual-observation', [...observationPaths, ...evidenceScopes.map(([scope]) => path.join(PROJECT, 'evidence', scope, 'manifest.json'))], 'Visible facts, interpretations, hypotheses, and ambiguities are separated and source-cited.', 'observation-authority');

  const spatial = createSpatialHypothesisSet({
    scopeId: 'whole', sourceSha256: source.sha256, selectedId: 'projection-anchored-compound-bend',
    attestation: {attested: true, evidenceRefs: ['evidence/whole/evidence-board.png']},
    hypotheses: [
      {
        id: 'projection-anchored-compound-bend', description: 'A projection-anchored compound bend controlled by multiple transverse profiles and a longitudinal guide.', camera: {projection: 'perspective', fovY: 31}, hiddenForm: 'normal-offset rear thickness following the guided front surface',
        predictions: {silhouette: 'Taper remains stable in the reference camera.', occlusion: 'Fastener stays in front of the shell.', sideView: 'Thin continuous compound bend.', topView: 'Broad asymmetric plan.', grazing: 'Continuous folded profile, rim, and raised ribs.'},
        falsifiers: ['A side render requiring a deep bowl to retain the hero contour.'], evidenceRefs: ['evidence/whole/evidence-board.png'], evidenceCoverage: 0.92, assumptionCost: 0.18, status: 'selected-candidate',
      },
      {
        id: 'deep-perspective-bowl', description: 'A deep bowl whose apparent shallowness comes from perspective.', camera: {projection: 'perspective', fovY: 55}, hiddenForm: 'deep rear bowl',
        predictions: {silhouette: 'Perspective taper increases.', occlusion: 'Rim hides more cells.', sideView: 'Deep bowl.', topView: 'Compressed plan.', grazing: 'Strong tangent break.'},
        falsifiers: ['The observed broad plan and soft grazing transition.'], evidenceRefs: ['evidence/whole/evidence-board.png'], evidenceCoverage: 0.55, assumptionCost: 0.46, status: 'falsified',
      },
    ],
  });
  assert.equal(validateSpatialHypothesisSet(spatial).valid, true);
  const coverRoi = [0.08, 0.01, 0.86, 0.97];
  const parentPoints = [[0.12, 0.05], [0.9, 0.05], [0.9, 0.94], [0.12, 0.94], [0.5, 0.5]];
  const registration = createReferenceRegistration({
    parentFrameId: 'whole-frame', childFrameId: 'upper-cover-frame', parentSourceSha256: source.sha256,
    childSourceSha256: manifests.cover.items.find((item) => item.id === 'cover.crop').sha256,
    model: 'projective-homography',
    correspondences: parentPoints.map((parent, index) => ({id: `anchor-${index}`, parent, child: [(parent[0] - coverRoi[0]) / coverRoi[2], (parent[1] - coverRoi[1]) / coverRoi[3]], evidenceRefs: ['evidence/cover/context.png']})),
    attestation: {attested: true, evidenceRefs: ['evidence/cover/context.png']},
    ambiguities: ['The registration constrains placement only; hidden shape remains inferred.'],
  });
  assert.equal(validateReferenceRegistration(registration).valid, true);
  const spatialPath = await writeJson(path.join(PROJECT, 'model', 'spatial-hypotheses.json'), spatial);
  const registrationPath = await writeJson(path.join(PROJECT, 'model', 'reference-registration.json'), registration);
  await closeCapability('spatial-hypotheses', [spatialPath, registrationPath], 'Camera and hidden-form alternatives were compared before geometry construction.', 'spatial-plausibility', ['Deep-bowl competitor falsified by diagnostic predictions.']);

  const materials = fixture.appearanceRegression.materials;
  const surface = fixture.surface;
  const guidedBounds = surface.guidedSurface.bounds;
  const domainScale = (guidedBounds.max[1] - guidedBounds.min[1]) / surface.guidedSurface.projection.observedHeight;
  const domainDistance = (worldDistance) => worldDistance * domainScale;
  const shellMesh = createCurvedPlate({
    polygon: fixture.outline,
    ...surface,
    subdivisions: fixture.resolution.shellSubdivisions,
    role: 'dominant-shell',
  });
  const shapeProfile = meshProfile(shellMesh);
  const depthToWidthError = Math.abs(shapeProfile.depthToWidth - fixture.shapeRegression.hostShellDepthToWidth);
  assert.ok(depthToWidthError <= fixture.shapeRegression.allowedDepthToWidthError);
  assert.ok(shapeProfile.triangleCount >= 10_000);
  const shapeGlb = partsToGlb({parts: [{id: 'dominant-shell', role: 'dominant-shell', scopeId: 'whole', materialId: 'brass-light', mesh: shellMesh}], materials, assetId: 'wing-cover-shape'});
  const shapePath = path.join(PROJECT, 'assets', 'shape.glb');
  await fs.writeFile(shapePath, shapeGlb);
  const shapeSpecPath = await writeJson(path.join(PROJECT, 'model', 'shape-spec.json'), {
    schema: 'refas.shape-spec/v1',
    sourceSha256: source.sha256,
    selectedHypothesisDigest: spatial.hypothesisSetDigest,
    outline: fixture.outline,
    surface,
    resolution: fixture.resolution,
    regression: {
      target: fixture.shapeRegression,
      actual: shapeProfile,
      checks: {depthToWidthError: Number(depthToWidthError.toFixed(6)), profileWithinTolerance: true},
    },
    ambiguity: 'Rear geometry is least-committed support geometry.',
  });
  await closeCapability('shape-reconstruction', [shapePath, shapeSpecPath], 'Dominant silhouette, measured compound curvature, normal-aligned thickness, and watertight shell are closed before decoration.', 'silhouette-and-mass', ['Shell mesh is finite, watertight, winding-consistent, and within the legacy depth-profile tolerance.']);

  const cellsById = new Map(fixture.cells.map((cell) => [cell.id, cell]));
  const network = createSurfaceNetwork({
    scopeId: 'whole', sourceSha256: source.sha256,
    cells: fixture.cells.map((cell) => ({...cell, label: `Observed ${cell.id}`, evidenceRefs: ['evidence/cover/crop.png']})),
    adjacencies: fixture.adjacencies.map((adjacency, index) => ({id: `shared-${String(index).padStart(2, '0')}`, ...adjacency, polyline: sharedCenterline(cellsById.get(adjacency.a).polygon, cellsById.get(adjacency.b).polygon), evidenceRefs: ['evidence/cover/crop.png']})),
    attestation: {attested: true, evidenceRefs: ['evidence/cover/crop.png']},
    ambiguities: ['Crowded boundary endpoints may merge into the outer rim.'],
  });
  const networkValidation = validateSurfaceNetwork(network);
  assert.equal(networkValidation.valid, true);
  assert.equal(networkValidation.cellCount, 16);
  assert.equal(networkValidation.adjacencyCount, 31);
  const networkParts = createSurfaceNetworkParts(network, {
    surface,
    panelMaterialId: 'enamel',
    boundaryMaterialId: 'brass-light',
    panelLift: 0.014,
    panelThickness: 0.012,
    panelSubdivisions: fixture.resolution.panelSubdivisions,
    boundaryLift: 0.006,
    boundaryWidth: domainDistance(0.048),
    boundaryHeight: 0.032,
    boundarySamplesPerSegment: 1,
    boundaryProfile: 'beveled',
    boundaryMiterLimit: 1.12,
    junctionRadius: 0.032,
  });
  assert.equal(networkParts.invariant.oneBoundaryPerAdjacency, true);
  assert.equal(networkParts.boundaryParts.length, 31);
  const surfaceGlb = partsToGlb({
    parts: [{id: 'support-shell', role: 'dominant-shell', scopeId: 'whole', materialId: 'brass-light', mesh: shellMesh}, ...networkParts.panelParts, ...networkParts.boundaryParts, ...networkParts.junctionParts],
    materials, assetId: 'wing-cover-surface', extras: {networkDigest: network.networkDigest},
  });
  const networkPath = await writeJson(path.join(PROJECT, 'model', 'surface-network.json'), network);
  const surfaceAssetPath = path.join(PROJECT, 'assets', 'surface-network.glb');
  await fs.writeFile(surfaceAssetPath, surfaceGlb);
  const networkReportPath = await writeJson(path.join(PROJECT, 'reviews', 'surface-network-validation.json'), {...networkValidation, invariant: networkParts.invariant});
  await closeCapability('surface-topology', [networkPath, surfaceAssetPath, networkReportPath], 'Sixteen observed cells and thirty-one unique shared adjacencies are realized without duplicate per-cell frames.', 'surface-topology', ['One physical boundary exists for each attested shared adjacency.']);

  const rimWidth = domainDistance(0.092);
  const rimCenterline = smoothClosedPolyline(
    offsetClosedPolyline(fixture.outline, domainDistance(0.043), 1.18),
    {
      iterations: 2,
      strength: 0.38,
      preserveTurnDegrees: 24,
      maxPointShift: rimWidth * 0.18,
      boundary: fixture.outline,
      minimumMargin: rimWidth * 0.18,
    },
  );
  const rimParts = [{
    id: 'outer-rim', role: 'outer-rim', scopeId: 'whole', materialId: 'brass-light',
    mesh: createSurfaceRibbon({
      polyline: rimCenterline,
      surface,
      normalOffset: 0.004,
      width: rimWidth,
      height: 0.048,
      samplesPerSegment: 1,
      closed: true,
      profile: 'crowned',
      miterLimit: 1.16,
      role: 'outer-rim',
    }),
  }];
  const fastenerBaseFrame = surfaceFrame(fixture.fastener.center, {...surface, normalOffset: 0.012});
  const fastenerRingFrame = surfaceFrame(fixture.fastener.center, {...surface, normalOffset: 0.057});
  const fastenerInlayFrame = surfaceFrame(fixture.fastener.center, {...surface, normalOffset: 0.075});
  const fastenerMesh = createCylinder({center: fastenerBaseFrame.point, axis: fastenerBaseFrame.normal, radius: 0.075, height: 0.052, segments: 36, role: 'fastener-base'});
  const fastenerRingMesh = createCylinder({center: fastenerRingFrame.point, axis: fastenerRingFrame.normal, radius: 0.055, height: 0.023, segments: 36, role: 'fastener-ring'});
  const fastenerInlayMesh = createCylinder({center: fastenerInlayFrame.point, axis: fastenerInlayFrame.normal, radius: 0.035, height: 0.022, segments: 36, role: 'fastener-inlay'});
  const assemblyResult = appendPartsToClosedGlb(surfaceGlb, {
    parts: [
      ...rimParts,
      {id: 'fastener-base', role: 'fastener-base', scopeId: 'whole.center-fastener', materialId: 'brass-dark', mesh: fastenerMesh},
      {id: 'fastener-ring', role: 'fastener-ring', scopeId: 'whole.center-fastener', materialId: 'brass-light', mesh: fastenerRingMesh},
      {id: 'fastener-inlay', role: 'fastener-inlay', scopeId: 'whole.center-fastener', materialId: 'rivet-inlay', mesh: fastenerInlayMesh},
    ], materials,
    name: 'Wing cover assembly', extras: {registrationDigest: registration.registrationDigest},
  });
  const finalAssetPath = path.join(PROJECT, 'assets', 'wing-cover.glb');
  await fs.writeFile(finalAssetPath, assemblyResult.glb);
  const finalAssetJson = parseGlb(assemblyResult.glb).json;
  const materialTable = Object.fromEntries(finalAssetJson.materials.map((material) => [material.name, {
    baseColor: material.pbrMetallicRoughness.baseColorFactor,
    metallic: material.pbrMetallicRoughness.metallicFactor,
    roughness: material.pbrMetallicRoughness.roughnessFactor,
  }]));
  assert.deepEqual(materialTable, materials);
  const materialAssignments = Object.fromEntries(finalAssetJson.nodes.map((node) => [node.extras?.role, node.extras?.materialId]).filter(([role]) => role));
  for (const node of finalAssetJson.nodes) {
    const expectedMaterial = fixture.appearanceRegression.assignments[node.extras?.role];
    if (expectedMaterial) assert.equal(node.extras.materialId, expectedMaterial);
  }
  for (const role of ['dominant-shell', 'observed-panel', 'shared-boundary', 'outer-rim', 'fastener-base', 'fastener-ring', 'fastener-inlay']) {
    assert.equal(materialAssignments[role], fixture.appearanceRegression.assignments[role]);
  }
  const fastenerPolygon = circlePolygon(fixture.fastener.center, fixture.fastener.radius);
  const assemblyContract = createAssemblyContract({
    scopeId: 'whole', sourceSha256: source.sha256,
    parts: [
      {id: 'shell', observedPolygon: fixture.outline, rootAnchor: [0.5, 0.5], depthBand: [0.1, 0.3], evidenceRefs: ['evidence/cover/crop.png']},
      {id: 'fastener', scopeId: 'whole.center-fastener', observedPolygon: fastenerPolygon, rootAnchor: fixture.fastener.center, depthBand: [0.31, 0.5], evidenceRefs: ['evidence/fastener/crop.png']},
    ],
    relations: [
      {kind: 'in-front-of', subjectId: 'fastener', objectId: 'shell', evidenceRefs: ['evidence/fastener/context.png']},
      {kind: 'attached-to', subjectId: 'fastener', objectId: 'shell', evidenceRefs: ['evidence/fastener/context.png']},
    ],
    supportZones: [{id: 'fastener-support', polygon: circlePolygon(fixture.fastener.center, fixture.fastener.radius * 1.7), evidenceRefs: ['evidence/fastener/context.png']}],
    supportHypotheses: [{partId: 'fastener', ownerId: 'shell', zoneId: 'fastener-support', status: 'bounded-hypothesis', evidenceRefs: ['evidence/fastener/context.png']}],
    closedChildren: [{partId: 'shell', frameId: 'upper-cover-frame', glbSha256: digestBytes(surfaceGlb), registrationDigest: registration.registrationDigest}],
    attestation: {attested: true, evidenceRefs: ['evidence/cover/evidence-board.png', 'evidence/fastener/evidence-board.png']},
    ambiguities: ['The hidden fastener stem remains a bounded support hypothesis.'],
  });
  assert.equal(validateAssemblyContract(assemblyContract).valid, true);
  const assemblyValidation = validateRealizedAssembly({
    contract: assemblyContract,
    realizedParts: [
      {id: 'shell', projectedPolygon: fixture.outline, rootAnchor: [0.5, 0.5], depth: 0.2, supported: true, penetrationCount: 0, meshAnalysis: shellMesh.analysis},
      {id: 'fastener', projectedPolygon: fastenerPolygon, rootAnchor: fixture.fastener.center, depth: 0.4, supported: true, penetrationCount: 0, meshAnalysis: fastenerMesh.analysis},
    ],
    compositionReports: [{partId: 'shell', ...assemblyResult.report}],
  });
  assert.equal(assemblyValidation.valid, true);
  const assemblyContractPath = await writeJson(path.join(PROJECT, 'model', 'assembly-contract.json'), assemblyContract);
  const assemblyValidationPath = await writeJson(path.join(PROJECT, 'reviews', 'assembly-validation.json'), assemblyValidation);
  const compositionPath = await writeJson(path.join(PROJECT, 'reviews', 'closed-child-composition.json'), assemblyResult.report);
  const baselineRenderDirectory = path.join(PROJECT, 'renders', 'assembly-baseline');
  await render(finalAssetPath, baselineRenderDirectory, reference, 220);
  const assemblyCheckpoint = await closeCapability('assembly', [finalAssetPath, assemblyContractPath, assemblyValidationPath, compositionPath, path.join(baselineRenderDirectory, 'render-report.json'), path.join(baselineRenderDirectory, 'multiview-review-board.png')], 'Closed surface asset is preserved as an immutable child; fastener attachment and occlusion pass actual-render review.', 'assembly-integrity');

  const baselineSha256 = await sha256File(finalAssetPath);
  await beginEdit(PROJECT, {ownerCapability: 'assembly', scopeId: 'whole', intent: 'test an alternative fastener root placement', protectedMetrics: ['attachment', 'child-integrity']});
  const badCenter = [0.25, 0.2];
  const badFastenerFrame = surfaceFrame(badCenter, {...surface, normalOffset: 0.28});
  const badFastenerRingFrame = surfaceFrame(badCenter, {...surface, normalOffset: 0.355});
  const badFastenerInlayFrame = surfaceFrame(badCenter, {...surface, normalOffset: 0.37});
  const badFastener = createCylinder({center: badFastenerFrame.point, axis: badFastenerFrame.normal, radius: 0.09, height: 0.09, segments: 32, role: 'fastener-base'});
  const badFastenerRing = createCylinder({center: badFastenerRingFrame.point, axis: badFastenerRingFrame.normal, radius: 0.055, height: 0.03, segments: 24, role: 'fastener-ring'});
  const badFastenerInlay = createCylinder({center: badFastenerInlayFrame.point, axis: badFastenerInlayFrame.normal, radius: 0.034, height: 0.022, segments: 24, role: 'fastener-inlay'});
  const badAssembly = appendPartsToClosedGlb(surfaceGlb, {
    parts: [
      ...rimParts,
      {id: 'fastener-base', role: 'fastener-base', scopeId: 'whole.center-fastener', materialId: 'brass-dark', mesh: badFastener},
      {id: 'fastener-ring', role: 'fastener-ring', scopeId: 'whole.center-fastener', materialId: 'brass-light', mesh: badFastenerRing},
      {id: 'fastener-inlay', role: 'fastener-inlay', scopeId: 'whole.center-fastener', materialId: 'rivet-inlay', mesh: badFastenerInlay},
    ], materials,
    name: 'Rejected wing cover assembly', extras: {registrationDigest: registration.registrationDigest},
  });
  await fs.writeFile(finalAssetPath, badAssembly.glb);
  const candidateSha256 = await sha256File(finalAssetPath);
  assert.notEqual(candidateSha256, baselineSha256);
  const candidateRenderDirectory = path.join(PROJECT, 'renders', 'assembly-candidate');
  await render(finalAssetPath, candidateRenderDirectory, reference, 180);
  const candidateCheckpoint = await commitCheckpoint(PROJECT, {
    capability: 'assembly', scopeId: 'whole', reason: 'Alternative root placement is materialized with actual multiview evidence for bounded comparison.',
    artifactRefs: await references([finalAssetPath, path.join(candidateRenderDirectory, 'render-report.json'), path.join(candidateRenderDirectory, 'multiview-review-board.png')]),
    gates: [{id: 'candidate-observable', status: 'pass', evidenceRefs: ['renders/assembly-candidate/multiview-review-board.png']}],
  });
  const decision = await finishEdit(PROJECT, {
    candidateCheckpointId: candidateCheckpoint.id,
    before: {checkpointId: assemblyCheckpoint.id, evidenceRefs: ['renders/assembly-baseline/multiview-review-board.png'], utilityScore: 0.86, metrics: {attachmentRootError: 0}},
    after: {checkpointId: candidateCheckpoint.id, evidenceRefs: ['renders/assembly-candidate/multiview-review-board.png'], utilityScore: 0.93, protectedRegressions: ['attachment'], metrics: {attachmentRootError: 0.58}},
    findings: [{category: 'attachment-mismatch', severity: 'major', scopeId: 'whole.center-fastener', summary: 'The candidate fastener floats away from its observed support zone.', evidenceRefs: ['renders/assembly-candidate/grazing.png'], introducedByEdit: true}],
  });
  assert.equal(decision.action, 'ROLLBACK_EDIT');
  const restoredSha256 = await sha256File(finalAssetPath);
  assert.equal(restoredSha256, baselineSha256);
  const rollbackProofPath = await writeJson(path.join(PROJECT, 'reviews', 'rollback-proof.json'), {
    schema: 'refas.rollback-proof/v1', baselineCheckpointId: assemblyCheckpoint.id, rejectedCandidateCheckpointId: candidateCheckpoint.id,
    decisionId: decision.id, action: decision.action, baselineSha256, candidateSha256, restoredSha256,
    byteExactRestore: restoredSha256 === baselineSha256, findingCategory: 'attachment-mismatch', ownerCapability: 'assembly',
  });

  const appearancePath = await writeJson(path.join(PROJECT, 'model', 'appearance.json'), {
    schema: 'refas.appearance-spec/v1', sourceSha256: source.sha256, materials,
    regressionTarget: fixture.appearanceRegression,
    materialAssignments,
    evidenceRefs: ['source/reference.png', 'evidence/cover/crop.png', 'evidence/fastener/crop.png'],
    ambiguities: ['The PBR factors and semantic assignments match the comparison GLB exactly; environment-dependent highlight appearance still requires independent visual review.'],
  });
  await closeCapability('appearance', [finalAssetPath, appearancePath, rollbackProofPath], 'Pale cyan enamel, light and dark brass, and the fastener inlay preserve the exact comparison-GLB PBR factors and semantic assignments.', 'appearance-data-integrity');

  const finalRenderDirectory = path.join(PROJECT, 'renders', 'final');
  const finalRenderReport = await render(finalAssetPath, finalRenderDirectory, reference, 280);
  const finalReportPath = path.join(finalRenderDirectory, 'render-report.json');
  const finalBoardPath = path.join(finalRenderDirectory, 'multiview-review-board.png');
  await closeCapability('rendering', [finalAssetPath, finalReportPath, finalBoardPath, ...finalRenderReport.frames.map((frame) => path.join(finalRenderDirectory, frame.path))], 'Actual GLB geometry renders in every standard diagnostic view with reproducible camera records.', 'multiview-render-integrity');

  const findingsPath = await writeJson(path.join(PROJECT, 'reviews', 'findings.json'), {
    schema: 'refas.finding-ledger/v1', sourceSha256: source.sha256, assetSha256: await sha256File(finalAssetPath),
    resolved: [
      {category: 'attachment-mismatch', decisionId: decision.id, resolution: 'byte-exact rollback'},
      {category: 'material-mismatch', resolution: 'Exact four-material PBR table and semantic assignments restored from the digest-bound comparison asset.'},
      {category: 'finish-mismatch', resolution: 'Enamel, light brass, dark brass, and rivet inlay remain distinct in the final GLB.'},
    ],
    unresolvedBlocking: [{category: 'closure-evidence-missing', severity: 'major', scopeId: 'whole', summary: 'The contract fixture is self-generated and cannot substitute for independent visual acceptance.', evidenceRefs: ['renders/final/multiview-review-board.png']}],
    unresolvedNonBlocking: [],
    critiqueOrder: ['source-and-camera', 'silhouette', 'mass-and-curvature', 'attachment-and-occlusion', 'surface-topology', 'appearance', 'microdetail'],
  });
  await closeCapability('visual-critique', [findingsPath, finalBoardPath, rollbackProofPath], 'Contract-fixture critique artifacts are readable; independent visual acceptance remains pending.', 'contract-critique-integrity');

  const preClosureAudit = await auditProject(PROJECT);
  assert.equal(preClosureAudit.valid, true);
  const visualReview = createVisualReview({
    scopeId: 'whole', sourceSha256: source.sha256, assetSha256: await sha256File(finalAssetPath),
    evidenceClass: 'self-generated-contract-fixture', verdict: 'insufficient',
    views: REQUIRED_REVIEW_VIEW_IDS.map((id) => ({
      id, status: 'insufficient',
      evidenceRefs: [`renders/final/${id}.png`, 'renders/final/multiview-review-board.png'],
    })),
    gateVerdicts: REQUIRED_VISUAL_GATE_IDS.map((id) => ({
      id, status: id === 'multiview-render-integrity' ? 'pass' : id === 'no-blocking-findings' ? 'fail' : 'insufficient',
      evidenceRefs: ['renders/final/multiview-review-board.png'],
    })),
    unresolvedFindings: [
      {category: 'closure-evidence-missing', severity: 'major', scopeId: 'whole', summary: 'The contract fixture demonstrates exact geometry and PBR data parity but does not independently attest visual fidelity.', evidenceRefs: ['renders/final/multiview-review-board.png']},
    ],
    renderer: {
      kind: finalRenderReport.runtime.kind, reportRef: 'renders/final/render-report.json', claimScope: finalRenderReport.claimScope,
      supportedMaterialFeatures: finalRenderReport.materialSupport.supported,
      unsupportedMaterialFeatures: finalRenderReport.materialSupport.unsupported,
    },
    requiredMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
    attestation: {attested: true, evidenceRefs: ['source/reference.png', 'renders/final/multiview-review-board.png']},
  });
  const visualReviewPath = await writeJson(path.join(PROJECT, 'reviews', 'visual-review.json'), visualReview);
  const closureGates = REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
    id, status: 'pass',
    evidenceRefs: [REQUIRED_VISUAL_GATE_IDS.includes(id) ? 'reviews/visual-review.json' : id === 'project-audit' ? '.refas/project.json' : 'source/source-manifest.json'],
  }));
  const closurePath = await writeJson(path.join(PROJECT, 'reviews', 'closure-gates.json'), closureGates);
  const certificationArtifacts = await references([finalAssetPath, closurePath, finalReportPath, finalBoardPath, findingsPath, rollbackProofPath]);
  certificationArtifacts.push(await contentReference(visualReviewPath, {kind: 'visual-review', root: PROJECT}));
  const certificationCheckpoint = await commitCheckpoint(PROJECT, {
    capability: 'whole-object-certification', scopeId: 'whole', reason: 'Negative contract test: stale passing gate claims must not override the digest-bound visual review.',
    artifactRefs: certificationArtifacts,
    claims: ['This self-generated fixture tests runtime contracts only and is not publishable visual evidence.'], gates: closureGates,
  });
  let certificationRefusal = null;
  try {
    await certifyProject(PROJECT);
    assert.fail('self-generated contract fixture unexpectedly certified');
  } catch (error) {
    certificationRefusal = error.message;
    assert.match(certificationRefusal, /self-generated contract fixtures cannot certify visual fidelity/);
  }
  const readiness = await assessCertification(PROJECT);
  assert.equal(readiness.ready, false);
  const finalAudit = await auditProject(PROJECT);
  assert.equal(finalAudit.valid, true);
  assert.equal((await resumeProject(PROJECT)).nextAction, 'REQUEST_VISUAL_REVIEW');
  const inspection = inspectGlb(await fs.readFile(finalAssetPath));
  assert.equal(inspection.valid, true);

  const summary = {
    schema: 'refas.dogfood-summary/v1', status: 'PASS', projectId: 'wing-cover-dogfood', fixturePurpose: 'contract-only',
    sourceSha256: source.sha256, finalAssetSha256: await sha256File(finalAssetPath),
    hierarchyNodes: hierarchy.nodes.length, observations: observations.length, cells: networkValidation.cellCount,
    sharedAdjacencies: networkValidation.adjacencyCount, physicalSharedBoundaries: networkParts.invariant.physicalBoundaries,
    oneBoundaryPerAdjacency: networkParts.invariant.oneBoundaryPerAdjacency,
    registration: {digest: registration.registrationDigest, rmse: registration.metrics.rmse, maxError: registration.metrics.maxError},
    assembly: assemblyValidation.metrics,
    appearance: {
      comparisonAssetSha256: fixture.appearanceRegression.sourceSha256,
      materialIds: Object.keys(materials),
      exactPbrParity: true,
      semanticAssignmentsVerified: true,
    },
    rollback: {decision: decision.action, baselineSha256, candidateSha256, restoredSha256, byteExact: restoredSha256 === baselineSha256},
    rendering: {frames: finalRenderReport.frames.length, status: finalRenderReport.status, claimScope: finalRenderReport.claimScope, board: path.relative(OUTPUT, finalBoardPath)},
    glb: {nodes: inspection.nodeCount, meshes: inspection.meshCount, triangles: inspection.triangleCount},
    checkpoints: {count: finalAudit.checkpointCount, source: sourceCheckpoint.id, certification: certificationCheckpoint.id},
    candidateCertification: {visualVerdict: visualReview.verdict, certificateIssued: false, expectedResult: 'REFUSED', refusal: certificationRefusal},
    audit: finalAudit,
    capabilityOrder: CAPABILITY_ORDER,
  };
  const summaryPath = await writeJson(path.join(OUTPUT, 'dogfood-summary.json'), summary);
  process.stdout.write(`${JSON.stringify({status: summary.status, summary: path.relative(REPOSITORY, summaryPath), project: path.relative(REPOSITORY, PROJECT), asset: path.relative(REPOSITORY, finalAssetPath), reviewBoard: path.relative(REPOSITORY, finalBoardPath), checkpoints: finalAudit.checkpointCount}, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Wing-cover dogfood failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});

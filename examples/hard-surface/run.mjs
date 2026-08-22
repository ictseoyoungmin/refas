#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeMesh, createHardSurfaceShell, parseGlb, partsToGlb} from '../../skills/refas/scripts/lib/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(ROOT, '../..');
const OUTPUT = path.join(ROOT, 'output');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

const clippedRect = (x0, y0, x1, y1, bevel) => [[x0 + bevel, y0], [x1 - bevel, y0], [x1, y0 + bevel], [x1, y1 - bevel], [x1 - bevel, y1], [x0 + bevel, y1], [x0, y1 - bevel], [x0, y0 + bevel]];

function translateMesh(mesh, offset) {
  const translated = {...mesh, positions: mesh.positions.map((point) => point.map((value, axis) => value + offset[axis])), topology: structuredClone(mesh.topology)};
  for (const edge of Object.values(translated.topology.edges)) edge.frame.origin = edge.frame.origin.map((value, axis) => value + offset[axis]);
  for (const [id, frame] of Object.entries(translated.topology.attachmentFrames)) translated.topology.attachmentFrames[id] = {...frame, origin: frame.origin.map((value, axis) => value + offset[axis])};
  translated.analysis = analyzeMesh(translated);
  return translated;
}

const shell = translateMesh(createHardSurfaceShell({
  schema: 'refas.hard-surface-spec/v1',
  outerProfile: clippedRect(0.06, 0.08, 0.94, 0.92, 0.09),
  cutouts: [
    {id: 'upper-slot', profile: clippedRect(0.25, 0.24, 0.75, 0.36, 0.045)},
    {id: 'middle-slot', profile: clippedRect(0.19, 0.45, 0.81, 0.57, 0.045)},
    {id: 'lower-slot', profile: clippedRect(0.25, 0.66, 0.75, 0.78, 0.045)},
  ],
  thickness: 0.12,
  surface: {width: 1.7, height: 2.15, crownX: 0.18, crownY: 0.08, twist: -0.025, lift: 0.03},
  edgeTreatments: {outer: {type: 'fillet', width: 0.028, depth: 0.022, segments: 4}, cutouts: {type: 'chamfer', width: 0.022, depth: 0.018}},
  role: 'slotted-curved-shell',
}), [-1.12, 0, 0]);

const mount = translateMesh(createHardSurfaceShell({
  schema: 'refas.hard-surface-spec/v1',
  outerProfile: [[0.08, 0.12], [0.85, 0.08], [0.94, 0.24], [0.9, 0.86], [0.72, 0.94], [0.12, 0.88]],
  cutouts: [{id: 'open-frame-aperture', profile: [[0.28, 0.3], [0.7, 0.25], [0.78, 0.38], [0.72, 0.72], [0.58, 0.79], [0.27, 0.7], [0.21, 0.42]]}],
  thickness: 0.15,
  surface: {width: 1.75, height: 2.05, crownX: 0.07, crownY: 0.04, tiltX: 0.025},
  edgeTreatments: {outer: {type: 'stepped', width: 0.035, depth: 0.022}, cutouts: {type: 'fillet', width: 0.026, depth: 0.02, segments: 3}},
  role: 'open-frame-mount',
}), [1.1, 0, 0]);

for (const mesh of [shell, mount]) {
  assert.equal(mesh.analysis.valid, true);
  assert.equal(mesh.analysis.watertight, true);
  assert.equal(mesh.analysis.windingConsistent, true);
}
assert.throws(() => createHardSurfaceShell({outerProfile: [[0, 0], [1, 1], [0, 1], [1, 0]], thickness: 0.1}), /invalid hard-surface spec/);

const materials = {
  'shell-anodized': {baseColor: [0.12, 0.24, 0.32, 1], metallic: 0.82, roughness: 0.27},
  'mount-painted': {baseColor: [0.33, 0.16, 0.075, 1], metallic: 0.68, roughness: 0.34},
};
const glb = partsToGlb({assetId: 'hard-surface-fixture', name: 'Hard-surface shell and open-frame mount', materials, parts: [
  {id: 'slotted-shell', role: 'slotted-curved-shell', scopeId: 'fixture.shell', materialId: 'shell-anodized', mesh: shell},
  {id: 'open-frame-mount', role: 'open-frame-mount', scopeId: 'fixture.mount', materialId: 'mount-painted', mesh: mount},
]});

await fs.rm(OUTPUT, {recursive: true, force: true});
await fs.mkdir(path.join(OUTPUT, 'assets'), {recursive: true});
const glbPath = path.join(OUTPUT, 'assets', 'hard-surface-fixture.glb');
await fs.writeFile(glbPath, glb);
const framePath = path.join(OUTPUT, 'canonical-frame.json');
await fs.writeFile(framePath, `${JSON.stringify({schema: 'refas.canonical-object-frame/v1', id: 'hard-surface-fixture-frame', scopeId: 'whole', origin: [0, 0, 0], axes: {right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1]}}, null, 2)}\n`);

const renderDir = path.join(OUTPUT, 'renders', 'portable');
const result = spawnSync(PYTHON, [path.join(REPOSITORY, 'skills/refas/scripts/render_glb.py'), '--glb', glbPath, '--out', renderDir, '--frame', framePath, '--size', '420', '--timeout-seconds', '90', '--max-working-mb', '768', '--max-triangles', '1000000'], {encoding: 'utf8', timeout: 100_000, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
if (result.error?.code === 'ETIMEDOUT') throw new Error('hard-surface visual validation exceeded 100 seconds');
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
process.stdout.write(result.stdout);
const parsed = parseGlb(glb);
assert.equal(parsed.json.meshes[0].extras.refasTopology.schema, 'refas.hard-surface-topology/v1');
assert.equal(parsed.json.meshes[1].extras.refasTopology.schema, 'refas.hard-surface-topology/v1');
const summary = {status: 'PASS', parts: [
  {id: 'slotted-shell', vertices: shell.analysis.vertexCount, triangles: shell.analysis.triangleCount, semanticEdges: Object.keys(shell.topology.edges).length, cutouts: 3},
  {id: 'open-frame-mount', vertices: mount.analysis.vertexCount, triangles: mount.analysis.triangleCount, semanticEdges: Object.keys(mount.topology.edges).length, cutouts: 1},
], trueNegativeSpace: true, invalidProfilesFailClosed: true, topologySerializedInGlb: true, reviewBoard: 'renders/portable/multiview-review-board.png'};
await fs.writeFile(path.join(OUTPUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

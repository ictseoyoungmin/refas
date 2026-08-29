import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {contentReference, createSegmentPrism, partsToGlb, sha256File, validateParameterFitReport} from '../../skills/refas/scripts/lib/index.mjs';

const EXAMPLE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(EXAMPLE, '../..');
const OUTPUT = path.join(EXAMPLE, 'output');
const CLI = path.join(ROOT, 'skills/refas/scripts/refas.mjs');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

const writeJson = async (target, value) => { await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`); return target; };

function asset({span, depth}) {
  const mesh = createSegmentPrism({start: [-span / 2, 0, 0], end: [span / 2, 0, 0], width: depth, height: 0.42, upHint: [0, 1, 0]});
  return partsToGlb({assetId: 'parameter-fit-prism', parts: [{id: 'fitted-shell', scopeId: 'whole', materialId: 'shell', mesh}], materials: {shell: {baseColor: [0.24, 0.52, 0.82, 1], metallic: 0.12, roughness: 0.44}}});
}

function run(command, args, timeout = 60_000) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', timeout});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `${command} failed`);
  return result.stdout;
}

function covered(report, id) { return report.frames.find((item) => item.path === `${id}.png`).coveredPixels; }

async function render(assetPath, directory, framePath) {
  run(process.execPath, [CLI, 'render', '--glb', assetPath, '--out', directory, '--frame', framePath, '--size', '72', '--timeout-seconds', '30', '--max-working-mb', '64'], 40_000);
  return JSON.parse(await fs.readFile(path.join(directory, 'render-report.json'), 'utf8'));
}

async function main() {
  await fs.rm(OUTPUT, {recursive: true, force: true});
  await fs.mkdir(path.join(OUTPUT, 'source'), {recursive: true});
  const framePath = await writeJson(path.join(OUTPUT, 'canonical-frame.json'), {
    schema: 'refas.canonical-object-frame/v1', id: 'fit-fixture-frame', scopeId: 'whole', origin: [0, 0, 0],
    axes: {right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1]}, scopeParts: [],
    hero: {position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: 29, registrationDigest: 'a'.repeat(64)},
  });
  const targetAssetPath = path.join(OUTPUT, 'source', 'target.glb');
  const baselineAssetPath = path.join(OUTPUT, 'baseline.glb');
  await fs.writeFile(targetAssetPath, asset({span: 1.82, depth: 0.82}));
  await fs.writeFile(baselineAssetPath, asset({span: 0.72, depth: 0.22}));
  const targetRenderDirectory = path.join(OUTPUT, 'source', 'render');
  const baselineRenderDirectory = path.join(OUTPUT, 'before');
  const targetReport = await render(targetAssetPath, targetRenderDirectory, framePath);
  await render(baselineAssetPath, baselineRenderDirectory, framePath);
  const referencePath = path.join(OUTPUT, 'source', 'reference.png');
  await fs.copyFile(path.join(targetRenderDirectory, 'hero.png'), referencePath);
  const targetCoveredPixels = Object.fromEntries(['hero', 'side', 'top'].map((id) => [id, covered(targetReport, id)]));
  await writeJson(path.join(OUTPUT, 'fixture-config.json'), {framePath, targetCoveredPixels});
  const planPath = await writeJson(path.join(OUTPUT, 'parameter-fit-plan.json'), {
    id: 'portable-render-shape-fit', scopeId: 'whole', sourceSha256: await sha256File(referencePath), baselineAsset: await contentReference(baselineAssetPath, {kind: 'glb', root: OUTPUT}),
    parameters: [
      {id: 'span', binding: 'model.shape.span', minimum: 0.5, maximum: 2.2, initial: 0.72, evidenceRefs: ['source/reference.png']},
      {id: 'depth', binding: 'model.shape.depth', minimum: 0.15, maximum: 1.05, initial: 0.22, evidenceRefs: ['source/render/side.png', 'source/render/top.png']},
    ],
    objectives: [
      {id: 'hero-coverage-error', goal: 'minimize', scale: 1, weight: 1},
      {id: 'side-coverage-error', goal: 'minimize', scale: 1, weight: 1},
      {id: 'top-coverage-error', goal: 'minimize', scale: 1, weight: 1},
    ],
    protectedTerms: [], evidenceRefs: ['source/reference.png', 'source/render/side.png', 'source/render/top.png'],
    optimizer: {algorithm: 'differential-evolution', seed: 17, populationSize: 8, evaluationBudget: 32, differentialWeight: 0.8, crossoverRate: 0.9, improvementTolerance: 0.000001, patience: 28},
  });
  const reportPath = path.join(OUTPUT, 'parameter-fit-report.json');
  run(process.execPath, [CLI, 'fit-parameters', '--root', OUTPUT, '--plan', planPath, '--worker', path.join(EXAMPLE, 'worker.mjs'), '--out', reportPath], 180_000);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.deepEqual(validateParameterFitReport(report), {valid: true, errors: []});
  assert.equal(report.status, 'IMPROVED');
  const baseline = report.trials.find((trial) => trial.id === report.baselineTrialId);
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.ok(selected.objectiveLoss < baseline.objectiveLoss * 0.5, `expected geometry render-fit improvement: ${baseline.objectiveLoss} -> ${selected.objectiveLoss}`);
  const selectedDirectory = path.join(OUTPUT, 'trials', selected.id, 'render');
  const comparisonPath = path.join(OUTPUT, 'reference-before-after.png');
  run(PYTHON, [path.join(EXAMPLE, 'create_comparison.py'), '--reference', referencePath, '--before', path.join(baselineRenderDirectory, 'hero.png'), '--after', path.join(selectedDirectory, 'hero.png'), '--out', comparisonPath]);
  const summary = {
    status: 'PASS', sourceSha256: await sha256File(referencePath), planDigest: report.planDigest, reportDigest: report.reportDigest,
    evaluationCount: report.evaluationCount, baselineLoss: baseline.objectiveLoss, selectedLoss: selected.objectiveLoss,
    selectedParameters: selected.parameters, evidence: path.relative(ROOT, comparisonPath).replaceAll(path.sep, '/'), policy: report.policy,
  };
  await writeJson(path.join(OUTPUT, 'summary.json'), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`Parameter-fit dogfood failed: ${error.message}\n`); process.exit(1); });

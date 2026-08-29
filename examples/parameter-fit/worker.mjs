import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {contentReference, createSegmentPrism, partsToGlb} from '../../skills/refas/scripts/lib/index.mjs';

const EXAMPLE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(EXAMPLE, 'output');
const CONFIG = path.join(OUTPUT, 'fixture-config.json');
const CLI = path.resolve(EXAMPLE, '../../skills/refas/scripts/refas.mjs');

function frame(report, id) {
  const value = report.frames.find((item) => item.path === `${id}.png`);
  if (!value) throw new Error(`render report is missing ${id}`);
  return value;
}

function asset({span, depth}) {
  const mesh = createSegmentPrism({start: [-span / 2, 0, 0], end: [span / 2, 0, 0], width: depth, height: 0.42, upHint: [0, 1, 0]});
  return partsToGlb({
    assetId: 'parameter-fit-prism',
    parts: [{id: 'fitted-shell', scopeId: 'whole', materialId: 'shell', mesh}],
    materials: {shell: {baseColor: [0.24, 0.52, 0.82, 1], metallic: 0.12, roughness: 0.44}},
  });
}

export async function evaluate(parameters, context) {
  const config = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
  const directory = path.join(OUTPUT, 'trials', context.trialId);
  await fs.mkdir(directory, {recursive: true});
  const assetPath = path.join(directory, 'candidate.glb');
  await fs.writeFile(assetPath, asset(parameters));
  const renderDirectory = path.join(directory, 'render');
  const result = spawnSync(process.execPath, [CLI, 'render', '--glb', assetPath, '--out', renderDirectory, '--frame', config.framePath, '--size', '72', '--timeout-seconds', '30', '--max-working-mb', '64'], {encoding: 'utf8', timeout: 40_000});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'portable renderer failed');
  const reportPath = path.join(renderDirectory, 'render-report.json');
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const error = (id) => Math.abs(frame(report, id).coveredPixels - config.targetCoveredPixels[id]) / config.targetCoveredPixels[id];
  return {
    measurements: {'hero-coverage-error': error('hero'), 'side-coverage-error': error('side'), 'top-coverage-error': error('top')},
    candidateAsset: await contentReference(assetPath, {kind: 'glb', root: OUTPUT}),
    renderEvidence: await contentReference(reportPath, {kind: 'render-report', root: OUTPUT}),
    evidenceRefs: ['source/reference.png', path.relative(OUTPUT, path.join(renderDirectory, 'hero.png')).replaceAll(path.sep, '/')],
  };
}

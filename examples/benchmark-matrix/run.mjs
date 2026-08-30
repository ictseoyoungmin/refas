#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBenchmarkMatrix, digestBytes, recordBenchmarkResult, validateBenchmarkMatrix} from '../../skills/refas/scripts/lib/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'output', 'benchmark-matrix.json');
const args = process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (!value.startsWith('--')) return pairs;
  const key = value.slice(2); pairs[key] = values[index + 1] ?? ''; return pairs;
}, {});

async function sourceReference(file, label) {
  if (!file) throw new Error(`--${label} PATH is required; raw sources remain external to the repository`);
  const absolute = path.resolve(file), bytes = await fs.readFile(absolute), stat = await fs.stat(absolute);
  return {kind: 'external-source', path: `external/${path.basename(absolute)}`, sha256: digestBytes(bytes), sizeBytes: stat.size};
}

async function fileReference(file, label, kind = 'artifact', logicalPath = null) {
  const absolute = path.resolve(file), bytes = await fs.readFile(absolute), stat = await fs.stat(absolute);
  const suffix = (logicalPath ?? path.basename(absolute)).split(path.sep).join('/');
  return {kind, path: `results/${label}/${suffix}`, sha256: digestBytes(bytes), sizeBytes: stat.size};
}

async function firstFile(root, candidates) {
  for (const candidate of candidates) {
    const file = path.join(root, candidate);
    try { if ((await fs.stat(file)).isFile()) return file; } catch { /* optional artifact */ }
  }
  return null;
}

async function walkFiles(root, out = [], prefix = '') {
  let entries = [];
  try { entries = await fs.readdir(path.join(root, prefix), {withFileTypes: true}); } catch { return out; }
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.name === 'objects' || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) await walkFiles(root, out, relative);
    else out.push(path.join(root, relative));
  }
  return out;
}

async function attachProjectResult(matrix, benchmarkId, label, projectArg, baselineArg = '') {
  if (!projectArg) return matrix;
  const root = path.resolve(projectArg);
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`--${label}-project must point to a project directory`);
  const files = await walkFiles(root);
  const find = (predicate) => files.find((file) => predicate(file, path.relative(root, file)));
  const finalFile = await firstFile(root, [
    'assets/articulated-figure.glb', 'assets/wing-cover.glb', 'assets/material-fixture.glb',
    'assets/shape.glb', 'assets/surface-network.glb', 'assets/articulated-drawing-figure.glb',
  ]) ?? find((file) => file.endsWith('.glb') && !file.endsWith('-neutral.glb'));
  if (!finalFile) throw new Error(`--${label}-project has no final GLB asset`);
  const baselineFile = baselineArg ? path.resolve(baselineArg) : finalFile;
  const finalAsset = await fileReference(finalFile, label, 'glb');
  const baselineAsset = await fileReference(baselineFile, `${label}-baseline`, 'glb');
  const comparisons = await Promise.all(files.filter((file) => /comparison-board\.png$|comparison-report\.json$/u.test(file)).map((file) => fileReference(file, label, 'registered-comparison', path.relative(root, file))));
  const diagnostics = await Promise.all(files.filter((file) => /(?:pbr-review-board|multiview-review-board)\.png$/u.test(file)).map((file) => fileReference(file, label, 'diagnostic-render', path.relative(root, file))));
  const fittingLedgers = await Promise.all(files.filter((file) => /(?:camera|pose|macro|appearance|lighting|fit)[^/]*\.json$/iu.test(path.basename(file))).map((file) => fileReference(file, label, 'fitting-ledger', path.relative(root, file))));
  const findings = await Promise.all(files.filter((file) => /(?:^|\/)findings(?:\.json|\/)|finding-ledger\.json$/u.test(file)).map((file) => fileReference(file, label, 'finding-ledger', path.relative(root, file))));
  const rollbackEvidence = await Promise.all(files.filter((file) => /(?:^|\/)checkpoints\/.*\.json$/u.test(file)).slice(0, 8).map((file) => fileReference(file, label, 'rollback-evidence', path.relative(root, file))));
  const reviewFile = await firstFile(root, ['reviews/visual-review.json']);
  const summaryFile = await firstFile(root, ['dogfood-summary.json', 'summary.json'])
    ?? await firstFile(path.dirname(root), ['dogfood-summary.json', 'summary.json']);
  let summary = null;
  if (summaryFile) { try { summary = JSON.parse(await fs.readFile(summaryFile, 'utf8')); } catch { /* optional evidence */ } }
  const visualReview = reviewFile ? await fileReference(reviewFile, label, 'visual-review') : null;
  const reviewJson = reviewFile ? JSON.parse(await fs.readFile(reviewFile, 'utf8')) : null;
  const visualReviewVerdict = summary?.certified === false ? 'insufficient' : (reviewJson?.verdict ?? null);
  const certificateFile = summary?.certified === true ? await firstFile(root, ['.refas/certification.json']) : null;
  const certificate = certificateFile ? await fileReference(certificateFile, label, 'certificate') : null;
  const result = await recordBenchmarkResult(matrix, benchmarkId, {
    baselineAsset, finalAsset, comparisons, diagnostics, fittingLedgers, findings,
    rollbackEvidence, visualReview, visualReviewVerdict, certificate,
    status: visualReviewVerdict === 'pass' ? 'complete' : 'blocked-review',
  });
  const validation = validateBenchmarkMatrix(result);
  if (!validation.valid) throw new Error(`benchmark result is invalid: ${validation.errors.join('; ')}`);
  return result;
}

const sources = await Promise.all([
  sourceReference(args.articulated, 'articulated'),
  sourceReference(args.mechanical, 'mechanical'),
  sourceReference(args.irregular, 'irregular'),
]);
let matrix = createBenchmarkMatrix({id: 'independent-reference-benchmarks', sourceRoot: 'external', benchmarks: [
  {id: 'articulated-reference', category: 'articulated-manufactured-organic', source: sources[0]},
  {id: 'mechanical-reference', category: 'hard-surface-mechanical', source: sources[1]},
  {id: 'irregular-reference', category: 'irregular-nonmechanical', source: sources[2]},
]});
matrix = await attachProjectResult(matrix, 'articulated-reference', 'articulated', args['articulated-project'], args['articulated-baseline']);
matrix = await attachProjectResult(matrix, 'mechanical-reference', 'mechanical', args['mechanical-project'], args['mechanical-baseline']);
matrix = await attachProjectResult(matrix, 'irregular-reference', 'irregular', args['irregular-project'], args['irregular-baseline']);
await fs.mkdir(path.dirname(OUT), {recursive: true});
await fs.writeFile(OUT, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(JSON.stringify({status: 'PASS', matrix: path.relative(path.resolve(ROOT, '../..'), OUT), benchmarks: matrix.benchmarks.length, completed: matrix.benchmarks.filter((benchmark) => benchmark.status === 'complete').length, sourceDigests: matrix.benchmarks.map((benchmark) => benchmark.sourceSha256)}, null, 2));

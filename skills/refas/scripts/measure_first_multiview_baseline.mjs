#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

import {createBenchmarkMatrix, digestBytes, validateBenchmarkMatrix} from './lib/index.mjs';
import {initTrustedContractFixtureProject} from './lib/contract-fixture-project.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT = path.dirname(SCRIPT_DIR);
const CATEGORIES = [
  'articulated-manufactured-organic',
  'hard-surface-mechanical',
  'irregular-nonmechanical',
];

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2), next = argv[index + 1];
    if (next && !next.startsWith('--')) { out[key] = next; index += 1; }
    else out[key] = true;
  }
  return out;
}

function hostPythonUserBase() {
  if (process.env.PYTHONUSERBASE) return process.env.PYTHONUSERBASE;
  const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
  const probe = spawnSync(python, ['-c', 'import site; print(site.getuserbase())'], {encoding: 'utf8'});
  return probe.status === 0 ? probe.stdout.trim() || null : null;
}

function minimalEnv(tempRoot) {
  const env = {
    PATH: process.env.PATH ?? '', HOME: tempRoot, TMPDIR: path.join(tempRoot, 'tmp'),
    LANG: process.env.LANG ?? 'C.UTF-8', NODE_NO_WARNINGS: '1',
  };
  for (const key of ['SYSTEMROOT', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'CODEX_PRIMARY_RUNTIME_PYTHON']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const pythonUserBase = hostPythonUserBase();
  if (pythonUserBase) env.PYTHONUSERBASE = pythonUserBase;
  return env;
}

function fixturePpm() {
  return [
    'P3', '8 8', '255',
    ...Array.from({length: 64}, (_, index) => {
      const x = index % 8, y = Math.floor(index / 8);
      return x >= 2 && x <= 5 && y >= 1 && y <= 6 ? '210 170 90' : '30 35 42';
    }),
    '',
  ].join('\n');
}

function publicOperationMap(graph) {
  const map = new Map();
  for (const node of graph.nodes ?? []) {
    for (const entry of node.interface?.interfaces ?? []) {
      const symbol = entry.library?.symbol;
      if (symbol) map.set(symbol, `${node.id}.${entry.id}`);
    }
  }
  return map;
}

function optionalCounter(value) {
  if (value == null || value === '') return {available: false, value: null};
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('turn/token observations must be non-negative integers');
  return {available: true, value: parsed};
}

async function waitForExit(child) {
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  return {code, stdout, stderr};
}

async function readNeutralClayReport(reportPath) {
  try {
    const bytes = await fs.readFile(reportPath);
    const report = JSON.parse(bytes.toString('utf8'));
    if (report.presentation?.mode !== 'neutral-clay') return null;
    const viewIds = [...new Set((report.outputs ?? []).map((output) => output.viewId).filter(Boolean))].sort();
    if (viewIds.length < 5 || !report.reportDigest) return null;
    return {bytes, report, viewIds};
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function measureOne({skillRoot, referenceClass, turns = null, tokens = null}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `refas-first-multiview-${referenceClass}-`));
  try {
    const installedRoot = path.join(tempRoot, 'installed', 'refas');
    const projectRoot = path.join(tempRoot, 'project');
    const reportPath = path.join(projectRoot, 'reports', 'fresh-worker-public-contract.json');
    const clayReportPath = path.join(projectRoot, 'renders', 'clay', 'render-report.json');
    await fs.mkdir(path.join(tempRoot, 'tmp'), {recursive: true});
    await fs.mkdir(path.dirname(installedRoot), {recursive: true});
    await fs.cp(skillRoot, installedRoot, {recursive: true});

    const sourceBytes = Buffer.from(fixturePpm());
    const sourceDir = path.join(projectRoot, 'source');
    await fs.mkdir(sourceDir, {recursive: true});
    await fs.writeFile(path.join(sourceDir, 'reference.ppm'), sourceBytes);
    const sourceManifest = {
      schema: 'refas.source-manifest/v1', id: 'primary-reference', path: 'source/reference.ppm',
      sha256: digestBytes(sourceBytes), sizeBytes: sourceBytes.length, width: 8, height: 8,
      authority: 'primary', acquisition: {kind: 'generated-contract-reference', origin: '#249 timing observer bootstrap'},
    };
    await fs.writeFile(path.join(sourceDir, 'source-manifest.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`);
    await initTrustedContractFixtureProject(projectRoot, {
      projectId: `first-multiview-${referenceClass}`, source: sourceManifest,
      fixtureId: `issue-249-${referenceClass}`,
    });

    const installedWorker = path.join(installedRoot, 'scripts', 'fresh_worker_dogfood_worker.mjs');
    const accessLoader = path.join(installedRoot, 'scripts', 'fresh_worker_access_loader.mjs');
    const accessPreload = path.join(installedRoot, 'scripts', 'fresh_worker_access_preload.mjs');
    const env = {
      ...minimalEnv(tempRoot),
      NODE_OPTIONS: `--import=${accessPreload} --experimental-loader=${accessLoader}`,
      REFAS_AD05_INSTALLED_ROOT: installedRoot,
      REFAS_AD05_ACCESS_AUDIT: path.join(tempRoot, 'access-audit.jsonl'),
      REFAS_AD05_UNTRUSTED_ENTRY: installedWorker,
      REFAS_AD05_ALLOWED_CLI: path.join(installedRoot, 'scripts', 'refas.mjs'),
      REFAS_AD05_RAW_TARGET: path.join(installedRoot, 'scripts', 'lib', 'checkpoint-store.mjs'),
    };
    await fs.writeFile(env.REFAS_AD05_ACCESS_AUDIT, '');

    const started = performance.now();
    const child = spawn(process.execPath, [
      installedWorker, '--skill-root', installedRoot, '--project', projectRoot,
      '--report', reportPath, '--trusted-fixture-preinitialized',
    ], {cwd: tempRoot, env, stdio: ['ignore', 'pipe', 'pipe']});
    const exitPromise = waitForExit(child);

    let firstProof = null, firstMultiviewMs = null;
    const deadline = started + 120000;
    while (performance.now() < deadline) {
      const proof = await readNeutralClayReport(clayReportPath);
      if (proof) { firstProof = proof; firstMultiviewMs = performance.now() - started; break; }
      if (child.exitCode != null) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const exit = await exitPromise;
    if (exit.code !== 0) throw new Error(`fresh worker failed for ${referenceClass}: ${String(exit.stderr || exit.stdout).trim()}`);
    if (!firstProof) {
      firstProof = await readNeutralClayReport(clayReportPath);
      if (firstProof) firstMultiviewMs = performance.now() - started;
    }
    if (!firstProof || firstMultiviewMs == null) throw new Error(`fresh worker produced no canonical neutral-clay multiview for ${referenceClass}`);

    const transcript = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(transcript.status, 'PASS');
    const graph = JSON.parse(await fs.readFile(path.join(installedRoot, 'references', 'GRAPH.json'), 'utf8'));
    const operationMap = publicOperationMap(graph);
    const cutoff = transcript.publicApiSymbols.indexOf('createPbrRenderReport');
    if (cutoff < 0) throw new Error('fresh worker transcript never invoked createPbrRenderReport');
    const ids = [...new Set(transcript.publicApiSymbols.slice(0, cutoff + 1).map((symbol) => operationMap.get(symbol)).filter(Boolean))].sort();

    return {
      schema: 'refas.first-multiview-observation/v1', referenceClass,
      firstNeutralClayMultiviewMs: Math.round(firstMultiviewMs * 1000) / 1000,
      uniquePublicOperationsBeforeFirstMultiview: ids.length,
      publicOperationIdsBeforeFirstMultiview: ids,
      turns: optionalCounter(turns), tokens: optionalCounter(tokens),
      multiviewProof: {
        reportSha256: digestBytes(firstProof.bytes), reportDigest: firstProof.report.reportDigest,
        viewIds: firstProof.viewIds,
      },
      measurement: {
        clock: 'monotonic-wall-clock',
        worker: 'fresh_worker_dogfood_worker.mjs',
        fixtureSemantics: 'common AD05 public-contract fixture; referenceClass labels exercise benchmark routing and operational cost only, not class-quality comparison',
      },
      policy: {observationOnly: true, certificationAuthority: false, qualityAuthority: false, noPassFailThreshold: true},
    };
  } finally {
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
}

export async function measureFirstMultiviewBaseline({skillRoot = DEFAULT_SKILL_ROOT, turns = null, tokens = null} = {}) {
  skillRoot = path.resolve(skillRoot);
  const observations = [];
  for (const referenceClass of CATEGORIES) observations.push(await measureOne({skillRoot, referenceClass, turns, tokens}));
  const benchmarkSources = observations.map((observation) => {
    const bytes = Buffer.from(JSON.stringify({referenceClass: observation.referenceClass, fixture: 'AD05-public-contract-cost-proxy'}));
    return {kind: 'measurement-fixture-descriptor', path: `measurement/${observation.referenceClass}.json`, sha256: digestBytes(bytes), sizeBytes: bytes.length};
  });
  const matrix = createBenchmarkMatrix({
    id: 'first-multiview-operational-baseline', sourceRoot: 'measurement-fixtures',
    benchmarks: observations.map((observation, index) => ({
      id: `first-multiview-${index + 1}`, category: observation.referenceClass, source: benchmarkSources[index],
      status: 'observed', firstMultiviewObservation: observation,
    })),
  });
  const validation = validateBenchmarkMatrix(matrix);
  if (!validation.valid) throw new Error(`first-multiview benchmark matrix is invalid: ${validation.errors.join('; ')}`);
  const times = observations.map((item) => item.firstNeutralClayMultiviewMs).sort((a, b) => a - b);
  return {
    schema: 'refas.first-multiview-baseline/v1', status: 'PASS', matrix,
    summary: {
      referenceClasses: observations.length,
      minMs: times[0], medianMs: times[Math.floor(times.length / 2)], maxMs: times.at(-1),
      operationCounts: observations.map((item) => ({referenceClass: item.referenceClass, uniquePublicOperations: item.uniquePublicOperationsBeforeFirstMultiview})),
      turnsAvailable: observations.some((item) => item.turns.available), tokensAvailable: observations.some((item) => item.tokens.available),
    },
    policy: {observationOnly: true, noOptimizationClaim: true, noQualityClaim: true},
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await measureFirstMultiviewBaseline({skillRoot: args['skill-root'] ?? DEFAULT_SKILL_ROOT, turns: args.turns ?? null, tokens: args.tokens ?? null});
  if (args.out) {
    const out = path.resolve(args.out); await fs.mkdir(path.dirname(out), {recursive: true});
    await fs.writeFile(out, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result.summary)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`First multiview baseline failed: ${error.stack ?? error.message}\n`); process.exit(1); });
}

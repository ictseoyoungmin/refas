#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {CAPABILITY_ORDER} from './lib/index.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT = path.dirname(SCRIPT_DIR);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function parseSingleJsonLine(stdout, label) {
  const text = String(stdout ?? '').trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `${label} must emit exactly one JSON line; got: ${text}`);
  return JSON.parse(lines[0]);
}

function minimalEnv(tempRoot) {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: tempRoot,
    TMPDIR: path.join(tempRoot, 'tmp'),
    LANG: process.env.LANG ?? 'C.UTF-8',
  };
  for (const key of ['SYSTEMROOT', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function assertWorkerSourceIsPublicOnly(source) {
  const staticImports = [...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const internalImports = staticImports.filter((specifier) => specifier.includes('/lib/') && !specifier.endsWith('/lib/index.mjs'));
  assert.deepEqual(internalImports, [], `fresh worker has direct internal-module imports: ${internalImports.join(', ')}`);
  assert.match(source, /path\.join\(skillRoot, 'scripts', 'lib', 'index\.mjs'\)/);
  assert.doesNotMatch(source, /import\(\s*['"][^'"]*\/lib\/(?!index\.mjs)/);
  assert.doesNotMatch(source, /spawnSync\(\s*['"](?:grep|sed|rg|ripgrep)['"]/);
}

export async function runFreshWorkerDogfood({skillRoot = DEFAULT_SKILL_ROOT, keep = false} = {}) {
  skillRoot = path.resolve(skillRoot);
  const workerSourcePath = path.join(skillRoot, 'scripts', 'fresh_worker_dogfood_worker.mjs');
  const workerSource = await fs.readFile(workerSourcePath, 'utf8');
  assertWorkerSourceIsPublicOnly(workerSource);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-ad05-fresh-worker-'));
  const installedRoot = path.join(tempRoot, 'installed', 'refas');
  const projectRoot = path.join(tempRoot, 'project');
  const reportPath = path.join(projectRoot, 'reports', 'fresh-worker-public-contract.json');
  await fs.mkdir(path.join(tempRoot, 'tmp'), {recursive: true});
  await fs.mkdir(path.dirname(installedRoot), {recursive: true});
  await fs.cp(skillRoot, installedRoot, {recursive: true});

  const absentRepositorySurfaces = {};
  for (const surface of ['tests', 'docs', 'examples', '.git', 'package.json']) {
    try {
      await fs.access(path.join(tempRoot, surface));
      absentRepositorySurfaces[surface] = false;
    } catch {
      absentRepositorySurfaces[surface] = true;
    }
  }
  assert.ok(Object.values(absentRepositorySurfaces).every(Boolean), 'temporary fresh-worker root contains repository-only surfaces');

  const installedWorker = path.join(installedRoot, 'scripts', 'fresh_worker_dogfood_worker.mjs');
  const env = minimalEnv(tempRoot);
  const normal = spawnSync(process.execPath, [
    installedWorker,
    '--skill-root', installedRoot,
    '--project', projectRoot,
    '--report', reportPath,
  ], {
    cwd: tempRoot,
    encoding: 'utf8',
    env,
    timeout: 120000,
  });
  if (normal.status !== 0) {
    throw new Error(`fresh worker failed (status=${normal.status}): ${String(normal.stderr || normal.stdout).trim()}`);
  }
  const summary = parseSingleJsonLine(normal.stdout, 'fresh worker');
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.capabilities, CAPABILITY_ORDER.length);
  assert.equal(summary.checkpoints, CAPABILITY_ORDER.length);
  assert.equal(summary.rawImplementationReads, 0);
  assert.equal(summary.implementationSearchCommands, 0);

  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.capabilitiesDiscovered, [...CAPABILITY_ORDER]);
  assert.deepEqual(report.checkpointsCommitted.map((item) => item.capability), [...CAPABILITY_ORDER]);
  assert.equal(report.rawImplementationReads.length, 0);
  assert.equal(report.implementationSearchCommands.length, 0);
  assert.ok(Object.values(report.repositorySurfacesAbsent).every(Boolean));
  assert.ok(report.requiredReads.includes('SKILL.md'));
  assert.ok(report.requiredReads.includes('references/INDEX.md'));
  assert.ok(report.requiredReads.includes('references/workflow.md'));
  assert.ok(report.requiredReads.includes('references/checkpointing.md'));
  assert.ok(report.requiredReads.includes('references/failure-routing.md'));
  assert.ok(report.describeQueries.includes('node:checkpointing'));
  assert.ok(report.describeQueries.includes('node:claim-certification'));
  assert.ok(CAPABILITY_ORDER.every((capability) => report.describeQueries.includes(`capability:${capability}`)));
  assert.ok(report.templatesLoaded.length >= 10, `expected representative canonical templates, got ${report.templatesLoaded.length}`);
  assert.ok(report.publicApiEntrypoints.includes('scripts/lib/index.mjs'));
  assert.ok(report.publicApiSymbols.includes('commitCheckpoint'));
  assert.ok(report.publicApiSymbols.includes('certifyProject'));
  assert.ok(report.publicApiSymbols.includes('createVisualHierarchy'));
  assert.ok(report.publicApiSymbols.includes('createObservation'));
  assert.ok(report.publicApiSymbols.includes('createSpatialHypothesisSet'));
  assert.ok(report.publicApiSymbols.includes('createConstructionQuality'));
  assert.ok(report.publicApiSymbols.includes('createAssemblyContract'));
  assert.ok(report.publicApiSymbols.includes('createPbrRenderReport'));
  assert.ok(report.publicApiSymbols.includes('createVisualReview'));
  assert.equal(report.audit?.valid, true);
  assert.match(report.certificate?.certificateDigest ?? '', /^[a-f0-9]{64}$/);

  const negative = spawnSync(process.execPath, [
    installedWorker,
    '--skill-root', installedRoot,
    '--project', path.join(tempRoot, 'negative-project'),
    '--probe-forbidden-read', 'scripts/lib/checkpoint-store.mjs',
  ], {
    cwd: tempRoot,
    encoding: 'utf8',
    env,
    timeout: 30000,
  });
  if (negative.status !== 0) {
    throw new Error(`negative raw-code probe failed unexpectedly: ${String(negative.stderr || negative.stdout).trim()}`);
  }
  const blocked = parseSingleJsonLine(negative.stdout, 'negative raw-code probe');
  assert.equal(blocked.status, 'BLOCKED');
  assert.deepEqual(blocked.rawImplementationReads, ['scripts/lib/checkpoint-store.mjs']);
  assert.match(blocked.message, /raw implementation read blocked/);

  const result = {
    status: 'PASS',
    schema: 'refas.fresh-worker-public-contract-dogfood-report/v1',
    installedSkillOnly: true,
    repositorySurfacesAbsent: absentRepositorySurfaces,
    capabilitiesDiscovered: report.capabilitiesDiscovered.length,
    checkpointsCommitted: report.checkpointsCommitted.length,
    templatesLoaded: report.templatesLoaded.length,
    describeQueries: report.describeQueries.length,
    publicApiSymbols: report.publicApiSymbols.length,
    rawImplementationReads: report.rawImplementationReads.length,
    implementationSearchCommands: report.implementationSearchCommands.length,
    forbiddenRawReadProbe: blocked.status,
    certificateDigest: report.certificate.certificateDigest,
  };

  if (!keep) await fs.rm(tempRoot, {recursive: true, force: true});
  else result.tempRoot = tempRoot;
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runFreshWorkerDogfood({
    skillRoot: options['skill-root'] ?? DEFAULT_SKILL_ROOT,
    keep: options.keep === true,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Fresh-worker dogfood verification failed: ${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}

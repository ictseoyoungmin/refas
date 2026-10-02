#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {BENCHMARK_CATEGORIES} from '../../skills/refas/scripts/lib/benchmark.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const isSha = (value) => /^[a-f0-9]{40}$/u.test(String(value ?? ''));
const isDigest = (value) => /^[a-f0-9]{64}$/u.test(String(value ?? ''));
const isId = (value) => /^[a-z][a-z0-9-]*$/u.test(String(value ?? ''));

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2), next = argv[index + 1];
    if (next && !next.startsWith('--')) { result[key] = next; index += 1; }
    else result[key] = true;
  }
  return result;
}

function assertDistinctIds(items, label) {
  const values = items.map((item) => item.id);
  if (values.some((id) => !isId(id)) || new Set(values).size !== values.length) fail(`${label} IDs must be distinct semantic slugs`);
}

function rejectScoreFields(value, label = 'outcome') {
  if (value == null) return;
  if (Array.isArray(value)) { value.forEach((item, index) => rejectScoreFields(item, `${label}[${index}]`)); return; }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/score|rating|rank|winner|aggregate/i.test(key)) fail(`${label} contains prohibited aggregate/evaluative field: ${key}`);
    rejectScoreFields(child, `${label}.${key}`);
  }
}

function safeRelative(value, label) {
  const text = String(value ?? '');
  if (!text || path.isAbsolute(text) || text.split(/[\\/]/u).includes('..')) fail(`${label} must remain inside the run directory`);
  return text.replaceAll('\\', '/');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.manifest || !options.out) fail('usage: run-workers.mjs --manifest FILE --out DIR [--dry-run true] [--only reference--worker--prompt]');
  const manifestFile = path.resolve(options.manifest);
  const manifestBytes = await fs.readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const out = path.resolve(options.out);
  const sourceBase = path.dirname(manifestFile);
  const refasRoot = path.resolve(sourceBase, manifest.refasRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const commit = execFileSync('git', ['-C', refasRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  if (!isSha(manifest.expectedRefasCommit)) fail('manifest.expectedRefasCommit must be an exact 40-hex RefAs commit');
  if (commit !== manifest.expectedRefasCommit) fail(`RefAs checkout mismatch: expected ${manifest.expectedRefasCommit}, got ${commit}`);

  try { await fs.access(path.join(out, 'matrix.json')); fail('output already contains a matrix; use a new directory for an independent run'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const refs = manifest.references ?? [], workers = manifest.workers ?? [], prompts = manifest.prompts ?? [];
  if (refs.length < 3 || workers.length < 2 || prompts.length < 2) fail('matrix requires at least three references, two workers, and two prompt variants');
  assertDistinctIds(refs, 'reference'); assertDistinctIds(workers, 'worker'); assertDistinctIds(prompts, 'prompt');

  const sources = [];
  for (const ref of refs) {
    if (!BENCHMARK_CATEGORIES.includes(ref.category) || !ref.path || !isDigest(ref.sha256)) fail(`invalid reference: ${ref.id}`);
    const absolute = path.resolve(sourceBase, ref.path);
    const bytes = await fs.readFile(absolute);
    if (sha256(bytes) !== ref.sha256) fail(`reference digest mismatch: ${ref.id}`);
    sources.push({id: ref.id, category: ref.category, sha256: ref.sha256, sizeBytes: bytes.length, path: absolute});
  }
  if (new Set(sources.map((source) => source.sha256)).size !== sources.length) fail('references must have distinct digests');
  if (new Set(sources.map((source) => source.category)).size < 3) fail('matrix requires three materially different reference classes');

  if (!manifest.commonPrompt) fail('commonPrompt file is required');
  const commonPromptBytes = await fs.readFile(path.resolve(sourceBase, manifest.commonPrompt));
  const commonPrompt = {sha256: sha256(commonPromptBytes), text: commonPromptBytes.toString('utf8')};
  const promptRecords = [];
  for (const prompt of prompts) {
    const bytes = await fs.readFile(path.resolve(sourceBase, prompt.path));
    promptRecords.push({id: prompt.id, sha256: sha256(bytes), text: bytes.toString('utf8')});
  }
  if (new Set(promptRecords.map((prompt) => prompt.sha256)).size !== promptRecords.length) fail('prompt variants must have distinct content');

  if (new Set(workers.map((worker) => `${worker.provider ?? 'unknown'}\0${worker.model}`)).size !== workers.length) fail('worker provider/model identities must be distinct');
  for (const worker of workers) {
    if (!worker.executable || !Array.isArray(worker.args) || !worker.model || !Number.isInteger(worker.timeoutSeconds) || worker.timeoutSeconds < 1) fail(`invalid worker: ${worker.id}`);
  }

  await fs.mkdir(out, {recursive: true});
  const runIds = sources.flatMap((source) => workers.flatMap((worker) => promptRecords.map((prompt) => `${source.id}--${worker.id}--${prompt.id}`)));
  if (options.only && !runIds.includes(options.only)) fail(`unknown matrix cell: ${options.only}`);
  const plan = {
    schema: 'refas.cross-model-benchmark-plan/v1',
    refasCommit: commit, manifestSha256: sha256(manifestBytes), commonPromptSha256: commonPrompt.sha256,
    references: sources.map(({path: _path, ...rest}) => rest),
    workers: workers.map(({executable: _executable, args: _args, ...worker}) => worker),
    prompts: promptRecords.map(({text: _text, ...rest}) => rest),
    cells: runIds.length, runIds,
    policy: {structuredOutcomesOnly: true, aggregateScoreForbidden: true, manualRenderInspectionRequired: true, runnerDoesNotCertify: true},
  };
  await fs.writeFile(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  if (String(options['dry-run']) === 'true') { process.stdout.write(`${runIds.length} cells planned at ${commit}\n`); return; }

  const results = [];
  for (const source of sources) for (const worker of workers) for (const prompt of promptRecords) {
    const id = `${source.id}--${worker.id}--${prompt.id}`;
    if (options.only && options.only !== id) continue;
    const runDir = path.join(out, id);
    try { await fs.access(runDir); fail(`run directory already exists: ${id}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.mkdir(runDir, {recursive: true});
    const promptText = `${commonPrompt.text}\n\n${prompt.text}\n\nReference: ${source.path}\nOutput directory: ${runDir}\nRefAs checkout: ${refasRoot}\nRefAs commit: ${commit}\n`;
    const promptFile = path.join(runDir, 'prompt.txt');
    await fs.writeFile(promptFile, promptText);
    const replace = (value) => String(value)
      .replaceAll('{prompt}', promptFile).replaceAll('{reference}', source.path).replaceAll('{output}', runDir)
      .replaceAll('{model}', worker.model).replaceAll('{promptText}', promptText).replaceAll('{refasRoot}', refasRoot).replaceAll('{commit}', commit);
    const workerArgs = worker.args.map(replace);
    const startedAt = new Date(), startedNs = process.hrtime.bigint();
    let exitCode = null, error = null, timedOut = false;
    const stdoutFile = path.join(runDir, 'stdout.log'), stderrFile = path.join(runDir, 'stderr.log');
    const stdout = fsSync.openSync(stdoutFile, 'w'), stderr = fsSync.openSync(stderrFile, 'w');
    const child = spawn(worker.executable, workerArgs, {
      cwd: runDir,
      env: {...process.env, REFAS_BENCHMARK_OUTPUT: runDir, REFAS_BENCHMARK_REFERENCE: source.path, REFAS_BENCHMARK_REFAS_ROOT: refasRoot, REFAS_BENCHMARK_REFAS_COMMIT: commit, REFAS_BENCHMARK_PROMPT_ID: prompt.id, REFAS_BENCHMARK_WORKER_ID: worker.id},
      stdio: ['ignore', stdout, stderr],
    });
    const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, worker.timeoutSeconds * 1000);
    try { exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); }
    catch (cause) { error = cause.message; }
    finally { clearTimeout(deadline); fsSync.closeSync(stdout); fsSync.closeSync(stderr); }
    const endedAt = new Date(), elapsedSeconds = Number(process.hrtime.bigint() - startedNs) / 1e9;
    if (timedOut) error = 'worker timed out';
    else if (exitCode !== 0) error = [error, `worker exited ${exitCode}`].filter(Boolean).join('; ');

    let outcome = null;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(runDir, 'outcome.json'), 'utf8'));
      rejectScoreFields(raw);
      const verdicts = ['PROCEED', 'REWORK', 'HOLD', 'INSUFFICIENT'];
      const certification = ['certified', 'refused', 'not-attempted'];
      if (!verdicts.includes(raw.r04) || !verdicts.includes(raw.vc04) || !certification.includes(raw.certification)
        || !['PLANAR_COLLAPSE', 'NO_PLANAR_COLLAPSE', 'NOT_APPLICABLE', 'INSUFFICIENT'].includes(raw.vc03)
        || !Number.isInteger(raw.reopenCount) || raw.reopenCount < 0
        || !(raw.firstMultiviewSeconds === null || Number.isFinite(raw.firstMultiviewSeconds) && raw.firstMultiviewSeconds >= 0)) fail('invalid outcome fields');
      if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) fail('outcome requires evidence');
      const evidence = [];
      for (const item of raw.evidence) {
        const relative = safeRelative(item.path, 'evidence.path');
        const bytes = await fs.readFile(path.join(runDir, relative));
        evidence.push({path: relative, sha256: sha256(bytes), sizeBytes: bytes.length});
      }
      outcome = {r04: raw.r04, vc03: raw.vc03, vc04: raw.vc04, certification: raw.certification, reopenCount: raw.reopenCount, firstMultiviewSeconds: raw.firstMultiviewSeconds, evidence};
    } catch (cause) {
      error = [error, `outcome unavailable: ${cause.message}`].filter(Boolean).join('; ');
    }
    const logs = [];
    for (const name of ['stdout.log', 'stderr.log']) {
      const bytes = await fs.readFile(path.join(runDir, name));
      logs.push({path: `${id}/${name}`, sha256: sha256(bytes), sizeBytes: bytes.length});
    }
    results.push({
      id, referenceId: source.id, referenceCategory: source.category,
      workerId: worker.id, provider: worker.provider ?? null, model: worker.model, promptId: prompt.id,
      startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), elapsedSeconds,
      exitCode, error, logs, outcome,
    });
    const expectedResults = options.only ? 1 : runIds.length;
    const report = {
      schema: 'refas.cross-model-benchmark/v1',
      claimScope: 'worker-reported-structured-outcomes-with-digest-bound-evidence',
      complete: results.length === expectedResults && results.every((item) => item.outcome !== null && item.error === null),
      fullMatrix: !options.only && results.length === runIds.length,
      refasCommit: commit, manifestSha256: sha256(manifestBytes), commonPromptSha256: commonPrompt.sha256,
      references: sources.map(({path: _path, ...rest}) => rest),
      workers: workers.map(({executable: _executable, args: _args, ...rest}) => rest),
      prompts: promptRecords.map(({text: _text, ...rest}) => rest),
      results,
      policy: {structuredOutcomesOnly: true, aggregateScoreForbidden: true, manualRenderInspectionRequired: true, runnerDoesNotCertify: true, completeDoesNotMeanAccepted: true},
    };
    await fs.writeFile(path.join(out, 'matrix.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${id}: ${outcome ? 'recorded' : 'incomplete'}\n`);
  }
}

main().catch((error) => { process.stderr.write(`Cross-model benchmark failed: ${error.stack ?? error.message}\n`); process.exit(1); });

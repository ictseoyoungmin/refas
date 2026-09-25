#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fsSync from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith('--')) pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));
if (!options.manifest || !options.out) fail('usage: run-workers.mjs --manifest FILE --out DIR');
const manifestFile = path.resolve(options.manifest);
const manifestBytes = await fs.readFile(manifestFile);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const out = path.resolve(options.out);
try { await fs.access(path.join(out, 'matrix.json')); fail('output already contains a matrix; use a new directory for an independent run'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const sourceBase = path.dirname(manifestFile);
const refasRoot = path.resolve(sourceBase, manifest.refasRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const commit = execFileSync('git', ['-C', refasRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const refs = manifest.references ?? [];
const workers = manifest.workers ?? [];
const prompts = manifest.prompts ?? [];
if (refs.length < 3 || workers.length < 2 || prompts.length < 2) fail('matrix requires at least three references, two workers, and two prompt variants');
const ids = (items, label) => {
  const values = items.map((item) => item.id);
  if (values.some((id) => !/^[a-z][a-z0-9-]*$/u.test(id)) || new Set(values).size !== values.length) fail(`${label} IDs must be distinct semantic slugs`);
};
ids(refs, 'reference'); ids(workers, 'worker'); ids(prompts, 'prompt');
const sources = [];
for (const ref of refs) {
  if (!ref.category || !ref.path || !/^[a-f0-9]{64}$/u.test(ref.sha256)) fail(`invalid reference: ${ref.id}`);
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
if (new Set(workers.map((worker) => worker.model)).size !== workers.length) fail('worker models must be distinct');
for (const worker of workers) {
  if (!worker.executable || !Array.isArray(worker.args) || !worker.model || !Number.isInteger(worker.timeoutSeconds) || worker.timeoutSeconds < 1) fail(`invalid worker: ${worker.id}`);
}
await fs.mkdir(out, {recursive: true});
const runIds = sources.flatMap((source) => workers.flatMap((worker) => promptRecords.map((prompt) => `${source.id}--${worker.id}--${prompt.id}`)));
if (options.only && !runIds.includes(options.only)) fail(`unknown matrix cell: ${options.only}`);
if (options['dry-run'] === 'true') {
  const plan = {schema: 'refas.cross-model-benchmark-plan/v1', refasCommit: commit, manifestSha256: sha256(manifestBytes), commonPromptSha256: commonPrompt.sha256, references: sources.map(({path: _path, ...rest}) => rest), prompts: promptRecords.map(({text: _text, ...rest}) => rest), runIds};
  await fs.writeFile(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(`${runIds.length} cells planned\n`);
  process.exit(0);
}
const results = [];
for (const source of sources) for (const worker of workers) for (const prompt of promptRecords) {
  const id = `${source.id}--${worker.id}--${prompt.id}`;
  if (options.only && options.only !== id) continue;
  const runDir = path.join(out, id);
  await fs.mkdir(runDir, {recursive: true});
  const promptText = `${commonPrompt.text}\n\n${prompt.text}\n\nReference: ${source.path}\nOutput directory: ${runDir}\nRefAs checkout: ${refasRoot}\nRefAs commit: ${commit}\n`;
  const promptFile = path.join(runDir, 'prompt.txt');
  await fs.writeFile(promptFile, promptText);
  const replace = (value) => String(value).replaceAll('{prompt}', promptFile).replaceAll('{reference}', source.path).replaceAll('{output}', runDir).replaceAll('{model}', worker.model).replaceAll('{promptText}', promptText);
  const args = worker.args.map(replace);
  const start = new Date();
  let exitCode = null;
  let error = null;
  let timedOut = false;
  const stdout = fsSync.openSync(path.join(runDir, 'stdout.log'), 'w');
  const stderr = fsSync.openSync(path.join(runDir, 'stderr.log'), 'w');
  const child = spawn(worker.executable, args, {cwd: runDir, env: {...process.env, REFAS_BENCHMARK_OUTPUT: runDir, REFAS_BENCHMARK_REFERENCE: source.path, REFAS_BENCHMARK_REFAS_ROOT: refasRoot}, stdio: ['ignore', stdout, stderr]});
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, worker.timeoutSeconds * 1000);
  try { exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); }
  catch (cause) { error = cause.message; }
  finally { clearTimeout(deadline); fsSync.closeSync(stdout); fsSync.closeSync(stderr); }
  const end = new Date();
  if (timedOut) error = 'worker timed out';
  else if (exitCode !== 0) error = [error, `worker exited ${exitCode}`].filter(Boolean).join('; ');
  const reportPath = path.join(runDir, 'outcome.json');
  let outcome = null;
  try {
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    const verdicts = ['PROCEED', 'REWORK', 'HOLD', 'INSUFFICIENT'];
    const certification = ['certified', 'refused', 'not-attempted'];
    if (!verdicts.includes(report.r04) || !verdicts.includes(report.vc04) || !certification.includes(report.certification) || !['PLANAR_COLLAPSE', 'NO_PLANAR_COLLAPSE', 'NOT_APPLICABLE', 'INSUFFICIENT'].includes(report.vc03) || !Number.isInteger(report.reopenCount) || report.reopenCount < 0 || !(report.firstMultiviewSeconds === null || Number.isFinite(report.firstMultiviewSeconds) && report.firstMultiviewSeconds >= 0)) fail('invalid outcome fields');
    if (!Array.isArray(report.evidence) || report.evidence.length === 0) fail('outcome requires evidence');
    const evidence = [];
    for (const item of report.evidence) {
      if (!item.path || path.isAbsolute(item.path) || item.path.split(/[\\/]/u).includes('..')) fail('evidence path escapes run directory');
      const bytes = await fs.readFile(path.join(runDir, item.path));
      evidence.push({path: item.path, sha256: sha256(bytes), sizeBytes: bytes.length});
    }
    outcome = {r04: report.r04, vc03: report.vc03, vc04: report.vc04, certification: report.certification, reopenCount: report.reopenCount, firstMultiviewSeconds: report.firstMultiviewSeconds, evidence};
  } catch (cause) { error = [error, `outcome unavailable: ${cause.message}`].filter(Boolean).join('; '); }
  const logs = [];
  for (const name of ['stdout.log', 'stderr.log']) {
    const bytes = await fs.readFile(path.join(runDir, name));
    logs.push({path: `${id}/${name}`, sha256: sha256(bytes), sizeBytes: bytes.length});
  }
  results.push({id, logs, referenceId: source.id, workerId: worker.id, model: worker.model, promptId: prompt.id, startedAt: start.toISOString(), endedAt: end.toISOString(), exitCode, error, outcome});
  const report = {schema: 'refas.cross-model-benchmark/v1', claimScope: 'worker-reported-outcomes-with-digest-bound-evidence', complete: results.length === runIds.length && results.every((item) => item.outcome !== null && item.error === null), refasCommit: commit, manifestSha256: sha256(manifestBytes), commonPromptSha256: commonPrompt.sha256, references: sources.map(({path: _path, ...rest}) => rest), workers: workers.map(({executable: _executable, args: _args, ...rest}) => rest), prompts: promptRecords.map(({text: _text, ...rest}) => rest), results};
  await fs.writeFile(path.join(out, 'matrix.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${id}: ${outcome ? 'recorded' : 'incomplete'}\n`);
}

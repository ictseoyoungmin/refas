#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import * as PUBLIC_API from './lib/index.mjs';
import {CAPABILITY_ORDER} from './lib/index.mjs';
import {analyzeSemanticInstructionGraph} from './verify_semantic_instruction_graph.mjs';
import {analyzeCapabilityInterfaces} from './verify_capability_interfaces.mjs';
import {runFreshWorkerDogfood} from './verify_fresh_worker_dogfood.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT = path.dirname(SCRIPT_DIR);
const PUBLIC_LIBRARY_ENTRYPOINT = 'scripts/lib/index.mjs';
const ALWAYS_LOAD = Object.freeze([
  'references/INDEX.md',
  'references/workflow.md',
  'references/checkpointing.md',
  'references/failure-routing.md',
]);
const PARENT_PREFIX = ['..', ''].join('/');

const portable = (value) => String(value).split(path.sep).join('/');
const sorted = (values) => [...new Set(values)].sort();

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

async function walk(root, relative = '') {
  const absolute = path.join(root, relative);
  let entries;
  try { entries = await fs.readdir(absolute, {withFileTypes: true}); }
  catch { return []; }
  const output = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await walk(root, child));
    else if (entry.isFile()) output.push(portable(child));
  }
  return output.sort();
}

function skillRoute(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const route = value.split('#', 1)[0].split('?', 1)[0];
  const normalized = portable(path.posix.normalize(route));
  if (
    path.posix.isAbsolute(normalized)
    || normalized === '..'
    || normalized.startsWith(PARENT_PREFIX)
    || normalized.startsWith('skills/refas/')
  ) return null;
  return normalized;
}

function markdownRoutes(text) {
  const references = [];
  const templates = [];
  for (const match of String(text).matchAll(/\b(references\/[A-Za-z0-9._/-]+\.md)\b/gu)) references.push(match[1]);
  for (const match of String(text).matchAll(/\b(assets\/templates\/[A-Za-z0-9._/-]+\.json(?:#[^\s`"'()<>]+)?)\b/gu)) templates.push(match[1]);
  return {references: sorted(references), templates: sorted(templates)};
}

function privateImplementationRoutes(text) {
  const output = [];
  for (const match of String(text).matchAll(/(?:\.\/)?(scripts\/lib\/[A-Za-z0-9._/-]+\.mjs)\b/gu)) {
    if (match[1] !== PUBLIC_LIBRARY_ENTRYPOINT) output.push(match[1]);
  }
  return sorted(output);
}

function schemaIdsInValue(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) schemaIdsInValue(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (typeof value.schema === 'string' && /^refas\.[A-Za-z0-9._-]+\/v\d+$/u.test(value.schema)) output.add(value.schema);
  for (const child of Object.values(value)) schemaIdsInValue(child, output);
  return output;
}

async function concreteSchemaCatalog(schemaRoot) {
  if (!schemaRoot || !await exists(path.join(schemaRoot, 'README.md'))) return {available: false, ids: new Map(), files: []};
  const files = (await walk(schemaRoot)).filter((file) => file.endsWith('.schema.json'));
  const ids = new Map();
  for (const file of files) {
    let json;
    try { json = JSON.parse(await fs.readFile(path.join(schemaRoot, file), 'utf8')); } catch { continue; }
    const id = json?.properties?.schema?.const;
    if (typeof id === 'string') {
      if (!ids.has(id)) ids.set(id, []);
      ids.get(id).push(file);
    }
  }
  return {available: true, ids, files};
}

function cliHelp(skillRoot, bin, errors) {
  const scripts = {refas: 'refas.mjs', 'refas-host': 'refas-host.mjs'};
  const script = scripts[bin];
  if (!script) { errors.push(`unknown public CLI binary: ${bin}`); return {}; }
  const result = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', script), '--help'], {cwd: skillRoot, encoding: 'utf8'});
  if (result.status !== 0) {
    errors.push(`${bin} --help failed: ${String(result.stderr || result.stdout).trim()}`);
    return {};
  }
  try { return JSON.parse(result.stdout).commands ?? {}; }
  catch (error) { errors.push(`${bin} --help is not JSON: ${error.message}`); return {}; }
}

function describe(skillRoot, namespace, id, errors) {
  const result = spawnSync(process.execPath, [path.join(skillRoot, 'scripts', 'refas.mjs'), 'describe', namespace, id], {
    cwd: skillRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`describe ${namespace} ${id} failed: ${String(result.stderr || result.stdout).trim()}`);
    return null;
  }
  try { return JSON.parse(result.stdout); }
  catch (error) {
    errors.push(`describe ${namespace} ${id} returned invalid JSON: ${error.message}`);
    return null;
  }
}

export async function analyzeDiscoveryClosure({
  skillRoot = DEFAULT_SKILL_ROOT,
  schemaRoot = undefined,
  runFreshWorker = false,
} = {}) {
  skillRoot = path.resolve(skillRoot);
  if (schemaRoot === undefined) {
    const candidate = path.resolve(skillRoot, '..', '..', 'schemas');
    schemaRoot = await exists(path.join(candidate, 'README.md')) ? candidate : null;
  } else if (schemaRoot != null) {
    schemaRoot = path.resolve(schemaRoot);
  }

  const missing = [];
  const orphan = [];
  const privateDependencies = [];
  const unreachable = [];
  const notes = [];

  const skillPath = path.join(skillRoot, 'SKILL.md');
  const indexPath = path.join(skillRoot, 'references', 'INDEX.md');
  const graphPath = path.join(skillRoot, 'references', 'GRAPH.json');
  for (const required of ['SKILL.md', 'references/INDEX.md', 'references/GRAPH.json', ...ALWAYS_LOAD.slice(1)]) {
    if (!await exists(path.join(skillRoot, required))) missing.push(`root:${required}`);
  }

  const skillText = await fs.readFile(skillPath, 'utf8');
  const indexText = await fs.readFile(indexPath, 'utf8');
  for (const route of ALWAYS_LOAD) {
    if (!skillText.includes(route) && route !== 'references/INDEX.md') unreachable.push(`SKILL.md does not route required control leaf: ${route}`);
  }
  if (!skillText.includes('references/INDEX.md')) unreachable.push('SKILL.md does not route references/INDEX.md');
  if (!indexText.includes('references/GRAPH.json')) unreachable.push('INDEX.md does not route references/GRAPH.json');
  if (!indexText.includes('describe node <instruction-node-id>')) unreachable.push('INDEX.md does not expose describe node namespace');
  if (!indexText.includes('describe capability <runtime-capability-id>')) unreachable.push('INDEX.md does not expose describe capability namespace');

  let graph = {nodes: []};
  try { graph = JSON.parse(await fs.readFile(graphPath, 'utf8')); }
  catch (error) { missing.push(`graph: ${error.message}`); }

  const semantic = await analyzeSemanticInstructionGraph({skillRoot});
  for (const error of semantic.errors ?? []) missing.push(`semantic-graph:${error}`);
  const interfaces = await analyzeCapabilityInterfaces({skillRoot, exerciseContracts: false});
  for (const error of interfaces.errors ?? []) missing.push(`interface:${error}`);

  const actualReferenceFiles = (await walk(path.join(skillRoot, 'references')))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `references/${file}`);
  const actualTemplates = (await walk(path.join(skillRoot, 'assets', 'templates')))
    .filter((file) => file.endsWith('.json'))
    .map((file) => `assets/templates/${file}`);

  const reachableReferences = new Set(['references/INDEX.md', ...ALWAYS_LOAD.slice(1)]);
  const reachableTemplates = new Set();
  const queue = ['SKILL.md', ...reachableReferences];

  for (const node of graph.nodes ?? []) {
    const route = skillRoute(node.path);
    if (!route) {
      unreachable.push(`node ${node.id} has non-skill-local path: ${node.path}`);
      continue;
    }
    if (!await exists(path.join(skillRoot, route))) missing.push(`node ${node.id} leaf missing: ${route}`);
    reachableReferences.add(route);
    queue.push(route);

    for (const entry of node.interface?.interfaces ?? []) {
      for (const candidate of [entry.usageReference, entry.minimumInvocation, entry.example]) {
        const normalized = skillRoute(candidate);
        if (normalized?.startsWith('references/')) {
          reachableReferences.add(normalized);
          queue.push(normalized);
        }
      }
      if (entry.template) {
        const normalized = skillRoute(entry.template);
        if (!normalized) unreachable.push(`${node.id}/${entry.id} template escapes skill root: ${entry.template}`);
        else reachableTemplates.add(normalized);
      }
      if (entry.library?.entrypoint && entry.library.entrypoint !== PUBLIC_LIBRARY_ENTRYPOINT) {
        privateDependencies.push(`${node.id}/${entry.id} library entrypoint: ${entry.library.entrypoint}`);
      }
    }
  }

  const visitedDocs = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (visitedDocs.has(current)) continue;
    visitedDocs.add(current);
    const absolute = path.join(skillRoot, current);
    if (!await exists(absolute)) {
      missing.push(`public-route:${current}`);
      continue;
    }
    const text = await fs.readFile(absolute, 'utf8');
    for (const route of privateImplementationRoutes(text)) privateDependencies.push(`${current} -> ${route}`);
    const routes = markdownRoutes(text);
    for (const ref of routes.references) {
      if (!await exists(path.join(skillRoot, ref))) missing.push(`${current} -> missing ${ref}`);
      if (!reachableReferences.has(ref)) {
        reachableReferences.add(ref);
        queue.push(ref);
      }
    }
    for (const templateRef of routes.templates) {
      const normalized = skillRoute(templateRef);
      if (normalized) reachableTemplates.add(normalized);
    }
  }

  for (const ref of actualReferenceFiles) {
    if (!reachableReferences.has(ref)) orphan.push(`reference:${ref}`);
  }
  for (const ref of reachableReferences) {
    if (!actualReferenceFiles.includes(ref)) missing.push(`reference:${ref}`);
  }
  for (const template of actualTemplates) {
    if (!reachableTemplates.has(template)) orphan.push(`template:${template}`);
  }
  for (const template of reachableTemplates) {
    if (!actualTemplates.includes(template)) missing.push(`template:${template}`);
  }

  const describedNodes = [];
  for (const node of graph.nodes ?? []) {
    const result = describe(skillRoot, 'node', node.id, unreachable);
    if (!result) continue;
    describedNodes.push(node.id);
    const describedIds = (result.interface?.interfaces ?? []).map((entry) => entry.id);
    const expectedIds = (node.interface?.interfaces ?? []).map((entry) => entry.id);
    if (JSON.stringify(describedIds) !== JSON.stringify(expectedIds)) {
      unreachable.push(`describe node ${node.id} interface set mismatch`);
    }
  }

  const describedCapabilities = [];
  for (const capability of CAPABILITY_ORDER) {
    const result = describe(skillRoot, 'capability', capability, unreachable);
    if (!result) continue;
    describedCapabilities.push(capability);
    const expectedNodeIds = (graph.nodes ?? []).filter((node) => (node.runtimeCapabilities ?? []).includes(capability)).map((node) => node.id);
    const actualNodeIds = (result.nodes ?? []).map((node) => node.id);
    if (JSON.stringify(actualNodeIds) !== JSON.stringify(expectedNodeIds)) {
      unreachable.push(`describe capability ${capability} node projection mismatch`);
    }
  }

  const cliBins = sorted((graph.nodes ?? []).flatMap((node) => (node.interface?.interfaces ?? []).map((entry) => entry.cli?.bin).filter(Boolean)));
  const cliCatalogs = Object.fromEntries(cliBins.map((bin) => [bin, cliHelp(skillRoot, bin, unreachable)]));
  const cliOperations = [];
  const publicApiSymbols = new Set();
  const outputSchemaIds = new Set();
  const outputSchemasWithoutPublicValidation = [];

  for (const node of graph.nodes ?? []) {
    for (const entry of node.interface?.interfaces ?? []) {
      const key = `${node.id}/${entry.id}`;
      if (entry.cli) {
        cliOperations.push(`${entry.cli.bin}:${entry.cli.command}`);
        if (!cliCatalogs[entry.cli.bin]?.[entry.cli.command]) unreachable.push(`${key} CLI command not advertised: ${entry.cli.bin} ${entry.cli.command}`);
      }
      for (const symbol of [entry.library?.symbol, entry.validator?.library, entry.templateProcessor?.library, ...(entry.publicConstants ?? [])].filter(Boolean)) {
        publicApiSymbols.add(symbol);
        if (!(symbol in PUBLIC_API)) missing.push(`${key} public API symbol missing: ${symbol}`);
      }
      if (entry.outputSchema) {
        outputSchemaIds.add(entry.outputSchema);
        if (!entry.validator?.library && !entry.cli) outputSchemasWithoutPublicValidation.push(`${key} -> ${entry.outputSchema}`);
      }
    }
  }
  for (const item of outputSchemasWithoutPublicValidation) missing.push(`schema-validation-surface:${item}`);

  const templateSchemaIds = new Set();
  for (const template of actualTemplates) {
    try {
      const json = JSON.parse(await fs.readFile(path.join(skillRoot, template), 'utf8'));
      schemaIdsInValue(json, templateSchemaIds);
    } catch (error) {
      missing.push(`template-json:${template}: ${error.message}`);
    }
  }

  const workerFacingSchemaIds = sorted([...outputSchemaIds, ...templateSchemaIds]);
  const schemaCatalog = await concreteSchemaCatalog(schemaRoot);
  const concreteSchemaIds = sorted(schemaCatalog.ids.keys());
  if (schemaCatalog.available) {
    for (const schemaId of workerFacingSchemaIds) {
      if (!schemaCatalog.ids.has(schemaId)) missing.push(`schema:${schemaId}`);
      else if (schemaCatalog.ids.get(schemaId).length !== 1) missing.push(`schema-duplicate:${schemaId}`);
    }
  } else {
    notes.push('concrete repository/package schema files unavailable in installed-skill-only mode; output schema closure relies on public validators/CLI contracts');
  }

  let freshWorker = null;
  if (runFreshWorker && !missing.length && !orphan.length && !privateDependencies.length && !unreachable.length) {
    freshWorker = await runFreshWorkerDogfood({skillRoot});
    if (freshWorker.status !== 'PASS') unreachable.push('AD05 fresh-worker dogfood did not pass');
    if (freshWorker.capabilitiesDiscovered !== CAPABILITY_ORDER.length) unreachable.push('AD05 fresh-worker capability count mismatch');
    if (freshWorker.checkpointsCommitted !== CAPABILITY_ORDER.length) unreachable.push('AD05 fresh-worker checkpoint count mismatch');
    if (freshWorker.normalBoundaryViolations !== 0) privateDependencies.push('AD05 fresh-worker boundary violations were nonzero');
  }

  const result = {
    status: missing.length || orphan.length || privateDependencies.length || unreachable.length ? 'FAIL' : 'PASS',
    schema: 'refas.discovery-closure-report/v1',
    installedSkillOnly: !schemaCatalog.available,
    instructionNodes: graph.nodes?.length ?? 0,
    runtimeCapabilities: CAPABILITY_ORDER.length,
    executableInterfaces: interfaces.executableInterfaces ?? 0,
    describedNodes: describedNodes.length,
    describedCapabilities: describedCapabilities.length,
    reachableReferenceLeaves: reachableReferences.size,
    publicReferenceLeaves: actualReferenceFiles.length,
    reachableTemplates: reachableTemplates.size,
    publicTemplates: actualTemplates.length,
    outputSchemaContracts: outputSchemaIds.size,
    workerFacingSchemaIds: workerFacingSchemaIds.length,
    concreteSchemaFilesAvailable: schemaCatalog.available,
    concreteSchemaIds: concreteSchemaIds.length,
    publicApiSymbols: publicApiSymbols.size,
    cliOperations: sorted(cliOperations).length,
    freshWorker: freshWorker ? {
      status: freshWorker.status,
      capabilitiesDiscovered: freshWorker.capabilitiesDiscovered,
      checkpointsCommitted: freshWorker.checkpointsCommitted,
      rawImplementationReads: freshWorker.rawImplementationReads,
      implementationSearchCommands: freshWorker.implementationSearchCommands,
      normalBoundaryViolations: freshWorker.normalBoundaryViolations,
      bypassProbesBlocked: freshWorker.bypassProbesBlocked,
    } : null,
    missing: sorted(missing),
    orphan: sorted(orphan),
    privateDependencies: sorted(privateDependencies),
    unreachable: sorted(unreachable),
    notes,
  };
  return result;
}

export async function verifyDiscoveryClosure(options = {}) {
  const result = await analyzeDiscoveryClosure(options);
  if (result.status !== 'PASS') {
    const lines = [
      ...result.missing.map((item) => `missing: ${item}`),
      ...result.orphan.map((item) => `orphan: ${item}`),
      ...result.privateDependencies.map((item) => `private-dependency: ${item}`),
      ...result.unreachable.map((item) => `unreachable: ${item}`),
    ];
    throw new Error(lines.join('\n'));
  }
  return result;
}

function parseArgs(argv) {
  return {
    runFreshWorker: !argv.includes('--no-fresh-worker'),
    schemaRoot: (() => {
      const index = argv.indexOf('--schema-root');
      return index >= 0 ? argv[index + 1] : undefined;
    })(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await verifyDiscoveryClosure(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Discovery closure verification failed:\n${error.message}\n`);
    process.exit(1);
  });
}

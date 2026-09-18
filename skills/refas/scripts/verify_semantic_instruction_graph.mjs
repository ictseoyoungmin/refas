#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {CAPABILITY_ORDER, FINDING_OWNERS} from './lib/ownership.mjs';
import * as PUBLIC_API from './lib/index.mjs';

const DEFAULT_SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_PATH = 'references/GRAPH.json';
const ALLOWED_CONTROL_OWNER = 'control';
const INTERFACE_SCHEMA = 'refas.instruction-node-interface/v1';
const PUBLIC_LIBRARY_ENTRYPOINT = 'scripts/lib/index.mjs';
const ALLOWED_INTERFACE_MODES = new Set(['instruction-only', 'cli', 'library', 'hybrid']);
const ALLOWED_CLI_BINS = new Set(['refas', 'refas-host']);
const ALLOWED_INTERFACE_PATH_ROOTS = Object.freeze(['references/', 'assets/']);
const PARENT_ROUTE_PREFIX = ['..', ''].join('/');
const REPOSITORY_SKILL_PREFIX = ['skills', 'refas', ''].join('/');
const REQUIRED_REAL_SOURCE_NODES = Object.freeze([
  'candidate-transactions',
  'validation',
  'relational-structure',
  'inference-authority',
  'whole-system-relational-barrier',
]);
const REQUIRED_REAL_SOURCE_ARTIFACT = 'refas.certification-relational-evidence/v1';
const ALLOWED_BARE_MARKDOWN = new Set(['SKILL.md', 'INDEX.md']);
const RELATIONAL_BARRIER_NODE = 'whole-system-relational-barrier';
const LEGACY_HIDDEN_GEOMETRY_POLICY_PATTERNS = Object.freeze([
  {id: 'invented-hidden-mechanism-prohibition', pattern: /does not authorize invented anatomy or hidden mechanisms/iu},
  {id: 'hidden-uncertainty-heading', pattern: /visible obligations and hidden uncertainty/iu},
  {id: 'hidden-geometry-default-ambiguity', pattern: /genuinely hidden depth, rear surfaces, internal pins/iu},
  {id: 'unseen-continuation-only-ambiguity', pattern: /record only the unseen continuation as an ambiguity/iu},
]);
const HIDDEN_GEOMETRY_POLICY_SOURCES = Object.freeze([
  'SKILL.md',
  'references/workflow.md',
  'references/observation.md',
  'references/spatial-reasoning.md',
  'references/inference-authority.md',
  'references/construction.md',
  'references/organic-articulated-construction.md',
]);

const portable = (value) => value.split(path.sep).join('/');

async function walk(root, relative = '') {
  const absolute = path.join(root, relative);
  const entries = await fs.readdir(absolute, {withFileTypes: true});
  const output = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await walk(root, child));
    else if (entry.isFile()) output.push(portable(child));
  }
  return output.sort();
}

async function referenceLeaves(skillRoot) {
  const files = await walk(path.join(skillRoot, 'references'));
  return files
    .filter((file) => file.endsWith('.md') && file !== 'INDEX.md')
    .map((file) => `references/${file}`)
    .sort();
}

export function extractBareMarkdownRoutes(markdown) {
  const found = new Set();
  for (const match of String(markdown).matchAll(/`([A-Za-z0-9_.-]+\.md)`/gu)) {
    if (!ALLOWED_BARE_MARKDOWN.has(match[1])) found.add(match[1]);
  }
  for (const match of String(markdown).matchAll(/\[[^\]]*\]\(([A-Za-z0-9_.-]+\.md)(?:[?#][^)]*)?\)/gu)) {
    if (!ALLOWED_BARE_MARKDOWN.has(match[1])) found.add(match[1]);
  }
  return [...found].sort();
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function hardDependencyCycle(nodesById) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    const node = nodesById.get(id);
    for (const dependency of node?.requires ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of nodesById.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function conditionalDependencyIds(node) {
  return new Set((node?.conditionalRequires ?? []).flatMap((edge) => edge?.nodes ?? []));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function normalizeInterfacePath(value, label, errors) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be null or a non-empty skill-local path`);
    return null;
  }
  const route = value.split('#', 1)[0].split('?', 1)[0];
  const normalized = portable(path.posix.normalize(route));
  const allowed = normalized === 'SKILL.md' || ALLOWED_INTERFACE_PATH_ROOTS.some((prefix) => normalized.startsWith(prefix));
  if (!allowed || path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(PARENT_ROUTE_PREFIX) || normalized.startsWith(REPOSITORY_SKILL_PREFIX)) {
    errors.push(`${label} must remain inside the installed skill root: ${value}`);
    return null;
  }
  return normalized;
}

async function verifyInterfacePath(skillRoot, value, label, errors) {
  const normalized = normalizeInterfacePath(value, label, errors);
  if (!normalized) return;
  try {
    const stat = await fs.stat(path.join(skillRoot, normalized));
    if (!stat.isFile()) errors.push(`${label} does not reference a file: ${value}`);
  } catch {
    errors.push(`${label} references a missing installed-skill file: ${value}`);
  }
}

async function validateNodeInterface(skillRoot, node, errors) {
  const runtimeCapabilities = node?.runtimeCapabilities;
  if (!Array.isArray(runtimeCapabilities)) {
    errors.push(`node ${node.id} runtimeCapabilities must be an array`);
  } else {
    for (const capability of runtimeCapabilities) {
      if (!CAPABILITY_ORDER.includes(capability)) errors.push(`node ${node.id} has unknown runtime capability: ${capability}`);
    }
    if (runtimeCapabilities.length !== new Set(runtimeCapabilities).size) errors.push(`node ${node.id} runtimeCapabilities must not contain duplicates`);
    const expected = sortedUnique((node.owners ?? []).filter((owner) => CAPABILITY_ORDER.includes(owner)));
    const actual = sortedUnique(runtimeCapabilities);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`node ${node.id} runtimeCapabilities must equal canonical runtime owners: expected=${expected.join(',')} actual=${actual.join(',')}`);
    }
  }

  const descriptor = node?.interface;
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    errors.push(`node ${node.id} must declare interface metadata`);
    return {operationCount: 0};
  }
  if (!ALLOWED_INTERFACE_MODES.has(descriptor.mode)) errors.push(`node ${node.id} has invalid interface mode: ${descriptor.mode}`);
  if (!Array.isArray(descriptor.interfaces)) {
    errors.push(`node ${node.id} interface.interfaces must be an array`);
    return {operationCount: 0};
  }

  const ids = descriptor.interfaces.map((entry) => String(entry?.id ?? ''));
  for (const duplicate of duplicateValues(ids)) errors.push(`node ${node.id} has duplicate interface id: ${duplicate}`);

  let hasCli = false;
  let hasLibrary = false;
  for (const [index, entry] of descriptor.interfaces.entries()) {
    const label = `node ${node.id} interface[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof entry.id !== 'string' || !entry.id.trim()) errors.push(`${label}.id must be a non-empty string`);
    if (typeof entry.operation !== 'string' || !entry.operation.trim()) errors.push(`${label}.operation must be a non-empty string`);
    if (typeof entry.inputContract !== 'string' || !entry.inputContract.trim()) errors.push(`${label}.inputContract must be a non-empty string`);
    if (entry.outputSchema != null && (typeof entry.outputSchema !== 'string' || !entry.outputSchema.trim())) errors.push(`${label}.outputSchema must be null or a non-empty string`);

    if (entry.cli != null) {
      hasCli = true;
      if (!entry.cli || typeof entry.cli !== 'object' || Array.isArray(entry.cli)) errors.push(`${label}.cli must be null or an object`);
      else {
        if (!ALLOWED_CLI_BINS.has(entry.cli.bin)) errors.push(`${label}.cli.bin is invalid: ${entry.cli.bin}`);
        if (typeof entry.cli.command !== 'string' || !entry.cli.command.trim()) errors.push(`${label}.cli.command must be a non-empty string`);
      }
    }

    if (entry.library != null) {
      hasLibrary = true;
      if (!entry.library || typeof entry.library !== 'object' || Array.isArray(entry.library)) errors.push(`${label}.library must be null or an object`);
      else {
        if (entry.library.entrypoint !== PUBLIC_LIBRARY_ENTRYPOINT) errors.push(`${label}.library.entrypoint must be ${PUBLIC_LIBRARY_ENTRYPOINT}`);
        if (typeof entry.library.symbol !== 'string' || !entry.library.symbol.trim()) errors.push(`${label}.library.symbol must be a non-empty string`);
        else if (!(entry.library.symbol in PUBLIC_API)) errors.push(`${label}.library.symbol is not exported by ${PUBLIC_LIBRARY_ENTRYPOINT}: ${entry.library.symbol}`);
      }
    }

    if (entry.cli == null && entry.library == null) errors.push(`${label} must expose a CLI or public library operation`);

    if (entry.validator != null) {
      if (!entry.validator || typeof entry.validator !== 'object' || Array.isArray(entry.validator)) errors.push(`${label}.validator must be null or an object`);
      else if (typeof entry.validator.library !== 'string' || !entry.validator.library.trim()) errors.push(`${label}.validator.library must be a non-empty string`);
      else if (!(entry.validator.library in PUBLIC_API)) errors.push(`${label}.validator.library is not exported by ${PUBLIC_LIBRARY_ENTRYPOINT}: ${entry.validator.library}`);
    }

    await verifyInterfacePath(skillRoot, entry.template, `${label}.template`, errors);
    await verifyInterfacePath(skillRoot, entry.minimumInvocation, `${label}.minimumInvocation`, errors);
    await verifyInterfacePath(skillRoot, entry.example, `${label}.example`, errors);
    if (entry.minimumInvocation == null) errors.push(`${label}.minimumInvocation is required for executable interface discovery`);
  }

  const expectedMode = descriptor.interfaces.length === 0
    ? 'instruction-only'
    : hasCli && hasLibrary
      ? 'hybrid'
      : hasCli
        ? 'cli'
        : 'library';
  if (descriptor.mode !== expectedMode) errors.push(`node ${node.id} interface mode must be ${expectedMode}, got ${descriptor.mode}`);
  if (descriptor.mode === 'instruction-only' && descriptor.interfaces.length !== 0) errors.push(`node ${node.id} instruction-only interface must not declare executable operations`);
  if (descriptor.mode !== 'instruction-only' && descriptor.interfaces.length === 0) errors.push(`node ${node.id} executable interface mode requires at least one operation`);

  return {operationCount: descriptor.interfaces.length};
}

async function findLegacyHiddenGeometryPolicy(skillRoot) {
  const hits = [];
  for (const source of HIDDEN_GEOMETRY_POLICY_SOURCES) {
    const text = await fs.readFile(path.join(skillRoot, source), 'utf8');
    for (const {id, pattern} of LEGACY_HIDDEN_GEOMETRY_POLICY_PATTERNS) {
      if (pattern.test(text)) hits.push({source, id});
    }
  }
  return hits;
}

export async function analyzeSemanticInstructionGraph({skillRoot = DEFAULT_SKILL_ROOT} = {}) {
  skillRoot = path.resolve(skillRoot);
  const graph = JSON.parse(await fs.readFile(path.join(skillRoot, GRAPH_PATH), 'utf8'));
  const errors = [];

  if (graph.schema !== 'refas.instruction-graph/v1') errors.push(`unexpected graph schema: ${graph.schema}`);
  if (graph.interfaceSchema !== INTERFACE_SCHEMA) errors.push(`unexpected instruction interface schema: ${graph.interfaceSchema}`);
  if (!Array.isArray(graph.nodes)) errors.push('graph.nodes must be an array');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const ids = nodes.map((node) => String(node.id ?? ''));
  const paths = nodes.map((node) => String(node.path ?? ''));
  for (const duplicate of duplicateValues(ids)) errors.push(`duplicate node id: ${duplicate}`);
  for (const duplicate of duplicateValues(paths)) errors.push(`duplicate node path: ${duplicate}`);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const leaves = await referenceLeaves(skillRoot);
  const leafSet = new Set(leaves);
  const nodePathSet = new Set(paths);
  for (const leaf of leaves) if (!nodePathSet.has(leaf)) errors.push(`semantic graph omits reference leaf: ${leaf}`);
  for (const nodePath of paths) {
    if (!leafSet.has(nodePath)) errors.push(`semantic graph references unknown/non-leaf path: ${nodePath}`);
    if (!nodePath.startsWith('references/') || nodePath.includes('..')) errors.push(`non-canonical semantic path: ${nodePath}`);
  }

  const allowedOwners = new Set([...CAPABILITY_ORDER, ALLOWED_CONTROL_OWNER]);
  for (const node of nodes) {
    if (!node.id || !node.path) continue;
    if (!Array.isArray(node.owners) || node.owners.length === 0) errors.push(`node ${node.id} must declare owners`);
    for (const owner of node.owners ?? []) if (!allowedOwners.has(owner)) errors.push(`node ${node.id} has unknown owner: ${owner}`);
    if (!Array.isArray(node.requires)) errors.push(`node ${node.id} requires must be an array`);
    for (const dependency of node.requires ?? []) if (!nodesById.has(dependency)) errors.push(`node ${node.id} requires unknown node: ${dependency}`);
    if (!Array.isArray(node.conditionalRequires)) errors.push(`node ${node.id} conditionalRequires must be an array`);
    for (const edge of node.conditionalRequires ?? []) {
      if (!edge || typeof edge.when !== 'string' || !edge.when.trim()) errors.push(`node ${node.id} has conditional dependency without condition`);
      if (!Array.isArray(edge?.nodes)) errors.push(`node ${node.id} conditional dependency nodes must be an array`);
      for (const dependency of edge?.nodes ?? []) if (!nodesById.has(dependency)) errors.push(`node ${node.id} conditionally requires unknown node: ${dependency}`);
    }
    if (typeof node.authority !== 'string' || !node.authority) errors.push(`node ${node.id} must declare authority`);
    if (!Array.isArray(node.closureEffects)) errors.push(`node ${node.id} closureEffects must be an array`);
  }

  let interfaceOperations = 0;
  for (const node of nodes) {
    const result = await validateNodeInterface(skillRoot, node, errors);
    interfaceOperations += result.operationCount;
  }
  const runtimeCapabilitiesCovered = sortedUnique(nodes.flatMap((node) => node.runtimeCapabilities ?? [])).filter((capability) => CAPABILITY_ORDER.includes(capability));

  const instructionOwners = new Set(nodes.flatMap((node) => node.owners ?? []));
  const missingCapabilityOwners = CAPABILITY_ORDER.filter((capability) => !instructionOwners.has(capability));
  for (const capability of missingCapabilityOwners) errors.push(`runtime capability has no instruction-graph owner: ${capability}`);

  const observationOwners = new Set(nodesById.get('observation')?.owners ?? []);
  if (!observationOwners.has('visual-hierarchy')) errors.push('observation instruction node must explicitly own visual-hierarchy routing');
  if (!observationOwners.has('visual-observation')) errors.push('observation instruction node must own visual-observation routing');

  for (const nodeId of ['construction', 'parameter-fitting']) {
    const node = nodesById.get(nodeId);
    if ((node?.requires ?? []).includes(RELATIONAL_BARRIER_NODE)) {
      errors.push(`${nodeId} must not hard-require ${RELATIONAL_BARRIER_NODE}; relational eligibility is applicability-scoped`);
    }
    if (!conditionalDependencyIds(node).has(RELATIONAL_BARRIER_NODE)) {
      errors.push(`${nodeId} must conditionally require ${RELATIONAL_BARRIER_NODE} when relational obligations apply`);
    }
  }

  const cycle = hardDependencyCycle(nodesById);
  if (cycle) errors.push(`hard semantic dependency cycle: ${cycle.join(' -> ')}`);

  const graphFindingOwners = graph.findingOwners ?? {};
  const runtimeFindingKeys = Object.keys(FINDING_OWNERS).sort();
  const graphFindingKeys = Object.keys(graphFindingOwners).sort();
  if (JSON.stringify(runtimeFindingKeys) !== JSON.stringify(graphFindingKeys)) {
    errors.push('semantic finding-owner catalog must exactly match runtime FINDING_OWNERS keys');
  }
  for (const [category, owner] of Object.entries(FINDING_OWNERS)) {
    if (graphFindingOwners[category] !== owner) errors.push(`finding owner mismatch for ${category}: graph=${graphFindingOwners[category]} runtime=${owner}`);
  }

  if (graphFindingOwners['camera-hypothesis-mismatch'] !== 'spatial-hypotheses') errors.push('camera-hypothesis-mismatch must belong to spatial-hypotheses');
  if (graphFindingOwners['render-camera-integrity'] !== 'rendering') errors.push('render-camera-integrity must belong to rendering');
  if (graphFindingOwners['camera-mismatch'] !== 'rendering') errors.push('legacy camera-mismatch compatibility owner must remain rendering');
  if (!graph.deprecatedFindings?.['camera-mismatch']) errors.push('camera-mismatch must be declared deprecated compatibility');

  const certification = graph.certification ?? {};
  if (certification.node !== 'claim-certification') errors.push('certification node must be claim-certification');
  const realSourceRequires = new Set(certification.realSourceRequires ?? []);
  for (const required of REQUIRED_REAL_SOURCE_NODES) if (!realSourceRequires.has(required)) errors.push(`real-source certification missing semantic prerequisite: ${required}`);
  const realSourceArtifacts = new Set(certification.realSourceArtifactRequirements ?? []);
  if (!realSourceArtifacts.has(REQUIRED_REAL_SOURCE_ARTIFACT)) errors.push(`real-source certification missing artifact floor: ${REQUIRED_REAL_SOURCE_ARTIFACT}`);
  if (!(nodesById.get('whole-system-relational-barrier')?.closureEffects ?? []).includes('gates-lower-scope-hardening')) errors.push('whole-system relational barrier must gate lower-scope hardening');
  if (!(nodesById.get('claim-certification')?.closureEffects ?? []).includes('authorizes-whole-object-certificate')) errors.push('claim certification must be the whole-object authorization node');

  const bareMarkdownRoutes = [];
  const markdownSources = ['SKILL.md', ...leaves];
  for (const source of markdownSources) {
    const text = await fs.readFile(path.join(skillRoot, source), 'utf8');
    for (const route of extractBareMarkdownRoutes(text)) bareMarkdownRoutes.push({source, route});
  }
  for (const item of bareMarkdownRoutes) errors.push(`bare Markdown route must use canonical skill-root path: ${item.source} -> ${item.route}`);

  const legacyHiddenGeometryPolicyHits = await findLegacyHiddenGeometryPolicy(skillRoot);
  for (const hit of legacyHiddenGeometryPolicyHits) errors.push(`legacy hidden-geometry suppression policy detected: ${hit.source} (${hit.id})`);

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    schema: graph.schema,
    nodeCount: nodes.length,
    referenceLeaves: leaves.length,
    cycle,
    missingCapabilityOwners,
    bareMarkdownRoutes,
    legacyHiddenGeometryPolicyHits,
    interfaceSchema: graph.interfaceSchema,
    interfaceNodes: nodes.filter((node) => node.interface).length,
    interfaceOperations,
    runtimeCapabilitiesCovered,
    errors,
  };
}

export async function verifySemanticInstructionGraph(options = {}) {
  const result = await analyzeSemanticInstructionGraph(options);
  if (result.status !== 'PASS') throw new Error(result.errors.join('\n'));
  return result;
}

async function main() {
  const result = await verifySemanticInstructionGraph();
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    schema: result.schema,
    nodeCount: result.nodeCount,
    referenceLeaves: result.referenceLeaves,
    missingCapabilityOwners: result.missingCapabilityOwners.length,
    bareMarkdownRoutes: result.bareMarkdownRoutes.length,
    legacyHiddenGeometryPolicyHits: result.legacyHiddenGeometryPolicyHits.length,
    interfaceSchema: result.interfaceSchema,
    interfaceNodes: result.interfaceNodes,
    interfaceOperations: result.interfaceOperations,
    runtimeCapabilitiesCovered: result.runtimeCapabilitiesCovered.length,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Semantic instruction graph verification failed: ${error.message}\n`);
    process.exit(1);
  });
}

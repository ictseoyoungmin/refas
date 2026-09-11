#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {CAPABILITY_ORDER, FINDING_OWNERS} from './lib/ownership.mjs';

const DEFAULT_SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_PATH = 'references/GRAPH.json';
const ALLOWED_CONTROL_OWNER = 'control';
const REQUIRED_REAL_SOURCE_NODES = Object.freeze([
  'candidate-transactions',
  'validation',
  'relational-structure',
  'inference-authority',
  'whole-system-relational-barrier',
]);
const REQUIRED_REAL_SOURCE_ARTIFACT = 'refas.certification-relational-evidence/v1';
const ALLOWED_BARE_MARKDOWN = new Set(['SKILL.md', 'INDEX.md']);

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

export async function analyzeSemanticInstructionGraph({skillRoot = DEFAULT_SKILL_ROOT} = {}) {
  skillRoot = path.resolve(skillRoot);
  const graph = JSON.parse(await fs.readFile(path.join(skillRoot, GRAPH_PATH), 'utf8'));
  const errors = [];

  if (graph.schema !== 'refas.instruction-graph/v1') errors.push(`unexpected graph schema: ${graph.schema}`);
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

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    schema: graph.schema,
    nodeCount: nodes.length,
    referenceLeaves: leaves.length,
    cycle,
    bareMarkdownRoutes,
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
  process.stdout.write(`${JSON.stringify({status: result.status, schema: result.schema, nodeCount: result.nodeCount, referenceLeaves: result.referenceLeaves, bareMarkdownRoutes: result.bareMarkdownRoutes.length}, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Semantic instruction graph verification failed: ${error.message}\n`);
    process.exit(1);
  });
}

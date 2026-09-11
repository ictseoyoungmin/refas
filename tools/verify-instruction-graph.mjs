#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ENTRY = 'skills/refas/SKILL.md';
const INDEX_PATH = 'skills/refas/references/INDEX.md';
const REFERENCE_DIR = 'skills/refas/references';
const ROUTABLE_PREFIXES = ['references/', 'docs/', 'schemas/', 'assets/', 'scripts/'];

function portable(value) {
  return value.split(path.sep).join('/');
}

function stripRouteSuffix(value) {
  return value.replace(/[?#].*$/u, '').replace(/[.,;:]+$/u, '');
}

function isFileRoute(route) {
  return !route.endsWith('/') && path.posix.extname(route).length > 1;
}

export function resolveInstructionRoute(route) {
  const clean = stripRouteSuffix(route.trim());
  if (!clean || clean.includes('..')) throw new Error(`unsafe instruction route: ${route}`);
  if (clean.startsWith('references/') || clean.startsWith('assets/') || clean.startsWith('scripts/')) {
    return `skills/refas/${clean}`;
  }
  if (clean.startsWith('docs/') || clean.startsWith('schemas/')) return clean;
  throw new Error(`instruction route has no declared root convention: ${route}`);
}

export function extractInstructionRoutes(markdown) {
  const routes = new Set();
  const inline = /`((?:references|docs|schemas|assets|scripts)\/[^`\s]+)`/gu;
  const link = /\[[^\]]*\]\(((?:references|docs|schemas|assets|scripts)\/[^)\s]+)\)/gu;
  for (const expression of [inline, link]) {
    for (const match of markdown.matchAll(expression)) {
      const route = stripRouteSuffix(match[1]);
      if (ROUTABLE_PREFIXES.some((prefix) => route.startsWith(prefix)) && isFileRoute(route)) routes.add(route);
    }
  }
  return [...routes].sort();
}

function packageContains(packagePath, packageFiles) {
  return packageFiles.some((entry) => packagePath === entry || packagePath.startsWith(`${entry}/`));
}

async function fileExists(root, relative) {
  try {
    const stat = await fs.stat(path.join(root, relative));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function referenceLeaves(root) {
  const entries = await fs.readdir(path.join(root, REFERENCE_DIR), {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'INDEX.md')
    .map((entry) => `${REFERENCE_DIR}/${entry.name}`)
    .sort();
}

export async function analyzeInstructionGraph({root = DEFAULT_ROOT} = {}) {
  const leaves = await referenceLeaves(root);
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const packageFiles = (packageJson.files ?? []).map((entry) => portable(String(entry).replace(/\/$/u, '')));

  const sources = [SKILL_ENTRY, INDEX_PATH, ...leaves];
  const contents = new Map();
  for (const source of sources) contents.set(source, await fs.readFile(path.join(root, source), 'utf8'));

  const routeRecords = [];
  const graph = new Map();
  for (const source of sources) {
    const targets = [];
    for (const route of extractInstructionRoutes(contents.get(source))) {
      let target;
      try {
        target = resolveInstructionRoute(route);
      } catch (error) {
        routeRecords.push({source, route, target: null, exists: false, packaged: false, error: error.message});
        continue;
      }
      const exists = await fileExists(root, target);
      const packaged = packageContains(target, packageFiles);
      routeRecords.push({source, route, target, exists, packaged, error: null});
      if (target.endsWith('.md')) targets.push(target);
    }
    graph.set(source, [...new Set(targets)].sort());
  }

  const indexRouteSet = new Set(
    extractInstructionRoutes(contents.get(INDEX_PATH))
      .filter((route) => route.startsWith('references/') && route.endsWith('.md') && route !== 'references/INDEX.md')
      .map(resolveInstructionRoute),
  );
  const leafSet = new Set(leaves);
  const indexMissing = leaves.filter((leaf) => !indexRouteSet.has(leaf));
  const indexUnknown = [...indexRouteSet].filter((target) => !leafSet.has(target)).sort();

  const visited = new Set();
  const queue = [SKILL_ENTRY];
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    for (const target of graph.get(node) ?? []) {
      if ((target === INDEX_PATH || leafSet.has(target)) && !visited.has(target)) queue.push(target);
    }
  }

  const orphanReferences = leaves.filter((leaf) => !visited.has(leaf));
  const danglingRoutes = routeRecords.filter((record) => !record.exists);
  const packageDanglingRoutes = routeRecords.filter((record) => record.exists && !record.packaged);
  const skillRoutesToIndex = (graph.get(SKILL_ENTRY) ?? []).includes(INDEX_PATH);

  return {
    status: skillRoutesToIndex && indexMissing.length === 0 && indexUnknown.length === 0 && orphanReferences.length === 0 && danglingRoutes.length === 0 && packageDanglingRoutes.length === 0 ? 'PASS' : 'FAIL',
    referenceLeaves: leaves.length,
    reachableLeaves: leaves.length - orphanReferences.length,
    skillRoutesToIndex,
    indexMissing,
    indexUnknown,
    orphanReferences,
    danglingRoutes,
    packageDanglingRoutes,
    routedPackagePaths: [...new Set(routeRecords.filter((record) => record.target).map((record) => record.target))].sort(),
  };
}

export async function verifyInstructionGraph(options = {}) {
  const result = await analyzeInstructionGraph(options);
  if (result.status !== 'PASS') {
    const problems = [];
    if (!result.skillRoutesToIndex) problems.push(`${SKILL_ENTRY} must route to references/INDEX.md`);
    if (result.indexMissing.length) problems.push(`INDEX omits reference leaves: ${result.indexMissing.join(', ')}`);
    if (result.indexUnknown.length) problems.push(`INDEX routes unknown reference leaves: ${result.indexUnknown.join(', ')}`);
    if (result.orphanReferences.length) problems.push(`orphan reference leaves: ${result.orphanReferences.join(', ')}`);
    if (result.danglingRoutes.length) problems.push(`dangling instruction routes: ${result.danglingRoutes.map((item) => `${item.source} -> ${item.route}`).join(', ')}`);
    if (result.packageDanglingRoutes.length) problems.push(`routes omitted from npm package boundary: ${result.packageDanglingRoutes.map((item) => `${item.source} -> ${item.target}`).join(', ')}`);
    throw new Error(problems.join('\n'));
  }
  return result;
}

async function main() {
  const result = await verifyInstructionGraph();
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    referenceLeaves: result.referenceLeaves,
    reachableLeaves: result.reachableLeaves,
    orphanReferences: result.orphanReferences.length,
    danglingRoutes: result.danglingRoutes.length,
    packageDanglingRoutes: result.packageDanglingRoutes.length,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Instruction graph verification failed: ${error.message}\n`);
    process.exit(1);
  });
}

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ENTRY = 'SKILL.md';
const INDEX_PATH = 'references/INDEX.md';
const SELF_PATH = 'scripts/verify_installation_boundary.mjs';
const ALLOWED_ROUTE_PREFIXES = ['references/', 'assets/', 'scripts/'];
const FORBIDDEN_REPO_PREFIXES = ['docs/', 'schemas/', 'tests/', 'examples/', 'tools/', '.github/', 'skills/refas/'];

const portable = (value) => value.split(path.sep).join('/');
const stripRouteSuffix = (value) => value.replace(/[?#].*$/u, '').replace(/[.,;:]+$/u, '');
const insideRoot = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

async function existsFile(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

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

function isFileRoute(route) {
  return !route.endsWith('/') && path.posix.extname(route).length > 1;
}

export function resolveSkillRoute(route, {skillRoot = DEFAULT_SKILL_ROOT} = {}) {
  const clean = stripRouteSuffix(String(route).trim());
  if (!clean || clean.includes('..') || path.posix.isAbsolute(clean) || /^[A-Za-z]:[\\/]/u.test(clean)) {
    throw new Error(`unsafe skill route: ${route}`);
  }
  if (FORBIDDEN_REPO_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
    throw new Error(`repository-local route is forbidden from installed skill: ${route}`);
  }
  if (!ALLOWED_ROUTE_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
    throw new Error(`skill route has no declared installed-root convention: ${route}`);
  }
  const absolute = path.resolve(skillRoot, clean);
  if (!insideRoot(skillRoot, absolute)) throw new Error(`skill route escapes installation root: ${route}`);
  return portable(path.relative(skillRoot, absolute));
}

export function extractInstructionRoutes(markdown) {
  const routes = new Set();
  const prefixes = [...ALLOWED_ROUTE_PREFIXES, ...FORBIDDEN_REPO_PREFIXES].map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
  const inline = new RegExp('`((?:' + prefixes + ')[^`\\s]+)`', 'gu');
  const link = new RegExp('\\[[^\\]]*\\]\\(((?:' + prefixes + ')[^)\\s]+)\\)', 'gu');
  for (const expression of [inline, link]) {
    for (const match of markdown.matchAll(expression)) {
      const route = stripRouteSuffix(match[1]);
      if (isFileRoute(route)) routes.add(route);
    }
  }
  return [...routes].sort();
}

function extractJsImports(source) {
  const imports = new Set();
  const expressions = [
    /(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /import\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];
  for (const expression of expressions) for (const match of source.matchAll(expression)) imports.add(match[1]);
  return [...imports].sort();
}

function obviousRepositoryPathLiterals(source) {
  const findings = new Set();
  const literal = /['"]([^'"\n]+)['"]/gu;
  for (const match of source.matchAll(literal)) {
    const value = match[1];
    if (value.includes('../') || FORBIDDEN_REPO_PREFIXES.some((prefix) => value.startsWith(prefix))) findings.add(value);
  }
  return [...findings].sort();
}

async function referenceLeaves(skillRoot) {
  const files = await walk(path.join(skillRoot, 'references'));
  return files.filter((file) => file.endsWith('.md') && file !== 'INDEX.md').map((file) => `references/${file}`).sort();
}

async function analyzeCodeDependencies(skillRoot) {
  const files = (await walk(skillRoot)).filter((file) => /\.(?:mjs|js|cjs|py)$/u.test(file));
  const escapes = [];
  for (const relative of files) {
    const source = await fs.readFile(path.join(skillRoot, relative), 'utf8');
    if (/\.(?:mjs|js|cjs)$/u.test(relative)) {
      for (const specifier of extractJsImports(source)) {
        if (specifier.startsWith('node:')) continue;
        if (specifier.startsWith('.')) {
          const target = path.resolve(skillRoot, path.dirname(relative), specifier);
          if (!insideRoot(skillRoot, target)) escapes.push({source: relative, dependency: specifier, reason: 'relative import escapes installed skill'});
          else if (!await existsFile(target)) escapes.push({source: relative, dependency: specifier, reason: 'relative import target missing'});
        } else escapes.push({source: relative, dependency: specifier, reason: 'bare JavaScript dependency is undeclared inside installed skill'});
      }
    }
    // The verifier contains forbidden-prefix literals as policy data; do not flag its own rule table.
    if (relative !== SELF_PATH) {
      for (const literal of obviousRepositoryPathLiterals(source)) {
        escapes.push({source: relative, dependency: literal, reason: 'repository-relative path literal is forbidden inside installed skill code'});
      }
    }
  }
  return escapes;
}

export async function analyzeInstallationBoundary({skillRoot = DEFAULT_SKILL_ROOT} = {}) {
  skillRoot = path.resolve(skillRoot);
  const leaves = await referenceLeaves(skillRoot);
  const sources = [SKILL_ENTRY, INDEX_PATH, ...leaves];
  const contents = new Map();
  const routeRecords = [];
  const graph = new Map();

  for (const source of sources) contents.set(source, await fs.readFile(path.join(skillRoot, source), 'utf8'));
  for (const source of sources) {
    const targets = [];
    for (const route of extractInstructionRoutes(contents.get(source))) {
      let target;
      try { target = resolveSkillRoute(route, {skillRoot}); }
      catch (error) {
        routeRecords.push({source, route, target: null, exists: false, error: error.message});
        continue;
      }
      const exists = await existsFile(path.join(skillRoot, target));
      routeRecords.push({source, route, target, exists, error: null});
      if (target.endsWith('.md')) targets.push(target);
    }
    graph.set(source, [...new Set(targets)].sort());
  }

  const indexRoutes = extractInstructionRoutes(contents.get(INDEX_PATH));
  const indexRouteSet = new Set();
  const indexUnknownRoutes = [];
  for (const route of indexRoutes) {
    if (!route.startsWith('references/') || !route.endsWith('.md') || route === 'references/INDEX.md') continue;
    try { indexRouteSet.add(resolveSkillRoute(route, {skillRoot})); }
    catch { indexUnknownRoutes.push(route); }
  }
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
  const danglingRoutes = routeRecords.filter((record) => record.target && !record.exists);
  const outsideSkillRoutes = routeRecords.filter((record) => record.error);
  const skillRoutesToIndex = (graph.get(SKILL_ENTRY) ?? []).includes(INDEX_PATH);
  const codeEscapes = await analyzeCodeDependencies(skillRoot);
  const requirementsPresent = await existsFile(path.join(skillRoot, 'requirements.txt'));

  const status = skillRoutesToIndex && indexMissing.length === 0 && indexUnknown.length === 0 && indexUnknownRoutes.length === 0 && orphanReferences.length === 0 && danglingRoutes.length === 0 && outsideSkillRoutes.length === 0 && codeEscapes.length === 0 && requirementsPresent ? 'PASS' : 'FAIL';
  return {status, skillRoot, referenceLeaves: leaves.length, reachableLeaves: leaves.length - orphanReferences.length, skillRoutesToIndex, indexMissing, indexUnknown, indexUnknownRoutes, orphanReferences, danglingRoutes, outsideSkillRoutes, codeEscapes, requirementsPresent, routedSkillPaths: [...new Set(routeRecords.filter((record) => record.target).map((record) => record.target))].sort()};
}

export async function verifyInstallationBoundary(options = {}) {
  const result = await analyzeInstallationBoundary(options);
  if (result.status !== 'PASS') {
    const problems = [];
    if (!result.skillRoutesToIndex) problems.push(`${SKILL_ENTRY} must route to ${INDEX_PATH}`);
    if (result.indexMissing.length) problems.push(`INDEX omits reference leaves: ${result.indexMissing.join(', ')}`);
    if (result.indexUnknown.length || result.indexUnknownRoutes.length) problems.push(`INDEX routes unknown/forbidden reference leaves: ${[...result.indexUnknown, ...result.indexUnknownRoutes].join(', ')}`);
    if (result.orphanReferences.length) problems.push(`orphan reference leaves: ${result.orphanReferences.join(', ')}`);
    if (result.danglingRoutes.length) problems.push(`dangling installed-skill routes: ${result.danglingRoutes.map((item) => `${item.source} -> ${item.route}`).join(', ')}`);
    if (result.outsideSkillRoutes.length) problems.push(`instruction routes outside installed skill: ${result.outsideSkillRoutes.map((item) => `${item.source} -> ${item.route}`).join(', ')}`);
    if (result.codeEscapes.length) problems.push(`runtime dependency escapes: ${result.codeEscapes.map((item) => `${item.source} -> ${item.dependency}`).join(', ')}`);
    if (!result.requirementsPresent) problems.push('skill-local requirements.txt is missing');
    throw new Error(problems.join('\n'));
  }
  return result;
}

async function main() {
  const result = await verifyInstallationBoundary();
  process.stdout.write(`${JSON.stringify({status: result.status, referenceLeaves: result.referenceLeaves, reachableLeaves: result.reachableLeaves, danglingRoutes: result.danglingRoutes.length, outsideSkillRoutes: result.outsideSkillRoutes.length, runtimeDependencyEscapes: result.codeEscapes.length, requirementsPresent: result.requirementsPresent}, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Skill installation boundary verification failed: ${error.message}\n`);
    process.exit(1);
  });
}

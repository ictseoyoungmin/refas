import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const installedRoot = path.resolve(process.env.REFAS_AD05_INSTALLED_ROOT || '.');
const restrictedRoot = path.join(installedRoot, 'scripts', 'lib');
const trustedScriptsRoot = path.join(installedRoot, 'scripts');
const publicIndex = path.join(restrictedRoot, 'index.mjs');
const untrustedEntry = process.env.REFAS_AD05_UNTRUSTED_ENTRY ? path.resolve(process.env.REFAS_AD05_UNTRUSTED_ENTRY) : null;
const auditPath = process.env.REFAS_AD05_ACCESS_AUDIT ? path.resolve(process.env.REFAS_AD05_ACCESS_AUDIT) : null;
const guardedFs = path.join(trustedScriptsRoot, 'fresh_worker_guarded_fs.mjs');
const guardedFsPromises = path.join(trustedScriptsRoot, 'fresh_worker_guarded_fs_promises.mjs');
const guardedChildProcess = path.join(trustedScriptsRoot, 'fresh_worker_guarded_child_process.mjs');

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function pathFromUrl(url) {
  if (!url || !String(url).startsWith('file:')) return null;
  try {
    return path.resolve(fileURLToPath(url));
  } catch {
    return null;
  }
}

function log(op, target, parent) {
  if (!auditPath) return;
  fs.appendFileSync(auditPath, JSON.stringify({
    kind: 'raw-implementation-import',
    op,
    target,
    parent,
    processEntry: process.argv[1] ? path.resolve(process.argv[1]) : null,
    pid: process.pid,
  }) + '\n');
}

function isUntrustedParent(parent) {
  if (!parent) return false;
  if (untrustedEntry && parent === untrustedEntry) return true;
  return !inside(trustedScriptsRoot, parent);
}

function proxyUrl(specifier) {
  if (specifier === 'node:fs' || specifier === 'fs') return pathToFileURL(guardedFs).href;
  if (specifier === 'node:fs/promises' || specifier === 'fs/promises') return pathToFileURL(guardedFsPromises).href;
  if (specifier === 'node:child_process' || specifier === 'child_process') return pathToFileURL(guardedChildProcess).href;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parent = pathFromUrl(context.parentURL);
  if (isUntrustedParent(parent) && ['node:module', 'module', 'node:worker_threads', 'worker_threads', 'node:cluster', 'cluster'].includes(specifier)) {
    log('builtin-escape', specifier, parent);
    const error = new Error('AD05 verifier access boundary blocked process/module escape hatch: ' + specifier);
    error.code = 'EACCES';
    throw error;
  }
  const proxy = isUntrustedParent(parent) ? proxyUrl(specifier) : null;
  if (proxy) return {url: proxy, shortCircuit: true};

  const resolved = await nextResolve(specifier, context);
  const target = pathFromUrl(resolved.url);
  if (!target || !inside(restrictedRoot, target) || target === publicIndex) return resolved;

  const trustedInternalParent = Boolean(parent && inside(restrictedRoot, parent));
  const trustedInstalledScriptParent = Boolean(parent && inside(trustedScriptsRoot, parent) && parent !== untrustedEntry);

  if (!trustedInternalParent && !trustedInstalledScriptParent) {
    log('esm-resolve', target, parent);
    const error = new Error('AD05 verifier access boundary blocked raw implementation import: ' + target);
    error.code = 'EACCES';
    throw error;
  }
  return resolved;
}

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const installedRoot = path.resolve(process.env.REFAS_AD05_INSTALLED_ROOT || '.');
const restrictedRoot = path.join(installedRoot, 'scripts', 'lib');
const trustedScriptsRoot = path.join(installedRoot, 'scripts');
const publicIndex = path.join(restrictedRoot, 'index.mjs');
const auditPath = process.env.REFAS_AD05_ACCESS_AUDIT ? path.resolve(process.env.REFAS_AD05_ACCESS_AUDIT) : null;

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

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const target = pathFromUrl(resolved.url);
  if (!target || !inside(restrictedRoot, target) || target === publicIndex) return resolved;

  const parent = pathFromUrl(context.parentURL);
  const trustedInternalParent = Boolean(parent && inside(restrictedRoot, parent));
  const trustedInstalledScriptParent = Boolean(parent && inside(trustedScriptsRoot, parent) && !parent.endsWith('fresh_worker_dogfood_worker.mjs'));

  if (!trustedInternalParent && !trustedInstalledScriptParent) {
    log('esm-resolve', target, parent);
    const error = new Error('AD05 verifier access boundary blocked raw implementation import: ' + target);
    error.code = 'EACCES';
    throw error;
  }
  return resolved;
}

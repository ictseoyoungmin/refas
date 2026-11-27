import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const installedRoot = path.resolve(process.env.REFAS_AD05_INSTALLED_ROOT || '.');
const restrictedRoot = path.join(installedRoot, 'scripts', 'lib');
const auditPath = process.env.REFAS_AD05_ACCESS_AUDIT ? path.resolve(process.env.REFAS_AD05_ACCESS_AUDIT) : null;
const allowedCli = process.env.REFAS_AD05_ALLOWED_CLI ? path.resolve(process.env.REFAS_AD05_ALLOWED_CLI) : null;

const realpathSync = fs.realpathSync.bind(fs);
const appendFileSync = fs.appendFileSync.bind(fs);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function toPath(value) {
  if (typeof value === 'number' || value == null) return null;
  try {
    if (value && typeof value === 'object' && value.href) value = fileURLToPath(value);
  } catch {}
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== 'string') return null;
  const absolute = path.resolve(value);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function recordAccessBoundary(kind, op, target) {
  if (!auditPath) return;
  appendFileSync(auditPath, JSON.stringify({
    kind,
    op,
    target: target == null ? null : String(target),
    processEntry: process.argv[1] ? path.resolve(process.argv[1]) : null,
    pid: process.pid,
  }) + '\n');
}

function blocked(kind, op, target) {
  recordAccessBoundary(kind, op, target);
  const error = new Error('AD05 verifier access boundary blocked ' + kind + ' via ' + op + ': ' + String(target));
  error.code = 'EACCES';
  throw error;
}

export function guardRawRead(op, target) {
  const resolved = toPath(target);
  if (resolved && inside(restrictedRoot, resolved)) blocked('raw-implementation-read', op, resolved);
}

export function guardInstalledWrite(op, target) {
  const resolved = toPath(target);
  if (resolved && inside(installedRoot, resolved)) blocked('installed-skill-write', op, resolved);
}

export function guardTwoPathWrite(op, source, target) {
  guardInstalledWrite(op, source);
  guardInstalledWrite(op, target);
}

export function guardChildProcess(op, command, args = []) {
  const commandPath = path.resolve(String(command));
  const publicCliCall = allowedCli
    && commandPath === path.resolve(process.execPath)
    && Array.isArray(args)
    && args.length > 0
    && path.resolve(String(args[0])) === allowedCli;
  if (!publicCliCall) blocked('child-process-bypass', op, String(command) + ' ' + JSON.stringify(args || []));
}

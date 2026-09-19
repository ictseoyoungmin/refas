#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const childProcess = require('node:child_process');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {syncBuiltinESMExports} = require('node:module');

const installedRoot = path.resolve(process.env.REFAS_AD05_INSTALLED_ROOT || '.');
const restrictedRoot = path.join(installedRoot, 'scripts', 'lib');
const auditPath = process.env.REFAS_AD05_ACCESS_AUDIT ? path.resolve(process.env.REFAS_AD05_ACCESS_AUDIT) : null;
const untrustedEntry = process.env.REFAS_AD05_UNTRUSTED_ENTRY ? path.resolve(process.env.REFAS_AD05_UNTRUSTED_ENTRY) : null;
const allowedCli = process.env.REFAS_AD05_ALLOWED_CLI ? path.resolve(process.env.REFAS_AD05_ALLOWED_CLI) : null;

const original = {
  appendFileSync: fs.appendFileSync.bind(fs),
  realpathSync: fs.realpathSync.bind(fs),
};

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
    return original.realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function log(kind, op, target) {
  if (!auditPath) return;
  const entry = {
    kind,
    op,
    target: target == null ? null : String(target),
    processEntry: process.argv[1] ? path.resolve(process.argv[1]) : null,
    pid: process.pid,
  };
  original.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
}

function blockedError(kind, op, target) {
  log(kind, op, target);
  const error = new Error('AD05 verifier access boundary blocked ' + kind + ' via ' + op + ': ' + String(target));
  error.code = 'EACCES';
  return error;
}

function isNodeModuleLoaderRead() {
  const stack = String(new Error().stack || '');
  return stack.includes('node:internal/modules/esm/')
    || stack.includes('node:internal/modules/cjs/loader');
}

function assertNoRawRead(op, target) {
  const resolved = toPath(target);
  if (resolved && inside(restrictedRoot, resolved) && !isNodeModuleLoaderRead()) {
    throw blockedError('raw-implementation-read', op, resolved);
  }
}

function assertNoInstalledWrite(op, target) {
  const resolved = toPath(target);
  if (resolved && inside(installedRoot, resolved)) throw blockedError('installed-skill-write', op, resolved);
}

function protect(object, key, wrapper) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || typeof descriptor.value !== 'function') return;
  const wrapped = wrapper(descriptor.value.bind(object));
  Object.defineProperty(object, key, {
    ...descriptor,
    value: wrapped,
    writable: false,
    configurable: false,
  });
}

for (const [object, key] of [
  [fs, 'readFileSync'], [fs, 'readFile'], [fs, 'createReadStream'],
  [fs, 'openSync'], [fs, 'open'], [fs, 'readdirSync'], [fs, 'readdir'],
  [fs, 'opendirSync'], [fs, 'opendir'],
  [fsp, 'readFile'], [fsp, 'open'], [fsp, 'readdir'], [fsp, 'opendir'],
]) {
  protect(object, key, (fn) => function guardedRead(target, ...args) {
    assertNoRawRead(key, target);
    return fn(target, ...args);
  });
}

for (const [object, key] of [
  [fs, 'writeFileSync'], [fs, 'writeFile'], [fs, 'appendFileSync'], [fs, 'appendFile'],
  [fs, 'truncateSync'], [fs, 'truncate'], [fs, 'unlinkSync'], [fs, 'unlink'],
  [fs, 'mkdirSync'], [fs, 'mkdir'], [fs, 'rmSync'], [fs, 'rm'],
  [fsp, 'writeFile'], [fsp, 'appendFile'], [fsp, 'truncate'], [fsp, 'unlink'],
  [fsp, 'mkdir'], [fsp, 'rm'],
]) {
  protect(object, key, (fn) => function guardedWrite(target, ...args) {
    assertNoInstalledWrite(key, target);
    return fn(target, ...args);
  });
}

for (const [object, key] of [
  [fs, 'renameSync'], [fs, 'rename'], [fs, 'copyFileSync'], [fs, 'copyFile'],
  [fs, 'linkSync'], [fs, 'link'], [fs, 'symlinkSync'], [fs, 'symlink'],
  [fsp, 'rename'], [fsp, 'copyFile'], [fsp, 'link'], [fsp, 'symlink'],
]) {
  protect(object, key, (fn) => function guardedTwoPath(source, target, ...args) {
    assertNoInstalledWrite(key, source);
    assertNoInstalledWrite(key, target);
    return fn(source, target, ...args);
  });
}

function isUntrustedEntry() {
  return Boolean(untrustedEntry && process.argv[1] && path.resolve(process.argv[1]) === untrustedEntry);
}

function allowPublicCli(command, args) {
  if (!allowedCli) return false;
  const commandPath = path.resolve(String(command));
  if (commandPath !== path.resolve(process.execPath)) return false;
  if (!Array.isArray(args) || args.length === 0) return false;
  return path.resolve(String(args[0])) === allowedCli;
}

for (const key of ['spawnSync', 'spawn', 'execFileSync', 'execFile']) {
  protect(childProcess, key, (fn) => function guardedSpawn(command, args, ...rest) {
    if (isUntrustedEntry() && !allowPublicCli(command, args)) {
      throw blockedError('child-process-bypass', key, String(command) + ' ' + JSON.stringify(args || []));
    }
    return fn(command, args, ...rest);
  });
}

for (const key of ['execSync', 'exec']) {
  protect(childProcess, key, (fn) => function guardedExec(command, ...args) {
    if (isUntrustedEntry()) throw blockedError('child-process-bypass', key, command);
    return fn(command, ...args);
  });
}

syncBuiltinESMExports();

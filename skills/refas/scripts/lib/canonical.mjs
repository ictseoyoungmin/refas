import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const REFAS_VERSION = '1.0.1';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('canonical JSON cannot contain NaN or Infinity');
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function digestJson(value) {
  return digestBytes(stableStringify(value));
}

export function assertDigest(value, label = 'digest') {
  if (!/^[a-f0-9]{64}$/u.test(String(value ?? ''))) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return String(value);
}

export function assertId(value, label = 'id') {
  const text = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9._:-]*$/u.test(text)) {
    throw new Error(`${label} must be a stable lowercase semantic ID`);
  }
  return text;
}

export async function sha256File(filePath) {
  return digestBytes(await fs.readFile(filePath));
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, filePath);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

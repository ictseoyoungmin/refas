#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Historical evidence stays in Git. This exact checkpoint is the only legacy
// boundary; changing a historical payload after it is subject to the same rules.
const GRANDFATHER_COMMIT = 'ea64de8adfa787537bee2b86a05ac0f4ec08dd5c';
export const ARTIFACT_LIMITS = Object.freeze({textBytes: 256 * 1024,
  sourceBytes: 512 * 1024, changedBytes: 1024 * 1024, changedFiles: 256});
const SOURCE = /\.(?:[cm]?[jt]sx?|py|gd|sh|bash|ps1|c|h|cc|cpp|hpp|rs|go|java|cs|glsl|vert|frag|wgsl)$/iu;
const PAYLOAD = /\.(?:blend\d*|glb|gltf|obj|fbx|stl|ply|usd[acz]?|abc|dae|3ds|png|jpe?g|webp|gif|avif|exr|hdr|tiff?|bmp|mp4|mov|webm|avi|mkv|wav|mp3|ogg|flac|zip|tar|tgz|gz|bz2|xz|zst|7z|rar|npy|npz|bin|parquet|arrow|h5|hdf5|pt|pth|safetensors|sqlite3?|db|jsonl|ndjson|csv|tsv|log)$/iu;
const OUTPUT_PATH = /(?:^|\/)(?:work|artifacts|outputs?|renders|logs|checkpoints)(?:\/|$)|(?:^|\/)(?:stdout|stderr)(?:\.|$)/iu;

function documentation(name) {
  return /^docs\/.+\.md$/iu.test(name) && !/(?:^|\/)evidence(?:\/|$)/iu.test(name) &&
    !OUTPUT_PATH.test(name);
}

function git(root, args, {allowFailure = false, binary = false} = {}) {
  const result = spawnSync('git', args, {cwd: root, encoding: binary ? undefined : 'utf8',
    maxBuffer: 2 * 1024 * 1024, timeout: 30000});
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim()}`);
  }
  return result;
}

function commit(root, ref) {
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).stdout.trim();
}

function isAncestor(root, before, after) {
  return git(root, ['merge-base', '--is-ancestor', before, after], {allowFailure: true}).status === 0;
}

function numericArraySize(value) {
  if (typeof value === 'number') return 1;
  if (!Array.isArray(value)) return null;
  let count = 0;
  for (const child of value) {
    const size = numericArraySize(child);
    if (size === null) return null;
    count += size;
  }
  return count;
}

function hasRawRows(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    if (numericArraySize(value) >= 128) return true;
    if (value.length >= 64 && value.some(item => item && typeof item === 'object')) return true;
  }
  return Object.values(value).some(hasRawRows);
}

function readEntry(root, name, revision) {
  if (revision === null) {
    const absolute = path.join(root, name);
    const stat = fs.lstatSync(absolute);
    return {size: stat.size, regular: stat.isFile(), read: () => fs.readFileSync(absolute)};
  }
  const indexed = revision === ':';
  const entry = indexed
    ? git(root, ['ls-files', '--stage', '-z', '--', name]).stdout
    : git(root, ['ls-tree', '-z', revision, '--', name]).stdout;
  const mode = entry.split(' ')[0];
  const spec = indexed ? `:${name}` : `${revision}:${name}`;
  const regular = mode === '100644' || mode === '100755';
  const size = regular ? Number(git(root, ['cat-file', '-s', spec]).stdout) : 0;
  return {size, regular, read: () => git(root, ['cat-file', 'blob', spec], {binary: true}).stdout};
}

/** Inspect proposed bytes only. The second argument is a test seam, never a CLI option. */
export function checkArtifactBudget({root = process.cwd(), base = null, head = null, staged = false} = {},
  {grandfatherCommit = GRANDFATHER_COMMIT} = {}) {
  if (staged && (base || head)) throw new Error('--staged cannot be combined with --base/--head');
  if (head && !base) throw new Error('--head requires --base');
  root = git(root, ['rev-parse', '--show-toplevel']).stdout.trim();
  const target = commit(root, head || 'HEAD');
  const requestedBase = commit(root, base || 'HEAD');
  let effectiveBase = requestedBase;
  let grandfatherApplied = false;
  if (base) {
    effectiveBase = git(root, ['merge-base', requestedBase, target]).stdout.trim();
    // Without a complete ancestry proof, use the stricter original diff. A
    // missing/shallow anchor never creates an exemption or skips changed files.
    if (isAncestor(root, effectiveBase, grandfatherCommit) && isAncestor(root, grandfatherCommit, target)) {
      grandfatherApplied = effectiveBase !== grandfatherCommit;
      effectiveBase = grandfatherCommit;
    }
  }
  const diffNames = filter => {
    const args = ['diff', '--name-only', '--no-renames', `--diff-filter=${filter}`, '-z'];
    if (staged) args.push('--cached');
    args.push(effectiveBase);
    if (base) args.push(target);
    args.push('--');
    return git(root, args).stdout.split('\0').filter(Boolean);
  };
  const untracked = !base && !staged
    ? git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean) : [];
  const names = [...diffNames('ACMRTUXB'), ...untracked];
  const changed = [...new Set(names)].sort();
  const result = {ok: true, mode: base ? 'committed' : staged ? 'staged' : 'working',
    requestedBase, effectiveBase, head: target, grandfatherApplied,
    changedFiles: changed.length, changedBytes: 0, relocatedFiles: 0, relocatedBytes: 0,
    limits: ARTIFACT_LIMITS, errors: []};
  if (changed.length > ARTIFACT_LIMITS.changedFiles) {
    result.errors.push(`Changed file count ${changed.length} exceeds ${ARTIFACT_LIMITS.changedFiles}; keep generated evidence outside the source PR.`);
  } else {
    const added = new Set([...diffNames('A'), ...untracked]);
    const removedDocuments = new Map();
    if ([...added].some(documentation)) {
      for (const name of diffNames('D').filter(documentation)) {
        if (untracked.includes(name)) continue;
        const entry = readEntry(root, name, effectiveBase);
        if (!entry.regular || entry.size > ARTIFACT_LIMITS.textBytes) continue;
        const hash = createHash('sha256').update(entry.read()).digest('hex');
        removedDocuments.set(hash, (removedDocuments.get(hash) || 0) + 1);
      }
    }
    for (const name of changed) {
      // Reject known payload paths before asking Git for blob size/content: in
      // the sparse CI clone that lookup could otherwise fetch a large model.
      if (PAYLOAD.test(name) || OUTPUT_PATH.test(name)) {
        result.errors.push(`${name}: generated model/media/archive/array/log payload; retain an external artifact and a compact summary`);
        continue;
      }
      const entry = readEntry(root, name, base ? target : staged ? ':' : null);
      result.changedBytes += entry.size;
      if (!entry.regular) {
        result.errors.push(`${name}: only regular source files are accepted`);
        continue;
      }
      const limit = SOURCE.test(name) ? ARTIFACT_LIMITS.sourceBytes : ARTIFACT_LIMITS.textBytes;
      if (entry.size > limit) {
        result.errors.push(`${name}: ${entry.size} bytes exceeds the ${limit}-byte file budget`);
        continue;
      }
      let text, bytes;
      try {
        bytes = entry.read();
        if (bytes.includes(0)) throw new Error('NUL byte');
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      } catch {
        result.errors.push(`${name}: binary payload is not source text`);
        continue;
      }
      // A one-for-one move of identical documentation adds no new payload.
      // Still count/check the file, and never exempt evidence, edited text,
      // copies, binary data or non-documentation paths.
      if (added.has(name) && documentation(name)) {
        const hash = createHash('sha256').update(bytes).digest('hex');
        const remaining = removedDocuments.get(hash) || 0;
        if (remaining) {
          removedDocuments.set(hash, remaining - 1);
          result.relocatedFiles += 1;
          result.relocatedBytes += entry.size;
          result.changedBytes -= entry.size;
        }
      }
      if (/\.json$/iu.test(name)) {
        let value;
        try { value = JSON.parse(text); } catch { continue; }
        if (hasRawRows(value)) result.errors.push(`${name}: raw numeric/per-sample arrays; retain aggregates and generate test fixtures in temporary directories`);
      }
    }
    if (result.changedBytes > ARTIFACT_LIMITS.changedBytes) {
      result.errors.push(`Changed payload ${result.changedBytes} bytes exceeds ${ARTIFACT_LIMITS.changedBytes}; split source work and store generated evidence separately.`);
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
      const option = args[index];
      if (option === '--help') {
        console.log('Usage: node tools/check-artifact-budget.mjs [--staged | --base REF [--head REF]]\nDefault: inspect HEAD plus working-tree and nonignored untracked changes.\nCommitted mode uses the merge base, advancing only a verified pre-policy range to the fixed legacy checkpoint.');
        process.exit(0);
      }
      if (option === '--staged') options.staged = true;
      else if ((option === '--base' || option === '--head') && args[index + 1] && !args[index + 1].startsWith('--')) {
        options[option.slice(2)] = args[++index];
      } else throw new Error(`Unknown or incomplete option: ${option}`);
    }
    const result = checkArtifactBudget(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ok: false, error: error.message}));
    process.exitCode = 1;
  }
}

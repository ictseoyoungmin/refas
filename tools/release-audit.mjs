#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false',
      NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_CACHE: path.join(os.tmpdir(), 'refas-npm-cache'),
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

async function main() {
  run(process.execPath, ['tools/check-repository.mjs']);
  run(process.execPath, ['--test', 'tests/assembly-and-routing.test.mjs', 'tests/checkpoints.test.mjs', 'tests/cli.test.mjs', 'tests/contracts.test.mjs', 'tests/geometry.test.mjs', 'tests/governance.test.mjs', 'tests/orientation-frame.test.mjs', 'tests/orientation-fitting.test.mjs', 'tests/orientation-hardening.test.mjs']);
  const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
  const sources = ['examples/parameter-fit/create_comparison.py', 'skills/refas/scripts/compare_registered.py', 'skills/refas/scripts/evidence.py', 'skills/refas/scripts/render_glb.py', 'skills/refas/scripts/render_pbr.py', 'skills/refas/scripts/source_manifest.py'];
  const compileProgram = 'import pathlib,sys; [compile(pathlib.Path(p).read_text(encoding="utf-8"), p, "exec") for p in sys.argv[1:]]';
  run(python, ['-c', compileProgram, ...sources]);

  const output = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']);
  const pack = JSON.parse(output)[0];
  if (!pack?.files?.length) throw new Error('npm dry-run did not report a package file list');
  const names = pack.files.map((item) => item.path);
  const forbidden = names.filter((name) => /(?:^|\/)(?:__pycache__|\.refas|tests|examples|legacy)(?:\/|$)|\.pyc$|\.zip$/u.test(name));
  if (forbidden.length) throw new Error(`release package contains forbidden files: ${forbidden.join(', ')}`);
  for (const required of [
    'package.json', 'requirements.txt', 'skills/refas/SKILL.md', 'skills/refas/scripts/refas.mjs', 'skills/refas/scripts/compare_registered.py',
    'skills/refas/scripts/lib/index.mjs', 'skills/refas/scripts/lib/parameter-fit.mjs', 'skills/refas/scripts/lib/shape-repair.mjs',
    'skills/refas/scripts/lib/orientation-evidence.mjs', 'skills/refas/scripts/lib/orientation-frame.mjs', 'skills/refas/scripts/lib/orientation-discrepancy.mjs', 'skills/refas/scripts/lib/orientation-pose-fit.mjs',
    'skills/refas/references/parameter-fitting.md',
    'schemas/checkpoint.schema.json', 'schemas/construction-quality.schema.json', 'schemas/parameter-fit-plan.schema.json', 'schemas/parameter-fit-report.schema.json',
    'schemas/orientation-evidence.schema.json', 'schemas/orientation-discrepancy.schema.json', 'schemas/orientation-pose-fit.schema.json',
    'schemas/realized-assembly-proof.schema.json', 'schemas/registered-comparison.schema.json', 'schemas/visual-review.schema.json', 'schemas/whole-object-certificate.schema.json'
  ]) {
    if (!names.includes(required)) throw new Error(`release package omits ${required}`);
  }
  const skillBytes = names.filter((name) => name.startsWith('skills/refas/')).reduce((total, name) => total + Number(pack.files.find((item) => item.path === name)?.size ?? 0), 0);
  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  process.stdout.write(`${JSON.stringify({status: 'PASS', version: packageJson.version, packagedFiles: names.length, unpackedBytes: pack.unpackedSize, skillBytes}, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Release audit failed: ${error.message}\n`);
  process.exit(1);
});

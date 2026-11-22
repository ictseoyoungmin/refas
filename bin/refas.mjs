#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const python = process.env.REFAS_PYTHON || process.env.CODEX_PRIMARY_RUNTIME_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const cli = fileURLToPath(new URL('../skills/refas/scripts/produce.py', import.meta.url));
const result = spawnSync(python, ['-B', cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'},
});
if (result.error) {
  process.stderr.write(`RefAs could not start Python (${python}): ${result.error.message}\n`);
  process.exitCode = result.error.code === 'ENOENT' ? 127 : 1;
} else if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}

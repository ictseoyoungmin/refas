#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packProduction, verifyProductionDistribution} from './verify-production-distribution.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  // The ordinary repository and legacy regression gates run separately in CI.
  // This audit describes what the production distribution will actually ship.
  const result = await verifyProductionDistribution({root: ROOT, pack: packProduction({root: ROOT})});
  const changelog = await fs.readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.includes(`## ${result.version} —`), `CHANGELOG.md omits current version ${result.version}`);
  const readme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(`**Development version: ${result.version}.**`), `README.md omits development package version ${result.version}`);
  assert.match(readme, /not a published stable 2\.0 release/u, 'README.md must identify the development status');
  assert.ok(!readme.includes(`releases/tag/v${result.version}`), 'an unpublished development version cannot be presented as a published release');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {process.stderr.write(`Release audit failed: ${error.message}\n`); process.exitCode = 1;});

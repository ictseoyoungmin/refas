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
  assert.ok(readme.includes(`**Package version: ${result.version}.**`), `README.md omits package version ${result.version}`);
  assert.match(readme, /Publication is a separate verified action/u, 'README.md must separate source identity from actual publication');
  assert.ok(readme.includes(`refas-${result.version}.tgz.sha256`), 'README.md must identify the matching archive checksum');
  assert.match(readme, /not an assertion.*npm registry/su, 'GitHub package publication must not imply npm registry publication');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {process.stderr.write(`Release audit failed: ${error.message}\n`); process.exitCode = 1;});

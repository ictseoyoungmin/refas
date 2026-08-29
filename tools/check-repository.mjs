#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {readLabelCatalog, validateLabelCatalog} from '../.github/scripts/sync-labels.mjs';
import {CAPABILITY_ORDER, FINDING_OWNERS} from '../skills/refas/scripts/lib/ownership.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_ROOTS = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github', 'docs', 'schemas', 'skills/refas'];
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.py', '.yaml', '.yml', '.svg']);
const FORBIDDEN = [
  {label: 'workflow methodology name', pattern: new RegExp(['bottle', 'neck'].join(''), 'iu')},
  {label: 'legacy package identity', pattern: new RegExp(['for' + 'ge', 'me' + 'ch'].join('[._-]'), 'iu')},
  {label: 'legacy schema namespace', pattern: new RegExp(`["']${'for' + 'ge'}\\.`, 'u')},
  {label: 'iteration-coded identifier', pattern: /\b(?:A|B|C|G|O)\d{2}(?:R\d+)?\b/u},
];

async function walk(relative) {
  const absolute = path.join(ROOT, relative);
  const stat = await fs.stat(absolute);
  if (stat.isFile()) return [relative];
  const output = [];
  for (const entry of await fs.readdir(absolute, {withFileTypes: true})) {
    const child = path.join(relative, entry.name);
    const portable = child.split(path.sep).join('/').replace(/^\.\//u, '');
    if (entry.isDirectory() && (entry.name === '.git' || entry.name === 'node_modules' || /^examples\/[^/]+\/output$/u.test(portable))) continue;
    if (entry.isDirectory()) output.push(...await walk(child));
    else if (entry.isFile()) output.push(child);
  }
  return output;
}

function getSchemaConst(schema) {
  return schema?.properties?.schema?.const ?? null;
}

async function main() {
  const required = [
    'AGENTS.md', 'LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'requirements.txt',
    '.github/labels.json', '.github/pull_request_template.md', '.github/scripts/sync-labels.mjs',
    '.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/visual-finding.yml',
    '.github/ISSUE_TEMPLATE/defect.yml', '.github/ISSUE_TEMPLATE/capability-change.yml',
    '.github/ISSUE_TEMPLATE/release-readiness.yml', '.github/ISSUE_TEMPLATE/documentation-governance.yml',
    '.github/workflows/ci.yml', '.github/workflows/sync-labels.yml', 'docs/github-governance.md',
    'skills/refas/SKILL.md', 'skills/refas/references/parameter-fitting.md', 'skills/refas/scripts/refas.mjs', 'skills/refas/scripts/render_pbr.py', 'skills/refas/scripts/lib/index.mjs', 'skills/refas/scripts/lib/parameter-fit.mjs',
    'schemas/source-manifest.schema.json', 'schemas/checkpoint.schema.json', 'schemas/visual-review.schema.json', 'schemas/whole-object-certificate.schema.json',
    'tests/contracts.test.mjs', 'tests/cli.test.mjs', 'tests/parameter-fit.test.mjs', 'tests/governance.test.mjs', 'examples/wing-cover/run.mjs', 'examples/material-fixture/run.mjs', 'examples/hard-surface/run.mjs', 'examples/modular-assembly/run.mjs', 'examples/parameter-fit/run.mjs',
  ];
  const missing = [];
  for (const file of required) {
    try { await fs.access(path.join(ROOT, file)); } catch { missing.push(file); }
  }
  if (missing.length) throw new Error(`required files missing: ${missing.join(', ')}`);

  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '1.0.0', 'package version must be 1.0.0');
  const canonical = await fs.readFile(path.join(ROOT, 'skills/refas/scripts/lib/canonical.mjs'), 'utf8');
  assert.match(canonical, /REFAS_VERSION = '1\.0\.0'/u, 'runtime version must match package version');
  const cli = await fs.readFile(path.join(ROOT, 'skills/refas/scripts/refas.mjs'), 'utf8');
  assert.match(cli, /version: '1\.0\.0'/u, 'CLI version must match package version');

  const productFiles = (await Promise.all(PRODUCT_ROOTS.map(walk))).flat();
  const violations = [];
  for (const relative of productFiles) {
    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const contents = await fs.readFile(path.join(ROOT, relative), 'utf8');
    for (const rule of FORBIDDEN) if (rule.pattern.test(contents) || rule.pattern.test(relative)) violations.push(`${relative}: ${rule.label}`);
  }
  if (violations.length) throw new Error(`product boundary contains forbidden development identity:\n${violations.join('\n')}`);

  const schemaFiles = (await walk('schemas')).filter((file) => file.endsWith('.json'));
  const schemaIds = new Set();
  const schemaContracts = new Set();
  for (const relative of schemaFiles) {
    const schema = JSON.parse(await fs.readFile(path.join(ROOT, relative), 'utf8'));
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${relative}: Draft 2020-12 marker missing`);
    if (!schema.$id || schemaIds.has(schema.$id)) throw new Error(`${relative}: schema ID missing or duplicated`);
    schemaIds.add(schema.$id);
    const contract = getSchemaConst(schema);
    if (contract) schemaContracts.add(contract);
  }
  for (const contract of [
    'refas.source-manifest/v1', 'refas.visual-hierarchy/v1', 'refas.visual-observation/v1',
    'refas.spatial-hypothesis-set/v1', 'refas.reference-registration/v1', 'refas.surface-network/v1',
    'refas.assembly-contract/v1', 'refas.finding/v1', 'refas.checkpoint/v1', 'refas.project-state/v1',
    'refas.canonical-object-frame/v1', 'refas.pbr-render-report/v1', 'refas.visual-review/v1', 'refas.whole-object-certificate/v1',
    'refas.registered-comparison/v1',
    'refas.hard-surface-spec/v1',
    'refas.realized-assembly-proof/v1',
    'refas.construction-quality/v1',
    'refas.parameter-fit-plan/v1',
    'refas.parameter-fit-report/v1',
  ]) if (!schemaContracts.has(contract)) throw new Error(`public schema missing for ${contract}`);

  const templateFiles = (await walk('skills/refas/assets/templates')).filter((file) => file.endsWith('.json'));
  for (const relative of templateFiles) JSON.parse(await fs.readFile(path.join(ROOT, relative), 'utf8'));

  const labelCatalog = await readLabelCatalog();
  const governanceSummary = validateLabelCatalog(labelCatalog);
  const managedLabels = new Set(labelCatalog.map((label) => label.name));
  const issueForms = [
    '.github/ISSUE_TEMPLATE/visual-finding.yml',
    '.github/ISSUE_TEMPLATE/defect.yml',
    '.github/ISSUE_TEMPLATE/capability-change.yml',
    '.github/ISSUE_TEMPLATE/release-readiness.yml',
    '.github/ISSUE_TEMPLATE/documentation-governance.yml',
  ];
  for (const relative of issueForms) {
    const contents = await fs.readFile(path.join(ROOT, relative), 'utf8');
    const match = contents.match(/^labels:\s*(\[[^\n]+\])$/mu);
    assert.ok(match, `${relative}: inline default labels missing`);
    for (const label of JSON.parse(match[1])) assert.ok(managedLabels.has(label), `${relative}: unmanaged default label ${label}`);
    assert.match(contents, /^body:\s*$/mu, `${relative}: issue form body missing`);
    assert.match(contents, /workflow: needs-evidence/u, `${relative}: intake must begin with needs-evidence`);
  }
  const visualFindingForm = await fs.readFile(path.join(ROOT, '.github/ISSUE_TEMPLATE/visual-finding.yml'), 'utf8');
  for (const capability of CAPABILITY_ORDER) assert.ok(visualFindingForm.includes(`        - ${capability}\n`), `visual finding form missing capability ${capability}`);
  for (const finding of Object.keys(FINDING_OWNERS)) assert.ok(visualFindingForm.includes(`        - ${finding}\n`), `visual finding form missing category ${finding}`);

  const pullRequestTemplate = await fs.readFile(path.join(ROOT, '.github/pull_request_template.md'), 'utf8');
  assert.equal((pullRequestTemplate.match(/Closes #/gu) ?? []).length, 1, 'PR template must close exactly one primary Issue');
  for (const marker of ['Owner capability', 'Semantic scope ID', 'Recovery and Invalidation', 'Reopen Conditions']) {
    assert.ok(pullRequestTemplate.includes(marker), `PR template missing ${marker}`);
  }
  const labelWorkflow = await fs.readFile(path.join(ROOT, '.github/workflows/sync-labels.yml'), 'utf8');
  assert.match(labelWorkflow, /^\s*issues:\s*write\s*$/mu, 'label sync must declare issues write permission');
  assert.doesNotMatch(labelWorkflow, /^\s*pull_request:\s*$/mu, 'label sync must not run with write permission on pull requests');

  const allFiles = await walk('.');
  const transient = allFiles.filter((file) => /(?:^|\/)(?:__pycache__|node_modules|\.refas|dist|release)(?:\/|$)|\.pyc$|\.zip$/u.test(file) && !file.startsWith('.git/'));
  if (transient.length) throw new Error(`transient files present: ${transient.join(', ')}`);
  const duplicateRuntime = allFiles.filter((file) => /(?:^|\/)src\/.*\.(?:mjs|js|ts)$/u.test(file));
  if (duplicateRuntime.length) throw new Error(`runtime exists outside the distributable skill: ${duplicateRuntime.join(', ')}`);

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    version: packageJson.version,
    productFiles: productFiles.length,
    publicSchemas: schemaContracts.size,
    templates: templateFiles.length,
    managedLabels: governanceSummary.labels,
    issueForms: issueForms.length,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Repository check failed: ${error.message}\n`);
  process.exit(1);
});

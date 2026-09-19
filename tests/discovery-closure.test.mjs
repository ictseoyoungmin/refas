import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {analyzeDiscoveryClosure} from '../skills/refas/scripts/verify_discovery_closure.mjs';

const SKILL_ROOT = path.resolve('skills/refas');
const SCHEMA_ROOT = path.resolve('schemas');

async function copySkill(t, name) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-ad06-' + name + '-'));
  t.after(() => fs.rm(temp, {recursive: true, force: true}));
  const skillRoot = path.join(temp, 'refas');
  await fs.cp(SKILL_ROOT, skillRoot, {recursive: true});
  return {temp, skillRoot};
}

async function mutateGraph(skillRoot, mutate) {
  const file = path.join(skillRoot, 'references', 'GRAPH.json');
  const graph = JSON.parse(await fs.readFile(file, 'utf8'));
  mutate(graph);
  await fs.writeFile(file, JSON.stringify(graph, null, 2) + '\n');
}

test('AD06 public discovery surface is statically closed', {timeout: 120000}, async () => {
  const report = await analyzeDiscoveryClosure({skillRoot: SKILL_ROOT, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'PASS', JSON.stringify(report, null, 2));
  assert.equal(report.instructionNodes, 40);
  assert.equal(report.runtimeCapabilities, 11);
  assert.equal(report.describedNodes, 40);
  assert.equal(report.describedCapabilities, 11);
  assert.equal(report.publicReferenceLeaves, report.reachableReferenceLeaves);
  assert.equal(report.publicTemplates, report.reachableTemplates);
  assert.ok(report.outputSchemaContracts > 0);
  assert.ok(report.workerFacingSchemaIds >= report.outputSchemaContracts);
  assert.equal(report.resolvedWorkerFacingSchemaIds, report.workerFacingSchemaIds);
  assert.equal(Object.keys(report.schemaAuthorities).length, report.workerFacingSchemaIds);
  assert.equal(report.concreteSchemaFilesAvailable, true);
  assert.equal(report.missing.length, 0);
  assert.equal(report.orphan.length, 0);
  assert.equal(report.privateDependencies.length, 0);
  assert.equal(report.unreachable.length, 0);
});

test('AD06 closure verifier passes from copied installed skill without repository schemas', {timeout: 120000}, async (t) => {
  const {skillRoot} = await copySkill(t, 'installed');
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: null, runFreshWorker: false});
  assert.equal(report.status, 'PASS', JSON.stringify(report, null, 2));
  assert.equal(report.installedSkillOnly, true);
  assert.equal(report.describedNodes, 40);
  assert.equal(report.describedCapabilities, 11);
  assert.equal(report.resolvedWorkerFacingSchemaIds, report.workerFacingSchemaIds);
  assert.equal(report.missing.length, 0);
  assert.equal(report.orphan.length, 0);
  assert.equal(report.privateDependencies.length, 0);
  assert.equal(report.unreachable.length, 0);
});

test('AD06 copied installed-skill authority detects a missing copied public export', async (t) => {
  const {skillRoot} = await copySkill(t, 'missing-copied-export');
  const file = path.join(skillRoot, 'scripts', 'lib', 'index.mjs');
  const text = await fs.readFile(file, 'utf8');
  const mutated = text.replace("export * from './visual-review.mjs';\n", '');
  assert.notEqual(mutated, text, 'expected visual-review public export anchor');
  await fs.writeFile(file, mutated);
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: null, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(
    report.missing.some((item) => item.includes('createVisualReview') || item.includes('visual-review')),
    JSON.stringify(report, null, 2),
  );
});

test('AD06 catches an unknown standalone template-only schema identity', async (t) => {
  const {skillRoot} = await copySkill(t, 'unknown-template-schema');
  const file = path.join(skillRoot, 'assets', 'templates', 'handoff-capsule.json');
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  json.schema = 'refas.missing-template-schema/v1';
  await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n');
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.missing.includes('schema-unresolved:refas.missing-template-schema/v1'), JSON.stringify(report, null, 2));
});

test('AD06 catches a missing routed node leaf', async (t) => {
  const {skillRoot} = await copySkill(t, 'missing-leaf');
  await fs.rm(path.join(skillRoot, 'references', 'provenance.md'));
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.missing.some((item) => item.includes('provenance.md')));
});

test('AD06 catches an orphan reference leaf', async (t) => {
  const {skillRoot} = await copySkill(t, 'orphan-reference');
  await fs.writeFile(path.join(skillRoot, 'references', 'orphan-public-leaf.md'), '# Orphan\n');
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.orphan.includes('reference:references/orphan-public-leaf.md'));
});

test('AD06 catches an orphan canonical template', async (t) => {
  const {skillRoot} = await copySkill(t, 'orphan-template');
  await fs.writeFile(path.join(skillRoot, 'assets', 'templates', 'orphan-template.json'), '{}\n');
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.orphan.includes('template:assets/templates/orphan-template.json'));
});

test('AD06 catches a public leaf that routes workers to a private implementation module', async (t) => {
  const {skillRoot} = await copySkill(t, 'private-dependency');
  const file = path.join(skillRoot, 'references', 'observation.md');
  await fs.appendFile(file, '\nNormal workers must read scripts/lib/checkpoint-store.mjs.\n');
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.privateDependencies.some((item) => item.includes('checkpoint-store.mjs')));
});

test('AD06 catches unknown public symbols and unknown output schemas', async (t) => {
  const {skillRoot} = await copySkill(t, 'unknown-public-contract');
  await mutateGraph(skillRoot, (graph) => {
    const entry = graph.nodes.find((node) => node.id === 'observation').interface.interfaces.find((item) => item.id === 'visual-hierarchy');
    entry.library.symbol = 'createMissingPublicSymbol';
    entry.outputSchema = 'refas.missing-public-schema/v1';
  });
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.missing.some((item) => item.includes('createMissingPublicSymbol')));
  assert.ok(report.missing.some((item) => item.includes('refas.missing-public-schema/v1')));
});

test('AD06 catches broken root routing and namespaced discovery', async (t) => {
  const {skillRoot} = await copySkill(t, 'broken-root');
  const file = path.join(skillRoot, 'SKILL.md');
  const text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replaceAll('references/INDEX.md', 'references/BROKEN-INDEX.md'));
  const report = await analyzeDiscoveryClosure({skillRoot, schemaRoot: SCHEMA_ROOT, runFreshWorker: false});
  assert.equal(report.status, 'FAIL');
  assert.ok(report.unreachable.some((item) => item.includes('SKILL.md does not route references/INDEX.md')));
});

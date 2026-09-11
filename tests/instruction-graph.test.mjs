import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  analyzeInstructionGraph,
  extractInstructionRoutes,
  resolveInstructionRoute,
} from '../tools/verify-instruction-graph.mjs';

const REPOSITORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('installed-skill instruction graph reaches every reference leaf with no boundary escapes', async () => {
  const graph = await analyzeInstructionGraph();
  assert.equal(graph.status, 'PASS', JSON.stringify(graph, null, 2));
  assert.equal(graph.referenceLeaves, 27);
  assert.equal(graph.reachableLeaves, 27);
  assert.equal(graph.skillRoutesToIndex, true);
  assert.deepEqual(graph.indexMissing, []);
  assert.deepEqual(graph.indexUnknown, []);
  assert.deepEqual(graph.orphanReferences, []);
  assert.deepEqual(graph.danglingRoutes, []);
  assert.deepEqual(graph.outsideSkillRoutes, []);
  assert.deepEqual(graph.codeEscapes, []);
  assert.deepEqual(graph.compatibilityDrift, []);
  assert.equal(graph.requirementsPresent, true);
});

test('instruction routes resolve only inside skills/refas', () => {
  assert.equal(resolveInstructionRoute('references/validation.md'), 'skills/refas/references/validation.md');
  assert.equal(resolveInstructionRoute('references/contracts/canonical-edit-boundary.md'), 'skills/refas/references/contracts/canonical-edit-boundary.md');
  assert.equal(resolveInstructionRoute('docs/canonical-edit-boundary.md'), 'skills/refas/docs/canonical-edit-boundary.md');
  assert.equal(resolveInstructionRoute('assets/templates/visual-review.json'), 'skills/refas/assets/templates/visual-review.json');
  assert.equal(resolveInstructionRoute('scripts/refas.mjs'), 'skills/refas/scripts/refas.mjs');
  assert.throws(() => resolveInstructionRoute('schemas/visual-review.schema.json'), /repository-local route is forbidden/);
  assert.throws(() => resolveInstructionRoute('../docs/architecture.md'), /unsafe skill route/);
  assert.throws(() => resolveInstructionRoute('skills/refas/references/validation.md'), /repository-local route is forbidden/);
});

test('route extraction exposes both allowed and forbidden repository routes to the verifier', () => {
  const routes = extractInstructionRoutes([
    'Read `references/validation.md` and `docs/canonical-edit-boundary.md`.',
    '[policy](references/claim-certification.md)',
    '`assets/templates/visual-review.json`',
    '`schemas/visual-review.schema.json`',
    '`tools/check-repository.mjs`',
  ].join('\n'));
  assert.deepEqual(routes, [
    'assets/templates/visual-review.json',
    'docs/canonical-edit-boundary.md',
    'references/claim-certification.md',
    'references/validation.md',
    'schemas/visual-review.schema.json',
    'tools/check-repository.mjs',
  ]);
});

test('a bare copied skills/refas directory verifies with the repository absent', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-installed-skill-'));
  try {
    const installed = path.join(temp, 'refas');
    await fs.cp(path.join(REPOSITORY, 'skills/refas'), installed, {recursive: true});
    const verifier = path.join(installed, 'scripts/verify_installation_boundary.mjs');
    const result = spawnSync(process.execPath, [verifier], {cwd: temp, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.referenceLeaves, 27);
    assert.equal(report.outsideSkillRoutes, 0);
    assert.equal(report.runtimeDependencyEscapes, 0);
    assert.equal(report.compatibilityDrift, 0);
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

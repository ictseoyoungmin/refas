import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  analyzeInstructionGraph,
  extractInstructionRoutes,
  resolveInstructionRoute,
} from '../tools/verify-instruction-graph.mjs';

test('instruction graph reaches every RefAs reference leaf with no dangling package routes', async () => {
  const graph = await analyzeInstructionGraph();
  assert.equal(graph.status, 'PASS', JSON.stringify(graph, null, 2));
  assert.equal(graph.referenceLeaves, 19);
  assert.equal(graph.reachableLeaves, 19);
  assert.equal(graph.skillRoutesToIndex, true);
  assert.deepEqual(graph.indexMissing, []);
  assert.deepEqual(graph.indexUnknown, []);
  assert.deepEqual(graph.orphanReferences, []);
  assert.deepEqual(graph.danglingRoutes, []);
  assert.deepEqual(graph.packageDanglingRoutes, []);
});

test('instruction route roots are explicit and traversal fails closed', () => {
  assert.equal(resolveInstructionRoute('references/validation.md'), 'skills/refas/references/validation.md');
  assert.equal(resolveInstructionRoute('assets/templates/visual-review.json'), 'skills/refas/assets/templates/visual-review.json');
  assert.equal(resolveInstructionRoute('scripts/refas.mjs'), 'skills/refas/scripts/refas.mjs');
  assert.equal(resolveInstructionRoute('docs/architecture.md'), 'docs/architecture.md');
  assert.equal(resolveInstructionRoute('schemas/visual-review.schema.json'), 'schemas/visual-review.schema.json');
  assert.throws(() => resolveInstructionRoute('../docs/architecture.md'), /unsafe instruction route/);
  assert.throws(() => resolveInstructionRoute('validation.md'), /no declared root convention/);
});

test('route extraction recognizes both inline and Markdown-link instruction targets', () => {
  const routes = extractInstructionRoutes([
    'Read `references/validation.md` and `docs/architecture.md`.',
    '[policy](references/claim-certification.md)',
    '`assets/templates/visual-review.json`',
  ].join('\n'));
  assert.deepEqual(routes, [
    'assets/templates/visual-review.json',
    'docs/architecture.md',
    'references/claim-certification.md',
    'references/validation.md',
  ]);
});

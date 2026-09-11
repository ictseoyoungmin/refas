import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {FINDING_OWNERS} from '../skills/refas/scripts/lib/ownership.mjs';
import {
  analyzeSemanticInstructionGraph,
  extractBareMarkdownRoutes,
} from '../skills/refas/scripts/verify_semantic_instruction_graph.mjs';

const REPOSITORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('typed semantic instruction graph covers every leaf and matches runtime ownership', async () => {
  const report = await analyzeSemanticInstructionGraph();
  assert.equal(report.status, 'PASS', report.errors.join('\n'));
  assert.equal(report.schema, 'refas.instruction-graph/v1');
  assert.equal(report.nodeCount, 27);
  assert.equal(report.referenceLeaves, 27);
  assert.equal(report.cycle, null);
  assert.deepEqual(report.bareMarkdownRoutes, []);
  assert.equal(FINDING_OWNERS['camera-hypothesis-mismatch'], 'spatial-hypotheses');
  assert.equal(FINDING_OWNERS['render-camera-integrity'], 'rendering');
  assert.equal(FINDING_OWNERS['camera-mismatch'], 'rendering');
});

test('bare sibling Markdown instruction references are rejected as ambiguous routes', () => {
  assert.deepEqual(extractBareMarkdownRoutes('Read `parameter-fitting.md` before continuing.'), ['parameter-fitting.md']);
  assert.deepEqual(extractBareMarkdownRoutes('Read `references/parameter-fitting.md` before continuing.'), []);
  assert.deepEqual(extractBareMarkdownRoutes('`SKILL.md` enters through `references/INDEX.md`.'), []);
});

test('semantic graph verifies from a bare copied installed skill with repository absent', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-semantic-graph-'));
  try {
    const installed = path.join(temp, 'refas');
    await fs.cp(path.join(REPOSITORY, 'skills/refas'), installed, {recursive: true});
    const verifier = path.join(installed, 'scripts/verify_semantic_instruction_graph.mjs');
    const result = spawnSync(process.execPath, [verifier], {cwd: temp, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.nodeCount, 27);
    assert.equal(report.referenceLeaves, 27);
    assert.equal(report.bareMarkdownRoutes, 0);
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

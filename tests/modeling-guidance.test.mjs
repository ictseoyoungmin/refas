import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const skillRoot = new URL('../skills/refas/', import.meta.url);
const read = (path) => fs.readFile(new URL(path, skillRoot), 'utf8');

test('agent entry prioritizes whole-object construction and repeated geometry', async () => {
  const skill = await read('SKILL.md');
  const priorities = skill.indexOf('## Modeling priorities');
  const certification = skill.indexOf('Source-bound approval', priorities);
  assert.ok(priorities >= 0 && certification > priorities);
  assert.match(skill, /Build a coherent whole with continuous side\/back geometry/);
  assert.match(skill, /Reuse shared profiles and mirrored\/repeated geometry/);
});

test('single-view worked example demonstrates complete surfaces and functional continuity', async () => {
  const example = await read('references/single-view-volumetric-reasoning-example.md');
  assert.match(example, /continuous front, side, rear, top, and bottom geometry/);
  assert.match(example, /measured shared profiles/);
  assert.match(example, /mesh integrity, per-component closure, and assembly separately/);
});

test('claim provenance stays scoped to explicit semantic propositions', async () => {
  const authority = await read('references/inference-authority.md');
  const workflow = await read('references/workflow.md');
  assert.match(authority, /For an explicitly governed semantic proposition/);
  assert.match(workflow, /Routine surface completion follows the shape hypothesis/);
  assert.match(authority, /\`forbidden\` records contradiction or a hard constraint/);
});

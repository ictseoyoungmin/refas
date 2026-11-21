import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const skillRoot = new URL('../skills/refas/', import.meta.url);
const read = (path) => fs.readFile(new URL(path, skillRoot), 'utf8');

test('production entry teaches direct authoring before optional 1.x compatibility', async () => {
  const skill = await read('SKILL.md');
  const compatibility = skill.indexOf('## Optional 1.x project compatibility');
  assert.ok(compatibility > 0);
  const production = skill.slice(0, compatibility);
  assert.match(production, /scripts\/produce\.py run/);
  assert.match(production, /scripts\/produce\.py restore/);
  assert.match(production, /`bpy`/);
  assert.match(production, /inferred depth and engineered choices/);
  assert.doesNotMatch(production, /node scripts\/refas\.mjs|references\/INDEX\.md/);
  assert.match(skill.slice(compatibility), /references\/INDEX\.md/);
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

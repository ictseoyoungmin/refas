import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspectGlb, parseGlb} from '../skills/refas/scripts/lib/index.mjs';
import {buildArticulatedFigure, materials} from '../examples/articulated-figure/model.mjs';

test('articulated figure is a portable identity-bearing GLB', () => {
  const reference = buildArticulatedFigure('reference');
  const inspection = inspectGlb(reference.glb);
  assert.equal(inspection.valid, true);
  assert.equal(reference.parts.length, 41);
  assert.ok(inspection.triangleCount > 12_500);
  const roles = new Set(reference.parts.map((part) => part.role));
  for (const required of ['pelvis-shell','ribcage-shell','true-knee-cutaway-rim','separated-finger-hand','ankle-to-foot-connector','heel-instep-toe-foot']) assert.ok(roles.has(required), `missing identity-bearing role: ${required}`);
  for (const material of Object.values(materials)) {
    assert.equal(material.baseColor.length, 4);
    assert.ok(Number.isFinite(material.metallic)); assert.ok(Number.isFinite(material.roughness));
  }
});

test('reference and neutral poses share local meshes under a real parent hierarchy', () => {
  const reference = buildArticulatedFigure('reference'), neutral = buildArticulatedFigure('neutral');
  const a = parseGlb(reference.glb), b = parseGlb(neutral.glb);
  assert.ok(a.binary.equals(b.binary), 'pose changes must not rewrite part-local mesh bytes');
  const aNodes = new Map(a.json.nodes.map((node) => [node.name, node])), bNodes = new Map(b.json.nodes.map((node) => [node.name, node]));
  assert.notDeepEqual(aNodes.get('raised-leg-knee-joint').matrix, bNodes.get('raised-leg-knee-joint').matrix);
  assert.notDeepEqual(aNodes.get('head-shell').matrix, bNodes.get('head-shell').matrix);
  const parts = new Map(reference.parts.map((part) => [part.id, part]));
  assert.equal(parts.get('ribcage-shell').parentId, 'waist-connector');
  assert.equal(parts.get('raised-leg-knee-joint').parentId, 'raised-leg-thigh');
  assert.equal(parts.get('raised-leg-foot').parentId, 'raised-leg-foot-bridge');
  assert.equal(parts.get('resting-arm-hand').parentId, 'resting-arm-wrist-joint');
});

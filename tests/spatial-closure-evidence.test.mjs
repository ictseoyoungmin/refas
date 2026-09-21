import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createSpatialClosureEvidence,
  digestBytes,
  validateSpatialClosureEvidence,
} from '../skills/refas/scripts/lib/index.mjs';
import {buildVolumeClosureRegressionFixture} from './fixtures/volume-closure-regression-fixtures.mjs';

function containsAuthorityVerdict(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (['status', 'verdict', 'spatialRole', 'classification', 'planarCollapse'].includes(key)) return true;
    if (containsAuthorityVerdict(child)) return true;
  }
  return false;
}

function zeroEmbeddedBin(glb) {
  const bytes = Buffer.from(glb);
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x004e4942) {
      bytes.fill(0, start, start + length);
      return bytes;
    }
    offset = start + length;
  }
  throw new Error('fixture GLB has no BIN chunk');
}

test('VC01 derives byte-deterministic observation evidence from the exact candidate', () => {
  const fixture = buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  const first = createSpatialClosureEvidence({glb: fixture.glb, scopeId: 'whole'});
  const second = createSpatialClosureEvidence({glb: fixture.glb, scopeId: 'whole'});
  assert.deepEqual(first, second);
  assert.equal(first.assetSha256, digestBytes(fixture.glb));
  assert.equal(first.schema, 'refas.spatial-closure-evidence/v1');
  assert.equal(first.policy.observationOnly, true);
  assert.equal(first.policy.classifierAuthority, false);
  assert.equal(first.policy.certificationAuthority, false);
  assert.equal(validateSpatialClosureEvidence(first, {glb: fixture.glb}).valid, true);
});

test('VC01 candidate binding follows measured bytes and cannot be caller-forged', () => {
  const planar = buildVolumeClosureRegressionFixture('gpt-planar-bird-surrogate');
  const volumetric = buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  const evidence = createSpatialClosureEvidence({
    glb: planar.glb,
    scopeId: 'whole',
    assetSha256: 'f'.repeat(64),
  });
  assert.equal(evidence.assetSha256, planar.glbSha256);
  assert.notEqual(evidence.assetSha256, volumetric.glbSha256);
  assert.notEqual(evidence.evidenceDigest, createSpatialClosureEvidence({glb: volumetric.glb, scopeId: 'whole'}).evidenceDigest);
  assert.equal(validateSpatialClosureEvidence(evidence, {glb: volumetric.glb}).valid, false);
});

test('VC01 records XYZ, projection, cross-section, front/back, and local-thickness support without classifying it', () => {
  for (const id of [
    'gpt-planar-bird-surrogate',
    'claude-volumetric-bird-surrogate',
    'intentionally-thin-panel',
    'synthetic-degenerate-volume',
  ]) {
    const fixture = buildVolumeClosureRegressionFixture(id);
    const evidence = createSpatialClosureEvidence({glb: fixture.glb, scopeId: 'whole'});
    assert.ok(evidence.bounds.extent.every((value) => Number.isFinite(value) && value > 0));
    assert.equal(evidence.principal.axes.length, 3);
    assert.equal(evidence.crossSections.x.length, 7);
    assert.equal(evidence.crossSections.y.length, 7);
    assert.equal(evidence.crossSections.z.length, 7);
    assert.deepEqual(Object.keys(evidence.projectedSupport).sort(), ['FRONT', 'SIDE', 'TOP']);
    assert.deepEqual(Object.keys(evidence.localThickness).sort(), ['x', 'y', 'z']);
    assert.equal(evidence.frontBackSupport.axis, 'z');
    assert.equal(containsAuthorityVerdict(evidence), false);
  }
});

test('VC01 exposes collapsed support as measurements while preserving intentionally-thin ambiguity', () => {
  const planar = createSpatialClosureEvidence({glb: buildVolumeClosureRegressionFixture('gpt-planar-bird-surrogate').glb});
  const volumetric = createSpatialClosureEvidence({glb: buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate').glb});
  const thin = createSpatialClosureEvidence({glb: buildVolumeClosureRegressionFixture('intentionally-thin-panel').glb});
  const degenerate = createSpatialClosureEvidence({glb: buildVolumeClosureRegressionFixture('synthetic-degenerate-volume').glb});

  assert.ok(planar.bounds.extent[2] < volumetric.bounds.extent[2]);
  assert.ok(thin.bounds.extent[2] < planar.bounds.extent[2]);
  assert.ok(degenerate.bounds.extent[2] < thin.bounds.extent[2]);
  assert.ok(planar.projectedSupport.SIDE.normalizedBoundsArea < volumetric.projectedSupport.SIDE.normalizedBoundsArea);
  assert.ok(thin.projectedSupport.SIDE.normalizedBoundsArea < planar.projectedSupport.SIDE.normalizedBoundsArea);
  assert.equal(planar.policy.semanticInterpretationDeferred, true);
  assert.equal(thin.policy.semanticInterpretationDeferred, true);
  assert.equal(degenerate.policy.semanticInterpretationDeferred, true);
});

test('VC01 exact scope selection never falls back to whole-object geometry', () => {
  const fixture = buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  assert.throws(
    () => createSpatialClosureEvidence({glb: fixture.glb, scopeId: 'missing-major-scope'}),
    /requested scope missing-major-scope is not exposed/u,
  );
});

test('VC01 rejects geometry with no non-degenerate measured triangles', () => {
  const fixture = buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  assert.throws(
    () => createSpatialClosureEvidence({glb: zeroEmbeddedBin(fixture.glb), scopeId: 'whole'}),
    /no non-degenerate triangles/u,
  );
});

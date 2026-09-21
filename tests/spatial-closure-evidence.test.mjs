import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createSpatialClosureEvidence,
  digestBytes,
  partsToGlb,
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


function mutateFirstPositionAccessorToUnsignedShort(glb) {
  const bytes=Buffer.from(glb);
  const jsonLength=bytes.readUInt32LE(12);
  const jsonStart=20;
  const text=bytes.subarray(jsonStart,jsonStart+jsonLength).toString('utf8');
  const needle='"componentType":5126';
  const index=text.indexOf(needle);
  if(index<0) throw new Error('fixture GLB has no FLOAT accessor to mutate');
  const replacement='"componentType":5123';
  const mutated=text.slice(0,index)+replacement+text.slice(index+needle.length);
  Buffer.from(mutated,'utf8').copy(bytes,jsonStart);
  return bytes;
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


function scopedBox({min, max}) {
  const [x0,y0,z0]=min, [x1,y1,z1]=max;
  return {
    positions:[
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
    ],
    indices:[
      0,2,1,0,3,2,4,5,6,4,6,7,
      0,1,5,0,5,4,3,7,6,3,6,2,
      0,4,7,0,7,3,1,2,6,1,6,5,
    ],
  };
}

test('VC01 measures an exact declared major scope without including sibling geometry', () => {
  const glb=partsToGlb({
    assetId:'vc01-major-scope',
    materials:{fixture:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:0.5}},
    parts:[
      {
        id:'body',
        scopeId:'major-body',
        role:'major-body-volume',
        materialId:'fixture',
        mesh:scopedBox({min:[-1,-2,-0.5],max:[1,2,0.5]}),
      },
      {
        id:'badge',
        scopeId:'detail-badge',
        role:'detail',
        materialId:'fixture',
        mesh:scopedBox({min:[4,4,4],max:[5,5,5]}),
      },
    ],
  });
  const whole=createSpatialClosureEvidence({glb,scopeId:'whole'});
  const major=createSpatialClosureEvidence({glb,scopeId:'major-body'});
  assert.equal(whole.selection.selectedNodes.length,2);
  assert.equal(major.selection.strategy,'exact-node-extras-scope-id');
  assert.equal(major.selection.selectedNodes.length,1);
  assert.equal(major.selection.selectedNodes[0].partId,'body');
  assert.deepEqual(major.bounds.min,[-1,-2,-0.5]);
  assert.deepEqual(major.bounds.max,[1,2,0.5]);
  assert.deepEqual(major.bounds.extent,[2,4,1]);
  assert.notDeepEqual(major.bounds,whole.bounds);
});


test('VC01 rejects malformed non-FLOAT POSITION accessors instead of measuring permissive numeric data', () => {
  const fixture=buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  const malformed=mutateFirstPositionAccessorToUnsignedShort(fixture.glb);
  assert.throws(
    () => createSpatialClosureEvidence({glb:malformed,scopeId:'whole'}),
    /POSITION accessor must be non-normalized FLOAT VEC3/u,
  );
});

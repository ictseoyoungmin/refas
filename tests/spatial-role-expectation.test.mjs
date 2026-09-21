import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  SPATIAL_ROLE_VALUES,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  validateSpatialRoleExpectationSet,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_SHA='a'.repeat(64);

function hierarchy() {
  return createVisualHierarchy({
    source:{path:'source/reference.png',sha256:SOURCE_SHA,width:1000,height:800},
    nodes:[
      {id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]},
      {id:'body',label:'Body',level:'region',parentId:'whole',roi:[0.15,0.15,0.5,0.65]},
      {id:'shell',label:'Shell',level:'region',parentId:'whole',roi:[0.65,0.15,0.2,0.25]},
      {id:'rod',label:'Rod',level:'part',parentId:'body',roi:[0.2,0.2,0.08,0.45]},
      {id:'panel',label:'Panel',level:'part',parentId:'body',roi:[0.3,0.25,0.2,0.3]},
      {id:'unknown-form',label:'Unknown form',level:'part',parentId:'body',roi:[0.52,0.25,0.1,0.15]},
    ],
  });
}

const expectation=(scopeId,role,extra={})=>({
  scopeId,
  role,
  sourceObservation:`The source shows ${scopeId} with source-visible spatial cues.`,
  rationale:`Bind ${scopeId} as ${role} before candidate evaluation.`,
  evidenceRefs:['source/reference.png'],
  ambiguity:role==='unresolved'?'The single source view does not resolve front/back construction.':null,
  ...extra,
});

test('VC02 supports every declared spatial role and round-trips canonically', () => {
  const h=hierarchy();
  const roles=[
    ['whole','volumetric'],
    ['body','layered-volume'],
    ['shell','thin-shell'],
    ['rod','rod-tubular'],
    ['panel','intentionally-planar'],
    ['unknown-form','unresolved'],
  ];
  assert.deepEqual(roles.map(([,role])=>role).sort(),[...SPATIAL_ROLE_VALUES].sort());
  const first=createSpatialRoleExpectationSet({
    hierarchy:h,
    sourceSha256:SOURCE_SHA,
    expectations:roles.map(([scopeId,role])=>expectation(scopeId,role)),
  });
  const second=createSpatialRoleExpectationSet({
    hierarchy:h,
    sourceSha256:SOURCE_SHA,
    expectations:[...roles].reverse().map(([scopeId,role])=>expectation(scopeId,role)),
  });
  assert.deepEqual(first,second);
  assert.equal(validateSpatialRoleExpectationSet(first,h).valid,true);
  assert.equal(first.policy.candidateIndependent,true);
  assert.equal(first.policy.classifierIndependent,true);
  assert.equal(first.policy.observationDoesNotClassify,true);
  assert.equal(first.policy.expectationDoesNotCertify,true);
});

test('VC02 rejects source and hierarchy scope mismatches', () => {
  const h=hierarchy();
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:'b'.repeat(64),
      expectations:[expectation('whole','volumetric')],
    }),
    /must match the bound visual hierarchy source/u,
  );
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('not-in-hierarchy','volumetric')],
    }),
    /not present in the bound visual hierarchy/u,
  );
});

test('VC02 preserves unresolved instead of forcing a guessed role', () => {
  const h=hierarchy();
  const set=createSpatialRoleExpectationSet({
    hierarchy:h,
    sourceSha256:SOURCE_SHA,
    expectations:[expectation('unknown-form','unresolved')],
  });
  assert.equal(set.expectations[0].role,'unresolved');
  assert.match(set.expectations[0].ambiguity,/does not resolve/u);
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('unknown-form','unresolved',{ambiguity:null})],
    }),
    /requires explicit ambiguity/u,
  );
});

test('VC02 role authoring rejects candidate/classifier-derived fields instead of ignoring them', () => {
  const h=hierarchy();
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('whole','volumetric')],
      assetSha256:'c'.repeat(64),
    }),
    /unsupported field assetSha256/u,
  );
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('whole','volumetric',{spatialClosureEvidenceDigest:'d'.repeat(64)})],
    }),
    /unsupported field spatialClosureEvidenceDigest/u,
  );
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('whole','volumetric',{verdict:'pass'})],
    }),
    /unsupported field verdict/u,
  );
});

test('VC02 requires direct raw-source citation for every role assignment', () => {
  const h=hierarchy();
  assert.throws(
    ()=>createSpatialRoleExpectationSet({
      hierarchy:h,
      sourceSha256:SOURCE_SHA,
      expectations:[expectation('whole','volumetric',{evidenceRefs:['evidence/derived.png']})],
    }),
    /must cite the exact raw source path/u,
  );
});

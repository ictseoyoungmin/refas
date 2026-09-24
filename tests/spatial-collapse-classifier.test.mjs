import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  classifySpatialCollapse,
  commitCheckpoint,
  contentReference,
  createSpatialClosureEvidence,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  digestBytes,
  digestJson,
  finalizeMesh,
  partsToGlb,
  validateSpatialCollapseClassification,
} from '../skills/refas/scripts/lib/index.mjs';
import {_classifySpatialCollapseFromAuthority} from '../skills/refas/scripts/lib/spatial-collapse-classifier.mjs';
import {initTrustedContractFixtureProject} from '../skills/refas/scripts/lib/contract-fixture-project.mjs';
import {buildVolumeClosureRegressionFixture} from './fixtures/volume-closure-regression-fixtures.mjs';

const D=(c)=>c.repeat(64);

function expectation(role,scopeId='whole'){
  return {
    scopeId,
    role,
    sourceObservation:`Source expectation for ${scopeId} is ${role}.`,
    rationale:'VC03 test freezes role before candidate evaluation.',
    evidenceRefs:['source/reference.bin'],
    ambiguity:role==='unresolved'?'Source view is insufficient to resolve spatial role.':null,
  };
}

function authority(role,scopeId='whole'){
  const selectedExpectation=expectation(role,scopeId);
  const payload={
    schema:'refas.spatial-role-authority/v1',
    sourceSha256:D('a'),
    hierarchyDigest:D('b'),
    expectationSetDigest:D('c'),
    authorityCheckpointId:'cp-spatial',
    authorityCapability:'spatial-hypotheses',
    artifactPath:'model/spatial-role.json',
    expectations:[selectedExpectation],
    selectedExpectation,
    carryForwardCheckpointIds:[],
    policy:{
      earliestPreBoundExpectationIsAuthority:true,
      postShapeRelabelForbidden:true,
      identicalCarryForwardAllowed:true,
      candidateIndependent:true,
      classifierIndependent:true,
    },
  };
  return {...payload,authorityDigest:digestJson(payload)};
}

function classifyFixture(id,role){
  const fixture=buildVolumeClosureRegressionFixture(id);
  const evidence=createSpatialClosureEvidence({glb:fixture.glb,scopeId:'whole'});
  return _classifySpatialCollapseFromAuthority({glb:fixture.glb,spatialEvidence:evidence,roleAuthority:authority(role)});
}

function boxMesh(size){
  const [hx,hy,hz]=size.map((value)=>value/2);
  const positions=[
    [-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
    [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],
  ];
  const indices=[
    0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
    3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5,
  ];
  return finalizeMesh(positions,indices,{primitive:'vc03-box'});
}

function rodGlb(size){
  return partsToGlb({
    assetId:'vc03-rod',
    materials:{fixture:{baseColor:[0.5,0.5,0.5,1],metallic:0,roughness:0.5}},
    parts:[{id:'rod',scopeId:'whole',role:'rod-control',materialId:'fixture',mesh:boxMesh(size)}],
  });
}

test('VC03 separates planar and volumetric controls under the same frozen volumetric role',()=>{
  const planar=classifyFixture('gpt-planar-bird-surrogate','volumetric');
  const volumetric=classifyFixture('claude-volumetric-bird-surrogate','volumetric');
  const degenerate=classifyFixture('synthetic-degenerate-volume','volumetric');
  assert.equal(planar.classification,'PLANAR_COLLAPSE');
  assert.equal(volumetric.classification,'NO_PLANAR_COLLAPSE');
  assert.equal(degenerate.classification,'PLANAR_COLLAPSE');
  assert.ok(planar.decisionBasis.usedSignalIds.length>=3);
  assert.ok(volumetric.decisionBasis.usedSignalIds.length>=3);
  assert.equal(planar.decisionBasis.noAggregateScore,true);
});

test('VC03 applies the same multi-signal contradiction rule to layered-volume',()=> {
  const planar=classifyFixture('gpt-planar-bird-surrogate','layered-volume');
  const volumetric=classifyFixture('claude-volumetric-bird-surrogate','layered-volume');
  assert.equal(planar.classification,'PLANAR_COLLAPSE');
  assert.equal(volumetric.classification,'NO_PLANAR_COLLAPSE');
  assert.equal(planar.frozenRole,'layered-volume');
});

test('VC03 preserves legitimate thin semantics and proves role changes matter without rewriting VC02',()=>{
  const expectedPlanar=classifyFixture('intentionally-thin-panel','intentionally-planar');
  const shell=classifyFixture('intentionally-thin-panel','thin-shell');
  const wrongRole=classifyFixture('intentionally-thin-panel','volumetric');
  assert.equal(expectedPlanar.classification,'NOT_APPLICABLE');
  assert.equal(shell.classification,'NOT_APPLICABLE');
  assert.equal(wrongRole.classification,'PLANAR_COLLAPSE');
  assert.equal(expectedPlanar.frozenRole,'intentionally-planar');
  assert.equal(wrongRole.frozenRole,'volumetric');
  assert.equal(expectedPlanar.policy.roleMutationAllowed,false);
});

test('VC03 preserves unresolved role as indeterminate',()=>{
  const result=classifyFixture('gpt-planar-bird-surrogate','unresolved');
  assert.equal(result.classification,'INDETERMINATE');
  assert.deepEqual(result.decisionBasis.usedSignalIds,[]);
});

test('VC03 rod/tubular logic distinguishes a tube from a ribbon using transverse signals',()=>{
  const tube=rodGlb([5,0.6,0.6]);
  const ribbon=rodGlb([5,0.6,0.03]);
  const tubeEvidence=createSpatialClosureEvidence({glb:tube});
  const ribbonEvidence=createSpatialClosureEvidence({glb:ribbon});
  const tubeResult=_classifySpatialCollapseFromAuthority({glb:tube,spatialEvidence:tubeEvidence,roleAuthority:authority('rod-tubular')});
  const ribbonResult=_classifySpatialCollapseFromAuthority({glb:ribbon,spatialEvidence:ribbonEvidence,roleAuthority:authority('rod-tubular')});
  assert.equal(tubeResult.classification,'NO_PLANAR_COLLAPSE');
  assert.equal(ribbonResult.classification,'PLANAR_COLLAPSE');
  assert.ok(tubeResult.signals.roleSpecific.length>=3);
  assert.ok(ribbonResult.decisionBasis.usedSignalIds.length>=2);
});

test('VC03 does not promote one suspicious signal into PLANAR_COLLAPSE',()=>{
  const elongated=rodGlb([0.5,5,0.5]);
  const evidence=createSpatialClosureEvidence({glb:elongated});
  const result=_classifySpatialCollapseFromAuthority({
    glb:elongated,
    spatialEvidence:evidence,
    roleAuthority:authority('volumetric'),
  });
  const used=result.signals.volumetricFamilies.filter((signal)=>signal.band==='collapsed');
  assert.equal(used.length,1);
  assert.equal(used[0].id,'orthogonal-projection-support');
  assert.notEqual(result.classification,'PLANAR_COLLAPSE');
});

test('VC03 rejects stale candidate evidence, scope mismatch, and forged role authority digest',()=>{
  const planar=buildVolumeClosureRegressionFixture('gpt-planar-bird-surrogate');
  const volumetric=buildVolumeClosureRegressionFixture('claude-volumetric-bird-surrogate');
  const evidence=createSpatialClosureEvidence({glb:planar.glb});
  assert.throws(
    ()=>_classifySpatialCollapseFromAuthority({glb:volumetric.glb,spatialEvidence:evidence,roleAuthority:authority('volumetric')}),
    /VC01 spatial evidence is invalid/u,
  );
  assert.throws(
    ()=>_classifySpatialCollapseFromAuthority({glb:planar.glb,spatialEvidence:evidence,roleAuthority:authority('volumetric','body')}),
    /scope mismatch/u,
  );
  const forged=authority('volumetric');
  forged.selectedExpectation.role='thin-shell';
  assert.throws(
    ()=>_classifySpatialCollapseFromAuthority({glb:planar.glb,spatialEvidence:evidence,roleAuthority:forged}),
    /authority digest mismatch/u,
  );
});

async function writeRef(root,relative,bytes,kind){
  const absolute=path.join(root,relative);
  await fs.mkdir(path.dirname(absolute),{recursive:true});
  await fs.writeFile(absolute,bytes);
  return contentReference(absolute,{kind,root});
}

async function commitLocal(root,capability,refs){
  return commitCheckpoint(root,{
    capability,scopeId:'whole',reason:`${capability} VC03 runtime fixture`,
    artifactRefs:refs,claims:[`${capability} fixture`],
    gates:[{id:`${capability}-gate`,evidenceRefs:refs.map((ref)=>ref.path)}],
  });
}

test('VC03 public classifier resolves the frozen VC02 role from project lineage',async(t)=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-vc03-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourceBytes=Buffer.from('vc03 source bytes\n');
  await fs.mkdir(path.join(root,'source'),{recursive:true});
  await fs.writeFile(path.join(root,'source','reference.bin'),sourceBytes);
  const source={
    schema:'refas.source-manifest/v1',id:'primary-reference',path:'source/reference.bin',
    sha256:digestBytes(sourceBytes),sizeBytes:sourceBytes.length,width:128,height:96,
    authority:'primary',acquisition:{kind:'generated-contract-reference'},
  };
  await initTrustedContractFixtureProject(root,{projectId:'vc03-runtime',source,fixtureId:'vc03-contract'});
  await commitLocal(root,'source-intake',[await writeRef(root,'model/source.json',Buffer.from('{"source":true}\n'),'source-manifest')]);
  const hierarchy=createVisualHierarchy({
    source:{path:source.path,sha256:source.sha256,width:source.width,height:source.height},
    nodes:[{id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]}],
  });
  await commitLocal(root,'visual-hierarchy',[await writeRef(root,'model/hierarchy.json',Buffer.from(`${JSON.stringify(hierarchy,null,2)}\n`),'visual-hierarchy')]);
  await commitLocal(root,'visual-observation',[await writeRef(root,'model/observation.json',Buffer.from('{"observation":true}\n'),'visual-observation')]);
  const role=createSpatialRoleExpectationSet({
    hierarchy,sourceSha256:source.sha256,
    expectations:[{
      scopeId:'whole',role:'volumetric',
      sourceObservation:'Source presents a mass-bearing whole object.',
      rationale:'Freeze volumetric role before reconstruction.',
      evidenceRefs:[source.path],ambiguity:null,
    }],
  });
  const roleRef=await writeRef(root,'model/role.json',Buffer.from(`${JSON.stringify(role,null,2)}\n`),'spatial-role-expectation');
  const spatialRef=await writeRef(root,'model/spatial.json',Buffer.from('{"spatial":true}\n'),'spatial-hypotheses');
  await commitLocal(root,'spatial-hypotheses',[spatialRef,roleRef]);

  const fixture=buildVolumeClosureRegressionFixture('gpt-planar-bird-surrogate');
  const evidence=createSpatialClosureEvidence({glb:fixture.glb});
  const result=await classifySpatialCollapse(root,{glb:fixture.glb,spatialEvidence:evidence,scopeId:'whole'});
  assert.equal(result.frozenRole,'volumetric');
  assert.equal(result.classification,'PLANAR_COLLAPSE');
  assert.equal((await validateSpatialCollapseClassification(root,result,{glb:fixture.glb,spatialEvidence:evidence})).valid,true);

  const tampered=structuredClone(result);
  tampered.classification='NO_PLANAR_COLLAPSE';
  assert.equal((await validateSpatialCollapseClassification(root,tampered,{glb:fixture.glb,spatialEvidence:evidence})).valid,false);
});


test('VC03 public classifier rejects caller role override attempts',async(t)=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-vc03-override-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await assert.rejects(
    ()=>classifySpatialCollapse(root,{role:'thin-shell'}),
    /unsupported field role; frozen VC02 role cannot be overridden/u,
  );
});

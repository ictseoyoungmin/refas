import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  auditProject,
  commitCheckpoint,
  contentReference,
  createSpatialRoleExpectationSet,
  createVisualHierarchy,
  digestBytes,
  resolveSpatialRoleAuthority,
} from '../skills/refas/scripts/lib/index.mjs';
import {initTrustedContractFixtureProject} from '../skills/refas/scripts/lib/contract-fixture-project.mjs';

async function writeRef(root, relative, bytes, kind) {
  const absolute=path.join(root,relative);
  await fs.mkdir(path.dirname(absolute),{recursive:true});
  await fs.writeFile(absolute,bytes);
  return contentReference(absolute,{kind,root});
}

async function commitLocal(root, capability, refs, scopeId='whole') {
  return commitCheckpoint(root,{
    capability,
    scopeId,
    reason:`${capability} VC02 authority fixture`,
    artifactRefs:refs,
    claims:[`${capability} fixture`],
    gates:[{id:`${capability}-gate`,evidenceRefs:refs.map((ref)=>ref.path)}],
  });
}

async function makeProject(t,{bindAtSpatial=true}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-vc02-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourceBytes=Buffer.from('vc02 source bytes\n');
  await fs.mkdir(path.join(root,'source'),{recursive:true});
  await fs.writeFile(path.join(root,'source','reference.bin'),sourceBytes);
  const source={
    schema:'refas.source-manifest/v1',
    id:'primary-reference',
    path:'source/reference.bin',
    sha256:digestBytes(sourceBytes),
    sizeBytes:sourceBytes.length,
    width:128,
    height:96,
    authority:'primary',
    acquisition:{kind:'generated-contract-reference'},
  };
  await initTrustedContractFixtureProject(root,{projectId:'vc02-authority',source,fixtureId:'vc02-contract'});

  const sourceRef=await writeRef(root,'model/source.json',Buffer.from('{"source":true}\n'),'source-manifest');
  await commitLocal(root,'source-intake',[sourceRef]);

  const hierarchy=createVisualHierarchy({
    source:{path:source.path,sha256:source.sha256,width:source.width,height:source.height},
    nodes:[
      {id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]},
      {id:'body',label:'Body',level:'region',parentId:'whole',roi:[0.15,0.15,0.7,0.7]},
    ],
  });
  const hierarchyRef=await writeRef(root,'model/hierarchy.json',Buffer.from(`${JSON.stringify(hierarchy,null,2)}\n`),'visual-hierarchy');
  await commitLocal(root,'visual-hierarchy',[hierarchyRef]);

  const observationRef=await writeRef(root,'model/observation.json',Buffer.from('{"observation":true}\n'),'visual-observation');
  await commitLocal(root,'visual-observation',[observationRef]);

  const expectation=createSpatialRoleExpectationSet({
    hierarchy,
    sourceSha256:source.sha256,
    expectations:[
      {
        scopeId:'whole',
        role:'volumetric',
        sourceObservation:'The source whole object shows visible mass and front/back layering cues.',
        rationale:'The whole object should be treated as volumetric before any candidate is inspected.',
        evidenceRefs:[source.path],
        ambiguity:null,
      },
      {
        scopeId:'body',
        role:'layered-volume',
        sourceObservation:'The body source region contains overlapping plates over a deeper mass.',
        rationale:'The body is expected to retain layered depth rather than one planar sheet.',
        evidenceRefs:[source.path],
        ambiguity:null,
      },
    ],
  });
  const expectationRef=await writeRef(root,'model/spatial-role-expectation.json',Buffer.from(`${JSON.stringify(expectation,null,2)}\n`),'spatial-role-expectation');
  const spatialRef=await writeRef(root,'model/spatial.json',Buffer.from('{"spatial":true}\n'),'spatial-hypotheses');
  const spatial=await commitLocal(root,'spatial-hypotheses',bindAtSpatial?[spatialRef,expectationRef]:[spatialRef]);
  return {root,source,hierarchy,expectation,expectationRef,spatial};
}

function relabeled(hierarchy,source,role='thin-shell') {
  return createSpatialRoleExpectationSet({
    hierarchy,
    sourceSha256:source.sha256,
    expectations:[
      {
        scopeId:'whole',
        role,
        sourceObservation:'The same source is being relabeled after candidate work.',
        rationale:'Adversarial relabel attempt.',
        evidenceRefs:[source.path],
        ambiguity:null,
      },
    ],
  });
}

test('VC02 resolves the earliest spatial-hypotheses expectation as source-bound authority', async (t) => {
  const {root,expectation,spatial}=await makeProject(t);
  const authority=await resolveSpatialRoleAuthority(root);
  assert.equal(authority.expectationSetDigest,expectation.expectationSetDigest);
  assert.equal(authority.authorityCheckpointId,spatial.id);
  assert.equal(authority.authorityCapability,'spatial-hypotheses');
  assert.equal(authority.policy.earliestPreBoundExpectationIsAuthority,true);
  const body=await resolveSpatialRoleAuthority(root,{scopeId:'body'});
  assert.equal(body.selectedExpectation.role,'layered-volume');
  assert.equal((await auditProject(root)).valid,true);
});

test('VC02 rejects first role introduction at shape-reconstruction as too late', async (t) => {
  const {root,hierarchy,source}=await makeProject(t,{bindAtSpatial:false});
  const late=relabeled(hierarchy,source,'volumetric');
  const lateRef=await writeRef(root,'model/late-role.json',Buffer.from(`${JSON.stringify(late,null,2)}\n`),'spatial-role-expectation');
  const shapeRef=await writeRef(root,'model/shape.json',Buffer.from('{"shape":true}\n'),'model-spec');
  await assert.rejects(
    ()=>commitLocal(root,'shape-reconstruction',[shapeRef,lateRef]),
    /introduced too late at shape-reconstruction/u,
  );
});

test('VC02 forbids post-freeze role/evidence mutation', async (t) => {
  const {root,hierarchy,source}=await makeProject(t);
  const mutation=relabeled(hierarchy,source,'thin-shell');
  const mutationRef=await writeRef(root,'model/mutated-role.json',Buffer.from(`${JSON.stringify(mutation,null,2)}\n`),'spatial-role-expectation');
  const shapeRef=await writeRef(root,'model/shape.json',Buffer.from('{"shape":true}\n'),'model-spec');
  await assert.rejects(
    ()=>commitLocal(root,'shape-reconstruction',[shapeRef,mutationRef]),
    /spatial role expectation mutation is forbidden after authority freeze/u,
  );
});

test('VC02 permits exact identical carry-forward after shape without moving authority', async (t) => {
  const {root,expectationRef,spatial}=await makeProject(t);
  const shapeRef=await writeRef(root,'model/shape.json',Buffer.from('{"shape":true}\n'),'model-spec');
  const shape=await commitLocal(root,'shape-reconstruction',[shapeRef,expectationRef]);
  const authority=await resolveSpatialRoleAuthority(root);
  assert.equal(authority.authorityCheckpointId,spatial.id);
  assert.deepEqual(authority.carryForwardCheckpointIds,[shape.id]);
});

test('VC02 rejects pre-bind evidence that is not available before candidate evaluation', async (t) => {
  const {root,hierarchy,source}=await makeProject(t,{bindAtSpatial:false});
  const sourceOnly=createSpatialRoleExpectationSet({
    hierarchy,
    sourceSha256:source.sha256,
    expectations:[{
      scopeId:'whole',
      role:'volumetric',
      sourceObservation:'Source observation is direct.',
      rationale:'The role must remain source-derived.',
      evidenceRefs:[source.path,'evidence/not-in-lineage.png'],
      ambiguity:null,
    }],
  });
  const badRef=await writeRef(root,'model/unbound-role.json',Buffer.from(`${JSON.stringify(sourceOnly,null,2)}\n`),'spatial-role-expectation');
  const replacementSpatial=await writeRef(root,'model/spatial-2.json',Buffer.from('{"spatial":2}\n'),'spatial-hypotheses');
  await assert.rejects(
    ()=>commitLocal(root,'spatial-hypotheses',[replacementSpatial,badRef]),
    /evidence is not pre-candidate lineage-bound/u,
  );
});

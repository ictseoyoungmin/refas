import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_VISIBLE_FORM_GATES,
  createConstructionExecutionProof,
  createConstructionOperationPermit,
  createConstructionQuality,
  createConstructionVocabulary,
  createLandmarkCage,
  createPermittedSubdivisionCageOrganic,
  createSubdivisionCageOrganic,
  digestBytes,
  digestJson,
  parseGlb,
  partsToGlb,
  validateConstructionExecutionProof,
  validateConstructionQuality,
  validateSubdivisionCageOrganic,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'a'.repeat(64);
const COMPARISON = 'c'.repeat(64);

const landmarkSpecs = [
  ['lm000', [-1,-1,-1], 'observed'],
  ['lm100', [ 1,-1,-1], 'observed'],
  ['lm110', [ 1, 1,-1], 'observed'],
  ['lm010', [-1, 1,-1], 'observed'],
  ['lm001', [-1,-1, 1], 'inferred'],
  ['lm101', [ 1,-1, 1], 'inferred'],
  ['lm111', [ 1, 1, 1], 'inferred'],
  ['lm011', [-1, 1, 1], 'inferred'],
];

const vertexSpecs = landmarkSpecs.map(([landmarkId], index) => ({id: `v${index}`, landmarkId}));
const faces = [
  ['v0','v1','v5','v4'],
  ['v3','v7','v6','v2'],
  ['v0','v3','v2','v1'],
  ['v4','v5','v6','v7'],
  ['v0','v4','v7','v3'],
  ['v1','v2','v6','v5'],
];
const creaseEdges = [
  ['v0','v1'],['v1','v2'],['v2','v3'],['v3','v0'],
  ['v4','v5'],['v5','v6'],['v6','v7'],['v7','v4'],
  ['v0','v4'],['v1','v5'],['v2','v6'],['v3','v7'],
];

function landmarkCage() {
  return createLandmarkCage({
    id:'head-landmarks',
    landmarks: landmarkSpecs.map(([id, point, authority]) => ({
      id, point, authority, role:'semantic-anchor', evidenceRefs:[`source/${id}.png`],
    })),
    evidenceRefs:['source/reference.png'],
  });
}

function spec({creases = creaseEdges.map((vertices) => ({vertices, weight:1})), levels = 1} = {}) {
  return {
    id:'organic-head-cage',
    landmarkCage:landmarkCage(),
    vertices:vertexSpecs,
    faces,
    creases,
    levels,
    evidenceRefs:['source/reference.png'],
    role:'organic-head',
  };
}

function organicDecision() {
  return createConstructionVocabulary({
    scopeId:'whole',
    sourceSha256:SOURCE,
    vocabulary:'organic',
    cues:[{
      id:'organic-form',
      description:'The source shows a continuous organic volume with identity-bearing curvature.',
      evidenceRefs:['source/reference.png'],
    }],
    evidenceRefs:['source/reference.png'],
  });
}

test('subdivision cage is deterministic, watertight, and preserves crease bounds', () => {
  const a=createSubdivisionCageOrganic(spec());
  const b=createSubdivisionCageOrganic(spec());
  assert.deepEqual(a.positions,b.positions);
  assert.deepEqual(a.indices,b.indices);
  assert.equal(a.subdivisionCage.cageDigest,b.subdivisionCage.cageDigest);
  assert.equal(a.analysis.watertight,true);
  assert.equal(a.analysis.windingConsistent,true);
  assert.equal(a.analysis.nonManifoldEdges,0);
  assert.deepEqual(a.analysis.bounds.min,[-1,-1,-1]);
  assert.deepEqual(a.analysis.bounds.max,[1,1,1]);
  assert.deepEqual(validateSubdivisionCageOrganic(a.subdivisionCage),{valid:true,errors:[]});

  const smooth=createSubdivisionCageOrganic(spec({creases:[]}));
  const smoothControlVertices=smooth.positions.slice(0,8);
  assert.ok(smoothControlVertices.every((point)=>point.every((value)=>Math.abs(value)<1)));
  const creasedControlVertices=a.positions.slice(0,8);
  assert.deepEqual(creasedControlVertices, landmarkSpecs.map(([,point])=>point));
});

test('subdivision cage inherits landmark provenance and rejects missing provenance or broken topology', () => {
  const mesh=createSubdivisionCageOrganic(spec());
  const provenance=new Map(mesh.subdivisionCage.provenance.map((entry)=>[entry.vertexId,entry]));
  assert.equal(provenance.get('v0').authority,'observed');
  assert.equal(provenance.get('v4').authority,'inferred');
  assert.equal(provenance.get('v0').landmarkId,'lm000');
  assert.deepEqual(provenance.get('v0').evidenceRefs,['source/lm000.png']);
  assert.equal(mesh.subdivisionCage.policy.generatedSurfaceIsEngineeredRealization,true);

  assert.throws(()=>createSubdivisionCageOrganic({...spec(),faces:faces.slice(0,-1)}),/not closed manifold/);

  const cage=landmarkCage();
  const stripped=structuredClone(cage);
  delete stripped.landmarks[0].authority;
  assert.throws(()=>createSubdivisionCageOrganic({...spec(),landmarkCage:stripped}),/authority must be observed, inferred, or engineered/);

  assert.throws(()=>createSubdivisionCageOrganic({
    ...spec(),
    vertices:vertexSpecs.map((vertex,index)=>index===0?{...vertex,point:[-0.5,-1,-1]}:vertex),
  }),/point does not match landmark/);

  const forged=structuredClone(mesh.subdivisionCage);
  forged.controlFaces=forged.controlFaces.slice(0,-1);
  const payload=structuredClone(forged);
  delete payload.cageDigest;
  forged.cageDigest=digestJson(payload);
  assert.equal(validateSubdivisionCageOrganic(forged).valid,false);

  const reorderedVertices=structuredClone(mesh.subdivisionCage);
  [reorderedVertices.controlVertices[0],reorderedVertices.controlVertices[1]]=[
    reorderedVertices.controlVertices[1],reorderedVertices.controlVertices[0],
  ];
  const reorderedVertexPayload=structuredClone(reorderedVertices);
  delete reorderedVertexPayload.cageDigest;
  reorderedVertices.cageDigest=digestJson(reorderedVertexPayload);
  assert.equal(validateSubdivisionCageOrganic(reorderedVertices).valid,false);

  const reorderedFaces=structuredClone(mesh.subdivisionCage);
  [reorderedFaces.controlFaces[0],reorderedFaces.controlFaces[1]]=[
    reorderedFaces.controlFaces[1],reorderedFaces.controlFaces[0],
  ];
  const reorderedFacePayload=structuredClone(reorderedFaces);
  delete reorderedFacePayload.cageDigest;
  reorderedFaces.cageDigest=digestJson(reorderedFacePayload);
  assert.equal(validateSubdivisionCageOrganic(reorderedFaces).valid,false);
});

test('organic permit consumes subdivision cage and binds provenance into candidate GLB', () => {
  const decision=organicDecision();
  const permit=createConstructionOperationPermit({
    decision,
    scopeId:'whole',
    operation:'subdivision-cage-organic',
  });
  const mesh=createPermittedSubdivisionCageOrganic({decision,permit,spec:spec({levels:2})});
  assert.equal(mesh.constructionAuthority.operation,'subdivision-cage-organic');
  assert.equal(mesh.analysis.watertight,true);

  const forgedMesh=structuredClone(mesh);
  forgedMesh.positions[0][0]+=0.125;
  assert.throws(()=>partsToGlb({
    assetId:'forged-subdivision-organic-fixture',
    parts:[{
      id:'head',
      mesh:forgedMesh,
      materialId:'clay',
      role:'identity-part',
      scopeId:'whole',
      constructionAuthority:forgedMesh.constructionAuthority,
    }],
    materials:{clay:{baseColor:[0.65,0.65,0.65,1],metallic:0,roughness:0.8}},
  }),/realized mesh does not match subdivision cage metadata/);

  const bytes=partsToGlb({
    assetId:'subdivision-organic-fixture',
    parts:[{
      id:'head',
      mesh,
      materialId:'clay',
      role:'identity-part',
      scopeId:'whole',
      constructionAuthority:mesh.constructionAuthority,
    }],
    materials:{clay:{baseColor:[0.65,0.65,0.65,1],metallic:0,roughness:0.8}},
  });
  const parsed=parseGlb(bytes);
  const embedded=parsed.json.meshes[0].extras?.refasSubdivisionCage;
  assert.equal(embedded.schema,'refas.subdivision-cage-organic/v1');
  assert.equal(embedded.cageDigest,mesh.subdivisionCage.cageDigest);
  assert.equal(embedded.provenance.length,8);

  const proof=createConstructionExecutionProof({
    assetBytes:bytes,
    decision,
    permits:[permit],
    evidenceRefs:['reviews/subdivision-cage.json'],
  });
  assert.equal(validateConstructionExecutionProof(proof,decision,[permit],{assetSha256:digestBytes(bytes)}).valid,true);

  const quality=createConstructionQuality({
    scopeId:'whole',
    sourceSha256:SOURCE,
    assetSha256:digestBytes(bytes),
    claim:'identity-bearing',
    constructionFamilies:['subdivision-cage-organic'],
    visibleFormGates:REQUIRED_VISIBLE_FORM_GATES.map((id)=>({
      id,status:'pass',evidenceRefs:['reviews/subdivision-cage.json'],summary:'subdivision cage fixture evidence',
    })),
    identityFeatures:[{
      id:'organic-form',scopeId:'whole',kind:'reference-specific-form',evidenceRefs:['source/reference.png'],
    }],
    wholeDependency:{scopeId:'whole',status:'pass',evidenceRefs:['reviews/whole.png']},
    registeredComparison:{path:'reviews/subdivision-cage.json',sha256:COMPARISON,scopeIds:['whole']},
    constructionVocabulary:decision,
    constructionPermits:[permit],
    constructionExecutionProof:proof,
    ambiguities:[],
  });
  assert.deepEqual(validateConstructionQuality(quality),{valid:true,errors:[]});

  const hard=createConstructionVocabulary({
    scopeId:'whole',sourceSha256:SOURCE,vocabulary:'hard-surface',
    cues:[{id:'rigid',description:'Rigid shell.',evidenceRefs:['source/reference.png']}],
    evidenceRefs:['source/reference.png'],
  });
  assert.throws(()=>createConstructionOperationPermit({
    decision:hard,scopeId:'whole',operation:'subdivision-cage-organic',
  }),/incompatible with vocabulary hard-surface/);
});

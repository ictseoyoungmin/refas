import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  createCandidateLineageProof,
  createCandidateTransition,
  createCertificationPolicy,
  createDefaultWholeObjectCertificationPolicy,
  createFinalResemblanceClosure,
  createPbrRenderReport,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  createVisualHierarchy,
  validateCandidateLineageProof,
  validateCandidateTransition,
  validateFinalResemblanceClosure,
  validateWholeObjectPolicyAuthority,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (ch) => ch.repeat(64);
const SOURCE = D('a');
const SHAPE = D('b');
const SURFACE = D('c');
const FINAL = D('d');

const HIERARCHY = createVisualHierarchy({
  source:{path:'source/reference.png',sha256:SOURCE,width:1024,height:1024},
  nodes:[
    {id:'whole',label:'Whole',level:'whole',parentId:null,roi:[0,0,1,1]},
    {id:'detail',label:'Detail',level:'region',parentId:'whole',roi:[0.1,0.1,0.5,0.5]},
  ],
});

function signatures() {
  return createPerceptualSignatureSet({
    hierarchy:HIERARCHY,
    scopeId:'whole',
    sourceSha256:SOURCE,
    signatures:[
      {
        id:'outer-character',scopeId:'whole',family:'silhouette-character',importance:'macro',
        sourceObservation:'The source whole silhouette has a compact stepped outer character.',
        evidenceRefs:['source/reference.png'],
      },
      {
        id:'plane-language',scopeId:'whole',family:'plane-edge-language',importance:'identity',
        sourceObservation:'The source identity depends on explicit planar breaks and hard inflections.',
        evidenceRefs:['source/reference.png'],
      },
      {
        id:'fine-seam',scopeId:'detail',family:'surface-pattern-structure',importance:'detail',
        sourceObservation:'A fine seam subdivides the local detail region.',
        evidenceRefs:['source/reference.png'],
      },
    ],
    evidenceRefs:['source/reference.png'],
  });
}

function clayReport(assetSha256 = FINAL) {
  return createPbrRenderReport({
    assetSha256,
    frameDigest:D('e'),
    renderer:{family:'other',name:'RefAs Independent PBR',version:'1.0.0',backend:'numpy-cook-torrance-headless',independentProcess:true},
    lighting:{rigId:NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,digest:NEUTRAL_CLAY_LIGHTING_RIG_DIGEST},
    colorPipeline:{...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport:{supported:['base-color-factor','metallic-factor','roughness-factor'],unsupported:['textures']},
    outputs:NEUTRAL_CLAY_REQUIRED_VIEW_IDS.map((viewId,index)=>({
      viewId,path:`renders/final-clay/${viewId}.png`,sha256:D(String((index%8)+1)),
    })),
    reproducibility:{mode:'deterministic',tolerance:''},
    presentation:{mode:'neutral-clay',presetId:NEUTRAL_CLAY_PRESENTATION_PRESET.id,presetDigest:NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST},
  });
}

function finalEvidence({assetSha256 = FINAL, requiredStatus = 'match', detailStatus = 'mismatch'} = {}) {
  const set=signatures();
  const hero='renders/final-clay/hero.png';
  return createPerceptualSignatureEvidence({
    signatureSet:set,
    assetSha256,
    observations:set.signatures.map((signature)=>({
      signatureId:signature.id,
      status:signature.importance==='detail'?detailStatus:requiredStatus,
      candidateObservation:`Final candidate observation for ${signature.id}.`,
      comparisonConclusion:`Final source/candidate comparison for ${signature.id}.`,
      evidenceRefs:['source/reference.png',hero],
    })),
    evidenceRefs:['source/reference.png',hero],
  });
}

function closure(options = {}) {
  const evidence=options.signatureEvidence ?? finalEvidence(options);
  return createFinalResemblanceClosure({
    sourceSha256:options.sourceSha256 ?? SOURCE,
    hierarchyDigest:options.hierarchyDigest ?? HIERARCHY.hierarchyDigest,
    assetSha256:options.assetSha256 ?? FINAL,
    signatureEvidence:evidence,
    clayRenderReport:options.clayRenderReport ?? clayReport(options.assetSha256 ?? FINAL),
    evidenceRefs:['source/reference.png','renders/final-clay/hero.png'],
  });
}

test('candidate transition rejects same-digest and non-mutation substitutions', () => {
  const transition=createCandidateTransition({
    inputAssetSha256:SHAPE,
    outputAssetSha256:SURFACE,
    inputCandidateCheckpointId:'cp_shape',
    parentCheckpointId:'cp_shape',
    capability:'surface-topology',
    scopeId:'whole',
    evidenceRefs:['model/candidate-surface.glb'],
  });
  assert.equal(validateCandidateTransition(transition).valid,true);
  assert.throws(()=>createCandidateTransition({
    inputAssetSha256:SHAPE,outputAssetSha256:SHAPE,inputCandidateCheckpointId:'cp_shape',parentCheckpointId:'cp_shape',
    capability:'surface-topology',scopeId:'whole',evidenceRefs:['model/candidate.glb'],
  }),/same-digest/);
  assert.throws(()=>createCandidateTransition({
    inputAssetSha256:SHAPE,outputAssetSha256:SURFACE,inputCandidateCheckpointId:'cp_shape',parentCheckpointId:'cp_shape',
    capability:'rendering',scopeId:'whole',evidenceRefs:['model/candidate.glb'],
  }),/not authorized/);
});

test('candidate lineage resolves one unique final candidate across ordered mutations', () => {
  const surface=createCandidateTransition({
    inputAssetSha256:SHAPE,outputAssetSha256:SURFACE,inputCandidateCheckpointId:'cp_shape',parentCheckpointId:'cp_shape',
    capability:'surface-topology',scopeId:'whole',evidenceRefs:['model/candidate-surface.glb'],
  });
  const appearance=createCandidateTransition({
    inputAssetSha256:SURFACE,outputAssetSha256:FINAL,inputCandidateCheckpointId:'cp_surface',parentCheckpointId:'cp_render_parent',
    capability:'appearance',scopeId:'whole',evidenceRefs:['model/candidate-final.glb'],
  });
  const proof=createCandidateLineageProof({
    sourceSha256:SOURCE,
    initialCandidate:{assetSha256:SHAPE,checkpointId:'cp_shape'},
    finalCandidate:{assetSha256:FINAL,checkpointId:'cp_appearance'},
    transitions:[
      {checkpointId:'cp_surface',transitionDigest:surface.transitionDigest,capability:surface.capability,scopeId:surface.scopeId,inputAssetSha256:SHAPE,outputAssetSha256:SURFACE},
      {checkpointId:'cp_appearance',transitionDigest:appearance.transitionDigest,capability:appearance.capability,scopeId:appearance.scopeId,inputAssetSha256:SURFACE,outputAssetSha256:FINAL},
    ],
  });
  assert.equal(validateCandidateLineageProof(proof,{sourceSha256:SOURCE,finalAssetSha256:FINAL}).valid,true);
  assert.equal(validateCandidateLineageProof(proof,{finalAssetSha256:SHAPE}).valid,false);
  assert.throws(()=>createCandidateLineageProof({
    sourceSha256:SOURCE,
    initialCandidate:{assetSha256:SHAPE,checkpointId:'cp_shape'},
    finalCandidate:{assetSha256:FINAL,checkpointId:'cp_appearance'},
    transitions:[{checkpointId:'cp_surface',transitionDigest:surface.transitionDigest,capability:surface.capability,scopeId:surface.scopeId,inputAssetSha256:D('f'),outputAssetSha256:SURFACE}],
  }),/does not continue the chain/);
});

test('final resemblance closure requires all macro and identity signatures on the exact final candidate', () => {
  const value=closure();
  assert.equal(validateFinalResemblanceClosure(value,{
    sourceSha256:SOURCE,hierarchyDigest:HIERARCHY.hierarchyDigest,assetSha256:FINAL,
  }).valid,true);
  assert.deepEqual(value.requiredSignatureIds,['outer-character','plane-language']);
  assert.deepEqual(value.detailSignatureIds,['fine-seam']);
  assert.equal(value.policy.detailSignaturesDoNotBlockFinalFormIdentity,true);

  assert.throws(()=>closure({requiredStatus:'mismatch'}),/requires every macro and identity signature to match/);
  assert.throws(()=>closure({requiredStatus:'insufficient'}),/requires every macro and identity signature to match/);
});

test('final resemblance closure fails closed on source hierarchy candidate and earlier-candidate replay', () => {
  const value=closure();
  assert.equal(validateFinalResemblanceClosure(value,{sourceSha256:D('f')}).valid,false);
  assert.equal(validateFinalResemblanceClosure(value,{hierarchyDigest:D('f')}).valid,false);
  assert.equal(validateFinalResemblanceClosure(value,{assetSha256:SHAPE}).valid,false);

  const earlierEvidence=finalEvidence({assetSha256:SHAPE});
  assert.throws(()=>closure({
    assetSha256:FINAL,
    signatureEvidence:earlierEvidence,
    clayRenderReport:clayReport(FINAL),
  }),/signatureEvidence is invalid|candidate binding mismatch/);
});

test('real-source visual-source-fidelity policy cannot drop final candidate authority', () => {
  const floor=createDefaultWholeObjectCertificationPolicy();
  const visual=floor.claims.find((claim)=>claim.id==='visual-source-fidelity');
  const roles=visual.obligations.map((item)=>item.role);
  assert.ok(roles.includes('candidate-lineage-proof'));
  assert.ok(roles.includes('final-resemblance-closure'));

  const attacked=createCertificationPolicy({
    id:'drop-final-resemblance',
    claims:floor.claims.map((claim)=>claim.id!=='visual-source-fidelity'?claim:{
      ...claim,
      obligations:claim.obligations.filter((item)=>item.role!=='final-resemblance-closure'),
    }),
  });
  const authority=validateWholeObjectPolicyAuthority(attacked);
  assert.equal(authority.valid,false);
  assert.match(authority.errors.join('\n'),/final-resemblance-closure/);

  const fixture=createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const fixtureRoles=fixture.claims.find((claim)=>claim.id==='visual-source-fidelity').obligations.map((item)=>item.role);
  assert.equal(fixtureRoles.includes('candidate-lineage-proof'),false);
  assert.equal(fixtureRoles.includes('final-resemblance-closure'),false);
});

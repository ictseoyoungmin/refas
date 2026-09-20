import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
  NEUTRAL_CLAY_PRESENTATION_PRESET,
  NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
  NEUTRAL_CLAY_REQUIRED_VIEW_IDS,
  createEarlyResemblanceBarrier,
  createPbrRenderReport,
  createPerceptualSignatureEvidence,
  createPerceptualSignatureSet,
  createVisualHierarchy,
  validateEarlyResemblanceBarrier,
  validatePbrRenderReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (ch) => ch.repeat(64);
const SOURCE = D('a');
const ASSET = D('b');
const FRAME = D('c');

const HIERARCHY = createVisualHierarchy({
  source: {path: 'source/reference.png', sha256: SOURCE, width: 1024, height: 1024},
  nodes: [
    {id: 'whole', label: 'Whole', level: 'whole', parentId: null, roi: [0, 0, 1, 1]},
    {id: 'primary-region', label: 'Primary region', level: 'region', parentId: 'whole', roi: [0.1, 0.1, 0.8, 0.8]},
  ],
});

function sourceSignatures({ambiguousIdentity = false} = {}) {
  return createPerceptualSignatureSet({
    hierarchy: HIERARCHY,
    scopeId: 'whole',
    sourceSha256: SOURCE,
    signatures: [
      {
        id: ambiguousIdentity ? 'negative-space' : 'silhouette',
        scopeId: 'whole',
        family: ambiguousIdentity ? 'negative-space-structure' : 'silhouette-character',
        importance: 'macro',
        sourceObservation: ambiguousIdentity
          ? 'A source-specific open void separates the dominant masses.'
          : 'The source has a compact stepped outer silhouette with a narrow upper mass.',
        evidenceRefs: ['source/reference.png'],
      },
      {
        id: 'plane-language',
        scopeId: 'whole',
        family: 'plane-edge-language',
        importance: 'identity',
        sourceObservation: 'The source uses explicit plane breaks and hard inflections rather than one smooth shell.',
        evidenceRefs: ['source/reference.png'],
      },
      {
        id: 'surface-seam',
        scopeId: 'primary-region',
        family: 'surface-pattern-structure',
        importance: 'detail',
        sourceObservation: 'A fine seam subdivides the primary region.',
        evidenceRefs: ['source/reference.png'],
      },
    ],
    evidenceRefs: ['source/reference.png'],
  });
}

function signatureEvidence(statuses = {}, {ambiguousIdentity = false, assetSha256 = ASSET} = {}) {
  const set = sourceSignatures({ambiguousIdentity});
  return createPerceptualSignatureEvidence({
    signatureSet: set,
    assetSha256,
    observations: set.signatures.map((signature) => ({
      signatureId: signature.id,
      status: statuses[signature.id] ?? 'match',
      candidateObservation: `Candidate observation for ${signature.id}.`,
      comparisonConclusion: `Comparison conclusion for ${signature.id}.`,
      evidenceRefs: ['source/reference.png', 'renders/clay/hero.png'],
    })),
    evidenceRefs: ['source/reference.png', 'renders/clay/review-board.png'],
  });
}

function clayReport(assetSha256 = ASSET) {
  return createPbrRenderReport({
    assetSha256,
    frameDigest: FRAME,
    renderer: {
      family: 'other',
      name: 'RefAs Independent PBR',
      version: '1.0.0',
      backend: 'numpy-cook-torrance-headless',
      independentProcess: true,
    },
    lighting: {
      rigId: NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId,
      digest: NEUTRAL_CLAY_LIGHTING_RIG_DIGEST,
    },
    colorPipeline: {...NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline},
    materialSupport: {
      supported: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
      unsupported: ['textures'],
    },
    outputs: NEUTRAL_CLAY_REQUIRED_VIEW_IDS.map((viewId, index) => ({
      viewId,
      path: `renders/clay/${viewId}.png`,
      sha256: D(String((index % 8) + 1)),
    })),
    reproducibility: {mode: 'deterministic', tolerance: ''},
    presentation: {
      mode: 'neutral-clay',
      presetId: NEUTRAL_CLAY_PRESENTATION_PRESET.id,
      presetDigest: NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST,
    },
  });
}

function barrierFor(evidence, report = clayReport()) {
  return createEarlyResemblanceBarrier({
    sourceSha256: SOURCE,
    hierarchyDigest: HIERARCHY.hierarchyDigest,
    assetSha256: ASSET,
    signatureEvidence: evidence,
    clayRenderReport: report,
    evidenceRefs: ['source/reference.png', 'renders/clay/review-board.png'],
  });
}

test('R04 keeps native PBR reports backward compatible and validates canonical neutral clay', () => {
  const native = createPbrRenderReport({
    assetSha256: ASSET,
    frameDigest: FRAME,
    renderer: {family: 'other', name: 'External', version: '1', backend: 'fixture', independentProcess: true},
    lighting: {rigId: 'native-review-rig', digest: D('d')},
    colorPipeline: {exposure: 0, toneMapping: 'Reinhard', outputColorSpace: 'sRGB'},
    materialSupport: {supported: ['base-color-factor'], unsupported: []},
    outputs: [{viewId: 'hero', path: 'renders/hero.png', sha256: D('e')}],
    reproducibility: {mode: 'deterministic', tolerance: ''},
  });
  assert.equal(native.presentation, undefined);
  assert.equal(native.claimScope, 'visual-fidelity');
  assert.equal(validatePbrRenderReport(native).valid, true);

  const clay = clayReport();
  assert.equal(validatePbrRenderReport(clay).valid, true);
  assert.equal(clay.claimScope, 'shape-resemblance-only');
  assert.equal(clay.presentation.mode, 'neutral-clay');
  assert.equal(clay.presentation.presetDigest, NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST);

  assert.throws(() => createPbrRenderReport({
    ...clay,
    presentation: {...clay.presentation, presetDigest: D('f')},
  }), /preset digest mismatch/);

  assert.throws(() => createPbrRenderReport({
    ...clay,
    renderer: {...clay.renderer, name: 'Arbitrary Clay Renderer'},
  }), /neutral-clay renderer profile is not canonical/);
});

test('R04 all macro and identity signatures match -> PROCEED while detail mismatch remains non-blocking', () => {
  const evidence = signatureEvidence({'surface-seam': 'mismatch'});
  const barrier = barrierFor(evidence);
  assert.equal(barrier.verdict, 'PROCEED');
  assert.deepEqual(barrier.blockingSignatureIds, []);
  assert.deepEqual(barrier.detailSignatureIds, ['surface-seam']);
  assert.equal(barrier.policy.proceedOnlyAuthorizesDownstreamDetail, true);
  assert.equal(barrier.policy.proceedDoesNotPassVisualReview, true);
  assert.equal(barrier.policy.proceedDoesNotCertify, true);
  assert.equal('score' in barrier, false);
  assert.equal(validateEarlyResemblanceBarrier(barrier, {
    sourceSha256: SOURCE,
    hierarchyDigest: HIERARCHY.hierarchyDigest,
    assetSha256: ASSET,
  }).valid, true);

  const tamperedBarrier = structuredClone(barrier);
  tamperedBarrier.verdict = 'REWORK';
  assert.equal(validateEarlyResemblanceBarrier(tamperedBarrier).valid, false);
});

test('R04 required mismatch -> REWORK and preserves typed finding authority', () => {
  const evidence = signatureEvidence({silhouette: 'mismatch'});
  const barrier = barrierFor(evidence);
  assert.equal(barrier.verdict, 'REWORK');
  assert.deepEqual(barrier.blockingSignatureIds, ['silhouette']);
  assert.equal(barrier.findings.length, 1);
  assert.equal(barrier.findings[0].category, 'silhouette-mismatch');
  assert.equal(barrier.findings[0].ownerCapability, 'shape-reconstruction');
});

test('R04 ambiguous required mismatch remains routed to visual critique', () => {
  const evidence = signatureEvidence({'negative-space': 'mismatch'}, {ambiguousIdentity: true});
  const barrier = barrierFor(evidence);
  assert.equal(barrier.verdict, 'REWORK');
  assert.equal(barrier.findings[0].category, 'unroutable-visual-finding');
  assert.equal(barrier.findings[0].ownerCapability, 'visual-critique');
});

test('R04 required insufficient -> HOLD without fabricating repair ownership', () => {
  const evidence = signatureEvidence({'plane-language': 'insufficient'});
  const barrier = barrierFor(evidence);
  assert.equal(barrier.verdict, 'HOLD');
  assert.deepEqual(barrier.blockingSignatureIds, ['plane-language']);
  assert.deepEqual(barrier.findings, []);
  assert.equal(barrier.policy.holdDoesNotInventRepairOwner, true);
});

test('R04 fails closed on native presentation and source/hierarchy/candidate drift', () => {
  const evidence = signatureEvidence();
  const native = createPbrRenderReport({
    assetSha256: ASSET,
    frameDigest: FRAME,
    renderer: {family: 'other', name: 'External', version: '1', backend: 'fixture', independentProcess: true},
    lighting: {rigId: 'native-review-rig', digest: D('d')},
    colorPipeline: {exposure: 0, toneMapping: 'Reinhard', outputColorSpace: 'sRGB'},
    materialSupport: {supported: ['base-color-factor'], unsupported: []},
    outputs: [{viewId: 'hero', path: 'renders/hero.png', sha256: D('e')}],
    reproducibility: {mode: 'deterministic', tolerance: ''},
  });
  assert.throws(() => barrierFor(evidence, native), /requires a neutral-clay render report/);
  assert.throws(() => barrierFor(evidence, clayReport(D('d'))), /different candidate/);

  const barrier = barrierFor(evidence);
  assert.equal(validateEarlyResemblanceBarrier(barrier, {sourceSha256: D('d')}).valid, false);
  assert.equal(validateEarlyResemblanceBarrier(barrier, {hierarchyDigest: D('e')}).valid, false);
  assert.equal(validateEarlyResemblanceBarrier(barrier, {assetSha256: D('f')}).valid, false);
});


test('R04 required signatures must cite an exact neutral-clay output', () => {
  const set = sourceSignatures();
  const evidence = createPerceptualSignatureEvidence({
    signatureSet: set,
    assetSha256: ASSET,
    observations: set.signatures.map((signature) => ({
      signatureId: signature.id,
      status: 'match',
      candidateObservation: `Candidate observation for ${signature.id}.`,
      comparisonConclusion: `Comparison conclusion for ${signature.id}.`,
      evidenceRefs: signature.importance === 'detail'
        ? ['source/reference.png']
        : ['source/reference.png'],
    })),
    evidenceRefs: ['source/reference.png'],
  });
  assert.throws(
    () => barrierFor(evidence),
    /required perceptual signature .* must cite at least one exact neutral-clay render output/,
  );
});

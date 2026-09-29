import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_VISIBLE_FORM_GATES,
  attestExternalConstruction,
  createConstructionExecutionProof,
  createConstructionOperationPermit,
  createConstructionQuality,
  createConstructionVocabulary,
  createExternalConstructionReceipt,
  createHardSurfaceShell,
  digestBytes,
  partsToGlb,
  validateConstructionExecutionProof,
  validateConstructionQuality,
  validateExternalConstructionReceipt,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_BYTES = Buffer.from('external construction primary source bytes');
const GUIDE_BYTES = Buffer.from('external construction guide bytes');
const SCRIPT_BYTES = Buffer.from('print("deterministic external construction")\n');
const SOURCE = digestBytes(SOURCE_BYTES);
const GUIDE = digestBytes(GUIDE_BYTES);
const SCRIPT = digestBytes(SCRIPT_BYTES);
const COMPARISON = 'c'.repeat(64);

function decisionFixture(vocabulary = 'hard-surface') {
  return createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary,
    cues: [{
      id: 'source-form',
      description: 'The source supports a resolved identity-bearing construction vocabulary.',
      evidenceRefs: ['source/reference.png'],
    }],
    evidenceRefs: ['source/reference.png'],
  });
}

function rawExternalGlb(thickness = 0.1) {
  const mesh = createHardSurfaceShell({
    schema: 'refas.hard-surface-spec/v1',
    outerProfile: [[0, 0], [1, 0], [1, 1], [0, 1]],
    cutouts: [],
    thickness,
    edgeTreatments: {outer: {type: 'sharp'}},
    role: 'external-fixture',
  });
  return partsToGlb({
    assetId: `external-fixture-${String(thickness).replace('.', '-')}`,
    parts: [{id: 'external-part', mesh, materialId: 'fixture', scopeId: 'whole'}],
    materials: {fixture: {baseColor: [0.7, 0.7, 0.7, 1], metallic: 0, roughness: 0.5}},
  });
}

function receiptFixture(decision, permit, outputBytes) {
  return createExternalConstructionReceipt({
    decision,
    permit,
    tool: {id: 'headless-modeler', version: '1.0.0'},
    scriptSha256: SCRIPT,
    inputs: [
      {id: 'primary-source', kind: 'source', authority: 'observed', sha256: SOURCE},
      {id: 'shape-guide', kind: 'guide', authority: 'inferred', sha256: GUIDE},
    ],
    determinism: {mode: 'byte-exact'},
    outputGlbSha256: digestBytes(outputBytes),
    evidenceRefs: ['evidence/external-run.json'],
  });
}

function qualityInput(decision, permit, attested) {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE,
    assetSha256: digestBytes(attested.assetBytes),
    claim: 'identity-bearing',
    constructionFamilies: ['external-construction'],
    visibleFormGates: REQUIRED_VISIBLE_FORM_GATES.map((id) => ({
      id,
      status: 'pass',
      evidenceRefs: ['reviews/current.json'],
      summary: 'external construction test evidence',
    })),
    identityFeatures: [{
      id: 'reference-form',
      scopeId: 'whole',
      kind: 'reference-specific-form',
      evidenceRefs: ['source/reference.png'],
    }],
    wholeDependency: {scopeId: 'whole', status: 'pass', evidenceRefs: ['reviews/whole.png']},
    registeredComparison: {path: 'reviews/current.json', sha256: COMPARISON, scopeIds: ['whole']},
    constructionVocabulary: decision,
    constructionPermits: [permit],
    constructionExecutionProof: attested.proof,
    ambiguities: [],
  };
}

test('external construction closes identity only after exact receipt-bound replay', () => {
  const decision = decisionFixture();
  const permit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'external-construction',
  });
  const raw = rawExternalGlb();
  const receipt = receiptFixture(decision, permit, raw);
  assert.equal(validateExternalConstructionReceipt(receipt, decision, permit).valid, true);

  const attested = attestExternalConstruction({
    decision,
    permit,
    receipt,
    scriptBytes: SCRIPT_BYTES,
    inputBytes: {'primary-source': SOURCE_BYTES, 'shape-guide': GUIDE_BYTES},
    outputBytes: raw,
    reexecutedBytes: raw,
    evidenceRefs: ['evidence/reexecution.json'],
  });

  assert.equal(validateConstructionExecutionProof(
    attested.proof,
    decision,
    [permit],
    {assetSha256: digestBytes(attested.assetBytes)},
  ).valid, true);
  assert.equal(attested.proof.executions[0].externalReceiptDigest, receipt.receiptDigest);
  assert.equal(attested.proof.executions[0].geometrySha256, receipt.outputGlbSha256);

  const quality = createConstructionQuality(qualityInput(decision, permit, attested));
  assert.equal(validateConstructionQuality(quality).valid, true);
});

test('external construction fails closed for missing receipt, altered script/input, replay drift, and receipt replay', () => {
  const decision = decisionFixture();
  const permit = createConstructionOperationPermit({decision, scopeId: 'whole', operation: 'external-construction'});
  const raw = rawExternalGlb();
  const other = rawExternalGlb(0.2);
  const receipt = receiptFixture(decision, permit, raw);
  const inputs = {'primary-source': SOURCE_BYTES, 'shape-guide': GUIDE_BYTES};

  assert.throws(() => attestExternalConstruction({
    decision, permit, receipt,
    scriptBytes: Buffer.from('changed script'),
    inputBytes: inputs,
    outputBytes: raw,
    reexecutedBytes: raw,
  }), /script bytes do not match/);

  assert.throws(() => attestExternalConstruction({
    decision, permit, receipt,
    scriptBytes: SCRIPT_BYTES,
    inputBytes: {...inputs, 'shape-guide': Buffer.from('changed guide')},
    outputBytes: raw,
    reexecutedBytes: raw,
  }), /input bytes do not match/);

  assert.throws(() => attestExternalConstruction({
    decision, permit, receipt,
    scriptBytes: SCRIPT_BYTES,
    inputBytes: inputs,
    outputBytes: raw,
    reexecutedBytes: other,
  }), /reexecution is not byte-exact/);

  assert.throws(() => attestExternalConstruction({
    decision, permit, receipt,
    scriptBytes: SCRIPT_BYTES,
    inputBytes: inputs,
    outputBytes: other,
    reexecutedBytes: other,
  }), /receipt output mismatch/);

  const attested = attestExternalConstruction({
    decision, permit, receipt,
    scriptBytes: SCRIPT_BYTES,
    inputBytes: inputs,
    outputBytes: raw,
    reexecutedBytes: raw,
  });
  assert.throws(() => createConstructionExecutionProof({
    assetBytes: attested.assetBytes,
    decision,
    permits: [permit],
    evidenceRefs: ['evidence/reexecution.json'],
  }), /requires a verified receipt/);
});

test('external construction preserves source/prior authority boundaries and composite whole rules', () => {
  const decision = decisionFixture('organic');
  const permit = createConstructionOperationPermit({decision, scopeId: 'whole', operation: 'external-construction'});
  const raw = rawExternalGlb();
  assert.throws(() => createExternalConstructionReceipt({
    decision,
    permit,
    tool: {id: 'headless-modeler', version: '1.0.0'},
    scriptSha256: SCRIPT,
    inputs: [
      {id: 'primary-source', kind: 'source', authority: 'observed', sha256: SOURCE},
      {id: 'generated-prior', kind: 'prior', authority: 'observed', sha256: GUIDE},
    ],
    outputGlbSha256: digestBytes(raw),
    evidenceRefs: ['evidence/external-run.json'],
  }), /prior cannot claim observed authority/);

  const left = createConstructionVocabulary({
    scopeId: 'left-link',
    sourceSha256: SOURCE,
    vocabulary: 'hard-surface',
    cues: [{id: 'left-cue', description: 'Rigid left link.', evidenceRefs: ['source/reference.png']}],
    evidenceRefs: ['source/reference.png'],
  });
  const right = createConstructionVocabulary({
    scopeId: 'right-link',
    sourceSha256: SOURCE,
    vocabulary: 'hard-surface',
    cues: [{id: 'right-cue', description: 'Rigid right link.', evidenceRefs: ['source/reference.png']}],
    evidenceRefs: ['source/reference.png'],
  });
  const mechanical = createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary: 'mechanical-articulated',
    cues: [{id: 'mechanical-cue', description: 'Observed articulated assembly.', evidenceRefs: ['source/reference.png']}],
    evidenceRefs: ['source/reference.png'],
    identityScopes: ['left-link', 'right-link'],
    childDecisions: [left, right],
    mechanicalDecomposition: {
      partIds: ['left-link', 'right-link'],
      interfaceIds: ['center-joint'],
      articulationIds: ['center-axis'],
      evidenceRefs: ['source/reference.png'],
    },
  });
  assert.throws(() => createConstructionOperationPermit({
    decision: mechanical,
    scopeId: 'whole',
    operation: 'external-construction',
  }), /whole scope cannot authorize one undifferentiated identity geometry operation/);
  assert.doesNotThrow(() => createConstructionOperationPermit({
    decision: mechanical,
    scopeId: 'left-link',
    operation: 'external-construction',
  }));
});

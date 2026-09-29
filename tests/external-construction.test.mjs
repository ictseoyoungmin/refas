import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConstructionExecutionProof,
  createConstructionOperationPermit,
  createConstructionVocabulary,
  createExternalConstructionReceipt,
  createHardSurfaceShell,
  digestBytes,
  digestJson,
  partsToGlb,
  validateExternalConstructionReceipt,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE_BYTES = Buffer.from('external construction primary source bytes');
const GUIDE_BYTES = Buffer.from('external construction guide bytes');
const SOURCE = digestBytes(SOURCE_BYTES);
const GUIDE = digestBytes(GUIDE_BYTES);
const SCRIPT = digestBytes(Buffer.from('deterministic external construction program'));

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

test('external receipt is exact-source/output bound but has no authority by itself', () => {
  const decision = decisionFixture();
  const permit = createConstructionOperationPermit({decision, scopeId: 'whole', operation: 'external-construction'});
  const raw = rawExternalGlb();
  const other = rawExternalGlb(0.2);
  const receipt = receiptFixture(decision, permit, raw);

  assert.deepEqual(validateExternalConstructionReceipt(receipt, decision, permit), {valid: true, errors: []});
  assert.equal(validateExternalConstructionReceipt(receipt, decision, permit, {outputGlbSha256: digestBytes(other)}).valid, false);

  assert.throws(() => createConstructionExecutionProof({
    assetBytes: raw,
    decision,
    permits: [permit],
    externalReceipts: [receipt],
    evidenceRefs: ['evidence/external-run.json'],
  }), /carries no permit-bound construction executions/);

  assert.throws(() => createConstructionExecutionProof({
    assetBytes: raw,
    decision,
    permits: [permit],
    evidenceRefs: ['evidence/external-run.json'],
  }), /requires a verified receipt/);

  const tampered = structuredClone(receipt);
  tampered.policy.receiptCannotAuthorizeWithoutProof = false;
  const payload = structuredClone(tampered);
  delete payload.receiptDigest;
  tampered.receiptDigest = digestJson(payload);
  assert.equal(validateExternalConstructionReceipt(tampered, decision, permit).valid, false);
});

test('external receipt preserves source/prior authority boundaries', () => {
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

  assert.throws(() => createExternalConstructionReceipt({
    decision,
    permit,
    tool: {id: 'headless-modeler', version: '1.0.0'},
    scriptSha256: SCRIPT,
    inputs: [
      {id: 'wrong-source', kind: 'source', authority: 'observed', sha256: 'f'.repeat(64)},
      {id: 'shape-guide', kind: 'guide', authority: 'inferred', sha256: GUIDE},
    ],
    outputGlbSha256: digestBytes(raw),
    evidenceRefs: ['evidence/external-run.json'],
  }), /observed source input bound to the permit source/);
});

test('external construction preserves composite whole decomposition rules', () => {
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

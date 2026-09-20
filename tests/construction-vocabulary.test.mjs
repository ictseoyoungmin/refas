import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_VISIBLE_FORM_GATES,
  createConstructionOperationPermit,
  createConstructionQuality,
  createConstructionVocabulary,
  validateConstructionOperationPermit,
  validateConstructionQuality,
  validateConstructionVocabulary,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (ch) => ch.repeat(64);
const SOURCE = D('a');
const ASSET = D('b');
const COMPARISON = D('c');

function cue(id = 'source-cue') {
  return {
    id,
    description: 'Source-grounded form evidence supports the selected construction vocabulary.',
    evidenceRefs: ['evidence/reference.png'],
  };
}

function leaf(scopeId, vocabulary, sourceSha256 = SOURCE) {
  return createConstructionVocabulary({
    scopeId,
    sourceSha256,
    vocabulary,
    cues: [cue(`${scopeId}-cue`)],
    contraryCues: [],
    ambiguities: [],
    evidenceRefs: ['evidence/reference.png'],
  });
}

function qualityInput({
  claim = 'identity-bearing',
  families = ['hard-surface-shell'],
  vocabulary = null,
  permits = [],
} = {}) {
  return {
    scopeId: 'whole',
    sourceSha256: SOURCE,
    assetSha256: ASSET,
    claim,
    constructionFamilies: families,
    visibleFormGates: REQUIRED_VISIBLE_FORM_GATES.map((id) => ({
      id,
      status: claim === 'identity-bearing' ? 'pass' : 'insufficient',
      evidenceRefs: ['reviews/current.json'],
      summary: 'R02 regression evidence',
    })),
    identityFeatures: claim === 'identity-bearing' ? [{
      id: 'identity-form',
      scopeId: 'whole',
      kind: 'reference-specific-form',
      evidenceRefs: ['evidence/reference.png'],
    }] : [],
    wholeDependency: {
      scopeId: 'whole',
      status: claim === 'identity-bearing' ? 'pass' : 'insufficient',
      evidenceRefs: ['reviews/whole.png'],
    },
    registeredComparison: {
      path: 'reviews/current.json',
      sha256: COMPARISON,
      scopeIds: ['whole'],
    },
    constructionVocabulary: vocabulary,
    constructionPermits: permits,
    ambiguities: [],
  };
}

test('R02 hard-surface vocabulary authorizes only compatible identity-bearing construction', () => {
  const decision = leaf('whole', 'hard-surface');
  assert.equal(validateConstructionVocabulary(decision).valid, true);

  const permit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  });
  assert.equal(validateConstructionOperationPermit(permit, decision).valid, true);

  const quality = createConstructionQuality(qualityInput({
    vocabulary: decision,
    permits: [permit],
  }));
  assert.equal(validateConstructionQuality(quality).valid, true);

  assert.throws(() => createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'section-profile-loft-organic',
  }), /incompatible with vocabulary hard-surface/);
});

test('R02 organic vocabulary rejects hard-surface identity operations', () => {
  const decision = leaf('whole', 'organic');
  assert.throws(() => createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  }), /incompatible with vocabulary organic/);

  const permit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'section-profile-loft-organic',
  });
  const quality = createConstructionQuality(qualityInput({
    families: ['section-profile-loft-organic'],
    vocabulary: decision,
    permits: [permit],
  }));
  assert.equal(validateConstructionQuality(quality).valid, true);
});

test('R02 unresolved remains blockout-only', () => {
  const unresolved = createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary: 'unresolved',
    cues: [],
    contraryCues: [],
    ambiguities: ['The source does not yet separate rigid shell from soft continuous form.'],
    evidenceRefs: ['evidence/reference.png'],
  });

  assert.throws(() => createConstructionOperationPermit({
    decision: unresolved,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  }), /unresolved construction vocabulary/);

  assert.throws(() => createConstructionQuality(qualityInput({
    vocabulary: unresolved,
  })), /unresolved construction vocabulary is blockout-only/);

  const blockout = createConstructionQuality(qualityInput({
    claim: 'blockout',
    families: ['generic-primitive'],
    vocabulary: null,
    permits: [],
  }));
  assert.equal(validateConstructionQuality(blockout).valid, true);
});

test('R02 mechanical-articulated whole requires decomposition plus child permits', () => {
  const left = leaf('left-link', 'hard-surface');
  const right = leaf('right-link', 'hard-surface');
  const decision = createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary: 'mechanical-articulated',
    cues: [cue('articulation-cue')],
    evidenceRefs: ['evidence/reference.png'],
    identityScopes: ['left-link', 'right-link'],
    childDecisions: [left, right],
    mechanicalDecomposition: {
      partIds: ['left-link', 'right-link'],
      interfaceIds: ['center-joint'],
      articulationIds: ['center-axis'],
      evidenceRefs: ['evidence/reference.png'],
    },
  });

  assert.throws(() => createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  }), /whole scope cannot authorize one undifferentiated identity geometry operation/);

  const assemblyPermit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'assembly-decomposition',
  });
  const leftPermit = createConstructionOperationPermit({
    decision,
    scopeId: 'left-link',
    operation: 'hard-surface-shell',
  });
  const rightPermit = createConstructionOperationPermit({
    decision,
    scopeId: 'right-link',
    operation: 'hard-surface-shell',
  });

  assert.throws(() => createConstructionQuality(qualityInput({
    families: ['hard-surface-shell', 'assembly-decomposition'],
    vocabulary: decision,
    permits: [leftPermit, rightPermit],
  })), /requires an assembly-decomposition permit/);

  const quality = createConstructionQuality(qualityInput({
    families: ['hard-surface-shell', 'assembly-decomposition'],
    vocabulary: decision,
    permits: [assemblyPermit, leftPermit, rightPermit],
  }));
  assert.equal(validateConstructionQuality(quality).valid, true);
});

test('R02 hybrid requires complete child decisions and only child-compatible operations', () => {
  const shell = leaf('shell', 'hard-surface');
  const soft = leaf('soft-insert', 'organic');

  assert.throws(() => createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary: 'hybrid',
    cues: [cue('hybrid-cue')],
    evidenceRefs: ['evidence/reference.png'],
    identityScopes: ['shell', 'soft-insert'],
    childDecisions: [shell],
  }), /childDecisions must exactly cover identityScopes/);

  const hybrid = createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    vocabulary: 'hybrid',
    cues: [cue('hybrid-cue')],
    evidenceRefs: ['evidence/reference.png'],
    identityScopes: ['shell', 'soft-insert'],
    childDecisions: [shell, soft],
  });

  assert.throws(() => createConstructionOperationPermit({
    decision: hybrid,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  }), /whole scope cannot authorize one undifferentiated identity geometry operation/);

  const shellPermit = createConstructionOperationPermit({
    decision: hybrid,
    scopeId: 'shell',
    operation: 'hard-surface-shell',
  });
  const softPermit = createConstructionOperationPermit({
    decision: hybrid,
    scopeId: 'soft-insert',
    operation: 'section-profile-loft-organic',
  });
  assert.throws(() => createConstructionOperationPermit({
    decision: hybrid,
    scopeId: 'soft-insert',
    operation: 'hard-surface-shell',
  }), /incompatible with vocabulary organic/);

  const quality = createConstructionQuality(qualityInput({
    families: ['hard-surface-shell', 'section-profile-loft-organic'],
    vocabulary: hybrid,
    permits: [shellPermit, softPermit],
  }));
  assert.equal(validateConstructionQuality(quality).valid, true);
});

test('R02 permits fail closed across source, scope, decision, and requested operation drift', () => {
  const decision = leaf('whole', 'hard-surface');
  const permit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
  });

  const otherSourceDecision = leaf('whole', 'hard-surface', D('d'));
  assert.equal(validateConstructionOperationPermit(permit, otherSourceDecision).valid, false);
  assert.equal(validateConstructionOperationPermit(permit, decision, {
    scopeId: 'other-scope',
    operation: 'hard-surface-shell',
  }).valid, false);
  assert.equal(validateConstructionOperationPermit(permit, decision, {
    scopeId: 'whole',
    operation: 'section-profile-loft-rigid',
  }).valid, false);

  assert.throws(() => createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'section-profile-loft-organic',
    compatibilityMatrix: {'hard-surface': ['section-profile-loft-organic']},
  }), /incompatible with vocabulary hard-surface/);
});

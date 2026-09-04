import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createCandidateTransaction,
  digestBytes,
  digestJson,
  validateCandidateTransaction,
} from '../skills/refas/scripts/lib/index.mjs';

const candidate = Buffer.from('candidate-v1-glb-bytes');
const candidateSha256 = digestBytes(candidate);

function checkpoint(reason = 'candidate is trustworthy') {
  const content = {
    schema: 'refas.checkpoint/v1',
    parentId: null,
    capability: 'rendering',
    scopeId: 'whole',
    reason,
    artifactRefs: [{kind: 'asset', path: 'assets/candidate.glb', sha256: candidateSha256, sizeBytes: candidate.length}],
    claims: ['candidate fixture'],
    gates: [{id: 'render-integrity', status: 'pass', evidenceRefs: ['renders/report.json']}],
    metadata: {},
    transactionId: null,
  };
  const contentDigest = digestJson(content);
  return {...content, id: `cp_${contentDigest.slice(0, 20)}`, createdAt: '2026-09-05T00:00:00.000Z', contentDigest};
}

function fixture() {
  const frame = Buffer.from('render-frame-binary');
  const reportObject = {
    schema: 'refas.test-render-report/v1',
    assetSha256: candidateSha256,
    outputs: [{sha256: digestBytes(frame)}],
  };
  const report = Buffer.from(JSON.stringify(reportObject));
  const review = Buffer.from(JSON.stringify({
    schema: 'refas.test-review/v1',
    assetSha256: candidateSha256,
    renderer: {reportSha256: digestBytes(report)},
  }));
  const evidence = [
    {
      id: 'render.frame',
      role: 'render-output',
      bytes: frame,
    },
    {
      id: 'render.report',
      role: 'render-report',
      schema: 'refas.test-render-report/v1',
      bytes: report,
      subjectPointer: '/assetSha256',
      dependencies: [{
        nodeId: 'render.frame',
        proof: {kind: 'json-pointer-artifact-sha256', holder: 'self', pointer: '/outputs/0/sha256'},
      }],
    },
    {
      id: 'review.final',
      role: 'visual-review',
      schema: 'refas.test-review/v1',
      bytes: review,
      subjectPointer: '/assetSha256',
      dependencies: [{
        nodeId: 'render.report',
        proof: {kind: 'json-pointer-artifact-sha256', holder: 'self', pointer: '/renderer/reportSha256'},
      }],
    },
  ];
  return {frame, report, review, evidence};
}

function create(overrides = {}) {
  const data = fixture();
  return {
    transaction: createCandidateTransaction({
      candidateBytes: candidate,
      checkpoint: checkpoint(),
      evidence: overrides.evidence ?? data.evidence,
      decisionNodeIds: overrides.decisionNodeIds ?? ['review.final'],
      obligations: overrides.obligations ?? [
        {id: 'need-render', role: 'render-report', minCount: 1},
        {id: 'need-review', schema: 'refas.test-review/v1', minCount: 1},
      ],
    }),
    ...data,
  };
}

test('candidate transaction seals a deterministic exact-byte provenance DAG', () => {
  const first = create();
  const secondData = fixture();
  const second = createCandidateTransaction({
    candidateBytes: candidate,
    checkpoint: checkpoint(),
    evidence: [...secondData.evidence].reverse(),
    decisionNodeIds: ['review.final'],
    obligations: [
      {id: 'need-review', schema: 'refas.test-review/v1', minCount: 1},
      {id: 'need-render', role: 'render-report', minCount: 1},
    ],
  });
  assert.equal(first.transaction.id, second.id);
  assert.equal(first.transaction.transactionDigest, second.transactionDigest);
  assert.deepEqual(first.transaction.evidenceNodes.map((node) => node.id), ['render.frame', 'render.report', 'review.final']);
  assert.equal(first.transaction.policy.transactionDoesNotAuthorizeCertification, true);
  assert.deepEqual(validateCandidateTransaction(first.transaction, {
    candidateBytes: candidate,
    checkpoint: checkpoint(),
    evidenceBytesById: {
      'render.frame': first.frame,
      'render.report': first.report,
      'review.final': first.review,
    },
  }), {valid: true, errors: []});
});

test('direct evidence from another candidate cannot enter the transaction', () => {
  const data = fixture();
  const otherSha = digestBytes(Buffer.from('candidate-v2'));
  const badReview = Buffer.from(JSON.stringify({
    schema: 'refas.test-review/v1',
    assetSha256: otherSha,
    renderer: {reportSha256: digestBytes(data.report)},
  }));
  data.evidence.find((node) => node.id === 'review.final').bytes = badReview;
  assert.throws(() => create({evidence: data.evidence}), /binds a different candidate/);
});

test('dependency substitution fails even when both artifacts are individually present', () => {
  const data = fixture();
  const alternateFrame = Buffer.from('other-render-frame');
  data.evidence.push({id: 'render.alternate', role: 'render-output', bytes: alternateFrame});
  data.evidence.find((node) => node.id === 'render.report').dependencies = [{
    nodeId: 'render.alternate',
    proof: {kind: 'json-pointer-artifact-sha256', holder: 'self', pointer: '/outputs/0/sha256'},
  }];
  assert.throws(() => create({evidence: data.evidence}), /dependency proof does not bind the exact artifact bytes/);
});

test('orphan evidence and cyclic dependency graphs fail closed', () => {
  const orphanData = fixture();
  orphanData.evidence.push({
    id: 'unused.note',
    role: 'review-note',
    schema: 'refas.test-note/v1',
    bytes: Buffer.from(JSON.stringify({schema: 'refas.test-note/v1', assetSha256: candidateSha256})),
    subjectPointer: '/assetSha256',
  });
  assert.throws(() => create({evidence: orphanData.evidence}), /orphan evidence/);

  const cycleData = fixture();
  cycleData.evidence.find((node) => node.id === 'render.frame').dependencies = [{
    nodeId: 'render.report',
    proof: {kind: 'json-pointer-artifact-sha256', holder: 'dependency', pointer: '/outputs/0/sha256'},
  }];
  assert.throws(() => create({evidence: cycleData.evidence}), /contains a cycle/);
});

test('checkpoint and evidence bytes are revalidated against a sealed transaction', () => {
  const data = create();
  const staleCheckpoint = checkpoint('same candidate but different checkpoint state');
  const stale = validateCandidateTransaction(data.transaction, {
    candidateBytes: candidate,
    checkpoint: staleCheckpoint,
    evidenceBytesById: {
      'render.frame': data.frame,
      'render.report': data.report,
      'review.final': data.review,
    },
  });
  assert.equal(stale.valid, false);
  assert.match(stale.errors.join('; '), /checkpoint binding is stale or mismatched/);

  const mutated = validateCandidateTransaction(data.transaction, {
    candidateBytes: candidate,
    checkpoint: checkpoint(),
    evidenceBytesById: {
      'render.frame': Buffer.from('mutated-render-frame'),
      'render.report': data.report,
      'review.final': data.review,
    },
  });
  assert.equal(mutated.valid, false);
  assert.match(mutated.errors.join('; '), /evidence bytes mismatch|dependency proof mismatch/);
});

test('declared evidence obligations are admission requirements, not certification claims', () => {
  const data = fixture();
  assert.throws(() => createCandidateTransaction({
    candidateBytes: candidate,
    checkpoint: checkpoint(),
    evidence: data.evidence,
    decisionNodeIds: ['review.final'],
    obligations: [{id: 'need-unknown', role: 'nonexistent-evidence-role', minCount: 1}],
  }), /obligations are unsatisfied/);
});

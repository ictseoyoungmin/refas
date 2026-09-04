import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createCandidateTransaction,
  createCertificationPolicy,
  createDefaultWholeObjectCertificationPolicy,
  digestBytes,
  digestJson,
  evaluateCertificationPolicy,
  validateCertificationPolicy,
  validateClaimCertificationDecision,
} from '../skills/refas/scripts/lib/index.mjs';

function checkpointFor(candidateBytes) {
  const artifact = {kind: 'glb', path: 'assets/candidate.glb', sha256: digestBytes(candidateBytes), sizeBytes: candidateBytes.length};
  const content = {
    schema: 'refas.checkpoint/v1',
    parentId: null,
    capability: 'whole-object-certification',
    scopeId: 'whole',
    reason: 'claim certification fixture',
    artifactRefs: [artifact],
    claims: ['candidate ready'],
    gates: [{id: 'fixture-gate', status: 'pass', evidenceRefs: [artifact.path]}],
    metadata: {},
    transactionId: null,
  };
  const contentDigest = digestJson(content);
  return {...content, id: `cp_${contentDigest.slice(0, 20)}`, createdAt: '2026-09-05T00:00:00.000Z', contentDigest};
}

function evidence(candidateSha256, unresolvedFindings = []) {
  const render = Buffer.from(`${JSON.stringify({schema:'refas.pbr-render-report/v1', assetSha256:candidateSha256})}\n`);
  const review = Buffer.from(`${JSON.stringify({
    schema:'refas.visual-review/v1',
    assetSha256:candidateSha256,
    renderer:{reportSha256:digestBytes(render)},
    unresolvedFindings,
  })}\n`);
  return {render, review};
}

function transactionFixture(unresolvedFindings = []) {
  const candidateBytes = Buffer.from('candidate bytes\n');
  const checkpoint = checkpointFor(candidateBytes);
  const candidateSha256 = digestBytes(candidateBytes);
  const {render, review} = evidence(candidateSha256, unresolvedFindings);
  const transaction = createCandidateTransaction({
    candidateBytes,
    checkpoint,
    evidence: [
      {id:'render-report', role:'render-report', schema:'refas.pbr-render-report/v1', bytes:render, subjectPointer:'/assetSha256'},
      {id:'visual-review', role:'visual-review', schema:'refas.visual-review/v1', bytes:review, subjectPointer:'/assetSha256', dependencies:[{
        nodeId:'render-report', proof:{kind:'json-pointer-artifact-sha256', holder:'self', pointer:'/renderer/reportSha256'},
      }]},
    ],
    decisionNodeIds:['visual-review'],
    obligations:[
      {id:'render-report', role:'render-report', schema:'refas.pbr-render-report/v1'},
      {id:'visual-review', role:'visual-review', schema:'refas.visual-review/v1'},
    ],
  });
  return {candidateBytes, checkpoint, transaction, render, review};
}

test('claim policy authorizes explicit evidence obligations and binds the exact transaction', () => {
  const {transaction, render, review} = transactionFixture();
  const policy = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const evidenceBytesById = new Map([['render-report', render], ['visual-review', review]]);
  const decision = evaluateCertificationPolicy({transaction, policy, evidenceBytesById});
  assert.equal(decision.authorized, true);
  assert.deepEqual(decision.authorizedClaimIds, ['visual-source-fidelity']);
  assert.deepEqual(decision.refusedClaimIds, []);
  assert.equal(decision.transaction.transactionDigest, transaction.transactionDigest);
  assert.equal(decision.policy.policyDigest, policy.policyDigest);
  assert.equal(validateClaimCertificationDecision(decision, {transaction, policy, evidenceBytesById}).valid, true);
});

test('transaction validity alone cannot authorize a claim with an unsatisfied policy obligation', () => {
  const {transaction, render, review} = transactionFixture();
  const policy = createCertificationPolicy({
    id:'needs-structural-proof',
    claims:[{
      id:'structurally-usable',
      obligations:[{id:'structural-proof', role:'fit-structural-eligibility', schema:'refas.fit-structural-eligibility/v1'}],
    }],
  });
  const decision = evaluateCertificationPolicy({transaction, policy, evidenceBytesById:new Map([['render-report',render],['visual-review',review]])});
  assert.equal(decision.authorized, false);
  assert.deepEqual(decision.refusedClaimIds, ['structurally-usable']);
});

test('blocking findings veto a claim while non-blocking evidence boundaries remain disclosed', () => {
  const minor = transactionFixture([{category:'evidence-boundary', severity:'minor', blocking:false, summary:'Rear hidden form is not source-certified.'}]);
  const policy = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const minorDecision = evaluateCertificationPolicy({transaction:minor.transaction, policy, evidenceBytesById:new Map([['render-report',minor.render],['visual-review',minor.review]])});
  assert.equal(minorDecision.authorized, true);
  assert.equal(minorDecision.claims[0].disclosedFindings.length, 1);
  assert.equal(minorDecision.claims[0].vetoFindings.length, 0);

  const major = transactionFixture([{category:'attachment-mismatch', severity:'major', blocking:true, summary:'A source-visible attachment is detached.'}]);
  const majorDecision = evaluateCertificationPolicy({transaction:major.transaction, policy, evidenceBytesById:new Map([['render-report',major.render],['visual-review',major.review]])});
  assert.equal(majorDecision.authorized, false);
  assert.equal(majorDecision.claims[0].vetoFindings.length, 1);
});

test('policy mutation and altered finding bytes fail closed', () => {
  const {transaction, render, review} = transactionFixture();
  const policy = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const mutatedPolicy = structuredClone(policy);
  mutatedPolicy.claims[0].obligations = mutatedPolicy.claims[0].obligations.slice(0, 1);
  assert.equal(validateCertificationPolicy(mutatedPolicy).valid, false);

  const alteredReview = Buffer.from(review.toString('utf8').replace('"unresolvedFindings":[]', '"unresolvedFindings":[{"category":"curvature-mismatch","severity":"major"}]'));
  assert.throws(() => evaluateCertificationPolicy({
    transaction,
    policy,
    evidenceBytesById:new Map([['render-report',render],['visual-review',alteredReview]]),
  }), /do not match transaction evidence/);
});

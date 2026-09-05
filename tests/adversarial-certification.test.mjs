import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  CAPABILITY_ORDER,
  REQUIRED_CLOSURE_GATE_IDS,
  REQUIRED_VISUAL_GATE_IDS,
  assessClaimCertification,
  commitCheckpoint,
  contentReference,
  createCandidateTransaction,
  createCertificationPolicy,
  createDefaultWholeObjectCertificationPolicy,
  digestBytes,
  digestJson,
  evaluateCertificationPolicy,
  initProject,
  validateCandidateTransaction,
  validateCertificationPolicy,
  validateClaimCertificationDecision,
  validateWholeObjectPolicyAuthority,
} from '../skills/refas/scripts/lib/index.mjs';

function checkpointFor(candidateBytes, reason = 'adversarial fixture') {
  const artifact = {kind: 'glb', path: 'assets/candidate.glb', sha256: digestBytes(candidateBytes), sizeBytes: candidateBytes.length};
  const core = {
    schema: 'refas.checkpoint/v1',
    parentId: null,
    capability: 'whole-object-certification',
    scopeId: 'whole',
    reason,
    artifactRefs: [artifact],
    claims: ['candidate ready'],
    gates: [{id: 'fixture-gate', status: 'pass', evidenceRefs: [artifact.path]}],
    metadata: {},
    transactionId: null,
  };
  const contentDigest = digestJson(core);
  return {...core, id: `cp_${contentDigest.slice(0, 20)}`, createdAt: '2026-09-05T00:00:00.000Z', contentDigest};
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

function transactionFixture({candidateBytes = Buffer.from('candidate bytes\n'), unresolvedFindings = [], checkpointReason} = {}) {
  const checkpoint = checkpointFor(candidateBytes, checkpointReason);
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
  return {
    candidateBytes,
    checkpoint,
    transaction,
    render,
    review,
    evidenceBytesById:new Map([['render-report',render],['visual-review',review]]),
  };
}

function decisionCore(value) {
  return {
    schema: value.schema,
    transaction: value.transaction,
    policy: value.policy,
    claims: value.claims,
    authorizedClaimIds: value.authorizedClaimIds,
    refusedClaimIds: value.refusedClaimIds,
    authorized: value.authorized,
  };
}

function weakenedWholeObjectPolicy({dropRender = false, vetoSeverities = ['blocking', 'critical', 'major']} = {}) {
  const obligations = [
    {id:'independent-visual-review', role:'visual-review', schema:'refas.visual-review/v1'},
  ];
  if (!dropRender) obligations.push({id:'independent-render-report', role:'render-report', schema:'refas.pbr-render-report/v1'});
  return createCertificationPolicy({
    id:'resigned-custom-policy',
    claims:[{
      id:'visual-source-fidelity',
      description:'Attempted replacement for the mandatory whole-object visual claim.',
      obligations,
      findingSources:[{role:'visual-review', schema:'refas.visual-review/v1', pointer:'/unresolvedFindings'}],
      vetoSeverities,
    }],
  });
}

test('A13/policy-authority: a re-signed policy cannot delete a mandatory visual obligation', () => {
  const attacked = weakenedWholeObjectPolicy({dropRender:true});
  assert.equal(validateCertificationPolicy(attacked).valid, true, 'the attack is intentionally a structurally valid, re-signed policy');
  const authority = validateWholeObjectPolicyAuthority(attacked, {requiresRegisteredComparison:false});
  assert.equal(authority.valid, false);
  assert.match(authority.errors.join('\n'), /weakens evidence obligation render-report/);
});

test('A13/policy-authority: a re-signed policy cannot downgrade mandatory blocking severities', () => {
  const attacked = weakenedWholeObjectPolicy({vetoSeverities:['critical']});
  assert.equal(validateCertificationPolicy(attacked).valid, true);
  const authority = validateWholeObjectPolicyAuthority(attacked, {requiresRegisteredComparison:false});
  assert.equal(authority.valid, false);
  assert.match(authority.errors.join('\n'), /removes veto severity (blocking|major)/);
});

test('A13/provenance: evidence substitution is rejected before claim evaluation', () => {
  const fixture = transactionFixture();
  const altered = Buffer.from(fixture.review.toString('utf8').replace('"unresolvedFindings":[]', '"unresolvedFindings":[{"severity":"minor"}]'));
  assert.throws(() => evaluateCertificationPolicy({
    transaction:fixture.transaction,
    policy:createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false}),
    evidenceBytesById:new Map([['render-report',fixture.render],['visual-review',altered]]),
  }), /candidate transaction is invalid: evidence bytes mismatch for visual-review/);
});

test('A13/replay: a sealed transaction cannot be replayed against another checkpoint', () => {
  const fixture = transactionFixture({checkpointReason:'checkpoint A'});
  const staleTarget = checkpointFor(fixture.candidateBytes, 'checkpoint B');
  const validation = validateCandidateTransaction(fixture.transaction, {
    candidateBytes:fixture.candidateBytes,
    checkpoint:staleTarget,
    evidenceBytesById:fixture.evidenceBytesById,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /checkpoint/);
});

test('A13/decision-forgery: injected authorized claims fail even after the decision digest is recomputed', () => {
  const fixture = transactionFixture();
  const policy = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const decision = evaluateCertificationPolicy({transaction:fixture.transaction, policy, evidenceBytesById:fixture.evidenceBytesById});
  const forged = structuredClone(decision);
  forged.authorizedClaimIds.push('structurally-usable');
  forged.authorizedClaimIds.sort();
  forged.decisionDigest = digestJson(decisionCore(forged));
  const validation = validateClaimCertificationDecision(forged, {
    transaction:fixture.transaction,
    policy,
    evidenceBytesById:fixture.evidenceBytesById,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /does not reproduce/);
});

test('A13/policy-substitution: an old decision cannot be paired with another valid policy', () => {
  const fixture = transactionFixture();
  const original = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const decision = evaluateCertificationPolicy({transaction:fixture.transaction, policy:original, evidenceBytesById:fixture.evidenceBytesById});
  const replacement = createCertificationPolicy({
    id:'expanded-policy',
    claims:[
      ...original.claims,
      {id:'optional-extra-claim', required:false, obligations:[{id:'review', role:'visual-review', schema:'refas.visual-review/v1'}]},
    ],
  });
  assert.equal(validateCertificationPolicy(replacement).valid, true);
  const validation = validateClaimCertificationDecision(decision, {
    transaction:fixture.transaction,
    policy:replacement,
    evidenceBytesById:fixture.evidenceBytesById,
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /(does not reproduce|digest mismatch)/);
});

test('A13/cross-claim: visual evidence cannot satisfy a typed structural obligation', () => {
  const fixture = transactionFixture();
  const policy = createCertificationPolicy({
    id:'visual-plus-structural-policy',
    claims:[
      {
        id:'visual-source-fidelity',
        obligations:[
          {id:'review', role:'visual-review', schema:'refas.visual-review/v1'},
          {id:'render', role:'render-report', schema:'refas.pbr-render-report/v1'},
        ],
        findingSources:[{role:'visual-review', schema:'refas.visual-review/v1', pointer:'/unresolvedFindings'}],
      },
      {
        id:'structurally-usable',
        obligations:[{id:'realized-structural-proof', role:'fit-structural-eligibility', schema:'refas.fit-structural-eligibility/v1'}],
      },
    ],
  });
  const decision = evaluateCertificationPolicy({transaction:fixture.transaction, policy, evidenceBytesById:fixture.evidenceBytesById});
  assert.equal(decision.authorized, false);
  const structural = decision.claims.find((claim) => claim.id === 'structurally-usable');
  assert.equal(structural.status, 'fail');
  assert.deepEqual(structural.matchedEvidenceNodeIds, []);
});

async function projectWithExplicitPolicy(t, policy) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-a13-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  await fs.mkdir(path.join(root, 'source'), {recursive:true});
  const sourceBytes = Buffer.from('fixture source\n');
  await fs.writeFile(path.join(root, 'source', 'reference.bin'), sourceBytes);
  await initProject(root, {
    projectId:'a13-policy-gate',
    source:{
      schema:'refas.source-manifest/v1', id:'primary-reference', path:'source/reference.bin',
      sha256:digestBytes(sourceBytes), sizeBytes:sourceBytes.length, width:32, height:24,
      authority:'primary', acquisition:{kind:'test-fixture'},
    },
  });
  await fs.mkdir(path.join(root, 'model'), {recursive:true});
  const statePath = path.join(root, 'model', 'state.bin');
  for (const capability of CAPABILITY_ORDER) {
    if (capability === 'whole-object-certification') break;
    await fs.writeFile(statePath, Buffer.from(`trusted:${capability}\n`));
    const artifact = await contentReference(statePath, {kind:'model-spec', root});
    await commitCheckpoint(root, {
      capability, scopeId:'whole', reason:`${capability} adversarial prerequisite`, artifactRefs:[artifact],
      claims:[`${capability} closed`], gates:[{id:`${capability}-gate`, status:'pass', evidenceRefs:[artifact.path]}],
    });
  }

  const candidatePath = path.join(root, 'model', 'candidate.glb');
  await fs.writeFile(candidatePath, Buffer.from('candidate GLB bytes\n'));
  const candidate = await contentReference(candidatePath, {kind:'glb', root});

  const renderPath = path.join(root, 'renders', 'final', 'render-report.json');
  await fs.mkdir(path.dirname(renderPath), {recursive:true});
  const render = {schema:'refas.pbr-render-report/v1', assetSha256:candidate.sha256};
  const renderBytes = Buffer.from(`${JSON.stringify(render)}\n`);
  await fs.writeFile(renderPath, renderBytes);
  const renderRef = await contentReference(renderPath, {kind:'render-report', root});

  const reviewPath = path.join(root, 'reviews', 'visual-review.json');
  await fs.mkdir(path.dirname(reviewPath), {recursive:true});
  const review = {
    schema:'refas.visual-review/v1', assetSha256:candidate.sha256,
    renderer:{reportRef:'renders/final/render-report.json', reportSha256:renderRef.sha256},
    unresolvedFindings:[],
  };
  await fs.writeFile(reviewPath, `${JSON.stringify(review)}\n`);
  const reviewRef = await contentReference(reviewPath, {kind:'visual-review', root});

  const policyPath = path.join(root, 'reviews', 'certification-policy.json');
  await fs.writeFile(policyPath, `${JSON.stringify(policy)}\n`);
  const policyRef = await contentReference(policyPath, {kind:'certification-policy', root});
  const gates = REQUIRED_CLOSURE_GATE_IDS.map((id) => ({
    id, status:'pass', evidenceRefs:[REQUIRED_VISUAL_GATE_IDS.includes(id) ? reviewRef.path : candidate.path],
  }));
  await commitCheckpoint(root, {
    capability:'whole-object-certification', scopeId:'whole', reason:'A13 explicit policy attack target',
    artifactRefs:[candidate, renderRef, reviewRef, policyRef], claims:['policy must not weaken mandatory authority'], gates,
  });
  return root;
}

test('A13/integration: checkpoint-bound re-signed weak policy is rejected by the certification gate', async (t) => {
  const root = await projectWithExplicitPolicy(t, weakenedWholeObjectPolicy({dropRender:true}));
  const assessment = await assessClaimCertification(root);
  assert.equal(assessment.valid, false);
  assert.match(assessment.errors.join('\n'), /weakens mandatory whole-object authority/);
});

test('A13/integration: an explicit policy at or above the mandatory authority floor remains valid', async (t) => {
  const root = await projectWithExplicitPolicy(t, createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false}));
  const assessment = await assessClaimCertification(root);
  assert.equal(assessment.valid, true, assessment.errors.join('\n'));
  assert.equal(assessment.decision.authorized, true);
});

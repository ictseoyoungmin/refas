import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  analyzeRealizedContact,
  applyParentLocalTransformEdits,
  createAttachmentSemantics,
  createFitStructuralEligibility,
  createParameterFitPlan,
  createPoseFitPlan,
  createRealizedContactPlan,
  createSegmentPrism,
  digestBytes,
  digestJson,
  fitParameters,
  fitPose,
  partsToGlb,
  validateFitStructuralEligibility,
  validateParameterFitReport,
  validatePoseFitReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const contentRef = (path, kind, bytes) => ({schema: 'refas.content-reference/v1', kind, path, sha256: digestBytes(bytes), sizeBytes: Buffer.byteLength(bytes)});

function box(id, x0, x1, y0, y1, z0, z1) {
  const positions = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
  ];
  const indices = [
    0,2,1, 0,3,2, 4,5,6, 4,6,7,
    0,1,5, 0,5,4, 3,7,6, 3,6,2,
    0,7,3, 0,4,7, 1,2,6, 1,6,5,
  ];
  return {id, materialId: 'solid', mesh: {positions, indices}};
}

function contactCandidate(gap, tune) {
  const shift = tune * 0.05;
  return partsToGlb({
    assetId: 'fit-contact-fixture',
    parts: [
      box('base', 0, 1, 0, 1, 0, 0.2),
      box('part', shift, 1 + shift, 0, 1, 0.2 + gap * 0.1, 1.2 + gap * 0.1),
    ],
    materials: {solid: {baseColor: [.6,.6,.6,1], roughness: .5}},
  });
}

function contactSemantics() {
  return createAttachmentSemantics({
    scopeId: 'fit-contact', sourceSha256: D('a'),
    entities: [E('base'), E('part')],
    relations: [R('base-free', 'FREE', 'base'), R('part-follow', 'RIGID_FOLLOW', 'part', ['base'])],
    evidenceRefs: ['source/fit-contact.png'],
  });
}

function contactEligibility(candidate, semantics) {
  const contactPlan = createRealizedContactPlan({
    attachmentSemantics: semantics,
    id: 'fit-contact-plan',
    assetSha256: digestBytes(candidate),
    supportRoots: ['base'],
    supportRequiredEntityIds: ['part'],
    pairExpectations: [{
      id: 'part-base-support', kind: 'SUPPORT', subjectId: 'part', ownerId: 'base', relationId: 'part-follow',
      maxGap: .001, maxPenetration: 1e-7, minContactArea: .2, evidenceRefs: ['reviews/part-base.json'],
    }],
    broadPhaseMargin: .2,
    contactTolerance: .002,
    penetrationTolerance: 1e-7,
    evidenceRefs: ['reviews/fit-contact.json'],
  });
  const result = analyzeRealizedContact({plan: contactPlan, attachmentSemantics: semantics, glb: candidate});
  return createFitStructuralEligibility({
    candidateGlb: candidate,
    requiredStages: ['realized-contact'],
    realizedContact: {result, validation: {plan: contactPlan, attachmentSemantics: semantics, glb: candidate}},
    evidenceRefs: ['reviews/fit-eligibility.json'],
  });
}

function renderReference(id) {
  const bytes = Buffer.from(`render:${id}`);
  return contentRef(`trials/${id}/render.json`, 'render-report', bytes);
}

test('parameter fitting never selects a visually better candidate with broken realized support', async () => {
  const semantics = contactSemantics();
  const baseline = contactCandidate(0, 0);
  const plan = createParameterFitPlan({
    id: 'constraint-aware-shape-fit', scopeId: 'fit-contact', sourceSha256: D('a'),
    baselineAsset: contentRef('assets/baseline.glb', 'glb', baseline),
    parameters: [
      {id: 'gap', binding: 'model.shape.gap', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
      {id: 'tune', binding: 'model.shape.tune', kind: 'integer', minimum: 0, maximum: 1, initial: 0},
    ],
    objectives: [{id: 'visual-loss', goal: 'minimize', scale: 1, weight: 1}],
    optimizer: {seed: 1, populationSize: 4, evaluationBudget: 5, patience: 5, initializationAttemptBudget: 16},
    structuralEligibilityRequired: true,
    evidenceRefs: ['source/fit-contact.png'],
  });
  const report = await fitParameters(plan, async (parameters, context) => {
    const candidate = contactCandidate(parameters.gap, parameters.tune);
    const loss = parameters.gap === 1 ? 0 : parameters.tune === 1 ? .4 : 1;
    return {
      measurements: {'visual-loss': loss},
      candidateAsset: contentRef(context.phase === 'baseline' ? 'assets/baseline.glb' : `trials/${context.trialId}/candidate.glb`, 'glb', candidate),
      renderEvidence: renderReference(context.trialId),
      structuralEligibility: contactEligibility(candidate, semantics),
      evidenceRefs: [`trials/${context.trialId}/hero.png`],
    };
  }, {verifyReference: async () => true});

  assert.equal(report.status, 'IMPROVED');
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  assert.equal(selected.parameters.gap, 0);
  assert.equal(selected.parameters.tune, 1);
  assert.equal(selected.eligible, true);
  const visualWinner = report.trials.find((trial) => trial.parameters.gap === 1 && trial.objectiveLoss === 0);
  assert.ok(visualWinner, JSON.stringify(report.trials));
  assert.equal(visualWinner.structuralEligibility.status, 'INELIGIBLE');
  assert.equal(visualWinner.eligible, false);
  assert.ok(visualWinner.objectiveLoss < selected.objectiveLoss, 'invalid visual winner must keep its real loss for diagnostics');
  assert.deepEqual(validateParameterFitReport(report, plan), {valid: true, errors: []});
});

function fixtureEligibility(candidate, eligible) {
  const payload = {
    schema: 'refas.fit-structural-eligibility/v1',
    candidateAssetSha256: digestBytes(candidate),
    requiredStages: ['attachment-propagation', 'realized-contact'],
    realizationBindings: {propagationReportDigest: D('b'), fusionReportDigests: []},
    status: eligible ? 'ELIGIBLE' : 'INELIGIBLE',
    eligible,
    blockers: eligible ? [] : ['REALIZED_CONTACT_BLOCKED'],
    stageChecks: [
      {stage: 'attachment-propagation', present: true, valid: true, pass: true, digest: D('b'), status: 'READY_FOR_REALIZATION', reasons: []},
      {stage: 'physical-fusion', present: false, valid: true, pass: true, digest: null, status: null, reasons: []},
      {stage: 'realized-contact', present: true, valid: true, pass: eligible, digest: D('c'), status: eligible ? 'PASS' : 'BLOCKED', reasons: eligible ? [] : ['support path broken']},
    ],
    evidenceRefs: ['reviews/pose-structure.json'],
    policy: {
      structuralInvalidityIsHardBarrier: true,
      structuralInvalidityIsNeverScorePenalty: true,
      visualMetricsCannotOverrideStructuralEligibility: true,
      exactCandidateBytesAreBound: true,
      structuralStagesMustBindThroughRealizedContact: true,
      artifactDoesNotAuthorizeClosure: true,
    },
  };
  return {...payload, eligibilityDigest: digestJson(payload)};
}

test('pose fitting excludes a lower-loss structurally invalid transform before ranking', async () => {
  const baseline = partsToGlb({
    parts: [{id: 'root-part', scopeId: 'whole', materialId: 'wood', mesh: createSegmentPrism({start: [-.1, 0, 0], end: [.1, 0, 0], width: .1, height: .1})}],
    materials: {wood: {baseColor: [.6,.4,.2,1], roughness: .7, metallic: 0}},
  });
  const plan = createPoseFitPlan({
    id: 'constraint-aware-pose-fit', scopeId: 'whole', sourceSha256: D('d'),
    baselineAsset: contentRef('assets/pose-baseline.glb', 'glb', baseline),
    variables: [{id: 'bend', binding: 'assembly.joint.root-part.angle', minimum: -1, maximum: 1, initial: 0}],
    constraints: [{kind: 'support', nodeId: 'root-part', axis: 'z', minimum: 0}],
    evaluationBudget: 6,
    structuralEligibilityRequired: true,
  });
  const report = await fitPose(plan, {
    baselineGlb: baseline,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluateStructure: async (candidate, context) => fixtureEligibility(candidate, context.parameters.bend < .9),
    evaluate: async (_candidate, context) => ({measurements: {'pose-loss': Math.abs(context.parameters.bend - 1)}}),
  });
  const selected = report.trials.find((trial) => trial.id === report.selectedTrialId);
  const visualWinner = report.trials.find((trial) => trial.parameters.bend === 1);
  assert.equal(visualWinner.objectiveLoss, 0);
  assert.equal(visualWinner.eligible, false);
  assert.ok(selected.objectiveLoss > visualWinner.objectiveLoss);
  assert.notEqual(selected.parameters.bend, 1);
  assert.equal(report.status, 'IMPROVED');
  assert.deepEqual(validatePoseFitReport(report, plan), {valid: true, errors: []});
});

test('structural eligibility rejects stale candidate bytes and evaluator booleans', async () => {
  const semantics = contactSemantics();
  const candidate = contactCandidate(0, 0);
  const eligibility = contactEligibility(candidate, semantics);
  assert.deepEqual(validateFitStructuralEligibility(eligibility, candidate), {valid: true, errors: []});
  assert.equal(validateFitStructuralEligibility(eligibility, contactCandidate(0, 1)).valid, false);

  const baseline = partsToGlb({parts: [{id: 'root-part', materialId: 'wood', mesh: createSegmentPrism({start: [0,0,0], end: [0,0,1], width: .1, height: .1})}], materials: {wood: {baseColor: [.5,.4,.3,1]}}});
  const plan = createPoseFitPlan({id: 'boolean-bypass-pose', scopeId: 'whole', sourceSha256: D('e'), baselineAsset: contentRef('assets/bypass.glb', 'glb', baseline), variables: [{id: 'bend', binding: 'assembly.joint.root-part.angle', minimum: -1, maximum: 1, initial: 0}], evaluationBudget: 2});
  await assert.rejects(() => fitPose(plan, {
    baselineGlb: baseline,
    buildCandidate: ({baselineGlb, edits}) => applyParentLocalTransformEdits(baselineGlb, edits),
    evaluateStructure: async () => ({eligible: true}),
    evaluate: async () => ({measurements: {'pose-loss': 0}}),
  }), /structural eligibility is invalid/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createArticulatedJoint,
  createAttachmentSemantics,
  createSupportedClearance,
  digestJson,
  evaluateArticulatedJoint,
  evaluateSupportedClearance,
  validateArticulatedJoint,
  validateArticulatedJointReport,
  validateSupportedClearance,
  validateSupportedClearanceReport,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});
const I = (origin = [0, 0, 0]) => ({origin, xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1]});
const rounded = (values, scale = 1e8) => values.map((value) => Math.abs(value) < 1 / scale ? 0 : Math.round(value * scale) / scale);

function articulationSemantics() {
  return createAttachmentSemantics({
    scopeId: 'hinged-door', sourceSha256: D(),
    entities: [E('housing'), E('door')],
    relations: [R('housing-free', 'FREE', 'housing'), R('door-hinge', 'ARTICULATED', 'door', ['housing'])],
  });
}

function clearanceSemantics() {
  return createAttachmentSemantics({
    scopeId: 'spaced-panel', sourceSha256: D('b'),
    entities: [E('housing'), E('bracket'), E('panel')],
    relations: [
      R('housing-free', 'FREE', 'housing'),
      R('bracket-follow', 'RIGID_FOLLOW', 'bracket', ['housing']),
      R('panel-clearance', 'SUPPORTED_CLEARANCE', 'panel', ['bracket']),
    ],
  });
}

function realizedProof({gap = .1} = {}) {
  const payload = {
    schema: 'refas.realized-assembly-proof/v1',
    valid: true,
    errors: [],
    moduleChecks: [],
    attachmentChecks: [
      {id: 'panel-bracket-support', pass: true, supportDerivedFromContact: true, penetrationDepth: 0, signedClearance: 0},
      {id: 'bracket-housing-support', pass: true, supportDerivedFromContact: true, penetrationDepth: 0, signedClearance: 0},
      {id: 'panel-housing-gap', pass: true, supportDerivedFromContact: true, penetrationDepth: 0, signedClearance: gap},
    ],
    immutableChildChecks: [],
    objectIdCheck: {partIds: [], pass: true},
    metrics: {modules: 0, nestedLevels: 0, attachments: 3, failures: 0},
  };
  return {...payload, proofDigest: digestJson(payload)};
}

test('bounded revolute articulation rotates around the declared joint pivot without changing geometry', () => {
  const attachmentSemantics = articulationSemantics();
  const joint = createArticulatedJoint({
    attachmentSemantics,
    id: 'door-revolute', relationId: 'door-hinge',
    ownerJointFrame: I(), subjectJointFrame: I([1, 0, 0]),
    minimumAngle: -Math.PI / 2, maximumAngle: Math.PI / 2,
    evidenceRefs: ['model/door-hinge.json'],
  });
  assert.equal(validateArticulatedJoint(joint, attachmentSemantics).valid, true);
  const report = evaluateArticulatedJoint({joint, attachmentSemantics, ownerWorldFrame: I([2, 3, 4]), angle: Math.PI / 2});
  assert.deepEqual(rounded(report.subjectWorldFrame.origin), [2, 2, 4]);
  assert.deepEqual(rounded(report.subjectWorldFrame.xAxis), [0, 1, 0]);
  assert.deepEqual(rounded(report.subjectWorldFrame.yAxis), [-1, 0, 0]);
  assert.equal(report.policy.meshBytesAreNotMutated, true);
  assert.equal(validateArticulatedJointReport(report, {joint, attachmentSemantics}).valid, true);
});

test('articulation fails closed outside declared revolute limits', () => {
  const attachmentSemantics = articulationSemantics();
  const joint = createArticulatedJoint({attachmentSemantics, id: 'door-revolute', relationId: 'door-hinge', ownerJointFrame: I(), subjectJointFrame: I(), minimumAngle: -.5, maximumAngle: .5, evidenceRefs: ['model/door-hinge.json']});
  assert.throws(() => evaluateArticulatedJoint({joint, attachmentSemantics, ownerWorldFrame: I(), angle: .6}), /outside articulated joint limits/);
});

test('supported clearance requires a semantic support chain and digest-bound realized assembly evidence', () => {
  const attachmentSemantics = clearanceSemantics();
  const contract = createSupportedClearance({
    attachmentSemantics,
    id: 'panel-gap-contract', relationId: 'panel-clearance',
    supportPathEntityIds: ['panel', 'bracket', 'housing'],
    supportProofBindings: [
      {childId: 'panel', parentId: 'bracket', proofAttachmentId: 'panel-bracket-support', evidenceRefs: ['reviews/panel-bracket.json']},
      {childId: 'bracket', parentId: 'housing', proofAttachmentId: 'bracket-housing-support', evidenceRefs: ['reviews/bracket-housing.json']},
    ],
    clearanceBounds: [{counterpartId: 'housing', proofAttachmentId: 'panel-housing-gap', minimumClearance: .08, maximumClearance: .12, evidenceRefs: ['reviews/panel-housing-gap.json']}],
    evidenceRefs: ['source/panel.png'],
  });
  assert.equal(validateSupportedClearance(contract, attachmentSemantics).valid, true);
  const proof = realizedProof();
  const report = evaluateSupportedClearance({contract, attachmentSemantics, realizedAssemblyProof: proof});
  assert.equal(report.status, 'SATISFIED');
  assert.equal(report.satisfied, true);
  assert.equal(report.supportResults.every((result) => result.pass), true);
  assert.equal(report.clearanceResults[0].signedClearance, .1);
  assert.equal(validateSupportedClearanceReport(report, {contract, attachmentSemantics, realizedAssemblyProof: proof}).valid, true);
});

test('supported clearance blocks an out-of-range gap instead of inventing direct contact', () => {
  const attachmentSemantics = clearanceSemantics();
  const contract = createSupportedClearance({
    attachmentSemantics, id: 'panel-gap-contract', relationId: 'panel-clearance', supportPathEntityIds: ['panel', 'bracket', 'housing'],
    supportProofBindings: [
      {childId: 'panel', parentId: 'bracket', proofAttachmentId: 'panel-bracket-support', evidenceRefs: ['reviews/panel-bracket.json']},
      {childId: 'bracket', parentId: 'housing', proofAttachmentId: 'bracket-housing-support', evidenceRefs: ['reviews/bracket-housing.json']},
    ],
    clearanceBounds: [{counterpartId: 'housing', proofAttachmentId: 'panel-housing-gap', minimumClearance: .08, maximumClearance: .12, evidenceRefs: ['reviews/panel-housing-gap.json']}],
    evidenceRefs: ['source/panel.png'],
  });
  const report = evaluateSupportedClearance({contract, attachmentSemantics, realizedAssemblyProof: realizedProof({gap: .2})});
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.satisfied, false);
  assert.equal(report.clearanceResults[0].pass, false);
  assert.equal(report.policy.blockedClearanceCannotBeTreatedAsSatisfied, true);
});

test('support path cannot invent an undeclared semantic edge', () => {
  const attachmentSemantics = clearanceSemantics();
  assert.throws(() => createSupportedClearance({
    attachmentSemantics, id: 'bad-path', relationId: 'panel-clearance', supportPathEntityIds: ['panel', 'housing'],
    supportProofBindings: [{childId: 'panel', parentId: 'housing', proofAttachmentId: 'fake-support', evidenceRefs: ['bad.json']}],
    clearanceBounds: [{counterpartId: 'housing', proofAttachmentId: 'panel-housing-gap', minimumClearance: 0, maximumClearance: .2, evidenceRefs: ['gap.json']}],
    evidenceRefs: ['source/panel.png'],
  }), /is not declared by attachment semantics/);
});

test('articulation and clearance artifacts remain tamper detectable', () => {
  const articulatedSemantics = articulationSemantics();
  const joint = createArticulatedJoint({attachmentSemantics: articulatedSemantics, id: 'door-revolute', relationId: 'door-hinge', ownerJointFrame: I(), subjectJointFrame: I(), minimumAngle: -.5, maximumAngle: .5, evidenceRefs: ['joint.json']});
  const tamperedJoint = structuredClone(joint);
  tamperedJoint.limits.maximumAngle = 2;
  assert.equal(validateArticulatedJoint(tamperedJoint, articulatedSemantics).valid, false);

  const attachmentSemantics = clearanceSemantics();
  const contract = createSupportedClearance({
    attachmentSemantics, id: 'panel-gap-contract', relationId: 'panel-clearance', supportPathEntityIds: ['panel', 'bracket', 'housing'],
    supportProofBindings: [
      {childId: 'panel', parentId: 'bracket', proofAttachmentId: 'panel-bracket-support', evidenceRefs: ['a.json']},
      {childId: 'bracket', parentId: 'housing', proofAttachmentId: 'bracket-housing-support', evidenceRefs: ['b.json']},
    ],
    clearanceBounds: [{counterpartId: 'housing', proofAttachmentId: 'panel-housing-gap', minimumClearance: .08, maximumClearance: .12, evidenceRefs: ['c.json']}], evidenceRefs: ['source/panel.png'],
  });
  const tampered = structuredClone(contract);
  tampered.clearanceBounds[0].maximumClearance = 9;
  assert.equal(validateSupportedClearance(tampered, attachmentSemantics).valid, false);
});

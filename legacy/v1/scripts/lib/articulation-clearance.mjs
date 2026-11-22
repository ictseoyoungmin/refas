import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {composeRigidFrames, invertRigidFrame, normalizeRigidFrame} from './attachment-follow.mjs';
import {validateRealizedAssemblyProof} from './realized-assembly.mjs';

export const ARTICULATED_JOINT_SCHEMA = 'refas.articulated-joint/v1';
export const ARTICULATED_JOINT_REPORT_SCHEMA = 'refas.articulated-joint-report/v1';
export const SUPPORTED_CLEARANCE_SCHEMA = 'refas.supported-clearance/v1';
export const SUPPORTED_CLEARANCE_REPORT_SCHEMA = 'refas.supported-clearance-report/v1';

const TAU = Math.PI * 2;
const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function evidence(value, label) {
  const refs = uniqueStrings(value);
  if (!refs.length) throw new Error(`${label} requires at least one evidence reference`);
  return refs;
}

function semanticsMaps(attachmentSemantics) {
  const entities = new Set(attachmentSemantics.entities.map((entity) => entity.id));
  const byRelation = new Map(attachmentSemantics.relations.map((relation) => [relation.id, relation]));
  const bySubject = new Map(attachmentSemantics.relations.map((relation) => [relation.subjectId, relation]));
  return {entities, byRelation, bySubject};
}

function validateSemantics(attachmentSemantics) {
  const validation = validateAttachmentSemantics(attachmentSemantics);
  if (!validation.valid) throw new Error(`attachment semantics is invalid: ${validation.errors.join('; ')}`);
  return semanticsMaps(attachmentSemantics);
}

function revoluteFrame(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return normalizeRigidFrame({origin: [0, 0, 0], xAxis: [c, s, 0], yAxis: [-s, c, 0], zAxis: [0, 0, 1]}, 'revoluteMotion');
}

export function createArticulatedJoint({attachmentSemantics, id, relationId, ownerJointFrame, subjectJointFrame, minimumAngle, maximumAngle, evidenceRefs = []} = {}) {
  const maps = validateSemantics(attachmentSemantics);
  const normalizedRelationId = assertId(relationId, 'relationId');
  const relation = maps.byRelation.get(normalizedRelationId);
  if (!relation) throw new Error('articulated joint references an unknown relation');
  if (relation.mode !== 'ARTICULATED') throw new Error(`relation ${relation.id} is ${relation.mode}, not ARTICULATED`);
  if (relation.ownerIds.length !== 1) throw new Error('ARTICULATED joint requires exactly one owner');
  const minimum = finite(minimumAngle, 'minimumAngle'), maximum = finite(maximumAngle, 'maximumAngle');
  if (minimum > maximum) throw new Error('minimumAngle must be <= maximumAngle');
  if (maximum - minimum > TAU + 1e-9) throw new Error('bounded REVOLUTE span must not exceed one full turn');
  const payload = {
    schema: ARTICULATED_JOINT_SCHEMA,
    id: assertId(id, 'id'), scopeId: attachmentSemantics.scopeId, sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest, relationId: relation.id, subjectId: relation.subjectId, ownerId: relation.ownerIds[0],
    jointType: 'REVOLUTE', axisConvention: 'owner-joint-z', zeroConfiguration: 'owner-and-subject-joint-frames-coincident',
    ownerJointFrame: normalizeRigidFrame(ownerJointFrame, 'ownerJointFrame'), subjectJointFrame: normalizeRigidFrame(subjectJointFrame, 'subjectJointFrame'),
    limits: {minimumAngle: minimum, maximumAngle: maximum}, evidenceRefs: evidence(evidenceRefs, 'evidenceRefs'),
    policy: {boundedRevoluteOnly: true, jointAxisIsOwnerFrameZ: true, subjectGeometryRemainsRigid: true, evaluationProducesTargetFrameOnly: true, jointDoesNotAuthorizeClosure: true},
  };
  return deepFreeze({...payload, jointDigest: digestJson(payload)});
}

export function validateArticulatedJoint(value, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== ARTICULATED_JOINT_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required to validate articulated joint');
    const recreated = createArticulatedJoint({attachmentSemantics, id: value.id, relationId: value.relationId, ownerJointFrame: value.ownerJointFrame, subjectJointFrame: value.subjectJointFrame, minimumAngle: value.limits?.minimumAngle, maximumAngle: value.limits?.maximumAngle, evidenceRefs: value.evidenceRefs});
    if (recreated.jointDigest !== value.jointDigest) errors.push('articulated joint digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('articulated joint is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function evaluateArticulatedJoint({joint, attachmentSemantics, ownerWorldFrame, angle, evidenceRefs = []} = {}) {
  const validation = validateArticulatedJoint(joint, attachmentSemantics);
  if (!validation.valid) throw new Error(`articulated joint is invalid: ${validation.errors.join('; ')}`);
  const normalizedAngle = finite(angle, 'angle');
  if (normalizedAngle < joint.limits.minimumAngle - 1e-12 || normalizedAngle > joint.limits.maximumAngle + 1e-12) throw new Error(`angle ${normalizedAngle} is outside articulated joint limits`);
  const ownerWorld = normalizeRigidFrame(ownerWorldFrame, 'ownerWorldFrame');
  const ownerJointWorld = composeRigidFrames(ownerWorld, joint.ownerJointFrame);
  const movedJointWorld = composeRigidFrames(ownerJointWorld, revoluteFrame(normalizedAngle));
  const subjectWorldFrame = composeRigidFrames(movedJointWorld, invertRigidFrame(joint.subjectJointFrame));
  const payload = {
    schema: ARTICULATED_JOINT_REPORT_SCHEMA, jointDigest: joint.jointDigest, scopeId: joint.scopeId, sourceSha256: joint.sourceSha256,
    attachmentSemanticsDigest: joint.attachmentSemanticsDigest, relationId: joint.relationId, subjectId: joint.subjectId, ownerId: joint.ownerId,
    angle: normalizedAngle, ownerWorldFrame: ownerWorld, subjectWorldFrame, evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {angleWithinDeclaredLimits: true, meshBytesAreNotMutated: true, targetFrameDoesNotAuthorizeClosure: true},
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateArticulatedJointReport(value, {joint, attachmentSemantics} = {}) {
  const errors = [];
  try {
    if (value?.schema !== ARTICULATED_JOINT_REPORT_SCHEMA) errors.push('invalid schema');
    const recreated = evaluateArticulatedJoint({joint, attachmentSemantics, ownerWorldFrame: value.ownerWorldFrame, angle: value.angle, evidenceRefs: value.evidenceRefs});
    if (recreated.reportDigest !== value.reportDigest) errors.push('articulated joint report digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('articulated joint report is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function normalizeSupportPath(rawPath, maps, subjectId) {
  if (!Array.isArray(rawPath) || rawPath.length < 2) throw new Error('supportPathEntityIds requires subject plus at least one support owner');
  const path = rawPath.map((id, index) => assertId(id, `supportPathEntityIds[${index}]`));
  if (path[0] !== subjectId) throw new Error('support path must begin at the SUPPORTED_CLEARANCE subject');
  if (new Set(path).size !== path.length) throw new Error('support path must be acyclic');
  for (const id of path) if (!maps.entities.has(id)) throw new Error(`support path references unknown entity ${id}`);
  const edges = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const childId = path[index], parentId = path[index + 1], relation = maps.bySubject.get(childId);
    if (!relation || !relation.ownerIds.includes(parentId)) throw new Error(`support path edge ${childId} -> ${parentId} is not declared by attachment semantics`);
    edges.push({childId, parentId});
  }
  return {path, edges};
}

export function createSupportedClearance({attachmentSemantics, id, relationId, supportPathEntityIds, supportProofBindings = [], clearanceBounds = [], evidenceRefs = []} = {}) {
  const maps = validateSemantics(attachmentSemantics);
  const normalizedRelationId = assertId(relationId, 'relationId');
  const relation = maps.byRelation.get(normalizedRelationId);
  if (!relation) throw new Error('supported-clearance contract references an unknown relation');
  if (relation.mode !== 'SUPPORTED_CLEARANCE') throw new Error(`relation ${relation.id} is ${relation.mode}, not SUPPORTED_CLEARANCE`);
  const support = normalizeSupportPath(supportPathEntityIds, maps, relation.subjectId);
  const proofBindings = supportProofBindings.map((raw, index) => ({
    childId: assertId(raw?.childId, `supportProofBindings[${index}].childId`), parentId: assertId(raw?.parentId, `supportProofBindings[${index}].parentId`),
    proofAttachmentId: assertId(raw?.proofAttachmentId, `supportProofBindings[${index}].proofAttachmentId`),
    proofChildModuleId: assertId(raw?.proofChildModuleId, `supportProofBindings[${index}].proofChildModuleId`), proofParentModuleId: assertId(raw?.proofParentModuleId, `supportProofBindings[${index}].proofParentModuleId`),
    evidenceRefs: evidence(raw?.evidenceRefs, `supportProofBindings[${index}].evidenceRefs`),
  })).sort((a, b) => `${a.childId}/${a.parentId}`.localeCompare(`${b.childId}/${b.parentId}`));
  if (proofBindings.length !== support.edges.length) throw new Error('support proof bindings must match the support path edges exactly');
  if (new Set(proofBindings.map((item) => `${item.childId}/${item.parentId}`)).size !== proofBindings.length) throw new Error('support proof bindings must be unique per edge');
  if (new Set(proofBindings.map((item) => item.proofAttachmentId)).size !== proofBindings.length) throw new Error('support proof attachment IDs must be unique');
  for (const edge of support.edges) if (!proofBindings.some((item) => item.childId === edge.childId && item.parentId === edge.parentId)) throw new Error(`support path edge ${edge.childId} -> ${edge.parentId} lacks a realized proof binding`);
  if (!clearanceBounds.length) throw new Error('SUPPORTED_CLEARANCE requires at least one explicit clearance bound');
  const bounds = clearanceBounds.map((raw, index) => {
    const counterpartId = assertId(raw?.counterpartId, `clearanceBounds[${index}].counterpartId`);
    if (!maps.entities.has(counterpartId) || counterpartId === relation.subjectId) throw new Error(`clearanceBounds[${index}] counterpart is invalid`);
    const minimumClearance = finite(raw?.minimumClearance, `clearanceBounds[${index}].minimumClearance`), maximumClearance = finite(raw?.maximumClearance, `clearanceBounds[${index}].maximumClearance`);
    if (minimumClearance < 0 || minimumClearance > maximumClearance) throw new Error(`clearanceBounds[${index}] requires 0 <= minimum <= maximum`);
    return {
      counterpartId, proofAttachmentId: assertId(raw?.proofAttachmentId, `clearanceBounds[${index}].proofAttachmentId`),
      subjectModuleId: assertId(raw?.subjectModuleId, `clearanceBounds[${index}].subjectModuleId`), counterpartModuleId: assertId(raw?.counterpartModuleId, `clearanceBounds[${index}].counterpartModuleId`),
      minimumClearance, maximumClearance, evidenceRefs: evidence(raw?.evidenceRefs, `clearanceBounds[${index}].evidenceRefs`),
    };
  }).sort((a, b) => a.counterpartId.localeCompare(b.counterpartId));
  if (new Set(bounds.map((item) => item.counterpartId)).size !== bounds.length) throw new Error('clearance counterparts must be unique');
  const payload = {
    schema: SUPPORTED_CLEARANCE_SCHEMA, id: assertId(id, 'id'), scopeId: attachmentSemantics.scopeId, sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest, relationId: relation.id, subjectId: relation.subjectId, directOwnerIds: [...relation.ownerIds].sort(),
    supportPathEntityIds: support.path, supportEdges: support.edges, supportProofBindings: proofBindings, clearanceBounds: bounds, evidenceRefs: evidence(evidenceRefs, 'evidenceRefs'),
    policy: {explicitSupportPathRequired: true, supportPathMustFollowAttachmentSemantics: true, proofModulePairMustMatchBinding: true, directContactWithClearanceCounterpartNotRequired: true, realizedAssemblyProofRequired: true, semanticContractDoesNotMoveGeometry: true, contractDoesNotAuthorizeClosure: true},
  };
  return deepFreeze({...payload, clearanceDigest: digestJson(payload)});
}

export function validateSupportedClearance(value, attachmentSemantics = null) {
  const errors = [];
  try {
    if (value?.schema !== SUPPORTED_CLEARANCE_SCHEMA) errors.push('invalid schema');
    if (!attachmentSemantics) throw new Error('attachmentSemantics is required to validate supported clearance');
    const recreated = createSupportedClearance({attachmentSemantics, id: value.id, relationId: value.relationId, supportPathEntityIds: value.supportPathEntityIds, supportProofBindings: value.supportProofBindings, clearanceBounds: value.clearanceBounds, evidenceRefs: value.evidenceRefs});
    if (recreated.clearanceDigest !== value.clearanceDigest) errors.push('supported-clearance digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('supported-clearance contract is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function evaluateSupportedClearance({contract, attachmentSemantics, realizedAssemblyProof, evidenceRefs = []} = {}) {
  const contractValidation = validateSupportedClearance(contract, attachmentSemantics);
  if (!contractValidation.valid) throw new Error(`supported-clearance contract is invalid: ${contractValidation.errors.join('; ')}`);
  const proofValidation = validateRealizedAssemblyProof(realizedAssemblyProof);
  if (!proofValidation.valid) throw new Error(`realized assembly proof is invalid: ${proofValidation.errors.join('; ')}`);
  const proofDigest = assertDigest(realizedAssemblyProof.proofDigest, 'realizedAssemblyProof.proofDigest');
  const checks = new Map(realizedAssemblyProof.attachmentChecks.map((check) => [check.id, check]));
  const supportResults = contract.supportProofBindings.map((binding) => {
    const check = checks.get(binding.proofAttachmentId);
    const modulePairPass = check?.childModuleId === binding.proofChildModuleId && check?.parentModuleId === binding.proofParentModuleId;
    const pass = Boolean(modulePairPass && check?.pass && check?.supportDerivedFromContact && Number(check?.penetrationDepth ?? Infinity) <= 1e-9);
    return {...binding, modulePairPass, pass};
  });
  const clearanceResults = contract.clearanceBounds.map((bound) => {
    const check = checks.get(bound.proofAttachmentId), signedClearance = Number(check?.signedClearance);
    const modulePairPass = check?.childModuleId === bound.subjectModuleId && check?.parentModuleId === bound.counterpartModuleId;
    const pass = Boolean(modulePairPass && check?.pass && Number.isFinite(signedClearance) && signedClearance >= bound.minimumClearance - 1e-9 && signedClearance <= bound.maximumClearance + 1e-9 && Number(check?.penetrationDepth ?? Infinity) <= 1e-9);
    return {...bound, signedClearance: Number.isFinite(signedClearance) ? signedClearance : null, modulePairPass, pass};
  });
  const satisfied = supportResults.every((result) => result.pass) && clearanceResults.every((result) => result.pass);
  const payload = {
    schema: SUPPORTED_CLEARANCE_REPORT_SCHEMA, clearanceDigest: contract.clearanceDigest, scopeId: contract.scopeId, sourceSha256: contract.sourceSha256,
    attachmentSemanticsDigest: contract.attachmentSemanticsDigest, realizedAssemblyProofDigest: proofDigest, status: satisfied ? 'SATISFIED' : 'BLOCKED', satisfied,
    supportResults, clearanceResults, evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {onlyDigestBoundRealizedAssemblyEvidenceIsAccepted: true, proofModulePairMustMatchBinding: true, blockedClearanceCannotBeTreatedAsSatisfied: true, evaluationDoesNotMoveGeometry: true, evaluationDoesNotAuthorizeClosure: true},
  };
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validateSupportedClearanceReport(value, {contract, attachmentSemantics, realizedAssemblyProof} = {}) {
  const errors = [];
  try {
    if (value?.schema !== SUPPORTED_CLEARANCE_REPORT_SCHEMA) errors.push('invalid schema');
    const recreated = evaluateSupportedClearance({contract, attachmentSemantics, realizedAssemblyProof, evidenceRefs: value.evidenceRefs});
    if (recreated.reportDigest !== value.reportDigest) errors.push('supported-clearance report digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('supported-clearance report is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

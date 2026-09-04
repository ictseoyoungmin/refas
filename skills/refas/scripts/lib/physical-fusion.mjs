import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {validateLogicalFusion} from './logical-fusion.mjs';
import {validateCanonicalEditIntent} from './canonical-edit.mjs';
import {composeRigidFrames, invertRigidFrame, normalizeRigidFrame} from './attachment-follow.mjs';
import {analyzeMesh, computeVertexNormals} from './mesh.mjs';

export const PHYSICAL_FUSION_PLAN_SCHEMA = 'refas.physical-fusion-plan/v1';
export const PHYSICAL_FUSION_REPORT_SCHEMA = 'refas.physical-fusion-report/v1';
export const FUSION_PROVENANCE_SCHEMA = 'refas.fusion-provenance/v1';

const STRATEGIES = new Set(['WELD_SHARED_BOUNDARY', 'SOLID_UNION']);
const TOPOLOGY_OBLIGATIONS = new Set(['watertight', 'manifold-shell', 'open-surface']);
const uniqueStrings = (values = []) => [...new Set((values ?? []).map(String).filter(Boolean))].sort();

function positive(value, label, {allowZero = false} = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new Error(`${label} must be ${allowZero ? '>= 0' : '> 0'}`);
  return number;
}

function evidence(values, label) {
  const refs = uniqueStrings(values);
  if (!refs.length) throw new Error(`${label} requires at least one evidence reference`);
  return refs;
}

export function physicalFusionGeometryDigest(mesh) {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices)) throw new Error('mesh positions and indices are required');
  const analysis = analyzeMesh(mesh);
  if (!analysis.valid) throw new Error('cannot digest an invalid mesh');
  return digestJson({positions: mesh.positions, indices: mesh.indices});
}

export function physicalFusionFrameDigest(frame) {
  return digestJson(normalizeRigidFrame(frame, 'fusionFrame'));
}

function normalizeMemberBinding(raw, index, group) {
  const label = `members[${index}]`;
  const memberId = assertId(raw?.memberId, `${label}.memberId`);
  if (!group.memberIds.includes(memberId)) throw new Error(`${label}.memberId is not in logical fusion group ${group.id}`);
  return {
    memberId,
    geometryDigest: assertDigest(raw?.geometryDigest, `${label}.geometryDigest`),
    frameDigest: assertDigest(raw?.frameDigest, `${label}.frameDigest`),
    materialRegionId: raw?.materialRegionId == null ? null : assertId(raw.materialRegionId, `${label}.materialRegionId`),
    evidenceRefs: evidence(raw?.evidenceRefs, `${label}.evidenceRefs`),
  };
}

function planMemberSpec(member) {
  return {
    memberId: member.memberId,
    geometryDigest: member.geometryDigest,
    frameDigest: member.frameDigest,
    materialRegionId: member.materialRegionId,
    evidenceRefs: member.evidenceRefs,
  };
}

export function createPhysicalFusionPlan({
  attachmentSemantics,
  logicalFusion,
  canonicalEditIntent,
  id,
  groupId,
  inputAssetSha256,
  preFusionCheckpointId,
  preFusionStateDigest,
  fusionRootFrame,
  members = [],
  strategy = 'WELD_SHARED_BOUNDARY',
  weldTolerance = 1e-6,
  topologyObligation = 'watertight',
  evidenceRefs = [],
} = {}) {
  const semanticValidation = validateAttachmentSemantics(attachmentSemantics);
  if (!semanticValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticValidation.errors.join('; ')}`);
  const fusionValidation = validateLogicalFusion(logicalFusion, attachmentSemantics);
  if (!fusionValidation.valid) throw new Error(`logical fusion is invalid: ${fusionValidation.errors.join('; ')}`);
  const editValidation = validateCanonicalEditIntent(canonicalEditIntent);
  if (!editValidation.valid) throw new Error(`canonical edit intent is invalid: ${editValidation.errors.join('; ')}`);
  if (canonicalEditIntent.editClass !== 'finalization') throw new Error('physical fusion requires a finalization edit intent');
  for (const operation of ['mesh-fuse', 'mesh-weld', 'internal-face-cleanup']) {
    if (!canonicalEditIntent.realizationOperations.includes(operation)) throw new Error(`physical fusion finalization intent must declare ${operation}`);
  }
  const normalizedGroupId = assertId(groupId, 'groupId');
  const group = logicalFusion.groups.find((entry) => entry.id === normalizedGroupId);
  if (!group) throw new Error(`unknown logical fusion group: ${normalizedGroupId}`);
  if (canonicalEditIntent.scopeId !== group.rootId) throw new Error('finalization edit scope must equal the logical fusion root');
  const normalizedMembers = members.map((member, index) => normalizeMemberBinding(member, index, group)).sort((a, b) => a.memberId.localeCompare(b.memberId));
  if (new Set(normalizedMembers.map((member) => member.memberId)).size !== normalizedMembers.length) throw new Error('physical fusion member IDs must be unique');
  const expected = [...group.memberIds].sort(), actual = normalizedMembers.map((member) => member.memberId);
  if (digestJson(actual) !== digestJson(expected)) throw new Error('physical fusion plan must cover exactly the logical fusion group members');
  const normalizedStrategy = String(strategy);
  if (!STRATEGIES.has(normalizedStrategy)) throw new Error(`strategy must be one of: ${[...STRATEGIES].join(', ')}`);
  const obligation = String(topologyObligation);
  if (!TOPOLOGY_OBLIGATIONS.has(obligation)) throw new Error(`topologyObligation must be one of: ${[...TOPOLOGY_OBLIGATIONS].join(', ')}`);
  const payload = {
    schema: PHYSICAL_FUSION_PLAN_SCHEMA,
    id: assertId(id, 'id'),
    scopeId: attachmentSemantics.scopeId,
    sourceSha256: attachmentSemantics.sourceSha256,
    attachmentSemanticsDigest: attachmentSemantics.semanticsDigest,
    logicalFusionDigest: logicalFusion.fusionDigest,
    canonicalEditIntentDigest: canonicalEditIntent.intentDigest,
    groupId: group.id,
    fusionRootId: group.rootId,
    inputAssetSha256: assertDigest(inputAssetSha256, 'inputAssetSha256'),
    preFusionCheckpointId: assertId(preFusionCheckpointId, 'preFusionCheckpointId'),
    preFusionStateDigest: assertDigest(preFusionStateDigest, 'preFusionStateDigest'),
    fusionRootFrame: normalizeRigidFrame(fusionRootFrame, 'fusionRootFrame'),
    fusionRootFrameDigest: physicalFusionFrameDigest(fusionRootFrame),
    members: normalizedMembers,
    strategy: normalizedStrategy,
    weldTolerance: positive(weldTolerance, 'weldTolerance'),
    topologyObligation: obligation,
    evidenceRefs: evidence(evidenceRefs, 'evidenceRefs'),
    policy: {
      logicalFusionGroupIsAuthority: true,
      exactPreFusionReopenStateRequired: true,
      nonFusionDependentsAreExcluded: true,
      physicalFusionIsFinalizationOnly: true,
      mergeOnlyCannotSatisfyFusion: true,
      solidUnionRequiresCompatibleBackend: true,
      fusedArtifactIsNotCanonicalReopenSource: true,
      provenanceIsRequired: true,
      planDoesNotAuthorizeClosure: true,
    },
  };
  return deepFreeze({...payload, planDigest: digestJson(payload)});
}

export function validatePhysicalFusionPlan(value, dependencies = {}) {
  const errors = [];
  try {
    if (value?.schema !== PHYSICAL_FUSION_PLAN_SCHEMA) errors.push('invalid schema');
    const recreated = createPhysicalFusionPlan({
      attachmentSemantics: dependencies.attachmentSemantics,
      logicalFusion: dependencies.logicalFusion,
      canonicalEditIntent: dependencies.canonicalEditIntent,
      id: value.id,
      groupId: value.groupId,
      inputAssetSha256: value.inputAssetSha256,
      preFusionCheckpointId: value.preFusionCheckpointId,
      preFusionStateDigest: value.preFusionStateDigest,
      fusionRootFrame: value.fusionRootFrame,
      members: (value.members ?? []).map(planMemberSpec),
      strategy: value.strategy,
      weldTolerance: value.weldTolerance,
      topologyObligation: value.topologyObligation,
      evidenceRefs: value.evidenceRefs,
    });
    if (recreated.planDigest !== value.planDigest) errors.push('physical fusion plan digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('physical fusion plan is not canonical');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function rotate(frame, vector) {
  return [0, 1, 2].map((axis) => frame.xAxis[axis] * vector[0] + frame.yAxis[axis] * vector[1] + frame.zAxis[axis] * vector[2]);
}
function transformPoint(frame, point) {
  const rotated = rotate(frame, point);
  return rotated.map((value, axis) => value + frame.origin[axis]);
}

function normalizeRealizedMember(raw, index, plan) {
  const label = `realizedMembers[${index}]`;
  const memberId = assertId(raw?.memberId, `${label}.memberId`);
  const binding = plan.members.find((entry) => entry.memberId === memberId);
  if (!binding) throw new Error(`${label}.memberId is outside the fusion plan`);
  const frame = normalizeRigidFrame(raw?.worldFrame, `${label}.worldFrame`);
  if (physicalFusionFrameDigest(frame) !== binding.frameDigest) throw new Error(`${memberId} frame digest does not match physical fusion plan`);
  const geometryDigest = physicalFusionGeometryDigest(raw?.mesh);
  if (geometryDigest !== binding.geometryDigest) throw new Error(`${memberId} geometry digest does not match physical fusion plan`);
  return {memberId, worldFrame: frame, mesh: raw.mesh, geometryDigest};
}

function parity(triangle) {
  const sorted = [...triangle].sort((a, b) => a - b);
  const order = triangle.map((value) => sorted.indexOf(value));
  let inversions = 0;
  for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) if (order[a] > order[b]) inversions += 1;
  return inversions % 2;
}

function weldVertices(sourceVertices, tolerance) {
  const vertices = [], sourceToWelded = new Array(sourceVertices.length), bins = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let index = 0; index < sourceVertices.length; index += 1) {
    const point = sourceVertices[index].position;
    const cell = point.map((value) => Math.floor(value / tolerance));
    let matched = -1;
    for (let dx = -1; dx <= 1 && matched < 0; dx += 1) for (let dy = -1; dy <= 1 && matched < 0; dy += 1) for (let dz = -1; dz <= 1 && matched < 0; dz += 1) {
      for (const candidate of bins.get(key(cell[0] + dx, cell[1] + dy, cell[2] + dz)) ?? []) {
        const other = vertices[candidate];
        if (Math.hypot(point[0] - other[0], point[1] - other[1], point[2] - other[2]) <= tolerance) { matched = candidate; break; }
      }
    }
    if (matched < 0) {
      matched = vertices.length; vertices.push([...point]);
      const binKey = key(...cell); const values = bins.get(binKey) ?? []; values.push(matched); bins.set(binKey, values);
    }
    sourceToWelded[index] = matched;
  }
  return {vertices, sourceToWelded};
}

function compactMesh(positions, faceRecords) {
  const used = [...new Set(faceRecords.flatMap((record) => record.triangle))].sort((a, b) => a - b);
  const map = new Map(used.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const compactPositions = used.map((index) => positions[index]);
  const compactFaces = faceRecords.map((record) => ({...record, triangle: record.triangle.map((index) => map.get(index))}));
  return {positions: compactPositions, faceRecords: compactFaces};
}

function connectedComponentCount(faceRecords) {
  if (!faceRecords.length) return 0;
  const vertexFaces = new Map();
  faceRecords.forEach((record, faceIndex) => record.triangle.forEach((vertex) => {
    const list = vertexFaces.get(vertex) ?? []; list.push(faceIndex); vertexFaces.set(vertex, list);
  }));
  const visited = new Set(); let components = 0;
  for (let start = 0; start < faceRecords.length; start += 1) if (!visited.has(start)) {
    components += 1; const queue = [start]; visited.add(start);
    while (queue.length) {
      const current = queue.shift();
      for (const vertex of faceRecords[current].triangle) for (const next of vertexFaces.get(vertex) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return components;
}

function nativeSharedBoundaryFusion(plan, realizedMembers) {
  const rootInverse = invertRigidFrame(plan.fusionRootFrame);
  const sourceVertices = [], sourceFaces = [];
  for (const member of realizedMembers) {
    const memberToRoot = composeRigidFrames(rootInverse, member.worldFrame);
    const offset = sourceVertices.length;
    member.mesh.positions.forEach((point, vertexIndex) => sourceVertices.push({position: transformPoint(memberToRoot, point), memberId: member.memberId, vertexIndex}));
    for (let faceIndex = 0; faceIndex < member.mesh.indices.length / 3; faceIndex += 1) {
      const source = member.mesh.indices.slice(faceIndex * 3, faceIndex * 3 + 3).map((index) => index + offset);
      sourceFaces.push({memberId: member.memberId, sourceFaceIndex: faceIndex, source});
    }
  }
  const welded = weldVertices(sourceVertices, plan.weldTolerance);
  const byFace = new Map(), active = [], removedInterfaces = [];
  let collapsedFaces = 0, sameWindingDuplicates = 0;
  for (const source of sourceFaces) {
    const triangle = source.source.map((index) => welded.sourceToWelded[index]);
    if (new Set(triangle).size < 3) { collapsedFaces += 1; continue; }
    const faceKey = [...triangle].sort((a, b) => a - b).join(':');
    const previous = byFace.get(faceKey);
    if (!previous) {
      const record = {triangle, memberId: source.memberId, sourceFaceIndex: source.sourceFaceIndex, active: true};
      byFace.set(faceKey, record); active.push(record); continue;
    }
    if (parity(previous.triangle) !== parity(triangle)) {
      previous.active = false;
      removedInterfaces.push({
        faceKey,
        sourceFaces: [
          {memberId: previous.memberId, sourceFaceIndex: previous.sourceFaceIndex},
          {memberId: source.memberId, sourceFaceIndex: source.sourceFaceIndex},
        ].sort((a, b) => `${a.memberId}:${a.sourceFaceIndex}`.localeCompare(`${b.memberId}:${b.sourceFaceIndex}`)),
      });
      byFace.delete(faceKey);
    } else sameWindingDuplicates += 1;
  }
  if (sameWindingDuplicates) throw new Error(`native physical fusion found ${sameWindingDuplicates} same-winding duplicate face(s)`);
  const kept = active.filter((record) => record.active);
  const compact = compactMesh(welded.vertices, kept);
  const indices = compact.faceRecords.flatMap((record) => record.triangle);
  const mesh = {positions: compact.positions, indices, normals: computeVertexNormals(compact.positions, indices)};
  const analysis = analyzeMesh(mesh);
  const components = connectedComponentCount(compact.faceRecords);
  return {
    backendId: 'refas.native-shared-boundary-weld/v1',
    mesh,
    faceRecords: compact.faceRecords,
    removedInterfaces,
    metrics: {
      inputVertices: sourceVertices.length,
      outputVertices: mesh.positions.length,
      inputTriangles: sourceFaces.length,
      outputTriangles: mesh.indices.length / 3,
      weldedVertexCount: sourceVertices.length - mesh.positions.length,
      internalInterfaceFacePairsRemoved: removedInterfaces.length,
      collapsedFaces,
      connectedComponents: components,
    },
    analysis,
  };
}

function normalizeBackendResult(raw, backendInputDigest, plan) {
  if (!raw) return null;
  if (raw.backendClass !== 'robust-solid-union') throw new Error('SOLID_UNION backend must declare backendClass robust-solid-union');
  if (assertDigest(raw.inputDigest, 'backendResult.inputDigest') !== backendInputDigest) throw new Error('SOLID_UNION backend result does not bind the exact fusion input');
  const mesh = raw.mesh;
  const analysis = analyzeMesh(mesh ?? {});
  if (!analysis.valid) throw new Error('SOLID_UNION backend returned an invalid mesh');
  const memberSet = new Set(plan.members.map((member) => member.memberId));
  const faceProvenance = (raw.faceProvenance ?? []).map((entry, index) => {
    const outputFaceIndex = Number(entry?.outputFaceIndex);
    if (!Number.isInteger(outputFaceIndex) || outputFaceIndex < 0 || outputFaceIndex >= mesh.indices.length / 3) throw new Error(`backend faceProvenance[${index}] outputFaceIndex is invalid`);
    const sourceMemberIds = uniqueStrings(entry?.sourceMemberIds);
    if (!sourceMemberIds.length || sourceMemberIds.some((id) => !memberSet.has(id))) throw new Error(`backend faceProvenance[${index}] references invalid fusion member provenance`);
    const origin = String(entry?.origin ?? '');
    if (!['preserved', 'weld-generated', 'boolean-generated'].includes(origin)) throw new Error(`backend faceProvenance[${index}].origin is invalid`);
    return {outputFaceIndex, sourceMemberIds, origin};
  }).sort((a, b) => a.outputFaceIndex - b.outputFaceIndex);
  if (faceProvenance.length !== mesh.indices.length / 3 || new Set(faceProvenance.map((entry) => entry.outputFaceIndex)).size !== faceProvenance.length) throw new Error('SOLID_UNION backend must provide provenance for every output face exactly once');
  return {
    backendId: assertId(raw.backendId, 'backendResult.backendId'),
    mesh: {...mesh, normals: mesh.normals?.length === mesh.positions.length ? mesh.normals : computeVertexNormals(mesh.positions, mesh.indices)},
    faceProvenance,
    analysis,
    metrics: {...raw.metrics, connectedComponents: Number(raw.metrics?.connectedComponents ?? 1)},
  };
}

function topologyPass(plan, analysis, components) {
  if (!analysis.valid || !analysis.windingConsistent || components !== 1) return false;
  if (plan.topologyObligation === 'watertight') return analysis.watertight;
  if (plan.topologyObligation === 'manifold-shell') return analysis.windingConsistent;
  return true;
}

function provenanceFromNative(plan, result) {
  const outputFaces = result.faceRecords.map((record, outputFaceIndex) => ({
    outputFaceIndex,
    sourceMemberIds: [record.memberId],
    sourceFaceRefs: [{memberId: record.memberId, sourceFaceIndex: record.sourceFaceIndex}],
    origin: 'preserved',
  }));
  return {outputFaces, removedInterfaces: result.removedInterfaces};
}

export function bakePhysicalFusion({
  plan,
  attachmentSemantics,
  logicalFusion,
  canonicalEditIntent,
  currentInputAssetSha256,
  currentPreFusionStateDigest,
  realizedMembers = [],
  backendResult = null,
  evidenceRefs = [],
} = {}) {
  const validation = validatePhysicalFusionPlan(plan, {attachmentSemantics, logicalFusion, canonicalEditIntent});
  if (!validation.valid) throw new Error(`physical fusion plan is invalid: ${validation.errors.join('; ')}`);
  if (assertDigest(currentInputAssetSha256, 'currentInputAssetSha256') !== plan.inputAssetSha256) throw new Error('physical fusion input asset is stale');
  if (assertDigest(currentPreFusionStateDigest, 'currentPreFusionStateDigest') !== plan.preFusionStateDigest) throw new Error('physical fusion pre-fusion semantic state is stale');
  const normalizedMembers = realizedMembers.map((member, index) => normalizeRealizedMember(member, index, plan)).sort((a, b) => a.memberId.localeCompare(b.memberId));
  if (digestJson(normalizedMembers.map((member) => member.memberId)) !== digestJson(plan.members.map((member) => member.memberId))) throw new Error('realizedMembers must cover exactly the fusion plan members');
  const backendInputDigest = digestJson({
    planDigest: plan.planDigest,
    members: normalizedMembers.map((member) => ({memberId: member.memberId, geometryDigest: member.geometryDigest, frameDigest: physicalFusionFrameDigest(member.worldFrame)})),
  });

  let result, status = 'BAKED', blockingReason = null;
  if (plan.strategy === 'WELD_SHARED_BOUNDARY') {
    result = nativeSharedBoundaryFusion(plan, normalizedMembers);
  } else {
    result = normalizeBackendResult(backendResult, backendInputDigest, plan);
    if (!result) { status = 'BLOCKED_BACKEND_REQUIRED'; blockingReason = 'SOLID_UNION requires an explicit robust-solid-union backend result bound to the exact fusion input'; }
  }

  if (!result) {
    const payload = {
      schema: PHYSICAL_FUSION_REPORT_SCHEMA,
      planDigest: plan.planDigest,
      scopeId: plan.scopeId,
      groupId: plan.groupId,
      status,
      blockingReason,
      backendInputDigest,
      backendId: null,
      inputAssetSha256: plan.inputAssetSha256,
      outputMeshDigest: null,
      provenanceDigest: null,
      topology: null,
      metrics: null,
      reopen: {checkpointId: plan.preFusionCheckpointId, stateDigest: plan.preFusionStateDigest},
      evidenceRefs: uniqueStrings(evidenceRefs),
      policy: {blockedBakeCannotBeRealized: true, fusedArtifactIsNotCanonicalReopenSource: true, reportDoesNotAuthorizeClosure: true},
    };
    return deepFreeze({report: {...payload, reportDigest: digestJson(payload)}, provenance: null, mesh: null});
  }

  const components = Number(result.metrics?.connectedComponents ?? connectedComponentCount((result.faceProvenance ?? []).map((entry, index) => ({triangle: result.mesh.indices.slice(index * 3, index * 3 + 3)}))));
  const pass = topologyPass(plan, result.analysis, components);
  if (!pass) { status = 'BLOCKED_TOPOLOGY'; blockingReason = `physical fusion output violates ${plan.topologyObligation} topology obligation`; }
  const rawProvenance = result.faceProvenance ? {
    outputFaces: result.faceProvenance.map((entry) => ({...entry, sourceFaceRefs: []})), removedInterfaces: [],
  } : provenanceFromNative(plan, result);
  const provenancePayload = {
    schema: FUSION_PROVENANCE_SCHEMA,
    planDigest: plan.planDigest,
    groupId: plan.groupId,
    fusionRootId: plan.fusionRootId,
    outputMeshDigest: physicalFusionGeometryDigest(result.mesh),
    sourceMemberIds: plan.members.map((member) => member.memberId),
    outputFaces: rawProvenance.outputFaces,
    removedInterfaces: rawProvenance.removedInterfaces,
    reopen: {
      checkpointId: plan.preFusionCheckpointId,
      stateDigest: plan.preFusionStateDigest,
      inputAssetSha256: plan.inputAssetSha256,
      canonicalSource: 'pre-fusion-semantic-state',
    },
    policy: {everyOutputFaceRequiresSemanticProvenance: true, booleanGeneratedFacesMayHaveMultipleSourceMembers: true, reopenNeverStartsFromFusedMesh: true},
  };
  const provenance = deepFreeze({...provenancePayload, provenanceDigest: digestJson(provenancePayload)});
  const reportPayload = {
    schema: PHYSICAL_FUSION_REPORT_SCHEMA,
    planDigest: plan.planDigest,
    scopeId: plan.scopeId,
    groupId: plan.groupId,
    status,
    blockingReason,
    backendInputDigest,
    backendId: result.backendId,
    inputAssetSha256: plan.inputAssetSha256,
    outputMeshDigest: provenance.outputMeshDigest,
    provenanceDigest: provenance.provenanceDigest,
    topology: {...result.analysis, connectedComponents: components, obligation: plan.topologyObligation, pass},
    metrics: result.metrics,
    reopen: {checkpointId: plan.preFusionCheckpointId, stateDigest: plan.preFusionStateDigest},
    evidenceRefs: uniqueStrings(evidenceRefs),
    policy: {onePhysicalMeshProduced: true, topologyMustPassBeforeRealization: true, fusedArtifactIsNotCanonicalReopenSource: true, reportDoesNotAuthorizeClosure: true},
  };
  const report = deepFreeze({...reportPayload, reportDigest: digestJson(reportPayload)});
  return deepFreeze({report, provenance, mesh: result.mesh});
}

export function validatePhysicalFusionResult(value, {plan, attachmentSemantics, logicalFusion, canonicalEditIntent, currentInputAssetSha256, currentPreFusionStateDigest, realizedMembers = [], backendResult = null} = {}) {
  const errors = [];
  try {
    const recreated = bakePhysicalFusion({plan, attachmentSemantics, logicalFusion, canonicalEditIntent, currentInputAssetSha256, currentPreFusionStateDigest, realizedMembers, backendResult, evidenceRefs: value?.report?.evidenceRefs});
    if (digestJson(recreated.report) !== digestJson(value?.report)) errors.push('physical fusion report mismatch');
    if (digestJson(recreated.provenance) !== digestJson(value?.provenance)) errors.push('physical fusion provenance mismatch');
    if (recreated.mesh && physicalFusionGeometryDigest(recreated.mesh) !== physicalFusionGeometryDigest(value?.mesh)) errors.push('physical fusion mesh mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function physicalFusionReopenTarget({report, provenance, memberId} = {}) {
  if (!report || report.schema !== PHYSICAL_FUSION_REPORT_SCHEMA) throw new Error('physical fusion report is required');
  if (!provenance || provenance.schema !== FUSION_PROVENANCE_SCHEMA) throw new Error('fusion provenance is required');
  const id = assertId(memberId, 'memberId');
  if (!provenance.sourceMemberIds.includes(id)) throw new Error(`member ${id} is not part of the physical fusion provenance`);
  if (report.provenanceDigest !== provenance.provenanceDigest || report.outputMeshDigest !== provenance.outputMeshDigest) throw new Error('report and provenance do not describe the same fused output');
  return deepFreeze({
    memberId: id,
    checkpointId: provenance.reopen.checkpointId,
    stateDigest: provenance.reopen.stateDigest,
    inputAssetSha256: provenance.reopen.inputAssetSha256,
    canonicalSource: 'pre-fusion-semantic-state',
    fusedOutputMustBeDiscardedBeforeEdit: true,
  });
}

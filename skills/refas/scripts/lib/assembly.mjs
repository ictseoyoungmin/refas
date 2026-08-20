import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const ASSEMBLY_CONTRACT_SCHEMA = 'refas.assembly-contract/v1';
const RELATION_KINDS = new Set(['in-front-of', 'overlaps', 'adjacent-to', 'attached-to', 'root-covered-by']);

function point2(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec2`);
  const point = value.map(Number);
  if (point.some((coordinate) => coordinate < 0 || coordinate > 1)) throw new Error(`${label} must use normalized image coordinates in [0,1]`);
  return point;
}

function polygon(value, label) {
  if (!Array.isArray(value) || value.length < 3) throw new Error(`${label} requires at least three points`);
  return value.map((point, index) => point2(point, `${label}[${index}]`));
}

function pointInPolygon(point, vertices) {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const a = vertices[index];
    const b = vertices[previous];
    const crossing = ((a[1] > point[1]) !== (b[1] > point[1]))
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1] + 1e-30) + a[0];
    if (crossing) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a, b, c, d, epsilon = 1e-10) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

function polygonsOverlap(a, b) {
  for (let left = 0; left < a.length; left += 1) {
    for (let right = 0; right < b.length; right += 1) {
      if (segmentsIntersect(a[left], a[(left + 1) % a.length], b[right], b[(right + 1) % b.length])) return true;
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

function distanceToPolygon(point, vertices) {
  if (pointInPolygon(point, vertices)) return 0;
  let minimum = Infinity;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
    minimum = Math.min(minimum, Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy)));
  }
  return minimum;
}

function findOcclusionCycle(parts, relations) {
  const graph = new Map(parts.map((part) => [part.id, []]));
  for (const relation of relations) if (relation.kind === 'in-front-of' || relation.kind === 'root-covered-by') graph.get(relation.subjectId).push(relation.objectId);
  const visiting = new Set();
  const complete = new Set();
  const walk = (id) => {
    if (visiting.has(id)) return true;
    if (complete.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) if (walk(next)) return true;
    visiting.delete(id);
    complete.add(id);
    return false;
  };
  return parts.some((part) => walk(part.id));
}

export function createAssemblyContract({
  scopeId,
  sourceSha256,
  parts = [],
  relations = [],
  supportZones = [],
  supportHypotheses = [],
  closedChildren = [],
  attestation,
  ambiguities = [],
} = {}) {
  if (attestation?.attested !== true || !Array.isArray(attestation.evidenceRefs) || !attestation.evidenceRefs.length) {
    throw new Error('assembly contract requires an evidence-cited agent attestation');
  }
  if (!parts.length) throw new Error('assembly contract requires observed parts');
  const normalizedParts = parts.map((raw, index) => {
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String);
    if (!evidenceRefs.length) throw new Error(`parts[${index}] requires evidenceRefs`);
    const depthBand = [...(raw.depthBand ?? [])].map(Number);
    if (depthBand.length !== 2 || !depthBand.every(Number.isFinite) || depthBand[0] > depthBand[1]) throw new Error(`parts[${index}].depthBand is invalid`);
    return {
      id: assertId(raw.id, `parts[${index}].id`),
      scopeId: assertId(raw.scopeId ?? scopeId, `parts[${index}].scopeId`),
      observedPolygon: polygon(raw.observedPolygon, `parts[${index}].observedPolygon`),
      rootAnchor: point2(raw.rootAnchor, `parts[${index}].rootAnchor`),
      depthBand,
      evidenceRefs,
    };
  });
  const partIds = new Set(normalizedParts.map((part) => part.id));
  if (partIds.size !== normalizedParts.length) throw new Error('assembly part IDs must be unique');
  const normalizedRelations = relations.map((raw, index) => {
    const kind = String(raw.kind ?? '');
    const subjectId = assertId(raw.subjectId, `relations[${index}].subjectId`);
    const objectId = assertId(raw.objectId, `relations[${index}].objectId`);
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String);
    if (!RELATION_KINDS.has(kind) || subjectId === objectId || !partIds.has(subjectId) || !partIds.has(objectId)) throw new Error(`relations[${index}] is invalid`);
    if (!evidenceRefs.length) throw new Error(`relations[${index}] requires evidenceRefs`);
    return {kind, subjectId, objectId, evidenceRefs};
  });
  if (findOcclusionCycle(normalizedParts, normalizedRelations)) throw new Error('assembly occlusion graph contains a cycle');
  const normalizedZones = supportZones.map((raw, index) => ({
    id: assertId(raw.id, `supportZones[${index}].id`),
    polygon: polygon(raw.polygon, `supportZones[${index}].polygon`),
    evidenceRefs: [...(raw.evidenceRefs ?? [])].map(String),
  }));
  const zoneIds = new Set(normalizedZones.map((zone) => zone.id));
  if (zoneIds.size !== normalizedZones.length) throw new Error('support zone IDs must be unique');
  const normalizedSupport = supportHypotheses.map((raw, index) => {
    const partId = assertId(raw.partId, `supportHypotheses[${index}].partId`);
    const ownerId = assertId(raw.ownerId, `supportHypotheses[${index}].ownerId`);
    const zoneId = assertId(raw.zoneId, `supportHypotheses[${index}].zoneId`);
    if (!partIds.has(partId) || !partIds.has(ownerId) || !zoneIds.has(zoneId)) throw new Error(`supportHypotheses[${index}] references an unknown part or zone`);
    if (raw.status === 'fact') throw new Error('hidden support may not be promoted to fact without direct evidence');
    return {partId, ownerId, zoneId, status: String(raw.status ?? 'bounded-hypothesis'), evidenceRefs: [...(raw.evidenceRefs ?? [])].map(String)};
  });
  const normalizedChildren = closedChildren.map((raw, index) => {
    const partId = assertId(raw.partId, `closedChildren[${index}].partId`);
    if (!partIds.has(partId)) throw new Error(`closedChildren[${index}] references an unknown part`);
    return {
      partId,
      frameId: assertId(raw.frameId, `closedChildren[${index}].frameId`),
      glbSha256: assertDigest(raw.glbSha256, `closedChildren[${index}].glbSha256`),
      registrationDigest: raw.registrationDigest ? assertDigest(raw.registrationDigest, `closedChildren[${index}].registrationDigest`) : null,
    };
  });
  const payload = {
    schema: ASSEMBLY_CONTRACT_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    parts: normalizedParts,
    relations: normalizedRelations,
    supportZones: normalizedZones,
    supportHypotheses: normalizedSupport,
    closedChildren: normalizedChildren,
    attestation: {evidenceRefs: attestation.evidenceRefs.map(String), digest: digestJson(attestation)},
    ambiguities: ambiguities.map(String),
    policy: {
      visibleEvidenceOutranksHiddenSupportGuess: true,
      hiddenSupportRemainsHypothesis: true,
      occlusionGraphMustBeAcyclic: true,
      observedOverlapRequiresProjectedOverlap: true,
      depthIncreasesTowardCamera: true,
      closedChildBytesRemainImmutable: true,
      actualParentRenderRequiredForClosure: true,
    },
  };
  return deepFreeze({...payload, contractDigest: digestJson(payload)});
}

export function validateAssemblyContract(contract) {
  const errors = [];
  if (contract?.schema !== ASSEMBLY_CONTRACT_SCHEMA) errors.push('invalid schema');
  if (contract?.policy?.closedChildBytesRemainImmutable !== true) errors.push('closed-child immutability policy missing');
  if (contract?.policy?.depthIncreasesTowardCamera !== true) errors.push('depth convention missing');
  try {
    createAssemblyContract({
      scopeId: contract.scopeId,
      sourceSha256: contract.sourceSha256,
      parts: contract.parts,
      relations: contract.relations,
      supportZones: contract.supportZones,
      supportHypotheses: contract.supportHypotheses,
      closedChildren: contract.closedChildren,
      attestation: {attested: true, evidenceRefs: contract.attestation?.evidenceRefs ?? []},
      ambiguities: contract.ambiguities,
    });
    const payload = structuredClone(contract);
    delete payload.contractDigest;
    if (digestJson(payload) !== contract.contractDigest) errors.push('assembly contract digest mismatch');
    if (findOcclusionCycle(contract.parts, contract.relations)) errors.push('occlusion graph cycle');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateRealizedAssembly({contract, realizedParts = [], compositionReports = [], rootTolerance = 0.03, depthTolerance = 0.005} = {}) {
  const contractValidation = validateAssemblyContract(contract);
  if (!contractValidation.valid) throw new Error(`assembly contract is invalid: ${contractValidation.errors.join('; ')}`);
  const errors = [];
  const byId = new Map(realizedParts.map((part) => [part.id, part]));
  const relationChecks = [];
  const supportChecks = [];
  let projectedOverlapFailures = 0;
  let depthOrderFailures = 0;
  let depthBandFailures = 0;
  let supportFailures = 0;
  let penetrationCount = 0;
  for (const expected of contract.parts) {
    const realized = byId.get(expected.id);
    if (!realized) {
      errors.push(`${expected.id}: realization missing`);
      continue;
    }
    if (!Array.isArray(realized.projectedPolygon) || realized.projectedPolygon.length < 3) errors.push(`${expected.id}: projectedPolygon missing`);
    if (!Array.isArray(realized.rootAnchor) || realized.rootAnchor.length !== 2) errors.push(`${expected.id}: rootAnchor missing`);
    if (!Number.isFinite(realized.depth)) errors.push(`${expected.id}: depth missing`);
    if (Number.isFinite(realized.depth) && (realized.depth < expected.depthBand[0] - depthTolerance || realized.depth > expected.depthBand[1] + depthTolerance)) {
      depthBandFailures += 1;
      errors.push(`${expected.id}: depth escaped the observed band`);
    }
    penetrationCount += Number(realized.penetrationCount ?? 0);
    if (realized.meshAnalysis && (realized.meshAnalysis.valid !== true || realized.meshAnalysis.watertight !== true)) errors.push(`${expected.id}: mesh integrity failed`);
  }
  for (const relation of contract.relations) {
    const subject = byId.get(relation.subjectId);
    const object = byId.get(relation.objectId);
    if (!subject || !object) continue;
    let overlap = null;
    let depthPass = null;
    if (relation.kind === 'overlaps' || relation.kind === 'in-front-of' || relation.kind === 'root-covered-by' || relation.kind === 'attached-to') {
      overlap = polygonsOverlap(subject.projectedPolygon, object.projectedPolygon);
      if (!overlap) {
        projectedOverlapFailures += 1;
        errors.push(`${relation.kind}: ${relation.subjectId} and ${relation.objectId} do not overlap in reference space`);
      }
    }
    if (relation.kind === 'in-front-of' || relation.kind === 'root-covered-by') {
      depthPass = subject.depth > object.depth + depthTolerance;
      if (!depthPass) {
        depthOrderFailures += 1;
        errors.push(`${relation.kind}: ${relation.subjectId} is not in front of ${relation.objectId}`);
      }
    }
    relationChecks.push({...relation, projectedOverlap: overlap, depthPass});
  }
  const zones = new Map(contract.supportZones.map((zone) => [zone.id, zone]));
  for (const support of contract.supportHypotheses) {
    const realized = byId.get(support.partId);
    const zone = zones.get(support.zoneId);
    if (!realized || !zone) continue;
    const distance = distanceToPolygon(realized.rootAnchor, zone.polygon);
    const pass = distance <= rootTolerance && realized.supported === true;
    if (!pass) {
      supportFailures += 1;
      errors.push(`${support.partId}: root is unsupported or outside ${support.zoneId}`);
    }
    supportChecks.push({partId: support.partId, ownerId: support.ownerId, zoneId: support.zoneId, distance, pass});
  }
  const reports = new Map(compositionReports.map((report) => [report.partId, report]));
  let closedChildIntegrityFailures = 0;
  for (const child of contract.closedChildren) {
    const report = reports.get(child.partId);
    if (!report || report.sourceGlbSha256 !== child.glbSha256 || report.sourceBinaryPrefixPreserved !== true) {
      closedChildIntegrityFailures += 1;
      errors.push(`${child.partId}: immutable child composition evidence failed`);
    }
  }
  if (penetrationCount > 0) errors.push(`assembly contains ${penetrationCount} penetration findings`);
  const metrics = {
    partCount: contract.parts.length,
    relationCount: contract.relations.length,
    projectedOverlapFailures,
    depthOrderFailures,
    depthBandFailures,
    supportFailures,
    penetrationCount,
    closedChildIntegrityFailures,
  };
  const payload = {
    schema: 'refas.assembly-validation/v1',
    contractDigest: contract.contractDigest,
    valid: errors.length === 0,
    errors,
    metrics,
    relationChecks,
    supportChecks,
  };
  return deepFreeze({...payload, validationDigest: digestJson(payload)});
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const REFERENCE_GEOMETRY_SCHEMA = 'refas.reference-geometry/v1';
export const REFERENCE_GEOMETRY_IMPORTANCE = Object.freeze(['macro', 'identity', 'detail']);
export const REFERENCE_GEOMETRY_VISIBILITY = Object.freeze(['visible', 'partially-occluded', 'occluded', 'inferred']);
export const REFERENCE_SEGMENT_SEPARATION = Object.freeze(['explicit', 'suggested', 'uncertain']);
export const REFERENCE_INTERFACE_KINDS = Object.freeze([
  'joint-gap',
  'joint-boundary',
  'seam',
  'overlap-boundary',
  'necked-transition',
  'contact-boundary',
  'unknown',
]);

const IMPORTANCE = new Set(REFERENCE_GEOMETRY_IMPORTANCE);
const VISIBILITY = new Set(REFERENCE_GEOMETRY_VISIBILITY);
const SEGMENT_SEPARATION = new Set(REFERENCE_SEGMENT_SEPARATION);
const INTERFACE_KINDS = new Set(REFERENCE_INTERFACE_KINDS);
const CONTACT_RELATIONS = new Set(['touching', 'near', 'supported-by', 'coincident']);
const DIMENSION_KINDS = new Set(['distance', 'horizontal-span', 'vertical-span']);

function normalizeStrings(values, label, {required = false} = {}) {
  const out = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && !out.length) throw new Error(`${label} requires at least one evidence reference`);
  return out;
}

function normalizeImportance(value, label) {
  const importance = String(value ?? 'detail').toLowerCase();
  if (!IMPORTANCE.has(importance)) throw new Error(`${label} must be one of: ${REFERENCE_GEOMETRY_IMPORTANCE.join(', ')}`);
  return importance;
}

function normalizeVisibility(value, label, fallback = 'visible') {
  const visibility = String(value ?? fallback).toLowerCase();
  if (!VISIBILITY.has(visibility)) throw new Error(`${label} must be one of: ${REFERENCE_GEOMETRY_VISIBILITY.join(', ')}`);
  return visibility;
}

function normalizePoint(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite [x, y] point`);
  const point = value.map(Number);
  if (point.some((component) => component < 0 || component > 1)) throw new Error(`${label} must use normalized image coordinates in [0, 1]`);
  return point;
}

function normalizePolyline(values, label, {minimum = 2, closed = false} = {}) {
  const points = (values ?? []).map((point, index) => normalizePoint(point, `${label}[${index}]`));
  if (points.length < minimum) throw new Error(`${label} requires at least ${minimum} points`);
  if (closed && polygonArea(points) < 1e-6) throw new Error(`${label} is degenerate`);
  return points;
}

function normalizePrimitiveBase(raw, label) {
  return {
    id: assertId(raw?.id, `${label}.id`),
    importance: normalizeImportance(raw?.importance, `${label}.importance`),
    evidenceRefs: normalizeStrings(raw?.evidenceRefs, `${label}.evidenceRefs`, {required: true}),
  };
}

function uniqueIds(items) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`reference geometry IDs must be globally unique; duplicate: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) * 0.5;
}

function assertNo3dFields(raw, label) {
  if (!raw || typeof raw !== 'object') return;
  for (const key of ['xyz', 'z', 'point3d', 'position3d', 'depth', 'depthBand', 'localPoint']) {
    if (key in raw) throw new Error(`${label} must not contain 3D geometry field: ${key}`);
  }
}

export function createReferenceGeometry({
  scopeId,
  sourceSha256,
  anchors = [],
  chains = [],
  axes = [],
  segments = [],
  interfaces = [],
  contacts = [],
  occlusions = [],
  negativeSpaces = [],
  contours = [],
  dimensions = [],
  attestation,
} = {}) {
  const normalizedAnchors = anchors.map((raw, index) => {
    assertNo3dFields(raw, `anchors[${index}]`);
    const base = normalizePrimitiveBase(raw, `anchors[${index}]`);
    const confidence = Number(raw?.confidence ?? 1);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`anchors[${index}].confidence must be in [0, 1]`);
    return {
      ...base,
      xy: normalizePoint(raw?.xy, `anchors[${index}].xy`),
      visibility: normalizeVisibility(raw?.visibility, `anchors[${index}].visibility`),
      confidence,
      semanticRole: String(raw?.semanticRole ?? ''),
    };
  });
  const anchorIds = new Set(normalizedAnchors.map((item) => item.id));

  const normalizedChains = chains.map((raw, index) => {
    assertNo3dFields(raw, `chains[${index}]`);
    const base = normalizePrimitiveBase(raw, `chains[${index}]`);
    const anchorIdsValue = (raw?.anchorIds ?? []).map((value, anchorIndex) => assertId(value, `chains[${index}].anchorIds[${anchorIndex}]`));
    if (anchorIdsValue.length < 2) throw new Error(`chains[${index}].anchorIds requires at least two anchors`);
    for (const id of anchorIdsValue) if (!anchorIds.has(id)) throw new Error(`chains[${index}] references unknown anchor: ${id}`);
    return {...base, anchorIds: anchorIdsValue, closed: raw?.closed === true};
  });

  const normalizedAxes = axes.map((raw, index) => {
    assertNo3dFields(raw, `axes[${index}]`);
    const base = normalizePrimitiveBase(raw, `axes[${index}]`);
    const fromAnchorId = assertId(raw?.fromAnchorId, `axes[${index}].fromAnchorId`);
    const toAnchorId = assertId(raw?.toAnchorId, `axes[${index}].toAnchorId`);
    if (fromAnchorId === toAnchorId) throw new Error(`axes[${index}] endpoints must differ`);
    for (const id of [fromAnchorId, toAnchorId]) if (!anchorIds.has(id)) throw new Error(`axes[${index}] references unknown anchor: ${id}`);
    return {...base, fromAnchorId, toAnchorId};
  });

  const normalizedSegments = segments.map((raw, index) => {
    assertNo3dFields(raw, `segments[${index}]`);
    const base = normalizePrimitiveBase(raw, `segments[${index}]`);
    const separation = String(raw?.separation ?? 'uncertain').toLowerCase();
    if (!SEGMENT_SEPARATION.has(separation)) throw new Error(`segments[${index}].separation must be one of: ${REFERENCE_SEGMENT_SEPARATION.join(', ')}`);
    const polygon = normalizePolyline(raw?.polygon, `segments[${index}].polygon`, {minimum: 3, closed: true});
    const anchorIdsValue = (raw?.anchorIds ?? []).map((value, anchorIndex) => assertId(value, `segments[${index}].anchorIds[${anchorIndex}]`));
    for (const id of anchorIdsValue) if (!anchorIds.has(id)) throw new Error(`segments[${index}] references unknown anchor: ${id}`);
    return {
      ...base,
      label: String(raw?.label ?? ''),
      polygon,
      anchorIds: anchorIdsValue,
      visibility: normalizeVisibility(raw?.visibility, `segments[${index}].visibility`),
      separation,
    };
  });
  const segmentIds = new Set(normalizedSegments.map((item) => item.id));

  const normalizedInterfaces = interfaces.map((raw, index) => {
    assertNo3dFields(raw, `interfaces[${index}]`);
    const base = normalizePrimitiveBase(raw, `interfaces[${index}]`);
    const subjectSegmentId = assertId(raw?.subjectSegmentId, `interfaces[${index}].subjectSegmentId`);
    const objectSegmentId = assertId(raw?.objectSegmentId, `interfaces[${index}].objectSegmentId`);
    if (subjectSegmentId === objectSegmentId) throw new Error(`interfaces[${index}] must connect two different segments`);
    for (const id of [subjectSegmentId, objectSegmentId]) if (!segmentIds.has(id)) throw new Error(`interfaces[${index}] references unknown segment: ${id}`);
    const kind = String(raw?.kind ?? 'unknown').toLowerCase();
    if (!INTERFACE_KINDS.has(kind)) throw new Error(`interfaces[${index}].kind must be one of: ${REFERENCE_INTERFACE_KINDS.join(', ')}`);
    const separation = String(raw?.separation ?? 'uncertain').toLowerCase();
    if (!SEGMENT_SEPARATION.has(separation)) throw new Error(`interfaces[${index}].separation must be one of: ${REFERENCE_SEGMENT_SEPARATION.join(', ')}`);
    return {
      ...base,
      subjectSegmentId,
      objectSegmentId,
      kind,
      separation,
      boundary: normalizePolyline(raw?.boundary, `interfaces[${index}].boundary`, {minimum: 2}),
      visibility: normalizeVisibility(raw?.visibility, `interfaces[${index}].visibility`),
    };
  });

  const normalizedContacts = contacts.map((raw, index) => {
    assertNo3dFields(raw, `contacts[${index}]`);
    const base = normalizePrimitiveBase(raw, `contacts[${index}]`);
    const aAnchorId = assertId(raw?.aAnchorId, `contacts[${index}].aAnchorId`);
    const bAnchorId = assertId(raw?.bAnchorId, `contacts[${index}].bAnchorId`);
    for (const id of [aAnchorId, bAnchorId]) if (!anchorIds.has(id)) throw new Error(`contacts[${index}] references unknown anchor: ${id}`);
    const relation = String(raw?.relation ?? 'touching').toLowerCase();
    if (!CONTACT_RELATIONS.has(relation)) throw new Error(`contacts[${index}].relation is invalid`);
    const toleranceNormalized = Number(raw?.toleranceNormalized ?? 0.02);
    if (!Number.isFinite(toleranceNormalized) || toleranceNormalized < 0 || toleranceNormalized > 1) throw new Error(`contacts[${index}].toleranceNormalized must be in [0, 1]`);
    return {...base, aAnchorId, bAnchorId, relation, toleranceNormalized};
  });

  uniqueIds([
    ...normalizedAnchors,
    ...normalizedChains,
    ...normalizedAxes,
    ...normalizedSegments,
    ...normalizedInterfaces,
  ]);

  const knownGeometryIds = new Set([
    ...normalizedAnchors.map((item) => item.id),
    ...normalizedChains.map((item) => item.id),
    ...normalizedAxes.map((item) => item.id),
    ...normalizedSegments.map((item) => item.id),
  ]);
  const normalizedOcclusions = occlusions.map((raw, index) => {
    assertNo3dFields(raw, `occlusions[${index}]`);
    const base = normalizePrimitiveBase(raw, `occlusions[${index}]`);
    const frontId = assertId(raw?.frontId, `occlusions[${index}].frontId`);
    const backId = assertId(raw?.backId, `occlusions[${index}].backId`);
    if (frontId === backId) throw new Error(`occlusions[${index}] frontId and backId must differ`);
    for (const id of [frontId, backId]) if (!knownGeometryIds.has(id)) throw new Error(`occlusions[${index}] references unknown geometry primitive: ${id}`);
    return {...base, frontId, backId};
  });

  const normalizedNegativeSpaces = negativeSpaces.map((raw, index) => {
    assertNo3dFields(raw, `negativeSpaces[${index}]`);
    const base = normalizePrimitiveBase(raw, `negativeSpaces[${index}]`);
    return {...base, polygon: normalizePolyline(raw?.polygon, `negativeSpaces[${index}].polygon`, {minimum: 3, closed: true})};
  });

  const normalizedContours = contours.map((raw, index) => {
    assertNo3dFields(raw, `contours[${index}]`);
    const base = normalizePrimitiveBase(raw, `contours[${index}]`);
    return {...base, points: normalizePolyline(raw?.points, `contours[${index}].points`, {minimum: raw?.closed === true ? 3 : 2}), closed: raw?.closed === true};
  });

  const normalizedDimensions = dimensions.map((raw, index) => {
    assertNo3dFields(raw, `dimensions[${index}]`);
    const base = normalizePrimitiveBase(raw, `dimensions[${index}]`);
    const aAnchorId = assertId(raw?.aAnchorId, `dimensions[${index}].aAnchorId`);
    const bAnchorId = assertId(raw?.bAnchorId, `dimensions[${index}].bAnchorId`);
    for (const id of [aAnchorId, bAnchorId]) if (!anchorIds.has(id)) throw new Error(`dimensions[${index}] references unknown anchor: ${id}`);
    const kind = String(raw?.kind ?? 'distance').toLowerCase();
    if (!DIMENSION_KINDS.has(kind)) throw new Error(`dimensions[${index}].kind is invalid`);
    return {...base, aAnchorId, bAnchorId, kind};
  });

  uniqueIds([
    ...normalizedAnchors,
    ...normalizedChains,
    ...normalizedAxes,
    ...normalizedSegments,
    ...normalizedInterfaces,
    ...normalizedContacts,
    ...normalizedOcclusions,
    ...normalizedNegativeSpaces,
    ...normalizedContours,
    ...normalizedDimensions,
  ]);

  const attestationEvidenceRefs = normalizeStrings(attestation?.evidenceRefs, 'attestation.evidenceRefs', {required: true});
  if (attestation?.attested !== true) throw new Error('reference geometry requires an evidence-cited attestation');

  const payload = {
    schema: REFERENCE_GEOMETRY_SCHEMA,
    scopeId: assertId(scopeId, 'scopeId'),
    sourceSha256: assertDigest(sourceSha256, 'sourceSha256'),
    coordinateSpace: {kind: 'normalized-image', origin: 'top-left', xRange: [0, 1], yRange: [0, 1]},
    anchors: normalizedAnchors,
    chains: normalizedChains,
    axes: normalizedAxes,
    segments: normalizedSegments,
    interfaces: normalizedInterfaces,
    contacts: normalizedContacts,
    occlusions: normalizedOcclusions,
    negativeSpaces: normalizedNegativeSpaces,
    contours: normalizedContours,
    dimensions: normalizedDimensions,
    attestation: {evidenceRefs: attestationEvidenceRefs, digest: digestJson({attested: true, evidenceRefs: attestationEvidenceRefs})},
    policy: {
      rawSourceRemainsPrimary: true,
      geometryIsObservedSourceEvidence: true,
      referenceGeometryContainsNo3dCoordinates: true,
      observedSegmentationPrecedesPhysicalAssembly: true,
      segmentSeparationMayRemainUncertain: true,
      modelProjectionMustBindSeparately: true,
      framingRegistrationCannotClaimShapeTruth: true,
    },
  };
  return deepFreeze({...payload, geometryDigest: digestJson(payload)});
}

export function validateReferenceGeometry(geometry) {
  const errors = [];
  if (geometry?.schema !== REFERENCE_GEOMETRY_SCHEMA) errors.push('invalid schema');
  try {
    const recreated = createReferenceGeometry({
      scopeId: geometry?.scopeId,
      sourceSha256: geometry?.sourceSha256,
      anchors: geometry?.anchors,
      chains: geometry?.chains,
      axes: geometry?.axes,
      segments: geometry?.segments,
      interfaces: geometry?.interfaces,
      contacts: geometry?.contacts,
      occlusions: geometry?.occlusions,
      negativeSpaces: geometry?.negativeSpaces,
      contours: geometry?.contours,
      dimensions: geometry?.dimensions,
      attestation: {attested: true, evidenceRefs: geometry?.attestation?.evidenceRefs ?? []},
    });
    if (recreated.geometryDigest !== geometry?.geometryDigest) errors.push('reference geometry normalization mismatch');
    const payload = structuredClone(geometry);
    delete payload.geometryDigest;
    if (digestJson(payload) !== geometry?.geometryDigest) errors.push('reference geometry digest mismatch');
    const policy = geometry?.policy ?? {};
    if (policy.rawSourceRemainsPrimary !== true || policy.geometryIsObservedSourceEvidence !== true) errors.push('source authority policy is missing');
    if (policy.referenceGeometryContainsNo3dCoordinates !== true || policy.modelProjectionMustBindSeparately !== true) errors.push('2D/3D separation policy is missing');
    if (policy.observedSegmentationPrecedesPhysicalAssembly !== true || policy.segmentSeparationMayRemainUncertain !== true) errors.push('observed segmentation policy is missing');
    if (policy.framingRegistrationCannotClaimShapeTruth !== true) errors.push('registration scope policy is missing');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

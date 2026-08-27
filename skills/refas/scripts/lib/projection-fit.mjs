import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validateReferenceGeometry} from './reference-geometry.mjs';

export const PROJECTION_FIT_SCHEMA = 'refas.projection-fit/v1';

const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
function angleDelta(a, b) {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}
function rmse(values) {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : null;
}
function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function finitePoint(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite [x, y] point`);
  return value.map(Number);
}
function sourcePoint(value, label) {
  const normalized = finitePoint(value, label);
  if (normalized.some((v) => v < 0 || v > 1)) throw new Error(`${label} must be normalized to [0, 1]`);
  return normalized;
}
function point3(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite [x, y, z] point`);
  return value.map(Number);
}
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) * 0.5;
}
function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
function polygonIoU(a, b, resolution = 96) {
  if (a.length < 3 || b.length < 3 || polygonArea(a) < 1e-9 || polygonArea(b) < 1e-9) return 0;
  const xs = [...a, ...b].map((p) => p[0]), ys = [...a, ...b].map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX < 1e-9 || maxY - minY < 1e-9) return 0;
  let intersection = 0, union = 0;
  for (let iy = 0; iy < resolution; iy += 1) {
    const y = minY + ((iy + 0.5) / resolution) * (maxY - minY);
    for (let ix = 0; ix < resolution; ix += 1) {
      const x = minX + ((ix + 0.5) / resolution) * (maxX - minX);
      const ia = pointInPolygon([x, y], a), ib = pointInPolygon([x, y], b);
      if (ia || ib) union += 1;
      if (ia && ib) intersection += 1;
    }
  }
  return union ? intersection / union : 0;
}
function normalizeBinding(raw, label) {
  const kind = String(raw?.kind ?? 'node-local-point');
  if (kind !== 'node-local-point' && kind !== 'world-point') throw new Error(`${label}.kind is invalid`);
  const binding = {kind};
  if (kind === 'node-local-point') {
    binding.nodeId = assertId(raw?.nodeId, `${label}.nodeId`);
    binding.localPoint = point3(raw?.localPoint ?? [0, 0, 0], `${label}.localPoint`);
  } else {
    binding.worldPoint = point3(raw?.worldPoint, `${label}.worldPoint`);
  }
  return binding;
}

export function createProjectionFit({
  referenceGeometry,
  cameraHypothesisId,
  cameraDigest,
  modelBindingDigest,
  anchorProjections = [],
  negativeSpaceProjections = [],
  occlusionDepths = [],
  evidenceRefs = [],
} = {}) {
  const validation = validateReferenceGeometry(referenceGeometry);
  if (!validation.valid) throw new Error(`referenceGeometry is invalid: ${validation.errors.join('; ')}`);
  const anchorById = new Map(referenceGeometry.anchors.map((anchor) => [anchor.id, anchor]));
  const projectedById = new Map();
  const normalizedAnchorProjections = anchorProjections.map((raw, index) => {
    const referenceId = assertId(raw?.referenceId, `anchorProjections[${index}].referenceId`);
    const reference = anchorById.get(referenceId);
    if (!reference) throw new Error(`anchorProjections[${index}] references unknown anchor: ${referenceId}`);
    if (projectedById.has(referenceId)) throw new Error(`duplicate anchor projection: ${referenceId}`);
    const projectedXY = finitePoint(raw?.projectedXY, `anchorProjections[${index}].projectedXY`);
    const errorNormalized = distance2(reference.xy, projectedXY);
    const item = {
      referenceId,
      importance: reference.importance,
      sourceXY: reference.xy,
      projectedXY,
      insideFrame: projectedXY.every((value) => value >= 0 && value <= 1),
      errorNormalized,
      binding: normalizeBinding(raw?.binding, `anchorProjections[${index}].binding`),
      evidenceRefs: [...new Set((raw?.evidenceRefs ?? []).map(String).filter(Boolean))].sort(),
    };
    projectedById.set(referenceId, item);
    return item;
  });
  const requiredMacroIds = referenceGeometry.anchors.filter((anchor) => anchor.importance === 'macro').map((anchor) => anchor.id);
  const missingMacro = requiredMacroIds.filter((id) => !projectedById.has(id));
  if (missingMacro.length) throw new Error(`projection fit is missing macro anchors: ${missingMacro.join(', ')}`);

  const chainResiduals = referenceGeometry.chains.flatMap((chain) => {
    const values = [];
    for (let i = 0; i < chain.anchorIds.length - 1; i += 1) {
      const aId = chain.anchorIds[i], bId = chain.anchorIds[i + 1];
      const aSource = anchorById.get(aId)?.xy, bSource = anchorById.get(bId)?.xy;
      const aProjected = projectedById.get(aId)?.projectedXY, bProjected = projectedById.get(bId)?.projectedXY;
      if (!aProjected || !bProjected) continue;
      values.push({segment: `${aId}->${bId}`, angleErrorRadians: angleDelta(angle(aSource, bSource), angle(aProjected, bProjected)), lengthErrorNormalized: Math.abs(distance2(aSource, bSource) - distance2(aProjected, bProjected))});
    }
    return [{id: chain.id, importance: chain.importance, segments: values, angleRmseRadians: rmse(values.map((item) => item.angleErrorRadians)), lengthRmseNormalized: rmse(values.map((item) => item.lengthErrorNormalized))}];
  });

  const axisResiduals = referenceGeometry.axes.map((axis) => {
    const a = projectedById.get(axis.fromAnchorId)?.projectedXY, b = projectedById.get(axis.toAnchorId)?.projectedXY;
    if (!a || !b) return {id: axis.id, importance: axis.importance, evaluable: false, angleErrorRadians: null};
    return {id: axis.id, importance: axis.importance, evaluable: true, angleErrorRadians: angleDelta(angle(anchorById.get(axis.fromAnchorId).xy, anchorById.get(axis.toAnchorId).xy), angle(a, b))};
  });

  const contactResiduals = referenceGeometry.contacts.map((contact) => {
    const a = projectedById.get(contact.aAnchorId)?.projectedXY, b = projectedById.get(contact.bAnchorId)?.projectedXY;
    if (!a || !b) return {id: contact.id, importance: contact.importance, evaluable: false, projectedDistanceNormalized: null, excessNormalized: null};
    const projectedDistanceNormalized = distance2(a, b);
    return {id: contact.id, importance: contact.importance, evaluable: true, projectedDistanceNormalized, toleranceNormalized: contact.toleranceNormalized, excessNormalized: Math.max(0, projectedDistanceNormalized - contact.toleranceNormalized)};
  });

  const negativeById = new Map(referenceGeometry.negativeSpaces.map((item) => [item.id, item]));
  const normalizedNegativeSpaces = negativeSpaceProjections.map((raw, index) => {
    const referenceId = assertId(raw?.referenceId, `negativeSpaceProjections[${index}].referenceId`);
    const reference = negativeById.get(referenceId);
    if (!reference) throw new Error(`negativeSpaceProjections[${index}] references unknown negative space: ${referenceId}`);
    const polygon = (raw?.polygon ?? []).map((value, pointIndex) => finitePoint(value, `negativeSpaceProjections[${index}].polygon[${pointIndex}]`));
    if (polygon.length < 3 || polygonArea(polygon) < 1e-9) throw new Error(`negativeSpaceProjections[${index}].polygon is degenerate`);
    return {referenceId, importance: reference.importance, polygon, iou: polygonIoU(reference.polygon, polygon)};
  });

  const dimensionResiduals = referenceGeometry.dimensions.map((dimension) => {
    const sourceA = anchorById.get(dimension.aAnchorId).xy, sourceB = anchorById.get(dimension.bAnchorId).xy;
    const projectedA = projectedById.get(dimension.aAnchorId)?.projectedXY, projectedB = projectedById.get(dimension.bAnchorId)?.projectedXY;
    if (!projectedA || !projectedB) return {id: dimension.id, importance: dimension.importance, evaluable: false, relativeError: null};
    const measure = (a, b) => dimension.kind === 'horizontal-span' ? Math.abs(a[0] - b[0]) : dimension.kind === 'vertical-span' ? Math.abs(a[1] - b[1]) : distance2(a, b);
    const sourceValue = measure(sourceA, sourceB), projectedValue = measure(projectedA, projectedB);
    return {id: dimension.id, importance: dimension.importance, evaluable: true, sourceValue, projectedValue, relativeError: sourceValue > 1e-9 ? Math.abs(projectedValue - sourceValue) / sourceValue : null};
  });

  const occlusionById = new Map(referenceGeometry.occlusions.map((item) => [item.id, item]));
  const normalizedOcclusions = occlusionDepths.map((raw, index) => {
    const referenceId = assertId(raw?.referenceId, `occlusionDepths[${index}].referenceId`);
    if (!occlusionById.has(referenceId)) throw new Error(`occlusionDepths[${index}] references unknown occlusion: ${referenceId}`);
    const frontDepth = Number(raw?.frontDepth), backDepth = Number(raw?.backDepth);
    if (!Number.isFinite(frontDepth) || !Number.isFinite(backDepth)) throw new Error(`occlusionDepths[${index}] requires finite depths`);
    return {referenceId, frontDepth, backDepth, orderCorrect: frontDepth < backDepth};
  });

  const allAnchorErrors = normalizedAnchorProjections.map((item) => item.errorNormalized);
  const macroAnchorErrors = normalizedAnchorProjections.filter((item) => item.importance === 'macro').map((item) => item.errorNormalized);
  const metrics = {
    anchorRmseNormalized: rmse(allAnchorErrors),
    macroAnchorRmseNormalized: rmse(macroAnchorErrors),
    macroAnchorMaxErrorNormalized: macroAnchorErrors.length ? Math.max(...macroAnchorErrors) : null,
    projectedAnchorsOutsideFrame: normalizedAnchorProjections.filter((item) => !item.insideFrame).length,
    chainAngleRmseDegrees: (() => { const value = rmse(chainResiduals.flatMap((chain) => chain.segments.map((segment) => segment.angleErrorRadians))); return value == null ? null : value * 180 / Math.PI; })(),
    axisAngleRmseDegrees: (() => { const value = rmse(axisResiduals.filter((item) => item.evaluable).map((item) => item.angleErrorRadians)); return value == null ? null : value * 180 / Math.PI; })(),
    contactMaxExcessNormalized: (() => { const values = contactResiduals.filter((item) => item.evaluable).map((item) => item.excessNormalized); return values.length ? Math.max(...values) : null; })(),
    negativeSpaceMeanIoU: mean(normalizedNegativeSpaces.map((item) => item.iou)),
    dimensionMeanRelativeError: mean(dimensionResiduals.filter((item) => item.evaluable && item.relativeError != null).map((item) => item.relativeError)),
    occlusionOrderViolations: normalizedOcclusions.filter((item) => !item.orderCorrect).length,
  };

  const payload = {
    schema: PROJECTION_FIT_SCHEMA,
    scopeId: referenceGeometry.scopeId,
    sourceSha256: referenceGeometry.sourceSha256,
    referenceGeometryDigest: referenceGeometry.geometryDigest,
    cameraHypothesisId: assertId(cameraHypothesisId, 'cameraHypothesisId'),
    cameraDigest: assertDigest(cameraDigest, 'cameraDigest'),
    modelBindingDigest: assertDigest(modelBindingDigest, 'modelBindingDigest'),
    anchorProjections: normalizedAnchorProjections,
    chainResiduals,
    axisResiduals,
    contactResiduals,
    negativeSpaceProjections: normalizedNegativeSpaces,
    dimensionResiduals,
    occlusionDepths: normalizedOcclusions,
    metrics,
    evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(),
    policy: {
      sourceGeometryRemainsAuthority: true,
      projectionFitDoesNotMutateGeometry: true,
      metricsCannotCertifyVisualFidelity: true,
      materialDisagreementMayBecomeBlockingFinding: true,
    },
  };
  return deepFreeze({...payload, projectionFitDigest: digestJson(payload)});
}

export function validateProjectionFit(fit) {
  const errors = [];
  if (fit?.schema !== PROJECTION_FIT_SCHEMA) errors.push('invalid schema');
  try {
    assertDigest(fit?.sourceSha256, 'sourceSha256');
    assertDigest(fit?.referenceGeometryDigest, 'referenceGeometryDigest');
    assertDigest(fit?.cameraDigest, 'cameraDigest');
    assertDigest(fit?.modelBindingDigest, 'modelBindingDigest');
    assertDigest(fit?.projectionFitDigest, 'projectionFitDigest');
    if (!fit?.scopeId || !fit?.cameraHypothesisId) errors.push('scope and camera hypothesis are required');
    if (!(fit?.anchorProjections?.length > 0)) errors.push('at least one anchor projection is required');
    for (const item of fit?.anchorProjections ?? []) {
      sourcePoint(item.sourceXY, `anchor ${item.referenceId}.sourceXY`);
      finitePoint(item.projectedXY, `anchor ${item.referenceId}.projectedXY`);
      if (!Number.isFinite(item.errorNormalized) || item.errorNormalized < 0) errors.push(`anchor ${item.referenceId} has invalid error`);
    }
    const policy = fit?.policy ?? {};
    if (policy.sourceGeometryRemainsAuthority !== true || policy.projectionFitDoesNotMutateGeometry !== true) errors.push('projection/source authority policy is missing');
    if (policy.metricsCannotCertifyVisualFidelity !== true || policy.materialDisagreementMayBecomeBlockingFinding !== true) errors.push('metric authority policy is missing');
    const payload = structuredClone(fit); delete payload.projectionFitDigest;
    if (digestJson(payload) !== fit.projectionFitDigest) errors.push('projection fit digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

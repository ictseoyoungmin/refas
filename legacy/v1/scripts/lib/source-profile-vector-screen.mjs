// P0 S03b2: contradiction-only *signed* source-visible facial profile cue.
// Cannot establish gaze in 3D or independently recognize parts in an image.
export const SOURCE_PROFILE_VECTOR_SCHEMA = 'refas.source-profile-vector-screen/v1';
const MIN_SOURCE_SIDE_OFFSET = 0.045;
const MIN_REALIZED_SIDE_OFFSET = 0.025;
const MAX_DIRECTION_ERROR_DEG = 55;
const ROLES = ['face-center', 'nose-tip'];
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const norm = ([x, y]) => Math.hypot(x, y);
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];

// Centroid of the projected *mesh hull*, not an authored localPoint anchor.
function areaCentroid(poly) {
  if (!Array.isArray(poly) || poly.length < 3 ||
      poly.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) {
    throw new Error('current GLB mesh projected hull must have finite 2D points');
  }
  let doubleArea = 0, sx = 0, sy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    doubleArea += cross;
    sx += (a[0] + b[0]) * cross;
    sy += (a[1] + b[1]) * cross;
  }
  if (Math.abs(doubleArea) < 1e-10) throw new Error('current GLB mesh projected hull is degenerate');
  return [sx / (3 * doubleArea), sy / (3 * doubleArea)];
}
function insideBounds(point, poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return point[0] >= Math.min(...xs) - 0.02 && point[0] <= Math.max(...xs) + 0.02 &&
    point[1] >= Math.min(...ys) - 0.02 && point[1] <= Math.max(...ys) + 0.02;
}
function angularError(a, b) {
  return Math.acos(clamp((a[0] * b[0] + a[1] * b[1]) / (norm(a) * norm(b)), -1, 1)) * 180 / Math.PI;
}

export function screenSourceProfileVector({referenceGeometry, realizedProjection, sourcePath} = {}) {
  if (!sourcePath || typeof sourcePath !== 'string') throw new Error('primary source path is required');
  if (referenceGeometry?.scopeId !== realizedProjection?.scopeId ||
      referenceGeometry?.sourceSha256 !== realizedProjection?.sourceSha256) {
    throw new Error('source profile must bind exact original source SHA and current GLB scope');
  }
  const featureAnchors = (referenceGeometry.anchors ?? []).filter(a => ROLES.includes(a.semanticRole));
  // No semantic face observation cannot constitute a passed facing test.
  if (!featureAnchors.length) return Object.freeze({
    schema: SOURCE_PROFILE_VECTOR_SCHEMA, status: 'NOT_APPLICABLE', findings: [], measurements: [],
    cannotAuthorizeReferenceFidelity: true, cannotInferWorldSpaceGaze: true,
  });
  const findings = [], measurements = [], matched = new Map();
  for (const role of ROLES) {
    const anchors = featureAnchors.filter(a => a.semanticRole === role);
    if (anchors.length !== 1 || anchors[0].visibility !== 'visible' ||
        !anchors[0].evidenceRefs?.includes(sourcePath)) {
      findings.push({role, status: 'REVIEW_REQUIRED', reason: 'one source-visible, raw-source-cited feature anchor required'});
      continue;
    }
    const a = anchors[0];
    const segments = (referenceGeometry.segments ?? []).filter(s =>
      s.anchorIds?.includes(a.id) && s.visibility === 'visible' &&
      s.importance !== 'detail' && s.evidenceRefs?.includes(sourcePath));
    if (segments.length !== 1 || !insideBounds(a.xy, segments[0].polygon)) {
      findings.push({role, status: 'REVIEW_REQUIRED', reason: 'exactly one source-cited non-detail mesh-region witness required'});
      continue;
    }
    const segmentsActual = (realizedProjection.derivedSegments ?? []).filter(s => s.referenceId === segments[0].id);
    if (segmentsActual.length !== 1) {
      findings.push({role, status: 'REVIEW_REQUIRED', reason: 'missing physical current-GLB projected mesh region'});
      continue;
    }
    try {
      matched.set(role, {source: a.xy, nodeIndices: segmentsActual[0].meshNodeIndices ?? [],
        actual: areaCentroid(segmentsActual[0].projectedHull)});
    } catch (e) {
      findings.push({role, status: 'REVIEW_REQUIRED', reason: e.message});
    }
  }
  if (matched.size === 2) {
    const face = matched.get('face-center'), tip = matched.get('nose-tip');
    const faceNodes = new Set(face.nodeIndices), tipNodes = new Set(tip.nodeIndices);
    if (!faceNodes.size || !tipNodes.size || [...tipNodes].some(n => faceNodes.has(n))) {
      findings.push({role: 'profile', status: 'REVIEW_REQUIRED', reason: 'face and tip require distinct current GLB mesh geometry'});
    } else {
      const source = subtract(tip.source, face.source), current = subtract(tip.actual, face.actual);
      // With a frontal, ambiguous, vertical, or occluded cue do not guess 3D facing.
      if (Math.abs(source[0]) < MIN_SOURCE_SIDE_OFFSET || Math.abs(source[0]) < Math.abs(source[1]) * 1.25) {
        findings.push({role: 'profile', status: 'REVIEW_REQUIRED', reason: 'primary source does not resolve signed lateral profile direction'});
      } else if (Math.abs(current[0]) < MIN_REALIZED_SIDE_OFFSET) {
        findings.push({role: 'profile', status: 'REWORK', reason: 'current nose mesh lost signed source lateral protrusion'});
      } else {
        const errorDegrees = angularError(source, current);
        measurements.push({sourceVector: source, actualMeshVector: current, errorDegrees});
        if (Math.sign(source[0]) !== Math.sign(current[0]) || errorDegrees > MAX_DIRECTION_ERROR_DEG) {
          findings.push({role: 'profile', status: 'REWORK', reason: 'actual current GLB profile direction contradicts original source cue'});
        }
      }
    }
  }
  const status = findings.some(f => f.status === 'REWORK') ? 'REWORK' :
    findings.length ? 'INSUFFICIENT' : 'NO_DETECTED_CONTRADICTION';
  return Object.freeze({schema: SOURCE_PROFILE_VECTOR_SCHEMA, status,
    sourceSha256: referenceGeometry.sourceSha256,
    assetSha256: realizedProjection.assetSha256,
    findings: Object.freeze(findings.map(f => Object.freeze(f))),
    measurements: Object.freeze(measurements.map(m => Object.freeze(m))),
    physicalEvidenceFromCurrentMesh: true,
    cannotAuthorizeReferenceFidelity: true,
    cannotInferWorldSpaceGaze: true,
  });
}

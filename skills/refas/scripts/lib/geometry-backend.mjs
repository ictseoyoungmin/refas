import {assertId, deepFreeze, digestJson} from './canonical.mjs';
import {finalizeMesh} from './mesh.mjs';
import {createHardSurfaceShell} from './hard-surface.mjs';

export const GEOMETRY_BACKEND_SCHEMA = 'refas.geometry-backend/v1';

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
};
const point3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec3`);
  return value.map(Number);
};
const norm = (v) => Math.hypot(...v);
const normalize = (v, label) => { const length = norm(v); if (!(length > 1e-10)) throw new Error(`${label} is degenerate`); return v.map((x) => x / length); };
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);

export function createLandmarkCage({id = 'landmark-cage', landmarks = [], evidenceRefs = []} = {}) {
  if (!landmarks.length) throw new Error('landmark cage requires at least one landmark');
  const normalized = landmarks.map((raw, index) => ({
    id: assertId(raw?.id, `landmarks[${index}].id`),
    role: String(raw?.role ?? 'anchor'),
    point: point3(raw?.point, `landmarks[${index}].point`),
    localFrame: raw?.localFrame ? {
      right: normalize(point3(raw.localFrame.right, `landmarks[${index}].localFrame.right`), 'landmark right'),
      up: normalize(point3(raw.localFrame.up, `landmarks[${index}].localFrame.up`), 'landmark up'),
      forward: normalize(point3(raw.localFrame.forward, `landmarks[${index}].localFrame.forward`), 'landmark forward'),
    } : null,
    projectionAnchorId: raw?.projectionAnchorId == null ? null : assertId(raw.projectionAnchorId, `landmarks[${index}].projectionAnchorId`),
    evidenceRefs: [...new Set((raw?.evidenceRefs ?? evidenceRefs).map(String).filter(Boolean))].sort(),
  }));
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('landmark IDs must be unique');
  return deepFreeze({schema: 'refas.landmark-cage/v1', id: assertId(id, 'id'), landmarks: normalized, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(), cageDigest: digestJson({id, landmarks: normalized, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort()})});
}

export function createLongitudinalGuide({id = 'longitudinal-guide', points = [], closed = false, twist = [], evidenceRefs = []} = {}) {
  if (points.length < 2) throw new Error('longitudinal guide requires at least two points');
  const normalized = points.map((raw, index) => ({v: finite(raw?.v ?? index / (points.length - 1), `points[${index}].v`), point: point3(raw?.point, `points[${index}].point`)}));
  if (normalized.some((p) => p.v < 0 || p.v > 1) || normalized.some((p, i) => i && p.v <= normalized[i - 1].v)) throw new Error('guide v coordinates must be strictly increasing in [0,1]');
  const twists = twist.map((raw, index) => ({v: finite(raw?.v ?? index / Math.max(1, twist.length - 1), `twist[${index}].v`), radians: finite(raw?.radians ?? raw?.angle ?? 0, `twist[${index}].radians`)}));
  if (twists.some((p) => p.v < 0 || p.v > 1) || twists.some((p, i) => i && p.v <= twists[i - 1].v)) throw new Error('twist v coordinates must be strictly increasing in [0,1]');
  return deepFreeze({schema: 'refas.longitudinal-guide/v1', id: assertId(id, 'id'), points: normalized, closed: Boolean(closed), twist: twists, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(), guideDigest: digestJson({id, points: normalized, closed: Boolean(closed), twist: twists, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort()})});
}

function superellipseProfile(exponent, samples) {
  const profile = [];
  for (let index = 0; index < samples; index += 1) {
    const angle = index / samples * Math.PI * 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    profile.push([Math.sign(c) * Math.abs(c) ** (2 / exponent), Math.sign(s) * Math.abs(s) ** (2 / exponent)]);
  }
  return profile;
}

function normalizeProfile(raw, label, defaultExponent = 2) {
  if (raw == null) return superellipseProfile(defaultExponent, 16);
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.model === 'superellipse') {
    const samples = Number(raw.samples ?? 16);
    if (!Number.isInteger(samples) || samples < 3) throw new Error(`${label}.samples must be an integer >= 3`);
    const exponent = finite(raw.exponent ?? defaultExponent, `${label}.exponent`);
    if (!(exponent > 0)) throw new Error(`${label}.exponent must be positive`);
    return superellipseProfile(exponent, samples);
  }
  if (!Array.isArray(raw) || raw.length < 3) throw new Error(`${label} requires at least three profile points`);
  const profile = raw.map((point, index) => {
    const value = Array.isArray(point) ? point : [point?.u, point?.z];
    if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label}[${index}] must be a finite [u,z] point`);
    return value.map(Number);
  });
  if (Math.abs(profile[0][0] - profile.at(-1)[0]) < 1e-10 && Math.abs(profile[0][1] - profile.at(-1)[1]) < 1e-10) profile.pop();
  if (profile.length < 3 || Math.abs(profile.reduce((area, p, i) => area + p[0] * profile[(i + 1) % profile.length][1] - profile[(i + 1) % profile.length][0] * p[1], 0)) < 1e-10) throw new Error(`${label} is degenerate`);
  return profile;
}

function sampleGuide(guide, v) {
  const points = guide.points;
  if (v <= points[0].v) return points[0].point;
  if (v >= points.at(-1).v) return points.at(-1).point;
  let index = 0;
  while (index < points.length - 2 && v > points[index + 1].v) index += 1;
  const a = points[index], b = points[index + 1], t = (v - a.v) / (b.v - a.v);
  return a.point.map((x, i) => x + (b.point[i] - x) * t);
}
function sampleTwist(guide, v) {
  const points = guide.twist ?? [];
  if (!points.length) return 0;
  if (v <= points[0].v) return points[0].radians;
  if (v >= points.at(-1).v) return points.at(-1).radians;
  let index = 0; while (index < points.length - 2 && v > points[index + 1].v) index += 1;
  const a = points[index], b = points[index + 1], t = (v - a.v) / (b.v - a.v);
  return a.radians + (b.radians - a.radians) * t;
}

function frameAt(guide, v) {
  const center = sampleGuide(guide, v);
  const epsilon = 1e-5;
  const tangent = normalize(sub(sampleGuide(guide, Math.min(1, v + epsilon)), sampleGuide(guide, Math.max(0, v - epsilon))), 'guide tangent');
  let up = Math.abs(dot(tangent, [0, 1, 0])) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  let side = normalize(cross(tangent, up), 'guide side');
  up = normalize(cross(side, tangent), 'guide up');
  const angle = sampleTwist(guide, v), c = Math.cos(angle), s = Math.sin(angle);
  const twistedSide = add(mul(side, c), mul(up, s));
  const twistedUp = add(mul(up, c), mul(side, -s));
  return {center, tangent, side: twistedSide, up: twistedUp};
}

export function createSectionProfileLoft({id = 'section-profile-loft', guide, sections = [], profile, evidenceRefs = [], role = 'section-profile-loft'} = {}) {
  if (!guide || guide.schema !== 'refas.longitudinal-guide/v1') throw new Error('section loft requires a longitudinal guide');
  const guideValidation = guide.points?.length >= 2;
  if (!guideValidation) throw new Error('section loft guide is invalid');
  if (sections.length < 2) throw new Error('section-profile loft requires at least two sections');
  const normalizedSections = sections.map((raw, index) => {
    const v = finite(raw?.v ?? index / (sections.length - 1), `sections[${index}].v`);
    if (v < 0 || v > 1) throw new Error(`sections[${index}].v must be in [0,1]`);
    const width = finite(raw?.width ?? 1, `sections[${index}].width`), depth = finite(raw?.depth ?? width, `sections[${index}].depth`);
    if (!(width > 0 && depth > 0)) throw new Error(`sections[${index}] width and depth must be positive`);
    const offset = raw?.offset == null ? [0, 0] : raw.offset;
    if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) throw new Error(`sections[${index}].offset must be finite vec2`);
    const rotation = finite(raw?.rotation ?? 0, `sections[${index}].rotation`), flattening = finite(raw?.flattening ?? 1, `sections[${index}].flattening`), taper = finite(raw?.taper ?? 1, `sections[${index}].taper`);
    if (!(flattening > 0 && taper > 0)) throw new Error(`sections[${index}] flattening and taper must be positive`);
    return {v, width, depth, offset: offset.map(Number), rotation, flattening, taper, profile: normalizeProfile(raw?.profile ?? profile, `sections[${index}].profile`)};
  }).sort((a, b) => a.v - b.v);
  if (normalizedSections.some((s, i) => i && s.v <= normalizedSections[i - 1].v)) throw new Error('section v coordinates must be unique and increasing');
  const ringSize = normalizedSections[0].profile.length;
  if (normalizedSections.some((section) => section.profile.length !== ringSize)) throw new Error('all loft sections must use the same profile sample count');
  const positions = [];
  for (const section of normalizedSections) {
    const frame = frameAt(guide, section.v), c = Math.cos(section.rotation), s = Math.sin(section.rotation);
    for (const [u, z] of section.profile) {
      const ru = u * section.width * section.taper, rz = z * section.depth * section.flattening;
      const localU = ru * c - rz * s + section.offset[0], localZ = ru * s + rz * c + section.offset[1];
      positions.push(add(frame.center, add(mul(frame.side, localU), mul(frame.up, localZ))));
    }
  }
  const indices = [];
  for (let section = 0; section < normalizedSections.length - 1; section += 1) {
    const next = section + 1;
    for (let sample = 0; sample < ringSize; sample += 1) {
      const b = section * ringSize + sample, a = section * ringSize + (sample + 1) % ringSize, d = next * ringSize + (sample + 1) % ringSize, c = next * ringSize + sample;
      indices.push(b, a, d, b, d, c);
    }
  }
  const startCenter = positions.length; positions.push(frameAt(guide, normalizedSections[0].v).center);
  const endCenter = positions.length; positions.push(frameAt(guide, normalizedSections.at(-1).v).center);
  for (let sample = 0; sample < ringSize; sample += 1) {
    const next = (sample + 1) % ringSize;
    indices.push(startCenter, next, sample);
    const end = (normalizedSections.length - 1) * ringSize;
    indices.push(endCenter, end + sample, end + next);
  }
  const mesh = finalizeMesh(positions, indices, {role, backend: 'section-profile-loft', guideId: guide.id, sections: normalizedSections, semanticParameterIds: normalizedSections.flatMap((section, index) => [`section.${index}.width`, `section.${index}.depth`, `section.${index}.offset.x`, `section.${index}.offset.y`, `section.${index}.rotation`, `section.${index}.flattening`, `section.${index}.taper`])});
  return {...mesh, loft: {schema: GEOMETRY_BACKEND_SCHEMA, id: assertId(id, 'id'), guide, sections: normalizedSections, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(), capacity: {arbitraryCrossSections: true, asymmetricWidthDepth: true, twistControl: true, transitionControls: true, negativeSpaceCutaways: true}, loftDigest: digestJson({id, guide, sections: normalizedSections, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort()})}};
}

/**
 * Construct an actual through-opening with the same generic backend boundary.
 * Hard-surface cutaway topology is reused as a construction primitive; the
 * caller may place it in a loft/assembly without faking a dark decal.
 */
export function createNegativeSpaceCutaway(spec = {}) {
  const shell = createHardSurfaceShell({...spec, role: spec.role ?? 'negative-space-cutaway'});
  return {...shell, cutaway: {schema: 'refas.negative-space-cutaway/v1', boundaryIds: ['outer', ...(spec.cutouts ?? []).map((cutout, index) => String(cutout.id ?? `cutout-${index}`))], actualOpening: (spec.cutouts ?? []).length > 0, cutawayDigest: digestJson({outerProfile: spec.outerProfile, cutouts: spec.cutouts ?? [], thickness: spec.thickness ?? 0.1})}};
}

export function createRepresentationCapacityReport({backend = 'section-profile-loft', obligations = [], supported = [], unsupported = [], evidenceRefs = []} = {}) {
  const normalizedObligations = obligations.map((raw, index) => ({id: assertId(raw?.id, `obligations[${index}].id`), description: String(raw?.description ?? ''), required: raw?.required !== false}));
  const supportedIds = new Set(supported.map(String)), unsupportedIds = new Set(unsupported.map(String));
  const blockers = normalizedObligations.filter((item) => item.required && !supportedIds.has(item.id)).map((item) => ({id: item.id, category: 'representation-blocker', ownerCapability: 'shape-reconstruction', description: item.description, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort()}));
  const payload = {schema: 'refas.representation-capacity/v1', backend: String(backend), obligations: normalizedObligations, supported: [...supportedIds].sort(), unsupported: [...unsupportedIds].sort(), blockers, policy: {tessellationCannotIncreaseExpressiveCapacity: true, missingCapacityIsBlocking: true, metricsCannotHideRepresentationFailure: true}, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort()};
  return deepFreeze({...payload, capacityDigest: digestJson(payload)});
}

export function validateRepresentationCapacityReport(report) {
  const errors = [];
  if (report?.schema !== 'refas.representation-capacity/v1') errors.push('invalid schema');
  if (report?.policy?.tessellationCannotIncreaseExpressiveCapacity !== true || report?.policy?.missingCapacityIsBlocking !== true) errors.push('representation capacity policy is missing');
  try { const payload = structuredClone(report); delete payload.capacityDigest; if (digestJson(payload) !== report.capacityDigest) errors.push('capacity digest mismatch'); } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

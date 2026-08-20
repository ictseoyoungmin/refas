import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const REFERENCE_REGISTRATION_SCHEMA = 'refas.reference-registration/v1';
const EPSILON = 1e-12;

function point2(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error(`${label} must be a finite vec2`);
  const point = value.map(Number);
  if (point.some((coordinate) => coordinate < 0 || coordinate > 1)) throw new Error(`${label} must use normalized image coordinates in [0,1]`);
  return point;
}

function solveLeastSquares(rows, targets) {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.length !== targets.length || rows.some((row) => row.length !== width)) throw new Error('invalid least-squares system');
  const matrix = Array.from({length: width}, () => Array(width).fill(0));
  const vector = Array(width).fill(0);
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      vector[column] += rows[row][column] * targets[row];
      for (let other = 0; other < width; other += 1) matrix[column][other] += rows[row][column] * rows[row][other];
    }
  }
  let smallestPivot = Infinity;
  let largestPivot = 0;
  for (let column = 0; column < width; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < width; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    const pivotMagnitude = Math.abs(matrix[pivot][column]);
    if (pivotMagnitude < EPSILON) throw new Error('reference registration is singular or underconstrained');
    smallestPivot = Math.min(smallestPivot, pivotMagnitude);
    largestPivot = Math.max(largestPivot, pivotMagnitude);
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [vector[column], vector[pivot]] = [vector[pivot], vector[column]];
    const divisor = matrix[column][column];
    for (let index = column; index < width; index += 1) matrix[column][index] /= divisor;
    vector[column] /= divisor;
    for (let row = 0; row < width; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index < width; index += 1) matrix[row][index] -= factor * matrix[column][index];
      vector[row] -= factor * vector[column];
    }
  }
  return {solution: vector, pivotRatio: largestPivot / Math.max(smallestPivot, EPSILON)};
}

function invert3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const cofactors = [
    e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d,
  ];
  const determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6];
  if (Math.abs(determinant) < EPSILON) throw new Error('reference registration transform is not invertible');
  return cofactors.map((value) => value / determinant);
}

function applyHomography(matrix, point) {
  const [x, y] = point;
  const weight = matrix[6] * x + matrix[7] * y + matrix[8];
  if (Math.abs(weight) < EPSILON) throw new Error('registered point maps to infinity');
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / weight,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / weight,
  ];
}

function fitTransform(correspondences, model) {
  const rows = [];
  const targets = [];
  if (model === 'affine') {
    for (const {parent: [x, y], child: [u, v]} of correspondences) {
      rows.push([x, y, 1, 0, 0, 0]); targets.push(u);
      rows.push([0, 0, 0, x, y, 1]); targets.push(v);
    }
    const result = solveLeastSquares(rows, targets);
    return {matrix: [...result.solution.slice(0, 3), ...result.solution.slice(3, 6), 0, 0, 1], pivotRatio: result.pivotRatio};
  }
  if (model === 'projective-homography') {
    for (const {parent: [x, y], child: [u, v]} of correspondences) {
      rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); targets.push(u);
      rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); targets.push(v);
    }
    const result = solveLeastSquares(rows, targets);
    return {matrix: [...result.solution, 1], pivotRatio: result.pivotRatio};
  }
  throw new Error(`unsupported registration model: ${model}`);
}

export function createReferenceRegistration({
  parentFrameId,
  childFrameId,
  parentSourceSha256,
  childSourceSha256,
  correspondences = [],
  attestation,
  model = 'projective-homography',
  ambiguities = [],
} = {}) {
  const minimum = model === 'affine' ? 3 : model === 'projective-homography' ? 4 : Infinity;
  if (correspondences.length < minimum) throw new Error(`${model} registration requires at least ${minimum} correspondences`);
  if (attestation?.attested !== true || !Array.isArray(attestation.evidenceRefs) || !attestation.evidenceRefs.length) {
    throw new Error('reference registration requires an evidence-cited agent attestation');
  }
  const normalized = correspondences.map((raw, index) => {
    const evidenceRefs = [...(raw.evidenceRefs ?? [])].map(String);
    if (!evidenceRefs.length) throw new Error(`correspondences[${index}] requires evidenceRefs`);
    return {
      id: assertId(raw.id ?? `point-${index}`, `correspondences[${index}].id`),
      parent: point2(raw.parent, `correspondences[${index}].parent`),
      child: point2(raw.child, `correspondences[${index}].child`),
      evidenceRefs,
    };
  });
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('correspondence IDs must be unique');
  const fitted = fitTransform(normalized, model);
  const inverse = invert3(fitted.matrix);
  let squaredError = 0;
  let maximumError = 0;
  let maximumRoundTripError = 0;
  const residuals = normalized.map((item) => {
    const mapped = applyHomography(fitted.matrix, item.parent);
    const error = Math.hypot(mapped[0] - item.child[0], mapped[1] - item.child[1]);
    const roundTrip = applyHomography(inverse, mapped);
    const roundTripError = Math.hypot(roundTrip[0] - item.parent[0], roundTrip[1] - item.parent[1]);
    squaredError += error * error;
    maximumError = Math.max(maximumError, error);
    maximumRoundTripError = Math.max(maximumRoundTripError, roundTripError);
    return {id: item.id, mappedChild: mapped, error, roundTripError};
  });
  const payload = {
    schema: REFERENCE_REGISTRATION_SCHEMA,
    parentFrameId: assertId(parentFrameId, 'parentFrameId'),
    childFrameId: assertId(childFrameId, 'childFrameId'),
    parentSourceSha256: assertDigest(parentSourceSha256, 'parentSourceSha256'),
    childSourceSha256: assertDigest(childSourceSha256, 'childSourceSha256'),
    model,
    correspondences: normalized,
    homographyParentToChild: fitted.matrix,
    homographyChildToParent: inverse,
    residuals,
    metrics: {
      correspondenceCount: normalized.length,
      rmse: Math.sqrt(squaredError / normalized.length),
      maxError: maximumError,
      maxRoundTripError: maximumRoundTripError,
      normalEquationPivotRatio: fitted.pivotRatio,
    },
    attestation: {
      evidenceRefs: attestation.evidenceRefs.map(String),
      digest: digestJson(attestation),
    },
    ambiguities: ambiguities.map(String),
    policy: {
      registrationIsPlacementAuthorityNotShapeTruth: true,
      rawReferenceOutranksRegistrationResidual: true,
      correspondenceMustBeAgentAttested: true,
      closedChildMayNotBeRebuiltToForceRegistration: true,
    },
  };
  return deepFreeze({...payload, registrationDigest: digestJson(payload)});
}

export function mapParentToChild(registration, point) {
  if (registration?.schema !== REFERENCE_REGISTRATION_SCHEMA) throw new Error('valid reference registration is required');
  return applyHomography(registration.homographyParentToChild, point2(point, 'point'));
}

export function mapChildToParent(registration, point) {
  if (registration?.schema !== REFERENCE_REGISTRATION_SCHEMA) throw new Error('valid reference registration is required');
  return applyHomography(registration.homographyChildToParent, point2(point, 'point'));
}

export function validateReferenceRegistration(registration) {
  const errors = [];
  if (registration?.schema !== REFERENCE_REGISTRATION_SCHEMA) errors.push('invalid schema');
  if (registration?.policy?.registrationIsPlacementAuthorityNotShapeTruth !== true) errors.push('placement-only policy missing');
  if (registration?.policy?.closedChildMayNotBeRebuiltToForceRegistration !== true) errors.push('closed-child policy missing');
  try {
    const recreated = createReferenceRegistration({
      parentFrameId: registration.parentFrameId,
      childFrameId: registration.childFrameId,
      parentSourceSha256: registration.parentSourceSha256,
      childSourceSha256: registration.childSourceSha256,
      correspondences: registration.correspondences,
      attestation: {attested: true, evidenceRefs: registration.attestation?.evidenceRefs ?? []},
      model: registration.model,
      ambiguities: registration.ambiguities,
    });
    const transformError = Math.max(...recreated.homographyParentToChild.map((value, index) => Math.abs(value - registration.homographyParentToChild[index])));
    if (transformError > 1e-10) errors.push('registration transform does not fit its correspondences');
    const payload = structuredClone(registration);
    delete payload.registrationDigest;
    if (digestJson(payload) !== registration.registrationDigest) errors.push('registration digest mismatch');
    const product = registration.correspondences.map((item) => {
      const mapped = mapParentToChild(registration, item.parent);
      const restored = mapChildToParent(registration, mapped);
      return Math.hypot(restored[0] - item.parent[0], restored[1] - item.parent[1]);
    });
    if (Math.max(...product) > 1e-8) errors.push('registration inverse round trip exceeds tolerance');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

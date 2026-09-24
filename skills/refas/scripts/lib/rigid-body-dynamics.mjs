import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {canonicalizePhysicalQuaternion, validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const RIGID_BODY_DYNAMICS_SCHEMA = 'refas.rigid-body-dynamics/v1';
export const PHYSICAL_DYNAMICS_IDENTITY_BINDING_SCHEMA = 'refas.physical-dynamics-identity-binding/v1';
export const PHYSICAL_DYNAMICS_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-dynamics-identity-projection/v1';

export const RIGID_BODY_DYNAMICS_PROPERTIES = Object.freeze([
  'mass',
  'center-of-mass',
  'inertia',
]);

const PROPERTY_SET = new Set(RIGID_BODY_DYNAMICS_PROPERTIES);
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'scopeId',
  'sourceSha256',
  'identityGraph',
  'identityBinding',
  'links',
  'policy',
  'dynamicsDigest',
]);
const IDENTITY_BINDING_KEYS = new Set(['schema', 'sourceSchema', 'projectionDigest']);
const LINK_KEYS = new Set(['linkId', 'referenceFrameId', 'mass', 'centerOfMass', 'inertia']);
const MASS_KEYS = new Set(['value_kg', 'authoritySubjectId']);
const COM_KEYS = new Set(['value_m', 'authoritySubjectId']);
const INERTIA_KEYS = new Set(['tensor_kg_m2', 'authoritySubjectId']);
const CONSTRUCTION_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}

function requireOwn(value, key, label) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`${label}.${key} must be explicit; use null when unresolved`);
  return value[key];
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain exactly 3 numbers`);
  return value.map((item, index) => finiteNumber(item, `${label}[${index}]`));
}

function determinant3(matrix) {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

function assertPositiveSemidefinite3(matrix, scale, label) {
  const linearTolerance = Math.max(scale * 1e-12, Number.EPSILON * scale * 64);
  const quadraticTolerance = Math.max(scale ** 2 * 1e-12, Number.EPSILON * scale ** 2 * 128);
  const cubicTolerance = Math.max(scale ** 3 * 1e-12, Number.EPSILON * scale ** 3 * 256);

  for (let axis = 0; axis < 3; axis += 1) {
    if (matrix[axis][axis] < -linearTolerance) throw new Error(label);
  }
  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 3; second += 1) {
      const principal2 = matrix[first][first] * matrix[second][second] - matrix[first][second] ** 2;
      if (principal2 < -quadraticTolerance) throw new Error(label);
    }
  }
  if (determinant3(matrix) < -cubicTolerance) throw new Error(label);
}

function normalizeInertiaTensor(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a 3x3 matrix`);
  const matrix = value.map((row, index) => normalizeVector3(row, `${label}[${index}]`));
  const scale = Math.max(...matrix.flat().map((item) => Math.abs(item)));
  if (!(scale > 0)) throw new Error(`${label} must be positive definite`);

  const symmetryTolerance = Math.max(scale * 1e-12, Number.EPSILON * scale * 32);
  for (let row = 0; row < 3; row += 1) {
    for (let column = row + 1; column < 3; column += 1) {
      if (Math.abs(matrix[row][column] - matrix[column][row]) > symmetryTolerance) {
        throw new Error(`${label} must be symmetric`);
      }
      const average = (matrix[row][column] + matrix[column][row]) / 2;
      matrix[row][column] = Object.is(average, -0) ? 0 : average;
      matrix[column][row] = matrix[row][column];
    }
  }

  const positiveTolerance = scale * 1e-12;
  for (let axis = 0; axis < 3; axis += 1) {
    if (!(matrix[axis][axis] > positiveTolerance)) throw new Error(`${label} must be positive definite`);
  }
  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 3; second += 1) {
      const principal2 = matrix[first][first] * matrix[second][second] - matrix[first][second] ** 2;
      if (!(principal2 > scale ** 2 * 1e-12)) throw new Error(`${label} must be positive definite`);
    }
  }
  if (!(determinant3(matrix) > scale ** 3 * 1e-12)) throw new Error(`${label} must be positive definite`);

  // A physical inertia tensor I about COM must admit a positive-semidefinite
  // second-moment matrix C = 0.5 * trace(I) * 1 - I. This is equivalent
  // to applying triangle inequalities to the basis-invariant principal moments,
  // not merely to the diagonal entries in the current coordinate frame.
  const halfTrace = (matrix[0][0] + matrix[1][1] + matrix[2][2]) / 2;
  const secondMoment = matrix.map((row, rowIndex) => row.map((item, columnIndex) => {
    const valueAt = (rowIndex === columnIndex ? halfTrace : 0) - item;
    return Object.is(valueAt, -0) ? 0 : valueAt;
  }));
  assertPositiveSemidefinite3(
    secondMoment,
    Math.max(scale, ...secondMoment.flat().map((item) => Math.abs(item))),
    `${label} violates rigid-body principal-moment triangle inequality`,
  );

  return matrix.map((row) => row.map((item) => Object.is(item, -0) ? 0 : item));
}

function normalizeIdentityBinding(raw, label = 'identityBinding') {
  assertKnownKeys(raw, IDENTITY_BINDING_KEYS, label);
  if (raw.schema !== PHYSICAL_DYNAMICS_IDENTITY_BINDING_SCHEMA) throw new Error(`${label}.schema must be ${PHYSICAL_DYNAMICS_IDENTITY_BINDING_SCHEMA}`);
  if (raw.sourceSchema !== 'refas.physical-identity-graph/v1') throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);
  return {
    schema: raw.schema,
    sourceSchema: raw.sourceSchema,
    projectionDigest: assertDigest(raw.projectionDigest, `${label}.projectionDigest`),
  };
}

export function rigidBodyDynamicsAuthoritySubjectId(linkId, property) {
  const id = assertId(linkId, 'linkId');
  const normalizedProperty = String(property ?? '').trim().toLowerCase();
  if (!PROPERTY_SET.has(normalizedProperty)) throw new Error(`property must be one of: ${RIGID_BODY_DYNAMICS_PROPERTIES.join(', ')}`);
  const suffix = normalizedProperty === 'center-of-mass' ? 'com' : normalizedProperty;
  const readable = `${id}:${suffix}`;
  if (readable.length <= 128) return assertId(readable, 'authoritySubjectId');
  return assertId(`dynamics:${digestJson({linkId: id, property: normalizedProperty}).slice(0, 48)}:${suffix}`, 'authoritySubjectId');
}

function normalizeAuthoritySubjectId(raw, linkId, property, label) {
  const expected = rigidBodyDynamicsAuthoritySubjectId(linkId, property);
  if (raw == null) return expected;
  const actual = assertId(raw, label);
  if (actual !== expected) throw new Error(`${label} must be canonical subject ${expected}`);
  return actual;
}

function normalizeMass(raw, linkId, label) {
  assertKnownKeys(raw, MASS_KEYS, label);
  const value = requireOwn(raw, 'value_kg', label);
  let valueKg = null;
  if (value !== null) {
    valueKg = finiteNumber(value, `${label}.value_kg`);
    if (!(valueKg > 0)) throw new Error(`${label}.value_kg must be strictly positive`);
  }
  return {
    value_kg: valueKg,
    authoritySubjectId: normalizeAuthoritySubjectId(raw.authoritySubjectId, linkId, 'mass', `${label}.authoritySubjectId`),
  };
}

function normalizeCenterOfMass(raw, linkId, label) {
  assertKnownKeys(raw, COM_KEYS, label);
  const value = requireOwn(raw, 'value_m', label);
  return {
    value_m: value === null ? null : normalizeVector3(value, `${label}.value_m`),
    authoritySubjectId: normalizeAuthoritySubjectId(raw.authoritySubjectId, linkId, 'center-of-mass', `${label}.authoritySubjectId`),
  };
}

function normalizeInertia(raw, linkId, label) {
  assertKnownKeys(raw, INERTIA_KEYS, label);
  const value = requireOwn(raw, 'tensor_kg_m2', label);
  return {
    tensor_kg_m2: value === null ? null : normalizeInertiaTensor(value, `${label}.tensor_kg_m2`),
    authoritySubjectId: normalizeAuthoritySubjectId(raw.authoritySubjectId, linkId, 'inertia', `${label}.authoritySubjectId`),
  };
}

function normalizeLink(raw, index) {
  const label = `links[${index}]`;
  assertKnownKeys(raw, LINK_KEYS, label);
  const linkId = assertId(raw.linkId, `${label}.linkId`);
  const referenceFrameId = assertId(raw.referenceFrameId, `${label}.referenceFrameId`);
  if (referenceFrameId !== linkId) throw new Error(`${label}.referenceFrameId must equal its rigid-link identity ${linkId}`);
  return {
    linkId,
    referenceFrameId,
    mass: normalizeMass(raw.mass, linkId, `${label}.mass`),
    centerOfMass: normalizeCenterOfMass(raw.centerOfMass, linkId, `${label}.centerOfMass`),
    inertia: normalizeInertia(raw.inertia, linkId, `${label}.inertia`),
  };
}

function validateIdentityGraph(identityGraph) {
  const validation = validatePhysicalIdentityGraph(identityGraph);
  if (!validation.valid) throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);
  return identityGraph;
}

function validateLinkBindings(links, identityGraph) {
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  for (const link of links) {
    const identity = entityById.get(link.linkId);
    if (!identity) throw new Error(`dynamics link references unknown physical identity: ${link.linkId}`);
    if (identity.kind !== 'rigid-link') throw new Error(`dynamics subject ${link.linkId} must be a rigid-link, found ${identity.kind}`);
  }
}

function multiplyQuaternion(left, right) {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return canonicalizePhysicalQuaternion([
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ], 'composed rotation_quat_xyzw');
}

function conjugateQuaternion(quaternion) {
  return [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]];
}

function rotateVectorByQuaternion(quaternion, vector) {
  const [x, y, z, w] = quaternion;
  const [vx, vy, vz] = vector;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ].map((item) => Object.is(item, -0) ? 0 : item);
}

function identityTransform() {
  return {translation_m: [0, 0, 0], rotation_quat_xyzw: [0, 0, 0, 1]};
}

function composeTransforms(parentTransform, localTransform) {
  const rotatedTranslation = rotateVectorByQuaternion(parentTransform.rotation_quat_xyzw, localTransform.translation_m);
  return {
    translation_m: parentTransform.translation_m.map((item, index) => {
      const valueAt = item + rotatedTranslation[index];
      return Object.is(valueAt, -0) ? 0 : valueAt;
    }),
    rotation_quat_xyzw: multiplyQuaternion(parentTransform.rotation_quat_xyzw, localTransform.rotation_quat_xyzw),
  };
}

function frameChainToRoot(entityById, entityId) {
  const chain = [];
  const visited = new Set();
  let currentId = entityId;
  while (true) {
    if (visited.has(currentId)) throw new Error(`physical frame ancestry contains a cycle at ${currentId}`);
    visited.add(currentId);
    const entity = entityById.get(currentId);
    if (!entity) throw new Error(`physical frame ancestry references unknown entity: ${currentId}`);
    chain.push(currentId);
    if (!entity.frame) return chain;
    currentId = entity.frame.parentId;
  }
}

function transformFromAncestor(entityById, ancestorId, descendantId) {
  if (ancestorId === descendantId) return identityTransform();
  const frames = [];
  const visited = new Set();
  let currentId = descendantId;
  while (currentId !== ancestorId) {
    if (visited.has(currentId)) throw new Error(`physical frame ancestry contains a cycle at ${currentId}`);
    visited.add(currentId);
    const entity = entityById.get(currentId);
    if (!entity?.frame) throw new Error(`entities ${ancestorId} and ${descendantId} do not share a resolvable frame ancestry`);
    frames.push(entity.frame);
    currentId = entity.frame.parentId;
  }
  return frames.reverse().reduce((transform, frame) => composeTransforms(transform, frame), identityTransform());
}

function relativeFrameTransform(entityById, referenceId, targetId) {
  const referenceChain = frameChainToRoot(entityById, referenceId);
  const targetAncestors = new Set(frameChainToRoot(entityById, targetId));
  const commonAncestorId = referenceChain.find((id) => targetAncestors.has(id));
  if (!commonAncestorId) throw new Error(`entities ${referenceId} and ${targetId} do not share a physical frame root`);

  const referencePose = transformFromAncestor(entityById, commonAncestorId, referenceId);
  const targetPose = transformFromAncestor(entityById, commonAncestorId, targetId);
  const inverseReferenceRotation = conjugateQuaternion(referencePose.rotation_quat_xyzw);
  const delta = targetPose.translation_m.map((item, index) => item - referencePose.translation_m[index]);
  return {
    translation_m: rotateVectorByQuaternion(inverseReferenceRotation, delta),
    rotation_quat_xyzw: multiplyQuaternion(inverseReferenceRotation, targetPose.rotation_quat_xyzw),
  };
}

export function physicalDynamicsIdentityProjection(identityGraph, linkIds) {
  validateIdentityGraph(identityGraph);
  if (!Array.isArray(linkIds) || !linkIds.length) throw new Error('physical dynamics identity projection requires at least one link ID');
  const normalizedLinkIds = linkIds.map((id, index) => assertId(id, `linkIds[${index}]`)).sort();
  if (new Set(normalizedLinkIds).size !== normalizedLinkIds.length) throw new Error('physical dynamics identity projection link IDs must be unique');

  const linkIdSet = new Set(normalizedLinkIds);
  const entityById = new Map(identityGraph.entities.map((entity) => [entity.id, entity]));
  const links = normalizedLinkIds.map((id) => {
    const entity = entityById.get(id);
    if (!entity) throw new Error(`dynamics link references unknown physical identity: ${id}`);
    if (entity.kind !== 'rigid-link') throw new Error(`dynamics subject ${id} must be a rigid-link, found ${entity.kind}`);
    return structuredClone(entity);
  });

  const aggregations = identityGraph.relations
    .filter((relation) => relation.kind === 'AGGREGATES_INTO' && relation.targetIds.some((id) => linkIdSet.has(id)))
    .map((relation) => ({partId: relation.sourceId, linkId: relation.targetIds[0]}))
    .sort((a, b) => `${a.linkId}:${a.partId}`.localeCompare(`${b.linkId}:${b.partId}`));
  const partIds = [...new Set(aggregations.map((item) => item.partId))].sort();
  const parts = partIds.map((id) => {
    const entity = entityById.get(id);
    if (!entity || entity.kind !== 'physical-part') throw new Error(`aggregation source ${id} must resolve to a physical-part`);
    return structuredClone(entity);
  });
  const partLinkTransforms = aggregations.map(({partId, linkId}) => ({
    partId,
    linkId,
    transform: relativeFrameTransform(entityById, linkId, partId),
  }));

  return deepFreeze({
    schema: PHYSICAL_DYNAMICS_IDENTITY_PROJECTION_SCHEMA,
    scopeId: identityGraph.scopeId,
    sourceSha256: identityGraph.sourceSha256,
    links,
    parts,
    aggregations,
    partLinkTransforms,
  });
}

function identityBindingFromGraph(identityGraph, links) {
  validateIdentityGraph(identityGraph);
  const projection = physicalDynamicsIdentityProjection(identityGraph, links.map((link) => link.linkId));
  return {
    schema: PHYSICAL_DYNAMICS_IDENTITY_BINDING_SCHEMA,
    sourceSchema: identityGraph.schema,
    projectionDigest: digestJson(projection),
  };
}

function buildRigidBodyDynamics(raw, {identityGraph = raw?.identityGraph ?? null, requireLiveIdentityGraph = false} = {}) {
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'rigid-body dynamics input');
  if (!Array.isArray(raw.links) || !raw.links.length) throw new Error('rigid-body dynamics requires at least one link record');

  const scopeId = assertId(raw.scopeId, 'scopeId');
  const sourceSha256 = assertDigest(raw.sourceSha256, 'sourceSha256');
  const links = raw.links.map(normalizeLink).sort((a, b) => a.linkId.localeCompare(b.linkId));
  if (new Set(links.map((link) => link.linkId)).size !== links.length) throw new Error('rigid-body dynamics link IDs must be unique');

  let identityBinding;
  if (identityGraph) {
    validateIdentityGraph(identityGraph);
    if (identityGraph.scopeId !== scopeId) throw new Error('identity graph and dynamics scopeId differ');
    if (identityGraph.sourceSha256 !== sourceSha256) throw new Error('identity graph and dynamics sourceSha256 differ');
    validateLinkBindings(links, identityGraph);
    const liveBinding = identityBindingFromGraph(identityGraph, links);
    if (raw.identityBinding != null) {
      const declared = normalizeIdentityBinding(raw.identityBinding);
      if (declared.schema !== liveBinding.schema || declared.sourceSchema !== liveBinding.sourceSchema || declared.projectionDigest !== liveBinding.projectionDigest) {
        throw new Error('identityBinding does not bind the current dynamics-relevant identity projection');
      }
    }
    identityBinding = liveBinding;
  } else {
    if (requireLiveIdentityGraph) throw new Error('rigid-body dynamics creation requires the physical identity graph contract');
    identityBinding = normalizeIdentityBinding(raw.identityBinding);
  }

  const payload = {
    schema: RIGID_BODY_DYNAMICS_SCHEMA,
    scopeId,
    sourceSha256,
    identityBinding,
    links,
    policy: {
      rigidLinkIdentityRequired: true,
      scopedIdentityBinding: true,
      unrelatedIdentityGraphEditsDoNotInvalidateDynamics: true,
      referenceFrameIsBoundLink: true,
      centerOfMassUsesMeters: true,
      inertiaAboutCenterOfMass: true,
      inertiaUsesKgM2: true,
      unresolvedValuesRemainNull: true,
      semanticAuthorityRemainsExternal: true,
      fabricatedDefaultsForbidden: true,
      dynamicsDoNotAssertSourceTruth: true,
    },
  };
  return {...payload, dynamicsDigest: digestJson(payload)};
}

export function createRigidBodyDynamics(input = {}) {
  return deepFreeze(buildRigidBodyDynamics(input, {
    identityGraph: input.identityGraph ?? null,
    requireLiveIdentityGraph: true,
  }));
}

export function validateRigidBodyDynamics(value) {
  const errors = [];
  try {
    if (value?.schema !== RIGID_BODY_DYNAMICS_SCHEMA) errors.push('invalid schema');
    const recreated = buildRigidBodyDynamics(value, {identityGraph: null, requireLiveIdentityGraph: false});
    if (recreated.dynamicsDigest !== value?.dynamicsDigest) errors.push('rigid-body dynamics digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('rigid-body dynamics is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function validateRigidBodyDynamicsBindings(value, identityGraph) {
  const errors = [];
  const validation = validateRigidBodyDynamics(value);
  if (!validation.valid) errors.push(`rigid-body dynamics invalid: ${validation.errors.join('; ')}`);
  try {
    validateIdentityGraph(identityGraph);
    if (value?.scopeId !== identityGraph?.scopeId) errors.push('dynamics and identity graph scopeId differ');
    if (value?.sourceSha256 !== identityGraph?.sourceSha256) errors.push('dynamics and identity graph sourceSha256 differ');
    if (!errors.length) {
      validateLinkBindings(value.links, identityGraph);
      const liveBinding = identityBindingFromGraph(identityGraph, value.links);
      if (value.identityBinding.schema !== liveBinding.schema || value.identityBinding.sourceSchema !== liveBinding.sourceSchema || value.identityBinding.projectionDigest !== liveBinding.projectionDigest) {
        errors.push('dynamics does not bind the current dynamics-relevant identity projection');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function propertyDescriptors(contract) {
  return contract.links.flatMap((link) => [
    {
      linkId: link.linkId,
      property: 'mass',
      authoritySubjectId: link.mass.authoritySubjectId,
      resolved: link.mass.value_kg !== null,
    },
    {
      linkId: link.linkId,
      property: 'center-of-mass',
      authoritySubjectId: link.centerOfMass.authoritySubjectId,
      resolved: link.centerOfMass.value_m !== null,
    },
    {
      linkId: link.linkId,
      property: 'inertia',
      authoritySubjectId: link.inertia.authoritySubjectId,
      resolved: link.inertia.tensor_kg_m2 !== null,
    },
  ]);
}

export function rigidBodyDynamicsAuthoritySubjectIds(contract) {
  const validation = validateRigidBodyDynamics(contract);
  if (!validation.valid) throw new Error(`rigid-body dynamics is invalid: ${validation.errors.join('; ')}`);
  return propertyDescriptors(contract).map((item) => item.authoritySubjectId).sort();
}

export function validateRigidBodyDynamicsAuthority(contract, authoritySet) {
  const errors = [];
  const dynamicsValidation = validateRigidBodyDynamics(contract);
  if (!dynamicsValidation.valid) errors.push(`rigid-body dynamics invalid: ${dynamicsValidation.errors.join('; ')}`);
  const authorityValidation = validateSemanticAuthoritySet(authoritySet);
  if (!authorityValidation.valid) errors.push(`semantic authority set invalid: ${authorityValidation.errors.join('; ')}`);
  if (errors.length) return {valid: false, errors, missingSubjectIds: [], unknownSubjectIds: []};

  if (authoritySet.scopeId !== contract.scopeId) errors.push('authority set and dynamics scopeId differ');
  if (authoritySet.sourceSha256 !== contract.sourceSha256) errors.push('authority set and dynamics sourceSha256 differ');
  if (authoritySet.targetSchema !== contract.schema || authoritySet.targetDigest !== contract.dynamicsDigest) {
    errors.push('authority set does not bind the exact rigid-body dynamics contract');
  }

  const descriptors = propertyDescriptors(contract);
  const expectedIds = new Set(descriptors.map((item) => item.authoritySubjectId));
  const entryBySubject = new Map(authoritySet.entries.map((entry) => [entry.subjectId, entry]));
  const missingSubjectIds = [...expectedIds].filter((id) => !entryBySubject.has(id)).sort();
  const unknownSubjectIds = authoritySet.entries.map((entry) => entry.subjectId).filter((id) => !expectedIds.has(id)).sort();
  if (missingSubjectIds.length) errors.push(`missing dynamics semantic authority for subject(s): ${missingSubjectIds.join(', ')}`);
  if (unknownSubjectIds.length) errors.push(`authority set references subject(s) outside rigid-body dynamics: ${unknownSubjectIds.join(', ')}`);

  for (const descriptor of descriptors) {
    const entry = entryBySubject.get(descriptor.authoritySubjectId);
    if (!entry) continue;
    if (descriptor.resolved) {
      if (!CONSTRUCTION_AUTHORITIES.has(entry.authority)) {
        errors.push(`${descriptor.authoritySubjectId} resolved ${descriptor.property} requires observed, inferred, or engineered authority`);
      }
    } else if (entry.authority !== 'unknown') {
      errors.push(`${descriptor.authoritySubjectId} unresolved ${descriptor.property} requires unknown authority`);
    }
  }

  return {valid: errors.length === 0, errors, missingSubjectIds, unknownSubjectIds};
}

export function rigidBodyDynamicsForLink(contract, linkId) {
  const validation = validateRigidBodyDynamics(contract);
  if (!validation.valid) throw new Error(`rigid-body dynamics is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(linkId, 'linkId');
  return contract.links.find((link) => link.linkId === id) ?? null;
}

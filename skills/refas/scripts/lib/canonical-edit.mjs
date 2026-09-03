import {assertId, deepFreeze, digestJson} from './canonical.mjs';

export const CANONICAL_EDIT_SCHEMA = 'refas.canonical-edit-intent/v1';

export const CANONICAL_EDIT_CLASSES = Object.freeze([
  'shape',
  'pose',
  'appearance',
  'finalization',
]);

const CLASS_RULES = Object.freeze({
  shape: {
    ownerCapabilities: new Set(['shape-reconstruction', 'surface-topology', 'assembly']),
    sourceOfTruth: 'construction-state',
    canonicalBindings: [
      /^model\.(?:shape|geometry)\.[a-z0-9._:-]+$/u,
      /^construction\.[a-z0-9._:-]+$/u,
      /^surface-network\.[a-z0-9._:-]+$/u,
      /^attachment\.[a-z0-9._:-]+$/u,
    ],
    allowedRealizationOperations: new Set(['rebuild-glb']),
    directGlbMutation: 'forbidden',
    rebuildRequired: true,
  },
  pose: {
    ownerCapabilities: new Set(['assembly']),
    sourceOfTruth: 'realized-transform-state',
    canonicalBindings: [
      /^assembly\.joint\.[a-z0-9._:-]+\.angle$/u,
      /^assembly\.node\.[a-z0-9._:-]+\.(?:translation|rotation)\.[xyz]$/u,
    ],
    allowedRealizationOperations: new Set(['node-transform', 'joint-transform']),
    directGlbMutation: 'controlled-transform-only',
    rebuildRequired: false,
  },
  appearance: {
    ownerCapabilities: new Set(['appearance']),
    sourceOfTruth: 'appearance-state',
    canonicalBindings: [
      /^appearance\.material\.[a-z0-9._:-]+\.[a-z0-9._:-]+$/u,
      /^appearance\.texture\.[a-z0-9._:-]+$/u,
      /^appearance\.vertex-color\.[a-z0-9._:-]+$/u,
    ],
    allowedRealizationOperations: new Set(['rebake-appearance', 'rebuild-glb']),
    directGlbMutation: 'realization-only',
    rebuildRequired: true,
  },
  finalization: {
    ownerCapabilities: new Set(['assembly', 'shape-reconstruction']),
    sourceOfTruth: 'realized-asset',
    canonicalBindings: [/^finalization\.[a-z0-9._:-]+$/u],
    allowedRealizationOperations: new Set([
      'mesh-fuse',
      'mesh-weld',
      'internal-face-cleanup',
      'mesh-optimize',
    ]),
    directGlbMutation: 'controlled-finalization-only',
    rebuildRequired: false,
  },
});

const uniqueStrings = (values = []) => [...new Set(values.map(String).filter(Boolean))].sort();

function ruleFor(editClass) {
  const key = String(editClass ?? '').trim();
  const rule = CLASS_RULES[key];
  if (!rule) throw new Error(`editClass must be one of: ${CANONICAL_EDIT_CLASSES.join(', ')}`);
  return {editClass: key, rule};
}

function normalizeBindings(values, rule) {
  const bindings = uniqueStrings(values);
  if (!bindings.length) throw new Error('canonicalBindings requires at least one upstream binding');
  for (const binding of bindings) {
    if (!rule.canonicalBindings.some((pattern) => pattern.test(binding))) {
      throw new Error(`canonical binding is outside the ${rule.sourceOfTruth} boundary: ${binding}`);
    }
  }
  return bindings;
}

function normalizeOperations(values, rule) {
  const operations = uniqueStrings(values);
  if (!operations.length) throw new Error('realizationOperations requires at least one operation');
  for (const operation of operations) {
    if (!rule.allowedRealizationOperations.has(operation)) {
      throw new Error(`realization operation is not allowed for this edit class: ${operation}`);
    }
  }
  return operations;
}

export function createCanonicalEditIntent({
  id,
  ownerCapability,
  scopeId,
  editClass,
  canonicalBindings = [],
  realizationOperations = [],
  evidenceRefs = [],
  intent = '',
} = {}) {
  const {editClass: normalizedClass, rule} = ruleFor(editClass);
  const owner = assertId(ownerCapability, 'ownerCapability');
  if (!rule.ownerCapabilities.has(owner)) {
    throw new Error(`${normalizedClass} edits cannot be owned by ${owner}`);
  }
  const text = String(intent ?? '').trim();
  if (!text) throw new Error('intent must be non-empty');

  const payload = {
    schema: CANONICAL_EDIT_SCHEMA,
    id: assertId(id, 'id'),
    ownerCapability: owner,
    scopeId: assertId(scopeId, 'scopeId'),
    editClass: normalizedClass,
    intent: text,
    sourceOfTruth: rule.sourceOfTruth,
    canonicalBindings: normalizeBindings(canonicalBindings, rule),
    realizationOperations: normalizeOperations(realizationOperations, rule),
    evidenceRefs: uniqueStrings(evidenceRefs),
    mutationBoundary: {
      directGlbMutation: rule.directGlbMutation,
      rebuildRequired: rule.rebuildRequired,
    },
    policy: {
      glbIsRealizedArtifact: true,
      semanticShapeEditsHappenUpstream: true,
      arbitraryMeshBinaryPatchForbidden: true,
      poseDirectEditTransformOnly: true,
      appearanceCanonicalStatePrecedesBake: true,
      finalizationDirectEditMustBeControlled: true,
    },
  };
  return deepFreeze({...payload, intentDigest: digestJson(payload)});
}

export function validateCanonicalEditIntent(value) {
  const errors = [];
  try {
    if (value?.schema !== CANONICAL_EDIT_SCHEMA) errors.push('invalid schema');
    const recreated = createCanonicalEditIntent(value);
    if (recreated.intentDigest !== value.intentDigest) errors.push('canonical edit intent digest mismatch');
    if (digestJson(recreated) !== digestJson(value)) errors.push('canonical edit intent is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

export function assertCanonicalEditOperation(intent, {binding, operation, mutatesMeshBytes = false} = {}) {
  const validation = validateCanonicalEditIntent(intent);
  if (!validation.valid) throw new Error(`canonical edit intent is invalid: ${validation.errors.join('; ')}`);
  const {rule} = ruleFor(intent.editClass);
  const normalizedBinding = String(binding ?? '').trim();
  const normalizedOperation = String(operation ?? '').trim();
  if (!intent.canonicalBindings.includes(normalizedBinding)) throw new Error(`binding is not declared by this edit intent: ${normalizedBinding}`);
  if (!intent.realizationOperations.includes(normalizedOperation)) throw new Error(`operation is not declared by this edit intent: ${normalizedOperation}`);
  if (!rule.canonicalBindings.some((pattern) => pattern.test(normalizedBinding))) throw new Error(`binding violates ${intent.editClass} edit boundary`);
  if (!rule.allowedRealizationOperations.has(normalizedOperation)) throw new Error(`operation violates ${intent.editClass} edit boundary`);
  if (intent.editClass === 'pose' && mutatesMeshBytes) throw new Error('pose edits may not mutate mesh/accessor bytes');
  if (intent.editClass === 'shape' && normalizedOperation !== 'rebuild-glb') throw new Error('shape edits must rebuild the realized GLB');
  return true;
}

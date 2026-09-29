import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {attachConstructionExecution, inspectGlb, parseGlb} from './glb.mjs';
import {createHardSurfaceShell} from './hard-surface.mjs';
import {createSectionProfileLoft} from './geometry-backend.mjs';
import {createSurfaceNetworkParts, validateSurfaceNetwork} from './surface-network.mjs';

export const CONSTRUCTION_VOCABULARY_SCHEMA = 'refas.construction-vocabulary/v1';
export const CONSTRUCTION_OPERATION_PERMIT_SCHEMA = 'refas.construction-operation-permit/v1';
export const CONSTRUCTION_AUTHORITY_SCHEMA = 'refas.construction-authority/v1';
export const CONSTRUCTION_EXECUTION_SCHEMA = 'refas.construction-execution/v1';
export const CONSTRUCTION_EXECUTION_PROOF_SCHEMA = 'refas.construction-execution-proof/v1';
export const EXTERNAL_CONSTRUCTION_RECEIPT_SCHEMA = 'refas.external-construction-receipt/v1';

export const CONSTRUCTION_VOCABULARIES = Object.freeze([
  'hard-surface',
  'organic',
  'mechanical-articulated',
  'hybrid',
  'unresolved',
]);

export const CONSTRUCTION_OPERATIONS = Object.freeze([
  'hard-surface-shell',
  'surface-network-parts',
  'section-profile-loft-rigid',
  'section-profile-loft-organic',
  'assembly-decomposition',
  'external-construction',
]);

const VOCABULARY_SET = new Set(CONSTRUCTION_VOCABULARIES);
const OPERATION_SET = new Set(CONSTRUCTION_OPERATIONS);
const LEAF_VOCABULARIES = new Set(['hard-surface', 'organic']);
const OPERATION_VOCABULARY = Object.freeze({
  'hard-surface-shell': 'hard-surface',
  'surface-network-parts': 'hard-surface',
  'section-profile-loft-rigid': 'hard-surface',
  'section-profile-loft-organic': 'organic',
  'assembly-decomposition': 'mechanical-articulated',
});

function strings(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function requiredStrings(values, label) {
  const output = strings(values);
  if (!output.length) throw new Error(`${label} requires at least one value`);
  return output;
}

function normalizeCue(raw, index, label) {
  const evidenceRefs = requiredStrings(raw?.evidenceRefs, `${label}[${index}].evidenceRefs`);
  const description = String(raw?.description ?? '').trim();
  if (!description) throw new Error(`${label}[${index}].description is required`);
  return {
    id: assertId(raw?.id, `${label}[${index}].id`),
    description,
    evidenceRefs,
  };
}

function normalizeMechanicalDecomposition(raw, identityScopes) {
  if (!raw || typeof raw !== 'object') throw new Error('mechanical-articulated vocabulary requires mechanicalDecomposition');
  const partIds = requiredStrings(raw.partIds, 'mechanicalDecomposition.partIds').map((id, index) => assertId(id, `mechanicalDecomposition.partIds[${index}]`));
  const interfaceIds = requiredStrings(raw.interfaceIds, 'mechanicalDecomposition.interfaceIds').map((id, index) => assertId(id, `mechanicalDecomposition.interfaceIds[${index}]`));
  const articulationIds = requiredStrings(raw.articulationIds, 'mechanicalDecomposition.articulationIds').map((id, index) => assertId(id, `mechanicalDecomposition.articulationIds[${index}]`));
  const evidenceRefs = requiredStrings(raw.evidenceRefs, 'mechanicalDecomposition.evidenceRefs');
  if (JSON.stringify([...partIds].sort()) !== JSON.stringify([...identityScopes].sort())) {
    throw new Error('mechanicalDecomposition.partIds must exactly cover identityScopes');
  }
  return {partIds, interfaceIds, articulationIds, evidenceRefs};
}

function normalizedChildDecision(raw, sourceSha256, index) {
  const validation = validateConstructionVocabulary(raw);
  if (!validation.valid) throw new Error(`childDecisions[${index}] is invalid: ${validation.errors.join('; ')}`);
  if (raw.sourceSha256 !== sourceSha256) throw new Error(`childDecisions[${index}] does not bind the parent source`);
  if (!LEAF_VOCABULARIES.has(raw.vocabulary)) throw new Error(`childDecisions[${index}] must resolve to hard-surface or organic`);
  return raw;
}

export function createConstructionVocabulary({
  scopeId,
  sourceSha256,
  vocabulary = 'unresolved',
  cues = [],
  contraryCues = [],
  ambiguities = [],
  evidenceRefs = [],
  identityScopes = [],
  childDecisions = [],
  mechanicalDecomposition = null,
} = {}) {
  const normalizedScopeId = assertId(scopeId, 'scopeId');
  const normalizedSource = assertDigest(sourceSha256, 'sourceSha256');
  const normalizedVocabulary = String(vocabulary ?? '').trim().toLowerCase();
  if (!VOCABULARY_SET.has(normalizedVocabulary)) throw new Error(`unknown construction vocabulary: ${vocabulary}`);
  const normalizedEvidence = requiredStrings(evidenceRefs, 'evidenceRefs');
  const normalizedCues = cues.map((item, index) => normalizeCue(item, index, 'cues'));
  const normalizedContrary = contraryCues.map((item, index) => normalizeCue(item, index, 'contraryCues'));
  const normalizedAmbiguities = strings(ambiguities);

  if (normalizedVocabulary === 'unresolved') {
    if (normalizedCues.length && !normalizedAmbiguities.length) throw new Error('unresolved vocabulary with positive cues must declare the unresolved ambiguity');
  } else if (!normalizedCues.length) {
    throw new Error(`${normalizedVocabulary} vocabulary requires at least one source-grounded cue`);
  }

  let normalizedIdentityScopes;
  let normalizedChildren;
  let normalizedMechanical = null;

  if (normalizedVocabulary === 'hybrid' || normalizedVocabulary === 'mechanical-articulated') {
    normalizedIdentityScopes = requiredStrings(identityScopes, 'identityScopes').map((id, index) => assertId(id, `identityScopes[${index}]`));
    if (normalizedIdentityScopes.length < 2) throw new Error(`${normalizedVocabulary} vocabulary requires at least two identity scopes`);
    normalizedChildren = childDecisions.map((child, index) => normalizedChildDecision(child, normalizedSource, index))
      .sort((a, b) => a.scopeId.localeCompare(b.scopeId));
    if (new Set(normalizedChildren.map((child) => child.scopeId)).size !== normalizedChildren.length) throw new Error('child decision scope IDs must be unique');
    if (normalizedChildren.some((child) => child.scopeId === normalizedScopeId)) throw new Error('composite vocabulary child scope cannot equal the parent scope');
    if (JSON.stringify(normalizedChildren.map((child) => child.scopeId).sort()) !== JSON.stringify([...normalizedIdentityScopes].sort())) {
      throw new Error('childDecisions must exactly cover identityScopes');
    }
    if (normalizedVocabulary === 'mechanical-articulated') {
      normalizedMechanical = normalizeMechanicalDecomposition(mechanicalDecomposition, normalizedIdentityScopes);
    } else if (mechanicalDecomposition != null) {
      throw new Error('mechanicalDecomposition is only valid for mechanical-articulated vocabulary');
    }
  } else {
    normalizedIdentityScopes = [normalizedScopeId];
    normalizedChildren = [];
    if (identityScopes.length && !(identityScopes.length === 1 && identityScopes[0] === normalizedScopeId)) {
      throw new Error('leaf/unresolved vocabulary identityScopes must be omitted or contain only scopeId');
    }
    if (childDecisions.length) throw new Error('leaf/unresolved vocabulary cannot carry childDecisions');
    if (mechanicalDecomposition != null) throw new Error('mechanicalDecomposition is only valid for mechanical-articulated vocabulary');
  }

  const payload = {
    schema: CONSTRUCTION_VOCABULARY_SCHEMA,
    scopeId: normalizedScopeId,
    sourceSha256: normalizedSource,
    vocabulary: normalizedVocabulary,
    cues: normalizedCues,
    contraryCues: normalizedContrary,
    ambiguities: normalizedAmbiguities,
    evidenceRefs: normalizedEvidence,
    identityScopes: normalizedIdentityScopes,
    childDecisions: normalizedChildren,
    mechanicalDecomposition: normalizedMechanical,
    policy: {
      decisionPrecedesIdentityGeometry: true,
      unresolvedIsBlockoutOnly: true,
      compositeWholeCannotUseOneUndifferentiatedGeometryFamily: true,
      mechanicalWholeRequiresExplicitDecomposition: true,
      evidenceRemainsPrimary: true,
    },
  };
  return deepFreeze({...payload, vocabularyDigest: digestJson(payload)});
}

export function validateConstructionVocabulary(record) {
  const errors = [];
  try {
    if (record?.schema !== CONSTRUCTION_VOCABULARY_SCHEMA) errors.push('invalid schema');
    const recreated = createConstructionVocabulary(record);
    if (recreated.vocabularyDigest !== record.vocabularyDigest) errors.push('construction vocabulary normalization mismatch');
    if (digestJson(recreated) !== digestJson(record)) errors.push('construction vocabulary is not canonical');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function findEffectiveDecision(rootDecision, scopeId) {
  if (rootDecision.scopeId === scopeId) return rootDecision;
  return (rootDecision.childDecisions ?? []).find((child) => child.scopeId === scopeId) ?? null;
}

function operationAllowed(vocabulary, operation, {isRootScope = false} = {}) {
  if (operation === 'assembly-decomposition') return vocabulary === 'mechanical-articulated' && isRootScope;
  if (operation === 'external-construction') return LEAF_VOCABULARIES.has(vocabulary);
  const required = OPERATION_VOCABULARY[operation];
  return required === vocabulary;
}

export function createConstructionOperationPermit({
  decision,
  scopeId,
  operation,
  evidenceRefs = [],
} = {}) {
  const validation = validateConstructionVocabulary(decision);
  if (!validation.valid) throw new Error(`construction vocabulary is invalid: ${validation.errors.join('; ')}`);
  const targetScope = assertId(scopeId, 'scopeId');
  const normalizedOperation = String(operation ?? '').trim();
  if (!OPERATION_SET.has(normalizedOperation)) throw new Error(`unknown construction operation: ${operation}`);

  const effective = findEffectiveDecision(decision, targetScope);
  if (!effective) throw new Error(`construction vocabulary does not cover scope ${targetScope}`);
  if (effective.vocabulary === 'unresolved') throw new Error('unresolved construction vocabulary cannot authorize identity-bearing geometry');
  const isRootScope = targetScope === decision.scopeId;
  if ((decision.vocabulary === 'hybrid' || decision.vocabulary === 'mechanical-articulated') && isRootScope && normalizedOperation !== 'assembly-decomposition') {
    throw new Error(`${decision.vocabulary} whole scope cannot authorize one undifferentiated identity geometry operation`);
  }
  if (!operationAllowed(effective.vocabulary, normalizedOperation, {isRootScope})) {
    throw new Error(`construction operation ${normalizedOperation} is incompatible with vocabulary ${effective.vocabulary}`);
  }
  if (decision.vocabulary === 'mechanical-articulated' && normalizedOperation !== 'assembly-decomposition') {
    if (!decision.mechanicalDecomposition?.partIds.includes(targetScope)) throw new Error(`mechanical decomposition does not cover part scope ${targetScope}`);
  }

  const mechanicalDecompositionDigest = decision.mechanicalDecomposition == null ? null : digestJson(decision.mechanicalDecomposition);
  const normalizedEvidence = strings([
    ...decision.evidenceRefs,
    ...effective.evidenceRefs,
    ...(decision.mechanicalDecomposition?.evidenceRefs ?? []),
    ...evidenceRefs,
  ]);
  const payload = {
    schema: CONSTRUCTION_OPERATION_PERMIT_SCHEMA,
    rootScopeId: decision.scopeId,
    scopeId: targetScope,
    sourceSha256: decision.sourceSha256,
    vocabulary: effective.vocabulary,
    operation: normalizedOperation,
    vocabularyDigest: decision.vocabularyDigest,
    effectiveVocabularyDigest: effective.vocabularyDigest,
    mechanicalDecompositionDigest,
    evidenceRefs: normalizedEvidence,
    policy: {
      identityGeometryRequiresPermit: true,
      permitIsScopeSourceDecisionAndOperationBound: true,
      lowLevelPrimitivesDoNotImplyIdentityAuthority: true,
    },
  };
  return deepFreeze({...payload, permitDigest: digestJson(payload)});
}

export function validateConstructionOperationPermit(permit, decision, {scopeId = null, operation = null} = {}) {
  const errors = [];
  try {
    if (permit?.schema !== CONSTRUCTION_OPERATION_PERMIT_SCHEMA) errors.push('invalid permit schema');
    const expected = createConstructionOperationPermit({
      decision,
      scopeId: scopeId ?? permit?.scopeId,
      operation: operation ?? permit?.operation,
      evidenceRefs: permit?.evidenceRefs ?? [],
    });
    if (expected.permitDigest !== permit?.permitDigest) errors.push('construction permit digest mismatch');
    if (digestJson(expected) !== digestJson(permit)) errors.push('construction permit is not canonical for the bound decision');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

function requirePermit(decision, permit, operation, scopeId) {
  const validation = validateConstructionOperationPermit(permit, decision, {operation, scopeId});
  if (!validation.valid) throw new Error(`construction operation permit is invalid: ${validation.errors.join('; ')}`);
}

const EXTERNAL_INPUT_KINDS = new Set(['source', 'guide', 'prior', 'other']);
const EXTERNAL_INPUT_AUTHORITIES = new Set(['observed', 'inferred', 'engineered']);

function normalizeExternalConstructionInput(raw, index) {
  const kind = String(raw?.kind ?? '').trim().toLowerCase();
  const authority = String(raw?.authority ?? '').trim().toLowerCase();
  if (!EXTERNAL_INPUT_KINDS.has(kind)) throw new Error(`inputs[${index}].kind is invalid`);
  if (!EXTERNAL_INPUT_AUTHORITIES.has(authority)) throw new Error(`inputs[${index}].authority is invalid`);
  if (kind === 'prior' && authority === 'observed') throw new Error('external construction prior cannot claim observed authority');
  return {
    id: assertId(raw?.id, `inputs[${index}].id`),
    kind,
    authority,
    sha256: assertDigest(raw?.sha256, `inputs[${index}].sha256`),
  };
}

function normalizeExternalInvocation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invocation is required');
  const args = raw.args;
  const versionArgs = raw.versionArgs;
  if (!Array.isArray(args) || !args.length || args.length > 64) throw new Error('invocation.args must contain 1..64 arguments');
  if (!Array.isArray(versionArgs) || !versionArgs.length || versionArgs.length > 16) throw new Error('invocation.versionArgs must contain 1..16 arguments');
  const normalizedArgs = args.map((value, index) => {
    const arg = String(value);
    if (!arg || arg.length > 4096) throw new Error(`invocation.args[${index}] must contain 1..4096 characters`);
    return arg;
  });
  const normalizedVersionArgs = versionArgs.map((value, index) => {
    const arg = String(value);
    if (!arg || arg.length > 4096) throw new Error(`invocation.versionArgs[${index}] must contain 1..4096 characters`);
    return arg;
  });
  const safeName = (value, label) => {
    const normalized = String(value ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) throw new Error(`${label} must be a safe basename`);
    return normalized;
  };
  const scriptFileName = safeName(raw.scriptFileName, 'invocation.scriptFileName');
  const outputFileName = safeName(raw.outputFileName, 'invocation.outputFileName');
  if (!outputFileName.endsWith('.glb')) throw new Error('invocation.outputFileName must end in .glb');
  if (!normalizedArgs.some((value) => value.includes('{script}'))) throw new Error('invocation.args must reference {script}');
  if (!normalizedArgs.some((value) => value.includes('{output}'))) throw new Error('invocation.args must reference {output}');
  return {args: normalizedArgs, versionArgs: normalizedVersionArgs, scriptFileName, outputFileName};
}

export function createExternalConstructionReceipt({
  decision,
  permit,
  tool,
  scriptSha256,
  invocation,
  inputs = [],
  determinism = {mode: 'byte-exact'},
  outputGlbSha256,
  evidenceRefs = [],
} = {}) {
  requirePermit(decision, permit, 'external-construction', permit?.scopeId);
  const toolId = assertId(tool?.id, 'tool.id');
  const toolVersion = String(tool?.version ?? '').trim();
  if (!toolVersion) throw new Error('tool.version is required');
  const normalizedInputs = inputs.map(normalizeExternalConstructionInput)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!normalizedInputs.length) throw new Error('external construction receipt requires exact input digests');
  if (new Set(normalizedInputs.map((item) => item.id)).size !== normalizedInputs.length) throw new Error('external construction input IDs must be unique');
  const sourceInputs = normalizedInputs.filter((item) => item.kind === 'source');
  if (sourceInputs.length !== 1 || sourceInputs[0].sha256 !== permit.sourceSha256 || sourceInputs[0].authority !== 'observed') {
    throw new Error('external construction receipt requires exactly one observed source input bound to the permit source');
  }
  const normalizedInvocation = normalizeExternalInvocation(invocation);
  const inputIds = new Set(normalizedInputs.map((item) => item.id));
  for (const arg of normalizedInvocation.args) {
    for (const match of arg.matchAll(/\{input:([^}]+)\}/gu)) {
      if (!inputIds.has(match[1])) throw new Error(`invocation references undeclared input ${match[1]}`);
    }
  }
  for (const input of normalizedInputs) {
    if (!normalizedInvocation.args.some((arg) => arg.includes(`{input:${input.id}}`))) {
      throw new Error(`invocation does not reference declared input ${input.id}`);
    }
  }
  const mode = String(determinism?.mode ?? '').trim();
  if (mode !== 'byte-exact') throw new Error('external construction currently requires byte-exact determinism');
  const payload = {
    schema: EXTERNAL_CONSTRUCTION_RECEIPT_SCHEMA,
    rootScopeId: permit.rootScopeId,
    scopeId: permit.scopeId,
    sourceSha256: permit.sourceSha256,
    vocabulary: permit.vocabulary,
    operation: permit.operation,
    vocabularyDigest: permit.vocabularyDigest,
    effectiveVocabularyDigest: permit.effectiveVocabularyDigest,
    mechanicalDecompositionDigest: permit.mechanicalDecompositionDigest,
    permitDigest: permit.permitDigest,
    tool: {id: toolId, version: toolVersion},
    scriptSha256: assertDigest(scriptSha256, 'scriptSha256'),
    invocation: normalizedInvocation,
    inputs: normalizedInputs,
    determinism: {mode},
    outputGlbSha256: assertDigest(outputGlbSha256, 'outputGlbSha256'),
    evidenceRefs: requiredStrings(evidenceRefs, 'evidenceRefs'),
    policy: {
      externalOutputRequiresReexecution: true,
      receiptCannotAuthorizeWithoutProof: true,
      priorCannotBecomeObservedSourceTruth: true,
    },
  };
  return deepFreeze({...payload, receiptDigest: digestJson(payload)});
}

export function validateExternalConstructionReceipt(receipt, decision, permit, {outputGlbSha256 = null} = {}) {
  const errors = [];
  try {
    if (receipt?.schema !== EXTERNAL_CONSTRUCTION_RECEIPT_SCHEMA) errors.push('invalid external construction receipt schema');
    const recreated = createExternalConstructionReceipt({
      decision,
      permit,
      tool: receipt?.tool,
      scriptSha256: receipt?.scriptSha256,
      invocation: receipt?.invocation,
      inputs: receipt?.inputs ?? [],
      determinism: receipt?.determinism,
      outputGlbSha256: receipt?.outputGlbSha256,
      evidenceRefs: receipt?.evidenceRefs ?? [],
    });
    if (recreated.receiptDigest !== receipt?.receiptDigest) errors.push('external construction receipt digest mismatch');
    if (digestJson(recreated) !== digestJson(receipt)) errors.push('external construction receipt is not canonical');
    if (outputGlbSha256 != null && receipt?.outputGlbSha256 !== assertDigest(outputGlbSha256, 'outputGlbSha256')) errors.push('external construction receipt output mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function createConstructionAuthority({decision, permit} = {}) {
  const validation = validateConstructionOperationPermit(permit, decision);
  if (!validation.valid) throw new Error(`construction operation permit is invalid: ${validation.errors.join('; ')}`);
  const payload = {
    schema: CONSTRUCTION_AUTHORITY_SCHEMA,
    rootScopeId: permit.rootScopeId,
    scopeId: permit.scopeId,
    sourceSha256: permit.sourceSha256,
    vocabulary: permit.vocabulary,
    operation: permit.operation,
    vocabularyDigest: permit.vocabularyDigest,
    effectiveVocabularyDigest: permit.effectiveVocabularyDigest,
    mechanicalDecompositionDigest: permit.mechanicalDecompositionDigest,
    permitDigest: permit.permitDigest,
  };
  return deepFreeze({...payload, authorityDigest: digestJson(payload)});
}

function verifyExecutionRecord(execution, permitByDigest, receiptByDigest = new Map()) {
  if (!execution || execution.schema !== CONSTRUCTION_EXECUTION_SCHEMA) throw new Error('candidate contains an invalid construction execution schema');
  const permit = permitByDigest.get(execution.permitDigest);
  if (!permit) throw new Error(`candidate construction execution references an undeclared permit: ${execution.permitDigest ?? '?'}`);
  const authorityPayload = {
    schema: CONSTRUCTION_AUTHORITY_SCHEMA,
    rootScopeId: execution.rootScopeId,
    scopeId: execution.scopeId,
    sourceSha256: execution.sourceSha256,
    vocabulary: execution.vocabulary,
    operation: execution.operation,
    vocabularyDigest: execution.vocabularyDigest,
    effectiveVocabularyDigest: execution.effectiveVocabularyDigest,
    mechanicalDecompositionDigest: execution.mechanicalDecompositionDigest,
    permitDigest: execution.permitDigest,
  };
  if (digestJson(authorityPayload) !== execution.authorityDigest) throw new Error('candidate construction authority digest mismatch');
  for (const field of ['rootScopeId','scopeId','sourceSha256','vocabulary','operation','vocabularyDigest','effectiveVocabularyDigest','mechanicalDecompositionDigest','permitDigest']) {
    if (execution[field] !== permit[field]) throw new Error(`candidate construction execution does not match permit field ${field}`);
  }
  assertDigest(execution.geometrySha256, 'construction execution geometrySha256');
  if (permit.operation === 'external-construction') {
    const receiptDigest = assertDigest(execution.externalReceiptDigest, 'construction execution externalReceiptDigest');
    const receipt = receiptByDigest.get(receiptDigest);
    if (!receipt) throw new Error('external construction execution lacks a verified receipt');
    if (receipt.permitDigest !== permit.permitDigest) throw new Error('external construction receipt permit mismatch');
    if (receipt.outputGlbSha256 !== execution.geometrySha256) throw new Error('external construction execution output digest mismatch');
  } else if (execution.externalReceiptDigest != null) {
    throw new Error('non-external construction execution cannot carry an external receipt');
  }
  const payload = structuredClone(execution); delete payload.executionDigest;
  if (digestJson(payload) !== execution.executionDigest) throw new Error('candidate construction execution digest mismatch');
  return execution;
}

function normalizedExecutionContext(decision, permits, externalReceipts = []) {
  const decisionValidation = validateConstructionVocabulary(decision);
  if (!decisionValidation.valid) throw new Error(`construction vocabulary is invalid: ${decisionValidation.errors.join('; ')}`);
  const permitByDigest = new Map();
  for (const [index, permit] of permits.entries()) {
    const permitValidation = validateConstructionOperationPermit(permit, decision);
    if (!permitValidation.valid) throw new Error(`constructionPermits[${index}] is invalid: ${permitValidation.errors.join('; ')}`);
    if (permitByDigest.has(permit.permitDigest)) throw new Error('construction execution proof cannot repeat a permit');
    permitByDigest.set(permit.permitDigest, permit);
  }
  const receiptByDigest = new Map();
  for (const [index, receipt] of externalReceipts.entries()) {
    const permit = permitByDigest.get(receipt?.permitDigest);
    if (!permit) throw new Error(`externalReceipts[${index}] references an undeclared permit`);
    const receiptValidation = validateExternalConstructionReceipt(receipt, decision, permit);
    if (!receiptValidation.valid) throw new Error(`externalReceipts[${index}] is invalid: ${receiptValidation.errors.join('; ')}`);
    if (receiptByDigest.has(receipt.receiptDigest)) throw new Error('construction execution proof cannot repeat an external receipt');
    receiptByDigest.set(receipt.receiptDigest, receipt);
  }
  for (const permit of permits.filter((item) => item.operation === 'external-construction')) {
    if (![...receiptByDigest.values()].some((receipt) => receipt.permitDigest === permit.permitDigest)) throw new Error(`external construction permit ${permit.permitDigest} requires a verified receipt`);
  }
  return {permitByDigest, receiptByDigest, identityPermits: permits.filter((permit) => permit.operation !== 'assembly-decomposition')};
}

export function createConstructionExecutionProof({assetBytes, decision, permits = [], externalReceipts = [], evidenceRefs = []} = {}) {
  const bytes = Buffer.from(assetBytes ?? []);
  if (!bytes.length) throw new Error('construction execution proof requires candidate asset bytes');
  const {permitByDigest, receiptByDigest, identityPermits} = normalizedExecutionContext(decision, permits, externalReceipts);
  if (!identityPermits.length) throw new Error('construction execution proof requires at least one identity-bearing construction permit');
  const parsed = parseGlb(bytes);
  const executions = [...(parsed.json?.extras?.refas?.constructionExecutions ?? [])]
    .map((execution) => verifyExecutionRecord(execution, permitByDigest, receiptByDigest))
    .sort((a, b) => a.scopeId.localeCompare(b.scopeId) || a.partId.localeCompare(b.partId));
  if (!executions.length) throw new Error('candidate asset carries no permit-bound construction executions');
  for (const permit of identityPermits) {
    if (!executions.some((execution) => execution.permitDigest === permit.permitDigest)) throw new Error(`candidate asset does not carry construction execution for permit ${permit.permitDigest}`);
  }
  const payload = {
    schema: CONSTRUCTION_EXECUTION_PROOF_SCHEMA,
    assetSha256: digestBytes(bytes),
    sourceSha256: decision.sourceSha256,
    vocabularyDigest: decision.vocabularyDigest,
    permitDigests: [...permitByDigest.keys()].sort(),
    executions,
    evidenceRefs: requiredStrings(evidenceRefs, 'evidenceRefs'),
    ...(externalReceipts.length ? {externalReceipts: [...externalReceipts].sort((a, b) => a.receiptDigest.localeCompare(b.receiptDigest))} : {}),
    policy: {
      candidateBytesCarryConstructionExecutions: true,
      detachedPermitsCannotCloseIdentity: true,
      rawGeometryWithoutAuthorityIsBlockoutOnly: true,
      ...(externalReceipts.length ? {
        externalConstructionRequiresVerifiedReceipt: true,
        externalConstructionRequiresByteExactReplay: true,
      } : {}),
    },
  };
  return deepFreeze({...payload, proofDigest: digestJson(payload)});
}

export function validateConstructionExecutionProof(proof, decision, permits = [], {assetSha256 = null} = {}) {
  const errors = [];
  try {
    if (proof?.schema !== CONSTRUCTION_EXECUTION_PROOF_SCHEMA) errors.push('invalid construction execution proof schema');
    const externalReceipts = Array.isArray(proof?.externalReceipts) ? proof.externalReceipts : [];
    const {permitByDigest, receiptByDigest, identityPermits} = normalizedExecutionContext(decision, permits, externalReceipts);
    if (proof?.sourceSha256 !== decision?.sourceSha256) errors.push('construction execution proof source mismatch');
    if (proof?.vocabularyDigest !== decision?.vocabularyDigest) errors.push('construction execution proof vocabulary mismatch');
    if (assetSha256 != null && proof?.assetSha256 !== assertDigest(assetSha256, 'assetSha256')) errors.push('construction execution proof asset mismatch');
    const executions = Array.isArray(proof?.executions) ? proof.executions : [];
    if (!executions.length) errors.push('construction execution proof has no executions');
    for (const execution of executions) verifyExecutionRecord(execution, permitByDigest, receiptByDigest);
    for (const permit of identityPermits) if (!executions.some((execution) => execution.permitDigest === permit.permitDigest)) errors.push(`construction execution proof does not cover permit ${permit.permitDigest}`);
    const expectedPermitDigests = [...permitByDigest.keys()].sort();
    if (JSON.stringify(proof?.permitDigests ?? []) !== JSON.stringify(expectedPermitDigests)) errors.push('construction execution proof permit set mismatch');
    const receiptDigests = externalReceipts.map((receipt) => receipt.receiptDigest);
    if (JSON.stringify(receiptDigests) !== JSON.stringify([...receiptDigests].sort())) errors.push('construction execution proof external receipts are not canonical');
    for (const field of ['candidateBytesCarryConstructionExecutions', 'detachedPermitsCannotCloseIdentity', 'rawGeometryWithoutAuthorityIsBlockoutOnly']) {
      if (proof?.policy?.[field] !== true) errors.push(`construction execution proof policy ${field} must be true`);
    }
    if (externalReceipts.length) {
      if (proof?.policy?.externalConstructionRequiresVerifiedReceipt !== true) errors.push('external construction proof must require a verified receipt');
      if (proof?.policy?.externalConstructionRequiresByteExactReplay !== true) errors.push('external construction proof must require byte-exact replay');
    }
    const payload = structuredClone(proof); delete payload.proofDigest;
    if (digestJson(payload) !== proof?.proofDigest) errors.push('construction execution proof digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

function assertExternalGlbHasNoConstructionAuthority(json, label) {
  if (json?.extras?.refas?.constructionExecutions != null) throw new Error(`${label} cannot carry pre-authored RefAs construction executions`);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'constructionAuthority') || Object.hasOwn(value, 'refasConstructionExecution')) {
      throw new Error(`${label} cannot carry pre-authored RefAs construction authority metadata`);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
}

function finalizeExternalConstructionReplay({
  decision,
  permit,
  receipt,
  scriptBytes,
  inputBytes = {},
  outputBytes,
  reexecutedBytes,
  partId = null,
  evidenceRefs = [],
} = {}) {
  requirePermit(decision, permit, 'external-construction', permit?.scopeId);
  const output = Buffer.from(outputBytes ?? []);
  const replay = Buffer.from(reexecutedBytes ?? []);
  const script = Buffer.from(scriptBytes ?? []);
  if (!script.length) throw new Error('external construction attestation requires exact script bytes');
  if (!output.length || !replay.length) throw new Error('external construction attestation requires output and reexecuted GLB bytes');
  const parsedOutput = parseGlb(output);
  const parsedReplay = parseGlb(replay);
  assertExternalGlbHasNoConstructionAuthority(parsedOutput.json, 'external construction output');
  assertExternalGlbHasNoConstructionAuthority(parsedReplay.json, 'external construction replay');
  const outputInspection = inspectGlb(output);
  if (outputInspection.meshCount < 1 || outputInspection.triangleCount < 1) throw new Error('external construction output must contain realized triangle geometry');
  const outputSha256 = digestBytes(output);
  const replaySha256 = digestBytes(replay);
  const receiptValidation = validateExternalConstructionReceipt(receipt, decision, permit, {outputGlbSha256: outputSha256});
  if (!receiptValidation.valid) throw new Error(`external construction receipt is invalid: ${receiptValidation.errors.join('; ')}`);
  if (digestBytes(script) !== receipt.scriptSha256) throw new Error('external construction script bytes do not match the receipt');
  const suppliedInputIds = Object.keys(inputBytes).sort();
  const expectedInputIds = receipt.inputs.map((item) => item.id).sort();
  if (JSON.stringify(suppliedInputIds) !== JSON.stringify(expectedInputIds)) throw new Error('external construction input byte set does not match the receipt');
  for (const input of receipt.inputs) {
    const bytes = Buffer.from(inputBytes[input.id] ?? []);
    if (digestBytes(bytes) !== input.sha256) throw new Error(`external construction input bytes do not match receipt input ${input.id}`);
  }
  if (replaySha256 !== outputSha256) throw new Error('external construction reexecution is not byte-exact');
  const authority = createConstructionAuthority({decision, permit});
  const payload = {
    schema: CONSTRUCTION_EXECUTION_SCHEMA,
    partId: assertId(partId ?? `external-${permit.scopeId}`, 'partId'),
    rootScopeId: authority.rootScopeId,
    scopeId: authority.scopeId,
    sourceSha256: authority.sourceSha256,
    vocabulary: authority.vocabulary,
    operation: authority.operation,
    vocabularyDigest: authority.vocabularyDigest,
    effectiveVocabularyDigest: authority.effectiveVocabularyDigest,
    mechanicalDecompositionDigest: authority.mechanicalDecompositionDigest,
    permitDigest: authority.permitDigest,
    authorityDigest: authority.authorityDigest,
    geometrySha256: outputSha256,
    externalReceiptDigest: receipt.receiptDigest,
  };
  const execution = deepFreeze({...payload, executionDigest: digestJson(payload)});
  const assetBytes = attachConstructionExecution(output, execution);
  const proof = createConstructionExecutionProof({
    assetBytes,
    decision,
    permits: [permit],
    externalReceipts: [receipt],
    evidenceRefs: strings([...receipt.evidenceRefs, ...evidenceRefs]),
  });
  return {assetBytes, execution, proof};
}

function externalToolArgs(rawArgs, {scriptFile, outputFile, inputFiles}) {
  if (!Array.isArray(rawArgs) || !rawArgs.length || rawArgs.length > 64) throw new Error('external construction tool args must contain 1..64 arguments');
  const replace = (value) => {
    let output = String(value);
    if (output.length > 4096) throw new Error('external construction tool argument exceeds 4096 characters');
    output = output.replaceAll('{script}', scriptFile).replaceAll('{output}', outputFile);
    output = output.replace(/\{input:([^}]+)\}/gu, (_match, id) => {
      if (!inputFiles.has(id)) throw new Error(`external construction tool argument references unknown input ${id}`);
      return inputFiles.get(id);
    });
    if (/\{(?:script|output|input:)/u.test(output)) throw new Error('external construction tool argument contains an unresolved placeholder');
    return output;
  };
  const args = rawArgs.map(replace);
  if (!rawArgs.some((value) => String(value).includes('{script}'))) throw new Error('external construction tool args must reference {script}');
  if (!rawArgs.some((value) => String(value).includes('{output}'))) throw new Error('external construction tool args must reference {output}');
  return args;
}

function runExternalProcess(command, args, {cwd, timeoutMs, label}) {
  const result = spawnSync(command, args, {
    cwd,
    shell: false,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...process.env,
      HOME: cwd,
      TZ: 'UTC',
      LANG: 'C',
      LC_ALL: 'C',
      PYTHONHASHSEED: '0',
    },
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw new Error(`${label} failed to launch: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by signal ${result.signal}`);
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}: ${String(result.stderr || result.stdout).trim()}`);
  return {stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '')};
}

export function attestExternalConstruction({
  decision,
  permit,
  tool = {},
  scriptBytes,
  inputs = [],
  args = [],
  versionArgs = ['--version'],
  scriptFileName = 'construction-script',
  outputFileName = 'candidate.glb',
  timeoutMs = 60_000,
  partId = null,
  evidenceRefs = [],
} = {}) {
  requirePermit(decision, permit, 'external-construction', permit?.scopeId);
  const toolId = assertId(tool?.id, 'tool.id');
  const command = String(tool?.command ?? '').trim();
  if (!command || command.length > 4096) throw new Error('tool.command must contain 1..4096 characters');
  if (!Array.isArray(versionArgs) || !versionArgs.length || versionArgs.length > 16) throw new Error('versionArgs must contain 1..16 arguments');
  const normalizedVersionArgs = versionArgs.map((value) => String(value));
  const timeout = Number(timeoutMs);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 86_400_000) throw new Error('timeoutMs must be an integer in 1..86400000');
  const safeName = (value, label) => {
    const normalized = String(value ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) throw new Error(`${label} must be a safe basename`);
    return normalized;
  };
  const scriptName = safeName(scriptFileName, 'scriptFileName');
  const outputName = safeName(outputFileName, 'outputFileName');
  if (!outputName.toLowerCase().endsWith('.glb')) throw new Error('outputFileName must end in .glb');
  const script = Buffer.from(scriptBytes ?? []);
  if (!script.length) throw new Error('external construction requires non-empty script bytes');
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('external construction requires exact input bytes');
  const ids = new Set();
  const normalizedInputs = inputs.map((input, index) => {
    const id = assertId(input?.id, `inputs[${index}].id`);
    if (ids.has(id)) throw new Error('external construction input IDs must be unique');
    ids.add(id);
    const bytes = Buffer.from(input?.bytes ?? []);
    if (!bytes.length) throw new Error(`inputs[${index}].bytes must be non-empty`);
    return {
      id,
      kind: String(input?.kind ?? '').trim().toLowerCase(),
      authority: String(input?.authority ?? '').trim().toLowerCase(),
      bytes,
      sha256: digestBytes(bytes),
    };
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refas-external-construction-'));
  try {
    const versionRun = runExternalProcess(command, normalizedVersionArgs, {cwd: root, timeoutMs: timeout, label: 'external construction version probe'});
    const versionLines = `${versionRun.stdout}\n${versionRun.stderr}`.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (!versionLines.length) throw new Error('external construction tool version probe produced no version text');
    const version = versionLines[0];
    if (version.length > 512) throw new Error('external construction tool version text is too long');

    const runOnce = (name) => {
      const runRoot = path.join(root, name);
      fs.mkdirSync(runRoot, {recursive: true});
      fs.writeFileSync(path.join(runRoot, scriptName), script);
      const inputFiles = new Map();
      for (const [index, input] of normalizedInputs.entries()) {
        const fileName = `input-${index}.bin`;
        fs.writeFileSync(path.join(runRoot, fileName), input.bytes);
        inputFiles.set(input.id, fileName);
      }
      const processArgs = externalToolArgs(args, {scriptFile: scriptName, outputFile: outputName, inputFiles});
      const result = runExternalProcess(command, processArgs, {cwd: runRoot, timeoutMs: timeout, label: `external construction ${name}`});
      const outputPath = path.join(runRoot, outputName);
      if (!fs.existsSync(outputPath)) throw new Error(`external construction ${name} did not produce ${outputName}`);
      const stat = fs.lstatSync(outputPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`external construction ${name} output must be a regular file`);
      const output = fs.readFileSync(outputPath);
      const parsed = parseGlb(output);
      assertExternalGlbHasNoConstructionAuthority(parsed.json, `external construction ${name}`);
      const inspection = inspectGlb(output);
      if (inspection.meshCount < 1 || inspection.triangleCount < 1) throw new Error(`external construction ${name} output contains no realized triangle geometry`);
      return {output, stdout: result.stdout, stderr: result.stderr};
    };

    const first = runOnce('run-a');
    const replay = runOnce('run-b');
    if (!first.output.equals(replay.output)) throw new Error('external construction reexecution is not byte-exact');

    const receipt = createExternalConstructionReceipt({
      decision,
      permit,
      tool: {id: toolId, version},
      scriptSha256: digestBytes(script),
      invocation: {
        args: args.map((value) => String(value)),
        versionArgs: normalizedVersionArgs,
        scriptFileName: scriptName,
        outputFileName: outputName,
      },
      inputs: normalizedInputs.map(({bytes: _bytes, ...input}) => input),
      determinism: {mode: 'byte-exact'},
      outputGlbSha256: digestBytes(first.output),
      evidenceRefs,
    });
    const inputBytes = Object.fromEntries(normalizedInputs.map((input) => [input.id, input.bytes]));
    const finalized = finalizeExternalConstructionReplay({
      decision,
      permit,
      receipt,
      scriptBytes: script,
      inputBytes,
      outputBytes: first.output,
      reexecutedBytes: replay.output,
      partId,
      evidenceRefs,
    });
    return {
      ...finalized,
      receipt,
      processEvidence: deepFreeze({
        tool: receipt.tool,
        firstStdoutSha256: digestBytes(Buffer.from(first.stdout)),
        firstStderrSha256: digestBytes(Buffer.from(first.stderr)),
        replayStdoutSha256: digestBytes(Buffer.from(replay.stdout)),
        replayStderrSha256: digestBytes(Buffer.from(replay.stderr)),
      }),
    };
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

export function createPermittedHardSurfaceShell({decision, permit, spec = {}} = {}) {
  requirePermit(decision, permit, 'hard-surface-shell', permit?.scopeId);
  const mesh = createHardSurfaceShell(spec);
  return deepFreeze({...mesh, constructionAuthority: createConstructionAuthority({decision, permit})});
}

export function createPermittedSectionProfileLoft({decision, permit, spec = {}} = {}) {
  if (!['section-profile-loft-rigid', 'section-profile-loft-organic'].includes(permit?.operation)) {
    throw new Error('section-profile loft requires a rigid or organic loft permit');
  }
  requirePermit(decision, permit, permit.operation, permit.scopeId);
  const mesh = createSectionProfileLoft(spec);
  return deepFreeze({...mesh, constructionAuthority: createConstructionAuthority({decision, permit})});
}

export function createPermittedSurfaceNetworkParts({decision, permit, network, options = {}} = {}) {
  requirePermit(decision, permit, 'surface-network-parts', permit?.scopeId);
  const networkValidation = validateSurfaceNetwork(network);
  if (!networkValidation.valid) throw new Error(`surface network is invalid: ${networkValidation.errors.join('; ')}`);
  if (network.scopeId !== permit.scopeId) throw new Error('surface network scope does not match construction permit');
  if (network.sourceSha256 !== permit.sourceSha256) throw new Error('surface network source does not match construction permit');
  const parts = createSurfaceNetworkParts(network, options);
  const authority = createConstructionAuthority({decision, permit});
  const bind = (part) => deepFreeze({...part, constructionAuthority: authority});
  return deepFreeze({
    ...parts,
    panelParts: parts.panelParts.map(bind),
    boundaryParts: parts.boundaryParts.map(bind),
    junctionParts: parts.junctionParts.map(bind),
    constructionAuthority: authority,
  });
}

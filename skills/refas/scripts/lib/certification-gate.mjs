import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assessCertification as assessCertificationBase,
  auditProject as auditProjectBase,
  certifyProject as certifyProjectBase,
  loadCheckpoint,
  loadProject,
  resumeProject as resumeProjectBase,
} from './checkpoint-store.mjs';
import {inspectCertificationProjectionEvidence} from './certification-projection-evidence.mjs';

async function readVisualReview(root, head) {
  const artifacts = (head?.artifactRefs ?? []).filter((artifact) => artifact.kind === 'visual-review');
  if (artifacts.length !== 1) return null;
  try {
    return JSON.parse(await fs.readFile(path.resolve(root, artifacts[0].path), 'utf8'));
  } catch {
    return null;
  }
}

export async function assessProjectionCertification(root) {
  const state = await loadProject(root);
  if (!state.head) return {required: false, valid: true, errors: [], proof: null};
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') {
    return {required: false, valid: true, errors: [], proof: null};
  }
  const visualReview = await readVisualReview(root, head);
  return inspectCertificationProjectionEvidence(path.resolve(root), state, head, visualReview);
}

export async function assessCertification(root) {
  const base = await assessCertificationBase(root);
  if (!base.checkpointId) return base;
  const projection = await assessProjectionCertification(root);
  const errors = [...base.errors, ...projection.errors];
  return Object.freeze({
    ...base,
    ready: errors.length === 0,
    errors,
    realizedProjectionRequired: projection.required,
    realizedProjectionDigest: projection.proof?.realizedProjectionDigest ?? null,
  });
}

export async function certifyProject(root) {
  const projection = await assessProjectionCertification(root);
  if (!projection.valid) throw new Error(`certification refused: ${projection.errors.join('; ')}`);
  return certifyProjectBase(root);
}

export async function auditProject(root) {
  const base = await auditProjectBase(root);
  const state = await loadProject(root);
  if (!state.head) return base;
  const head = await loadCheckpoint(root, state.head);
  if (head.capability !== 'whole-object-certification' || head.scopeId !== 'whole') return base;
  const projection = await assessProjectionCertification(root);
  const errors = [...base.errors, ...projection.errors.map((error) => `certification reprojection: ${error}`)];
  return {...base, valid: errors.length === 0, errors};
}

export async function resumeProject(root) {
  const base = await resumeProjectBase(root);
  if (!['CERTIFY', 'DONE'].includes(base.nextAction)) return base;
  const projection = await assessProjectionCertification(root);
  if (projection.valid) return base;
  return {
    ...base,
    activeWork: {capability: 'whole-object-certification', scopeId: 'whole'},
    nextAction: 'REQUEST_VISUAL_REVIEW',
    certificationErrors: projection.errors,
    reason: projection.errors[0],
  };
}

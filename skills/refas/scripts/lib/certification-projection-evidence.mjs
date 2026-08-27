import fs from 'node:fs/promises';
import path from 'node:path';

import {readJson, sha256File} from './canonical.mjs';
import {validateReferenceGeometry} from './reference-geometry.mjs';
import {validateRealizedProjection} from './realized-projection.mjs';
import {verifyRealizedProjection} from './realized-projection-verification.mjs';
import {findingsFromRealizedProjection} from './projection-findings.mjs';

const CONTRACT_FIXTURE_ACQUISITIONS = new Set(['test-fixture', 'deterministic-project-fixture', 'synthetic-test-fixture']);

function sourceRequiresRealizedProjection(source) {
  const kind = String(source?.acquisition?.kind ?? '').toLowerCase();
  return !CONTRACT_FIXTURE_ACQUISITIONS.has(kind);
}
async function readBoundArtifact(root, artifact, label) {
  if (!artifact) throw new Error(`${label} artifact is missing`);
  const absolute = path.resolve(root, artifact.path), relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} artifact escapes the project root`);
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size !== artifact.sizeBytes) throw new Error(`${label} artifact size does not match its checkpoint reference`);
  if (await sha256File(absolute) !== artifact.sha256) throw new Error(`${label} artifact digest does not match its checkpoint reference`);
  return absolute;
}

export async function inspectCertificationProjectionEvidence(root, state, head, visualReview) {
  const errors = [], geometryArtifacts = head.artifactRefs.filter((artifact) => artifact.kind === 'reference-geometry'), realizedArtifacts = head.artifactRefs.filter((artifact) => artifact.kind === 'realized-projection');
  const required = sourceRequiresRealizedProjection(state.source) || geometryArtifacts.length > 0 || realizedArtifacts.length > 0;
  if (!required) return {required: false, valid: true, errors, geometryArtifact: null, realizedArtifact: null, proof: null};
  if (geometryArtifacts.length !== 1) errors.push('source-bound certification requires exactly one digest-bound reference-geometry artifact');
  if (realizedArtifacts.length !== 1) errors.push('source-bound certification requires exactly one digest-bound realized-projection artifact');
  const geometryArtifact = geometryArtifacts.length === 1 ? geometryArtifacts[0] : null, realizedArtifact = realizedArtifacts.length === 1 ? realizedArtifacts[0] : null;
  let proof = null, geometry = null;
  if (geometryArtifact && realizedArtifact) {
    try {
      const geometryPath = await readBoundArtifact(root, geometryArtifact, 'reference-geometry'), realizedPath = await readBoundArtifact(root, realizedArtifact, 'realized-projection');
      geometry = await readJson(geometryPath); proof = await readJson(realizedPath);
      const geometryValidation = validateReferenceGeometry(geometry), realizedValidation = validateRealizedProjection(proof);
      if (!geometryValidation.valid) errors.push(`reference geometry is invalid: ${geometryValidation.errors.join('; ')}`);
      if (!realizedValidation.valid) errors.push(`realized projection is invalid: ${realizedValidation.errors.join('; ')}`);
      if (geometry.sourceSha256 !== state.source?.sha256) errors.push('reference geometry source digest does not match the bound primary reference');
      if (proof.sourceSha256 !== state.source?.sha256) errors.push('realized projection source digest does not match the bound primary reference');
      if (proof.projectionFit?.referenceGeometryDigest !== geometry.geometryDigest) errors.push('realized projection is not bound to the certification reference geometry');
      if (visualReview && proof.assetSha256 !== visualReview.assetSha256) errors.push('realized projection asset digest does not match the visual review asset');
      const glbArtifacts = head.artifactRefs.filter((artifact) => artifact.kind === 'glb' && artifact.sha256 === proof.assetSha256);
      if (glbArtifacts.length !== 1) errors.push('source-bound certification requires exactly one GLB artifact matching the realized projection asset digest');
      else {
        const glbPath = await readBoundArtifact(root, glbArtifacts[0], 'realized GLB'), glb = await fs.readFile(glbPath), verification = verifyRealizedProjection({proof, referenceGeometry: geometry, glb});
        if (!verification.valid) errors.push(`realized projection cannot be reproduced from certification artifacts: ${verification.errors.join('; ')}`);
      }
      const blocking = findingsFromRealizedProjection(proof).filter((finding) => finding.blocking === true);
      if (blocking.length) errors.push(`realized reprojection has blocking source-geometry disagreement: ${blocking.map((finding) => finding.category).join(', ')}`);
    } catch (error) { errors.push(`realized projection evidence unavailable: ${error.message}`); }
  }
  return {required, valid: errors.length === 0, errors, geometryArtifact, realizedArtifact, proof};
}

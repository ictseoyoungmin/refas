import {digestBytes} from './canonical.mjs';
import {createRealizedProjection, validateRealizedProjection} from './realized-projection.mjs';

export function verifyRealizedProjection({proof, referenceGeometry, glb} = {}) {
  const errors = [];
  const structural = validateRealizedProjection(proof);
  if (!structural.valid) errors.push(...structural.errors);
  try {
    const bytes = Buffer.from(glb ?? []);
    if (!bytes.length) throw new Error('actual GLB bytes are required to verify realized projection');
    if (digestBytes(bytes) !== proof?.assetSha256) throw new Error('actual GLB digest does not match realized projection proof');
    const anchorBindings = (proof?.derivedAnchors ?? []).map((item) => ({referenceId: item.referenceId, nodeId: item.nodeId, localPoint: item.localPoint}));
    const segmentBindings = (proof?.derivedSegments ?? []).map((item) => ({referenceId: item.referenceId, nodeIds: item.nodeIds}));
    const recreated = createRealizedProjection({
      referenceGeometry,
      glb: bytes,
      cameraHypothesisId: proof?.cameraHypothesisId,
      camera: proof?.camera,
      anchorBindings,
      ...(Object.prototype.hasOwnProperty.call(proof ?? {}, 'derivedSegments') ? {segmentBindings} : {}),
      evidenceRefs: proof?.evidenceRefs ?? [],
    });
    if (recreated.realizedProjectionDigest !== proof?.realizedProjectionDigest) throw new Error('realized projection cannot be reproduced from the bound GLB and source geometry');
  } catch (error) {
    errors.push(error.message);
  }
  return {valid: errors.length === 0, errors};
}

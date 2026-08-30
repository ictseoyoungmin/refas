import {assertDigest, deepFreeze, digestJson} from './canonical.mjs';

export const PERCEPTUAL_DISCREPANCY_SCHEMA = 'refas.perceptual-discrepancy/v1';

const finite = (value, label) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${label} must be finite`); return n; };
function raster(raw, label) {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} raster is required`);
  const width = Number(raw.width), height = Number(raw.height), channels = Number(raw.channels ?? 4);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(`${label} dimensions are invalid`);
  if (![1, 3, 4].includes(channels)) throw new Error(`${label}.channels must be 1, 3, or 4`);
  const data = raw.data instanceof Uint8Array || Array.isArray(raw.data) ? raw.data : null;
  if (!data || data.length !== width * height * channels) throw new Error(`${label}.data length does not match raster dimensions`);
  return {width, height, channels, data: Uint8Array.from(data)};
}

/** Decode a binary PGM/PPM (P5/P6) frame without optional vision packages. */
export function decodePortablePixmap(bytes, label = 'pixmap') {
  const input = Buffer.from(bytes ?? []), magic = input.subarray(0, 2).toString('ascii');
  if (magic !== 'P5' && magic !== 'P6') throw new Error(`${label} must be a binary P5/P6 image`);
  let cursor = 2;
  const tokens = [];
  while (tokens.length < 3 && cursor < input.length) {
    while (cursor < input.length && /\s/u.test(String.fromCharCode(input[cursor]))) cursor += 1;
    if (input[cursor] === 35) { while (cursor < input.length && input[cursor] !== 10) cursor += 1; continue; }
    const start = cursor; while (cursor < input.length && !/\s/u.test(String.fromCharCode(input[cursor]))) cursor += 1; tokens.push(input.subarray(start, cursor).toString('ascii'));
  }
  const [width, height, max] = tokens.map(Number);
  if (![width, height, max].every(Number.isInteger) || width < 1 || height < 1 || max !== 255) throw new Error(`${label} has unsupported dimensions or max value`);
  while (cursor < input.length && /\s/u.test(String.fromCharCode(input[cursor]))) cursor += 1;
  const channels = magic === 'P6' ? 3 : 1, expected = width * height * channels;
  if (input.length - cursor !== expected) throw new Error(`${label} pixel payload length is invalid`);
  return {width, height, channels, data: Uint8Array.from(input.subarray(cursor))};
}
const luminance = (image, index) => {
  const offset = index * image.channels;
  if (image.channels === 1) return image.data[offset] / 255;
  return (0.2126 * image.data[offset] + 0.7152 * image.data[offset + 1] + 0.0722 * image.data[offset + 2]) / 255;
};
const alpha = (image, index) => image.channels === 4 ? image.data[index * 4 + 3] / 255 : 1;
function maskOf(image, threshold = 0.08) {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) mask[index] = alpha(image, index) > 0.01 && luminance(image, index) > threshold ? 1 : 0;
  return mask;
}
function bbox(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) { const x = index % width, y = Math.floor(index / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1; }
  return {minX, minY, maxX, maxY, count, width: maxX < 0 ? 0 : maxX - minX + 1, height: maxY < 0 ? 0 : maxY - minY + 1};
}
function iou(a, b) {
  let intersection = 0, union = 0;
  for (let index = 0; index < a.length; index += 1) { if (a[index] || b[index]) union += 1; if (a[index] && b[index]) intersection += 1; }
  return union ? intersection / union : 1;
}
function boundary(mask, width, height) {
  const points = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    if (!mask[index]) continue;
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1 || !mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width]) points.push([x, y]);
  }
  return points;
}
function chamfer(a, b) {
  if (!a.length || !b.length) return 1;
  const directed = (from, to) => from.reduce((sum, point) => sum + Math.sqrt(Math.min(...to.map((other) => (point[0] - other[0]) ** 2 + (point[1] - other[1]) ** 2))), 0) / from.length;
  return (directed(a, b) + directed(b, a)) / 2;
}
function edgeDisagreement(source, render) {
  let total = 0, count = 0;
  const sample = (image, x, y) => luminance(image, y * image.width + x);
  for (let y = 1; y < source.height - 1; y += 1) for (let x = 1; x < source.width - 1; x += 1) {
    const sx = sample(source, x + 1, y) - sample(source, x - 1, y), sy = sample(source, x, y + 1) - sample(source, x, y - 1);
    const rx = sample(render, x + 1, y) - sample(render, x - 1, y), ry = sample(render, x, y + 1) - sample(render, x, y - 1);
    total += Math.min(1, Math.hypot(sx - rx, sy - ry)); count += 1;
  }
  return count ? total / count : 0;
}
function colorStats(image) {
  const sums = [0, 0, 0], count = image.width * image.height;
  for (let index = 0; index < count; index += 1) {
    const offset = index * image.channels;
    if (image.channels === 1) sums[0] += image.data[offset] / 255;
    else for (let channel = 0; channel < 3; channel += 1) sums[channel] += image.data[offset + channel] / 255;
  }
  const mean = sums.map((value) => value / count), luminanceMean = mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722;
  return {meanRGB: mean, luminanceMean};
}

function requireSameFrame(source, render) {
  if (source.width !== render.width || source.height !== render.height) throw new Error('source and render rasters must have identical dimensions after registration');
}

/** Compute deterministic model-free source/render discrepancy evidence. */
export function createPerceptualDiscrepancy({source, render, sourceSha256, assetSha256, scopeId = 'whole', sourceMask, renderMask, threshold = 0.08, segmentMasks = [], negativeSpaceMasks = [], evidenceRefs = []} = {}) {
  const s = raster(source, 'source'), r = raster(render, 'render'); requireSameFrame(s, r);
  const sm = sourceMask ? Uint8Array.from(sourceMask) : maskOf(s, threshold), rm = renderMask ? Uint8Array.from(renderMask) : maskOf(r, threshold);
  if (sm.length !== s.width * s.height || rm.length !== r.width * r.height) throw new Error('explicit masks must match raster dimensions');
  const sourceBoundary = boundary(sm, s.width, s.height), renderBoundary = boundary(rm, r.width, r.height);
  const sourceBox = bbox(sm, s.width, s.height), renderBox = bbox(rm, r.width, r.height);
  const sourceStats = colorStats(s), renderStats = colorStats(r);
  const ratio = sourceBox.count ? renderBox.count / sourceBox.count : null;
  const normalizedChamfer = chamfer(sourceBoundary, renderBoundary) / Math.max(1, Math.hypot(s.width, s.height));
  const normalizedWidthError = sourceBox.width ? Math.abs(renderBox.width - sourceBox.width) / sourceBox.width : null;
  const normalizedHeightError = sourceBox.height ? Math.abs(renderBox.height - sourceBox.height) / sourceBox.height : null;
  const colorDifference = Math.hypot(...sourceStats.meanRGB.map((value, index) => value - renderStats.meanRGB[index]));
  const segments = segmentMasks.map((entry, index) => {
    const a = Uint8Array.from(entry.source), b = Uint8Array.from(entry.render);
    if (a.length !== sm.length || b.length !== sm.length) throw new Error(`segmentMasks[${index}] dimensions do not match frame`);
    return {id: String(entry.id ?? `segment-${index}`), iou: iou(a, b)};
  });
  const negativeSpaces = negativeSpaceMasks.map((entry, index) => {
    const a = Uint8Array.from(entry.source), b = Uint8Array.from(entry.render);
    if (a.length !== sm.length || b.length !== sm.length) throw new Error(`negativeSpaceMasks[${index}] dimensions do not match frame`);
    return {id: String(entry.id ?? `negative-space-${index}`), iou: iou(a, b)};
  });
  const metrics = {
    silhouetteIoU: iou(sm, rm), boundaryChamferNormalized: normalizedChamfer,
    edgeDisagreement: edgeDisagreement(s, r), foregroundAreaRatio: ratio,
    sourceForegroundPixels: sourceBox.count, renderForegroundPixels: renderBox.count,
    sourceBoundingBox: sourceBox, renderBoundingBox: renderBox,
    normalizedWidthError, normalizedHeightError, landmarkResidualRmse: null,
    segmentMeanIoU: segments.length ? segments.reduce((sum, item) => sum + item.iou, 0) / segments.length : null,
    negativeSpaceMeanIoU: negativeSpaces.length ? negativeSpaces.reduce((sum, item) => sum + item.iou, 0) / negativeSpaces.length : null,
    luminanceDifference: Math.abs(sourceStats.luminanceMean - renderStats.luminanceMean), colorDifference,
    gradientOrientationDisagreement: null,
  };
  const payload = {
    schema: PERCEPTUAL_DISCREPANCY_SCHEMA, scopeId, sourceSha256: assertDigest(sourceSha256, 'sourceSha256'), assetSha256: assertDigest(assetSha256, 'assetSha256'),
    frame: {width: s.width, height: s.height}, metrics, segments, negativeSpaces,
    evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(),
    policy: {modelFreeDefault: true, deterministic: true, metricsRankCandidatesOnly: true, metricsCannotSelectOwner: true, metricsCannotPassVisualGate: true, sourceRemainsPrimary: true},
  };
  return deepFreeze({...payload, discrepancyDigest: digestJson(payload)});
}

export function validatePerceptualDiscrepancy(report) {
  const errors = [];
  if (report?.schema !== PERCEPTUAL_DISCREPANCY_SCHEMA) errors.push('invalid schema');
  for (const key of ['modelFreeDefault', 'deterministic', 'metricsRankCandidatesOnly', 'metricsCannotSelectOwner', 'metricsCannotPassVisualGate', 'sourceRemainsPrimary']) if (report?.policy?.[key] !== true) errors.push(`discrepancy policy missing: ${key}`);
  try { assertDigest(report?.sourceSha256, 'sourceSha256'); assertDigest(report?.assetSha256, 'assetSha256'); assertDigest(report?.discrepancyDigest, 'discrepancyDigest'); const payload = structuredClone(report); delete payload.discrepancyDigest; if (digestJson(payload) !== report.discrepancyDigest) errors.push('discrepancy digest mismatch'); } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function rankDiscrepancyCandidates(candidates, {metric = 'silhouetteIoU', direction = 'max'} = {}) {
  if (!Array.isArray(candidates)) throw new Error('candidates must be an array');
  return [...candidates].sort((a, b) => {
    const av = Number(a?.metrics?.[metric]), bv = Number(b?.metrics?.[metric]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) throw new Error(`candidate metric ${metric} must be finite`);
    return (direction === 'min' ? av - bv : bv - av) || String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

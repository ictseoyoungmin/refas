import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MAX_SOURCE_FRAME_BYTES = 256 * 1024 * 1024;
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'source_pixel_frame.py');
const HEX = /^[a-f0-9]{64}$/u;

/**
 * Re-evaluate original raster pixels, not candidate-authored geometry or a
 * trusted-looking manifest JSON. The caller must first establish containment
 * and exact current raw source bytes. A missing Python/Pillow installation
 * is not permission to promote a photograph to verified source evidence.
 */
export function inspectSourcePixelFrameBytes(sourceBytes, {
  sourceSha256,
  sizeBytes,
  width,
  height,
} = {}) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0 ||
      sourceBytes.length > MAX_SOURCE_FRAME_BYTES) {
    throw new Error('source pixel-frame requires bounded nonempty original bytes');
  }
  if (typeof sourceSha256 !== 'string' || !HEX.test(sourceSha256)) {
    throw new Error('source pixel-frame requires canonical manifest SHA-256');
  }
  if (sourceBytes.length !== sizeBytes) {
    throw new Error('source pixel-frame original byte count disagrees with manifest');
  }
  const currentSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  if (currentSha256 !== sourceSha256) {
    throw new Error('source pixel-frame original bytes disagree with manifest SHA-256');
  }
  if (![width,height].every((n)=>Number.isSafeInteger(n) && n > 0)) {
    throw new Error('source pixel-frame requires positive integer source dimensions');
  }
  const result = spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3',
    [WORKER], {
      input: sourceBytes,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      env: {...process.env, PYTHONDONTWRITEBYTECODE:'1'},
    });
  if (result.error || result.status !== 0) {
    // No user-controlled path or worker's stderr is accepted as authority.
    // Fail closed on absent runtime, timeout, malformed image, or EXIF drift.
    throw new Error('source pixel-frame could not be independently decoded in the installed runtime');
  }
  let decoded;
  try { decoded = JSON.parse(result.stdout); }
  catch { throw new Error('source pixel-frame decoder returned invalid evidence'); }
  if (decoded?.coordinateSpace !== 'encoded-top-left' ||
      decoded?.frameCount !== 1 ||
      !Number.isSafeInteger(decoded?.width) ||
      !Number.isSafeInteger(decoded?.height) ||
      decoded.width < 1 || decoded.height < 1) {
    throw new Error('source pixel-frame decoder returned invalid raster frame');
  }
  if (decoded.width !== width || decoded.height !== height) {
    throw new Error('source pixel-frame decoded dimensions disagree with manifest');
  }
  return Object.freeze({
    sourceSha256: currentSha256,
    sizeBytes: sourceBytes.length,
    width: decoded.width,
    height: decoded.height,
    coordinateSpace: decoded.coordinateSpace,
  });
}

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const PBR_RENDER_REPORT_SCHEMA = 'refas.pbr-render-report/v1';
export const PBR_RENDERER_FAMILIES = Object.freeze([
  'blender-cycles', 'blender-eevee', 'threejs-webgl', 'filament', 'gltf-sample-viewer', 'vtk', 'other',
]);

export const NEUTRAL_CLAY_LIGHTING_RIG = deepFreeze({
  lights: 'three-directional-calibrated-v1',
  keyIntensity: 2.8,
  fillIntensity: 1.2,
  rimIntensity: 0.55,
  background: [24, 24, 26],
  cameraFovY: 31,
});
export const NEUTRAL_CLAY_LIGHTING_RIG_DIGEST = digestJson(NEUTRAL_CLAY_LIGHTING_RIG);

export const NEUTRAL_CLAY_PRESENTATION_PRESET = deepFreeze({
  id: 'refas-neutral-clay-v1',
  material: {
    baseColor: [0.58, 0.58, 0.58],
    metallic: 0,
    roughness: 0.78,
  },
  lighting: {
    rigId: 'neutral-clay-three-light-v1',
    keyIntensity: 2.8,
    fillIntensity: 1.2,
    rimIntensity: 0.55,
    background: [24, 24, 26],
    cameraFovY: 31,
  },
  colorPipeline: {
    exposure: 0,
    toneMapping: 'Reinhard',
    outputColorSpace: 'sRGB',
  },
});
export const NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST = digestJson(NEUTRAL_CLAY_PRESENTATION_PRESET);
export const NEUTRAL_CLAY_REQUIRED_VIEW_IDS = Object.freeze(['hero', 'oblique', 'side', 'top', 'grazing', 'normal', 'object-id', 'albedo']);

const FAMILY_SET = new Set(PBR_RENDERER_FAMILIES);

function strings(values, label, {required = false, ids = false} = {}) {
  const result = [...new Set((values ?? []).map(String).filter(Boolean))].sort();
  if (required && !result.length) throw new Error(`${label} requires at least one value`);
  if (ids) result.forEach((value, index) => assertId(value, `${label}[${index}]`));
  return result;
}

export function createPbrRenderReport({assetSha256, frameDigest, renderer, lighting, colorPipeline, materialSupport, outputs, reproducibility, presentation = null} = {}) {
  const family = String(renderer?.family ?? '');
  if (!FAMILY_SET.has(family)) throw new Error(`renderer.family must be one of: ${PBR_RENDERER_FAMILIES.join(', ')}`);
  const normalizedRenderer = {
    family,
    name: String(renderer?.name ?? ''),
    version: String(renderer?.version ?? ''),
    backend: String(renderer?.backend ?? ''),
    independentProcess: renderer?.independentProcess === true,
  };
  if (!normalizedRenderer.name || !normalizedRenderer.version || !normalizedRenderer.backend) throw new Error('renderer name, version, and backend are required');
  if (!normalizedRenderer.independentProcess) throw new Error('PBR appearance evidence must come from an independent renderer process');
  const supported = strings(materialSupport?.supported, 'materialSupport.supported', {required: true, ids: true});
  const unsupported = strings(materialSupport?.unsupported, 'materialSupport.unsupported', {ids: true});
  const overlap = supported.filter((feature) => unsupported.includes(feature));
  if (overlap.length) throw new Error(`material support is contradictory: ${overlap.join(', ')}`);
  const normalizedOutputs = (outputs ?? []).map((output, index) => ({
    viewId: assertId(output?.viewId, `outputs[${index}].viewId`),
    path: String(output?.path ?? ''),
    sha256: assertDigest(output?.sha256, `outputs[${index}].sha256`),
  }));
  if (!normalizedOutputs.length || normalizedOutputs.some((output) => !output.path)) throw new Error('at least one digest-bound renderer output is required');
  if (new Set(normalizedOutputs.map((output) => output.viewId)).size !== normalizedOutputs.length) throw new Error('renderer output view IDs must be unique');
  const normalizedReproducibility = {
    mode: String(reproducibility?.mode ?? ''),
    tolerance: String(reproducibility?.tolerance ?? ''),
  };
  if (!['deterministic', 'bounded-nondeterminism'].includes(normalizedReproducibility.mode)) throw new Error('reproducibility.mode is invalid');
  if (normalizedReproducibility.mode === 'bounded-nondeterminism' && !normalizedReproducibility.tolerance) throw new Error('bounded nondeterminism requires a tolerance contract');
  let normalizedPresentation = null;
  if (presentation != null) {
    const mode = String(presentation?.mode ?? '');
    if (mode !== 'neutral-clay') throw new Error('presentation.mode must be neutral-clay when presentation is declared');
    normalizedPresentation = {
      mode,
      presetId: assertId(presentation?.presetId, 'presentation.presetId'),
      presetDigest: assertDigest(presentation?.presetDigest, 'presentation.presetDigest'),
    };
    if (normalizedPresentation.presetId !== NEUTRAL_CLAY_PRESENTATION_PRESET.id) throw new Error('neutral-clay presentation presetId is not canonical');
    if (normalizedPresentation.presetDigest !== NEUTRAL_CLAY_PRESENTATION_PRESET_DIGEST) throw new Error('neutral-clay presentation preset digest mismatch');
    const requiredViews = new Set(NEUTRAL_CLAY_REQUIRED_VIEW_IDS);
    const actualViews = new Set(normalizedOutputs.map((output) => output.viewId));
    const missingViews = [...requiredViews].filter((viewId) => !actualViews.has(viewId));
    if (missingViews.length) throw new Error(`neutral-clay presentation is missing required views: ${missingViews.join(', ')}`);
    if (lighting?.rigId !== NEUTRAL_CLAY_PRESENTATION_PRESET.lighting.rigId) throw new Error('neutral-clay lighting rigId is not canonical');
    if (lighting?.digest !== NEUTRAL_CLAY_LIGHTING_RIG_DIGEST) throw new Error('neutral-clay lighting digest is not canonical');
    if (Number(colorPipeline?.exposure) !== NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline.exposure
      || String(colorPipeline?.toneMapping ?? '') !== NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline.toneMapping
      || String(colorPipeline?.outputColorSpace ?? '') !== NEUTRAL_CLAY_PRESENTATION_PRESET.colorPipeline.outputColorSpace) {
      throw new Error('neutral-clay color pipeline is not canonical');
    }
  }

  const payload = {
    schema: PBR_RENDER_REPORT_SCHEMA,
    claimScope: 'visual-fidelity',
    assetSha256: assertDigest(assetSha256, 'assetSha256'),
    frameDigest: assertDigest(frameDigest, 'frameDigest'),
    renderer: normalizedRenderer,
    lighting: {rigId: assertId(lighting?.rigId, 'lighting.rigId'), digest: assertDigest(lighting?.digest, 'lighting.digest')},
    colorPipeline: {
      exposure: Number(colorPipeline?.exposure),
      toneMapping: String(colorPipeline?.toneMapping ?? ''),
      outputColorSpace: String(colorPipeline?.outputColorSpace ?? ''),
    },
    materialSupport: {supported, unsupported},
    outputs: normalizedOutputs,
    reproducibility: normalizedReproducibility,
    ...(normalizedPresentation ? {presentation: normalizedPresentation} : {}),
  };
  if (!Number.isFinite(payload.colorPipeline.exposure) || !payload.colorPipeline.toneMapping || !payload.colorPipeline.outputColorSpace) throw new Error('color pipeline exposure, tone mapping, and output color space are required');
  return deepFreeze({...payload, reportDigest: digestJson(payload)});
}

export function validatePbrRenderReport(report) {
  const errors = [];
  if (report?.schema !== PBR_RENDER_REPORT_SCHEMA) errors.push('invalid schema');
  try {
    const recreated = createPbrRenderReport(report);
    if (recreated.reportDigest !== report.reportDigest) errors.push('PBR render report normalization mismatch');
    const payload = structuredClone(report); delete payload.reportDigest;
    if (digestJson(payload) !== report.reportDigest) errors.push('PBR render report digest mismatch');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

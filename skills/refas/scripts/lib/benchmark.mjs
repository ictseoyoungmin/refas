import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';

export const BENCHMARK_MATRIX_SCHEMA = 'refas.benchmark-matrix/v1';
export const BENCHMARK_CATEGORIES = Object.freeze(['articulated-manufactured-organic', 'hard-surface-mechanical', 'irregular-nonmechanical']);

function ref(raw, label) {
  if (!raw || typeof raw !== 'object') throw new Error(`${label} content reference is required`);
  const path = String(raw.path ?? '');
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error(`${label}.path must be project-relative`);
  return {kind: String(raw.kind ?? 'artifact'), path, sha256: assertDigest(raw.sha256, `${label}.sha256`), sizeBytes: Number(raw.sizeBytes ?? 0)};
}
function refs(values, label) { return (values ?? []).map((value, index) => ref(value, `${label}[${index}]`)); }

export function createBenchmarkMatrix({id = 'independent-reference-benchmarks', benchmarks = [], sourceRoot = null, evidenceRefs = []} = {}) {
  if (!Array.isArray(benchmarks) || !benchmarks.length) throw new Error('benchmark matrix requires at least one benchmark');
  const normalized = benchmarks.map((raw, index) => {
    const category = String(raw?.category ?? '');
    if (!BENCHMARK_CATEGORIES.includes(category)) throw new Error(`benchmarks[${index}].category is not a supported independent-reference category`);
    const source = ref(raw.source, `benchmarks[${index}].source`);
    return {id: assertId(raw.id, `benchmarks[${index}].id`), category, source, sourcePath: source.path, sourceSha256: source.sha256, status: String(raw.status ?? 'pending'), evidenceRefs: [...new Set((raw.evidenceRefs ?? []).map(String).filter(Boolean))].sort()};
  });
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) throw new Error('benchmark IDs must be unique');
  if (new Set(normalized.map((item) => item.sourceSha256)).size !== normalized.length) throw new Error('independent-reference benchmarks must bind distinct source digests');
  const payload = {schema: BENCHMARK_MATRIX_SCHEMA, id: assertId(id, 'id'), sourceRoot: sourceRoot == null ? null : String(sourceRoot), benchmarks: normalized, evidenceRefs: [...new Set(evidenceRefs.map(String).filter(Boolean))].sort(), policy: {rawSourcesRemainExternalWhenUnauthorized: true, sourcePathsAreDigestBound: true, finalCertificateRequiresVisualJustification: true, reusableClosureNeedsTwoMateriallyDifferentClasses: true, benchmarkCoordinatesAreNotRuntimeIdentity: true}};
  return deepFreeze({...payload, matrixDigest: digestJson(payload)});
}

export function recordBenchmarkResult(matrix, benchmarkId, {baselineAsset, finalAsset, comparisons = [], diagnostics = [], fittingLedgers = [], findings = [], rollbackEvidence = [], visualReview = null, visualReviewVerdict = null, certificate = null, status = 'complete'} = {}) {
  if (matrix?.schema !== BENCHMARK_MATRIX_SCHEMA) throw new Error('valid benchmark matrix is required');
  const benchmark = matrix.benchmarks.find((item) => item.id === benchmarkId); if (!benchmark) throw new Error(`unknown benchmark: ${benchmarkId}`);
  const result = {baselineAsset: ref(baselineAsset, 'baselineAsset'), finalAsset: ref(finalAsset, 'finalAsset'), comparisons: refs(comparisons, 'comparisons'), diagnostics: refs(diagnostics, 'diagnostics'), fittingLedgers: refs(fittingLedgers, 'fittingLedgers'), findings: refs(findings, 'findings'), rollbackEvidence: refs(rollbackEvidence, 'rollbackEvidence'), visualReview: visualReview == null ? null : ref(visualReview, 'visualReview'), visualReviewVerdict: visualReviewVerdict == null ? null : String(visualReviewVerdict), certificate: certificate == null ? null : ref(certificate, 'certificate'), status: String(status)};
  if (result.certificate && (!visualReview || result.visualReviewVerdict !== 'pass')) throw new Error('benchmark certificate requires an explicitly passing visual review');
  const updated = matrix.benchmarks.map((item) => item.id === benchmarkId ? {...item, status: result.status, result} : item);
  const payload = {...matrix, benchmarks: updated}; delete payload.matrixDigest;
  return deepFreeze({...payload, matrixDigest: digestJson(payload)});
}

export function validateBenchmarkMatrix(matrix) {
  const errors = [];
  if (matrix?.schema !== BENCHMARK_MATRIX_SCHEMA) errors.push('invalid schema');
  try {
    assertId(matrix?.id, 'id');
    const categories = new Set();
    for (const benchmark of matrix?.benchmarks ?? []) {
      if (!BENCHMARK_CATEGORIES.includes(benchmark.category)) errors.push(`unsupported benchmark category: ${benchmark.category}`);
      categories.add(benchmark.category); ref(benchmark.source, `benchmark ${benchmark.id}.source`);
      if (benchmark.result?.certificate && !benchmark.result.visualReview) errors.push(`benchmark ${benchmark.id} certificate lacks visual review`);
      if (benchmark.result?.certificate && benchmark.result.visualReviewVerdict !== 'pass') errors.push(`benchmark ${benchmark.id} certificate is not visually justified`);
    }
    if (matrix?.policy?.sourcePathsAreDigestBound !== true || matrix?.policy?.finalCertificateRequiresVisualJustification !== true) errors.push('benchmark policy is missing');
    if (matrix?.matrixDigest) { const payload = structuredClone(matrix); delete payload.matrixDigest; if (digestJson(payload) !== matrix.matrixDigest) errors.push('benchmark matrix digest mismatch'); }
    if (categories.size < 2) errors.push('reusable benchmark closure requires at least two materially different categories');
  } catch (error) { errors.push(error.message); }
  return {valid: errors.length === 0, errors};
}

export function assessBenchmarkCapabilityClosure(matrix, capabilityId) {
  const categories = new Set((matrix?.benchmarks ?? []).filter((benchmark) => benchmark.result && benchmark.result.status === 'complete').map((benchmark) => benchmark.category));
  return {capabilityId: assertId(capabilityId, 'capabilityId'), complete: categories.size >= 2, materiallyDifferentCategories: [...categories].sort(), policy: categories.size >= 2 ? 'generic-capability-closure' : 'domain-adapter-only'};
}

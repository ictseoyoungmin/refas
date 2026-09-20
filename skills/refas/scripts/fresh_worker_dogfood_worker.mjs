#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_ROOT = path.dirname(SCRIPT_DIR);

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
const skillRoot = path.resolve(String(options['skill-root'] ?? DEFAULT_SKILL_ROOT));
const projectRoot = path.resolve(String(options.project ?? path.join(process.cwd(), 'fresh-worker-project')));
const reportPath = path.resolve(String(options.report ?? path.join(projectRoot, 'reports', 'fresh-worker-public-contract.json')));
const refasCli = path.join(skillRoot, 'scripts', 'refas.mjs');
const publicApiEntrypoint = path.join(skillRoot, 'scripts', 'lib', 'index.mjs');
const PARENT_ROUTE_PREFIX = ['..', ''].join('/');

const ledger = {
  schema: 'refas.fresh-worker-public-contract-transcript/v1',
  status: 'RUNNING',
  requiredReads: [],
  publicReads: [],
  describeQueries: [],
  templatesLoaded: [],
  cliCommands: [],
  publicApiEntrypoints: ['scripts/lib/index.mjs'],
  publicApiSymbols: [],
  capabilitiesDiscovered: [],
  checkpointsCommitted: [],
  rawImplementationReads: [],
  implementationSearchCommands: [],
  repositorySurfacesAbsent: {},
};

function portable(value) {
  return String(value).split(path.sep).join('/');
}

function recordUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function skillRelative(relative) {
  const raw = portable(relative).replace(/^\.\//, '');
  const normalized = path.posix.normalize(raw);
  if (
    !normalized
    || normalized === '..'
    || normalized.startsWith(PARENT_ROUTE_PREFIX)
    || path.posix.isAbsolute(normalized)
  ) throw new Error(`skill path escapes installed root: ${relative}`);
  return normalized;
}

function isPublicReadableSkillPath(relative) {
  return relative === 'SKILL.md'
    || relative.startsWith('references/')
    || relative.startsWith('assets/templates/');
}

async function readSkillText(relative, {required = false} = {}) {
  const normalized = skillRelative(relative);
  if (normalized.startsWith('scripts/lib/')) {
    ledger.rawImplementationReads.push(normalized);
    throw new Error(`raw implementation read blocked: ${normalized}`);
  }
  if (!isPublicReadableSkillPath(normalized)) {
    throw new Error(`fresh worker may not read non-public installed-skill path: ${normalized}`);
  }
  const text = await fs.readFile(path.join(skillRoot, normalized), 'utf8');
  recordUnique(ledger.publicReads, normalized);
  if (required) recordUnique(ledger.requiredReads, normalized);
  return text;
}

function runCli(args) {
  const clean = args.map(String);
  ledger.cliCommands.push(['refas', ...clean].join(' '));
  const result = spawnSync(process.execPath, [refasCli, ...clean], {
    cwd: skillRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`refas ${clean.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  const stdout = String(result.stdout ?? '').trim();
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`refas ${clean.join(' ')} did not return JSON: ${error.message}`);
  }
}

const nodeDescribeCache = new Map();
const capabilityDescribeCache = new Map();

async function describeNode(id) {
  if (!nodeDescribeCache.has(id)) {
    const value = runCli(['describe', 'node', id]);
    ledger.describeQueries.push(`node:${id}`);
    if (value.namespace !== 'node' || value.id !== id) throw new Error(`describe node mismatch: ${id}`);
    await readSkillText(value.path);
    nodeDescribeCache.set(id, value);
  }
  return nodeDescribeCache.get(id);
}

async function describeCapability(id) {
  if (!capabilityDescribeCache.has(id)) {
    const value = runCli(['describe', 'capability', id]);
    ledger.describeQueries.push(`capability:${id}`);
    if (value.namespace !== 'capability' || value.id !== id) throw new Error(`describe capability mismatch: ${id}`);
    capabilityDescribeCache.set(id, value);
  }
  return capabilityDescribeCache.get(id);
}

const API = await import(pathToFileURL(publicApiEntrypoint).href);

function recordSymbol(symbol) {
  if (!symbol || !(symbol in API)) throw new Error(`public API symbol is unavailable: ${symbol}`);
  recordUnique(ledger.publicApiSymbols, symbol);
}

function splitTemplateReference(reference) {
  const hash = String(reference).indexOf('#');
  return hash < 0
    ? {route: String(reference), fragment: ''}
    : {route: String(reference).slice(0, hash), fragment: String(reference).slice(hash)};
}

async function loadTemplate(reference) {
  const {route, fragment} = splitTemplateReference(reference);
  const normalized = skillRelative(route);
  const document = JSON.parse(await readSkillText(normalized));
  recordUnique(ledger.templatesLoaded, String(reference));
  recordSymbol('resolveCapabilityTemplatePointer');
  return API.resolveCapabilityTemplatePointer(document, fragment);
}

async function discoverInterface(nodeId, interfaceId) {
  const node = await describeNode(nodeId);
  const entry = (node.resolvedInterfaces ?? node.interface?.interfaces ?? []).find((candidate) => candidate.id === interfaceId);
  if (!entry) throw new Error(`interface not discoverable: ${nodeId}/${interfaceId}`);
  if (entry.usageReference && entry.usageReference !== node.path) await readSkillText(entry.usageReference);
  if (entry.minimumInvocation && entry.minimumInvocation.endsWith('.md')) await readSkillText(entry.minimumInvocation);
  let template = null;
  if (entry.template) template = await loadTemplate(entry.template);
  return {node, entry, template};
}

async function invokeTemplateContract(nodeId, interfaceId, {
  values = {},
  bindings = {},
  mutate = null,
  validatorArgs = [],
} = {}) {
  const discovered = await discoverInterface(nodeId, interfaceId);
  const {entry, template} = discovered;
  if (!entry.library?.symbol) throw new Error(`${nodeId}/${interfaceId} has no public library symbol`);
  if (entry.library.entrypoint !== 'scripts/lib/index.mjs') throw new Error(`${nodeId}/${interfaceId} bypasses public index.mjs`);
  if (!template) throw new Error(`${nodeId}/${interfaceId} has no canonical template`);
  recordSymbol('materializeCapabilityInputTemplate');
  let input = API.materializeCapabilityInputTemplate(template, {values, bindings});
  if (mutate) input = await mutate(input) ?? input;
  recordSymbol(entry.library.symbol);
  const output = await API[entry.library.symbol](input);
  if (entry.outputSchema && output?.schema !== entry.outputSchema) {
    throw new Error(`${nodeId}/${interfaceId} output schema mismatch: ${output?.schema} != ${entry.outputSchema}`);
  }
  if (entry.validator?.library) {
    recordSymbol(entry.validator.library);
    const validation = await API[entry.validator.library](output, ...validatorArgs);
    if (validation?.valid !== true) {
      throw new Error(`${nodeId}/${interfaceId} validator rejected output: ${(validation?.errors ?? []).join('; ')}`);
    }
  }
  return {output, entry, input};
}

async function writeProjectFile(relative, content) {
  const absolute = path.join(projectRoot, relative);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, content);
  return absolute;
}

async function writeJsonArtifact(relative, value, kind) {
  const absolute = await writeProjectFile(relative, `${JSON.stringify(value, null, 2)}\n`);
  recordSymbol('contentReference');
  return API.contentReference(absolute, {kind, root: projectRoot});
}

async function writeBytesArtifact(relative, bytes, kind) {
  const absolute = await writeProjectFile(relative, bytes);
  recordSymbol('contentReference');
  return API.contentReference(absolute, {kind, root: projectRoot});
}

function simpleObservation(evidenceRefs) {
  return {
    sourceObservation: 'The bound test reference contains the expected whole-object fixture.',
    renderObservation: 'The digest-bound fixture render contains the corresponding candidate view.',
    comparisonConclusion: 'The source and candidate evidence are structurally paired for the public-contract dogfood.',
    evidenceRefs,
  };
}

async function main() {
  await fs.mkdir(projectRoot, {recursive: true});

  for (const surface of ['tests', 'docs', 'examples', '.git', 'package.json']) {
    try {
      await fs.access(path.join(process.cwd(), surface));
      ledger.repositorySurfacesAbsent[surface] = false;
    } catch {
      ledger.repositorySurfacesAbsent[surface] = true;
    }
  }

  if (options['probe-forbidden-read']) {
    try {
      await readSkillText(String(options['probe-forbidden-read']));
      throw new Error('forbidden implementation read unexpectedly succeeded');
    } catch (error) {
      if (!String(error.message).startsWith('raw implementation read blocked:')) throw error;
      process.stdout.write(`${JSON.stringify({
        status: 'BLOCKED',
        rawImplementationReads: ledger.rawImplementationReads,
        message: error.message,
      })}\n`);
      return;
    }
  }

  const skillText = await readSkillText('SKILL.md', {required: true});
  const indexText = await readSkillText('references/INDEX.md', {required: true});
  await readSkillText('references/workflow.md', {required: true});
  await readSkillText('references/checkpointing.md', {required: true});
  await readSkillText('references/failure-routing.md', {required: true});
  if (!skillText.includes('references/INDEX.md')) throw new Error('SKILL.md does not route through references/INDEX.md');
  if (!indexText.includes('describe node') || !indexText.includes('describe capability')) {
    throw new Error('INDEX.md does not expose namespaced public discovery');
  }

  recordSymbol('CAPABILITY_ORDER');
  const capabilityOrder = [...API.CAPABILITY_ORDER];
  if (capabilityOrder.length !== 11) throw new Error(`expected 11 canonical runtime capabilities, found ${capabilityOrder.length}`);
  for (const capability of capabilityOrder) {
    const description = await describeCapability(capability);
    if (!(description.nodes?.length > 0)) throw new Error(`capability has no discoverable nodes: ${capability}`);
    ledger.capabilitiesDiscovered.push(capability);
  }

  const activeNodes = {
    'source-intake': 'provenance',
    'visual-hierarchy': 'observation',
    'visual-observation': 'observation',
    'spatial-hypotheses': 'spatial-reasoning',
    'shape-reconstruction': 'construction',
    'surface-topology': 'construction',
    assembly: 'assembly',
    appearance: 'appearance',
    rendering: 'validation',
    'visual-critique': 'validation',
    'whole-object-certification': 'claim-certification',
  };
  for (const capability of capabilityOrder) await describeNode(activeNodes[capability]);

  const ppm = [
    'P3',
    '8 8',
    '255',
    ...Array.from({length: 64}, (_, index) => {
      const x = index % 8;
      const y = Math.floor(index / 8);
      return x >= 2 && x <= 5 && y >= 1 && y <= 6 ? '210 170 90' : '30 35 42';
    }),
    '',
  ].join('\n');
  const sourceImage = await writeProjectFile('source/reference.ppm', ppm);
  const sourceManifestPath = path.join(projectRoot, 'source', 'source-manifest.json');
  runCli([
    'source-manifest',
    '--root', projectRoot,
    '--image', sourceImage,
    '--id', 'primary-reference',
    '--out', sourceManifestPath,
    '--acquisition', JSON.stringify({kind: 'test-fixture', origin: 'AD05 fresh-worker public-contract dogfood'}),
  ]);
  runCli(['init', '--root', projectRoot, '--project', 'fresh-worker-public-contract', '--source', sourceManifestPath]);
  const sourceManifest = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
  const sourceManifestRef = await writeJsonArtifact('source/source-manifest.json', sourceManifest, 'source-manifest');

  const hierarchy = (await invokeTemplateContract('observation', 'visual-hierarchy', {
    values: {sourceSha256: sourceManifest.sha256},
    mutate(input) {
      input.source.path = sourceManifest.path;
      input.source.width = sourceManifest.width;
      input.source.height = sourceManifest.height;
      return input;
    },
  })).output;
  const hierarchyRef = await writeJsonArtifact('model/visual-hierarchy.json', hierarchy, 'visual-hierarchy');

  const perceptualSignatureSet = (await invokeTemplateContract('observation', 'perceptual-signature-set', {
    values: {sourceSha256: sourceManifest.sha256},
    bindings: {perceptualSignatureHierarchy: hierarchy},
    mutate(input) {
      input.evidenceRefs = [sourceManifest.path];
      input.signatures = input.signatures.map((signature) => ({
        ...signature,
        sourceObservation: signature.family === 'silhouette-character'
          ? 'The source fixture has one compact upright dominant silhouette with a narrower dark surround.'
          : 'The source fixture identity uses explicit high-contrast rigid boundaries rather than an unconstrained smooth-form claim.',
        evidenceRefs: [sourceManifest.path],
        referenceGeometryRefs: [],
      }));
      return input;
    },
    validatorArgs: [hierarchy],
  })).output;
  const perceptualSignatureSetRef = await writeJsonArtifact(
    'model/perceptual-signature-set.json',
    perceptualSignatureSet,
    'perceptual-signature-set',
  );

  const constructionVocabulary = (await invokeTemplateContract('construction', 'construction-vocabulary', {
    values: {sourceSha256: sourceManifest.sha256},
    mutate(input) {
      input.evidenceRefs = [sourceManifest.path];
      input.cues = [{
        id: 'fixture-designed-boundaries',
        description: 'The public-contract fixture uses an explicitly selected rigid manufactured-form vocabulary for this construction path.',
        evidenceRefs: [sourceManifest.path],
      }];
      return input;
    },
  })).output;
  const constructionVocabularyRef = await writeJsonArtifact('model/construction-vocabulary.json', constructionVocabulary, 'construction-vocabulary');

  const permitDiscovery = await discoverInterface('construction', 'construction-operation-permit');
  const permitSymbol = permitDiscovery.entry.library?.symbol;
  if (!permitSymbol) throw new Error('construction-operation-permit public library symbol is not discoverable');
  recordSymbol(permitSymbol);
  const constructionPermit = await API[permitSymbol]({
    decision: constructionVocabulary,
    scopeId: 'whole',
    operation: 'hard-surface-shell',
    evidenceRefs: [sourceManifest.path],
  });
  if (permitDiscovery.entry.outputSchema && constructionPermit?.schema !== permitDiscovery.entry.outputSchema) {
    throw new Error('construction-operation-permit output schema mismatch');
  }
  if (permitDiscovery.entry.validator?.library) {
    recordSymbol(permitDiscovery.entry.validator.library);
    const permitValidation = await API[permitDiscovery.entry.validator.library](
      constructionPermit,
      constructionVocabulary,
      {scopeId: 'whole', operation: 'hard-surface-shell'},
    );
    if (permitValidation?.valid !== true) {
      throw new Error(`construction-operation-permit validator rejected output: ${(permitValidation?.errors ?? []).join('; ')}`);
    }
  }
  const constructionPermitRef = await writeJsonArtifact('model/construction-operation-permit.json', constructionPermit, 'construction-operation-permit');

  const hardSurfaceDiscovery = await discoverInterface('construction', 'hard-surface-shell');
  const hardSurfaceSymbol = hardSurfaceDiscovery.entry.library?.symbol;
  if (hardSurfaceSymbol !== 'createPermittedHardSurfaceShell') throw new Error('canonical hard-surface interface is not permit-consuming');
  recordSymbol(hardSurfaceSymbol);
  const hardSurfaceSpec = JSON.parse(await readSkillText('assets/templates/hard-surface-spec.json'));
  recordUnique(ledger.templatesLoaded, 'assets/templates/hard-surface-spec.json');
  const candidateMesh = await API[hardSurfaceSymbol]({
    decision: constructionVocabulary,
    permit: constructionPermit,
    spec: hardSurfaceSpec,
  });
  recordSymbol('partsToGlb');
  const candidateBytes = API.partsToGlb({
    assetId: 'ad05-public-contract-candidate',
    name: 'AD05 Public Contract Candidate',
    parts: [{id: 'candidate-body', mesh: candidateMesh, materialId: 'fixture', role: 'whole', scopeId: 'whole'}],
    materials: {fixture: {baseColor: [0.82, 0.64, 0.24, 1], metallic: 0.15, roughness: 0.48}},
  });
  const candidateRef = await writeBytesArtifact('model/candidate.glb', candidateBytes, 'glb');

  const proofDiscovery = await discoverInterface('construction', 'construction-execution-proof');
  const proofSymbol = proofDiscovery.entry.library?.symbol;
  if (proofSymbol !== 'createConstructionExecutionProof') throw new Error('construction execution proof is not discoverable');
  recordSymbol(proofSymbol);
  const constructionExecutionProof = await API[proofSymbol]({
    assetBytes: candidateBytes,
    decision: constructionVocabulary,
    permits: [constructionPermit],
    evidenceRefs: [sourceManifest.path],
  });
  recordSymbol(proofDiscovery.entry.validator.library);
  const proofValidation = await API[proofDiscovery.entry.validator.library](
    constructionExecutionProof,
    constructionVocabulary,
    [constructionPermit],
    {assetSha256: candidateRef.sha256},
  );
  if (proofValidation?.valid !== true) throw new Error(`construction execution proof validator rejected output: ${(proofValidation?.errors ?? []).join('; ')}`);
  const constructionExecutionProofRef = await writeJsonArtifact('model/construction-execution-proof.json', constructionExecutionProof, 'construction-execution-proof');

  const frameTemplate = JSON.parse(await readSkillText('assets/templates/canonical-object-frame.json'));
  recordUnique(ledger.templatesLoaded, 'assets/templates/canonical-object-frame.json');
  recordSymbol('digestBytes');
  frameTemplate.hero.registrationDigest = API.digestBytes(Buffer.from('AD05 public-contract registration'));
  frameTemplate.hero.position = [0, 0, 4];
  frameTemplate.hero.target = [0, 0, 0];
  frameTemplate.scopeParts = ['candidate-body'];
  const canonicalFramePath = await writeProjectFile('model/canonical-object-frame.json', `${JSON.stringify(frameTemplate, null, 2)}\n`);

  const portableRenderDir = path.join(projectRoot, 'renders', 'portable');
  runCli([
    'render',
    '--glb', path.join(projectRoot, candidateRef.path),
    '--out', portableRenderDir,
    '--reference', sourceImage,
    '--frame', canonicalFramePath,
    '--size', '96',
    '--timeout-seconds', '60',
    '--max-working-mb', '128',
  ]);

  const pbrRenderDir = path.join(projectRoot, 'renders', 'pbr');
  runCli([
    'render-pbr',
    '--glb', path.join(projectRoot, candidateRef.path),
    '--out', pbrRenderDir,
    '--reference', sourceImage,
    '--frame', canonicalFramePath,
    '--size', '96',
    '--timeout-seconds', '60',
    '--max-working-mb', '128',
  ]);

  const clayRenderDir = path.join(projectRoot, 'renders', 'clay');
  runCli([
    'render-pbr',
    '--glb', path.join(projectRoot, candidateRef.path),
    '--out', clayRenderDir,
    '--reference', sourceImage,
    '--frame', canonicalFramePath,
    '--size', '96',
    '--timeout-seconds', '60',
    '--max-working-mb', '128',
    '--neutral-clay',
  ]);

  const visualInterface = await discoverInterface('validation', 'visual-review');
  const publicConstants = visualInterface.entry.publicConstantValues ?? {};
  const viewIds = publicConstants.REQUIRED_REVIEW_VIEW_IDS;
  const visualGateIds = publicConstants.REQUIRED_VISUAL_GATE_IDS;
  if (!Array.isArray(viewIds) || !Array.isArray(visualGateIds)) throw new Error('visual-review public constants are not discoverable');

  const portableFrameRefs = [];
  const frameRefs = [];
  const clayFrameRefs = [];
  for (const viewId of viewIds) {
    recordSymbol('contentReference');
    portableFrameRefs.push(await API.contentReference(path.join(portableRenderDir, `${viewId}.png`), {kind: 'render-frame', root: projectRoot}));
    frameRefs.push(await API.contentReference(path.join(pbrRenderDir, `${viewId}.png`), {kind: 'render-frame', root: projectRoot}));
    clayFrameRefs.push(await API.contentReference(path.join(clayRenderDir, `${viewId}.png`), {kind: 'render-frame', root: projectRoot}));
  }
  const portableReportRef = await API.contentReference(path.join(portableRenderDir, 'render-report.json'), {kind: 'render-report', root: projectRoot});
  const portableBoardRef = await API.contentReference(path.join(portableRenderDir, 'multiview-review-board.png'), {kind: 'render-frame', root: projectRoot});
  const reviewBoardRef = await API.contentReference(path.join(pbrRenderDir, 'pbr-review-board.png'), {kind: 'render-frame', root: projectRoot});
  const clayBoardRef = await API.contentReference(path.join(clayRenderDir, 'pbr-review-board.png'), {kind: 'render-frame', root: projectRoot});

  const perceptualSignatureEvidence = (await invokeTemplateContract('validation', 'perceptual-signature-evidence', {
    values: {assetSha256: candidateRef.sha256},
    bindings: {perceptualSignatureSet},
    mutate(input) {
      input.evidenceRefs = [sourceManifest.path, clayBoardRef.path];
      input.observations = perceptualSignatureSet.signatures.map((signature) => ({
        signatureId: signature.id,
        status: 'insufficient',
        candidateObservation: 'The deterministic public-contract fixture render is available, but this dogfood does not claim source resemblance.',
        comparisonConclusion: 'R03 public binding is exercised without manufacturing a resemblance PASS from contract-fixture evidence.',
        evidenceRefs: [sourceManifest.path, clayBoardRef.path],
      }));
      return input;
    },
  })).output;
  const perceptualSignatureEvidenceRef = await writeJsonArtifact(
    'reviews/perceptual-signature-evidence.json',
    perceptualSignatureEvidence,
    'perceptual-signature-evidence',
  );

  const clayPbrInterface = await discoverInterface('appearance', 'pbr-render-report');
  const rawClayReport = JSON.parse(await fs.readFile(path.join(clayRenderDir, 'render-report.json'), 'utf8'));
  recordSymbol(clayPbrInterface.entry.library.symbol);
  const clayPbrReport = await API[clayPbrInterface.entry.library.symbol](rawClayReport);
  if (clayPbrInterface.entry.validator?.library) {
    recordSymbol(clayPbrInterface.entry.validator.library);
    const clayValidation = await API[clayPbrInterface.entry.validator.library](clayPbrReport);
    if (clayValidation?.valid !== true) throw new Error(`actual neutral-clay report failed public validation: ${(clayValidation?.errors ?? []).join('; ')}`);
  }
  if (clayPbrReport.presentation?.mode !== 'neutral-clay') throw new Error('fresh-worker neutral-clay render did not retain canonical presentation authority');
  const clayPbrReportRef = await writeJsonArtifact('renders/clay/render-report.json', clayPbrReport, 'render-report');

  const earlyResemblanceBarrier = (await invokeTemplateContract('validation', 'early-resemblance-barrier', {
    values: {
      sourceSha256: sourceManifest.sha256,
      hierarchyDigest: hierarchy.hierarchyDigest,
      assetSha256: candidateRef.sha256,
    },
    bindings: {
      earlyResemblanceSignatureEvidence: perceptualSignatureEvidence,
      earlyResemblanceClayRenderReport: clayPbrReport,
    },
    mutate(input) {
      input.evidenceRefs = [sourceManifest.path, clayBoardRef.path];
      return input;
    },
  })).output;
  if (earlyResemblanceBarrier.verdict !== 'HOLD') {
    throw new Error(`contract-fixture R04 barrier must remain HOLD instead of manufacturing resemblance: ${earlyResemblanceBarrier.verdict}`);
  }
  const earlyResemblanceBarrierRef = await writeJsonArtifact(
    'reviews/early-resemblance-barrier.json',
    earlyResemblanceBarrier,
    'early-resemblance-barrier',
  );

  const observation = (await invokeTemplateContract('observation', 'visual-observation', {
    values: {sourceSha256: sourceManifest.sha256},
    bindings: {hierarchy},
    mutate(input) {
      input.evidence = input.evidence.map((item) => ({...item, path: sourceManifest.path}));
      return input;
    },
    validatorArgs: [hierarchy],
  })).output;
  const observationRef = await writeJsonArtifact('model/visual-observation.json', observation, 'visual-observation');

  const referenceGeometry = (await invokeTemplateContract('observation', 'reference-geometry', {
    values: {sourceSha256: sourceManifest.sha256},
  })).output;
  const referenceGeometryRef = await writeJsonArtifact('model/reference-geometry.json', referenceGeometry, 'reference-geometry');

  const relationalStructure = (await invokeTemplateContract('relational-structure', 'relational-structure', {
    values: {sourceSha256: sourceManifest.sha256},
  })).output;
  const relationalRef = await writeJsonArtifact('model/relational-structure.json', relationalStructure, 'relational-structure');

  const semanticAuthority = (await invokeTemplateContract('inference-authority', 'semantic-authority', {
    values: {
      sourceSha256: sourceManifest.sha256,
      targetSchema: relationalStructure.schema,
      targetDigest: relationalStructure.structureDigest,
    },
  })).output;
  const authorityRef = await writeJsonArtifact('model/semantic-authority.json', semanticAuthority, 'semantic-authority');

  const spatialHypotheses = (await invokeTemplateContract('spatial-reasoning', 'spatial-hypothesis-set', {
    values: {sourceSha256: sourceManifest.sha256},
  })).output;
  const spatialRef = await writeJsonArtifact('model/spatial-hypotheses.json', spatialHypotheses, 'spatial-hypotheses');


  const constructionQuality = (await invokeTemplateContract('construction', 'construction-quality', {
    values: {
      sourceSha256: sourceManifest.sha256,
      assetSha256: candidateRef.sha256,
      comparisonSha256: reviewBoardRef.sha256,
    },
    mutate(input) {
      input.claim = 'identity-bearing';
      input.constructionFamilies = ['hard-surface-shell'];
      input.visibleFormGates = input.visibleFormGates.map((gate) => ({
        ...gate,
        status: 'pass',
        evidenceRefs: [reviewBoardRef.path],
        summary: `${gate.id} closed by the candidate-bound fresh-worker review fixture.`,
      }));
      input.identityFeatures = [{
        id: 'open-frame-aperture',
        scopeId: 'whole',
        kind: 'reference-specific-form',
        evidenceRefs: [sourceManifest.path, reviewBoardRef.path],
      }];
      input.wholeDependency = {scopeId: 'whole', status: 'pass', evidenceRefs: [reviewBoardRef.path]};
      input.registeredComparison.path = reviewBoardRef.path;
      input.registeredComparison.sha256 = reviewBoardRef.sha256;
      input.constructionVocabulary = constructionVocabulary;
      input.constructionPermits = [constructionPermit];
      input.constructionExecutionProof = constructionExecutionProof;
      return input;
    },
  })).output;
  const constructionRef = await writeJsonArtifact('model/construction-quality.json', constructionQuality, 'construction-quality');

  const surfaceNetwork = (await invokeTemplateContract('construction', 'surface-network', {
    values: {sourceSha256: sourceManifest.sha256},
  })).output;
  const surfaceRef = await writeJsonArtifact('model/surface-network.json', surfaceNetwork, 'surface-network');

  const assemblyContract = (await invokeTemplateContract('assembly', 'assembly-contract', {
    values: {sourceSha256: sourceManifest.sha256},
  })).output;
  const assemblyRef = await writeJsonArtifact('model/assembly-contract.json', assemblyContract, 'assembly-contract');

  const pbrInterface = await discoverInterface('appearance', 'pbr-render-report');
  const rawPbrReport = JSON.parse(await fs.readFile(path.join(pbrRenderDir, 'render-report.json'), 'utf8'));
  recordSymbol(pbrInterface.entry.library.symbol);
  const pbrReport = await API[pbrInterface.entry.library.symbol](rawPbrReport);
  if (pbrInterface.entry.validator?.library) {
    recordSymbol(pbrInterface.entry.validator.library);
    const pbrValidation = await API[pbrInterface.entry.validator.library](pbrReport);
    if (pbrValidation?.valid !== true) throw new Error(`actual PBR report failed public validation: ${(pbrValidation?.errors ?? []).join('; ')}`);
  }
  const pbrReportRef = await writeJsonArtifact('renders/pbr/render-report.json', pbrReport, 'render-report');

  const visualReview = (await invokeTemplateContract('validation', 'visual-review', {
    values: {
      sourceSha256: sourceManifest.sha256,
      assetSha256: candidateRef.sha256,
      renderReportSha256: pbrReportRef.sha256,
    },
    mutate(input) {
      input.evidenceClass = 'independent-reference';
      input.verdict = 'pass';
      input.views = viewIds.map((id, index) => ({
        id,
        status: 'pass',
        evidenceRefs: [frameRefs[index].path],
        observation: simpleObservation([sourceManifest.path, frameRefs[index].path]),
        summary: `${id} fixture view was reviewed through the public visual-review contract.`,
      }));
      input.gateVerdicts = visualGateIds.map((id) => ({
        id,
        status: 'pass',
        evidenceRefs: [reviewBoardRef.path],
        observation: simpleObservation([sourceManifest.path, reviewBoardRef.path]),
        summary: `${id} fixture gate was reviewed through the public visual-review contract.`,
      }));
      input.renderer = {
        ...input.renderer,
        family: pbrReport.renderer.family,
        reportRef: pbrReportRef.path,
        reportSha256: pbrReportRef.sha256,
        independentProcess: true,
        claimScope: 'visual-fidelity',
        supportedMaterialFeatures: ['base-color-factor', 'metallic-factor', 'roughness-factor'],
        unsupportedMaterialFeatures: [],
      };
      input.requiredMaterialFeatures = ['base-color-factor', 'metallic-factor', 'roughness-factor'];
      input.attestation = {attested: true, evidenceRefs: [sourceManifest.path, reviewBoardRef.path]};
      input.registeredComparison = {
        path: 'reviews/registered-comparison/comparison-report.json',
        sha256: API.digestBytes(Buffer.from('AD05 registered comparison file')),
        comparisonDigest: API.digestBytes(Buffer.from('AD05 registered comparison digest')),
        sourceSha256: sourceManifest.sha256,
        sourceManifestSha256: sourceManifestRef.sha256,
        assetSha256: candidateRef.sha256,
        renderReportPath: pbrReportRef.path,
        renderReportSha256: pbrReportRef.sha256,
        framePath: frameRefs[0].path,
        frameSha256: frameRefs[0].sha256,
        registrationDigest: API.digestBytes(Buffer.from('AD05 registration')),
        hierarchyDigest: hierarchy.hierarchyDigest,
        inputDigest: API.digestBytes(Buffer.from('AD05 comparison input')),
        scopeIds: ['whole'],
      };
      input.comparisonAssessment = {
        sourceObservation: 'The bound test reference was inspected as the source side of the registered comparison contract.',
        renderObservation: 'The digest-bound candidate fixture was inspected as the render side of the registered comparison contract.',
        comparisonConclusion: 'No contrary comparison signal is present in this deterministic public-contract fixture.',
        evidenceRefs: [sourceManifest.path, reviewBoardRef.path],
        contradictionResolution: {status: 'not-present', explanation: '', evidenceRefs: [], findingRefs: []},
      };
      return input;
    },
  })).output;
  const visualReviewRef = await writeJsonArtifact('reviews/visual-review.json', visualReview, 'visual-review');

  const checkpointDiscovery = await discoverInterface('checkpointing', 'commit-checkpoint');
  const commitSymbol = checkpointDiscovery.entry.library?.symbol;
  if (!commitSymbol) throw new Error('checkpoint public library symbol is not discoverable');
  recordSymbol(commitSymbol);
  const policySet = checkpointDiscovery.entry.publicConstantValues?.CHECKPOINT_GATE_POLICIES;
  if (!policySet?.capabilities) throw new Error('checkpoint gate policy is not discoverable');

  async function commitCapability(capability, refs) {
    const policies = policySet.capabilities[capability];
    if (!Array.isArray(policies) || policies.length === 0) throw new Error(`gate policies are not discoverable for ${capability}`);
    const requestEvidence = refs.map((item) => item.path);
    const checkpoint = await API[commitSymbol](projectRoot, {
      capability,
      scopeId: 'whole',
      reason: `AD05 fresh-worker public-contract closure for ${capability}`,
      artifactRefs: refs,
      claims: [`AD05 contract fixture exercised ${capability} through installed public surfaces.`],
      gates: policies.map((policy) => ({id: policy.id, evidenceRefs: requestEvidence})),
    });
    if (checkpoint.gates.some((gate) => gate.status !== 'pass' || gate.schema !== 'refas.checkpoint-gate-verdict/v1')) {
      throw new Error(`runtime gate authority did not produce protected PASS verdicts for ${capability}`);
    }
    ledger.checkpointsCommitted.push({capability, checkpointId: checkpoint.id, gateIds: checkpoint.gates.map((gate) => gate.id)});
    return checkpoint;
  }

  await commitCapability('source-intake', [sourceManifestRef]);
  await commitCapability('visual-hierarchy', [hierarchyRef]);
  await commitCapability('visual-observation', [observationRef, referenceGeometryRef, perceptualSignatureSetRef, relationalRef, authorityRef]);
  await commitCapability('spatial-hypotheses', [spatialRef]);
  await commitCapability('shape-reconstruction', [constructionVocabularyRef, constructionPermitRef, constructionExecutionProofRef, constructionRef, candidateRef, earlyResemblanceBarrierRef, clayPbrReportRef, ...clayFrameRefs, clayBoardRef]);
  await commitCapability('surface-topology', [surfaceRef]);
  await commitCapability('assembly', [assemblyRef]);
  await commitCapability('appearance', [pbrReportRef]);
  await commitCapability('rendering', [candidateRef, portableReportRef, portableBoardRef, pbrReportRef, clayPbrReportRef, ...portableFrameRefs, ...frameRefs, ...clayFrameRefs, reviewBoardRef, clayBoardRef]);
  await commitCapability('visual-critique', [perceptualSignatureEvidenceRef, earlyResemblanceBarrierRef, visualReviewRef]);

  const finalRefs = [candidateRef, portableReportRef, portableBoardRef, pbrReportRef, clayPbrReportRef, ...portableFrameRefs, ...frameRefs, ...clayFrameRefs, reviewBoardRef, clayBoardRef, perceptualSignatureEvidenceRef, earlyResemblanceBarrierRef, visualReviewRef];
  await commitCapability('whole-object-certification', finalRefs);

  const certificationDiscovery = await discoverInterface('claim-certification', 'certify-project');
  const certifySymbol = certificationDiscovery.entry.library?.symbol;
  if (!certifySymbol) throw new Error('certify-project public library symbol is not discoverable');
  recordSymbol(certifySymbol);
  const certificate = await API[certifySymbol](projectRoot);

  const audit = runCli(['audit', '--root', projectRoot]);
  if (audit?.valid !== true) throw new Error(`fresh-worker project audit failed: ${(audit?.errors ?? []).join('; ')}`);

  const committedCapabilities = ledger.checkpointsCommitted.map((item) => item.capability);
  if (JSON.stringify(committedCapabilities) !== JSON.stringify(capabilityOrder)) {
    throw new Error(`checkpoint order mismatch: ${committedCapabilities.join(', ')}`);
  }
  if (ledger.rawImplementationReads.length !== 0) throw new Error('normal worker performed raw implementation reads');
  if (ledger.implementationSearchCommands.length !== 0) throw new Error('normal worker used implementation search commands');
  if (Object.values(ledger.repositorySurfacesAbsent).some((value) => value !== true)) {
    throw new Error('fresh worker environment unexpectedly contains repository-only surfaces');
  }

  ledger.status = 'PASS';
  ledger.certificate = {
    schema: certificate.schema,
    checkpointId: certificate.checkpointId,
    sourceSha256: certificate.sourceSha256,
    certificateDigest: certificate.certificateDigest,
  };
  ledger.audit = {valid: audit.valid, errors: audit.errors ?? [], warnings: audit.warnings ?? []};
  await fs.mkdir(path.dirname(reportPath), {recursive: true});
  await fs.writeFile(reportPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    status: ledger.status,
    report: reportPath,
    capabilities: ledger.capabilitiesDiscovered.length,
    checkpoints: ledger.checkpointsCommitted.length,
    rawImplementationReads: ledger.rawImplementationReads.length,
    implementationSearchCommands: ledger.implementationSearchCommands.length,
    certificateDigest: ledger.certificate.certificateDigest,
  })}\n`);
}

main().catch(async (error) => {
  ledger.status = 'FAIL';
  ledger.error = error.message;
  try {
    await fs.mkdir(path.dirname(reportPath), {recursive: true});
    await fs.writeFile(reportPath, `${JSON.stringify(ledger, null, 2)}\n`);
  } catch {}
  process.stderr.write(`Fresh-worker dogfood failed: ${error.stack ?? error.message}\n`);
  process.exit(1);
});

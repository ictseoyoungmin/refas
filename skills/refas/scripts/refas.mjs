#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  abortEdit,
  auditProject,
  beginEdit,
  bindSource,
  certifyProject,
  commitCheckpoint,
  createReferenceRegistration,
  finishEdit,
  initProject,
  inspectGlb,
  listCheckpoints,
  loadProject,
  reportFinding,
  resumeProject,
  restoreCheckpoint,
  routeFinding,
  validateAssemblyContract,
  validateObservation,
  validateReferenceRegistration,
  validateSpatialHypothesisSet,
  validateSurfaceNetwork,
  validateVisualHierarchy,
  validateVisualReview,
  validatePbrRenderReport,
  validateRegisteredComparison,
  validateRealizedAssemblyProof,
  validateConstructionQuality,
} from './lib/index.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {_positional: []};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) { options._positional.push(token); continue; }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next == null || next.startsWith('--')) options[key] = true;
    else { options[key] = next; index += 1; }
  }
  return {command, options};
}

async function jsonFile(filePath, fallback = null) {
  if (!filePath) return fallback;
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

function required(options, key) {
  if (options[key] == null || options[key] === true) throw new Error(`--${key} is required`);
  return options[key];
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function runPython(script, args, {timeoutMs} = {}) {
  const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
  const result = spawnSync(python, [path.join(SCRIPT_DIR, script), ...args], {stdio: 'inherit', timeout: timeoutMs, killSignal: 'SIGKILL', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`renderer exceeded the parent-process timeout of ${Math.round(timeoutMs / 1000)} seconds`);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function help() {
  return {
    name: 'refas', version: '1.0.0',
    commands: {
      init: 'init --root DIR --project ID [--source source.json]',
      'source-manifest': 'source-manifest --root DIR --image reference.png --id ID --out source.json [--acquisition JSON]',
      'bind-source': 'bind-source --root DIR --source source.json',
      status: 'status --root DIR',
      resume: 'resume --root DIR',
      checkpoint: 'checkpoint --root DIR --capability NAME --scope ID --reason TEXT [--artifacts refs.json] [--gates gates.json]',
      restore: 'restore --root DIR --checkpoint ID --reason TEXT',
      'begin-edit': 'begin-edit --root DIR --owner CAPABILITY --scope ID --intent TEXT [--protected metric-a,metric-b]',
      'finish-edit': 'finish-edit --root DIR --candidate ID --before before.json --after after.json [--findings findings.json] [--closure]',
      'abort-edit': 'abort-edit --root DIR --reason TEXT',
      route: 'route --root DIR --finding finding.json',
      'report-finding': 'report-finding --root DIR --finding finding.json',
      audit: 'audit --root DIR',
      certify: 'certify --root DIR',
      register: 'register --input registration-input.json --out registration.json',
      'validate-spec': 'validate-spec --file spec.json [--context hierarchy.json]',
      'inspect-glb': 'inspect-glb --glb asset.glb',
      evidence: 'evidence --image reference.png --out DIR --scope ID [--roi x,y,w,h] [--padding 0.08]',
      render: 'render --glb asset.glb --out DIR [--reference image.png] [--frame canonical-frame.json] [--size 640] [--timeout-seconds 300] [--max-working-mb 512] [--tile-size 256] [--max-triangles N]',
      'render-pbr': 'render-pbr --glb asset.glb --out DIR --frame canonical-frame.json [--reference image.png] [--size 420] [--timeout-seconds 180] [--max-working-mb 512]',
      compare: 'compare --input registered-comparison-input.json --out DIR [--timeout-seconds 120]',
    },
  };
}

async function main() {
  const {command, options} = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h' || options.help) { print(help()); return; }
  if (command === '--version' || command === '-v') { process.stdout.write('1.0.0\n'); return; }
  if (command === 'init') {
    print(await initProject(required(options, 'root'), {projectId: required(options, 'project'), source: await jsonFile(options.source)}));
    return;
  }
  if (command === 'source-manifest') {
    const args = ['--root', required(options, 'root'), '--image', required(options, 'image'), '--id', required(options, 'id'), '--out', required(options, 'out')];
    if (options.acquisition) args.push('--acquisition', options.acquisition);
    runPython('source_manifest.py', args); return;
  }
  if (command === 'bind-source') {
    print(await bindSource(required(options, 'root'), await jsonFile(required(options, 'source'))));
    return;
  }
  if (command === 'status') {
    const root = required(options, 'root');
    print({state: await loadProject(root), guidance: await resumeProject(root), checkpoints: (await listCheckpoints(root)).map(({id, parentId, capability, scopeId, reason, gates}) => ({id, parentId, capability, scopeId, reason, gates}))});
    return;
  }
  if (command === 'resume') { print(await resumeProject(required(options, 'root'))); return; }
  if (command === 'checkpoint') {
    print(await commitCheckpoint(required(options, 'root'), {
      capability: required(options, 'capability'), scopeId: required(options, 'scope'), reason: required(options, 'reason'),
      artifactRefs: await jsonFile(options.artifacts, []), gates: await jsonFile(options.gates, []), claims: await jsonFile(options.claims, []), metadata: await jsonFile(options.metadata, {}),
    }));
    return;
  }
  if (command === 'restore') {
    print(await restoreCheckpoint(required(options, 'root'), required(options, 'checkpoint'), {reason: String(options.reason ?? 'explicit restore')}));
    return;
  }
  if (command === 'begin-edit') {
    print(await beginEdit(required(options, 'root'), {ownerCapability: required(options, 'owner'), scopeId: required(options, 'scope'), intent: required(options, 'intent'), protectedMetrics: String(options.protected ?? '').split(',').filter(Boolean)}));
    return;
  }
  if (command === 'finish-edit') {
    print(await finishEdit(required(options, 'root'), {candidateCheckpointId: required(options, 'candidate'), before: await jsonFile(required(options, 'before')), after: await jsonFile(required(options, 'after')), findings: await jsonFile(options.findings, []), closureRequested: options.closure === true}));
    return;
  }
  if (command === 'abort-edit') { print(await abortEdit(required(options, 'root'), {reason: String(options.reason ?? 'candidate abandoned')})); return; }
  if (command === 'route') {
    const root = required(options, 'root');
    const state = await loadProject(root);
    print(routeFinding({finding: await jsonFile(required(options, 'finding')), checkpoints: await listCheckpoints(root), headId: state.head}));
    return;
  }
  if (command === 'report-finding') {
    print(await reportFinding(required(options, 'root'), {finding: await jsonFile(required(options, 'finding'))}));
    return;
  }
  if (command === 'audit') { print(await auditProject(required(options, 'root'))); return; }
  if (command === 'certify') { print(await certifyProject(required(options, 'root'))); return; }
  if (command === 'register') {
    const registration = createReferenceRegistration(await jsonFile(required(options, 'input')));
    const output = await writeJson(required(options, 'out'), registration);
    print({status: 'PASS', output, registrationDigest: registration.registrationDigest, metrics: registration.metrics});
    return;
  }
  if (command === 'validate-spec') {
    const spec = await jsonFile(required(options, 'file'));
    let result;
    if (spec.schema === 'refas.visual-hierarchy/v1') result = validateVisualHierarchy(spec);
    else if (spec.schema === 'refas.visual-observation/v1') result = validateObservation(spec, await jsonFile(required(options, 'context')));
    else if (spec.schema === 'refas.spatial-hypothesis-set/v1') result = validateSpatialHypothesisSet(spec);
    else if (spec.schema === 'refas.reference-registration/v1') result = validateReferenceRegistration(spec);
    else if (spec.schema === 'refas.surface-network/v1') result = validateSurfaceNetwork(spec);
    else if (spec.schema === 'refas.assembly-contract/v1') result = validateAssemblyContract(spec);
    else if (spec.schema === 'refas.visual-review/v1') result = validateVisualReview(spec);
    else if (spec.schema === 'refas.pbr-render-report/v1') result = validatePbrRenderReport(spec);
    else if (spec.schema === 'refas.registered-comparison/v1') result = validateRegisteredComparison(spec);
    else if (spec.schema === 'refas.realized-assembly-proof/v1') result = validateRealizedAssemblyProof(spec);
    else if (spec.schema === 'refas.construction-quality/v1') result = validateConstructionQuality(spec);
    else throw new Error(`no validator for schema: ${spec.schema}`);
    print(result);
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (command === 'inspect-glb') { print(inspectGlb(await fs.readFile(path.resolve(required(options, 'glb'))))); return; }
  if (command === 'evidence') {
    const args = ['--image', required(options, 'image'), '--out', required(options, 'out'), '--scope', required(options, 'scope')];
    if (options.roi) args.push('--roi', options.roi); if (options.padding) args.push('--padding', options.padding);
    runPython('evidence.py', args); return;
  }
  if (command === 'render') {
    const args = ['--glb', required(options, 'glb'), '--out', required(options, 'out')];
    if (options.reference) args.push('--reference', options.reference); if (options.size) args.push('--size', options.size);
    if (options.frame) args.push('--frame', options.frame);
    if (options['timeout-seconds']) args.push('--timeout-seconds', options['timeout-seconds']);
    if (options['max-working-mb']) args.push('--max-working-mb', options['max-working-mb']);
    if (options['tile-size']) args.push('--tile-size', options['tile-size']);
    if (options['max-triangles']) args.push('--max-triangles', options['max-triangles']);
    const timeoutSeconds = Number(options['timeout-seconds'] ?? 300);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error('--timeout-seconds must be a positive number');
    runPython('render_glb.py', args, {timeoutMs: Math.ceil(timeoutSeconds * 1000 + 5000)}); return;
  }
  if (command === 'render-pbr') {
    const args = ['--glb', required(options, 'glb'), '--out', required(options, 'out'), '--frame', required(options, 'frame')];
    if (options.reference) args.push('--reference', options.reference); if (options.size) args.push('--size', options.size);
    if (options['timeout-seconds']) args.push('--timeout-seconds', options['timeout-seconds']); if (options['max-working-mb']) args.push('--max-working-mb', options['max-working-mb']);
    const timeoutSeconds = Number(options['timeout-seconds'] ?? 180); if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error('--timeout-seconds must be a positive number');
    runPython('render_pbr.py', args, {timeoutMs: Math.ceil(timeoutSeconds * 1000 + 5000)}); return;
  }
  if (command === 'compare') {
    const args = ['--input', required(options, 'input'), '--out', required(options, 'out')];
    const timeoutSeconds = Number(options['timeout-seconds'] ?? 120);
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error('--timeout-seconds must be a positive number');
    runPython('compare_registered.py', args, {timeoutMs: Math.ceil(timeoutSeconds * 1000 + 5000)}); return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`RefAs error: ${error.message}\n`);
  process.exit(1);
});

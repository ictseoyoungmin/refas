#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {readLabelCatalog, validateLabelCatalog} from '../.github/scripts/sync-labels.mjs';
import {CAPABILITY_ORDER, FINDING_OWNERS} from '../legacy/v1/scripts/lib/ownership.mjs';
import {REFAS_VERSION} from '../legacy/v1/scripts/lib/canonical.mjs';
import {verifyProductionDistribution} from './verify-production-distribution.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_ROOTS = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github', 'docs', 'schemas', 'bin', 'skills/refas', 'legacy/v1'];
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.py', '.yaml', '.yml', '.svg']);
const FORBIDDEN = [
  {label: 'workflow methodology name', pattern: new RegExp(['bottle', 'neck'].join(''), 'iu')},
  {label: 'legacy package identity', pattern: new RegExp(['for' + 'ge', 'me' + 'ch'].join('[._-]'), 'iu')},
  {label: 'legacy schema namespace', pattern: new RegExp(`["']${'for' + 'ge'}\\.`, 'u')},
  {label: 'iteration-coded identifier', pattern: /\b(?:A|B|C|G|O)\d{2}(?:R\d+)?\b/u},
];

async function walk(relative) {
  const absolute = path.join(ROOT, relative);
  const stat = await fs.stat(absolute);
  if (stat.isFile()) return [relative];
  const output = [];
  for (const entry of await fs.readdir(absolute, {withFileTypes: true})) {
    if (relative === 'docs' && entry.name === 'works') continue;
    const child = path.join(relative, entry.name);
    const portable = child.split(path.sep).join('/').replace(/^\.\//u, '');
    if (entry.isDirectory() && (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.refas' || entry.name === '__pycache__' || entry.name === 'temp' || /^examples\/[^/]+\/output$/u.test(portable))) continue;
    if (entry.isDirectory()) output.push(...await walk(child));
    else if (entry.isFile()) output.push(child);
  }
  return output;
}

const required = [
  'AGENTS.md','LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','package.json','requirements.txt','CHANGELOG.md','bin/refas.mjs',
  '.github/labels.json','.github/pull_request_template.md','.github/scripts/sync-labels.mjs','.github/workflows/ci.yml','.github/workflows/publish-release.yml','.github/workflows/sync-labels.yml',
  '.github/ISSUE_TEMPLATE/config.yml','.github/ISSUE_TEMPLATE/visual-finding.yml','.github/ISSUE_TEMPLATE/defect.yml','.github/ISSUE_TEMPLATE/capability-change.yml','.github/ISSUE_TEMPLATE/release-readiness.yml','.github/ISSUE_TEMPLATE/documentation-governance.yml',
  'docs/github-governance.md','docs/canonical-edit-boundary.md','docs/attachment-semantics.md','docs/logical-fusion.md','docs/surface-anchor-frames.md','docs/attachment-follow.md','docs/multi-anchor-solver.md','docs/articulation-clearance.md','docs/attachment-propagation.md','docs/physical-fusion.md','docs/realized-contact-support.md','docs/constraint-aware-fitting.md','docs/candidate-transactions.md','docs/fitting-and-discrepancy.md','docs/architecture.md','docs/release-criteria.md','docs/v1.0.4-release-readiness.md','docs/v1.1.0-release-readiness.md','docs/v1.1.1-release-readiness.md','docs/physical-semantics-plan.md','docs/integrated-physical-fixture.md','docs/known-limitations.md',
  'legacy/v1/SKILL.md','legacy/v1/references/GRAPH.json','legacy/v1/references/host-integration.md','legacy/v1/references/parameter-fitting.md','legacy/v1/references/realized-contact-support.md','legacy/v1/references/candidate-transactions.md','legacy/v1/references/relational-structure.md','legacy/v1/references/inference-authority.md','legacy/v1/references/whole-system-relational-barrier.md',
  'legacy/v1/references/contracts/transmission-model.md','legacy/v1/references/contracts/actuation-model.md','legacy/v1/references/contracts/control-profile.md','legacy/v1/references/contracts/runtime-binding.md','legacy/v1/references/contracts/physical-asset-bundle.md','legacy/v1/references/contracts/representation-capacity.md','legacy/v1/references/contracts/backend-export.md','legacy/v1/references/contracts/representation-normalizer.md','legacy/v1/references/contracts/cross-representation-validation.md','legacy/v1/references/contracts/divergence-authorization.md','legacy/v1/references/contracts/physical-claims.md',
  'legacy/v1/scripts/refas.mjs','legacy/v1/scripts/refas-host.mjs','legacy/v1/scripts/verify_installation_boundary.mjs','legacy/v1/scripts/verify_semantic_instruction_graph.mjs','legacy/v1/scripts/external_construction_fresh_worker.mjs','legacy/v1/scripts/verify_external_construction_dogfood.mjs','legacy/v1/scripts/verify_subdivision_cage_dogfood.mjs','legacy/v1/scripts/bilateral_pair_fresh_worker.mjs','legacy/v1/scripts/verify_bilateral_pair_dogfood.mjs','legacy/v1/scripts/structural_plausibility_fresh_worker.mjs','legacy/v1/scripts/verify_structural_plausibility_dogfood.mjs','legacy/v1/scripts/blockout_competition_fresh_worker.mjs','legacy/v1/scripts/verify_blockout_competition_dogfood.mjs','legacy/v1/scripts/prior_quarantine_fresh_worker.mjs','legacy/v1/scripts/verify_prior_quarantine_dogfood.mjs','legacy/v1/scripts/verify_textured_material_dogfood.mjs','legacy/v1/scripts/render_pbr.py','legacy/v1/scripts/lib/index.mjs','legacy/v1/scripts/lib/canonical-edit.mjs','legacy/v1/scripts/lib/attachment-semantics.mjs','legacy/v1/scripts/lib/logical-fusion.mjs','legacy/v1/scripts/lib/surface-anchor.mjs','legacy/v1/scripts/lib/attachment-follow.mjs','legacy/v1/scripts/lib/multi-anchor.mjs','legacy/v1/scripts/lib/articulation-clearance.mjs','legacy/v1/scripts/lib/attachment-propagation.mjs','legacy/v1/scripts/lib/physical-fusion.mjs','legacy/v1/scripts/lib/realized-contact.mjs','legacy/v1/scripts/lib/structural-plausibility.mjs','legacy/v1/scripts/lib/blockout-competition.mjs','legacy/v1/scripts/lib/prior-quarantine.mjs','legacy/v1/scripts/lib/uv.mjs','legacy/v1/scripts/lib/fit-structural-eligibility.mjs','legacy/v1/scripts/lib/candidate-transaction.mjs','legacy/v1/scripts/lib/parameter-fit.mjs','legacy/v1/scripts/lib/shape-repair.mjs','legacy/v1/scripts/lib/subdivision-cage.mjs','legacy/v1/scripts/lib/camera-fit.mjs','legacy/v1/scripts/lib/pose-fit.mjs','legacy/v1/scripts/lib/orientation-evidence.mjs','legacy/v1/scripts/lib/orientation-frame.mjs','legacy/v1/scripts/lib/orientation-discrepancy.mjs','legacy/v1/scripts/lib/orientation-pose-fit.mjs','legacy/v1/scripts/lib/geometry-backend.mjs','legacy/v1/scripts/lib/perceptual-discrepancy.mjs','legacy/v1/scripts/lib/appearance-fit.mjs','legacy/v1/scripts/lib/macro-fit.mjs','legacy/v1/scripts/lib/benchmark.mjs','legacy/v1/scripts/lib/relational-structure.mjs','legacy/v1/scripts/lib/bilateral-pair.mjs','legacy/v1/scripts/lib/relational-discrepancy.mjs','legacy/v1/scripts/lib/semantic-authority.mjs','legacy/v1/scripts/lib/whole-system-relational-barrier.mjs','legacy/v1/scripts/lib/certification-relational-evidence.mjs',
  'legacy/v1/scripts/lib/physical-identity-graph.mjs','legacy/v1/scripts/lib/rigid-body-dynamics.mjs','legacy/v1/scripts/lib/collision-model.mjs','legacy/v1/scripts/lib/articulation-graph.mjs','legacy/v1/scripts/lib/mechanism-graph.mjs','legacy/v1/scripts/lib/transmission-model.mjs','legacy/v1/scripts/lib/actuation-model.mjs','legacy/v1/scripts/lib/control-profile.mjs','legacy/v1/scripts/lib/runtime-binding.mjs','legacy/v1/scripts/lib/physical-asset-bundle.mjs','legacy/v1/scripts/lib/representation-capacity.mjs','legacy/v1/scripts/lib/backend-export-core.mjs','legacy/v1/scripts/lib/backend-export.mjs','legacy/v1/scripts/lib/representation-normalizer.mjs','legacy/v1/scripts/lib/cross-representation-validator.mjs','legacy/v1/scripts/lib/divergence-authorization.mjs','legacy/v1/scripts/lib/physical-claims.mjs','legacy/v1/scripts/lib/physical-claim-certification.mjs','legacy/v1/scripts/lib/physical-claim-certification-gate.mjs',
  'legacy/v1/scripts/lib/host-state.mjs','legacy/v1/scripts/lib/host-session.mjs','legacy/v1/scripts/lib/host-event.mjs','legacy/v1/scripts/lib/host-operation.mjs','legacy/v1/scripts/lib/host-review-bundle.mjs','legacy/v1/scripts/lib/host-artifact-handoff.mjs','legacy/v1/scripts/lib/host-worker.mjs',
  'schemas/source-manifest.schema.json','schemas/checkpoint.schema.json','schemas/external-construction-receipt.schema.json','schemas/subdivision-cage-organic.schema.json','schemas/bilateral-pair-realization.schema.json','schemas/structural-plausibility.schema.json','schemas/blockout-competition-policy.schema.json','schemas/blockout-competition-decision.schema.json','schemas/prior-quarantine.schema.json','schemas/prior-quarantine-authority.schema.json','schemas/uv-mapping.schema.json','schemas/visual-review.schema.json','schemas/whole-object-certificate.schema.json','schemas/canonical-edit-intent.schema.json','schemas/attachment-semantics.schema.json','schemas/logical-fusion.schema.json','schemas/logical-fusion-invalidation.schema.json','schemas/surface-anchor-set.schema.json','schemas/surface-anchor-rebind.schema.json','schemas/attachment-follow-state.schema.json','schemas/attachment-follow-report.schema.json','schemas/multi-anchor-plan.schema.json','schemas/multi-anchor-report.schema.json','schemas/articulated-joint.schema.json','schemas/articulated-joint-report.schema.json','schemas/supported-clearance.schema.json','schemas/supported-clearance-report.schema.json','schemas/attachment-propagation-plan.schema.json','schemas/attachment-propagation-report.schema.json','schemas/physical-fusion-plan.schema.json','schemas/physical-fusion-report.schema.json','schemas/fusion-provenance.schema.json','schemas/realized-contact-plan.schema.json','schemas/realized-contact-graph.schema.json','schemas/realized-contact-report.schema.json','schemas/fit-structural-eligibility.schema.json','schemas/candidate-transaction.schema.json','schemas/parameter-fit-plan.schema.json','schemas/parameter-fit-report.schema.json','schemas/camera-fit.schema.json','schemas/pose-fit.schema.json','schemas/orientation-evidence.schema.json','schemas/orientation-discrepancy.schema.json','schemas/orientation-pose-fit.schema.json','schemas/geometry-backend.schema.json','schemas/representation-capacity.schema.json','schemas/perceptual-discrepancy.schema.json','schemas/appearance-fit.schema.json','schemas/lighting-fit.schema.json','schemas/macro-fit.schema.json','schemas/benchmark-matrix.schema.json','schemas/relational-structure.schema.json','schemas/relational-discrepancy.schema.json','schemas/semantic-authority.schema.json','schemas/whole-system-relational-barrier.schema.json','schemas/certification-relational-evidence.schema.json',
  'schemas/physical-identity-graph.schema.json','schemas/rigid-body-dynamics.schema.json','schemas/collision-model.schema.json','schemas/articulation-graph.schema.json','schemas/mechanism-graph.schema.json','schemas/transmission-model.schema.json','schemas/actuation-model.schema.json','schemas/control-profile.schema.json','schemas/runtime-binding.schema.json','schemas/physical-asset-bundle.schema.json','schemas/canonical-export-view.schema.json','schemas/backend-export.schema.json','schemas/normalized-representation.schema.json','schemas/cross-representation-validation.schema.json','schemas/divergence-authorization.schema.json','schemas/physical-claim-evidence.schema.json',
  'schemas/host-session.schema.json','schemas/host-event.schema.json','schemas/host-operation.schema.json','schemas/host-review-bundle.schema.json','schemas/artifact-handoff.schema.json','schemas/worker-request.schema.json','schemas/worker-response.schema.json',
  'tests/contracts.test.mjs','tests/external-construction.test.mjs','tests/external-construction-process.test.mjs','tests/subdivision-cage.test.mjs','tests/bilateral-pair.test.mjs','tests/bilateral-articulated-regression.test.mjs','tests/structural-plausibility.test.mjs','tests/blockout-competition.test.mjs','tests/prior-quarantine.test.mjs','tests/uv-texture.test.mjs','tests/textured-material-dogfood.test.mjs','tests/canonical-edit-boundary.test.mjs','tests/attachment-semantics.test.mjs','tests/logical-fusion.test.mjs','tests/surface-anchor.test.mjs','tests/attachment-follow.test.mjs','tests/multi-anchor.test.mjs','tests/articulation-clearance.test.mjs','tests/attachment-propagation.test.mjs','tests/physical-fusion.test.mjs','tests/realized-contact.test.mjs','tests/constraint-aware-fit.test.mjs','tests/fit-structural-eligibility.test.mjs','tests/candidate-transaction.test.mjs','tests/pose-fit-report-integrity.test.mjs','tests/orientation-frame.test.mjs','tests/orientation-fitting.test.mjs','tests/orientation-hardening.test.mjs','tests/cli.test.mjs','tests/parameter-fit.test.mjs','tests/shape-repair.test.mjs','tests/governance.test.mjs','tests/instruction-graph.test.mjs','tests/semantic-instruction-graph.test.mjs','tests/relational-structure.test.mjs','tests/semantic-authority.test.mjs','tests/whole-system-relational-barrier.test.mjs','tests/relational-discrepancy.test.mjs','tests/relational-fit.test.mjs','tests/certification-relational-evidence.test.mjs','tests/integrated-physical-fixture.test.mjs',
  'tests/host-session.test.mjs','tests/host-session-recovery.test.mjs','tests/host-events.test.mjs','tests/host-operation.test.mjs','tests/host-review-bundle.test.mjs','tests/host-artifact-handoff.test.mjs','tests/host-worker.test.mjs','tests/host-cli.test.mjs',
  'examples/wing-cover/run.mjs','examples/material-fixture/run.mjs','examples/hard-surface/run.mjs','examples/modular-assembly/run.mjs','examples/parameter-fit/run.mjs','examples/benchmark-matrix/run.mjs',
];

const requiredContracts = [
  'refas.source-manifest/v1','refas.external-construction-receipt/v1','refas.subdivision-cage-organic/v1','refas.bilateral-pair-realization/v1','refas.structural-plausibility/v1','refas.blockout-competition-policy/v1','refas.blockout-competition-decision/v1','refas.prior-quarantine/v1','refas.prior-quarantine-authority/v1','refas.uv-mapping/v1','refas.visual-hierarchy/v1','refas.visual-observation/v1','refas.spatial-hypothesis-set/v1','refas.reference-registration/v1','refas.surface-network/v1','refas.assembly-contract/v1','refas.finding/v1','refas.checkpoint/v1','refas.project-state/v1','refas.canonical-object-frame/v1','refas.canonical-edit-intent/v1','refas.attachment-semantics/v1','refas.logical-fusion/v1','refas.logical-fusion-invalidation/v1','refas.surface-anchor-set/v1','refas.surface-anchor-rebind/v1','refas.attachment-follow-state/v1','refas.attachment-follow-report/v1','refas.multi-anchor-plan/v1','refas.multi-anchor-report/v1','refas.articulated-joint/v1','refas.articulated-joint-report/v1','refas.supported-clearance/v1','refas.supported-clearance-report/v1','refas.attachment-propagation-plan/v1','refas.attachment-propagation-report/v1','refas.physical-fusion-plan/v1','refas.physical-fusion-report/v1','refas.fusion-provenance/v1','refas.realized-contact-plan/v1','refas.realized-contact-graph/v1','refas.realized-contact-report/v1','refas.fit-structural-eligibility/v1','refas.candidate-transaction/v1','refas.pbr-render-report/v1','refas.visual-review/v1','refas.whole-object-certificate/v1','refas.registered-comparison/v1','refas.hard-surface-spec/v1','refas.realized-assembly-proof/v1','refas.construction-quality/v1','refas.parameter-fit-plan/v1','refas.parameter-fit-report/v1','refas.camera-fit/v1','refas.pose-fit/v1','refas.orientation-evidence-set/v1','refas.orientation-discrepancy/v1','refas.geometry-backend/v1','refas.representation-capacity/v1','refas.perceptual-discrepancy/v1','refas.appearance-fit/v1','refas.lighting-fit/v1','refas.macro-fit/v1','refas.benchmark-matrix/v1','refas.relational-structure/v1','refas.relational-discrepancy/v1','refas.semantic-authority-set/v1','refas.whole-system-relational-barrier/v1','refas.certification-relational-evidence/v1',
  'refas.host-session/v1','refas.host-event/v1','refas.host-operation/v1','refas.host-review-bundle/v1','refas.artifact-handoff/v1','refas.worker-request/v1','refas.worker-response/v1',
];

async function main() {
  const missing = [];
  for (const file of required) try { await fs.access(path.join(ROOT,file)); } catch { missing.push(file); }
  if (missing.length) throw new Error(`required files missing: ${missing.join(', ')}`);

  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8'));
  const production = await verifyProductionDistribution({root: ROOT});
  assert.equal(packageJson.version, production.version, 'package version must equal the production runtime');
  assert.equal(REFAS_VERSION, '1.4.2', 'retained legacy runtime identity must remain explicit');
  const canonical = await fs.readFile(path.join(ROOT,'legacy/v1/scripts/lib/canonical.mjs'),'utf8');
  assert.ok(canonical.includes(`export const REFAS_VERSION = '${REFAS_VERSION}'`),'runtime version export must be canonical');
  const cli = await fs.readFile(path.join(ROOT,'legacy/v1/scripts/refas.mjs'),'utf8');
  assert.match(cli,/name: 'refas', version: REFAS_VERSION/u,'CLI must report the canonical runtime version');
  const hostCli = await fs.readFile(path.join(ROOT,'legacy/v1/scripts/refas-host.mjs'),'utf8');
  assert.match(hostCli,/name:'refas-host'/u,'host CLI must expose the stable companion identity');

  const productFiles = (await Promise.all(PRODUCT_ROOTS.map(walk))).flat();
  const violations=[];
  for (const relative of productFiles) {
    if (!TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) continue;
    const contents=await fs.readFile(path.join(ROOT,relative),'utf8');
    for (const rule of FORBIDDEN) if (rule.pattern.test(contents)||rule.pattern.test(relative)) violations.push(`${relative}: ${rule.label}`);
  }
  if (violations.length) throw new Error(`product boundary contains forbidden development identity:\n${violations.join('\n')}`);

  const schemaFiles=(await walk('schemas')).filter((file)=>file.endsWith('.json'));
  const schemaIds=new Set(), schemaContracts=new Set();
  for (const relative of schemaFiles) {
    const schema=JSON.parse(await fs.readFile(path.join(ROOT,relative),'utf8'));
    if (schema.$schema!=='https://json-schema.org/draft/2020-12/schema') throw new Error(`${relative}: Draft 2020-12 marker missing`);
    if (!schema.$id||schemaIds.has(schema.$id)) throw new Error(`${relative}: schema ID missing or duplicated`);
    schemaIds.add(schema.$id);
    const contract=schema?.properties?.schema?.const;
    if (contract) schemaContracts.add(contract);
  }
  for (const contract of requiredContracts) if (!schemaContracts.has(contract)) throw new Error(`public schema missing for ${contract}`);

  const templateFiles=(await walk('legacy/v1/assets/templates')).filter((file)=>file.endsWith('.json'));
  for (const relative of templateFiles) JSON.parse(await fs.readFile(path.join(ROOT,relative),'utf8'));

  const labelCatalog=await readLabelCatalog();
  const governanceSummary=validateLabelCatalog(labelCatalog);
  const managedLabels=new Set(labelCatalog.map((label)=>label.name));
  const issueForms=['.github/ISSUE_TEMPLATE/visual-finding.yml','.github/ISSUE_TEMPLATE/defect.yml','.github/ISSUE_TEMPLATE/capability-change.yml','.github/ISSUE_TEMPLATE/release-readiness.yml','.github/ISSUE_TEMPLATE/documentation-governance.yml'];
  for (const relative of issueForms) {
    const contents=await fs.readFile(path.join(ROOT,relative),'utf8');
    const match=contents.match(/^labels:\s*(\[[^\n]+\])$/mu);
    assert.ok(match,`${relative}: inline default labels missing`);
    for (const label of JSON.parse(match[1])) assert.ok(managedLabels.has(label),`${relative}: unmanaged default label ${label}`);
    assert.match(contents,/^body:\s*$/mu,`${relative}: issue form body missing`);
    assert.match(contents,/workflow: needs-evidence/u,`${relative}: intake must begin with needs-evidence`);
  }
  const visualFindingForm=await fs.readFile(path.join(ROOT,'.github/ISSUE_TEMPLATE/visual-finding.yml'),'utf8');
  for (const capability of CAPABILITY_ORDER) assert.ok(visualFindingForm.includes(`        - ${capability}`),`visual finding form missing capability ${capability}`);
  for (const finding of Object.keys(FINDING_OWNERS).filter((finding)=>finding!=='camera-mismatch')) assert.ok(visualFindingForm.includes(`        - ${finding}`),`visual finding form missing authoring category ${finding}`);
  assert.doesNotMatch(visualFindingForm,/^\s*- camera-mismatch\s*$/mu,'deprecated camera-mismatch must not be offered for new findings');

  const prTemplate=await fs.readFile(path.join(ROOT,'.github/pull_request_template.md'),'utf8');
  assert.equal((prTemplate.match(/Closes #/gu)??[]).length,1,'PR template must close exactly one primary Issue');
  for (const marker of ['Owner capability','Semantic scope ID','Recovery and Invalidation','Reopen Conditions']) assert.ok(prTemplate.includes(marker),`PR template missing ${marker}`);
  const labelWorkflow=await fs.readFile(path.join(ROOT,'.github/workflows/sync-labels.yml'),'utf8');
  assert.match(labelWorkflow,/^\s*issues:\s*write\s*$/mu,'label sync must declare issues write permission');
  assert.doesNotMatch(labelWorkflow,/^\s*pull_request:\s*$/mu,'label sync must not run with write permission on pull requests');

  const allFiles=await walk('.');
  const transient=allFiles.filter((file)=>/(?:^|\/)(?:__pycache__|node_modules|\.refas|dist|release)(?:\/|$)|\.pyc$|\.zip$/u.test(file)&&!file.startsWith('.git/'));
  if (transient.length) throw new Error(`transient files present: ${transient.join(', ')}`);
  const duplicateRuntime=allFiles.filter((file)=>/(?:^|\/)src\/.*\.(?:mjs|js|ts)$/u.test(file));
  if (duplicateRuntime.length) throw new Error(`unexpected duplicate src runtime tree: ${duplicateRuntime.join(', ')}`);

  process.stdout.write(`${JSON.stringify({status:'PASS',version:packageJson.version,productFiles:productFiles.length,publicSchemas:schemaContracts.size,templates:templateFiles.length,managedLabels:governanceSummary.labels,issueForms:issueForms.length},null,2)}\n`);
}

main().catch((error)=>{process.stderr.write(`Repository check failed: ${error.message}\n`);process.exit(1);});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {FINDING_OWNERS} from '../skills/refas/scripts/lib/ownership.mjs';
import {
  analyzeSemanticInstructionGraph,
  extractBareMarkdownRoutes,
} from '../skills/refas/scripts/verify_semantic_instruction_graph.mjs';

const REPOSITORY = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function copyInstalledSkill(prefix) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const installed = path.join(temp, 'refas');
  await fs.cp(path.join(REPOSITORY, 'skills/refas'), installed, {recursive: true});
  return {temp, installed};
}

test('typed semantic instruction graph covers every leaf and matches runtime ownership', async () => {
  const report = await analyzeSemanticInstructionGraph();
  assert.equal(report.status, 'PASS', report.errors.join('\n'));
  assert.equal(report.schema, 'refas.instruction-graph/v1');
  assert.equal(report.nodeCount, 40);
  assert.equal(report.referenceLeaves, 40);
  assert.equal(report.cycle, null);
  assert.deepEqual(report.missingCapabilityOwners, []);
  assert.deepEqual(report.bareMarkdownRoutes, []);
  assert.deepEqual(report.legacyHiddenGeometryPolicyHits, []);
  assert.equal(report.interfaceSchema, 'refas.instruction-node-interface/v1');
  assert.equal(report.interfaceNodes, 40);
  assert.equal(report.interfaceOperations, 119);
  assert.equal(report.runtimeCapabilitiesCovered.length, 11);
  assert.deepEqual(report.runtimeCapabilitiesCovered.sort(), [
    'appearance',
    'assembly',
    'rendering',
    'shape-reconstruction',
    'source-intake',
    'spatial-hypotheses',
    'surface-topology',
    'visual-critique',
    'visual-hierarchy',
    'visual-observation',
    'whole-object-certification',
  ].sort());
  assert.equal(FINDING_OWNERS['camera-hypothesis-mismatch'], 'spatial-hypotheses');
  assert.equal(FINDING_OWNERS['render-camera-integrity'], 'rendering');
  assert.equal(FINDING_OWNERS['camera-mismatch'], 'rendering');
});

test('semantic graph requires interface metadata on every instruction node', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-interface-required-');
  try {
    const graphPath = path.join(installed, 'references/GRAPH.json');
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    delete graph.nodes[0].interface;
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.errors.some((error) => error.includes('node workflow must declare interface metadata')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('semantic graph separates runtime capabilities from routing owner tags', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-interface-owner-');
  try {
    const graphPath = path.join(installed, 'references/GRAPH.json');
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    const observation = graph.nodes.find((node) => node.id === 'observation');
    observation.runtimeCapabilities = ['visual-observation'];
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.errors.some((error) => error.includes('node observation runtimeCapabilities must equal canonical runtime owners')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('semantic graph rejects implementation paths and missing public symbols in interface metadata', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-interface-public-');
  try {
    const graphPath = path.join(installed, 'references/GRAPH.json');
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    const attachment = graph.nodes.find((node) => node.id === 'attachment-follow');
    attachment.interface.interfaces[0].library.entrypoint = 'scripts/lib/attachment-follow.mjs';
    attachment.interface.interfaces[0].library.symbol = 'missingPublicSymbol';
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.errors.some((error) => error.includes('library.entrypoint must be scripts/lib/index.mjs')));
    assert.ok(report.errors.some((error) => error.includes('library.symbol is not exported by scripts/lib/index.mjs: missingPublicSymbol')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('bare sibling Markdown instruction references are rejected as ambiguous routes', () => {
  assert.deepEqual(extractBareMarkdownRoutes('Read `parameter-fitting.md` before continuing.'), ['parameter-fitting.md']);
  assert.deepEqual(extractBareMarkdownRoutes('Read `references/parameter-fitting.md` before continuing.'), []);
  assert.deepEqual(extractBareMarkdownRoutes('`SKILL.md` enters through `references/INDEX.md`.'), []);
});

test('semantic graph rejects a runtime capability with no instruction owner', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-semantic-owner-');
  try {
    const graphPath = path.join(installed, 'references/GRAPH.json');
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    const observation = graph.nodes.find((node) => node.id === 'observation');
    observation.owners = observation.owners.filter((owner) => owner !== 'visual-hierarchy');
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.missingCapabilityOwners.includes('visual-hierarchy'));
    assert.ok(report.errors.some((error) => error.includes('runtime capability has no instruction-graph owner: visual-hierarchy')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('semantic graph rejects unconditional relational barrier routing for construction', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-semantic-relational-');
  try {
    const graphPath = path.join(installed, 'references/GRAPH.json');
    const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
    const construction = graph.nodes.find((node) => node.id === 'construction');
    construction.requires.push('whole-system-relational-barrier');
    construction.conditionalRequires = construction.conditionalRequires.filter(
      (edge) => !edge.nodes.includes('whole-system-relational-barrier'),
    );
    await fs.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.errors.some((error) => error.includes('construction must not hard-require whole-system-relational-barrier')));
    assert.ok(report.errors.some((error) => error.includes('construction must conditionally require whole-system-relational-barrier')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('semantic graph rejects the legacy hidden-geometry suppression policy', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-semantic-hidden-policy-');
  try {
    const target = path.join(installed, 'references/organic-articulated-construction.md');
    await fs.appendFile(target, '\n## Visible obligations and hidden uncertainty\n');

    const report = await analyzeSemanticInstructionGraph({skillRoot: installed});
    assert.equal(report.status, 'FAIL');
    assert.ok(report.legacyHiddenGeometryPolicyHits.some((hit) => hit.source === 'references/organic-articulated-construction.md'));
    assert.ok(report.errors.some((error) => error.includes('legacy hidden-geometry suppression policy detected')));
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('semantic graph verifies from a bare copied installed skill with repository absent', async () => {
  const {temp, installed} = await copyInstalledSkill('refas-semantic-graph-');
  try {
    const verifier = path.join(installed, 'scripts/verify_semantic_instruction_graph.mjs');
    const result = spawnSync(process.execPath, [verifier], {cwd: temp, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'PASS');
    assert.equal(report.nodeCount, 40);
    assert.equal(report.referenceLeaves, 40);
    assert.equal(report.missingCapabilityOwners, 0);
    assert.equal(report.bareMarkdownRoutes, 0);
    assert.equal(report.legacyHiddenGeometryPolicyHits, 0);
    assert.equal(report.interfaceSchema, 'refas.instruction-node-interface/v1');
    assert.equal(report.interfaceNodes, 40);
    assert.equal(report.interfaceOperations, 119);
    assert.equal(report.runtimeCapabilitiesCovered, 11);
  } finally {
    await fs.rm(temp, {recursive: true, force: true});
  }
});

test('early neutral-clay assessment is reachable from construction without final-only prerequisites', async () => {
  const g = JSON.parse(await fs.readFile(path.resolve('skills/refas/references/GRAPH.json'),'utf8'));
  const byId = Object.fromEntries(g.nodes.map(n=>[n.id,n]));
  const ancestors=(id,seen=new Set())=>{
    for(const dep of byId[id].requires){if(!seen.has(dep)){seen.add(dep);ancestors(dep,seen);}}
    return seen;
  };
  const early=ancestors('validation');
  const neutral=ancestors('appearance');
  assert.ok(early.has('construction'));
  assert.ok(neutral.has('construction'));
  assert.ok(!early.has('appearance'),'early source assessment must not await materials');
  assert.ok(!early.has('assembly'),'early source assessment must not await assembly');
  assert.ok(!neutral.has('assembly'),'neutral-clay rendering must not await assembly closure');
  const final=ancestors('claim-certification');
  for(const id of ['construction','assembly','appearance','validation','candidate-transactions'])
    assert.ok(final.has(id),'final certification must depend on '+id);
  assert.equal(g.nodes.length,40);
  assert.equal(byId.validation.interface.interfaces.some(i=>i.id==='early-resemblance-barrier'),true);
  assert.equal(byId.validation.interface.interfaces.some(i=>i.id==='final-resemblance-closure'),true);
});

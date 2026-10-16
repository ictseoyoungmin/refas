import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('public publication requires intentional SHA approval and post-merge full QA',async()=>{
  const workflow=await fs.readFile(new URL('../.github/workflows/publish-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/^  workflow_dispatch:/mu);
  assert.match(workflow,/^  workflow_run:/mu);
  assert.ok(workflow.includes('workflows: ["RefAs CI"]'));
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
  assert.ok(workflow.includes("github.event.workflow_run.event == 'push'"));
  assert.ok(workflow.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(workflow.includes("contains(github.event.workflow_run.head_commit.message, '[publish:v1.4.1]')"));
  assert.ok(workflow.includes("subject.includes('[publish:v1.4.1]')"));
  assert.ok(workflow.includes("pkg.version !== '1.4.1'"));
  assert.ok(workflow.includes('ref: ${{ github.event_name == \'workflow_run\' && github.event.workflow_run.head_sha || inputs.release_sha }}'));
  assert.ok(workflow.includes('RELEASE_SHA: ${{ github.event_name == \'workflow_run\' && github.event.workflow_run.head_sha || inputs.release_sha }}'));
  assert.ok(!workflow.includes('[publish:v1.4.0]'));
  assert.match(workflow,/inputs\.confirmation == 'PUBLISH'/u);
  assert.match(workflow,/input[s]?\.release_sha/u);
  assert.match(workflow,/git\/ref\/heads\/main/u);
  assert.match(workflow,/release_sha is not the current main HEAD/u);
  assert.match(workflow,/head_sha===sha/u);
  assert.match(workflow,/Node 20','Node 22','Node 24/u);
  assert.match(workflow,/fullQaSteps\.every/u);
  const ci=await fs.readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.ok(ci.includes('develop/v1.4.1'), 'next patch development branch must run PR and push CI');
  assert.ok(ci.includes("github.ref == 'refs/heads/develop/v1.4.1'"), 'full QA marker must work on v1.4.1');
  const declaredSteps=new Set([...ci.matchAll(/^\s+- name: (.+)$/gmu)].map(match=>match[1]));
  const stepBlock=workflow.match(/const fullQaSteps=\[([\s\S]*?)\];/u);
  assert.ok(stepBlock,'release gate must declare explicit full QA steps');
  const required=[...stepBlock[1].matchAll(/'([^']+)'/gu)].map(match=>match[1]);
  assert.ok(required.length >= 15,'release gate must cover complete runtime/packaging checks');
  for (const step of required) assert.ok(declaredSteps.has(step),`release gate references missing CI step ${step}`);
  for (const step of ['Release audit','Independent PBR material dogfood',
    'Verify actual npm package installation','Verify saved v1.2.1 project upgrade']) {
    assert.ok(required.includes(step),`critical release check omitted: ${step}`);
  }
  assert.match(workflow,/group: refas-publish-release/u);
  assert.match(workflow,/cancel-in-progress: false/u);
  assert.doesNotMatch(workflow,/method: 'PATCH'/u);
});

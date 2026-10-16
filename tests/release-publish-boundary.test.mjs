import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('public publication requires intentional SHA approval and post-merge full QA',async()=>{
  const workflow=await fs.readFile(new URL('../.github/workflows/publish-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/^  workflow_dispatch:/mu);
  assert.match(workflow,/^  workflow_run:/mu);
  assert.match(workflow,/^\s+workflows: \["RefAs CI"\]/mu);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/u);
  assert.doesNotMatch(workflow,/\[publish:v1\.3\.0\]/u);
  assert.ok(workflow.includes("one-time CI approval is restricted to RefAs v1.4.0"));
  assert.ok(workflow.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(workflow.includes("contains(github.event.workflow_run.head_commit.message, '[publish:v1.4.0]')"));
  assert.ok(workflow.includes("subject.includes('[publish:v1.4.0]')"));
  assert.ok(workflow.includes("pkg.version !== '1.4.0'"));
  assert.ok(workflow.includes("github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || inputs.release_sha"));
  assert.match(workflow,/inputs\.confirmation == 'PUBLISH'/u);
  assert.match(workflow,/input[s]?\.release_sha/u);
  assert.match(workflow,/git\/ref\/heads\/main/u);
  assert.match(workflow,/release_sha is not the current main HEAD/u);
  assert.match(workflow,/head_sha===sha/u);
  assert.match(workflow,/Node 20','Node 22','Node 24/u);
  assert.match(workflow,/fullQaSteps\.every/u);
  const ci=await fs.readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
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

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('public publication requires intentional SHA approval and post-merge full QA',async()=>{
  const workflow=await fs.readFile(new URL('../.github/workflows/publish-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/^  workflow_dispatch:/mu);
  assert.match(workflow,/^  workflow_run:/mu);
  assert.match(workflow,/workflows: \["RefAs CI"\]/u);
  assert.match(workflow,/head_branch == 'main'/u);
  assert.match(workflow,/head_commit.message, '\[publish:v1\.3\.0\]'/u);
  assert.match(workflow,/one-time CI approval is specific to RefAs v1\.3\.0/u);
  assert.match(workflow,/CI-triggered publication requires exact v1\.3\.0 commit approval marker/u);
  assert.match(workflow,/inputs\.confirmation == 'PUBLISH'/u);
  assert.match(workflow,/input[s]?\.release_sha/u);
  assert.match(workflow,/git\/ref\/heads\/main/u);
  assert.match(workflow,/release_sha is not the current main HEAD/u);
  assert.match(workflow,/head_sha===sha/u);
  assert.match(workflow,/Node 20','Node 22','Node 24/u);
  assert.match(workflow,/Complete dogfood','Release audit/u);
  assert.match(workflow,/group: refas-publish-release/u);
  assert.match(workflow,/cancel-in-progress: false/u);
  assert.doesNotMatch(workflow,/method: 'PATCH'/u);
});

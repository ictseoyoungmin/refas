import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('public publication requires intentional SHA approval and post-merge full QA',async()=>{
  const workflow=await fs.readFile(new URL('../.github/workflows/publish-release.yml',import.meta.url),'utf8');
  assert.match(workflow,/^  workflow_dispatch:/mu);
  assert.match(workflow,/^  workflow_run:/mu);
  assert.ok(workflow.includes('workflows: ["RefAs CI"]'));
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
  // The workflow_run event is compatibility-only. It cannot authorize a job.
  assert.doesNotMatch(workflow,/\[publish:v1\.4\.1\]|RELEASE_TRIGGER|github\.event\.workflow_run\./u);
  assert.ok(workflow.includes('ref: ${{ inputs.release_sha }}'));
  assert.ok(workflow.includes('RELEASE_SHA: ${{ inputs.release_sha }}'));
  assert.ok(!workflow.includes('[publish:v1.4.0]'));
  assert.match(workflow,/inputs\.confirmation == 'PUBLISH'/u);
  assert.match(workflow,/input[s]?\.release_sha/u);
  assert.match(workflow,/git\/ref\/heads\/main/u);
  assert.match(workflow,/release_sha is not the current main HEAD/u);
  assert.match(workflow,/head_sha===sha/u);
  assert.match(workflow,/\['Node 22','Node 24'\]\.every/u);
  assert.match(workflow,/fullQaSteps\.every/u);
  const ci=await fs.readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.deepEqual(JSON.parse(ci.match(/^\s+node: (\[[^\n]+\])/mu)[1]),[22,24]);
  assert.ok(ci.includes('develop/v1.4.1'), 'next patch development branch must run PR and push CI');
  assert.ok(ci.includes("github.ref == 'refs/heads/develop/v1.4.1'"), 'full QA marker must work on v1.4.1');
  assert.ok(ci.includes("github.ref == 'refs/heads/develop/v1.4.2'"), 'full QA marker must work on v1.4.2');
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

test('legacy JIT is opt-in for development and retained in main and deep QA',async()=>{
  const ci=await fs.readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  const deep=await fs.readFile(new URL('../.github/workflows/ci-deep.yml',import.meta.url),'utf8');
  const steps=text=>text.split(/^      - /mu).slice(1);
  const step=(text,name)=>{
    const value=steps(text).find(block=>block.startsWith(`name: ${name}\n`));
    assert.ok(value,`missing step: ${name}`);
    return value;
  };
  const cases=[
    {node:24,event:'pull_request',ref:'refs/pull/1/merge',message:'[full-qa]',expected:false},
    {node:24,event:'push',ref:'refs/heads/rewrite/v2',message:'ordinary edit',expected:false},
    {node:24,event:'push',ref:'refs/heads/main',message:'merge',expected:true},
    {node:24,event:'push',ref:'refs/heads/rewrite/v2',message:'verify [full-qa]',expected:true},
    {node:24,event:'push',ref:'refs/heads/develop/v1.4.2',message:'verify [full-qa]',expected:true},
    {node:22,event:'push',ref:'refs/heads/main',message:'[full-qa]',expected:false},
  ];
  for(const name of ['Install optional Numba CPU prototype (Node 24 only)','Compiled CPU kernel tests']){
    const condition=step(ci,name).match(/^        if: (.+)$/mu)?.[1];
    assert.ok(condition,`missing condition: ${name}`);
    // These conditions use the shared JavaScript/GitHub expression subset.
    const enabled=Function('matrix','github','contains',`return (${condition});`);
    for(const value of cases){
      const github={event_name:value.event,ref:value.ref,event:{}};
      if(value.event==='push')github.event.head_commit={message:value.message};
      assert.equal(enabled({node:value.node},github,(text,part)=>text.includes(part)),value.expected,
        `${name}: ${JSON.stringify(value)}`);
    }
  }
  const install=step(deep,'Install optional Numba CPU prototype');
  const kernels=step(deep,'Compiled CPU kernel tests');
  assert.doesNotMatch(install+kernels,/^        if:/mu,'deep QA must not skip legacy JIT');
  assert.match(install,/python -m pip install --no-cache-dir numba==0\.65\.1/u);
  assert.ok(deep.indexOf(install)<deep.indexOf(kernels),'install Numba before executing kernels');
  assert.ok(kernels.includes('npm run test:cpu-jit'));
  assert.ok(kernels.includes('node --test tests/render-backend.test.mjs'));
  for(const workflow of [ci,deep]){
    assert.ok(step(workflow,'Product-boundary audit').includes('npm run check'));
    assert.doesNotMatch(workflow,/run: npm run check:instructions/u);
  }
  const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.ok(pkg.scripts.check.includes('npm run check:legacy'));
  assert.ok(pkg.scripts['check:legacy'].startsWith(pkg.scripts['check:instructions']));
});

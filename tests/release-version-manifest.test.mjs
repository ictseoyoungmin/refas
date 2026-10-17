import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {REFAS_VERSION} from '../skills/refas/scripts/lib/canonical.mjs';

test('npm, runtime, plugin manifests and release-facing docs share one version',async()=>{
  const read=async p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
  const packageJson=JSON.parse(await read('package.json'));
  assert.equal(packageJson.version,'1.4.2');
  assert.equal(packageJson.version,REFAS_VERSION);
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']){
    const plugin=JSON.parse(await read(file));
    assert.equal(plugin.version,REFAS_VERSION,file);
    assert.equal(plugin.name,'refas');
  }
  const readme=await read('README.md');
  const changelog=await read('CHANGELOG.md');
  // While 1.4.2 is under development it must not link to a nonexistent public release.
  // When publishing v1.4.2, update README, CHANGELOG and this check together.
  assert.match(readme,new RegExp('development-v'+REFAS_VERSION.replaceAll('.','\\.')));
  assert.match(readme,/releases\/tag\/v1\.4\.1/);
  assert.doesNotMatch(readme,new RegExp('releases/tag/v'+REFAS_VERSION.replaceAll('.','\\.')));
  assert.ok(changelog.includes('## '+REFAS_VERSION+' — Unreleased'));
});

test('release audit keeps public and unreleased candidate contracts separate',async()=>{
  const source=await fs.readFile(new URL('../tools/release-audit.mjs',import.meta.url),'utf8');
  assert.match(source,/changelog\.includes\(`## \$\{REFAS_VERSION\} — Unreleased`\)/u);
  assert.match(source,/readme\.includes\(`development-v\$\{REFAS_VERSION\}-`\)/u);
  assert.match(source,/README\.md falsely links unpublished/u);
  assert.match(source,/README\.md published release link omits/u);
});

test('scheduled deep QA targets existing main instead of a deleted 1.4.1 branch',async()=>{
  const deep=await fs.readFile(new URL('../.github/workflows/ci-deep.yml',import.meta.url),'utf8');
  assert.match(deep,/default: main/u);
  assert.match(deep,/github\.event\.inputs\.ref \|\| 'main'/u);
  assert.doesNotMatch(deep,/develop\/v1\.4\.1/u);
});

test('full independent release audit retains all 34 JS replay tests; CI only skips after full npm test',async()=>{
  const read=async p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
  const pkg=JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts.test,'node --test tests/*.test.mjs');
  assert.equal(pkg.scripts['release:audit'],'node tools/verify-plugin-distribution.mjs && node tools/release-audit.mjs');
  assert.equal(pkg.scripts['release:audit:ci'],'node tools/verify-plugin-distribution.mjs && node tools/release-audit.mjs --ci-pretested-js');
  const audit=await read('tools/release-audit.mjs');
  assert.match(audit,/if \(!ciPretestedJs\) run\(process\.execPath, \['--test'/u);
  assert.match(audit,/process\.env\.GITHUB_ACTIONS !== 'true'/u);
  const replay=audit.match(/run\(process\.execPath, \['--test',([\s\S]*?)\]\);/u);
  assert.ok(replay,'the full standalone release audit must retain the JS suite');
  const paths=[...replay[1].matchAll(/'tests\/([^']+\.test\.mjs)'/gu)].map(m=>m[1]);
  assert.equal(paths.length,34,'baseline replay list must remain intact');
  assert.equal(new Set(paths).size,paths.length);
  const present=new Set(await fs.readdir(new URL('../tests/',import.meta.url)));
  for(const filename of paths)assert.ok(present.has(filename),filename);
  for(const workflowPath of ['.github/workflows/ci.yml','.github/workflows/ci-deep.yml']){
    const workflow=await read(workflowPath);
    const testAt=workflow.indexOf('      - name: JavaScript regression tests');
    const auditAt=workflow.indexOf('      - name: Release audit');
    assert.ok(testAt>=0 && auditAt>testAt,workflowPath);
    assert.match(workflow.slice(testAt,auditAt),/run: npm test/u,workflowPath);
    const end=workflow.indexOf('\n      - name:',auditAt+10);
    assert.match(workflow.slice(auditAt,end<0?undefined:end),/run: npm run release:audit:ci/u,workflowPath);
  }
});

test('installed agent default describes a complete editable object and practical review',async()=>{
  const a=await fs.readFile(new URL('../skills/refas/agents/openai.yaml',import.meta.url),'utf8');
  assert.match(a,/complete, editable 3D asset/);
  assert.match(a,/multiview renders/);
});

test('release CI and npm nested packaging exclude generated Python bytecode',async()=>{
  for (const workflowPath of ['.github/workflows/ci.yml','.github/workflows/ci-deep.yml']) {
    const workflow=await fs.readFile(new URL('../'+workflowPath,import.meta.url),'utf8');
    assert.match(workflow,/PYTHONDONTWRITEBYTECODE: '1'/u,workflowPath);
  }
  for (const ignorePath of ['skills/refas/.npmignore','skills/refas/scripts/.npmignore']) {
    const ignore=await fs.readFile(new URL('../'+ignorePath,import.meta.url),'utf8');
    assert.ok(ignore.includes('__pycache__/'),ignorePath);
    assert.ok(ignore.includes('**/*.pyc'),ignorePath);
  }
});

test('installed npm package and legacy upgrade checks use the canonical runtime target',async()=>{
  for(const script of ['tools/verify-packed-install.mjs','tools/verify-v121-upgrade.mjs']){
    const source=await fs.readFile(new URL('../'+script,import.meta.url),'utf8');
    assert.ok(source.includes("import {REFAS_VERSION} from '../skills/refas/scripts/lib/canonical.mjs'"),script);
    assert.ok(source.includes('REFAS_VERSION'),script);
    assert.ok(!source.includes("'1.3.0'"),script);
  }
  const upgrade=await fs.readFile(new URL('../tools/verify-v121-upgrade.mjs',import.meta.url),'utf8');
  assert.ok(upgrade.includes("BASELINE_VERSION='1.2.1'"));
  assert.ok(upgrade.includes('target:REFAS_VERSION'));
});

test('historical v1 near-plane triangle omission stays explicit until a versioned replacement',async()=>{
  const legacy=await fs.readFile(new URL('../skills/refas/scripts/render_pbr.py',import.meta.url),'utf8');
  const limitations=await fs.readFile(new URL('../docs/known-limitations.md',import.meta.url),'utf8');
  // Characterization canary only: changing this algorithm requires new raster
  // goldens and evidence namespace, not an in-place v1 behavior change.
  assert.ok(legacy.includes('if np.any(vertices[:, 2] <= 0.01):'));
  assert.ok(legacy.includes('                continue\n            screen ='));
  assert.ok(limitations.includes('near-plane'));
  assert.ok(limitations.includes('do not clip') || limitations.includes('do not clip crossing'));
});

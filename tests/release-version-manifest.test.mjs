import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {REFAS_VERSION as LEGACY_VERSION} from '../legacy/v1/scripts/lib/canonical.mjs';

test('release package identities align while actual publication remains explicit',async()=>{
  const read=async p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
  const packageJson=JSON.parse(await read('package.json'));
  const version = packageJson.version;
  assert.equal(version,'2.1.0-alpha.1');
  assert.equal(LEGACY_VERSION,'1.4.2');
  const current = spawnSync(process.execPath, [new URL('../bin/refas.mjs', import.meta.url).pathname, '--version'], {encoding:'utf8'});
  assert.equal(current.status, 0, current.stderr);
  assert.equal(current.stdout.trim(), 'RefAs '+version);
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']){
    const plugin=JSON.parse(await read(file));
    assert.equal(plugin.version,version,file);
    assert.equal(plugin.name,'refas');
  }
  const readme=await read('README.md');
  const changelog=await read('CHANGELOG.md');
  assert.ok(readme.includes(`**Package version: ${version}.**`));
  assert.ok(readme.includes(`refas-${version}.tgz.sha256`));
  assert.match(readme,/Publication is a separate verified action/u);
  assert.match(readme,/not an assertion.*npm registry/su);
  assert.ok(changelog.includes('## '+version+' —'));
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

test('retained 1.x upgrade checks keep their own canonical runtime target',async()=>{
  const upgrade=await fs.readFile(new URL('../tools/verify-v121-upgrade.mjs',import.meta.url),'utf8');
  assert.ok(upgrade.includes("import {REFAS_VERSION} from '../legacy/v1/scripts/lib/canonical.mjs'"));
  assert.ok(upgrade.includes("BASELINE_VERSION='1.2.1'"));
  assert.ok(upgrade.includes('target:REFAS_VERSION'));
  assert.ok(upgrade.includes("path.join(OLD,'skills/refas/scripts/refas.mjs')"));
  assert.ok(upgrade.includes("path.join(ROOT,'legacy/v1/scripts/refas.mjs')"));
});

test('historical v1 near-plane triangle omission stays explicit until a versioned replacement',async()=>{
  const legacy=await fs.readFile(new URL('../legacy/v1/scripts/render_pbr.py',import.meta.url),'utf8');
  const limitations=await fs.readFile(new URL('../docs/archive/v1/known-limitations.md',import.meta.url),'utf8');
  // Characterization canary only: changing this algorithm requires new raster
  // goldens and evidence namespace, not an in-place v1 behavior change.
  assert.ok(legacy.includes('if np.any(vertices[:, 2] <= 0.01):'));
  assert.ok(legacy.includes('                continue\n            screen ='));
  assert.ok(limitations.includes('near-plane'));
  assert.ok(limitations.includes('do not clip') || limitations.includes('do not clip crossing'));
});

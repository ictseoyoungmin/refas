import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {REFAS_VERSION} from '../skills/refas/scripts/lib/canonical.mjs';

test('npm, runtime, plugin manifests and release-facing docs share one version',async()=>{
  const read=async p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
  const packageJson=JSON.parse(await read('package.json'));
  assert.equal(packageJson.version,'1.4.0');
  assert.equal(packageJson.version,REFAS_VERSION);
  for(const file of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']){
    const plugin=JSON.parse(await read(file));
    assert.equal(plugin.version,REFAS_VERSION,file);
    assert.equal(plugin.name,'refas');
  }
  const readme=await read('README.md');
  const changelog=await read('CHANGELOG.md');
  assert.match(readme,new RegExp('releases/tag/v'+REFAS_VERSION.replaceAll('.','\\.')));
  assert.ok(changelog.includes('## '+REFAS_VERSION+' —'));
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

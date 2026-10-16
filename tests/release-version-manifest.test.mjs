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

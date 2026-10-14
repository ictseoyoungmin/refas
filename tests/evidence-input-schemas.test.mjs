import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
test('adaptive evidence request schema describes installed request template and source alternatives',async()=>{
  const schema=await read('schemas/evidence-request.schema.json');
  const template=await read('skills/refas/assets/templates/evidence-request.json');
  assert.equal(template.schema,schema.properties.schema.const);
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(schema.required,['schema','subjectId','sources']);
  assert.equal(schema.properties.sources.minItems,1);
  assert.equal(schema.properties.sources.maxItems,64);
  const source=schema.properties.sources.items;
  assert.equal(source.oneOf.length,2);
  assert.ok(source.properties.sourceManifest);
  const views=source.properties.views.items;
  for(const view of template.sources[0].views){
    assert.ok(views.properties.analyses.items.enum.every(x=>typeof x==='string'));
    for(const analysis of view.analyses){
      assert.ok(views.properties.analyses.items.enum.includes(analysis));
    }
  }
});
test('utility decisions schema matches installed outcomes and explicit model impact',async()=>{
  const schema=await read('schemas/evidence-utility-decisions.schema.json');
  const template=await read('skills/refas/assets/templates/evidence-utility-decisions.json');
  assert.equal(schema.properties.schema.const,template.schema);
  const item=schema.properties.assessments.items;
  const allowed=item.properties.outcome.enum;
  assert.deepEqual(allowed,['clarified','contradicted','insufficient','no-benefit']);
  for(const entry of template.assessments){
    assert.ok(allowed.includes(entry.outcome));
    assert.ok(item.properties.retention.enum.includes(entry.retention));
    assert.ok(item.properties.modelImpact.oneOf.some(x=>x.properties.status.enum?.includes(entry.modelImpact.status) ||
      x.properties.status.const===entry.modelImpact.status));
  }
  assert.equal(item.properties.modelImpact.oneOf[1].properties.status.const,'applied');
  assert.ok(item.properties.modelImpact.oneOf[1].required.includes('before'));
  assert.ok(item.properties.modelImpact.oneOf[1].required.includes('after'));
});

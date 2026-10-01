import assert from 'node:assert/strict';
import test from 'node:test';
import {runTexturedMaterialDogfood} from '../skills/refas/scripts/verify_textured_material_dogfood.mjs';

test('portable renderer samples embedded base-color textures deterministically',async()=>{
  const result=await runTexturedMaterialDogfood();
  assert.equal(result.status,'PASS');
  assert.equal(result.deterministic,true);
  assert.equal(result.textureSampled,true);
  assert.match(result.textureSha256,/^[a-f0-9]{64}$/u);
  assert.notEqual(result.albedoSha256,result.factorOnlyAlbedoSha256);
});

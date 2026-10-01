import assert from 'node:assert/strict';
import test from 'node:test';
import {runTexturedMaterialDogfood} from '../skills/refas/scripts/verify_textured_material_dogfood.mjs';
import {createPbrRenderReport, validatePbrRenderReport} from '../skills/refas/scripts/lib/index.mjs';

test('portable renderer samples embedded base-color textures deterministically',async()=>{
  const result=await runTexturedMaterialDogfood();
  assert.equal(result.status,'PASS');
  assert.equal(result.deterministic,true);
  assert.equal(result.textureSampled,true);
  assert.match(result.textureSha256,/^[a-f0-9]{64}$/u);
  assert.notEqual(result.albedoSha256,result.factorOnlyAlbedoSha256);
});

test('texture binding digest is inside PBR report authority',()=>{
  const D=(c)=>c.repeat(64);
  const report=createPbrRenderReport({
    assetSha256:D('a'),frameDigest:D('b'),
    renderer:{family:'other',name:'fixture',version:'1',backend:'fixture',independentProcess:true},
    lighting:{rigId:'fixture-rig',digest:D('c')},
    colorPipeline:{exposure:0,toneMapping:'Reinhard',outputColorSpace:'sRGB'},
    materialSupport:{supported:['base-color-factor','base-color-texture','texcoord-0'],unsupported:['normal-maps']},
    textureBindings:[{sha256:D('d'),mimeType:'image/png',channel:'base-color'}],
    outputs:[{viewId:'hero',path:'renders/hero.png',sha256:D('e')}],
    reproducibility:{mode:'deterministic',tolerance:''},
  });
  assert.deepEqual(validatePbrRenderReport(report),{valid:true,errors:[]});
  const tampered=structuredClone(report);
  tampered.textureBindings[0].sha256=D('f');
  assert.equal(validatePbrRenderReport(tampered).valid,false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLongitudinalGuide,
  createSectionProfileLoft,
  digestBytes,
  finalizeMesh,
  generateUvCoordinates,
  inspectGlb,
  parseGlb,
  partsToGlb,
  validateUvMapping,
} from '../skills/refas/scripts/lib/index.mjs';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHUlEQVR42mP4r6DwX8Hh/38YzYDM+a+g8J+BoAoA2NAk4WrV3IEAAAAASUVORK5CYII=','base64');

function quad(){
  return finalizeMesh([[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],[0,1,2,0,2,3],{role:'uv-quad'});
}

test('UV generator provides deterministic planar and cylindrical mappings',()=>{
  const planar=generateUvCoordinates(quad(),{method:'planar',uAxis:'x',vAxis:'y'});
  assert.deepEqual(planar.uvs,[[0,0],[1,0],[1,1],[0,1]]);
  assert.deepEqual(validateUvMapping(planar),{valid:true,errors:[]});
  const cylindrical=generateUvCoordinates(quad(),{method:'cylindrical',axis:'y'});
  assert.equal(cylindrical.uvs.length,4);
  assert.ok(cylindrical.uvs.every(uv=>uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1)));
  assert.deepEqual(validateUvMapping(cylindrical),{valid:true,errors:[]});
});

test('per-section UV mapping follows loft ring/section coordinates',()=>{
  const guide=createLongitudinalGuide({id:'uv-guide',points:[{v:0,point:[0,-1,0]},{v:1,point:[0,1,0]}]});
  const loft=createSectionProfileLoft({id:'uv-loft',guide,sections:[
    {v:0,width:1,depth:1,profile:{model:'superellipse',samples:4}},
    {v:1,width:.8,depth:.7,profile:{model:'superellipse',samples:4}},
  ]});
  const mapped=generateUvCoordinates(loft,{method:'per-section'});
  assert.equal(mapped.uvMapping.parameters.ringSize,4);
  assert.equal(mapped.uvMapping.parameters.sectionCount,2);
  assert.deepEqual(mapped.uvs.slice(0,4),[[0,0],[.25,0],[.5,0],[.75,0]]);
  assert.deepEqual(mapped.uvs.slice(4,8),[[0,1],[.25,1],[.5,1],[.75,1]]);
});

test('GLB writer embeds PNG bytes, digest binding and TEXCOORD_0',()=>{
  const mesh=generateUvCoordinates(quad(),{method:'planar',uAxis:'x',vAxis:'y'});
  const digest=digestBytes(PNG);
  const glb=partsToGlb({
    assetId:'textured-quad',
    materials:{decal:{baseColor:[1,1,1,1],metallic:0,roughness:.7,baseColorTexture:{png:PNG,sha256:digest}}},
    parts:[{id:'quad',scopeId:'whole',role:'panel',materialId:'decal',mesh}],
  });
  const inspection=inspectGlb(glb);
  assert.equal(inspection.textureCount,1);
  assert.equal(inspection.texturedMaterialCount,1);
  assert.deepEqual(inspection.textureDigests,[digest]);
  const {json,binary}=parseGlb(glb);
  const primitive=json.meshes[0].primitives[0];
  assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
  const material=json.materials[0];
  const texture=json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const image=json.images[texture.source];
  const view=json.bufferViews[image.bufferView];
  const embedded=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  assert.equal(digestBytes(embedded),digest);
  assert.equal(image.mimeType,'image/png');
  assert.equal(image.extras.refasSha256,digest);
});

test('textured material requires UV coordinates and exact texture digest',()=>{
  assert.throws(()=>partsToGlb({
    materials:{decal:{baseColor:[1,1,1,1],baseColorTexture:{png:PNG}}},
    parts:[{id:'quad',scopeId:'whole',role:'panel',materialId:'decal',mesh:quad()}],
  }),/requires one TEXCOORD_0 UV per vertex/u);
  assert.throws(()=>partsToGlb({
    materials:{decal:{baseColor:[1,1,1,1],baseColorTexture:{png:PNG,sha256:'0'.repeat(64)}}},
    parts:[{id:'quad',scopeId:'whole',role:'panel',materialId:'decal',mesh:generateUvCoordinates(quad(),{method:'planar'})}],
  }),/sha256 does not match PNG bytes/u);
});

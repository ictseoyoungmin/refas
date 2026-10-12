import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
const INTAKE = path.resolve('skills/refas/scripts/source_manifest.py');

function python(args) {
  return spawnSync(PYTHON, args, {encoding:'utf8', timeout:20_000});
}

function createImage(file, format, orientation=1) {
  const script = [
    'from PIL import Image',
    'import sys',
    'im=Image.new("RGB",(3,2),(22,100,175))',
    'exif=Image.Exif()',
    'exif[274]=int(sys.argv[3])',
    'im.save(sys.argv[1],format=sys.argv[2],exif=exif)',
  ].join('\n');
  const result=python(['-c',script,file,format,String(orientation)]);
  assert.equal(result.status,0,result.stderr);
}

function intake(root, file) {
  return python([INTAKE,'--root',root,'--image',file,'--id','primary-reference','--out',path.join(root,'source.json')]);
}

for (const format of ['PNG','JPEG']) {
  test('source-manifest decodes complete canonical ' + format + ' image', t => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const file=path.join(root,'input.' + (format==='PNG'?'png':'jpg'));
    createImage(file,format);
    const result=intake(root,file);
    assert.equal(result.status,0,result.stderr);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'source.json'),'utf8'));
    assert.equal(manifest.width,3);
    assert.equal(manifest.height,2);
    assert.equal(manifest.sizeBytes,fs.statSync(file).size);
    assert.match(manifest.sha256,/^[a-f0-9]{64}$/u);
    assert.deepEqual(manifest.acquisition,{});
  });

  test('source-manifest refuses EXIF-rotated ' + format + ' before accepting coordinates', t => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const file=path.join(root,'rotated.' + (format==='PNG'?'png':'jpg'));
    createImage(file,format,6);
    const result=intake(root,file);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/EXIF orientation 6 is not canonical/u);
    assert.equal(fs.existsSync(path.join(root,'source.json')),false);
  });
}

test('source-manifest refuses truncated decoder payload even when image header is intact',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'truncated.jpg');
  createImage(file,'JPEG');
  const bytes=fs.readFileSync(file);
  fs.writeFileSync(file,bytes.subarray(0,Math.max(40,Math.floor(bytes.length*.6))));
  const result=intake(root,file);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/cannot be decoded completely/u);
  assert.equal(fs.existsSync(path.join(root,'source.json')),false);
});

test('source-manifest refuses animated multi-frame source',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'animated.gif');
  const script=[
    'from PIL import Image',
    'import sys',
    'a=Image.new("RGB",(3,2),(255,0,0))',
    'b=Image.new("RGB",(3,2),(0,0,255))',
    'a.save(sys.argv[1],save_all=True,append_images=[b],duration=100,loop=0)',
  ].join('\n');
  const made=python(['-c',script,file]);
  assert.equal(made.status,0,made.stderr);
  const result=intake(root,file);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/single still image/u);
});

test('source-manifest cannot overwrite its own original source',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'source.png');
  createImage(file,'PNG');
  const original=fs.readFileSync(file);
  const result=python([INTAKE,'--root',root,'--image',file,'--id','primary-reference','--out',file]);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/must not overwrite the primary source image/u);
  assert.deepEqual(fs.readFileSync(file),original);
});

test('plain PNG without EXIF is structurally verified before any metadata read',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'refas-image-intake-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'plain.png');
  const result=python(['-c',
    'from PIL import Image\nimport sys\nImage.new("RGBA",(3,2),(10,20,30,255)).save(sys.argv[1])', file]);
  assert.equal(result.status,0,result.stderr);
  const intakeResult=intake(root,file);
  assert.equal(intakeResult.status,0,intakeResult.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'source.json'),'utf8')).width,3);
});

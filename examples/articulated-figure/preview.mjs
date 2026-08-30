#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGlb} from '../../skills/refas/scripts/lib/glb.mjs';
import {buildArticulatedFigure} from './model.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY = path.resolve(ROOT, '../..');
const OUTPUT = path.join(ROOT, 'output');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';

await fs.mkdir(path.join(OUTPUT, 'assets'), {recursive: true});
const reference = buildArticulatedFigure('reference');
const neutral = buildArticulatedFigure('neutral');
assert.equal(parseGlb(reference.glb).binary.equals(parseGlb(neutral.glb).binary), true, 'pose variants must preserve part-local mesh bytes');
const referencePath = path.join(OUTPUT, 'assets', 'articulated-figure.glb');
const neutralPath = path.join(OUTPUT, 'assets', 'articulated-figure-neutral.glb');
await fs.writeFile(referencePath, reference.glb);
await fs.writeFile(neutralPath, neutral.glb);
const framePath = path.join(OUTPUT, 'canonical-frame.json');
await fs.writeFile(framePath, `${JSON.stringify({
  schema:'refas.canonical-object-frame/v1', id:'articulated-figure-frame', scopeId:'whole', origin:[0,0,0],
  axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}, scopeParts:[],
  hero:{position:[1.15,2.35,14.6],target:[0,2.35,0],up:[0,1,0],fovY:31,registrationDigest:'a'.repeat(64)},
}, null, 2)}\n`);
const neutralFramePath = path.join(OUTPUT, 'neutral-frame.json');
await fs.writeFile(neutralFramePath, `${JSON.stringify({
  schema:'refas.canonical-object-frame/v1', id:'articulated-figure-neutral-frame', scopeId:'whole', origin:[0,0,0],
  axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}, scopeParts:[],
  hero:{position:[0,-.45,19.2],target:[0,-.45,0],up:[0,1,0],fovY:34,registrationDigest:'b'.repeat(64)},
}, null, 2)}\n`);

function render(glb, out, frame, pbr = false) {
  const script = pbr ? 'render_pbr.py' : 'render_glb.py';
  const result = spawnSync(PYTHON, [path.join(REPOSITORY,'skills/refas/scripts',script),'--glb',glb,'--out',out,'--frame',frame,'--size','480','--timeout-seconds','150','--max-working-mb','1024'], {encoding:'utf8',timeout:165_000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${script} failed`);
  process.stdout.write(result.stdout);
}
render(referencePath, path.join(OUTPUT,'renders','reference'), framePath);
render(referencePath, path.join(OUTPUT,'renders','pbr'), framePath, true);
render(neutralPath, path.join(OUTPUT,'renders','neutral'), neutralFramePath);
console.log(JSON.stringify({parts:reference.parts.length,localMeshInvariant:true},null,2));

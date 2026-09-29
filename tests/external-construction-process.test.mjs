import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {
  attestExternalConstruction,
  createConstructionOperationPermit,
  createConstructionVocabulary,
  createExternalConstructionReceipt,
  digestBytes,
  inspectGlb,
  validateConstructionExecutionProof,
} from '../skills/refas/scripts/lib/index.mjs';

const TOOL_SOURCE = String.raw`import fs from 'node:fs';
const source = fs.readFileSync(process.argv[2]);
const guide = fs.readFileSync(process.argv[3]);
const output = process.argv[4];
const scale = 0.8 + (source.length % 7) * 0.01;
const depth = 0.3 + (guide.length % 5) * 0.01;
const p = new Float32Array([
  -scale,-0.5,-depth, scale,-0.5,-depth, scale,0.5,-depth, -scale,0.5,-depth,
  -scale,-0.5, depth, scale,-0.5, depth, scale,0.5, depth, -scale,0.5, depth,
]);
const i = new Uint16Array([
  0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,
  3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5,
]);
const align4 = n => (n + 3) & ~3;
const pb = Buffer.from(p.buffer), ib = Buffer.from(i.buffer);
const io = align4(pb.length), bin = Buffer.alloc(align4(io + ib.length));
pb.copy(bin,0); ib.copy(bin,io);
const json = {
  asset:{version:'2.0',generator:'refas-external-process-fixture'},
  buffers:[{byteLength:bin.length}],
  bufferViews:[
    {buffer:0,byteOffset:0,byteLength:pb.length},
    {buffer:0,byteOffset:io,byteLength:ib.length},
  ],
  accessors:[
    {bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-scale,-0.5,-depth],max:[scale,0.5,depth]},
    {bufferView:1,componentType:5123,count:i.length,type:'SCALAR'},
  ],
  meshes:[{name:'external-body',primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
  nodes:[{name:'external-body',mesh:0,extras:{refasPartId:'external-body',scopeId:'whole'}}],
  scenes:[{nodes:[0]}],scene:0,
};
const jb = Buffer.from(JSON.stringify(json)), jl=align4(jb.length), bl=align4(bin.length);
const out=Buffer.alloc(12+8+jl+8+bl);
out.writeUInt32LE(0x46546c67,0); out.writeUInt32LE(2,4); out.writeUInt32LE(out.length,8);
out.writeUInt32LE(jl,12); out.writeUInt32LE(0x4e4f534a,16); jb.copy(out,20); out.fill(0x20,20+jb.length,20+jl);
const bo=20+jl; out.writeUInt32LE(bl,bo); out.writeUInt32LE(0x004e4942,bo+4); bin.copy(out,bo+8);
fs.writeFileSync(output,out);
`;

test('external construction attests a real isolated process reexecution', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-external-process-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const sourceBytes = Buffer.from('independent source image bytes for external process fixture');
  const guideBytes = Buffer.from('source-derived guide bytes');
  const scriptBytes = Buffer.from(TOOL_SOURCE);
  const sourcePath = path.join(root, 'source.bin');
  const guidePath = path.join(root, 'guide.bin');
  const toolPath = path.join(root, 'external-tool.mjs');
  const firstPath = path.join(root, 'first.glb');
  const replayPath = path.join(root, 'replay.glb');
  await Promise.all([
    fs.writeFile(sourcePath, sourceBytes),
    fs.writeFile(guidePath, guideBytes),
    fs.writeFile(toolPath, scriptBytes),
  ]);

  for (const output of [firstPath, replayPath]) {
    const run = spawnSync(process.execPath, [toolPath, sourcePath, guidePath, output], {
      cwd: root,
      encoding: 'utf8',
      env: {PATH: process.env.PATH ?? ''},
      timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  }
  const [first, replay] = await Promise.all([fs.readFile(firstPath), fs.readFile(replayPath)]);
  assert.equal(digestBytes(first), digestBytes(replay));
  assert.equal(inspectGlb(first).meshCount, 1);

  const sourceSha256 = digestBytes(sourceBytes);
  const decision = createConstructionVocabulary({
    scopeId: 'whole',
    sourceSha256,
    vocabulary: 'hard-surface',
    cues: [{
      id: 'rigid-body-cue',
      description: 'The primary source supports a rigid controlled-volume reconstruction.',
      evidenceRefs: ['source/reference.bin'],
    }],
    evidenceRefs: ['source/reference.bin'],
  });
  const permit = createConstructionOperationPermit({
    decision,
    scopeId: 'whole',
    operation: 'external-construction',
  });
  const receipt = createExternalConstructionReceipt({
    decision,
    permit,
    tool: {id: 'node-headless-fixture', version: process.version},
    scriptSha256: digestBytes(scriptBytes),
    inputs: [
      {id: 'primary-source', kind: 'source', authority: 'observed', sha256: sourceSha256},
      {id: 'shape-guide', kind: 'guide', authority: 'inferred', sha256: digestBytes(guideBytes)},
    ],
    determinism: {mode: 'byte-exact'},
    outputGlbSha256: digestBytes(first),
    evidenceRefs: ['reviews/external-process.json'],
  });
  const attested = attestExternalConstruction({
    decision,
    permit,
    receipt,
    scriptBytes,
    inputBytes: {'primary-source': sourceBytes, 'shape-guide': guideBytes},
    outputBytes: first,
    reexecutedBytes: replay,
    partId: 'external-body',
    evidenceRefs: ['reviews/external-process.json'],
  });

  const result = validateConstructionExecutionProof(attested.proof, decision, [permit], {
    assetSha256: digestBytes(attested.assetBytes),
  });
  assert.deepEqual(result, {valid: true, errors: []});
  const inspection = inspectGlb(attested.assetBytes);
  assert.equal(inspection.meshCount, 1);
  assert.equal(inspection.extras.refas.constructionExecutions.length, 1);
  assert.equal(inspection.extras.refas.constructionExecutions[0].externalReceiptDigest, receipt.receiptDigest);
});

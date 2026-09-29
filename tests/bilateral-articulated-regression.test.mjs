import assert from 'node:assert/strict';
import test from 'node:test';

import {parseGlb} from '../skills/refas/scripts/lib/index.mjs';
import {buildArticulatedFigure} from '../examples/articulated-figure/model.mjs';

test('articulated figure model path remains local-mesh invariant after bilateral authority addition',()=>{
  const reference=buildArticulatedFigure('reference');
  const neutral=buildArticulatedFigure('neutral');
  const referenceParsed=parseGlb(reference.glb);
  const neutralParsed=parseGlb(neutral.glb);
  assert.equal(referenceParsed.binary.equals(neutralParsed.binary),true);
  assert.equal(reference.parts.length,neutral.parts.length);
  assert.ok(reference.parts.length>0);
  assert.equal(referenceParsed.json.extras.poseName,'reference');
  assert.equal(neutralParsed.json.extras.poseName,'neutral');
  assert.equal(referenceParsed.json.extras.localMeshInvariant,true);
  assert.equal(neutralParsed.json.extras.localMeshInvariant,true);
});

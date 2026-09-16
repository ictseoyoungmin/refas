import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  digestJson,
  validatePhysicalAssetBundle,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE = 'c'.repeat(64);

function graphFixture() {
  return createPhysicalIdentityGraph({
    scopeId: 'whole',
    sourceSha256: SOURCE,
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {
        id: 'module-child',
        kind: 'assembly-module',
        frame: {
          parentId: 'module-root',
          translation_m: [0.25, 0, 0],
          rotation_quat_xyzw: [0, 0, 0, 1],
        },
      },
    ],
    relations: [
      {id: 'contains-child', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['module-child']},
    ],
  });
}

function resignClosure(closure) {
  const payload = {...closure};
  delete payload.closureDigest;
  closure.closureDigest = digestJson(payload);
}

function resignBundle(bundle) {
  const payload = {...bundle};
  delete payload.bundleDigest;
  bundle.bundleDigest = digestJson(payload);
}

test('P10 intrinsic validation rejects a fully re-signed noncanonical child placement quaternion', () => {
  const bundle = createPhysicalAssetBundle({
    bundleId: 'quaternion-bundle',
    identityGraph: graphFixture(),
    rootModuleId: 'module-root',
    components: [],
  });
  assert.deepEqual(validatePhysicalAssetBundle(bundle), {valid: true, errors: []});

  const tampered = structuredClone(bundle);
  const rootClosure = tampered.moduleClosures.find((item) => item.moduleId === 'module-root');
  rootClosure.childModules[0].placementFrame.rotation_quat_xyzw = [0, 0, 0, -1];
  resignClosure(rootClosure);
  tampered.rootClosureDigest = rootClosure.closureDigest;
  resignBundle(tampered);

  const validation = validatePhysicalAssetBundle(tampered);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /closureDigest does not reproduce|not canonical/);
});

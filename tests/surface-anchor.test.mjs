import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createAttachmentSemantics,
  createSurfaceAnchorSet,
  rebindSurfaceAnchorSet,
  validateSurfaceAnchorRebind,
  validateSurfaceAnchorSet,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (value = 'a') => value.repeat(64);
const E = (id) => ({id, scopeId: id, evidenceRefs: [`model/${id}.json`]});
const R = (id, mode, subjectId, ownerIds = []) => ({id, mode, subjectId, ownerIds, basis: 'construction', evidenceRefs: [`model/attachments/${id}.json`]});

function semantics() {
  return createAttachmentSemantics({
    scopeId: 'head',
    sourceSha256: D('a'),
    entities: [E('head-shell'), E('nose'), E('left-ear'), E('right-ear'), E('glasses')],
    relations: [
      R('head-free', 'FREE', 'head-shell'),
      R('nose-fused', 'FUSED', 'nose', ['head-shell']),
      R('left-ear-fused', 'FUSED', 'left-ear', ['head-shell']),
      R('right-ear-fused', 'FUSED', 'right-ear', ['head-shell']),
      R('glasses-fit', 'MULTI_ANCHOR', 'glasses', ['nose', 'left-ear', 'right-ear']),
    ],
  });
}

function initialSurfaces() {
  return [
    {
      ownerId: 'nose', geometryDigest: D('b'),
      vertices: [[-1, -1, .5], [1, -1, .5], [0, 1, .5]],
      triangles: [{id: 'nose-old', patchId: 'nose-bridge', indices: [0, 1, 2]}],
    },
    {
      ownerId: 'left-ear', geometryDigest: D('c'),
      vertices: [[-2, -1, .2], [-1, -1, .2], [-1.5, 1, .2]],
      triangles: [{id: 'left-ear-tri', patchId: 'left-ear-contact', indices: [0, 1, 2]}],
    },
    {
      ownerId: 'right-ear', geometryDigest: D('d'),
      vertices: [[1, -1, .2], [2, -1, .2], [1.5, 1, .2]],
      triangles: [{id: 'right-ear-tri', patchId: 'right-ear-contact', indices: [0, 1, 2]}],
    },
  ];
}

function anchorSpecs() {
  return [
    {
      id: 'glasses-bridge-anchor', relationId: 'glasses-fit', subjectAnchorId: 'bridge', ownerId: 'nose',
      patchId: 'nose-bridge', triangleId: 'nose-old', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0],
      offset: .05, maxRebindDistance: .3, maxNormalDeviationRadians: .5, evidenceRefs: ['model/nose-anchor.json'],
    },
    {
      id: 'glasses-left-anchor', relationId: 'glasses-fit', subjectAnchorId: 'left-temple', ownerId: 'left-ear',
      patchId: 'left-ear-contact', triangleId: 'left-ear-tri', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0],
      offset: .03, maxRebindDistance: .2, maxNormalDeviationRadians: .5, evidenceRefs: ['model/left-ear-anchor.json'],
    },
    {
      id: 'glasses-right-anchor', relationId: 'glasses-fit', subjectAnchorId: 'right-temple', ownerId: 'right-ear',
      patchId: 'right-ear-contact', triangleId: 'right-ear-tri', barycentric: [.25, .25, .5], tangentHint: [1, 0, 0],
      offset: .03, maxRebindDistance: .2, maxNormalDeviationRadians: .5, evidenceRefs: ['model/right-ear-anchor.json'],
    },
  ];
}

function loweredRetessellatedSurfaces() {
  const [nose, leftEar, rightEar] = initialSurfaces();
  return [
    {
      ownerId: 'nose', geometryDigest: D('e'),
      vertices: [[-1, -1, .35], [1, -1, .35], [1, 1, .35], [-1, 1, .35]],
      triangles: [
        {id: 'nose-new-a', patchId: 'nose-bridge', indices: [0, 1, 2]},
        {id: 'nose-new-b', patchId: 'nose-bridge', indices: [0, 2, 3]},
      ],
    },
    leftEar,
    rightEar,
  ];
}

test('surface anchors are owner-local barycentric frames with normal, tangent, and offset', () => {
  const attachmentSemantics = semantics();
  const surfaces = initialSurfaces();
  const anchors = createSurfaceAnchorSet({attachmentSemantics, surfaces, anchors: anchorSpecs(), evidenceRefs: ['source/head.png']});
  assert.equal(validateSurfaceAnchorSet(anchors, attachmentSemantics, surfaces).valid, true);
  const bridge = anchors.anchors.find((anchor) => anchor.id === 'glasses-bridge-anchor');
  assert.deepEqual(bridge.frame.position, [0, 0, .5]);
  assert.deepEqual(bridge.frame.normal, [0, 0, 1]);
  assert.deepEqual(bridge.frame.tangent, [1, 0, 0]);
  assert.deepEqual(bridge.frame.offsetPosition, [0, 0, .55]);
  assert.equal(anchors.policy.worldCoordinatesAreNotCanonicalAnchors, true);
});

test('lowering and retessellating the nose rebinds the glasses bridge inside the same semantic patch', () => {
  const attachmentSemantics = semantics();
  const previousSurfaces = initialSurfaces();
  const previous = createSurfaceAnchorSet({attachmentSemantics, surfaces: previousSurfaces, anchors: anchorSpecs()});
  const currentSurfaces = loweredRetessellatedSurfaces();
  const rebound = rebindSurfaceAnchorSet({anchorSet: previous, attachmentSemantics, previousSurfaces, currentSurfaces, evidenceRefs: ['reviews/nose-lowered.json']});
  const bridge = rebound.anchorSet.anchors.find((anchor) => anchor.id === 'glasses-bridge-anchor');
  assert.equal(bridge.patchId, 'nose-bridge');
  assert.ok(['nose-new-a', 'nose-new-b'].includes(bridge.triangleId));
  assert.ok(Math.abs(bridge.frame.position[2] - .35) < 1e-9);
  assert.ok(Math.abs(bridge.frame.offsetPosition[2] - .4) < 1e-9);
  const bridgeEntry = rebound.report.entries.find((entry) => entry.anchorId === 'glasses-bridge-anchor');
  assert.equal(bridgeEntry.status, 'REBOUND');
  assert.ok(Math.abs(bridgeEntry.rebindDistance - .15) < 1e-9);
  assert.equal(rebound.report.entries.find((entry) => entry.anchorId === 'glasses-left-anchor').status, 'UNCHANGED');
  assert.equal(validateSurfaceAnchorRebind(rebound.report, {previousAnchorSet: previous, nextAnchorSet: rebound.anchorSet, attachmentSemantics, previousSurfaces, currentSurfaces}).valid, true);
});

test('world-coordinate-only anchors are rejected before they become canonical attachment state', () => {
  const bad = anchorSpecs()[0];
  bad.worldPosition = [0, 0, .5];
  assert.throws(() => createSurfaceAnchorSet({attachmentSemantics: semantics(), surfaces: initialSurfaces(), anchors: [bad]}), /world-coordinate-only locator/);
});

test('rebind fails closed when the semantic patch disappears or moves beyond its anchor-local bound', () => {
  const attachmentSemantics = semantics();
  const previousSurfaces = initialSurfaces();
  const previous = createSurfaceAnchorSet({attachmentSemantics, surfaces: previousSurfaces, anchors: anchorSpecs()});
  const missingPatch = loweredRetessellatedSurfaces();
  missingPatch[0].triangles = missingPatch[0].triangles.map((triangle) => ({...triangle, patchId: 'different-patch'}));
  assert.throws(() => rebindSurfaceAnchorSet({anchorSet: previous, attachmentSemantics, previousSurfaces, currentSurfaces: missingPatch}), /semantic patch nose-bridge is missing/);

  const far = loweredRetessellatedSurfaces();
  far[0].vertices = far[0].vertices.map(([x, y]) => [x, y, -.5]);
  assert.throws(() => rebindSurfaceAnchorSet({anchorSet: previous, attachmentSemantics, previousSurfaces, currentSurfaces: far}), /exceeds maxRebindDistance/);
});

test('surface anchor frames and rebind reports are digest-bound and tamper detectable', () => {
  const attachmentSemantics = semantics();
  const previousSurfaces = initialSurfaces();
  const previous = createSurfaceAnchorSet({attachmentSemantics, surfaces: previousSurfaces, anchors: anchorSpecs()});
  const tampered = structuredClone(previous);
  tampered.anchors[0].frame.position[2] = 99;
  assert.equal(validateSurfaceAnchorSet(tampered, attachmentSemantics, previousSurfaces).valid, false);

  const currentSurfaces = loweredRetessellatedSurfaces();
  const rebound = rebindSurfaceAnchorSet({anchorSet: previous, attachmentSemantics, previousSurfaces, currentSurfaces});
  const badReport = structuredClone(rebound.report);
  badReport.entries[0].rebindDistance = 999;
  assert.equal(validateSurfaceAnchorRebind(badReport, {previousAnchorSet: previous, nextAnchorSet: rebound.anchorSet, attachmentSemantics, previousSurfaces, currentSurfaces}).valid, false);
});

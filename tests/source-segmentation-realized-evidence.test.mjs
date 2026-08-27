import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createRealizedProjection,
  createReferenceGeometry,
  createSegmentPrism,
  findingsFromRealizedProjection,
  partsToGlb,
  validateRealizedProjection,
  validateReferenceGeometry,
  verifyRealizedProjection,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (char) => char.repeat(64);
const materials = {wood: {baseColor:[0.75,0.6,0.4,1], metallic:0, roughness:0.7}};
const partMesh = () => createSegmentPrism({start:[-.4,0,0], end:[.4,0,0], width:.8, height:.8, upHint:[0,1,0]});
const camera = {projection:'orthographic', position:[0,0,5], target:[0,0,0], up:[0,1,0], orthoHeight:4, aspect:1};

function asset() {
  return partsToGlb({parts:[
    {id:'upper-shell', scopeId:'whole.upper', materialId:'wood', mesh:partMesh(), translation:[-.4,0,0]},
    {id:'lower-shell', scopeId:'whole.lower', materialId:'wood', mesh:partMesh(), translation:[.4,0,0]},
  ], materials});
}
function geometry() {
  return createReferenceGeometry({
    scopeId:'whole', sourceSha256:D('a'),
    anchors:[
      {id:'upper-center', importance:'macro', evidenceRefs:['source.png'], xy:[.4,.5], visibility:'visible', confidence:1, semanticRole:'upper shell center'},
      {id:'lower-center', importance:'macro', evidenceRefs:['source.png'], xy:[.6,.5], visibility:'visible', confidence:1, semanticRole:'lower shell center'},
    ],
    segments:[
      {id:'upper-body-segment', label:'upper shell', importance:'macro', evidenceRefs:['source.png'], polygon:[[.3,.4],[.5,.4],[.5,.6],[.3,.6]], anchorIds:['upper-center'], visibility:'visible', separation:'explicit'},
      {id:'lower-body-segment', label:'lower shell', importance:'macro', evidenceRefs:['source.png'], polygon:[[.5,.4],[.7,.4],[.7,.6],[.5,.6]], anchorIds:['lower-center'], visibility:'visible', separation:'explicit'},
    ],
    interfaces:[
      {id:'body-interface', importance:'macro', evidenceRefs:['source.png'], subjectSegmentId:'upper-body-segment', objectSegmentId:'lower-body-segment', kind:'joint-boundary', separation:'explicit', boundary:[[.5,.4],[.5,.6]], visibility:'visible'},
    ],
    attestation:{attested:true,evidenceRefs:['source.png']},
  });
}
const anchorBindings = [
  {referenceId:'upper-center', nodeId:'upper-shell', localPoint:[0,0,0]},
  {referenceId:'lower-center', nodeId:'lower-shell', localPoint:[0,0,0]},
];

test('source-visible segments remain observation evidence before physical assembly', () => {
  const legacy = createReferenceGeometry({scopeId:'whole', sourceSha256:D('a'), anchors:[{id:'center-anchor',importance:'macro',evidenceRefs:['source.png'],xy:[.5,.5],visibility:'visible',confidence:1}], attestation:{attested:true,evidenceRefs:['source.png']}});
  assert.equal('segments' in legacy, false, 'legacy reference geometry must keep its original payload shape');
  const ref = geometry();
  assert.equal(ref.segments.length, 2);
  assert.equal(ref.interfaces[0].separation, 'explicit');
  assert.equal(ref.policy.observedSegmentationPrecedesPhysicalAssembly, true);
  assert.deepEqual(validateReferenceGeometry(ref), {valid:true, errors:[]});
  assert.throws(() => createReferenceGeometry({...ref, segments:[{...ref.segments[0], depthBand:[0,1]}], geometryDigest:undefined}), /must not contain 3D coordinates/);
});

test('realized segmentation is derived from actual GLB mesh ownership and projection', () => {
  const ref = geometry(), glb = asset();
  const proof = createRealizedProjection({
    referenceGeometry:ref, glb, cameraHypothesisId:'camera-a', camera, anchorBindings,
    segmentBindings:[
      {referenceId:'upper-body-segment', nodeIds:['upper-shell']},
      {referenceId:'lower-body-segment', nodeIds:['lower-shell']},
    ], evidenceRefs:['asset.glb'],
  });
  assert.equal(validateRealizedProjection(proof).valid, true);
  assert.equal(verifyRealizedProjection({proof, referenceGeometry:ref, glb}).valid, true);
  assert.equal(proof.derivedSegments.length, 2);
  assert.ok(proof.segmentationMetrics.materialSegmentMeanIoU > .9);
  assert.ok(proof.segmentationMetrics.interfaceBoundaryMeanErrorNormalized < .01);
  assert.equal(proof.segmentationMetrics.explicitOwnershipViolations, 0);
  assert.deepEqual(findingsFromRealizedProjection(proof), []);
});

test('collapsing explicit source parts into one realized mesh becomes blocking evidence', () => {
  const ref = geometry(), glb = asset();
  const proof = createRealizedProjection({
    referenceGeometry:ref, glb, cameraHypothesisId:'camera-a', camera, anchorBindings,
    segmentBindings:[
      {referenceId:'upper-body-segment', nodeIds:['upper-shell']},
      {referenceId:'lower-body-segment', nodeIds:['upper-shell']},
    ], evidenceRefs:['asset.glb'],
  });
  assert.ok(proof.segmentationMetrics.materialSegmentMeanIoU < .68);
  assert.equal(proof.segmentationMetrics.explicitOwnershipViolations, 1);
  const findings = findingsFromRealizedProjection(proof);
  assert.ok(findings.some((finding) => finding.category === 'silhouette-mismatch' && finding.ownerCapability === 'shape-reconstruction'));
  assert.ok(findings.some((finding) => finding.category === 'attachment-mismatch' && finding.ownerCapability === 'assembly'));
  assert.ok(findings.every((finding) => finding.blocking));
});

test('material source segments cannot disappear from realized projection bindings', () => {
  assert.throws(() => createRealizedProjection({referenceGeometry:geometry(), glb:asset(), cameraHypothesisId:'camera-a', camera, anchorBindings, segmentBindings:[{referenceId:'upper-body-segment', nodeIds:['upper-shell']}]}), /missing material source segments/);
});

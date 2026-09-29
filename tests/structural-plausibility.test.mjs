import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeStructuralPlausibility,
  createAttachmentSemantics,
  partsToGlb,
  validateAttachmentSemantics,
  validateStructuralPlausibility,
} from '../skills/refas/scripts/lib/index.mjs';
import {CORVID_ROOT_SUPPORT_EVIDENCE,boxMesh} from './fixtures/root-support-corvid-fixture.mjs';
import {buildArticulatedFigure} from '../examples/articulated-figure/model.mjs';

const D=(c='a')=>c.repeat(64);
const E=(id)=>({id,scopeId:id,evidenceRefs:[`model/${id}.json`]});
const FREE=(id)=>({id:`${id}-free`,mode:'FREE',subjectId:id,ownerIds:[],basis:'construction',evidenceRefs:[`model/${id}.json`]});
const material={solid:{baseColor:[.6,.6,.6,1],metallic:0,roughness:.7}};

function rootSemantics(){
  return createAttachmentSemantics({
    scopeId:'corvid-root',
    sourceSha256:D('a'),
    entities:[E('torso'),E('leg')],
    relations:[
      FREE('torso'),
      {
        id:'leg-root',mode:'RIGID_FOLLOW',subjectId:'leg',ownerIds:['torso'],basis:'construction',
        evidenceRefs:['model/leg-root.json'],
        rootAnchor:{
          kind:'embedded-root',
          subjectLocalPoint:[0,0,0],
          tolerance:.005,
          evidenceRefs:['source/rear.png','source/top.png'],
        },
      },
    ],
    evidenceRefs:['source/reference.png'],
  });
}
function rootCandidate(z){
  return partsToGlb({
    assetId:'corvid-root-fixture',
    materials:material,
    parts:[
      {id:'torso',scopeId:'torso',materialId:'solid',mesh:boxMesh(-.139,.301,-.15,.15,-CORVID_ROOT_SUPPORT_EVIDENCE.torsoHalfWidthAtHip,CORVID_ROOT_SUPPORT_EVIDENCE.torsoHalfWidthAtHip)},
      // The small hub reaches the torso side wall even when its centre is outside.
      {id:'leg',scopeId:'leg',materialId:'solid',mesh:boxMesh(-.03,.03,-.03,.03,-.03,.03),translation:[-.075,0,z]},
    ],
  });
}

test('corvid root outside parent volume is an attachment mismatch even when hub surface reaches the torso',()=>{
  const semantics=rootSemantics();
  assert.deepEqual(validateAttachmentSemantics(semantics),{valid:true,errors:[]});
  const glb=rootCandidate(CORVID_ROOT_SUPPORT_EVIDENCE.hipHalfSpan);
  const result=analyzeStructuralPlausibility({
    attachmentSemantics:semantics,glb,evidenceRefs:['reviews/corvid-root.json'],
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.rootChecks.length,1);
  assert.equal(result.rootChecks[0].insideOwnerVolume,false);
  assert.ok(result.rootChecks[0].minimumSurfaceDistance>.0275);
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].type,'attachment-mismatch');
  assert.equal(result.findings[0].owner,'assembly');
  assert.deepEqual(validateStructuralPlausibility(result,{attachmentSemantics:semantics,glb}),{valid:true,errors:[]});
});

test('embedded root inside the realized parent volume is admitted',()=>{
  const semantics=rootSemantics(),glb=rootCandidate(.07);
  const result=analyzeStructuralPlausibility({attachmentSemantics:semantics,glb});
  assert.equal(result.status,'PASS');
  assert.equal(result.rootChecks[0].insideOwnerVolume,true);
  assert.equal(result.rootChecks[0].status,'PASS');
  assert.deepEqual(result.findings,[]);
});

function groundedSemantics({minimumMargin=.05,mode='grounded'}={}){
  return createAttachmentSemantics({
    scopeId:'standing-fixture',sourceSha256:D('b'),
    entities:[E('body'),E('left-foot'),E('right-foot')],
    relations:[FREE('body'),FREE('left-foot'),FREE('right-foot')],
    groundSupport:{
      mode,groundAxis:'y',groundCoordinate:0,
      contactEntityIds:mode==='grounded'?['left-foot','right-foot']:[],
      contactTolerance:1e-6,minimumMargin,
      sourceObservation:mode==='grounded'
        ?'The source shows a standing subject with two planted feet.'
        :'The source shows the subject airborne and externally supported.',
      evidenceRefs:['source/grounding.png'],
    },
    evidenceRefs:['source/reference.png'],
  });
}
function standingCandidate(bodyX=0){
  return partsToGlb({
    assetId:'standing-support-fixture',materials:material,
    parts:[
      {id:'left-foot',scopeId:'left-foot',materialId:'solid',mesh:boxMesh(-.9,-.2,0,.2,-.45,.45)},
      {id:'right-foot',scopeId:'right-foot',materialId:'solid',mesh:boxMesh(.2,.9,0,.2,-.45,.45)},
      {id:'body',scopeId:'body',materialId:'solid',mesh:boxMesh(-.45,.45,.2,2.2,-.35,.35),translation:[bodyX,0,0]},
    ],
  });
}

test('grounded support computes realized volume COM and admits it inside the contact hull',()=>{
  const semantics=groundedSemantics(),glb=standingCandidate(0);
  const result=analyzeStructuralPlausibility({attachmentSemantics:semantics,glb,evidenceRefs:['reviews/support.json']});
  assert.equal(result.status,'PASS');
  assert.equal(result.groundSupport.status,'PASS');
  assert.equal(result.groundSupport.insideSupportPolygon,true);
  assert.ok(result.groundSupport.margin>=.05);
  assert.equal(result.groundSupport.supportPolygon.length,4);
  assert.deepEqual(validateStructuralPlausibility(result,{attachmentSemantics:semantics,glb}),{valid:true,errors:[]});
});

test('grounded support blocks an off-balance realized COM outside the declared contact hull',()=>{
  const semantics=groundedSemantics(),glb=standingCandidate(2.5);
  const result=analyzeStructuralPlausibility({attachmentSemantics:semantics,glb,evidenceRefs:['reviews/off-balance.json']});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.groundSupport.status,'BLOCKED');
  assert.equal(result.groundSupport.insideSupportPolygon,false);
  assert.equal(result.findings.some((finding)=>finding.type==='whole-system-relation-mismatch'),true);
});

test('source-supported exempt pose is explicit and does not fabricate grounded support PASS',()=>{
  const semantics=groundedSemantics({mode:'source-supported-exempt'}),glb=standingCandidate(3);
  const result=analyzeStructuralPlausibility({attachmentSemantics:semantics,glb});
  assert.equal(result.status,'PASS');
  assert.equal(result.groundSupport.status,'NOT_APPLICABLE');
  assert.equal(result.groundSupport.mode,'source-supported-exempt');
});

test('structural plausibility is exact-candidate-bound and tamper detectable',()=>{
  const semantics=groundedSemantics(),glb=standingCandidate(0);
  const result=analyzeStructuralPlausibility({attachmentSemantics:semantics,glb});
  const changed=standingCandidate(2.5);
  assert.equal(validateStructuralPlausibility(result,{attachmentSemantics:semantics,glb:changed}).valid,false);
  const tampered=structuredClone(result);
  tampered.groundSupport.insideSupportPolygon=false;
  assert.equal(validateStructuralPlausibility(tampered,{attachmentSemantics:semantics,glb}).valid,false);
});

test('legacy attachment semantics remain canonical when plausibility declarations are absent',()=>{
  const legacy=createAttachmentSemantics({
    scopeId:'legacy',sourceSha256:D('c'),entities:[E('root'),E('child')],
    relations:[FREE('root'),{id:'child-follow',mode:'RIGID_FOLLOW',subjectId:'child',ownerIds:['root'],basis:'construction',evidenceRefs:['model/child.json']}],
  });
  assert.equal('groundSupport' in legacy,false);
  assert.equal('rootAnchor' in legacy.relations[1],false);
  assert.deepEqual(validateAttachmentSemantics(legacy),{valid:true,errors:[]});
});

test('existing articulated figure remains non-blocking when structural plausibility is not declared',()=>{
  const articulated=buildArticulatedFigure('reference');
  const semantics=createAttachmentSemantics({
    scopeId:'articulated-regression',
    sourceSha256:D('d'),
    entities:[E('pelvis-shell')],
    relations:[FREE('pelvis-shell')],
    evidenceRefs:['model/articulated-regression.json'],
  });
  const result=analyzeStructuralPlausibility({
    attachmentSemantics:semantics,
    glb:articulated.glb,
    evidenceRefs:['tests/articulated-figure.test.mjs'],
  });
  assert.equal(result.status,'NOT_APPLICABLE');
  assert.deepEqual(result.rootChecks,[]);
  assert.equal(result.groundSupport,null);
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(validateStructuralPlausibility(result,{attachmentSemantics:semantics,glb:articulated.glb}),{valid:true,errors:[]});
});

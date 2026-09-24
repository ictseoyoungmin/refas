import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  createArticulatedJoint,
  createArticulationGraph,
  createAttachmentSemantics,
  createCrossRepresentationValidation,
  createPhysicalAssetBundle,
  createPhysicalClaimEvidence,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  deriveRepresentationCapacityObligations,
  runExportAdapter,
  runRepresentationNormalizer,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const I = (origin = [0,0,0]) => ({origin,xAxis:[1,0,0],yAxis:[0,1,0],zAxis:[0,0,1]});
const Q = (parentId, translation_m = [0,0,0]) => ({parentId,translation_m,rotation_quat_xyzw:[0,0,0,1]});
const T = (translation_m = [0,0,0]) => ({translation_m,rotation_quat_xyzw:[0,0,0,1]});

function articulatedFixture() {
  const identityGraph=createPhysicalIdentityGraph({
    scopeId:'whole',sourceSha256:D(),
    entities:[
      {id:'module-root',kind:'assembly-module'},
      {id:'base-link',kind:'rigid-link',frame:Q('module-root')},
      {id:'arm-link',kind:'rigid-link',frame:Q('module-root',[1,0,0])},
      {id:'joint-shoulder',kind:'virtual-joint',frame:Q('base-link',[1,0,0])},
    ],
    relations:[
      {id:'contains-base',kind:'CONTAINS',sourceId:'module-root',targetIds:['base-link']},
      {id:'contains-arm',kind:'CONTAINS',sourceId:'module-root',targetIds:['arm-link']},
      {id:'contains-joint',kind:'CONTAINS',sourceId:'module-root',targetIds:['joint-shoulder']},
      {id:'shoulder-connects',kind:'CONNECTS',sourceId:'joint-shoulder',targetIds:['arm-link','base-link']},
    ],
  });
  const attachmentSemantics=createAttachmentSemantics({
    scopeId:'whole',sourceSha256:D(),
    entities:[
      {id:'base-body',scopeId:'whole',evidenceRefs:['source/ref.png']},
      {id:'arm-body',scopeId:'whole',evidenceRefs:['source/ref.png']},
    ],
    relations:[
      {id:'base-free',mode:'FREE',subjectId:'base-body',ownerIds:[],basis:'construction',evidenceRefs:['source/ref.png']},
      {id:'arm-hinge',mode:'ARTICULATED',subjectId:'arm-body',ownerIds:['base-body'],basis:'construction',evidenceRefs:['source/ref.png']},
    ],
    evidenceRefs:['source/ref.png'],
  });
  const jointContract=createArticulatedJoint({
    attachmentSemantics,id:'joint-shoulder',relationId:'arm-hinge',ownerJointFrame:I([1,0,0]),subjectJointFrame:I(),minimumAngle:-1,maximumAngle:1,evidenceRefs:['model/shoulder.json'],
  });
  const articulation=createArticulationGraph({
    identityGraph,attachmentSemantics,jointContracts:[jointContract],rootLinkId:'base-link',scopeId:'whole',sourceSha256:D(),
    linkBindings:[
      {linkId:'base-link',attachmentEntityId:'base-body',attachmentFrameInLink:T()},
      {linkId:'arm-link',attachmentEntityId:'arm-body',attachmentFrameInLink:T()},
    ],
    joints:[{
      virtualJointId:'joint-shoulder',parentLinkId:'base-link',childLinkId:'arm-link',referenceAngle:0,
      jointContract:{schema:jointContract.schema,id:jointContract.id,jointDigest:jointContract.jointDigest},
    }],
  });
  const components=[{
    componentId:'articulation-main',ownerModuleId:'module-root',contract:articulation,
    validationContext:{attachmentSemantics,jointContracts:[jointContract]},
  }];
  const bundle=createPhysicalAssetBundle({bundleId:'articulated-bundle',identityGraph,rootModuleId:'module-root',components});
  return {identityGraph,attachmentSemantics,jointContract,articulation,components,bundle};
}

function identityValue(view, obligation) {
  const entity=view.identityProjection.entities.find((item)=>obligation.subjectIds.includes(item.id));
  const relation=view.identityProjection.relations.find((item)=>obligation.subjectIds.includes(item.id));
  if(obligation.semanticPath==='identity.entity')return{id:entity.id,kind:entity.kind};
  if(obligation.semanticPath==='frame.transform')return entity.frame;
  if(obligation.semanticPath==='identity.relation'||obligation.semanticPath==='composition.contains')return relation;
  throw new Error(`unsupported identity path ${obligation.semanticPath}`);
}

function articulationValue(component, obligation) {
  const contract=component.contract;
  const subjects=obligation.subjectIds;
  const path=obligation.semanticPath;
  if(path==='articulation.topology'&&subjects.length===1&&subjects.includes(contract.rootLinkId))return{topology:contract.topology,rootLinkId:contract.rootLinkId};
  const joint=contract.joints.find((item)=>subjects.includes(item.virtualJointId));
  if(!joint)throw new Error(`missing articulation joint for ${path}`);
  if(path==='articulation.topology')return{virtualJointId:joint.virtualJointId,parentLinkId:joint.parentLinkId,childLinkId:joint.childLinkId};
  if(path==='articulation.joint-frame')return{parentJointFrame:joint.parentJointFrame,childJointFrame:joint.childJointFrame};
  if(path==='articulation.reference-configuration')return{referenceAngle:joint.referenceAngle,referenceChildFrameInParent:joint.referenceChildFrameInParent};
  if(path==='articulation.joint-limit'){
    const typed=component.dependencies.find((dependency)=>dependency.kind==='ARTICULATED_JOINT'&&dependency.contract?.id===joint.virtualJointId)?.contract;
    if(!typed)throw new Error(`missing typed joint dependency ${joint.virtualJointId}`);
    return{jointType:typed.jointType,axisConvention:typed.axisConvention,limits:typed.limits};
  }
  throw new Error(`unsupported articulation path ${path}`);
}

function semanticValue(view, obligation) {
  if(obligation.source.kind==='IDENTITY')return identityValue(view,obligation);
  const component=view.components.find((item)=>item.componentId===obligation.source.componentId);
  if(component?.schema==='refas.articulation-graph/v1')return articulationValue(component,obligation);
  throw new Error(`unsupported component path ${obligation.semanticPath}`);
}

function adapter() {
  return{id:'p16-articulated-export',backend:'p16-articulated-fixture',version:'1',project({canonicalView,capacityProfile}){
    const records=capacityProfile.obligations.map((obligation)=>({obligationId:obligation.obligationId,value:semanticValue(canonicalView,obligation)}));
    const path='fixture/p16-articulated.json';
    return{
      artifacts:[{path,mediaType:'application/json',content:`${JSON.stringify({schema:'fixture.p16-articulated/v1',records})}\n`}],
      bindings:capacityProfile.obligations.map(({obligationId})=>({obligationId,targets:[{path,locator:`record:${obligationId}`}]})),
    };
  }};
}

function normalizer(){return{id:'p16-articulated-normalizer',backend:'p16-articulated-fixture',version:'1',implementationDigest:D('f'),normalize({manifest,obligations,artifacts}){
  const document=JSON.parse(Buffer.from(artifacts.find((item)=>item.path==='fixture/p16-articulated.json').content).toString('utf8'));
  const records=new Map(document.records.map((item)=>[item.obligationId,item.value]));
  const dispositions=new Map(manifest.dispositions.map((item)=>[item.obligationId,item]));
  return{readings:obligations.map((obligation)=>({obligationId:obligation.obligationId,sources:dispositions.get(obligation.obligationId).targets,value:records.get(obligation.obligationId)}))};
}};}

test('P16 articulated-ready positively seals articulation obligations spanning the virtual joint and its parent/child rigid links',async()=>{
  const context=articulatedFixture();
  const obligations=deriveRepresentationCapacityObligations(context);
  const capacityProfile=createRepresentationCapacityProfile({profileId:'p16-articulated-profile',backend:'p16-articulated-fixture',...context,supported:obligations.map(({obligationId})=>({obligationId})),approximated:[],unsupported:[],blockers:[]});
  const representationNormalizer=normalizer();
  const exported=await runExportAdapter({exportId:'p16-articulated-export',adapter:adapter(),capacityProfile,...context});
  const normalizedRepresentation=await runRepresentationNormalizer({normalizationId:'p16-articulated-normalized',normalizer:representationNormalizer,capacityProfile,manifest:exported.manifest,files:exported.files});
  const validation=await createCrossRepresentationValidation({validationId:'p16-articulated-validation',capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,...context});
  const evidence=await createPhysicalClaimEvidence({
    evidenceId:'articulated-ready-evidence',claimId:'articulated-ready',bundle:context.bundle,identityGraph:context.identityGraph,components:context.components,
    validation,capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,
  });
  assert.equal(evidence.status,'PASS');
  assert.equal(evidence.findings.length,0);
  const articulationChecks=evidence.representationChecks.filter((item)=>item.semanticPath.startsWith('articulation.'));
  assert.equal(articulationChecks.length>=5,true);
  assert.equal(articulationChecks.every((item)=>item.status==='PASS'),true);
  assert.equal(articulationChecks.some((item)=>item.subjectIds.includes('joint-shoulder')&&item.subjectIds.includes('base-link')&&item.subjectIds.includes('arm-link')),true);
  assert.equal(evidence.representationChecks.some((item)=>item.semanticPath.startsWith('dynamics.')),false);
  assert.equal(evidence.representationChecks.some((item)=>item.semanticPath.startsWith('control.')),false);
  assert.equal(evidence.representationChecks.some((item)=>item.semanticPath.startsWith('runtime.')),false);
});

import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  canonicalizeBackendRigidTransform,
  createCrossRepresentationValidation,
  createDivergenceAuthorization,
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRepresentationCapacityProfile,
  createRigidBodyDynamics,
  createSemanticAuthoritySet,
  deriveRepresentationCapacityObligations,
  digestJson,
  divergenceAuthoritySubjectId,
  runExportAdapter,
  runRepresentationNormalizer,
  validateDivergenceAuthorization,
  validateDivergenceAuthorizationBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const D = (character = 'a') => character.repeat(64);
const Z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

function fixture() {
  const identityGraph = createPhysicalIdentityGraph({
    scopeId: 'whole', sourceSha256: D(),
    entities: [
      {id: 'module-root', kind: 'assembly-module'},
      {id: 'link-a', kind: 'rigid-link', frame: {parentId: 'module-root', translation_m: [0.1,-0.2,0.3], rotation_quat_xyzw: Z90}},
    ],
    relations: [{id: 'contains-link', kind: 'CONTAINS', sourceId: 'module-root', targetIds: ['link-a']}],
  });
  const dynamics = createRigidBodyDynamics({
    scopeId: 'whole', sourceSha256: D(), identityGraph,
    links: [{linkId: 'link-a', referenceFrameId: 'link-a', mass: {value_kg: 2.5}, centerOfMass: {value_m: [0.01,-0.02,0.03]}, inertia: {tensor_kg_m2: [[0.02,0,0],[0,0.03,0],[0,0,0.04]]}}],
  });
  const components = [{componentId: 'dynamics-main', ownerModuleId: 'module-root', contract: dynamics}];
  const bundle = createPhysicalAssetBundle({bundleId: 'physical-main', identityGraph, rootModuleId: 'module-root', components});
  return {identityGraph, components, bundle};
}
function profile(context, id) {
  const obligations = deriveRepresentationCapacityObligations(context);
  return createRepresentationCapacityProfile({profileId:id, backend:'fixture-divergence', ...context, supported:obligations.map(({obligationId})=>({obligationId})), approximated:[], unsupported:[], blockers:[]});
}
function semanticValue(view, obligation) {
  if (obligation.source.kind === 'IDENTITY') {
    const entity = view.identityProjection.entities.find((item)=>obligation.subjectIds.includes(item.id));
    const relation = view.identityProjection.relations.find((item)=>obligation.subjectIds.includes(item.id));
    if (obligation.semanticPath === 'identity.entity') return {id:entity.id,kind:entity.kind};
    if (obligation.semanticPath === 'frame.transform') return entity.frame;
    if (obligation.semanticPath === 'identity.relation' || obligation.semanticPath === 'composition.contains') return relation;
    throw new Error(`unsupported identity path ${obligation.semanticPath}`);
  }
  const component = view.components.find((item)=>item.componentId===obligation.source.componentId);
  const link = component.contract.links.find((item)=>obligation.subjectIds.includes(item.linkId));
  if (obligation.semanticPath === 'dynamics.mass') return link.mass.value_kg;
  if (obligation.semanticPath === 'dynamics.center-of-mass') return link.centerOfMass.value_m;
  if (obligation.semanticPath === 'dynamics.inertia') return link.inertia.tensor_kg_m2;
  throw new Error(`unsupported component path ${obligation.semanticPath}`);
}
function encodedFrame(frame, translationOverride = null) {
  const q=frame.rotation_quat_xyzw, translation=translationOverride??frame.translation_m;
  return {parentId:frame.parentId,transform:{translation:translation.map((value)=>value*100),translationUnit:'cm',rotation:{kind:'QUATERNION',order:'WXYZ',values:[-q[3],-q[0],-q[1],-q[2]]}}};
}
function adapter({massOverride,frameTranslationOverride}={}) {
  return {id:'fixture-divergence-export',backend:'fixture-divergence',version:'1',project({canonicalView,capacityProfile}){
    const records=capacityProfile.obligations.map((obligation)=>{let value=semanticValue(canonicalView,obligation);if(obligation.semanticPath==='frame.transform')value=encodedFrame(value,frameTranslationOverride);if(obligation.semanticPath==='dynamics.mass'&&massOverride!==undefined)value=massOverride;return{obligationId:obligation.obligationId,value};});
    const path='fixture/divergence.json';
    return{artifacts:[{path,mediaType:'application/json',content:`${JSON.stringify({schema:'fixture.divergence/v1',records})}\n`}],bindings:capacityProfile.obligations.map(({obligationId})=>({obligationId,targets:[{path,locator:`record:${obligationId}`}]}))};
  }};
}
function normalizer(){return{id:'fixture-divergence-normalizer',backend:'fixture-divergence',version:'1',implementationDigest:D('f'),normalize({manifest,obligations,artifacts}){
  const document=JSON.parse(Buffer.from(artifacts.find((item)=>item.path==='fixture/divergence.json').content).toString('utf8'));
  const records=new Map(document.records.map((item)=>[item.obligationId,item])),dispositions=new Map(manifest.dispositions.map((item)=>[item.obligationId,item]));
  return{readings:obligations.map((obligation)=>{let value=records.get(obligation.obligationId).value;if(obligation.semanticPath==='frame.transform')value={parentId:value.parentId,...canonicalizeBackendRigidTransform(value.transform)};return{obligationId:obligation.obligationId,sources:dispositions.get(obligation.obligationId).targets,value};})};
}};}
async function pipeline({massOverride,frameTranslationOverride,suffix='a'}={}){
  const context=fixture(),capacityProfile=profile(context,`profile-${suffix}`),representationNormalizer=normalizer();
  const exported=await runExportAdapter({exportId:`export-${suffix}`,adapter:adapter({massOverride,frameTranslationOverride}),capacityProfile,...context});
  const normalizedRepresentation=await runRepresentationNormalizer({normalizationId:`normalized-${suffix}`,normalizer:representationNormalizer,capacityProfile,manifest:exported.manifest,files:exported.files});
  const validation=await createCrossRepresentationValidation({validationId:`validation-${suffix}`,capacityProfile,manifest:exported.manifest,files:exported.files,normalizedRepresentation,normalizer:representationNormalizer,...context});
  return{context,capacityProfile,normalizer:representationNormalizer,exported,normalizedRepresentation,validation};
}
function upstream(data){return{capacityProfile:data.capacityProfile,manifest:data.exported.manifest,files:data.exported.files,normalizedRepresentation:data.normalizedRepresentation,normalizer:data.normalizer,...data.context};}
function at(value,path){if(path==='')return structuredClone(value);let current=value;for(const raw of path.slice(1).split('/')){const key=raw.replaceAll('~1','/').replaceAll('~0','~');current=current[Array.isArray(current)?Number(key):key];}return structuredClone(current);}
function declaration(validation,finding,{fieldPath='',canonicalValue,overrideValue,targetBackend,semanticPath,subjectIds,obligationId}={}){return{findingId:finding.findingId,obligationId:obligationId??finding.obligationId,targetBackend:targetBackend??validation.capacityBinding.backend,semanticPath:semanticPath??finding.semanticPath,subjectIds:subjectIds??[...finding.subjectIds],fieldPath,canonicalValue:canonicalValue===undefined?at(finding.canonicalValue,fieldPath):canonicalValue,overrideValue:overrideValue===undefined?at(finding.normalizedValue,fieldPath):overrideValue,reason:'Backend-specific realization is required by the declared downstream target.'};}
function authorityEntry(subjectId,authority,index){
  if(authority==='engineered')return{id:`divergence-authority-${index}`,subjectId,authority,proposition:'The exact backend-specific override is authorized for the declared downstream target.',reason:'The target backend requires an explicit construction choice that differs from canonical RefAs semantics.',basis:[{kind:'downstream-requirement',ref:`backend-requirement:${index}`}]};
  if(authority==='observed')return{id:`divergence-authority-${index}`,subjectId,authority,proposition:'Source evidence is asserted for this override.',basis:[{kind:'source-evidence',ref:`source:${index}`}]};
  if(authority==='inferred')return{id:`divergence-authority-${index}`,subjectId,authority,proposition:'The override is inferred.',reason:'A structural prior suggests the override.',basis:[{kind:'structural-prior',ref:`prior:${index}`}]};
  if(authority==='forbidden')return{id:`divergence-authority-${index}`,subjectId,authority,proposition:'The override is forbidden.',reason:'A hard constraint prohibits this override.',basis:[{kind:'hard-constraint',ref:`constraint:${index}`}]};
  return{id:`divergence-authority-${index}`,subjectId,authority:'unknown',proposition:'The override authority is unresolved.',reason:'No defensible basis is available.',basis:[]};
}
function authoritySet(data,declarations,authority='engineered'){
  return createSemanticAuthoritySet({scopeId:data.validation.scopeId,sourceSha256:data.context.identityGraph.sourceSha256,targetSchema:data.validation.schema,targetDigest:data.validation.validationDigest,entries:declarations.map((item,index)=>authorityEntry(divergenceAuthoritySubjectId(data.validation.validationDigest,item.findingId,item.fieldPath),authority,index))});
}
async function authorize(data,declarations,authority='engineered',authorizationId='authorization-main'){
  const authoritySetValue=authoritySet(data,declarations,authority),authorization=await createDivergenceAuthorization({authorizationId,validation:data.validation,declarations,authoritySet:authoritySetValue,...upstream(data)});return{authorization,authoritySet:authoritySetValue};
}
function resign(value){const next=structuredClone(value),payload=structuredClone(next);delete payload.authorizationDigest;next.authorizationDigest=digestJson(payload);return next;}

test('P15 resolves the exact P14 DRIFT as DECLARED_DIVERGENCE with engineered authority without mutating canonical state',async()=>{
  const data=await pipeline({massOverride:3.5,suffix:'mass'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass');assert.equal(mass.outcome,'DRIFT');
  const before=data.validation.canonicalBinding.canonicalViewDigest,{authorization,authoritySet:authority}=await authorize(data,[declaration(data.validation,mass)]);
  assert.deepEqual(validateDivergenceAuthorization(authorization),{valid:true,errors:[]});const resolution=authorization.resolutions.find((item)=>item.findingId===mass.findingId);assert.equal(resolution.sourceOutcome,'DRIFT');assert.equal(resolution.outcome,'DECLARED_DIVERGENCE');assert.equal(authorization.summary.declaredDivergence,1);assert.equal(authorization.summary.drift,0);assert.equal(authorization.validationBinding.canonicalViewDigest,before);assert.equal(data.validation.canonicalBinding.canonicalViewDigest,before);assert.equal(authorization.declarations[0].canonicalValue,2.5);assert.equal(authorization.declarations[0].overrideValue,3.5);assert.deepEqual(await validateDivergenceAuthorizationBindings(authorization,{validation:data.validation,authoritySet:authority,...upstream(data)}),{valid:true,errors:[]});
});

test('P15 rejects wrong backend, obligation, semantic path, subject, canonical value, and override value bindings',async()=>{
  const data=await pipeline({massOverride:3.5,suffix:'binding'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass');
  for(const [name,item,pattern] of [['backend',declaration(data.validation,mass,{targetBackend:'wrong-backend'}),/targetBackend/],['obligation',declaration(data.validation,mass,{obligationId:'wrong-obligation'}),/obligationId/],['path',declaration(data.validation,mass,{semanticPath:'dynamics.inertia'}),/semanticPath/],['subject',declaration(data.validation,mass,{subjectIds:['module-root']}),/subjectIds/],['canonical',declaration(data.validation,mass,{canonicalValue:8}),/canonicalValue/],['override',declaration(data.validation,mass,{overrideValue:8}),/overrideValue/]]){
    await assert.rejects(createDivergenceAuthorization({authorizationId:`authorization-wrong-${name}`,validation:data.validation,declarations:[item],authoritySet:authoritySet(data,[item]),...upstream(data)}),pattern);
  }
});

test('P15 cannot relabel non-DRIFT evidence',async()=>{
  const data=await pipeline({suffix:'equivalent'}),finding=data.validation.findings.find((item)=>item.outcome==='EQUIVALENT'),item=declaration(data.validation,finding,{overrideValue:'__different__'});
  await assert.rejects(createDivergenceAuthorization({authorizationId:'authorization-equivalent',validation:data.validation,declarations:[item],authoritySet:authoritySet(data,[item]),...upstream(data)}),/may authorize only a P14 DRIFT/);
});

test('P15 requires engineered semantic authority',async()=>{
  const data=await pipeline({massOverride:3.5,suffix:'authority'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass'),item=declaration(data.validation,mass);
  for(const authority of ['observed','inferred','unknown','forbidden'])await assert.rejects(createDivergenceAuthorization({authorizationId:`authorization-${authority}`,validation:data.validation,declarations:[item],authoritySet:authoritySet(data,[item],authority),...upstream(data)}),/must be engineered/);
});

test('P15 field-scoped declarations must fully explain drift and may not overlap',async()=>{
  const data=await pipeline({frameTranslationOverride:[0.15,-0.25,0.3],suffix:'partial'}),frame=data.validation.findings.find((item)=>item.semanticPath==='frame.transform');assert.equal(frame.outcome,'DRIFT');
  const x=declaration(data.validation,frame,{fieldPath:'/translation_m/0'}),y=declaration(data.validation,frame,{fieldPath:'/translation_m/1'});
  await assert.rejects(createDivergenceAuthorization({authorizationId:'authorization-partial',validation:data.validation,declarations:[x],authoritySet:authoritySet(data,[x]),...upstream(data)}),/do not fully explain/);
  const complete=await createDivergenceAuthorization({authorizationId:'authorization-complete-fields',validation:data.validation,declarations:[x,y],authoritySet:authoritySet(data,[x,y]),...upstream(data)});assert.equal(complete.resolutions.find((item)=>item.findingId===frame.findingId).outcome,'DECLARED_DIVERGENCE');
  const root=declaration(data.validation,frame,{fieldPath:''});await assert.rejects(createDivergenceAuthorization({authorizationId:'authorization-overlap',validation:data.validation,declarations:[root,x],authoritySet:authoritySet(data,[root,x]),...upstream(data)}),/overlapping field paths/);
});

test('P15 fails closed when semantic authority targets another P14 validation digest',async()=>{
  const data=await pipeline({massOverride:3.5,suffix:'stale-authority'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass'),item=declaration(data.validation,mass),subjectId=divergenceAuthoritySubjectId(data.validation.validationDigest,mass.findingId,'');
  const wrong=createSemanticAuthoritySet({scopeId:data.validation.scopeId,sourceSha256:data.context.identityGraph.sourceSha256,targetSchema:data.validation.schema,targetDigest:D('9'),entries:[authorityEntry(subjectId,'engineered',0)]});
  await assert.rejects(createDivergenceAuthorization({authorizationId:'authorization-stale-authority',validation:data.validation,declarations:[item],authoritySet:wrong,...upstream(data)}),/exact P14 validation digest/);
});

test('P15 intrinsic validator binds authority target and declaration ownership to exact P14 identity',async()=>{
  const data=await pipeline({massOverride:3.5,frameTranslationOverride:[0.15,-0.25,0.3],suffix:'intrinsic'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass'),frame=data.validation.findings.find((item)=>item.semanticPath==='frame.transform'),massDeclaration=declaration(data.validation,mass),frameDeclaration=declaration(data.validation,frame),{authorization}=await authorize(data,[massDeclaration,frameDeclaration],'engineered','authorization-intrinsic');
  const wrongAuthority=resign({...structuredClone(authorization),authorityBinding:{...authorization.authorityBinding,targetDigest:D('7')}});assert.equal(validateDivergenceAuthorization(wrongAuthority).valid,false);
  const swapped=structuredClone(authorization),massResolution=swapped.resolutions.find((item)=>item.findingId===mass.findingId),frameResolution=swapped.resolutions.find((item)=>item.findingId===frame.findingId),tmp=massResolution.declarationIds;massResolution.declarationIds=frameResolution.declarationIds;frameResolution.declarationIds=tmp;const resigned=resign(swapped);assert.equal(validateDivergenceAuthorization(resigned).valid,false);assert.match(validateDivergenceAuthorization(resigned).errors.join('; '),/exact finding and obligation/);
});

test('P15 intrinsic digest catches direct tamper and live recreation rejects re-signed stale upstream binding',async()=>{
  const data=await pipeline({massOverride:3.5,suffix:'tamper'}),mass=data.validation.findings.find((item)=>item.semanticPath==='dynamics.mass'),item=declaration(data.validation,mass),{authorization,authoritySet:authority}=await authorize(data,[item],'engineered','authorization-tamper');
  const tampered=structuredClone(authorization);tampered.declarations[0].overrideValue=4.5;assert.equal(validateDivergenceAuthorization(tampered).valid,false);
  const stale=resign({...structuredClone(authorization),validationBinding:{...authorization.validationBinding,canonicalViewDigest:D('8')}});assert.deepEqual(validateDivergenceAuthorization(stale),{valid:true,errors:[]});const live=await validateDivergenceAuthorizationBindings(stale,{validation:data.validation,authoritySet:authority,...upstream(data)});assert.equal(live.valid,false);assert.match(live.errors.join('; '),/does not reproduce|stale/);
});

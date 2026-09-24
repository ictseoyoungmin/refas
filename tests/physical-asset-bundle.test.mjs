import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhysicalAssetBundle,
  createPhysicalIdentityGraph,
  createRigidBodyDynamics,
  digestJson,
  physicalAssetBundleIdentityProjection,
  physicalModuleClosureById,
  validatePhysicalAssetBundle,
  validatePhysicalAssetBundleBindings,
} from '../skills/refas/scripts/lib/index.mjs';

const SOURCE='a'.repeat(64);

function graphInput({childX=0.4,childInterfaceX=-0.2,unrelatedX=0}={}){
  return{
    scopeId:'whole',sourceSha256:SOURCE,
    entities:[
      {id:'module-root',kind:'assembly-module'},
      {id:'module-child',kind:'assembly-module',frame:{parentId:'module-root',translation_m:[childX,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'module-unrelated',kind:'assembly-module'},
      {id:'part-root',kind:'physical-part',frame:{parentId:'module-root',translation_m:[0.1,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'link-root',kind:'rigid-link',frame:{parentId:'module-root',translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'part-child',kind:'physical-part',frame:{parentId:'module-child',translation_m:[0.05,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'link-child',kind:'rigid-link',frame:{parentId:'module-child',translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'interface-root',kind:'attachment-interface',compatibilityFamilyIds:['mount-a'],frame:{parentId:'module-root',translation_m:[0.2,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'interface-child',kind:'attachment-interface',compatibilityFamilyIds:['mount-a'],frame:{parentId:'module-child',translation_m:[childInterfaceX,0,0],rotation_quat_xyzw:[0,0,0,1]}},
      {id:'part-unrelated',kind:'physical-part',frame:{parentId:'module-unrelated',translation_m:[unrelatedX,0,0],rotation_quat_xyzw:[0,0,0,1]}},
    ],
    relations:[
      {id:'contains-child',kind:'CONTAINS',sourceId:'module-root',targetIds:['module-child']},
      {id:'contains-part-root',kind:'CONTAINS',sourceId:'module-root',targetIds:['part-root']},
      {id:'contains-link-root',kind:'CONTAINS',sourceId:'module-root',targetIds:['link-root']},
      {id:'contains-part-child',kind:'CONTAINS',sourceId:'module-child',targetIds:['part-child']},
      {id:'contains-link-child',kind:'CONTAINS',sourceId:'module-child',targetIds:['link-child']},
      {id:'contains-part-unrelated',kind:'CONTAINS',sourceId:'module-unrelated',targetIds:['part-unrelated']},
      {id:'exposes-root',kind:'EXPOSES',sourceId:'module-root',targetIds:['interface-root']},
      {id:'exposes-child',kind:'EXPOSES',sourceId:'module-child',targetIds:['interface-child']},
      {id:'aggregate-root',kind:'AGGREGATES_INTO',sourceId:'part-root',targetIds:['link-root']},
      {id:'aggregate-child',kind:'AGGREGATES_INTO',sourceId:'part-child',targetIds:['link-child']},
    ],
  };
}

function dynamicsFor(graph,linkId,mass=1){
  return createRigidBodyDynamics({
    scopeId:'whole',sourceSha256:SOURCE,identityGraph:graph,
    links:[{
      linkId,referenceFrameId:linkId,
      mass:{value_kg:mass},
      centerOfMass:{value_m:[0,0,0]},
      inertia:{tensor_kg_m2:[[0.1,0,0],[0,0.1,0],[0,0,0.1]]},
    }],
  });
}

function componentsFor(graph,{rootMass=1,childMass=2}={}){
  return[
    {componentId:'child-dynamics',ownerModuleId:'module-child',contract:dynamicsFor(graph,'link-child',childMass)},
    {componentId:'root-dynamics',ownerModuleId:'module-root',contract:dynamicsFor(graph,'link-root',rootMass)},
  ];
}
function bundleFor(graph,options={}){
  return createPhysicalAssetBundle({bundleId:'fixture-bundle',identityGraph:graph,rootModuleId:'module-root',components:componentsFor(graph,options)});
}

test('P10 bundle is deterministic and binds canonical component refs plus recursive module closures',()=>{
  const graph=createPhysicalIdentityGraph(graphInput()),bundle=bundleFor(graph);
  assert.deepEqual(validatePhysicalAssetBundle(bundle),{valid:true,errors:[]});
  assert.deepEqual(validatePhysicalAssetBundleBindings(bundle,{identityGraph:graph,components:[...componentsFor(graph)].reverse()}),{valid:true,errors:[]});
  const rootClosure=physicalModuleClosureById(bundle,'module-root'),childClosure=physicalModuleClosureById(bundle,'module-child');
  assert.equal(rootClosure.childModules[0].closureDigest,childClosure.closureDigest);
  assert.deepEqual(childClosure.componentRefs,[{componentId:'child-dynamics',schema:'refas.rigid-body-dynamics/v1',digest:dynamicsFor(graph,'link-child',2).dynamicsDigest}]);

  const reorderedInput=graphInput();reorderedInput.entities.reverse();reorderedInput.relations.reverse();
  const reorderedGraph=createPhysicalIdentityGraph(reorderedInput),reordered=createPhysicalAssetBundle({bundleId:'fixture-bundle',identityGraph:reorderedGraph,rootModuleId:'module-root',components:[...componentsFor(reorderedGraph)].reverse()});
  assert.equal(reordered.bundleDigest,bundle.bundleDigest);
  assert.deepEqual(reordered,bundle);
});

test('child incoming placement belongs to parent closure and does not rewrite immutable child closure',()=>{
  const originalGraph=createPhysicalIdentityGraph(graphInput({childX:0.4})),movedGraph=createPhysicalIdentityGraph(graphInput({childX:0.9}));
  const original=bundleFor(originalGraph),moved=bundleFor(movedGraph);
  const originalChild=physicalModuleClosureById(original,'module-child'),movedChild=physicalModuleClosureById(moved,'module-child');
  assert.equal(movedChild.closureDigest,originalChild.closureDigest);
  assert.notEqual(moved.rootClosureDigest,original.rootClosureDigest);
  assert.notEqual(moved.bundleDigest,original.bundleDigest);
});

test('child-local identity or component drift changes child closure and stales the parent bundle',()=>{
  const graph=createPhysicalIdentityGraph(graphInput()),original=bundleFor(graph);
  const childIdentityDrift=createPhysicalIdentityGraph(graphInput({childInterfaceX:-0.35})),rebuiltIdentity=bundleFor(childIdentityDrift);
  assert.notEqual(physicalModuleClosureById(rebuiltIdentity,'module-child').closureDigest,physicalModuleClosureById(original,'module-child').closureDigest);
  assert.equal(validatePhysicalAssetBundleBindings(original,{identityGraph:childIdentityDrift,components:componentsFor(childIdentityDrift)}).valid,false);

  const rebuiltComponent=bundleFor(graph,{childMass:3});
  assert.notEqual(physicalModuleClosureById(rebuiltComponent,'module-child').closureDigest,physicalModuleClosureById(original,'module-child').closureDigest);
  assert.equal(validatePhysicalAssetBundleBindings(original,{identityGraph:graph,components:componentsFor(graph,{childMass:3})}).valid,false);
});

test('unrelated P01 edits outside the selected module subtree do not stale the bundle',()=>{
  const originalGraph=createPhysicalIdentityGraph(graphInput({unrelatedX:0})),changedGraph=createPhysicalIdentityGraph(graphInput({unrelatedX:4.2}));
  assert.equal(digestJson(physicalAssetBundleIdentityProjection(originalGraph,'module-root')),digestJson(physicalAssetBundleIdentityProjection(changedGraph,'module-root')));
  assert.equal(bundleFor(originalGraph).bundleDigest,bundleFor(changedGraph).bundleDigest);
});

test('P10 fails closed on missing, stale, unsupported, and noncanonical component payloads',()=>{
  const graph=createPhysicalIdentityGraph(graphInput()),bundle=bundleFor(graph);
  assert.equal(validatePhysicalAssetBundleBindings(bundle,{identityGraph:graph,components:[]}).valid,false);

  const wrongDigest=structuredClone(dynamicsFor(graph,'link-child',2));wrongDigest.dynamicsDigest='f'.repeat(64);
  assert.throws(()=>createPhysicalAssetBundle({bundleId:'bad-bundle',identityGraph:graph,rootModuleId:'module-root',components:[{componentId:'bad-component',ownerModuleId:'module-child',contract:wrongDigest}]}),/not a canonical|digest mismatch|does not reproduce/);

  const fakePayload={schema:'refas.rigid-body-dynamics/v1',scopeId:'whole',sourceSha256:SOURCE,marker:'synthetic'};
  const fake={...fakePayload,dynamicsDigest:digestJson(fakePayload)};
  assert.throws(()=>createPhysicalAssetBundle({bundleId:'fake-bundle',identityGraph:graph,rootModuleId:'module-root',components:[{componentId:'fake-component',ownerModuleId:'module-root',contract:fake}]}),/not a canonical/);

  assert.throws(()=>createPhysicalAssetBundle({bundleId:'bad-bundle',identityGraph:graph,rootModuleId:'module-root',components:[{componentId:'bad-component',ownerModuleId:'module-root',contract:{...fake,schema:'refas.unknown-physical-contract/v1'}}]}),/not a supported P10 component schema/);

  const tampered=structuredClone(bundle);tampered.moduleClosures.find((x)=>x.moduleId==='module-child').componentRefs[0].digest='b'.repeat(64);
  assert.equal(validatePhysicalAssetBundle(tampered).valid,false);
});

test('P10 owner module must cover every semantic identity referenced by a component',()=>{
  const graph=createPhysicalIdentityGraph(graphInput()),rootDynamics=dynamicsFor(graph,'link-root',1);
  assert.throws(()=>createPhysicalAssetBundle({bundleId:'wrong-owner',identityGraph:graph,rootModuleId:'module-root',components:[{componentId:'misowned-root-dynamics',ownerModuleId:'module-child',contract:rootDynamics}]}),/outside ownerModuleId subtree module-child/);
  assert.doesNotThrow(()=>createPhysicalAssetBundle({bundleId:'ancestor-owner',identityGraph:graph,rootModuleId:'module-root',components:[{componentId:'child-dynamics-at-root',ownerModuleId:'module-root',contract:dynamicsFor(graph,'link-child',2)}]}));
});

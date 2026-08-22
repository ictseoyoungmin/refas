#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendPartsToClosedGlb, createHardSurfaceShell, createRealizedAssemblyProof, digestBytes, parseGlb, partsToGlb, validateRealizedAssemblyProof} from '../../skills/refas/scripts/lib/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url)), REPOSITORY = path.resolve(ROOT, '../..'), OUTPUT = path.join(ROOT, 'output');
const PYTHON = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3';
const materials = {
  'base-metal': {baseColor: [0.12, 0.18, 0.22, 1], metallic: 0.86, roughness: 0.28},
  'carrier-metal': {baseColor: [0.55, 0.22, 0.07, 1], metallic: 0.78, roughness: 0.32},
  'latch-metal': {baseColor: [0.58, 0.62, 0.66, 1], metallic: 0.92, roughness: 0.2},
};
const frame = (origin, normal, supportRadius) => ({origin, normal, supportRadius});
const shell = (outer, hole, thickness, role) => createHardSurfaceShell({schema: 'refas.hard-surface-spec/v1', outerProfile: outer,
  cutouts: hole ? [{id: `${role}-aperture`, profile: hole}] : [], thickness, edgeTreatments: {outer: {type: 'fillet', width: 0.035, depth: 0.025, segments: 3}, cutouts: {type: 'chamfer', width: 0.025, depth: 0.018}}, role});
const baseMesh = shell([[-1.35,-.82],[1.35,-.82],[1.48,-.58],[1.42,.7],[1.18,.86],[-1.22,.86],[-1.45,.62]], [[-.62,-.34],[.72,-.34],[.82,-.18],[.75,.36],[.57,.5],[-.65,.5],[-.78,.3],[-.75,-.18]], .18, 'base-module');
const carrierMesh = shell([[-.92,-.52],[.92,-.52],[1.02,-.34],[.96,.52],[-.86,.56],[-1.02,.32]], [[-.4,-.2],[.48,-.2],[.55,-.08],[.48,.22],[-.45,.24],[-.55,.08]], .14, 'carrier-module');
const latchMesh = shell([[-.55,-.28],[.55,-.28],[.66,-.12],[.58,.3],[-.52,.32],[-.64,.12]], null, .1, 'latch-module');

const basePart = {id: 'base-module', role: 'module-root', scopeId: 'fixture.base', materialId: 'base-metal', mesh: baseMesh, moduleRoot: true,
  contactSurfaces: {carrierSocket: frame([0,0,.09], [0,0,1], .72)}};
const childParts = (exploded = false) => [
  {id: 'carrier-module', parentId: 'base-module', translation: [0,0, exploded ? .55 : .16], role: 'module-root', scopeId: 'fixture.carrier', materialId: 'carrier-metal', mesh: carrierMesh, moduleRoot: true,
    contactSurfaces: {baseMount: frame([0,0,-.07], [0,0,-1], .62), latchSocket: frame([0,0,.07], [0,0,1], .42)}},
  {id: 'latch-module', parentId: 'carrier-module', translation: [0,0, exploded ? .42 : .12], role: 'module-root', scopeId: 'fixture.latch', materialId: 'latch-metal', mesh: latchMesh, moduleRoot: true,
    contactSurfaces: {carrierMount: frame([0,0,-.05], [0,0,-1], .38)}},
];
const baseGlb = partsToGlb({assetId: 'modular-base-child', name: 'Closed base module', materials, parts: [basePart]});
const assembled = appendPartsToClosedGlb(baseGlb, {name: 'Three-level modular hard-surface fixture', materials, parts: childParts(false)});
const exploded = appendPartsToClosedGlb(baseGlb, {name: 'Exploded three-level modular fixture', materials, parts: childParts(true)});
const modules = [{id:'base',rootPartId:'base-module',closedChildSha256:digestBytes(baseGlb)},{id:'carrier',rootPartId:'carrier-module',parentModuleId:'base'},{id:'latch',rootPartId:'latch-module',parentModuleId:'carrier'}];
const attachments = [
  {id:'carrier-to-base',childModuleId:'carrier',parentModuleId:'base',childSurface:{partId:'carrier-module',surfaceId:'baseMount'},parentSurface:{partId:'base-module',surfaceId:'carrierSocket'},clearanceRange:[0,0],tolerance:.001},
  {id:'latch-to-carrier',childModuleId:'latch',parentModuleId:'carrier',childSurface:{partId:'latch-module',surfaceId:'carrierMount'},parentSurface:{partId:'carrier-module',surfaceId:'latchSocket'},clearanceRange:[0,0],tolerance:.001},
];
const proof = createRealizedAssemblyProof({glb: assembled.glb, modules, attachments, compositionReports:[{partId:'base-module',...assembled.report}], objectIdEvidence:['base-module','carrier-module','latch-module']});
assert.deepEqual(validateRealizedAssemblyProof(proof), {valid:true,errors:[]});
const floatingProof = createRealizedAssemblyProof({glb: exploded.glb, modules, attachments, compositionReports:[{partId:'base-module',...exploded.report}], objectIdEvidence:['base-module','carrier-module','latch-module']});
assert.equal(floatingProof.valid, false);
assert.ok(floatingProof.attachmentChecks.every((check) => !check.pass));
assert.equal(parseGlb(assembled.glb).binary.subarray(0, parseGlb(baseGlb).binary.length).equals(parseGlb(baseGlb).binary), true);

await fs.rm(OUTPUT,{recursive:true,force:true}); await fs.mkdir(path.join(OUTPUT,'assets'),{recursive:true});
const assembledPath=path.join(OUTPUT,'assets','modular-assembly.glb'), explodedPath=path.join(OUTPUT,'assets','modular-assembly-exploded.glb');
await fs.writeFile(assembledPath,assembled.glb); await fs.writeFile(explodedPath,exploded.glb);
const framePath=path.join(OUTPUT,'canonical-frame.json'); await fs.writeFile(framePath,`${JSON.stringify({schema:'refas.canonical-object-frame/v1',id:'modular-fixture-frame',scopeId:'whole',origin:[0,0,0],axes:{right:[1,0,0],up:[0,1,0],forward:[0,0,1]}},null,2)}\n`);
await fs.writeFile(path.join(OUTPUT,'realized-assembly-proof.json'),`${JSON.stringify(proof,null,2)}\n`);
function render(script, glb, out, timeoutSeconds=90){ const result=spawnSync(PYTHON,[path.join(REPOSITORY,`skills/refas/scripts/${script}`),'--glb',glb,'--out',out,'--frame',framePath,'--size','420','--timeout-seconds',String(timeoutSeconds),'--max-working-mb','768'],{encoding:'utf8',timeout:(timeoutSeconds+10)*1000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}); if(result.error?.code==='ETIMEDOUT') throw new Error(`${script} exceeded parent timeout`); if(result.status!==0) throw new Error(result.stderr||result.stdout); process.stdout.write(result.stdout); }
render('render_glb.py',assembledPath,path.join(OUTPUT,'renders','assembled')); render('render_glb.py',explodedPath,path.join(OUTPUT,'renders','exploded')); render('render_pbr.py',assembledPath,path.join(OUTPUT,'renders','pbr'),120);
const summary={status:'PASS',nestedLevels:proof.metrics.nestedLevels,attachments:proof.attachmentChecks.length,derivedSupport:proof.attachmentChecks.every((check)=>check.supportDerivedFromContact),derivedPenetration:proof.attachmentChecks.every((check)=>check.penetrationDepth===0),closedChildPrefixPreserved:assembled.report.sourceBinaryPrefixPreserved,objectIdParts:proof.objectIdCheck.partIds,explodedCandidateRejected:floatingProof.valid===false,triangles:[baseMesh,carrierMesh,latchMesh].reduce((sum,mesh)=>sum+mesh.analysis.triangleCount,0),boards:{assembled:'renders/assembled/multiview-review-board.png',exploded:'renders/exploded/multiview-review-board.png',pbr:'renders/pbr/pbr-review-board.png'}};
await fs.writeFile(path.join(OUTPUT,'summary.json'),`${JSON.stringify(summary,null,2)}\n`); process.stdout.write(`${JSON.stringify(summary,null,2)}\n`);

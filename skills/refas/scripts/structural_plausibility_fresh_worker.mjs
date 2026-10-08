#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function args(argv){const out={};for(let i=0;i<argv.length;i+=1){if(!argv[i].startsWith('--'))continue;const k=argv[i].slice(2),v=argv[i+1];if(v&&!v.startsWith('--')){out[k]=v;i+=1;}else out[k]=true;}return out;}
const D=(c='a')=>c.repeat(64);
const box=(x0,x1,y0,y1,z0,z1)=>({positions:[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,7,3,0,4,7,1,2,6,1,6,5]});

async function main(){
  const o=args(process.argv.slice(2)),skillRoot=path.resolve(String(o['skill-root']??'')),reportPath=path.resolve(String(o.report??''));
  if(!skillRoot||!reportPath)throw new Error('usage: --skill-root DIR --report FILE');
  const reads=[];
  const readPublic=async(relative)=>{if(!(relative==='SKILL.md'||relative.startsWith('references/')))throw new Error(`non-public read requested: ${relative}`);reads.push(relative);return fs.readFile(path.join(skillRoot,relative),'utf8');};
  await readPublic('SKILL.md');
  await readPublic('references/INDEX.md');
  await readPublic('references/contracts/attachment-semantics.md');
  await readPublic('references/realized-contact-support.md');
  const graph=JSON.parse(await readPublic('references/GRAPH.json'));
  const node=graph.nodes.find((item)=>item.id==='realized-contact-support');
  if(!node?.interface?.interfaces?.some((entry)=>entry.id==='structural-plausibility'))throw new Error('structural plausibility is not publicly discoverable');
  const API=await import(pathToFileURL(path.join(skillRoot,'scripts','lib','index.mjs')).href);
  const mat={solid:{baseColor:[.6,.6,.6,1],metallic:0,roughness:.7}};
  const E=(id)=>({id,scopeId:id,evidenceRefs:[`model/${id}.json`]});
  const FREE=(id)=>({id:`${id}-free`,mode:'FREE',subjectId:id,ownerIds:[],basis:'construction',evidenceRefs:[`model/${id}.json`]});

  const rootSemantics=API.createAttachmentSemantics({
    scopeId:'corvid-root',sourceSha256:D('a'),entities:[E('torso'),E('leg')],
    relations:[FREE('torso'),{id:'leg-root',mode:'RIGID_FOLLOW',subjectId:'leg',ownerIds:['torso'],basis:'construction',evidenceRefs:['model/root.json'],rootAnchor:{kind:'embedded-root',subjectLocalPoint:[0,0,0],tolerance:.005,evidenceRefs:['source/rear.png']}}],
  });
  const rootGlb=API.partsToGlb({assetId:'fresh-corvid-root',materials:mat,parts:[
    {id:'torso',materialId:'solid',mesh:box(-.139,.301,-.15,.15,-.083,.083)},
    {id:'leg',materialId:'solid',mesh:box(-.03,.03,-.03,.03,-.03,.03),translation:[-.075,0,.1106]},
  ]});
  const root=API.analyzeStructuralPlausibility({attachmentSemantics:rootSemantics,glb:rootGlb,evidenceRefs:['reviews/root.json']});
  if(root.status!=='BLOCKED'||root.findings[0]?.type!=='attachment-mismatch')throw new Error('fresh worker did not block the outside embedded root');

  const supportSemantics=API.createAttachmentSemantics({
    scopeId:'standing',sourceSha256:D('b'),entities:[E('body'),E('left-foot'),E('right-foot')],
    relations:[FREE('body'),FREE('left-foot'),FREE('right-foot')],
    groundSupport:{mode:'grounded',groundAxis:'y',groundCoordinate:0,contactEntityIds:['left-foot','right-foot'],contactTolerance:1e-6,minimumMargin:.05,sourceObservation:'The source shows a grounded standing pose.',evidenceRefs:['source/ground.png']},
  });
  const supportGlb=API.partsToGlb({assetId:'fresh-standing',materials:mat,parts:[
    {id:'left-foot',materialId:'solid',mesh:box(-.9,-.2,0,.2,-.45,.45)},
    {id:'right-foot',materialId:'solid',mesh:box(.2,.9,0,.2,-.45,.45)},
    {id:'body',materialId:'solid',mesh:box(-.45,.45,.2,2.2,-.35,.35)},
  ]});
  const support=API.analyzeStructuralPlausibility({attachmentSemantics:supportSemantics,glb:supportGlb,evidenceRefs:['reviews/support.json']});
  if(support.status!=='PASS'||support.groundSupport?.insideSupportPolygon!==true)throw new Error('fresh worker did not admit grounded support fixture');

  const exemptSemantics=API.createAttachmentSemantics({
    scopeId:'airborne',sourceSha256:D('c'),entities:[E('body')],relations:[FREE('body')],
    groundSupport:{mode:'source-supported-exempt',groundAxis:'y',groundCoordinate:0,contactEntityIds:[],contactTolerance:.002,minimumMargin:0,sourceObservation:'The source shows the subject hanging from an external support.',evidenceRefs:['source/hanging.png']},
  });
  const exemptGlb=API.partsToGlb({assetId:'fresh-airborne',materials:mat,parts:[{id:'body',materialId:'solid',mesh:box(-.5,.5,2,3,-.5,.5)}]});
  const exempt=API.analyzeStructuralPlausibility({attachmentSemantics:exemptSemantics,glb:exemptGlb});
  if(exempt.status!=='PASS'||exempt.groundSupport?.status!=='NOT_APPLICABLE')throw new Error('fresh worker did not preserve explicit support exemption');

  const report={
    schema:'refas.structural-plausibility-fresh-worker-report/v1',status:'PASS',installedSkillOnly:true,
    publicReads:[...new Set(reads)].sort(),publicApiEntrypoint:'scripts/lib/index.mjs',
    rootOutsideBlocked:true,groundedSupportAdmitted:true,sourceSupportedExemptionPreserved:true,
    rootCandidateSha256:root.candidateSha256,supportCandidateSha256:support.candidateSha256,
    rootPlausibilityDigest:root.plausibilityDigest,supportPlausibilityDigest:support.plausibilityDigest,
  };
  await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:'PASS',rootOutsideBlocked:true,groundedSupportAdmitted:true,sourceSupportedExemptionPreserved:true})+'\n');
}
main().catch((error)=>{process.stderr.write(`Structural plausibility fresh worker failed: ${error.stack??error.message}\n`);process.exit(1);});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {CAPABILITY_ORDER,AGENT_NEXT_SCHEMA,AGENT_DIAGNOSIS_SCHEMA} from '../skills/refas/scripts/lib/index.mjs';

const root=path.resolve('skills/refas');
const script=path.join(root,'scripts','refas.mjs');
const specs=[
 {node:'workflow',id:'agent-next',command:'next',symbol:'nextAgentWork',schema:AGENT_NEXT_SCHEMA},
 {node:'failure-routing',id:'agent-diagnose',command:'diagnose',symbol:'diagnoseAgentWork',schema:AGENT_DIAGNOSIS_SCHEMA},
 {node:'validation',id:'agent-validate-source-bound',command:'validate',symbol:null,schema:AGENT_DIAGNOSIS_SCHEMA},
];
function cli(...args){
 const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 return JSON.parse(r.stdout);
}

test('released agent operations are discoverable in canonical graph, CLI help and describe node',async()=>{
 const graph=JSON.parse(await fs.readFile(path.join(root,'references','GRAPH.json'),'utf8'));
 assert.equal(graph.nodes.length,40,'do not add capabilities or instructional leaves');
 assert.equal(CAPABILITY_ORDER.length,11,'runtime ownership remains canonical');
 const help=cli('--help').commands;
 for(const expected of specs){
  const node=graph.nodes.find(n=>n.id===expected.node);
  assert.ok(node,expected.node);
  const op=node.interface.interfaces.find(x=>x.id===expected.id);
  assert.ok(op,`Missing agent operation ${expected.id}`);
  assert.deepEqual(op.cli,{bin:'refas',command:expected.command});
  assert.equal(op.library?.symbol??null,expected.symbol);
  assert.equal(op.outputSchema,null,'only existing schemas/validators; not a new quality gate');
  assert.equal(op.invocation.verification,'structural');
  assert.equal(op.minimumInvocation,node.path);
  assert.equal(op.usageReference,node.path);
  assert.equal(op.template,null);
  assert.ok(op.publicConstants?.length>=1);
  assert.ok(help[expected.command]);
  const d=cli('describe','node',expected.node);
  assert.deepEqual(d.interface.interfaces.find(x=>x.id===expected.id),op);
  assert.deepEqual(d.resolvedInterfaces.find(x=>x.id===expected.id).publicConstantValues,
    Object.fromEntries(op.publicConstants.map(x=>[x,expected.schema])));
 }
});
test('installed instruction router links actual source-bound agent commands without granting authority',async()=>{
 for(const file of ['references/INDEX.md','references/workflow.md','references/failure-routing.md','references/validation.md','SKILL.md']){
  const s=await fs.readFile(path.join(root,file),'utf8');
  assert.match(s,/(?:next|agent-next)/);
  assert.match(s,/(?:diagnose|agent-diagnose)/);
  assert.match(s,/(?:validate|agent-validate-source-bound)/);
 }
 const f=await fs.readFile(path.join(root,'references/validation.md'),'utf8');
 assert.match(f,/exit code 2|Exit code 2/);
 assert.match(f,/INSUFFICIENT/);
 assert.match(f,/read-only/);
 const index=await fs.readFile(path.join(root,'references/INDEX.md'),'utf8');
 assert.match(index,/diagnose.{0,180}exit 0|exit 0/);
});

test('early modeling demo executes from installed skill without any source-fidelity claim',()=>{
 const r=spawnSync(process.execPath,[path.join(root,'scripts/subdivision-cage-demo.mjs')],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
 const result=JSON.parse(r.stdout);
 assert.equal(result.demo,'non-authoritative-geometry');
 assert.equal(result.watertight,true);
 assert.ok(result.triangles>0);
 assert.match(result.claim,/No source fidelity/);
});
test('existing audit, strict verification and Handoff modes are graph discoverable',async()=>{
 const g=JSON.parse(await fs.readFile(path.join(root,'references/GRAPH.json'),'utf8'));
 const get=(node,id)=>g.nodes.find(n=>n.id===node).interface.interfaces.find(x=>x.id===id);
 assert.equal(get('validation','strict-source-bound-verify').cli.command,'verify');
 assert.equal(get('validation','project-audit').cli.command,'audit');
 assert.equal(get('host-integration','artifact-handoff').cli.command,'handoff');
 assert.equal(get('host-integration','source-bound-final-handoff').cli.command,'handoff');
 assert.equal(get('host-integration','source-bound-final-handoff').library.symbol,'getSourceBoundReleaseHandoff');
 const host=spawnSync(process.execPath,[path.join(root,'scripts/refas-host.mjs'),'--help'],{encoding:'utf8'});
 assert.equal(host.status,0,host.stderr||host.stdout);
 assert.ok(JSON.parse(host.stdout).commands.handoff);
 const index=await fs.readFile(path.join(root,'references/INDEX.md'),'utf8');
 assert.match(index,/source-bound-object/);
 assert.match(index,/draft-transfer/);
 const installedSkill=await fs.readFile(path.join(root,'SKILL.md'),'utf8');
 assert.match(installedSkill,/Load `references\/checkpointing\.md`/);
 assert.match(installedSkill,/references\/failure-routing\.md/);
});

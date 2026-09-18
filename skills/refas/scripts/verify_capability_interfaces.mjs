#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as PUBLIC_API from './lib/index.mjs';
import {createCapabilityAlignmentContext, fixtureForCapabilityInterface} from './capability_interface_fixtures.mjs';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT=path.dirname(SCRIPT_DIR);
const PUBLIC_LIBRARY_ENTRYPOINT='scripts/lib/index.mjs';
const PUBLIC_TEMPLATE_PROCESSOR='materializeCapabilityInputTemplate';
const portable=(value)=>value.split(path.sep).join('/');

function skillPath(value,label,errors){
  if(value==null)return null;
  if(typeof value!=='string'||!value.trim()){errors.push(`${label} must be null or a non-empty skill-local path`);return null;}
  const route=value.split('#',1)[0].split('?',1)[0],normalized=portable(path.posix.normalize(route));
  if(path.posix.isAbsolute(normalized)||normalized==='..'||normalized.startsWith('../')||normalized.startsWith('skills/refas/')){errors.push(`${label} must remain inside the installed skill root: ${value}`);return null;}
  return normalized;
}
function templateReference(value){const s=String(value??''),i=s.indexOf('#');return i<0?{route:s,fragment:''}:{route:s.slice(0,i),fragment:s.slice(i)};}
async function verifyFile(skillRoot,value,label,errors,{json=false}={}){
  const relative=skillPath(value,label,errors);if(!relative)return null;const absolute=path.join(skillRoot,relative);
  try{const stat=await fs.stat(absolute);if(!stat.isFile()){errors.push(`${label} is not a file: ${value}`);return null;}const text=await fs.readFile(absolute,'utf8');if(!json)return text;try{return JSON.parse(text);}catch(error){errors.push(`${label} is not valid JSON: ${error.message}`);return null;}}
  catch{errors.push(`${label} is missing from the installed skill: ${value}`);return null;}
}
async function loadTemplate(skillRoot,value,label,errors){const{route,fragment}=templateReference(value),document=await verifyFile(skillRoot,route,label,errors,{json:true});if(!document)return null;try{return PUBLIC_API.resolveCapabilityTemplatePointer(document,fragment);}catch(error){errors.push(`${label} fragment is invalid: ${error.message}`);return null;}}
function cliCatalog(bin,skillRoot,errors){const names={refas:'refas.mjs','refas-host':'refas-host.mjs'},name=names[bin];if(!name){errors.push(`unknown CLI binary in interface metadata: ${bin}`);return{};}const result=spawnSync(process.execPath,[path.join(skillRoot,'scripts',name),'--help'],{encoding:'utf8',cwd:skillRoot});if(result.status!==0){errors.push(`${bin} --help failed: ${String(result.stderr||result.stdout).trim()}`);return{};}try{return JSON.parse(result.stdout).commands??{};}catch(error){errors.push(`${bin} --help did not return JSON command metadata: ${error.message}`);return{};}}
function pointer(value,raw=''){if(raw==null||raw===''||raw==='/')return value;if(!String(raw).startsWith('/'))throw new Error(`invocation pointer must start with /: ${raw}`);let current=value;for(const token of String(raw).slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'))){if(current==null||!Object.hasOwn(Object(current),token))throw new Error(`invocation pointer does not resolve: ${raw}`);current=current[token];}return current;}
function resolveArg(spec,state){
  if(!spec||typeof spec!=='object')throw new Error('invocation argument spec must be an object');
  if(spec.source==='input')return pointer(state.input,spec.pointer);
  if(spec.source==='output')return pointer(state.output,spec.pointer);
  if(spec.source==='literal')return structuredClone(spec.value);
  if(spec.source==='object'){const out={};for(const [key,value]of Object.entries(spec.properties??{}))out[key]=resolveArg(value,state);return out;}
  throw new Error(`unsupported invocation argument source: ${spec.source}`);
}
function outputSchema(output,pointerPath){return pointerPath==null?null:pointer(output,pointerPath);}
async function exercise(records,errors){
  const context=await createCapabilityAlignmentContext(),outputs=new Map();let exercised=0;
  for(const record of records){
    const{key,entry,template}=record,contract=entry.invocation;if(contract?.verification!=='execute')continue;
    if(!entry.library?.symbol){errors.push(`${key} executable invocation requires a public library symbol`);continue;}
    let input=template;
    try{
      const fixture=fixtureForCapabilityInterface(key,context,outputs);
      if(entry.templateProcessor?.library===PUBLIC_TEMPLATE_PROCESSOR)input=PUBLIC_API.materializeCapabilityInputTemplate(template,{bindings:fixture.bindings,values:fixture.values});
      if(input==null)throw new Error('executable invocation requires an operation input template');
      const state={input,output:null};
      const args=(contract.call?.arguments??[]).map(spec=>resolveArg(spec,state));
      const callable=PUBLIC_API[entry.library.symbol];
      const output=await callable(...args);state.output=output;
      if(entry.outputSchema&&contract.outputSchemaPointer){
        const observed=outputSchema(output,contract.outputSchemaPointer);
        if(observed!==entry.outputSchema)throw new Error(`output schema ${observed??'null'} does not match declared ${entry.outputSchema}`);
      }
      if(entry.validator?.library){
        const validator=PUBLIC_API[entry.validator.library];
        const validatorArgs=(contract.validator?.arguments??[]).map(spec=>resolveArg(spec,state));
        const result=await validator(...validatorArgs);
        if(result?.valid!==true)throw new Error(`validator rejected invocation: ${(result?.errors??['unknown validation failure']).join('; ')}`);
      }
      outputs.set(key,output);record.invocationExercised=true;record.materializedInput=true;exercised+=1;
    }catch(error){errors.push(`${key} invocation contract failed: ${error.message}`);}
  }
  return exercised;
}
export async function analyzeCapabilityInterfaces({skillRoot=SKILL_ROOT,exerciseContracts=true}={}){
  skillRoot=path.resolve(skillRoot);const errors=[];const graph=JSON.parse(await fs.readFile(path.join(skillRoot,'references','GRAPH.json'),'utf8'));
  const interfaces=graph.nodes.flatMap(node=>(node.interface?.interfaces??[]).map(entry=>({node,entry})));
  const cliBins=[...new Set(interfaces.map(({entry})=>entry.cli?.bin).filter(Boolean))],cliCommands=new Map(cliBins.map(bin=>[bin,cliCatalog(bin,skillRoot,errors)])),audited=[];
  for(const{node,entry}of interfaces){
    const key=`${node.id}/${entry.id}`;
    if(entry.library){if(entry.library.entrypoint!==PUBLIC_LIBRARY_ENTRYPOINT)errors.push(`${key} library entrypoint must be ${PUBLIC_LIBRARY_ENTRYPOINT}`);if(!(entry.library.symbol in PUBLIC_API))errors.push(`${key} public symbol is not exported: ${entry.library.symbol}`);}
    if(entry.validator?.library&&!(entry.validator.library in PUBLIC_API))errors.push(`${key} public validator is not exported: ${entry.validator.library}`);
    if(entry.templateProcessor?.library&&!(entry.templateProcessor.library in PUBLIC_API))errors.push(`${key} template processor is not exported: ${entry.templateProcessor.library}`);
    for(const symbol of entry.publicConstants??[]){if(!(symbol in PUBLIC_API))errors.push(`${key} public constant is not exported: ${symbol}`);else{try{JSON.stringify(PUBLIC_API[symbol]);}catch{errors.push(`${key} public constant is not JSON-describable: ${symbol}`);}}}
    if(entry.cli&&!((cliCommands.get(entry.cli.bin)??{})[entry.cli.command]))errors.push(`${key} CLI command is not advertised by ${entry.cli.bin} --help: ${entry.cli.command}`);
    if(entry.invocation?.schema!=='refas.capability-invocation/v1'||!['execute','structural'].includes(entry.invocation?.verification))errors.push(`${key} must declare a public invocation classification`);
    if(entry.usageReference!==entry.minimumInvocation)errors.push(`${key} usageReference must match the legacy minimumInvocation compatibility alias`);
    await verifyFile(skillRoot,entry.usageReference,`${key}.usageReference`,errors);
    let template=null;if(entry.template){if(!entry.templateRole)errors.push(`${key}.template requires templateRole`);template=await loadTemplate(skillRoot,entry.template,`${key}.template`,errors);if(template&&entry.templateProcessor?.library===PUBLIC_TEMPLATE_PROCESSOR){try{PUBLIC_API.inspectCapabilityInputTemplate(template);}catch(error){errors.push(`${key}.template placeholder contract is invalid: ${error.message}`);}}}
    if(entry.invocation?.verification==='execute'&&!entry.template)errors.push(`${key} executable contract requires an operation input template`);
    audited.push({key,nodeId:node.id,interfaceId:entry.id,operation:entry.operation,librarySymbol:entry.library?.symbol??null,cli:entry.cli??null,validator:entry.validator?.library??null,template:entry.template??null,templateRole:entry.templateRole??null,templateParsed:entry.template?template!=null:null,templateProcessor:entry.templateProcessor?.library??null,publicConstants:[...(entry.publicConstants??[])],outputSchema:entry.outputSchema??null,verification:entry.invocation?.verification??null,invocationExercised:false,materializedInput:false,entry,template});
  }
  let invocationContractsExercised=0;if(exerciseContracts&&!errors.length)invocationContractsExercised=await exercise(audited,errors);
  const executableContracts=audited.filter(item=>item.entry.invocation?.verification==='execute').length;
  return{status:errors.length?'FAIL':'PASS',schema:'refas.capability-interface-alignment-report/v1',graphSchema:graph.schema,interfaceSchema:graph.interfaceSchema,interfaceContractSchema:graph.interfaceContractSchema??null,invocationSchema:graph.invocationSchema??null,instructionNodes:graph.nodes.length,executableInterfaces:interfaces.length,classifiedInterfaces:audited.filter(x=>x.verification).length,declaredTemplates:audited.filter(x=>x.template).length,classifiedTemplates:audited.filter(x=>x.template&&x.templateRole).length,operationInputTemplates:audited.filter(x=>x.templateRole==='operation-input').length,publicLibraryInterfaces:audited.filter(x=>x.librarySymbol).length,cliInterfaces:audited.filter(x=>x.cli).length,executableContracts,invocationContractsExercised,audited:audited.map(({entry,template,...item})=>item),errors};
}
export async function verifyCapabilityInterfaces(options={}){const report=await analyzeCapabilityInterfaces(options);if(report.status!=='PASS')throw new Error(report.errors.join('\n'));return report;}
async function main(){const report=await verifyCapabilityInterfaces();process.stdout.write(`${JSON.stringify({status:report.status,schema:report.schema,instructionNodes:report.instructionNodes,executableInterfaces:report.executableInterfaces,classifiedInterfaces:report.classifiedInterfaces,declaredTemplates:report.declaredTemplates,classifiedTemplates:report.classifiedTemplates,operationInputTemplates:report.operationInputTemplates,executableContracts:report.executableContracts,invocationContractsExercised:report.invocationContractsExercised},null,2)}\n`);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){main().catch(error=>{process.stderr.write(`Capability interface verification failed: ${error.message}\n`);process.exit(1);});}

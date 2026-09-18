#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import * as PUBLIC_API from './lib/index.mjs';
import {createCapabilityAlignmentContext, fixtureForCapabilityInterface} from './capability_interface_fixtures.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const PUBLIC_LIBRARY_ENTRYPOINT = 'scripts/lib/index.mjs';
const PUBLIC_TEMPLATE_PROCESSOR = 'materializeCapabilityInputTemplate';
const portable = (value) => value.split(path.sep).join('/');

function skillPath(value, label, errors) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be null or a non-empty skill-local path`);
    return null;
  }
  const route = value.split('#', 1)[0].split('?', 1)[0];
  const normalized = portable(path.posix.normalize(route));
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith(['..', ''].join('/')) ||
    normalized.startsWith(['skills', 'refas', ''].join('/'))
  ) {
    errors.push(`${label} must remain inside the installed skill root: ${value}`);
    return null;
  }
  return normalized;
}

function templateReference(value) {
  const stringValue = String(value ?? '');
  const hash = stringValue.indexOf('#');
  return hash < 0
    ? {route: stringValue, fragment: ''}
    : {route: stringValue.slice(0, hash), fragment: stringValue.slice(hash)};
}

async function verifyFile(skillRoot, value, label, errors, {json = false} = {}) {
  const relative = skillPath(value, label, errors);
  if (!relative) return null;
  const absolute = path.join(skillRoot, relative);
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) {
      errors.push(`${label} is not a file: ${value}`);
      return null;
    }
    const text = await fs.readFile(absolute, 'utf8');
    if (!json) return text;
    try {
      return JSON.parse(text);
    } catch (error) {
      errors.push(`${label} is not valid JSON: ${error.message}`);
      return null;
    }
  } catch {
    errors.push(`${label} is missing from the installed skill: ${value}`);
    return null;
  }
}

async function loadTemplate(skillRoot, value, label, errors) {
  const {route, fragment} = templateReference(value);
  const document = await verifyFile(skillRoot, route, label, errors, {json: true});
  if (!document) return null;
  try {
    return PUBLIC_API.resolveCapabilityTemplatePointer(document, fragment);
  } catch (error) {
    errors.push(`${label} fragment is invalid: ${error.message}`);
    return null;
  }
}

function cliCatalog(bin, skillRoot, errors) {
  const scriptNames = {refas: 'refas.mjs', 'refas-host': 'refas-host.mjs'};
  const name = scriptNames[bin];
  if (!name) {
    errors.push(`unknown CLI binary in interface metadata: ${bin}`);
    return {};
  }
  const script = path.join(skillRoot, 'scripts', name);
  const result = spawnSync(process.execPath, [script, '--help'], {encoding: 'utf8', cwd: skillRoot});
  if (result.status !== 0) {
    errors.push(`${bin} --help failed: ${String(result.stderr || result.stdout).trim()}`);
    return {};
  }
  try {
    return JSON.parse(result.stdout).commands ?? {};
  } catch (error) {
    errors.push(`${bin} --help did not return JSON command metadata: ${error.message}`);
    return {};
  }
}

function requiresConstructorExercise(entry) {
  return entry.operation === 'create'
    && Boolean(entry.library?.symbol)
    && Boolean(entry.validator?.library)
    && Boolean(entry.outputSchema);
}

async function exerciseConstructors(records, errors) {
  const context = await createCapabilityAlignmentContext();
  const outputs = new Map();
  let exercised = 0;

  for (const record of records) {
    const {key, entry, template} = record;
    if (!requiresConstructorExercise(entry)) continue;
    if (!template) {
      errors.push(`${key} constructor contract requires an executable canonical template`);
      continue;
    }
    if (entry.templateProcessor?.library !== PUBLIC_TEMPLATE_PROCESSOR) {
      errors.push(`${key} constructor contract must declare ${PUBLIC_TEMPLATE_PROCESSOR} as templateProcessor`);
      continue;
    }
    try {
      const fixture = fixtureForCapabilityInterface(key, context, outputs);
      const input = PUBLIC_API.materializeCapabilityInputTemplate(template, {
        bindings: fixture.bindings,
        values: fixture.values,
      });
      const creator = PUBLIC_API[entry.library.symbol];
      const output = await creator(input);
      if (output?.schema !== entry.outputSchema) {
        throw new Error(`creator output schema ${output?.schema ?? 'null'} does not match declared ${entry.outputSchema}`);
      }
      const validator = PUBLIC_API[entry.validator.library];
      const args = fixture.validatorArgs(output, input);
      const validation = await validator(output, ...args);
      if (validation?.valid !== true) {
        throw new Error(`validator rejected creator output: ${(validation?.errors ?? ['unknown validation failure']).join('; ')}`);
      }
      outputs.set(key, output);
      record.constructorExercised = true;
      record.materializedInput = true;
      exercised += 1;
    } catch (error) {
      errors.push(`${key} creator→validator contract failed: ${error.message}`);
    }
  }
  return exercised;
}

export async function analyzeCapabilityInterfaces({skillRoot = SKILL_ROOT, exercise = true} = {}) {
  skillRoot = path.resolve(skillRoot);
  const errors = [];
  const graph = JSON.parse(await fs.readFile(path.join(skillRoot, 'references', 'GRAPH.json'), 'utf8'));
  const interfaces = graph.nodes.flatMap((node) =>
    (node.interface?.interfaces ?? []).map((entry) => ({node, entry})),
  );
  const cliBins = [...new Set(interfaces.map(({entry}) => entry.cli?.bin).filter(Boolean))];
  const cliCommands = new Map(cliBins.map((bin) => [bin, cliCatalog(bin, skillRoot, errors)]));
  const audited = [];

  for (const {node, entry} of interfaces) {
    const key = `${node.id}/${entry.id}`;
    if (entry.library) {
      if (entry.library.entrypoint !== PUBLIC_LIBRARY_ENTRYPOINT) {
        errors.push(`${key} library entrypoint must be ${PUBLIC_LIBRARY_ENTRYPOINT}`);
      }
      if (!(entry.library.symbol in PUBLIC_API)) {
        errors.push(`${key} public symbol is not exported: ${entry.library.symbol}`);
      }
    }
    if (entry.validator?.library && !(entry.validator.library in PUBLIC_API)) {
      errors.push(`${key} public validator is not exported: ${entry.validator.library}`);
    }
    if (entry.templateProcessor?.library && !(entry.templateProcessor.library in PUBLIC_API)) {
      errors.push(`${key} template processor is not exported: ${entry.templateProcessor.library}`);
    }
    for (const symbol of entry.publicConstants ?? []) {
      if (!(symbol in PUBLIC_API)) errors.push(`${key} public constant is not exported: ${symbol}`);
      else {
        try { JSON.stringify(PUBLIC_API[symbol]); }
        catch { errors.push(`${key} public constant is not JSON-describable: ${symbol}`); }
      }
    }
    if (entry.cli) {
      const commands = cliCommands.get(entry.cli.bin) ?? {};
      if (!(entry.cli.command in commands)) {
        errors.push(`${key} CLI command is not advertised by ${entry.cli.bin} --help: ${entry.cli.command}`);
      }
    }

    const template = entry.template
      ? await loadTemplate(skillRoot, entry.template, `${key}.template`, errors)
      : null;
    if (template && entry.templateProcessor?.library === PUBLIC_TEMPLATE_PROCESSOR) {
      try { PUBLIC_API.inspectCapabilityInputTemplate(template); }
      catch (error) { errors.push(`${key}.template placeholder contract is invalid: ${error.message}`); }
    }
    await verifyFile(skillRoot, entry.minimumInvocation, `${key}.minimumInvocation`, errors);
    if (entry.example) await verifyFile(skillRoot, entry.example, `${key}.example`, errors);

    audited.push({
      key,
      nodeId: node.id,
      interfaceId: entry.id,
      operation: entry.operation,
      librarySymbol: entry.library?.symbol ?? null,
      cli: entry.cli ?? null,
      validator: entry.validator?.library ?? null,
      template: entry.template ?? null,
      templateParsed: entry.template ? template != null : null,
      templateProcessor: entry.templateProcessor?.library ?? null,
      publicConstants: [...(entry.publicConstants ?? [])],
      outputSchema: entry.outputSchema ?? null,
      constructorExercised: false,
      materializedInput: false,
      entry,
      template,
    });
  }

  let constructorContractsExercised = 0;
  if (exercise && !errors.length) constructorContractsExercised = await exerciseConstructors(audited, errors);
  const constructorContracts = audited.filter((item) => requiresConstructorExercise(item.entry)).length;

  return {
    status: errors.length ? 'FAIL' : 'PASS',
    schema: 'refas.capability-interface-alignment-report/v1',
    graphSchema: graph.schema,
    interfaceSchema: graph.interfaceSchema,
    interfaceContractSchema: graph.interfaceContractSchema ?? null,
    instructionNodes: graph.nodes.length,
    executableInterfaces: interfaces.length,
    declaredTemplates: audited.filter((item) => item.template).length,
    publicLibraryInterfaces: audited.filter((item) => item.librarySymbol).length,
    cliInterfaces: audited.filter((item) => item.cli).length,
    constructorContracts,
    constructorContractsExercised,
    audited: audited.map(({entry, template, ...item}) => item),
    errors,
  };
}

export async function verifyCapabilityInterfaces(options = {}) {
  const report = await analyzeCapabilityInterfaces(options);
  if (report.status !== 'PASS') throw new Error(report.errors.join('\n'));
  return report;
}

async function main() {
  const report = await verifyCapabilityInterfaces();
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    schema: report.schema,
    instructionNodes: report.instructionNodes,
    executableInterfaces: report.executableInterfaces,
    declaredTemplates: report.declaredTemplates,
    publicLibraryInterfaces: report.publicLibraryInterfaces,
    cliInterfaces: report.cliInterfaces,
    constructorContracts: report.constructorContracts,
    constructorContractsExercised: report.constructorContractsExercised,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Capability interface verification failed: ${error.message}\n`);
    process.exit(1);
  });
}
